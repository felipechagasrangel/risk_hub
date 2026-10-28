import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, M, NumField, SelectField } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Cell = { freq: string; epe: number; cva: number };
type GridResp = {
  frequencies: string[];
  matrix: { grid: string; cells: Cell[] }[];
  profiles: Record<string, { t: number; ee: number }[]>;
};

const GRID_COLORS: Record<string, string> = {
  "Diário": "var(--series-1)", "Semanal": "var(--series-2)", "Quinzenal": "var(--series-3)", "Mensal": "var(--series-4)",
};

export default function MarginGridPage() {
  return (
    <>
      <h1>Frequência de margem × discretização da simulação</h1>
      <p className="lead">
        A exposição colateralizada depende de <em>quando</em> a última margem foi paga antes de um default. Isso
        envolve dois relógios: a frequência de verificação do CSA e o passo de tempo da simulação. Quando eles não
        conversam, o resultado pode ficar muito errado — para os dois lados.
      </p>

      <h2>1. O atraso efetivo do colateral</h2>
      <p>
        Se a contraparte quebra em <M>t</M>, o colateral em mãos é o da última chamada de margem bem-sucedida, feita
        até <M>{String.raw`t - \text{MPOR}`}</M>. Com verificações a cada <M>\delta</M> dias, essa chamada aconteceu numa data
        de verificação, que pode ser bem anterior:
      </p>
      <Formula tex={String.raw`t_{\text{chamada}}(t) = \left\lfloor \frac{t - \text{MPOR}}{\delta} \right\rfloor \delta, \qquad E(t) = \max\big(V(t) - C\big(V(t_{\text{chamada}})\big),\; 0\big)`} where={[[String.raw`\text{MPOR}`, "período de risco de margem, em dias úteis"], [String.raw`\delta`, "intervalo entre verificações do CSA: 1 (diária), 5 (semanal), 10 (quinzenal), 21 (mensal)"], [String.raw`t_{\text{chamada}}`, "data da última verificação cuja margem foi efetivamente paga"], [String.raw`C(\cdot)`, "colateral exigido pelo CSA sobre o MTM daquela data (threshold, se houver)"]]} />
      <p>
        O atraso total fica entre <M>{String.raw`\text{MPOR}`}</M> e <M>{String.raw`\text{MPOR} + \delta`}</M> — em média,
        <M>{String.raw`\text{MPOR} + \delta/2`}</M>. Como o MTM anda como <M>{String.raw`\sqrt{\text{atraso}}`}</M>, uma verificação mensal
        aumenta bastante a exposição residual em relação à diária. Sem CSA, não há colateral e a exposição é cheia.
      </p>

      <h2>2. O problema da grade</h2>
      <p>
        A simulação só conhece o MTM nas datas da grade. Para calcular o colateral em <M>t</M>, é preciso o MTM em
        <M>{String.raw`t_{\text{chamada}}`}</M> — que, numa grade grossa, pode não existir. As saídas ingênuas erram:
      </p>
      <ul>
        <li><strong>Arredondar para a data mais próxima</strong>: numa grade mensal com MPOR de 10 dias, <M>{String.raw`t - 10`}</M> dias arredonda para o próprio <M>t</M>. O colateral “chega no mesmo dia” e a exposição colateralizada vira <strong>zero</strong> — subestima o risco.</li>
        <li><strong>Arredondar para a data anterior</strong>: o atraso vira um mês inteiro, não 10 dias — superestima o risco, e todas as frequências de verificação dão o mesmo resultado.</li>
        <li><strong>Grade grossa em swaps com fluxos</strong>: as datas de simulação podem pular os picos de exposição logo antes dos pagamentos.</li>
      </ul>
      <Callout title="Como se faz na prática">
        Simula-se numa grade principal (semanal ou mensal, por custo) e acrescentam-se <strong>datas secundárias</strong>
        em <M>{String.raw`t - \text{MPOR}`}</M> para cada data principal — assim o MTM da data de apuração existe de verdade,
        sem arredondar. Alternativas são pontes brownianas entre as datas ou aproximações analíticas da exposição
        residual. O que não se pode é deixar o passo da grade decidir o atraso do colateral.
      </Callout>
      <CodeSnippet name="lookback_index" caption="a data de apuração numa grade com passo qualquer" />

      <h2>3. Laboratório</h2>
      <GridLab />
      <Callout title="O que observar">
        <ul>
          <li>Na linha <strong>Diário</strong> (a referência), o CVA cresce conforme a verificação fica menos frequente — é o atraso efetivo MPOR + δ.</li>
          <li>Com arredondamento para a <strong>data mais próxima</strong>, a linha <strong>Mensal</strong> com verificação diária dá CVA perto de zero: a armadilha da seção 2.</li>
          <li>Troque para a <strong>data anterior</strong>: a linha Mensal fica igual em todas as frequências — a grade passou a mandar no atraso.</li>
          <li>Grades semanal e quinzenal acertam o MPOR de 10 dias por coincidência (10 é múltiplo de 5); mude o MPOR para 7 e veja os erros aparecerem.</li>
          <li>Na coluna <strong>Sem CSA</strong> todas as grades quase concordam: sem colateral, a grade só afeta a precisão da integral no tempo.</li>
          <li>No gráfico com verificação diária, repare nos <strong>picos logo após cada pagamento</strong>: o fluxo trocado muda o MTM na hora, mas o colateral ainda reflete o MTM de MPOR dias antes. Grades grossas podem pular esses picos — mais um motivo para incluir as datas de fluxo na grade.</li>
        </ul>
      </Callout>
      <p className="muted" style={{ fontSize: 14 }}>
        Para o efeito do colateral no preço, veja a <Link to="/xva/cotacao">cotação com e sem CSA</Link>.
      </p>
    </>
  );
}

