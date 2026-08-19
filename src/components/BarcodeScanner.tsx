import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!back) throw new Error("Aucune caméra détectée");
        if (cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result) => {
            if (result) {
              const text = result.getText();
              controls.stop();
              onDetected(text);
            }
          },
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'accès à la caméra");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Scanner un code-barres</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!starting && !error && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Placez le code-barres devant la caméra. Sur mobile, la caméra arrière est utilisée.
        </p>
        <Button className="w-full sm:w-auto" variant="outline" onClick={onClose}><X className="h-4 w-4" /> Annuler</Button>
      </DialogContent>
    </Dialog>
  );
}
