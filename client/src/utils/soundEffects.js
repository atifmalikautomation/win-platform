/**
 * Web Audio API Sound Synthesizer for LuckyWin
 * Zero external dependencies, zero latency, 100% reliable offline & online!
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('luckywin_muted') === 'true';
    this.volume = parseFloat(localStorage.getItem('luckywin_volume') || '0.7');
    this.flightOscillator = null;
    this.flightGain = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('luckywin_muted', String(this.isMuted));
    if (this.isMuted) {
      this.stopFlightSound();
    }
    return this.isMuted;
  }

  // 1. Radar / Countdown Tick Sound (Blip)
  playCountdownTick() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);

      gain.gain.setValueAtTime(this.volume * 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  // 2. Jet Takeoff Whoosh / Flight Sound Loop
  startFlightSound() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    this.stopFlightSound();

    try {
      const now = this.ctx.currentTime;
      // White noise buffer for thruster air rumble
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      // Lowpass filter for deep jet engine rumble
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, now);

      this.flightGain = this.ctx.createGain();
      this.flightGain.gain.setValueAtTime(0.01, now);
      this.flightGain.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.5);

      noise.connect(filter);
      filter.connect(this.flightGain);
      this.flightGain.connect(this.ctx.destination);

      noise.start(now);
      this.flightOscillator = noise;
      this.flightFilter = filter;
    } catch (e) {}
  }

  // Update engine pitch as multiplier soars
  updateFlightPitch(multiplier) {
    if (this.isMuted || !this.flightFilter || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Filter frequency rises from 250Hz up to 1200Hz
      const freq = Math.min(1400, 250 + (multiplier - 1.0) * 120);
      this.flightFilter.frequency.setValueAtTime(freq, now);
    } catch (e) {}
  }

  stopFlightSound() {
    if (this.flightOscillator) {
      try {
        if (this.flightGain && this.ctx) {
          this.flightGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        }
        setTimeout(() => {
          if (this.flightOscillator) {
            this.flightOscillator.stop();
            this.flightOscillator.disconnect();
            this.flightOscillator = null;
          }
        }, 120);
      } catch (e) {
        this.flightOscillator = null;
      }
    }
  }

  // 3. Crash Explosion
  playCrash() {
    this.stopFlightSound();
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);

      gain.gain.setValueAtTime(this.volume * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  }

  // 4. Winning Cashout Chime (Dual harmonic jackpot bells)
  playCashout() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Arpeggio)
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + idx * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(this.volume * 0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + 0.35);
      });
    } catch (e) {}
  }

  // 5. Mines Gem Discovery Sound (Sparkling Crystal Chime)
  playGem() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.15); // E6

      gain.gain.setValueAtTime(this.volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  // 6. Tactile Chip / Bet Placed Sound
  playBet() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);

      gain.gain.setValueAtTime(this.volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }
}

export const soundFx = new SoundManager();
