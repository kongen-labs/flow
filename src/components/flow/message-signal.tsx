import { useState } from "react";
import { Minus, Ghost, Check, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGNAL_OPTIONS, type SignalLevel } from "@/lib/signals";
import { SIGNAL_MEANING } from "@/lib/explain-copy";

export type { SignalLevel };

interface MessageSignalProps {
  messageId: string;
  currentSignal: SignalLevel;
  onSignalChange: (messageId: string, signal: SignalLevel) => void;
  compact?: boolean;
  /**
   * Always show the text labels on inactive options (default hides them
   * below sm). Used inside the signal explainer popover, where each state
   * must be nameable at any viewport width.
   */
  alwaysLabels?: boolean;
}

// User-facing labels (Pin / Default / Ignore — rename Jul 16 2026:
// 'flagged is used to report issues') live in lib/signals.ts so the
// vocabulary is unit-testable; internal levels stay "critical"/"dismissed"
// — storage/classifier vocabulary is unchanged. Styling is per-level here.
const SIGNAL_STYLE: Record<
  SignalLevel,
  { icon: typeof Pin; color: string; activeColor: string; activeBorder: string }
> = {
  critical: {
    icon: Pin,
    color: "text-muted-foreground",
    activeColor: "text-red-500 bg-red-500/15 font-medium",
    activeBorder: "ring-1 ring-red-500/40",
  },
  default: {
    icon: Minus,
    color: "text-muted-foreground",
    activeColor: "text-foreground bg-muted font-medium",
    activeBorder: "ring-1 ring-foreground/20",
  },
  dismissed: {
    icon: Ghost,
    color: "text-muted-foreground",
    activeColor: "text-muted-foreground bg-muted/60 font-medium",
    activeBorder: "ring-1 ring-muted-foreground/30",
  },
};

const SIGNALS = SIGNAL_OPTIONS.map((option) => ({
  ...option,
  ...SIGNAL_STYLE[option.level],
}));

export function MessageSignal({
  messageId,
  currentSignal,
  onSignalChange,
  compact = false,
  alwaysLabels = false,
}: MessageSignalProps) {
  const [expanded, setExpanded] = useState(false);

  if (compact) {
    // Inline icon-only toggle (for the message bubble)
    const current = SIGNALS.find((s) => s.level === currentSignal) || SIGNALS[1];
    const Icon = current.icon;

    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-sans transition-all",
          currentSignal === "critical" && "text-red-500 bg-red-500/10 ring-1 ring-red-500/30",
          currentSignal === "dismissed" && "text-muted-foreground/50 bg-muted/50 ring-1 ring-muted-foreground/20",
          currentSignal === "default" && "hover:bg-muted/50 text-muted-foreground",
        )}
        title={`Signal: ${current.label}`}
      >
        <Icon className="h-3 w-3" />
        {expanded && (
          <div className="absolute left-0 top-full mt-1 z-20 flex gap-1 bg-card border border-border rounded-lg shadow-md p-1.5">
            {SIGNALS.map((sig) => {
              const SigIcon = sig.icon;
              const isActive = currentSignal === sig.level;
              return (
                <button
                  key={sig.level}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSignalChange(messageId, sig.level);
                    setExpanded(false);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-sans transition-all",
                    isActive
                      ? cn(sig.activeColor, sig.activeBorder)
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  title={sig.label}
                >
                  {isActive ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <SigIcon className="h-3 w-3" />
                  )}
                  <span>{sig.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </button>
    );
  }

  // Full signal selector (for context drawer or settings)
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
      {SIGNALS.map((sig) => {
        const Icon = sig.icon;
        const isActive = currentSignal === sig.level;
        return (
          <button
            key={sig.level}
            onClick={() => onSignalChange(messageId, sig.level)}
            title={SIGNAL_MEANING[sig.level]}
            className={cn(
              "flex items-center gap-1.5 py-1.5 rounded-md text-xs font-sans transition-all",
              alwaysLabels ? "px-2" : "px-2.5",
              isActive
                ? cn(sig.activeColor, sig.activeBorder)
                : "hover:bg-muted " + sig.color,
            )}
          >
            {isActive ? (
              <Check className="h-3 w-3" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            <span className={cn(!isActive && !alwaysLabels && "hidden sm:inline")}>{sig.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Swipe-to-reveal wrapper for messages.
 * On mobile: swipe left reveals the signal control.
 * On desktop: hover shows a small signal icon.
 */
export function SwipeableMessage({
  children,
  messageId,
  signal,
  onSignalChange,
}: {
  children: React.ReactNode;
  messageId: string;
  signal: SignalLevel;
  onSignalChange: (messageId: string, signal: SignalLevel) => void;
}) {
  const [showSignal, setShowSignal] = useState(false);

  return (
    <div
      className={cn(
        "group relative",
        signal === "critical" && "border-l-2 border-red-500 pl-2",
        signal === "dismissed" && "opacity-40",
      )}
      onMouseEnter={() => setShowSignal(true)}
      onMouseLeave={() => setShowSignal(false)}
    >
      {children}

      {/* Signal control — appears on hover (desktop) or tap (mobile) */}
      <div
        className={cn(
          "absolute -right-1 top-1 transition-opacity",
          showSignal ? "opacity-100" : "opacity-0 group-hover:opacity-60",
        )}
      >
        <MessageSignal
          messageId={messageId}
          currentSignal={signal}
          onSignalChange={onSignalChange}
          compact
        />
      </div>

      {/* Dismissed indicator */}
      {signal === "dismissed" && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-muted-foreground/20" />
        </div>
      )}
    </div>
  );
}
