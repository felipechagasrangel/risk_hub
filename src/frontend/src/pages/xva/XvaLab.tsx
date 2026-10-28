import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Lab, Legend, NumField, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Point = { t: number; ee: number; ene: number; pfe: number; ee_uncoll: number; pfe_uncoll: number; im: number };
export type XvaResp = {
  mtm0: number;
  profile: Point[];
  samples: number[][];
  metrics: {
    epe: number; eepe: number; max_pfe: number; cva: number; dva: number;
    fca: number; fba: number; fva: number; mva: number; total: number;
  };
  cva_buckets: { t: number; cva: number }[];
};

type View = "exposure" | "cva" | "funding";

const DEFAULTS = {
  instrument: "swap" as "swap" | "ndf", receive: true, notional: 10_000_000, maturity: 5,
  rate: 0.14, fixed_rate: 0.14, hw_a: 0.15, hw_sigma: 0.02,
  spot: 5.0, foreign_rate: 0.045, fx_vol: 0.15,
  pfe_quantile: 0.975, collateral: false, threshold: 0, mpor_days: 10,
  cpty_spread: 0.02, cpty_recovery: 0.4, own_spread: 0.01, own_recovery: 0.4,
  funding_spread: 0.01, lend_spread: 0.003, initial_margin: true, n_paths: 5000, seed: 7,
};

/** Laboratório de XVA: a mesma simulação, com o recorte de cada página (exposição, CVA ou funding). */
export default function XvaLab({ view, title }: { view: View; title: string }) {
  const [p, setP] = useState(DEFAULTS);
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<XvaResp>("/xva/run", p, 400);
  const isSwap = p.instrument === "swap";

  return (
    <Lab title={title}>
      <h3 style={{ marginTop: 0 }}>Instrumento</h3>
      <div className="grid">
        <SelectField label="Instrumento" value={p.instrument}
          onChange={(v) => setP({ ...p, instrument: v, maturity: v === "swap" ? 5 : 1, notional: v === "swap" ? 10_000_000 : 2_000_000 })}
          options={[["swap", "Swap DI × pré (Hull-White)"], ["ndf", "NDF de dólar (GBM)"]]} />
        <SelectField label="Posição do banco" value={p.receive ? "a" : "b"} onChange={(v) => set("receive")(v === "a")}
          options={isSwap ? [["a", "Recebe pré, paga CDI"], ["b", "Paga pré, recebe CDI"]] : [["a", "Comprado em dólar"], ["b", "Vendido em dólar"]]} />
        <NumField label={isSwap ? "Nocional (R$)" : "Nocional (US$)"} value={p.notional} onChange={set("notional")} step={1_000_000} />
        <NumField label="Prazo (anos)" value={p.maturity} onChange={set("maturity")} step={0.5} min={0.25} max={15} />
        <NumField label="Taxa pré de mercado" percent value={p.rate} onChange={set("rate")} step={0.25} />
        {isSwap ? (
          <>
            <NumField label="Taxa pré do swap" percent value={p.fixed_rate} onChange={set("fixed_rate")} step={0.25} />
            <NumField label="Reversão à média a" value={p.hw_a} onChange={set("hw_a")} step={0.05} min={0.01} />
            <NumField label="Vol. da taxa curta σ" percent value={p.hw_sigma} onChange={set("hw_sigma")} step={0.25} />
          </>
        ) : (
          <>
            <NumField label="Dólar à vista" value={p.spot} onChange={set("spot")} step={0.1} />
            <NumField label="Juro em dólar" percent value={p.foreign_rate} onChange={set("foreign_rate")} step={0.25} />
            <NumField label="Volatilidade do dólar" percent value={p.fx_vol} onChange={set("fx_vol")} step={1} />
          </>
        )}
      </div>

      <h3>Colateral</h3>
      <div className="grid">
        <SelectField label="Contrato de colateral (CSA)" value={p.collateral ? "y" : "n"} onChange={(v) => set("collateral")(v === "y")}
          options={[["n", "Sem colateral"], ["y", "Com margem de variação"]]} />
        {p.collateral && (
          <>
            <NumField label="Threshold (R$)" value={p.threshold} onChange={set("threshold")} step={100_000} min={0} />
            <NumField label="MPOR (dias úteis)" value={p.mpor_days} onChange={set("mpor_days")} step={5} min={0} max={60} hint="período de risco de margem" />
          </>
        )}
        {view !== "cva" && (
          <NumField label="Quantil da PFE" percent value={p.pfe_quantile} onChange={set("pfe_quantile")} step={0.5} min={50.5} max={99.9} />
        )}
      </div>

      {view !== "exposure" && (
        <>
          <h3>Crédito</h3>
          <div className="grid">
            <NumField label="Spread de CDS da contraparte" percent value={p.cpty_spread} onChange={set("cpty_spread")} step={0.25} />
            <NumField label="Recuperação da contraparte" percent value={p.cpty_recovery} onChange={set("cpty_recovery")} step={5} />
            <NumField label="Spread de CDS do banco" percent value={p.own_spread} onChange={set("own_spread")} step={0.25} />
            <NumField label="Recuperação do banco" percent value={p.own_recovery} onChange={set("own_recovery")} step={5} />
          </div>
        </>
      )}
      {view === "funding" && (
        <>
          <h3>Funding e margem inicial</h3>
          <div className="grid">
            <NumField label="Spread de captação" percent value={p.funding_spread} onChange={set("funding_spread")} step={0.1} />
            <NumField label="Spread de aplicação" percent value={p.lend_spread} onChange={set("lend_spread")} step={0.1} />
            <SelectField label="Margem inicial" value={p.initial_margin ? "y" : "n"} onChange={(v) => set("initial_margin")(v === "y")}
              options={[["y", "Banco deposita IM"], ["n", "Sem margem inicial"]]} />
          </div>
        </>
      )}
      <p className="muted" style={{ fontSize: 13 }}>{fmtNum(p.n_paths, 0)} trajetórias semanais · semente {p.seed}</p>

      {error && <p className="error">{error}</p>}
      {data && view === "exposure" && <ExposureResults data={data} p={p} />}
      {data && view === "cva" && <CvaResults data={data} />}
      {data && view === "funding" && <FundingResults data={data} />}
    </Lab>
  );
}

