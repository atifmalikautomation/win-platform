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

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { identifier: cleanUsername, password: cleanPassword }
        : { username: cleanUsername, email: cleanEmail, password: cleanPassword };

      let data = null;
      let serverError = null;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const parsed = await res.json();
          if (res.ok) {
            data = parsed;
          } else {
            serverError = parsed.error || 'Authentication failed';
          }
        } else {
          serverError = 'Server communication error';
        }
      } catch (fetchErr) {
        serverError = fetchErr.message;
      }

      // If remote server succeeded, persist user in local cache for offline backup
      if (data && data.user) {
        localStorage.setItem('luckywin_token', data.token);
        localStorage.setItem('luckywin_active_user', JSON.stringify(data.user));

        const savedUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');
        const idx = savedUsers.findIndex(u => 
          u.id === data.user.id || 
          (u.username && u.username.trim().toLowerCase() === data.user.username.trim().toLowerCase()) ||
          (u.email && u.email.trim().toLowerCase() === (data.user.email || '').trim().toLowerCase())
        );

        const userToSave = {
          ...data.user,
          password: cleanPassword
        };

        if (idx !== -1) {
          savedUsers[idx] = { ...savedUsers[idx], ...userToSave };
        } else {
          savedUsers.unshift(userToSave);
        }
        localStorage.setItem('luckywin_local_users', JSON.stringify(savedUsers));

        if (onAuthSuccess) {
          onAuthSuccess(data.user);
        }
        onClose();
        return;
      }

      // If server returned an error, check if local storage can fulfill or if it's a real failure
      const savedUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');

      if (mode === 'login') {
        const cleanId = cleanUsername.toLowerCase();
        let userFound = savedUsers.find(u =>
          ((u.username && u.username.trim().toLowerCase() === cleanId) ||
           (u.email && u.email.trim().toLowerCase() === cleanId)) &&
          u.password === cleanPassword
        );

        // Support default demo and admin accounts
        if (!userFound && (cleanId === 'luckyplayer' || cleanId === 'player@example.com') && cleanPassword === 'user123') {
          userFound = {
            id: 'usr_demo',
            username: 'LuckyPlayer',
            email: 'player@example.com',
            role: 'user',
            balance: 0.0,
            bonusBalance: 0.0
          };
        } else if (!userFound && (cleanId === 'saqib_admin' || cleanId === '60secscriptdoc@gmail.com') && (cleanPassword === 'SkyWin#Saqib2026!' || cleanPassword === 'admin123')) {
          userFound = {
            id: 'usr_saqib_admin',
            username: 'saqib_admin',
            email: '60secscriptdoc@gmail.com',
            role: 'admin',
            balance: 100000.0,
            bonusBalance: 0.0
          };
        }

        if (userFound) {
          const localToken = `local_token_${userFound.id}`;
          localStorage.setItem('luckywin_token', localToken);
          localStorage.setItem('luckywin_active_user', JSON.stringify(userFound));

          // Background sync to server so server learns about this local account
          fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: userFound.username,
              email: userFound.email || `${userFound.username}@player.skywin`,
              password: cleanPassword
            })
          }).catch(() => {});

          if (onAuthSuccess) {
            onAuthSuccess(userFound);
          }
          onClose();
          return;
        }

        throw new Error(serverError || 'Invalid username or password');
      } else {
        // mode === 'register'
        if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters');
        if (cleanPassword.length < 4) throw new Error('Password must be at least 4 characters');
        if (savedUsers.some(u => u.username && u.username.trim().toLowerCase() === cleanUsername.toLowerCase())) {
          throw new Error('Username already taken');
        }
        if (savedUsers.some(u => u.email && u.email.trim().toLowerCase() === cleanEmail)) {
          throw new Error('Email already registered');
        }

        const newUser = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          username: cleanUsername,
          email: cleanEmail,
          password: cleanPassword,
          role: cleanUsername.toLowerCase().includes('admin') ? 'admin' : 'user',
          balance: 0.0,
          bonusBalance: 0.0,
          createdAt: new Date().toISOString()
        };

        savedUsers.unshift(newUser);
        localStorage.setItem('luckywin_local_users', JSON.stringify(savedUsers));
        localStorage.setItem('luckywin_token', `local_token_${newUser.id}`);
        localStorage.setItem('luckywin_active_user', JSON.stringify(newUser));

        if (onAuthSuccess) {
          onAuthSuccess(newUser);
        }
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#161d2d] to-[#0d121d] border border-[#232f48] shadow-2xl overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-[#1a68ff]/20 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1a68ff]/20 border border-[#1a68ff]/30 text-[#1a68ff] mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-heading font-black text-2xl text-white tracking-tight">
            {isAdminMode ? 'SkyWin Admin' : (mode === 'login' ? 'Welcome Back' : 'Create Account')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdminMode ? 'Enter authorized credentials' : (mode === 'login' ? 'Login to continue playing' : 'Join thousands of real players in Pakistan')}
          </p>
        </div>

        {/* Header Tabs */}
        <div className="flex p-1 mb-6 rounded-2xl bg-[#0b0e17] border border-[#1c2436]">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold font-heading rounded-xl transition-all ${
              mode === 'login'
                ? 'bg-[#1a68ff] text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold font-heading rounded-xl transition-all ${
              mode === 'register'
                ? 'bg-[#1a68ff] text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Registration
          </button>
        </div>

        {/* Registration Account Info Badge */}
        {mode === 'register' && (
          <div className="mb-6 p-3.5 rounded-2xl bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-purple-500/15 border border-blue-500/30 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-300">Official Player Account</p>
              <p className="text-[11px] text-slate-300">Fast deposits & 24/7 withdrawals via JazzCash, EasyPaisa & Bank</p>
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
