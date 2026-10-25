import type { ReactNode } from "react";

/** Props comuns de eixos e grade: discretos, para o dado aparecer primeiro. */
export const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--muted)", fontSize: 12 },
  tickLine: false,
} as const;

export const gridProps = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;

type Row = { label: string; value: string; color?: string };

/** Conteúdo de tooltip padronizado; o texto fica na cor de tinta, a cor só no marcador. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: Row[] }) {
  return (
    <div className="tooltip">
      <div className="t-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label}>
          {r.color && (
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: r.color, marginRight: 6 }} />
          )}
          {r.label}: <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}
