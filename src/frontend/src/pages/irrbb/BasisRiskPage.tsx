import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";
import { DEFAULT_ITEMS, type IndexedItem, itemColumns, newItem } from "./indexedItems";

type Delta = { name: string; indexer: string; delta: number };
type Resp = {
  base_nii: number;
  sweep: { shock_bps: number; selic_final: number; nii: number; delta_nii: number }[];
  rates: { selic: number; cdi: number; tr: number; poupanca: number }[];
  selic_shock: { bps: number; items: Delta[] };
  ipca_shock: { bps: number; items: Delta[] };
  current: { cdi: number; tr: number; poupanca: number };
};

export default function BasisRiskPage() {
  return (
    <>
      <h1>Risco de base e indexadores brasileiros</h1>
      <p className="lead">
        O <Link to="/irrbb">gap de repricing</Link> trata todo pós-fixado como se andasse junto. No Brasil, ativos e passivos
        se indexam a coisas diferentes — CDI, Selic, TR, poupança, IPCA — que não se movem na mesma proporção. Esse
        descasamento entre indexadores é o risco de base.
      </p>

      <h2>1. Os indexadores</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Indexador</th><th>Como se move com a Selic</th><th>Onde aparece</th></tr></thead>
          <tbody>
            <tr><td>Selic</td><td>é a própria meta do Copom</td><td>LFT, compromissadas, reservas</td></tr>
            <tr><td>CDI</td><td>colado na Selic (cerca de 0,10 p.p. abaixo)</td><td>CDB, crédito pós, swaps DI</td></tr>
            <tr><td>TR</td><td>só aparece com Selic alta, e bem menor</td><td>poupança, crédito imobiliário, FGTS</td></tr>
            <tr><td>Poupança</td><td>regra que muda de regime em 8,5%</td><td>principal funding de varejo do crédito imobiliário</td></tr>
            <tr><td>IPCA</td><td>inflação: segue a Selic com defasagem e às vezes em sentido oposto</td><td>NTN-B, debêntures incentivadas, crédito rural e imobiliário</td></tr>
          </tbody>
        </table>
      </div>
      <Formula tex={String.raw`r_{\text{poup}} = \begin{cases} 0{,}5\%\ \text{a.m.} + \text{TR}, & \text{Selic} > 8{,}5\% \\ 70\% \times \text{Selic} + \text{TR}, & \text{Selic} \le 8{,}5\% \end{cases}`} where={[
        [String.raw`r_{\text{poup}}`, "remuneração da poupança (regra da Lei 12.703/2012)"],
        [String.raw`\text{TR}`, "Taxa Referencial; aqui aproximada por 0,35 × (Selic − 8%), com piso zero — a TR de verdade sai da TBF com um redutor"],
      ]} />
      <p>
        Acima de 8,5%, a poupança fica praticamente fixa em ~6,2% + TR, enquanto o CDI acompanha a Selic. Abaixo, ela passa a
        acompanhar 70% da Selic. Para o banco que financia crédito imobiliário (TR + spread) com poupança, o spread entre o
        ativo e o passivo muda de comportamento conforme o regime: é uma não linearidade escondida no balanço.
      </p>
      <CodeSnippet name="poupanca" />
      <CodeSnippet name="tr" />

      <h2>2. Medindo o risco de base no ΔNII</h2>
      <p>
        A margem financeira é projetada mês a mês. Cada posição rende pelo seu indexador; a Selic chega ao novo nível em
        degraus, nas reuniões do Copom; os prefixados renovam aos poucos a taxa de mercado. O choque de IPCA vem
        separado, com a Selic parada: é o descasamento puro entre inflação e juros.
      </p>
      <CodeSnippet name="project_nii" />

      <h2>3. Laboratório</h2>
      <BasisLab />
      <Callout title="O que observar">
        <ul>
          <li>A curva de ΔNII × Selic muda de inclinação perto de 8,5%: abaixo disso, a poupança passa a cair junto com a Selic e o banco perde menos com cortes.</li>
          <li>Crédito imobiliário em TR financiado por poupança: com Selic alta, a TR sobe e os dois lados andam juntos; o risco aparece na mudança de regime.</li>
          <li>Um ativo em IPCA financiado por CDB em CDI é um swap IPCA × DI dentro do balanço: o choque de inflação mexe na margem sem mexer nos juros.</li>
          <li>Depósitos à vista não pagam nada: com Selic alta, ganham valor como funding; numa queda de juros, essa “margem de passivo” encolhe.</li>
        </ul>
      </Callout>
    </>
  );
}

