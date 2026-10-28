import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Scenario = { roe: number; rwa_growth: number; losses: number[] };
type Point = { quarter: number; cet1: number; rwa: number; cet1_ratio: number; profit: number; distributed: number; max_payout: number };
type Result = { path: Point[]; worst_ratio: number; worst_quarter: number; capital_need: number; distributed: number };
type Resp = { base: Result; stress: Result; stack: { minimum: number; acp: number; management_buffer: number; target: number } };

const qLabel = (q: number) => (q === 0 ? "hoje" : `T${q}`);

export default function CapitalPlanPage() {
  return (
    <>
      <h1>Planejamento de capital e ICAAP</h1>
      <p className="lead">
        O Pilar 1 diz quanto capital é exigido hoje. O Pilar 2 pergunta se o banco continua de pé nos próximos anos,
        num cenário ruim, com o plano de negócios e de dividendos que ele mesmo escolheu. A resposta é o ICAAP.
      </p>

      <h2>1. O que é o ICAAP</h2>
      <p>
        O processo interno de avaliação da adequação de capital (ICAAP) reúne: a avaliação de todos os riscos relevantes,
        inclusive os que o Pilar 1 não cobre (concentração, IRRBB, risco de negócio, reputação); o <strong>plano de capital</strong> de
        três anos, coerente com o orçamento; os testes de estresse; e o <strong>plano de contingência de capital</strong>, com as
        ações se o índice cair (reter lucro, emitir capital, reduzir RWA). No Brasil, a Res. CMN 4.557/2017 trata do plano de capital, dos testes de estresse e do ICAAP, com exigências proporcionais ao segmento.
      </p>
      <p>A meta interna fica acima do requerimento regulatório, com um colchão gerencial para absorver o estresse sem entrar na faixa dos adicionais:</p>
      <Formula tex={String.raw`\text{meta} = 4{,}5\% + \text{ACP} + \text{colchão gerencial}`} where={[
        [String.raw`\text{ACP}`, "soma dos adicionais de Capital Principal (veja a página de buffers)"],
        [String.raw`\text{colchão gerencial}`, "margem definida no apetite a riscos, calibrada para o estresse do próprio ICAAP"],
      ]} />

      <h2>2. A projeção</h2>
      <Formula tex={String.raw`\text{CP}_{q} = \text{CP}_{q-1} + L_q - \min\!\big(p,\ p^{\max}_q\big)\cdot\max(L_q, 0), \qquad L_q = \tfrac{\text{ROE}}{4}\,\text{CP}_{q-1} - \tfrac{\ell_{a}}{4}\,\text{RWA}_0`} where={[
        [String.raw`\text{CP}_q`, "Capital Principal no fim do trimestre q"],
        [String.raw`L_q`, "lucro do trimestre, já com as perdas do cenário"],
        [String.raw`p`, "payout desejado pela política de dividendos"],
        [String.raw`p^{\max}_q`, "distribuição máxima permitida pela faixa dos adicionais no início do trimestre"],
        [String.raw`\ell_a`, "perdas de estresse do ano a, como % do RWA inicial"],
        [String.raw`\text{RWA}`, "cresce à taxa anual do cenário (crédito novo, migração de rating)"],
      ]} />
      <CodeSnippet name="project_capital" />

      <h2>3. Laboratório</h2>
      <PlanLab />
      <Callout title="O que observar">
        <ul>
          <li>No cenário base, crescer o RWA mais rápido do que o lucro retido derruba o índice sem nenhuma perda: crescimento também consome capital.</li>
          <li>No estresse, o banco cai para dentro da faixa dos adicionais e a distribuição é cortada automaticamente — a regra funciona como estabilizador. O corte começa um pouco antes de cruzar a linha amarela: com o RWA crescendo, o Capital Complementar e o Nível II deixam de cobrir seus mínimos e o Capital Principal tem de cobrir a diferença.</li>
          <li>A “necessidade de capital” é quanto faltaria para manter a meta no pior trimestre: é o tamanho da ação do plano de contingência.</li>
          <li>Reduza o payout desejado: no estresse muda pouco (o lucro já é baixo), mas no base acumula muito capital — é o trade-off com o acionista.</li>
          <li>As perdas de estresse viriam do <Link to="/mercado/stress">stress test</Link> e da <Link to="/credito/perda-esperada">perda esperada</Link> projetada.</li>
        </ul>
      </Callout>
    </>
  );
}

function ScenarioFields({ title, s, onChange }: { title: string; s: Scenario; onChange: (s: Scenario) => void }) {
  const setLoss = (i: number) => (v: number) => onChange({ ...s, losses: s.losses.map((x, j) => (j === i ? v : x)) });
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="grid">
        <NumField label="ROE antes das perdas" percent value={s.roe} onChange={(v) => onChange({ ...s, roe: v })} step={1} />
        <NumField label="Crescimento anual do RWA" percent value={s.rwa_growth} onChange={(v) => onChange({ ...s, rwa_growth: v })} step={1} />
        {s.losses.map((l, i) => (
          <NumField key={i} label={`Perdas no ano ${i + 1} (% do RWA)`} percent value={l} onChange={setLoss(i)} step={0.25} min={0} />
        ))}
      </div>
    </div>
  );
}