function GridLab() {
  const [p, setP] = useState({
    notional: 10_000_000, maturity: 3, per_year: 2 as 0 | 1 | 2 | 4, rate: 0.14, hw_a: 0.15, hw_sigma: 0.02, receive: true,
    cpty_spread: 0.02, cpty_recovery: 0.4, threshold: 0, mpor_days: 10, rounding: "nearest" as "nearest" | "floor",
    profile_freq: "Diária" as "Diária" | "Semanal" | "Quinzenal" | "Mensal" | "Sem CSA", n_paths: 1500, seed: 7,
  });
  const [metric, setMetric] = useState<"cva" | "epe">("cva");
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<GridResp>("/xva/margin-grid", p, 400);

  const reference = (freq: string) => data?.matrix[0].cells.find((c) => c.freq === freq)?.[metric] ?? 0;
  const profileRows = data
    ? data.profiles["Diário"].map((pt) => ({ t: pt.t, Diário: pt.ee }))
    : [];
  const otherProfiles = data ? Object.entries(data.profiles).filter(([g]) => g !== "Diário") : [];

  return (
    <Lab title="Matriz: passo da simulação × verificação do CSA">
      <div className="grid">
        <SelectField label="Fluxos do swap" value={String(p.per_year)} onChange={(v) => set("per_year")(Number(v) as 0 | 1 | 2 | 4)}
          options={[["0", "Bullet"], ["1", "Anuais"], ["2", "Semestrais"], ["4", "Trimestrais"]]} />
        <NumField label="Prazo (anos)" value={p.maturity} onChange={set("maturity")} step={1} min={1} max={5} />
        <NumField label="MPOR (dias úteis)" value={p.mpor_days} onChange={set("mpor_days")} step={1} min={0} max={30} />
        <NumField label="Threshold (R$)" value={p.threshold} onChange={set("threshold")} step={100_000} min={0} />
        <SelectField label="Data de apuração fora da grade" value={p.rounding} onChange={set("rounding")}
          options={[["nearest", "Arredonda para a mais próxima"], ["floor", "Usa a data anterior"]]} />
        <SelectField label="Métrica da matriz" value={metric} onChange={setMetric}
          options={[["cva", "CVA (R$)"], ["epe", "EPE (R$)"]]} />
        <SelectField label="Perfil de EE no gráfico" value={p.profile_freq} onChange={set("profile_freq")}
          options={[["Diária", "Verificação diária"], ["Semanal", "Semanal"], ["Quinzenal", "Quinzenal"], ["Mensal", "Mensal"], ["Sem CSA", "Sem CSA"]]} />
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {fmtNum(p.n_paths, 0)} trajetórias diárias do mesmo Hull-White; as grades mais grossas usam subconjuntos das mesmas datas.
      </p>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="table-wrap">
            <table className="data heat">
              <thead>
                <tr><th>Passo da simulação ↓ · Verificação →</th>{data.frequencies.map((f) => <th key={f} className="num">{f}</th>)}</tr>
              </thead>
              <tbody>
                {data.matrix.map((row, i) => (
                  <tr key={row.grid}>
                    <th>{row.grid}{i === 0 && <span className="muted"> (referência)</span>}</th>
                    {row.cells.map((c) => {
                      const ref = reference(c.freq);
                      const diff = ref ? c[metric] / ref - 1 : 0;
                      const tone = diff < 0 ? "var(--neg)" : "var(--pos)";
                      const strength = Math.min(Math.abs(diff), 1) * 70;
                      return (
                        <td key={c.freq} className="num" style={{
                          background: i === 0 ? "var(--surface-2)" : `color-mix(in srgb, ${tone} ${strength}%, var(--surface))`,
                          textAlign: "right",
                        }}>
                          <div style={{ fontWeight: 600 }}>{fmtMoney(c[metric])}</div>
                          {i > 0 && <div style={{ fontSize: 11 }}>{diff >= 0 ? "+" : ""}{fmtPct(diff, 0)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Percentuais: diferença para a grade diária na mesma coluna. Vermelho = subestima; azul = superestima.
          </p>

          <div className="chart-title" style={{ marginTop: 16 }}>EE por passo de simulação — verificação {p.profile_freq.toLowerCase()}</div>
          <div className="chart-sub">Cada linha é a mesma exposição vista por uma grade diferente.</div>
          <Legend items={Object.keys(GRID_COLORS).map((g) => ({ label: g, color: GRID_COLORS[g] }))} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, p.maturity]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} allowDuplicatedCategory={false} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
              <Tooltip content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={`${fmtNum(payload[0].payload.t, 2)} anos`} rows={payload.map((pl) => ({
                  label: String(pl.name), value: fmtMoney(Number(pl.value)), color: String(pl.color),
                }))} /> : null} />
              <Line data={profileRows} dataKey="Diário" name="Diário" stroke={GRID_COLORS["Diário"]} strokeWidth={2} dot={false} isAnimationActive={false} />
              {otherProfiles.map(([g, pts]) => (
                <Line key={g} data={pts} dataKey="ee" name={g} stroke={GRID_COLORS[g]} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
