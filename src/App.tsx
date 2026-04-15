/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, User, Bot, Sparkles, Loader2, Search, FileText, Globe, 
  Plus, History, Paperclip, Image as ImageIcon, Square, Trash2, 
  Menu, X, MessageSquare, ChevronRight
} from 'lucide-react';
import { generateStreamingResponse, FileData } from '@/src/lib/gemini';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  files?: FileData[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

const STATUS_MESSAGES = [
  "Ma'lumot qidirilmoqda...",
  "Internetdan izlanmoqda...",
  "Javob tayyorlanmoqda...",
  "O'ylayapman...",
];

const SaboqLogo = ({ isGenerating }: { isGenerating: boolean }) => {
  return (
    <motion.div
      animate={isGenerating ? {
        scale: [1, 1.15, 1],
        rotate: [0, 10, -10, 0],
        filter: ["drop-shadow(0 0 0px rgba(99, 102, 241, 0))", "drop-shadow(0 0 15px rgba(99, 102, 241, 0.5))", "drop-shadow(0 0 0px rgba(99, 102, 241, 0))"]
      } : {}}
      transition={isGenerating ? {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      } : {}}
      className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 shadow-lg shadow-indigo-500/30"
    >
      <Sparkles className="w-6 h-6 text-white" />
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.5 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute -inset-2 rounded-3xl border-2 border-indigo-400/20 blur-md"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileData[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<boolean>(false);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('saboq_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('saboq_history', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating, status]);

  const startNewChat = () => {
    if (messages.length > 0 && !currentSessionId) {
      saveCurrentSession();
    }
    setMessages([]);
    setCurrentSessionId(null);
    setAttachedFiles([]);
    setIsSidebarOpen(false);
  };

  const saveCurrentSession = () => {
    if (messages.length === 0) return;
    
    const newSession: ChatSession = {
      id: currentSessionId || Date.now().toString(),
      title: messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? '...' : ''),
      messages: [...messages],
      timestamp: Date.now()
    };

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== newSession.id);
      return [newSession, ...filtered];
    });
    
    if (!currentSessionId) setCurrentSessionId(newSession.id);
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result?.toString().split(',')[1];
        if (base64) {
          setAttachedFiles(prev => [...prev, {
            mimeType: file.type,
            data: base64
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const stopGeneration = () => {
    abortControllerRef.current = true;
    setIsGenerating(false);
    setStatus('');
  };

  const handleSend = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    if (isGenerating) return;

    const userMessage: Message = { 
      role: 'user', 
      content: input,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined
    };
    
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentFiles = [...attachedFiles];
    
    setInput('');
    setAttachedFiles([]);
    setIsGenerating(true);
    abortControllerRef.current = false;

    // Context-aware status messages
    const statusInterval = setInterval(() => {
      const pool = currentFiles.length > 0 
        ? ["Fayllarni tahlil qilmoqdaman...", ...STATUS_MESSAGES]
        : STATUS_MESSAGES;
      setStatus(pool[Math.floor(Math.random() * pool.length)]);
    }, 2000);
    
    setStatus(currentFiles.length > 0 ? "Fayllarni o'qimoqdaman..." : "O'ylayapman...");

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API kaliti topilmadi. Iltimos, AI Studio sozlamalaridan (Secrets paneli) GEMINI_API_KEY o'rnatilganligini tekshiring.");
      }

      const history = messages.map(m => {
        const parts: any[] = [];
        if (m.content.trim()) {
          parts.push({ text: m.content });
        }
        if (m.files) {
          m.files.forEach(f => {
            parts.push({ inlineData: f });
          });
        }
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts
        };
      }).filter(m => m.parts.length > 0);
      
      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = generateStreamingResponse(currentInput, history, currentFiles);
      
      for await (const chunk of stream) {
        if (abortControllerRef.current) break;
        assistantContent += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: assistantContent }];
          }
          return prev;
        });
      }
      
      saveCurrentSession();
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.";
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          return [...prev.slice(0, -1), { role: 'assistant', content: errorMessage }];
        }
        return [...prev, { role: 'assistant', content: errorMessage }];
      });
    } finally {
      clearInterval(statusInterval);
      setIsGenerating(false);
      setStatus('');
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-indigo-100 overflow-hidden">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200">
          <div className="p-4">
            <Button 
              onClick={startNewChat}
              className="w-full justify-start gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi chat
            </Button>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-1 py-2">
              <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tarix</h3>
              {sessions.map(session => (
                <div 
                  key={session.id}
                  onClick={() => loadSession(session)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all",
                    currentSessionId === session.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
                  )}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="text-sm font-medium truncate flex-1">{session.title}</span>
                  <button 
                    onClick={(e) => deleteSession(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded-md transition-opacity"
                  >
                    <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-xs text-slate-400 px-2 italic">Hali chatlar yo'q</p>
              )}
            </div>
          </ScrollArea>
          <div className="p-4 border-t border-slate-100">
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">Saboq AI v2.0</p>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
                <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden rounded-xl">
                    <Menu className="w-5 h-5" />
                  </Button>} />
                <SheetContent side="left" className="w-72 p-0 flex flex-col">
                  <SheetHeader className="p-4 border-b">
                    <SheetTitle className="text-left flex items-center gap-2">
                      <History className="w-5 h-5 text-indigo-600" />
                      Chatlar tarixi
                    </SheetTitle>
                  </SheetHeader>
                  <div className="p-4">
                    <Button onClick={startNewChat} className="w-full gap-2 bg-indigo-600 rounded-xl">
                      <Plus className="w-4 h-4" /> Yangi chat
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 px-4">
                    <div className="space-y-1 py-2">
                      {sessions.map(session => (
                        <div 
                          key={session.id}
                          onClick={() => loadSession(session)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer",
                            currentSessionId === session.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          <MessageSquare className="w-4 h-4 shrink-0" />
                          <span className="text-sm font-medium truncate flex-1">{session.title}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              
              <SaboqLogo isGenerating={isGenerating} />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">Saboq AI</h1>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px] h-4 uppercase tracking-wider bg-indigo-50 text-indigo-700 border-indigo-100">
                    {isGenerating ? 'Yozmoqda...' : 'Online'}
                  </Badge>
                  <span className="hidden sm:inline text-[10px] text-slate-400 font-bold uppercase tracking-widest">Uzbek • English • Russian</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" className="rounded-full text-slate-500 hover:text-indigo-600 hover:bg-indigo-50">
                    <Globe className="w-5 h-5" />
                  </Button>} />
                <TooltipContent>Til sozlamalari</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* Chat Area */}
          <main className="flex-1 overflow-hidden relative">
            <div className="h-full overflow-y-auto px-4 py-8 scroll-smooth" ref={scrollRef}>
              <div className="max-w-3xl mx-auto space-y-10">
                {messages.length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-20 text-center space-y-8"
                  >
                    <div className="relative">
                      <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Sparkles className="w-12 h-12" />
                      </div>
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute -inset-4 bg-indigo-100/50 rounded-full blur-2xl -z-10"
                      />
                    </div>
                    <div className="space-y-3">
                      <h2 className="text-4xl font-black tracking-tight text-slate-800">Saboq berishga tayyorman!</h2>
                      <p className="text-slate-500 max-w-md mx-auto text-lg leading-relaxed">
                        Men sizning shaxsiy yordamchingizman. Savol bering, rasm tashlang yoki fayllarni tahlil qilishni so'rang.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
                      {[
                        { icon: ImageIcon, text: 'Ushbu rasmni tasvirlab ber' },
                        { icon: Globe, text: 'Ingliz tilida suhbatlashamiz' },
                        { icon: FileText, text: 'PDF faylni tahlil qil' },
                        { icon: Sparkles, text: 'Menga qiziqarli fakt ayt' }
                      ].map((item) => (
                        <Button 
                          key={item.text}
                          variant="outline" 
                          className="group justify-start h-auto py-4 px-5 text-left border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all rounded-2xl"
                          onClick={() => setInput(item.text)}
                        >
                          <item.icon className="w-5 h-5 mr-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                          <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900">{item.text}</span>
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((message, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex gap-4 group",
                        message.role === 'user' ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <Avatar className={cn(
                        "w-10 h-10 border-2 shadow-sm shrink-0",
                        message.role === 'user' ? "border-indigo-100" : "border-slate-100"
                      )}>
                        {message.role === 'user' ? (
                          <AvatarFallback className="bg-indigo-600 text-white"><User className="w-5 h-5" /></AvatarFallback>
                        ) : (
                          <AvatarFallback className="bg-slate-800 text-white"><Bot className="w-5 h-5" /></AvatarFallback>
                        )}
                      </Avatar>
                      <div className={cn(
                        "flex flex-col max-w-[85%]",
                        message.role === 'user' ? "items-end" : "items-start"
                      )}>
                        {message.files && message.files.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.files.map((file, i) => (
                              <div key={i} className="relative group/file">
                                {file.mimeType.startsWith('image/') ? (
                                  <img 
                                    src={`data:${file.mimeType};base64,${file.data}`} 
                                    alt="Uploaded" 
                                    className="w-32 h-32 object-cover rounded-xl border border-slate-200 shadow-sm"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200">
                                    <FileText className="w-4 h-4 text-slate-500" />
                                    <span className="text-xs font-medium text-slate-600">Fayl</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className={cn(
                          "px-6 py-4 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                          message.role === 'user' 
                            ? "bg-indigo-600 text-white rounded-tr-none" 
                            : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                        )}>
                          {message.role === 'assistant' ? (
                            <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded">
                              <ReactMarkdown>{message.content}</ReactMarkdown>
                              {index === messages.length - 1 && isGenerating && (
                                <motion.span 
                                  animate={{ opacity: [1, 0, 1] }}
                                  transition={{ duration: 0.8, repeat: Infinity }}
                                  className="inline-block w-2 h-5 bg-indigo-600 ml-1 translate-y-1"
                                />
                              )}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap font-medium">{message.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] mt-2 text-slate-400 font-bold uppercase tracking-widest px-1">
                          {message.role === 'user' ? 'Siz' : 'Saboq'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isGenerating && messages[messages.length - 1]?.role === 'user' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                    <Avatar className="w-10 h-10 border-2 border-slate-100 shadow-sm">
                      <AvatarFallback className="bg-slate-800 text-white">
                        <Bot className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-3">
                      <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-4">
                        <div className="relative">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                          <div className="absolute inset-0 animate-ping bg-indigo-400/20 rounded-full" />
                        </div>
                        <span className="text-sm text-slate-500 font-bold italic tracking-tight">{status}</span>
                      </div>
                      <div className="flex gap-2 px-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ 
                              scale: [1, 1.5, 1],
                              opacity: [0.4, 1, 0.4]
                            }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                            className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm"
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
                <div className="h-10" />
              </div>
            </div>
            
            {/* Floating Stop Button */}
            <AnimatePresence>
              {isGenerating && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30"
                >
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={stopGeneration}
                    className="rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all gap-2 px-4 h-10"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    To'xtatish
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Input Area */}
          <footer className="p-6 bg-white border-t border-slate-200 z-20">
            <div className="max-w-3xl mx-auto space-y-4">
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="relative group">
                      {file.mimeType.startsWith('image/') ? (
                        <img 
                          src={`data:${file.mimeType};base64,${file.data}`} 
                          className="w-16 h-16 object-cover rounded-xl border-2 border-indigo-100 shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center bg-slate-50 rounded-xl border-2 border-slate-100">
                          <FileText className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <button 
                        onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Saboqdan biror nima so'rang..."
                    className="pr-24 pl-12 py-8 rounded-2xl border-slate-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 bg-slate-50/50 text-base shadow-inner"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex gap-1">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      multiple 
                      accept="image/*,application/pdf,text/*"
                    />
                    <Tooltip>
                      <TooltipTrigger render={<Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                        >
                          <Paperclip className="w-5 h-5" />
                        </Button>} />
                      <TooltipContent>Fayl biriktirish</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <Button 
                      onClick={handleSend}
                      disabled={(!input.trim() && attachedFiles.length === 0) || isGenerating}
                      className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 transition-all"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                Saboq AI • O'zbekiston uchun maxsus
              </p>
            </div>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
