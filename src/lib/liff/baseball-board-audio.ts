// filepath: src/lib/liff/baseball-board-audio.ts

const SOUND_STORAGE_KEY = "iscore_baseball_board_sound_v1";

let sharedAudioCtx: AudioContext | null = null;
let lastPinBounceAt = 0;

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function getSavedBaseballBoardSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function saveBaseballBoardSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedAudioCtx) {
      const AudioCtor =
        window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AudioCtor) return null;
      sharedAudioCtx = new AudioCtor();
    }
    if (sharedAudioCtx.state === "suspended") {
      void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playTone(params: {
  ctx: AudioContext;
  type: OscillatorType;
  startFreq: number;
  endFreq?: number;
  startTime: number;
  duration: number;
  peakGain: number;
}): void {
  const {
    ctx,
    type,
    startFreq,
    endFreq,
    startTime,
    duration,
    peakGain,
  } = params;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  if (typeof endFreq === "number" && endFreq > 0) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFreq),
      startTime + duration
    );
  }
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.012, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

export function playPitchSpring(enabled: boolean): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone({
    ctx,
    type: "triangle",
    startFreq: 240,
    endFreq: 520,
    startTime: now,
    duration: 0.075,
    peakGain: 0.09,
  });
}

export function playVanishTrap(enabled: boolean): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone({
    ctx,
    type: "sine",
    startFreq: 680,
    endFreq: 130,
    startTime: now,
    duration: 0.19,
    peakGain: 0.12,
  });
}

export function playSwingWhoosh(enabled: boolean): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone({
    ctx,
    type: "sine",
    startFreq: 320,
    endFreq: 95,
    startTime: now,
    duration: 0.09,
    peakGain: 0.08,
  });
}

export function playBatContact(
  enabled: boolean,
  quality: "sweet" | "normal" | "bunt" | "foul"
): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (quality === "sweet") {
    // 金属＆木製の心地よい「カキーン！！」
    playTone({
      ctx,
      type: "triangle",
      startFreq: 1420,
      endFreq: 880,
      startTime: now,
      duration: 0.22,
      peakGain: 0.16,
    });
    playTone({
      ctx,
      type: "sine",
      startFreq: 2240,
      endFreq: 1760,
      startTime: now + 0.01,
      duration: 0.28,
      peakGain: 0.1,
    });
    return;
  }

  if (quality === "normal") {
    playTone({
      ctx,
      type: "triangle",
      startFreq: 960,
      endFreq: 420,
      startTime: now,
      duration: 0.12,
      peakGain: 0.13,
    });
    return;
  }

  if (quality === "bunt") {
    playTone({
      ctx,
      type: "sine",
      startFreq: 520,
      endFreq: 260,
      startTime: now,
      duration: 0.065,
      peakGain: 0.09,
    });
    return;
  }

  // foul tip
  playTone({
    ctx,
    type: "square",
    startFreq: 760,
    endFreq: 330,
    startTime: now,
    duration: 0.075,
    peakGain: 0.07,
  });
}

export function playPinRicochet(enabled: boolean): void {
  if (!enabled) return;
  const perfNow = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (perfNow - lastPinBounceAt < 55) return;
  lastPinBounceAt = perfNow;

  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const jitter = 980 + Math.random() * 280;
  playTone({
    ctx,
    type: "sine",
    startFreq: jitter,
    endFreq: jitter * 0.72,
    startTime: now,
    duration: 0.055,
    peakGain: 0.08,
  });
}

export function playPocketResult(
  enabled: boolean,
  kind: "hr" | "3b" | "2b" | "1b" | "out" | "dp" | "walk" | "strikeout"
): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (kind === "hr") {
    // 球場オルガン風ホームランファンファーレ（ド・ミ・ソ・高ド！）
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const dur = idx === notes.length - 1 ? 0.38 : 0.11;
      const offset = idx * 0.105;
      playTone({
        ctx,
        type: "triangle",
        startFreq: freq,
        startTime: now + offset,
        duration: dur,
        peakGain: 0.14,
      });
    });
    return;
  }

  if (kind === "3b" || kind === "2b") {
    const notes = kind === "3b" ? [523.25, 659.25, 880] : [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      playTone({
        ctx,
        type: "triangle",
        startFreq: freq,
        startTime: now + idx * 0.085,
        duration: idx === 2 ? 0.22 : 0.09,
        peakGain: 0.12,
      });
    });
    return;
  }

  if (kind === "1b" || kind === "walk") {
    playTone({
      ctx,
      type: "triangle",
      startFreq: 523.25,
      startTime: now,
      duration: 0.08,
      peakGain: 0.11,
    });
    playTone({
      ctx,
      type: "triangle",
      startFreq: 659.25,
      startTime: now + 0.08,
      duration: 0.16,
      peakGain: 0.11,
    });
    return;
  }

  if (kind === "dp") {
    playTone({
      ctx,
      type: "sawtooth",
      startFreq: 240,
      endFreq: 165,
      startTime: now,
      duration: 0.11,
      peakGain: 0.08,
    });
    playTone({
      ctx,
      type: "sawtooth",
      startFreq: 190,
      endFreq: 120,
      startTime: now + 0.12,
      duration: 0.18,
      peakGain: 0.09,
    });
    return;
  }

  // out / strikeout
  playTone({
    ctx,
    type: "sawtooth",
    startFreq: 220,
    endFreq: 135,
    startTime: now,
    duration: 0.16,
    peakGain: 0.08,
  });
}

export function playGameSetFanfare(enabled: boolean, didWin: boolean): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = didWin
    ? [523.25, 659.25, 783.99, 659.25, 1046.5]
    : [392.0, 349.23, 329.63, 261.63];
  notes.forEach((freq, idx) => {
    playTone({
      ctx,
      type: "triangle",
      startFreq: freq,
      startTime: now + idx * 0.11,
      duration: idx === notes.length - 1 ? 0.36 : 0.1,
      peakGain: 0.12,
    });
  });
}
