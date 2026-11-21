import { useState } from "react";
import { capabilities } from "../lib/api";
import { createAccount, currentAccount, login, logout, syncAccount } from "../lib/accountSync";

export function AccountSyncSection() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState(currentAccount);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const signedIn = !!account;

  async function submit(mode: "create" | "login") {
    setBusy(true); setMessage("");
    try {
      const result = mode === "create" ? await createAccount(username, password) : await login(username, password);
      setPassword(""); setAccount(result);
      const counts = await syncAccount();
      setMessage("Synkat: " + counts.favorites + " favoriter och " + counts.playlists + " spellistor.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function update() {
    setBusy(true); setMessage("");
    try {
      const result = await syncAccount();
      setMessage("Klart: " + result.favorites + " favoriter och " + result.playlists + " spellistor synkade.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-fg-3">Konto och synk</h3>
      <div className="flex flex-col gap-3 rounded-[16px] bg-surface-1 p-4 ring-1 ring-line">
        <p className="text-sm text-fg-2">
          Frivilligt konto utan mejl eller telefon. Favoriter, spellistor och inställningar synkas när datorns privata musiktjänst är tillgänglig. Inga musikfiler skickas.
        </p>
        {signedIn ? (
          <>
            <p className="text-sm font-medium">Inloggad som {account.username}</p>
            <p className="text-xs text-fg-2">Automatisk synk varannan minut när appen är öppen. Nedladdningarna berörs inte.</p>
            <button type="button" disabled={busy} onClick={() => void update()}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
              {busy ? "Synkar…" : "Synka nu"}
            </button>
            <button type="button" disabled={busy} onClick={() => void logout().then(() => { setAccount(null); setMessage("Utloggad."); })}
              className="self-start text-sm text-fg-2 underline">
              Logga ut
            </button>
          </>
        ) : (
          <>
            <label htmlFor="sync-user" className="text-xs text-fg-2">Användarnamn</label>
            <input id="sync-user" value={username} autoCapitalize="off" autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} placeholder="Minst 3 tecken"
              className="w-full rounded-xl bg-bg p-2 text-sm text-fg" />
            <label htmlFor="sync-pass" className="text-xs text-fg-2">Lösenord (minst 12 tecken)</label>
            <input id="sync-pass" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-bg p-2 text-sm text-fg" />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !username || password.length < 12}
                onClick={() => void submit("login")}
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
                Logga in
              </button>
              {capabilities.video && (
                <button type="button" disabled={busy || !username || password.length < 12}
                  onClick={() => void submit("create")}
                  className="rounded-full bg-surface-3 px-4 py-2 text-sm disabled:opacity-50">
                  Skapa konto
                </button>
              )}
            </div>
            {!capabilities.video && <p className="text-xs text-fg-2">Skapa kontot på datorn först. Koppla sedan mobilens privata HTTPS-adress under Hybrid music ovan.</p>}
          </>
        )}
        {message && <p role="status" className="text-xs text-fg-2">{message}</p>}
      </div>
    </section>
  );
}
