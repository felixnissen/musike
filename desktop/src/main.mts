import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from "electron";
import type { RunningServer } from "../../server/src/app.js";
import { backupLibraryOnUpdate } from "./backup.js";

// No top-level await in this file: Electron only fires "ready" after the entry module finishes
// evaluating, so awaiting it at the top level would hang forever.

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4280; // fixed so the web origin (and its saved settings) stays the same between launches
const isMac = process.platform === "darwin";

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Everything the user owns lives in their profile, so updates and reinstalls keep it.
const userData = app.getPath("userData");
process.env.MUSIKE_DATA_DIR = path.join(userData, "data");
// Optional dedicated token-authenticated music endpoint, loopback only.
// May be published through Tailscale Serve HTTPS; never exposes the normal API.
process.env.MUSIKE_PEER_ENABLED = "1";
process.env.MUSIKE_CACHE_DIR = path.join(userData, "cache");
process.env.MUSIKE_BIN_DIR = path.join(userData, "bin");
process.env.MUSIKE_WEB_DIST = app.isPackaged ? path.join(process.resourcesPath, "web") : path.resolve(here, "..", "..", "web", "dist");

// A copy of the library from before each update, in userData/backups (the installer makes one too).
backupLibraryOnUpdate(userData, app.getVersion());

// The server reads its config when first imported, so load it only after the env above is set.
const loadServer = async () => ({
  ...(await import("../../server/src/app.js")),
  ...(await import("../../server/src/importWatch.js")),
  ...(await import("../../server/src/bootstrap.js")),
  ...(await import("../../server/src/tools.js")),
  ...(await import("../../server/src/i18n.js")),
  HttpError: (await import("../../server/src/types.js")).HttpError,
});

const THEME = {
  dark: { color: "#0B0C0F", symbolColor: "#ECEEF2" },
  light: { color: "#E9EBEF", symbolColor: "#12141A" },
};
const TITLEBAR_HEIGHT = 40;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const stateFile = path.join(userData, "window.json");

// The language picked in the web app, kept here so the splash screen (shown before the web app loads) uses it too.
type Lang = "en" | "pt-BR" | "sv";
const settingsFile = path.join(userData, "settings.json");
const isLang = (v: unknown): v is Lang => v === "en" || v === "pt-BR" || v === "sv";

function readLang(): Lang {
  try {
    const { lang } = JSON.parse(readFileSync(settingsFile, "utf8")) as { lang?: unknown };
    if (isLang(lang)) return lang;
  } catch {
    // first launch
  }
  return app.getLocale().toLowerCase().startsWith("sv") ? "sv" : "en";
}

let lang = readLang();

function readWindowState(): WindowState {
  try {
    const s = JSON.parse(readFileSync(stateFile, "utf8")) as WindowState;
    // Ignore a position that is no longer on any screen (monitor unplugged).
    const onScreen = screen
      .getAllDisplays()
      .some(({ workArea: a }) => s.x !== undefined && s.y !== undefined && s.x >= a.x - 50 && s.y >= a.y - 50 && s.x < a.x + a.width && s.y < a.y + a.height);
    return onScreen ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return { width: 1280, height: 820 };
  }
}

function saveWindowState(win: BrowserWindow) {
  try {
    writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* not critical */
  }
}

function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    icon: path.join(here, "icon.png"),
    backgroundColor: THEME.dark.color,
    webPreferences: { preload: path.join(here, "preload.cjs"), sandbox: true, contextIsolation: true },
  });
  void splash.loadFile(path.join(here, "splash.html"), { query: { lang } });
  splash.once("ready-to-show", () => splash.show());
  return splash;
}

