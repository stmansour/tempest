/**
 * audio.js - Authentic Atari Tempest Procedural Sound Synthesizer
 * 
 * Recreates the exact sound registers and waveforms from Dave Theurer's ALSOUN.MAC:
 * - PU6F: Continuous background pulsation / heartbeat that speeds up and pitches up
 *         as enemies ascend the tube, providing crucial tactical audio cues.
 * - LO5F: Crisp mechanical rotary spinner ticks on lane crossing.
 * - LA3F/LA3A: Dual-blaster laser fire with punchy descending chirp.
 * - EL7F/EL7A: High-pitched metallic ping when laser chips away a spike tip.
 * - SOUTS2: Flipper somersault chirp when hopping lanes.
 * - ESLSON: Spiker high-frequency drilling buzz when laying spike lines.
 * - EX2F: Punchy bandpass filtered white noise explosion.
 * - SL1F: Superzapper electric lightning thunder.
 * - T26F: Tube thrust warp sound during level dive.
 * - DI1F: Downward screaming death crash.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.pulsationOsc = null;
    this.pulsationGain = null;
    this.pulsationTimer = null;
    this.pulsationRate = 0.5; // seconds between pulses
    this.lastClickTime = 0;
    this.isPulsing = false;
    this.drillOsc = null;
    this.drillGain = null;
    this.pulsarOsc = null;
    this.pulsarSubOsc = null;
    this.pulsarGain = null;
    this.pulsarFilter = null;
    this.isPulsarHumming = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.42, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      console.warn('AudioContext initialization error:', e);
    }
  }

  resume() {
    if (!this.ctx) {
      this.init();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Start the continuous tactical background pulsation (PU6F from ALSOUN.MAC).
   * Accelerates and raises pitch as enemies get closer to the rim!
   */
  startPulsation() {
    if (this.isPulsing) return;
    this.isPulsing = true;
    this._scheduleNextPulse();
  }

  stopPulsation() {
    this.isPulsing = false;
    if (this.pulsationTimer) {
      clearTimeout(this.pulsationTimer);
      this.pulsationTimer = null;
    }
  }

  updatePulsationRate(highestEnemyZ) {
    // Enemy at z=0 -> pulse every 0.65s (low 75Hz)
    // Enemy at z=0.9 -> pulse every 0.16s (high 180Hz)
    const t = Math.max(0, Math.min(1, highestEnemyZ));
    this.pulsationRate = 0.65 - t * 0.48;
    this.pulsationPitch = 75 + t * 90;
  }

  _scheduleNextPulse() {
    if (!this.isPulsing) return;

    this._playPulseBeat(this.pulsationPitch || 75);

    const intervalMs = Math.max(120, (this.pulsationRate || 0.5) * 1000);
    this.pulsationTimer = setTimeout(() => {
      this._scheduleNextPulse();
    }, intervalMs);
  }

  _playPulseBeat(freq) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.09);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Rotary Spinner Mechanical Click (LO5F from ALSOUN.MAC)
   */
  playSpinnerClick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastClickTime < 0.018) return;
    this.lastClickTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.012);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.012);
  }

  /**
   * Dual Laser Blaster Shot (LA3F / LA3A from ALSOUN.MAC)
   */
  playLaser() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Dual biting square-wave chirp
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(1400, now);
    osc1.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    osc2.frequency.setValueAtTime(700, now);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 0.08);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    filter.Q.value = 2.0;

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.08);
    osc2.stop(now + 0.08);
  }

  /**
   * Spike Chipping Ping (EL7F from ALSOUN.MAC)
   */
  playSpikeChip() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1850, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.045);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.045);
  }

  /**
   * Flipper Somersault Chirp (SOUTS2 from ALSOUN.MAC)
   */
  playFlipperFlip() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.setValueAtTime(580, now + 0.03);
    osc.frequency.setValueAtTime(290, now + 0.06);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Spiker drilling buzz
   */
  playSpikerHum() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.05);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Enemy Explosion (T51F / EX2F from ALSOUN.MAC)
   */
  playExplosion(isMajor = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const duration = isMajor ? 0.75 : 0.28;

    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isMajor ? 480 : 850, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isMajor ? 0.45 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Superzapper Screen-Clear Thunder (SL1F from ALSOUN.MAC)
   */
  playSuperzapper() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const duration = 0.95;

    // White noise blast
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + duration);
    filter.Q.value = 2.5;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Deep sub bass tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + duration);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(now);
    osc.start(now);
    noise.stop(now + duration);
    osc.stop(now + duration);
  }

  /**
   * Authentic Tempest Level Warp & Transit Suite (~5.5-Second Arcade Sequence)
   * Modeled directly from the arcade gameplay video (1:05 to 1:11) and Dave Theurer's original 6502 assembly (ALSOUN.MAC & ALWELG.MAC):
   * - Lasts ~5.5 seconds covering the tube dive down into hyperspace and the next level wireframe emergence
   * - SOUTS2 / T26F: 45 Hz deep sub-octave rumble climbing steadily during the tube dive (0s to 2.4s)
   * - SOUTS3 / T36F: Cosmic atmospheric wind rush sweeping through deep space (1.0s to 4.2s)
   * - SAUSON / WP4F: Ascending tiers of authentic POKEY fanfare chimes spaced across the transit (2.0s to 4.8s)
   * - Wireframe emergence tones: Crystalline harmonic steps accompanying the growing wireframe (4.0s to 5.4s)
   */
  playLevelWarp() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const duration = 5.5;

    // --- 1. SOUTS2 (T26F): Deep Rocket Rumble with Slow, Grand Low-to-High Rise ---
    const rumbleOsc = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    rumbleOsc.type = 'sawtooth';

    // Slow, measured exponential rise starting deep at 45 Hz during the 2.4s tube dive
    rumbleOsc.frequency.setValueAtTime(45, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(70, now + 0.8);
    rumbleOsc.frequency.exponentialRampToValueAtTime(120, now + 1.6);
    rumbleOsc.frequency.exponentialRampToValueAtTime(260, now + 2.4);
    rumbleOsc.frequency.exponentialRampToValueAtTime(680, now + 3.4);
    rumbleOsc.frequency.exponentialRampToValueAtTime(1450, now + 4.6);
    rumbleOsc.frequency.exponentialRampToValueAtTime(2200, now + duration);

    rumbleGain.gain.setValueAtTime(0.32, now);
    rumbleGain.gain.linearRampToValueAtTime(0.44, now + 2.0);
    rumbleGain.gain.linearRampToValueAtTime(0.35, now + 3.8);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    rumbleOsc.start(now);
    rumbleOsc.stop(now + duration);

    // Sub-harmonic oscillator (+2 Hz detune for heavy acoustic churning vibration)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'square';
    subOsc.frequency.setValueAtTime(47, now);
    subOsc.frequency.exponentialRampToValueAtTime(72, now + 0.8);
    subOsc.frequency.exponentialRampToValueAtTime(122, now + 1.6);
    subOsc.frequency.exponentialRampToValueAtTime(262, now + 2.4);
    subOsc.frequency.exponentialRampToValueAtTime(682, now + 3.4);
    subOsc.frequency.exponentialRampToValueAtTime(1452, now + 4.6);
    subOsc.frequency.exponentialRampToValueAtTime(2202, now + duration);

    subGain.gain.setValueAtTime(0.20, now);
    subGain.gain.linearRampToValueAtTime(0.26, now + 2.0);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + duration);

    // --- 2. SOUTS3 (T36F): Space Thrust Atmospheric Wind Rush ---
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 2.0;
      filter.frequency.setValueAtTime(280, now + 0.8);
      filter.frequency.exponentialRampToValueAtTime(3200, now + duration);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.24, now + 2.2);
      noiseGain.gain.linearRampToValueAtTime(0.28, now + 3.8);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now + 0.6);
      noise.stop(now + duration);
    }

    // --- 3. SAUSON (WP4F): Ascending POKEY Fanfare Chimes (Spaced Across 1:07 - 1:10) ---
    const tiers = [
      { startF: 440, endF: 880, startT: 1.2, dur: 0.35 },
      { startF: 587, endF: 1174, startT: 1.6, dur: 0.35 },
      { startF: 784, endF: 1568, startT: 2.0, dur: 0.32 },
      { startF: 1046, endF: 2093, startT: 2.4, dur: 0.30 },
      { startF: 1318, endF: 2637, startT: 2.8, dur: 0.28 },
      { startF: 1568, endF: 3136, startT: 3.2, dur: 0.28 },
      { startF: 1760, endF: 3520, startT: 3.6, dur: 0.26 },
      { startF: 2093, endF: 4186, startT: 4.0, dur: 0.28 },
      { startF: 2349, endF: 4698, startT: 4.4, dur: 0.30 },
      { startF: 2793, endF: 5587, startT: 4.8, dur: 0.32 }
    ];

    for (const tier of tiers) {
      const tStart = now + tier.startT;
      const tEnd = tStart + tier.dur;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(tier.startF, tStart);
      osc.frequency.exponentialRampToValueAtTime(tier.endF, tEnd);

      gain.gain.setValueAtTime(0.18, tStart);
      gain.gain.linearRampToValueAtTime(0.24, tStart + tier.dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, tEnd);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(tStart);
      osc.stop(tEnd);
    }
  }

  /**
   * Level Arrival Slam (SSLAMS / SL1F from ALSOUN.MAC)
   * Plays the sharp metallic vector chime when slamming onto the rim of the new web.
   */
  playSlam() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const duration = 0.28;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // 0x18 AUDF divider in POKEY = ~1280 Hz pure tone at max amplitude
    osc.type = 'square';
    osc.frequency.setValueAtTime(1280, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + duration);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Massive Booming Claw Explosion (DI1F + EX2F Extended)
   * Deep sub-bass punch, resonant cabinet noise blast, and high-voltage ionization crackle.
   */
  playClawExplosion() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // 1. Heavy Sub-Bass Thud (45Hz downward punch with rapid transient)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.65);

    subGain.gain.setValueAtTime(0.85, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.7);

    // 2. High-Impact Resonant White Noise Blast (analog arcade cabinet distortion)
    const duration = 1.35;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.32));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Dual-stage filter: Lowpass sweep + Resonant cabinet body
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + duration);
    filter.Q.setValueAtTime(3.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);

    // 3. High-Voltage Vector Ionization / Shatter Screech
    const screechOsc = this.ctx.createOscillator();
    const screechGain = this.ctx.createGain();
    screechOsc.type = 'sawtooth';
    screechOsc.frequency.setValueAtTime(920, now);
    screechOsc.frequency.exponentialRampToValueAtTime(38, now + 0.9);

    screechGain.gain.setValueAtTime(0.45, now);
    screechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    screechOsc.connect(screechGain);
    screechGain.connect(this.masterGain);

    screechOsc.start(now);
    screechOsc.stop(now + 0.9);
  }

  playPlayerDeath() {
    this.playClawExplosion();
  }

  /**
   * Pulsar Electrical Modulation Hum Channel
   * Rises in volume and pitch as pulsar expands taller; dims as it contracts.
   */
  updatePulsarHum(pulsars) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!pulsars || pulsars.length === 0) {
      this.stopPulsarHum();
      return;
    }

    // Find highest pulse expansion among all active pulsars (0.0 to 1.0)
    let maxPulse = 0;
    for (const p of pulsars) {
      if (p.pulseHeight > maxPulse) {
        maxPulse = p.pulseHeight;
      }
    }

    const now = this.ctx.currentTime;

    if (!this.isPulsarHumming || !this.pulsarOsc) {
      try {
        this.pulsarOsc = this.ctx.createOscillator();
        this.pulsarSubOsc = this.ctx.createOscillator();
        this.pulsarGain = this.ctx.createGain();
        this.pulsarFilter = this.ctx.createBiquadFilter();

        this.pulsarOsc.type = 'triangle';
        this.pulsarSubOsc.type = 'sawtooth';

        this.pulsarFilter.type = 'lowpass';
        this.pulsarFilter.frequency.setValueAtTime(260, now);
        this.pulsarFilter.Q.setValueAtTime(4.0, now);

        this.pulsarGain.gain.setValueAtTime(0.01, now);

        this.pulsarOsc.connect(this.pulsarFilter);
        this.pulsarSubOsc.connect(this.pulsarFilter);
        this.pulsarFilter.connect(this.pulsarGain);
        this.pulsarGain.connect(this.masterGain);

        this.pulsarOsc.start(now);
        this.pulsarSubOsc.start(now);
        this.isPulsarHumming = true;
      } catch (e) {
        return;
      }
    }

    // Modulate pitch and volume based on pulse height
    // Lowered pitch: Base frequency 52Hz -> 110Hz, Sub 26Hz -> 55Hz
    // Reduced volume: 0.02 -> 0.12 (soft, deep electrical hum)
    const targetFreq = 52 + maxPulse * 58;
    const targetGain = 0.02 + maxPulse * 0.10;

    this.pulsarOsc.frequency.setTargetAtTime(targetFreq, now, 0.04);
    this.pulsarSubOsc.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.04);
    this.pulsarFilter.frequency.setTargetAtTime(140 + maxPulse * 180, now, 0.04);
    this.pulsarGain.gain.setTargetAtTime(targetGain, now, 0.04);
  }

  stopPulsarHum() {
    if (!this.isPulsarHumming) return;
    if (this.pulsarGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.pulsarGain.gain.setTargetAtTime(0.001, now, 0.05);
        setTimeout(() => {
          if (this.pulsarOsc) {
            try { this.pulsarOsc.stop(); } catch (e) {}
            this.pulsarOsc.disconnect();
            this.pulsarOsc = null;
          }
          if (this.pulsarSubOsc) {
            try { this.pulsarSubOsc.stop(); } catch (e) {}
            this.pulsarSubOsc.disconnect();
            this.pulsarSubOsc = null;
          }
          if (this.pulsarGain) {
            this.pulsarGain.disconnect();
            this.pulsarGain = null;
          }
          this.isPulsarHumming = false;
        }, 80);
      } catch (e) {
        this.isPulsarHumming = false;
      }
    } else {
      this.isPulsarHumming = false;
    }
  }

  /**
   * Arcade Coin Drop Mechanical Chime
   */
  playCoinDrop() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1480, now);
    osc1.frequency.exponentialRampToValueAtTime(1960, now + 0.08);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.28);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(987, now + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(1318, now + 0.15);
    gain2.gain.setValueAtTime(0.3, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.38);
  }

  /**
   * Rotary Letter Cycle Click (Initial entry navigation)
   */
  playLetterCycle() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.035);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Initial Character Confirmation Chime
   */
  playLetterCommit() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1280, now);
    osc.frequency.setValueAtTime(1920, now + 0.06);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * High Score Achievement Fanfare
   */
  playHighScoreFanfare() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [659, 880, 1046, 1318, 1760];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }
}

