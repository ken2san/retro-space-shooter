class RetroAudio {
  ctx: AudioContext | null = null;
  bgmInterval: number | null = null;
  bgmStep: number = 0;
  masterGain: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Master chain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
      
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createPanner(x: number = 300) {
    if (!this.ctx) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'equalpower';
    // Map screen X (0-600) to panner X (-1 to 1)
    const panX = (x / 300) - 1;
    panner.positionX.setValueAtTime(panX, this.ctx.currentTime);
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
    if (!this.ctx || !this.masterGain) return;
    const duration = 0.15;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
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
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
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
    oscGain.gain.setValueAtTime(0.6, this.ctx.currentTime);
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
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
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
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 1.5);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
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
    if (!this.ctx || !this.masterGain) return;
    const duration = 1.0;
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
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + duration);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
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

    // Low boom
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, this.ctx.currentTime);
    boom.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.5);
    boomGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
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

  playBGM() {
    if (!this.ctx || !this.masterGain) return;
    this.stopBGM();

    const bassNotes = [130.81, 130.81, 155.56, 174.61, 130.81, 130.81, 196.00, 174.61];
    const leadNotes = [0, 261.63, 311.13, 349.23, 0, 392.00, 349.23, 311.13];
    const speed = 160;

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain) return;
      
      const bassFreq = bassNotes[this.bgmStep % bassNotes.length];
      const leadFreq = leadNotes[this.bgmStep % leadNotes.length];
      this.bgmStep++;

      // Bass
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'square';
      bassOsc.frequency.setValueAtTime(bassFreq, this.ctx.currentTime);
      bassGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (speed / 1000) * 0.9);
      bassOsc.connect(bassGain);
      bassGain.connect(this.masterGain);
      bassOsc.start();
      bassOsc.stop(this.ctx.currentTime + (speed / 1000));

      // Lead (every other beat or so)
      if (leadFreq > 0 && this.bgmStep % 2 === 0) {
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        leadOsc.type = 'triangle';
        leadOsc.frequency.setValueAtTime(leadFreq, this.ctx.currentTime);
        leadGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        leadGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (speed / 1000) * 1.5);
        leadOsc.connect(leadGain);
        leadGain.connect(this.masterGain);
        leadOsc.start();
        leadOsc.stop(this.ctx.currentTime + (speed / 1000) * 1.5);
      }
    }, speed);
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
