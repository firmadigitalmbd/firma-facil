import type { CSSProperties, ReactNode } from "react";

export type MascotKind = "syringe" | "bottle" | "capsule" | "cross" | "thermometer" | "bandage";
export type MascotMood = "happy" | "surprised" | "sad";
export type MascotMotion = "float" | "bounce" | "wiggle" | "sway" | "none";

const INK = "#2d2d3a";

function Face({
  cx,
  cy,
  scale = 1,
  mood = "happy",
}: {
  cx: number;
  cy: number;
  scale?: number;
  mood?: MascotMood;
}) {
  const dx = 10 * scale;
  const r = 4.4 * scale;
  const mouth =
    mood === "surprised" ? (
      <ellipse cx={cx} cy={cy + 11 * scale} rx={3.4 * scale} ry={4.2 * scale} fill={INK} />
    ) : mood === "sad" ? (
      <path
        d={`M${cx - 6 * scale} ${cy + 13 * scale} Q${cx} ${cy + 7 * scale} ${cx + 6 * scale} ${cy + 13 * scale}`}
        stroke={INK}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
    ) : (
      <path
        d={`M${cx - 6.5 * scale} ${cy + 7 * scale} Q${cx} ${cy + 15 * scale} ${cx + 6.5 * scale} ${cy + 7 * scale}`}
        stroke={INK}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
    );

  return (
    <g>
      <ellipse cx={cx - dx} cy={cy} rx={r} ry={r * 1.15} fill={INK} className="mascot-eye" />
      <ellipse cx={cx + dx} cy={cy} rx={r} ry={r * 1.15} fill={INK} className="mascot-eye" />
      <circle cx={cx - dx + r * 0.35} cy={cy - r * 0.45} r={r * 0.38} fill="#fff" />
      <circle cx={cx + dx + r * 0.35} cy={cy - r * 0.45} r={r * 0.38} fill="#fff" />
      <ellipse cx={cx - 17 * scale} cy={cy + 8 * scale} rx={5 * scale} ry={3 * scale} fill="#ff8fa3" opacity={0.65} />
      <ellipse cx={cx + 17 * scale} cy={cy + 8 * scale} rx={5 * scale} ry={3 * scale} fill="#ff8fa3" opacity={0.65} />
      {mouth}
    </g>
  );
}

