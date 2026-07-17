/**
 * App Lock unit tests — the credentials boundary is mocked (headless/node
 * can't do real biometrics); everything from PRF output onward is the real
 * WebCrypto path (HKDF -> AES-GCM wrap/unwrap of the KeyStore contents).
 */

import { describe, expect, it } from "vitest";
import {
  APP_LOCK_CONFIG_KEY,
  AppLock,
  ENCRYPTED_KEYS_KEY,
  LOCK_MODE_COPY,
  RESET_COPY,
  bytesToB64,
  type LockStorage,
  type WebAuthnCredentials,
} from "./app-lock";
import {
  KEYS_STORAGE_KEY,
  createDefaultKeyStore,
  setSessionKeyStore,
} from "./keys";

// ---------------------------------------------------------------------------
// Fakes

class MemoryStorage implements LockStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

const CRED_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

/**
 * Fake platform authenticator at the WebAuthnCredentials seam.
 * `prfOutput = null` models a browser/authenticator without PRF support.
 * `evalOnCreate` mirrors Chrome (true) vs Safari (false — PRF flagged
 * enabled at create, evaluated only on the follow-up get()).
 */
function fakeWebAuthn(opts: {
  prfOutput: Uint8Array | null;
  evalOnCreate?: boolean;
}): WebAuthnCredentials & { creates: number; gets: number } {
  const { prfOutput, evalOnCreate = true } = opts;
  const credential = (withPrfResults: boolean) =>
    ({
      rawId: CRED_ID.buffer,
      getClientExtensionResults: () =>
        prfOutput
          ? {
              prf: {
                enabled: true,
                ...(withPrfResults
                  ? { results: { first: prfOutput.buffer } }
                  : {}),
              },
            }
          : {},
    }) as unknown as Credential;
  return {
    creates: 0,
    gets: 0,
    async create() {
      this.creates++;
      return credential(evalOnCreate);
    },
    async get() {
      this.gets++;
      return credential(true);
    },
  };
}

function seedPlaintextKeys(storage: MemoryStorage): void {
  storage.setItem(
    KEYS_STORAGE_KEY,
    JSON.stringify({
      kongen: "kk-live-secret-123",
      anthropic: "sk-ant-secret-456",
    }),
  );
}

const PRF_A = new Uint8Array(32).fill(7);
const PRF_B = new Uint8Array(32).fill(8); // a different authenticator secret

// ---------------------------------------------------------------------------

describe("AppLock — encrypted mode (PRF available)", () => {
  it("enable encrypts keys at rest: plaintext slot removed, ciphertext opaque", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });

    const mode = await lock.enable();

    expect(mode).toBe("encrypted");
    expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();
    const raw = storage.getItem(ENCRYPTED_KEYS_KEY)!;
    expect(raw).toBeTruthy();
    // devtools/localStorage inspection must not reveal key material
    expect(raw).not.toContain("kk-live-secret-123");
    expect(raw).not.toContain("sk-ant-secret-456");
    const blob = JSON.parse(raw);
    expect(blob.v).toBe(2); // current AAD-bound format

    expect(typeof blob.iv).toBe("string");
    expect(typeof blob.ct).toBe("string");
    // config stores only non-secret material
    const config = JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!);
    expect(config.mode).toBe("encrypted");
    expect(config.credentialId).toBe(bytesToB64(CRED_ID));
    expect(JSON.stringify(config)).not.toContain(bytesToB64(PRF_A));
  });

  it("wrap/unwrap round-trip: a fresh session unlocks and reads the keys", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    // Fresh instance = app reload; locked until the ceremony re-runs.
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    expect(lock.isUnlocked()).toBe(false);
    expect(lock.getSessionKeyStore()).toBeNull();

    await lock.unlock();
    const store = lock.getSessionKeyStore()!;
    expect(store.get("kongen")).toBe("kk-live-secret-123");
    expect(store.get("anthropic")).toBe("sk-ant-secret-456");
    // plaintext still absent at rest
    expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();
  });

  it("Safari path: PRF enabled but not evaluated at create -> follow-up get()", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const webauthn = fakeWebAuthn({ prfOutput: PRF_A, evalOnCreate: false });
    const lock = new AppLock({ storage, webauthn });

    expect(await lock.enable()).toBe("encrypted");
    expect(webauthn.gets).toBe(1); // the extra assertion that evaluated PRF

    const reload = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await reload.unlock();
    expect(reload.getSessionKeyStore()!.get("kongen")).toBe("kk-live-secret-123");
  });

  it("wrong PRF output fails decryption (AES-GCM auth) and stays locked", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_B }) });
    await expect(lock.unlock()).rejects.toThrow(/Decryption failed/);
    expect(lock.isUnlocked()).toBe(false);
    expect(lock.getSessionKeyStore()).toBeNull();
    // ciphertext untouched by the failed attempt
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeTruthy();
  });

  it("session writes re-encrypt: a new key survives lock -> unlock", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();

    const store = lock.getSessionKeyStore()!;
    store.set("openai", "sk-oai-secret-789");
    store.remove("anthropic");
    await lock.whenPersisted();
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).not.toContain("sk-oai-secret-789");
    lock.lock();
    expect(lock.getSessionKeyStore()).toBeNull();

    const reload = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await reload.unlock();
    const after = reload.getSessionKeyStore()!;
    expect(after.get("openai")).toBe("sk-oai-secret-789");
    expect(after.get("anthropic")).toBeUndefined();
    expect(after.get("kongen")).toBe("kk-live-secret-123");
  });

  it("disable restores plaintext keys and removes ciphertext + config", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();

    await lock.disable();
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeNull();
    expect(storage.getItem(APP_LOCK_CONFIG_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(KEYS_STORAGE_KEY)!)).toEqual({
      kongen: "kk-live-secret-123",
      anthropic: "sk-ant-secret-456",
    });
  });

  it("disable while locked is refused (needs the decrypted keys)", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    const locked = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(locked.disable()).rejects.toThrow(/Unlock before/);
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeTruthy();
  });
});

