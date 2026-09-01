import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSyncState, requestSync, setSyncShop, startSyncEngine, subscribeLocalData, subscribeSync, type SyncState } from "./sync";
import { isBrowser } from "./db";

const serverState: SyncState = {
  online: true,
  status: "online",
  pending: 0,
  conflicts: 0,
  lastSyncAt: null,
  lastError: null,
};

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, () => serverState);
}

/**
 * Boots the offline engine for the signed-in shop: starts the network watcher,
 * performs the first synchronisation and refreshes React Query whenever the
 * local IndexedDB mirror changes.
 */
export function OfflineProvider({ shopId, children }: { shopId: string | null; children: ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isBrowser()) return;
    startSyncEngine();
    const unsub = subscribeLocalData(() => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    });
    return () => { unsub(); };
  }, [qc]);

  useEffect(() => {
    if (!isBrowser() || !shopId) return;
    setSyncShop(shopId);
    void requestSync();
  }, [shopId]);

  return <>{children}</>;
}
