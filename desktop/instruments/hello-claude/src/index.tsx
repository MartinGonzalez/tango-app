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
// ChatPanel
// ---------------------------------------------------------------------------

function ChatPanel() {
  const api = useInstrumentApi();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stagePath, setStagePath] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
            // Append to existing assistant message or create new one
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
          const resultEvent = event as StreamEvent & { duration_ms: number; num_turns: number };
          setMessages((prev) => [
            ...prev,
            {
              role: "status",
              text: `Done in ${(resultEvent.duration_ms / 1000).toFixed(1)}s (${resultEvent.num_turns} turn${resultEvent.num_turns === 1 ? "" : "s"})`,
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

    const cwd = stagePath ?? process.cwd?.() ?? "/tmp";

    if (sessionId) {
      // Follow-up in the existing session
      await api.sessions.sendFollowUp({ sessionId, text });
    } else {
      // Start a new session
      const result = await api.sessions.start({ prompt: text, cwd });
      setSessionId(result.sessionId);
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

  return (
    <UIRoot>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div style={{ padding: "10px 10px 0" }}>
          <UIPanelHeader
            title="Hello Claude"
            subtitle={sessionId ? `session: ${sessionId.slice(0, 8)}...` : "no active session"}
            rightActions={
              <div className="tui-row">
                {loading && <UIBadge label="streaming..." tone="info" />}
                {sessionId && (
                  <UIButton label="Open Session" variant="ghost" size="sm" onClick={openSession} />
                )}
                {messages.length > 0 && (
                  <UIButton label="Clear" variant="ghost" size="sm" onClick={clear} />
                )}
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
                description="Type a prompt below to start a session. Responses stream in real time."
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
                  label={sessionId ? "Follow up" : "Send"}
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
    visible: { sidebar: true },
  },
  panels: {
    sidebar: ChatPanel,
  },
});
