import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, SelectField } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";
import { DEFAULT_ITEMS, type IndexedItem, itemColumns, newItem } from "./indexedItems";

type Scenario = { name: string; delta_bps: number; ramp_months: number };
type Row = {
  name: string; selic: number[]; constant: number[]; dynamic: number[];
  constant_12m: number; dynamic_12m: number; constant_total: number; dynamic_total: number;
  constant_delta_12m: number; dynamic_delta_12m: number; constant_delta_total: number; dynamic_delta_total: number;
};
type Resp = { months: number[]; scenarios: Row[] };

const COLORS = ["var(--series-1)", "var(--series-3)", "var(--series-2)", "var(--series-4)", "var(--series-5)"];

export default function DynamicNIIPage() {
  return (
    <>
      <h1>ΔNII com balanço dinâmico</h1>
      <p className="lead">
        O ΔNII regulatório usa balanço constante: o que vence é renovado igual, e o choque é instantâneo. A gestão da
        margem pergunta outra coisa: com o orçamento de crescimento do banco e a trajetória de Selic que o Copom deve seguir,
        quanto a margem vai mudar nos próximos dois anos?
      </p>

      <h2>1. Balanço constante × dinâmico</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th></th><th>Balanço constante</th><th>Balanço dinâmico</th></tr></thead>
          <tbody>
            <tr><td>Volume</td><td>fixo; vencimentos renovados no mesmo volume</td><td>cada carteira cresce pela meta do orçamento</td></tr>
            <tr><td>Preço do volume novo</td><td>taxa de mercado do momento, mesmo spread</td><td>idem, e o crescimento entra todo a mercado</td></tr>
            <tr><td>Choque</td><td>instantâneo e paralelo (regulatório)</td><td>trajetória de Selic em degraus, nas reuniões do Copom</td></tr>
            <tr><td>Uso</td><td>comparação entre bancos, limite de apetite</td><td>orçamento, plano de capital, decisão de hedge</td></tr>
          </tbody>
        </table>
      </div>
      <Formula tex={String.raw`\text{NII}_m = \sum_i s_i\, B_{i,m}\,\frac{r_{i,m}}{12}, \qquad B_{i,m} = B_{i,0}\,(1+g_i)^{m/12}`} where={[
        [String.raw`s_i`, "+1 para ativos, −1 para passivos"],
        [String.raw`B_{i,m}`, "saldo da posição i no mês m"],
        [String.raw`g_i`, "crescimento anual da carteira (zero no balanço constante)"],
        [String.raw`r_{i,m}`, "taxa do mês: pelo indexador nos pós-fixados; nos prefixados, média entre o estoque antigo e o volume renovado a mercado"],
      ]} />
      <Formula tex={String.raw`\bar r_{m} = \frac{\bar r_{m-1}\,B_{m-1}\,(1 - 1/T) + \big(\text{CDI}_m + \delta\big)\,\big(B_{m-1}/T + \Delta B_m\big)}{B_m}`} where={[
        [String.raw`\bar r_m`, "taxa média do estoque prefixado no mês m"],
        [String.raw`T`, "prazo médio da carteira, em meses: 1/T dela vence e renova a cada mês"],
        [String.raw`\delta`, "spread da carteira sobre o CDI de hoje, mantido no volume novo"],
        [String.raw`\Delta B_m`, "crescimento do saldo no mês (volume novo)"],
      ]} />
      <CodeSnippet name="selic_path" />

      <h2>2. Laboratório</h2>
      <DynamicLab />
      <Callout title="O que observar">
        <ul>
          <li>Com crescimento, a margem aumenta em todos os cenários; o que interessa é a diferença entre eles, e ela também muda com o balanço dinâmico.</li>
          <li>O crédito prefixado demora a reprecificar (prazo de 24 meses): num ciclo de cortes, a margem melhora devagar à medida que o funding em CDI fica mais barato.</li>
          <li>Aumente o crescimento do crédito prefixado: o volume novo entra à taxa de mercado e a carteira reprecifica mais rápido — o crescimento encurta o “prazo de repricing” efetivo.</li>
          <li>Leve a Selic abaixo de 8,5% no cenário de cortes: a poupança muda de regime e o efeito aparece no meio da trajetória (veja <Link to="/irrbb/risco-de-base">risco de base</Link>).</li>
        </ul>
      </Callout>
    </>
  );
}

