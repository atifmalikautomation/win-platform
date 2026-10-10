import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User, CheckCircle2, ShieldAlert } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function AuthModal({ isOpen, onClose, initialMode = 'login', onAuthSuccess }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Login State
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setIsAdminMode(false);
      setUsername('');
      setEmail('');
      setPassword('');
      setError('');
      setShowGooglePrompt(false);
      setGoogleEmailInput('');

      // If Google Client ID is configured, initialize Google One-Tap / GIS
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (clientId && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false
          });
        } catch (e) {
          console.warn('Google Identity Services initialization:', e.message);
        }
      }
    }
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  // Unified Session Saver (Remote + Local Persistence)
  const saveUserSession = (data, userPassword = '') => {
    if (!data || !data.user) return;
    localStorage.setItem('luckywin_token', data.token);
    const nowIso = new Date().toISOString();
    const userWithMeta = {
      ...data.user,
      lastLogin: data.user.lastLogin || nowIso,
      authProvider: data.user.authProvider || (data.user.email?.includes('@gmail.com') ? 'google' : 'email')
    };
    localStorage.setItem('luckywin_active_user', JSON.stringify(userWithMeta));



    if (onAuthSuccess) {
      onAuthSuccess(userWithMeta);
    }
    onClose();
  };

  // Google Identity Services Credential Handler (JWT id_token)
  const handleGoogleCredentialResponse = async (response) => {
    if (!response?.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }
      saveUserSession(data);
    } catch (err) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Click handler for "Continue with Google"
  const handleGoogleClick = () => {
    setError('');
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (clientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setShowGooglePrompt(true);
          }
        });
        return;
      } catch (e) {
        console.warn('Google prompt fallback:', e.message);
      }
    }
    // Instant 1-Click Google Access Modal
    setShowGooglePrompt(true);
  };

  // Instant 1-Click Google Submission
  const handleGoogleInstantSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = googleEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid Google Gmail address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanEmail.split('@')[0]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }
      saveUserSession(data);
    } catch (err) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Standard Username / Password Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const isAttemptingAdmin = cleanUsername.toLowerCase() === 'saqib_admin' ||
      cleanUsername.toLowerCase() === '60secscriptdoc@gmail.com' ||
      cleanUsername.toLowerCase().includes('admin');

    if (!isAdminMode && isAttemptingAdmin) {
      setError('Admin accounts must use the "Admin login" option below.');
      return;
    }

    if (mode === 'register' && !isAdminMode) {
      if (!USERNAME_RE.test(cleanUsername)) {
        setError('Username must be 3–20 characters: letters, numbers, _ or .');
        return;
      }
      if (!EMAIL_RE.test(cleanEmail)) {
        setError('Please enter a valid email address');
        return;
      }
      if (cleanPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { identifier: cleanUsername, password: cleanPassword, portal: isAdminMode ? 'admin' : 'player' }
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
        if (res.status === 429) {
          const parsed = contentType && contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
          serverError = parsed.error || 'Too many attempts. Please wait a few minutes and try again.';
        } else if (contentType && contentType.includes('application/json')) {
          const parsed = await res.json();
          if (res.ok) {
            data = parsed;
          } else {
            serverError = parsed.error || 'Authentication failed';
          }
        } else {
          serverError = 'Server is not responding. Please try again.';
        }
      } catch (fetchErr) {
        serverError = 'Network error — please check your connection';
      }

      // If remote server succeeded, persist user session
      if (data && data.user) {
        saveUserSession(data, cleanPassword);
        return;
      }

      throw new Error(serverError || 'Authentication failed');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };


  const inputCls = 'w-full bg-[#141516] border border-white/10 focus:border-[#e50539] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet relative w-full sm:max-w-md p-6 sm:p-7 rounded-t-2xl sm:rounded-2xl bg-[#1b1c1d] border border-white/10 shadow-2xl overflow-hidden max-h-[94vh] overflow-y-auto"
      >
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-24 bg-[#e50539]/20 blur-3xl pointer-events-none" />

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center mb-5">
          <img src="/aviator_plane.png" alt="" className="w-14 h-auto mx-auto mb-2" />
          <h2 id="auth-title" className="font-heading font-black text-2xl text-white tracking-tight">
            {isAdminMode ? 'Admin login' : (mode === 'login' ? 'Welcome back' : 'Create your account')}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {isAdminMode ? 'Authorized staff only' : (mode === 'login' ? 'Log in to play Aviator' : 'It takes less than a minute')}
          </p>
        </div>

        {!isAdminMode && (
          <div role="tablist" className="grid grid-cols-2 p-1 mb-4 rounded-xl bg-[#141516] border border-white/[0.06]">
            {[{ id: 'login', label: 'Log in' }, { id: 'register', label: 'Sign up' }].map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => { setMode(t.id); setError(''); setShowGooglePrompt(false); }}
                className={`py-2 text-sm font-bold rounded-lg transition-colors ${mode === t.id ? 'bg-[#2c2d30] text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'register' && !isAdminMode && (
          <div className="mb-4 p-3 rounded-xl bg-[#141516] border border-white/[0.06] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#5fd23b] shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Deposits and withdrawals in PKR via Easypaisa, reviewed manually. You must be 18 or older to play.
            </p>
          </div>
        )}

        {isAdminMode && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Admin portal</span>
            </div>
            <button
              type="button"
              onClick={() => { setIsAdminMode(false); setUsername(''); setPassword(''); setError(''); }}
              className="text-zinc-400 hover:text-white text-[11px] underline"
            >
              Back to player login
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-[#e50539]/10 border border-[#e50539]/30 flex items-center gap-2 text-rose-200 text-xs font-medium">
            <ShieldAlert className="w-4 h-4 text-[#ff4d6d] shrink-0" />
            {error}
          </div>
        )}

        {!isAdminMode && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-sm flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              <span>{mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}</span>
            </button>
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-white/10 w-full" />
              <span className="absolute bg-[#1b1c1d] px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">or</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          <div>
            <label htmlFor="auth-user" className="block text-xs font-semibold text-zinc-400 mb-1.5">
              {mode === 'login' ? 'Username or email' : 'Username'}
            </label>
            <div className="relative">
              <input
                id="auth-user"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                maxLength={mode === 'register' ? 20 : 100}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'login' ? 'Enter username or email' : 'e.g. ali_khan'}
                className={inputCls}
              />
              <User className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            {mode === 'register' && !isAdminMode && (
              <p className="text-[11px] text-zinc-500 mt-1">3–20 characters: letters, numbers, _ or .</p>
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-zinc-400 mb-1.5">Email</label>
              <div className="relative">
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
                <Mail className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-pass" className="block text-xs font-semibold text-zinc-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                id="auth-pass"
                type="password"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
              <Lock className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            {mode === 'register' && !isAdminMode && (
              <p className="text-[11px] text-zinc-500 mt-1">At least 6 characters.</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-1 py-3.5 text-sm">
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {mode === 'register' && (
            <p className="text-[11px] text-zinc-500 text-center">By creating an account you confirm you are 18+.</p>
          )}
        </form>

        {!isAdminMode && mode === 'login' && (
          <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
            <button
              type="button"
              onClick={() => { setIsAdminMode(true); setUsername(''); setPassword(''); setError(''); setShowGooglePrompt(false); }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 hover:text-amber-300"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Admin login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
