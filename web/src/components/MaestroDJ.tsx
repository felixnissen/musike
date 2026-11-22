import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { createDJMix, DJ_MODES, readDJPreferences, saveDJPreferences, setActiveDJMode, type DJMode, type DJPreferences } from "../lib/maestroDJ";
import { currentMCMedia, usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";
import { mcVoiceStatus, previewMC, readMCCadence, readMCSettings, saveMCCadence, saveMCSettings, stopMC, type MCCadence, type MCLanguage, type MCSettings, type MCVoice } from "../lib/maestroMC";

const COPY = {
  sv: {
    title: "Maestro DJ",subtitle:"Välj känslan – Musike bygger kön åt dig.",
    choose:"Spellistor för det här läget", hint:"Markera en eller flera spellistor som passar stämningen. Utan val blandar DJ:n ur biblioteket; vi gissar inte låtarnas genre.",
    familiar:"Favoriter och igenkänning", discovery:"Mer upptäckter", known:"Mer bekant",
    start:"Starta DJ", empty:"Lägg till favoriter eller spellistor för att börja.",
    ready:"låtar i mixen", sources:"spellistor valda", fallback:"Baserat på biblioteket", saved:"Valen sparas på den här enheten.",
    party:"Party",chill:"Chill",singalong:"Skriksjunga",night:"Nattkörning",custom:"Mitt läge",
    mcTitle:"Maestro MC", mcHint:"Korta, varierade presentationer av riktiga låtar. Välj språk och hur högt musiken får ligga under prat.", mcOff:"Tyst", mcOften:"Var 3:e låt", mcMedium:"Var 5:e låt", mcRare:"Var 8:e låt", mcNoVoice:"Musiken fortsätter utan prat tills en svensk offline-röst finns.", mcPreview:"Prova rösten", mcChecking:"Kontrollerar rösten…", mcReady:"Röst redo", mcFailed:"Rösttestet misslyckades. Kontrollera Androids talsyntesinställningar.", mcSpeaking:"Pratar…", mcLang:"Språk", mcSwedish:"Svenska", mcEnglish:"Engelska", mcVoice:"Röst", mcDuck:"Musikvolym under prat", mcDefault:"Automatiskt vald röst", mcMissing:"Saknas en offline-röst? Installera en via telefonens talsyntesinställningar.",
  },
  en: {
    title:"Maestro DJ",subtitle:"Choose a mood – Musike builds the queue.",
    choose:"Playlists for this mode",hint:"Select playlists that fit the mood. Without selections, DJ uses your library; it does not guess track genres.",
    familiar:"Favorites and familiarity",discovery:"More discovery",known:"More familiar",
    start:"Start DJ",empty:"Add some favorites or playlists to get started.",
    ready:"songs in the mix",sources:"playlists selected",fallback:"Based on your library",saved:"Settings are saved on this device.",
    party:"Party",chill:"Chill",singalong:"Sing along",night:"Night drive",custom:"My mode",
    mcTitle:"Maestro MC", mcHint:"Varied song introductions, with your choice of voice language and music ducking.", mcOff:"Silent", mcOften:"Every 3 songs", mcMedium:"Every 5 songs", mcRare:"Every 8 songs", mcNoVoice:"Music continues without speech until a Swedish offline voice is available.", mcPreview:"Test voice", mcChecking:"Checking voice…", mcReady:"Voice ready", mcFailed:"Voice test failed. Check device text-to-speech settings.", mcSpeaking:"Speaking…", mcLang:"Language", mcSwedish:"Swedish", mcEnglish:"English", mcVoice:"Voice", mcDuck:"Music volume during speech", mcDefault:"Automatic voice", mcMissing:"No offline voice? Install one in your device text-to-speech settings.",
  },
  pt: {
    title:"Maestro DJ",subtitle:"Escolha o clima e o Musike monta a fila.",
    choose:"Playlists para este modo",hint:"Selecione playlists que combinam com o clima. Sem seleção, o DJ usa sua biblioteca.",
    familiar:"Favoritos e músicas conhecidas",discovery:"Mais descobertas",known:"Mais conhecidas",
    start:"Iniciar DJ",empty:"Adicione favoritos ou playlists para começar.",
    ready:"músicas na seleção",sources:"playlists selecionadas",fallback:"Baseado na biblioteca",saved:"Configurações salvas neste dispositivo.",
    party:"Festa",chill:"Relaxar",singalong:"Cantar junto",night:"Dirigir à noite",custom:"Meu modo",
    mcTitle:"Maestro MC", mcHint:"Anúncios variados, idioma da voz e volume da música durante a fala.", mcOff:"Silêncio", mcOften:"A cada 3 músicas", mcMedium:"A cada 5 músicas", mcRare:"A cada 8 músicas", mcNoVoice:"Música continua sem fala até instalar voz sueca offline.", mcPreview:"Testar voz", mcChecking:"Verificando voz…", mcReady:"Voz pronta", mcFailed:"Teste de voz falhou. Verifique a síntese de fala.", mcSpeaking:"Falando…", mcLang:"Idioma", mcSwedish:"Sueco", mcEnglish:"Inglês", mcVoice:"Voz", mcDuck:"Volume da música durante a fala", mcDefault:"Voz automática", mcMissing:"Sem voz offline? Instale uma nas configurações do Android.",
  },
};
export function MaestroDJ() {
  const lang = useI18n((s) => s.lang);
  const t = lang === "sv" ? COPY.sv : lang === "pt-BR" ? COPY.pt : COPY.en;
  const [prefs, setPrefs] = useState<DJPreferences>(readDJPreferences);
  const [mcCadence, setMcCadence] = useState<MCCadence>(readMCCadence);
  const [mcOptions, setMcOptions] = useState<MCSettings>(readMCSettings);
  const [mcVoices, setMcVoices] = useState<MCVoice[]>([]);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState(t.mcChecking);
  const changeMC = (value: MCSettings) => {
    saveMCSettings(value);
    setMcOptions(value);
    stopMC();
  };
  const refreshMCVoice = (language: MCLanguage = mcOptions.language) => {
    void mcVoiceStatus(language).then((v) => {
      if (readMCSettings().language !== language) return;
      setVoiceAvailable(v.available);
      setMcVoices(v.voices);
      setVoiceMessage(v.message);
    });
  };
  useEffect(() => {
    let active = true;
    const language = mcOptions.language;
    const refresh = () => {
      void mcVoiceStatus(language).then((v) => {
        if (!active) return;
        setVoiceAvailable(v.available);
        setMcVoices(v.voices);
        setVoiceMessage(v.message);
      });
    };
    refresh();
    if ("speechSynthesis" in window) window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      active = false;
      if ("speechSynthesis" in window) window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
  }, [mcOptions.language]);
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
          <button type="button" onClick={() => refreshMCVoice()}
            className="text-[11px] text-accent-text" aria-label="Uppdatera röster">↻</button>
        </div>
        <p className="mt-1 text-xs text-fg-2">{t.mcHint}</p>
        <p className="mt-3 text-xs font-medium">{t.mcLang}</p>
        <div className="mt-2 flex gap-2">
          {([["en-US", t.mcEnglish], ["sv-SE", t.mcSwedish]] as const).map(([language, label]) => (
            <button key={language} type="button" aria-pressed={mcOptions.language === language}
              onClick={() => {
                changeMC({ ...mcOptions, language, voiceId: "" });
                setVoiceAvailable(false);
                setVoiceMessage(t.mcChecking);
              }}
              className={"rounded-full px-3 py-2 text-xs ring-1 " +
                (mcOptions.language === language ? "bg-accent-soft text-accent-text ring-accent/40" : "bg-surface-2 text-fg-2 ring-line")}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs font-medium" htmlFor="maestro-mc-voice">{t.mcVoice}</label>
        <select id="maestro-mc-voice" value={mcVoices.some((v) => v.id === mcOptions.voiceId) ? mcOptions.voiceId : ""}
          onChange={(event) => changeMC({ ...mcOptions, voiceId: event.target.value })}
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg">
          <option value="">{t.mcDefault}</option>
          {mcVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="mt-3 flex items-center justify-between text-xs">
          <label htmlFor="maestro-mc-duck">{t.mcDuck}</label>
          <span className="tabular-nums text-accent-text">{mcOptions.duckPercent}%</span>
        </div>
        <input id="maestro-mc-duck" type="range" min="5" max="45" step="1"
          value={mcOptions.duckPercent}
          onChange={(event) => changeMC({ ...mcOptions, duckPercent: Number(event.target.value) })}
          className="mt-2 w-full accent-[var(--accent)]" />
        <div className="mt-3 flex flex-wrap gap-2">
          {([[0, t.mcOff], [3, t.mcOften], [5, t.mcMedium], [8, t.mcRare]] as const).map(([cadence, label]) => (
            <button key={cadence} type="button" aria-pressed={mcCadence === cadence}
              onClick={() => {
                saveMCCadence(cadence);
                setMcCadence(cadence);
                if (cadence === 0) stopMC();
                refreshMCVoice();
              }}
              className={"rounded-full px-3 py-2 text-xs font-medium ring-1 transition-colors " +
                (mcCadence === cadence ? "bg-accent-soft text-accent-text ring-accent/40" : "bg-surface-2 text-fg-2 ring-line")}>
              {label}
            </button>
          ))}
        </div>
        <p role="status" className="mt-2 text-xs text-fg-2">{voiceMessage}</p>
        {voiceAvailable && (
          <button type="button" onClick={() => {
              setVoiceMessage(t.mcSpeaking);
              const state = usePlayer.getState();
              void previewMC(currentMCMedia(), () => ({ volume: state.volume, muted: state.muted }))
                .then((ok) => setVoiceMessage(ok ? t.mcReady : t.mcFailed));
            }}
            className="mt-3 rounded-full border border-line px-3 py-2 text-xs text-fg hover:bg-surface-4">
            ▶ {t.mcPreview}
          </button>
        )}
        {mcCadence > 0 && !voiceAvailable &&
          <p className="mt-2 text-xs text-fg-2">{t.mcMissing}</p>}
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
