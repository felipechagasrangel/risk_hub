import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum } from "../../format";

type Category = { carrying: number; income: number; oci: number };
type Resp = {
  price_paid: number;
  path: { t: number; accrual: number; mtm: number }[];
  today: {
    t: number; accrual: number; mtm: number; unrealized: number;
    categories: { amortized_cost: Category; fvoci: Category; fvtpl: Category };
  };
};

const CATEGORY_LABEL: [keyof Resp["today"]["categories"], string, string][] = [
  ["amortized_cost", "Custo amortizado (CA)", "curva"],
  ["fvoci", "Valor justo em outros resultados abrangentes (VJORA)", "curva no resultado, marcação no PL"],
  ["fvtpl", "Valor justo no resultado (VJR)", "MTM no resultado"],
];

/** Laboratório de um prefixado sem cupom na curva e a mercado; opcionalmente, por categoria contábil. */
export default function BondLab({ title, showCategories = false }: { title: string; showCategories?: boolean }) {
  const [p, setP] = useState({
    face: 1_000_000, maturity_years: 3, purchase_rate: 0.13, market_rate: 0.15, shock_years: 0.5, today_years: 1,
  });
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/valuation/bond", p);

  return (
    <Lab title={title}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Título sem cupom (como uma LTN), taxas exponenciais base 252. A taxa de mercado começa igual à da compra
        e muda para a nova taxa na data do choque.
      </p>
      <div className="grid">
        <NumField label="Valor de face" value={p.face} onChange={set("face")} step={100000} />
        <NumField label="Prazo (anos)" value={p.maturity_years} onChange={set("maturity_years")} step={0.5} min={0.5} max={30} />
        <NumField label="Taxa de compra" percent value={p.purchase_rate} onChange={set("purchase_rate")} step={0.25} />
        <NumField label="Taxa de mercado após o choque" percent value={p.market_rate} onChange={set("market_rate")} step={0.25} />
        <NumField label="Choque em (anos)" value={p.shock_years} onChange={set("shock_years")} step={0.25} min={0} />
        <NumField label="Observar em (anos)" value={p.today_years} onChange={set("today_years")} step={0.25} min={0} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && <BondResults data={data} showCategories={showCategories} />}
    </Lab>
  );
}

function BondResults({ data, showCategories }: { data: Resp; showCategories: boolean }) {
  const t = data.today;
  return (
    <>
      <div className="stats">
        <Stat label="Preço pago" value={fmtMoney(data.price_paid)} />
        <Stat label={`Na curva em ${fmtNum(t.t, 2)} anos`} value={fmtMoney(t.accrual)} />
        <Stat label={`A mercado em ${fmtNum(t.t, 2)} anos`} value={fmtMoney(t.mtm)} />
        <Stat label="Marcação (MTM − curva)" value={<span className={t.unrealized < 0 ? "bad" : "good"}>{fmtMoney(t.unrealized)}</span>}
          sub="resultado não realizado" />
      </div>
      <div className="chart-title">Valor do título ao longo do tempo</div>
      <div className="chart-sub">A linha vertical marca a data de observação. As duas curvas terminam no valor de face.</div>
      <Legend items={[
        { label: "Na curva (accrual)", color: "var(--series-1)" },
        { label: "A mercado (MTM)", color: "var(--series-2)" },
      ]} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.path} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Resp["path"][number];
            return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
              { label: "Curva", value: fmtMoney(d.accrual), color: "var(--series-1)" },
              { label: "MTM", value: fmtMoney(d.mtm), color: "var(--series-2)" },
              { label: "Marcação", value: fmtMoney(d.mtm - d.accrual) },
            ]} />;
          }} />
          <ReferenceLine x={t.t} stroke="var(--text-2)" strokeDasharray="4 3" />
          <Line dataKey="accrual" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="mtm" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      {showCategories && (
        <>
          <h3>O mesmo título em cada categoria contábil</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Categoria</th><th className="num">Valor no balanço</th><th className="num">Resultado acumulado</th><th className="num">Patrimônio líquido (ORA)</th></tr></thead>
              <tbody>
                {CATEGORY_LABEL.map(([k, label, hint]) => (
                  <tr key={k}>
                    <td>{label}<br /><span className="muted" style={{ fontSize: 12 }}>{hint}</span></td>
                    <td className="num">{fmtMoney(t.categories[k].carrying)}</td>
                    <td className="num">{fmtMoney(t.categories[k].income)}</td>
                    <td className="num">{fmtMoney(t.categories[k].oci)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Sem perdas esperadas de crédito nem impostos.</p>
        </>
      )}
    </>
  );
}
