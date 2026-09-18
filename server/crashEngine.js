const { generateServerSeed, hashSeed, calculateCrashMultiplier } = require('./provablyFair');
const db = require('./db');

class CrashEngine {
  constructor(io) {
    this.io = io;
    this.state = 'WAITING'; // WAITING | STARTING | FLYING | CRASHED
    this.currentMultiplier = 1.00;
    this.crashedAt = 1.00;
    this.countdown = 5.0; // 5 seconds wait
    this.nonce = 1;
    this.clientSeed = 'LuckyWin_Public_Seed_2026';
    this.serverSeed = generateServerSeed();
    this.serverSeedHash = hashSeed(this.serverSeed);
    this.flightStartTime = 0;
    this.history = [1.25, 3.42, 1.08, 14.20, 2.10, 5.64, 1.02, 2.89, 23.50, 1.95, 4.12, 1.45];
    this.currentBets = []; // Array of bets for this round
    this.onlinePlayers = 1840;
    this.botNames = [
      'Shahid_99', 'AlexPro', 'CryptoKing', 'Zeeshan77', 'Vikram_G', 'Dragon_X',
      'Hamza_92', 'Sultan786', 'JackpotHunter', 'AliRaza', 'NeonRider', 'WinnerBro',
      'Farhan_K', 'SpeedDemon', 'Tariq_77', 'Elena_V', 'BabarFan', 'Omega_Bet',
      'Malik_786', 'Kamran_VIP', 'Usman_King', 'Rizwan_Master', 'Bilal_PK', 'Saad_Pro',
      'Zahid_99', 'Fahad_Ace', 'Daniyal_X', 'Ahsan_Gold', 'Kashif_Trader', 'Waqas_77',
      'Imran_Winner', 'Noman_Speed', 'Asad_Bettor', 'Tayyab_Rider', 'Haris_Elite', 'Shahbaz_92',
      'Sohail_Khan', 'Rehan_Crypto', 'Adeel_Pro', 'Faizan_786', 'Junaid_Max', 'Arslan_VIP',
      'Babar_King', 'Shaheen_Falcon', 'Rauf_Speed', 'Shadab_AllRound', 'Naseem_Fire', 'Fakhar_Pride',
      'Lucky_Tiger', 'Pak_Champion', 'Lahore_Eagle', 'Karachi_Stallion', 'Islamabad_United',
      'Peshawar_Zalmi', 'Multan_Sultan', 'Quetta_Gladiator', 'Sialkot_Stallion', 'Rawalpindi_Express',
      'Faisalabad_King', 'Gujranwala_Lion', 'Kasur_Pro', 'Apex_Predator', 'Turbo_Charged',
      'Viper_Strike', 'Falcon_9', 'Sky_Walker', 'Rocket_Man', 'Titan_Bet', 'Quantum_Leap',
      'Star_Lord', 'Cosmic_Ray', 'Hyper_Sonic', 'Bullet_Proof', 'Golden_Touch', 'Silver_Surfer',
      'Iron_Will', 'Diamond_Hands', 'Moon_Shot', 'Bull_Runner', 'Whale_Watcher', 'Alpha_Dog'
    ];

    this.forcedCrashMultiplier = null;
    this.riggingMode = 'fair'; // 'fair' | 'house_win' | 'high_run'

    this.timer = null;
    this.initNextRound();
    this.startGameLoop();
  }

  initNextRound() {
    this.state = 'WAITING';
    this.waitingDuration = 5.0; // Steady 5 seconds countdown
    this.waitingStartTime = Date.now();
    this.countdown = 5.0;
    this.currentMultiplier = 1.00;
    this.serverSeed = generateServerSeed();
    this.serverSeedHash = hashSeed(this.serverSeed);
    this.nonce++;
    this.onlinePlayers = 1820 + Math.floor(Math.random() * 85);

    if (this.forcedCrashMultiplier !== null) {
      this.crashedAt = Math.max(1.01, parseFloat(this.forcedCrashMultiplier.toFixed(2)));
      console.log(`[CrashEngine] Round ${this.nonce} using FORCED crash multiplier: ${this.crashedAt}x`);
      this.forcedCrashMultiplier = null; // consume once
    } else if (this.riggingMode === 'house_win') {
      // Rigged mode: always crash between 1.02x and 1.25x so house wins
      this.crashedAt = parseFloat((1.02 + Math.random() * 0.23).toFixed(2));
      console.log(`[CrashEngine] Round ${this.nonce} HOUSE_WIN rigged crash: ${this.crashedAt}x`);
    } else if (this.riggingMode === 'high_run') {
      // Bait mode: fly high 10x - 35x
      this.crashedAt = parseFloat((10.0 + Math.random() * 25.0).toFixed(2));
      console.log(`[CrashEngine] Round ${this.nonce} HIGH_RUN rigged crash: ${this.crashedAt}x`);
    } else {
      const settings = db.getGameSettings();
      this.crashedAt = calculateCrashMultiplier(
        this.serverSeed,
        this.clientSeed,
        this.nonce,
        settings.houseEdge || 4
      );
    }

    this.currentBets = [];
    this.generateSimulatedBets();

    this.broadcastState();
  }

