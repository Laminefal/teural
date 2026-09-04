import { Suspense, lazy } from "react";

const BarcodeScannerImpl = lazy(() =>
  import("./BarcodeScanner").then((m) => ({ default: m.BarcodeScanner })),
);

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

/** Charge la librairie de scan (~450 Ko) uniquement à l'ouverture du scanner. */
export function LazyBarcodeScanner({ open, onClose, onDetected }: Props) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <BarcodeScannerImpl open={open} onClose={onClose} onDetected={onDetected} />
    </Suspense>
  );
}
