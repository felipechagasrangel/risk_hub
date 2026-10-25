import katex from "katex";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";

/** Fórmula em LaTeX renderizada com KaTeX. */
export function Formula({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const html = katex.renderToString(tex, { displayMode: !inline, throwOnError: false });
  return inline
    ? <span dangerouslySetInnerHTML={{ __html: html }} />
    : <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />;
}

export const M = ({ children }: { children: string }) => <Formula tex={children} inline />;

type NumFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Mostra e edita o valor em % (o estado guarda o decimal). */
  percent?: boolean;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
};

export function NumField({ label, value, onChange, percent, step, min, max, hint }: NumFieldProps) {
  const k = percent ? 100 : 1;
  return (
    <label className="field">
      {label}{percent && " (%)"}
      <input
        type="number"
        value={Number((value * k).toFixed(6))}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v / k);
        }}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="callout"><strong>{title}</strong>{children}</div>;
}

export function Lab({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card lab"><div className="lab-title">🧪 {title}</div>{children}</div>;
}

export type LegendItem = { label: string; color: string; box?: boolean };

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className={`swatch${i.box ? " box" : ""}`} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

type Status = "verde" | "amarela" | "vermelha" | "n/a";
const STATUS: Record<Status, { color: string; icon: string }> = {
  verde: { color: "var(--good)", icon: "✓" },
  amarela: { color: "var(--warning)", icon: "!" },
  vermelha: { color: "var(--critical)", icon: "✕" },
  "n/a": { color: "var(--muted)", icon: "–" },
};

export function StatusBadge({ zone }: { zone: Status }) {
  const s = STATUS[zone];
  return (
    <span className="badge">
      <span className="dot" style={{ background: s.color }} />{s.icon} Zona {zone}
    </span>
  );
}

export function PassBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="badge">
      <span className="dot" style={{ background: ok ? "var(--good)" : "var(--critical)" }} />
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}
