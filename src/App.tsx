/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, User, Bot, Sparkles, Loader2, Search, FileText, Globe, 
  Plus, History, Paperclip, Image as ImageIcon, Square, Trash2, 
  Menu, X, MessageSquare, ChevronRight, LogOut, ShieldCheck, AlertCircle
} from 'lucide-react';
import { generateStreamingResponse, generateImage, FileData } from '@/src/lib/gemini';
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
import { auth, db } from '@/src/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  serverTimestamp,
  getDocs,
  limit,
  getDocFromCache,
  getDocFromServer
} from 'firebase/firestore';
import Auth from './components/Auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Kechirasiz, xatolik yuz berdi.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '');
        if (parsed.error && parsed.error.includes('permissions')) {
          displayMessage = "Sizda ushbu amalni bajarish uchun ruxsat yo'q. Iltimos, qaytadan tizimga kiring.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{displayMessage}</h2>
          <p className="text-slate-500 mb-8 max-w-md">Tizimda kutilmagan xatolik yuz berdi. Muammo davom etsa, iltimos biz bilan bog'laning.</p>
          <Button onClick={() => window.location.reload()} className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl px-8 h-12 font-bold">
            Sahifani yangilash
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  files?: FileData[];
  imageUrl?: string;
  timestamp?: any;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
}

const STATUS_MESSAGES = [
  "Javob tayyorlanmoqda...",
  "O'ylayapman...",
  "Ma'lumotni tahlil qilyapman...",
  "Siz uchun javob yozyapman...",
];

