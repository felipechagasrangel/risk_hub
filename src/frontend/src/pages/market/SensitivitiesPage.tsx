import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, M, NumField, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtPct } from "../../format";

type Curve = "pre" | "cupom" | "ipca";
type Resp = {
  value: number;
  vertices: number[];
  dv01: Record<Curve, number[]>;
  dv01_total: Record<Curve, number>;
  greeks: { delta_fx: number; gamma_fx: number; vega: number };
  pnl: { full: number; approx: number; unexplained: number; parts: Record<string, number> };
  positions: { kind: string; value: number }[];
};
type Instrument = "ltn" | "ntnf" | "ntnb" | "swap_fx" | "ndf" | "call_fx" | "portfolio";

const VERTEX_LABEL = ["3m", "6m", "1a", "2a", "3a", "5a", "10a"];
const CURVE_LABEL: Record<Curve, string> = { pre: "Pré", cupom: "Cupom cambial", ipca: "Cupom de IPCA" };
const CURVE_COLOR: Record<Curve, string> = { pre: "var(--series-1)", cupom: "var(--series-2)", ipca: "var(--series-3)" };
const INSTRUMENTS: [Instrument, string][] = [
  ["ltn", "LTN (prefixado sem cupom)"], ["ntnf", "NTN-F (prefixado com cupom)"], ["ntnb", "NTN-B (IPCA + juro real)"],
  ["swap_fx", "Swap cambial (dólar + cupom × CDI)"], ["ndf", "NDF de dólar comprado"], ["call_fx", "Call de dólar comprada"],
  ["portfolio", "Carteira com todos"],
];
const PART_LABEL: Record<string, string> = {
  pre: "DV01 pré", cupom: "DV01 cupom", ipca: "DV01 IPCA", delta_fx: "Delta dólar", gamma_fx: "Gamma dólar", vega: "Vega",
};