function DynamicLab() {
  const [p, setP] = useState({ selic: 0.14, ipca: 0.045, horizon: 24 });
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { name: "Base (Selic estável)", delta_bps: 0, ramp_months: 1 },
    { name: "Ciclo de alta", delta_bps: 300, ramp_months: 9 },
    { name: "Ciclo de cortes", delta_bps: -650, ramp_months: 15 },
  ]);
  const [items, setItems] = useState<IndexedItem[]>(DEFAULT_ITEMS);
  const [mode, setMode] = useState<"constant" | "dynamic">("dynamic");
  const set = <K extends keyof typeof p>(k: K) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/irrbb/dynamic-nii", { ...p, scenarios, items });

  const rows = data ? data.months.map((m, i) => ({
    m, ...Object.fromEntries(data.scenarios.flatMap((s, j) => [[`nii${j}`, s[mode][i]], [`selic${j}`, s.selic[i]]])),
  })) : [];

  return (
    <Lab title="Margem financeira mensal por cenário de Copom (R$ milhões)">
      <div className="grid">
        <NumField label="Selic hoje" percent value={p.selic} onChange={set("selic")} step={0.25} min={0} />
        <NumField label="IPCA" percent value={p.ipca} onChange={set("ipca")} step={0.25} />
        <NumField label="Horizonte (meses)" value={p.horizon} onChange={(v) => set("horizon")(Math.round(v))} step={12} min={12} max={36} />
        <SelectField label="Gráfico" value={mode} onChange={setMode} options={[["dynamic", "Balanço dinâmico"], ["constant", "Balanço constante"]]} />
      </div>
      <h3>Cenários (o primeiro é a referência)</h3>
      <EditableTable<Scenario> rows={scenarios} onChange={(r) => setScenarios(r.slice(0, 5))}
        newRow={() => ({ name: "Novo cenário", delta_bps: 100, ramp_months: 6 })}
        columns={[
          { key: "name", label: "Cenário", type: "text", width: 200 },
          { key: "delta_bps", label: "Variação da Selic (bps)", type: "number", width: 140 },
          { key: "ramp_months", label: "Meses até o nível final", type: "number", width: 140 },
        ]} />
      <h3>Balanço</h3>
      <EditableTable<IndexedItem> rows={items} onChange={setItems} newRow={newItem} columns={itemColumns(true)} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <div className="chart-title">Trajetória da Selic</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="m" {...axisProps} />
                  <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={44} domain={["auto", "auto"]} />
                  <ReferenceLine y={0.085} stroke="var(--axis)" strokeDasharray="4 4" />
                  {data.scenarios.map((s, j) => <Line key={s.name} type="stepAfter" dataKey={`selic${j}`} stroke={COLORS[j]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="chart-title">Margem financeira mensal — {mode === "dynamic" ? "balanço dinâmico" : "balanço constante"}</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="m" {...axisProps} />
                  <YAxis {...axisProps} width={44} domain={["auto", "auto"]} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`Mês ${payload[0].payload.m}`} rows={data.scenarios.map((s, j) => ({ label: s.name, value: fmtNum(payload[0].payload[`nii${j}`], 2), color: COLORS[j] }))} />
                  ) : null} />
                  {data.scenarios.map((s, j) => <Line key={s.name} dataKey={`nii${j}`} stroke={COLORS[j]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Legend items={data.scenarios.map((s, j) => ({ label: s.name, color: COLORS[j] }))} />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr><th>Cenário</th><th className="num">NII 12m constante</th><th className="num">ΔNII 12m</th><th className="num">NII 12m dinâmico</th><th className="num">ΔNII 12m</th><th className="num">ΔNII {p.horizon}m constante</th><th className="num">ΔNII {p.horizon}m dinâmico</th></tr>
              </thead>
              <tbody>
                {data.scenarios.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="num">{fmtNum(s.constant_12m, 1)}</td><td className="num">{fmtNum(s.constant_delta_12m, 1)}</td>
                    <td className="num">{fmtNum(s.dynamic_12m, 1)}</td><td className="num">{fmtNum(s.dynamic_delta_12m, 1)}</td>
                    <td className="num">{fmtNum(s.constant_delta_total, 1)}</td><td className="num">{fmtNum(s.dynamic_delta_total, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Lab>
  );
}
