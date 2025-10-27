import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CallLog } from '../types';
import { fetchRecording, fetchCallLogs } from '../services/blandAiService';
import * as dataService from '../services/dataService';
import { SearchIcon, PhoneIcon, UserIcon, AgentIcon, RefreshIcon, PlayIcon, PauseIcon, HistoryIcon, CalendarIcon, CopyIcon, ChevronLeftIcon } from './icons';
import { LoadingIndicator } from './LoadingIndicator';

const formatDuration = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

const CallDetailView: React.FC<{ call: CallLog, onBack: () => void }> = ({ call, onBack }) => {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(true);
    const [isProcessingAudio, setIsProcessingAudio] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    
    const audioRef = useRef<HTMLAudioElement>(null);
    const transcriptContainerRef = useRef<HTMLDivElement>(null);
    const objectUrlRef = useRef<string | null>(null);
    
    const [copyStatus, setCopyStatus] = useState('Copy');

    const loadRecording = useCallback(async () => {
        setIsLoadingAudio(true);
        setIsProcessingAudio(false);
        setError(null);
        setAudioUrl(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);

        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        
        // Recordings are not available for calls that didn't connect.
        // The presence of a recording_url from the API is the best indicator.
        if (!call.recording_url) {
            setError("No recording is available for this call (e.g., it was not answered).");
            setIsLoadingAudio(false);
            return;
        }

        if (!call.call_id) {
            setError("This call has no recording available (missing Call ID).");
            setIsLoadingAudio(false);
            return;
        }

        try {
            // Always fetch the recording via its ID to ensure correct authentication.
            // Using `recording_url` directly can fail due to missing auth headers.
            const blob = await fetchRecording(call.call_id);
            const newObjectUrl = URL.createObjectURL(blob);
            objectUrlRef.current = newObjectUrl;
            setAudioUrl(newObjectUrl);
        } catch (err: any) {
            console.error("Failed to load recording:", err);
            if (err.code === 'RECORDING_PROCESSING') {
                setIsProcessingAudio(true);
                setError(err.message);
            } else {
                setError(err.message || "Could not load audio recording.");
            }
        } finally {
            setIsLoadingAudio(false);
        }
    }, [call]);

    useEffect(() => {
        loadRecording();
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [loadRecording]);
    
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        const setAudioData = () => {
            if (isFinite(audio.duration)) setDuration(audio.duration);
            setCurrentTime(audio.currentTime);
        };

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            if (!call.transcript) return;
            let newActiveIndex = -1;
            for (let i = call.transcript.length - 1; i >= 0; i--) {
                if (audio.currentTime >= call.transcript[i].start_time) {
                    newActiveIndex = i;
                    break;
                }
            }
            if (newActiveIndex !== activeSegmentIndex) {
                setActiveSegmentIndex(newActiveIndex);
            }
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('canplay', setAudioData);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);

        return () => {
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('canplay', setAudioData);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
        };
    }, [audioUrl, call.transcript, activeSegmentIndex]);

    useEffect(() => {
        const activeElement = transcriptContainerRef.current?.children[activeSegmentIndex] as HTMLElement;
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    }, [activeSegmentIndex]);

    const togglePlayPause = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => setError("Playback failed."));
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !isFinite(duration) || duration === 0) return;

        const progressBar = e.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const seekTime = (clickX / width) * duration;
        audio.currentTime = seekTime;
    };

    const handleCopyTranscript = () => {
        if (call.concatenated_transcript) {
            navigator.clipboard.writeText(call.concatenated_transcript);
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy'), 2000);
        }
    };
    
    const progressPercentage = (currentTime / duration) * 100 || 0;

    return (
        <div className="p-8 flex flex-col h-full bg-eburon-bg">
            <audio ref={audioRef} src={audioUrl || ''} className="hidden" />
             <div className="flex items-start justify-between mb-6">
                 <button onClick={onBack} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-eburon-panel transition-colors -ml-3">
                    <ChevronLeftIcon className="w-5 h-5" />
                    <span className="font-semibold">Back to Logs</span>
                 </button>
            </div>
           
           <div className="max-w-4xl mx-auto w-full flex-grow flex flex-col">
                <div className="flex items-start justify-between mb-6">
                     <div>
                        <h2 className="text-3xl font-bold text-eburon-fg">{call.to}</h2>
                        <p className="text-sm text-eburon-fg/60">Call from {call.from}</p>
                     </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div className="bg-eburon-panel p-3 rounded-lg flex items-center gap-3">
                        <CalendarIcon className="w-5 h-5 text-eburon-accent"/>
                        <div>
                            <p className="font-semibold text-eburon-fg/90">{formatDate(call.created_at).split(',')[0]}</p>
                            <p className="text-eburon-fg/60">{formatDate(call.created_at).split(',')[1]}</p>
                        </div>
                    </div>
                    <div className="bg-eburon-panel p-3 rounded-lg flex items-center gap-3">
                        <HistoryIcon className="w-5 h-5 text-eburon-accent"/>
                        <div>
                            <p className="font-semibold text-eburon-fg/90">{formatDuration(call.duration)}</p>
                            <p className="text-eburon-fg/60">Duration</p>
                        </div>
                    </div>
                </div>

                <div className="bg-eburon-panel p-4 rounded-xl mb-6">
                     {isLoadingAudio ? (
                        <div className="h-14 flex items-center justify-center text-sm text-eburon-fg/60"><LoadingIndicator text="Loading Audio..." size="small" /></div>
                     ) : isProcessingAudio ? (
                        <div className="h-14 bg-eburon-warn/10 border border-eburon-warn/50 text-eburon-warn rounded-lg flex items-center justify-between text-sm px-4">
                            <span>{error}</span>
                            <button onClick={loadRecording} className="p-2 rounded-lg hover:bg-white/10" title="Retry loading audio">
                                <RefreshIcon className="w-5 h-5" />
                            </button>
                        </div>
                     ) : error ? (
                         <div className="h-14 bg-red-900/50 border border-red-500 text-red-300 rounded-lg flex items-center justify-between text-sm px-4">
                            <span>{error}</span>
                            <button onClick={loadRecording} className="p-2 rounded-lg hover:bg-white/10" title="Retry loading audio">
                                <RefreshIcon className="w-5 h-5" />
                            </button>
                        </div>
                     ) : audioUrl ? (
                        <div className="flex items-center gap-4">
                            <button onClick={togglePlayPause} className="p-3 bg-eburon-accent text-white rounded-full hover:bg-eburon-accent-dark transition-colors">
                                {isPlaying ? <PauseIcon className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                            </button>
                            <div className="flex-grow flex items-center gap-3">
                                 <span className="text-xs font-mono text-eburon-fg/70">{formatDuration(currentTime)}</span>
                                 <div onClick={handleSeek} className="w-full h-2 bg-eburon-bg rounded-full cursor-pointer group">
                                    <div style={{width: `${progressPercentage}%`}} className="h-full bg-eburon-accent rounded-full relative">
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </div>
                                 </div>
                                 <span className="text-xs font-mono text-eburon-fg/70">{formatDuration(duration)}</span>
                            </div>
                        </div>
                     ) : null}
                </div>

                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xl font-semibold text-eburon-fg">Transcript</h3>
                    <button onClick={handleCopyTranscript} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded-md bg-eburon-panel hover:bg-eburon-border transition-colors text-eburon-fg/80">
                       <CopyIcon className="w-4 h-4" />
                       {copyStatus}
                    </button>
                </div>
                <div ref={transcriptContainerRef} className="flex-grow bg-eburon-panel p-4 rounded-lg overflow-y-auto space-y-3">
                    {call.transcript && call.transcript.length > 0 ? call.transcript.map((segment, index) => (
                        <div key={index} className={`flex gap-3 items-start p-3 rounded-lg transition-all duration-300 ${activeSegmentIndex === index ? 'bg-eburon-accent/10' : ''} ${segment.user === 'user' ? 'justify-end' : ''}`}>
                             {segment.user === 'agent' && (
                                 <div className="w-8 h-8 rounded-full flex-shrink-0 grid place-items-center bg-eburon-accent">
                                     <AgentIcon className="w-5 h-5 text-white" />
                                 </div>
                             )}
                             <div className={`max-w-md p-3 rounded-xl ${segment.user === 'agent' ? 'bg-eburon-bg rounded-bl-none' : 'bg-eburon-accent text-white rounded-br-none'}`}>
                                <p className="text-sm">{segment.text}</p>
                             </div>
                             {segment.user === 'user' && (
                                 <div className="w-8 h-8 rounded-full flex-shrink-0 grid place-items-center bg-gray-500">
                                    <UserIcon className="w-5 h-5 text-white" />
                                 </div>
                             )}
                        </div>
                    )) : <p className="text-center text-sm text-eburon-fg/60 pt-4">No interactive transcript available for this call.</p>}
                </div>
            </div>
        </div>
    );
};