const SaboqLogo = ({ isGenerating, className }: { isGenerating: boolean, className?: string }) => {
  return (
    <motion.div
      animate={isGenerating ? {
        rotate: 360,
      } : {}}
      transition={isGenerating ? {
        duration: 3,
        repeat: Infinity,
        ease: "linear"
      } : {}}
      className={cn(
        "relative flex items-center justify-center rounded-2xl bg-white shadow-xl shadow-indigo-500/10 overflow-hidden",
        className || "w-12 h-12"
      )}
    >
      <svg viewBox="0 0 100 100" className="w-10 h-10">
        <defs>
          <linearGradient id="swirlGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#9333ea" />
          </linearGradient>
        </defs>
        <motion.path
          d="M50 10 C 70 10, 90 30, 90 50 C 90 70, 70 90, 50 90 C 30 90, 10 70, 10 50 C 10 30, 30 10, 50 10 Z M50 25 C 65 25, 75 35, 75 50 C 75 65, 65 75, 50 75 C 35 75, 25 65, 25 50 C 25 35, 35 25, 50 25 Z"
          fill="url(#swirlGrad)"
          animate={isGenerating ? {
            scale: [1, 1.1, 1],
            opacity: [0.8, 1, 0.8],
          } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.path
          d="M50 35 Q 65 35, 65 50 T 50 65 Q 35 65, 35 50 T 50 35"
          fill="white"
          animate={isGenerating ? {
            scale: [0.8, 1.2, 0.8],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </svg>
      {isGenerating && (
        <div className="absolute inset-0 bg-indigo-500/10 animate-pulse" />
      )}
    </motion.div>
  );
};

export default function App() {
  const [user, userLoading] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileData[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  // Local cache for objects that are too large for Firestore (like images)
  const localCacheRef = useRef<Record<string, Partial<Message>>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<boolean>(false);

  // Fetch sessions from Firestore
  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sess = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatSession[];
      setSessions(sess);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions`);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch messages when session changes
  useEffect(() => {
    if (!user) return; // Keep local messages for unauthenticated

    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    // When a session is selected, we clear messages if it's not an optimistic start
    // (i.e., we are switching chats, not just starting one)
    setMessages(prev => {
      // If we're starting a new chat (isGenerating is true and we have messages),
      // we don't want to clear the optimistic user message.
      if (isGenerating && prev.length > 0) return prev;
      return [];
    });

    const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data() as Message;
        const cached = localCacheRef.current[doc.id];
        
        // Re-attach cached data (like imageUrl or files) if missing from Firestore doc
        return {
          id: doc.id,
          ...data,
          ...(cached || {})
        };
      }) as Message[];
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions/${currentSessionId}/messages`);
    });

    return () => unsubscribe();
  }, [user, currentSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating, status]);

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setAttachedFiles([]);
    setIsSidebarOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setIsSidebarOpen(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'sessions', id));
      if (currentSessionId === id) {
        startNewChat();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/sessions/${id}`);
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

    const currentInput = input;
    const currentFiles = [...attachedFiles];
    
    // Clear input immediately for better UX
    setInput('');
    setAttachedFiles([]);
    setIsGenerating(true);
    abortControllerRef.current = false;

    let sessionId = currentSessionId;
    
    // Create session if it doesn't exist and user is logged in
    if (!sessionId && user) {
      try {
        const title = currentInput.slice(0, 30) + (currentInput.length > 30 ? '...' : '');
        const sessionRef = await addDoc(collection(db, 'users', user.uid, 'sessions'), {
          title: title || (currentFiles.length > 0 ? 'Fayl yuborildi' : 'Yangi suhbat'),
          timestamp: Date.now()
        });
        sessionId = sessionRef.id;
        setCurrentSessionId(sessionId);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/sessions`);
        setIsGenerating(false);
        setInput(currentInput); // Restore input on error
        return;
      }
    }

    const userMessage: Message = { 
      role: 'user', 
      content: currentInput,
      timestamp: Date.now()
    };
    if (currentFiles.length > 0) {
      userMessage.files = [...currentFiles];
    }
    
    // Optimistic update for immediate feedback
    setMessages(prev => [...prev, userMessage]);

    // Save user message to Firestore (don't await to speed up AI start)
    if (user && sessionId) {
      const firestoreUserMessage: any = { ...userMessage };
      const estimatedSize = JSON.stringify(firestoreUserMessage).length;

      if (estimatedSize > 1000000) {
        delete firestoreUserMessage.files;
        firestoreUserMessage.content += "\n\n*(Eslatma: Biriktirilgan fayllar hajmi juda katta bo'lgani uchun tarixda saqlanmadi)*";
      }

      addDoc(collection(db, 'users', user.uid, 'sessions', sessionId, 'messages'), firestoreUserMessage)
        .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/sessions/${sessionId}/messages`));
    }
    
    // Context-aware status messages
    const statusInterval = setInterval(() => {
      const pool = currentFiles.length > 0 
        ? ["Fayllarni tahlil qilmoqdaman...", "Javob yozilmoqda...", "Tayyor..."]
        : ["Tayyorlanmoqda...", "Yozilmoqda...", "O'ylayapman..."];
      setStatus(pool[Math.floor(Math.random() * pool.length)]);
    }, 1000);
    
    setStatus(currentFiles.length > 0 ? "Fayllar o'qilmoqda..." : "Tayyorlanmoqda...");

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API kaliti topilmadi. Iltimos, AI Studio sozlamalaridan (Secrets paneli) GEMINI_API_KEY o'rnatilganligini tekshiring.");
      }

      // Enhanced image generation request detection (Uzbek-friendly)
      const inputLower = currentInput.toLowerCase();
      const hasImageFocus = inputLower.includes('rasm') || inputLower.includes('tasvir') || inputLower.includes('rasim') || inputLower.includes('surat');
      const hasCreateAction = inputLower.includes('chiz') || inputLower.includes('yarat') || inputLower.includes('generate') || inputLower.includes('tayyorla') || inputLower.includes('ko\'rsat') || inputLower.includes('ber');
      
      const isImageRequest = (hasImageFocus && hasCreateAction) || inputLower.includes('paint') || inputLower.includes('draw');

      if (isImageRequest) {
        setStatus("🎨 Nano Banana 2 rasm chizmoqda...");
        const result = await generateImage(currentInput);
        
        if (result.error) throw new Error(result.error);
        
        const assistantMessage: Message = {
          role: 'assistant',
          content: result.text || "Mana, so'ragan rasmingiz:",
          imageUrl: result.imageUrl,
          timestamp: Date.now()
        };

        if (user && sessionId) {
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Prepare message for Firestore (exclude imageUrl if it's too large for 1MB document limit)
          const firestoreMessage: any = { ...assistantMessage };
          const estimatedSize = JSON.stringify(firestoreMessage).length;
          
          let isStripped = false;
          if (estimatedSize > 1000000) { // ~1MB limit
            isStripped = true;
            delete firestoreMessage.imageUrl;
            firestoreMessage.content += "\n\n*(Eslatma: Rasm hajmi juda katta bo'lgani uchun tarixda saqlanmadi)*";
            
            // Store the original in local cache for the current session
            localCacheRef.current[messageId] = { imageUrl: assistantMessage.imageUrl };
          }

          setDoc(doc(db, 'users', user.uid, 'sessions', sessionId, 'messages', messageId), firestoreMessage)
            .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/sessions/${sessionId}/messages/${messageId}`));
          
          // If we stripped it, we MUST update state manually because onSnapshot won't have the image
          // But even if we didn't, setMessages here provides immediate feedback
          setMessages(prev => [...prev, { ...assistantMessage, id: messageId }]);
        } else {
          setMessages(prev => [...prev, assistantMessage]);
        }
        return;
      }

      // Prepare history from CURRENT messages list (including optimistic one)
      const history = messages.concat(userMessage).map(m => {
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
      setStreamingContent('');
      const stream = generateStreamingResponse(currentInput, history.slice(0, -1), currentFiles, user?.displayName || undefined);
      
      for await (const chunk of stream) {
        if (abortControllerRef.current) break;
        assistantContent += chunk;
        setStreamingContent(assistantContent);
      }
      
      // Save assistant message to Firestore
      if (assistantContent && !abortControllerRef.current) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now()
        };

        // Add to local state immediately to avoid the "freeze" while waiting for Firestore/onSnapshot
        setMessages(prev => [...prev, assistantMessage]);
        setStreamingContent('');

        if (user && sessionId) {
          addDoc(collection(db, 'users', user.uid, 'sessions', sessionId, 'messages'), assistantMessage)
            .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/sessions/${sessionId}/messages`));
        }
      } else {
        setStreamingContent('');
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.";
      const errorMsg: Message = {
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now()
      };

      if (user && sessionId) {
        await addDoc(collection(db, 'users', user.uid, 'sessions', sessionId, 'messages'), errorMsg);
      } else {
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      clearInterval(statusInterval);
      setIsGenerating(false);
      setStatus('');
    }
  };

  if (userLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
      <div className="flex h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-indigo-100 overflow-hidden">
        
        {showAuth && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-4xl">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowAuth(false)}
                className="absolute -top-12 right-0 text-white hover:bg-white/20 rounded-full"
              >
                <X className="w-6 h-6" />
              </Button>
              <Auth initialMode={authMode} onSuccess={() => setShowAuth(false)} />
            </div>
          </div>
        )}
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-80 bg-white border-r border-slate-100 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
          <div className="p-6 space-y-4">
            {!user && (
              <div className="p-5 rounded-[2rem] bg-indigo-50 border border-indigo-100 space-y-3">
                <div className="flex items-center gap-2 text-indigo-600">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">Tizimga kiring</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Suhbatlar tarixini saqlash va barcha imkoniyatlardan foydalanish uchun tizimga kiring.
                </p>
                <Button 
                  onClick={() => { setAuthMode('login'); setShowAuth(true); }}
                  className="w-full h-10 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-all"
                >
                  Kirish
                </Button>
              </div>
            )}
            <Button 
              onClick={startNewChat}
              className="w-full h-12 justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] font-bold"
            >
              <Plus className="w-4 h-4" />
              Yangi suhbat
            </Button>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-1 py-2">
              <div className="flex items-center justify-between px-3 mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Suhbatlar</h3>
                <Badge variant="outline" className="text-[9px] font-bold border-slate-100 text-slate-400">{sessions.length}</Badge>
              </div>
              {sessions.map(session => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={session.id}
                  onClick={() => loadSession(session)}
                  className={cn(
                    "group flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-pointer transition-all relative overflow-hidden",
                    currentSessionId === session.id 
                      ? "bg-indigo-50/50 text-indigo-700 shadow-sm" 
                      : "hover:bg-slate-50 text-slate-600"
                  )}
                >
                  {currentSessionId === session.id && (
                    <motion.div 
                      layoutId="active-pill"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full"
                    />
                  )}
                  <MessageSquare className={cn("w-4 h-4 shrink-0 transition-colors", currentSessionId === session.id ? "text-indigo-600" : "opacity-40")} />
                  <span className="text-sm font-bold truncate flex-1">{session.title}</span>
                  <button 
                    onClick={(e) => deleteSession(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
              {sessions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
                    <History className="w-5 h-5 text-slate-200" />
                  </div>
                  <p className="text-xs text-slate-400 font-medium italic">Hali chatlar yo'q</p>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="p-6 border-t border-slate-50 space-y-6">
            {user && (
              <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-black">
                    {user.displayName?.slice(0, 2).toUpperCase() || user.email?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{user.displayName || 'Saboqdoshi'}</p>
                  <p className="text-[10px] text-slate-400 font-bold truncate">{user.email}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => auth.signOut()} className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl">
                      <LogOut className="w-4 h-4" />
                    </Button>} />
                  <TooltipContent>Chiqish</TooltipContent>
                </Tooltip>
              </div>
            )}
            <div className="flex items-center justify-between px-2">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">Saboq AI v2.0</p>
              <div className="flex gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="w-1 h-1 rounded-full bg-slate-200" />
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Header */}
          <header className="flex items-center justify-between px-8 py-5 bg-white/70 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-20">
            <div className="flex items-center gap-4">
              <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
                <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden rounded-2xl bg-slate-50">
                    <Menu className="w-5 h-5 text-slate-600" />
                  </Button>} />
                <SheetContent side="left" className="w-80 p-0 flex flex-col border-none">
                  <SheetHeader className="p-6 border-b border-slate-50">
                    <SheetTitle className="text-left flex items-center gap-3 font-black tracking-tight">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
                        <History className="w-4 h-4 text-white" />
                      </div>
                      Suhbatlar tarixi
                    </SheetTitle>
                  </SheetHeader>
                  <div className="p-6">
                    <Button onClick={startNewChat} className="w-full h-12 gap-2 bg-indigo-600 rounded-2xl font-bold shadow-lg shadow-indigo-100">
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
                            "flex items-center gap-3 px-4 py-4 rounded-2xl cursor-pointer transition-all",
                            currentSessionId === session.id ? "bg-indigo-50 text-indigo-700 shadow-sm" : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          <MessageSquare className={cn("w-4 h-4 shrink-0", currentSessionId === session.id ? "text-indigo-600" : "opacity-40")} />
                          <span className="text-sm font-bold truncate flex-1">{session.title}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              
              <SaboqLogo isGenerating={isGenerating} />
              <div>
                <h1 className="text-2xl font-black tracking-tighter text-slate-900">Saboq AI</h1>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                      {isGenerating ? 'Yozmoqda...' : 'Online'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1 mr-2 ml-2">
                <Badge variant="outline" className="text-[9px] font-black border-slate-100 text-slate-400 px-2 py-1">UZB</Badge>
                <Badge variant="outline" className="text-[9px] font-black border-slate-100 text-slate-400 px-2 py-1">ENG</Badge>
                <Badge variant="outline" className="text-[9px] font-black border-slate-100 text-slate-400 px-2 py-1">RUS</Badge>
              </div>
              
              {!user ? (
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    onClick={() => { setAuthMode('login'); setShowAuth(true); }}
                    className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl px-5 h-11 transition-all"
                  >
                    Kirish
                  </Button>
                  <Button 
                    onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl px-6 h-11 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                  >
                    Ro'yxatdan o'tish
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="hidden lg:flex flex-col items-end mr-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Xush kelibsiz</span>
                    <span className="text-sm font-bold text-slate-900">{user.displayName || 'Foydalanuvchi'}</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => auth.signOut()} className="rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                        <LogOut className="w-5 h-5" />
                      </Button>} />
                    <TooltipContent>Chiqish</TooltipContent>
                  </Tooltip>
                </div>
              )}
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
                      <SaboqLogo isGenerating={false} />
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute -inset-4 bg-indigo-100/50 rounded-full blur-2xl -z-10"
                      />
                    </div>
                    <div className="space-y-3">
                      <h2 className="text-5xl font-black tracking-tight text-slate-900">
                        {user ? `Salom, ${user.displayName || 'Foydalanuvchi'}!` : 'Saboq berishga tayyorman!'}
                      </h2>
                      <p className="text-slate-500 max-w-md mx-auto text-lg font-medium leading-relaxed">
                        Men sizning shaxsiy yordamchingizman. Savol bering, rasm tashlang yoki fayllarni tahlil qilishni so'rang.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                      {[
                        { icon: ImageIcon, text: 'Ushbu rasmni tasvirlab ber', color: 'text-blue-500', bg: 'bg-blue-50' },
                        { icon: Globe, text: 'Ingliz tilida suhbatlashamiz', color: 'text-emerald-500', bg: 'bg-emerald-50' },
                        { icon: FileText, text: 'PDF faylni tahlil qil', color: 'text-orange-500', bg: 'bg-orange-50' },
                        { icon: Sparkles, text: 'Menga qiziqarli fakt ayt', color: 'text-purple-500', bg: 'bg-purple-50' }
                      ].map((item) => (
                        <Button 
                          key={item.text}
                          variant="outline" 
                          className="group justify-start h-auto py-5 px-6 text-left border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 transition-all rounded-[1.5rem] bg-white/50 backdrop-blur-sm"
                          onClick={() => setInput(item.text)}
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mr-4 transition-transform group-hover:scale-110", item.bg)}>
                            <item.icon className={cn("w-5 h-5", item.color)} />
                          </div>
                          <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{item.text}</span>
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
                      {message.role === 'user' ? (
                        <Avatar className={cn(
                          "w-10 h-10 border-2 shadow-sm shrink-0 border-indigo-100"
                        )}>
                          <AvatarFallback className="bg-indigo-600 text-white"><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                      ) : (
                        <SaboqLogo isGenerating={false} className="w-10 h-10 shrink-0" />
                      )}
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
                          "px-6 py-4 rounded-[1.5rem] text-[15px] leading-relaxed shadow-sm",
                          message.role === 'user' 
                            ? "bg-indigo-600 text-white rounded-tr-none shadow-indigo-200" 
                            : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                        )}>
                          {message.imageUrl && (
                            <div className="mb-3 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                              <img 
                                src={message.imageUrl} 
                                alt="Generated" 
                                className="w-full max-h-[400px] object-contain bg-slate-50"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          )}
                          {message.role === 'assistant' ? (
                            <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-strong:text-slate-900 prose-headings:text-slate-900">
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
                            <p className="whitespace-pre-wrap font-bold">{message.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] mt-2 text-slate-400 font-bold uppercase tracking-widest px-1">
                          {message.role === 'user' ? 'Siz' : 'Saboq'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isGenerating && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                    <SaboqLogo isGenerating={true} />
                    <div className="flex flex-col gap-3 max-w-[85%]">
                      <div className="bg-white border border-slate-100 text-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm min-w-[100px]">
                        {streamingContent ? (
                          <div className="prose prose-slate max-w-none prose-p:leading-relaxed">
                            <ReactMarkdown>{streamingContent}</ReactMarkdown>
                            <motion.span 
                              animate={{ opacity: [1, 0, 1] }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                              className="inline-block w-2 h-5 bg-indigo-600 ml-1 translate-y-1"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            <span className="text-sm text-slate-500 font-bold italic tracking-tight">{status}</span>
                          </div>
                        )}
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
          <footer className="p-8 bg-gradient-to-t from-[#fafafa] via-[#fafafa] to-transparent z-20">
            <div className="max-w-3xl mx-auto">
              <Card className="relative p-2 border-none shadow-[0_20px_50px_rgba(0,0,0,0.08)] rounded-[2.5rem] bg-white/90 backdrop-blur-xl overflow-hidden">
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50/50 rounded-3xl mb-2">
                    {attachedFiles.map((file, i) => (
                      <div key={i} className="relative group/thumb">
                        {file.mimeType.startsWith('image/') ? (
                          <img 
                            src={`data:${file.mimeType};base64,${file.data}`} 
                            alt="Thumb" 
                            className="w-14 h-14 object-cover rounded-2xl border-2 border-white shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-14 flex items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                            <FileText className="w-6 h-6 text-indigo-500" />
                          </div>
                        )}
                        <button 
                          onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-end gap-2 px-2 py-1">
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,.pdf,.txt,.doc,.docx"
                  />
                  <Tooltip>
                    <TooltipTrigger render={<Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-12 w-12 shrink-0 rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="w-5 h-5" />
                      </Button>} />
                    <TooltipContent>Fayl biriktirish</TooltipContent>
                  </Tooltip>

                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Saboqdan biror nima so'rang..."
                    className="flex-1 min-h-[48px] max-h-40 py-3 bg-transparent border-none focus-visible:ring-0 resize-none text-[15px] font-bold placeholder:text-slate-400"
                    rows={1}
                  />

                  <Button 
                    onClick={handleSend}
                    disabled={(!input.trim() && attachedFiles.length === 0) || isGenerating}
                    className={cn(
                      "h-12 w-12 shrink-0 rounded-2xl transition-all active:scale-90 shadow-lg",
                      input.trim() || attachedFiles.length > 0
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200" 
                        : "bg-slate-100 text-slate-300 shadow-none"
                    )}
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </div>
              </Card>
              <p className="text-center text-[10px] mt-4 text-slate-400 font-black uppercase tracking-[0.3em]">
                Saboq AI • O'zbekiston uchun maxsus
              </p>
            </div>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  </ErrorBoundary>
  );
}