function ExposureResults({ data, p }: { data: XvaResp; p: typeof DEFAULTS }) {
  const m = data.metrics;
  const paths = data.profile.map((pt, i) => ({ t: pt.t, ...Object.fromEntries(data.samples.map((s, j) => [`s${j}`, s[i]])) }));
  return (
    <>
      <div className="stats">
        <Stat label="MTM hoje" value={fmtMoney(data.mtm0)} sub="média das trajetórias em t = 0" />
        <Stat label="EPE" value={fmtMoney(m.epe)} sub="EE média no prazo todo" />
        <Stat label="EEPE (1º ano)" value={fmtMoney(m.eepe)} sub="EE efetiva, não decrescente" />
        <Stat label={`PFE máxima (${fmtPct(p.pfe_quantile, 1)})`} value={fmtMoney(m.max_pfe)} />
      </div>

      <div className="chart-title">Algumas trajetórias do MTM</div>
      <div className="chart-sub">Cada linha é um cenário simulado. A exposição é a parte acima de zero.</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={paths} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
          {data.samples.map((_, j) => (
            <Line key={j} dataKey={`s${j}`} stroke="var(--series-1)" strokeOpacity={0.45} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="chart-title">Perfil de exposição</div>
      <div className="chart-sub">{p.collateral ? "Linhas tracejadas: o mesmo perfil sem colateral." : "Ative o colateral para comparar."}</div>
      <Legend items={[
        { label: "EE (exposição esperada)", color: "var(--series-1)" },
        { label: `PFE ${fmtPct(p.pfe_quantile, 1)}`, color: "var(--series-2)" },
        { label: "ENE (exposição negativa)", color: "var(--series-3)" },
      ]} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.profile} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Point;
            return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
              { label: "EE", value: fmtMoney(d.ee), color: "var(--series-1)" },
              { label: "PFE", value: fmtMoney(d.pfe), color: "var(--series-2)" },
              { label: "ENE", value: fmtMoney(d.ene), color: "var(--series-3)" },
              ...(p.collateral ? [{ label: "EE sem colateral", value: fmtMoney(d.ee_uncoll) }] : []),
            ]} />;
          }} />
          <Line dataKey="pfe" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="ee" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="ene" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
          {p.collateral && <Line dataKey="pfe_uncoll" stroke="var(--series-2)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
          {p.collateral && <Line dataKey="ee_uncoll" stroke="var(--series-1)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function CvaResults({ data }: { data: XvaResp }) {
  const m = data.metrics;
  // agrupa a contribuição do CVA por ano para o gráfico
  const byYear = new Map<number, number>();
  data.cva_buckets.forEach((b) => {
    const y = Math.max(1, Math.ceil(b.t - 1e-9));
    byYear.set(y, (byYear.get(y) ?? 0) + b.cva);
  });
  const bars = [...byYear.entries()].map(([year, cva]) => ({ label: `Ano ${year}`, cva }));
  return (
    <>
      <div className="stats">
        <Stat label="CVA" value={fmtMoney(m.cva)} sub="custo do risco de default da contraparte" />
        <Stat label="DVA" value={fmtMoney(m.dva)} sub="benefício pelo risco de default do banco" />
        <Stat label="CVA bilateral" value={fmtMoney(m.cva - m.dva)} sub="CVA − DVA" />
        <Stat label="EPE" value={fmtMoney(m.epe)} />
      </div>
      <div className="chart-title">De onde vem o CVA: contribuição por ano</div>
      <div className="chart-sub">EE descontada × probabilidade de default no período × perda dado o default.</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={bars} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={56} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
            active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: "CVA", value: fmtMoney(payload[0].payload.cva) }]} /> : null} />
          <Bar dataKey="cva" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function FundingResults({ data }: { data: XvaResp }) {
  const m = data.metrics;
  const rows: [string, number, string][] = [
    ["CVA", m.cva, "default da contraparte"],
    ["DVA", -m.dva, "default do próprio banco (benefício)"],
    ["FCA", m.fca, "financiar a exposição positiva"],
    ["FBA", -m.fba, "funding gerado pela exposição negativa (benefício)"],
    ["MVA", m.mva, "financiar a margem inicial depositada"],
  ];
  return (
    <>
      <div className="stats">
        <Stat label="FVA" value={fmtMoney(m.fva)} sub="FCA − FBA" />
        <Stat label="MVA" value={fmtMoney(m.mva)} />
        <Stat label="XVA total" value={fmtMoney(m.total)} sub="CVA − DVA + FVA + MVA" />
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Ajuste</th><th className="num">Valor (custo +, benefício −)</th><th>Origem</th></tr></thead>
          <tbody>
            {rows.map(([k, v, why]) => (
              <tr key={k}><td><strong>{k}</strong></td><td className="num">{fmtMoney(v)}</td><td className="muted">{why}</td></tr>
            ))}
            <tr><td><strong>Total</strong></td><td className="num"><strong>{fmtMoney(m.total)}</strong></td><td className="muted">o que o preço “sem risco” deixa de fora</td></tr>
          </tbody>
        </table>
      </div>
      <div className="chart-title" style={{ marginTop: 18 }}>Margem inicial esperada ao longo do tempo</div>
      <div className="chart-sub">IM paramétrica: 99% de um choque de 10 dias úteis sobre o delta, em cada trajetória.</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.profile} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
          <Tooltip content={({ active, payload }) =>
            active && payload?.length ? <TooltipBox title={`${fmtNum(payload[0].payload.t, 2)} anos`} rows={[{ label: "E[IM]", value: fmtMoney(payload[0].payload.im) }]} /> : null} />
          <Line dataKey="im" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
