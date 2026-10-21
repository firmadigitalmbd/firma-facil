"use client";

import { Mascot, type MascotKind, type MascotMotion } from "@/components/Mascots";

type Item = {
  kind: MascotKind;
  side: "left" | "right";
  top: number;
  size: number;
  motion: MascotMotion;
  delay: number;
};

// Muñequitos en los márgenes laterales de la pantalla, que quedan vacíos
// en computadores. Solo se muestran con pantallas anchas (ver .page-decor
// en globals.css) para no estorbar en el celular.
const ITEMS: Item[] = [
  { kind: "syringe", side: "left", top: 17, size: 92, motion: "sway", delay: 0 },
  { kind: "thermometer", side: "left", top: 45, size: 84, motion: "float", delay: 0.8 },
  { kind: "bandage", side: "left", top: 73, size: 90, motion: "wiggle", delay: 1.6 },
  { kind: "bottle", side: "right", top: 19, size: 92, motion: "float", delay: 0.4 },
  { kind: "capsule", side: "right", top: 47, size: 90, motion: "bounce", delay: 1.2 },
  { kind: "cross", side: "right", top: 75, size: 84, motion: "sway", delay: 2 },
];

export default function PageDecor() {
  return (
    <div className="page-decor" aria-hidden="true">
      {ITEMS.map((it) => (
        <div
          key={it.kind}
          className={`page-decor-item page-decor-${it.side}`}
          style={{ top: `${it.top}vh` }}
        >
          <Mascot kind={it.kind} size={it.size} motion={it.motion} delay={it.delay} />
        </div>
      ))}
    </div>
  );
}
