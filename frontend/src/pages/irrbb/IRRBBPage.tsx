import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, M, NumField, PassBadge, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Position = { name: string; side: "asset" | "liability"; amount: number; rate: number; repricing: number };
type CurvePoint = { tenor: number; rate: number };
type Scenario = "parallel_up" | "parallel_down" | "steepener" | "flattener" | "short_up" | "short_down";
type Resp = {
  base: { pv_assets: number; pv_liabilities: number; eve: number; duration_assets: number; duration_liabilities: number; base_nii: number };
  scenarios: { scenario: Scenario; eve: number; delta_eve: number; delta_eve_pct_tier1: number | null; delta_nii: number }[];
  worst_scenario: Scenario;
  outlier: boolean;
  curves: ({ tenor: number; base: number } & Record<Scenario, number>)[];
  repricing_gap: { bucket: string; assets: number; liabilities: number; gap: number; cumulative_gap: number }[];
};

const SCENARIOS: { key: Scenario; label: string; color: string }[] = [
  { key: "parallel_up", label: "Paralelo +", color: "var(--series-1)" },
  { key: "parallel_down", label: "Paralelo −", color: "var(--series-2)" },
  { key: "steepener", label: "Steepener", color: "var(--series-3)" },
  { key: "flattener", label: "Flattener", color: "var(--series-4)" },
  { key: "short_up", label: "Curto +", color: "var(--series-5)" },
  { key: "short_down", label: "Curto −", color: "var(--series-6)" },
];
const LABEL = Object.fromEntries(SCENARIOS.map((s) => [s.key, s.label])) as Record<Scenario, string>;

const SHOCK_PRESETS = {
  BRL: { parallel: 0.04, short: 0.05, long: 0.03 },
  USD: { parallel: 0.02, short: 0.03, long: 0.015 },
  EUR: { parallel: 0.02, short: 0.025, long: 0.01 },
};

