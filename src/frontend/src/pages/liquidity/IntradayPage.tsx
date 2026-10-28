import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, PassBadge, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

const SLOTS = ["08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h"];
type Flow = { name: string; kind: "in" | "out"; time_critical: boolean } & Record<`s${number}`, number>;
type Path = {
  inflow: number[]; outflow: number[]; net_cum: number[]; balance: number[];
  max_usage: number; min_balance: number; min_slot: string; credit_used: number; shortfall: number; usage_over_available: number | null;
};
type Resp = { slots: string[]; credit_capacity: number; available: number; base: Path; stress: Path; total_out: number };

const flow = (name: string, kind: "in" | "out", time_critical: boolean, amounts: number[]): Flow =>
  ({ name, kind, time_critical, ...Object.fromEntries(amounts.map((a, i) => [`s${i}`, a])) } as Flow);
const mi = (v: number) => `${fmtNum(v, 0)} mi`;

export default function IntradayPage() {
  return (
    <>
      <h1>Liquidez intradiária</h1>
      <p className="lead">
        Um banco pode ter caixa de sobra no fim do dia e, ainda assim, não conseguir liquidar um pagamento às 13h.
        A liquidez intradiária olha a conta de reservas hora a hora: pagamentos saem antes de os recebimentos chegarem.
      </p>

      <h2>1. A conta de reservas ao longo do dia</h2>
      <p>
        No Brasil, os pagamentos de alto valor liquidam em tempo real e bruto no STR; Pix, liquidação de títulos (Selic, B3)
        e câmbio também passam pela conta de reservas. Se o saldo não cobre um pagamento, ele fica na fila ou o banco
        recorre ao <strong>redesconto intradia</strong> do BCB: uma compromissada com títulos públicos, sem custo se devolvida no mesmo dia.
      </p>
      <Formula tex={String.raw`S(h) = S_0 + \sum_{k \le h} \big(E_k - P_k\big), \qquad \text{uso máximo} = \max\!\Big(0,\ -\min_h \sum_{k \le h}(E_k - P_k)\Big)`} where={[
        [String.raw`S(h)`, "saldo da conta de reservas no horário h"],
        [String.raw`S_0`, "saldo de abertura"],
        [String.raw`E_k,\ P_k`, "recebimentos e pagamentos no horário k"],
        [String.raw`\text{uso máximo}`, "maior uso de liquidez intradiária (BCBS 248): a posição líquida acumulada mais negativa do dia"],
      ]} />
      <Formula tex={String.raw`\text{Liquidez disponível} = S_0 + C\,(1 - h_c)`} where={[
        [String.raw`C`, "títulos livres disponíveis para o redesconto intradia"],
        [String.raw`h_c`, "haircut aplicado pelo BCB ao colateral"],
      ]} />

      <h2>2. O estresse intradiário</h2>
      <p>
        Os cenários do BCBS 248 incluem estresse do próprio banco, de uma contraparte relevante (que atrasa ou não paga) e de
        mercado (colateral perde valor). No laboratório, os recebimentos <strong>atrasam</strong> algumas horas e uma
        fração <strong>não chega</strong> no dia. A defesa do banco: priorizar os pagamentos críticos (liquidações com
        horário fixo) e segurar os não críticos para o fim do dia.
      </p>
      <CodeSnippet name="intraday_path" />

      <h2>3. Laboratório</h2>
      <IntradayLab />
      <Callout title="O que observar">
        <ul>
          <li>No cenário base, o vale do dia é às 13h, na liquidação de câmbio, quando os recebimentos da tarde ainda não chegaram.</li>
          <li>Com atraso de duas horas e 20% de falha nos recebimentos, o banco precisa do redesconto intradia; sem colateral livre, não liquidaria.</li>
          <li>Marque “segurar pagamentos não críticos”: o uso máximo cai bastante. Mas segurar demais trava o sistema — se todos fizerem isso, ninguém recebe (é o problema de coordenação dos sistemas brutos).</li>
          <li>Reduza o colateral livre: o título que está no colchão do <Link to="/liquidez/lcr">LCR</Link> é o mesmo que serve de garantia intradia.</li>
        </ul>
      </Callout>
    </>
  );
}

