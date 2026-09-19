import React, { useState, useEffect } from 'react';
import { Sliders, CheckCircle, RefreshCw, RotateCcw, Eye, X, Flame, Bomb, Target, AlertOctagon, ShieldAlert, Sparkles, Search, Users, Calendar, UserCheck, Copy, Check, Mail, Clock, ShieldCheck, AtSign } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('cashier'); // 'cashier' | 'game_controls' | 'settings' | 'users'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Screenshot viewer state
  const [viewingScreenshotTx, setViewingScreenshotTx] = useState(null);

  // Live Game Controls state
  const [aviatorStatus, setAviatorStatus] = useState(null);
  const [forcedMultiplierInput, setForcedMultiplierInput] = useState('');
  const [minesStatus, setMinesStatus] = useState({ sessions: [], riggingConfig: {} });

  const handleResetAllData = async () => {
    if (!window.confirm('⚠️ Confirm Reset to 0: Total Wagered, Payouts, House Profit, Transactions, aur Balances fresh 0 ho jayenge. Proceed?')) {
      return;
    }
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/reset-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        fetchAdminData();
        setMessage({ type: 'success', text: '✅ Platform data & stats successfully reset to 0 (Fresh Start)!' });
        setTimeout(() => setMessage(null), 4000);
        if (onBalanceUpdate) onBalanceUpdate(0);
      } else {
        alert(data.error || 'Failed to reset platform data');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(500);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('luckywin_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const safeFetch = async (url) => {
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return null;
          const ct = res.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            return await res.json();
          }
        } catch (e) {}
        return null;
      };

      const [statsData, txData, usersData] = await Promise.all([
        safeFetch('/api/admin/stats'),
        safeFetch('/api/admin/transactions'),
        safeFetch('/api/admin/users')
      ]);

      if (statsData?.stats) setStats(statsData.stats);
      if (statsData?.settings) setSettings(statsData.settings);

      // Handle users merging (remote server + local storage registrations)
      let combinedUsers = (usersData && Array.isArray(usersData.users)) ? [...usersData.users] : [];
      const localUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');

      localUsers.forEach(lu => {
        const uEmail = (lu.email || '').toLowerCase();
        const uName = (lu.username || '').toLowerCase();
        const matchIdx = combinedUsers.findIndex(u => 
          u.id === lu.id || 
          (uEmail && u.email && u.email.toLowerCase() === uEmail) ||
          (uName && u.username && u.username.toLowerCase() === uName)
        );
        if (matchIdx === -1) {
          combinedUsers.push({
            id: lu.id,
            username: lu.username,
            email: lu.email || '',
            role: lu.role || 'user',
            balance: lu.balance !== undefined ? lu.balance : 0.0,
            bonusBalance: lu.bonusBalance || 0.0,
            createdAt: lu.createdAt || new Date().toISOString(),
            lastLogin: lu.lastLogin || lu.createdAt || new Date().toISOString(),
            authProvider: lu.authProvider || lu.provider || (uEmail.includes('@gmail.com') ? 'google' : 'email'),
            picture: lu.picture || '',
            isBanned: !!lu.isBanned
          });
        } else {
          const existing = combinedUsers[matchIdx];
          if (!existing.email && lu.email) existing.email = lu.email;
          if (!existing.lastLogin && lu.lastLogin) existing.lastLogin = lu.lastLogin;
          if (!existing.authProvider && (lu.authProvider || lu.provider)) {
            existing.authProvider = lu.authProvider || lu.provider;
          }
          if (!existing.picture && lu.picture) existing.picture = lu.picture;
        }
      });

      // Default demo accounts if empty
      if (combinedUsers.length === 0) {
        combinedUsers = [
          {
            id: 'usr_saqib_admin',
            username: 'saqib_admin',
            email: '60secscriptdoc@gmail.com',
            role: 'admin',
            balance: 100000.0,
            bonusBalance: 0.0,
            createdAt: '2026-09-18T00:00:00.000Z',
            lastLogin: new Date().toISOString(),
            authProvider: 'google',
            isBanned: false
          },
          {
            id: 'usr_demo',
            username: 'LuckyPlayer',
            email: 'player@example.com',
            role: 'user',
            balance: 0.0,
            bonusBalance: 0.0,
            createdAt: '2026-09-18T00:00:00.000Z',
            lastLogin: new Date().toISOString(),
            authProvider: 'email',
            isBanned: false
          }
        ];
      }

      setUsersList(combinedUsers);

      // If local users exist, background sync to server
      if (localUsers.length > 0 && token) {
        fetch('/api/admin/sync-users', {
          method: 'POST',
          headers,
          body: JSON.stringify({ users: localUsers })
        }).catch(() => {});
      }

      // Handle transactions merging
      let combinedTx = (txData && Array.isArray(txData.transactions)) ? [...txData.transactions] : [];
      const localTx = JSON.parse(localStorage.getItem('luckywin_local_transactions') || '[]');
      localTx.forEach(lt => {
        if (!combinedTx.some(t => t.id === lt.id)) {
          combinedTx.unshift(lt);
        }
      });
      setTransactions(combinedTx);

      // Overview fallback stats
      if (!statsData?.stats) {
        const totalWagered = parseFloat(localStorage.getItem('luckywin_stat_wagered') || '0');
        const totalPayouts = parseFloat(localStorage.getItem('luckywin_stat_payouts') || '0');
        setStats({
          totalWagered,
          totalPayouts,
          grossGamingRevenue: totalWagered - totalPayouts,
          activeUsers: combinedUsers.length
        });
      }
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Poll real-time game status when game_controls tab is active
  useEffect(() => {
    if (activeTab !== 'game_controls') return;

    const fetchGameControlData = async () => {
      try {
        const token = localStorage.getItem('luckywin_token');
        const headers = { Authorization: `Bearer ${token}` };

        const [aviatorRes, minesRes] = await Promise.all([
          fetch('/api/admin/game-control/aviator', { headers }),
          fetch('/api/admin/game-control/mines', { headers })
        ]);

        if (aviatorRes.ok) {
          const avData = await aviatorRes.json();
          setAviatorStatus(avData);
        }
        if (minesRes.ok) {
          const mData = await minesRes.json();
          setMinesStatus(mData);
        }
      } catch (err) {
        console.error('Error polling game controls:', err);
      }
    };

    fetchGameControlData();
    const interval = setInterval(fetchGameControlData, 800);
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleCrashNow = async () => {
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/game-control/aviator/crash-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `🚨 ${data.message}` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        alert(data.error || 'Failed to trigger crash');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetForcedMultiplier = async (val) => {
    const target = val || forcedMultiplierInput;
    if (!target) return;
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/game-control/aviator/set-multiplier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ multiplier: target })
      });
      const data = await res.json();
      if (res.ok) {
        setForcedMultiplierInput('');
        setMessage({ type: 'success', text: `🎯 ${data.message}` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        alert(data.error || 'Failed to set multiplier');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetAviatorMode = async (mode) => {
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/game-control/aviator/mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `⚙️ ${data.message}` });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetMinesRigging = async (mode, targetUserId = null, forceBomb = false) => {
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/game-control/mines/rig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mode, userId: targetUserId, forceBomb })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: forceBomb
            ? `💣 Forced bomb activated on next click for player!`
            : `⚙️ Mines rigging policy updated to: ${mode}`
        });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Game Settings & House Edge updated successfully!' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleTransactionAction = async (txId, action) => {
    try {
      const token = localStorage.getItem('luckywin_token');
      await fetch(`/api/admin/transactions/${txId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
    } catch (err) {}

    // Immediate local update fallback
    const localTx = JSON.parse(localStorage.getItem('luckywin_local_transactions') || '[]');
    const idx = localTx.findIndex(t => t.id === txId);
    if (idx !== -1) {
      localTx[idx].status = action === 'approve' ? 'approved' : 'rejected';
      localStorage.setItem('luckywin_local_transactions', JSON.stringify(localTx));

      // If approved deposit, credit user balance
      if (action === 'approve' && localTx[idx].type === 'deposit') {
        const localUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');
        const uIdx = localUsers.findIndex(u => u.id === localTx[idx].userId || u.username === localTx[idx].username);
        if (uIdx !== -1) {
          localUsers[uIdx].balance = (localUsers[uIdx].balance || 0) + Number(localTx[idx].amount || 0);
          localStorage.setItem('luckywin_local_users', JSON.stringify(localUsers));
        }
      }
    }

    fetchAdminData();
    setMessage({ type: 'success', text: `Transaction #${txId} was ${action}d!` });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUserBalanceAdjust = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    const delta = Number(adjustAmount);
    try {
      const token = localStorage.getItem('luckywin_token');
      await fetch(`/api/admin/users/${selectedUser.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'adjust_balance',
          amount: delta
        })
      });
    } catch (err) {}

    // Immediate local cache update
    const localUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');
    const idx = localUsers.findIndex(u => u.id === selectedUser.id || u.username === selectedUser.username);
    const newBal = Math.max(0, parseFloat(((selectedUser.balance || 0) + delta).toFixed(2)));
    if (idx !== -1) {
      localUsers[idx].balance = newBal;
      localStorage.setItem('luckywin_local_users', JSON.stringify(localUsers));
    } else {
      localUsers.push({ ...selectedUser, balance: newBal });
      localStorage.setItem('luckywin_local_users', JSON.stringify(localUsers));
    }

    setUsersList(prev => prev.map(u => u.id === selectedUser.id ? { ...u, balance: newBal } : u));
    if (selectedUser.id === user?.id && onBalanceUpdate) {
      onBalanceUpdate(newBal);
    }
    setSelectedUser(null);
    setMessage({ type: 'success', text: `Balance updated: ${selectedUser.username} now has PKR ${newBal.toLocaleString()}` });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleToggleBan = async (userId, currentBanned) => {
    try {
      const token = localStorage.getItem('luckywin_token');
      await fetch(`/api/admin/users/${userId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          isBanned: !currentBanned
        })
      });
    } catch (err) {}

    const localUsers = JSON.parse(localStorage.getItem('luckywin_local_users') || '[]');
    const idx = localUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      localUsers[idx].isBanned = !currentBanned;
      localStorage.setItem('luckywin_local_users', JSON.stringify(localUsers));
    }
    setUsersList(prev => prev.map(u => u.id === userId ? { ...u, isBanned: !currentBanned } : u));
    setMessage({ type: 'success', text: `User account status updated: ${!currentBanned ? 'BANNED' : 'ACTIVE'}` });
    setTimeout(() => setMessage(null), 3000);
  };

  const pendingTxCount = transactions.filter(t => t.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0e131f] border border-amber-500/30 p-6 rounded-3xl shadow-xl">
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
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 transition-colors"
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
        <div className="bg-[#0e131f] border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Total Wagered</span>
          <span className="text-xl font-black text-white font-mono mt-1 block">
            PKR {stats?.totalWagered?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-cyan-400 mt-1 block">Accumulated gross bets</span>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Total Payouts</span>
          <span className="text-xl font-black text-white font-mono mt-1 block">
            PKR {stats?.totalPayouts?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 block">Players won balance</span>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">House GGR (Profit)</span>
          <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
            PKR {stats?.grossGamingRevenue?.toLocaleString() || '0'}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">Net Platform Profit</span>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 font-semibold uppercase block">Pending Cashier Requests</span>
          <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
            {pendingTxCount} Pending
          </span>
          <span className="text-[10px] text-amber-300 mt-1 block">Requires manual approval</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-[#0e131f] p-1.5 rounded-2xl border border-slate-800 gap-2">
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
          Live Game Controls
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
        <div className="bg-[#0e131f] border border-slate-800 rounded-3xl p-5 shadow-xl overflow-x-auto">
          <h2 className="text-base font-black text-white mb-4">Cashier Deposits & Withdrawals Desk</h2>
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No cashier transactions logged.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
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

      {/* TAB: LIVE GAME CONTROLS & RIGGING (AVIATOR & MINES) */}
      {activeTab === 'game_controls' && (
        <div className="space-y-6">
          
          {/* ================= 1. AVIATOR CONTROLS ================= */}
          <div className="bg-[#0e131f] border border-rose-500/30 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    Aviator Real-Time Crash Control
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono ${
                      aviatorStatus?.state === 'FLYING'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                        : aviatorStatus?.state === 'WAITING'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}>
                      {aviatorStatus?.state || 'CONNECTING...'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live flight status, instant manual crash trigger, and round multiplier override
                  </p>
                </div>
              </div>

              {/* Current Multiplier Display */}
              <div className="bg-[#090c13] border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Live Multiplier</span>
                  <span className="text-2xl font-black font-mono text-white tracking-wider">
                    {aviatorStatus?.state === 'FLYING'
                      ? `${aviatorStatus?.currentMultiplier}x`
                      : aviatorStatus?.state === 'WAITING'
                      ? `${aviatorStatus?.countdown}s (wait)`
                      : `${aviatorStatus?.crashedAt}x (crashed)`}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Active Bets</span>
                  <span className="text-sm font-bold font-mono text-cyan-400">
                    {aviatorStatus?.totalBets || 0} ({aviatorStatus?.realBets?.length || 0} players)
                  </span>
                </div>
              </div>
            </div>

            {/* EMERGENCY CRASH NOW BUTTON */}
            <div className="bg-gradient-to-r from-rose-950/40 via-red-900/20 to-[#0e131f] border border-rose-500/40 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-sm font-black text-rose-300 uppercase tracking-wide flex items-center justify-center sm:justify-start gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                  Manual Flight Interception
                </span>
                <p className="text-xs text-slate-400">
                  {aviatorStatus?.state === 'FLYING'
                    ? 'Plane is currently in mid-air flight! Click below to immediately trigger an instant bust crash.'
                    : 'Plane is not flying right now. Clicking will force the upcoming flight to crash immediately upon takeoff (1.01x).'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCrashNow}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-sm tracking-wide shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Flame className="w-5 h-5 text-amber-300 animate-bounce" />
                🚨 CRASH JAYAZ NOW!
              </button>
            </div>

            {/* SET SPECIFIC MULTIPLIER FOR NEXT ROUND */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#090c13] border border-slate-800 p-4 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-cyan-400" />
                  Force Next Round Crash Multiplier
                </span>
                <p className="text-[11px] text-slate-400">
                  Pre-determine exactly at what multiplier the next flight will crash.
                </p>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    value={forcedMultiplierInput}
                    onChange={(e) => setForcedMultiplierInput(e.target.value)}
                    placeholder="e.g. 1.15, 1.50, 2.00"
                    className="flex-1 bg-[#121622] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleSetForcedMultiplier()}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-colors"
                  >
                    Set Multiplier
                  </button>
                </div>

                {/* Quick Multiplier Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[1.05, 1.12, 1.25, 1.50, 2.00, 3.50, 5.00, 10.00].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleSetForcedMultiplier(val)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold text-slate-300 hover:text-white border border-slate-700 transition-colors"
                    >
                      {val.toFixed(2)}x
                    </button>
                  ))}
                </div>

                {aviatorStatus?.forcedCrashMultiplier && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Next round locked to crash at: <strong>{aviatorStatus.forcedCrashMultiplier}x</strong></span>
                  </div>
                )}
              </div>

              {/* AUTOMATIC RIGGING POLICIES */}
              <div className="bg-[#090c13] border border-slate-800 p-4 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Aviator Rigging Policy Mode
                </span>
                <p className="text-[11px] text-slate-400">
                  Select a standing automated policy for ongoing rounds.
                </p>

                <div className="space-y-2">
                  {[
                    { id: 'fair', label: 'Provably Fair (Standard RNG)', desc: 'Natural random distribution based on house edge RTP.' },
                    { id: 'house_win', label: 'House Win Mode (Bust 1.02x - 1.25x)', desc: 'Always crashes early so platform captures players bets.' },
                    { id: 'high_run', label: 'High Run Bait Mode (10x - 35x)', desc: 'Allows massive flights to build hype & excitement.' }
                  ].map(m => (
                    <div
                      key={m.id}
                      onClick={() => handleSetAviatorMode(m.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        aviatorStatus?.riggingMode === m.id
                          ? 'bg-[#151c2e] border-amber-500 text-white shadow-sm'
                          : 'bg-[#0e121a] border-slate-800 text-slate-400 hover:bg-[#121622]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white leading-tight">{m.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                        aviatorStatus?.riggingMode === m.id ? 'border-amber-500 bg-amber-500' : 'border-slate-700'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ================= 2. MINES CONTROLS ================= */}
          <div className="bg-[#0e131f] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
                  <Bomb className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    Mines Game Control & Radar Rigging
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono">
                      {minesStatus?.sessions?.length || 0} Active Players
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live player board radar, hidden mine inspector, and instant kill-switch bomb trigger
                  </p>
                </div>
              </div>

              {/* Global Policy Selector */}
              <div className="flex items-center gap-2 bg-[#090c13] border border-slate-800 p-1 rounded-xl text-xs">
                <span className="text-[11px] font-bold text-slate-400 pl-2">Global Policy:</span>
                {[
                  { id: 'fair', label: 'Fair' },
                  { id: 'trap_click_2', label: 'Trap @ Click 2' },
                  { id: 'trap_click_3', label: 'Trap @ Click 3' },
                  { id: 'always_bomb', label: 'Always Bomb' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSetMinesRigging(p.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      minesStatus?.riggingConfig?.globalMode === p.id
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Mines Sessions List */}
            {minesStatus?.sessions?.length === 0 ? (
              <div className="bg-[#090c13] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2">
                <Bomb className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-400">No active Mines game sessions right now.</p>
                <p className="text-[11px] text-slate-600">When players launch Mines and pick tiles, their live boards and hidden mine locations will appear here in real-time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {minesStatus?.sessions?.map(sess => (
                  <div key={sess.userId} className="bg-[#090c13] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-black text-white">{sess.username}</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Bet: <strong className="text-white">PKR {sess.betAmount}</strong> • {sess.minesCount} Mines • Multiplier: <strong className="text-[#00c638]">{sess.currentMultiplier}x</strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSetMinesRigging(null, sess.userId, !sess.isForcedBombNext)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition-all ${
                          sess.isForcedBombNext
                            ? 'bg-rose-600 text-white animate-pulse'
                            : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                        }`}
                      >
                        <Bomb className="w-3.5 h-3.5" />
                        {sess.isForcedBombNext ? 'Bomb Armed on Next Click!' : 'Force Bomb on Next Click'}
                      </button>
                    </div>

                    {/* 5x5 Minefield Radar Grid */}
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-bold mb-1.5">
                        Live Board Radar (Green: Revealed Safe | Red: Hidden Mine)
                      </span>
                      <div className="grid grid-cols-5 gap-1 w-48 mx-auto">
                        {Array.from({ length: 25 }, (_, idx) => {
                          const isRevealed = sess.revealedTiles.includes(idx);
                          const isMine = sess.minePositions.includes(idx);
                          return (
                            <div
                              key={idx}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border ${
                                isRevealed
                                  ? 'bg-[#00c638]/25 border-[#00c638] text-[#00c638]'
                                  : isMine
                                  ? 'bg-rose-500/25 border-rose-500/50 text-rose-400'
                                  : 'bg-[#121622] border-slate-800 text-slate-600'
                              }`}
                              title={isMine ? 'Mine Location' : isRevealed ? 'Revealed Safe' : 'Unrevealed Safe'}
                            >
                              {isRevealed ? '💎' : isMine ? '💣' : idx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: HOUSE EDGE & RTP SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-[#0e131f] border border-slate-800 rounded-3xl p-6 shadow-xl max-w-2xl">
          <h2 className="text-base font-black text-white mb-2">Configure Game Economics & Risk</h2>
          <p className="text-xs text-slate-400 mb-6">
            Adjust the House Edge to control operator profit margins. Changes apply immediately to subsequent game rounds.
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
                max="15"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white"
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white"
              />
            </div>

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
          <div className="bg-[#0e131f] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-5">
            {/* Header with Title & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
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
                  className="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Sync
                </button>
              </div>
            </div>

            {/* Quick Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#090c13] border border-slate-800 p-3.5 rounded-2xl">
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
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1 border-b border-slate-800/80">
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
                      : 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Players Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
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
                              onClick={() => { setSelectedUser(u); setAdjustAmount(500); }}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-bold text-[11px] transition-colors shadow"
                            >
                              Adjust Balance
                            </button>
                            {u.role !== 'admin' && (
                              <button
                                onClick={() => handleToggleBan(u.id, u.isBanned)}
                                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors shadow ${
                                  u.isBanned ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white' : 'bg-rose-600/80 hover:bg-rose-600 text-white'
                                }`}
                              >
                                {u.isBanned ? 'Unban' : 'Ban'}
                              </button>
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
          <div className="bg-[#0e131f] border border-slate-800 rounded-3xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-black text-white mb-2">Adjust Balance for {selectedUser.username}</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter positive amount to credit, or negative to debit.
            </p>
            <form onSubmit={handleUserBalanceAdjust} className="space-y-3">
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                >
                  Apply Balance
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
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
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
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
            <div className="flex-1 overflow-auto bg-[#07090e] border border-slate-800/80 rounded-2xl p-2 flex items-center justify-center min-h-[280px] max-h-[52vh]">
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
