import React, { useState, useEffect, useRef } from 'react';
import { Shield, Trophy, Minus, Plus, HelpCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundFx } from '../utils/soundEffects';
import HowToPlayModal from './HowToPlayModal';

export default function CrashGame({ socket, user, balance, onBalanceUpdate, onOpenAuth }) {
  // Game State from Socket
  const [gameState, setGameState] = useState('WAITING'); // 'WAITING' | 'STARTING' | 'FLYING' | 'CRASHED'
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown] = useState(5.0);
  const [history, setHistory] = useState([1.45, 2.80, 1.10, 14.50, 3.20, 1.95, 5.80, 1.05, 32.10, 2.15, 8.40, 1.72]);
  const [bets, setBets] = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState(1842);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [crashedAt, setCrashedAt] = useState(null);
  const [activeBetsTab, setActiveBetsTab] = useState('all'); // 'all' | 'my' | 'top'
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // User Bet Panels (Panel 1 & Panel 2 for dual betting)
  const [bet1, setBet1] = useState({
    amount: 100,
    tab: 'bet',
    autoCashoutEnabled: false,
    autoCashout: 2.00,
    placedBet: null,
    hasCashedOut: false,
    cashoutPayout: 0,
    cashoutMultiplier: 0
  });

  const [bet2, setBet2] = useState({
    amount: 200,
    tab: 'bet',
    autoCashoutEnabled: false,
    autoCashout: 3.00,
    placedBet: null,
    hasCashedOut: false,
    cashoutPayout: 0,
    cashoutMultiplier: 0
  });

  const lastCountdownSec = useRef(4);
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const flyingMultiplierTextRef = useRef(null);

  // Smooth Multiplier Tracking (60 FPS monotonic advancement)
  const smoothMultiplierRef = useRef(1.00);
  const targetMultiplierRef = useRef(1.00);
  const flightStartTimeRef = useRef(0);
  const gameStateRef = useRef(gameState);
  const lastReactMultiplierUpdate = useRef(0);

  // Aviator Flew Away Fly-Off Animation
  const flewAwayPos = useRef({ x: 0, y: 0, isFlyingOff: false });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Setup Socket Listeners with Audio
  useEffect(() => {
    if (!socket) return;

    const handleStateChange = (data) => {
      setGameState(data.state);
      gameStateRef.current = data.state;
      if (data.history) setHistory(data.history);
      if (data.bets) setBets(data.bets);
      if (data.serverSeedHash) setServerSeedHash(data.serverSeedHash);
      if (data.onlinePlayers) setOnlinePlayers(data.onlinePlayers);

      if (data.state === 'WAITING') {
        setCountdown(data.countdown || 5.0);
        smoothMultiplierRef.current = 1.00;
        targetMultiplierRef.current = 1.00;
        setMultiplier(1.00);
        setCrashedAt(null);
        flewAwayPos.current.isFlyingOff = false;
        setBet1(prev => ({ ...prev, placedBet: null, hasCashedOut: false, cashoutPayout: 0 }));
        setBet2(prev => ({ ...prev, placedBet: null, hasCashedOut: false, cashoutPayout: 0 }));
      } else if (data.state === 'STARTING') {
        smoothMultiplierRef.current = 1.00;
        targetMultiplierRef.current = 1.00;
        setMultiplier(1.00);
        flewAwayPos.current.isFlyingOff = false;
      } else if (data.state === 'FLYING') {
        flightStartTimeRef.current = data.flightStartTime || Date.now();
        const curM = Math.max(1.00, data.currentMultiplier || 1.00);
        smoothMultiplierRef.current = curM;
        targetMultiplierRef.current = curM;
        flewAwayPos.current.isFlyingOff = false;
      } else if (data.state === 'CRASHED') {
        const cVal = data.crashedAt || data.currentMultiplier || smoothMultiplierRef.current;
        setCrashedAt(cVal);
        smoothMultiplierRef.current = cVal;
        targetMultiplierRef.current = cVal;
        setMultiplier(cVal);
        flewAwayPos.current.isFlyingOff = true;
      }
    };

    const handleWaitingTick = (data) => {
      setGameState('WAITING');
      gameStateRef.current = 'WAITING';
      setCountdown(data.countdown);
      if (data.onlinePlayers) setOnlinePlayers(data.onlinePlayers);

      const currentSec = Math.floor(data.countdown);
      if (currentSec !== lastCountdownSec.current && currentSec >= 1 && currentSec <= 3) {
        lastCountdownSec.current = currentSec;
        soundFx.playCountdownTick();
      }
    };

    const handleTick = (data) => {
      gameStateRef.current = 'FLYING';
      if (data.flightStartTime) flightStartTimeRef.current = data.flightStartTime;
      targetMultiplierRef.current = Math.max(targetMultiplierRef.current, data.multiplier);

      // Throttle React state updates to 10 FPS so dual bet panel live payout updates smoothly without causing React render lag
      const now = Date.now();
      if (now - lastReactMultiplierUpdate.current > 100) {
        lastReactMultiplierUpdate.current = now;
        setMultiplier(smoothMultiplierRef.current);
        if (data.onlinePlayers) setOnlinePlayers(data.onlinePlayers);
      }
    };

    const handleCrashed = (data) => {
      setGameState('CRASHED');
      gameStateRef.current = 'CRASHED';
      setCrashedAt(data.crashedAt);
      smoothMultiplierRef.current = data.crashedAt;
      targetMultiplierRef.current = data.crashedAt;
      setMultiplier(data.crashedAt);
      if (data.history) setHistory(data.history);
      if (data.onlinePlayers) setOnlinePlayers(data.onlinePlayers);

      soundFx.playCrash();
      flewAwayPos.current.isFlyingOff = true;
    };

    socket.on('crash:state_change', handleStateChange);
    socket.on('crash:waiting_tick', handleWaitingTick);
    socket.on('crash:tick', handleTick);
    socket.on('crash:crashed', handleCrashed);
    socket.on('crash:new_bet', (data) => {
      setBets(prev => [data.bet, ...prev]);
    });
    socket.on('crash:bet_cashed_out', (data) => {
      setBets(prev =>
        prev.map(b => (b.id === data.betId ? { ...b, cashedOut: true, cashoutMultiplier: data.multiplier, payout: data.payout } : b))
      );

      if (user && data.userId === user.id) {
        setBet1(prev => {
          if (prev.placedBet && prev.placedBet.id === data.betId) {
            return {
              ...prev,
              hasCashedOut: true,
              cashoutPayout: data.payout,
              cashoutMultiplier: data.multiplier
            };
          }
          return prev;
        });

        setBet2(prev => {
          if (prev.placedBet && prev.placedBet.id === data.betId) {
            return {
              ...prev,
              hasCashedOut: true,
              cashoutPayout: data.payout,
              cashoutMultiplier: data.multiplier
            };
          }
          return prev;
        });

        if (data.newBalance !== null && data.newBalance !== undefined) {
          onBalanceUpdate(data.newBalance);
        }

        soundFx.playCashout();
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
      }
    });

    socket.emit('crash:request_state');

    return () => {
      soundFx.stopFlightSound();
      socket.off('crash:state_change', handleStateChange);
      socket.off('crash:waiting_tick', handleWaitingTick);
      socket.off('crash:tick', handleTick);
      socket.off('crash:crashed', handleCrashed);
      socket.off('crash:new_bet');
      socket.off('crash:bet_cashed_out');
    };
  }, [socket, user, onBalanceUpdate]);

  // Offline/Standalone Crash Game Loop when Socket is not connected
  useEffect(() => {
    if (socket) return;

    let timer = null;
    let localRoundCrash = 2.0;

    const botNames = [
      'Shahid_99', 'AlexPro', 'CryptoKing', 'Zeeshan77', 'Vikram_G', 'Dragon_X',
      'Hamza_92', 'Sultan786', 'JackpotHunter', 'AliRaza', 'NeonRider', 'WinnerBro',
      'Farhan_K', 'SpeedDemon', 'Tariq_77', 'Elena_V', 'BabarFan', 'Omega_Bet'
    ];

    const generateRandomCrash = () => {
      const rand = Math.random();
      if (rand < 0.04) return 1.00;
      const point = parseFloat((0.96 / (1 - rand)).toFixed(2));
      return Math.min(100.0, Math.max(1.02, point));
    };

    const generateBotBets = () => {
      const count = Math.floor(Math.random() * 8) + 6;
      const list = [];
      for (let i = 0; i < count; i++) {
        const name = botNames[Math.floor(Math.random() * botNames.length)];
        const amt = [50, 100, 200, 500, 1000, 2000, 5000][Math.floor(Math.random() * 7)];
        const auto = Math.random() < 0.4 ? parseFloat((Math.random() * 3 + 1.2).toFixed(2)) : null;
        list.push({
          id: `bot_bet_${Date.now()}_${i}`,
          username: name,
          amount: amt,
          autoCashout: auto,
          cashedOut: false
        });
      }
      return list;
    };

    const startWaitingPhase = () => {
      setGameState('WAITING');
      gameStateRef.current = 'WAITING';
      smoothMultiplierRef.current = 1.00;
      targetMultiplierRef.current = 1.00;
      setMultiplier(1.00);
      setCrashedAt(null);
      flewAwayPos.current.isFlyingOff = false;
      setBet1(prev => ({ ...prev, placedBet: null, hasCashedOut: false, cashoutPayout: 0 }));
      setBet2(prev => ({ ...prev, placedBet: null, hasCashedOut: false, cashoutPayout: 0 }));
      setBets(generateBotBets());

      let count = 5.0;
      setCountdown(count);

      const waitInterval = setInterval(() => {
        count = Math.max(0, parseFloat((count - 0.5).toFixed(1)));
        setCountdown(count);
        if (count <= 3 && count > 0 && Math.floor(count) === count) {
          soundFx.playCountdownTick();
        }
        if (count <= 0) {
          clearInterval(waitInterval);
          startFlyingPhase();
        }
      }, 500);
      timer = waitInterval;
    };

    const startFlyingPhase = () => {
      localRoundCrash = generateRandomCrash();
      setGameState('FLYING');
      gameStateRef.current = 'FLYING';
      const flightStart = Date.now();
      flightStartTimeRef.current = flightStart;
      smoothMultiplierRef.current = 1.00;
      targetMultiplierRef.current = 1.00;
      setMultiplier(1.00);
      flewAwayPos.current.isFlyingOff = false;

      const flyInterval = setInterval(() => {
        const elapsedSec = (Date.now() - flightStart) / 1000;
        const currentM = parseFloat(Math.pow(Math.E, 0.072 * elapsedSec * 1.65).toFixed(2));
        targetMultiplierRef.current = currentM;
        smoothMultiplierRef.current = currentM;
        setMultiplier(currentM);

        // Auto cashout check for bet1 and bet2
        setBet1(prev => {
          if (prev.placedBet && !prev.hasCashedOut && prev.autoCashoutEnabled && currentM >= prev.autoCashout) {
            const payout = parseFloat((prev.placedBet.amount * prev.autoCashout).toFixed(2));
            onBalanceUpdate(balance + payout);
            soundFx.playCashout();
            confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
            return { ...prev, hasCashedOut: true, cashoutPayout: payout, cashoutMultiplier: prev.autoCashout };
          }
          return prev;
        });

        setBet2(prev => {
          if (prev.placedBet && !prev.hasCashedOut && prev.autoCashoutEnabled && currentM >= prev.autoCashout) {
            const payout = parseFloat((prev.placedBet.amount * prev.autoCashout).toFixed(2));
            onBalanceUpdate(balance + payout);
            soundFx.playCashout();
            confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
            return { ...prev, hasCashedOut: true, cashoutPayout: payout, cashoutMultiplier: prev.autoCashout };
          }
          return prev;
        });

        // Crash check
        if (currentM >= localRoundCrash) {
          clearInterval(flyInterval);
          handleLocalCrash(localRoundCrash);
        }
      }, 100);
      timer = flyInterval;
    };

    const handleLocalCrash = (crashedVal) => {
      setGameState('CRASHED');
      gameStateRef.current = 'CRASHED';
      setCrashedAt(crashedVal);
      smoothMultiplierRef.current = crashedVal;
      targetMultiplierRef.current = crashedVal;
      setMultiplier(crashedVal);
      flewAwayPos.current.isFlyingOff = true;
      soundFx.playCrash();
      setHistory(prev => [crashedVal, ...prev.slice(0, 11)]);

      // Wait 3.5s then start next waiting phase
      timer = setTimeout(() => {
        startWaitingPhase();
      }, 3500);
    };

    startWaitingPhase();

    return () => {
      clearInterval(timer);
      clearTimeout(timer);
    };
  }, [socket, balance, onBalanceUpdate]);


  // ==================== OFFICIAL AVIATOR RED AIRPLANE CANVAS ====================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.parentElement.clientWidth);
    let height = (canvas.height = canvas.parentElement.clientHeight || 450);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight || 450;
    };
    window.addEventListener('resize', handleResize);

    // Stars & Speed particles
    const stars = Array.from({ length: 50 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 1.5 + 0.5
    }));

    // Official Aviator Plane Sprite
    const planeImg = new Image();
    planeImg.src = '/aviator_plane.png';

    // Wing condensation trails
    const wingTrails = [];
    let propellerAngle = 0;
    let planeX = 60;
    let planeY = height - 70;

    const render = () => {
      propellerAngle += 0.5;
      const curState = gameStateRef.current;
      const wallNow = Date.now();
      const perfNow = performance.now();

      // Multiplier smooth continuous advance (60 FPS monotonic)
      if (curState === 'FLYING') {
        if (flightStartTimeRef.current > 0) {
          const elapsedSec = Math.max(0, (wallNow - flightStartTimeRef.current) / 1000);
          const theoreticalMult = Math.pow(Math.E, 0.072 * elapsedSec * 1.65);
          const target = Math.max(targetMultiplierRef.current, theoreticalMult);
          if (target > smoothMultiplierRef.current) {
            const step = Math.max(0.002, (target - smoothMultiplierRef.current) * 0.22);
            smoothMultiplierRef.current = Math.min(target, smoothMultiplierRef.current + step);
          }
        } else {
          if (targetMultiplierRef.current > smoothMultiplierRef.current) {
            smoothMultiplierRef.current += (targetMultiplierRef.current - smoothMultiplierRef.current) * 0.2;
          }
        }

        // Direct DOM update: buttery 60 FPS text without React overhead
        if (flyingMultiplierTextRef.current) {
          flyingMultiplierTextRef.current.textContent = smoothMultiplierRef.current.toFixed(2);
        }
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Aviator Deep Dark Red/Black Atmospheric Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#100b12');
      bgGrad.addColorStop(0.5, '#0c0910');
      bgGrad.addColorStop(1, '#08060a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const curMult = smoothMultiplierRef.current;

      // 2. Stars / Cosmic Dust
      stars.forEach(star => {
        if (curState === 'FLYING') {
          const speedFactor = Math.min(7.0, 1.6 + (curMult - 1.0) * 0.75);
          star.x -= star.speed * speedFactor;
          star.y += star.speed * 0.4;
        } else {
          star.x -= star.speed * 0.2;
        }

        if (star.x < -10) star.x = width + 10;
        if (star.y > height + 10) star.y = -5;

        ctx.fillStyle = '#64748b';
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // 3. Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 4. Flight Curve & Aerodynamic Plane Calculation
      const startX = 50;
      const startY = height - 65;

      // Cruising station coordinates (65% width, 36% height)
      const cruiseX = width * (width < 640 ? 0.62 : 0.68);
      const cruiseY = height * 0.36;

      // Takeoff ratio: from 1.00x to 2.20x
      const takeoffRatio = Math.min(1.0, Math.max(0, (curMult - 1.0) / 1.2));
      const takeoffEase = takeoffRatio * (2 - takeoffRatio); // easeOutQuad

      // Subtle aerodynamic hover breathing motion
      const hoverTime = perfNow * 0.0022;
      const hoverX = Math.cos(hoverTime * 1.1) * 4.5;
      const hoverY = Math.sin(hoverTime * 1.5) * 5.5;

      // Dynamic forward climb drift for higher multipliers
      const highMultExtraX = Math.min(width * 0.12, Math.max(0, (curMult - 2.2) * 1.5));
      const highMultExtraY = -Math.min(height * 0.10, Math.max(0, (curMult - 2.2) * 1.8));

      let targetX, targetY;
      if (curState === 'FLYING') {
        if (takeoffRatio < 1.0) {
          targetX = startX + (cruiseX - startX) * takeoffEase;
          targetY = startY - (startY - cruiseY) * takeoffEase;
        } else {
          targetX = cruiseX + highMultExtraX + hoverX;
          targetY = cruiseY + highMultExtraY + hoverY;
        }

        const lerpFactor = 0.18;
        planeX += (targetX - planeX) * lerpFactor;
        planeY += (targetY - planeY) * lerpFactor;
        flewAwayPos.current.x = planeX;
        flewAwayPos.current.y = planeY;
      } else if (curState === 'CRASHED' && flewAwayPos.current.isFlyingOff) {
        // Accelerate smoothly forward & up into the distance
        flewAwayPos.current.x += 28;
        flewAwayPos.current.y -= 7;
        planeX = flewAwayPos.current.x;
        planeY = flewAwayPos.current.y;
      } else if (curState === 'WAITING' || curState === 'STARTING') {
        planeX = startX;
        planeY = startY;
      }

      // Draw Red Trajectory Curve matching planeX and planeY
      if ((curState === 'FLYING' || curState === 'CRASHED') && planeX > startX) {
        const curveGrad = ctx.createLinearGradient(0, planeY, 0, height - 65);
        curveGrad.addColorStop(0, 'rgba(230, 0, 38, 0.22)');
        curveGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        const controlX = startX + (planeX - startX) * 0.45;
        const controlY = startY;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, planeX, planeY);
        ctx.lineTo(planeX, height - 65);
        ctx.lineTo(startX, height - 65);
        ctx.closePath();
        ctx.fillStyle = curveGrad;
        ctx.fill();

        // Aviator Red Solid Curve Line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, planeX, planeY);
        ctx.strokeStyle = '#e60026';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#ff1a40';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 5. Emit Wing Vortex Trails (throttled)
        if (curState === 'FLYING') {
          if (Math.random() < 0.6) {
            wingTrails.push({
              x: planeX - 25,
              y: planeY + 8,
              alpha: 0.65,
              size: 2.8
            });
          }

          for (let i = wingTrails.length - 1; i >= 0; i--) {
            const t = wingTrails[i];
            t.x -= 3.2;
            t.alpha -= 0.035;
            t.size *= 0.96;

            if (t.alpha <= 0) {
              wingTrails.splice(i, 1);
              continue;
            }

            ctx.fillStyle = 'rgba(255, 26, 64, ' + t.alpha + ')';
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 6. Draw Official Aviator Red Monoplane
        if ((curState === 'FLYING' || (curState === 'CRASHED' && planeX < width + 100))) {
          ctx.save();
          ctx.translate(planeX, planeY);

          // Authentic Aviator climb angle
          const climbAngle = curState === 'FLYING'
            ? (takeoffRatio < 1.0 ? -0.14 : -0.06 + Math.sin(hoverTime * 1.5) * 0.02)
            : -0.12;
          ctx.rotate(climbAngle);

          // === DRAW AUTHENTIC AVIATOR RED PLANE ===
          if (planeImg.complete && planeImg.naturalWidth > 0) {
            const pW = 88;
            const pH = 46;
            ctx.drawImage(planeImg, -pW / 2, -pH / 2, pW, pH);

            // Spinning Propeller Disc at the front nose
            ctx.save();
            ctx.translate(pW * 0.42, -pH * 0.05);
            ctx.rotate(propellerAngle * 3);
            ctx.strokeStyle = 'rgba(255, 235, 120, 0.6)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -16);
            ctx.lineTo(0, 16);
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            // Fallback Vector Rendering if image still loading
            // A. Rear Wingtip / Horizontal Stabilizer
            ctx.fillStyle = '#b3001e';
            ctx.beginPath();
            ctx.moveTo(-35, -2);
            ctx.lineTo(-44, -10);
            ctx.lineTo(-40, 4);
            ctx.closePath();
            ctx.fill();

          // B. Vertical Tail Rudder (Red with white racing stripe)
          ctx.fillStyle = '#d50000';
          ctx.beginPath();
          ctx.moveTo(-32, -4);
          ctx.lineTo(-42, -22);
          ctx.lineTo(-32, -20);
          ctx.lineTo(-24, -4);
          ctx.closePath();
          ctx.fill();

          // White stripe on rudder
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(-38, -16);
          ctx.lineTo(-40, -18);
          ctx.lineTo(-35, -17);
          ctx.closePath();
          ctx.fill();

          // C. Aerodynamic Main Fuselage (Red sports body with lighting gradient)
          const bodyGrad = ctx.createLinearGradient(0, -12, 0, 12);
          bodyGrad.addColorStop(0, '#ff3355'); // Highlight on top
          bodyGrad.addColorStop(0.4, '#e60026'); // Rich Red
          bodyGrad.addColorStop(1, '#99001a'); // Dark Shadow
          ctx.fillStyle = bodyGrad;

          ctx.beginPath();
          ctx.moveTo(30, 0); // Nose
          ctx.quadraticCurveTo(15, -10, -10, -9); // Top curve
          ctx.lineTo(-36, -3); // Tail taper top
          ctx.lineTo(-36, 3); // Tail taper bottom
          ctx.quadraticCurveTo(-10, 8, 15, 6); // Belly curve
          ctx.quadraticCurveTo(25, 4, 30, 0);
          ctx.closePath();
          ctx.fill();

          // D. Tinted Glass Cockpit Canopy with White Glint
          const canopyGrad = ctx.createLinearGradient(0, -12, 0, 0);
          canopyGrad.addColorStop(0, '#67e8f9');
          canopyGrad.addColorStop(0.5, '#0284c7');
          canopyGrad.addColorStop(1, '#0c4a6e');
          ctx.fillStyle = canopyGrad;

          ctx.beginPath();
          ctx.moveTo(12, -7);
          ctx.quadraticCurveTo(2, -15, -12, -8);
          ctx.lineTo(-10, -5);
          ctx.quadraticCurveTo(2, -6, 12, -5);
          ctx.closePath();
          ctx.fill();

          // Canopy Glare
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.moveTo(8, -8);
          ctx.quadraticCurveTo(2, -13, -4, -10);
          ctx.lineTo(-2, -9);
          ctx.closePath();
          ctx.fill();

          // E. Swept Red Main Wing (Foreground)
          const wingGrad = ctx.createLinearGradient(0, 0, 0, 20);
          wingGrad.addColorStop(0, '#ff1a40');
          wingGrad.addColorStop(1, '#b3001e');
          ctx.fillStyle = wingGrad;

          ctx.beginPath();
          ctx.moveTo(14, 2);
          ctx.lineTo(-12, 22);
          ctx.lineTo(-22, 20);
          ctx.lineTo(-4, 2);
          ctx.closePath();
          ctx.fill();

          // Wing leading edge highlight
          ctx.strokeStyle = '#ff8095';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(14, 2);
          ctx.lineTo(-12, 22);
          ctx.stroke();

          // F. Spinning Propeller Disc at Nose
          ctx.save();
          ctx.translate(32, 0);

          // Motion-blurred propeller disc
          ctx.strokeStyle = 'rgba(255, 235, 120, 0.45)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 20, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Rapid rotating prop blades
          ctx.rotate(propellerAngle);
          ctx.fillStyle = '#ffea79';
          ctx.fillRect(-1.5, -18, 3, 36);

          // Propeller Spinner Hub (Cone)
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          }

          ctx.restore();
        }
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ==================== BET ACTIONS ====================
  const handlePlaceBet = (panelNum) => {
    if (!user) return onOpenAuth('login');
    const panel = panelNum === 1 ? bet1 : bet2;
    const setPanel = panelNum === 1 ? setBet1 : setBet2;

    const numAmount = Number(panel.amount);
    if (isNaN(numAmount) || numAmount < 10) {
      alert('Minimum bet is PKR 10');
      return;
    }
    if (numAmount > balance) {
      alert('Insufficient balance! Please deposit to continue.');
      return;
    }

    soundFx.playBet();

    if (!socket || !socket.connected) {
      const newBal = balance - numAmount;
      onBalanceUpdate(newBal);
      const fakeBet = {
        id: `local_user_bet_${Date.now()}`,
        userId: user.id,
        username: user.username,
        amount: numAmount,
        autoCashout: panel.autoCashoutEnabled ? panel.autoCashout : null
      };
      setPanel(prev => ({ ...prev, placedBet: fakeBet }));
      setBets(prev => [fakeBet, ...prev]);
      return;
    }

    const token = localStorage.getItem('luckywin_token');
    socket.emit('crash:bet', {
      token,
      amount: panel.amount,
      autoCashout: panel.autoCashoutEnabled ? panel.autoCashout : null
    }, (res) => {
      if (res.success) {
        setPanel(prev => ({ ...prev, placedBet: res.bet }));
        onBalanceUpdate(res.newBalance);
      } else {
        alert(res.error || 'Failed to place bet');
      }
    });
  };

  const handleCashout = (panelNum) => {
    const panel = panelNum === 1 ? bet1 : bet2;
    const setPanel = panelNum === 1 ? setBet1 : setBet2;
    if (!panel.placedBet) return;

    const currentMultiplier = smoothMultiplierRef.current || multiplier;
    if (!socket || !socket.connected) {
      const payout = parseFloat((panel.amount * currentMultiplier).toFixed(2));
      const newBal = balance + payout;
      onBalanceUpdate(newBal);
      setPanel(prev => ({
        ...prev,
        hasCashedOut: true,
        cashoutPayout: payout,
        cashoutMultiplier: currentMultiplier
      }));
      soundFx.playCashout();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
      return;
    }

    const token = localStorage.getItem('luckywin_token');
    socket.emit('crash:cashout', {
      token,
      betId: panel.placedBet.id
    }, (res) => {
      if (res.success) {
        setPanel(prev => ({
          ...prev,
          hasCashedOut: true,
          cashoutPayout: res.payout,
          cashoutMultiplier: res.multiplier
        }));
        onBalanceUpdate(res.newBalance);
        soundFx.playCashout();
      } else {
        console.error(res.error);
      }
    });
  };

  const maskName = (name) => {
    if (!name || name.length <= 4) return name;
    return `${name.substring(0, 3)}***${name.slice(-2)}`;
  };

  const displayedBets = activeBetsTab === 'my'
    ? bets.filter(b => user && b.userId === user.id)
    : activeBetsTab === 'top'
    ? [...bets].sort((a, b) => (b.payout || 0) - (a.payout || 0))
    : bets;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 space-y-2.5">
      
      {/* SkyWin Aviator Header Control Ribbon */}
      <div className="flex items-center justify-between bg-[#12151d] px-3 py-2 rounded-xl border border-[#1b212f]">
        
        {/* Game Title: Official AVIATOR */}
        <div className="flex items-center gap-2 select-none">
          <img
            src="/aviator_plane.png"
            alt="Aviator"
            className="h-7 w-auto object-contain filter drop-shadow"
          />
          <img
            src="/aviator_wordmark.png"
            alt="Aviator"
            className="h-5 sm:h-6 w-auto object-contain"
          />
          <span className="text-[9px] text-[#ffb800] bg-[#ffb800]/10 border border-[#ffb800]/25 px-1.5 py-0.2 rounded font-heading font-black uppercase">
            PRO
          </span>

          {/* Active Online Players & Bets Counter */}
          <div className="hidden md:flex items-center gap-2 bg-[#090d16] border border-emerald-500/30 px-2.5 py-1 rounded-lg ml-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold font-mono text-emerald-400">
              {onlinePlayers.toLocaleString()} Online
            </span>
            <span className="text-slate-600 font-mono">|</span>
            <span className="text-[11px] font-bold font-mono text-cyan-400">
              {bets.length} Bets
            </span>
          </div>
        </div>

        {/* Multiplier History Pill Strip */}
        <div className="flex-1 mx-4 overflow-x-auto pb-0.5 scrollbar-none flex items-center gap-1.5">
          {history.map((h, idx) => {
            const isGold = h >= 10.0;
            const isPurple = h >= 2.0 && h < 10.0;
            return (
              <div
                key={idx}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono shrink-0 cursor-pointer ${
                  isGold
                    ? 'bg-[#ffb800]/15 text-[#ffb800] border border-[#ffb800]/30'
                    : isPurple
                    ? 'bg-[#9d4edd]/15 text-[#b77aff] border border-[#9d4edd]/30'
                    : 'bg-[#1a68ff]/10 text-[#4a88ff] border border-[#1a68ff]/20'
                }`}
              >
                {h.toFixed(2)}x
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Arena & Bets */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        
        {/* Arena & Dual Bet Controls */}
        <div className="lg:col-span-3 space-y-2.5">
          
          {/* Canvas Box */}
          <div className="relative w-full h-[260px] xs:h-[300px] sm:h-[380px] lg:h-[420px] rounded-2xl overflow-hidden border border-[#1c2231] bg-[#08060a] shadow-xl">
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Central Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              
              {/* WAITING */}
              {gameState === 'WAITING' && (
                <div className="text-center flex flex-col items-center">
                  <img
                    src="/aviator_full.png"
                    alt="Aviator"
                    className="h-20 sm:h-24 w-auto object-contain mb-3 filter drop-shadow animate-pulse"
                  />
                  <span className="text-slate-400 font-bold text-xs uppercase tracking-widest font-heading block mb-1">
                    WAITING FOR NEXT ROUND
                  </span>
                  <div className="text-5xl sm:text-6xl font-black text-white font-mono tracking-tight">
                    {countdown.toFixed(1)}s
                  </div>
                  <div className="w-48 h-1.5 bg-[#141824] rounded-full mt-3 overflow-hidden border border-[#1e2538] mx-auto">
                    <div
                      className="h-full bg-[#ff1a40] transition-all duration-100"
                      style={{ width: `${(countdown / 5.0) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* STARTING */}
              {gameState === 'STARTING' && (
                <div className="text-center flex flex-col items-center animate-pulse">
                  <img
                    src="/aviator_plane.png"
                    alt="Aviator"
                    className="h-16 sm:h-20 w-auto object-contain mb-2 filter drop-shadow"
                  />
                  <div className="text-2xl sm:text-3xl font-black text-[#ff1a40] uppercase tracking-widest font-heading">
                    TAKING OFF...
                  </div>
                </div>
              )}

              {/* FLYING */}
              {gameState === 'FLYING' && (
                <div className="text-center">
                  <div className="text-7xl sm:text-8xl lg:text-9xl font-black text-white font-heading tracking-tight drop-shadow-md">
                    <span ref={flyingMultiplierTextRef}>{multiplier.toFixed(2)}</span><span className="text-[#ff1a40]">x</span>
                  </div>
                </div>
              )}

              {/* CRASHED */}
              {gameState === 'CRASHED' && (
                <div className="text-center">
                  <span className="text-sm sm:text-base font-black text-[#ff1a40] uppercase tracking-widest font-heading block mb-1">
                    FLEW AWAY!
                  </span>
                  <div className="text-7xl sm:text-8xl font-black text-[#ff1a40] font-heading tracking-tight">
                    {crashedAt ? crashedAt.toFixed(2) : multiplier.toFixed(2)}x
                  </div>
                </div>
              )}

            </div>

            {/* Provably Fair Seed Tag */}
            <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono bg-[#0c0f16]/80 px-2.5 py-0.5 rounded-lg border border-[#1b212f]">
              <Shield className="w-3 h-3 text-[#ff1a40]" />
              <span>{serverSeedHash ? serverSeedHash.substring(0, 16) + '...' : 'VERIFIED'}</span>
            </div>
          </div>

          {/* ================= SKYWIN EXACT DUAL BET BOXES ================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            
            {/* PANEL 1 */}
            <SkyWinBetPanel
              title="Bet 1"
              state={bet1}
              setState={setBet1}
              gameState={gameState}
              currentMultiplier={multiplier}
              onPlaceBet={() => handlePlaceBet(1)}
              onCashout={() => handleCashout(1)}
              user={user}
              balance={balance}
            />

            {/* PANEL 2 */}
            <SkyWinBetPanel
              title="Bet 2"
              state={bet2}
              setState={setBet2}
              gameState={gameState}
              currentMultiplier={multiplier}
              onPlaceBet={() => handlePlaceBet(2)}
              onCashout={() => handleCashout(2)}
              user={user}
              balance={balance}
            />

          </div>

        </div>

        {/* Live Bets Feed Sidebar (Right Column) */}
        <div className="bg-[#12151d] border border-[#1c212e] rounded-2xl p-3 flex flex-col h-[320px] lg:h-[610px]">
          
          {/* Header Tabs */}
          <div className="flex bg-[#0b0e15] p-1 rounded-xl border border-[#181d28] mb-2.5">
            <button
              onClick={() => { setActiveBetsTab('all'); soundFx.playBet(); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                activeBetsTab === 'all'
                  ? 'bg-[#1a68ff] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({bets.length})
            </button>
            <button
              onClick={() => { setActiveBetsTab('my'); soundFx.playBet(); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                activeBetsTab === 'my'
                  ? 'bg-[#1a68ff] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My Bets
            </button>
            <button
              onClick={() => { setActiveBetsTab('top'); soundFx.playBet(); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-heading font-bold transition-all flex items-center justify-center gap-1 ${
                activeBetsTab === 'top'
                  ? 'bg-[#ffb800] text-slate-950 font-black'
                  : 'text-[#ffb800] hover:text-yellow-300'
              }`}
            >
              <Trophy className="w-3 h-3" />
              Top
            </button>
          </div>

          {/* Total Pool */}
          <div className="bg-[#0b0e15] p-2 rounded-xl border border-[#181d28] mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-bold font-heading uppercase text-[10px]">Total Bets</span>
            <span className="font-bold text-[#00c638] font-mono">
              PKR {bets.reduce((sum, b) => sum + (b.amount || 0), 0).toLocaleString()}
            </span>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2 pb-1 border-b border-[#181d28]">
            <span className="col-span-5">User</span>
            <span className="col-span-3 text-right">Bet</span>
            <span className="col-span-2 text-center">X</span>
            <span className="col-span-2 text-right">Win</span>
          </div>

          {/* Scrollable Bets Feed */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 pt-1.5">
            {displayedBets.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-12">No bets recorded.</p>
            ) : (
              displayedBets.map((b) => (
                <div
                  key={b.id}
                  className={`grid grid-cols-12 items-center p-1.5 rounded-lg text-xs transition-all ${
                    b.cashedOut
                      ? 'bg-[#00c638]/10 text-emerald-300'
                      : 'bg-[#0b0e15] text-slate-300'
                  }`}
                >
                  <span className="col-span-5 truncate font-semibold text-slate-200">
                    {maskName(b.username)}
                  </span>
                  <span className="col-span-3 text-right font-mono text-slate-400">
                    {b.amount}
                  </span>
                  <span className="col-span-2 text-center font-mono">
                    {b.cashedOut ? (
                      <span className="text-[#00c638] font-bold">{b.cashoutMultiplier ? b.cashoutMultiplier.toFixed(2) : '1.00'}x</span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">-</span>
                    )}
                  </span>
                  <span className="col-span-2 text-right font-mono font-bold">
                    {b.cashedOut ? (
                      <span className="text-[#00c638]">{Math.floor(b.payout)}</span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

        </div>

      </div>

      {/* How to Play Modal */}
      <HowToPlayModal
        isOpen={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
      />

    </div>
  );
}

// SkyWin Authentic Clean Dual Bet Box with Bet / Auto Tabs
function SkyWinBetPanel({
  state,
  setState,
  gameState,
  currentMultiplier,
  onPlaceBet,
  onCashout
}) {
  const isBetActive = Boolean(state.placedBet);
  const livePayout = isBetActive ? (state.placedBet.amount * currentMultiplier).toFixed(2) : 0;
  const chips = [50, 100, 200, 500, 1000, 2500];

  const handleAdjust = (delta) => {
    soundFx.playBet();
    setState(prev => ({ ...prev, amount: Math.max(10, prev.amount + delta) }));
  };

  return (
    <div className="bg-[#12151d] border border-[#1c212e] rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5">
      
      {/* Top Segmented Controls: Bet / Auto Tabs + Auto Cashout */}
      <div className="flex items-center justify-between text-xs">
        
        {/* Bet / Auto Switch */}
        <div className="flex bg-[#0b0e15] p-0.5 rounded-lg border border-[#181d28]">
          <button
            type="button"
            onClick={() => setState(prev => ({ ...prev, tab: 'bet' }))}
            className={`px-3 py-1 rounded-md text-[11px] font-bold font-heading transition-all ${
              state.tab === 'bet' ? 'bg-[#222a3d] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bet
          </button>
          <button
            type="button"
            onClick={() => setState(prev => ({ ...prev, tab: 'auto' }))}
            className={`px-3 py-1 rounded-md text-[11px] font-bold font-heading transition-all ${
              state.tab === 'auto' ? 'bg-[#222a3d] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto
          </button>
        </div>
        
        {/* Auto Cash Out Toggle */}
        <label className="flex items-center gap-2 cursor-pointer bg-[#0b0e15] px-2.5 py-1 rounded-lg border border-[#181d28]">
          <span className="text-slate-400 text-[11px] font-bold font-heading">Auto Cash Out:</span>
          <input
            type="checkbox"
            checked={state.autoCashoutEnabled}
            onChange={(e) => {
              soundFx.playBet();
              setState(prev => ({ ...prev, autoCashoutEnabled: e.target.checked }));
            }}
            className="w-3.5 h-3.5 rounded accent-[#1a68ff] cursor-pointer"
          />
          {state.autoCashoutEnabled && (
            <input
              type="number"
              step="0.1"
              min="1.1"
              value={state.autoCashout}
              onChange={(e) => setState(prev => ({ ...prev, autoCashout: parseFloat(e.target.value) || 2.0 }))}
              className="w-14 bg-[#12151d] border border-[#202738] rounded px-1 text-xs text-[#ffb800] font-mono font-bold text-center"
            />
          )}
        </label>
      </div>

      {/* Middle Section: Stepper Input & Action Button */}
      <div className="grid grid-cols-12 gap-2 items-stretch">
        
        {/* Left (Cols 7): Stepper with - / + & Chips */}
        <div className="col-span-7 flex flex-col justify-between space-y-2">
          
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isBetActive && gameState !== 'WAITING'}
              onClick={() => handleAdjust(-50)}
              className="w-10 h-10 rounded-xl bg-[#0b0e15] hover:bg-[#181d28] active:bg-[#202738] active:scale-95 touch-manipulation border border-[#1c212e] flex items-center justify-center text-slate-300 hover:text-white transition-all shrink-0 select-none"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="relative flex-1">
              <input
                type="number"
                disabled={isBetActive && gameState !== 'WAITING'}
                value={state.amount}
                onChange={(e) => setState(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full bg-[#0b0e15] border border-[#1c212e] focus:border-[#1a68ff] rounded-xl px-2 py-2 text-sm sm:text-base font-bold text-white font-mono focus:outline-none text-center"
              />
            </div>

            <button
              type="button"
              disabled={isBetActive && gameState !== 'WAITING'}
              onClick={() => handleAdjust(50)}
              className="w-10 h-10 rounded-xl bg-[#0b0e15] hover:bg-[#181d28] active:bg-[#202738] active:scale-95 touch-manipulation border border-[#1c212e] flex items-center justify-center text-slate-300 hover:text-white transition-all shrink-0 select-none"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Chips */}
          <div className="grid grid-cols-3 gap-1">
            {chips.map(amt => (
              <button
                key={amt}
                type="button"
                disabled={isBetActive && gameState !== 'WAITING'}
                onClick={() => {
                  soundFx.playBet();
                  setState(prev => ({ ...prev, amount: amt }));
                }}
                className="py-1.5 rounded-lg bg-[#0b0e15] hover:bg-[#181d28] active:scale-95 touch-manipulation border border-[#181d28] text-[10px] sm:text-xs font-bold text-slate-300 font-mono transition-all select-none"
              >
                +{amt}
              </button>
            ))}
          </div>
        </div>

        {/* Right (Cols 5): Solid SkyWin BET / CASH OUT Button */}
        <div className="col-span-5 flex">
          {isBetActive && gameState === 'FLYING' && !state.hasCashedOut ? (
            <button
              type="button"
              onClick={onCashout}
              className="btn-cashout-gold w-full flex flex-col items-center justify-center p-2 text-slate-950 font-black min-h-[72px] sm:min-h-[78px] touch-manipulation active:scale-[0.98] select-none"
            >
              <span className="text-[11px] uppercase font-black tracking-wider leading-none font-heading">
                Cash Out
              </span>
              <span className="text-base sm:text-lg font-mono font-black mt-1 leading-tight">
                {livePayout}
              </span>
            </button>
          ) : isBetActive && state.hasCashedOut ? (
            <div className="w-full rounded-xl bg-[#00c638]/15 border border-[#00c638]/30 text-[#00c638] flex flex-col items-center justify-center p-2 min-h-[72px] sm:min-h-[78px]">
              <span className="text-[10px] font-bold uppercase font-heading">Cashed Out</span>
              <span className="text-sm font-black font-mono mt-0.5">+{state.cashoutPayout}</span>
            </div>
          ) : isBetActive && gameState === 'WAITING' ? (
            <div className="w-full rounded-xl bg-[#1a202d] border border-[#252d40] text-slate-300 flex items-center justify-center text-xs font-bold font-heading p-2 text-center min-h-[72px] sm:min-h-[78px]">
              Waiting...
            </div>
          ) : (
            <button
              type="button"
              disabled={gameState !== 'WAITING'}
              onClick={onPlaceBet}
              className="btn-bet-green w-full flex flex-col items-center justify-center p-2 text-slate-950 font-black min-h-[72px] sm:min-h-[78px] touch-manipulation active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none"
            >
              <span className="text-xs sm:text-sm uppercase font-black tracking-wider leading-none font-heading">
                BET
              </span>
              <span className="text-sm sm:text-base font-mono font-black mt-1 leading-none text-slate-900">
                {state.amount} PKR
              </span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
