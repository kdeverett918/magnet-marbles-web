import type { FxEvent } from "../data/types";

/**
 * Hybrid sound engine: generated SFX samples when available, synth fallback always.
 * Lazily created on first user gesture (browser autoplay policy).
 * Background music is intentionally disabled; sound should only be short gameplay feedback.
 */
const SAMPLE_URLS = {
  pickup: "./audio/sfx/pickup.mp3",
  bank: "./audio/sfx/bank.mp3",
  hit: "./audio/sfx/hit.mp3",
  shockPulse: "./audio/sfx/shock-pulse.mp3",
  magnetBurst: "./audio/sfx/magnet-burst.mp3",
  fall: "./audio/sfx/fall.mp3",
} as const;

const DEFAULT_ENGINE_VOLUME = 0.28;
const OUTPUT_GAIN_TRIM = 0.72;

type SampleName = keyof typeof SAMPLE_URLS;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = DEFAULT_ENGINE_VOLUME;
  private samplesStarted = false;
  private sampleBuffers: Partial<Record<SampleName, AudioBuffer>> = {};

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyMasterGain();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : DEFAULT_ENGINE_VOLUME));
    this.applyMasterGain();
  }

  private applyMasterGain() {
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
  }

  ensure() {
    if (!this.enabled) return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.applyMasterGain();
    this.master.connect(this.ctx.destination);
    void this.preloadSamples();
  }

  private async preloadSamples() {
    if (!this.ctx || this.samplesStarted) return;
    this.samplesStarted = true;
    await Promise.all(
      Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const bytes = await res.arrayBuffer();
          this.sampleBuffers[name as SampleName] = await this.ctx!.decodeAudioData(bytes);
        } catch {
          // Samples are polish, not a dependency. Synth playback remains available.
        }
      })
    );
  }

  private sample(name: SampleName, gain = 0.35, rate = 1) {
    if (!this.ctx || !this.master || !this.enabled) return false;
    const buffer = this.sampleBuffers[name];
    if (!buffer) return false;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    g.gain.value = gain * OUTPUT_GAIN_TRIM;
    src.connect(g);
    g.connect(this.master);
    src.start(this.ctx.currentTime);
    return true;
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.3,
    slideTo?: number,
    dest?: AudioNode
  ) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * OUTPUT_GAIN_TRIM, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest ?? this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.25, hp = 800) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = gain * OUTPUT_GAIN_TRIM;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  play(ev: FxEvent) {
    if (!this.ctx) return;
    switch (ev.kind) {
      case "pickup":
        if (!this.sample("pickup", 0.28, 0.96 + Math.random() * 0.08)) {
          this.blip(520 + Math.random() * 120, 0.09, "triangle", 0.18, 900);
        }
        break;
      case "cluster":
        if (!this.sample("pickup", 0.34, ev.count >= 10 ? 0.78 : 0.86)) {
          this.blip(480, 0.08, "triangle", 0.14, 720);
        }
        this.blip(ev.count >= 10 ? 1040 : 840, 0.12, "sine", 0.12, ev.count >= 18 ? 1680 : 1260);
        break;
      case "bank":
        this.sample("bank", ev.big ? 0.62 : 0.42, ev.big ? 0.92 : 1.04);
        this.blip(ev.big ? 440 : 660, 0.16, "square", 0.22, ev.big ? 1320 : 990);
        this.blip(880, 0.12, "sine", 0.12, 1760);
        break;
      case "bankStreak":
        this.sample("bank", 0.38 + ev.bonus * 0.08, 1.12 + ev.bonus * 0.06);
        this.blip(760, 0.1, "triangle", 0.14, 1140);
        this.blip(980 + ev.bonus * 140, 0.14, "sine", 0.13, 1500 + ev.bonus * 240);
        break;
      case "hit":
        if (!this.sample("hit", 0.36, 0.92 + Math.random() * 0.16)) {
          this.noise(0.12, 0.3, 500);
          this.blip(160, 0.1, "sawtooth", 0.18, 60);
        }
        break;
      case "steal":
        this.sample("shockPulse", 0.34, 1.12);
        this.blip(300, 0.18, "sawtooth", 0.2, 720);
        break;
      case "knockoff":
        this.sample("fall", 0.48, 0.9);
        this.noise(0.3, 0.35, 300);
        this.blip(220, 0.3, "sawtooth", 0.22, 40);
        break;
      case "paint":
        this.blip(420, 0.25, "sine", 0.22, 1400);
        this.blip(560, 0.25, "triangle", 0.16, 1800);
        break;
      case "powerup":
        if (ev.type === "shockPulse") this.sample("shockPulse", 0.48);
        else if (ev.type === "magnetBurst") this.sample("magnetBurst", 0.48);
        else if (ev.type === "heavyCore") this.sample("hit", 0.28, 0.72);
        this.blip(660, 0.18, "square", 0.18, 1320);
        break;
      case "fall":
        if (!this.sample("fall", 0.45)) this.blip(400, 0.4, "sine", 0.2, 60);
        break;
    }
  }

  countdownBeep(go: boolean) {
    this.blip(go ? 880 : 520, go ? 0.3 : 0.12, "square", 0.25, go ? 1320 : undefined);
  }

  preview() {
    this.ensure();
    if (!this.ctx || !this.enabled) return;
    if (!this.sample("pickup", 0.2, 1.02)) this.blip(620, 0.08, "triangle", 0.13, 980);
    globalThis.setTimeout(() => {
      if (!this.ctx || !this.enabled) return;
      if (!this.sample("bank", 0.24, 1.08)) {
        this.blip(760, 0.1, "sine", 0.12, 1220);
        this.blip(1040, 0.12, "triangle", 0.1, 1560);
      }
    }, 105);
  }
}

export const sfx = new SfxEngine();
