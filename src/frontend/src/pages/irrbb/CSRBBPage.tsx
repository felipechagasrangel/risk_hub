import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Rating = "AAA" | "AA" | "A" | "BBB" | "BB";
type Bond = { name: string; rating: Rating; notional: number; coupon: number; maturity: number; spread: number; accounting: "vjora" | "custo"; swapped: boolean };
type Resp = {
  bonds: (Bond & { value: number; price: number; spread_duration: number; spread_shock_bps: number; dv_spread: number; dv_rate: number; dv_both: number; dv_hedged: number; cs01: number })[];
  totals: { value: number; cs01: number; eve_spread: number; eve_rate: number; eve_both: number; eve_hedged: number; oci_spread: number; oci_hedged: number };
  pct_tier1: { eve_hedged: number; oci_hedged: number };
};

const RATINGS: Rating[] = ["AAA", "AA", "A", "BBB", "BB"];
const mi = (v: number) => `${fmtNum(v, 1)} mi`;

export default function CSRBBPage() {
  return (
    <>
      <h1>CSRBB: spread de crédito na carteira bancária</h1>
      <p className="lead">
        Um título privado na carteira bancária perde valor quando os juros sobem — isso é IRRBB. Mas também perde quando o
        mercado passa a exigir mais prêmio pelo risco do emissor, mesmo com os juros parados. Esse é o CSRBB, que Basileia
        pede para monitorar junto com o IRRBB.
      </p>

      <h2>1. Taxa livre de risco + spread</h2>
      <Formula tex={String.raw`P = \sum_{k} \frac{c\,\Delta t_k}{(1 + r_f + s)^{t_k}} + \frac{1}{(1 + r_f + s)^{T}}, \qquad \Delta P \approx -D_s\,P\,\Delta s`} where={[
        [String.raw`P`, "preço por 1 de face"],
        [String.raw`c`, "cupom anual"],
        [String.raw`r_f`, "taxa livre de risco (curva de juros, fator do IRRBB)"],
        [String.raw`s`, "spread de crédito do emissor (fator do CSRBB)"],
        [String.raw`D_s`, "spread duration: sensibilidade percentual do preço ao spread"],
        [String.raw`\Delta s`, "choque de spread, aqui por rating"],
      ]} />
      <p>
        O CS01 é o análogo do DV01: quanto a carteira perde se todos os spreads abrem 1 bp. Num título prefixado, a spread
        duration é quase igual à duration de juros; num título pós-fixado (CDI + spread), a duration de juros é quase zero, mas a
        de spread continua sendo o prazo do papel.
      </p>
      <CodeSnippet name="bond_price" />
      <CodeSnippet name="spread_duration" />

      <h2>2. Onde a perda aparece</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Classificação contábil</th><th>Efeito do spread</th></tr></thead>
          <tbody>
            <tr><td>Valor justo em outros resultados abrangentes (VJORA)</td><td>no patrimônio, pelo ORA, na hora — e portanto no Capital Principal</td></tr>
            <tr><td>Custo amortizado</td><td>não passa pelo balanço; aparece só no valor econômico (EVE) e, se o emissor piorar, na <Link to="/credito/perda-esperada">perda esperada</Link></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Um swap de juros (asset swap) troca o prefixado por CDI e protege a parte de juros. A parte de spread continua
        com o banco: é comum uma carteira “hedgeada” perder valor numa crise de crédito.
      </p>

      <h2>3. Laboratório</h2>
      <CSRBBLab />
      <Callout title="O que observar">
        <ul>
          <li>A debênture com swap fica neutra a juros, mas perde quase o mesmo que as outras quando o spread abre.</li>
          <li>Os papéis de rating menor têm choque maior e, em geral, prazo maior: concentram a perda mesmo sendo uma parte pequena da carteira.</li>
          <li>Compare ORA e EVE: a mesma perda econômica aparece no capital só para o que está em VJORA.</li>
          <li>Ligue choque de juros e de spread juntos: os efeitos se somam, mas não exatamente (convexidade). É por isso que se reprecifica em vez de usar só as durations.</li>
          <li>Veja a <Link to="/fundamentos/contabil">página de contabilidade</Link> para as classificações de VJR, VJORA e custo amortizado.</li>
        </ul>
      </Callout>
    </>
  );
}

