import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChatMessage, GroundingChunk, TelemetryData } from '../types';
import { sendMessageStreamToGemini, generateImageWithGemini } from '../services/geminiService';
import * as dataService from '../services/dataService';
import { uploadChatImage } from '../services/supabaseService';
import { SendIcon, PaperclipIcon, SearchIcon, CodeIcon, Trash2Icon } from './icons';
import { EBURON_SYSTEM_PROMPT } from '../constants';

interface ChatbotViewProps {
    setGeneratedAppHtml: (html: string | null) => void;
}

const TypingText: React.FC<{ text: string }> = ({ text }) => {
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        if (text.length < displayedText.length || !text.startsWith(displayedText)) {
            // If the new text is shorter or completely different, reset and start over
            setDisplayedText('');
        }

        const timeoutId = setTimeout(() => {
            if (displayedText.length < text.length) {
                setDisplayedText(text.slice(0, displayedText.length + 1));
            }
        }, 10); // Typing speed

        return () => clearTimeout(timeoutId);
    }, [text, displayedText]);

    return <>{displayedText}</>;
};


const ChatbotView: React.FC<ChatbotViewProps> = ({ setGeneratedAppHtml }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [useSearchGrounding, setUseSearchGrounding] = useState(false);
    const [isDeveloperMode, setIsDeveloperMode] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        const loadHistory = async () => {
            setIsHistoryLoading(true);
            const history = await dataService.getChatbotMessages();
            setMessages(history);
            setIsHistoryLoading(false);
        };
        loadHistory();
    }, []);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClearChat = async () => {
        if (window.confirm('Are you sure you want to delete the entire chat history? This cannot be undone.')) {
            try {
                await dataService.clearChatbotMessages();
                setMessages([]);
            } catch (error) {
                console.error("Failed to clear chat history:", error);
                alert("Could not clear chat history. Please try again.");
            }
        }
    };

    const handleSend = useCallback(async () => {
        if (!input.trim() && !imageFile) return;
        
        setIsLoading(true);
        const startTime = performance.now();
        let uploadedImageUrl: string | undefined = undefined;
        
        if (imageFile) {
            try {
                uploadedImageUrl = await uploadChatImage(imageFile);
            } catch (error) {
                console.error("Image upload failed:", error);
                // Handle upload error if necessary
            }
        }
        
        const userMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            text: input,
            image: imagePreview || undefined,
            imageUrl: uploadedImageUrl,
        };
        
        setMessages(prev => [...prev, userMessage]);
        await dataService.saveChatMessage(userMessage);

        const currentInput = input;
        const currentImageFile = imageFile;
        const history = [...messages, userMessage];
        
        setInput('');
        setImageFile(null);
        setImagePreview(null);
        if(fileInputRef.current) fileInputRef.current.value = "";
        
        const modelMessagePlaceholder: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            role: 'model',
            text: '',
        };
        setMessages(prev => [...prev, modelMessagePlaceholder]);

        const systemPrompt = isDeveloperMode
            ? `You are an expert web developer. The user will ask you to build a web application. Your response MUST be a single block of HTML code. Do not include any explanation or markdown formatting. The HTML should be self-contained with TailwindCSS via CDN and any necessary Javascript in a script tag.`
            : EBURON_SYSTEM_PROMPT;

        try {
            const stream = await sendMessageStreamToGemini(history, currentInput, currentImageFile, useSearchGrounding, systemPrompt);
            let fullText = '';
            let groundingChunks: GroundingChunk[] | undefined;

            for await (const chunk of stream) {
                if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    groundingChunks = chunk.candidates[0].groundingMetadata.groundingChunks as GroundingChunk[];
                }
                const chunkText = chunk.text;
                fullText += chunkText;
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'model') {
                        lastMessage.text = fullText;
                        if (groundingChunks) lastMessage.groundingChunks = groundingChunks;
                    }
                    return newMessages;
                });
            }
            
            if (isDeveloperMode) {
                setGeneratedAppHtml(fullText);
            }

            const endTime = performance.now();
            const durationSeconds = (endTime - startTime) / 1000;
            const words = fullText.trim().split(/\s+/).filter(Boolean).length;
            const wps = durationSeconds > 0 ? Math.round(words / durationSeconds) : 0;
            const energy = ((fullText.length / 1000) * 0.005).toFixed(4);
            const tokensUsed = Math.round(fullText.length / 3.8);

            const finalModelMessage: ChatMessage = {
                ...modelMessagePlaceholder,
                text: fullText,
                groundingChunks,
                telemetry: {
                    tokensUsed,
                    energy: `${energy} kWh`,
                    wps
                }
            };
            
            setMessages(prev => prev.map(msg => msg.id === modelMessagePlaceholder.id ? finalModelMessage : msg));
            await dataService.saveChatMessage(finalModelMessage);

        } catch (error: any) {
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'model') {
                    lastMessage.text = error.message || "Sorry, I encountered an error. Please try again.";
                }
                return newMessages;
            });
            const errorModelMessage: ChatMessage = { ...modelMessagePlaceholder, text: error.message };
            await dataService.saveChatMessage(errorModelMessage);
        } finally {
            setIsLoading(false);
        }
    }, [input, imageFile, imagePreview, messages, useSearchGrounding, isDeveloperMode, setGeneratedAppHtml]);


    return (
        <div className="h-full flex flex-col bg-eburon-bg text-eburon-fg">
            <header className="p-4 border-b border-eburon-border flex justify-between items-center">
                <h1 className="text-xl font-bold">Eburon Assistant</h1>
                <div className="flex items-center gap-2">
                    <button onClick={handleClearChat} className="p-2 rounded-lg hover:bg-white/10 text-eburon-fg/70" title="Clear Chat History">
                        <Trash2Icon className="w-5 h-5" />
                    </button>
                    <label 
                        htmlFor="search-grounding-toggle" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${useSearchGrounding ? 'bg-eburon-accent text-white' : 'bg-eburon-panel hover:bg-white/10'}`}
                        title="Toggle Search Grounding"
                    >
                        <SearchIcon className="w-5 h-5"/>
                        <span>Web Search</span>
                        <div className="relative">
                            <input type="checkbox" id="search-grounding-toggle" className="sr-only" checked={useSearchGrounding} onChange={() => setUseSearchGrounding(!useSearchGrounding)} />
                            <div className={`w-9 h-5 rounded-full transition-colors ${useSearchGrounding ? 'bg-white/30' : 'bg-gray-500'}`}></div>
                            <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${useSearchGrounding ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                     <label 
                        htmlFor="developer-mode-toggle" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${isDeveloperMode ? 'bg-eburon-accent text-white' : 'bg-eburon-panel hover:bg-white/10'}`}
                        title="Toggle Developer Mode"
                    >
                        <CodeIcon className="w-5 h-5"/>
                        <span>Developer Mode</span>
                        <div className="relative">
                            <input type="checkbox" id="developer-mode-toggle" className="sr-only" checked={isDeveloperMode} onChange={() => setIsDeveloperMode(!isDeveloperMode)} />
                            <div className={`w-9 h-5 rounded-full transition-colors ${isDeveloperMode ? 'bg-white/30' : 'bg-gray-500'}`}></div>
                            <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${isDeveloperMode ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isHistoryLoading && <div className="text-center text-eburon-fg/60">Loading history...</div>}
                {messages.map((msg, index) => (
                    <div key={msg.id} className={`flex gap-4 items-start ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-eburon-accent flex items-center justify-center font-bold text-white text-sm flex-shrink-0">E</div>}
                        <div className={`max-w-xl p-4 rounded-xl ${msg.role === 'user' ? 'bg-eburon-accent text-white rounded-br-none' : 'bg-eburon-panel rounded-bl-none'}`}>
                            {(msg.image || msg.imageUrl) && <img src={msg.image || msg.imageUrl} alt="content" className="rounded-lg mb-2 max-w-xs"/>}
                            
                            <div className="whitespace-pre-wrap">
                                {isLoading && msg.text === '' && msg.role === 'model' ? (
                                    <span className="inline-block w-2.5 h-5 bg-eburon-fg animate-pulse"></span>
                                ) : msg.role === 'model' ? (
                                    <>
                                        <TypingText text={msg.text} />
                                        {isLoading && index === messages.length - 1 && <span className="inline-block w-2.5 h-5 bg-eburon-fg animate-pulse ml-1 align-bottom"></span>}
                                    </>
                                ) : (
                                    msg.text
                                )}
                            </div>
                            
                            {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-white/20">
                                    <h4 className="text-xs font-semibold mb-2">Sources:</h4>
                                    <div className="flex flex-col gap-2">
                                        {msg.groundingChunks.map((chunk, index) => chunk.web && chunk.web.uri && (
                                            <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" key={index} className="text-xs text-eburon-fg/80 hover:underline truncate">
                                                {chunk.web.title || chunk.web.uri}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {msg.role === 'model' && msg.telemetry && (
                                <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-eburon-fg/50 font-mono">
                                    <span>Tokens: {msg.telemetry.tokensUsed}</span>
                                    <span>Energy: {msg.telemetry.energy}</span>
                                    <span>WPS: {msg.telemetry.wps}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-eburon-border">
                 {imagePreview && (
                    <div className="relative w-24 h-24 mb-2 p-1 border border-eburon-border rounded-lg">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded"/>
                        <button onClick={removeImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">&times;</button>
                    </div>
                )}
                <div className="bg-eburon-panel rounded-xl flex items-center p-2">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        ref={fileInputRef}
                        className="hidden"
                    />
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 text-eburon-fg/70 hover:text-eburon-fg">
                        <PaperclipIcon className="w-6 h-6" />
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                        placeholder={'Type a message...'}
                        className="flex-1 bg-transparent focus:outline-none px-2"
                        disabled={isLoading}
                    />
                    <button onClick={handleSend} disabled={isLoading || (!input.trim() && !imageFile)} className="p-3 rounded-lg bg-eburon-accent text-white disabled:bg-gray-500 transition-colors">
                        <SendIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatbotView;