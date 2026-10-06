// Equipment pictograms for the plant diagram (decorative: every value they stand for is also text).
// Drawn as line art in the theme tokens instead of vendor photos, so they scale, theme and
// carry no third-party image rights. Fans and impellers turn while the machine runs
// (stopped by prefers-reduced-motion through the global motion rule).

import { cn } from "@/lib/utils";

const STROKE = "var(--muted-foreground)";
const BODY = "var(--card)";
const ACCENT = "var(--primary)";

function Rotor({ cx, cy, r, running, blades = 3 }: { cx: number; cy: number; r: number; running: boolean; blades?: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className={cn("origin-center [transform-box:fill-box]", running && "animate-spin [animation-duration:2.2s]")}>
        <circle r={r} fill="transparent" />
        {Array.from({ length: blades }).map((_, i) => (
          <path
            key={i}
            d={`M0 0 C ${r * 0.35} ${-r * 0.3}, ${r * 0.85} ${-r * 0.2}, ${r * 0.92} ${r * 0.22} C ${r * 0.5} ${r * 0.28}, ${r * 0.2} ${r * 0.18}, 0 0 Z`}
            transform={`rotate(${(360 / blades) * i})`}
            fill={STROKE}
            opacity={0.85}
          />
        ))}
      </g>
      <circle r={r * 0.18} fill={ACCENT} />
    </g>
  );
}

export function ChillerArt({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden className={className}>
      <rect x="8" y="10" width="144" height="76" rx="6" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      {[48, 112].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="36" r="21" fill="var(--muted)" stroke={STROKE} strokeWidth="1.5" />
          <Rotor cx={cx} cy={36} r={17} running={running} />
        </g>
      ))}
      {[64, 70, 76].map((y) => (
        <line key={y} x1="16" y1={y} x2="144" y2={y} stroke={STROKE} strokeWidth="1" opacity="0.6" />
      ))}
      {Array.from({ length: 16 }).map((_, i) => (
        <line key={i} x1={20 + i * 8} y1="60" x2={20 + i * 8} y2="80" stroke={STROKE} strokeWidth="0.75" opacity="0.4" />
      ))}
      <rect x="18" y="86" width="14" height="6" rx="1" fill={STROKE} />
      <rect x="128" y="86" width="14" height="6" rx="1" fill={STROKE} />
    </svg>
  );
}

export function AirHandlerArt({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden className={className}>
      <rect x="6" y="22" width="148" height="56" rx="4" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      {[16, 22, 28, 34].map((x) => (
        <line key={x} x1={x} y1="30" x2={x} y2="70" stroke={STROKE} strokeWidth="1.25" opacity="0.7" />
      ))}
      <rect x="44" y="30" width="12" height="40" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="3 2" opacity="0.8" />
      <path d="M64 30 L72 36 L64 42 L72 48 L64 54 L72 60 L64 66 L72 70" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <circle cx="112" cy="50" r="20" fill="var(--muted)" stroke={STROKE} strokeWidth="1.5" />
      <Rotor cx={112} cy={50} r={16} running={running} blades={4} />
      <path d="M140 44 L150 50 L140 56" fill="none" stroke={STROKE} strokeWidth="1.5" />
      <rect x="14" y="78" width="12" height="6" rx="1" fill={STROKE} />
      <rect x="134" y="78" width="12" height="6" rx="1" fill={STROKE} />
    </svg>
  );
}

export function PumpArt({ running, className }: { running: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden className={className}>
      <rect x="12" y="84" width="136" height="8" rx="2" fill={STROKE} opacity="0.8" />
      <rect x="36" y="12" width="16" height="16" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      <circle cx="44" cy="54" r="26" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      <Rotor cx={44} cy={54} r={17} running={running} blades={5} />
      <rect x="70" y="50" width="8" height="10" fill={STROKE} />
      <rect x="78" y="34" width="62" height="42" rx="6" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      {[88, 96, 104, 112, 120, 128].map((x) => (
        <line key={x} x1={x} y1="38" x2={x} y2="72" stroke={STROKE} strokeWidth="1" opacity="0.6" />
      ))}
      <rect x="96" y="26" width="22" height="8" rx="1" fill={ACCENT} opacity="0.9" />
    </svg>
  );
}

export function PanelArt({ online, className }: { online: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden className={className}>
      <rect x="50" y="4" width="60" height="90" rx="3" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      {[66, 94].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="22" r="9" fill="var(--muted)" stroke={STROKE} strokeWidth="1.25" />
          <line x1={cx} y1="22" x2={cx + 5} y2="17" stroke={ACCENT} strokeWidth="1.5" />
        </g>
      ))}
      {[60, 70, 80, 90, 100].map((cx, i) => (
        <circle key={cx} cx={cx} cy="44" r="3" fill={online && i < 3 ? ACCENT : "var(--muted)"} stroke={STROKE} strokeWidth="1" />
      ))}
      {[62, 80, 98].map((cx) => (
        <rect key={cx} x={cx - 4} y="56" width="8" height="12" rx="1.5" fill="var(--muted)" stroke={STROKE} strokeWidth="1" />
      ))}
      <rect x="102" y="74" width="3" height="12" rx="1" fill={STROKE} />
    </svg>
  );
}

export function MeterArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <rect x="12" y="10" width="76" height="80" rx="6" fill={BODY} stroke={STROKE} strokeWidth="1.5" />
      <rect x="22" y="20" width="56" height="38" rx="2" fill="var(--muted)" stroke={STROKE} strokeWidth="1" />
      {[29, 38, 47].map((y, i) => (
        <rect key={y} x="28" y={y} width={i === 0 ? 34 : i === 1 ? 26 : 30} height="4" rx="1" fill={ACCENT} opacity={0.9 - i * 0.2} />
      ))}
      {[28, 42, 58, 72].map((cx) => (
        <circle key={cx} cx={cx} cy="74" r="5" fill="var(--muted)" stroke={STROKE} strokeWidth="1" />
      ))}
    </svg>
  );
}
