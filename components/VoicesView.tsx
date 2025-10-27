import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { Voice } from '../types';
import * as dataService from '../services/dataService';
import { LoadingIndicator } from './LoadingIndicator';
import { VoiceIcon, PlusIcon, CloneIcon, PlayIcon, PauseIcon } from './icons';
import { VOICE_PREVIEW_CONFIG } from '../constants';

const CloneVoiceView = React.lazy(() => import('./CloneVoiceView'));

type ViewMode = 'list' | 'clone';

const VoicesView: React.FC = () => {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
    const [audioCache, setAudioCache] = useState<Record<string, string>>({});
    const audioRef = useRef<HTMLAudioElement>(null);

    const loadVoices = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedVoices = await dataService.getVoices();
            setVoices(fetchedVoices);
        } catch (err: any) {
            setError(`Failed to load voices: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === 'list') {
            loadVoices();
        }
    }, [viewMode, loadVoices]);

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

    const handlePlayPreview = async (voice: Voice) => {
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
            const url = await dataService.uploadVoiceSample(voice.name, audioBlob);
            setAudioCache(prev => ({ ...prev, [voice.id]: url }));

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setPlayingVoiceId(voice.id);
            }
        } catch (err: any) {
            setError(`Audio playback error: ${err.message}`);
            console.error(err);
        } finally {
            setLoadingVoiceId(null);
        }
    };

    if (viewMode === 'clone') {
        return (
             <Suspense fallback={<LoadingIndicator text="Loading Voice Cloner..." />}>
                <CloneVoiceView />
            </Suspense>
        );
    }
    
    const prebuiltVoices = voices.filter(v => v.type === 'Prebuilt');
    const clonedVoices = voices.filter(v => v.type === 'Cloned');

    return (
        <div className="p-8 h-full overflow-y-auto">
            <audio ref={audioRef} className="hidden" />
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-eburon-fg">Voice Library</h1>
                    <p className="text-eburon-fg/70">Manage your pre-built and custom cloned voices.</p>
                </div>
                <button
                    onClick={() => setViewMode('clone')}
                    className="bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150 flex items-center gap-2"
                >
                    <CloneIcon className="w-6 h-6" />
                    <span>Clone a New Voice</span>
                </button>
            </div>
            
            {isLoading && <LoadingIndicator text="Loading Voices..." />}
            {error && <div className="p-4 text-center text-red-400 bg-red-900/50 border border-red-500 rounded-lg">{error}</div>}

            {!isLoading && !error && (
                <div className="space-y-8">
                    <section>
                        <h2 className="text-xl font-semibold text-eburon-fg mb-4">Pre-built Voices</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {prebuiltVoices.map(voice => (
                                <div key={voice.id} className="bg-eburon-panel p-4 rounded-lg border border-eburon-border flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <VoiceIcon className="w-8 h-8 text-eburon-accent flex-shrink-0" />
                                        <div className="overflow-hidden">
                                            <h3 className="font-semibold truncate" title={voice.name}>{voice.name}</h3>
                                            <p className="text-sm text-eburon-fg/60">{voice.provider}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handlePlayPreview(voice)}
                                        disabled={loadingVoiceId === voice.id}
                                        className="p-2 rounded-full hover:bg-white/10 text-eburon-fg disabled:opacity-50 flex-shrink-0"
                                        aria-label={`Play preview for ${voice.name}`}
                                    >
                                        {loadingVoiceId === voice.id ? (
                                            <div className="w-6 h-6 border-2 border-eburon-fg/50 border-t-eburon-fg rounded-full animate-spin"></div>
                                        ) : playingVoiceId === voice.id ? (
                                            <PauseIcon className="w-6 h-6" />
                                        ) : (
                                            <PlayIcon className="w-6 h-6" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                     <section>
                        <h2 className="text-xl font-semibold text-eburon-fg mb-4">Your Cloned Voices</h2>
                        {clonedVoices.length > 0 ? (
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {clonedVoices.map(voice => (
                                    <div key={voice.id} className="bg-eburon-panel p-4 rounded-lg border border-eburon-border flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            <VoiceIcon className="w-8 h-8 text-eburon-ok flex-shrink-0" />
                                            <div className="overflow-hidden">
                                                <h3 className="font-semibold truncate" title={voice.name}>{voice.name}</h3>
                                                <p className="text-sm text-eburon-fg/60">{voice.provider}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handlePlayPreview(voice)}
                                            disabled={loadingVoiceId === voice.id}
                                            className="p-2 rounded-full hover:bg-white/10 text-eburon-fg disabled:opacity-50 flex-shrink-0"
                                            aria-label={`Play preview for ${voice.name}`}
                                        >
                                            {loadingVoiceId === voice.id ? (
                                                <div className="w-6 h-6 border-2 border-eburon-fg/50 border-t-eburon-fg rounded-full animate-spin"></div>
                                            ) : playingVoiceId === voice.id ? (
                                                <PauseIcon className="w-6 h-6" />
                                            ) : (
                                                <PlayIcon className="w-6 h-6" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 border-2 border-dashed border-eburon-border rounded-lg text-eburon-fg/60">
                                <p>You haven't cloned any voices yet.</p>
                                <button onClick={() => setViewMode('clone')} className="mt-2 text-eburon-accent font-semibold hover:underline">Clone your first voice</button>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default VoicesView;