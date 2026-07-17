/**
 * Local BYO-key management — shared by the first-run screen and Settings.
 *
 * Unlike the hosted app (which stores keys server-side), this version
 * writes to the local KeyStore only. Keys never leave the machine.
 *
 * Kongen key is REQUIRED: first-run collects it before chatting, so it
 * renders as its own mandatory section (KongenKeySection) ahead of the
 * BYO provider keys (ProviderKeysSection).
 *
 * Mobile-first: 44px touch targets below md, 16px input font so iOS Safari
 * does not auto-zoom, per-key "test" ping (lib/ping.ts), and a "Get a key"
 * shortcut to each provider's API-key console.
 */

import { useState } from "react";
import {
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  Radio,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  availableProviders,
  keyPrefix,
  type KeySlot,
  type KeyStore,
} from "@/lib/keys";
import { LABEL_EXPLAIN } from "@/lib/explain-copy";
import { PROVIDER_LABELS, PROVIDERS, type Provider } from "@/lib/models";
import { pingKey, type PingResult } from "@/lib/ping";
import { Explainer } from "./explainer";

const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  google: "AIza...",
  mistral: "...",
  deepseek: "sk-...",
};

/**
 * Deep links to each provider's key-creation page (verified Jul 15 2026):
 * logged-in users land directly on key management; logged-out users get the
 * provider's login with a preserved return path (Google `continue=`, Mistral
 * `return_to=` confirmed live; OpenAI/DeepSeek bot-block HEAD probes, paths
 * per current docs).
 */
const PROVIDER_KEY_URLS: Record<Provider, string> = {
  // 301s from the old console.anthropic.com/settings/keys — link the final home.
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  mistral: "https://console.mistral.ai/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
};

// Deep link into the Kongen dashboard's key management: logged-out
// visitors get /login?redirect=%2Fkeys and land back on the keys page
// after auth.
// TODO: key-mint flow.
export const KONGEN_SIGNUP_URL = "https://garden.kongenlabs.life/keys";

/** 44px hit area on touch, compact on md+. */
const TOUCH_ICON_BUTTON =
  "flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:p-1.5 rounded-md transition-colors";

