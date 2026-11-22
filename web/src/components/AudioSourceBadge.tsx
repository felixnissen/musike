import { CloudIcon, HardDriveIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { usePlayer } from "../player/player";

/** Displays the playback route selected for the current track.
 * Never labels a checking or failed request as local playback.
 */
export function AudioSourceBadge({ compact = false }: { compact?: boolean }) {
  const kind = usePlayer((s) => s.playbackSource);
  const status = usePlayer((s) => s.status);
  if (status === "idle" || status === "error") return null;
  const local = kind === "local";
  const checking = kind === "checking";
  const text = local ? "Från datorn" : checking ? "Kontrollerar ljudkälla" : kind === "video" ? "YouTube-video" : "YouTube";
  const Icon = local ? HardDriveIcon : checking ? SpinnerGapIcon : CloudIcon;
  return (
    <span
      title={text}
      aria-label={"Ljudkälla: " + text}
      className={
        "inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-1/70 text-fg-2 " +
        (compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")
      }
    >
      <Icon size={compact ? 11 : 14} className={local ? "text-accent-text" : ""} />
      <span className="truncate">{text}</span>
    </span>
  );
}
