// This file was created to resolve missing module errors.
import { CallLog, Voice } from "../types";
import { AYLA_MULTILINGUAL_PROMPT, AUDIO_ASSETS } from "../constants";

const BLAND_API_KEY = 'org_4f08019a0df2dd84214b869c95a7db847d78684028210c95f7458a96be0f963937bb39a73fe7aab4799b69';
const BLAND_ENCRYPTED_KEY = '84eb3e45-f80a-44fd-936c-81ce96565c70';
const API_BASE_URL = 'https://api.bland.ai'; // Use direct API endpoint to fix 404 errors.
const EBURON_ERROR_MESSAGE = "The Phone API service encountered an error. Please try again.";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const defaultHeaders: HeadersInit = {
        'authorization': BLAND_API_KEY,
        'encrypted_key': BLAND_ENCRYPTED_KEY,
    };

    // Only add Content-Type if there's a body, which implies it's JSON for this app.
    if (options.body) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    });

    if (!response.ok) {
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        let errorCode = null;
        try {
            const errorBody = await response.json();
            if (errorBody.errors && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
                errorMessage = errorBody.errors[0].message || errorMessage;
                errorCode = errorBody.errors[0].error || null;
            } else if (errorBody.message) {
                errorMessage = errorBody.message;
            } else {
                 errorMessage = JSON.stringify(errorBody);
            }
        } catch (e) {
            // Ignore if body isn't JSON
        }
        const customError: any = new Error(errorMessage);
        customError.code = errorCode; // Attach the code for easier checking
        throw customError;
    }
    return response;
};

export const fetchCallLogs = async (): Promise<CallLog[]> => {
    try {
        const response = await apiFetch('/v1/calls');
        const data = await response.json();
        return data.calls.map((call: any) => ({
            call_id: call.call_id,
            created_at: call.created_at,
            duration: Math.round(call.call_length * 60), // API gives minutes, we use seconds and round it.
            from: call.from,
            to: call.to,
            recording_url: call.recording_url || '', // FIX: Use the recording_url directly from the API response.
            concatenated_transcript: call.concatenated_transcript || 'Transcript not available in summary.',
            transcript: call.transcript || [],
        }));
    } catch (error) {
        console.error("Bland AI Service Error (fetchCallLogs):", error);
        throw new Error(EBURON_ERROR_MESSAGE);
    }
};

export const fetchRecording = async (callId: string): Promise<Blob> => {
    const MAX_RETRIES = 7;
    const INITIAL_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await apiFetch(`/v1/recordings/${callId}`);
            const blob = await response.blob();
            // A successful response might still have a zero-byte file if processing
            if (blob.size > 0) {
                return blob;
            }
            // Treat empty blob as a retryable error
            const emptyFileError: any = new Error('Empty recording file received.');
            emptyFileError.code = 'CALL_RECORDING_NOT_FOUND';
            throw emptyFileError;

        } catch (error: any) {
            const isNotFound = error.code === 'CALL_RECORDING_NOT_FOUND';

            if (!isNotFound || attempt === MAX_RETRIES) {
                console.error(`Final error fetching recording for call ${callId} on attempt ${attempt}:`, error);
                const finalError: any = new Error(`The recording is still being processed. Please try again in a moment.`);
                finalError.code = 'RECORDING_PROCESSING';
                throw finalError;
            }

            const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`Recording not found for call ${callId}. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
            await sleep(delay);
        }
    }
    // This line is for TypeScript's benefit; it should be unreachable
    const finalError: any = new Error(`Failed to fetch recording for call ${callId} after all retries.`);
    finalError.code = 'RECORDING_PROCESSING';
    throw finalError;
};


export const listenToActiveCall = async (callId: string): Promise<{ success: boolean; url?: string; message?: string }> => {
    try {
        // Use a direct WebSocket URL. NOTE: The API key is exposed client-side.
        // This is necessary as the configured proxy seems to be unavailable.
        const wsUrl = `wss://api.bland.ai/v1/listen/${callId}?api_key=${BLAND_API_KEY}`;
        return { success: true, url: wsUrl };
    } catch (error) {
        console.error("Bland AI Service Error (listenToActiveCall):", error);
        return { success: false, message: (error as Error).message };
    }
};

