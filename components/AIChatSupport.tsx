import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { MessageSquare, Mic, X, Send, Loader2, StopCircle, Volume2, Sparkles, Minimize2, Maximize2, MicOff } from 'lucide-react';
import { ProcessedParty } from '../types';

interface AIChatSupportProps {
  data: ProcessedParty[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// --- Audio Utils for Live API ---
function encodeAudio(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createPcmBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encodeAudio(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const AIChatSupport: React.FC<AIChatSupportProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Voice State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0); // For visualization

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Live API Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, mode]);

  // Generate Context String from Data
  const systemContext = useMemo(() => {
    if (data.length === 0) return "No data uploaded yet.";
    
    const summary = data.map(p => ({
      name: p.partyName,
      phone: p.phoneNumber,
      balance: p.balanceDebit,
      bills: p.bills.filter(b => b.billAmt > 0 && b.status !== 'paid' && b.status !== 'dispute').map(b => ({
        no: b.billNo,
        date: b.billDate,
        amt: b.billAmt,
        days: b.days
      }))
    }));

    return `You are "Yash AI", an intelligent payment support agent. 
    You have access to the following OUTSTANDING PAYMENT DATA.
    
    RULES:
    1. Answer strictly based on the provided JSON data.
    2. If asked about total outstanding, sum up the balances.
    3. If asked about a specific party, provide their details, total due, and list their oldest bills if relevant.
    4. Be concise and professional.
    5. Currency is INR (₹).
    
    DATA:
    ${JSON.stringify(summary)}
    `;
  }, [data]);

  // --- Text Chat Logic ---
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMsg = inputText;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInputText('');
    setIsProcessing(true);

