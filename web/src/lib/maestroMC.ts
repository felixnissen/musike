import type { Track } from "./types";

/** MC is opt-in. Only speech APIs provided by the current device are used. */
export type MCCadence = 0 | 3 | 5 | 8;
const KEY = "musike:maestro-mc:v1";
const ALLOWED: readonly MCCadence[] = [0, 3, 5, 8];

export function readMCCadence(): MCCadence {
  try {
    const value = Number(localStorage.getItem(KEY));
    return ALLOWED.includes(value as MCCadence) ? value as MCCadence : 0;
  } catch {
    return 0;
  }
}

export function saveMCCadence(cadence: MCCadence): void {
  if (!ALLOWED.includes(cadence)) return;
  try { localStorage.setItem(KEY, String(cadence)); } catch { /* private mode */ }
}

export function isMCEligibleTrack(track: Pick<Track, "title" | "artist"> | null): boolean {
  return Boolean(track?.title?.trim() && track?.artist?.trim());
}

/** Announce the upcoming song only every N actual starts (never on seeks/pauses). */
export function shouldMCAnnounce(cadence: MCCadence, playedInSession: number): boolean {
  return cadence > 0 && playedInSession > 1 && playedInSession % cadence === 0;
}

export function mcAnnouncement(track: Pick<Track, "title" | "artist">): string {
  // Deterministic, source-grounded: no invented facts, genres or release dates.
  return `Nu spelar vi ${track.title}, med ${track.artist}.`;
}

let voiceInstance: SpeechSynthesisUtterance | null = null;
let currentMedia: HTMLMediaElement | null = null;
let currentRestore: (() => void) | null = null;
let generation = 0;

function speechEngine(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

/** Device voices only; no remote TTS service or model download. */
export function availableSwedishMCVoice(): SpeechSynthesisVoice | null {
  try {
    const speech = speechEngine();
    return speech?.getVoices().find((v) => /^sv(?:-|_)/i.test(v.lang) && v.localService) ?? null;
  } catch { return null; }
}

export function stopMC(): void {
  ++generation;
  const restore = currentRestore;
  const wasSpeaking = voiceInstance !== null;
  currentRestore = null;
  currentMedia = null;
  voiceInstance = null;
  if (wasSpeaking) {
    try { speechEngine()?.cancel(); } catch { /* unavailable OS voice */ }
  }
  restore?.();
}

export function speakMC(
  text: string,
  media: HTMLMediaElement | null,
  currentVolume: () => { volume: number; muted: boolean },
): boolean {
  const speech = speechEngine();
  const voice = availableSwedishMCVoice();
  if (!speech || !voice || !text.trim() || !media || media.paused) return false;
  stopMC();
  const run = generation;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sv-SE";
    utterance.voice = voice;
    utterance.rate = 1;
    utterance.volume = 1;
    const restore = () => {
      const { volume, muted } = currentVolume();
      media.volume = Math.max(0, Math.min(1, volume));
      media.muted = muted;
    };
    voiceInstance = utterance;
    currentMedia = media;
    currentRestore = restore;
    utterance.onstart = () => {
      if (run !== generation || currentMedia !== media) return;
      const { volume, muted } = currentVolume();
      if (!muted) media.volume = volume * 0.28;
    };
    const finish = () => { if (run === generation) stopMC(); };
    utterance.onend = finish;
    utterance.onerror = finish;
    speech.speak(utterance);
    return true;
  } catch {
    stopMC();
    return false;
  }
}

/** One-tap voice test: never modifies music volume or the playing queue. */
export function previewMC(): boolean {
  const speech = speechEngine();
  const voice = availableSwedishMCVoice();
  if (!speech || !voice) return false;
  stopMC();
  try {
    const utterance = new SpeechSynthesisUtterance("Hej! Jag är Maestro, din svenska DJ.");
    utterance.lang = "sv-SE";
    utterance.voice = voice;
    utterance.rate = 1;
    voiceInstance = utterance;
    const run = generation;
    const finish = () => { if (run === generation) stopMC(); };
    utterance.onend = finish;
    utterance.onerror = finish;
    speech.speak(utterance);
    return true;
  } catch { stopMC(); return false; }
}

/** A volume or mute change during the announcement must remain authoritative. */
export function applyMCVolume(media: HTMLMediaElement, volume: number, muted: boolean): void {
  media.volume = voiceInstance && currentMedia === media ? volume * 0.28 : volume;
  media.muted = muted;
}
