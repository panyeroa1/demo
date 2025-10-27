import React, { useState, useEffect, useCallback } from 'react';
import * as dataService from '../services/dataService';
import { uploadTtsAudio } from '../services/supabaseService';
import { TtsGeneration, Voice } from '../types';
import { DownloadIcon, SoundWaveIcon, HistoryIcon } from './icons';
import { LoadingIndicator } from './LoadingIndicator';
import { VOICE_PREVIEW_CONFIG } from '../constants';

type GenerationStatus = 'idle' | 'generating' | 'uploading' | 'success' | 'error';
type ActiveTab = 'generator' | 'history';

interface TtsTelemetry {
    tokensUsed: number;
    wps: number;
    cps: number;
    energy: string;
}

const TabButton: React.FC<{
    label: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    isActive: boolean;
    onClick: () => void;
}> = ({ label, icon: Icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors border-b-2 ${
            isActive
                ? 'text-eburon-accent border-eburon-accent'
                : 'text-eburon-fg/70 hover:text-eburon-fg border-transparent hover:border-eburon-border'
        }`}
    >
        <Icon className="w-5 h-5" />
        <span>{label}</span>
    </button>
);

const TTSStudioView: React.FC = () => {
    const [inputText, setInputText] = useState(
`<speak>
    <!-- Try changing prosody for different tones! rate can be "slow", "medium", "fast". pitch can be "+10%", "-5st", etc. -->
    <p>
        <prosody rate="fast" pitch="high">Welcome to the Eburon TTS Studio!</prosody> 
        You can also use a <prosody rate="slow" pitch="low">slower, more serious tone.</prosody>
    </p>

    <!-- Use break tags to add pauses. -->
    <p>
        Here is a dramatic pause... <break time="500ms"/> powerful, right?
    </p>
    
    <!-- You can even try simple laughs. -->
    <p>
        Haha! <break time="200ms"/> Have fun experimenting!
    </p>
</speak>`
    );
    const [status, setStatus] = useState<GenerationStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [generatedAudio, setGeneratedAudio] = useState<{ url: string, blob: Blob } | null>(null);
    const [history, setHistory] = useState<TtsGeneration[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    
    const [voices, setVoices] = useState<Voice[]>([]);
    const [isLoadingVoices, setIsLoadingVoices] = useState(true);
    const [selectedVoice, setSelectedVoice] = useState<string>('');

    const [activeTab, setActiveTab] = useState<ActiveTab>('generator');
    const [telemetry, setTelemetry] = useState<TtsTelemetry | null>(null);


    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoadingHistory(true);
            setIsLoadingVoices(true);
            try {
                const [generations, fetchedVoices] = await Promise.all([
                    dataService.getTtsGenerations(),
                    dataService.getVoices()
                ]);
                setHistory(generations);
                setVoices(fetchedVoices);
                if (fetchedVoices.length > 0) {
                    setSelectedVoice(fetchedVoices[0].id);
                }
            } catch (err: any) {
                console.error("Failed to fetch initial data:", err);
                setError("Could not load initial data.");
            } finally {
                setIsLoadingHistory(false);
                setIsLoadingVoices(false);
            }
        };
        loadInitialData();
    }, []);
    
    const getLanguageFromTags = (tags: string[] = []): string => {
        const supportedLangs = Object.keys(VOICE_PREVIEW_CONFIG);
        for (const tag of tags) {
            const lang = tag.toLowerCase();
            if (supportedLangs.includes(lang)) {
                return lang;
            }
        }
        return 'default';
    };

    const handleGenerate = async () => {
        if (!inputText.trim() || !selectedVoice) {
            setError("Please enter text and select a voice.");
            return;
        }
        
        setStatus('generating');
        setError(null);
        setGeneratedAudio(null);
        setTelemetry(null);
        
        const startTime = performance.now();
        
        try {
            const voice = voices.find(v => v.id === selectedVoice);
            if (!voice) throw new Error("Selected voice not found.");

            const langKey = getLanguageFromTags(voice.tags);
            const config = VOICE_PREVIEW_CONFIG[langKey] || VOICE_PREVIEW_CONFIG.default;

            const audioBlob = await dataService.generateVoiceSample(selectedVoice, inputText, config.langCode);

            const endTime = performance.now();

            setStatus('uploading');
            const publicUrl = await uploadTtsAudio(audioBlob);

            const newGeneration = await dataService.saveTtsGeneration({
                input_text: inputText,
                audio_url: publicUrl,
            });

            const durationSeconds = (endTime - startTime) / 1000;
            const characters = inputText.length;
            const words = inputText.trim().split(/\s+/).filter(Boolean).length;
            
            const wps = durationSeconds > 0 ? Math.round(words / durationSeconds) : 0;
            const cps = durationSeconds > 0 ? Math.round(characters / durationSeconds) : 0;
            const energy = ((characters / 1000) * 0.005).toFixed(4);
            const tokensUsed = Math.round(characters / 3.8);

            setTelemetry({
                tokensUsed,
                wps,
                cps,
                energy: `${energy} kWh`
            });

            setGeneratedAudio({ url: publicUrl, blob: audioBlob });
            setHistory(prev => [newGeneration, ...prev]);
            setStatus('success');

        } catch (err: any) {
            console.error("TTS Generation failed:", err);
            setError(`Generation failed: ${err.message}`);
            setStatus('error');
        }
    };

    const getStatusMessage = () => {
        switch (status) {
            case 'generating': return 'Generating...';
            case 'uploading': return 'Saving...';
            default: return 'Generate Audio';
        }
    };

    const renderGenerator = () => (
        <div className="flex flex-col gap-6 h-full">
            <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter text here..."
                className="w-full flex-grow bg-eburon-panel border border-eburon-border rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-eburon-accent text-lg font-mono"
                disabled={status !== 'idle' && status !== 'success' && status !== 'error'}
            />

            <div className="flex items-center gap-4">
                <button 
                    onClick={handleGenerate} 
                    disabled={status !== 'idle' && status !== 'success' && status !== 'error' || isLoadingVoices}
                    className="bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    {(status === 'generating' || status === 'uploading') && (
                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin mr-3"></div>
                    )}
                    {getStatusMessage()}
                </button>
                    <div className="relative">
                    <select
                        id="voice-select"
                        aria-label="Voice"
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="bg-eburon-panel border border-eburon-border rounded-lg py-3 pl-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-eburon-accent disabled:opacity-50"
                        disabled={status !== 'idle' && status !== 'success' && status !== 'error' || isLoadingVoices}
                    >
                        {isLoadingVoices ? <option>Loading voices...</option> : voices.map(voice => (
                            <option key={voice.id} value={voice.id}>{voice.name}</option>
                        ))}
                    </select>
                </div>
                {error && <p className="text-red-400 text-sm self-end">{error}</p>}
            </div>

            {generatedAudio && (
                <div className="bg-eburon-panel p-4 rounded-xl border border-eburon-border">
                    <h3 className="font-semibold mb-2">Generated Audio</h3>
                    <div className="flex items-center gap-4">
                        <audio src={generatedAudio.url} controls className="w-full" />
                        <a 
                            href={generatedAudio.url} 
                            download={`eburon_tts_${Date.now()}.wav`}
                            className="p-3 bg-eburon-bg hover:bg-eburon-accent/20 text-eburon-accent rounded-lg"
                            title="Download WAV"
                        >
                            <DownloadIcon className="w-6 h-6" />
                        </a>
                    </div>
                    {telemetry && (
                        <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-eburon-fg/50 font-mono">
                            <span>Tokens: {telemetry.tokensUsed}</span>
                            <span>Energy: {telemetry.energy}</span>
                            <span>WPS: {telemetry.wps}</span>
                            <span>CPS: {telemetry.cps}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const renderHistory = () => (
        <>
            {isLoadingHistory ? (
                <LoadingIndicator text="Loading History" size="small" />
            ) : history.length === 0 ? (
                <div className="p-8 text-center text-eburon-fg/60">
                    <HistoryIcon className="w-12 h-12 mx-auto mb-4" />
                    <p>Your generated audio will appear here.</p>
                </div>
            ) : (
                <ul className="divide-y divide-eburon-border -mx-4">
                    {history.map(gen => (
                        <li key={gen.id} className="p-4">
                             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <p className="text-sm text-eburon-fg/80 italic flex-1">"{gen.input_text}"</p>
                                <audio src={gen.audio_url} controls className="sm:w-80 w-full h-10" />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
    
    return (
        <div className="p-8 h-full flex flex-col">
            <div>
                <h1 className="text-3xl font-bold text-eburon-fg mb-2">TTS Studio</h1>
                <p className="text-eburon-fg/70 mb-6">
                    Create studio-quality voiceovers with AI. Text is automatically enhanced for human-like delivery.
                </p>
            </div>
            
            <div className="flex border-b border-eburon-border">
                <TabButton
                    label="Generator"
                    icon={SoundWaveIcon}
                    isActive={activeTab === 'generator'}
                    onClick={() => setActiveTab('generator')}
                />
                <TabButton
                    label="History"
                    icon={HistoryIcon}
                    isActive={activeTab === 'history'}
                    onClick={() => setActiveTab('history')}
                />
            </div>
            
            <div className="flex-grow pt-6 overflow-y-auto">
                {activeTab === 'generator' && renderGenerator()}
                {activeTab === 'history' && renderHistory()}
            </div>
        </div>
    );
};

export default TTSStudioView;