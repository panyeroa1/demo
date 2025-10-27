

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MicIcon, StopIcon, RefreshIcon, CheckCircleIcon } from './icons';
import * as dataService from '../services/dataService';

type RecordingStatus = 'idle' | 'permission' | 'recording' | 'recorded' | 'cloning' | 'success' | 'error';


const CloneVoiceView: React.FC = () => {
    const [voiceName, setVoiceName] = useState('');
    const [status, setStatus] = useState<RecordingStatus>('idle');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);


    const cleanup = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
    }, []);

    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    const handleStartRecording = async () => {
        setStatus('permission');
        setErrorMessage('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                setAudioBlob(audioBlob);
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                setStatus('recorded');
                cleanup();
            };

            mediaRecorderRef.current.start();
            setStatus('recording');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setErrorMessage('Microphone access denied. Please allow microphone access in your browser settings.');
            setStatus('error');
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const handleReset = () => {
        setAudioUrl(null);
        setAudioBlob(null);
        setStatus('idle');
        setErrorMessage('');
        setVoiceName('');
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
    };
    
    const handleClone = async () => {
        if (!audioBlob) {
            setErrorMessage("No audio has been recorded.");
            setStatus('error');
            return;
        }
        if (!voiceName.trim()) {
            setErrorMessage("Please provide a name for your voice.");
            setStatus('error');
            return;
        }

        setStatus('cloning');
        setErrorMessage('');

        try {
            const result = await dataService.cloneVoice(voiceName, audioBlob);
            if (result.success) {
                setStatus('success');
            } else {
                throw new Error(result.message || 'Cloning failed for an unknown reason.');
            }
        } catch (err: any) {
            setErrorMessage(err.message);
            setStatus('error');
        }
    };

    const canClone = voiceName.trim() !== '' && status === 'recorded' && !!audioBlob;

    const renderStatusUI = () => {
        switch (status) {
            case 'idle':
            case 'permission':
            case 'error':
                return (
                    <button
                        onClick={handleStartRecording}
                        disabled={status === 'permission'}
                        className="w-24 h-24 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-200 text-white disabled:bg-gray-500"
                        aria-label="Start recording"
                    >
                        {status === 'permission' ? 
                            <div className="w-8 h-8 border-4 border-white/50 border-t-white rounded-full animate-spin"></div> :
                            <MicIcon className="w-10 h-10" />
                        }
                    </button>
                );
            case 'recording':
                return (
                    <button
                        onClick={handleStopRecording}
                        className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center transition-all animate-pulse"
                        aria-label="Stop recording"
                    >
                        <StopIcon className="w-10 h-10 text-white" />
                    </button>
                );
            case 'recorded':
                return (
                    <div className="flex items-center gap-4 w-full">
                        <audio ref={audioRef} src={audioUrl!} controls className="w-full" />
                        <button onClick={handleReset} title="Record again" className="p-3 text-eburon-fg/70 hover:text-eburon-fg bg-eburon-panel rounded-lg">
                            <RefreshIcon className="w-6 h-6" />
                        </button>
                    </div>
                );
            default:
                return null;
        }
    };

    const getStatusMessage = () => {
        switch (status) {
            case 'idle': return 'Tap the microphone to start recording.';
            case 'permission': return 'Requesting microphone access...';
            case 'recording': return 'Recording... Tap to stop.';
            case 'recorded': return 'Review your recording below.';
            case 'cloning': return 'Cloning in progress... This may take a moment.';
            case 'success': return 'Voice cloned successfully! You can now use it to create agents.';
            case 'error': return errorMessage;
            default: return '';
        }
    }


    if (status === 'success') {
        return (
            <div className="p-8 h-full flex flex-col items-center justify-center text-center">
                 <CheckCircleIcon className="w-24 h-24 text-eburon-ok mb-4" />
                 <h1 className="text-3xl font-bold text-eburon-fg mb-2">Cloning Complete!</h1>
                 <p className="text-eburon-fg/70 mb-6">Your voice <span className="font-semibold text-eburon-accent">{voiceName}</span> is now available in your voice library.</p>
                 <button onClick={handleReset} className="bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150">
                    Clone Another Voice
                </button>
            </div>
        )
    }

    return (
        <div className="p-8 h-full overflow-y-auto flex flex-col items-center">
            <div className="w-full max-w-2xl">
                <h1 className="text-3xl font-bold text-eburon-fg mb-2">Clone a Voice</h1>
                <p className="text-eburon-fg/70 mb-8">
                    Record a short audio sample to create a digital clone of your voice. For best results, find a quiet space and speak clearly.
                </p>

                <div className="space-y-8">
                    {/* Step 1: Name your voice */}
                    <div className="bg-eburon-panel p-6 rounded-xl border border-eburon-border">
                        <label htmlFor="voiceName" className="block text-xl font-semibold text-eburon-fg mb-3">
                           1. Name Your Voice
                        </label>
                        <input
                            id="voiceName"
                            type="text"
                            value={voiceName}
                            onChange={(e) => setVoiceName(e.target.value)}
                            placeholder="e.g., My Custom Voice"
                            className="w-full bg-eburon-bg border border-eburon-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-eburon-accent"
                            disabled={status !== 'idle' && status !== 'recorded' && status !== 'error'}
                        />
                    </div>
                    
                    {/* Step 2: Record Audio */}
                    <div className="bg-eburon-panel p-6 rounded-xl border border-eburon-border">
                        <h2 className="text-xl font-semibold text-eburon-fg mb-3">2. Record Audio Sample</h2>
                        <div className="bg-eburon-bg p-4 rounded-lg italic text-eburon-fg/80 mb-6">
                            <p>"I am not a wolf in sheep's clothing, I'm a wolf in wolf's clothing."</p>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center space-y-4 h-32">
                             {renderStatusUI()}
                             <p className={`text-sm h-4 ${status === 'error' ? 'text-red-400' : 'text-eburon-fg/60'}`}>
                                {getStatusMessage()}
                             </p>
                        </div>
                    </div>

                    {/* Step 3: Start Cloning */}
                    <div>
                         <button 
                            onClick={handleClone}
                            disabled={!canClone}
                            className="w-full bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                           {status === 'cloning' ? (
                               <>
                                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin mr-3"></div>
                                <span>Processing...</span>
                               </>
                           ) : (
                                "Start Cloning Process"
                           )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CloneVoiceView;