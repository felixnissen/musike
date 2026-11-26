import { contextBridge, ipcRenderer } from "electron";

// The only bridge between the web app and the desktop shell.
contextBridge.exposeInMainWorld("musikeDesktop", {
  platform: process.platform,
  setTheme: (theme: "dark" | "light") => ipcRenderer.send("musike:theme", theme),
  setLanguage: (lang: string) => ipcRenderer.send("musike:lang", lang),
  retry: () => ipcRenderer.send("musike:retry"),
  suno: (action: string, value?:string) => ipcRenderer.invoke("musike:suno",action,value),
  importWatch: (source: "suno" | "local" | "musicgrabber", action: "status" | "choose" | "stop" | "scan") => ipcRenderer.invoke("musike:import-watch", source, action),
});
