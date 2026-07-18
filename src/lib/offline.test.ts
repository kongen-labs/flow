import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_BANNER_DETAIL,
  OFFLINE_BANNER_LABEL,
  OFFLINE_SEND_MESSAGE,
  canSend,
  watchOnline,
  type OnlineTarget,
} from "./offline";

describe("canSend — offline is a hard gate", () => {
  it("allows sending only when online, non-empty, and not busy", () => {
    expect(canSend({ online: true, isEmpty: false, busy: false })).toBe(true);
  });

  it("blocks sending when offline, even with text ready", () => {
    expect(canSend({ online: false, isEmpty: false, busy: false })).toBe(false);
  });

  it("blocks sending when empty or busy (existing gates preserved)", () => {
    expect(canSend({ online: true, isEmpty: true, busy: false })).toBe(false);
    expect(canSend({ online: true, isEmpty: false, busy: true })).toBe(false);
  });
});

describe("watchOnline", () => {
  function fakeTarget(initial: boolean) {
    let online = initial;
    const listeners: Record<string, Array<() => void>> = {
      online: [],
      offline: [],
    };
    const target: OnlineTarget = {
      getOnline: () => online,
      addEventListener: (type, cb) => listeners[type].push(cb),
      removeEventListener: (type, cb) => {
        listeners[type] = listeners[type].filter((c) => c !== cb);
      },
    };
    return {
      target,
      set(next: boolean) {
        online = next;
        for (const cb of listeners[next ? "online" : "offline"]) cb();
      },
      count: () => listeners.online.length + listeners.offline.length,
    };
  }

  it("fires onChange with the current value on offline then online", () => {
    const fake = fakeTarget(true);
    const onChange = vi.fn();
    watchOnline(fake.target, onChange);

    fake.set(false);
    fake.set(true);

    expect(onChange).toHaveBeenNthCalledWith(1, false);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
  });

  it("unsubscribe removes both listeners", () => {
    const fake = fakeTarget(true);
    const stop = watchOnline(fake.target, () => {});
    expect(fake.count()).toBe(2);
    stop();
    expect(fake.count()).toBe(0);
  });
});

describe("offline copy — honest, precise boundary", () => {
  it("send reason names the boundary AND reassures history is readable", () => {
    // This string substantiates the scoped marketing claim ("read your
    // conversations offline; sending needs a connection") — precision matters.
    expect(OFFLINE_SEND_MESSAGE).toBe(
      "You're offline — reconnect to send. Your conversations are here and fully readable.",
    );
    expect(OFFLINE_SEND_MESSAGE).toMatch(/reconnect to send/i);
    expect(OFFLINE_SEND_MESSAGE).toMatch(/readable/i);
  });

  it("banner states offline + read-only, no send promise", () => {
    expect(OFFLINE_BANNER_LABEL).toBe("Offline");
    expect(OFFLINE_BANNER_DETAIL).toMatch(/read/i);
    expect(`${OFFLINE_BANNER_LABEL} ${OFFLINE_BANNER_DETAIL}`).not.toMatch(
      /send/i,
    );
  });
});
