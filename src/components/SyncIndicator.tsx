import { CloudOff, Cloud, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSyncState } from "@/lib/offline/OfflineProvider";
import { requestSync } from "@/lib/offline/sync";
import { cn } from "@/lib/utils";

export function SyncIndicator({ className }: { className?: string }) {
  const { status, pending, lastError } = useSyncState();

  const config = {
    offline: {
      label: pending > 0 ? `Hors ligne · ${pending} en attente` : "Hors ligne",
      icon: CloudOff,
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    },
    syncing: {
      label: "Synchronisation…",
      icon: RefreshCw,
      cls: "bg-sky-500/15 text-sky-700 border-sky-500/30",
    },
    synced: {
      label: "Synchronisé",
      icon: CheckCircle2,
      cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    },
    error: {
      label: "Erreur de synchro",
      icon: AlertTriangle,
      cls: "bg-destructive/15 text-destructive border-destructive/30",
    },
    online: {
      label: pending > 0 ? `En ligne · ${pending} en attente` : "En ligne",
      icon: Cloud,
      cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
    },
  }[status];

  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => void requestSync()}
      title={lastError ?? "Synchroniser maintenant"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        config.cls,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "syncing" && "animate-spin")} />
      {config.label}
    </button>
  );
}