export default function IRRBBPage() {
  const [positions, setPositions] = useState<Position[]>([
    { name: "Caixa e compromissadas", side: "asset", amount: 800_000, rate: 0.145, repricing: 1 / 12 },
    { name: "Capital de giro (CDI)", side: "asset", amount: 1_500_000, rate: 0.17, repricing: 1 / 12 },
    { name: "Títulos prefixados (LTN)", side: "asset", amount: 1_000_000, rate: 0.135, repricing: 2 },
    { name: "Consignado prefixado", side: "asset", amount: 2_000_000, rate: 0.22, repricing: 3 },
    { name: "Financiamento imobiliário prefixado", side: "asset", amount: 800_000, rate: 0.12, repricing: 10 },
    { name: "CDB pós-fixado (CDI)", side: "liability", amount: 3_000_000, rate: 0.14, repricing: 1 / 12 },
    { name: "Depósitos à vista / poupança", side: "liability", amount: 1_200_000, rate: 0.07, repricing: 0.5 },
    { name: "LCI prefixada", side: "liability", amount: 800_000, rate: 0.13, repricing: 1 },
    { name: "Letra financeira prefixada", side: "liability", amount: 500_000, rate: 0.145, repricing: 3 },
    // Swap DI pagador de pré = recebe CDI (ativo pós) e paga taxa fixa (passivo pré)
    { name: "Swap DI — ponta ativa (CDI)", side: "asset", amount: 3_000_000, rate: 0.14, repricing: 1 / 12 },
    { name: "Swap DI — ponta passiva (pré)", side: "liability", amount: 3_000_000, rate: 0.133, repricing: 3 },
  ]);
  const [curve, setCurve] = useState<CurvePoint[]>([
    { tenor: 0.25, rate: 0.145 }, { tenor: 1, rate: 0.14 }, { tenor: 2, rate: 0.135 },
    { tenor: 3, rate: 0.133 }, { tenor: 5, rate: 0.134 }, { tenor: 10, rate: 0.136 },
  ]);
  const [currency, setCurrency] = useState<keyof typeof SHOCK_PRESETS | "custom">("BRL");
  const [shocks, setShocks] = useState(SHOCK_PRESETS.BRL);
  const [tier1, setTier1] = useState(600_000);
  const { data, error } = useCompute<Resp>("/irrbb/analyze", { positions, curve, shocks, tier1 });

  return (
    <>
      <h1>IRRBB: ΔEVE e ΔNII</h1>
      <p className="lead">
        <em>Interest Rate Risk in the Banking Book</em> é o risco de que mudanças nas taxas de juros
        afetem o banco pela carteira de crédito e captação — que não é marcada a mercado diariamente
        como a carteira de negociação.
      </p>

      <h2>1. De onde vem o risco</h2>
      <p>
        Um banco típico capta curto (CDB, depósitos) e empresta longo e prefixado (consignado,
        imobiliário). Se os juros sobem, o custo da captação sobe logo, mas a receita do crédito fica
        travada. As fontes de IRRBB são:
      </p>
      <ul>
        <li><strong>Gap de repricing</strong>: ativos e passivos reprecificam em datas diferentes;</li>
        <li><strong>Risco de curva</strong>: a curva muda de inclinação ou formato, não só de nível;</li>
        <li><strong>Risco de base</strong>: indexadores diferentes (CDI vs. TR vs. IPCA) não se movem juntos;</li>
        <li><strong>Opcionalidade</strong>: pré-pagamento de crédito e saques de depósitos dependem dos juros.</li>
      </ul>

      <h2>2. Duas lentes: valor e resultado</h2>
      <div className="grid-2">
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>ΔEVE — valor econômico</h3>
          <p>
            O EVE (<em>Economic Value of Equity</em>) é o valor presente de todos os fluxos dos ativos
            menos o dos passivos. ΔEVE é sua variação quando a curva é choqueada. É uma visão de
            <strong> longo prazo</strong>: captura todo o descasamento até o último fluxo.
          </p>
          <Formula tex={String.raw`\text{EVE} = \sum_{t} \frac{CF^{A}_t - CF^{L}_t}{e^{\,r(t)\,t}}, \quad \Delta\text{EVE} = \text{EVE}_{\text{choque}} - \text{EVE}_{\text{base}}`} />
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>ΔNII — margem financeira</h3>
          <p>
            O NII (<em>Net Interest Income</em>) é receita menos despesa de juros. ΔNII mede o impacto
            nos próximos <strong>12 meses</strong>, supondo balanço constante: o que vence é
            renovado à nova taxa.
          </p>
          <Formula tex={String.raw`\Delta\text{NII} \approx \sum_{t_i < 1} \text{Gap}_i \cdot \Delta r(t_i) \cdot (1 - t_i)`} />
        </div>
      </div>
      <p>
        As duas lentes podem apontar em direções opostas! Um banco com ativos pós-fixados e captação
        prefixada longa ganha NII com alta de juros, mas pode perder EVE se tiver ativos longos.
        Uma aproximação útil para o ΔEVE é o <strong>gap de duration</strong>:
      </p>
      <Formula tex={String.raw`\Delta \text{EVE} \approx -\left(D_A - \tfrac{L}{A} D_L\right) \cdot A \cdot \Delta r`} />

      <h2>3. Os seis cenários de Basileia</h2>
      <p>
        O padrão BCBS (d368) — adotado no Brasil pela Circular BCB 3.876/2018 — define choques por
        moeda com três magnitudes: paralelo (<M>{String.raw`\bar R_p`}</M>), curto (<M>{String.raw`\bar R_s`}</M>) e
        longo (<M>{String.raw`\bar R_l`}</M>). Para o real: 400, 500 e 300 pontos-base; para o dólar: 200, 300 e 150.
      </p>
      <Formula tex={String.raw`\Delta R_{\text{curto}}(t) = \pm \bar R_s\, e^{-t/4} \qquad \Delta R_{\text{longo}}(t) = \pm \bar R_l\,(1 - e^{-t/4})`} />
      <Formula tex={String.raw`\text{Steepener} = -0{,}65\,|\Delta R_{\text{curto}}| + 0{,}9\,|\Delta R_{\text{longo}}| \qquad \text{Flattener} = 0{,}8\,|\Delta R_{\text{curto}}| - 0{,}6\,|\Delta R_{\text{longo}}|`} />
      <p>
        O <strong>teste de outlier</strong> supervisório sinaliza o banco cuja pior queda de EVE nos seis
        cenários supera <strong>15% do Nível I</strong>.
      </p>

      <h2>4. Laboratório</h2>
      <Lab title="Choques de juros sobre o balanço">
        <h3 style={{ marginTop: 0 }}>Posições da carteira bancária</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Cada posição paga cupom anual à taxa contratual até a data de repricing (pós-fixados
          reprecificam em ~1 mês). Repricing em anos: 1 mês ≈ 0,0833.
        </p>
        <EditableTable<Position>
          rows={positions} onChange={setPositions}
          newRow={() => ({ name: "Nova posição", side: "asset", amount: 100_000, rate: 0.14, repricing: 1 })}
          columns={[
            { key: "name", label: "Posição", type: "text" },
            { key: "side", label: "Lado", type: "select", options: [["asset", "Ativo"], ["liability", "Passivo"]], width: 100 },
            { key: "amount", label: "Saldo", type: "number" },
            { key: "rate", label: "Taxa", type: "percent", width: 90 },
            { key: "repricing", label: "Repricing (anos)", type: "number", width: 110 },
          ]}
        />
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Curva base (taxas contínuas)</h3>
            <EditableTable<CurvePoint>
              rows={curve} onChange={setCurve}
              newRow={() => ({ tenor: 20, rate: 0.13 })}
              columns={[
                { key: "tenor", label: "Prazo (anos)", type: "number" },
                { key: "rate", label: "Taxa", type: "percent" },
              ]}
            />
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Choques e capital</h3>
            <div className="grid">
              <SelectField label="Moeda (calibração)" value={currency} onChange={(c) => {
                setCurrency(c);
                if (c !== "custom") setShocks(SHOCK_PRESETS[c]);
              }} options={[["BRL", "Real (BRL)"], ["USD", "Dólar (USD)"], ["EUR", "Euro (EUR)"], ["custom", "Personalizado"]]} />
              <NumField label="Choque paralelo" percent value={shocks.parallel} step={0.25}
                onChange={(v) => { setCurrency("custom"); setShocks({ ...shocks, parallel: v }); }} />
              <NumField label="Choque curto" percent value={shocks.short} step={0.25}
                onChange={(v) => { setCurrency("custom"); setShocks({ ...shocks, short: v }); }} />
              <NumField label="Choque longo" percent value={shocks.long} step={0.25}
                onChange={(v) => { setCurrency("custom"); setShocks({ ...shocks, long: v }); }} />
              <NumField label="Nível I (Tier 1)" value={tier1} onChange={setTier1} step={50000} />
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {data && <Results data={data} />}
      </Lab>

      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>O balanço tem um <strong>swap DI pagador de pré</strong> de R$ 3 milhões: o banco recebe CDI e paga taxa fixa por 3 anos.
            Remova as duas pontas do swap — o ΔEVE em Paralelo + passa de 15% do Nível I e o banco vira outlier.</li>
          <li>Sem o swap, o ΔNII em Paralelo + é negativo (a captação em CDI reprecifica antes do crédito); com o swap ele
            vira positivo. O hedge de EVE muda o perfil de NII: as duas lentes nem sempre andam juntas.</li>
          <li>Com o swap, o pior cenário deixa de ser o Paralelo + e passa a ser o <strong>Steepener</strong>: o hedge de 3 anos
            não protege o imobiliário de 10 anos contra a alta das taxas longas. Isso é <strong>risco de curva</strong>.</li>
          <li>Mude o financiamento imobiliário para repricing de 1 mês (pós-fixado): o ΔEVE quase some, mas o banco agora tem risco de crédito maior (o tomador paga a alta de juros).</li>
          <li>Os depósitos à vista/poupança não têm vencimento. Bancos modelam sua estabilidade comportamental (NMDs) — o prazo atribuído muda muito o ΔEVE. Experimente 0,5 vs. 3 anos.</li>
        </ul>
      </Callout>
    </>
  );
}