describe("AppLock — gate mode (no PRF) is honest", () => {
  it("falls back to gate mode and leaves keys untouched (no fake encryption)", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: null }) });

    const mode = await lock.enable();

    expect(mode).toBe("gate");
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(KEYS_STORAGE_KEY)!).kongen).toBe(
      "kk-live-secret-123",
    );
    expect(JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!).mode).toBe("gate");
  });

  it("gate unlock verifies the registered credential without touching keys", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: null }) }).enable();

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: null }) });
    expect(lock.isUnlocked()).toBe(false);
    expect(await lock.unlock()).toBe("gate");
    expect(lock.isUnlocked()).toBe(true);
    // gate mode has no session key store — keys stay on the plaintext path
    expect(lock.getSessionKeyStore()).toBeNull();
  });

  it("gate-mode copy never claims encryption; encrypted-mode copy does", () => {
    const gate = LOCK_MODE_COPY.gate.title + " " + LOCK_MODE_COPY.gate.body;
    // The explicit disclaimer is present, verbatim intent from the directive.
    expect(gate).toContain("NOT additionally encrypted");
    expect(gate).toContain("locks the app's screens");
    // No positive encryption claim anywhere in the gate copy.
    expect(gate.replace("NOT additionally encrypted", "")).not.toMatch(
      /encrypt/i,
    );

    const enc = LOCK_MODE_COPY.encrypted.body;
    expect(enc).toContain("encrypted with a key held by your device's biometric hardware");
    // v1 boundary is stated: conversations are not encrypted.
    expect(enc).toContain("Conversations are not encrypted");
  });
});

describe("AppLock — reset (recovery when the passkey is lost)", () => {
  it("wipes ciphertext + config + key slots, preserves everything else", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    // Sentinels: conversations live in IndexedDB (AppLock holds no DB
    // reference at all); other localStorage prefs must survive.
    storage.setItem("flow-local:onboarded:v1", "1");
    storage.setItem("flow-local:theme:v1", "dark");

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeTruthy();

    lock.reset();

    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeNull();
    expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(APP_LOCK_CONFIG_KEY)).toBeNull();
    expect(lock.isEnabled()).toBe(false);
    expect(lock.getSessionKeyStore()).toBeNull();
    expect(storage.getItem("flow-local:onboarded:v1")).toBe("1");
    expect(storage.getItem("flow-local:theme:v1")).toBe("dark");
    expect(storage.keys().sort()).toEqual([
      "flow-local:onboarded:v1",
      "flow-local:theme:v1",
    ]);
  });

  it("reset copy states the key wipe and the conversations boundary", () => {
    expect(RESET_COPY).toContain("wipes the API keys");
    expect(RESET_COPY).toContain("conversations are NOT touched");
  });
});

/**
 * Regression tests promoted from the security review adversarial probe
 * harness (the adversarial security review, findings F1-F3). The probes documented the
 * vulnerable behaviors; these assert the FIXED contract. Attacker model:
 * write access to localStorage (XSS-adjacent, storage restore, sync).
 */
