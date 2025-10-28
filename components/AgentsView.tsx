import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Agent, Voice } from '../types';
import * as dataService from '../services/dataService';
import { AgentIcon, PlusIcon, SaveIcon, PlayIcon, PauseIcon, CheckCircleIcon, Trash2Icon, ChevronLeftIcon, HelpCircleIcon } from './icons';
import { LoadingIndicator } from './LoadingIndicator';
import { VOICE_PREVIEW_CONFIG } from '../constants';

const AgentsView: React.FC = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [voices, setVoices] = useState<Voice[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
    const [error, setError] = useState<string | null>(null);

    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
    const [audioCache, setAudioCache] = useState<Record<string, string>>({});
    const audioRef = useRef<HTMLAudioElement>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [fetchedAgents, fetchedVoices] = await Promise.all([
                dataService.getAgents(),
                dataService.getVoices()
            ]);
            setAgents(fetchedAgents);
            setVoices(fetchedVoices);
        } catch (err: any) {
            setError(`Failed to load data: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);
    
    useEffect(() => {
        const audio = audioRef.current;
        const onEnded = () => setPlayingVoiceId(null);
        audio?.addEventListener('ended', onEnded);
        return () => audio?.removeEventListener('ended', onEnded);
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

    const handlePlayPreview = async (voiceId: string) => {
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) return;
        
        if (loadingVoiceId === voice.id) return;
        
        if (playingVoiceId === voice.id) {
            audioRef.current?.pause();
            setPlayingVoiceId(null);
            return;
        }

        setPlayingVoiceId(null);
        if (audioRef.current) audioRef.current.src = '';
        
        if (audioCache[voice.id]) {
            if (audioRef.current) {
                audioRef.current.src = audioCache[voice.id];
                audioRef.current.play();
                setPlayingVoiceId(voice.id);
            }
            return;
        }

        setLoadingVoiceId(voice.id);
        setError(null);
        try {
            const langKey = getLanguageFromTags(voice.tags);
            const config = VOICE_PREVIEW_CONFIG[langKey] || VOICE_PREVIEW_CONFIG.default;
            
            const audioBlob = await dataService.generateVoiceSample(voice.id, config.text, config.langCode);
            const url = URL.createObjectURL(audioBlob);
            setAudioCache(prev => ({...prev, [voice.id]: url}));
            
            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setPlayingVoiceId(voice.id);
            }
        } catch (err: any) {
            setError(`Audio generation/playback error: ${err.message}`);
            console.error(err);
        } finally {
            setLoadingVoiceId(null);
        }
    };


    const handleSelectAgent = (agent: Agent) => {
        setSelectedAgent(agent);
        setSaveStatus('idle'); // Reset save status when selecting a new agent
    };

    const handleCreateNewAgent = () => {
        const newAgent: Agent = {
            id: `new-agent-${Date.now()}`,
            name: 'New Agent',
            description: 'A new agent configuration.',
            voice: voices.length > 0 ? voices[0].id : '',
            systemPrompt: 'You are a helpful assistant.',
            firstSentence: 'Hello, how can I help you today?',
            thinkingMode: false,
            avatarUrl: null,
        };
        setSelectedAgent(newAgent);
        setSaveStatus('idle');
    };
    
    const handleBackToList = () => {
        setSelectedAgent(null);
        setError(null);
    };

    const handleUpdateSelectedAgent = (field: keyof Agent, value: any) => {
        if (selectedAgent) {
            setSelectedAgent(prev => prev ? { ...prev, [field]: value } : null);
        }
    };

    const handleSaveChanges = async () => {
        if (!selectedAgent) return;

        setSaveStatus('saving');
        setError(null);
        try {
            await dataService.upsertAgents([selectedAgent]);
            setSaveStatus('success');

            setTimeout(async () => {
                await loadData();
                handleBackToList();
            }, 1500);

        } catch (err: any) {
            setError(`Failed to save agent: ${err.message}`);
            setSaveStatus('idle');
        }
    };

    const handleDeleteAgent = async () => {
        if (!selectedAgent || selectedAgent.id.startsWith('new-agent')) return;
        if (!window.confirm(`Are you sure you want to delete the agent "${selectedAgent.name}"? This action cannot be undone.`)) {
            return;
        }
        
        setError(null);
        try {
            await dataService.deleteAgent(selectedAgent.id);
            await loadData();
            handleBackToList();
        } catch (err: any) {
            setError(`Failed to delete agent: ${err.message}`);
        }
    };
    
    if (isLoading) {
        return <LoadingIndicator text="Loading Agents..." />;
    }

    if (selectedAgent) {
        return (
            <div className="p-8 h-full overflow-y-auto">
                <audio ref={audioRef} className="hidden" />
                {error && <div className="p-4 mb-4 text-center text-red-400 bg-red-900/50 border border-red-500 rounded-lg">{error}</div>}
                
                <div className="flex justify-between items-start gap-4 mb-6">
                    <button onClick={handleBackToList} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-eburon-panel transition-colors -ml-3">
                        <ChevronLeftIcon className="w-5 h-5" />
                        <span className="font-semibold">Back</span>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {!selectedAgent.id.startsWith('new-agent-') && (
                            <button
                                onClick={handleDeleteAgent}
                                className="font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors duration-200 bg-red-800/50 hover:bg-red-800/80 text-red-200"
                            >
                                <Trash2Icon className="w-5 h-5" />
                            </button>
                        )}
                        <button 
                            onClick={handleSaveChanges} 
                            disabled={saveStatus !== 'idle'} 
                            className={`font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors duration-200
                                ${saveStatus === 'idle' ? 'bg-eburon-accent hover:bg-eburon-accent-dark text-white' : ''}
                                ${saveStatus === 'saving' ? 'bg-gray-500 text-white cursor-not-allowed' : ''}
                                ${saveStatus === 'success' ? 'bg-eburon-ok text-white cursor-not-allowed' : ''}
                            `}
                        >
                            {saveStatus === 'saving' && <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>}
                            {saveStatus === 'success' && <CheckCircleIcon className="w-5 h-5" />}
                            {saveStatus === 'idle' && <SaveIcon className="w-5 h-5" />}
                            <span>
                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save'}
                            </span>
                        </button>
                     </div>
                </div>

                <div className="space-y-6 max-w-4xl mx-auto">
                    <div>
                        <h2 className="text-3xl font-bold text-eburon-fg">{selectedAgent.name}</h2>
                        <p className="text-eburon-fg/70">Configure your AI agent's personality and tools.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="agentName" className="block text-sm font-medium text-eburon-fg/80 mb-1">Agent Name</label>
                            <input type="text" id="agentName" value={selectedAgent.name} onChange={e => handleUpdateSelectedAgent('name', e.target.value)} className="w-full bg-eburon-panel border border-eburon-border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-eburon-accent" />
                        </div>
                         <div>
                            <label htmlFor="agentVoice" className="block text-sm font-medium text-eburon-fg/80 mb-1">Voice</label>
                            <div className="flex items-center gap-2">
                                <select id="agentVoice" value={selectedAgent.voice} onChange={e => handleUpdateSelectedAgent('voice', e.target.value)} className="flex-grow bg-eburon-panel border border-eburon-border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-eburon-accent">
                                    {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                                </select>
                                <button
                                    onClick={() => handlePlayPreview(selectedAgent.voice)}
                                    disabled={!selectedAgent.voice || loadingVoiceId === selectedAgent.voice}
                                    className="p-2.5 rounded-lg hover:bg-white/10 text-eburon-fg disabled:opacity-50 flex-shrink-0 bg-eburon-panel border border-eburon-border"
                                    aria-label={`Play preview for selected voice`}
                                >
                                    {loadingVoiceId === selectedAgent.voice ? (
                                        <div className="w-6 h-6 border-2 border-eburon-fg/50 border-t-eburon-fg rounded-full animate-spin"></div>
                                    ) : playingVoiceId === selectedAgent.voice ? (
                                        <PauseIcon className="w-6 h-6" />
                                    ) : (
                                        <PlayIcon className="w-6 h-6" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="systemPrompt" className="flex items-center gap-2 text-sm font-medium text-eburon-fg/80 mb-1">
                            <span>System Prompt</span>
                            <div className="relative group">
                                <HelpCircleIcon className="w-4 h-4 text-eburon-fg/50 cursor-help" />
                                {/* FIX: Corrected corrupted div from file concatenation error */}
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-2 bg-eburon-bg border border-eburon-border rounded-lg text-xs text-eburon-fg/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    The core instructions for the AI agent. Define its personality, goals, and constraints here.
                                </div>
                            </div>
                        </label>
                        <textarea id="systemPrompt" value={selectedAgent.systemPrompt} onChange={e => handleUpdateSelectedAgent('systemPrompt', e.target.value)} rows={12} className="w-full bg-eburon-panel border border-eburon-border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-eburon-accent font-mono text-sm"></textarea>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-eburon-fg">Agents</h1>
                    <p className="text-eburon-fg/70">Manage your library of AI agents.</p>
                </div>
                <button
                    onClick={handleCreateNewAgent}
                    className="bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150 flex items-center gap-2"
                >
                    <PlusIcon className="w-6 h-6" />
                    <span>New Agent</span>
                </button>
            </div>
            
            {error && <div className="p-4 text-center text-red-400 bg-red-900/50 border border-red-500 rounded-lg mb-4">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {agents.map(agent => (
                    <button
                        key={agent.id}
                        onClick={() => handleSelectAgent(agent)}
                        className="bg-eburon-panel p-6 rounded-xl border border-eburon-border text-left hover:border-eburon-accent hover:bg-eburon-accent/10 transition-all duration-200 group flex flex-col"
                    >
                        <div className="w-14 h-14 rounded-full bg-eburon-bg grid place-items-center mb-4 group-hover:bg-eburon-accent transition-colors">
                            <AgentIcon className="w-8 h-8 text-eburon-accent group-hover:text-white transition-colors" />
                        </div>
                        <h2 className="text-xl font-semibold text-eburon-fg">{agent.name}</h2>
                        <p className="text-sm text-eburon-fg/70 flex-grow">{agent.description}</p>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AgentsView;
