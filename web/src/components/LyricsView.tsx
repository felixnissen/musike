import { useEffect, useRef, useState } from "react";
import { fetchLyrics, lyricAt, type LyricLine } from "../lib/lyrics";
import { selectCurrent, usePlayer } from "../player/player";

export function LyricsView({ compact = false }: { compact?: boolean }) {
  const track = usePlayer(selectCurrent);
  const position = usePlayer((s) => s.position);
  const seek = usePlayer((s) => s.seek);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [plain,setPlain]=useState("");
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = lyricAt(lines, position);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentId = track?.id;

  useEffect(() => {
    setLines([]);setPlain("");
    setSource(null);
    if (!track || !currentId) return;
    const ctrl = new AbortController();
    setLoading(true);
    void fetchLyrics(track, ctrl.signal).then((result) => {
      if (!ctrl.signal.aborted) {
        setLines(result.lines);setPlain(result.plain||"");
        setSource(result.source);
      }
    }).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });
    return () => ctrl.abort();
  }, [currentId]);

  useEffect(() => {
    if (active >= 0) refs.current[active]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, currentId]);

  if (!track) return <p className="p-5 text-sm text-fg-2">Spela en låt för att visa text.</p>;
  if (loading) return <p className="p-5 text-sm text-fg-2">Letar efter synkad låttext…</p>;
  if(plain)return <div className="scroll-area h-full overflow-y-auto p-5"><p className="mb-3 text-xs text-fg-3">Suno · Ej tidssynkad text</p><p className="whitespace-pre-wrap text-center text-lg leading-8">{plain}</p></div>;
  if (!lines.length) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-5 py-8 text-center">
      <p className="text-sm font-medium">Ingen synkad låttext hittades</p>
      <p className="text-xs text-fg-2">Ingen matchande tidsstämplad text finns i MusicGrabber eller LRCLIB för den här inspelningen.</p>
    </div>
  );

  return (
    <div aria-label="Synkad låttext" className={"scroll-area h-full max-h-full overflow-y-auto overscroll-contain text-center " + (compact ? "px-2 py-5" : "px-3 py-8")}>
      <p className="mb-3 text-center text-[11px] text-fg-3">Synkad text: {source === "LRCLIB" ? "LRCLIB" : "MusicGrabber"}</p>
      <div className={"mx-auto flex max-w-lg flex-col items-center gap-5 " + (compact ? "pb-20" : "pb-32")}>
        {lines.map((line, index) => (
          <button
            key={index}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            aria-current={index === active ? "true" : undefined}
            disabled={!line.text}
            onClick={() => seek(line.time)}
            className={[
              "min-h-6 w-full rounded-xl px-2 py-1.5 transition-[color,opacity,transform] duration-300",
              compact ? "text-[17px] leading-7" : "text-[23px] leading-9",
              index === active ? "scale-[1.03] font-semibold text-accent-text" : "font-medium text-fg-3 hover:text-fg",
              line.text ? "cursor-pointer" : "opacity-30",
            ].join(" ")}
          >
            {line.text || "♪"}
          </button>
        ))}
      </div>
    </div>
  );
}
