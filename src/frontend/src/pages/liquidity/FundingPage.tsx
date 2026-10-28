import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, RegNote, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Source = { name: string; product: string; amount: number; days: number };
type Unit = "pct" | "ratio" | "bps" | "x";
type Metric = "top10_share" | "top1_share" | "hhi_counterparty" | "short_term_share" | "coverage_top3";
type Indicator = { name: string; metric: Metric | null; value: number; amber: number; red: number; higher_is_worse: boolean; unit: Unit };
type Status = "verde" | "amarela" | "vermelha";
type Resp = {
  concentration: {
    total: number; top1_share: number; top10_share: number; hhi_counterparty: number; hhi_product: number; short_term_share: number;
    ranked: (Source & { share: number })[];
    by_product: { product: string; amount: number; share: number }[];
    loss_of_top: { k: number; name: string; outflow: number; buffer_left: number; coverage: number }[];
  };
  contingency: { indicators: (Indicator & { status: Status })[]; status: Status; level: string; counts: Record<Status, number> };
};

const STATUS_COLOR: Record<Status, string> = { verde: "var(--good)", amarela: "var(--warning)", vermelha: "var(--critical)" };
const fmtUnit = (v: number, u: Unit) => (u === "pct" ? fmtPct(v, 1) : u === "bps" ? `${fmtNum(v, 0)} bps` : u === "x" ? `${fmtNum(v, 2)}×` : fmtNum(v, 3));
const ACTIONS: Record<string, string[]> = {
  normal: ["Monitoramento diário dos indicadores", "Testes periódicos do plano (simulação de acionamento)"],
  alerta: ["Comitê de liquidez em reunião extraordinária", "Alongar captações e evitar vencimentos concentrados", "Verificar a monetização do colchão (compromissadas com títulos públicos)"],
  "contingência": ["Comitê de crise e comunicação ao BCB", "Venda ou compromissada de ativos líquidos", "Suspender a originação de crédito de prazo longo", "Acionar linhas contingentes e, em último caso, a assistência de liquidez do BCB"],
};

function Badge({ status, label }: { status: Status; label?: string }) {
  return <span className="badge"><span className="dot" style={{ background: STATUS_COLOR[status] }} />{label ?? status}</span>;
}

export default function FundingPage() {
  return (
    <>
      <h1>Concentração de funding e plano de contingência</h1>
      <p className="lead">
        O <Link to="/liquidez/lcr">LCR</Link> supõe percentuais padronizados de saída. Na prática, o que derruba um banco
        médio é a saída de poucos credores grandes ao mesmo tempo. Medir essa concentração e decidir antes o que fazer
        quando os sinais aparecem é o trabalho do plano de contingência.
      </p>

      <h2>1. Medidas de concentração</h2>
      <Formula tex={String.raw`\text{HHI} = \sum_i s_i^2, \qquad s_i = \frac{F_i}{\sum_j F_j}`} where={[
        [String.raw`F_i`, "funding vindo do credor (ou produto) i"],
        [String.raw`s_i`, "participação de i no funding total"],
        [String.raw`\text{HHI}`, "índice de Herfindahl-Hirschman: 1/n com n credores iguais; 1 com um credor só. 0,10 equivale a ~10 credores do mesmo tamanho"],
      ]} />
      <p>
        Complementam o HHI: a participação dos 10 maiores credores, a concentração por produto (CDB, LF, compromissada,
        interbancário) e a concentração de vencimentos. O teste mais direto é perguntar: <em>se os k maiores credores não renovarem, quanto sobra do colchão?</em>
      </p>
      <CodeSnippet name="concentration" />

      <h2>2. Indicadores de alerta antecipado e níveis do plano</h2>
      <p>
        O plano de contingência de liquidez (exigido pela Res. CMN 4.557/2017) define indicadores com dois limites. Cruzar o
        primeiro põe o banco em <strong>alerta</strong>; cruzar o segundo aciona a <strong>contingência</strong>. Cada nível tem
        responsáveis, comunicação e ações definidos antes da crise — quando ela chega, não há tempo para decidir do zero.
      </p>
      <CodeSnippet name="ewi_status" />

      <h2>3. Laboratório</h2>
      <FundingLab />
      <Callout title="O que observar">
        <ul>
          <li>A distribuidora de plataforma é um único “credor” no cadastro, mas são milhares de investidores de varejo: tratar como um só superestima a concentração, separar demais a subestima. A escolha de granularidade é uma decisão de modelo.</li>
          <li>Reduza o colchão: a cobertura da saída dos três maiores cai abaixo de 1× e o plano vai para contingência, mesmo com o LCR confortável.</li>
          <li>Alongue os CDBs de curto prazo (aumente os dias): a concentração por credor não muda, mas a de vencimentos sim.</li>
          <li>Indicadores de mercado (spread da LF, saída de depósitos) costumam piorar antes dos regulatórios — por isso são “antecipados”.</li>
        </ul>
      </Callout>
      <RegNote>A concentração de captações por contraparte e por prazo aparece no <Link to="/cadocs#dli">DLI</Link> e no <Link to="/cadocs#drl">DRL</Link>.</RegNote>
    </>
  );
}

