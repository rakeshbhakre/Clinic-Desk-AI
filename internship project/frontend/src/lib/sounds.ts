type Tone = "ring" | "connect" | "end";

type Blip = {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
};

const SAMPLE_RATE = 24000;

const TONES: Record<Tone, { duration: number; blips: Blip[] }> = {
  ring: {
    duration: 0.86,
    blips: [
      { frequency: 660, start: 0.0, duration: 0.16, gain: 0.45 },
      { frequency: 880, start: 0.22, duration: 0.16, gain: 0.45 },
      { frequency: 660, start: 0.48, duration: 0.16, gain: 0.45 },
    ],
  },
  connect: {
    duration: 0.42,
    blips: [
      { frequency: 520, start: 0.0, duration: 0.12, gain: 0.38 },
      { frequency: 780, start: 0.14, duration: 0.22, gain: 0.38 },
    ],
  },
  end: {
    duration: 0.44,
    blips: [
      { frequency: 440, start: 0.0, duration: 0.12, gain: 0.36 },
      { frequency: 300, start: 0.14, duration: 0.24, gain: 0.36 },
    ],
  },
};

let ringTimer: number | null = null;
const audioCache = new Map<Tone, HTMLAudioElement>();
const uriCache = new Map<Tone, string>();

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createWavDataUri(tone: Tone): string {
  const spec = TONES[tone];
  const sampleCount = Math.floor(spec.duration * SAMPLE_RATE);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    let sample = 0;

    for (const blip of spec.blips) {
      const local = time - blip.start;
      if (local < 0 || local >= blip.duration) continue;
      const attack = Math.min(1, local / 0.015);
      const release = Math.min(1, (blip.duration - local) / 0.04);
      const envelope = Math.max(0, Math.min(attack, release));
      sample +=
        Math.sin(2 * Math.PI * blip.frequency * local) * blip.gain * envelope;
    }

    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const base64 =
    typeof btoa === "function" ? btoa(binary) : "";
  return `data:audio/wav;base64,${base64}`;
}

function getAudio(tone: Tone): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  let audio = audioCache.get(tone);
  if (!audio) {
    let source = uriCache.get(tone);
    if (!source) {
      source = createWavDataUri(tone);
      uriCache.set(tone, source);
    }
    audio = new Audio(source);
    audio.preload = "auto";
    audio.volume = 1;
    audio.setAttribute("playsinline", "");
    audioCache.set(tone, audio);
  }
  return audio;
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function resetAudio(audio: HTMLAudioElement): void {
  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking before metadata is loaded; it is harmless.
  }
}

function primeAudio(audio: HTMLAudioElement): void {
  const originalVolume = audio.volume;
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      resetAudio(audio);
      audio.volume = originalVolume;
    })
    .catch(() => {
      audio.volume = originalVolume;
    });
}

export function playTone(tone: Tone): void {
  if (tone === "ring") vibrate([90, 120, 90]);
  else if (tone === "connect") vibrate(60);
  else vibrate([80, 60, 80]);

  const audio = getAudio(tone);
  if (!audio) return;

  audio.loop = false;
  audio.pause();
  resetAudio(audio);
  void audio.play().catch(() => undefined);
}

export function startRing(): void {
  stopRing();

  // Unlock the one-shot tones during the button gesture so mobile browsers
  // allow them to play later when the call connects or ends.
  const connect = getAudio("connect");
  const end = getAudio("end");
  if (connect) primeAudio(connect);
  if (end) primeAudio(end);

  const ring = getAudio("ring");
  if (!ring) return;

  ring.loop = true;
  resetAudio(ring);
  void ring.play().catch(() => undefined);

  // Retry only if the browser blocked the first play.
  ringTimer = window.setInterval(() => {
    if (ring.paused) void ring.play().catch(() => undefined);
  }, 900);
}

export function stopRing(): void {
  if (ringTimer !== null) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }

  const ring = audioCache.get("ring");
  if (ring) {
    ring.pause();
    resetAudio(ring);
  }
}