describe("regression: security review findings F1-F3", () => {
  // F2 — silent downgrade prevention
  it("F2 DOWNGRADE: config flipped to 'gate' beside ciphertext -> unlock refuses", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    const cfg = JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!);
    cfg.mode = "gate";
    delete cfg.prfSalt;
    delete cfg.hkdfSalt;
    storage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(cfg));

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    expect(lock.integrityIssue()).toMatch(/Reset App Lock/);
    await expect(lock.unlock()).rejects.toThrow(/inconsistent/);
    expect(lock.isUnlocked()).toBe(false);
    // ciphertext untouched; enable() over the wreckage is refused too
    expect(storage.getItem(ENCRYPTED_KEYS_KEY)).toBeTruthy();
    await expect(lock.enable()).rejects.toThrow(/inconsistent/);
  });

  it("F2 DELETE-CONFIG: removing config beside ciphertext fails closed, not unlocked", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();
    storage.removeItem(APP_LOCK_CONFIG_KEY);

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    expect(lock.isUnlocked()).toBe(false); // was: silently unlocked
    expect(lock.integrityIssue()).toMatch(/inconsistent/);
    await expect(lock.unlock()).rejects.toThrow(/inconsistent/);
  });

  it("F2 AAD: tampered credentialId in config surfaces as decrypt failure", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    // Keep mode + salts valid (passes the integrity shape check) but swap
    // the credentialId — the AES-GCM additionalData binding must reject.
    const cfg = JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!);
    cfg.credentialId = bytesToB64(new Uint8Array([9, 9, 9, 9]));
    storage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(cfg));

    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(lock.unlock()).rejects.toThrow(/Decryption failed/);
    expect(lock.isUnlocked()).toBe(false);
  });

  // F3 — friendly failure on malformed ciphertext
  it("F3 MALFORMED BLOB: non-JSON / wrong-shape ciphertext -> friendly reset message", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    storage.setItem(ENCRYPTED_KEYS_KEY, "not-json{{{");
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(lock.unlock()).rejects.toThrow(/Reset App Lock/);

    storage.setItem(ENCRYPTED_KEYS_KEY, JSON.stringify({ v: 2, nonsense: true }));
    await expect(lock.unlock()).rejects.toThrow(/Reset App Lock/);
  });

  // F1a — plaintext resurrection self-heal
  it("F1a RESURRECTION: stale plaintext slot is removed on unlock", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();

    // simulate tab-B race / backup restore re-creating the plaintext slot
    storage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ kongen: "kk-live-secret-123" }));
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.unlock();
    expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull(); // healed
    expect(lock.getSessionKeyStore()!.get("kongen")).toBe("kk-live-secret-123");
  });

  it("F1a RESURRECTION: stale plaintext slot is removed on every ciphertext persist", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();

    storage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ kongen: "kk-live-secret-123" }));
    lock.getSessionKeyStore()!.set("openai", "sk-oai-new");
    await lock.whenPersisted();
    expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull(); // healed
  });

  // F1b — the plaintext fallback is refused while an encrypted lock exists
  it("F1b FACADE: no plaintext reads/writes while an encrypted lock is active", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    // Shim the window the facade resolves against (node test env).
    (globalThis as { window?: unknown }).window = { localStorage: storage };
    try {
      const facade = createDefaultKeyStore();
      // sanity: without a lock the facade serves the plaintext store
      expect(facade.get("kongen")).toBe("kk-live-secret-123");

      const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
      await lock.enable();
      // a "tab" with no unlocked session (sessionKeyStore null):
      setSessionKeyStore(null);
      expect(facade.getAll()).toEqual({}); // reads: nothing
      facade.set("openai", "sk-oai-leak"); // writes: dropped
      expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull(); // no cleartext resurrection
      // even if config is deleted, ciphertext presence keeps the block
      storage.removeItem(APP_LOCK_CONFIG_KEY);
      facade.set("openai", "sk-oai-leak-2");
      expect(storage.getItem(KEYS_STORAGE_KEY)).toBeNull();

      // an unlocked session serves keys through the same facade
      setSessionKeyStore(lock.getSessionKeyStore());
      expect(facade.get("kongen")).toBe("kk-live-secret-123");
    } finally {
      setSessionKeyStore(null);
      delete (globalThis as { window?: unknown }).window;
    }
  });

  // Already-secure behaviors from the probe harness, kept as regression
  it("TAMPERED CT: bit-flipped ciphertext fails closed", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();
    const blob = JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!);
    const ct = atob(blob.ct).split("");
    ct[0] = String.fromCharCode(ct[0].charCodeAt(0) ^ 0xff);
    blob.ct = btoa(ct.join(""));
    storage.setItem(ENCRYPTED_KEYS_KEY, JSON.stringify(blob));
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(lock.unlock()).rejects.toThrow(/Decryption failed/);
    expect(lock.isUnlocked()).toBe(false);
  });

  it("IV FRESHNESS: rapid queued session writes produce distinct IVs", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();
    const iv0 = JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!).iv;
    const store = lock.getSessionKeyStore()!;
    store.set("openai", "a");
    store.set("mistral", "b"); // queued behind the first, no await between
    await lock.whenPersisted();
    const iv2 = JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!).iv;
    expect(iv2).not.toBe(iv0);
  });
});

