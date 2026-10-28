import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, PassBadge, SelectField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Floor = "none" | "zero" | "eba";
type Margins = "include_rf" | "include_spread" | "exclude";
type Ccy = { code: string; fx: number; short_rate: number; long_rate: number; parallel: number; short: number; long: number };
type Position = { name: string; currency: string; side: "asset" | "liability"; amount: number; rate: number; margin: number; repricing: number };
type Agg = "net" | "basel" | "eba";
type Resp = {
  scenarios: { scenario: string; label: string; by_currency: Record<string, number>; net: number; basel: number; eba: number }[];
  measure: Record<Agg, { value: number; scenario: string }>;
  outlier: Record<Agg, number | null>;
  floor_curves: Record<string, { tenor: number; base: number; shocked: number; floored: number; floor: number | null }[]>;
  margins: { margins: Margins; basel: number; scenario: string }[];
};

const MARGIN_LABEL: Record<Margins, string> = {
  include_rf: "Fluxos com margem, desconto pela livre de risco",
  include_spread: "Fluxos com margem, desconto pela livre de risco + margem",
  exclude: "Fluxos sem margem, desconto pela livre de risco",
};
const AGG_LABEL: Record<Agg, string> = { net: "Compensando moedas", basel: "Basileia: só perdas", eba: "EBA: ganhos a 50%" };

export default function RegulatoryEVEPage() {
  return (
    <>
      <h1>ΔEVE regulatório: moedas, piso e margens</h1>
      <p className="lead">
        A <Link to="/irrbb">página de ΔEVE</Link> mostra o cálculo numa moeda só. A métrica regulatória tem três detalhes que
        mudam bastante o número final: como somar moedas, o que fazer com taxas que ficam negativas depois do choque e se a
        margem comercial entra nos fluxos.
      </p>

      <h2>1. Agregação entre moedas</h2>
      <p>
        Calcula-se o ΔEVE de cada moeda relevante com os choques daquela moeda. Na hora de somar, Basileia não deixa um ganho
        em dólar compensar uma perda em reais: os choques não acontecem juntos, e a correlação entre curvas não é estável.
      </p>
      <Formula tex={String.raw`\Delta\text{EVE}_i = \sum_{c} \max\!\big(0,\ -\Delta\text{EVE}_{i,c}\big), \qquad \Delta\text{EVE} = \max_{i}\ \Delta\text{EVE}_i`} where={[
        [String.raw`i`, "cenário de choque (os seis do BCBS)"],
        [String.raw`c`, "moeda relevante"],
        [String.raw`\Delta\text{EVE}_{i,c}`, "variação do valor econômico na moeda c, no cenário i, convertida para reais"],
        [String.raw`\max(0, \cdot)`, "só as perdas entram; ganhos de cada moeda são descartados (SRP31.129)"],
      ]} />
      <p>Algumas jurisdições são menos conservadoras: a EBA, na Europa, soma os ganhos com peso de 50%.</p>

      <h2>2. Piso pós-choque</h2>
      <p>
        Com juros baixos, o paralelo para baixo leva a curva para território muito negativo. Basileia deixa o supervisor
        impor um piso, que não pode ser maior que zero (SRP31.93). Um exemplo conhecido é o da EBA: −100 bps no prazo zero,
        subindo 5 bps por ano até 0% em 20 anos. Para o real, com taxas de dois dígitos, o piso quase nunca é atingido; para o euro, é.
      </p>
      <Formula tex={String.raw`r^{\text{choque}}(t) = \max\!\Big(r(t) + \Delta r_i(t),\ \min\big(r(t),\ \underline{r}(t)\big)\Big)`} where={[
        [String.raw`r(t)`, "taxa da curva base no prazo t"],
        [String.raw`\Delta r_i(t)`, "choque do cenário i no prazo t"],
        [String.raw`\underline{r}(t)`, "piso no prazo t; se a taxa base já está abaixo dele, o piso passa a ser a própria taxa base"],
      ]} />
      <CodeSnippet name="post_shock_rate" />

      <h2>3. Margens comerciais</h2>
      <p>
        A taxa de um crédito tem a parte de juros livre de risco e a margem (spread de crédito, custo operacional, lucro).
        O banco escolhe se tira a margem dos fluxos (SRP31.100). Se a mantém, pode descontar pela livre de risco + margem;
        se a tira, desconta pela livre de risco. A escolha muda o tamanho dos fluxos e, com isso, a duration e o ΔEVE.
      </p>
      <CodeSnippet name="currency_eve" />

      <h2>4. Laboratório</h2>
      <RegulatoryLab />
      <Callout title="O que observar">
        <ul>
          <li>No paralelo para cima, o real perde e o euro ganha. Compensando as moedas, a perda parece menor; pela regra de Basileia, o ganho em euro some.</li>
          <li>Olhe o paralelo para baixo em euro: sem piso, a curva curta vai a −1,4%; o piso da EBA a segura perto de −1% e o piso zero, em 0% — a perda do euro cai na mesma ordem.</li>
          <li>Manter a margem e descontar pela livre de risco dá os fluxos maiores e o maior ΔEVE; descontar com a margem encurta a duration e reduz o número.</li>
          <li>O teste de outlier compara a maior perda agregada com 15% do Nível I: a escolha da metodologia pode decidir se o banco é ou não outlier.</li>
        </ul>
      </Callout>
    </>
  );
}