function BasisLab() {
  const [p, setP] = useState({ selic: 0.14, ipca: 0.045, ramp_months: 6, shock_bps: 300, ipca_shock_bps: 200 });
  const [items, setItems] = useState<IndexedItem[]>(DEFAULT_ITEMS);
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/irrbb/basis", { ...p, items });

  const deltaChart = (rows: Delta[], color: string) => (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 26 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" {...axisProps} />
        <YAxis type="category" dataKey="name" width={170} {...axisProps} tick={{ fill: "var(--muted)", fontSize: 11 }} />
        <ReferenceLine x={0} stroke="var(--axis)" />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
          <TooltipBox title={payload[0].payload.name} rows={[{ label: "ΔNII 12 meses", value: fmtNum(payload[0].payload.delta, 1) }]} />
        ) : null} />
        <Bar dataKey="delta" radius={2} maxBarSize={18} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.name} fill={r.delta >= 0 ? color : "var(--critical)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <Lab title="Margem financeira de 12 meses por indexador (R$ milhões)">
      <div className="grid">
        <NumField label="Selic hoje" percent value={p.selic} onChange={set("selic")} step={0.25} min={0} />
        <NumField label="IPCA projetado" percent value={p.ipca} onChange={set("ipca")} step={0.25} />
        <NumField label="Meses até o novo nível" value={p.ramp_months} onChange={(v) => set("ramp_months")(Math.round(v))} step={1} min={1} max={12} />
        <NumField label="Choque de Selic (bps)" value={p.shock_bps} onChange={set("shock_bps")} step={50} />
        <NumField label="Choque de IPCA (bps)" value={p.ipca_shock_bps} onChange={set("ipca_shock_bps")} step={50} />
      </div>
      <EditableTable<IndexedItem> rows={items} onChange={setItems} newRow={newItem} columns={itemColumns(false)} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Margem financeira (12 meses)" value={`${fmtNum(data.base_nii, 0)} mi`} />
            <Stat label="CDI" value={fmtPct(data.current.cdi, 2)} />
            <Stat label="TR (aprox.)" value={fmtPct(data.current.tr, 2)} />
            <Stat label="Poupança" value={fmtPct(data.current.poupanca, 2)} sub={p.selic > 0.085 ? "regime 0,5% a.m. + TR" : "regime 70% da Selic"} />
          </div>
          <div className="grid-2">
            <div>
              <div className="chart-title">Remuneração dos indexadores × Selic</div>
              <Legend items={[{ label: "CDI", color: "var(--series-1)" }, { label: "Poupança", color: "var(--series-2)" }, { label: "TR", color: "var(--series-4)" }]} />
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.rates} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="selic" type="number" domain={[0.02, 0.2]} tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} />
                  <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={44} />
                  <ReferenceLine x={0.085} stroke="var(--axis)" strokeDasharray="4 4" label={{ value: "8,5%", fill: "var(--muted)", fontSize: 11, position: "insideTopLeft" }} />
                  <ReferenceLine x={p.selic} stroke="var(--text)" strokeDasharray="2 4" />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`Selic ${fmtPct(payload[0].payload.selic, 1)}`} rows={[
                      { label: "CDI", value: fmtPct(payload[0].payload.cdi, 2), color: "var(--series-1)" },
                      { label: "Poupança", value: fmtPct(payload[0].payload.poupanca, 2), color: "var(--series-2)" },
                      { label: "TR", value: fmtPct(payload[0].payload.tr, 2), color: "var(--series-4)" },
                    ]} />
                  ) : null} />
                  <Line dataKey="cdi" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="poupanca" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="tr" stroke="var(--series-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="chart-title">ΔNII de 12 meses × nível final da Selic</div>
              <ResponsiveContainer width="100%" height={262}>
                <LineChart data={data.sweep} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="selic_final" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} />
                  <YAxis {...axisProps} width={44} />
                  <ReferenceLine y={0} stroke="var(--axis)" />
                  <ReferenceLine x={0.085} stroke="var(--axis)" strokeDasharray="4 4" />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`Selic final ${fmtPct(payload[0].payload.selic_final, 1)}`} rows={[{ label: "ΔNII", value: fmtNum(payload[0].payload.delta_nii, 1), color: "var(--series-3)" }]} />
                  ) : null} />
                  <Line dataKey="delta_nii" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <div className="chart-title">ΔNII por posição: Selic {data.selic_shock.bps > 0 ? "+" : ""}{data.selic_shock.bps} bps</div>
              {deltaChart(data.selic_shock.items, "var(--series-1)")}
            </div>
            <div>
              <div className="chart-title">ΔNII por posição: IPCA {data.ipca_shock.bps > 0 ? "+" : ""}{data.ipca_shock.bps} bps, Selic parada</div>
              {deltaChart(data.ipca_shock.items, "var(--series-2)")}
            </div>
          </div>
        </>
      )}
    </Lab>
  );
}