const CallLogsView: React.FC = () => {
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const loadLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const freshLogs = await fetchCallLogs();
            setCallLogs(freshLogs);
            if (!selectedCall && freshLogs.length > 0) {
                 // Don't auto-select a call in list view
            }
        } catch (err: any) {
            console.error("Failed to load call logs:", err);
            setError(`Could not retrieve call logs: ${err.message}. Trying cache...`);
            try {
                const cachedLogs = await dataService.getCallLogs();
                setCallLogs(cachedLogs);
                if (cachedLogs.length > 0) {
                    setError(null);
                } else {
                    setError(`Could not retrieve call logs and cache is empty.`);
                }
            } catch (cacheErr: any) {
                 setError(`Failed to retrieve call logs and failed to load from cache: ${cacheErr.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    }, [selectedCall]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const filteredLogs = useMemo(() => {
        if (!searchTerm) return callLogs;
        const lowercasedFilter = searchTerm.toLowerCase();
        return callLogs.filter(log => 
            log.from.includes(lowercasedFilter) || 
            log.to.includes(lowercasedFilter) ||
            log.concatenated_transcript.toLowerCase().includes(lowercasedFilter)
        );
    }, [callLogs, searchTerm]);

    if (isLoading) {
        return <LoadingIndicator text="Loading Call Logs..." />;
    }

    if (error) {
        return <div className="p-8 text-center text-red-400">{error}</div>;
    }
    
    if (selectedCall) {
        return <CallDetailView call={selectedCall} onBack={() => setSelectedCall(null)} />;
    }

    return (
        <div className="flex flex-col h-full bg-eburon-bg">
            <div className="p-4 border-b border-eburon-border">
                <h1 className="text-2xl font-bold mb-4">Call History</h1>
                 <div className="relative">
                    <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-eburon-fg/50" />
                    <input type="text" placeholder="Search by number or transcript..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-eburon-panel border border-eburon-border rounded-lg pl-11 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-eburon-accent" />
                </div>
            </div>
            <div className="flex-grow overflow-y-auto">
                {filteredLogs.length === 0 ? (
                    <div className="p-8 text-center text-eburon-fg/60">
                        <p>No call logs found{searchTerm ? ` for "${searchTerm}"` : ''}.</p>
                    </div>
                ) : filteredLogs.map(log => (
                    <button 
                        key={log.call_id} 
                        onClick={() => setSelectedCall(log)}
                        className={`w-full text-left p-4 border-b border-eburon-border hover:bg-eburon-panel transition-colors flex items-center gap-4`}
                    >
                        <div className="w-10 h-10 rounded-full bg-eburon-panel grid place-items-center flex-shrink-0">
                            <PhoneIcon className="w-5 h-5 text-eburon-accent" />
                        </div>
                        <div className="flex-grow overflow-hidden">
                            <div className="flex justify-between items-center">
                                <p className="font-semibold text-eburon-fg truncate">{log.to}</p>
                                <p className="text-xs text-eburon-fg/60 font-mono flex-shrink-0 ml-2">{formatDuration(log.duration)}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p className="text-sm text-eburon-fg/70 truncate">From: {log.from}</p>
                                <p className="text-xs text-eburon-fg/50">{new Date(log.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <div className="p-2 border-t border-eburon-border">
                <button onClick={loadLogs} className="w-full flex items-center justify-center gap-2 p-2 rounded-md hover:bg-eburon-panel text-sm text-eburon-fg/70">
                    <RefreshIcon className="w-4 h-4"/>
                    Refresh Logs
                </button>
            </div>
        </div>
    );
};

export default CallLogsView;