function CSRBBLab() {
  const [p, setP] = useState({ risk_free: 0.135, severity: 1, rate_shock_bps: 200, tier1: 1_200 });
  const [shocks, setShocks] = useState<Record<Rating, number>>({ AAA: 50, AA: 80, A: 120, BBB: 200, BB: 350 });
  const [bonds, setBonds] = useState<Bond[]>([
    { name: "LF de banco grande", rating: "AAA", notional: 400, coupon: 0.145, maturity: 3, spread: 0.008, accounting: "custo", swapped: false },
    { name: "Debênture de energia", rating: "AA", notional: 300, coupon: 0.152, maturity: 5, spread: 0.012, accounting: "vjora", swapped: false },
    { name: "CRI residencial", rating: "AA", notional: 100, coupon: 0.16, maturity: 6, spread: 0.02, accounting: "custo", swapped: false },
    { name: "Debênture de varejo", rating: "A", notional: 200, coupon: 0.165, maturity: 4, spread: 0.025, accounting: "vjora", swapped: true },
    { name: "Bond corporativo", rating: "BBB", notional: 150, coupon: 0.18, maturity: 7, spread: 0.04, accounting: "vjora", swapped: false },
  ]);
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/irrbb/csrbb", { ...p, spread_shocks: shocks, bonds });

  return (
    <Lab title="Carteira de títulos privados na carteira bancária (R$ milhões)">
      <div className="grid">
        <NumField label="Taxa livre de risco" percent value={p.risk_free} onChange={set("risk_free")} step={0.25} />
        <NumField label="Choque de juros (bps)" value={p.rate_shock_bps} onChange={set("rate_shock_bps")} step={50} />
        <NumField label="Severidade do choque de spread" value={p.severity} onChange={set("severity")} step={0.25} min={0} max={5} hint="1 = tabela abaixo" />
        <NumField label="Nível I" value={p.tier1} onChange={set("tier1")} step={50} min={1} />
      </div>
      <h3>Choque de spread por rating (bps)</h3>
      <div className="grid">
        {RATINGS.map((r) => <NumField key={r} label={r} value={shocks[r]} onChange={(v) => setShocks({ ...shocks, [r]: v })} step={10} min={0} />)}
      </div>
      <EditableTable<Bond> rows={bonds} onChange={setBonds}
        newRow={() => ({ name: "Novo título", rating: "A", notional: 100, coupon: 0.16, maturity: 3, spread: 0.02, accounting: "vjora", swapped: false })}
        columns={[
          { key: "name", label: "Título", type: "text", width: 190 },
          { key: "rating", label: "Rating", type: "select", width: 76, options: RATINGS.map((r) => [r, r]) },
          { key: "notional", label: "Face", type: "number", width: 76 },
          { key: "coupon", label: "Cupom", type: "percent", width: 70 },
          { key: "maturity", label: "Prazo (anos)", type: "number", width: 76 },
          { key: "spread", label: "Spread", type: "percent", width: 70 },
          { key: "accounting", label: "Contábil", type: "select", width: 110, options: [["vjora", "VJORA"], ["custo", "Custo amortizado"]] },
          { key: "swapped", label: "Swap", type: "check", width: 50 },
        ]}
        computed={data ? [
          { label: "Spread duration", values: data.bonds.map((b) => fmtNum(b.spread_duration, 2)) },
          { label: "CS01", values: data.bonds.map((b) => fmtNum(b.cs01, 3)) },
        ] : []} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Valor da carteira" value={mi(data.totals.value)} sub={`CS01: ${fmtNum(data.totals.cs01, 3)} mi/bp`} />
            <Stat label="ΔEVE só spread" value={mi(data.totals.eve_spread)} />
            <Stat label="ΔEVE juros + spread, com hedge" value={mi(data.totals.eve_hedged)} sub={`${fmtPct(data.pct_tier1.eve_hedged, 1)} do Nível I`} />
            <Stat label="ΔORA (VJORA), com hedge" value={mi(data.totals.oci_hedged)} sub={`${fmtPct(data.pct_tier1.oci_hedged, 1)} do Nível I`} />
          </div>
          <div className="chart-title">Perda por título: juros × spread</div>
          <Legend items={[
            { label: "Choque de juros", color: "var(--series-1)", box: true }, { label: "Choque de spread", color: "var(--series-3)", box: true },
            { label: "Ambos, depois do swap", color: "var(--series-2)", box: true },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.bonds} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis {...axisProps} width={44} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={payload[0].payload.name} rows={[
                  { label: "Juros", value: mi(payload[0].payload.dv_rate), color: "var(--series-1)" },
                  { label: `Spread (+${fmtNum(payload[0].payload.spread_shock_bps, 0)} bps)`, value: mi(payload[0].payload.dv_spread), color: "var(--series-3)" },
                  { label: "Ambos, com hedge", value: mi(payload[0].payload.dv_hedged), color: "var(--series-2)" },
                ]} />
              ) : null} />
              <Bar dataKey="dv_rate" fill="var(--series-1)" radius={[0, 0, 3, 3]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="dv_spread" fill="var(--series-3)" radius={[0, 0, 3, 3]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="dv_hedged" fill="var(--series-2)" radius={[0, 0, 3, 3]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
