import React, { useState, useEffect, useRef } from 'react';
import { useGeminiLiveAgent, Transcript } from '../hooks/useGeminiLive';
import * as dataService from '../services/dataService';
import { Agent } from '../types';
import { LoadingIndicator } from './LoadingIndicator';
import { AgentIcon, MicIcon, StopIcon, ChevronLeftIcon } from './icons';

const ActiveCallView: React.FC = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoadingAgents, setIsLoadingAgents] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { 
        isConnecting, 
        isSessionActive, 
        transcripts, 
        error: sessionError, 
        startSession, 
        endSession,
        isHolding,
    } = useGeminiLiveAgent();
    
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    useEffect(() => {
        const loadAgents = async () => {
            setIsLoadingAgents(true);
            try {
                const fetchedAgents = await dataService.getAgents();
                setAgents(fetchedAgents);
            } catch (err: any) {
                setError(`Failed to load agents: ${err.message}`);
            } finally {
                setIsLoadingAgents(false);
            }
        };
        loadAgents();
    }, []);

    const handleStartSession = (agent: Agent) => {
        setSelectedAgent(agent);
        startSession(agent).catch(err => {
            setError(`Could not start session: ${err.message}`);
            setSelectedAgent(null); // Deselect on failure
        });
    };

    const handleEndSession = () => {
        endSession();
        setSelectedAgent(null);
    };

    if (isLoadingAgents) {
        return <LoadingIndicator text="Loading Agents..." />;
    }

    if (!selectedAgent || (!isSessionActive && !isConnecting)) {
        return (
            <div className="p-8 h-full overflow-y-auto">
                <h1 className="text-3xl font-bold text-eburon-fg mb-2">Start a Live Call</h1>
                <p className="text-eburon-fg/70 mb-8">Select an agent to start a real-time voice conversation.</p>
                {error && <div className="p-4 mb-4 text-center text-red-400 bg-red-900/50 border border-red-500 rounded-lg">{error}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map(agent => (
                        <div key={agent.id} className="bg-eburon-panel p-6 rounded-xl border border-eburon-border flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-full bg-eburon-bg grid place-items-center mb-4">
                                <AgentIcon className="w-10 h-10 text-eburon-accent" />
                            </div>
                            <h2 className="text-xl font-semibold text-eburon-fg">{agent.name}</h2>
                            <p className="text-sm text-eburon-fg/70 flex-grow mb-4">{agent.description}</p>
                            <button
                                onClick={() => handleStartSession(agent)}
                                className="w-full bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150"
                            >
                                Start Session
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const getStatusText = () => {
        if (isConnecting) return "Connecting...";
        if (isHolding) return "On Hold...";
        if (isSessionActive) return "Live Conversation...";
        return "Starting session...";
    }
    
    return (
        <div className="p-8 h-full flex flex-col bg-eburon-bg">
            <div className="flex items-start justify-between mb-6">
                 <button onClick={handleEndSession} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-eburon-panel transition-colors -ml-3">
                    <ChevronLeftIcon className="w-5 h-5" />
                    <span className="font-semibold">Back to Agents</span>
                 </button>
            </div>

            <div className="flex-grow flex flex-col max-w-4xl w-full mx-auto bg-eburon-panel rounded-xl border border-eburon-border overflow-hidden">
                <div className="p-4 border-b border-eburon-border text-center">
                    <h2 className="text-2xl font-bold text-eburon-fg">{selectedAgent.name}</h2>
                    <div className="flex items-center justify-center gap-2 text-eburon-ok">
                       <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-eburon-ok opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-eburon-ok"></span>
                        </div>
                        <span className="text-sm font-semibold">{getStatusText()}</span>
                    </div>
                </div>

                <div className="flex-grow p-6 space-y-4 overflow-y-auto">
                     {(sessionError || error) && <div className="p-3 text-center text-red-400 bg-red-900/50 rounded-lg">{sessionError || error}</div>}
                     {transcripts.map((t: Transcript) => (
                         <div key={t.id} className={`flex gap-3 items-start ${t.role === 'user' ? 'justify-end' : ''}`}>
                            {t.role === 'model' && <div className="w-8 h-8 rounded-full bg-eburon-accent flex-shrink-0 grid place-items-center font-bold text-sm">E</div>}
                            <div className={`max-w-md p-3 rounded-lg ${t.role === 'user' ? 'bg-eburon-accent text-white' : 'bg-eburon-bg'} ${t.isFinal ? 'opacity-100' : 'opacity-60'}`}>
                                {t.text}
                            </div>
                         </div>
                     ))}
                     <div ref={transcriptEndRef} />
                </div>
                
                <div className="p-6 border-t border-eburon-border flex items-center justify-center">
                    <button onClick={handleEndSession} className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg transition-colors flex items-center gap-3">
                        <StopIcon className="w-6 h-6" />
                        <span>End Session</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ActiveCallView;