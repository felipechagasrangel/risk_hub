import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, RegNote, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Resp = {
  acp: { conservation: number; countercyclical: number; systemic: number; total: number };
  limit: { cet1_ratio: number; used_for_minimums: number; available: number; filled: number; max_payout: number; band: string };
  ratios: { cet1: number; tier1: number; total: number };
  stack: { minimum: number; acp: number; requirement: number };
  sweep: { cet1_ratio: number; max_payout: number }[];
  distribution: number;
};

const STACK = [
  { key: "minimum", label: "Mínimo de Capital Principal (4,5%)", color: "var(--series-1)" },
  { key: "conservation", label: "ACP Conservação", color: "var(--series-2)" },
  { key: "countercyclical", label: "ACP Contracíclico", color: "var(--series-3)" },
  { key: "systemic", label: "ACP Sistêmico", color: "var(--series-4)" },
] as const;

export default function BuffersPage() {
  return (
    <>
      <h1>Adicionais de capital (buffers)</h1>
      <p className="lead">
        Acima dos mínimos, o banco precisa manter colchões de Capital Principal que podem ser consumidos numa crise.
        Usá-los não é uma infração, mas tem um preço: enquanto estiver dentro da faixa dos adicionais, o banco
        não pode distribuir todo o lucro.
      </p>

      <h2>1. A pilha de requerimentos</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Camada</th><th className="num">Requerimento</th><th>Para quê</th></tr></thead>
          <tbody>
            <tr><td>Capital Principal mínimo</td><td className="num">4,5%</td><td>absorver perdas com o banco funcionando</td></tr>
            <tr><td>Nível I mínimo</td><td className="num">6,0%</td><td>Capital Principal + Complementar</td></tr>
            <tr><td>PR mínimo</td><td className="num">8,0%</td><td>Nível I + Nível II</td></tr>
            <tr><td>ACP Conservação</td><td className="num">2,5%</td><td>colchão permanente, consumível na crise</td></tr>
            <tr><td>ACP Contracíclico</td><td className="num">0 a 2,5%</td><td>acionado pelo BCB quando o crédito cresce demais; liberado na reversão</td></tr>
            <tr><td>ACP Sistêmico</td><td className="num">0 a 2%</td><td>bancos de importância sistêmica doméstica (hoje 1% para os maiores)</td></tr>
          </tbody>
        </table>
      </div>
      <p>Todos os adicionais (ACP) são em Capital Principal. Somados ao mínimo, dão o requerimento total de Capital Principal:</p>
      <Formula tex={String.raw`\text{CP}_{\text{req}} = 4{,}5\% + \text{ACP}_{\text{Conservação}} + \text{ACP}_{\text{Contracíclico}} + \text{ACP}_{\text{Sistêmico}}`} where={[
        [String.raw`\text{CP}_{\text{req}}`, "índice de Capital Principal abaixo do qual há restrição à distribuição de resultados"],
        [String.raw`\text{ACP}`, "Adicional de Capital Principal — a parte “consumível” do capital"],
      ]} />

      <h2>2. Quanto do adicional está atendido</h2>
      <p>
        O Capital Principal que cobre a falta de Complementar ou de Nível II nos mínimos de 6% e 8% não conta para o
        adicional. Por isso, ter pouco Capital Complementar emitido “come” parte do colchão:
      </p>
      <Formula tex={String.raw`\text{ACP}_{\text{atendido}} = \text{CP} - 4{,}5\% - \max(1{,}5\% - \text{AT1}, 0) - \max(2\% - \text{N2}, 0)`} where={[
        [String.raw`\text{CP},\ \text{AT1},\ \text{N2}`, "Capital Principal, Complementar e Nível II, como % do RWA"],
        [String.raw`1{,}5\%`, "diferença entre o mínimo de Nível I (6%) e o de Capital Principal (4,5%)"],
        [String.raw`2\%`, "diferença entre o mínimo de PR (8%) e o de Nível I (6%)"],
      ]} />

      <h2>3. Restrição à distribuição</h2>
      <p>O ACP é dividido em quartis. Quanto mais fundo o banco entra no colchão, menos do lucro pode distribuir (dividendos, JCP, recompras, bônus):</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>ACP atendido</th><th className="num">Distribuição máxima do lucro</th><th className="num">Retenção mínima</th></tr></thead>
          <tbody>
            <tr><td>abaixo de 25%</td><td className="num">0%</td><td className="num">100%</td></tr>
            <tr><td>25% a 50%</td><td className="num">20%</td><td className="num">80%</td></tr>
            <tr><td>50% a 75%</td><td className="num">40%</td><td className="num">60%</td></tr>
            <tr><td>75% a 100%</td><td className="num">60%</td><td className="num">40%</td></tr>
            <tr><td>100% ou mais</td><td className="num">sem restrição</td><td className="num">—</td></tr>
          </tbody>
        </table>
      </div>
      <CodeSnippet name="distribution_limit" />

      <h2>4. Laboratório</h2>
      <BuffersLab />
      <Callout title="O que observar">
        <ul>
          <li>Ligue o contracíclico em 2,5%: o mesmo banco, com o mesmo capital, passa a ter restrição de dividendos. É o BCB “travando” capital no auge do ciclo.</li>
          <li>Zere o Capital Complementar: o Capital Principal passa a cobrir os 1,5 p.p. do Nível I, e o ACP atendido cai na mesma medida.</li>
          <li>A restrição é em degraus: perto da fronteira de um quartil, um pequeno prejuízo muda bastante o que pode ser pago.</li>
          <li>Veja o <Link to="/capital/planejamento">planejamento de capital</Link> para a restrição acontecendo ao longo de um cenário de estresse.</li>
        </ul>
      </Callout>
      <RegNote>Os adicionais e o índice de Capital Principal são reportados no <Link to="/cadocs#dlo">DLO</Link>; o ACP Contracíclico vigente é divulgado pelo Comitê de Estabilidade Financeira (Comef).</RegNote>
    </>
  );
}