function Art({ kind, mood }: { kind: MascotKind; mood: MascotMood }) {
  const stroke = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };

  switch (kind) {
    case "syringe":
      return (
        <g transform="rotate(14 60 60)">
          <rect x="38" y="4" width="44" height="7" rx="3.5" fill="#cfd8dc" {...stroke} />
          <rect x="56.5" y="11" width="7" height="24" fill="#cfd8dc" {...stroke} />
          <rect x="36" y="34" width="48" height="60" rx="9" fill="#fff" {...stroke} />
          <rect x="39.5" y="70" width="41" height="21" rx="6" fill="#ff5c7a" />
          <path d="M84 46h-8M84 56h-5M84 66h-8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="28" y="31" width="64" height="7" rx="3.5" fill="#cfd8dc" {...stroke} />
          <rect x="52" y="94" width="16" height="9" rx="2" fill="#90a4ae" {...stroke} />
          <path d="M60 103v14" stroke="#78909c" strokeWidth="3.4" strokeLinecap="round" />
          <Face cx={60} cy={54} scale={0.95} mood={mood} />
        </g>
      );
    case "bottle":
      return (
        <g>
          <rect x="33" y="6" width="54" height="19" rx="5" fill="#e4032e" {...stroke} />
          <path d="M42 10v11M52 10v11M62 10v11M72 10v11" stroke="#b8021f" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="39" y="25" width="42" height="8" fill="#ffb347" {...stroke} />
          <rect x="29" y="32" width="62" height="78" rx="13" fill="#ffb347" {...stroke} />
          <rect x="35" y="40" width="6" height="52" rx="3" fill="#fff" opacity="0.4" />
          <rect x="36" y="48" width="48" height="52" rx="7" fill="#fff" {...stroke} />
          <path d="M60 54v12M54 60h12" stroke="#e4032e" strokeWidth="4.5" strokeLinecap="round" />
          <Face cx={60} cy={82} scale={0.85} mood={mood} />
        </g>
      );
    case "capsule":
      return (
        <g transform="rotate(-32 60 60)">
          <path d="M60 38H37a22 22 0 0 0 0 44H60Z" fill="#e4032e" />
          <path d="M60 38h23a22 22 0 0 1 0 44H60Z" fill="#fff" />
          <rect x="15" y="38" width="90" height="44" rx="22" fill="none" {...stroke} />
          <path d="M60 38v44" stroke={INK} strokeWidth="2.6" />
          <path d="M26 46Q31 42 38 42" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.8" />
          <Face cx={60} cy={56} scale={0.9} mood={mood} />
        </g>
      );
    case "cross":
      return (
        <g>
          <rect x="14" y="40" width="92" height="40" rx="12" fill={INK} stroke={INK} strokeWidth="9" strokeLinejoin="round" />
          <rect x="40" y="14" width="40" height="92" rx="12" fill={INK} stroke={INK} strokeWidth="9" strokeLinejoin="round" />
          <rect x="14" y="40" width="92" height="40" rx="12" fill="#e4032e" />
          <rect x="40" y="14" width="40" height="92" rx="12" fill="#e4032e" />
          <path d="M22 50Q24 46 30 46M48 22Q50 20 56 20" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity="0.7" />
          <Face cx={60} cy={56} scale={1} mood={mood} />
        </g>
      );
    case "thermometer":
      return (
        <g transform="rotate(10 60 60)">
          <rect x="46" y="6" width="28" height="78" rx="14" fill="#fff" {...stroke} />
          <rect x="55.5" y="30" width="9" height="56" rx="4.5" fill="#ff5c7a" />
          <circle cx="60" cy="92" r="21" fill="#ff5c7a" {...stroke} />
          <path d="M78 22h8M78 32h5M78 42h8M78 52h5M78 62h8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M50 18v22" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          <Face cx={60} cy={89} scale={0.8} mood={mood} />
        </g>
      );
    case "bandage":
      return (
        <g transform="rotate(-24 60 60)">
          <rect x="8" y="38" width="104" height="44" rx="22" fill="#f6c9a0" {...stroke} />
          <rect x="38" y="38" width="44" height="44" fill="#fde7c8" {...stroke} />
          <circle cx="20" cy="54" r="2.2" fill="#e0a877" />
          <circle cx="20" cy="66" r="2.2" fill="#e0a877" />
          <circle cx="30" cy="60" r="2.2" fill="#e0a877" />
          <circle cx="100" cy="54" r="2.2" fill="#e0a877" />
          <circle cx="100" cy="66" r="2.2" fill="#e0a877" />
          <circle cx="90" cy="60" r="2.2" fill="#e0a877" />
          <Face cx={60} cy={56} scale={0.85} mood={mood} />
        </g>
      );
  }
}

export function Mascot({
  kind,
  size = 96,
  mood = "happy",
  motion = "float",
  delay = 0,
  className = "",
}: {
  kind: MascotKind;
  size?: number;
  mood?: MascotMood;
  motion?: MascotMotion;
  delay?: number;
  className?: string;
}) {
  const style = { width: size, height: size, "--d": `${delay}s` } as CSSProperties;
  return (
    <span
      className={`mascot${motion === "none" ? "" : ` mascot-${motion}`} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%" overflow="visible">
        <Art kind={kind} mood={mood} />
      </svg>
    </span>
  );
}

export function EmptyState({
  kind = "bottle",
  mood = "happy",
  children,
}: {
  kind?: MascotKind;
  mood?: MascotMood;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Mascot kind={kind} size={108} mood={mood} motion="float" />
      <p className="empty-state-text">{children}</p>
    </div>
  );
}

export function Loading({ children = "Cargando..." }: { children?: ReactNode }) {
  return (
    <div className="loading-state" role="status">
      <Mascot kind="capsule" size={72} motion="bounce" />
      <p className="empty-state-text">{children}</p>
    </div>
  );
}

export function MascotRow({ kinds, size = 56 }: { kinds: MascotKind[]; size?: number }) {
  return (
    <div className="mascot-row">
      {kinds.map((kind, i) => (
        <Mascot
          key={kind}
          kind={kind}
          size={size}
          motion={i % 2 ? "wiggle" : "float"}
          delay={i * 0.4}
        />
      ))}
    </div>
  );
}
