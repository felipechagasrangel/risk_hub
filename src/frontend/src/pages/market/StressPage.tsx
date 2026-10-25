import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { EditableTable } from "../../components/EditableTable";
import { Link } from "react-router-dom";
import { Callout, Formula, Lab, Legend, M, NumField, RegNote, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Factor = "equity" | "fx" | "rates";
type Position = { name: string; factor: Factor; value: number; vol_annual: number; duration: number; convexity: number };
type Shocks = Record<Factor, number>;
type ScenarioResult = {
  key: string; kind: string; name: string; period: string; description: string; shocks: Shocks;
  pnl_by_position: number[]; total_pnl: number; loss_vs_var_10d: number | null; reverse_multiplier: number | null;
};
type Resp = {
  positions: string[]; var_1d: number; var_10d: number; scenarios: ScenarioResult[];
  worst_scenario: string; loss_limit: number;
};

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const fmtBps = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 10000)} bps`;
const fmtShock = (v: number) => `${v >= 0 ? "+" : ""}${fmtPct(v, 1)}`;

export default function StressPage() {
  const [positions, setPositions] = useState<Position[]>([
    { name: "Ações (Ibovespa)", factor: "equity", value: 1_000_000, vol_annual: 0.25, duration: 0, convexity: 0 },
    { name: "Dólar (USD/BRL)", factor: "fx", value: 500_000, vol_annual: 0.15, duration: 0, convexity: 0 },
    { name: "Prefixado 5 anos", factor: "rates", value: 800_000, vol_annual: 0.08, duration: 4.2, convexity: 21 },
  ]);
  const [rho, setRho] = useState({ equity_fx: -0.4, equity_rates: 0.3, fx_rates: -0.2 });
  const [custom, setCustom] = useState<Shocks>({ equity: -0.3, fx: 0.3, rates: 0.03 });
  const [lossLimit, setLossLimit] = useState(300_000);
  const { data, error } = useCompute<Resp>("/market/stress",
    { positions: positions.slice(0, SERIES.length), correlation: rho, confidence: 0.99, loss_limit: lossLimit, custom });

  return (
    <>
      <h1>Stress testing</h1>
      <p className="lead">
        O VaR diz o que acontece num dia ruim “normal”. O stress test pergunta:
        <em> e se acontecer de novo 2008 — ou algo pior?</em>
      </p>

      <h2>1. Por que o VaR não basta</h2>
      <ul>
        <li><strong>Ele ignora o que está além do quantil.</strong> Um VaR 99% não diz nada sobre o 1% dos piores dias.</li>
        <li><strong>Ele depende do passado recente.</strong> Uma janela de 1 ano sem crise produz um VaR baixo justamente antes da crise.</li>
        <li><strong>Correlações mudam no estresse.</strong> Ativos que diversificam em tempos normais caem juntos no pânico.</li>
      </ul>
      <p>
        O stress test troca a probabilidade pela narrativa: escolhe-se um cenário extremo, mas plausível,
        e reavalia-se a carteira. Ele não tem nível de confiança — é um complemento ao VaR, não um substituto.
      </p>

      <h2>2. Três tipos de stress</h2>
      <div className="grid-2">
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Histórico</h3>
          <p style={{ margin: 0 }}>Repete os movimentos de uma crise real. Objetivo e fácil de comunicar, mas a próxima crise nunca é igual à anterior.</p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Hipotético</h3>
          <p style={{ margin: 0 }}>Um cenário desenhado por especialistas (choque fiscal, guerra, quebra de correlação). Cobre riscos que ainda não aconteceram.</p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Reverso</h3>
          <p style={{ margin: 0 }}>Inverte a pergunta: qual cenário causaria uma perda inaceitável? Revela as vulnerabilidades da carteira.</p>
        </div>
      </div>

      <RegNote>
        <p>
          Além dos testes internos, o BCB fornece cenários próprios de estresse (TEBU). As informações do Icaap e
          desses testes vão no documento 2090. Veja os demais documentos em <Link to="/cadocs">CADOCs</Link>.
        </p>
      </RegNote>

      <h2>3. Reavaliando a carteira</h2>
      <p>Ações e câmbio respondem linearmente ao choque. Para títulos prefixados, usamos duration e convexidade:</p>
      <Formula tex={String.raw`\text{P\&L}_{\text{ações}} = V \cdot \Delta S \qquad \text{P\&L}_{\text{pré}} \approx V\left(-D\,\Delta y + \tfrac{1}{2}\,C\,\Delta y^2\right)`} where={[[String.raw`\text{P\&L}`, "ganho (+) ou perda (−) da posição no cenário"], [String.raw`V`, "exposição da posição, em R$"], [String.raw`\Delta S`, "variação percentual do preço ou do câmbio no cenário"], [String.raw`D`, "duration modificada do título prefixado, em anos"], [String.raw`C`, "convexidade do título"], [String.raw`\Delta y`, "variação da taxa de juros, em decimal (0,01 = 100 bps)"]]} />
      <p>
        A convexidade <M>C</M> é sempre a favor de quem está comprado: suaviza perdas quando os juros
        sobem e amplia ganhos quando caem. Com choques grandes, ignorá-la superestima a perda.
      </p>
      <p>No stress reverso linear, o multiplicador que leva o cenário ao limite de perda é simplesmente:</p>
      <Formula tex={String.raw`k = \frac{\text{Limite de perda}}{\text{Perda no cenário}}`} where={[[String.raw`k`, "multiplicador do cenário: k < 1 significa que o cenário já rompe o limite"], [String.raw`\text{Limite de perda}`, "perda máxima tolerada pela instituição, em R$"], [String.raw`\text{Perda no cenário}`, "perda total da carteira no cenário original"]]} />

      <h2>4. Os cenários</h2>
      <p className="muted" style={{ fontSize: 14 }}>
        Magnitudes aproximadas, para ilustrar ordens de grandeza. Câmbio = variação do USD/BRL (positivo = real
        se desvaloriza); juros = variação da taxa prefixada de ~5 anos.
      </p>
      {data && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Cenário</th><th>Período</th><th className="num">Ações</th><th className="num">Câmbio</th><th className="num">Juros</th></tr></thead>
            <tbody>
              {data.scenarios.filter((s) => s.key !== "custom").map((s) => (
                <tr key={s.key}>
                  <td><strong>{s.name}</strong> <span className="muted">({s.kind})</span><br /><span className="muted" style={{ fontSize: 13 }}>{s.description}</span></td>
                  <td>{s.period}</td>
                  <td className="num">{fmtShock(s.shocks.equity)}</td>
                  <td className="num">{fmtShock(s.shocks.fx)}</td>
                  <td className="num">{fmtBps(s.shocks.rates)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>5. Laboratório</h2>
      <Lab title="Aplique os cenários à carteira">
        <EditableTable<Position>
          rows={positions}
          onChange={(r) => setPositions(r.slice(0, SERIES.length))}
          newRow={() => ({ name: "Nova posição", factor: "equity", value: 100_000, vol_annual: 0.25, duration: 0, convexity: 0 })}
          columns={[
            { key: "name", label: "Posição", type: "text" },
            { key: "factor", label: "Fator", type: "select", width: 110, options: [["equity", "Ações"], ["fx", "Câmbio"], ["rates", "Juros"]] },
            { key: "value", label: "Exposição (− = vendido)", type: "number" },
            { key: "vol_annual", label: "Vol. anual", type: "percent", width: 90 },
            { key: "duration", label: "Duration", type: "number", width: 90 },
            { key: "convexity", label: "Convexidade", type: "number", width: 100 },
          ]}
        />
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Cenário personalizado</h3>
            <div className="grid">
              <NumField label="Ações" percent value={custom.equity} step={5} onChange={(v) => setCustom({ ...custom, equity: v })} />
              <NumField label="Câmbio" percent value={custom.fx} step={5} onChange={(v) => setCustom({ ...custom, fx: v })} />
              <NumField label="Juros (bps)" value={Math.round(custom.rates * 10000)} step={50}
                onChange={(v) => setCustom({ ...custom, rates: v / 10000 })} />
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>VaR e stress reverso</h3>
            <div className="grid">
              {(["equity_fx", "equity_rates", "fx_rates"] as const).map((k) => (
                <label key={k} className="field">
                  ρ {k === "equity_fx" ? "ações × câmbio" : k === "equity_rates" ? "ações × pré" : "câmbio × pré"} = {rho[k].toFixed(2)}
                  <input type="range" min={-1} max={1} step={0.05} value={rho[k]}
                    onChange={(e) => setRho({ ...rho, [k]: parseFloat(e.target.value) })} />
                </label>
              ))}
              <NumField label="Limite de perda" value={lossLimit} step={50000} min={1} onChange={setLossLimit} />
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {data && <Results data={data} />}
      </Lab>

      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Na crise de 2008 e na Covid, a perda é várias vezes o VaR 99% de 10 dias. Nenhum modelo calibrado em tempos calmos “prevê” isso.</li>
          <li>O dólar comprado é um hedge natural da bolsa brasileira: ele ganha em quase todos os cenários de crise. Na <strong>quebra de correlação</strong> o hedge falha e a perda se concentra nas ações.</li>
          <li>Zere a convexidade do prefixado e veja a perda no choque fiscal (+400 bps) aumentar.</li>
          <li>O stress reverso diz quão longe a carteira está do limite: um multiplicador abaixo de 1 significa que o próprio cenário já rompe o limite.</li>
        </ul>
      </Callout>
    </>
  );
}

function Results({ data }: { data: Resp }) {
  const worst = data.scenarios.find((s) => s.key === data.worst_scenario)!;
  const chart = data.scenarios.map((s) => ({
    name: s.name,
    total: s.total_pnl,
    ...Object.fromEntries(data.positions.map((_, i) => [`p${i}`, s.pnl_by_position[i]])),
  }));

  return (
    <>
      <div className="stats">
        <Stat label="VaR 99% — 1 dia" value={fmtMoney(data.var_1d)} sub="paramétrico, com correlações" />
        <Stat label="VaR 99% — 10 dias" value={fmtMoney(data.var_10d)} sub="= VaR 1d × √10" />
        <Stat label={`Pior cenário: ${worst.name}`} value={fmtMoney(worst.total_pnl)}
          sub={worst.loss_vs_var_10d != null ? `${fmtNum(worst.loss_vs_var_10d, 1)}× o VaR de 10 dias` : undefined} />
      </div>

      <div className="chart-title">P&L por cenário, decomposto por posição</div>
      <div className="chart-sub">Barras à esquerda do zero são perdas. Linhas verticais marcam o VaR e o limite de perda.</div>
      <Legend items={[
        ...data.positions.map((name, i) => ({ label: name, color: SERIES[i], box: true })),
        { label: "−VaR 1d", color: "var(--muted)" },
        { label: "−VaR 10d", color: "var(--text-2)" },
        { label: "−Limite de perda", color: "var(--critical)" },
      ]} />
      <ResponsiveContainer width="100%" height={60 + chart.length * 44}>
        <BarChart data={chart} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" tickFormatter={fmtCompact} {...axisProps} />
          <YAxis type="category" dataKey="name" {...axisProps} width={160} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof chart)[number] & Record<string, number>;
            return <TooltipBox title={d.name} rows={[
              ...data.positions.map((name, i) => ({ label: name, value: fmtMoney(d[`p${i}`]), color: SERIES[i] })),
              { label: "Total", value: fmtMoney(d.total) },
            ]} />;
          }} />
          <ReferenceLine x={0} stroke="var(--axis)" />
          <ReferenceLine x={-data.var_1d} stroke="var(--muted)" strokeWidth={2} strokeDasharray="4 3" />
          <ReferenceLine x={-data.var_10d} stroke="var(--text-2)" strokeWidth={2} strokeDasharray="4 3" />
          <ReferenceLine x={-data.loss_limit} stroke="var(--critical)" strokeWidth={2} />
          {data.positions.map((_, i) => (
            <Bar key={i} dataKey={`p${i}`} stackId="pnl" fill={SERIES[i]} stroke="var(--surface)" strokeWidth={2}
              maxBarSize={26} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <h3>Detalhamento</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Cenário</th>
              {data.positions.map((p) => <th key={p} className="num">{p}</th>)}
              <th className="num">Total</th>
              <th className="num">Perda ÷ VaR 10d</th>
              <th className="num">Stress reverso (k)</th>
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((s) => (
              <tr key={s.key}>
                <td>{s.name}</td>
                {s.pnl_by_position.map((v, i) => <td key={i} className="num">{fmtMoney(v)}</td>)}
                <td className="num"><strong className={s.total_pnl < 0 ? "bad" : "good"}>{fmtMoney(s.total_pnl)}</strong></td>
                <td className="num">{s.loss_vs_var_10d != null && s.loss_vs_var_10d > 0 ? `${fmtNum(s.loss_vs_var_10d, 1)}×` : "—"}</td>
                <td className="num">
                  {s.reverse_multiplier == null ? "ganho" :
                    s.reverse_multiplier < 1 ? <span className="bad">✕ {fmtNum(s.reverse_multiplier, 2)}× (rompe)</span> :
                      `${fmtNum(s.reverse_multiplier, 2)}×`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