function PlanLab() {
  const [p, setP] = useState({ cet1: 1_100, at1: 120, tier2: 180, rwa: 10_000, countercyclical: 0, systemic: 0.01, management_buffer: 0.015, payout: 0.4 });
  const [base, setBase] = useState<Scenario>({ roe: 0.16, rwa_growth: 0.10, losses: [0, 0, 0] });
  const [stress, setStress] = useState<Scenario>({ roe: 0.12, rwa_growth: 0.04, losses: [0.03, 0.02, 0.005] });
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/capital/plan", { ...p, base, stress });
  const rows = data ? data.base.path.map((b, i) => ({
    q: qLabel(b.quarter), base: b.cet1_ratio, stress: data.stress.path[i].cet1_ratio,
    payout: data.stress.path[i].max_payout, profit: data.stress.path[i].profit, distributed: data.stress.path[i].distributed,
  })) : [];

  return (
    <Lab title="Plano de capital de três anos (R$ milhões)">
      <div className="grid">
        <NumField label="Capital Principal" value={p.cet1} onChange={set("cet1")} step={25} min={0} />
        <NumField label="Capital Complementar" value={p.at1} onChange={set("at1")} step={10} min={0} />
        <NumField label="Nível II" value={p.tier2} onChange={set("tier2")} step={10} min={0} />
        <NumField label="RWA" value={p.rwa} onChange={set("rwa")} step={250} min={1} />
        <NumField label="ACP Contracíclico" percent value={p.countercyclical} onChange={set("countercyclical")} step={0.25} min={0} max={2.5} />
        <NumField label="ACP Sistêmico" percent value={p.systemic} onChange={set("systemic")} step={0.25} min={0} max={2} />
        <NumField label="Colchão gerencial" percent value={p.management_buffer} onChange={set("management_buffer")} step={0.25} min={0} max={5} />
        <NumField label="Payout desejado" percent value={p.payout} onChange={set("payout")} step={5} min={0} max={100} />
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <ScenarioFields title="Cenário base" s={base} onChange={setBase} />
        <ScenarioFields title="Cenário de estresse" s={stress} onChange={setStress} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Meta interna de Capital Principal" value={fmtPct(data.stack.target, 2)} sub={`requerimento: ${fmtPct(data.stack.minimum + data.stack.acp, 2)}`} />
            <Stat label="Pior índice — base" value={fmtPct(data.base.worst_ratio, 2)} sub={qLabel(data.base.worst_quarter)} />
            <Stat label="Pior índice — estresse" value={fmtPct(data.stress.worst_ratio, 2)} sub={qLabel(data.stress.worst_quarter)} />
            <Stat label="Necessidade de capital no estresse" value={`${fmtNum(data.stress.capital_need, 0)} mi`} sub="para manter a meta" />
          </div>
          <div className="chart-title">Índice de Capital Principal projetado</div>
          <Legend items={[
            { label: "Base", color: "var(--series-1)" }, { label: "Estresse", color: "var(--series-7)" },
            { label: "Meta interna", color: "var(--good)" }, { label: "Requerimento (mínimo + ACP)", color: "var(--warning)" }, { label: "Mínimo (4,5%)", color: "var(--critical)" },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="q" {...axisProps} />
              <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={44} domain={[0.04, "auto"]} />
              <ReferenceLine y={data.stack.target} stroke="var(--good)" strokeDasharray="4 4" />
              <ReferenceLine y={data.stack.minimum + data.stack.acp} stroke="var(--warning)" strokeDasharray="4 4" />
              <ReferenceLine y={data.stack.minimum} stroke="var(--critical)" strokeDasharray="4 4" />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={payload[0].payload.q} rows={[
                  { label: "Base", value: fmtPct(payload[0].payload.base, 2), color: "var(--series-1)" },
                  { label: "Estresse", value: fmtPct(payload[0].payload.stress, 2), color: "var(--series-7)" },
                ]} />
              ) : null} />
              <Line dataKey="base" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line dataKey="stress" stroke="var(--series-7)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>

          <div className="chart-title" style={{ marginTop: 16 }}>Estresse: lucro, distribuição e limite dos adicionais por trimestre</div>
          <Legend items={[{ label: "Lucro do trimestre", color: "var(--series-2)", box: true }, { label: "Distribuído", color: "var(--series-5)", box: true }]} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows.slice(1)} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="q" {...axisProps} />
              <YAxis {...axisProps} width={44} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={payload[0].payload.q} rows={[
                  { label: "Lucro", value: fmtNum(payload[0].payload.profit, 1), color: "var(--series-2)" },
                  { label: "Distribuído", value: fmtNum(payload[0].payload.distributed, 1), color: "var(--series-5)" },
                  { label: "Distribuição máxima", value: fmtPct(payload[0].payload.payout, 0) },
                ]} />
              ) : null} />
              <Bar dataKey="profit" fill="var(--series-2)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="distributed" fill="var(--series-5)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
