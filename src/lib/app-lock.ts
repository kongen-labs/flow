/**
 * App Lock — biometric lock via WebAuthn platform authenticators
 * (Face ID / Touch ID / Android biometrics / Windows Hello).
 * Jul 17 2026: "add a smart key lock to the app. Like face
 * login, or finger print."
 *
 * TWO MODES, feature-detected, honest about themselves:
 *
 * 1. "encrypted" — when the authenticator supports the WebAuthn PRF
 *    extension (Chrome/Edge 116+, Safari 18+, recent Android):
 *      passkey PRF output (32 bytes, per-credential secret only released
 *      after user verification)
 *        → HKDF-SHA-256 (random 32-byte salt stored locally, fixed info
 *          string "flow-local-app-lock-v1")
 *        → AES-GCM-256 wrapping key (non-extractable, in-memory only)
 *      The KeyStore contents (all API keys) are encrypted at rest with
 *      that key: localStorage holds ciphertext {v, iv, ct}; the plaintext
 *      slot is removed. Unlock re-runs the PRF eval and decrypts into
 *      memory for the session. DevTools/localStorage inspection sees only
 *      ciphertext. A wrong PRF output fails the AES-GCM auth tag check.
 *
 * 2. "gate" — when PRF is unavailable: a WebAuthn user-verification
 *    presence check gates the UI. Stored keys are NOT additionally
 *    encrypted — the settings copy says so explicitly (LOCK_MODE_COPY).
 *    Never imply encryption in gate mode.
 *
 * THREAT MODEL (for security review review):
 *  - Protects against: casual/opportunistic device access, shoulder-surf
 *    localStorage snooping, key exfiltration from a copied localStorage
 *    (encrypted mode), other people using your unlocked computer profile.
 *  - Does NOT protect against: a compromised browser/extension or XSS
 *    while the app is unlocked (decrypted keys are in JS memory), a
 *    platform-level attacker, or anyone who can pass the device biometric.
 *  - No server: the WebAuthn ceremony is client-only. The challenge is
 *    random entropy to satisfy the API; there is no relying-party
 *    signature verification and none is needed — the PRF secret itself
 *    (never readable without user verification) is the security anchor in
 *    encrypted mode. In gate mode the ceremony is purely a UI gate.
 *
 * RECOVERY: the PRF secret lives in the platform authenticator. If the
 * passkey is lost (new device, credential deleted in OS settings), the
 * ciphertext is unrecoverable BY DESIGN. reset() removes the lock config
 * and wipes the stored API keys (ciphertext and plaintext slots); the
 * user re-pastes keys. Conversations (IndexedDB) are NOT touched — this
 * module holds no reference to the DB on purpose. v1 boundary: only keys
 * are encrypted, not conversation history.
 *
 * PLATFORM NOTES:
 *  - iOS Safari (incl. installed PWA / standalone): WebAuthn requires a
 *    user gesture — both enable() and unlock() must run from a click
 *    handler (the LockScreen button does). iOS < 18 lacks PRF → gate mode.
 *    Standalone-PWA WebAuthn is supported from iOS 16.4; older installs
 *    fall back to "unsupported" and the settings section says so.
 *  - Multi-tab: lock-state sync via BroadcastChannel (app-lock-gate.tsx).
 *    Only "lock"/"config-changed" events are broadcast — never key
 *    material; every tab runs its own WebAuthn ceremony to unlock.
 *  - Export/import: unaffected. Keys were never included in exports.
 *
 * Interface-first with injected storage + credentials so the node vitest
 * environment can drive the full wrap/unwrap path with a mocked
 * authenticator (headless can't do real biometrics).
 */

import type { KeyMap, KeySlot, KeyStore } from "./keys";
import {
  APP_LOCK_CONFIG_KEY,
  ENCRYPTED_KEYS_KEY,
  KEYS_STORAGE_KEY,
} from "./keys";

// Storage slots are defined in keys.ts (so the key facade can consult them
// without a module cycle) and re-exported here as the canonical surface.
export { APP_LOCK_CONFIG_KEY, ENCRYPTED_KEYS_KEY };

const HKDF_INFO = new TextEncoder().encode("flow-local-app-lock-v1");
const CEREMONY_TIMEOUT_MS = 60_000;

export type LockMode = "encrypted" | "gate";

/**
 * Persisted lock configuration. Everything here is non-secret: the
 * credential id is public by WebAuthn design; prfSalt is the PRF eval
 * input (useless without the authenticator); hkdfSalt only randomizes the
 * KDF. The secret — the PRF output — never touches storage.
 */
