/**
 * Local key storage — BYO provider keys + optional Kongen API key.
 *
 * LOCKED decision: keys live in localStorage (PWA shell) and never leave
 * the machine. The MV3 extension shell will swap in a chrome.storage.local
 * implementation of the same KeyStore interface — that is why this module
 * is interface-first rather than bare localStorage calls at call sites.
 *
 * TODO(extension-shell): implement ChromeStorageKeyStore backed by
 * chrome.storage.local and select it at shell bootstrap.
 */

import type { Provider } from "./models";

/** All key slots: the five LLM providers + "kongen" for routing. */
export type KeySlot = Provider | "kongen";

export type KeyMap = Partial<Record<KeySlot, string>>;

export interface KeyStore {
  getAll(): KeyMap;
  get(slot: KeySlot): string | undefined;
  set(slot: KeySlot, key: string): void;
  remove(slot: KeySlot): void;
}

/**
 * Plaintext keys slot. When App Lock runs in encrypted mode (lib/app-lock)
 * this slot is removed and keys live as AES-GCM ciphertext at
 * ENCRYPTED_KEYS_KEY instead; a session override (below) serves decrypted
 * keys from memory while unlocked.
 */
export const KEYS_STORAGE_KEY = "flow-local:keys:v1";
const STORAGE_KEY = KEYS_STORAGE_KEY;

/**
 * App Lock storage slots — owned by lib/app-lock (which re-exports them),
 * defined HERE so the key facade below can consult them without a module
 * cycle (app-lock imports keys; keys must never import app-lock).
 */
export const APP_LOCK_CONFIG_KEY = "flow-local:applock:v1";
export const ENCRYPTED_KEYS_KEY = "flow-local:keys:enc:v1";

/** Minimal storage facade so tests can inject a fake (node has no localStorage). */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageKeyStore implements KeyStore {
  constructor(private storage: StringStorage) {}

  getAll(): KeyMap {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  get(slot: KeySlot): string | undefined {
    const key = this.getAll()[slot];
    return key && key.trim() ? key.trim() : undefined;
  }

  set(slot: KeySlot, key: string): void {
    const all = this.getAll();
    all[slot] = key.trim();
    this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  remove(slot: KeySlot): void {
    const all = this.getAll();
    delete all[slot];
    this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

/** Providers (excluding kongen) that currently have a key. */
export function availableProviders(store: KeyStore): Provider[] {
  const all = store.getAll();
  return (Object.keys(all) as KeySlot[])
    .filter((slot): slot is Provider => slot !== "kongen")
    .filter((slot) => Boolean(all[slot] && all[slot]!.trim()));
}

/**
 * App Lock session override. While an encrypted-mode session is unlocked,
 * the gate (components/app-lock-gate) registers the in-memory decrypted
 * store here; locking clears it. keys.ts must NOT import app-lock (module
 * cycle) — this setter is the seam.
 */
let sessionKeyStore: KeyStore | null = null;

export function setSessionKeyStore(store: KeyStore | null): void {
  sessionKeyStore = store;
}

/**
 * No-op store served while an encrypted App Lock is active but this tab
 * has no unlocked session (security review finding F1b):
 * without this, a locked/lagging tab (or any pre-unlock code path) would
 * fall back to the plaintext LocalStorageKeyStore and a key write there
 * would RE-CREATE flow-local:keys:v1 in cleartext beside the ciphertext.
 * Reads return nothing; writes are dropped. Unlocking registers the real
 * session store via setSessionKeyStore().
 */
const EMPTY_KEY_STORE: KeyStore = {
  getAll: () => ({}),
  get: () => undefined,
  set: () => {},
  remove: () => {},
};

/**
 * True when App Lock encrypted mode governs this storage. Ciphertext
 * presence alone is authoritative — the config blob is attacker-writable
 * (localStorage) and its deletion/downgrade must not re-open the
 * plaintext path (security review finding F2).
 */
function encryptedLockPresent(storage: StringStorage): boolean {
  if (storage.getItem(ENCRYPTED_KEYS_KEY) !== null) return true;
  try {
    const raw = storage.getItem(APP_LOCK_CONFIG_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { mode?: string } | null;
    return parsed?.mode === "encrypted";
  } catch {
    // Malformed config with no ciphertext: nothing encrypted to protect.
    return false;
  }
}

/**
 * Default store for the PWA shell. Returns a stable delegating facade:
 * call sites may memoize it once (App does) and still transparently follow
 * App Lock enable/unlock/lock transitions, because the target store is
 * resolved per call. While an encrypted lock is active the plaintext
 * fallback is refused (see EMPTY_KEY_STORE).
 */
export function createDefaultKeyStore(): KeyStore {
  const target = (): KeyStore => {
    if (sessionKeyStore) return sessionKeyStore;
    if (encryptedLockPresent(window.localStorage)) return EMPTY_KEY_STORE;
    return new LocalStorageKeyStore(window.localStorage);
  };
  return {
    getAll: () => target().getAll(),
    get: (slot) => target().get(slot),
    set: (slot, key) => target().set(slot, key),
    remove: (slot) => target().remove(slot),
  };
}

/** Redacted display form, e.g. "sk-ant-…f3a9". */
export function keyPrefix(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