function FundingLab() {
  const [buffer, setBuffer] = useState(3_200);
  const [sources, setSources] = useState<Source[]>([
    { name: "Distribuidora Maré (plataformas)", product: "CDB", amount: 1_200, days: 365 },
    { name: "Fundo de pensão Aurora", product: "CDB", amount: 900, days: 400 },
    { name: "Tesouraria Corporativa Brava", product: "CDB", amount: 650, days: 20 },
    { name: "Fundo DI Cobalto", product: "Compromissada", amount: 600, days: 1 },
    { name: "Seguradora Duna", product: "LF", amount: 550, days: 720 },
    { name: "Banco Estrela", product: "Interbancário", amount: 500, days: 15 },
    { name: "Fundo Fênix", product: "LF", amount: 450, days: 900 },
    { name: "Previdência Gaia", product: "CDB", amount: 400, days: 180 },
    { name: "Family office Hera", product: "CDB", amount: 350, days: 60 },
    { name: "Fundo Íris", product: "Compromissada", amount: 320, days: 1 },
    { name: "Corporativo Jade", product: "Depósito a prazo", amount: 300, days: 90 },
    { name: "Corporativo Kappa", product: "Depósito à vista", amount: 280, days: 0 },
    { name: "Fundo Lótus", product: "LF", amount: 250, days: 1_080 },
    { name: "Corporativo Nexo", product: "Depósito à vista", amount: 200, days: 0 },
  ]);
  const [indicators, setIndicators] = useState<Indicator[]>([
    { name: "LCR", metric: null, value: 1.32, amber: 1.2, red: 1.05, higher_is_worse: false, unit: "ratio" },
    { name: "10 maiores credores / funding de atacado", metric: "top10_share", value: 0, amber: 0.8, red: 0.9, higher_is_worse: true, unit: "pct" },
    { name: "HHI por credor", metric: "hhi_counterparty", value: 0, amber: 0.08, red: 0.12, higher_is_worse: true, unit: "ratio" },
    { name: "Vencimentos em 30 dias / funding", metric: "short_term_share", value: 0, amber: 0.3, red: 0.45, higher_is_worse: true, unit: "pct" },
    { name: "Colchão / saída dos 3 maiores", metric: "coverage_top3", value: 0, amber: 1.5, red: 1.0, higher_is_worse: false, unit: "x" },
    { name: "Saída de depósitos em 5 dias", metric: null, value: 0.04, amber: 0.05, red: 0.10, higher_is_worse: true, unit: "pct" },
    { name: "Spread da LF de 2 anos sobre o CDI", metric: null, value: 95, amber: 130, red: 180, higher_is_worse: true, unit: "bps" },
  ]);
  const { data, error } = useCompute<Resp>("/liquidity/funding", { buffer, sources, indicators });
  const setManual = (i: number, v: number) => setIndicators(indicators.map((x, j) => (j === i ? { ...x, value: v } : x)));

  return (
    <Lab title="Funding de atacado (R$ milhões)">
      <div className="grid"><NumField label="Colchão de ativos líquidos (HQLA)" value={buffer} onChange={setBuffer} step={100} min={0} /></div>
      <EditableTable<Source> rows={sources} onChange={setSources}
        newRow={() => ({ name: "Novo credor", product: "CDB", amount: 100, days: 90 })}
        columns={[
          { key: "name", label: "Credor", type: "text", width: 230 },
          { key: "product", label: "Produto", type: "select", width: 150, options: ["CDB", "LF", "Compromissada", "Interbancário", "Depósito a prazo", "Depósito à vista"].map((x) => [x, x]) },
          { key: "amount", label: "Saldo", type: "number", width: 90 },
          { key: "days", label: "Dias até vencer", type: "number", width: 100 },
        ]}
        computed={data ? [{ label: "Participação", values: sources.map((s) => fmtPct(s.amount / data.concentration.total, 1)) }] : []} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Maior credor" value={fmtPct(data.concentration.top1_share, 1)} />
            <Stat label="10 maiores" value={fmtPct(data.concentration.top10_share, 1)} />
            <Stat label="HHI por credor" value={fmtNum(data.concentration.hhi_counterparty, 3)} sub={`≈ ${fmtNum(1 / data.concentration.hhi_counterparty, 0)} credores iguais`} />
            <Stat label="HHI por produto" value={fmtNum(data.concentration.hhi_product, 3)} />
          </div>
          <div className="grid-2">
            <div>
              <div className="chart-title">Se os k maiores credores saírem</div>
              <Legend items={[{ label: "Saída acumulada", color: "var(--series-3)", box: true }, { label: "Colchão", color: "var(--series-1)" }]} />
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data.concentration.loss_of_top} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="k" {...axisProps} />
                  <YAxis {...axisProps} width={48} />
                  <ReferenceLine y={buffer} stroke="var(--series-1)" strokeWidth={2} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`${payload[0].payload.k} maiores (até ${payload[0].payload.name})`} rows={[
                      { label: "Saída", value: `${fmtNum(payload[0].payload.outflow, 0)} mi`, color: "var(--series-3)" },
                      { label: "Sobra do colchão", value: `${fmtNum(payload[0].payload.buffer_left, 0)} mi` },
                      { label: "Cobertura", value: `${fmtNum(payload[0].payload.coverage, 2)}×` },
                    ]} />
                  ) : null} />
                  <Bar dataKey="outflow" fill="var(--series-3)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="chart-title">Funding por produto</div>
              <ResponsiveContainer width="100%" height={252}>
                <BarChart data={data.concentration.by_product} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} />
                  <YAxis type="category" dataKey="product" width={120} {...axisProps} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={payload[0].payload.product} rows={[{ label: "Saldo", value: `${fmtNum(payload[0].payload.amount, 0)} mi` }, { label: "Participação", value: fmtPct(payload[0].payload.share, 1) }]} />
                  ) : null} />
                  <Bar dataKey="share" fill="var(--series-2)" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h3>Indicadores de alerta antecipado</h3>
          <p className="muted" style={{ fontSize: 13 }}>Os indicadores de concentração vêm da carteira acima; os demais você informa.</p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Indicador</th><th className="num">Valor</th><th className="num">Alerta</th><th className="num">Contingência</th><th>Status</th></tr></thead>
              <tbody>
                {data.contingency.indicators.map((ind, i) => (
                  <tr key={ind.name}>
                    <td>{ind.name}</td>
                    <td className="num">
                      {ind.metric ? fmtUnit(ind.value, ind.unit) : (
                        <input type="number" style={{ width: 90, textAlign: "right" }}
                          value={ind.unit === "pct" ? Number((indicators[i].value * 100).toFixed(4)) : indicators[i].value}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setManual(i, ind.unit === "pct" ? v / 100 : v); }} />
                      )}
                    </td>
                    <td className="num">{ind.higher_is_worse ? "≥ " : "≤ "}{fmtUnit(ind.amber, ind.unit)}</td>
                    <td className="num">{ind.higher_is_worse ? "≥ " : "≤ "}{fmtUnit(ind.red, ind.unit)}</td>
                    <td><Badge status={ind.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ marginTop: 14, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <strong>Nível do plano:</strong> <Badge status={data.contingency.status} label={data.contingency.level} />
            </div>
            <ul style={{ margin: 0 }}>{ACTIONS[data.contingency.level].map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        </>
      )}
    </Lab>
  );
}