export interface AppLockConfig {
  v: 1;
  mode: LockMode;
  /** base64 credential rawId — pins unlock to the registered passkey. */
  credentialId: string;
  /** base64 32-byte PRF eval input (encrypted mode only). */
  prfSalt?: string;
  /** base64 32-byte HKDF salt (encrypted mode only). */
  hkdfSalt?: string;
  /** Idle auto-lock: 0 = off. */
  idleMinutes: number;
}

/** Storage facade (localStorage-compatible; injectable for node tests). */
export interface LockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The credentials boundary — mocked in tests, navigator.credentials live. */
export interface WebAuthnCredentials {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}

/** PRF extension results (not yet in lib.dom for all TS versions). */
interface PrfExtensionResults {
  prf?: {
    enabled?: boolean;
    results?: { first?: ArrayBuffer };
  };
}

/**
 * Settings/explainer copy — kept here (pure strings, node-testable) so the
 * honesty contract is enforced by unit test: gate mode must never claim
 * encryption. Do not soften these without re-running the copy tests.
 */
export const LOCK_MODE_COPY: Record<LockMode, { title: string; body: string }> = {
  encrypted: {
    title: "Biometric encryption active",
    body:
      "Your API keys are stored encrypted with a key held by your device's " +
      "biometric hardware (passkey PRF). Unlocking with Face ID / " +
      "fingerprint decrypts them for this session; anyone reading this " +
      "browser's storage sees only ciphertext. Conversations are not " +
      "encrypted in v1 — only keys.",
  },
  gate: {
    title: "Screen lock only",
    body:
      "This locks the app's screens behind Face ID / fingerprint. Without " +
      "PRF support in this browser, stored keys are NOT additionally " +
      "encrypted at rest.",
  },
};

/** Recovery copy — shown before the typed-confirmation reset. */
export const RESET_COPY =
  "Resetting App Lock removes the lock and wipes the API keys stored in " +
  "this app — without your passkey they cannot be decrypted, by design. " +
  "Your conversations are NOT touched. You will paste your keys again " +
  "afterwards.";

/** The word the user must type to confirm a reset. */
export const RESET_CONFIRM_WORD = "reset";

// ---------------------------------------------------------------------------
// base64 helpers (btoa/atob exist in browsers and Node >= 16)

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ---------------------------------------------------------------------------
// Crypto: PRF output -> HKDF-SHA-256 -> AES-GCM-256, fresh 96-bit IV per write

/**
 * Ciphertext blob persisted at ENCRYPTED_KEYS_KEY.
 *
 * Format versions (live-bug fix, Jul 16 2026 — a tester enabled App Lock
 * on the pre-hardening build, then the AAD hardening changed decryption
 * without bumping the format, so his legacy blob failed the GCM tag and
 * the error misattributed it to a passkey mismatch):
 *  - v1 = legacy, NO additionalData (legacy builds). Read-only:
 *    decrypted without AAD once, then immediately re-encrypted as v2
 *    (seamless migration on unlock).
 *  - v2 = AAD-bound (configAad) — the only format ever written.
 *
 * SECURITY NOTE (for security review): the legacy no-AAD decrypt path is
 * reachable ONLY for v1 blobs, which can only exist from the
 * pre-hardening build. An attacker crafting a v1 blob gains nothing — a
 * valid GCM tag still requires the PRF-derived key; AAD was
 * defense-in-depth for CONFIG binding, and migration rewrites to v2 on
 * the first successful unlock.
 */
interface CipherBlob {
  v: 1 | 2;
  /** base64 12-byte random IV, regenerated on every encryption. */
  iv: string;
  /** base64 AES-GCM ciphertext (includes the 16-byte auth tag). */
  ct: string;
}

async function deriveWrappingKey(
  prfOutput: ArrayBuffer,
  hkdfSaltB64: string,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: b64ToBytes(hkdfSaltB64) as BufferSource,
      info: HKDF_INFO as BufferSource,
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the wrapping key never leaves WebCrypto
    ["encrypt", "decrypt"],
  );
}

/**
 * AES-GCM additionalData binding the ciphertext to its lock config
 * (security review F2 hardening): credentialId + both salts + version are
 * authenticated, so tampering the (attacker-writable) config blob surfaces
 * as a decrypt failure instead of being silently accepted.
 */
function configAad(config: AppLockConfig): Uint8Array {
  return new TextEncoder().encode(
    `flow-local-app-lock-v1|${config.credentialId}|${config.prfSalt}|${config.hkdfSalt}`,
  );
}

