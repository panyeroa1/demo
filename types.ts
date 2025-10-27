export enum ActiveView {
  CallLogs = 'CallLogs',
  Agents = 'Agents',
  Voices = 'Voices',
  TTSStudio = 'TTSStudio',
  Chatbot = 'Chatbot',
  Templates = 'Templates',
  ActiveCall = 'ActiveCall',
}

export interface Template {
  id: string;
  name: string;
  description: string;
  useCases: string[];
  systemPrompt: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
    placeAnswerSources?: {
      reviewSnippets: any[];
    };
  };
}

export interface TelemetryData {
  tokensUsed?: number;
  energy?: string;
  wps?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // for local preview
  imageUrl?: string; // for remote storage
  groundingChunks?: GroundingChunk[];
  telemetry?: TelemetryData;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  voice: string;
  systemPrompt: string;
  firstSentence: string;
  thinkingMode: boolean;
  avatarUrl: string | null;
  tools?: any[]; // Keep it flexible
}

export interface Voice {
  id: string;
  name: string;
  provider: string;
  type: 'Prebuilt' | 'Cloned';
  tags: string[];
}

export interface TranscriptSegment {
  user: 'agent' | 'user';
  text: string;
  start_time: number;
}

export interface CallLog {
  call_id: string;
  created_at: string;
  duration: number;
  from: string;
  to: string;
  recording_url: string;
  concatenated_transcript: string;
  transcript: TranscriptSegment[];
}

export interface TtsGeneration {
  id: string;
  created_at: string;
  input_text: string;
  audio_url: string;
}