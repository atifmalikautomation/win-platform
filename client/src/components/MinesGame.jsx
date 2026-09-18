import React, { useState, useEffect } from 'react';
import { Bomb, Gem } from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundFx } from '../utils/soundEffects';

export default function MinesGame({ user, balance, onBalanceUpdate, onOpenAuth }) {
  const [betAmount, setBetAmount] = useState(100);
  const [minesCount, setMinesCount] = useState(3);
  const [inGame, setInGame] = useState(false);
  const [revealedTiles, setRevealedTiles] = useState([]);
  const [minePositions, setMinePositions] = useState([]);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.00);
  const [nextMultiplier, setNextMultiplier] = useState(1.13);
  const [loading, setLoading] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [message, setMessage] = useState(null);

  // Check active game on mount
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('luckywin_token');
    if (!token) return;

    fetch('/api/mines/active', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.hasActiveGame) {
          setInGame(true);
          setBetAmount(data.betAmount);
          setMinesCount(data.minesCount);
          setRevealedTiles(data.revealedTiles);
          setCurrentMultiplier(data.currentMultiplier);
          setNextMultiplier(data.nextMultiplier);
        }
      })
      .catch(console.error);
  }, [user]);

  const handleStartGame = async () => {
    if (!user) return onOpenAuth('login');
    const numBet = Number(betAmount);
    if (isNaN(numBet) || numBet < 10) {
      setMessage({ type: 'error', text: 'Minimum bet amount is PKR 10' });
      return;
    }
    if (numBet > balance) {
      setMessage({ type: 'error', text: 'Insufficient balance! Please deposit to play.' });
      return;
    }

    soundFx.playBet();
    setLoading(true);
    setMessage(null);
    setExploded(false);
    setMinePositions([]);

    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/mines/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          betAmount: Number(betAmount),
          minesCount: Number(minesCount)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start game');

      setInGame(true);
      setRevealedTiles([]);
      setCurrentMultiplier(1.00);
      setNextMultiplier(data.nextMultiplier);
      onBalanceUpdate(data.newBalance);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTileClick = async (index) => {
    if (!inGame || revealedTiles.includes(index) || loading || exploded) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/mines/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tileIndex: index })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reveal tile');

      if (data.exploded) {
        setExploded(true);
        setInGame(false);
        setMinePositions(data.minePositions || []);
        soundFx.playCrash();
        setMessage({ type: 'error', text: 'You hit a mine. Round lost.' });
      } else {
        setRevealedTiles(data.revealedTiles);
        setCurrentMultiplier(data.currentMultiplier);
        setNextMultiplier(data.nextMultiplier);
        soundFx.playGem();

        if (data.isCleared) {
          setInGame(false);
          setMinePositions(data.minePositions || []);
          onBalanceUpdate(data.newBalance);
          soundFx.playCashout();
          setMessage({ type: 'success', text: data.message });
          confetti({ particleCount: 80, spread: 70 });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCashout = async () => {
    if (!inGame || revealedTiles.length === 0 || loading) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('luckywin_token');
      const res = await fetch('/api/mines/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cash out');

      setInGame(false);
      setMinePositions(data.minePositions || []);
      onBalanceUpdate(data.newBalance);
      soundFx.playCashout();
      setMessage({ type: 'success', text: `Cashed out successfully: PKR ${data.payout}` });
      confetti({ particleCount: 70, spread: 60 });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const currentPayout = (betAmount * currentMultiplier).toFixed(2);
  const nextPayout = (betAmount * nextMultiplier).toFixed(2);
  const chips = [50, 100, 500, 1000];

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 animate-fadeIn">
      
      {/* Header Bar */}
      <div className="bg-[#12151d] p-3.5 sm:p-4 rounded-2xl border border-[#1c212e] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00c638]/15 border border-[#00c638]/30 flex items-center justify-center text-[#00c638]">
            <Gem className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white font-heading leading-tight">
              Mines 5x5
            </h1>
            <p className="text-xs text-slate-400 font-medium">Uncover safe gems & cash out</p>
          </div>
        </div>

        {inGame && (
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-heading">Multiplier</span>
            <span className="text-2xl font-bold text-[#00c638] font-mono leading-none">{currentMultiplier.toFixed(2)}x</span>
          </div>
        )}
      </div>

      {/* Main Grid & Control Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Left: Betting Controls */}
        <div className="bg-[#12151d] border border-[#1c212e] rounded-2xl p-4 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3.5">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider font-heading">
                Bet Amount (PKR)
              </span>
              <div className="relative">
                <input
                  type="number"
                  disabled={inGame}
                  min="10"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="w-full bg-[#0b0e15] border border-[#1c212e] focus:border-[#00c638] rounded-xl px-3 py-2 text-sm font-bold text-white font-mono focus:outline-none"
                />
              </div>
              
              {/* Quick chips */}
              <div className="grid grid-cols-4 gap-1 mt-1.5">
                {chips.map(amt => (
                  <button
                    key={amt}
                    type="button"
                    disabled={inGame}
                    onClick={() => {
                      soundFx.playBet();
                      setBetAmount(amt);
                    }}
                    className="py-1 rounded-lg bg-[#0b0e15] hover:bg-[#181d28] border border-[#181d28] text-[11px] font-bold text-slate-300 font-mono transition-colors"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-heading">
                  Mines: {minesCount}
                </span>
                <span className="text-[10px] font-bold text-slate-400 font-heading">
                  {25 - minesCount} Gems
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {[1, 3, 5, 10, 20].map(m => (
                  <button
                    key={m}
                    type="button"
                    disabled={inGame}
                    onClick={() => {
                      soundFx.playBet();
                      setMinesCount(m);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      minesCount === m
                        ? 'bg-[#1a68ff] text-white'
                        : 'bg-[#0b0e15] border border-[#1c212e] text-slate-400 hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            {!inGame ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleStartGame}
                className="btn-bet-green w-full py-3 rounded-xl font-heading font-black text-sm tracking-wide disabled:opacity-50"
              >
                {loading ? 'Starting...' : `Start (PKR ${betAmount})`}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || revealedTiles.length === 0}
                onClick={handleCashout}
                className="btn-cashout-gold w-full py-3 rounded-xl font-heading font-black text-sm tracking-wide disabled:opacity-40"
              >
                Cash Out (PKR {currentPayout})
              </button>
            )}

            {inGame && (
              <div className="bg-[#0b0e15] p-2.5 rounded-xl border border-[#181d28] text-xs space-y-1">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Gems Uncovered:</span>
                  <span className="font-bold text-white font-mono">{revealedTiles.length} / {25 - minesCount}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Next Gem Value:</span>
                  <span className="font-bold text-[#00c638] font-mono">{nextMultiplier.toFixed(2)}x (+{nextPayout})</span>
                </div>
              </div>
            )}

            {message && (
              <div className={`p-2.5 rounded-xl text-xs font-bold text-center ${
                message.type === 'success' ? 'bg-[#00c638]/15 border border-[#00c638]/30 text-[#00c638]' : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              }`}>
                {message.text}
              </div>
            )}
          </div>
        </div>

        {/* Right: 5x5 Mines Board */}
        <div className="md:col-span-2 bg-[#090b12] border border-[#1c212e] rounded-2xl p-4 sm:p-6 flex items-center justify-center">
          <div className="grid grid-cols-5 gap-2 w-full max-w-[390px] aspect-square">
            {Array.from({ length: 25 }, (_, i) => {
              const isRevealed = revealedTiles.includes(i);
              const isMine = minePositions.includes(i);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!inGame || isRevealed || loading || exploded}
                  onClick={() => handleTileClick(i)}
                  className={`rounded-xl flex items-center justify-center transition-all select-none ${
                    isRevealed
                      ? 'bg-[#00c638]/20 border border-[#00c638] text-[#00c638] scale-[0.96]'
                      : isMine
                      ? 'bg-rose-500/20 border border-rose-500 text-rose-400'
                      : inGame
                      ? 'bg-[#141824] hover:bg-[#1a2133] border border-[#1e273d] active:scale-95 cursor-pointer'
                      : 'bg-[#0e121c] border border-[#181f30] opacity-60 cursor-not-allowed'
                  }`}
                >
                  {isRevealed && <Gem className="w-7 h-7 stroke-[2]" />}
                  {isMine && !isRevealed && <Bomb className="w-7 h-7 stroke-[2]" />}
                </button>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
