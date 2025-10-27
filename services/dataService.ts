import * as idbService from './idbService';
import * as supabaseService from './supabaseService';
import * as blandAiService from './blandAiService';
import { Agent, Voice, CallLog, TtsGeneration, ChatMessage } from '../types';
import { PREMADE_AGENTS } from '../data/premade-agents';

type DbMode = 'supabase' | 'indexedDB';
let dbMode: DbMode = 'supabase'; // Assume online by default

async function seedInitialData() {
    try {
        if ((window as any)._seeding) return;
        (window as any)._seeding = true;

        const agents = await getAgents();
        const voices = await getVoices();
        
        if (voices.length === 0) {
            console.warn("No voices available to assign to premade agents.");
            (window as any)._seeding = false;
            return;
        }

        const premadeAgentIds = PREMADE_AGENTS.map(a => a.id);
        const existingPremadeAgentIds = new Set(agents.filter(a => premadeAgentIds.includes(a.id)).map(a => a.id));

        const missingAgents = PREMADE_AGENTS.filter(pa => !existingPremadeAgentIds.has(pa.id));

        if (missingAgents.length > 0) {
            console.log(`Seeding ${missingAgents.length} premade agents...`);
            const agentsToCreate: Agent[] = missingAgents
                .map((premadeAgent, index) => ({
                    ...premadeAgent,
                    voice: voices[index % voices.length].id, // Cycle through available voices
                }));
            
            await upsertAgents(agentsToCreate);
        }
    } catch (error) {
        console.error("Failed to seed initial data:", error);
    } finally {
        (window as any)._seeding = false;
    }
}


export async function initializeDataLayer(): Promise<void> {
  try {
    const { error } = await supabaseService.supabase
      .from('agents')
      .select('id', { count: 'exact', head: true });

    if (error && (error.message.includes('network error') || error.message.includes('Failed to fetch'))) {
      throw new Error('Supabase network error');
    }
    
    console.log('Supabase connection successful. Using online mode.');
    dbMode = 'supabase';
  } catch (e) {
    console.warn('Supabase connection failed. Falling back to IndexedDB for this session.', (e as Error).message);
    dbMode = 'indexedDB';
  }
  
  await idbService.initDB();
  await seedInitialData();
}

// --- AGENTS ---
export async function getAgents(): Promise<Agent[]> {
    if (dbMode === 'supabase') {
        try {
            return await supabaseService.getAgentsFromSupabase();
        } catch (error) {
            console.error("Supabase failed to get agents, falling back to IDB", (error as Error).message);
            dbMode = 'indexedDB';
            return idbService.getAgentsFromIdb();
        }
    }
    return idbService.getAgentsFromIdb();
}

export async function upsertAgents(agents: Agent[]): Promise<void> {
    await idbService.upsertAgentsToIdb(agents); // Always update local first for speed
    if (dbMode === 'supabase') {
        try {
            await supabaseService.upsertAgentsToSupabase(agents);
        } catch (error) {
            console.error("Supabase failed to upsert agents", (error as Error).message);
        }
    }
}

export async function updateAgent(agent: Agent): Promise<void> {
     await idbService.upsertAgentsToIdb([agent]);
     if (dbMode === 'supabase') {
        try {
            await supabaseService.updateAgentInSupabase(agent);
        } catch (error) {
             console.error("Supabase failed to update agent", (error as Error).message);
        }
     }
}

export async function deleteAgent(agentId: string): Promise<void> {
    await idbService.deleteAgentFromIdb(agentId);
    if (dbMode === 'supabase') {
        try {
            await supabaseService.deleteAgentFromSupabase(agentId);
        } catch (error) {
            console.error("Supabase failed to delete agent", (error as Error).message);
        }
    }
}


// --- VOICES ---
export async function getVoices(): Promise<Voice[]> {
    try {
        const freshVoices = await blandAiService.listVoices();
        upsertVoices(freshVoices).catch(err => console.error("Failed to cache voices:", err));
        return freshVoices;
    } catch (error) {
        console.error("Failed to fetch fresh voices, falling back to IDB", (error as Error).message);
        return idbService.getVoicesFromIdb();
    }
}

