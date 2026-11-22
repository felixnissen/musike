import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Track } from "./types";

export type MCCadence = 0 | 3 | 5 | 8;
export type MCLanguage = "sv-SE" | "en-US";
export interface MCSettings { language: MCLanguage; duckPercent: number; voiceId: string }
export interface MCVoice { id: string; name: string; lang: string }
export interface MCVoiceStatus { available: boolean; ready: boolean; message: string; voices: MCVoice[] }
interface NativeMC {
  status(options: { language: string }): Promise<MCVoiceStatus>;
  speak(options: { text: string; language: string; voiceId?: string; rate?: number }): Promise<void>;
  stop(): Promise<void>;
}
const nativeMC = Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform()
  ? registerPlugin<NativeMC>("MusikeMC") : null;
const cadenceKey = "musike:maestro-mc:v1";
const settingsKey = "musike:maestro-mc:settings:v2";
const allowed: readonly MCCadence[] = [0, 3, 5, 8];
const defaults: MCSettings = { language: "en-US", duckPercent: 9, voiceId: "" };

export function readMCCadence(): MCCadence {
  try {
    const n = Number(localStorage.getItem(cadenceKey));
    return allowed.includes(n as MCCadence) ? n as MCCadence : 0;
  } catch { return 0; }
}
export function saveMCCadence(n: MCCadence): void {
  if (!allowed.includes(n)) return;
  try { localStorage.setItem(cadenceKey, String(n)); } catch { /* private mode */ }
}
export function readMCSettings(): MCSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey) || "{}") as Partial<MCSettings>;
    return {
      language: raw.language === "sv-SE" ? "sv-SE" : "en-US",
      duckPercent: typeof raw.duckPercent === "number" && Number.isFinite(raw.duckPercent)
        ? Math.min(45, Math.max(5, Math.round(raw.duckPercent))) : defaults.duckPercent,
      voiceId: typeof raw.voiceId === "string" ? raw.voiceId.slice(0, 180) : "",
    };
  } catch { return { ...defaults }; }
}
export function saveMCSettings(input: MCSettings): void {
  const data: MCSettings = {
    language: input.language === "sv-SE" ? "sv-SE" : "en-US",
    duckPercent: Math.min(45, Math.max(5, Math.round(input.duckPercent))),
    voiceId: input.voiceId.slice(0, 180),
  };
  try { localStorage.setItem(settingsKey, JSON.stringify(data)); } catch { /* private mode */ }
}
export function isMCEligibleTrack(track: Pick<Track, "title" | "artist"> | null): boolean {
  return Boolean(track?.title?.trim() && track?.artist?.trim());
}
export function shouldMCAnnounce(cadence: MCCadence, playedInSession: number): boolean {
  return cadence > 0 && playedInSession > 1 && playedInSession % cadence === 0;
}
/** Never invent genres, accolades or trivia. Vary phrasing using real track metadata. */
export function mcAnnouncement(
  track: Pick<Track, "title" | "artist" | "album">,
  lang: MCLanguage = "sv-SE",
  sequence = 0,
): string {
  const title = track.title.trim();
  const artist = track.artist.trim();
  const album = track.album?.trim();
  const index = Math.abs(Math.trunc(sequence)) % 5;
  if (lang === "en-US") {
    const lines = [
      `Here's ${title}, by ${artist}.`,
      `${artist} on Musike, with ${title}.`,
      `Let's get into ${title}, from ${artist}.`,
      `You're listening to ${title}, by ${artist}.`,
      album ? `From the album ${album}, this is ${title} by ${artist}.` : `A little ${artist} now. This is ${title}.`,
    ];
    return lines[index];
  }
  const lines = [
    `Nu spelar vi ${title}, med ${artist}.`,
    `Här kommer ${artist} med ${title}.`,
    `På Musike: ${title}, av ${artist}.`,
    `Vi fortsätter med ${title}, från ${artist}.`,
    album ? `Från albumet ${album}, här är ${title} med ${artist}.` : `Nu är det dags för ${title}, med ${artist}.`,
  ];
  return lines[index];
}
function browserSpeech(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}
function browserVoices(language: MCLanguage): SpeechSynthesisVoice[] {
  const prefix = language.slice(0, 2);
  try {
    return browserSpeech()?.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix) && v.localService) ?? [];
  } catch { return []; }
}
export async function mcVoiceStatus(language: MCLanguage = readMCSettings().language): Promise<MCVoiceStatus> {
  if (nativeMC) {
    try {
      let result = await nativeMC.status({ language });
      for (let n = 0; n < 10 && !result.ready; n++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        result = await nativeMC.status({ language });
      }
      return result;
    } catch (err) { return { ready: false, available: false, message: String(err), voices: [] }; }
  }
  const voices = browserVoices(language);
  return {
    ready: true, available: voices.length > 0, voices: voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang })),
    message: voices.length ? `${voices.length} local voice(s) available` : `No offline ${language} voice found`,
  };
}
let speechGeneration = 0;
let speakingWeb: SpeechSynthesisUtterance | null = null;
let activeMedia: HTMLMediaElement | null = null;
let activeRestore: (() => void) | null = null;
let nativeActive = false;
let webSpeechTimeout: ReturnType<typeof setTimeout> | null = null;

