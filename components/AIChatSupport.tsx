
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { MessageSquare, X, Send, Loader2, Sparkles, Minimize2 } from 'lucide-react';
import { ProcessedParty } from '../types';

interface AIChatSupportProps {
  data: ProcessedParty[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const AIChatSupport: React.FC<AIChatSupportProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

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

    return `You are "Yash AI", an intelligent payment support agent for Yash Marketing, Hisar. 
    You have access to the current OUTSTANDING PAYMENT DATA.
    
    RULES:
    1. Answer strictly based on the provided JSON data.
    2. If asked about total outstanding, sum up the balances of all parties.
    3. If asked about a specific party, provide their contact info, total due, and list their pending bills.
    4. Be concise, helpful, and professional.
    5. Currency is INR (₹).
    
    DATA:
    ${JSON.stringify(summary)}
    `;
  }, [data]);

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

  const toggleChat = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 z-50 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all hover:scale-105 flex items-center gap-2 group animate-bounce-subtle"
        >
          <Sparkles size={24} className="group-hover:animate-pulse" />
          <span className="font-bold pr-1 text-sm">Ask AI</span>
        </button>
      )}

      {/* Main Chat Interface */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-[380px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-up h-[500px] max-h-[80vh]">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-500 p-1.5 rounded-lg">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">Yash AI Assistant</h3>
                <p className="text-[10px] text-slate-400 font-medium">Text Support Enabled</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                <Minimize2 size={16} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-slate-50 relative overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center mt-10 opacity-60 px-4">
                        <div className="bg-white p-4 rounded-xl inline-block shadow-sm mb-4">
                            <MessageSquare size={32} className="text-indigo-300 mx-auto" />
                        </div>
                        <p className="text-sm font-bold text-slate-500">How can I help you today?</p>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">Ask about total outstanding amounts, specific party details, or bill aging reports.</p>
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
                            <span className="text-xs font-bold text-slate-400">Yash AI is thinking...</span>
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
                    placeholder="Ask about payments..."
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
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatSupport;