function BuffersLab() {
  const [p, setP] = useState({ cet1: 1_050, at1: 120, tier2: 180, rwa: 10_000, countercyclical: 0, systemic: 0.01, net_income: 300 });
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/capital/buffers", p);
  const stack = data ? [{
    name: "Requerimento", minimum: data.stack.minimum, conservation: data.acp.conservation,
    countercyclical: data.acp.countercyclical, systemic: data.acp.systemic,
  }] : [];

  return (
    <Lab title="Banco hipotético (R$ milhões)">
      <div className="grid">
        <NumField label="Capital Principal" value={p.cet1} onChange={set("cet1")} step={25} min={0} />
        <NumField label="Capital Complementar" value={p.at1} onChange={set("at1")} step={10} min={0} />
        <NumField label="Nível II" value={p.tier2} onChange={set("tier2")} step={10} min={0} />
        <NumField label="RWA" value={p.rwa} onChange={set("rwa")} step={250} min={1} />
        <NumField label="ACP Contracíclico" percent value={p.countercyclical} onChange={set("countercyclical")} step={0.25} min={0} max={2.5} />
        <NumField label="ACP Sistêmico" percent value={p.systemic} onChange={set("systemic")} step={0.25} min={0} max={2} />
        <NumField label="Lucro do período" value={p.net_income} onChange={set("net_income")} step={25} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Índice de Capital Principal" value={fmtPct(data.ratios.cet1, 2)} sub={`requerido: ${fmtPct(data.stack.requirement, 2)}`} />
            <Stat label="ACP atendido" value={fmtPct(Math.max(data.limit.available, 0), 2)} sub={`${fmtPct(Math.max(data.limit.filled, 0), 0)} do ACP de ${fmtPct(data.acp.total, 2)}`} />
            <Stat label="Faixa" value={data.limit.band} />
            <Stat label="Distribuição máxima" value={fmtPct(data.limit.max_payout, 0)} sub={`até ${fmtNum(data.distribution, 0)} mi do lucro`} />
          </div>
          <div className="chart-title">Índice de Capital Principal × pilha de requerimentos</div>
          <Legend items={[...STACK.map((s) => ({ label: s.label, color: s.color, box: true })), { label: "Índice atual", color: "var(--text)" }]} />
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={stack} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" domain={[0, Math.max(0.16, data.ratios.cet1 + 0.01)]} tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} />
              <YAxis type="category" dataKey="name" hide />
              {STACK.map((s) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} />)}
              <ReferenceLine x={data.ratios.cet1} stroke="var(--text)" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>

          <div className="chart-title" style={{ marginTop: 16 }}>Distribuição máxima do lucro em função do índice de Capital Principal</div>
          <div className="chart-sub">Mantidos o Capital Complementar, o Nível II e o RWA do laboratório. A linha vertical é o índice atual.</div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={data.sweep} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="cet1_ratio" type="number" domain={[0.03, 0.15]} tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} />
              <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={44} domain={[0, 1]} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={`Capital Principal ${fmtPct(payload[0].payload.cet1_ratio, 2)}`}
                  rows={[{ label: "Distribuição máxima", value: fmtPct(payload[0].payload.max_payout, 0), color: "var(--series-2)" }]} />
              ) : null} />
              <Area type="stepAfter" dataKey="max_payout" stroke="var(--series-2)" fill="var(--series-2)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <ReferenceLine x={data.ratios.cet1} stroke="var(--text)" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
