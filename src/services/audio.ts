class RetroAudio {
  ctx: AudioContext | null = null;
  bgmInterval: number | null = null;
  bgmStep: number = 0;
  pulse: number = 0;
  masterGain: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  // BGM effects chain — created ONCE in init(), reused every step to prevent node accumulation.
  bgmFilter: BiquadFilterNode | null = null;
  bgmDelay: DelayNode | null = null;
  bgmDelayGain: GainNode | null = null;
  bgmDelayFeedback: GainNode | null = null;
  // Pre-baked noise buffers — generated once at init(), reused per-play to avoid per-call allocations.
  enemyHitBuffer: AudioBuffer | null = null;
  explosionBuffer: AudioBuffer | null = null;
  hatBuffer: AudioBuffer | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Master chain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // BGM effects chain — created once here, reused every BGM step.
      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.Q.value = 2;
      this.bgmFilter.connect(this.masterGain);

      this.bgmDelay = this.ctx.createDelay(1.0);
      this.bgmDelay.delayTime.value = 0.375;
      this.bgmDelayGain = this.ctx.createGain();
      this.bgmDelayGain.gain.value = 0.3;
      this.bgmDelayFeedback = this.ctx.createGain();
      this.bgmDelayFeedback.gain.value = 0.4;
      this.bgmFilter.connect(this.bgmDelay);
      this.bgmDelay.connect(this.bgmDelayFeedback);
      this.bgmDelayFeedback.connect(this.bgmDelay);
      this.bgmDelay.connect(this.bgmDelayGain);
      this.bgmDelayGain.connect(this.masterGain);

      // Pre-bake noise buffers (reused per-play; avoids per-call random generation).
      const hitSize = Math.floor(this.ctx.sampleRate * 0.15);
      this.enemyHitBuffer = this.ctx.createBuffer(1, hitSize, this.ctx.sampleRate);
      const hitData = this.enemyHitBuffer.getChannelData(0);
      for (let i = 0; i < hitSize; i++) hitData[i] = Math.random() * 2 - 1;

      const explSize = this.ctx.sampleRate; // 1 second
      this.explosionBuffer = this.ctx.createBuffer(1, explSize, this.ctx.sampleRate);
      const explData = this.explosionBuffer.getChannelData(0);
      for (let i = 0; i < explSize; i++) explData[i] = Math.random() * 2 - 1;

      const hatSize = Math.floor(this.ctx.sampleRate * 0.05);
      this.hatBuffer = this.ctx.createBuffer(1, hatSize, this.ctx.sampleRate);
      const hatData = this.hatBuffer.getChannelData(0);
      for (let i = 0; i < hatSize; i++) hatData[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createPanner(x: number = 300) {
    if (!this.ctx) return null;
    // StereoPannerNode is significantly cheaper on mobile than the full 3D PannerNode.
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = (x / 300) - 1; // -1 (left) to 1 (right)
    return panner;
  }

  playShoot(x: number = 300) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.createPanner(x);

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      gain.connect(this.masterGain);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playEnemyShoot(x: number = 300) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.createPanner(x);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      gain.connect(this.masterGain);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playDive(x: number = 300) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.createPanner(x);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 1.5);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

    osc.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      gain.connect(this.masterGain);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }

  playEnemyHit(x: number = 300) {
    if (!this.ctx || !this.masterGain || !this.enemyHitBuffer) return;
    const duration = 0.15;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.enemyHitBuffer; // reuse pre-baked buffer

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    const panner = this.createPanner(x);

    noise.connect(filter);
    filter.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      gain.connect(this.masterGain);
    }

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect(); };
  }

  playPlayerHit() {
    if (!this.ctx || !this.masterGain) return;
    const duration = 0.6;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.38, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();

    // Add a low thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.3);
    oscGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playPowerUp() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';

    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(1320, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playOverdrive() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';

    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playSlingshot() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';

    // Snapping sound: High to low frequency very quickly
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playPowerDown() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';

    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playShieldHit() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playWarp() {
    if (!this.ctx || !this.masterGain) return;
    const duration = 1.6;

    // Rising tone
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + duration);
    gain1.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);

    // Shearing sawtooth
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(50, this.ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    gain2.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc2.connect(filter);
    filter.connect(gain2);
    gain2.connect(this.masterGain);

    // Noise burst for "rushing" feel
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(100, this.ctx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(5000, this.ctx.currentTime + duration);

    noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    noise.start();

    osc1.stop(this.ctx.currentTime + duration);
    osc2.stop(this.ctx.currentTime + duration);
  }

  playWaveClear() {
    if (!this.ctx || !this.masterGain) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
    notes.forEach((note, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note, this.ctx!.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0, this.ctx!.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx!.currentTime + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.3);
    });
  }

  playGameOver() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';

    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(110, this.ctx.currentTime + 1.5);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }

  playExplosion(x: number = 300) {
    if (!this.ctx || !this.masterGain || !this.explosionBuffer) return;
    const duration = 1.0;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.explosionBuffer; // reuse pre-baked buffer

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.42, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    const panner = this.createPanner(x);

    noise.connect(filter);
    filter.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      gain.connect(this.masterGain);
    }

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect(); };

    // Low boom
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, this.ctx.currentTime);
    boom.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.5);
    boomGain.gain.setValueAtTime(0.58, this.ctx.currentTime);
    boomGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start();
    boom.stop(this.ctx.currentTime + 0.5);
  }

  playComboBreak() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';

    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(55, this.ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playGraze() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2500, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playBossWarning() {
    if (!this.ctx || !this.masterGain) return;
    const duration = 2.0;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.setValueAtTime(110, this.ctx.currentTime + 0.5);
    osc.frequency.setValueAtTime(110, this.ctx.currentTime + 1.0);
    osc.frequency.setValueAtTime(110, this.ctx.currentTime + 1.5);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    for(let i=0; i<4; i++) {
      gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + i * 0.5 + 0.1);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + i * 0.5 + 0.4);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playStageStart() {
    if (!this.ctx || !this.masterGain) return;
    const notes = [440, 554.37, 659.25, 880]; // A C# E A
    notes.forEach((note, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note, this.ctx!.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx!.currentTime + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.2);
    });
  }

  playHacking() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 20;
    lfoGain.gain.value = 50;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.0);

    osc.connect(gain);
    gain.connect(this.masterGain);

    lfo.start();
    osc.start();
    lfo.stop(this.ctx.currentTime + 1.0);
    osc.stop(this.ctx.currentTime + 1.0);
  }

  playTractorBeam() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.5);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 10;
    lfoGain.gain.value = 100;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    lfo.start();
    osc.start();
    lfo.stop(this.ctx.currentTime + 0.5);
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playBGM(stage: number = 1) {
    if (!this.ctx || !this.masterGain) return;
    this.stopBGM();

    // Stage-specific musical themes
    // Stage 1: Basic Techno (Driving)
    // Stage 2: Dark/Ambient Techno (Asteroid Belt)
    // Stage 3: Industrial/Aggressive Techno (Maze)
    // Stage 4: Melodic/Fast Techno (Chase)
    // Stage 5: Epic/Final Techno (Final Front)

    const scales = [
      [130.81, 155.56, 174.61, 196.00], // C Minor (Stage 1)
      [123.47, 146.83, 164.81, 185.00], // B Minor (Stage 2 - Darker)
      [110.00, 130.81, 146.83, 164.81], // A Minor (Stage 3 - Industrial)
      [146.83, 174.61, 196.00, 220.00], // D Minor (Stage 4 - Fast)
      [130.81, 155.56, 174.61, 196.00, 207.65, 233.08] // C Minor + Extra (Stage 5 - Epic)
    ];

    const currentScale = scales[(stage - 1) % scales.length];
    const speed = stage === 4 ? 110 : 125; // Faster for chase stage

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || !this.bgmFilter) return;

      const step = this.bgmStep % 16;

      // Reuse the persistent effects chain created in init().
      // Update the filter sweep frequency in place (no new nodes created).
      const sweepFreq = 1000 + Math.sin(this.bgmStep * 0.05) * 800;
      const globalFilter = this.bgmFilter;
      globalFilter.frequency.value = sweepFreq;


      // Kick Drum on 1, 5, 9, 13
      if (step % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(150, this.ctx.currentTime);
        kickOsc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
        kickGain.gain.setValueAtTime(0.34, this.ctx.currentTime);
        kickGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        kickOsc.connect(kickGain);
        kickGain.connect(globalFilter);
        kickOsc.start();
        kickOsc.stop(this.ctx.currentTime + 0.1);

        // Sub-bass thump
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(60, this.ctx.currentTime);
        subOsc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2);
        subGain.gain.setValueAtTime(0.24, this.ctx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        subOsc.connect(subGain);
        subGain.connect(this.masterGain);
        subOsc.start();
        subOsc.stop(this.ctx.currentTime + 0.2);
      }

      // Snare/Hi-hat on off-beats
      if (step % 4 === 2 || (stage >= 3 && step % 2 === 1 && Math.random() > 0.7)) {
        if (this.hatBuffer) {
          const hat = this.ctx.createBufferSource();
          hat.buffer = this.hatBuffer; // reuse pre-baked buffer
          const hatGain = this.ctx.createGain();
          hatGain.gain.setValueAtTime(step % 4 === 2 ? 0.05 : 0.02, this.ctx.currentTime);
          hatGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
          hat.connect(hatGain);
          hatGain.connect(globalFilter);
          hat.start();
          hat.stop(this.ctx.currentTime + 0.05);
          hat.onended = () => { hat.disconnect(); hatGain.disconnect(); };
        }
      }

      // Bassline
      if (step % 2 === 0) {
        const bassFreq = currentScale[Math.floor(this.bgmStep / 8) % currentScale.length];
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sawtooth';

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = stage === 2 ? 200 : 400; // Muffled for asteroid belt

        bassOsc.frequency.setValueAtTime(bassFreq / 2, this.ctx.currentTime);
        // Add a bit of glide/portamento
        bassOsc.frequency.exponentialRampToValueAtTime(bassFreq / 2 * 0.9, this.ctx.currentTime + 0.1);

        bassGain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

        bassOsc.connect(filter);
        filter.connect(bassGain);
        bassGain.connect(globalFilter);
        bassOsc.start();
        bassOsc.stop(this.ctx.currentTime + 0.1);
      }

      // Lead Synth (Arpeggio/Syncopated)
      if (step % 3 === 0 || step === 7 || step === 14 || (stage >= 4 && Math.random() > 0.5)) {
        const leadFreq = currentScale[Math.floor(this.bgmStep / 4) % currentScale.length] * 2;
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        leadOsc.type = stage === 3 ? 'square' : 'sawtooth';

        const leadFilter = this.ctx.createBiquadFilter();
        leadFilter.type = 'bandpass';
        // Trippy filter modulation
        const modFreq = 1000 + Math.sin(this.bgmStep * 0.2) * 800;
        leadFilter.frequency.value = modFreq;
        leadFilter.Q.value = 8;

        leadOsc.frequency.setValueAtTime(leadFreq, this.ctx.currentTime);
        // Random pitch blips for "glitch" feel
        if (Math.random() > 0.9) {
          leadOsc.frequency.exponentialRampToValueAtTime(leadFreq * 2, this.ctx.currentTime + 0.05);
        }

        leadGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
        leadGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

        leadOsc.connect(leadFilter);
        leadFilter.connect(leadGain);
        leadGain.connect(globalFilter);
        leadOsc.start();
        leadOsc.stop(this.ctx.currentTime + 0.2);
      }

      // Atmospheric Pad (Trippy drone)
      if (this.bgmStep % 32 === 0) {
        const padOsc = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        padOsc.type = 'sine';
        padOsc.frequency.setValueAtTime(currentScale[0], this.ctx.currentTime);

        padGain.gain.setValueAtTime(0, this.ctx.currentTime);
        padGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 2.0);
        padGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 4.0);

        padOsc.connect(padGain);
        padGain.connect(this.masterGain);
        padOsc.start();
        padOsc.stop(this.ctx.currentTime + 4.0);
      }

      this.bgmStep++;
      this.pulse = 1.0;
    }, speed);
  }

  getPulse() {
    this.pulse *= 0.9; // Decay pulse
    return this.pulse;
  }

  playScrap() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playUpgrade() {
    if (!this.ctx || !this.masterGain) return;
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((note, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note, this.ctx!.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx!.currentTime + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + i * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.4);
    });
  }

  stopBGM() {
    if (this.bgmInterval !== null) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.bgmStep = 0;
  }
}

export const audio = new RetroAudio();
