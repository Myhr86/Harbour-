// Tiny WebAudio sting synth: no audio files, no dependencies.
type Sting = 'bell' | 'clash' | 'miss' | 'pistol' | 'thunder' | 'coins' | 'win' | 'lose' | 'click' | 'splash' | 'drum';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.6;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setAudio(opts: { muted: boolean; volume: number }) {
  muted = opts.muted;
  volume = opts.volume;
  if (master) master.gain.value = muted ? 0 : volume;
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master!);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(c: AudioContext, start: number, dur: number, gain: number, filterFreq: number, type: BiquadFilterType = 'lowpass') {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(start);
}

export function play(s: Sting) {
  if (muted) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + 0.01;
  switch (s) {
    case 'bell':
      tone(c, 880, t, 1.2, 'sine', 0.25);
      tone(c, 1320, t, 0.8, 'sine', 0.08);
      tone(c, 660, t + 0.35, 1.2, 'sine', 0.18);
      break;
    case 'clash':
      noise(c, t, 0.18, 0.5, 5000, 'highpass');
      tone(c, 2400, t, 0.15, 'square', 0.05, 1800);
      break;
    case 'miss':
      noise(c, t, 0.12, 0.2, 1200, 'bandpass');
      break;
    case 'pistol':
      noise(c, t, 0.5, 0.9, 900);
      tone(c, 120, t, 0.3, 'sine', 0.6, 40);
      break;
    case 'thunder':
      noise(c, t, 2.4, 0.9, 300);
      noise(c, t + 0.2, 1.8, 0.5, 120);
      break;
    case 'coins':
      [0, 0.07, 0.15].forEach((d, i) => tone(c, 1800 + i * 300, t + d, 0.15, 'triangle', 0.12));
      break;
    case 'win':
      [392, 523, 659, 784].forEach((f, i) => tone(c, f, t + i * 0.14, 0.5, 'triangle', 0.2));
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => tone(c, f, t + i * 0.2, 0.6, 'sawtooth', 0.06));
      break;
    case 'click':
      tone(c, 600, t, 0.05, 'square', 0.04);
      break;
    case 'splash':
      noise(c, t, 0.7, 0.5, 1500, 'bandpass');
      break;
    case 'drum':
      tone(c, 110, t, 0.35, 'sine', 0.5, 50);
      tone(c, 110, t + 0.18, 0.35, 'sine', 0.35, 50);
      break;
  }
}
