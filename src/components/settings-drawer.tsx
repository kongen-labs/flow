/**
 * Settings — home menu + sub-views (Jul 17 2026: "the settings view
 * is too long and easily can confuse the consumer"). Same impeccable.style
 * medicine as the onboarding wizard:
 *
 *  - distill / one-thing-per-screen: the home view is a SHORT menu — five
 *    tappable rows (icon · title · one-line status summary), NO forms.
 *    Each group's controls live in a sub-view behind a back chevron.
 *  - hierarchy: consumer-first ordering — Keys, Appearance, Routing &
 *    Context, Security, Your Data (trust cluster last but visible).
 *    Rare controls (context-scope default, idle-lock timing) read as
 *    secondary INSIDE their sub-views, never competing with home rows.
 *  - "tiny body text" anti-pattern: sub-views use the wizard type scale
 *    (13-14px body on mobile, larger labels), not 11px.
 *  - motion conveys state only: instant view swap, no slide theater.
 *
 * Navigation is CONTROLLED (view/onNavigate from App) so deep links work:
 * the sidebar lock-icon shortcut lands directly on the Security sub-view.
 *
 * All existing functionality + audited copy verbatim; explainers keep
 * working in sub-views (body-portal anchoring). Mobile bottom sheet and
 * desktop right panel share the exact structure.
 *
 * Export/import is the portability half of the wedge: conversations are
 * plain JSON the user can move between browsers, devices, or archive.
 */

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Info,
  KeyRound,
  Monitor,
  MonitorDown,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isStandalone } from "@/lib/install";
import { AboutFlowContent } from "./about-flow";
import { AboutKongenContent } from "./about-kongen";
import { AppLockSettings } from "./app-lock-settings";
import { useAppLock } from "./app-lock-gate";
import { openInstall } from "./install-sheet";
import { ThemedSelect } from "./ui/select";
import type { FlowDB, FlowExport } from "@/lib/db";
import type { KeyStore } from "@/lib/keys";
import { availableProviders } from "@/lib/keys";
import { KONGEN_HOW_TITLE } from "@/lib/kongen-copy";
import {
  SOURCE_PUBLIC_PREFIX,
  SOURCE_REPO_LABEL,
  SOURCE_REPO_URL,
} from "@/lib/source-link";
import {
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  formatModelName,
} from "@/lib/models";
import type { ContextScope } from "@/lib/context";
import { formatSavedUsd } from "@/lib/savings";
import { getThemePref, setTheme, type ThemePref } from "@/lib/theme";
import { KeySetup } from "./key-setup";