/** Always writes the current v2 (AAD-bound) format. */
async function encryptJson(
  key: CryptoKey,
  value: unknown,
  aad: Uint8Array,
): Promise<CipherBlob> {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: aad as BufferSource,
    },
    key,
    plaintext as BufferSource,
  );
  return { v: 2, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

/**
 * Throws on a wrong key / tampered blob or AAD (AES-GCM auth failure).
 * `aad` is omitted ONLY for the legacy v1 migration read (see CipherBlob).
 */
async function decryptJson<T>(
  key: CryptoKey,
  blob: CipherBlob,
  aad?: Uint8Array,
): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: b64ToBytes(blob.iv) as BufferSource,
      ...(aad ? { additionalData: aad as BufferSource } : {}),
    },
    key,
    b64ToBytes(blob.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// ---------------------------------------------------------------------------

type Session =
  | { mode: "gate" }
  | { mode: "encrypted"; wrappingKey: CryptoKey; keys: KeyMap; aad: Uint8Array };

export class AppLock {
  private session: Session | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(
    private deps: { storage: LockStorage; webauthn: WebAuthnCredentials },
  ) {}

  /** Platform support check (UI shows "not available" when false). */
  static isSupported(): boolean {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.credentials)
    );
  }

  getConfig(): AppLockConfig | null {
    try {
      const raw = this.deps.storage.getItem(APP_LOCK_CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppLockConfig;
      return parsed && parsed.v === 1 && parsed.credentialId ? parsed : null;
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    return this.getConfig() !== null;
  }

  isUnlocked(): boolean {
    // Fail closed on an inconsistent store (security review F2): deleting
    // the config while ciphertext exists must NOT leave the app "unlocked".
    if (this.integrityIssue()) return false;
    return !this.isEnabled() || this.session !== null;
  }

  /**
   * Consistency check between the ciphertext and the (attacker-writable)
   * config blob (security review F2: silent-downgrade prevention).
   * Ciphertext presence is authoritative: when it exists, the config MUST
   * say encrypted mode and carry both well-formed 32-byte salts. Any other
   * combination (mode flipped to "gate", config deleted, salts dropped or
   * mangled) is surfaced — never silently degraded to a gate unlock or an
   * unlocked app, which would let a re-paste land keys in plaintext.
   */
  integrityIssue(): string | null {
    if (this.deps.storage.getItem(ENCRYPTED_KEYS_KEY) === null) return null;
    const config = this.getConfig();
    const salt32 = (b64?: string): boolean => {
      if (!b64) return false;
      try {
        return b64ToBytes(b64).length === 32;
      } catch {
        return false;
      }
    };
    if (
      !config ||
      config.mode !== "encrypted" ||
      !salt32(config.prfSalt) ||
      !salt32(config.hkdfSalt)
    ) {
      return (
        "App Lock configuration is inconsistent with the encrypted keys — " +
        "Reset App Lock to continue."
      );
    }
    return null;
  }

  /**
   * Enable App Lock: register a platform passkey (discoverable, user
   * verification required) with the PRF extension requested; feature-detect
   * the mode we actually got. Must run from a user gesture.
   */
  async enable(): Promise<LockMode> {
    // Belt-and-suspenders (F2): never enable over an inconsistent store —
    // it would overwrite orphaned ciphertext. Reset is the way out.
    const issue = this.integrityIssue();
    if (issue) throw new Error(issue);
    if (this.getConfig()) throw new Error("App Lock is already enabled.");

    const prfSalt = randomBytes(32);
    const hkdfSalt = randomBytes(32);

    const cred = (await this.deps.webauthn.create({
      publicKey: {
        // Client-only ceremony: the challenge satisfies the API; no server
        // verifies it (see threat model in the module header).
        challenge: randomBytes(32) as BufferSource,
        rp: { name: "Flow" }, // rp.id defaults to the current effective domain
        user: {
          id: randomBytes(16) as BufferSource,
          name: "flow-local",
          displayName: "Flow App Lock",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required",
        },
        attestation: "none",
        timeout: CEREMONY_TIMEOUT_MS,
        // Chrome evaluates PRF during create; Safari only flags `enabled`
        // and evaluates on the follow-up get() below.
        extensions: {
          prf: { eval: { first: prfSalt as BufferSource } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("Passkey registration was cancelled.");

    const credentialId = bytesToB64(new Uint8Array(cred.rawId));
    const ext = cred.getClientExtensionResults() as PrfExtensionResults;
    let prfOutput = ext.prf?.results?.first ?? null;
    const prfCapable = Boolean(ext.prf?.enabled) || prfOutput !== null;

    if (prfCapable && !prfOutput) {
      // Safari path: PRF flagged as enabled but not evaluated at create
      // time — one immediate assertion evaluates it.
      prfOutput = await this.evalPrf(credentialId, prfSalt);
    }

    if (prfOutput) {
      const config: AppLockConfig = {
        v: 1,
        mode: "encrypted",
        credentialId,
        prfSalt: bytesToB64(prfSalt),
        hkdfSalt: bytesToB64(hkdfSalt),
        idleMinutes: 0,
      };
      const wrappingKey = await deriveWrappingKey(prfOutput, config.hkdfSalt!);
      const aad = configAad(config);
      // Move plaintext keys -> ciphertext, then remove the plaintext slot.
      const keys = this.readPlaintextKeys();
      const blob = await encryptJson(wrappingKey, keys, aad);
      this.deps.storage.setItem(ENCRYPTED_KEYS_KEY, JSON.stringify(blob));
      this.deps.storage.removeItem(KEYS_STORAGE_KEY);
      this.saveConfig(config);
      this.session = { mode: "encrypted", wrappingKey, keys, aad };
      return "encrypted";
    }

    // Honest fallback: presence gate only, keys stay as they are.
    this.saveConfig({ v: 1, mode: "gate", credentialId, idleMinutes: 0 });
    this.session = { mode: "gate" };
    return "gate";
  }

  /**
   * Unlock with the registered passkey. Encrypted mode: re-evaluate PRF,
   * re-derive the wrapping key, decrypt keys into memory — a wrong/foreign
   * PRF output rejects via AES-GCM auth failure. Gate mode: user-verified
   * assertion success is the (UI-only) gate. Must run from a user gesture.
   */
  async unlock(): Promise<LockMode> {
    // F2: refuse to proceed over a downgraded/damaged config — a silent
    // gate unlock here would orphan the ciphertext and invite a plaintext
    // key re-paste.
    const issue = this.integrityIssue();
    if (issue) throw new Error(issue);
    const config = this.getConfig();
    if (!config) throw new Error("App Lock is not enabled.");

    if (config.mode === "encrypted") {
      if (!config.prfSalt || !config.hkdfSalt) {
        throw new Error("App Lock configuration is damaged. Reset App Lock.");
      }
      const prfOutput = await this.evalPrf(
        config.credentialId,
        b64ToBytes(config.prfSalt),
      );
      const wrappingKey = await deriveWrappingKey(prfOutput, config.hkdfSalt);
      // F3: malformed / wrong-shape / unknown-version ciphertext blobs get
      // the friendly reset guidance instead of a raw SyntaxError (or a
      // misleading passkey-mismatch message) on the LockScreen.
      const raw = this.deps.storage.getItem(ENCRYPTED_KEYS_KEY);
      let blob: CipherBlob | null = null;
      try {
        const parsed = raw ? (JSON.parse(raw) as CipherBlob) : null;
        if (
          parsed &&
          (parsed.v === 1 || parsed.v === 2) &&
          typeof parsed.iv === "string" &&
          typeof parsed.ct === "string"
        ) {
          blob = parsed;
        }
      } catch {
        // fall through to the friendly message below
      }
      if (!blob) {
        throw new Error(
          "Encrypted keys are missing or damaged. Reset App Lock to continue.",
        );
      }
      const aad = configAad(config);
      let keys: KeyMap;
      try {
        // v1 = legacy pre-AAD blob (pre-hardening build): decrypt without
        // additionalData, then migrate below. A GCM failure on EITHER
        // version genuinely means a key mismatch (wrong passkey/PRF).
        keys = await decryptJson<KeyMap>(
          wrappingKey,
          blob,
          blob.v === 2 ? aad : undefined,
        );
      } catch {
        throw new Error(
          "Decryption failed — this passkey does not match the stored keys.",
        );
      }
      // F1a self-heal: a stale plaintext slot (multi-tab race, storage
      // restore, import) must not persist beside the ciphertext.
      this.deps.storage.removeItem(KEYS_STORAGE_KEY);
      this.session = { mode: "encrypted", wrappingKey, keys, aad };
      // Seamless v1 -> v2 migration: re-encrypt AAD-bound immediately via
      // the persist chain; the user sees nothing.
      if (blob.v === 1) this.queuePersist();
      return "encrypted";
    }

    const cred = await this.deps.webauthn.get({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        allowCredentials: [
          {
            type: "public-key",
            id: b64ToBytes(config.credentialId) as BufferSource,
          },
        ],
        userVerification: "required",
        timeout: CEREMONY_TIMEOUT_MS,
      },
    });
    if (!cred) throw new Error("Unlock was cancelled.");
    this.session = { mode: "gate" };
    return "gate";
  }

  /** Drop session material (decrypted keys + wrapping key references). */
  lock(): void {
    this.session = null;
  }

  /**
   * In-memory KeyStore over the decrypted session keys; writes re-encrypt
   * and persist ciphertext. Null when not in an unlocked encrypted session
   * (gate mode / disabled use the plaintext store unchanged).
   */
  getSessionKeyStore(): KeyStore | null {
    if (this.session?.mode !== "encrypted") return null;
    const lock = this;
    return {
      getAll(): KeyMap {
        const s = lock.session;
        return s?.mode === "encrypted" ? { ...s.keys } : {};
      },
      get(slot: KeySlot): string | undefined {
        const key = this.getAll()[slot];
        return key && key.trim() ? key.trim() : undefined;
      },
      set(slot: KeySlot, key: string): void {
        const s = lock.session;
        if (s?.mode !== "encrypted") return; // locked mid-write: drop
        s.keys[slot] = key.trim();
        lock.queuePersist();
      },
      remove(slot: KeySlot): void {
        const s = lock.session;
        if (s?.mode !== "encrypted") return;
        delete s.keys[slot];
        lock.queuePersist();
      },
    };
  }

  /** Await any in-flight ciphertext writes (used by tests + disable()). */
  whenPersisted(): Promise<void> {
    return this.persistChain;
  }

  /**
   * Disable App Lock. Encrypted mode requires an unlocked session (we need
   * the decrypted keys to restore the plaintext slot).
   */
  async disable(): Promise<void> {
    const config = this.getConfig();
    if (!config) return;
    if (config.mode === "encrypted") {
      const s = this.session;
      if (s?.mode !== "encrypted") {
        throw new Error("Unlock before turning App Lock off.");
      }
      await this.whenPersisted();
      this.deps.storage.setItem(KEYS_STORAGE_KEY, JSON.stringify(s.keys));
      this.deps.storage.removeItem(ENCRYPTED_KEYS_KEY);
    }
    this.deps.storage.removeItem(APP_LOCK_CONFIG_KEY);
    this.session = null;
  }

  /**
   * Recovery path when the passkey is lost: removes the lock and WIPES the
   * stored API keys (ciphertext and plaintext slots) — they are
   * unrecoverable without the passkey by design. Conversations (IndexedDB)
   * are untouched: this class has no DB reference. Callers must gate this
   * behind typed confirmation (RESET_CONFIRM_WORD).
   */
  reset(): void {
    this.deps.storage.removeItem(ENCRYPTED_KEYS_KEY);
    this.deps.storage.removeItem(KEYS_STORAGE_KEY);
    this.deps.storage.removeItem(APP_LOCK_CONFIG_KEY);
    this.session = null;
  }

  setIdleMinutes(minutes: number): void {
    const config = this.getConfig();
    if (!config) return;
    this.saveConfig({ ...config, idleMinutes: minutes });
  }

  // -- private ---------------------------------------------------------------

  private async evalPrf(
    credentialIdB64: string,
    prfSalt: Uint8Array,
  ): Promise<ArrayBuffer> {
    const cred = (await this.deps.webauthn.get({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        allowCredentials: [
          { type: "public-key", id: b64ToBytes(credentialIdB64) as BufferSource },
        ],
        userVerification: "required",
        timeout: CEREMONY_TIMEOUT_MS,
        extensions: {
          prf: { eval: { first: prfSalt as BufferSource } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("Unlock was cancelled.");
    const out = (cred.getClientExtensionResults() as PrfExtensionResults).prf
      ?.results?.first;
    if (!out) {
      throw new Error("This authenticator did not return the PRF secret.");
    }
    return out;
  }

  private readPlaintextKeys(): KeyMap {
    try {
      const raw = this.deps.storage.getItem(KEYS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveConfig(config: AppLockConfig): void {
    this.deps.storage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(config));
  }

  /** Serialize ciphertext writes; snapshot-encrypts the full key map. */
  private queuePersist(): void {
    this.persistChain = this.persistChain.then(async () => {
      const s = this.session;
      if (s?.mode !== "encrypted") return;
      const blob = await encryptJson(s.wrappingKey, { ...s.keys }, s.aad);
      this.deps.storage.setItem(ENCRYPTED_KEYS_KEY, JSON.stringify(blob));
      // F1a self-heal: enforce continued absence of the plaintext slot on
      // every ciphertext write, not just once at enable().
      this.deps.storage.removeItem(KEYS_STORAGE_KEY);
    });
  }
}
