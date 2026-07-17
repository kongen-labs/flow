/**
 * AppLockGate — wraps the whole app tree (main.tsx). While locked it
 * renders the LockScreen INSTEAD of children, so no conversation or key
 * surface can mount. Provides the AppLockContext API that the settings
 * section (app-lock-settings.tsx) consumes.
 *
 * Lock triggers:
 *  - app open / reload: always starts locked when the lock is enabled
 *    (initial state below);
 *  - "Lock now" from settings (api.lockNow);
 *  - optional idle auto-lock (config.idleMinutes: 0/5/15).
 *
 * Multi-tab: a BroadcastChannel syncs "lock" and "config-changed" events
 * across tabs — NEVER key material; each tab must pass its own WebAuthn
 * ceremony to unlock. On "config-changed" other tabs re-read the config
 * and lock if the lock is enabled (e.g. tab A just enabled encrypted mode
 * and removed the plaintext keys tab B was reading — locking B forces it
 * through the PRF unlock path). Browsers without BroadcastChannel simply
 * skip the sync; correctness per-tab is unaffected.
 *
 * Key-store plumbing: on an encrypted-mode unlock, the decrypted
 * in-memory store is registered via setSessionKeyStore(); every
 * createDefaultKeyStore() facade in the app resolves it per call. Locking
 * clears the registration.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppLock, type LockMode } from "@/lib/app-lock";
import { setSessionKeyStore } from "@/lib/keys";
import { LockScreen } from "./lock-screen";

const CHANNEL_NAME = "flow-local:applock";

export interface AppLockApi {
  /** WebAuthn platform-authenticator availability in this browser. */
  supported: boolean;
  enabled: boolean;
  /** "encrypted" | "gate" when enabled, null otherwise. */
  mode: LockMode | null;
  idleMinutes: number;
  enable(): Promise<LockMode>;
  disable(): Promise<void>;
  lockNow(): void;
  setIdleMinutes(minutes: number): void;
}

const AppLockContext = createContext<AppLockApi | null>(null);

/** Null only when rendered outside the gate (tests, storybook-style). */
export function useAppLock(): AppLockApi | null {
  return useContext(AppLockContext);
}

export function AppLockGate({ children }: { children: ReactNode }) {
  const lockRef = useRef<AppLock | null>(null);
  if (!lockRef.current) {
    lockRef.current = new AppLock({
      storage: window.localStorage,
      webauthn: {
        create: (o) => navigator.credentials.create(o),
        get: (o) => navigator.credentials.get(o),
      },
    });
  }
  const lock = lockRef.current;

  // App open/reload always locks when enabled.
  const [locked, setLocked] = useState(() => lock.isEnabled());
  // Bumped on any config change so the context value re-derives.
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const channelRef = useRef<BroadcastChannel | null>(null);

  const doLock = useCallback(
    (broadcast: boolean) => {
      lock.lock();
      setSessionKeyStore(null);
      setLocked(true);
      if (broadcast) channelRef.current?.postMessage({ type: "lock" });
    },
    [lock],
  );

  // Multi-tab sync (see module header).
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent) => {
      const type = (e.data as { type?: string } | null)?.type;
      if (type === "lock" && lock.isEnabled()) doLock(false);
      if (type === "config-changed") {
        bump();
        if (lock.isEnabled()) doLock(false);
        else {
          lock.lock();
          setSessionKeyStore(null);
          setLocked(false);
        }
      }
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [lock, doLock, bump]);

  // Idle auto-lock. Cheap listeners; the timer restarts on activity.
  const idleMinutes = lock.getConfig()?.idleMinutes ?? 0;
  useEffect(() => {
    if (locked || !lock.isEnabled() || idleMinutes <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => doLock(true), idleMinutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const ev of events) window.addEventListener(ev, arm, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, arm);
    };
  }, [locked, idleMinutes, lock, doLock]);

  const handleUnlock = useCallback(async () => {
    await lock.unlock(); // user-readable errors bubble to the LockScreen
    setSessionKeyStore(lock.getSessionKeyStore()); // null in gate mode
    setLocked(false);
  }, [lock]);

  const handleReset = useCallback(() => {
    lock.reset();
    setSessionKeyStore(null);
    setLocked(false); // no lock left; first-run re-gates on the wiped keys
    bump();
    channelRef.current?.postMessage({ type: "config-changed" });
  }, [lock, bump]);

  const config = lock.getConfig();
  const api: AppLockApi = {
    supported: AppLock.isSupported(),
    enabled: config !== null,
    mode: config?.mode ?? null,
    idleMinutes: config?.idleMinutes ?? 0,
    enable: async () => {
      const mode = await lock.enable();
      // enable() leaves the session unlocked (we just proved presence).
      setSessionKeyStore(lock.getSessionKeyStore());
      bump();
      channelRef.current?.postMessage({ type: "config-changed" });
      return mode;
    },
    disable: async () => {
      await lock.disable();
      setSessionKeyStore(null);
      bump();
      channelRef.current?.postMessage({ type: "config-changed" });
    },
    lockNow: () => doLock(true),
    setIdleMinutes: (minutes: number) => {
      lock.setIdleMinutes(minutes);
      bump();
    },
  };

  // F2 (security review): an inconsistent store (ciphertext present but
  // config deleted/downgraded/mangled) fails closed into the LockScreen
  // with an explicit notice — never a silently unlocked app or gate-mode
  // unlock that would invite a plaintext key re-paste.
  const integrityIssue = lock.integrityIssue();
  if (locked || integrityIssue) {
    return (
      <LockScreen
        onUnlock={handleUnlock}
        onReset={handleReset}
        notice={integrityIssue}
      />
    );
  }

  return <AppLockContext.Provider value={api}>{children}</AppLockContext.Provider>;
}
