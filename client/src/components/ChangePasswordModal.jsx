import React, { useEffect, useState } from 'react';
import { X, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ChangePasswordModal({ isOpen, onClose, onSessionInvalid }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setCurrent(''); setNext(''); setConfirm(''); setMsg(null);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) return setMsg({ type: 'error', text: 'New password must be at least 6 characters' });
    if (next !== confirm) return setMsg({ type: 'error', text: 'New passwords do not match' });
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('luckywin_token')}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && !/current|incorrect|wrong/i.test(data.error || '')) {
        onSessionInvalid?.('Your session has expired. Please log in again.');
        return;
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setMsg({ type: 'success', text: data.message || 'Password updated' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Could not change password' });
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full bg-[#141516] border border-white/10 focus:border-[#e50539] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet relative w-full sm:max-w-sm bg-[#1b1c1d] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 space-y-3"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#e50539]/15 border border-[#e50539]/30 flex items-center justify-center text-[#ff4d6d]"><Lock className="w-5 h-5" /></div>
          <h2 id="cp-title" className="text-lg font-extrabold text-white font-heading">Change password</h2>
        </div>
        {msg && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${msg.type === 'success' ? 'bg-[#28a909]/10 border border-[#28a909]/30 text-[#7be05a]' : 'bg-[#e50539]/10 border border-[#e50539]/30 text-rose-200'}`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}
        <label className="block">
          <span className="block text-xs font-semibold text-zinc-400 mb-1">Current password</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-zinc-400 mb-1">New password</span>
          <input type="password" autoComplete="new-password" required minLength={6} value={next} onChange={e => setNext(e.target.value)} className={input} />
          <span className="block text-[11px] text-zinc-500 mt-1">At least 6 characters.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-zinc-400 mb-1">Confirm new password</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={input} />
        </label>
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
