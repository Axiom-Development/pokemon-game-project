/**
 * Original chiptune-style sound effects, synthesised with the Web Audio API.
 * No recorded audio is shipped, so there are no licensing concerns.
 *
 * The AudioContext is created lazily on the first sound, which always follows
 * a user gesture, so browser autoplay rules are respected.
 */

export type SoundName = "select" | "correct" | "wrong" | "reveal" | "streak" | "gameover" | "tick" | "hint";

type Wave = OscillatorType;
interface Note {
  freq: number;
  /** Seconds from the start of the effect. */
  at: number;
  dur: number;
  wave?: Wave;
  slideTo?: number;
  gain?: number;
}

const N = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093 };

const EFFECTS: Record<SoundName, Note[]> = {
  select: [{ freq: N.A5, at: 0, dur: 0.05, wave: "square", gain: 0.5 }],
  hint: [
    { freq: N.E6, at: 0, dur: 0.05, wave: "square", gain: 0.4 },
    { freq: N.B5, at: 0.06, dur: 0.07, wave: "square", gain: 0.4 },
  ],
  tick: [{ freq: 1500, at: 0, dur: 0.03, wave: "square", gain: 0.25 }],
  reveal: [{ freq: 220, at: 0, dur: 0.22, wave: "triangle", slideTo: 1760, gain: 0.9 }],
  correct: [
    { freq: N.C6, at: 0, dur: 0.07, wave: "square" },
    { freq: N.E6, at: 0.07, dur: 0.07, wave: "square" },
    { freq: N.G6, at: 0.14, dur: 0.07, wave: "square" },
    { freq: N.C7, at: 0.21, dur: 0.18, wave: "square" },
  ],
  wrong: [
    { freq: 196, at: 0, dur: 0.12, wave: "square", gain: 0.6 },
    { freq: 147, at: 0.13, dur: 0.22, wave: "square", gain: 0.6 },
  ],
  streak: [
    { freq: N.G5, at: 0, dur: 0.08, wave: "square" },
    { freq: N.G5, at: 0.1, dur: 0.08, wave: "square" },
    { freq: N.G5, at: 0.2, dur: 0.08, wave: "square" },
    { freq: N.E6, at: 0.3, dur: 0.3, wave: "square" },
    { freq: N.D6, at: 0.3, dur: 0.3, wave: "triangle", gain: 0.5 },
  ],
  gameover: [
    { freq: N.E5, at: 0, dur: 0.16, wave: "square" },
    { freq: 493.88, at: 0.17, dur: 0.16, wave: "square" },
    { freq: 415.3, at: 0.34, dur: 0.16, wave: "square" },
    { freq: 329.63, at: 0.51, dur: 0.4, wave: "square" },
  ],
};

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  volume = 0.6;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  play(name: SoundName): void {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") void ctx.resume();
    // Square waves are loud; keep the overall level gentle.
    this.master.gain.value = this.volume * 0.18;
    const start = ctx.currentTime + 0.01;
    for (const note of EFFECTS[name]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const t0 = start + note.at;
      const t1 = t0 + note.dur;
      osc.type = note.wave ?? "square";
      osc.frequency.setValueAtTime(note.freq, t0);
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t1);
      const peak = note.gain ?? 0.8;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
      env.gain.setValueAtTime(peak, Math.max(t0 + 0.005, t1 - 0.02));
      env.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(env).connect(this.master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }
}

export const sfx = new SoundPlayer();
