/** Bridge exposed by the Electron preload script when Musike runs as the desktop app. */
export interface ImportWatchStatus { folder: string; tracked: number; lastScan?: number; added?: number; errors?: number; pending?: number; lastError?: string }
interface DesktopBridge {
  platform: string;
  importWatch?: (source: "suno" | "local" | "musicgrabber", action: "status" | "choose" | "stop" | "scan") => Promise<ImportWatchStatus | null>;
  setTheme: (theme: "dark" | "light") => void;
  /** Missing in desktop builds older than 1.2. */
  setLanguage?: (lang: string) => void;
}

export const desktop = (window as Window & { musikeDesktop?: DesktopBridge }).musikeDesktop;

if (desktop) {
  document.documentElement.dataset.desktop = "true";
  // Match the native window buttons to the theme picked before this script ran.
  desktop.setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
}
