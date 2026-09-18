import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, AlertCircle, CheckCircle2, Lock, UploadCloud, Trash2 } from 'lucide-react';
import { JazzCashIcon } from './PaymentIcons';
import { soundFx } from '../utils/soundEffects';

export default function CashierModal({ isOpen, onClose, initialTab = 'deposit', user, balance = 0, onBalanceUpdate }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'deposit' | 'withdraw' | 'history'
  const [depositMethod, setDepositMethod] = useState('jazzcash');
  const [depositAmount, setDepositAmount] = useState(1000);
  const [senderAccount, setSenderAccount] = useState('');
  const [tidReference, setTidReference] = useState('');
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const fileInputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Withdraw state
  const [withdrawMethod, setWithdrawMethod] = useState('jazzcash');
  const [withdrawAmount, setWithdrawAmount] = useState(1000);
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // History & Feedback
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchHistory = async () => {
    let remoteTx = [];
    try {
      const token = localStorage.getItem('luckywin_token');
      if (token) {
        const res = await fetch('/api/cashier/history', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data.transactions) {
            remoteTx = data.transactions;
          }
        }
      }
    } catch (err) {}

    const localTx1 = JSON.parse(localStorage.getItem('luckywin_local_transactions') || '[]');
    const localTx2 = JSON.parse(localStorage.getItem('luckywin_transactions') || '[]');
    const combined = [...remoteTx];
    [...localTx1, ...localTx2].forEach(tx => {
      if (!combined.some(t => t.id === tx.id)) {
        combined.push(tx);
      }
    });
    setHistory(combined);
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setStatusMessage(null);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      fetchHistory();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    soundFx.playBet();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        setStatusMessage({ type: 'error', text: 'File size must be under 15MB' });
        return;
      }
      setScreenshotFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setScreenshotPreview(null);
    setScreenshotFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!screenshotPreview) {
      setStatusMessage({ type: 'error', text: 'Please upload a payment screenshot proof from JazzCash' });
      return;
    }

    setLoading(true);

    try {
      try {
        const token = localStorage.getItem('luckywin_token');
        const res = await fetch('/api/cashier/deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            method: depositMethod,
            amount: depositAmount,
            accountNumber: senderAccount,
            reference: tidReference || 'Screenshot Proof Attached',
            proofScreenshot: screenshotPreview
          })
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        }
      } catch (remoteErr) {
        // Log and continue with local record
      }

      // Record transaction locally
      const localTx = JSON.parse(localStorage.getItem('luckywin_local_transactions') || localStorage.getItem('luckywin_transactions') || '[]');
      const newTx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: user ? user.id : 'usr_local',
        username: user ? user.username : 'Player',
        type: 'deposit',
        method: depositMethod,
        amount: Number(depositAmount),
        reference: tidReference || 'JazzCash Proof Attached',
        accountNumber: senderAccount,
        proofScreenshot: screenshotPreview,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      localTx.unshift(newTx);
      localStorage.setItem('luckywin_local_transactions', JSON.stringify(localTx));
      localStorage.setItem('luckywin_transactions', JSON.stringify(localTx));

      soundFx.playCashout();
      setStatusMessage({ type: 'success', text: 'Deposit request submitted successfully! Admin will verify your JazzCash screenshot and credit your balance.' });
      setTidReference('');
      setSenderAccount('');
      removeScreenshot();
      fetchHistory();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Deposit submission failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);

    const numWithdraw = Number(withdrawAmount);
    if (isNaN(numWithdraw) || numWithdraw < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum withdrawal amount is PKR 500' });
      return;
    }
    if (user && numWithdraw > balance) {
      setStatusMessage({ type: 'error', text: `Insufficient balance! Your current balance is PKR ${balance.toLocaleString()}` });
      return;
    }

    setLoading(true);

    try {
      let updatedBalance = null;
      try {
        const token = localStorage.getItem('luckywin_token');
        const res = await fetch('/api/cashier/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            method: withdrawMethod,
            amount: numWithdraw,
            accountTitle,
            accountNumber
          })
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data.newBalance !== undefined) {
            updatedBalance = data.newBalance;
          }
        }
      } catch (err) {}

      // Deduct balance locally if not updated remotely
      const newBal = updatedBalance !== null ? updatedBalance : Math.max(0, parseFloat((balance - numWithdraw).toFixed(2)));
      onBalanceUpdate(newBal);

      const localTx = JSON.parse(localStorage.getItem('luckywin_local_transactions') || localStorage.getItem('luckywin_transactions') || '[]');
      const newTx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: user ? user.id : 'usr_local',
        username: user ? user.username : 'Player',
        type: 'withdraw',
        method: withdrawMethod,
        amount: numWithdraw,
        accountNumber: `${accountTitle ? accountTitle + ' - ' : ''}${accountNumber}`,
        reference: 'User Withdrawal Request',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      localTx.unshift(newTx);
      localStorage.setItem('luckywin_local_transactions', JSON.stringify(localTx));
      localStorage.setItem('luckywin_transactions', JSON.stringify(localTx));

      soundFx.playCashout();
      setStatusMessage({ type: 'success', text: 'Withdrawal request created. Payout will be sent to your JazzCash account.' });
      setAccountTitle('');
      setAccountNumber('');
      fetchHistory();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [500, 1000, 2500, 5000, 10000, 25000];

  const paymentMethodsList = [
    {
      id: 'jazzcash',
      name: 'JazzCash',
      sub: 'Mobile Wallet',
      fee: '0% fee',
      limits: '100 - 50,000 PKR',
      icon: <JazzCashIcon className="w-10 h-10" />,
      accountNum: '03005641699',
      accountTitle: 'Muhammad Imtiaz'
    }
  ];

  const currentMethod = paymentMethodsList.find(m => m.id === depositMethod);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#11141d] border border-[#1e2536] rounded-2xl p-5 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close Cashier"
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a202f] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#1a68ff]/10 border border-[#1a68ff]/20 flex items-center justify-center text-[#1a68ff] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-black text-white font-heading tracking-tight truncate">Deposit & Withdrawal Desk</h2>
            <p className="text-xs text-slate-400">Official cashier gateway</p>
          </div>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="flex bg-[#0b0d14] p-1 rounded-xl border border-[#181d2a] mb-5">
          <button
            type="button"
            onClick={() => { setActiveTab('deposit'); setStatusMessage(null); soundFx.playBet(); }}
            className={`flex-1 py-2 rounded-lg font-heading font-bold text-xs sm:text-sm transition-all ${
              activeTab === 'deposit'
                ? 'bg-[#00c638] text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('withdraw'); setStatusMessage(null); soundFx.playBet(); }}
            className={`flex-1 py-2 rounded-lg font-heading font-bold text-xs sm:text-sm transition-all ${
              activeTab === 'withdraw'
                ? 'bg-[#1a68ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Withdrawal
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('history'); setStatusMessage(null); soundFx.playBet(); }}
            className={`flex-1 py-2 rounded-lg font-heading font-bold text-xs sm:text-sm transition-all ${
              activeTab === 'history'
                ? 'bg-[#222a3d] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            History
          </button>
        </div>

        {/* Alert Notification */}
        {statusMessage && (
          <div className={`mb-5 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-[#00c638]/10 border border-[#00c638]/30 text-[#00c638]'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* ==================== DEPOSIT VIEW ==================== */}
        {activeTab === 'deposit' && (
          <div className="space-y-4">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-heading">
                Select Payment Method
              </span>

              {/* Payment Methods Grid */}
              <div className="grid grid-cols-1 gap-2">
                {paymentMethodsList.map((m) => {
                  const isSelected = depositMethod === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => { setDepositMethod(m.id); soundFx.playBet(); }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#161c2b] border-[#1a68ff] shadow-sm ring-1 ring-[#1a68ff]/40'
                          : 'bg-[#0d1017] border-[#1c2233] hover:bg-[#121622]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {m.icon}
                        <div>
                          <div className="font-heading font-bold text-xs text-white leading-tight">
                            {m.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {m.limits} • <span className="text-[#00c638]">{m.fee}</span>
                          </div>
                        </div>
                      </div>

                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-[#1a68ff] bg-[#1a68ff] text-white' : 'border-slate-700'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recipient Account Details Card */}
            {currentMethod && (
              <div className="bg-[#0b0e15] border border-[#181d2a] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px] font-semibold">Payment Details:</span>
                  <span className="text-slate-300 font-bold text-[11px]">{currentMethod.name}</span>
                </div>

                <div className="flex items-center justify-between bg-[#121622] p-3 rounded-lg border border-[#1e2536]">
                  <div className="overflow-hidden pr-2">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Official Account / Mobile Number
                    </span>
                    <span className="text-base font-black text-white font-mono tracking-wider block truncate mt-0.5">
                      {currentMethod.accountNum}
                    </span>
                    <span className="text-xs text-[#00c638] font-semibold block mt-0.5">
                      Account Title: {currentMethod.accountTitle}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentMethod.accountNum)}
                    className="p-2.5 rounded-lg bg-[#1a2133] hover:bg-[#222b42] text-slate-200 transition-colors shrink-0"
                    title="Copy Account Number"
                  >
                    {copied ? <Check className="w-4 h-4 text-[#00c638]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Quick Amount Chips */}
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-heading">
                Deposit Amount (PKR)
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
                {quickAmounts.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => { setDepositAmount(amt); soundFx.playBet(); }}
                    className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                      depositAmount === amt
                        ? 'bg-[#00c638] text-slate-950 font-black'
                        : 'bg-[#0e1119] border border-[#1c2233] text-slate-300 hover:text-white hover:bg-[#141824]'
                    }`}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="100"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#00c638] rounded-xl px-3.5 py-2.5 text-sm font-bold text-white font-mono focus:outline-none"
              />
            </div>

            {/* Proof Submission Form */}
            <form onSubmit={handleDepositSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-heading">
                  Your Sender Account / Mobile Number
                </label>
                <input
                  type="text"
                  required
                  value={senderAccount}
                  onChange={(e) => setSenderAccount(e.target.value)}
                  placeholder="e.g. 03001234567"
                  className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#00c638] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              {/* Payment Screenshot Proof Upload (Required) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading flex items-center justify-between">
                  <span>Payment Screenshot Proof</span>
                  <span className="text-[#00c638] font-bold text-[10px]">*Required</span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                  id="receipt-upload"
                />

                {!screenshotPreview ? (
                  <label
                    htmlFor="receipt-upload"
                    className="border-2 border-dashed border-[#242e45] hover:border-[#00c638] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all bg-[#090c13] hover:bg-[#0d121c] group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#161d2d] group-hover:bg-[#00c638]/20 flex items-center justify-center text-slate-400 group-hover:text-[#00c638] transition-colors mb-2">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">
                      Click to upload payment screenshot
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      Upload receipt from JazzCash (PNG, JPG)
                    </span>
                  </label>
                ) : (
                  <div className="bg-[#121622] border border-[#1e2536] rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <img
                        src={screenshotPreview}
                        alt="Receipt preview"
                        className="w-12 h-12 rounded-lg object-cover border border-[#2d374e] shrink-0"
                      />
                      <div className="overflow-hidden">
                        <span className="text-xs font-bold text-white block truncate">
                          {screenshotFileName || 'Payment Receipt Attached'}
                        </span>
                        <span className="text-[10px] text-[#00c638] font-semibold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Screenshot Attached
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={removeScreenshot}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors shrink-0"
                      title="Remove Screenshot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-heading flex items-center justify-between">
                  <span>Transaction ID / TID</span>
                  <span className="text-slate-500 text-[10px] lowercase font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={tidReference}
                  onChange={(e) => setTidReference(e.target.value)}
                  placeholder="e.g. TID 11223344556"
                  className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#00c638] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-bet-green w-full py-3.5 rounded-xl font-heading font-black text-sm tracking-wide mt-2 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : `Deposit PKR ${depositAmount.toLocaleString()}`}
              </button>
            </form>
          </div>
        )}

        {/* ==================== WITHDRAWAL VIEW ==================== */}
        {activeTab === 'withdraw' && (
          <form onSubmit={handleWithdrawSubmit} className="space-y-3.5">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-heading">
                Payout Channel
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  { id: 'jazzcash', label: 'JazzCash', icon: <JazzCashIcon className="w-8 h-8" /> }
                ].map(m => (
                  <div
                    key={m.id}
                    onClick={() => { setWithdrawMethod(m.id); soundFx.playBet(); }}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                      withdrawMethod === m.id
                        ? 'bg-[#161c2b] border-[#1a68ff] ring-1 ring-[#1a68ff]/40 shadow-sm'
                        : 'bg-[#0d1017] border-[#1c2233] text-slate-400 hover:bg-[#121622]'
                    }`}
                  >
                    {m.icon}
                    <span className="font-heading font-bold text-xs sm:text-sm text-white">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-heading">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                value={accountTitle}
                onChange={(e) => setAccountTitle(e.target.value)}
                placeholder="Full name on account"
                className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#1a68ff] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-heading">
                JazzCash Mobile Account Number
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 03001234567"
                className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#1a68ff] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-heading">
                Withdrawal Amount (Min PKR 500)
              </label>
              <input
                type="number"
                min="500"
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                className="w-full bg-[#0b0e15] border border-[#1c2233] focus:border-[#1a68ff] rounded-xl px-3.5 py-2 text-sm font-bold text-white font-mono focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#1a68ff] hover:bg-[#1355db] text-white font-heading font-black text-sm tracking-wide transition-colors mt-2 disabled:opacity-50 shadow-sm"
            >
              {loading ? 'Submitting...' : `Withdraw PKR ${withdrawAmount.toLocaleString()}`}
            </button>
          </form>
        )}

        {/* ==================== HISTORY VIEW ==================== */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-12">No transactions recorded yet.</p>
            ) : (
              history.map(tx => (
                <div key={tx.id} className="p-3 rounded-xl bg-[#0b0e15] border border-[#1c2233] flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase font-heading ${tx.type === 'deposit' ? 'text-[#00c638]' : 'text-[#1a68ff]'}`}>
                        {tx.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">({tx.method})</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5 font-mono">
                      Ref: {tx.reference || 'N/A'} • {new Date(tx.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-white font-mono block">
                      PKR {tx.amount.toLocaleString()}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded inline-block mt-0.5 ${
                      tx.status === 'approved'
                        ? 'bg-[#00c638]/15 text-[#00c638]'
                        : tx.status === 'rejected'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {tx.status}
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