export type SettingsView =
  | "home"
  | "keys"
  | "routing"
  | "appearance"
  | "security"
  | "data";

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const THEME_LABELS: Record<ThemePref, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** Home-menu row: icon · title · one-line status summary · chevron. */
function MenuRow({
  icon: Icon,
  title,
  summary,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
        "hover:bg-muted transition-colors",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

/** Sub-view chrome: back chevron + title, then content given room. */
function SubView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
          title="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-semibold md:text-sm">{title}</h3>
      </div>
      {children}
    </div>
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
          "text-sm font-medium hover:bg-muted transition-colors md:text-xs",
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
  view,
  onNavigate,
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
  /** Controlled navigation — deep links (sidebar lock icon) target views. */
  view: SettingsView;
  onNavigate: (view: SettingsView) => void;
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
  const appLock = useAppLock();

  if (!open) return null;

  // ---- Home-row status summaries (one line each) ----
  const keysSummary = keys.get("kongen")
    ? providers.length === 0
      ? "Kongen — no provider yet"
      : providers.length <= 2
        ? `Kongen + ${providers.map((p) => PROVIDER_LABELS[p]).join(" + ")}`
        : `Kongen + ${providers.length} providers`
    : "Kongen key missing";
  const routingSummary = `${
    defaultModelId ? formatModelName(defaultModelId) : "Auto"
  } · ${contextScope === "relevant" ? "Smart Reference" : "Full history"}`;
  const appearanceSummary = THEME_LABELS[themePref];
  const securitySummary = !appLock?.supported
    ? "App Lock unavailable"
    : appLock.enabled
      ? appLock.mode === "encrypted"
        ? "App Lock on — keys encrypted"
        : "App Lock on"
      : "App Lock off";
  const dataSummary =
    lifetimeSavedUsd > 0
      ? `est. ${formatSavedUsd(lifetimeSavedUsd)} saved · export & import`
      : "Export & import · about Flow";

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

        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
          {/* ---- Home: short menu, no forms ---- */}
          {view === "home" && (
            <div className="space-y-2">
              <MenuRow
                icon={KeyRound}
                title="Keys"
                summary={keysSummary}
                onClick={() => onNavigate("keys")}
              />
              <MenuRow
                icon={Palette}
                title="Appearance"
                summary={appearanceSummary}
                onClick={() => onNavigate("appearance")}
              />
              <MenuRow
                icon={Zap}
                title="Routing & Context"
                summary={routingSummary}
                onClick={() => onNavigate("routing")}
              />
              <MenuRow
                icon={ShieldCheck}
                title="Security"
                summary={securitySummary}
                onClick={() => onNavigate("security")}
              />
              <MenuRow
                icon={Database}
                title="Your Data"
                summary={dataSummary}
                onClick={() => onNavigate("data")}
              />
              {/* Install: action row (opens the native prompt or the
                  platform instruction sheet), not a sub-view. */}
              <MenuRow
                icon={MonitorDown}
                title="Install as app"
                summary={
                  isStandalone()
                    ? "You're using the installed app ✓"
                    : "Use Flow on iPhone, Mac, and Windows"
                }
                onClick={() => void openInstall()}
              />
            </div>
          )}

          {/* ---- Keys ---- */}
          {view === "keys" && (
            <SubView title="Keys" onBack={() => onNavigate("home")}>
              <KeySetup keys={keys} onChanged={onKeysChanged} />
            </SubView>
          )}

          {/* ---- Appearance ---- */}
          {view === "appearance" && (
            <SubView title="Appearance" onBack={() => onNavigate("home")}>
              <div className="flex gap-1 rounded-lg border p-1">
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemeChange(value)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 md:py-1.5 text-sm font-medium transition-colors md:text-xs",
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
            </SubView>
          )}

          {/* ---- Routing & Context ---- */}
          {view === "routing" && (
            <SubView
              title="Routing & Context"
              onBack={() => onNavigate("home")}
            >
              <div className="space-y-2">
                <h4 className="text-sm font-medium md:text-xs">
                  Default model
                </h4>
                <p className="text-[13px] text-muted-foreground md:text-xs">
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

              {/* Secondary/rare: context-scope default. */}
              {onContextScopeChange && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="text-sm font-medium md:text-xs">Context</h4>
                  <p className="text-[13px] leading-relaxed text-muted-foreground md:text-xs">
                    Smart Reference sends only the part of the conversation
                    related to each prompt (its topic chain, your last two
                    exchanges, and pinned messages). The chain view on any
                    reply shows exactly what was included and why.
                  </p>
                  <div className="flex gap-1 rounded-lg border p-1">
                    <button
                      type="button"
                      onClick={() => onContextScopeChange("relevant")}
                      aria-pressed={contextScope === "relevant"}
                      className={cn(
                        "flex-1 rounded-md px-2 py-2.5 md:py-1.5 text-sm font-medium transition-colors md:text-xs",
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
                        "flex-1 rounded-md px-2 py-2.5 md:py-1.5 text-sm font-medium transition-colors md:text-xs",
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
            </SubView>
          )}

          {/* ---- Security: App Lock (copy honesty enforced in
              lib/app-lock.test.ts) ---- */}
          {view === "security" && (
            <SubView title="Security" onBack={() => onNavigate("home")}>
              <AppLockSettings />
            </SubView>
          )}

          {/* ---- Your Data: savings + portability + trust cluster ---- */}
          {view === "data" && (
            <SubView title="Your Data" onBack={() => onNavigate("home")}>
              {lifetimeSavedUsd > 0 && (
                <p className="text-[13px] text-muted-foreground md:text-xs">
                  Kongen Routing has saved you est.{" "}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatSavedUsd(lifetimeSavedUsd)}
                  </span>{" "}
                  across all conversations, vs always using the latest
                  frontier model of your providers.
                </p>
              )}
              <p className="text-[13px] leading-relaxed text-muted-foreground md:text-xs">
                Conversations live in this browser&apos;s IndexedDB — nothing
                is synced anywhere. Export to JSON any time; import merges
                without overwriting local history. Keys are never included in
                exports.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-sm font-medium hover:bg-muted transition-colors md:text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-sm font-medium hover:bg-muted transition-colors md:text-xs"
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
                <p className="text-xs text-muted-foreground" role="status">
                  {status}
                </p>
              )}

              {/* Trust cluster — last but visible, not buried. About-Flow
                  is verbatim, claims-audited copy (about-flow.tsx). */}
              <div className="space-y-2 border-t pt-4">
                <ExpandableInfo
                  title="How Flow works & your data"
                  open={aboutOpen}
                  onToggle={() => setAboutOpen((o) => !o)}
                >
                  <AboutFlowContent />
                </ExpandableInfo>
                {/* How does Kongen work — approved language only
                    (lib/kongen-copy.ts). */}
                <ExpandableInfo
                  title={KONGEN_HOW_TITLE}
                  open={kongenOpen}
                  onToggle={() => setKongenOpen((o) => !o)}
                >
                  <AboutKongenContent />
                </ExpandableInfo>
                {/* Public-source link — softened approved claim only (see
                    the build-provenance TODO in lib/source-link.ts). */}
                <p className="text-xs leading-relaxed text-muted-foreground/70">
                  {SOURCE_PUBLIC_PREFIX}{" "}
                  <a
                    href={SOURCE_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-brand-fg"
                  >
                    {SOURCE_REPO_LABEL}
                  </a>
                </p>
              </div>
            </SubView>
          )}
        </div>
      </div>
    </>
  );
}
