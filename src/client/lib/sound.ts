import { pref, setPref } from "./session";

// Tiny synthesized sounds — no audio files to download.

let ctx: AudioContext | null = null;
let enabled = pref("sound", true);
let haptics = pref("haptics", true);

export const soundOn = () => enabled;
export const hapticsOn = () => haptics;
export function setSound(on: boolean) {
  enabled = on;
  setPref("sound", on);
}
export function setHaptics(on: boolean) {
  haptics = on;
  setPref("haptics", on);
}

/** Browsers only allow audio after a user gesture; call this from the first tap. */
export function unlockAudio() {
  if (!ctx || ctx.state === "closed") {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  // Anything but "running" needs a nudge: iOS reports "interrupted" (missing from the TS
  // type) after a call app like Google Meet takes the audio, and never resumes by itself.
  if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
}

/** The context if it can play right now; otherwise nudge it and skip the sound rather than play it late. */
function live() {
  if (!ctx) return null;
  if (ctx.state === "running") return ctx;
  if (ctx.state !== "closed") ctx.resume().catch(() => {});
  return null;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.08) {
  const ctx = live();
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.05) {
  const ctx = live();
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  card() {
    if (enabled) noise(0.08, 0.09);
  },
  turn() {
    if (enabled) {
      tone(660, 0, 0.18, "sine", 0.07);
      tone(990, 0.09, 0.22, "sine", 0.06);
    }
    if (haptics) navigator.vibrate?.(20);
  },
  show() {
    if (enabled) [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.25, "triangle", 0.06));
  },
  win() {
    if (enabled) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.4, "triangle", 0.07));
    if (haptics) navigator.vibrate?.([30, 40, 30]);
  },
  lose() {
    if (enabled) [392, 330, 262].forEach((f, i) => tone(f, i * 0.13, 0.35, "sine", 0.06));
  },
  error() {
    if (enabled) tone(180, 0, 0.18, "square", 0.03);
    if (haptics) navigator.vibrate?.(40);
  },
};
