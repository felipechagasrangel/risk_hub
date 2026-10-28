export type Column<R> = {
  key: keyof R & string;
  label: string;
  type: "text" | "number" | "percent" | "select" | "check";
  options?: [string, string][];
  width?: number;
};

type Props<R> = {
  columns: Column<R>[];
  rows: R[];
  onChange: (rows: R[]) => void;
  newRow: () => R;
  /** Colunas calculadas pela API, mostradas à direita (somente leitura). */
  computed?: { label: string; values: (string | number)[] }[];
};

/** Tabela editável usada nos laboratórios para montar carteiras, balanços e fluxos. */
export function EditableTable<R extends Record<string, unknown>>(
  { columns, rows, onChange, newRow, computed = [] }: Props<R>,
) {
  const update = (i: number, key: string, value: unknown) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.type === "text" || c.type === "check" ? "" : "num"} style={{ width: c.width }}>
                {c.label}{c.type === "percent" && " (%)"}
              </th>
            ))}
            {computed.map((c) => <th key={c.label} className="num">{c.label}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key}>{cell(c, row[c.key], (v) => update(i, c.key, v))}</td>
              ))}
              {computed.map((c) => <td key={c.label} className="num">{c.values[i] ?? ""}</td>)}
              <td>
                <button className="link" title="Remover linha"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ marginTop: 8 }} onClick={() => onChange([...rows, newRow()])}>+ Adicionar linha</button>
    </div>
  );
}

function cell<R>(c: Column<R>, value: unknown, set: (v: unknown) => void) {
  if (c.type === "text") {
    return <input value={String(value)} onChange={(e) => set(e.target.value)} />;
  }
  if (c.type === "check") {
    return <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} style={{ width: "auto" }} />;
  }
  if (c.type === "select") {
    return (
      <select value={String(value)} onChange={(e) => set(e.target.value)}>
        {c.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  const k = c.type === "percent" ? 100 : 1;
  return (
    <input
      type="number"
      style={{ textAlign: "right" }}
      value={Number(((value as number) * k).toFixed(6))}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) set(v / k);
      }}
    />
  );
}
