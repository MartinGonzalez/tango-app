import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  defineReactInstrument,
  useInstrumentApi,
  useHostEvent,
} from "@tango/instrument-sdk/react";
import {
  UIRoot,
  UIPanelHeader,
  UISection,
  UICard,
  UIButton,
  UITextarea,
  UIBadge,
  UIEmptyState,
  UIToggle,
} from "@tango/instrument-ui/react";

// ---------------------------------------------------------------------------
// Types (stream events aren't exported from the SDK, define inline)
// ---------------------------------------------------------------------------

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

type StreamEvent =
  | { type: "assistant"; message: { content: ContentBlock[] }; session_id: string }
  | { type: "result"; subtype: "success"; result: string; session_id: string; duration_ms: number; total_cost_usd: number; num_turns: number }
  | { type: "error"; error: { message: string }; session_id?: string }
  | { type: string; session_id?: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

type Message = {
  role: "user" | "assistant" | "status";
  text: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAssistantText(event: StreamEvent): string | null {
  if (event.type !== "assistant") return null;
  const blocks = event.message?.content ?? [];
  const texts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "tool_use") {
      texts.push(`[tool: ${block.name}]`);
    }
  }
  return texts.length > 0 ? texts.join("") : null;
}

// ---------------------------------------------------------------------------
// Shared state between panels (same JS module context)
// ---------------------------------------------------------------------------

let sharedUseQuery = false;
let sharedOnQueryToggle: ((v: boolean) => void) | null = null;
let sharedOnClear: (() => void) | null = null;
let sharedOnOpenSession: (() => void) | null = null;
let sharedGetSessionId: (() => string | null) | null = null;
let sharedGetLoading: (() => boolean) | null = null;
let sharedGetMessageCount: (() => number) | null = null;

// ---------------------------------------------------------------------------
// SidebarPanel — lightweight controls
// ---------------------------------------------------------------------------

