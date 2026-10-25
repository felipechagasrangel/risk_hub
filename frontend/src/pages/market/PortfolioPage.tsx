import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, M, NumField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtPct } from "../../format";

type Asset = { name: string; value: number; vol_annual: number };
type Resp = {
  assets: string[]; individual_var: number[]; component_var: number[];
  undiversified_var: number; diversified_var: number; diversification_benefit: number;
};

const PAIRS: [number, number][] = [[0, 1], [0, 2], [1, 2]];

export default function PortfolioPage() {
  const [assets, setAssets] = useState<Asset[]>([
    { name: "Ações (Ibovespa)", value: 1_000_000, vol_annual: 0.25 },
    { name: "Dólar (USD/BRL)", value: 500_000, vol_annual: 0.15 },
    { name: "Prefixado 5 anos", value: 800_000, vol_annual: 0.08 },
  ]);
  const [rho, setRho] = useState([-0.4, 0.3, -0.2]);
  const [confidence, setConfidence] = useState(0.99);

  const n = assets.length;
  const corr = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      const k = PAIRS.findIndex(([a, b]) => (a === Math.min(i, j) && b === Math.max(i, j)));
      return k >= 0 ? rho[k] : 0;
    }));
  const { data, error } = useCompute<Resp>("/market/portfolio-var",
    { assets, correlation: corr, confidence, horizon: 1 });

  const chartData = data?.assets.map((name, i) => ({
    name, individual: data.individual_var[i], component: data.component_var[i],
  }));

  return (
    <>
      <h1>Diversificação e VaR de carteira</h1>
      <p className="lead">
        O risco de uma carteira não é a soma dos riscos das partes. Quando os ativos não se movem
        juntos, as perdas de um são parcialmente compensadas pelos ganhos de outro.
      </p>

      <h2>1. A matriz de covariância</h2>
      <p>
        Com exposições <M>w</M> (em moeda) e matriz de covariância <M>\Sigma</M>, a volatilidade da carteira é:
      </p>
      <Formula tex={String.raw`\sigma_P = \sqrt{w^\top \Sigma\, w}, \qquad \Sigma_{ij} = \rho_{ij}\,\sigma_i\,\sigma_j`} />
      <p>Para dois ativos isso vira a conhecida fórmula:</p>
      <Formula tex={String.raw`\text{VaR}_P = \sqrt{\text{VaR}_1^2 + \text{VaR}_2^2 + 2\rho\,\text{VaR}_1\text{VaR}_2}`} />
      <p>
        Se <M>\rho = 1</M>, o VaR da carteira é a soma simples (nenhuma diversificação). Se <M>\rho = -1</M>,
        um ativo pode anular o outro (hedge perfeito).
      </p>

      <h2>2. VaR componente</h2>
      <p>
        Quanto do risco total vem de cada posição? Pela decomposição de Euler, o <strong>VaR
        componente</strong> é a exposição vezes o VaR marginal, e os componentes somam exatamente o VaR da carteira:
      </p>
      <Formula tex={String.raw`\text{CVaR}_i = w_i \frac{\partial\, \text{VaR}_P}{\partial w_i} = z_\alpha \frac{w_i (\Sigma w)_i}{\sigma_P}, \qquad \sum_i \text{CVaR}_i = \text{VaR}_P`} />
      <p>Um componente <strong>negativo</strong> indica uma posição que funciona como hedge: aumentá-la reduz o risco total.</p>

      <h2>3. Laboratório</h2>
      <Lab title="Monte uma carteira e mexa nas correlações">
        <EditableTable<Asset>
          rows={assets.slice(0, 3)}
          onChange={(r) => setAssets(r.slice(0, 3))}
          newRow={() => ({ name: "Novo ativo", value: 100_000, vol_annual: 0.2 })}
          columns={[
            { key: "name", label: "Ativo", type: "text" },
            { key: "value", label: "Exposição (− = vendido)", type: "number" },
            { key: "vol_annual", label: "Vol. anual", type: "percent" },
          ]}
        />
        <div className="grid" style={{ marginTop: 16 }}>
          {PAIRS.filter(([a, b]) => a < n && b < n).map(([a, b], k) => (
            <label key={k} className="field">
              ρ({assets[a].name.split(" ")[0]}, {assets[b].name.split(" ")[0]}) = {rho[k].toFixed(2)}
              <input type="range" min={-1} max={1} step={0.05} value={rho[k]}
                onChange={(e) => setRho(rho.map((r, j) => (j === k ? parseFloat(e.target.value) : r)))} />
            </label>
          ))}
          <NumField label="Confiança" percent value={confidence} onChange={setConfidence} step={0.5} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && chartData && (
          <>
            <div className="stats">
              <Stat label="Soma dos VaRs individuais" value={fmtMoney(data.undiversified_var)} sub="sem diversificação" />
              <Stat label="VaR da carteira" value={fmtMoney(data.diversified_var)} sub="com correlações" />
              <Stat label="Benefício de diversificação" value={fmtMoney(data.diversification_benefit)}
                sub={fmtPct(data.diversification_benefit / data.undiversified_var) + " do VaR não diversificado"} />
            </div>
            <div className="chart-title">VaR individual vs. VaR componente por ativo (1 dia)</div>
            <Legend items={[
              { label: "VaR individual (isolado)", color: "var(--series-1)", box: true },
              { label: "VaR componente (contribuição)", color: "var(--series-2)", box: true },
            ]} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tickFormatter={fmtCompact} {...axisProps} width={56} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox title={payload[0].payload.name} rows={[
                      { label: "Individual", value: fmtMoney(payload[0].payload.individual), color: "var(--series-1)" },
                      { label: "Componente", value: fmtMoney(payload[0].payload.component), color: "var(--series-2)" },
                    ]} />
                  ) : null} />
                <Bar dataKey="individual" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                <Bar dataKey="component" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Coloque todas as correlações em <strong>1</strong>: o benefício de diversificação vai a zero.</li>
          <li>Com ρ(Ações, Dólar) negativo, o dólar vira hedge da bolsa — seu VaR componente cai e pode ficar negativo.</li>
          <li>Em crises, as correlações tendem a subir para perto de 1 justamente quando mais precisamos da
            diversificação. Por isso testes de estresse complementam o VaR.</li>
        </ul>
      </Callout>
    </>
  );
}
