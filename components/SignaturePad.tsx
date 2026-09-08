"use client";

import { useEffect, useRef } from "react";
import SignaturePadLib from "signature_pad";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
};

// No usamos forwardRef/useImperativeHandle aquí porque next/dynamic con
// ssr:false no reenvía refs de forma confiable; en su lugar avisamos al
// padre con un callback cuando el pad está listo.
export default function SignaturePad({
  onReady,
}: {
  onReady: (handle: SignaturePadHandle) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * ratio;
      canvas!.height = rect.height * ratio;
      const ctx = canvas!.getContext("2d");
      ctx?.scale(ratio, ratio);
      padRef.current?.clear();
    }

    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgba(255,255,255,1)",
      penColor: "rgb(15,23,42)",
    });

    resize();
    window.addEventListener("resize", resize);

    onReady({
      clear: () => padRef.current?.clear(),
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataUrl: () => padRef.current?.toDataURL("image/png") ?? "",
    });

    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="signature-canvas" />;
}
