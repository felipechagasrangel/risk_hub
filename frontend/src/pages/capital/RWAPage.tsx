import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, M, NumField, PassBadge, Stat } from "../../components/ui";
import { fmtMoney, fmtPct } from "../../format";

type Exposure = { name: string; amount: number; risk_weight: number; ccf: number };
type Ratios = { cet1: number; tier1: number; total: number };
type Resp = {
  exposures: (Exposure & { ead: number; rwa: number })[];
  rwa: { credit: number; market: number; operational: number; total: number };
  ratios: Ratios; requirements: Ratios; surplus: Ratios;
};

const RATIO_LABELS: [keyof Ratios, string][] = [["cet1", "Capital Principal (CET1)"], ["tier1", "Nível I"], ["total", "Total (PR)"]];

export default function RWAPage() {
  const [exposures, setExposures] = useState<Exposure[]>([
    { name: "Títulos públicos federais", amount: 3_000_000, risk_weight: 0, ccf: 1 },
    { name: "Depósitos em outros bancos", amount: 500_000, risk_weight: 0.5, ccf: 1 },
    { name: "Financiamento imobiliário", amount: 2_000_000, risk_weight: 0.35, ccf: 1 },
    { name: "Crédito pessoa física (varejo)", amount: 1_500_000, risk_weight: 0.75, ccf: 1 },
    { name: "Crédito corporativo", amount: 2_500_000, risk_weight: 1.0, ccf: 1 },
    { name: "Limite de crédito não utilizado", amount: 1_000_000, risk_weight: 1.0, ccf: 0.4 },
    { name: "Operações inadimplidas", amount: 100_000, risk_weight: 1.5, ccf: 1 },
  ]);
  const [cap, setCap] = useState({
    capital_market: 40_000, capital_operational: 60_000,
    cet1: 520_000, at1: 80_000, tier2: 120_000,
    conservation_buffer: 0.025, countercyclical_buffer: 0,
  });
  const set = (k: keyof typeof cap) => (v: number) => setCap({ ...cap, [k]: v });
  const { data, error } = useCompute<Resp>("/capital/rwa", { exposures, ...cap });

  return (
    <>
      <h1>RWA e Índice de Basileia</h1>
      <p className="lead">
        Quanto capital próprio um banco precisa ter? Depende de <em>quão arriscados</em> são seus
        ativos. O RWA (<em>Risk-Weighted Assets</em>, ativos ponderados pelo risco) é a régua que
        traduz o balanço em risco.
      </p>

      <h2>1. Por que ponderar pelo risco?</h2>
      <p>
        R$ 1 milhão em títulos do governo e R$ 1 milhão emprestado a uma empresa endividada não
        têm o mesmo risco. Se o capital exigido fosse proporcional ao ativo total, o banco seria
        incentivado a carregar os ativos mais arriscados (que rendem mais). O RWA corrige isso
        aplicando a cada exposição um <strong>fator de ponderação de risco (FPR)</strong>:
      </p>
      <Formula tex={String.raw`\text{RWA}_{\text{crédito}} = \sum_i \underbrace{\text{Exposição}_i \times \text{CCF}_i}_{\text{EAD}_i} \times \text{FPR}_i`} />
      <p>
        O <strong>CCF</strong> (fator de conversão de crédito) transforma itens fora do balanço —
        como limites não utilizados e garantias prestadas — em exposição equivalente: um limite
        de R$ 1 milhão com CCF 40% conta como R$ 400 mil de exposição.
      </p>

      <h3>FPRs típicos na abordagem padronizada</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Exposição</th><th className="num">FPR</th></tr></thead>
          <tbody>
            <tr><td>Soberano em moeda local, caixa</td><td className="num">0%</td></tr>
            <tr><td>Bancos (depende do rating/prazo)</td><td className="num">20% – 150%</td></tr>
            <tr><td>Imobiliário residencial (depende do LTV)</td><td className="num">20% – 70%</td></tr>
            <tr><td>Varejo regulatório</td><td className="num">75%</td></tr>
            <tr><td>Corporativo sem rating</td><td className="num">100%</td></tr>
            <tr><td>Inadimplido</td><td className="num">100% – 150%</td></tr>
          </tbody>
        </table>
      </div>

      <h2>2. Os três blocos de RWA</h2>
      <p>
        Além do crédito, há capital para risco de mercado e operacional. Essas parcelas são
        calculadas como exigência de capital e convertidas em RWA multiplicando por 12,5 (= 1/8%):
      </p>
      <Formula tex={String.raw`\text{RWA} = \text{RWA}_{\text{CPAD}} + 12{,}5 \times K_{\text{mercado}} + 12{,}5 \times K_{\text{operacional}}`} />
      <p className="muted" style={{ fontSize: 14 }}>
        No Brasil (Resolução CMN 4.958 e circulares do BCB): RWA<sub>CPAD</sub>, RWA<sub>MPAD</sub> e RWA<sub>OPAD</sub>.
      </p>

      <h2>3. O capital e os índices</h2>
      <p>O capital regulatório (Patrimônio de Referência, PR) tem camadas por qualidade de absorção de perdas:</p>
      <ul>
        <li><strong>Capital Principal (CET1)</strong>: ações ordinárias e lucros retidos, menos ajustes prudenciais (ágio, intangíveis, créditos tributários…).</li>
        <li><strong>Capital Complementar (AT1)</strong>: instrumentos perpétuos que podem ser convertidos ou baixados.</li>
        <li><strong>Nível II (T2)</strong>: dívida subordinada de longo prazo — absorve perdas só na liquidação.</li>
      </ul>
      <Formula tex={String.raw`\text{Índice de Basileia} = \frac{\text{PR}}{\text{RWA}} \ge 8\% + \text{buffers}`} />
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Índice</th><th className="num">Mínimo</th><th className="num">+ Conservação (2,5%)</th></tr></thead>
          <tbody>
            <tr><td>CET1 / RWA</td><td className="num">4,5%</td><td className="num">7,0%</td></tr>
            <tr><td>Nível I / RWA</td><td className="num">6,0%</td><td className="num">8,5%</td></tr>
            <tr><td>PR / RWA</td><td className="num">8,0%</td><td className="num">10,5%</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Os <strong>buffers</strong> (conservação, contracíclico, sistêmico para bancos grandes) são
        feitos de CET1. Quem os descumpre não quebra a regra mínima, mas sofre restrições a
        dividendos e bônus.
      </p>

      <h2>4. Laboratório</h2>
      <Lab title="Monte o balanço e calcule os índices">
        <EditableTable<Exposure>
          rows={exposures}
          onChange={setExposures}
          newRow={() => ({ name: "Nova exposição", amount: 100_000, risk_weight: 1, ccf: 1 })}
          columns={[
            { key: "name", label: "Exposição", type: "text" },
            { key: "amount", label: "Valor", type: "number" },
            { key: "ccf", label: "CCF", type: "percent", width: 90 },
            { key: "risk_weight", label: "FPR", type: "percent", width: 90 },
          ]}
          computed={data && data.exposures.length === exposures.length ? [
            { label: "EAD", values: data.exposures.map((e) => fmtMoney(e.ead)) },
            { label: "RWA", values: data.exposures.map((e) => fmtMoney(e.rwa)) },
          ] : []}
        />
        <h3>Capital e outras exigências</h3>
        <div className="grid">
          <NumField label="CET1" value={cap.cet1} onChange={set("cet1")} step={10000} />
          <NumField label="Capital Complementar (AT1)" value={cap.at1} onChange={set("at1")} step={10000} />
          <NumField label="Nível II" value={cap.tier2} onChange={set("tier2")} step={10000} />
          <NumField label="Capital p/ risco de mercado" value={cap.capital_market} onChange={set("capital_market")} step={10000} />
          <NumField label="Capital p/ risco operacional" value={cap.capital_operational} onChange={set("capital_operational")} step={10000} />
          <NumField label="Buffer de conservação" percent value={cap.conservation_buffer} onChange={set("conservation_buffer")} step={0.25} />
          <NumField label="Buffer contracíclico" percent value={cap.countercyclical_buffer} onChange={set("countercyclical_buffer")} step={0.25} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && <Results data={data} />}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Transfira R$ 1 milhão de crédito corporativo para títulos públicos: o RWA cai R$ 1 milhão e o índice sobe sem nenhum aporte de capital.</li>
          <li>Aumente o buffer contracíclico para 2,5%: o mesmo banco pode deixar de cumprir os requerimentos.</li>
          <li>Repare que o RWA total é bem menor que o ativo total — a “densidade de RWA” (RWA/Ativo) é um indicador do perfil de risco do banco.</li>
        </ul>
      </Callout>
    </>
  );
}

