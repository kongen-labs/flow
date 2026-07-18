/**
 * useCatalog — React binding for the live model catalog (see lib/models.ts).
 *
 * useSyncExternalStore subscribes to the framework-free catalog store so the
 * picker (and anything else that reads the catalog) re-renders when the
 * background /v1/models revalidation adopts a newer catalog. The snapshot is
 * getCatalog(); the server/non-DOM snapshot is the same value (the store is
 * initialised synchronously from cache-or-seed at import), so nothing throws
 * where the store hasn't refreshed yet.
 *
 * A server-added model therefore appears in the picker with NO code change:
 * refreshCatalog() adopts it, notifies subscribers, and this hook re-renders
 * consumers off the new catalog.
 */

import { useSyncExternalStore } from "react";
import { getCatalog, subscribeCatalog, type Catalog } from "./models";

export function useCatalog(): Catalog {
  return useSyncExternalStore(subscribeCatalog, getCatalog, getCatalog);
}
