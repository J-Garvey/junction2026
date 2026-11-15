import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { WhatsAppMessage, WhatsAppSession, WhatsAppGroupConfig } from "@aimo/contracts";
import { useApp } from "../ctx";
import { Icon, Mark } from "../ui/icons";
import { whatsappApi } from "../whatsapp-api";
import { ApiError } from "../api";
import { WhatsAppWebConnection } from "./WhatsAppWebConnection";
import "./whatsapp.css";

type PendingMessage = { id: string; text: string; groupId: string | null; error: string | null };
const errorText = (error: unknown) => error instanceof Error ? error.message : "The chat could not complete this request.";

export function WhatsApp() {
  const { me } = useApp();
  return <div className="page stack-l"><div><h1>Connect WhatsApp</h1><p>Pair WhatsApp Web, then choose the only group the agent may respond in.</p></div><WhatsAppWebConnection key={me.id} person={me} /><Link className="small" to="/whatsapp/simulator">Open offline simulator</Link></div>;
}

export function WhatsAppSimulator() {
  const { me } = useApp();
  // Drop history, drafts, retries and outstanding UI callbacks on person switch.
  return <WhatsAppChat key={me.id} />;
}

function WhatsAppChat() {
  const { me, refresh } = useApp();
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(me.name);
  const [draft, setDraft] = useState("");
  const [operation, setOperation] = useState<"connect" | "disconnect" | null>(null);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroupConfig | null>(null);
  const [chatId, setChatId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const working = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mounted.current = true;
    let live = true;
    whatsappApi.session()
      .then((value) => { if (live) setSession(value); })
      .catch((e: unknown) => { if (live) setError(errorText(e)); })
      .finally(() => { if (live) setLoading(false); });
    whatsappApi.config()
      .then((value) => { if (live) { setGroups(value); setChatId(value.selectedGroupId); } })
      .catch((e: unknown) => { if (live) setError(errorText(e)); });
    return () => { live = false; mounted.current = false; };
  }, []);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [session?.messages.length, pending]);

  async function reload() {
    if (working.current) return;
    working.current = true;
    setLoading(true);
    setError(null);
    try {
      const [value, groupConfig] = await Promise.all([whatsappApi.session(), whatsappApi.config()]);
      if (!mounted.current) return;
      setSession(value);
      setGroups(groupConfig);
      if (!chatId) setChatId(groupConfig.selectedGroupId);
      if (!value.connected || value.messages.some((m) => m.direction === "inbound" && m.id === pending?.id)) setPending(null);
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      working.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  async function connection(kind: "connect" | "disconnect") {
    if (working.current) return;
    working.current = true;
    setOperation(kind);
    setError(null);
    try {
      const value = kind === "connect" ? await whatsappApi.connect(displayName.trim() || undefined) : await whatsappApi.disconnect();
      if (!mounted.current) return;
      setSession(value);
      setPending(null);
      setDraft("");
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      working.current = false;
      if (mounted.current) setOperation(null);
    }
  }

  async function deliver(message: PendingMessage) {
    if (working.current || !session?.connected) return;
    working.current = true;
    setPending({ ...message, error: null });
    setError(null);
    setNotice(null);
    try {
      const value = await whatsappApi.message({ id: message.id, text: message.text, groupId: message.groupId });
      if (!mounted.current) return;
      if ("ignored" in value) {
        setPending(null);
        setNotice(value.ignored === "direct_message" ? "Direct message ignored. The agent only responds in the group selected in Demo settings." : "Message ignored. This is not the group selected in Demo settings.");
        return;
      }
      setSession(value);
      setPending(null);
      refresh();
      // Another window may send while this response is in flight. Refresh the
      // latest history, retaining the response if this follow-up is offline.
      try {
        const latest = await whatsappApi.session();
        if (mounted.current) setSession(latest);
      } catch { /* The completed message is already visible. */ }
    } catch (e) {
      if (e instanceof ApiError && e.body?.code === "stale_message_context") {
        try {
          const latest = await whatsappApi.session();
          if (mounted.current) { setSession(latest); setPending(null); setNotice(errorText(e)); }
        } catch {
          if (mounted.current) setPending({ ...message, error: errorText(e) });
        }
      } else if (mounted.current) setPending({ ...message, error: errorText(e) });
    } finally {
      working.current = false;
      if (mounted.current) composer.current?.focus();
    }
  }

  function send(text: string) {
    if (!text.trim() || pending || working.current || !session?.connected) return;
    const message = { id: crypto.randomUUID(), text, groupId: chatId === "direct" ? null : chatId, error: null };
    setDraft("");
    void deliver(message);
  }

  const sending = !!pending && !pending.error;
  const unavailable = loading || !chatId || !!operation || !!pending;
  const selectedChat = chatId === session?.groupId;
  const messages = selectedChat ? session?.messages ?? [] : [];
  const lastReply = messages.findLast((message) => message.direction === "outbound");

  return (
    <section className="wa-page" aria-labelledby="wa-title">
      <div className="wa-heading">
        <div><h1 id="wa-title">WhatsApp demo</h1><p>Chat with Potato about your hotel orders.</p></div>
        <span className="wa-fake">FAKE WHATSAPP</span>
      </div>
      <div className="wa-warning"><Icon n="info" s={19} /><p><strong>Simulated WhatsApp.</strong> No messages leave the Junction demo. No phone number, password or QR code is needed.</p></div>
      <p className="wa-viewing">Viewing as <strong>{me.name}</strong> · {me.title}. Chat actions use this person's existing permissions.</p>

      {error && <div className="wa-error" role="alert"><span>{error}</span><button type="button" onClick={() => void reload()} disabled={loading || !!operation || sending}>Reload chat</button></div>}
      {loading && !session && <p role="status">Loading your demo chat…</p>}
      {!loading && !session && !error && <button type="button" className="btn" onClick={() => void reload()}>Load chat</button>}

      {session && !session.connected && (
        <div className="wa-connect">
          <div className="wa-avatar"><Mark s={32} /></div>
          <h2>Connect a fake WhatsApp chat</h2>
          <p>Continue as <strong>{me.name}</strong> to try the simulated ordering assistant.</p>
          <form onSubmit={(event) => { event.preventDefault(); void connection("connect"); }}>
            <label htmlFor="wa-display-name">Demo display name (optional)</label>
            <input id="wa-display-name" value={displayName} maxLength={80} autoComplete="off" disabled={!!operation} onChange={(event) => setDisplayName(event.target.value)} />
            <button className="wa-primary" type="submit" disabled={!!operation || loading}><Icon n="plug" s={18} />{operation === "connect" ? "Connecting…" : "Connect demo chat"}</button>
          </form>
          <p className="wa-help">Reconnecting starts a fresh chat and clears the selected order. Changes already made to orders remain.</p>
        </div>
      )}

      {session?.connected && (
        <div className="wa-chat" aria-busy={sending || !!operation}>
          <header className="wa-chat-header">
            <div className="wa-avatar"><Mark s={24} /></div>
            <div className="wa-contact"><h2>Potato</h2><span>Demo connected · {session.displayName}</span></div>
            {session.conversation.activeOrderId && <Link className="wa-disconnect" to={`/baskets/${encodeURIComponent(session.conversation.activeOrderId)}`}>Open basket</Link>}
            <button type="button" className="wa-disconnect" disabled={sending || !!operation || loading} onClick={() => void connection("disconnect")}>{operation === "disconnect" ? "Disconnecting…" : "Disconnect"}</button>
          </header>
          <div className="wa-group-picker">
            <label htmlFor="wa-source-chat">Demo chat</label>
            <select id="wa-source-chat" value={chatId} disabled={unavailable} onChange={(event) => { setChatId(event.target.value); setDraft(""); setNotice(null); }}>
              {!groups && <option value="">Loading chats…</option>}
              {groups?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              <option value="direct">Direct message (ignored)</option>
            </select>
            <span>{selectedChat ? "Agent enabled for this group" : "Agent ignores this chat"}</span>
          </div>
          {notice && <div className="wa-chat-note" role="status">{notice}</div>}
          <div className="wa-log" ref={log} role="log" aria-label="Demo chat messages" aria-live="polite" aria-relevant="additions">
            <div className="wa-chat-note">A synthetic conversation with your hotel assistant</div>
            {!messages.length && !pending && <div className="wa-empty"><h3>{selectedChat ? "What does the kitchen need?" : "This chat is ignored"}</h3><p>{selectedChat ? "Ask to see your orders, select an order, or describe a change." : "Send a test message to verify it receives no agent response. Choose the allowed group in Demo settings."}</p>{selectedChat && <button type="button" disabled={unavailable} onClick={() => send("Show my orders")}>Show my orders <Icon n="send" s={16} /></button>}</div>}
            {messages.map((message) => (
              <MessageBubble key={`${message.direction}:${message.id}`} message={message} who={me.name}>
                {message === lastReply && !!message.reply?.actions.length && <div className="wa-actions">{message.reply.actions.map((action, index) => <button type="button" key={index} disabled={unavailable} onClick={() => send(action.text)}>{action.label}</button>)}</div>}
              </MessageBubble>
            ))}
            {pending && !session.messages.some((m) => m.direction === "inbound" && m.id === pending.id) && (
              <div className={`wa-message wa-inbound ${pending.error ? "wa-failed" : ""}`}>
                <span className="wa-sender">{me.name}</span>
                <div className="wa-text"><ChatText text={pending.text} /></div>
                <span className="wa-message-meta">{pending.error ? "Delivery not confirmed" : "Sending…"}</span>
                {pending.error && <div className="wa-send-error" role="alert"><p>{pending.error}</p><button type="button" disabled={loading || !!operation} onClick={() => void deliver(pending)}>Retry message</button><button type="button" disabled={loading || !!operation} onClick={() => void reload()}>Check chat</button></div>}
              </div>
            )}
            {sending && <div className="wa-typing" role="status">Potato is working…</div>}
          </div>
          <form className="wa-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
            <label className="wa-sr-only" htmlFor="wa-message">Message Potato</label>
            <textarea id="wa-message" ref={composer} value={draft} maxLength={8000} rows={2} placeholder="Message Potato…" disabled={unavailable} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); }
            }} />
            <button className="wa-primary wa-send" type="submit" disabled={unavailable || !draft.trim()} aria-label="Send message"><Icon n="send" s={22} /><span>Send</span></button>
            <p className="wa-composer-hint">Enter to send · Shift+Enter for a new line · Demo messages only</p>
          </form>
        </div>
      )}
    </section>
  );
}

function MessageBubble({ message, who, children }: { message: WhatsAppMessage; who: string; children?: ReactNode }) {
  const date = new Date(message.at);
  return <div className={`wa-message wa-${message.direction}`}>
    <span className="wa-sender">{message.direction === "inbound" ? who : "Potato"}</span>
    <div className="wa-text"><ChatText text={message.text} /></div>
    <div className="wa-message-meta">{message.reply && <span>{message.reply.status.replaceAll("_", " ")}</span>}<time dateTime={message.at}>{Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
    {children}
  </div>;
}

/** Render the same simple emphasis and links as WhatsApp. React escapes all text. */
function ChatText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>]+|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g).map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  })}</>;
}
