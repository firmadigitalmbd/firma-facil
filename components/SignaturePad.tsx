"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import SignaturePadLib from "signature_pad";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
};

const SignaturePad = forwardRef<SignaturePadHandle>((_props, ref) => {
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
    return () => window.removeEventListener("resize", resize);
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => padRef.current?.clear(),
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataUrl: () => padRef.current?.toDataURL("image/png") ?? "",
  }));

  return <canvas ref={canvasRef} className="signature-canvas" />;
});

SignaturePad.displayName = "SignaturePad";

export default SignaturePad;