export const listVoices = async (): Promise<Voice[]> => {
    try {
        const response = await apiFetch('/v1/voices');
        const data = await response.json();
        const voicesData = data.voices || [];
        return voicesData.map((v: any) => ({
            id: v.id, // Use the correct ID field from the API response
            name: v.name || `Voice ${v.id}`,
            provider: 'Eburon TTS',
            type: v.public ? 'Prebuilt' : 'Cloned', // Assuming public voices are pre-built
            tags: v.tags || [],
        }));
    } catch (error) {
        console.error("Bland AI Service Error (listVoices):", error);
        throw new Error(EBURON_ERROR_MESSAGE);
    }
};


export const generateVoiceSample = async (voiceId: string, text: string, language: string): Promise<Blob> => {
     try {
        const payload = {
            text: text,
            voice_id: voiceId,
            model: "base",
            temperature: 0.7,
        };
        const response = await apiFetch(`/v1/tts`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        
        // The API returns the raw audio file directly, not JSON.
        const audioBlob = await response.blob();

        // Check if the blob is empty, which can happen for some errors.
        if (audioBlob.size === 0) {
             throw new Error("API returned an empty audio file. This may indicate an issue with the voice or input text.");
        }
        
        return audioBlob;
    } catch (error) {
        console.error("Bland AI Service Error (generateVoiceSample):", error);
        const errorBody = (error as any).message;
        throw new Error(`TTS Generation failed: ${errorBody}`);
    }
};

export const placeCall = async (phoneNumber: string, agent: { voice: string, systemPrompt: string, firstSentence: string }): Promise<{ success: boolean; call_id?: string; message?: string }> => {
    try {
        const payload: any = {
            phone_number: phoneNumber,
            task: agent.systemPrompt,
            voice: agent.voice,
            first_sentence: agent.firstSentence,
            record: true,
            wait_for_greeting: true,
        };
        
        const response = await apiFetch('/v1/calls', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return { success: true, call_id: data.call_id };
    } catch (error) {
        console.error("Bland AI Service Error (placeCall):", error);
        return { success: false, message: (error as Error).message || EBURON_ERROR_MESSAGE };
    }
};

// FIX: The `startAylaCall` function was corrupted due to a copy-paste error.
// It has been reconstructed to correctly make an API call and handle responses,
// resolving the syntax error and the "must return a value" type error.
export const startAylaCall = async (phoneNumber: string): Promise<{ success: boolean; call_id?: string; message?: string }> => {
    try {
        const payload = {
            phone_number: phoneNumber,
            task: AYLA_MULTILINGUAL_PROMPT,
            voice: "Brh Callcenter",
            first_sentence: "Thank you for flying with Turkish Airlines. My name is Ayla. How may I assist you today?",
            wait_for_greeting: true,
            record: true,
            answered_by_enabled: true,
            noise_cancellation: true,
            interruption_threshold: 500,
            block_interruptions: false,
            max_duration: 12,
            model: "base",
            memory_id: "1bae20f6-b7fc-4ddb-8ddb-ef42519bc3f6",
        };
        
        const response = await apiFetch('/v1/calls', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return { success: true, call_id: data.call_id };
    } catch (error) {
        console.error("Bland AI Service Error (startAylaCall):", error);
        return { success: false, message: (error as Error).message || EBURON_ERROR_MESSAGE };
    }
};

export const cloneVoice = async (name: string, audioBlob: Blob): Promise<{ success: boolean; voice_id?: string; message?: string }> => {
    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('audio_samples', audioBlob, 'recording.wav');

        const response = await fetch(`${API_BASE_URL}/v1/voices/clone`, {
            method: 'POST',
            headers: {
                'authorization': BLAND_API_KEY,
                'encrypted_key': BLAND_ENCRYPTED_KEY,
            },
            body: formData,
        });
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `API Error: ${response.status} ${response.statusText}`);
        }

        return { success: true, voice_id: data.voice_id };
    } catch (error) {
        console.error("Bland AI Service Error (cloneVoice):", error);
        return { success: false, message: (error as Error).message || EBURON_ERROR_MESSAGE };
    }
};