export default function SensitivitiesPage() {
  return (
    <>
      <h1>Sensibilidades e fatores de risco</h1>
      <p className="lead">
        Antes do VaR, do stress e do capital, vem uma pergunta mais simples: <em>a que esta operação está exposta, e
        quanto?</em> As sensibilidades decompõem o risco de qualquer operação em fatores de mercado — e são a matéria-prima
        de quase todas as outras métricas.
      </p>

      <h2>1. O que é uma sensibilidade</h2>
      <p>É quanto o valor da posição muda quando um fator de risco se move uma unidade, com todo o resto parado:</p>
      <Formula tex={String.raw`s_x = \frac{\partial V}{\partial x} \approx V(x + \Delta x) - V(x)`} where={[[String.raw`V`, "valor da posição em R$"], [String.raw`x`, "um fator de risco: uma taxa num vértice, o dólar, a volatilidade"], [String.raw`\Delta x`, "o tamanho do choque: 1 bp para taxas, 1% para preços, 1 ponto para volatilidade"]]} />
      <p>
        Na prática calcula-se por <strong>bump-and-reprice</strong>: desloca-se o fator, reprecifica-se a operação inteira
        e mede-se a diferença. É mais lento que uma fórmula, mas funciona para qualquer instrumento que se saiba precificar
        — e garante que a sensibilidade é coerente com o preço.
      </p>

      <h2>2. Os fatores de risco no Brasil</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Fator</th><th>O que é</th><th>Onde se observa</th><th>Medida</th></tr></thead>
          <tbody>
            <tr><td><strong>Pré</strong></td><td>Juro nominal em reais, por vértice</td><td>DI futuro (DI1), títulos prefixados</td><td>DV01 por vértice (R$ por 1 bp)</td></tr>
            <tr><td><strong>Cupom cambial</strong></td><td>Juro em dólar no mercado local</td><td>DDI e FRC na B3</td><td>DV01 por vértice</td></tr>
            <tr><td><strong>Cupom de IPCA</strong></td><td>Juro real (acima da inflação)</td><td>NTN-B, DAP</td><td>DV01 por vértice</td></tr>
            <tr><td><strong>Câmbio</strong></td><td>Dólar à vista (e outras moedas)</td><td>Dólar spot e futuro (DOL)</td><td>Delta (R$ por 1%) e gamma</td></tr>
            <tr><td><strong>Volatilidade</strong></td><td>Volatilidade implícita das opções</td><td>Opções na B3 e no balcão</td><td>Vega (R$ por 1 ponto)</td></tr>
            <tr><td><strong>Ações e outros</strong></td><td>Índices, ações, commodities, cupom de IGP-M, TR</td><td>B3, mercado de balcão</td><td>Delta por fator</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Juros: DV01 por vértice (key rate)</h2>
      <p>
        Uma curva de juros não é um número só. Desloca-se <strong>um vértice por vez</strong> em 1 bp — com interpolação
        linear, o choque se espalha para os prazos vizinhos como um triângulo — e mede-se a variação. A soma dos DV01 por
        vértice é o DV01 paralelo.
      </p>
      <Formula tex={String.raw`\text{DV01}_{c,k} = V(c_k + 1\text{ bp}) - V(c), \qquad \text{DV01}_c^{\text{paralelo}} \approx \sum_k \text{DV01}_{c,k}`} where={[[String.raw`c`, "uma curva: pré, cupom cambial ou cupom de IPCA"], [String.raw`k`, "um vértice da curva (3 meses, 6 meses, 1, 2, 3, 5 e 10 anos)"], [String.raw`c_k + 1\text{ bp}`, "a curva com só o vértice k deslocado em 1 ponto-base"], [String.raw`\text{DV01}_{c,k}`, "variação de valor, em R$, por esse deslocamento"]]} />
      <p className="muted" style={{ fontSize: 14 }}>
        Os vértices lembram os do <Link to="/mercado/rwa-sens">RWA SENS</Link>, que parte exatamente destas sensibilidades,
        ponderando cada DV01 e agregando com correlações. O <Link to="/irrbb">IRRBB</Link> faz o mesmo na carteira bancária com choques grandes.
      </p>
      <CodeSnippet name="key_rate_dv01" caption="DV01 de cada vértice de cada curva" />

      <h2>4. Câmbio e volatilidade: delta, gamma e vega</h2>
      <Formula tex={String.raw`\Delta = \frac{V(1{,}01\,S) - V(0{,}99\,S)}{2}, \qquad \Gamma = V(1{,}01\,S) - 2V(S) + V(0{,}99\,S), \qquad \nu = \frac{V(\sigma + 1\text{pt}) - V(\sigma - 1\text{pt})}{2}`} where={[[String.raw`S`, "dólar à vista"], [String.raw`\Delta`, "delta: R$ por 1% de alta do dólar (diferença central)"], [String.raw`\Gamma`, "gamma: quanto o delta muda por 1% — só existe em instrumentos não lineares (opções)"], [String.raw`\sigma`, "volatilidade implícita"], [String.raw`\nu`, "vega: R$ por 1 ponto de volatilidade"]]} />
      <CodeSnippet name="fx_and_vol_greeks" />

      <h2>5. Uma operação, vários fatores</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Operação</th><th>Pré</th><th>Cupom cambial</th><th>Cupom IPCA</th><th>Câmbio</th><th>Vol</th></tr></thead>
          <tbody>
            <tr><td>LTN</td><td>um vértice</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
            <tr><td>NTN-F</td><td>vários vértices (cupons)</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
            <tr><td>NTN-B</td><td>—</td><td>—</td><td>vários vértices</td><td>—</td><td>—</td></tr>
            <tr><td>Swap cambial (dólar + cupom × CDI)</td><td>— (a ponta CDI fica na curva)</td><td>sim</td><td>—</td><td>sim</td><td>—</td></tr>
            <tr><td>NDF de dólar</td><td>sim (desconto e termo)</td><td>sim (termo)</td><td>—</td><td>sim</td><td>—</td></tr>
            <tr><td>Call de dólar</td><td>sim</td><td>sim</td><td>—</td><td>delta e gamma</td><td>vega</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        O NDF mostra bem a ideia: o dólar a termo é <M>{String.raw`F = S \cdot \frac{(1+\text{pré})^{du/252}}{1 + \text{cupom}\cdot dc/360}`}</M>,
        então uma operação “de câmbio” carrega também risco de juros em reais e em dólar.
      </p>
      <CodeSnippet name="price" caption="o apreçamento de cada instrumento" />

      <h2>6. Laboratório</h2>
      <SensLab />
      <Callout title="O que observar">
        <ul>
          <li>LTN: todo o risco num vértice. NTN-F: o mesmo prazo, mas espalhado pelos vértices dos cupons — e um DV01 total menor (duration menor).</li>
          <li>NTN-B não tem risco pré: o risco é de juro real. A inflação entra pelo VNA, que já está corrigido até hoje.</li>
          <li>O swap cambial não tem risco pré: a ponta CDI se ajusta todo dia. Só câmbio e cupom cambial.</li>
          <li>NDF comprado: ganha com alta da pré (o termo sobe) e perde com alta do cupom (o termo cai).</li>
          <li>Na carteira, os DV01 se somam por vértice — é assim que se vê se um hedge funciona vértice a vértice.</li>
          <li>No P&L explain, choques grandes deixam um resíduo: é a convexidade (gamma de juros) que o DV01 não captura. Na call, o gamma do dólar explica boa parte do que o delta não explica.</li>
        </ul>
      </Callout>

      <h2>7. P&L explain</h2>
      <p>
        Com as sensibilidades, dá para explicar o resultado do dia antes de reavaliar a carteira — e checar o resultado
        depois. A diferença entre o P&L real e o explicado é o <strong>não explicado</strong>: efeitos de ordem maior,
        fatores que faltam no mapa ou erro operacional. Mesas e áreas de risco acompanham esse resíduo todo dia.
      </p>
      <Formula tex={String.raw`\Delta V \approx \sum_{c}\sum_{k} \text{DV01}_{c,k}\,\Delta r_{c,k} \;+\; \Delta\,\frac{\Delta S}{1\%} \;+\; \tfrac12\,\Gamma\Big(\frac{\Delta S}{1\%}\Big)^2 \;+\; \nu\,\Delta\sigma`} where={[[String.raw`\Delta r_{c,k}`, "choque na taxa do vértice k da curva c, em bps"], [String.raw`\Delta S / 1\%`, "variação do dólar, em pontos percentuais"], [String.raw`\Delta\sigma`, "variação da volatilidade, em pontos"], [String.raw`\Delta V`, "P&L aproximado; a reavaliação completa dá o P&L “real” do modelo"]]} />
      <CodeSnippet name="pnl_explain" />
      <p className="muted" style={{ fontSize: 14 }}>
        O <Link to="/mercado/var">VaR paramétrico</Link> de uma carteira é exatamente esta expansão de primeira ordem, com os
        choques sorteados de uma distribuição normal dos fatores.
      </p>
    </>
  );
}

