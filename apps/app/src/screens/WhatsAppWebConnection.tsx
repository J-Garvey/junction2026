import { useEffect, useRef, useState } from "react";
import type { WhatsAppWebStatus } from "@aimo/contracts";
import { whatsappApi } from "../whatsapp-api";
import { Icon } from "../ui/icons";
import "./whatsapp-web.css";

/** Used both in Demo settings and the WhatsApp page; no app context is needed on the person picker. */
export function WhatsAppWebConnection({ person }: { person: { id: string; name: string } }) {
  const [status, setStatus] = useState<WhatsAppWebStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let polling = false;
    const load = async () => {
      if (polling) return;
      polling = true;
      try {
        const value = await whatsappApi.web.status();
        if (mounted.current) { setStatus(value); setError(null); }
      } catch (e) { if (mounted.current) setError((e as Error).message); }
      finally { polling = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [person.id]);

  async function run(action: () => Promise<WhatsAppWebStatus>) {
    setBusy(true); setError(null);
    try { const value = await action(); if (mounted.current) setStatus(value); }
    catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  const ready = status?.phase === "ready";
  const idle = !status || status.phase === "disconnected" || status.phase === "error";
  const selected = status?.groups.find((group) => group.id === status.selectedGroupId);
  const disabled = busy || !!status?.busy;
  return <section className="wa-web" aria-label="WhatsApp Web connection">
    <div className="wa-web-head"><Icon n="chat" s={22} /><div><h2>WhatsApp Web</h2><p>Link your regular WhatsApp account using your phone.</p></div><span className={`stamp ${ready ? "order" : "info"}`}>{ready ? "Connected" : status?.phase === "qr" ? "Scan QR" : status?.phase ?? "Loading"}</span></div>
    <p className="small muted">Uses a dedicated local WhatsApp Web browser. Hotel requests run as <strong>{person.name}</strong>; orders remain Junction mock orders.</p>
    {(error || status?.lastError) && <p className="callout red" role="alert">{error ?? status?.lastError}</p>}
    {idle ? <button type="button" className="btn" disabled={busy || !status} onClick={() => void run(whatsappApi.web.connect)}><Icon n="plug" s={17} />{busy ? "Connecting…" : "Connect WhatsApp Web"}</button> : <>
      {!ready && <div className="wa-web-pairing" aria-live="polite">
        {status?.qrDataUrl ? <><img className="wa-web-qr" src={status.qrDataUrl} alt="WhatsApp linked-device pairing QR code" /><p>On your phone, open <strong>WhatsApp → Linked devices → Link a device</strong> and scan this QR code.</p><p className="small muted">The QR refreshes automatically while pairing.</p></> : <p role="status">{status?.phase === "authenticated" ? "Phone linked. Loading your WhatsApp groups…" : "Opening WhatsApp Web and preparing your QR code…"}</p>}
      </div>}
      {ready && <>
        <p>Linked account: <strong>{status.accountName}</strong></p>
        <label className="wa-web-group">Respond only in this group
          <select aria-label="WhatsApp Web group" value={status.selectedGroupId ?? ""} disabled={disabled} onChange={(event) => { const groupId = event.target.value || null; void run(() => whatsappApi.web.selectGroup(groupId)); }}>
            <option value="">No group selected — agent paused</option>
            {status.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
          </select>
        </label>
        <p className="small muted">{selected ? `The agent replies only in “${selected.name}”. Other groups and direct messages are ignored.` : "Select a real group from this account to enable replies. The agent is paused until you choose one."}</p>
        <p className="small muted">Send text in this group from your linked phone or another group member. The agent ignores its own replies, old history and attachments. Each sender has separate order context.</p>
        <div className="wa-web-actions"><button type="button" className="btn sm ghost" disabled={disabled} onClick={() => void run(whatsappApi.web.refreshGroups)}><Icon n="refresh" s={15} /> Refresh groups</button><span className="small muted" role="status">{status.busy ? "Handling a group message…" : `${status.handledMessages} message${status.handledMessages === 1 ? "" : "s"} answered`}</span></div>
      </>}
      <button type="button" className="btn sm ghost" disabled={disabled} onClick={() => void run(whatsappApi.web.disconnect)}>{busy ? "Working…" : ready ? "Disconnect WhatsApp" : "Cancel pairing"}</button>
    </>}
  </section>;
}
