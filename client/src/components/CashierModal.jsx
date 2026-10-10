import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check, AlertCircle, CheckCircle2, UploadCloud, Trash2, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { EasyPaisaIcon } from './PaymentIcons';
import { soundFx } from '../utils/soundEffects';

const DEPOSIT_ACCOUNT = { name: 'Easypaisa', number: '0300 4968550', title: 'Farzana Kausar' };
const QUICK_AMOUNTS = [3000, 5000, 10000, 25000, 50000];
const MIN_DEPOSIT = 3000;
const MAX_DEPOSIT = 50000;
const MIN_WITHDRAW = 500;

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('luckywin_token')}`
});

async function postJson(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  } catch (e) {
    throw new Error('Network error — please check your connection and try again');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 413) throw new Error('Screenshot is too large. Please upload a smaller image.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Downscale + re-encode the receipt so the request stays well below serverless body limits.
function compressImage(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image file'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const fmtPkr = (v) => `PKR ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const label = 'block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5';
const inputCls = 'w-full bg-[#141516] border border-white/10 focus:border-[#e50539] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none';

export default function CashierModal({ isOpen, onClose, initialTab = 'deposit', user, balance = 0, onBalanceUpdate }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'deposit' | 'withdraw' | 'history'
  const [depositAmount, setDepositAmount] = useState(3000);
  const [senderAccount, setSenderAccount] = useState('');
  const [tidReference, setTidReference] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotName, setScreenshotName] = useState('');
  const [processingImg, setProcessingImg] = useState(false);
  const fileInputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState(1000);
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState('idle'); // idle | loading | ok | error
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchHistory = useCallback(async () => {
    setHistoryState('loading');
    try {
      const res = await fetch(`/api/cashier/history?_t=${Date.now()}`, { headers: authHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setHistory(Array.isArray(data.transactions) ? data.transactions : []);
      setHistoryState('ok');
    } catch (e) {
      setHistoryState('error');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setStatusMessage(null);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'history' && user) fetchHistory();
  }, [isOpen, activeTab, user, fetchHistory]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const switchTab = (t) => { setActiveTab(t); setStatusMessage(null); soundFx.playBet(); };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text.replace(/\s/g, '')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: 'Please choose an image file (PNG or JPG)' });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image must be under 15 MB' });
      return;
    }
    setProcessingImg(true);
    try {
      setScreenshot(await compressImage(file));
      setScreenshotName(file.name);
      setStatusMessage(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setProcessingImg(false);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
      setStatusMessage({ type: 'error', text: 'Minimum deposit PKR 3,000' });
      return;
    }
    if (amount > MAX_DEPOSIT) {
      setStatusMessage({ type: 'error', text: 'Maximum deposit PKR 50,000 per request' });
      return;
    }
    if (!screenshot) {
      setStatusMessage({ type: 'error', text: 'Please upload the payment screenshot from Easypaisa' });
      return;
    }
    setLoading(true);
    try {
      const data = await postJson('/api/cashier/deposit', {
        method: 'easypaisa',
        amount,
        accountNumber: senderAccount.trim(),
        reference: tidReference.trim() || 'Screenshot proof attached',
        proofScreenshot: screenshot
      });
      soundFx.playCashout();
      setStatusMessage({ type: 'success', text: data.message || 'Deposit request submitted. Your balance will be credited after verification.' });
      setTidReference('');
      setSenderAccount('');
      removeScreenshot();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Deposit request failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) {
      setStatusMessage({ type: 'error', text: `Minimum withdrawal is PKR ${MIN_WITHDRAW}` });
      return;
    }
    if (amount > balance) {
      setStatusMessage({ type: 'error', text: `Insufficient balance. Available: ${fmtPkr(balance)}` });
      return;
    }
    setLoading(true);
    try {
      const data = await postJson('/api/cashier/withdraw', {
        method: 'easypaisa',
        amount,
        accountTitle: accountTitle.trim(),
        accountNumber: accountNumber.trim()
      });
      if (data.newBalance !== undefined) onBalanceUpdate(data.newBalance);
      soundFx.playCashout();
      setStatusMessage({ type: 'success', text: data.message || 'Withdrawal request submitted.' });
      setAccountTitle('');
      setAccountNumber('');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Withdrawal request failed' });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'history', label: 'History' }
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashier-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet relative w-full sm:max-w-lg bg-[#1b1c1d] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[94vh] overflow-y-auto"
      >
        <button onClick={onClose} aria-label="Close cashier" className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#28a909]/15 border border-[#28a909]/30 flex items-center justify-center text-[#5fd23b] shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="cashier-title" className="text-lg font-extrabold text-white font-heading">Wallet</h2>
            <p className="text-xs text-zinc-400">Balance: <span className="text-white font-bold tabular-nums">{fmtPkr(balance)}</span></p>
          </div>
        </div>

        <div role="tablist" className="grid grid-cols-3 bg-[#141516] p-1 rounded-xl border border-white/[0.06] mb-4">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => switchTab(t.id)}
              className={`py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === t.id ? 'bg-[#2c2d30] text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!user && (
          <p className="text-sm text-zinc-400 text-center py-8">Please log in to use the wallet.</p>
        )}

        {user && statusMessage && (
          <div role="alert" className={`mb-4 p-3 rounded-xl flex items-start gap-2.5 text-xs font-semibold ${
            statusMessage.type === 'success' ? 'bg-[#28a909]/10 border border-[#28a909]/30 text-[#7be05a]' : 'bg-[#e50539]/10 border border-[#e50539]/30 text-rose-200'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-px" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* ==================== DEPOSIT ==================== */}
        {user && activeTab === 'deposit' && (
          <form onSubmit={handleDepositSubmit} className="space-y-4">
            <div className="rounded-xl bg-[#141516] border border-white/[0.06] p-3.5">
              <div className="flex items-center gap-2.5 mb-3">
                <EasyPaisaIcon className="w-9 h-9" />
                <div>
                  <div className="text-sm font-bold text-white">Step 1 — Send money via Easypaisa</div>
                  <div className="text-[11px] text-zinc-500">Limits: PKR 3,000 – 50,000 per deposit</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 bg-[#1f2023] p-3 rounded-lg border border-white/[0.06]">
                <div className="min-w-0">
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold tracking-wider">Account number</span>
                  <span className="text-lg font-extrabold text-white tabular-nums tracking-wide block select-text">{DEPOSIT_ACCOUNT.number}</span>
                  <span className="text-xs text-zinc-400 block">Title: <span className="text-white font-semibold">{DEPOSIT_ACCOUNT.title}</span></span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(DEPOSIT_ACCOUNT.number)}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-[#2c2d30] hover:bg-[#36373b] text-xs font-semibold text-zinc-200 shrink-0"
                >
                  {copied ? <><Check className="w-4 h-4 text-[#5fd23b]" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
              </div>
            </div>

            <div>
              <span className={label}>Step 2 — Amount sent (PKR)</span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mb-2">
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(amt)}
                    className={`py-1.5 rounded-lg text-xs font-bold tabular-nums transition-colors border ${
                      Number(depositAmount) === amt ? 'bg-[#2c2d30] border-white/25 text-white' : 'bg-[#141516] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={MIN_DEPOSIT}
                inputMode="numeric"
                aria-label="Deposit amount"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className={`${inputCls} font-bold tabular-nums`}
              />
            </div>

            <div>
              <label className={label} htmlFor="sender-acc">Your Easypaisa number</label>
              <input id="sender-acc" type="tel" inputMode="tel" required value={senderAccount} onChange={(e) => setSenderAccount(e.target.value)} placeholder="03XXXXXXXXX" className={`${inputCls} tabular-nums`} />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className={label}>Step 3 — Payment screenshot</span>
                <span className="text-[10px] font-bold text-[#ff4d6d] mb-1.5">Required</span>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" id="receipt-upload" />
              {!screenshot ? (
                <label
                  htmlFor="receipt-upload"
                  className="border-2 border-dashed border-white/10 hover:border-[#28a909]/60 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#141516] group"
                >
                  {processingImg ? <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mb-1.5" /> : <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-[#5fd23b] mb-1.5" />}
                  <span className="text-xs font-bold text-zinc-200">{processingImg ? 'Preparing image…' : 'Tap to upload the receipt'}</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">PNG or JPG</span>
                </label>
              ) : (
                <div className="bg-[#141516] border border-white/[0.06] rounded-xl p-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={screenshot} alt="Receipt preview" className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{screenshotName || 'Receipt'}</span>
                      <span className="text-[10px] text-[#5fd23b] font-semibold flex items-center gap-1 mt-0.5"><CheckCircle2 className="w-3 h-3" /> Attached</span>
                    </div>
                  </div>
                  <button type="button" onClick={removeScreenshot} aria-label="Remove screenshot" className="p-2 rounded-lg bg-[#e50539]/10 hover:bg-[#e50539]/20 text-rose-300 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className={label} htmlFor="tid">Transaction ID (TID) <span className="normal-case font-normal text-zinc-500">— optional</span></label>
              <input id="tid" type="text" value={tidReference} onChange={(e) => setTidReference(e.target.value)} placeholder="e.g. 11223344556" className={`${inputCls} tabular-nums`} />
            </div>

            <button type="submit" disabled={loading || processingImg} className="btn-bet-green w-full py-3.5 rounded-xl text-sm disabled:opacity-50">
              {loading ? 'Submitting…' : `Submit deposit of PKR ${Number(depositAmount || 0).toLocaleString()}`}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">Your balance is credited after the payment is verified by our team.</p>
          </form>
        )}

        {/* ==================== WITHDRAW ==================== */}
        {user && activeTab === 'withdraw' && (
          <form onSubmit={handleWithdrawSubmit} className="space-y-3.5">
            <div className="rounded-xl bg-[#141516] border border-white/[0.06] p-3 flex items-center gap-3">
              <EasyPaisaIcon className="w-8 h-8" />
              <div>
                <div className="text-sm font-bold text-white">Payout to Easypaisa</div>
                <div className="text-[11px] text-zinc-500">Min PKR {MIN_WITHDRAW} • available {fmtPkr(balance)}</div>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="acc-title">Account holder name</label>
              <input id="acc-title" type="text" required autoComplete="name" value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} placeholder="Full name on the account" className={inputCls} />
            </div>
            <div>
              <label className={label} htmlFor="acc-number">Easypaisa number</label>
              <input id="acc-number" type="tel" inputMode="tel" required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="03XXXXXXXXX" className={`${inputCls} tabular-nums`} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className={label} htmlFor="wd-amount">Amount (PKR)</label>
                <button type="button" onClick={() => setWithdrawAmount(Math.floor(balance))} className="text-[11px] font-bold text-zinc-400 hover:text-white mb-1.5">Max</button>
              </div>
              <input id="wd-amount" type="number" min={MIN_WITHDRAW} required inputMode="numeric" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className={`${inputCls} font-bold tabular-nums`} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-sm">
              {loading ? 'Submitting…' : `Request withdrawal of PKR ${Number(withdrawAmount || 0).toLocaleString()}`}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">The amount is reserved from your balance and paid out after review.</p>
          </form>
        )}

        {/* ==================== HISTORY ==================== */}
        {user && activeTab === 'history' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Your transactions</span>
              <button type="button" onClick={fetchHistory} className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white" aria-label="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${historyState === 'loading' ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {historyState === 'loading' && history.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)
            ) : historyState === 'error' ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-xs text-rose-300">Could not load your transactions.</p>
                <button type="button" onClick={fetchHistory} className="text-xs font-bold text-white bg-[#2c2d30] px-3 py-1.5 rounded-full">Try again</button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-10">No transactions yet.</p>
            ) : (
              history.map(tx => (
                <div key={tx.id} className="p-3 rounded-xl bg-[#141516] border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase ${tx.type === 'deposit' ? 'text-[#5fd23b]' : 'text-sky-300'}`}>{tx.type}</span>
                      <span className="text-[10px] text-zinc-500">{tx.method}</span>
                    </div>
                    <span className="text-[11px] text-zinc-500 block mt-0.5 truncate">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                      {tx.reference ? ` • ${tx.reference}` : ''}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-white tabular-nums block">{fmtPkr(tx.amount)}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded inline-block mt-0.5 ${
                      tx.status === 'approved' ? 'bg-[#28a909]/15 text-[#7be05a]' : tx.status === 'rejected' ? 'bg-[#e50539]/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {tx.status || 'pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