/**
 * Live-bug regression (Jul 16 2026): a tester enabled App Lock on the
 * pre-hardening build (v1 blobs, no AAD); the AAD hardening then failed
 * his GCM tag and misreported "passkey does not match". v2 = AAD-bound is
 * the only written format; v1 is read once (no AAD) and migrated.
 */
describe("regression: v1 -> v2 ciphertext migration (pre-AAD live blobs)", () => {
  /** Craft a blob exactly as the pre-hardening build wrote it:
   *  same HKDF (salt from config, same info string), AES-GCM WITHOUT
   *  additionalData, v:1. */
  async function writeLegacyV1Blob(storage: MemoryStorage, keys: object) {
    const cfg = JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!);
    const ikm = await crypto.subtle.importKey("raw", PRF_A, "HKDF", false, [
      "deriveKey",
    ]);
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: bytesFromB64(cfg.hkdfSalt) as BufferSource,
        info: new TextEncoder().encode("flow-local-app-lock-v1") as BufferSource,
      },
      ikm,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(keys)),
    );
    storage.setItem(
      ENCRYPTED_KEYS_KEY,
      JSON.stringify({
        v: 1,
        iv: bytesToB64(iv),
        ct: bytesToB64(new Uint8Array(ct)),
      }),
    );
  }
  function bytesFromB64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Valid encrypted config + a legacy v1 blob beside it. */
  async function legacyStore(): Promise<MemoryStorage> {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();
    await writeLegacyV1Blob(storage, {
      kongen: "kk-live-secret-123",
      anthropic: "sk-ant-secret-456",
    });
    return storage;
  }

  it("v1 blob unlocks seamlessly and is rewritten as v2 (AAD-bound)", async () => {
    const storage = await legacyStore();
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });

    await lock.unlock(); // must NOT throw (the live bug threw here)
    expect(lock.getSessionKeyStore()!.get("kongen")).toBe("kk-live-secret-123");
    await lock.whenPersisted();
    expect(JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!).v).toBe(2);

    // Prove the rewrite is genuinely AAD-bound: tamper credentialId (shape
    // stays valid) -> the NEXT unlock must fail the GCM tag.
    const cfg = JSON.parse(storage.getItem(APP_LOCK_CONFIG_KEY)!);
    cfg.credentialId = bytesToB64(new Uint8Array([9, 9, 9, 9]));
    storage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(cfg));
    const next = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(next.unlock()).rejects.toThrow(/Decryption failed/);
  });

  it("v1 blob with the wrong PRF still fails closed (true passkey mismatch)", async () => {
    const storage = await legacyStore();
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_B }) });
    await expect(lock.unlock()).rejects.toThrow(/Decryption failed/);
    expect(lock.isUnlocked()).toBe(false);
    // failed attempt must not touch/migrate the blob
    expect(JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!).v).toBe(1);
  });

  it("unknown blob version -> damaged/reset message, never passkey-mismatch", async () => {
    const storage = await legacyStore();
    const blob = JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!);
    blob.v = 3;
    storage.setItem(ENCRYPTED_KEYS_KEY, JSON.stringify(blob));
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(lock.unlock()).rejects.toThrow(/Reset App Lock/);
    await expect(lock.unlock()).rejects.not.toThrow(/passkey/);
  });

  it("fresh enables write v2 directly", async () => {
    const storage = new MemoryStorage();
    seedPlaintextKeys(storage);
    await new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) }).enable();
    expect(JSON.parse(storage.getItem(ENCRYPTED_KEYS_KEY)!).v).toBe(2);
  });
});

describe("AppLock — config plumbing", () => {
  it("idle minutes persist through the config", async () => {
    const storage = new MemoryStorage();
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await lock.enable();
    lock.setIdleMinutes(5);
    expect(lock.getConfig()!.idleMinutes).toBe(5);
    lock.setIdleMinutes(0);
    expect(lock.getConfig()!.idleMinutes).toBe(0);
  });

  it("enable twice is refused; unlock without config is refused", async () => {
    const storage = new MemoryStorage();
    const lock = new AppLock({ storage, webauthn: fakeWebAuthn({ prfOutput: PRF_A }) });
    await expect(lock.unlock()).rejects.toThrow(/not enabled/);
    await lock.enable();
    await expect(lock.enable()).rejects.toThrow(/already enabled/);
  });
});