function createMainWindow(url: string): BrowserWindow {
  const state = readWindowState();
  const win = new BrowserWindow({
    ...state,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: "Musike",
    icon: path.join(here, "icon.png"),
    backgroundColor: THEME.dark.color,
    // Our own title bar (drawn by the web app) with the native window buttons on top of it:
    // macOS traffic lights on the left, centred in the bar; Windows and Linux controls on the right.
    titleBarStyle: "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: (TITLEBAR_HEIGHT - 14) / 2 } }
      : { titleBarOverlay: { ...THEME.dark, height: TITLEBAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  win.once("ready-to-show", () => {
    if (state.maximized) win.maximize();
    win.show();
  });
  win.on("close", () => saveWindowState(win));

  // Links to YouTube etc. open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(target)) void shell.openExternal(target);
    }
  });

  void win.loadURL(url);
  return win;
}

let mainWindow: BrowserWindow | null = null;
let server: RunningServer | null = null;
let stopWatch: (()=>void) | null = null;

async function launch() {
  const splash = createSplash();
  const s = await loadServer();
  // Show progress while yt-dlp and Deno download on the first launch.
  const report = setInterval(() => {
    splash.webContents.executeJavaScript(`window.update(${JSON.stringify(s.downloads(lang))})`).catch(() => {});
  }, 250);

  try {
    await s.refreshTools();
    await s.ensureEssentials();
    server ??= await s.startServer({ port: PORT, host: "127.0.0.1", portFallback: true });
    stopWatch ??= s.startWatchMonitor();
    // FFmpeg is only needed for HD and some videos: fetch it in the background.
    s.ensureComponent("ffmpeg").catch(() => {});
  } catch (err) {
    clearInterval(report);
    const message = JSON.stringify(err instanceof s.HttpError ? s.tr(lang, err.text) : (err as Error).message);
    await splash.webContents.executeJavaScript(`window.fail(${message})`).catch(() => {});
    return;
  }

  clearInterval(report);
  mainWindow = createMainWindow(`http://127.0.0.1:${server.port}`);
  mainWindow.once("ready-to-show", () => splash.destroy());
  sunoTimer??=setInterval(()=>void autoSuno(),5*60_000);
}

let sunoBusy=false;
let sunoTimer:ReturnType<typeof setInterval>|undefined;
async function autoSuno(){if(sunoBusy)return;sunoBusy=true;try{const s=await import("./suno.js");await s.sunoAutoTick();}catch{/* offline or disabled */}finally{sunoBusy=false;}}
ipcMain.handle("musike:suno", async (event, action: unknown, value: unknown) => {
  if (!mainWindow || !server || event.sender !== mainWindow.webContents || !event.senderFrame || new URL(event.senderFrame.url).origin !== "http://127.0.0.1:" + server.port) throw new Error("Untrusted sender");
  const s=await import("./suno.js");
  if(action==="status")return s.sunoStatus();
  if(sunoBusy)throw new Error("Suno is busy");sunoBusy=true;
  try {
    if(action==="connect")return await s.connectSuno();
    if(action==="disconnect")return await s.disconnectSuno();
    if(action==="library")return await s.sunoLibrary(typeof value==="string"?value.slice(0,2000):undefined);
    if(action==="auto-on")return await s.setSunoAuto(true);
    if(action==="auto-off")return await s.setSunoAuto(false);
    if(action==="auto-now")return await s.sunoAutoTick(true);
    if(action==="download"&&typeof value==="string"){
      const r=await s.sunoDownload(value);
      if(r.status!=="requires_credit")return r;
      const answer=await dialog.showMessageBox(mainWindow,{type:"question",buttons:["Cancel","Use one Suno download credit"],defaultId:0,cancelId:0,message:"Suno requires a download credit for this song.",detail:"Only continue if you want to use one of your Suno download credits."});
      return answer.response===1?await s.sunoDownload(value,true):{status:"cancelled"};
    }
    throw new Error("Invalid Suno action");
  }finally{sunoBusy=false;}
});

ipcMain.handle("musike:import-watch", async (event, source: unknown, action: unknown) => {
  if (!mainWindow || !server || event.sender !== mainWindow.webContents || !event.senderFrame || new URL(event.senderFrame.url).origin !== "http://127.0.0.1:" + server.port) throw new Error("Untrusted sender");
  if (source !== "suno" && source !== "local" && source !== "musicgrabber") throw new Error("Invalid source");
  const s = await import("../../server/src/importWatch.js");
  if (action === "status") return s.watchStatus(source);
  if (action === "stop") return s.configureWatch(source, null);
  if (action === "choose") {
    const result = await dialog.showOpenDialog(mainWindow, {properties:["openDirectory"],title:"Choose a dedicated music import folder"});
    if (!result.canceled && result.filePaths[0]) { await s.configureWatch(source,result.filePaths[0]); void s.runWatch().catch(()=>{}); }
    return s.watchStatus(source);
  }
  if (action === "scan") { await s.runWatch(); return s.watchStatus(source); }
  throw new Error("Invalid watch action");
});

ipcMain.on("musike:theme", (event, theme: "dark" | "light") => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const colors = THEME[theme] ?? THEME.dark;
  if (!isMac) win?.setTitleBarOverlay({ ...colors, height: TITLEBAR_HEIGHT });
  win?.setBackgroundColor(colors.color);
});

ipcMain.on("musike:lang", (_event, next: unknown) => {
  if (!isLang(next) || next === lang) return;
  lang = next;
  try {
    writeFileSync(settingsFile, JSON.stringify({ lang }));
  } catch {
    /* not critical: the splash falls back to English */
  }
});

ipcMain.on("musike:retry", (event) => {
  const failed = BrowserWindow.fromWebContents(event.sender);
  // Open the new splash before closing the old one, or "window-all-closed" would quit the app.
  void launch();
  failed?.destroy();
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if(sunoTimer)clearInterval(sunoTimer);stopWatch?.(); void server?.close(); });

void app.whenReady().then(() => {
  // macOS needs an app menu: without the Edit menu, Cmd+C/V/A don't reach text fields, and Cmd+Q has no home.
  Menu.setApplicationMenu(
    isMac ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null,
  );
  return launch();
});
