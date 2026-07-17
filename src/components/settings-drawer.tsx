/**
 * Settings drawer — grouped sections: Keys · Routing & Context ·
 * Appearance · Security (App Lock) · Your Data (savings + export/import +
 * the About-Flow trust surface + "How does Kongen work"). Organization/
 * visual polish only — every control and copy string predates the regroup.
 *
 * Export/import is the portability half of the wedge: conversations are
 * plain JSON the user can move between browsers, devices, or archive.
 *
 * Mobile-first: renders as a bottom sheet (drag handle, swipe-down to
 * dismiss, safe-area padding) below md, and as the original right-side
 * panel on md+. Hand-rolled — no component library.
 */

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ChevronDown,
  Database,
  Download,
  Info,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AboutFlowContent } from "./about-flow";
import { AboutKongenContent } from "./about-kongen";
import { AppLockSettings } from "./app-lock-settings";
import { ThemedSelect } from "./ui/select";
import type { FlowDB, FlowExport } from "@/lib/db";
import type { KeyStore } from "@/lib/keys";
import { availableProviders } from "@/lib/keys";
import { KONGEN_HOW_TITLE } from "@/lib/kongen-copy";
import { PROVIDER_MODELS, formatModelName } from "@/lib/models";
import type { ContextScope } from "@/lib/context";
import { formatSavedUsd } from "@/lib/savings";
import { getThemePref, setTheme, type ThemePref } from "@/lib/theme";
import { KeySetup } from "./key-setup";

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** One settings group: icon + uppercase header, consistent spacing. */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 py-5 first:pt-4 last:pb-6">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Expandable info card (About-Flow / About-Kongen share the pattern). */
function ExpandableInfo({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 md:py-2",
          "text-xs font-medium hover:bg-muted transition-colors",
        )}
      >
        <span className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="rounded-lg border bg-background/40 p-3">{children}</div>
      )}
    </div>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  keys,
  db,
  defaultModelId,
  onDefaultModelChange,
  onKeysChanged,
  onImported,
  lifetimeSavedUsd = 0,
  contextScope = "relevant",
  onContextScopeChange,
}: {
  open: boolean;
  onClose: () => void;
  keys: KeyStore;
  db: FlowDB | null;
  defaultModelId: string | undefined;
  onDefaultModelChange: (modelId: string) => void;
  onKeysChanged: () => void;
  onImported: () => void;
  /** Est. lifetime savings across all conversations (outcome counter). */
  lifetimeSavedUsd?: number;
  contextScope?: ContextScope;
  onContextScopeChange?: (scope: ContextScope) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [themePref, setThemePref] = useState<ThemePref>(() => getThemePref());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kongenOpen, setKongenOpen] = useState(false);
  // Swipe-down-to-dismiss (mobile bottom sheet only).
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const providers = availableProviders(keys);

  if (!open) return null;

  async function handleExport() {
    if (!db) return;
    const bundle = await db.exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      `Exported ${bundle.streams.length} conversations, ${bundle.messages.length} messages.`,
    );
  }

  async function handleImportFile(file: File) {
    if (!db) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as FlowExport;
      const result = await db.importAll(bundle);
      setStatus(
        `Imported ${result.streams} new conversations, ${result.messages} new messages.`,
      );
      onImported();
    } catch (err) {
      setStatus(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function handleThemeChange(pref: ThemePref) {
    setTheme(pref);
    setThemePref(pref);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Settings"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        className={cn(
          // Mobile: bottom sheet.
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-card shadow-lg",
          "pb-[env(safe-area-inset-bottom)]",
          // md+: right-side panel (original layout).
          "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-sm md:rounded-none md:border-l md:border-t-0 md:pb-0",
        )}
      >
        {/* Drag handle (mobile only) — swipe down to dismiss */}
        <div
          className="flex justify-center pt-2 pb-1 md:hidden touch-none"
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (dragStartY.current === null) return;
            setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current));
          }}
          onTouchEnd={() => {
            if (dragY > 80) onClose();
            dragStartY.current = null;
            setDragY(0);
          }}
        >
          <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between border-b px-4 py-2 md:py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-muted transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
            title="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 divide-y divide-border/60 overscroll-contain">
          {/* 1 — Keys */}
          <Section icon={KeyRound} title="Keys">
            <KeySetup keys={keys} onChanged={onKeysChanged} />
          </Section>

          {/* 2 — Routing & Context */}
          <Section icon={Zap} title="Routing & Context">
            {/* Default model (no-routing path) */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-medium text-foreground">
                Default model
              </h4>
              <p className="text-[11px] text-muted-foreground/70">
                Used when smart routing is temporarily unavailable.
              </p>
              <ThemedSelect
                value={defaultModelId ?? ""}
                onChange={(e) => onDefaultModelChange(e.target.value)}
              >
                <option value="">Balanced default (auto)</option>
                {providers.flatMap((provider) =>
                  PROVIDER_MODELS[provider].map((spec) => (
                    <option key={spec.name} value={spec.name}>
                      {provider} / {formatModelName(spec.name)}
                    </option>
                  )),
                )}
              </ThemedSelect>
            </div>

            {/* Context scope — relevance selection escape hatch */}
            {onContextScopeChange && (
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-medium text-foreground">
                  Context
                </h4>
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                  Smart Reference sends only the part of the conversation
                  related to each prompt (its topic chain, your last two
                  exchanges, and pinned messages). The chain view on any reply
                  shows exactly what was included and why.
                </p>
                <div className="flex gap-1 rounded-lg border p-1">
                  <button
                    type="button"
                    onClick={() => onContextScopeChange("relevant")}
                    aria-pressed={contextScope === "relevant"}
                    className={cn(
                      "flex-1 rounded-md px-2 py-2 md:py-1.5 text-xs font-medium transition-colors",
                      contextScope === "relevant"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Smart Reference (default)
                  </button>
                  <button
                    type="button"
                    onClick={() => onContextScopeChange("everything")}
                    aria-pressed={contextScope === "everything"}
                    className={cn(
                      "flex-1 rounded-md px-2 py-2 md:py-1.5 text-xs font-medium transition-colors",
                      contextScope === "everything"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Full history
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* 3 — Appearance */}
          <Section icon={Palette} title="Appearance">
            <div className="flex gap-1 rounded-lg border p-1">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleThemeChange(value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 md:py-1.5 text-xs font-medium transition-colors",
                    themePref === value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={themePref === value}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* 4 — Security: App Lock (copy honesty enforced in
              lib/app-lock.test.ts) */}
          <Section icon={ShieldCheck} title="Security">
            <AppLockSettings />
          </Section>

          {/* 5 — Your Data: savings + portability + the trust surfaces.
              About-Flow stays prominent here (audited copy, untouched);
              "How does Kongen work" is its Kongen-side complement. */}
          <Section icon={Database} title="Your Data">
            {lifetimeSavedUsd > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Kongen Routing has saved you est.{" "}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {formatSavedUsd(lifetimeSavedUsd)}
                </span>{" "}
                across all conversations, vs always using the latest frontier
                model of your providers.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Conversations live in this browser&apos;s IndexedDB — nothing is
              synced anywhere. Export to JSON any time; import merges without
              overwriting local history. Keys are never included in exports.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Import JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {status && (
              <p className="text-[11px] text-muted-foreground" role="status">
                {status}
              </p>
            )}

            {/* About Flow — verbatim, claims-audited copy (about-flow.tsx) */}
            <ExpandableInfo
              title="How Flow works & your data"
              open={aboutOpen}
              onToggle={() => setAboutOpen((o) => !o)}
            >
              <AboutFlowContent />
            </ExpandableInfo>

            {/* How does Kongen work — assembled from approved language
                only (lib/kongen-copy.ts) */}
            <ExpandableInfo
              title={KONGEN_HOW_TITLE}
              open={kongenOpen}
              onToggle={() => setKongenOpen((o) => !o)}
            >
              <AboutKongenContent />
            </ExpandableInfo>
          </Section>
        </div>
      </div>
    </>
  );
}