function Results({ data }: { data: Resp }) {
  const b = data.base;
  const durGap = b.duration_assets - (b.pv_liabilities / b.pv_assets) * b.duration_liabilities;
  const worst = data.scenarios.find((s) => s.scenario === data.worst_scenario)!;
  const bars = data.scenarios.map((s) => ({ ...s, label: LABEL[s.scenario] }));

  return (
    <>
      <div className="stats">
        <Stat label="EVE base" value={fmtMoney(b.eve)} sub={`VP ativos ${fmtCompact(b.pv_assets)} · passivos ${fmtCompact(b.pv_liabilities)}`} />
        <Stat label="Duration ativos / passivos" value={`${fmtNum(b.duration_assets)} / ${fmtNum(b.duration_liabilities)}`} sub={`gap de duration: ${fmtNum(durGap)} anos`} />
        <Stat label="NII base (12m)" value={fmtMoney(b.base_nii)} />
        <Stat label={`Pior ΔEVE (${LABEL[worst.scenario]})`} value={fmtMoney(worst.delta_eve)}
          sub={<>
            {fmtPct(worst.delta_eve_pct_tier1, 1)} do Nível I
            <div style={{ marginTop: 4 }}><PassBadge ok={!data.outlier} label={data.outlier ? "Outlier (> 15%)" : "Dentro de 15%"} /></div>
          </>} />
      </div>

      <div className="chart-title">Curva base e curvas choqueadas</div>
      <Legend items={[{ label: "Base", color: "var(--text)" }, ...SCENARIOS]} />
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data.curves} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="tenor" type="number" domain={[0, 30]} ticks={[0, 1, 2, 3, 5, 10, 15, 20, 30]} {...axisProps}
            tickFormatter={(v) => `${v}a`} />
          <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={48} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Resp["curves"][number];
            return <TooltipBox title={`Prazo ${fmtNum(d.tenor)} anos`} rows={[
              { label: "Base", value: fmtPct(d.base, 2), color: "var(--text)" },
              ...SCENARIOS.map((s) => ({ label: s.label, value: fmtPct(d[s.key], 2), color: s.color })),
            ]} />;
          }} />
          <Line dataKey="base" stroke="var(--text)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {SCENARIOS.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <DeltaChart title="ΔEVE por cenário" data={bars} dataKey="delta_eve" />
        <DeltaChart title="ΔNII em 12 meses por cenário" data={bars} dataKey="delta_nii" />
      </div>
      <Legend items={[
        { label: "Ganho", color: "var(--pos)", box: true },
        { label: "Perda", color: "var(--neg)", box: true },
      ]} />

      <h3>Gap de repricing</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Ativos menos passivos que reprecificam em cada faixa. Gap negativo no curto prazo = passivos
        reprecificam antes → alta de juros reduz a margem.
      </p>
      <Legend items={[
        { label: "Gap da faixa (positivo)", color: "var(--pos)", box: true },
        { label: "Gap da faixa (negativo)", color: "var(--neg)", box: true },
        { label: "Gap acumulado", color: "var(--text-2)" },
      ]} />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data.repricing_gap} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="bucket" {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={56} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Resp["repricing_gap"][number];
            return <TooltipBox title={d.bucket} rows={[
              { label: "Ativos", value: fmtMoney(d.assets) },
              { label: "Passivos", value: fmtMoney(d.liabilities) },
              { label: "Gap", value: fmtMoney(d.gap) },
              { label: "Gap acumulado", value: fmtMoney(d.cumulative_gap) },
            ]} />;
          }} />
          <Bar dataKey="gap" radius={4} maxBarSize={44} isAnimationActive={false}>
            {data.repricing_gap.map((r, i) => <Cell key={i} fill={r.gap >= 0 ? "var(--pos)" : "var(--neg)"} />)}
          </Bar>
          <Line dataKey="cumulative_gap" stroke="var(--text-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function DeltaChart({ title, data, dataKey }: {
  title: string; data: (Resp["scenarios"][number] & { label: string })[]; dataKey: "delta_eve" | "delta_nii";
}) {
  return (
    <div>
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" tickFormatter={fmtCompact} {...axisProps} />
          <YAxis type="category" dataKey="label" {...axisProps} width={80} />
          <ReferenceLine x={0} stroke="var(--axis)" />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={payload[0].payload.label} rows={[{ label: dataKey === "delta_eve" ? "ΔEVE" : "ΔNII", value: fmtMoney(payload[0].payload[dataKey]) }]} />
            ) : null} />
          <Bar dataKey={dataKey} radius={4} maxBarSize={22} isAnimationActive={false}>
            {data.map((r, i) => <Cell key={i} fill={r[dataKey] >= 0 ? "var(--pos)" : "var(--neg)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
