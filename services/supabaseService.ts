import { createClient } from '@supabase/supabase-js';
import { Agent, Voice, CallLog, TtsGeneration, ChatMessage } from '../types';

// FIX: Update Supabase credentials to match the provided ones.
const SUPABASE_URL = 'https://cxpjtedbfdyqdtdxypez.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4cGp0ZWRiZmR5cWR0ZHh5cGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzODkxOTQsImV4cCI6MjA3Njk2NTE5NH0.cFAFBiC1l8KHiMDh6iD6ugrjoSBdkx0YinVFIgiGifM';


export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// AGENTS
export const getAgentsFromSupabase = async (): Promise<Agent[]> => {
    const { data, error } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    // Map snake_case from DB to camelCase in application
    return data.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description || '', // Fallback for missing column
        voice: agent.voice,
        systemPrompt: agent.task, // FIX: Changed from system_prompt to task
        firstSentence: 'Hello, how can I assist you?', // Provide a default as the DB column is missing
        thinkingMode: agent.thinking_mode,
        avatarUrl: null, // The 'avatar_url' column does not exist in the schema.
        tools: agent.tools || [],
    }));
};

export const upsertAgentsToSupabase = async (agents: Agent[]) => {
    const agentsForSupabase = agents.map(agent => {
        // Map camelCase properties to snake_case for Supabase.
        // REMOVED `firstSentence` as the column does not exist in the DB schema.
        const { systemPrompt, firstSentence, thinkingMode, avatarUrl, ...rest } = agent;
        return {
            ...rest, // includes id, name, description, voice, tools
            task: systemPrompt, // FIX: Changed from system_prompt to task
            thinking_mode: thinkingMode,
            // avatar_url is removed as the column does not exist.
        };
    });
    const { error } = await supabase.from('agents').upsert(agentsForSupabase, { onConflict: 'id' });
    if (error) {
        console.error("Supabase failed to upsert agents:", error);
        throw error;
    }
};


export const updateAgentInSupabase = async (agent: Agent) => {
    // Map camelCase properties to snake_case for Supabase.
    // REMOVED `firstSentence` as the column does not exist in the DB schema.
    const { id, systemPrompt, firstSentence, thinkingMode, avatarUrl, ...rest } = agent;
    const updatePayload = {
        ...rest, // includes name, description, voice, tools
        task: systemPrompt, // FIX: Changed from system_prompt to task
        thinking_mode: thinkingMode,
        // avatar_url is removed as the column does not exist.
    };
    
    const { error } = await supabase.from('agents').update(updatePayload).eq('id', agent.id);
    if (error) throw error;
};

export const deleteAgentFromSupabase = async (agentId: string) => {
    const { error } = await supabase.from('agents').delete().eq('id', agentId);
    if (error) throw error;
};

// VOICES
export const getVoicesFromSupabase = async (): Promise<Voice[]> => {
    const { data, error } = await supabase.from('voices').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    // The data from Supabase won't have a `tags` property. To conform to the `Voice` type, we add an empty array.
    return data.map(v => ({...v, tags: [] })) as Voice[];
};

export const upsertVoicesToSupabase = async (voices: Voice[]) => {
    // The 'voices' table in Supabase does not have a 'tags' column.
    // We must remove it from the payload before upserting.
    const voicesForSupabase = voices.map(({ tags, ...restOfVoice }) => restOfVoice);

    const { error } = await supabase.from('voices').upsert(voicesForSupabase, { onConflict: 'id' });
    if (error) {
        // Log the full error object for better debugging
        console.error("Supabase failed to upsert voices:", error);
        throw error;
    }
};

