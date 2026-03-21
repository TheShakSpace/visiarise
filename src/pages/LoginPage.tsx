import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Github, Chrome, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../constants/demo';
import AuthSplitLayout from '../components/AuthSplitLayout';

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

  const continueAsDemo = () => {
    setUser({
      id: 'visiarise-demo-user',
      email: DEMO_EMAIL,
      name: 'Demo Creator',
    });
    navigate('/dashboard');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const local = email.trim().toLowerCase().split('@')[0] || 'Creator';
    setUser({
      id: 'user-' + (email.trim() || 'local'),
      email: email.trim() || DEMO_EMAIL,
      name: local.charAt(0).toUpperCase() + local.slice(1),
    });
    navigate('/dashboard');
  };

  return (
    <AuthSplitLayout
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Pick up where you left off — projects, AR Studio, and marketplace stay in sync on this device."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/35 ml-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400/40" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full bg-black/40 border border-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/30 transition-all"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/35">Password</label>
            <Link
              to="/forgot-password"
              className="text-[10px] font-bold uppercase tracking-widest text-violet-400 hover:text-violet-300 transition-colors"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400/40" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-black/40 border border-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/30 transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full mt-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold py-3.5 text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all"
        >
          Sign in
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] p-4 space-y-3">
          <div className="flex items-center gap-2 text-violet-200/90">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">Try instantly</span>
          </div>
          <button
            type="button"
            onClick={continueAsDemo}
            className="w-full rounded-xl bg-white text-black font-bold py-3 text-sm hover:bg-white/90 transition-colors"
          >
            Continue as demo account
          </button>
          <p className="text-[10px] text-white/40 text-center">
            Opens your dashboard as <span className="text-white/60">{DEMO_EMAIL}</span> — no password needed.
          </p>
          <button
            type="button"
            onClick={fillDemo}
            className="w-full text-[11px] font-medium text-violet-300/80 hover:text-violet-200 py-1 transition-colors"
          >
            Or fill demo email &amp; password for manual sign-in
          </button>
        </div>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.06]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#0c0618] px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
              Or continue with
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all text-xs font-semibold text-white/80"
          >
            <Chrome className="w-4 h-4" />
            Google
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all text-xs font-semibold text-white/80"
          >
            <Github className="w-4 h-4" />
            GitHub
          </button>
        </div>
      </form>

      <p className="text-center mt-8 text-sm text-white/40">
        New here?{' '}
        <Link to="/signup" className="text-violet-400 font-semibold hover:text-violet-300 transition-colors">
          Create an account
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