function IntradayLab() {
  const [p, setP] = useState({ opening: 800, collateral: 1_500, haircut: 0.05, delay_slots: 2, inflow_failure: 0.2 });
  const [queue, setQueue] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([
    flow("Recebimentos STR de contrapartes", "in", true, [0, 50, 150, 200, 250, 300, 300, 250, 200, 100]),
    flow("Pix recebidos", "in", true, [40, 60, 70, 70, 60, 60, 70, 70, 60, 40]),
    flow("Vencimento de compromissadas", "in", true, [0, 500, 0, 0, 0, 0, 0, 0, 0, 0]),
    flow("Pix enviados", "out", true, [50, 70, 80, 80, 70, 70, 80, 80, 70, 50]),
    flow("Liquidação de títulos (Selic/B3)", "out", true, [0, 0, 600, 0, 0, 0, 0, 0, 0, 0]),
    flow("Liquidação de câmbio", "out", true, [0, 0, 0, 0, 0, 500, 0, 0, 0, 0]),
    flow("TEDs e pagamentos de clientes", "out", false, [100, 150, 200, 200, 150, 150, 150, 150, 100, 50]),
  ]);
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const body = {
    ...p, queue_noncritical: queue,
    flows: flows.map((f) => ({ name: f.name, kind: f.kind, time_critical: f.time_critical, amounts: SLOTS.map((_, i) => f[`s${i}`] ?? 0) })),
  };
  const { data, error } = useCompute<Resp>("/liquidity/intraday", body);
  const rows = data ? data.slots.map((s, i) => ({ slot: s, base: data.base.balance[i], stress: data.stress.balance[i] })) : [];

  return (
    <Lab title="Um dia na conta de reservas (R$ milhões)">
      <div className="grid">
        <NumField label="Saldo de abertura" value={p.opening} onChange={set("opening")} step={50} min={0} />
        <NumField label="Colateral livre (títulos públicos)" value={p.collateral} onChange={set("collateral")} step={100} min={0} />
        <NumField label="Haircut do colateral" percent value={p.haircut} onChange={set("haircut")} step={1} min={0} max={100} />
        <NumField label="Atraso dos recebimentos (horas)" value={p.delay_slots} onChange={(v) => set("delay_slots")(Math.round(v))} step={1} min={0} max={9} />
        <NumField label="Recebimentos que não chegam" percent value={p.inflow_failure} onChange={set("inflow_failure")} step={5} min={0} max={100} />
        <label className="field">
          Gestão da fila no estresse
          <span style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            <input type="checkbox" checked={queue} onChange={(e) => setQueue(e.target.checked)} style={{ width: "auto" }} />
            segurar pagamentos não críticos
          </span>
        </label>
      </div>
      <EditableTable<Flow> rows={flows} onChange={setFlows}
        newRow={() => flow("Novo fluxo", "out", true, SLOTS.map(() => 0))}
        columns={[
          { key: "name", label: "Fluxo", type: "text", width: 210 },
          { key: "kind", label: "Tipo", type: "select", width: 100, options: [["in", "Recebimento"], ["out", "Pagamento"]] },
          { key: "time_critical", label: "Crítico", type: "check", width: 56 },
          ...SLOTS.map((s, i) => ({ key: `s${i}` as const, label: s, type: "number" as const, width: 62 })),
        ]} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Liquidez disponível" value={mi(data.available)} sub={`redesconto intradia: até ${mi(data.credit_capacity)}`} />
            <Stat label="Uso máximo — base" value={mi(data.base.max_usage)} sub={`vale às ${data.base.min_slot}`} />
            <Stat label="Uso máximo — estresse" value={mi(data.stress.max_usage)} sub={`${fmtPct(data.stress.usage_over_available, 0)} do disponível`} />
            <Stat label="Redesconto usado no estresse" value={mi(data.stress.credit_used)}
              sub={<PassBadge ok={data.stress.shortfall === 0} label={data.stress.shortfall === 0 ? "todos os pagamentos liquidam" : `faltam ${mi(data.stress.shortfall)}`} />} />
          </div>
          <div className="chart-title">Saldo da conta de reservas ao longo do dia</div>
          <div className="chart-sub">Abaixo de zero, o saldo é coberto pelo redesconto intradia; abaixo da linha vermelha, falta colateral.</div>
          <Legend items={[
            { label: "Base", color: "var(--series-1)" }, { label: "Estresse", color: "var(--series-3)" },
            { label: "Limite do redesconto intradia", color: "var(--critical)" },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="slot" {...axisProps} />
              <YAxis {...axisProps} width={52} domain={[(min: number) => Math.min(min, -data.credit_capacity) - 100, "auto"]} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <ReferenceLine y={-data.credit_capacity} stroke="var(--critical)" strokeDasharray="4 4" />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={payload[0].payload.slot} rows={[
                  { label: "Base", value: mi(payload[0].payload.base), color: "var(--series-1)" },
                  { label: "Estresse", value: mi(payload[0].payload.stress), color: "var(--series-3)" },
                ]} />
              ) : null} />
              <Line dataKey="base" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line dataKey="stress" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
