import type { WeaponId } from './config';

/** Fully synthesized audio: SFX, ambient city + sirens, and a small adaptive music loop. */
export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  noiseBuf!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  intensity = 0;
  private step = 0;
  private stepT = 0;
  private ambT = 0;
  private running = false;
  private lastShot = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.7;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    this.musicBus.connect(this.master);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.5 : 0;
  }

  private startAmbient() {
    const c = this.ctx!;
    // low drone
    const g = c.createGain();
    g.gain.value = 0.05;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    g.connect(lp);
    lp.connect(this.musicBus);
    for (const f of [41, 41.6, 61.5]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(g);
      o.start();
    }
    // wind
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const ng = c.createGain();
    ng.gain.value = 0.035;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.musicBus);
    n.start();
    this.running = true;
  }

  tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15, slideTo = 0, delay = 0, bus?: GainNode) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur: number, vol = 0.2, f0 = 2000, f1 = 400, type: BiquadFilterType = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  shoot(w: WeaponId) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.025) return;
    this.lastShot = now;
    switch (w) {
      case 'pistol': this.noise(0.1, 0.25, 4000, 600, 'bandpass'); this.tone(320, 0.08, 'square', 0.08, 90); break;
      case 'rifle': this.noise(0.09, 0.25, 3500, 500, 'bandpass'); this.tone(200, 0.07, 'sawtooth', 0.08, 70); break;
      case 'smg': this.noise(0.06, 0.2, 5000, 900, 'bandpass'); this.tone(420, 0.05, 'square', 0.05, 160); break;
      case 'shotgun': this.noise(0.28, 0.45, 2500, 150, 'lowpass'); this.tone(110, 0.2, 'sawtooth', 0.15, 40); break;
      case 'sniper': this.noise(0.4, 0.5, 5000, 120, 'lowpass'); this.tone(90, 0.35, 'sawtooth', 0.2, 30); break;
      case 'plasma': this.tone(900, 0.18, 'sine', 0.14, 160); this.tone(1400, 0.12, 'triangle', 0.06, 300); break;
      case 'rocket': this.noise(0.5, 0.35, 1800, 100, 'lowpass'); this.tone(140, 0.4, 'sawtooth', 0.12, 50); break;
      case 'laser': this.tone(1700, 0.06, 'sawtooth', 0.05, 900); break;
    }
  }
  explosion(big = false) {
    this.noise(big ? 1.0 : 0.6, big ? 0.7 : 0.45, 1400, 60, 'lowpass');
    this.tone(big ? 70 : 90, big ? 0.6 : 0.4, 'sine', 0.35, 28);
  }
  hit() { this.tone(1400, 0.04, 'square', 0.05, 700); }
  kill() { this.tone(500, 0.18, 'sawtooth', 0.1, 90); this.noise(0.16, 0.12, 3000, 400, 'bandpass'); }
  hurt() { this.tone(160, 0.28, 'sawtooth', 0.28, 50); this.noise(0.22, 0.3, 1200, 200, 'lowpass'); }
  jump() { this.tone(260, 0.16, 'sine', 0.1, 560); }
  land() { this.noise(0.1, 0.12, 600, 150, 'lowpass'); }
  slide() { this.noise(0.45, 0.14, 2500, 500, 'bandpass'); }
  swoosh() { this.noise(0.3, 0.12, 400, 3000, 'bandpass'); }
  grab() { this.tone(180, 0.1, 'square', 0.15, 90); this.noise(0.08, 0.15, 3000, 800, 'highpass'); }
  zip() { this.noise(0.9, 0.12, 800, 3500, 'bandpass'); }
  grapple() { this.tone(500, 0.2, 'sawtooth', 0.1, 1400); this.noise(0.2, 0.15, 2000, 4000, 'highpass'); }
  reload() { this.tone(900, 0.04, 'square', 0.06); this.tone(500, 0.05, 'square', 0.06, 0, 0.18); }
  empty() { this.tone(1100, 0.03, 'square', 0.05); }
  ui() { this.tone(660, 0.07, 'triangle', 0.1, 880); }
  buy() { this.tone(523, 0.1, 'triangle', 0.12); this.tone(784, 0.15, 'triangle', 0.12, 0, 0.09); }
  pickup(kind = '') {
    const base = kind === 'weapon' ? 660 : kind === 'health' ? 523 : 780;
    this.tone(base, 0.1, 'triangle', 0.13);
    this.tone(base * 1.5, 0.12, 'triangle', 0.13, 0, 0.07);
    if (kind === 'weapon') this.tone(base * 2, 0.2, 'triangle', 0.13, 0, 0.14);
  }
  alert() { this.tone(880, 0.12, 'square', 0.1); this.tone(660, 0.12, 'square', 0.1, 0, 0.14); }
  screech() { this.tone(1800, 0.3, 'sawtooth', 0.06, 700); }
  bombWhistle() { this.tone(1600, 0.9, 'sine', 0.05, 300); }
  beamCharge() { this.tone(120, 1.2, 'sawtooth', 0.08, 700); }
  beamFire() { this.noise(0.5, 0.45, 5000, 300, 'bandpass'); this.tone(80, 0.5, 'sawtooth', 0.25, 40); }
  siren(dur = 3) {
    for (let i = 0; i < dur * 2; i++) this.tone(i % 2 ? 560 : 780, 0.5, 'sine', 0.06, 0, i * 0.5, this.musicBus);
  }
  dead() { this.tone(300, 1.2, 'sawtooth', 0.25, 30); this.explosion(true); }
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, 0, i * 0.1)); }

  /** adaptive music + ambient events; call every frame while playing */
  update(dt: number, active: boolean) {
    if (!this.ctx || !this.running) return;
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 4 + Math.random() * 7;
      if (Math.random() < 0.5) this.siren(2 + Math.floor(Math.random() * 2));
      else this.noise(1.2, 0.08, 400, 50, 'lowpass');
    }
    if (!active) return;
    const bpm = 118 + this.intensity * 30;
    const stepLen = 60 / bpm / 4;
    this.stepT -= dt;
    while (this.stepT <= 0) {
      this.stepT += stepLen;
      this.musicStep(this.step++);
    }
  }
  private musicStep(s: number) {
    const bus = this.musicBus;
    const i = s % 16;
    const bar = Math.floor(s / 16) % 4;
    const roots = [55, 55, 65.4, 49];
    const root = roots[bar];
    if (i % 4 === 0) this.tone(120, 0.15, 'sine', 0.22, 40, 0, bus);
    if (this.intensity > 0.3 && i % 4 === 2) this.noise(0.04, 0.05, 8000, 6000, 'highpass');
    if (i % 2 === 0) this.tone(root * (i % 8 === 6 ? 1.5 : 1), 0.2, 'sawtooth', 0.06, 0, 0, bus);
    if (this.intensity > 0.15 && [0, 3, 6, 10, 12].includes(i)) {
      const sc = [1, 1.2, 1.5, 1.8, 2];
      this.tone(root * 4 * sc[(i + bar) % 5], 0.12, 'square', 0.025, 0, 0, bus);
    }
  }
}
