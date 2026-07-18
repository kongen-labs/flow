import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  GitBranch,
  History,
  Send,
  ChevronDown,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OFFLINE_SEND_MESSAGE } from "@/lib/offline";
import { LABEL_EXPLAIN } from "@/lib/explain-copy";
import { Explainer } from "../explainer";
import {
  HELPER_TEXT,
  STRIP_NOTICE,
  stripBlockedChars,
} from "@/lib/blocked-chars";
import { formatModelName } from "@/lib/models";
import { useCatalog } from "@/lib/use-catalog";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  /**
   * Device is offline. Sending (provider stream + Auto scoring) needs the
   * network, so the send button is disabled with a precise reason — but the
   * textarea stays live so a draft can be composed offline, and the drafted
   * text is never cleared by a blocked send (Jul 17 2026).
   */
  offline?: boolean;
  mode?: string;
  onModeChange?: (mode: string) => void;
  /**
   * Per-send full-history override (next send only). The chip is hidden
   * when the callback is absent (persistent default already sends
   * everything, so there is nothing to override).
   */
  fullHistoryOnce?: boolean;
  onToggleFullHistoryOnce?: () => void;
  /**
   * Whether at least one provider key is present. When false the mode/model
   * selector is replaced by the "No provider keys" attention indicator and
   * the model dropdown is unavailable (Jul 17 2026). Defaults
   * true so the normal ≥1-key path is untouched.
   */
  hasProviderKeys?: boolean;
  /** Deep-link to Settings → Keys (reuses the App lock-shortcut mechanism). */
  onAddKey?: () => void;
}

// Friendly display for the selected mode
function displayMode(mode: string): string {
  return mode === "Auto" ? "Auto" : formatModelName(mode);
}

const MAX_ROWS = 6;

/** First-use Smart Reference note: shown until dismissed once. */
const SR_NOTE_DISMISSED_KEY = "flow-local:sr-note:v1";

