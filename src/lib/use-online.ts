/**
 * useOnline — React binding for the offline boundary (see lib/offline.ts).
 *
 * useSyncExternalStore keeps the value correct across concurrent renders and
 * gives a safe server/non-DOM snapshot (assume online) so nothing throws
 * where `navigator` is absent. The subscription is the pure `watchOnline`
 * wiring; all the framework-free logic and copy lives in lib/offline.ts.
 */

import { useSyncExternalStore } from "react";
import { browserOnlineTarget, watchOnline } from "./offline";

const target = browserOnlineTarget();

export function useOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => watchOnline(target, () => onStoreChange()),
    () => target.getOnline(),
    () => true,
  );
}