function SensLab() {
  const [p, setP] = useState({
    instrument: "ndf" as Instrument, notional: 10_000_000, maturity: 2,
    pre: 0.14, cupom: 0.05, ipca: 0.07, slope: 0, spot: 5.4, vol: 0.15,
    shocks: { pre: 100, cupom: 0, ipca: 0, fx_pct: 0, vol_pts: 0 },
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const setShock = (k: keyof typeof p.shocks) => (v: number) => setP({ ...p, shocks: { ...p.shocks, [k]: v } });
  const { data, error } = useCompute<Resp>("/market/sensitivities", p, 300);

  const bars = data?.vertices.map((_, i) => ({
    label: VERTEX_LABEL[i], pre: data.dv01.pre[i], cupom: data.dv01.cupom[i], ipca: data.dv01.ipca[i],
  }));
  const active = data ? (Object.keys(CURVE_LABEL) as Curve[]).filter((c) => data.dv01[c].some((v) => Math.abs(v) > 0.5)) : [];
  const parts = data ? Object.entries(data.pnl.parts).filter(([, v]) => Math.abs(v) > 0.5).map(([k, v]) => ({ label: PART_LABEL[k], v })) : [];

  return (
    <Lab title="Mapa de sensibilidades de uma operação">
      <h3 style={{ marginTop: 0 }}>Operação e mercado</h3>
      <div className="grid">
        <SelectField label="Operação" value={p.instrument} onChange={set("instrument")} options={INSTRUMENTS} />
        <NumField label="Tamanho (R$)" value={p.notional} onChange={set("notional")} step={1_000_000} />
        <NumField label="Prazo (anos)" value={p.maturity} onChange={set("maturity")} step={0.5} min={0.25} max={10} />
        <NumField label="Pré" percent value={p.pre} onChange={set("pre")} step={0.25} />
        <NumField label="Cupom cambial" percent value={p.cupom} onChange={set("cupom")} step={0.25} />
        <NumField label="Cupom de IPCA" percent value={p.ipca} onChange={set("ipca")} step={0.25} />
        <NumField label="Inclinação (por ano)" percent value={p.slope} onChange={set("slope")} step={0.05} hint="pré e IPCA" />
        <NumField label="Dólar à vista" value={p.spot} onChange={set("spot")} step={0.1} />
        <NumField label="Volatilidade" percent value={p.vol} onChange={set("vol")} step={1} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && bars && (
        <>
          <div className="stats">
            <Stat label="Valor" value={fmtMoney(data.value)} sub={data.positions.length > 1 ? `${data.positions.length} posições` : undefined} />
            {active.map((c) => <Stat key={c} label={`DV01 — ${CURVE_LABEL[c]}`} value={fmtMoney(data.dv01_total[c])} sub="por +1 bp paralelo" />)}
            {Math.abs(data.greeks.delta_fx) > 0.5 && <Stat label="Delta dólar" value={fmtMoney(data.greeks.delta_fx)} sub="por +1% no dólar" />}
            {Math.abs(data.greeks.gamma_fx) > 0.5 && <Stat label="Gamma dólar" value={fmtMoney(data.greeks.gamma_fx)} sub="variação do delta por 1%" />}
            {Math.abs(data.greeks.vega) > 0.5 && <Stat label="Vega" value={fmtMoney(data.greeks.vega)} sub="por +1 ponto de vol" />}
          </div>

          <div className="chart-title">DV01 por vértice</div>
          <div className="chart-sub">R$ por +1 bp em cada vértice de cada curva. Negativo = perde com alta da taxa.</div>
          <Legend items={(active.length ? active : (["pre"] as Curve[])).map((c) => ({ label: CURVE_LABEL[c], color: CURVE_COLOR[c], box: true }))} />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bars} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={56} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active: on, payload }) =>
                on && payload?.length ? <TooltipBox title={`Vértice ${payload[0].payload.label}`} rows={active.map((c) => ({
                  label: CURVE_LABEL[c], value: fmtMoney(payload[0].payload[c]), color: CURVE_COLOR[c],
                }))} /> : null} />
              {active.map((c) => (
                <Bar key={c} dataKey={c} fill={CURVE_COLOR[c]} radius={[3, 3, 3, 3]} maxBarSize={26} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <h3>P&L explain: aplique um cenário</h3>
          <div className="grid">
            <NumField label="Pré (bps, paralelo)" value={p.shocks.pre} onChange={setShock("pre")} step={25} />
            <NumField label="Cupom cambial (bps)" value={p.shocks.cupom} onChange={setShock("cupom")} step={25} />
            <NumField label="Cupom de IPCA (bps)" value={p.shocks.ipca} onChange={setShock("ipca")} step={25} />
            <NumField label="Dólar (%)" value={p.shocks.fx_pct} onChange={setShock("fx_pct")} step={1} />
            <NumField label="Volatilidade (pontos)" value={p.shocks.vol_pts} onChange={setShock("vol_pts")} step={1} />
          </div>
          <div className="stats">
            <Stat label="P&L reavaliado" value={fmtMoney(data.pnl.full)} sub="reprecificando tudo" />
            <Stat label="P&L explicado" value={fmtMoney(data.pnl.approx)} sub="pelas sensibilidades" />
            <Stat label="Não explicado" value={fmtMoney(data.pnl.unexplained)}
              sub={data.pnl.full ? `${fmtPct(data.pnl.unexplained / data.pnl.full, 1)} do P&L` : undefined} />
          </div>
          {parts.length > 0 && (
            <>
              <div className="chart-title">De onde vem o P&L explicado</div>
              <ResponsiveContainer width="100%" height={40 + parts.length * 38}>
                <BarChart data={parts} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtCompact} {...axisProps} />
                  <YAxis type="category" dataKey="label" {...axisProps} width={110} />
                  <ReferenceLine x={0} stroke="var(--axis)" />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active: on, payload }) =>
                    on && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: "P&L", value: fmtMoney(payload[0].payload.v) }]} /> : null} />
                  <Bar dataKey="v" radius={4} maxBarSize={22} isAnimationActive={false}>
                    {parts.map((x, i) => <Cell key={i} fill={x.v >= 0 ? "var(--pos)" : "var(--neg)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      )}
    </Lab>
  );
}