export function ChatInput({
  onSend,
  disabled,
  offline = false,
  mode = "Auto",
  onModeChange,
  fullHistoryOnce,
  onToggleFullHistoryOnce,
  hasProviderKeys = true,
  onAddKey,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [modeOpen, setModeOpen] = useState(false);

  // Picker groups derived from the LIVE catalog (lib/models.ts): server-fetched
  // with a bundled seed fallback. Built in render (via useCatalog) so a model
  // added on the server appears here with no code change; only `selectable`
  // models are offered for pinning.
  const catalog = useCatalog();
  const modelGroups = useMemo(
    () =>
      catalog.providers
        .map((p) => ({
          provider: p.label,
          models: p.models
            .filter((spec) => spec.selectable !== false)
            .map((spec) => ({
              id: spec.name,
              label: spec.label ?? formatModelName(spec.name),
              regimes: spec.regimes.join(" · "),
            })),
        }))
        .filter((group) => group.models.length > 0),
    [catalog],
  );
  // Transient flag: set true for ~3s after a strip happens, drives the
  // inline notice render below the textarea.
  const [stripNoticeVisible, setStripNoticeVisible] = useState(false);
  // Smart Reference first-use note (Jul 17 2026): one quiet,
  // dismissible element near the chip. Persisted flag — shown until the
  // user dismisses it once. Copy restates audited step 4 and names both
  // engagement touchpoints (LABEL_EXPLAIN.smartReferenceFirstUse); no
  // tour framework, no new deps.
  const [srNoteVisible, setSrNoteVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(SR_NOTE_DISMISSED_KEY) !== "1",
  );
  const dismissSrNote = useCallback(() => {
    window.localStorage.setItem(SR_NOTE_DISMISSED_KEY, "1");
    setSrNoteVisible(false);
  }, []);

  // Auto-clear the strip notice after 3s so it doesn't linger.
  useEffect(() => {
    if (!stripNoticeVisible) return;
    const t = setTimeout(() => setStripNoticeVisible(false), 3000);
    return () => clearTimeout(t);
  }, [stripNoticeVisible]);

  const isEmpty = value.trim().length === 0;

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    // Offline blocks the send BEFORE clearing — the draft is preserved so the
    // user can send it on reconnect (never a silent failure, never lost text).
    if (!trimmed || disabled || offline) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, offline, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      data-testid="chat-input-area"
      className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 md:pb-4"
    >
      <div className="mx-auto max-w-3xl">
        {/* Smart Reference first-use note — near the chip it explains.
            Rendered only while the chip exists (Smart Reference active). */}
        {/* No role="note" on this div: that role is reserved app-wide for
            the Explainer popovers (portal + geometry tests select on it). */}
        {srNoteVisible && onToggleFullHistoryOnce && (
          <div
            aria-label="Smart Reference"
            data-testid="sr-first-use-note"
            className="mb-2 flex items-start gap-2 rounded-lg border bg-card/80 px-3 py-2"
          >
            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {LABEL_EXPLAIN.smartReferenceFirstUse}
              </p>
              {/* Learn-more pattern -> About-Flow (step 4 lives there). */}
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                More: Settings &rarr; &ldquo;How Flow works &amp; your
                data&rdquo;.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissSrNote}
              title="Dismiss"
              className="flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* Floating card */}
        <div
          className={cn(
            "rounded-xl border bg-card shadow-md",
            "ring-1 ring-border/50",
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              // Strip backend-normalized special chars before they hit state.
              // Belt-and-suspenders for `[P1-SCORE-002]` — see lib/blocked-chars.ts.
              const { cleaned, stripped } = stripBlockedChars(e.target.value);
              setValue(cleaned);
              if (stripped) setStripNoticeVisible(true);
              resize();
            }}
            onPaste={(e) => {
              // Intercept paste so the user never sees a flash of the
              // blocked chars in the textarea before they're stripped.
              const pasted = e.clipboardData.getData("text");
              const { cleaned, stripped } = stripBlockedChars(pasted);
              if (!stripped) return; // let the browser handle the paste
              e.preventDefault();
              const el = textareaRef.current;
              if (!el) {
                setValue((prev) => prev + cleaned);
                setStripNoticeVisible(true);
                return;
              }
              // Splice the cleaned paste into the current selection.
              const start = el.selectionStart ?? value.length;
              const end = el.selectionEnd ?? value.length;
              const next = value.slice(0, start) + cleaned + value.slice(end);
              setValue(next);
              setStripNoticeVisible(true);
              // Restore caret to the end of the inserted text on next tick.
              const caret = start + cleaned.length;
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.selectionStart = caret;
                  textareaRef.current.selectionEnd = caret;
                }
                resize();
              });
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message Flow... (Shift+Enter for new line)"
            disabled={disabled}
            rows={1}
            className={cn(
              // 16px on touch so iOS Safari doesn't auto-zoom the input.
              "w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[16px] md:text-sm",
              "placeholder:text-muted-foreground/50 focus:outline-none",
              "min-h-[40px] leading-6",
              "disabled:opacity-50",
            )}
          />

          {/* Bottom bar: mode selector + full-history chip + send button */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-1">
            {/* No-provider-keys attention state (Jul 17 2026): replaces
                the mode/model selector entirely — the model dropdown is
                unavailable until a provider key exists. Warning-toned chip +
                alert icon (amber per tokens — visible, not screaming), same
                amber treatment as the armed full-history chip. Tapping opens
                the shared Explainer: approved provider-keys line + a primary
                "Add a key" deep-link to Settings → Keys. */}
            {!hasProviderKeys ? (
              <Explainer
                heading={LABEL_EXPLAIN.providerKeysMissing}
                body={LABEL_EXPLAIN.providerKeys}
                trigger={
                  <span
                    data-testid="no-provider-keys-indicator"
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 ring-1 ring-amber-400/50 dark:bg-amber-900/40 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {LABEL_EXPLAIN.providerKeysMissing}
                  </span>
                }
              >
                {(close) => (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onAddKey?.();
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-brand/90"
                  >
                    {LABEL_EXPLAIN.addProviderKey}
                  </button>
                )}
              </Explainer>
            ) : (
            /* Mode selector */
            <div className="relative">
              <button
                type="button"
                onClick={() => setModeOpen(!modeOpen)}
                title="Routing mode — Auto routes each prompt to the model best suited for it, or pin a specific model"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  mode === "Auto"
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                    : "text-foreground bg-muted",
                )}
              >
                {mode === "Auto" && <Zap className="h-3 w-3" />}
                {displayMode(mode)}
                <ChevronDown className={cn("h-3 w-3 transition-transform", modeOpen && "rotate-180")} />
              </button>

              {/* Model dropdown */}
              {modeOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setModeOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border bg-popover shadow-lg overflow-hidden">
                    {/* Auto option */}
                    <button
                      type="button"
                      onClick={() => {
                        onModeChange?.("Auto");
                        setModeOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-xs border-b",
                        "hover:bg-accent hover:text-accent-foreground",
                        mode === "Auto" && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <div className="text-left">
                        <div className="font-medium">Auto</div>
                        <div className="text-[10px] text-muted-foreground">
                          Routes each prompt to its best-suited model
                        </div>
                      </div>
                    </button>

                    {/* Model groups */}
                    <div className="max-h-64 overflow-y-auto py-1">
                      {modelGroups.map((group) => (
                        <div key={group.provider}>
                          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.provider}
                          </div>
                          {group.models.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onModeChange?.(m.id);
                                setModeOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between px-3 py-1.5 text-xs",
                                "hover:bg-accent hover:text-accent-foreground",
                                mode === m.id && "bg-accent text-accent-foreground font-medium",
                              )}
                            >
                              <span>{m.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {m.regimes}
                              </span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            )}

            {/* Context state chip — indicator + switcher (Jul 16 2026:
                show the CURRENT state, not an on/off toggle label). Default
                shows "Smart Reference" with the GitBranch icon — the same
                icon as the reply chain view it feeds, so the relationship
                is visible. Tap arms "Full history" for the next send only
                (amber + notice line), then it reverts to Smart Reference. */}
            {onToggleFullHistoryOnce && (
              <button
                type="button"
                onClick={onToggleFullHistoryOnce}
                aria-pressed={fullHistoryOnce}
                title={
                  fullHistoryOnce
                    ? "Full history will be sent with this prompt — tap to revert to Smart Reference"
                    : LABEL_EXPLAIN.smartReferenceChip
                }
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  fullHistoryOnce
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-400/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {fullHistoryOnce ? (
                  <History className="h-3 w-3" />
                ) : (
                  <GitBranch className="h-3 w-3" />
                )}
                <span className="truncate">
                  {fullHistoryOnce ? "Full history" : "Smart Reference"}
                </span>
              </button>
            )}
            </div>

            {/* Send button — disabled offline (sending needs the network);
                the reason is stated in the status line below. */}
            <button
              onClick={handleSend}
              disabled={isEmpty || disabled || offline}
              title={
                offline
                  ? OFFLINE_SEND_MESSAGE
                  : "Send message (Enter)"
              }
              className={cn(
                "rounded-lg p-2.5 md:p-2 transition-colors",
                !isEmpty && !disabled && !offline
                  ? "bg-brand hover:bg-brand/90 text-white"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Context-mode status + helper text + transient strip notice.
            The status line is ALWAYS-ON (Jul 17 2026: "equivalent
            'Full history will be sent with this prompt' message for smart
            reference, so it's on all the time"):
            - Smart Reference default -> quiet muted line (vocabulary
              matches the first-use note; restates audited step 4; tap
              opens the chip's explainer). Suppressed while the first-use
              note is visible so the two never stack saying the same thing
              — once the note is dismissed, this line is the permanent
              affordance.
            - Armed one-send full history -> the existing amber line, tap
              opens the full-history explainer.
            - Persistent full-history default (chip absent) -> amber
              status without the one-send framing, plain (its semantics
              live in Settings). */}
        <div className="mt-1.5 px-1 text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {offline ? (
            // One message while offline: the precise send-disabled reason,
            // stated once. The context/helper lines are suppressed so the
            // boundary is unambiguous (impeccable.style: one clear message).
            <span
              role="status"
              aria-live="polite"
              data-testid="offline-send-reason"
              className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400"
            >
              <WifiOff className="h-3 w-3 shrink-0" />
              {OFFLINE_SEND_MESSAGE}
            </span>
          ) : (
            <>
          {fullHistoryOnce ? (
            <Explainer
              heading="Full history"
              body={LABEL_EXPLAIN.fullHistoryChip}
              trigger={
                <span
                  role="status"
                  className="font-medium text-amber-600 dark:text-amber-400"
                >
                  Full history will be sent with this prompt
                </span>
              }
            />
          ) : onToggleFullHistoryOnce ? (
            !srNoteVisible && (
              <Explainer
                heading="Smart Reference"
                body={LABEL_EXPLAIN.smartReferenceChip}
                trigger={
                  <span>
                    Smart Reference: relevant messages will be sent with this
                    prompt.
                  </span>
                }
              />
            )
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Full history will be sent with your prompts.
            </span>
          )}
          <span>{HELPER_TEXT}</span>
          {stripNoticeVisible && (
            <span
              role="status"
              aria-live="polite"
              className="text-brand-fg"
            >
              · {STRIP_NOTICE}
            </span>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
