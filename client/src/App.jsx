import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import CrashGame from './components/CrashGame';
import MinesGame from './components/MinesGame';
import GamesLobby from './components/GamesLobby';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';
import CashierModal from './components/CashierModal';
import ProvablyFairModal from './components/ProvablyFairModal';
import { ShieldCheck, Lock, Flame, ChevronRight, Gamepad2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('crash'); // 'crash' | 'mines' | 'lobby' | 'admin'
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(2500.0);
  const [socket, setSocket] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Modals
  const [authModal, setAuthModal] = useState({ isOpen: false, mode: 'login' });
  const [cashierModal, setCashierModal] = useState({ isOpen: false, tab: 'deposit' });
  const [fairModal, setFairModal] = useState(false);

  // Connect socket and load user
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.origin.includes('localhost:3000') ? 'http://localhost:5000' : window.location.origin);
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    const token = localStorage.getItem('luckywin_token');
    if (token) {
      fetch(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setUser(data.user);
            setBalance(data.user.balance);
          } else {
            localStorage.removeItem('luckywin_token');
          }
        })
        .catch(console.error);
    }

    return () => newSocket.close();
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setBalance(userData.balance);
  };

  const handleLogout = () => {
    localStorage.removeItem('luckywin_token');
    setUser(null);
    setBalance(0);
    setActiveTab('crash');
  };

  const handleBalanceUpdate = (newBalance) => {
    setBalance(newBalance);
  };

  return (
    <div className="min-h-screen bg-[#0a0c14] text-slate-100 flex font-sans selection:bg-[#1a68ff] selection:text-white relative">
      
      {/* SkyWin Collapsible Left Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (window.innerWidth < 1024) setSidebarOpen(false);
        }}
        onOpenCashier={(tab) => setCashierModal({ isOpen: true, tab })}
        onOpenProvablyFair={() => setFairModal(true)}
        user={user}
      />

      {/* Mobile Backdrop for Sidebar */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/75 z-45 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* SkyWin Header Navbar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          balance={balance}
          onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
          onLogout={handleLogout}
          onOpenCashier={(tab) => setCashierModal({ isOpen: true, tab })}
          onOpenProvablyFair={() => setFairModal(true)}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />

        {/* Main Route Content */}
        <main className="flex-1">
          {activeTab === 'crash' && (
            <div>
              {/* Aviator X Flight Arena */}
              <CrashGame
                socket={socket}
                user={user}
                balance={balance}
                onBalanceUpdate={handleBalanceUpdate}
                onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
              />

              {/* In-Lobby Games Carousel right below Aviator */}
              <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#1a68ff]/10 border border-[#1a68ff]/20 text-[#1a68ff]">
                      <Gamepad2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-heading font-black text-lg sm:text-xl text-white">
                        Recommended SkyWin Games
                      </h2>
                      <p className="text-xs text-slate-400">
                        Explore other high-multiplier provably fair games
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('lobby')}
                    className="flex items-center gap-1 text-xs font-heading font-bold text-[#38bdf8] hover:text-white transition-colors"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <GamesLobby onSelectGame={(gameId) => setActiveTab(gameId)} />
              </div>
            </div>
          )}

          {activeTab === 'mines' && (
            <div className="py-4">
              <MinesGame
                user={user}
                balance={balance}
                onBalanceUpdate={handleBalanceUpdate}
                onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
              />

              <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
                <GamesLobby onSelectGame={(gameId) => setActiveTab(gameId)} />
              </div>
            </div>
          )}

          {activeTab === 'lobby' && (
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#16223b] border border-[#203254] text-[#38bdf8] text-xs font-heading font-bold mb-2">
                  <Flame className="w-3.5 h-3.5 text-[#ff1a40]" />
                  <span>OFFICIAL PROVABLY FAIR GAMES</span>
                </div>
                <h1 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">
                  SkyWin Games Lobby
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Enjoy instantaneous payouts, 97-98.5% RTP, and cryptographically verified fairness.
                </p>
              </div>

              <GamesLobby onSelectGame={(gameId) => setActiveTab(gameId)} />
            </div>
          )}

          {activeTab === 'admin' && user?.role === 'admin' && (
            <AdminDashboard
              user={user}
              onBalanceUpdate={handleBalanceUpdate}
            />
          )}
        </main>

        {/* SKYWIN Official Footer */}
        <footer className="border-t border-[#182035] bg-[#080c14] py-8 px-4 text-xs text-slate-500 mt-10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-heading font-black text-sm text-white">SKYWIN</span>
              <span>•</span>
              <span>Official Gaming Portal</span>
              <span>•</span>
              <span className="text-[#ffbe18] font-bold">18+ Only</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-slate-400 text-xs">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00d632]" />
                <span>Provably Fair SHA-256</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#1a68ff]" />
                <span>256-Bit SSL Encrypted</span>
              </div>
              <button
                onClick={() => setFairModal(true)}
                className="text-[#38bdf8] hover:underline font-heading font-bold"
              >
                Verify Seed
              </button>
            </div>
          </div>
        </footer>

      </div>

      {/* Modals */}
      <AuthModal
        isOpen={authModal.isOpen}
        initialMode={authModal.mode}
        onClose={() => setAuthModal({ isOpen: false, mode: 'login' })}
        onAuthSuccess={handleAuthSuccess}
      />

      <CashierModal
        isOpen={cashierModal.isOpen}
        initialTab={cashierModal.tab}
        user={user}
        onClose={() => setCashierModal({ isOpen: false, tab: 'deposit' })}
        onBalanceUpdate={handleBalanceUpdate}
      />

      <ProvablyFairModal
        isOpen={fairModal}
        onClose={() => setFairModal(false)}
      />

    </div>
  );
}