function RegulatoryLab() {
  const [tier1, setTier1] = useState(1_200);
  const [floor, setFloor] = useState<Floor>("eba");
  const [margins, setMargins] = useState<Margins>("include_rf");
  const [ccys, setCcys] = useState<Ccy[]>([
    { code: "BRL", fx: 1, short_rate: 0.145, long_rate: 0.135, parallel: 0.04, short: 0.05, long: 0.03 },
    { code: "USD", fx: 5.5, short_rate: 0.042, long_rate: 0.042, parallel: 0.02, short: 0.03, long: 0.015 },
    { code: "EUR", fx: 6.3, short_rate: 0.006, long_rate: 0.022, parallel: 0.02, short: 0.025, long: 0.01 },
  ]);
  const [positions, setPositions] = useState<Position[]>([
    { name: "Crédito prefixado", currency: "BRL", side: "asset", amount: 2_500, rate: 0.20, margin: 0.06, repricing: 3 },
    { name: "CDB prefixado", currency: "BRL", side: "liability", amount: 2_000, rate: 0.142, margin: 0, repricing: 1 },
    { name: "Bond corporativo", currency: "USD", side: "asset", amount: 60, rate: 0.06, margin: 0.02, repricing: 7 },
    { name: "Captação externa", currency: "USD", side: "liability", amount: 80, rate: 0.045, margin: 0.005, repricing: 2 },
    { name: "Trade finance", currency: "EUR", side: "asset", amount: 40, rate: 0.03, margin: 0.015, repricing: 1 },
    { name: "Empréstimo de longo prazo tomado", currency: "EUR", side: "liability", amount: 35, rate: 0.025, margin: 0, repricing: 10 },
  ]);
  const [chartCcy, setChartCcy] = useState("EUR");
  const body = {
    tier1, floor, margins, positions,
    currencies: ccys.map((c) => ({
      code: c.code, fx: c.fx, shocks: { parallel: c.parallel, short: c.short, long: c.long },
      curve: [{ tenor: 0.25, rate: c.short_rate }, { tenor: 30, rate: c.long_rate }],
    })),
  };
  const { data, error } = useCompute<Resp>("/irrbb/regulatory", body);
  const codes = ccys.map((c) => c.code);
  const curve = data?.floor_curves[chartCcy] ?? data?.floor_curves[codes[0]] ?? [];

  return (
    <Lab title="Banco com posições em três moedas (milhões na moeda; resultados em R$)">
      <div className="grid">
        <NumField label="Nível I (R$)" value={tier1} onChange={setTier1} step={50} min={1} />
        <SelectField label="Piso pós-choque" value={floor} onChange={setFloor} options={[["none", "Sem piso"], ["eba", "EBA: −100 bps + 5 bps/ano"], ["zero", "Zero"]]} />
        <SelectField label="Margens comerciais" value={margins} onChange={setMargins} options={Object.entries(MARGIN_LABEL) as [Margins, string][]} />
      </div>
      <h3>Moedas</h3>
      <p className="muted" style={{ fontSize: 13 }}>Curva base linear entre a taxa de 3 meses e a de 30 anos. Choques do BCBS para USD e EUR; BRL conforme a regulação brasileira.</p>
      <EditableTable<Ccy> rows={ccys} onChange={setCcys}
        newRow={() => ({ code: "GBP", fx: 7, short_rate: 0.04, long_rate: 0.045, parallel: 0.025, short: 0.03, long: 0.015 })}
        columns={[
          { key: "code", label: "Moeda", type: "text", width: 70 },
          { key: "fx", label: "R$ por unidade", type: "number", width: 90 },
          { key: "short_rate", label: "Taxa 3m", type: "percent", width: 80 },
          { key: "long_rate", label: "Taxa 30a", type: "percent", width: 80 },
          { key: "parallel", label: "Choque paralelo", type: "percent", width: 90 },
          { key: "short", label: "Choque curto", type: "percent", width: 90 },
          { key: "long", label: "Choque longo", type: "percent", width: 90 },
        ]} />
      <h3>Posições</h3>
      <EditableTable<Position> rows={positions} onChange={setPositions}
        newRow={() => ({ name: "Nova posição", currency: codes[0] ?? "BRL", side: "asset", amount: 100, rate: 0.1, margin: 0.02, repricing: 2 })}
        columns={[
          { key: "name", label: "Posição", type: "text", width: 200 },
          { key: "currency", label: "Moeda", type: "select", width: 80, options: codes.map((c) => [c, c]) },
          { key: "side", label: "Lado", type: "select", width: 90, options: [["asset", "Ativo"], ["liability", "Passivo"]] },
          { key: "amount", label: "Saldo", type: "number", width: 80 },
          { key: "rate", label: "Taxa", type: "percent", width: 70 },
          { key: "margin", label: "Margem", type: "percent", width: 70 },
          { key: "repricing", label: "Prazo (anos)", type: "number", width: 80 },
        ]} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            {(["net", "basel", "eba"] as Agg[]).map((k) => (
              <Stat key={k} label={AGG_LABEL[k]} value={`${fmtNum(data.measure[k].value, 1)} mi`}
                sub={<>{fmtPct(data.outlier[k], 1)} do Nível I · <PassBadge ok={(data.outlier[k] ?? 0) <= 0.15} label="outlier 15%" /></>} />
            ))}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Cenário</th>{codes.map((c) => <th key={c} className="num">ΔEVE {c}</th>)}<th className="num">Perda compensando</th><th className="num">Perda Basileia</th><th className="num">Perda EBA</th></tr>
              </thead>
              <tbody>
                {data.scenarios.map((s) => (
                  <tr key={s.scenario}>
                    <td>{s.label}</td>
                    {codes.map((c) => <td key={c} className="num" style={{ color: (s.by_currency[c] ?? 0) < 0 ? "var(--critical)" : undefined }}>{fmtNum(s.by_currency[c] ?? 0, 1)}</td>)}
                    <td className="num">{fmtNum(Math.max(s.net, 0), 1)}</td><td className="num"><strong>{fmtNum(s.basel, 1)}</strong></td><td className="num">{fmtNum(s.eba, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                Paralelo para baixo com piso:
                <select value={chartCcy} onChange={(e) => setChartCcy(e.target.value)} style={{ width: "auto" }}>
                  {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Legend items={[
                { label: "Curva base", color: "var(--series-1)" }, { label: "Choque sem piso", color: "var(--series-3)" },
                { label: "Choque com piso", color: "var(--series-2)" }, ...(floor !== "none" ? [{ label: "Piso", color: "var(--muted)" }] : []),
              ]} />
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="tenor" type="number" domain={[0, 30]} {...axisProps} />
                  <YAxis tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} width={50} domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke="var(--axis)" />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`${payload[0].payload.tenor} anos`} rows={[
                      { label: "Base", value: fmtPct(payload[0].payload.base, 2), color: "var(--series-1)" },
                      { label: "Sem piso", value: fmtPct(payload[0].payload.shocked, 2), color: "var(--series-3)" },
                      { label: "Com piso", value: fmtPct(payload[0].payload.floored, 2), color: "var(--series-2)" },
                    ]} />
                  ) : null} />
                  <Line dataKey="base" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="shocked" stroke="var(--series-3)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Line dataKey="floored" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {floor !== "none" && <Line dataKey="floor" stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="chart-title">Mesma carteira, três tratamentos de margem (Basileia)</div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Tratamento</th><th className="num">ΔEVE</th><th>Pior cenário</th></tr></thead>
                  <tbody>
                    {data.margins.map((m) => (
                      <tr key={m.margins} style={m.margins === margins ? { fontWeight: 600 } : undefined}>
                        <td>{MARGIN_LABEL[m.margins]}</td><td className="num">{fmtNum(m.basel, 1)}</td>
                        <td>{data.scenarios.find((s) => s.scenario === m.scenario)?.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Lab>
  );
}