export function stopMC(): void {
  ++speechGeneration;
  const restore = activeRestore;
  const hadWeb = speakingWeb !== null;
  const hadNative = nativeActive;
  speakingWeb = null;
  nativeActive = false;
  activeMedia = null;
  activeRestore = null;
  if (webSpeechTimeout) { clearTimeout(webSpeechTimeout); webSpeechTimeout = null; }
  if (hadWeb) {
    try { browserSpeech()?.cancel(); } catch { /* unavailable engine */ }
  }
  if (hadNative) void nativeMC?.stop().catch(() => {});
  // Restore from the current player state, not the volume before speech.
  restore?.();
}
function duck(media: HTMLMediaElement | null, currentVolume: () => { volume: number; muted: boolean }): void {
  activeMedia = media;
  activeRestore = () => {
    if (!media) return;
    const { volume, muted } = currentVolume();
    media.volume = volume;
    media.muted = muted;
  };
  if (media) {
    const { volume, muted } = currentVolume();
    media.volume = muted ? volume : volume * (readMCSettings().duckPercent / 100);
    media.muted = muted;
  }
}
export function applyMCVolume(media: HTMLMediaElement, volume: number, muted: boolean): void {
  media.volume = activeMedia === media && activeRestore
    ? volume * (readMCSettings().duckPercent / 100)
    : volume;
  media.muted = muted;
}
/** Preview uses the same mixer path as normal MC speech. The voice is independent of the music stream. */
async function speakAndWait(
  text: string, media: HTMLMediaElement | null,
  currentVolume: () => { volume: number; muted: boolean },
): Promise<boolean> {
  stopMC();
  const run = speechGeneration;
  const config = readMCSettings();
  if (!text.trim()) return false;
  if (nativeMC) {
    const status = await mcVoiceStatus(config.language);
    if (!status.available || run !== speechGeneration) return false;
    nativeActive = true;
    duck(media, currentVolume);
    try {
      await nativeMC.speak({ text, language: config.language, voiceId: config.voiceId, rate: 0.96 });
      return run === speechGeneration;
    } catch (error) {
      console.warn("[Maestro MC] Native speech:", error);
      return false;
    } finally {
      if (run === speechGeneration) stopMC();
    }
  }
  const synth = browserSpeech();
  const voices = browserVoices(config.language);
  const voice = voices.find((v) => v.voiceURI === config.voiceId) ?? voices[0];
  if (!synth || !voice || run !== speechGeneration) return false;
  return new Promise((resolve) => {
    let started = false;
    let settled = false;
    const complete = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (run === speechGeneration) stopMC();
      resolve(ok);
    };
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = config.language;
      utterance.voice = voice;
      utterance.rate = 0.96;
      utterance.volume = 1;
      speakingWeb = utterance;
      utterance.onstart = () => {
        if (run !== speechGeneration) { complete(false); return; }
        started = true;
        duck(media, currentVolume);
      };
      utterance.onend = () => complete(started);
      utterance.onerror = () => complete(false);
      webSpeechTimeout = setTimeout(() => complete(false), 18_000);
      synth.speak(utterance);
    } catch { complete(false); }
  });
}
export function speakMC(
  text: string, media: HTMLMediaElement | null,
  currentVolume: () => { volume: number; muted: boolean },
): boolean {
  if (!text.trim() || !media || media.paused || readMCCadence() === 0) return false;
  void speakAndWait(text, media, currentVolume);
  return true;
}
export async function previewMC(
  media: HTMLMediaElement | null = null,
  currentVolume: () => { volume: number; muted: boolean } = () => ({ volume: 1, muted: false }),
): Promise<boolean> {
  const config = readMCSettings();
  const message = config.language === "sv-SE"
    ? "Hej! Jag är Maestro. Här kommer din musik."
    : "Hey! I'm Maestro, your music host. Let's keep the good stuff playing.";
  return speakAndWait(message, media, currentVolume);
}