  generateSimulatedBets() {
    // Generate 35-50 initial simulated bets right away
    const initialCount = Math.floor(Math.random() * 16) + 35;
    const shuffled = [...this.botNames].sort(() => 0.5 - Math.random());
    const betTiers = [50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 2500, 5000, 10000];

    for (let i = 0; i < initialCount; i++) {
      const betAmount = betTiers[Math.floor(Math.random() * betTiers.length)];
      const targetCashout = parseFloat((1.15 + Math.random() * 6.0).toFixed(2));

      this.currentBets.push({
        id: `bot_bet_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
        userId: `bot_${i}`,
        username: shuffled[i % shuffled.length] || `Player_${i}`,
        amount: betAmount,
        autoCashout: Math.random() > 0.35 ? targetCashout : null,
        targetMultiplier: targetCashout,
        cashedOut: false,
        cashoutMultiplier: null,
        payout: 0,
        isBot: true
      });
    }
  }

  injectStreamedBet() {
    if (this.currentBets.length >= 85) return;
    const betTiers = [50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 2500, 5000];
    const betAmount = betTiers[Math.floor(Math.random() * betTiers.length)];
    const targetCashout = parseFloat((1.18 + Math.random() * 7.5).toFixed(2));
    const randomName = this.botNames[Math.floor(Math.random() * this.botNames.length)];

    const bet = {
      id: `bot_bet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: `bot_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      username: randomName,
      amount: betAmount,
      autoCashout: Math.random() > 0.35 ? targetCashout : null,
      targetMultiplier: targetCashout,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0,
      isBot: true
    };

    this.currentBets.push(bet);
    this.io.emit('crash:new_bet', {
      bet: {
        id: bet.id,
        username: bet.username,
        amount: bet.amount,
        cashedOut: false
      }
    });
  }

  startGameLoop() {
    const TICK_RATE = 40; // 40ms = 25 ticks/second (fast & ultra responsive)
    let streamTick = 0;

    setInterval(() => {
      if (this.state === 'WAITING') {
        const elapsed = (Date.now() - (this.waitingStartTime || Date.now())) / 1000;
        this.countdown = Math.max(0, parseFloat(((this.waitingDuration || 5.0) - elapsed).toFixed(1)));
        
        // Streaming of incoming bets during countdown
        streamTick++;
        if (streamTick % 6 === 0 && this.countdown > 0.5) {
          this.injectStreamedBet();
        }

        if (this.countdown <= 0) {
          this.state = 'STARTING';
          this.broadcastState();
          setTimeout(() => {
            this.state = 'FLYING';
            this.flightStartTime = Date.now();
            this.broadcastState();
          }, 600); // Steady 600ms launch
        } else {
          this.io.emit('crash:waiting_tick', {
            countdown: this.countdown,
            onlinePlayers: this.onlinePlayers,
            totalBetsCount: this.currentBets.length
          });
        }
      } else if (this.state === 'FLYING') {
        const elapsedSec = (Date.now() - this.flightStartTime) / 1000;
        // Fast exponential flight curve formula
        const growthRate = 0.072;
        this.currentMultiplier = parseFloat((Math.pow(Math.E, growthRate * elapsedSec * 1.65)).toFixed(2));

        // Check auto-cashouts for real users & bots
        this.currentBets.forEach(bet => {
          if (!bet.cashedOut) {
            const shouldCashout =
              (bet.autoCashout && this.currentMultiplier >= bet.autoCashout) ||
              (bet.isBot && this.currentMultiplier >= bet.targetMultiplier && this.currentMultiplier < this.crashedAt);

            if (shouldCashout) {
              this.executeCashout(bet, this.currentMultiplier);
            }
          }
        });

        // Check if crashed
        if (this.currentMultiplier >= this.crashedAt) {
          this.triggerCrash(this.crashedAt);
        } else {
          this.io.emit('crash:tick', {
            multiplier: this.currentMultiplier,
            flightStartTime: this.flightStartTime,
            onlinePlayers: this.onlinePlayers
          });
        }
      }
    }, TICK_RATE);
  }

  placeBet(userId, username, amount, autoCashout = null) {
    if (this.state !== 'WAITING') {
      throw new Error('Bets are only accepted during the countdown');
    }

    const betAmount = Number(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      throw new Error('Invalid bet amount');
    }

    // Deduct user balance atomically
    const newBalance = db.updateUserBalance(userId, -betAmount);

    const bet = {
      id: `user_bet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      username,
      amount: betAmount,
      autoCashout: autoCashout ? parseFloat(autoCashout) : null,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0,
      isBot: false
    };

    this.currentBets.push(bet);

    this.io.emit('crash:new_bet', {
      bet: {
        id: bet.id,
        username: bet.username,
        amount: bet.amount,
        cashedOut: false
      }
    });

    return { bet, newBalance };
  }

  cashout(userId, betId) {
    if (this.state !== 'FLYING') {
      throw new Error('Cannot cash out right now');
    }

    const bet = this.currentBets.find(b => b.userId === userId && b.id === betId && !b.cashedOut);
    if (!bet) {
      throw new Error('Active bet not found or already cashed out');
    }

    return this.executeCashout(bet, this.currentMultiplier);
  }

  executeCashout(bet, multiplier) {
    bet.cashedOut = true;
    bet.cashoutMultiplier = multiplier;
    bet.payout = parseFloat((bet.amount * multiplier).toFixed(2));

    let newBalance = null;
    if (!bet.isBot) {
      // Credit winnings back to user
      newBalance = db.updateUserBalance(bet.userId, bet.payout);

      // Record in database
      db.recordBet({
        userId: bet.userId,
        username: bet.username,
        game: 'crash',
        betAmount: bet.amount,
        multiplier,
        payout: bet.payout,
        status: 'won'
      });
    }

    this.io.emit('crash:bet_cashed_out', {
      betId: bet.id,
      userId: bet.userId,
      username: bet.username,
      amount: bet.amount,
      multiplier,
      payout: bet.payout,
      isBot: bet.isBot,
      newBalance
    });

    return {
      betId: bet.id,
      payout: bet.payout,
      multiplier,
      newBalance
    };
  }

  getState() {
    return {
      state: this.state,
      countdown: this.countdown,
      currentMultiplier: this.currentMultiplier,
      crashedAt: this.state === 'CRASHED' ? this.crashedAt : null,
      flightStartTime: this.flightStartTime,
      serverSeedHash: this.serverSeedHash,
      nonce: this.nonce,
      history: this.history,
      onlinePlayers: this.onlinePlayers || 1840,
      totalBetsCount: this.currentBets.length,
      bets: this.currentBets.map(b => ({
        id: b.id,
        userId: b.userId,
        username: b.username,
        amount: b.amount,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payout: b.payout,
        isBot: b.isBot
      }))
    };
  }

  triggerCrash(multiplier) {
    this.currentMultiplier = multiplier;
    this.crashedAt = multiplier;
    this.state = 'CRASHED';

    // Mark uncashed bets as lost
    this.currentBets.forEach(bet => {
      if (!bet.cashedOut) {
        if (!bet.isBot) {
          db.recordBet({
            userId: bet.userId,
            username: bet.username,
            game: 'crash',
            betAmount: bet.amount,
            multiplier: 0,
            payout: 0,
            status: 'lost'
          });
        }
      }
    });

    // Record history
    this.history.unshift(this.crashedAt);
    if (this.history.length > 30) this.history.pop();

    this.io.emit('crash:crashed', {
      crashedAt: this.crashedAt,
      serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash,
      nonce: this.nonce,
      history: this.history,
      onlinePlayers: this.onlinePlayers
    });

    // 1.5s pause to display "FLEW AWAY" before 5.0s countdown begins
    setTimeout(() => {
      this.initNextRound();
    }, 1500);
  }

  manualCrashNow() {
    if (this.state === 'FLYING') {
      const crashMult = Math.max(1.01, this.currentMultiplier);
      this.triggerCrash(crashMult);
      return { success: true, message: `Plane manually crashed at ${crashMult}x!`, crashedAt: crashMult };
    } else if (this.state === 'WAITING' || this.state === 'STARTING') {
      // Set to crash immediately at 1.01x upon launch
      this.forcedCrashMultiplier = 1.01;
      return { success: true, message: 'Plane will crash immediately at 1.01x when round starts!', forcedMultiplier: 1.01 };
    } else {
      return { success: false, message: `Cannot crash now: plane is already ${this.state}` };
    }
  }

  setForcedNextMultiplier(mult) {
    const num = Math.max(1.01, parseFloat(mult));
    this.forcedCrashMultiplier = parseFloat(num.toFixed(2));
    return { success: true, forcedMultiplier: this.forcedCrashMultiplier, message: `Next round forced to crash at ${this.forcedCrashMultiplier}x` };
  }

  setRiggingMode(mode) {
    if (!['fair', 'house_win', 'high_run'].includes(mode)) {
      throw new Error('Invalid rigging mode. Use: fair, house_win, high_run');
    }
    this.riggingMode = mode;
    return { success: true, riggingMode: this.riggingMode, message: `Aviator rigging mode set to: ${mode}` };
  }

  getAdminStatus() {
    return {
      state: this.state,
      currentMultiplier: this.currentMultiplier,
      crashedAt: this.crashedAt,
      countdown: this.countdown,
      forcedCrashMultiplier: this.forcedCrashMultiplier,
      riggingMode: this.riggingMode,
      totalBets: this.currentBets.length,
      realBets: this.currentBets.filter(b => !b.isBot).map(b => ({
        id: b.id,
        username: b.username,
        amount: b.amount,
        autoCashout: b.autoCashout,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier
      })),
      history: this.history.slice(0, 12)
    };
  }

  broadcastState() {
    this.io.emit('crash:state_change', this.getState());
  }
}

module.exports = CrashEngine;
