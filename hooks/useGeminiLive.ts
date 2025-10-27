import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';
import { Agent } from '../types';
import { AUDIO_ASSETS } from '../constants';

// --- Audio Helper Functions (from Gemini Docs) ---
function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function createBlob(data: Float32Array): GenaiBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// FIX: Updated `decodeAudioData` to match the Gemini API guidelines for robustness.
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
// --- End Audio Helper Functions ---

export interface Transcript {
    id: number;
    role: 'user' | 'model';
    text: string;
    isFinal: boolean;
}

export const useGeminiLiveAgent = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [isHolding, setIsHolding] = useState(false);

    const aiRef = useRef<GoogleGenAI | null>(null);
    const sessionPromiseRef = useRef<any | null>(null);
    
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    const playbackQueueRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const holdAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize hold audio element
        const audio = new Audio(AUDIO_ASSETS.hold);
        audio.loop = true;
        audio.volume = 0.3; // As per instructions
        holdAudioRef.current = audio;

        // Autoplay priming
        const prime = () => {
            if (holdAudioRef.current && holdAudioRef.current.paused) {
                holdAudioRef.current.muted = true;
                holdAudioRef.current.play().catch(() => {});
                holdAudioRef.current.pause();
                holdAudioRef.current.currentTime = 0;
                holdAudioRef.current.muted = false;
            }
            window.removeEventListener('click', prime);
            window.removeEventListener('touchstart', prime);
        };
        window.addEventListener('click', prime, { once: true, capture: true });
        window.addEventListener('touchstart', prime, { once: true, capture: true });

        return () => {
            holdAudioRef.current?.pause();
            holdAudioRef.current = null;
        }
    }, []);

    const fade = (audio: HTMLAudioElement, to: number, ms: number) => {
        const from = audio.volume;
        const steps = 20;
        const step = (to - from) / steps;
        const dt = ms / steps;
        let i = 0;
        // Clear any existing fade interval
        if ((audio as any)._fade) clearInterval((audio as any)._fade);
        
        (audio as any)._fade = setInterval(() => {
            i++;
            audio.volume = Math.max(0, Math.min(1, from + i * step));
            if (i >= steps) {
                clearInterval((audio as any)._fade);
                if (to === 0) {
                    audio.pause();
                    audio.currentTime = 0;
                }
            }
        }, dt);
    };

    const holdWhileLookingUp = useCallback(async (minMs = 8000, maxMs = 15000) => {
        const audio = holdAudioRef.current;
        if (!audio || isHolding) return;

        setIsHolding(true);
        audio.volume = 0;
        await audio.play().catch(e => console.error("Hold audio play failed:", e));
        fade(audio, 0.3, 400);

        const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
        await new Promise(resolve => setTimeout(resolve, ms));

        fade(audio, 0, 250);
        setIsHolding(false);
    }, [isHolding]);

    const cleanup = useCallback(() => {
        setIsSessionActive(false);
        setIsConnecting(false);
        setIsHolding(false);

        sessionPromiseRef.current?.then((session: any) => session.close());
        sessionPromiseRef.current = null;

        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        
        holdAudioRef.current?.pause();
        if (holdAudioRef.current) holdAudioRef.current.currentTime = 0;


        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }

        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        
        playbackQueueRef.current.forEach(source => source.stop());
        playbackQueueRef.current.clear();
        nextStartTimeRef.current = 0;
    }, []);

    const startSession = useCallback(async (agent: Agent) => {
        if (isSessionActive || isConnecting) return;

        setIsConnecting(true);
        setError(null);
        setTranscripts([]);

        try {
            if (!aiRef.current) {
                if (!process.env.API_KEY) {
                    throw new Error("API_KEY environment variable not set");
                }
                aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            let currentInputTranscription = '';
            let currentOutputTranscription = '';

            sessionPromiseRef.current = aiRef.current.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: agent.systemPrompt,
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setIsConnecting(false);
                        setIsSessionActive(true);
                        
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        sourceNodeRef.current = source;
                        const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromiseRef.current?.then((session: any) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const transcription = message.serverContent.inputTranscription;
                            const text = transcription.text;
                            // Safely access `isFinal` as it might not exist on the type.
                            const isFinal = 'isFinal' in transcription ? !!(transcription as any).isFinal : false;
                            currentInputTranscription += text;
                            setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if (last?.role === 'user' && !last.isFinal) {
                                    // Perform immutable update
                                    const updatedLast = { ...last, text: currentInputTranscription, isFinal };
                                    return [...prev.slice(0, -1), updatedLast];
                                }
                                return [...prev, { id: Date.now(), role: 'user', text: currentInputTranscription, isFinal }];
                            });
                        }
                        if (message.serverContent?.outputTranscription) {
                            const transcription = message.serverContent.outputTranscription;
                            const text = transcription.text;

                             // Trigger hold music based on agent's speech
                            if (text.match(/one moment|let me check|looking that up/i)) {
                                holdWhileLookingUp();
                            }

                            // Safely access `isFinal` as it might not exist on the type.
                            const isFinal = 'isFinal' in transcription ? !!(transcription as any).isFinal : false;
                            currentOutputTranscription += text;
                            setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if (last?.role === 'model' && !last.isFinal) {
                                     // Perform immutable update
                                    const updatedLast = { ...last, text: currentOutputTranscription, isFinal };
                                    return [...prev.slice(0, -1), updatedLast];
                                }
                                return [...prev, { id: Date.now(), role: 'model', text: currentOutputTranscription, isFinal }];
                            });
                        }
                         if (message.serverContent?.turnComplete) {
                            currentInputTranscription = '';
                            currentOutputTranscription = '';
                        }
                        
                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && outputAudioContextRef.current && !isHolding) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            // FIX: Updated `decodeAudioData` call to pass sample rate and channel count explicitly.
                            const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(ctx.destination);
                            source.addEventListener('ended', () => {
                                playbackQueueRef.current.delete(source);
                            });
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            playbackQueueRef.current.add(source);
                        }
                    },
                    onclose: () => {
                        cleanup();
                    },
                    onerror: (e: ErrorEvent) => {
                        setError(`Session error: ${e.message}`);
                        console.error(e);
                        cleanup();
                    }
                }
            });
            await sessionPromiseRef.current;
        } catch (e: any) {
            setError(`Failed to start session: ${e.message}`);
            console.error(e);
            cleanup();
            setIsConnecting(false);
            throw e;
        }
    }, [isSessionActive, isConnecting, cleanup, holdWhileLookingUp, isHolding]);

    const endSession = useCallback(() => {
        cleanup();
        setTranscripts([]);
    }, [cleanup]);

    return { isConnecting, isSessionActive, transcripts, error, startSession, endSession, isHolding };
};