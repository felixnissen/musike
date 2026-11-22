import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { createDJMix, DJ_MODES, readDJPreferences, saveDJPreferences, setActiveDJMode, type DJMode, type DJPreferences } from "../lib/maestroDJ";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";
import { availableSwedishMCVoice, previewMC, readMCCadence, saveMCCadence, stopMC, type MCCadence } from "../lib/maestroMC";

const COPY = {
  sv: {
    title: "Maestro DJ",subtitle:"Välj känslan – Musike bygger kön åt dig.",
    choose:"Spellistor för det här läget", hint:"Markera en eller flera spellistor som passar stämningen. Utan val blandar DJ:n ur biblioteket; vi gissar inte låtarnas genre.",
    familiar:"Favoriter och igenkänning", discovery:"Mer upptäckter", known:"Mer bekant",
    start:"Starta DJ", empty:"Lägg till favoriter eller spellistor för att börja.",
    ready:"låtar i mixen", sources:"spellistor valda", fallback:"Baserat på biblioteket", saved:"Valen sparas på den här enheten.",
    party:"Party",chill:"Chill",singalong:"Skriksjunga",night:"Nattkörning",custom:"Mitt läge",
    mcTitle:"Svensk MC", mcHint:"Pratar kort om låten, utan att hitta på fakta. Kräver en svensk röst på enheten.", mcOff:"Tyst", mcOften:"Var 3:e låt", mcMedium:"Var 5:e låt", mcRare:"Var 8:e låt", mcNoVoice:"Ingen lokal svensk systemröst hittades. Musiken fortsätter utan prat.", mcPreview:"Prova rösten",
  },
  en: {
    title:"Maestro DJ",subtitle:"Choose a mood – Musike builds the queue.",
    choose:"Playlists for this mode",hint:"Select playlists that fit the mood. Without selections, DJ uses your library; it does not guess track genres.",
    familiar:"Favorites and familiarity",discovery:"More discovery",known:"More familiar",
    start:"Start DJ",empty:"Add some favorites or playlists to get started.",
    ready:"songs in the mix",sources:"playlists selected",fallback:"Based on your library",saved:"Settings are saved on this device.",
    party:"Party",chill:"Chill",singalong:"Sing along",night:"Night drive",custom:"My mode",
    mcTitle:"Swedish MC", mcHint:"Short, factual Swedish song intros. Requires a Swedish voice installed on the device.", mcOff:"Silent", mcOften:"Every 3 songs", mcMedium:"Every 5 songs", mcRare:"Every 8 songs", mcNoVoice:"No local Swedish system voice found. Music keeps playing without speech.", mcPreview:"Test voice",
  },
  pt: {
    title:"Maestro DJ",subtitle:"Escolha o clima e o Musike monta a fila.",
    choose:"Playlists para este modo",hint:"Selecione playlists que combinam com o clima. Sem seleção, o DJ usa sua biblioteca.",
    familiar:"Favoritos e músicas conhecidas",discovery:"Mais descobertas",known:"Mais conhecidas",
    start:"Iniciar DJ",empty:"Adicione favoritos ou playlists para começar.",
    ready:"músicas na seleção",sources:"playlists selecionadas",fallback:"Baseado na biblioteca",saved:"Configurações salvas neste dispositivo.",
    party:"Festa",chill:"Relaxar",singalong:"Cantar junto",night:"Dirigir à noite",custom:"Meu modo",
    mcTitle:"Locutor sueco", mcHint:"Apresentações curtas em sueco. Requer voz sueca instalada no dispositivo.", mcOff:"Silêncio", mcOften:"A cada 3 músicas", mcMedium:"A cada 5 músicas", mcRare:"A cada 8 músicas", mcNoVoice:"Nenhuma voz sueca local. A música continua sem fala.", mcPreview:"Testar voz",
  },
};
export function MaestroDJ() {
  const lang = useI18n((s) => s.lang);
  const t = lang === "sv" ? COPY.sv : lang === "pt-BR" ? COPY.pt : COPY.en;
  const [prefs, setPrefs] = useState<DJPreferences>(readDJPreferences);
  const [mcCadence, setMcCadence] = useState<MCCadence>(readMCCadence);
  const [voiceAvailable, setVoiceAvailable] = useState(() => Boolean(availableSwedishMCVoice()));
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const refresh = () => setVoiceAvailable(Boolean(availableSwedishMCVoice()));
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    refresh();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);
  const { favorites, playlists, history } = useLibrary();
  const playList = usePlayer((s) => s.playList);
  const [started, setStarted] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const update = (p: DJPreferences) => { setPrefs(p); saveDJPreferences(p); setStarted(false); };
  const ids = prefs.playlistIds[prefs.mode] ?? [];
  const preview = useMemo(() => createDJMix({ favorites, playlists, history }, prefs, { size: 50, seed: 27 }),
    [favorites, playlists, history, prefs]);
  const togglePlaylist = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    update({ ...prefs, playlistIds: { ...prefs.playlistIds, [prefs.mode]: next } });
  };
  const start = () => {
    const selection = createDJMix({ favorites, playlists, history }, prefs);
    if (!selection.tracks.length) return;
    // Player keeps its current behavior. Maestro chooses a queue, then
    // hands it to the same playback engine. No new audio source or services.
    usePlayer.getState().setShuffleMode("smart");
    if (usePlayer.getState().shuffle) usePlayer.getState().toggleShuffle();
    playList(selection.tracks, 0);
    setActiveDJMode(prefs.mode);
    setLastResult(selection.tracks.length + " " + t.ready);
    setStarted(true);
  };
  return (
    <section className="mx-4 overflow-hidden rounded-[20px] border border-line bg-surface-2 p-4 md:mx-6 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-text">Musike • Smart radio</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{t.title}</h2>
          <p className="mt-1 text-xs text-fg-2">{t.subtitle}</p>
        </div>
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-2xl">🎧</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DJ_MODES.map((mode) => (
          <button
            type="button"
            key={mode.id}
            aria-pressed={prefs.mode === mode.id}
            onClick={() => update({ ...prefs, mode: mode.id as DJMode })}
            className={"flex min-h-14 items-center gap-2 rounded-[13px] px-3 text-left text-xs font-semibold transition-colors " +
              (prefs.mode === mode.id ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg hover:bg-surface-4")}
          >
            <span aria-hidden="true" className="text-lg">{mode.icon}</span>
            <span>{t[mode.id]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium">{t.choose}</p>
        <p className="mt-1 text-xs text-fg-2">{t.hint}</p>
        {playlists.length > 0 && (
          <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {playlists.map((p) => (
              <button type="button" key={p.id} aria-pressed={ids.includes(p.id)}
                onClick={() => togglePlaylist(p.id)}
                className={"rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors " +
                  (ids.includes(p.id) ? "bg-accent-soft text-accent-text ring-accent/40" : "bg-surface-3 text-fg-2 ring-line hover:text-fg")}>
                {ids.includes(p.id) ? "✓ " : "+ "}{p.name} · {p.tracks.length}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <label htmlFor="maestro-familiar" className="text-sm font-medium">{t.familiar}</label>
        <span className="text-xs tabular-nums text-accent-text">{prefs.familiar}%</span>
      </div>
      <input id="maestro-familiar" type="range" min="0" max="100" step="5" value={prefs.familiar}
        onChange={(e) => update({ ...prefs, familiar: Number(e.target.value) })}
        className="mt-2 w-full accent-[var(--accent)]" />
      <div className="flex justify-between text-[11px] text-fg-3"><span>{t.discovery}</span><span>{t.known}</span></div>
      <div className="mt-4 rounded-xl border border-line bg-surface-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">🎙️ {t.mcTitle}</p>
          <button type="button" onClick={() => setVoiceAvailable(Boolean(availableSwedishMCVoice()))}
            className="text-[11px] text-accent-text" aria-label="Uppdatera röster">↻</button>
        </div>
        <p className="mt-1 text-xs text-fg-2">{t.mcHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([[0, t.mcOff], [3, t.mcOften], [5, t.mcMedium], [8, t.mcRare]] as const).map(([cadence, label]) => (
            <button key={cadence} type="button" aria-pressed={mcCadence === cadence}
              onClick={() => {
                saveMCCadence(cadence);
                setMcCadence(cadence);
                if (cadence === 0) stopMC();
                setVoiceAvailable(Boolean(availableSwedishMCVoice()));
              }}
              className={"rounded-full px-3 py-2 text-xs font-medium ring-1 transition-colors " +
                (mcCadence === cadence ? "bg-accent-soft text-accent-text ring-accent/40" : "bg-surface-2 text-fg-2 ring-line")}>
              {label}
            </button>
          ))}
        </div>
        {voiceAvailable && (
          <button type="button" onClick={() => previewMC()}
            className="mt-3 rounded-full border border-line px-3 py-2 text-xs text-fg hover:bg-surface-4">
            ▶ {t.mcPreview}
          </button>
        )}
        {mcCadence > 0 && !voiceAvailable &&
          <p role="status" className="mt-2 text-xs text-fg-2">{t.mcNoVoice}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-fg-2">
          <p>{preview.candidates} {t.ready}</p>
          <p className="truncate">{ids.length ? ids.length + " " + t.sources : t.fallback}</p>
        </div>
        <button type="button" disabled={preview.candidates === 0} onClick={start}
          className="min-h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-40">
          ▶ {t.start}
        </button>
      </div>
      {preview.candidates === 0 && <p className="mt-2 text-xs text-fg-2">{t.empty}</p>}
      {started && <p role="status" className="mt-2 text-xs text-accent-text">{lastResult}</p>}
      <p className="mt-2 text-[10px] text-fg-3">{t.saved}</p>
    </section>
  );
}