// CALL LOGS
export const getCallLogsFromSupabase = async (): Promise<CallLog[]> => {
    const { data, error } = await supabase.from('call_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export const upsertCallLogsToSupabase = async (logs: CallLog[]) => {
    // Sanitize logs to ensure only expected columns are sent to Supabase.
    // This prevents errors if the source API adds new fields (like 'analysis').
    const sanitizedLogs = logs.map(log => ({
        call_id: log.call_id,
        created_at: log.created_at,
        duration: log.duration,
        from: log.from,
        to: log.to,
        recording_url: log.recording_url,
        concatenated_transcript: log.concatenated_transcript,
        transcript: log.transcript,
    }));
    const { error } = await supabase.from('call_logs').upsert(sanitizedLogs);
    if (error) throw error;
}

// === AUDIO STORAGE ===
const AUDIO_BUCKET = 'eburon-audio';

// Helper to determine file extension from MIME type
const getExtensionFromMimeType = (mimeType: string) => {
    if (!mimeType) return 'wav'; // Default extension
    if (mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('ogg')) return 'ogg';
    return mimeType.split('/')[1] || 'audio';
};


export const uploadAgentAvatar = async (
  agentId: string,
  imageFile: File
): Promise<string> => {
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const fileName = `public/agent-avatars/${agentId}/avatar.${fileExtension}`;

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(fileName, imageFile, {
      cacheControl: '3600',
      upsert: true, // Replace if exists
    });

  if (error) throw new Error(`Avatar upload failed: ${error.message}`);

  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(fileName);
  return `${data.publicUrl}?t=${new Date().getTime()}`; // Add timestamp to break cache
};


export const uploadAudioSample = async (
  voiceName: string,
  audioBlob: Blob
): Promise<string> => {
  const extension = getExtensionFromMimeType(audioBlob.type);
  const fileName = `public/voice-previews/${voiceName.toLowerCase().replace(/ /g, '_')}_${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(fileName, audioBlob, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
};

// === TTS STUDIO ===
const TTS_AUDIO_BUCKET_PATH = 'tts-generations';

export const uploadTtsAudio = async (
  audioBlob: Blob
): Promise<string> => {
  const extension = getExtensionFromMimeType(audioBlob.type);
  const fileName = `public/${TTS_AUDIO_BUCKET_PATH}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(fileName, audioBlob, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`TTS audio upload failed: ${error.message}`);

  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
};

export const saveTtsGeneration = async (generation: {
    input_text: string,
    audio_url: string,
}): Promise<TtsGeneration> => {
    const { data, error } = await supabase.from('tts_generations').insert([generation]).select();
    if (error) throw error;
    return data[0];
};

export const getTtsGenerations = async (): Promise<TtsGeneration[]> => {
    const { data, error } = await supabase.from('tts_generations').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data;
}

// === CHATBOT ===
const CHAT_IMAGES_BUCKET_PATH = 'chat-images';

export const uploadChatImage = async (imageFile: File): Promise<string> => {
    const fileExtension = imageFile.name.split('.').pop() || 'png';
    const fileName = `public/${CHAT_IMAGES_BUCKET_PATH}/${Date.now()}.${fileExtension}`;
    
    const { error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(fileName, imageFile, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) throw new Error(`Chat image upload failed: ${error.message}`);
    
    const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
};

export const getChatbotMessagesFromSupabase = async (): Promise<ChatMessage[]> => {
    const { data, error } = await supabase.from('chatbot_messages').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(msg => ({
        id: msg.id,
        role: msg.role,
        text: msg.text,
        imageUrl: msg.image_url,
    }));
};

export const upsertChatbotMessageToSupabase = async (message: ChatMessage) => {
    const { error } = await supabase.from('chatbot_messages').upsert({
        id: message.id,
        role: message.role,
        text: message.text,
        image_url: message.imageUrl,
    });
    if (error) throw error;
};

export const clearChatbotMessagesFromSupabase = async (): Promise<void> => {
    // Using `neq` with a value that doesn't exist (`system`) effectively targets all rows.
    // This is more efficient and robust than deleting by 'user' and 'model' roles separately.
    const { error } = await supabase.from('chatbot_messages').delete().neq('role', 'system');
    if (error) throw error;
};