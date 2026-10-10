import React, { useState, useEffect } from 'react';
import { Sliders, CheckCircle, RefreshCw, RotateCcw, Eye, X, Flame, Bomb, Target, AlertOctagon, ShieldAlert, Sparkles, Search, Users, Calendar, UserCheck, Copy, Check, Mail, Clock, ShieldCheck, AtSign, Trash2 } from 'lucide-react';

const GoogleGIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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

export default function AdminDashboard({ user, onBalanceUpdate }) {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({
    crashRtp: 96,
    houseEdge: 4,
    minBet: 10,
    maxBet: 50000,
    maxPayout: 1000000
  });
  const [transactions, setTransactions] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilterTab, setUserFilterTab] = useState('all'); // 'all' | 'gmail' | 'email' | 'active' | 'banned'
  const [copiedEmailId, setCopiedEmailId] = useState(null);
  const [adjustMode, setAdjustMode] = useState('set'); // 'set' | 'adjust'
  const [activeTab, setActiveTab] = useState('cashier'); // 'cashier' | 'game_controls' | 'settings' | 'users'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Screenshot viewer state
  const [viewingScreenshotTx, setViewingScreenshotTx] = useState(null);

  // Live Game Controls state
  const [aviatorStatus, setAviatorStatus] = useState(null);
  const [forcedMultiplierInput, setForcedMultiplierInput] = useState('');
  const [minesStatus, setMinesStatus] = useState({ sessions: [], riggingConfig: {} });

  const flash = (type, text, ms = 3500) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('luckywin_token')}`
  });

  // POST/PUT/DELETE helper that surfaces the server's error message
  const adminRequest = async (method, url, body) => {
    const res = await fetch(url, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  const handleResetAllData = async () => {
    const typed = window.prompt('This resets total wagered, payouts, house profit, cashier requests and ALL balances to 0.\n\nType RESET to confirm:');
    if (typed === null) return;
    if (typed.trim() !== 'RESET') {
      flash('error', 'Reset cancelled — you must type RESET exactly.');
      return;
    }
    try {
      await adminRequest('POST', '/api/admin/reset-stats', { confirm: 'RESET' });
      fetchAdminData();
      flash('success', 'Platform stats, cashier requests and balances were reset to 0.', 4000);
      if (onBalanceUpdate) onBalanceUpdate(0);
    } catch (err) {
      flash('error', err.message || 'Failed to reset platform data');
    }
  };

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(500);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const safeFetch = async (url) => {
        try {
          const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`, { headers: authHeaders(), cache: 'no-store' });
          if (!res.ok) return null;
          const ct = res.headers.get('content-type');
          if (ct && ct.includes('application/json')) return await res.json();
        } catch (e) { /* network error */ }
        return null;
      };

      const [statsData, txData, usersData] = await Promise.all([
        safeFetch('/api/admin/stats'),
        safeFetch('/api/admin/transactions'),
        safeFetch('/api/admin/users')
      ]);

      if (!statsData && !txData && !usersData) {
        flash('error', 'Could not load admin data. Check your connection and try Refresh.', 5000);
      }
      if (statsData?.stats) setStats(statsData.stats);
      if (statsData?.settings) setSettings(prev => ({ ...prev, ...statsData.settings }));
      if (usersData && Array.isArray(usersData.users)) setUsersList(usersData.users);
      if (txData && Array.isArray(txData.transactions)) setTransactions(txData.transactions);

      // Remove legacy offline caches (never trusted any more)
      localStorage.removeItem('luckywin_local_users');
      localStorage.removeItem('luckywin_local_transactions');
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Poll live Aviator status when the Aviator tab is open
  useEffect(() => {
    if (activeTab !== 'game_controls') return;
    let alive = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/admin/game-control/aviator?_t=${Date.now()}`, {
          headers: authHeaders(),
          cache: 'no-store'
        });
        if (res.ok && alive) {
          const data = await res.json();
          setAviatorStatus(data);
          if (typeof data?.houseEdge === 'number') setSettings(prev => (prev.houseEdge === data.houseEdge ? prev : { ...prev, houseEdge: data.houseEdge }));
        }
      } catch (err) { /* keep last status */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => { alive = false; clearInterval(interval); };
  }, [activeTab]);

  const aviatorAction = async (path, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const data = await adminRequest('POST', `/api/admin/game-control/aviator/${path}`, body);
      flash('success', data.message || 'Done', 4000);
    } catch (err) {
      flash('error', err.message || 'Action failed', 4000);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    const errors = [];
    const notes = [];
    try {
      const payload = {
        minBet: Number(settings.minBet),
        maxBet: Number(settings.maxBet),
        maxPayout: Number(settings.maxPayout)
      };
      if (typeof settings.maintenance === 'boolean') payload.maintenance = settings.maintenance;
      const data = await adminRequest('PUT', '/api/admin/settings', payload);
      notes.push(data.message || 'Limits saved.');
    } catch (err) {
      errors.push(err.message);
    }
    // House edge for Aviator applies from the NEXT round and is shown publicly as RTP.
    try {
      const edge = Number(settings.houseEdge);
      if (!(edge >= 1 && edge <= 10)) throw new Error('House edge must be between 1% and 10%');
      const data = await adminRequest('POST', '/api/admin/game-control/aviator/house-edge', { edge });
      notes.push(data.message || 'House edge saved.');
    } catch (err) {
      errors.push(err.message);
    }
    if (errors.length) flash('error', errors.join(' • '), 5000);
    else flash('success', notes.join(' '), 4000);
  };

  const handleTransactionAction = async (txId, action) => {
    try {
      const data = await adminRequest('POST', `/api/admin/transactions/${txId}/action`, { action });
      flash('success', data.message || `Transaction ${action === 'approve' ? 'approved' : 'rejected'}.`, 3000);
    } catch (err) {
      flash('error', err.message || 'Could not update the transaction');
    }
    fetchAdminData();
  };

  const handleUserBalanceAdjust = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    const val = Number(adjustAmount);
    if (!Number.isFinite(val)) return flash('error', 'Enter a valid numeric amount');

    const action = adjustMode === 'set' ? 'set_balance' : 'adjust_balance';
    try {
      const data = await adminRequest('POST', `/api/admin/users/${selectedUser.id}/action`, { action, amount: val });
      const finalBal = data.newBalance !== undefined
        ? Number(data.newBalance)
        : (data.user && data.user.balance !== undefined ? Number(data.user.balance) : null);
      if (finalBal !== null) {
        setUsersList(prev => prev.map(u => (u.id === selectedUser.id ? { ...u, balance: finalBal } : u)));
        if (selectedUser.id === user?.id && onBalanceUpdate) onBalanceUpdate(finalBal);
      } else {
        fetchAdminData();
      }
      flash('success', `Balance updated: ${selectedUser.username}${finalBal !== null ? ` now has PKR ${finalBal.toLocaleString()}` : ''}`);
      setSelectedUser(null);
    } catch (err) {
      flash('error', err.message || 'Could not update balance');
    }
  };

  const handleDeleteUser = async (u) => {
    const cleanUser = (u.username || '').toLowerCase();
    const cleanEmail = (u.email || '').toLowerCase();
    if (u.role === 'admin' || cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com' || cleanUser.includes('admin')) {
      flash('error', 'Admin accounts cannot be deleted.');
      return;
    }

    if (!window.confirm(`Permanently delete "${u.username}" (${u.email || 'no email'})? Their balance and data will be removed.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('luckywin_token');
      let res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        res = await fetch(`/api/admin/users/${u.id}/action`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'delete' })
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      setUsersList(prev => prev.filter(userItem => userItem.id !== u.id));
      flash('success', `User "${u.username}" was deleted.`);
    } catch (err) {
      flash('error', err.message || 'Error deleting user');
    }
  };

  const handleToggleBan = async (userId, currentBanned) => {
    try {
      await adminRequest('POST', `/api/admin/users/${userId}/action`, { isBanned: !currentBanned });
      setUsersList(prev => prev.map(u => (u.id === userId ? { ...u, isBanned: !currentBanned } : u)));
      flash('success', `Account ${!currentBanned ? 'suspended' : 're-activated'}.`, 3000);
    } catch (err) {
      flash('error', err.message || 'Could not update account status');
    }
  };

  const pendingTxCount = transactions.filter(t => t.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#1b1c1d] border border-amber-500/30 p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              Super Admin Back Office
              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                Risk & Operations
              </span>
            </h1>
            <p className="text-xs text-slate-400">Manage house edge RTP, approve deposits/withdrawals, and monitor player ledger</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAdminData}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#141516] hover:bg-slate-800 border border-white/10 text-xs font-bold text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleResetAllData}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-xs font-bold text-rose-300 hover:text-white transition-all shadow"
            title="Reset total wagered, payouts, house profits, cashier requests, and balances to 0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            Reset All to 0 (Fresh Start)
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/20 border border-rose-500/30 text-rose-300'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {message.text}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1b1c1d] border border-white/10 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Total Wagered</span>
          <span className="text-xl font-black text-white font-mono mt-1 block">
            PKR {stats?.totalWagered?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-cyan-400 mt-1 block">Accumulated gross bets</span>
        </div>

        <div className="bg-[#1b1c1d] border border-white/10 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Total Payouts</span>
          <span className="text-xl font-black text-white font-mono mt-1 block">
            PKR {stats?.totalPayouts?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 block">Players won balance</span>
        </div>

        <div className="bg-[#1b1c1d] border border-white/10 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">House GGR (Profit)</span>
          <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
            PKR {stats?.grossGamingRevenue?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">Net Platform Profit</span>
        </div>

        <div className="bg-[#1b1c1d] border border-white/10 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Pending Cashier Requests</span>
          <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
            {pendingTxCount} Pending
          </span>
          <span className="text-[10px] text-amber-300 mt-1 block">Requires manual approval</span>
        </div>
      </div>

      {/* Money flow (real totals from the server) */}
      {stats && (stats.totalDeposits !== undefined || stats.totalWithdrawals !== undefined || stats.playerBalances !== undefined) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Approved Deposits', value: stats.totalDeposits, note: 'Total credited to players', cls: 'text-emerald-400' },
            { label: 'Withdrawals', value: stats.totalWithdrawals, note: 'Total paid / reserved for payout', cls: 'text-sky-300' },
            { label: 'Player Balances', value: stats.playerBalances, note: 'Liability: sum of all balances', cls: 'text-amber-300' }
          ].map(c => (
            <div key={c.label} className="bg-[#1b1c1d] border border-white/[0.06] p-4 rounded-2xl">
              <span className="text-xs text-zinc-400 font-semibold uppercase block">{c.label}</span>
              <span className={`text-xl font-black font-mono mt-1 block ${c.cls}`}>PKR {Number(c.value || 0).toLocaleString()}</span>
              <span className="text-[10px] text-zinc-500 mt-1 block">{c.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap bg-[#1b1c1d] p-1.5 rounded-2xl border border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('cashier')}
          className={`flex-1 min-w-[140px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'cashier'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Cashier Approvals
          {pendingTxCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">
              {pendingTxCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('game_controls')}
          className={`flex-1 min-w-[180px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'game_controls'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Flame className="w-4 h-4 text-amber-300" />
          Aviator Live
          <span className="bg-rose-500/80 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
            Live
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 min-w-[140px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'settings'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          House Edge & RTP Settings
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 min-w-[140px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'users'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          User Ledger & Balances
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
            activeTab === 'users' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
          }`}>
            {usersList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: CASHIER APPROVALS */}
      {activeTab === 'cashier' && (
        <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-5 shadow-xl overflow-x-auto">
          <h2 className="text-base font-black text-white mb-4">Cashier Deposits & Withdrawals Desk</h2>
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No cashier transactions logged.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Player</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Proof Screenshot</th>
                  <th className="pb-3">Ref / TID</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-900/40">
                    <td className="py-3.5 font-bold uppercase font-mono">
                      <span className={tx.type === 'deposit' ? 'text-emerald-400' : 'text-blue-400'}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3.5 font-semibold text-white">{tx.username}</td>
                    <td className="py-3.5 text-slate-400 uppercase">{tx.method}</td>
                    <td className="py-3.5 font-black font-mono text-white">PKR {tx.amount.toLocaleString()}</td>
                    <td className="py-3.5">
                      {tx.proofScreenshot ? (
                        <button
                          type="button"
                          onClick={() => setViewingScreenshotTx(tx)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a68ff]/15 hover:bg-[#1a68ff]/25 text-[#1a68ff] border border-[#1a68ff]/30 font-bold text-[11px] transition-all hover:scale-105"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Proof</span>
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px] italic">No image</span>
                      )}
                    </td>
                    <td className="py-3.5 text-slate-400 font-mono">{tx.reference || tx.accountNumber || '—'}</td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        tx.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : tx.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      {tx.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleTransactionAction(tx.id, 'approve')}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleTransactionAction(tx.id, 'reject')}
                            className="px-3 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: AVIATOR LIVE OPERATIONS (no crash-point control) */}
      {activeTab === 'game_controls' && (() => {
        const s = aviatorStatus;
        const paused = s?.state === 'PAUSED';
        const pausing = s?.control?.pauseAfterRound != null && !paused;
        const liveMult = s?.state === 'FLYING' ? `${Number(s.multiplier).toFixed(2)}x`
          : s?.state === 'WAITING' ? `Take-off in ${Number(s.countdown || 0).toFixed(1)}s`
          : s?.state === 'CRASHED' ? (s.voided ? 'Stopped (refunded)' : `Crashed @ ${Number(s.crashAt).toFixed(2)}x`)
          : paused ? 'Paused' : 'Connecting…';
        return (
          <div className="space-y-5">
            <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-white">Aviator Live Operations</h2>
                    <p className="text-xs text-slate-400">Same round for every player · provably fair · RTP {s?.rtp ?? '—'}%</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${
                  s?.state === 'FLYING' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : s?.state === 'WAITING' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : paused ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}>
                  {s?.state || '…'}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Round</div>
                  <div className="text-lg font-black text-white font-mono">#{s?.roundId ?? '—'}</div>
                </div>
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Live</div>
                  <div className="text-lg font-black text-white font-mono">{liveMult}</div>
                </div>
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Bets this round</div>
                  <div className="text-lg font-black text-white font-mono">{s?.roundTotals?.count ?? 0} · PKR {(s?.roundTotals?.wagered ?? 0).toLocaleString()}</div>
                </div>
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Paid out this round</div>
                  <div className="text-lg font-black text-emerald-300 font-mono">PKR {(s?.roundTotals?.paid ?? 0).toLocaleString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-4 space-y-2">
                  <h3 className="text-sm font-black text-rose-200 flex items-center gap-2"><AlertOctagon className="w-4 h-4" /> Emergency Stop</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Turant current round band karta hai. Is round ki <strong>har open bet ka poora paisa wapas</strong> hota hai.
                    Players ko "Round stopped — bets refunded" dikhega. Sirf technical/emergency masle ke liye.
                  </p>
                  <button
                    type="button"
                    disabled={!s || s.state === 'CRASHED' || paused}
                    onClick={() => aviatorAction('emergency-stop', null, 'Current round STOP karein? Is round ki sab open bets refund ho jayengi.')}
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    STOP ROUND & REFUND
                  </button>
                </div>

                <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 space-y-2">
                  <h3 className="text-sm font-black text-white">Pause / Resume</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Pause karne par current round normal khatam hoga, phir naye rounds shuru nahi honge (maintenance ke liye).
                  </p>
                  {paused || pausing ? (
                    <button
                      type="button"
                      onClick={() => aviatorAction('resume')}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs"
                    >
                      {pausing ? `Pausing after #${s.control.pauseAfterRound} — RESUME instead` : 'RESUME GAME'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!s}
                      onClick={() => aviatorAction('pause', null, 'Current round ke baad game pause karein?')}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs disabled:opacity-40"
                    >
                      PAUSE AFTER THIS ROUND
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Crash point har round ke seed se khud banta hai (provably fair). Admin crash point set ya force nahi kar sakta.
                  House edge "House Edge & RTP" tab se change hota hai, agle round se lagta hai, aur players ko RTP ke taur par dikhta hai.
                </span>
              </div>
            </div>

            <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-5 shadow-xl">
              <h3 className="text-sm font-black text-white mb-3">Real bets — round #{s?.roundId ?? '—'}</h3>
              {!s?.realBets?.length ? (
                <p className="text-xs text-slate-500 py-4 text-center">No bets in this round.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-500 border-b border-white/10">
                        <th className="pb-2">Player</th><th className="pb-2">Bet</th><th className="pb-2">Auto</th><th className="pb-2">Status</th><th className="pb-2 text-right">Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {s.realBets.map(b => (
                        <tr key={b.id}>
                          <td className="py-2 text-white font-semibold">{b.username}</td>
                          <td className="py-2 font-mono">PKR {b.amount}</td>
                          <td className="py-2 font-mono text-slate-400">{b.autoCashout ? `${b.autoCashout}x` : '—'}</td>
                          <td className="py-2 uppercase text-[10px] font-bold">{b.status === 'won' ? <span className="text-emerald-400">won @ {Number(b.multiplier).toFixed(2)}x</span> : b.status}</td>
                          <td className="py-2 text-right font-mono">{b.status === 'won' ? `PKR ${b.payout}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s?.history?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.history.slice(0, 20).map(h => (
                    <span key={h.roundId} className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-800 text-slate-200">
                      #{h.roundId}: {h.voided ? 'STOP' : `${Number(h.crashAt).toFixed(2)}x`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 2: HOUSE EDGE & RTP SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-6 shadow-xl max-w-2xl">
          <h2 className="text-base font-black text-white mb-2">Configure Game Economics & Risk</h2>
          <p className="text-xs text-slate-400 mb-6">
            House edge (1–10%) applies from the next Aviator round and is shown publicly as RTP. Bet limits and maintenance apply immediately.
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  House Edge: {settings.houseEdge}%
                </label>
                <span className="text-xs font-bold text-cyan-400">
                  Player RTP: {100 - settings.houseEdge}%
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={settings.houseEdge}
                onChange={(e) => {
                  const edge = Number(e.target.value);
                  setSettings(prev => ({ ...prev, houseEdge: edge, crashRtp: 100 - edge }));
                }}
                className="w-full accent-amber-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Standard industry standard is between 3% and 5% (95% - 97% RTP).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Minimum Bet (PKR)
                </label>
                <input
                  type="number"
                  value={settings.minBet}
                  onChange={(e) => setSettings(prev => ({ ...prev, minBet: Number(e.target.value) }))}
                  className="w-full bg-[#141516] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Maximum Bet (PKR)
                </label>
                <input
                  type="number"
                  value={settings.maxBet}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxBet: Number(e.target.value) }))}
                  className="w-full bg-[#141516] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Max Payout Cap per Round (PKR)
              </label>
              <input
                type="number"
                value={settings.maxPayout}
                onChange={(e) => setSettings(prev => ({ ...prev, maxPayout: Number(e.target.value) }))}
                className="w-full bg-[#141516] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-[#141516] border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.maintenance}
                onChange={(e) => setSettings(prev => ({ ...prev, maintenance: e.target.checked }))}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-xs text-slate-300">
                <span className="font-bold text-white block">Maintenance mode</span>
                New bets are rejected while this is on.
              </span>
            </label>

            <button
              type="submit"
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all"
            >
              SAVE GAME SETTINGS
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: USER LEDGER & BALANCES */}
      {activeTab === 'users' && (() => {
        const query = userSearchQuery.trim().toLowerCase();

        const isGmailUser = (u) => {
          const email = (u.email || '').toLowerCase();
          return email.includes('@gmail.com') || u.authProvider === 'google';
        };

        const filteredUsers = usersList.filter(u => {
          // Tab filter
          if (userFilterTab === 'gmail' && !isGmailUser(u)) return false;
          if (userFilterTab === 'email' && isGmailUser(u)) return false;
          if (userFilterTab === 'active' && u.isBanned) return false;
          if (userFilterTab === 'banned' && !u.isBanned) return false;

          // Search query
          if (!query) return true;
          return (u.username && u.username.toLowerCase().includes(query)) ||
                 (u.email && u.email.toLowerCase().includes(query)) ||
                 (u.id && u.id.toLowerCase().includes(query));
        });

        const totalCount = usersList.length;
        const gmailCount = usersList.filter(isGmailUser).length;
        const emailCount = usersList.filter(u => !isGmailUser(u)).length;
        const activeCount = usersList.filter(u => !u.isBanned).length;
        const bannedCount = usersList.filter(u => u.isBanned).length;
        const totalUserBalances = usersList.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);

        const formatDate = (isoStr) => {
          if (!isoStr) return '—';
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleString('en-PK', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          } catch (e) {
            return '—';
          }
        };

        const formatLastLogin = (isoStr) => {
          if (!isoStr) return { text: 'Never / No login recorded', isRecent: false };
          try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return { text: '—', isRecent: false };
            const diffMs = Date.now() - d.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const timeStr = d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateStr = d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
            if (diffHours < 1) {
              const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
              return { text: `${mins}m ago (${timeStr})`, isRecent: true };
            }
            if (diffHours < 24) {
              return { text: `Today at ${timeStr}`, isRecent: true };
            }
            return { text: `${dateStr}, ${timeStr}`, isRecent: false };
          } catch (e) {
            return { text: '—', isRecent: false };
          }
        };

        const handleCopyEmail = (email, id) => {
          if (!email) return;
          try {
            navigator.clipboard?.writeText(email);
          } catch (e) {}
          setCopiedEmailId(id);
          setTimeout(() => setCopiedEmailId(null), 2000);
        };

        return (
          <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-5 shadow-xl space-y-5">
            {/* Header with Title & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  Registered Players & Gmail Ledger
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {totalCount} Total Accounts
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time database of every user who registered or logged in with Gmail, standard email, or Google 1-Click
                </p>
              </div>

              {/* Search Bar & Sync Button */}
              <div className="flex items-center gap-2.5 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search by Gmail, username, or ID..."
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={fetchAdminData}
                  title="Sync and refresh latest player signups"
                  className="px-3 py-2.5 rounded-xl bg-[#141516] hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Sync
                </button>
              </div>
            </div>

            {/* Quick Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#090c13] border border-white/10 p-3.5 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Accounts</span>
                <span className="text-lg font-black text-white font-mono mt-0.5 block">{totalCount}</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">All platform records</span>
              </div>

              <div className="bg-[#090c13] border border-blue-500/20 p-3.5 rounded-2xl">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <GoogleGIcon /> Google / Gmail
                </span>
                <span className="text-lg font-black text-blue-300 font-mono mt-0.5 block">{gmailCount}</span>
                <span className="text-[10px] text-blue-400/60 mt-0.5 block">Verified Google users</span>
              </div>

              <div className="bg-[#090c13] border border-emerald-500/20 p-3.5 rounded-2xl">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Active Players</span>
                <span className="text-lg font-black text-emerald-300 font-mono mt-0.5 block">{activeCount}</span>
                <span className="text-[10px] text-emerald-400/60 mt-0.5 block">Permitted to bet & deposit</span>
              </div>

              <div className="bg-[#090c13] border border-amber-500/20 p-3.5 rounded-2xl">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Total Platform Balances</span>
                <span className="text-lg font-black text-amber-300 font-mono mt-0.5 block">PKR {totalUserBalances.toLocaleString()}</span>
                <span className="text-[10px] text-amber-400/60 mt-0.5 block">Combined player funds</span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1 border-b border-white/10/80">
              <span className="text-xs text-slate-400 font-semibold mr-1">Filter Accounts:</span>
              {[
                { id: 'all', label: `All Accounts (${totalCount})` },
                { id: 'gmail', label: `Google / Gmail (${gmailCount})` },
                { id: 'email', label: `Email & Password (${emailCount})` },
                { id: 'active', label: `Active (${activeCount})` },
                { id: 'banned', label: `Banned (${bannedCount})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setUserFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    userFilterTab === tab.id
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900/90 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mobile User Cards (< lg screens: instant visibility of Delete & Balance without side-scroll) */}
            <div className="lg:hidden space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <p className="font-bold text-slate-300">No user accounts found.</p>
                </div>
              ) : (
                filteredUsers.map(u => {
                  const isGoogle = isGmailUser(u);
                  const initials = (u.username || u.email || 'U').slice(0, 2).toUpperCase();
                  return (
                    <div key={u.id} className="bg-[#090d16] border border-white/10 rounded-2xl p-4 space-y-3 shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          {u.picture ? (
                            <img src={u.picture} alt={u.username} className="w-9 h-9 rounded-full border border-slate-700 object-cover" />
                          ) : (
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${
                              isGoogle ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                              {initials}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-sm">{u.username}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                u.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {u.role === 'admin' ? 'ADMIN' : 'PLAYER'}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[200px]">
                              {u.email || u.id}
                            </span>
                          </div>
                        </div>

                        {/* Balance Badge */}
                        <div className="text-right">
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Balance</span>
                          <span className="text-[#00c638] font-black font-mono text-sm">
                            PKR {(Number(u.balance) || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons: Adjust, Ban, Delete */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/10/80">
                        <button
                          onClick={() => { setSelectedUser(u); setAdjustAmount(u.balance || 0); setAdjustMode('set'); }}
                          className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow text-center"
                        >
                          💰 Adjust Balance
                        </button>
                        {u.role !== 'admin' && (
                          <>
                            <button
                              onClick={() => handleToggleBan(u.id, u.isBanned)}
                              className={`px-3 py-2 rounded-xl font-bold text-xs ${
                                u.isBanned ? 'bg-emerald-600/80 text-white' : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {u.isBanned ? 'Unban' : 'Ban'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              title="Delete User Permanently"
                              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow inline-flex items-center gap-1 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete User
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Players Table (Desktop screens >= lg) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 pl-1">Player & ID</th>
                    <th className="pb-3">Gmail / Account Info</th>
                    <th className="pb-3">Auth Method</th>
                    <th className="pb-3">Registration Date</th>
                    <th className="pb-3">Last Login / Active</th>
                    <th className="pb-3">Role & Status</th>
                    <th className="pb-3">Wallet Balance</th>
                    <th className="pb-3 text-right pr-1">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="font-bold text-slate-300">
                          {userSearchQuery
                            ? `No accounts found matching "${userSearchQuery}" in selected filter.`
                            : 'No user accounts found in this category.'}
                        </p>
                        {userSearchQuery && (
                          <button
                            onClick={() => setUserSearchQuery('')}
                            className="mt-2 text-[11px] text-amber-400 underline font-semibold"
                          >
                            Clear Search Filter
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const isNew = u.createdAt && (Date.now() - new Date(u.createdAt).getTime() < 1000 * 60 * 60 * 48);
                      const isGoogle = isGmailUser(u);
                      const regDateStr = formatDate(u.createdAt);
                      const loginMeta = formatLastLogin(u.lastLogin);
                      const isCopied = copiedEmailId === u.id;

                      // Generate initials for avatar
                      const initials = (u.username || u.email || 'U').slice(0, 2).toUpperCase();

                      return (
                        <tr key={u.id} className="hover:bg-slate-900/40 transition-colors group">
                          {/* 1. Player & ID */}
                          <td className="py-3.5 pl-1">
                            <div className="flex items-center gap-2.5">
                              {u.picture ? (
                                <img
                                  src={u.picture}
                                  alt={u.username}
                                  className="w-8 h-8 rounded-full border border-slate-700 object-cover shrink-0"
                                />
                              ) : (
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                  isGoogle ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}>
                                  {initials}
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white leading-tight">{u.username}</span>
                                  {isNew && (
                                    <span className="px-1 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[8px] font-black tracking-wider uppercase">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[10px] text-slate-500 block leading-tight">
                                  {u.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Gmail / Account Info */}
                          <td className="py-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                {isGoogle ? <GoogleGIcon /> : <Mail className="w-3.5 h-3.5 text-slate-400" />}
                                <span className={`font-mono text-xs font-bold ${
                                  isGoogle ? 'text-white' : 'text-slate-300'
                                }`}>
                                  {u.email || <span className="text-slate-600 italic">No email provided</span>}
                                </span>

                                {u.email && (
                                  <button
                                    onClick={() => handleCopyEmail(u.email, u.id)}
                                    title="Copy Gmail Address"
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-1"
                                  >
                                    {isCopied ? (
                                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                                        <Check className="w-3 h-3" /> Copied
                                      </span>
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  isGoogle
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {isGoogle ? 'Google Account' : 'Standard Email'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 3. Auth Method */}
                          <td className="py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                              isGoogle
                                ? 'bg-blue-600/15 border border-blue-500/30 text-blue-300'
                                : 'bg-slate-800/80 border border-slate-700 text-slate-300'
                            }`}>
                              {isGoogle ? <GoogleGIcon /> : <Mail className="w-3 h-3 text-slate-400" />}
                              {isGoogle ? 'Google 1-Click' : 'Password Login'}
                            </span>
                          </td>

                          {/* 4. Registration Date */}
                          <td className="py-3.5 text-slate-300 text-[11px] font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1 text-slate-400 text-[10px] mb-0.5">
                              <Calendar className="w-3 h-3" /> Signed Up
                            </div>
                            <span>{regDateStr}</span>
                          </td>

                          {/* 5. Last Login / Active */}
                          <td className="py-3.5 text-[11px] font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1 text-slate-400 text-[10px] mb-0.5">
                              <Clock className="w-3 h-3" /> Last Active
                            </div>
                            <div className="flex items-center gap-1.5">
                              {loginMeta.isRecent && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                              )}
                              <span className={loginMeta.isRecent ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                                {loginMeta.text}
                              </span>
                            </div>
                          </td>

                          {/* 6. Role & Status */}
                          <td className="py-3.5">
                            <div className="space-y-1">
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {u.role === 'admin' ? 'SUPER ADMIN' : 'PLAYER'}
                                </span>
                              </div>
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                  u.isBanned
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}>
                                  {u.isBanned ? 'BANNED' : 'ACTIVE'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 7. Wallet Balance */}
                          <td className="py-3.5 font-black font-mono text-emerald-400 text-xs whitespace-nowrap">
                            PKR {(Number(u.balance) || 0).toLocaleString()}
                          </td>

                          {/* 8. Actions */}
                          <td className="py-3.5 text-right pr-1 space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => { setSelectedUser(u); setAdjustAmount(u.balance || 0); setAdjustMode('set'); }}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-bold text-[11px] transition-colors shadow"
                            >
                              Adjust Balance
                            </button>
                            {u.role !== 'admin' && (
                              <>
                                <button
                                  onClick={() => handleToggleBan(u.id, u.isBanned)}
                                  className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors shadow ${
                                    u.isBanned ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white' : 'bg-amber-600/80 hover:bg-amber-600 text-white'
                                  }`}
                                >
                                  {u.isBanned ? 'Unban' : 'Ban'}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  title="Delete User Permanently"
                                  className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors shadow bg-rose-600 hover:bg-rose-500 text-white inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete User
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Adjust Balance Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-6 w-full max-w-sm space-y-4">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>Manage Balance: {selectedUser.username}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Current Wallet: <strong className="text-emerald-400 font-mono">PKR {(Number(selectedUser.balance) || 0).toLocaleString()}</strong>
              </p>
            </div>

            {/* Mode Selector */}
            <div className="flex bg-[#090c13] p-1 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => { setAdjustMode('set'); setAdjustAmount(selectedUser.balance || 0); }}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  adjustMode === 'set' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Set Exact Balance
              </button>
              <button
                type="button"
                onClick={() => { setAdjustMode('adjust'); setAdjustAmount(500); }}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  adjustMode === 'adjust' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Add / Deduct Amount
              </button>
            </div>

            <form onSubmit={handleUserBalanceAdjust} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  {adjustMode === 'set' ? 'New Exact Balance (PKR)' : 'Credit (+) or Debit (-) Amount (PKR)'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder={adjustMode === 'set' ? 'e.g. 2500' : 'e.g. 500 or -200'}
                  className="w-full bg-[#141516] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
                {adjustMode === 'set' && (
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    User ka balance foran yahi exact amount ban jayega aur user ko usi waqt live show hoga.
                  </span>
                )}
                {adjustMode === 'adjust' && (
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Resulting balance: PKR {Math.max(0, (Number(selectedUser.balance) || 0) + Number(adjustAmount || 0)).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors"
                >
                  {adjustMode === 'set' ? 'Set Balance Now' : 'Apply Adjustment'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Screenshot Proof Inspection Modal */}
      {viewingScreenshotTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-[#0f1422] border border-[#1e2738] rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#1a68ff]" />
                  Deposit Payment Proof Screenshot
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Player: <span className="text-white font-bold">{viewingScreenshotTx.username}</span> • Amount: <span className="text-[#00c638] font-bold">PKR {viewingScreenshotTx.amount?.toLocaleString()}</span> ({viewingScreenshotTx.method})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingScreenshotTx(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close Screenshot Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="flex-1 overflow-auto bg-[#07090e] border border-white/10/80 rounded-2xl p-2 flex items-center justify-center min-h-[280px] max-h-[52vh]">
              {viewingScreenshotTx.proofScreenshot ? (
                <img
                  src={viewingScreenshotTx.proofScreenshot}
                  alt="Receipt Screenshot Proof"
                  className="max-w-full max-h-[50vh] object-contain rounded-xl shadow-lg select-none"
                />
              ) : (
                <p className="text-slate-500 text-xs">No screenshot image data found.</p>
              )}
            </div>

            {/* Metadata & Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-mono">
                {viewingScreenshotTx.accountNumber && (
                  <span className="block">Sender: {viewingScreenshotTx.accountNumber}</span>
                )}
                <span>Ref: {viewingScreenshotTx.reference || '—'} • Date: {new Date(viewingScreenshotTx.createdAt).toLocaleString()}</span>
              </div>

              {viewingScreenshotTx.status === 'pending' ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      handleTransactionAction(viewingScreenshotTx.id, 'approve');
                      setViewingScreenshotTx(null);
                    }}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleTransactionAction(viewingScreenshotTx.id, 'reject');
                      setViewingScreenshotTx(null);
                    }}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              ) : (
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                  viewingScreenshotTx.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  Status: {viewingScreenshotTx.status}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