function KeyRow({
  slot,
  label,
  placeholder,
  keys,
  onChanged,
  accent,
  keyUrl,
  keyUrlLabel,
}: {
  slot: KeySlot;
  label: string;
  placeholder: string;
  keys: KeyStore;
  onChanged: () => void;
  accent?: boolean;
  /** Link to the page where the user can create this key. */
  keyUrl?: string;
  keyUrlLabel?: string;
}) {
  const stored = keys.get(slot);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<PingResult | null>(null);

  async function handleTest() {
    if (!stored || testing) return;
    setTesting(true);
    setTestResult(null);
    const result = await pingKey(slot, stored);
    setTestResult(result);
    setTesting(false);
  }

  // Commit the typed key. Also fired on Enter and on blur — a pasted key
  // must count without hunting for the save icon (gates "Start chatting").
  function handleSave() {
    if (!value.trim()) return;
    keys.set(slot, value);
    setValue("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChanged();
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-20 md:w-24 shrink-0 text-xs font-medium",
            accent ? "text-brand-fg" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {stored ? (
          <>
            <span className="flex-1 min-w-0 truncate rounded-md bg-muted px-2.5 py-2.5 md:py-1.5 text-xs font-mono text-muted-foreground">
              {keyPrefix(stored)}
            </span>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className={cn(
                TOUCH_ICON_BUTTON,
                "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
              title={
                slot === "kongen"
                  ? `Test ${label} key (scores one word — uses 1 KT)`
                  : `Test ${label} key (free model-list call)`
              }
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testResult ? (
                testResult.ok ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <X className="h-3.5 w-3.5 text-destructive" />
                )
              ) : (
                <Radio className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                keys.remove(slot);
                setTestResult(null);
                onChanged();
              }}
              className={cn(
                TOUCH_ICON_BUTTON,
                "text-muted-foreground hover:text-destructive hover:bg-muted",
              )}
              title={`Remove ${label} key (local only)`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              onBlur={handleSave}
              placeholder={placeholder}
              autoComplete="off"
              className={cn(
                // 16px font below md prevents iOS Safari's input auto-zoom.
                "flex-1 min-w-0 rounded-md border bg-card px-2.5 py-2.5 md:py-1.5 text-[16px] md:text-xs font-mono",
                "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring",
              )}
            />
            <button
              type="button"
              disabled={!value.trim()}
              onClick={handleSave}
              className={cn(
                TOUCH_ICON_BUTTON,
                value.trim()
                  ? "text-foreground hover:bg-muted"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
              title={`Save ${label} key locally`}
            >
              {saved ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        )}
      </div>
      {!stored && keyUrl && (
        <a
          href={keyUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex min-h-[32px] items-center gap-1 pl-[5.5rem] md:pl-[6.5rem] text-[11px]",
            accent
              ? "text-brand-fg hover:underline"
              : "text-muted-foreground/70 hover:text-foreground hover:underline",
          )}
        >
          {keyUrlLabel ?? "Get a key"}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      {testResult && (
        <p
          role="status"
          className={cn(
            "pl-[5.5rem] md:pl-[6.5rem] text-[10px]",
            testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
          )}
        >
          {testResult.ok
            ? `Key works${testResult.detail ? ` — ${testResult.detail}` : ""}`
            : `Key failed — ${testResult.detail ?? "unknown error"}`}
        </p>
      )}
    </div>
  );
}

/** Kongen routing key — REQUIRED. Rendered first everywhere keys appear. */
export function KongenKeySection({
  keys,
  onChanged,
}: {
  keys: KeyStore;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-brand-fg" />
        <Explainer
          heading="Why required?"
          body={LABEL_EXPLAIN.kongenKeyRequired}
          learnMore={'More: Settings → "How does Kongen work".'}
          trigger={
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kongen key (required)
            </h3>
          }
        />
      </div>
      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Flow routes with Kongen: each Auto prompt is scored (1 KT) and sent to
        the model best suited to it; pinned-model prompts skip scoring and
        cost nothing. Start with 500 free routed prompts — keys are free at{" "}
        <a
          href={KONGEN_SIGNUP_URL}
          target="_blank"
          rel="noreferrer"
          className="underline text-brand-fg"
        >
          garden.kongenlabs.life
        </a>
        .
      </p>
      <KeyRow
        slot="kongen"
        label="Kongen"
        placeholder="kk-..."
        keys={keys}
        onChanged={onChanged}
        accent
        keyUrl={KONGEN_SIGNUP_URL}
        keyUrlLabel="Get a free Kongen key"
      />
    </div>
  );
}

/** BYO provider keys — at least one is needed to actually send. */
export function ProviderKeysSection({
  keys,
  onChanged,
}: {
  keys: KeyStore;
  onChanged: () => void;
}) {
  const configured = availableProviders(keys);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Explainer
          heading="Provider keys"
          body={LABEL_EXPLAIN.providerKeys}
          learnMore
          trigger={
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Provider keys
            </h3>
          }
        />
        <span className="text-[10px] text-muted-foreground/60">
          stored on this device only
        </span>
      </div>
      {PROVIDERS.map((provider) => (
        <KeyRow
          key={provider}
          slot={provider}
          label={PROVIDER_LABELS[provider]}
          placeholder={PROVIDER_PLACEHOLDERS[provider]}
          keys={keys}
          onChanged={onChanged}
          keyUrl={PROVIDER_KEY_URLS[provider]}
        />
      ))}
      {configured.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70">
          Paste at least one key to chat. Keys go straight from your browser
          to the provider — no server in between.
        </p>
      )}
    </div>
  );
}

/** Settings composition: required Kongen key first, then provider keys. */
export function KeySetup({
  keys,
  onChanged,
}: {
  keys: KeyStore;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-5">
      <KongenKeySection keys={keys} onChanged={onChanged} />
      <ProviderKeysSection keys={keys} onChanged={onChanged} />
    </div>
  );
}
