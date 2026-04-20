import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  loadCaptchaEnginge, 
  LoadCanvasTemplate, 
  validateCaptcha 
} from 'react-simple-captcha';
import { Mail, Lock, User, Chrome, Loader2, ShieldCheck, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Auth({ initialMode = 'login', onSuccess }: { initialMode?: 'login' | 'signup', onSuccess?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (type: 'login' | 'signup') => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (type === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        await sendEmailVerification(userCredential.user);
        setMessage("Ro'yxatdan o'tdingiz! Iltimos, emailingizni tasdiqlang.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card className="border-none shadow-[0_40px_80px_rgba(0,0,0,0.1)] rounded-[3.5rem] overflow-hidden bg-white/95 backdrop-blur-3xl">
          <Tabs defaultValue={initialMode} className="w-full">
            <div className="flex flex-col md:flex-row">
              {/* Left Side: Branding */}
              <div className="hidden md:flex flex-col justify-between w-[40%] bg-gradient-to-br from-indigo-600 to-violet-700 p-12 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent)]" />
                </div>
                
                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-8">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-4xl font-black tracking-tight mb-4 leading-tight">Kelajak ta'limi bugundan boshlanadi</h2>
                  <p className="text-indigo-100 text-lg font-medium opacity-80">Wisdom AI bilan bilimlaringizni yangi bosqichga olib chiqing.</p>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex -space-x-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-indigo-500 bg-indigo-400 flex items-center justify-center text-[10px] font-bold">
                        {i}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm font-bold opacity-70">1000+ foydalanuvchilar</span>
                </div>
              </div>

              {/* Right Side: Form */}
              <div className="flex-1 p-10 md:p-14 relative">
                <div className="flex justify-end mb-12">
                  <TabsList className="bg-slate-100/50 p-1 rounded-2xl gap-1">
                    <TabsTrigger 
                      value="login" 
                      className="rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                    >
                      Kirish
                    </TabsTrigger>
                    <TabsTrigger 
                      value="signup" 
                      className="rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                    >
                      Ro'yxatdan o'tish
                    </TabsTrigger>
                  </TabsList>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-8 p-5 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-2xl flex items-center gap-3"
                    >
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="font-bold">{error}</span>
                    </motion.div>
                  )}
                  {message && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-8 p-5 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[13px] rounded-2xl flex items-center gap-3"
                    >
                      <ShieldCheck className="w-5 h-5 shrink-0" />
                      <span className="font-bold">{message}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <TabsContent value="login" className="space-y-8 mt-0 outline-none">
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email manzili</Label>
                    <div className="relative group">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="example@gmail.com" 
                        className="h-16 pl-16 rounded-[1.5rem] border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all text-base font-medium"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Parol</Label>
                    <div className="relative group">
                      <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                      <Input 
                        id="password" 
                        type="password" 
                        placeholder="••••••••"
                        className="h-16 pl-16 rounded-[1.5rem] border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all text-base font-medium"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full h-16 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-[1.5rem] font-black text-lg shadow-2xl shadow-indigo-200 transition-all active:scale-[0.98] group"
                    onClick={() => handleEmailAuth('login')}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                      <span className="flex items-center gap-2">
                        Tizimga kirish <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    )}
                  </Button>
                </TabsContent>

                <TabsContent value="signup" className="space-y-8 mt-0 outline-none">
                  <div className="space-y-3">
                    <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">To'liq ismingiz</Label>
                    <div className="relative group">
                      <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                      <Input 
                        id="name" 
                        placeholder="Ismingizni kiriting" 
                        className="h-16 pl-16 rounded-[1.5rem] border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all text-base font-medium"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="signup-email" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email manzili</Label>
                    <div className="relative group">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                      <Input 
                        id="signup-email" 
                        type="email" 
                        placeholder="example@gmail.com" 
                        className="h-16 pl-16 rounded-[1.5rem] border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all text-base font-medium"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="signup-password" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Yangi parol</Label>
                    <div className="relative group">
                      <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                      <Input 
                        id="signup-password" 
                        type="password" 
                        placeholder="••••••••"
                        className="h-16 pl-16 rounded-[1.5rem] border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all text-base font-medium"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full h-16 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-[1.5rem] font-black text-lg shadow-2xl shadow-indigo-200 transition-all active:scale-[0.98] group"
                    onClick={() => handleEmailAuth('signup')}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                      <span className="flex items-center gap-2">
                        Ro'yxatdan o'tish <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    )}
                  </Button>
                </TabsContent>

                <div className="mt-12 space-y-8">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-100"></span>
                    </div>
                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                      <span className="bg-white px-6">Yoki</span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full h-16 rounded-[1.5rem] border-slate-100 hover:bg-slate-50 font-black text-slate-700 gap-4 transition-all active:scale-[0.98] shadow-sm"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                  >
                    <Chrome className="w-5 h-5 text-indigo-600" />
                    Google orqali davom etish
                  </Button>
                </div>
              </div>
            </div>
          </Tabs>
        </Card>
      </motion.div>
    </div>
  );
}