function SidebarPanel() {
  const [useQuery, setUseQuery] = useState(sharedUseQuery);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  // Sync from ChatPanel on mount + periodically
  useEffect(() => {
    const sync = () => {
      setSessionId(sharedGetSessionId?.() ?? null);
      setLoading(sharedGetLoading?.() ?? false);
      setMessageCount(sharedGetMessageCount?.() ?? 0);
    };
    sync();
    const id = setInterval(sync, 300);
    return () => clearInterval(id);
  }, []);

  const handleToggle = (checked: boolean) => {
    sharedUseQuery = checked;
    setUseQuery(checked);
    sharedOnQueryToggle?.(checked);
  };

  return (
    <UIRoot>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
        <UIPanelHeader title="Hello Claude" />

        <UISection>
          <div className="tui-col" style={{ gap: 8 }}>
            <UIToggle
              label="Query mode"
              checked={useQuery}
              onChange={handleToggle}
            />
            <UIBadge
              label={
                useQuery
                  ? "query mode"
                  : sessionId
                    ? `session: ${sessionId.slice(0, 8)}...`
                    : "no session"
              }
              tone={useQuery ? "warning" : sessionId ? "info" : "neutral"}
            />
          </div>
        </UISection>

        <UISection>
          <div className="tui-col" style={{ gap: 6 }}>
            {loading && <UIBadge label="streaming..." tone="info" />}
            {!useQuery && sessionId && (
              <UIButton
                label="Open Session"
                variant="ghost"
                size="sm"
                onClick={() => sharedOnOpenSession?.()}
              />
            )}
            {messageCount > 0 && (
              <UIButton
                label="Clear"
                variant="ghost"
                size="sm"
                onClick={() => sharedOnClear?.()}
              />
            )}
          </div>
        </UISection>
      </div>
    </UIRoot>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel — full chat UI (renders in first panel)
// ---------------------------------------------------------------------------

function ChatPanel() {
  const api = useInstrumentApi();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stagePath, setStagePath] = useState<string | null>(null);
  const [useQuery, setUseQuery] = useState(sharedUseQuery);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs for cross-panel sharing (avoids stale closures)
  const sessionIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const messageCountRef = useRef(0);
  const stagePathRef = useRef<string | null>(null);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { messageCountRef.current = messages.length; }, [messages]);
  useEffect(() => { stagePathRef.current = stagePath; }, [stagePath]);

  useEffect(() => {
    sharedGetSessionId = () => sessionIdRef.current;
    sharedGetLoading = () => loadingRef.current;
    sharedGetMessageCount = () => messageCountRef.current;
    sharedOnQueryToggle = (v) => setUseQuery(v);
    sharedOnClear = () => {
      setMessages([]);
      setSessionId(null);
      setLoading(false);
      api.storage.deleteProperty("lastMessages");
    };
    sharedOnOpenSession = () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      api.sessions.focus({ sessionId: sid, cwd: stagePathRef.current ?? undefined });
    };
    return () => {
      sharedGetSessionId = null;
      sharedGetLoading = null;
      sharedGetMessageCount = null;
      sharedOnQueryToggle = null;
      sharedOnClear = null;
      sharedOnOpenSession = null;
    };
  }, [api]);

  // Load active stage on mount
  useEffect(() => {
    api.stages.active().then((path) => setStagePath(path));
  }, [api]);

  // Restore last conversation from storage
  useEffect(() => {
    api.storage.getProperty<Message[]>("lastMessages").then((saved) => {
      if (saved && saved.length > 0) setMessages(saved);
    });
  }, [api]);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Track session ID resolution (tempId → realId)
  useHostEvent(
    "session.idResolved",
    useCallback(
      (payload) => {
        if (payload.tempId === sessionIdRef.current) {
          setSessionId(payload.realId);
        }
      },
      []
    )
  );

  // Listen for stream events from our session
  useHostEvent(
    "session.stream",
    useCallback(
      (payload) => {
        if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) return;
        const event = payload.event as StreamEvent;

        const text = extractAssistantText(event);
        if (text) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, text: last.text + text };
              return updated;
            }
            return [...prev, { role: "assistant", text }];
          });
        }

        if (event.type === "result") {
          setLoading(false);
          const resultEvent = event as StreamEvent & { duration_ms: number; num_turns: number; total_cost_usd: number };
          setMessages((prev) => [
            ...prev,
            {
              role: "status",
              text: `Done in ${(resultEvent.duration_ms / 1000).toFixed(1)}s — ${resultEvent.num_turns} turn${resultEvent.num_turns === 1 ? "" : "s"} — $${resultEvent.total_cost_usd.toFixed(4)}`,
            },
          ]);
        }

        if (event.type === "error") {
          setLoading(false);
          const errEvent = event as StreamEvent & { error: { message: string } };
          setMessages((prev) => [
            ...prev,
            { role: "status", text: `Error: ${errEvent.error.message}` },
          ]);
        }
      },
      []
    )
  );

  // Listen for session end
  useHostEvent(
    "session.ended",
    useCallback(
      (payload) => {
        if (payload.sessionId === sessionIdRef.current) {
          setLoading(false);
        }
      },
      []
    )
  );

  // Persist messages after each update
  useEffect(() => {
    if (messages.length > 0) {
      api.storage.setProperty("lastMessages", messages);
    }
  }, [messages, api]);

  const send = async () => {
    const text = prompt.trim();
    if (!text || loading) return;

    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    const cwd = stagePath ?? "/tmp";

    if (useQuery) {
      // Query mode: fire-and-forget, no session
      try {
        const result = await api.sessions.query({ prompt: text, cwd });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: result.text },
          {
            role: "status",
            text: `Done in ${(result.durationMs / 1000).toFixed(1)}s — $${result.costUsd.toFixed(4)}`,
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { role: "status", text: `Error: ${msg}` },
        ]);
      } finally {
        setLoading(false);
      }
    } else {
      // Session mode: start or follow up
      if (sessionId) {
        await api.sessions.sendFollowUp({ sessionId, text });
      } else {
        const result = await api.sessions.start({ prompt: text, cwd });
        setSessionId(result.sessionId);
      }
    }
  };

  const clear = () => {
    setMessages([]);
    setSessionId(null);
    setLoading(false);
    api.storage.deleteProperty("lastMessages");
  };

  const openSession = () => {
    if (!sessionId) return;
    api.sessions.focus({ sessionId, cwd: stagePath ?? undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const buttonLabel = useQuery ? "Send" : sessionId ? "Follow up" : "Send";

  return (
    <UIRoot>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "10px 10px 0" }}>
          <UIPanelHeader
            title="Hello Claude"
            subtitle={
              useQuery
                ? "query mode — each prompt is independent"
                : sessionId
                  ? `session: ${sessionId.slice(0, 8)}...`
                  : "no active session"
            }
            rightActions={
              <div className="tui-row">
                {loading && <UIBadge label={useQuery ? "querying..." : "streaming..."} tone="info" />}
              </div>
            }
          />
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: "auto",
            padding: "0 10px",
          }}
        >
          {messages.length === 0 ? (
            <UISection>
              <UIEmptyState
                title="Ask Claude anything"
                description={
                  useQuery
                    ? "Query mode: each prompt is independent. No session, no streaming."
                    : "Session mode: start a tracked session with streaming responses."
                }
              />
            </UISection>
          ) : (
            <UISection>
              <div className="tui-col">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
              </div>
            </UISection>
          )}
        </div>

        {/* Input area */}
        <div style={{ padding: 10, borderTop: "1px solid var(--tui-border)" }}>
          <UICard>
            <div className="tui-col">
              <div onKeyDown={handleKeyDown}>
                <UITextarea
                  value={prompt}
                  placeholder={loading ? "Waiting for response..." : "Ask Claude something..."}
                  rows={3}
                  onInput={setPrompt}
                />
              </div>
              <div className="tui-row">
                <UIButton
                  label={buttonLabel}
                  variant="primary"
                  disabled={loading || !prompt.trim()}
                  onClick={send}
                />
                {stagePath && (
                  <UIBadge
                    label={stagePath.split("/").pop() ?? stagePath}
                    tone="neutral"
                  />
                )}
                {useQuery && (
                  <UIBadge label="query" tone="warning" />
                )}
              </div>
            </div>
          </UICard>
        </div>
      </div>
    </UIRoot>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "status") {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--tui-text-secondary)",
          textAlign: "center",
          padding: "4px 0",
        }}
      >
        {message.text}
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <UICard>
      <div className="tui-col" style={{ gap: 4 }}>
        <UIBadge
          label={isUser ? "You" : "Claude"}
          tone={isUser ? "neutral" : "info"}
        />
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.text}
        </div>
      </div>
    </UICard>
  );
}

// ---------------------------------------------------------------------------
// Instrument definition
// ---------------------------------------------------------------------------

export default defineReactInstrument({
  defaults: {
    visible: { sidebar: true, first: true },
  },
  panels: {
    sidebar: SidebarPanel,
    first: ChatPanel,
  },
});