function Results({ data }: { data: Resp }) {
  const chart = RATIO_LABELS.map(([k, label]) => ({ label, ratio: data.ratios[k], req: data.requirements[k] }));
  return (
    <>
      <div className="stats">
        <Stat label="RWA crédito" value={fmtMoney(data.rwa.credit)} />
        <Stat label="RWA mercado" value={fmtMoney(data.rwa.market)} sub="= 12,5 × capital" />
        <Stat label="RWA operacional" value={fmtMoney(data.rwa.operational)} sub="= 12,5 × capital" />
        <Stat label="RWA total" value={fmtMoney(data.rwa.total)} />
      </div>
      <div className="stats">
        {RATIO_LABELS.map(([k, label]) => (
          <Stat key={k} label={label} value={fmtPct(data.ratios[k], 2)}
            sub={<>
              <PassBadge ok={data.surplus[k] >= 0} label={`exigido ${fmtPct(data.requirements[k], 1)}`} />
              <div style={{ marginTop: 4 }}>{data.surplus[k] >= 0 ? "Folga" : "Déficit"}: {fmtMoney(Math.abs(data.surplus[k]))}</div>
            </>} />
        ))}
      </div>
      <div className="chart-title">Índices de capital vs. requerimento (mínimo + buffers)</div>
      <Legend items={[
        { label: "Índice do banco", color: "var(--series-1)", box: true },
        { label: "Requerimento", color: "var(--axis)", box: true },
      ]} />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={chart} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={48} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={payload[0].payload.label} rows={[
                { label: "Índice", value: fmtPct(payload[0].payload.ratio, 2), color: "var(--series-1)" },
                { label: "Requerimento", value: fmtPct(payload[0].payload.req, 2), color: "var(--axis)" },
              ]} />
            ) : null} />
          <Bar dataKey="ratio" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
          <Bar dataKey="req" fill="var(--axis)" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <p className="muted" style={{ fontSize: 13 }}>
        Fórmula: <M>{String.raw`\text{CET1}/\text{RWA}`}</M>, <M>{String.raw`(\text{CET1}+\text{AT1})/\text{RWA}`}</M>, <M>{String.raw`\text{PR}/\text{RWA}`}</M>.
      </p>
    </>
  );
}