    try {
      if (!process.env.API_KEY) {
         throw new Error("API Key not configured");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: systemContext,
        }
      });

      const result = await chat.sendMessage({ message: userMsg });
      const responseText = result.text;

      setMessages(prev => [...prev, { role: 'model', text: responseText || "I couldn't generate a response." }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setIsProcessing(false);
      // Focus input again
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- Voice (Live API) Logic ---
  const startLiveSession = async () => {
    try {
      if (!process.env.API_KEY) throw new Error("API Key missing");
      
      setIsProcessing(true); // Loading state while connecting
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      // Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          systemInstruction: systemContext,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
            onopen: () => {
                console.log("Live Session Connected");
                setIsLiveConnected(true);
                setIsMicOn(true);
                setIsProcessing(false);

                // Setup Input Streaming
                const source = inputCtx.createMediaStreamSource(stream);
                const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                
                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    // Visualize volume
                    let sum = 0;
                    for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
                    setVolumeLevel(Math.sqrt(sum/inputData.length));

                    const pcmBlob = createPcmBlob(inputData);
                    sessionPromise.then(session => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    });
                };

                source.connect(processor);
                processor.connect(inputCtx.destination);
                
                // Store ref to close later if needed (though stream closing handles mostly)
                sessionRef.current = { processor, source };
            },
            onmessage: async (msg: LiveServerMessage) => {
                const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData && outputCtx) {
                    const audioBuffer = await decodeAudioData(
                        decodeAudio(audioData),
                        outputCtx
                    );
                    
                    const source = outputCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputCtx.destination);
                    
                    const startTime = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                    source.start(startTime);
                    nextStartTimeRef.current = startTime + audioBuffer.duration;
                    
                    sourceNodesRef.current.add(source);
                    source.onended = () => sourceNodesRef.current.delete(source);
                }

                if (msg.serverContent?.interrupted) {
                    sourceNodesRef.current.forEach(node => node.stop());
                    sourceNodesRef.current.clear();
                    nextStartTimeRef.current = 0;
                }
            },
            onclose: () => {
                console.log("Live Session Closed");
                setIsLiveConnected(false);
                setIsMicOn(false);
            },
            onerror: (err) => {
                console.error("Live Session Error", err);
                stopLiveSession();
            }
        }
      });

    } catch (err) {
      console.error("Failed to start live session", err);
      setIsProcessing(false);
      alert("Could not access microphone or connect to AI.");
    }
  };

  const stopLiveSession = () => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    
    // Clean up session refs
    sessionRef.current = null;
    sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch(e){}
    });
    sourceNodesRef.current.clear();

    setIsLiveConnected(false);
    setIsMicOn(false);
    setVolumeLevel(0);
  };

  const toggleLiveSession = () => {
    if (isLiveConnected) {
        stopLiveSession();
    } else {
        startLiveSession();
    }
  };

  // Toggle open/close
  const toggleChat = () => setIsOpen(!isOpen);

  // Switch modes
  const handleModeSwitch = (newMode: 'text' | 'voice') => {
    if (newMode === 'text' && isLiveConnected) {
        stopLiveSession();
    }
    setMode(newMode);
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 z-50 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all hover:scale-105 flex items-center gap-2 group animate-bounce-subtle"
        >
          <Sparkles size={24} className="group-hover:animate-pulse" />
          <span className="font-bold pr-1">Ask AI</span>
        </button>
      )}

      {/* Main Chat Interface */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-[380px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-up h-[600px] max-h-[80vh]">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-500 p-1.5 rounded-lg">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">Yash AI Assistant</h3>
                <p className="text-[10px] text-slate-400 font-medium">Powered by Gemini 2.5</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                    <Minimize2 size={16} />
                </button>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex border-b border-slate-100">
            <button 
                onClick={() => handleModeSwitch('text')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${mode === 'text' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-400 hover:bg-slate-50'}`}
            >
                <MessageSquare size={14} /> Text Chat
            </button>
            <button 
                onClick={() => handleModeSwitch('voice')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${mode === 'voice' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-400 hover:bg-slate-50'}`}
            >
                {isLiveConnected ? <Volume2 size={14} className="animate-pulse text-red-500" /> : <Mic size={14} />} 
                Live Voice
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-slate-50 relative overflow-hidden flex flex-col">
            
            {/* --- Text Mode --- */}
            {mode === 'text' && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center mt-10 opacity-60">
                                <div className="bg-white p-4 rounded-xl inline-block shadow-sm mb-2">
                                    <MessageSquare size={32} className="text-indigo-300 mx-auto" />
                                </div>
                                <p className="text-sm font-bold text-slate-500">How can I help you today?</p>
                                <p className="text-xs text-slate-400 mt-1">Ask about outstanding bills, party details, or summary.</p>
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div 
                                    className={`max-w-[85%] rounded-2xl p-3 text-sm font-medium leading-relaxed shadow-sm ${
                                        msg.role === 'user' 
                                        ? 'bg-indigo-600 text-white rounded-br-none' 
                                        : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
                                    }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="flex justify-start">
                                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none border border-slate-100 shadow-sm flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-indigo-500" />
                                    <span className="text-xs font-bold text-slate-400">Typing...</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef}></div>
                    </div>
                    
                    <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
                        <input 
                            ref={inputRef}
                            type="text" 
                            className="flex-1 bg-slate-100 text-slate-800 placeholder:text-slate-400 rounded-xl px-4 py-2.5 text-sm font-medium border-none focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Type a message..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyPress}
                            disabled={isProcessing}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!inputText.trim() || isProcessing}
                            className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </>
            )}

            {/* --- Voice Mode --- */}
            {mode === 'voice' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-indigo-50/30">
                    <div className="relative mb-8">
                        {/* Visualizer Rings */}
                        {isLiveConnected && (
                            <>
                                <div className="absolute inset-0 bg-indigo-400 rounded-full animate-ping opacity-20" style={{ transform: `scale(${1 + volumeLevel * 2})` }}></div>
                                <div className="absolute inset-0 bg-indigo-500 rounded-full animate-pulse opacity-10" style={{ transform: `scale(${1 + volumeLevel * 4})` }}></div>
                            </>
                        )}
                        
                        <div className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-500 ${isLiveConnected ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-300 border-4 border-slate-100'}`}>
                            {isProcessing && !isLiveConnected ? (
                                <Loader2 size={40} className="animate-spin text-indigo-600" />
                            ) : isLiveConnected ? (
                                <Volume2 size={40} className="animate-pulse" />
                            ) : (
                                <MicOff size={40} />
                            )}
                        </div>
                    </div>

                    <h4 className="text-lg font-bold text-slate-800 mb-2">
                        {isLiveConnected ? "I'm Listening..." : "Voice Assistant"}
                    </h4>
                    <p className="text-sm text-slate-500 text-center max-w-[200px] mb-8">
                        {isLiveConnected 
                            ? "Go ahead, ask me anything about the uploaded payment data." 
                            : "Tap the button below to start a real-time conversation."}
                    </p>

                    <button 
                        onClick={toggleLiveSession}
                        className={`px-8 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 flex items-center gap-3 ${
                            isLiveConnected 
                            ? 'bg-red-500 text-white hover:bg-red-600' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                    >
                        {isLiveConnected ? (
                            <>
                                <StopCircle size={20} fill="currentColor" /> End Session
                            </>
                        ) : (
                            <>
                                <Mic size={20} fill="currentColor" /> Start Conversation
                            </>
                        )}
                    </button>
                </div>
            )}
            
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatSupport;
