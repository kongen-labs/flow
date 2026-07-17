/**
 * Flow local — app root.
 *
 * One core, two shells: this component tree is the shared React core. The
 * PWA shell (index.html + Vite) mounts it directly; the future MV3
 * extension shell wraps the same tree with chrome.storage-backed KeyStore.
 * Nothing here may depend on a server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatView, type ChatMessage } from "@/components/flow/chat-view";
import { RoutingIndicator } from "@/components/flow/routing-indicator";
import { FirstRun } from "@/components/first-run";
import { SettingsDrawer } from "@/components/settings-drawer";
import { StreamSidebar } from "@/components/stream-sidebar";
import { FlowDB, type StoredMessage, type StoredStream } from "@/lib/db";
import { availableProviders, createDefaultKeyStore } from "@/lib/keys";
import { flagshipFor, formatModelName } from "@/lib/models";
import {
  messageSavedUsd,
  savedByStream as aggregateSavedByStream,
  spentByStream as aggregateSpentByStream,
  sumSavings,
} from "@/lib/savings";
import type { ContextScope } from "@/lib/context";
import { sendMessageWith, type RoutingDecision } from "@/lib/send";
import type { SignalLevel } from "@/lib/classify-message";
import { applySignal } from "@/lib/signals";
import { localId } from "@/lib/utils";

const ONBOARDED_KEY = "flow-local:onboarded:v1";
const MODE_KEY = "flow-local:mode:v1";
const DEFAULT_MODEL_KEY = "flow-local:default-model:v1";
const CONTEXT_SCOPE_KEY = "flow-local:context-scope:v1";

function toChatMessage(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    signal: m.signal,
    metadata: m.metadata
      ? {
          regime: m.metadata.regime,
          model: m.metadata.model,
          provider: m.metadata.provider,
          tokens: (m.metadata.tokens_in ?? 0) + (m.metadata.tokens_out ?? 0),
          tokens_in: m.metadata.tokens_in,
          tokens_out: m.metadata.tokens_out,
          cost: m.metadata.cost_usd,
          savings_pct: m.metadata.savings_pct,
          budget: m.metadata.budget,
          confidence_adj: m.metadata.confidence_adj,
          context_scope: m.metadata.context_scope,
        }
      : undefined,
  };
}

export default function App() {
  const keys = useMemo(() => createDefaultKeyStore(), []);
  const [, setKeysVersion] = useState(0);
  const bumpKeys = useCallback(() => setKeysVersion((v) => v + 1), []);

  const [db, setDb] = useState<FlowDB | null>(null);
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === "1",
  );
  const [streams, setStreams] = useState<StoredStream[]>([]);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [draft, setDraft] = useState<ChatMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Context chain viewer: which assistant message's context is highlighted.
  const [contextChainMessageId, setContextChainMessageId] = useState<
    string | null
  >(null);
  const [routing, setRouting] = useState<
    (RoutingDecision & { visible: boolean }) | null
  >(null);
  // Savings: per-stream saved-$ map, aggregated once at load and updated
  // incrementally per new reply / stream delete (no per-message rescans).
  const [savedByStream, setSavedByStream] = useState<Record<string, number>>(
    {},
  );
  // Parallel spent-$ map (the sidebar footer shows the ROI line —
  // saved on spent), maintained at the same four update points as saved.
  const [spentByStream, setSpentByStream] = useState<Record<string, number>>(
    {},
  );
  const lifetimeSavedUsd = useMemo(
    () => Object.values(savedByStream).reduce((a, b) => a + b, 0),
    [savedByStream],
  );
  const lifetimeSpentUsd = useMemo(
    () => Object.values(spentByStream).reduce((a, b) => a + b, 0),
    [spentByStream],
  );
  const conversationSavings = useMemo(() => sumSavings(messages), [messages]);
  const [mode, setMode] = useState(
    () => localStorage.getItem(MODE_KEY) || "Auto",
  );
  // Context scope: relevance-selected (default) vs full history.
  const [contextScope, setContextScope] = useState<ContextScope>(() =>
    localStorage.getItem(CONTEXT_SCOPE_KEY) === "everything"
      ? "everything"
      : "relevant",
  );
  // Per-send override: send full history with THE NEXT PROMPT ONLY, then
  // revert to the default. One-direction (relevant → full); when the
  // default is already "everything" the chip is hidden as redundant.
  const [fullHistoryOnce, setFullHistoryOnce] = useState(false);
  const [defaultModelId, setDefaultModelId] = useState<string | undefined>(
    () => localStorage.getItem(DEFAULT_MODEL_KEY) || undefined,
  );

  const draftRef = useRef("");

  // Open the database and load streams once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const opened = await FlowDB.open();
      if (cancelled) {
        opened.close();
        return;
      }
      setDb(opened);
      const list = await opened.listStreams();
      if (cancelled) return;
      setStreams(list);
      // One-pass savings aggregation over all local history.
      const all = await opened.getAllMessages();
      if (cancelled) return;
      setSavedByStream(aggregateSavedByStream(all));
      setSpentByStream(aggregateSpentByStream(all));
      if (list.length > 0) {
        setActiveStreamId(list[0].id);
        setMessages(await opened.getMessages(list[0].id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStreams = useCallback(async () => {
    if (!db) return;
    setStreams(await db.listStreams());
  }, [db]);

  // Full savings recompute — only for bulk changes (JSON import).
  const recomputeSavings = useCallback(async () => {
    if (!db) return;
    const all = await db.getAllMessages();
    setSavedByStream(aggregateSavedByStream(all));
    setSpentByStream(aggregateSpentByStream(all));
  }, [db]);

  const selectStream = useCallback(
    async (id: string) => {
      if (!db) return;
      setActiveStreamId(id);
      setMessages(await db.getMessages(id));
      setDraft(null);
      setError(null);
      setContextChainMessageId(null);
      setFullHistoryOnce(false);
    },
    [db],
  );

  const newStream = useCallback(() => {
    setActiveStreamId(null);
    setMessages([]);
    setDraft(null);
    setError(null);
    setSidebarOpen(false);
    setContextChainMessageId(null);
    setFullHistoryOnce(false);
  }, []);

  const deleteStream = useCallback(
    async (id: string) => {
      if (!db) return;
      // Local, user-owned data — confirm, then real delete is fine here.
      if (!window.confirm("Delete this conversation from this device?")) return;
      await db.deleteStream(id);
      await refreshStreams();
      setSavedByStream((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSpentByStream((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeStreamId === id) {
        setActiveStreamId(null);
        setMessages([]);
      }
    },
    [db, activeStreamId, refreshStreams],
  );

  const renameStream = useCallback(
    async (id: string, title: string) => {
      if (!db) return;
      await db.updateStream(id, { title });
      await refreshStreams();
    },
    [db, refreshStreams],
  );

  const handleSignalChange = useCallback(
    (messageId: string, signal: SignalLevel) => {
      if (!db) return;
      void db.updateMessage(messageId, { signal });
      // Pure transition (lib/signals) — chip, chain view and context
      // selection all derive from this one state update.
      setMessages((prev) => applySignal(prev, messageId, signal));
    },
    [db],
  );

  const handleToggleContextChain = useCallback((messageId: string) => {
    setContextChainMessageId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleContextScopeChange = useCallback((scope: ContextScope) => {
    setContextScope(scope);
    localStorage.setItem(CONTEXT_SCOPE_KEY, scope);
  }, []);

  const handleModeChange = useCallback((next: string) => {
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
  }, []);

  const handleDefaultModelChange = useCallback((modelId: string) => {
    setDefaultModelId(modelId || undefined);
    if (modelId) localStorage.setItem(DEFAULT_MODEL_KEY, modelId);
    else localStorage.removeItem(DEFAULT_MODEL_KEY);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!db || isStreaming) return;
      setError(null);
      setIsStreaming(true);
      draftRef.current = "";

      // Per-send override applies to THIS send only, then reverts.
      const sendScope: ContextScope = fullHistoryOnce
        ? "everything"
        : contextScope;
      setFullHistoryOnce(false);

      // Lazily create the stream on first message.
      let streamId = activeStreamId;
      if (!streamId) {
        streamId = localId("stream");
        const title = text.length > 48 ? `${text.slice(0, 48)}…` : text;
        await db.createStream(streamId, title);
        setActiveStreamId(streamId);
        await refreshStreams();
      }

      const history = await db.getMessages(streamId);

      await sendMessageWith(
        {
          db,
          keys,
          streamId,
          text,
          mode,
          defaultModelId,
          history,
          contextScope: sendScope,
          makeId: localId,
        },
        {
          onUserMessage: (m) => {
            setMessages((prev) => [...prev, m]);
          },
          onRouting: (decision) => {
            setRouting({ ...decision, visible: true });
            setDraft({
              id: "draft",
              role: "assistant",
              content: "",
              streaming: true,
            });
          },
          onToken: (t) => {
            draftRef.current += t;
            setDraft({
              id: "draft",
              role: "assistant",
              content: draftRef.current,
              streaming: true,
            });
          },
          onDone: (m) => {
            setDraft(null);
            setMessages((prev) => [...prev, m]);
            setRouting((prev) => (prev ? { ...prev, visible: false } : null));
            // Incremental savings update — no rescan.
            const saved = messageSavedUsd(m.metadata);
            if (saved > 0 && streamId) {
              setSavedByStream((prev) => ({
                ...prev,
                [streamId]: (prev[streamId] ?? 0) + saved,
              }));
            }
            const spent = m.metadata?.cost_usd;
            if (typeof spent === "number" && spent > 0 && streamId) {
              setSpentByStream((prev) => ({
                ...prev,
                [streamId]: (prev[streamId] ?? 0) + spent,
              }));
            }
            void refreshStreams();
          },
          onError: (e) => {
            setDraft(null);
            setError(e);
            setRouting((prev) => (prev ? { ...prev, visible: false } : null));
          },
        },
      );

      setIsStreaming(false);
    },
    [db, keys, activeStreamId, mode, defaultModelId, isStreaming, contextScope, fullHistoryOnce, refreshStreams],
  );

  // Kongen key is REQUIRED: gate first-run on
  // it, and re-gate previously onboarded users who don't have one yet.
  // (keysVersion re-renders keep keys.get() fresh after any key change.)
  if (!onboarded || !keys.get("kongen")) {
    return (
      <FirstRun
        keys={keys}
        onChanged={bumpKeys}
        onFinish={() => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setOnboarded(true);
        }}
      />
    );
  }

  const chatMessages: ChatMessage[] = [
    ...messages.map(toChatMessage),
    ...(draft ? [draft] : []),
  ];

  return (
    <div className="flex h-full">
      <StreamSidebar
        streams={streams}
        savedByStream={savedByStream}
        lifetimeSavedUsd={lifetimeSavedUsd}
        lifetimeSpentUsd={lifetimeSpentUsd}
        activeStreamId={activeStreamId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => void selectStream(id)}
        onNew={newStream}
        onDelete={(id) => void deleteStream(id)}
        onRename={(id, title) => void renameStream(id, title)}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setSidebarOpen(false);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Chat header: title (inline rename) + savings chip/popover */}
        <ChatHeader
          title={streams.find((s) => s.id === activeStreamId)?.title || "Flow"}
          canRename={Boolean(activeStreamId)}
          onRename={(title) => {
            if (activeStreamId) void renameStream(activeStreamId, title);
          }}
          onOpenSidebar={() => setSidebarOpen(true)}
          savings={conversationSavings}
          baselineName={(() => {
            const flagship = flagshipFor(availableProviders(keys));
            return flagship ? formatModelName(flagship.model) : undefined;
          })()}
        />

        {/* Error banner */}
        {error && (
          <div className="mx-auto mt-2 w-full max-w-3xl px-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <ChatView
            streamId={activeStreamId ?? "new"}
            messages={chatMessages}
            onSend={(text) => void handleSend(text)}
            isStreaming={isStreaming}
            mode={mode}
            onModeChange={handleModeChange}
            onSignalChange={handleSignalChange}
            contextChainMessageId={contextChainMessageId}
            onToggleContextChain={handleToggleContextChain}
            contextScope={contextScope}
            fullHistoryOnce={fullHistoryOnce}
            onToggleFullHistoryOnce={() => setFullHistoryOnce((v) => !v)}
            routingIndicator={
              routing ? (
                <RoutingIndicator
                  model={routing.model}
                  provider={routing.provider}
                  visible={routing.visible}
                  routedVia={routing.routedVia}
                  regime={routing.regime}
                  fallbackReason={routing.fallbackReason}
                />
              ) : null
            }
          />
        </div>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        keys={keys}
        db={db}
        defaultModelId={defaultModelId}
        onDefaultModelChange={handleDefaultModelChange}
        onKeysChanged={bumpKeys}
        onImported={() => {
          void refreshStreams();
          void recomputeSavings();
        }}
        lifetimeSavedUsd={lifetimeSavedUsd}
        contextScope={contextScope}
        onContextScopeChange={handleContextScopeChange}
      />
    </div>
  );
}
