import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, initialMode = 'login', onAuthSuccess }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setIsAdminMode(false);
      setUsername('');
      setPassword('');
      setError('');
    }
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { identifier: username, password }
        : { username, email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save token and invoke callback
      localStorage.setItem('luckywin_token', data.token);
      onAuthSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0e131f] border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-2xl shadow-blue-500/10">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tabs */}
        <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/80 mb-6">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              mode === 'register'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Registration
          </button>
        </div>

        {/* Welcome Bonus Callout */}
        {mode === 'register' && (
          <div className="mb-6 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-cyan-500/15 border border-emerald-500/30 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-300">🎉 500% Welcome Deposit Bonus</p>
              <p className="text-[11px] text-slate-300">+ PKR 1,500 instant play balance on sign up!</p>
            </div>
          </div>
        )}

        {/* Super Admin Access Banner */}
        {isAdminMode && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold font-heading">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>SUPER ADMIN PORTAL</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(false);
                setUsername('');
                setPassword('');
                setError('');
              }}
              className="text-slate-400 hover:text-white text-[11px] underline"
            >
              Back to Player
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-medium">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              {mode === 'login' ? 'Username or Email' : 'Username'}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'login' ? 'Enter username or email' : 'Choose a unique username'}
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors pl-11"
              />
              <User className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors pl-11"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors pl-11"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-xl shadow-blue-500/25 transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : mode === 'login' ? 'LOG IN TO ACCOUNT' : 'CREATE FREE ACCOUNT'}
          </button>
        </form>

        {/* Super Admin Secure Gateway (No auto-fill, manual entry only) */}
        {!isAdminMode && mode === 'login' && (
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(true);
                setUsername('');
                setPassword('');
                setError('');
              }}
              className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-heading font-black text-amber-400 flex items-center justify-center gap-2 transition-all"
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Super Admin Portal Login</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