export async function upsertVoices(voices: Voice[]): Promise<void> {
    await idbService.upsertVoicesToIdb(voices);
    if (dbMode === 'supabase') {
        try {
            await supabaseService.upsertVoicesToSupabase(voices);
        } catch (error) {
            console.error("Supabase failed to upsert voices", (error as Error).message);
        }
    }
}

export const generateVoiceSample = blandAiService.generateVoiceSample;
export const uploadVoiceSample = supabaseService.uploadAudioSample;

// --- CALL LOGS ---
export async function getCallLogs(): Promise<CallLog[]> {
    if (dbMode === 'supabase') {
        try {
            return await supabaseService.getCallLogsFromSupabase();
        } catch (error) {
            console.error("Supabase failed to get call logs, falling back to IDB", (error as Error).message);
            dbMode = 'indexedDB';
            return idbService.getCallLogsFromIdb();
        }
    }
    return idbService.getCallLogsFromIdb();
}

export async function upsertCallLogs(logs: CallLog[]): Promise<void> {
    await idbService.upsertCallLogsToIdb(logs);
    if (dbMode === 'supabase') {
        try {
            await supabaseService.upsertCallLogsToSupabase(logs);
        } catch (error) {
            console.error("Supabase failed to upsert call logs", (error as Error).message);
        }
    }
}

// --- TTS GENERATIONS ---
export async function getTtsGenerations(): Promise<TtsGeneration[]> {
    if (dbMode === 'supabase') {
        try {
            const generations = await supabaseService.getTtsGenerations();
            await idbService.upsertTtsGenerationsToIdb(generations); // Refresh cache
            return generations;
        } catch (error) {
            console.error("Supabase failed to get TTS generations, falling back to IDB", (error as Error).message);
            dbMode = 'indexedDB';
            return idbService.getTtsGenerationsFromIdb();
        }
    }
    return idbService.getTtsGenerationsFromIdb();
}

export async function saveTtsGeneration(generationData: {
    input_text: string;
    audio_url: string;
}): Promise<TtsGeneration> {
    if (dbMode === 'supabase') {
        try {
            const newGeneration = await supabaseService.saveTtsGeneration(generationData);
            await idbService.upsertTtsGenerationsToIdb([newGeneration]);
            return newGeneration;
        } catch (error) {
            console.error("Supabase failed to save TTS generation, saving to IDB only", (error as Error).message);
        }
    }
    
    const localGeneration: TtsGeneration = {
        ...generationData,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
    };
    await idbService.upsertTtsGenerationsToIdb([localGeneration]);
    return localGeneration;
}

// --- CHATBOT MESSAGES ---
export async function getChatbotMessages(): Promise<ChatMessage[]> {
    if (dbMode === 'supabase') {
        try {
            const messages = await supabaseService.getChatbotMessagesFromSupabase();
            await idbService.upsertChatbotMessagesToIdb(messages); // Refresh cache
            return messages;
        } catch (error) {
            console.error("Supabase failed to get chat messages, falling back to IDB", (error as Error).message);
            dbMode = 'indexedDB';
            return idbService.getChatbotMessagesFromIdb();
        }
    }
    return idbService.getChatbotMessagesFromIdb();
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
    await idbService.upsertChatbotMessagesToIdb([message]);
    if (dbMode === 'supabase') {
        try {
            await supabaseService.upsertChatbotMessageToSupabase(message);
        } catch (error) {
            console.error("Supabase failed to save chat message", (error as Error).message);
        }
    }
}

export async function clearChatbotMessages(): Promise<void> {
    await idbService.clearChatbotMessagesFromIdb();
    if (dbMode === 'supabase') {
        try {
            await supabaseService.clearChatbotMessagesFromSupabase();
        } catch (error) {
            console.error("Supabase failed to clear chat messages", (error as Error).message);
            throw error;
        }
    }
}