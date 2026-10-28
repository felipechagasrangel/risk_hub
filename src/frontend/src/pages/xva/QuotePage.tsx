import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Side = { cva: number; dva: number; fca: number; fba: number; mva: number; total: number; bps: number; quote: number };
type QuoteResp = {
  par_rate: number;
  sensitivity: number;
  payments: number;
  no_csa: Side;
  with_csa: Side;
  profile: { t: number; ee_no_csa: number; ee_csa: number; pfe_no_csa: number; pfe_csa: number }[];
};

export default function QuotePage() {
  return (
    <>
      <h1>Cotação de swap com e sem CSA</h1>
      <p className="lead">
        A mesma operação pode ter taxas diferentes conforme o acordo de colateral com o cliente. Esta página
        transforma o XVA de um swap com vários fluxos numa diferença de taxa, do jeito que a mesa cota.
      </p>

      <h2>1. Três preços para o mesmo swap</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Preço</th><th>O que considera</th><th>Ajustes</th></tr></thead>
          <tbody>
            <tr><td><strong>Taxa par (sem risco)</strong></td><td>Ninguém quebra e tudo é financiado à taxa do colateral (CDI)</td><td>—</td></tr>
            <tr><td><strong>Com CSA</strong></td><td>Margem de variação diária em caixa, remunerada ao CDI</td><td>CVA e DVA residuais (só o que anda no MPOR), MVA se houver margem inicial; sem FVA</td></tr>
            <tr><td><strong>Sem CSA</strong></td><td>Exposição cheia, sem garantias; o hedge colateralizado precisa ser financiado</td><td>CVA, DVA e FVA sobre toda a exposição</td></tr>
          </tbody>
        </table>
      </div>

      <h2>2. O swap com vários fluxos</h2>
      <p>
        Num swap pré × CDI com pagamentos periódicos, a cada data troca-se o cupom pré do período pelo CDI acumulado
        no período, sem troca de principal. O MTM em cada cenário tem fórmula fechada no Hull-White:
      </p>
      <Formula tex={String.raw`V(t) = \underbrace{\sum_{T_i > t} N\big[(1+K)^{\tau_i} - 1\big] P(t,T_i)}_{\text{ponta pré}} \;-\; \underbrace{N\Big[e^{\int_{T_{j}}^{t} r_s\,ds} - P(t,T_n)\Big]}_{\text{ponta CDI}}`} where={[[String.raw`N`, "nocional"], [String.raw`K`, "taxa pré do swap"], [String.raw`\tau_i`, "prazo do período i, em anos"], [String.raw`P(t,T_i)`, "zero-cupom do Hull-White na trajetória, de t até o pagamento i"], [String.raw`T_j`, "data do último fixing (o início do período corrente)"], [String.raw`e^{\int r\,ds}`, "CDI já acumulado no período corrente"], [String.raw`T_n`, "vencimento do swap"]]} />
      <p>
        Cada pagamento “zera” parte do que estava em jogo, por isso a exposição tem forma de serra: sobe entre as
        datas e cai a cada troca. No <Link to="/xva/exposicao">swap bullet</Link>, ao contrário, ela cresce até o fim.
      </p>
      <CodeSnippet name="swap_periodic_mtm" caption="MTM do swap com fluxos em cada cenário" />

      <h2>3. De R$ para taxa</h2>
      <p>
        A mesa não cobra o XVA como uma tarifa: embute na taxa. Basta dividir o ajuste pela sensibilidade do valor do
        swap à taxa pré:
      </p>
      <Formula tex={String.raw`\Delta K = \frac{\text{XVA}}{\partial V / \partial K}, \qquad \frac{\partial V}{\partial K} = N \sum_i \tau_i\,(1+K)^{\tau_i - 1}\,P(0,T_i), \qquad K_{\text{cotado}} = K_{\text{par}} \pm \Delta K`} where={[[String.raw`\text{XVA}`, "soma dos ajustes, em R$ (custos positivos)"], [String.raw`\partial V / \partial K`, "quanto o valor do swap muda por unidade de taxa pré — parecido com um DV01 da ponta pré"], [String.raw`K_{\text{par}}`, "taxa que zera o valor sem risco"], [String.raw`\pm`, "o banco que recebe pré cobra mais (+); o que paga pré oferece menos (−)"]]} />
      <CodeSnippet name="fixed_rate_sensitivity" />
      <CodeSnippet name="quote_run" caption="as duas cotações" />

      <h2>4. Laboratório</h2>
      <QuoteLab />
      <Callout title="O que observar">
        <ul>
          <li>A diferença de taxa entre com e sem CSA é o “preço” do contrato de colateral para o cliente.</li>
          <li>Troque os fluxos de semestral para bullet: a exposição deixa de cair a cada pagamento e o XVA sem CSA aumenta bastante.</li>
          <li>Com CSA, o CVA residual depende do MPOR; o MVA pode ser o maior ajuste quando há margem inicial.</li>
          <li>Dobre o prazo: o ajuste em R$ cresce mais que a sensibilidade, e o spread em bps aumenta.</li>
        </ul>
      </Callout>
    </>
  );
}

function QuoteLab() {
  const [p, setP] = useState({
    notional: 10_000_000, maturity: 5, per_year: 2 as 0 | 1 | 2 | 4, rate: 0.14, hw_a: 0.15, hw_sigma: 0.02, receive: true,
    cpty_spread: 0.02, cpty_recovery: 0.4, own_spread: 0.01, own_recovery: 0.4, funding_spread: 0.01, lend_spread: 0.003,
    threshold: 0, mpor_days: 10, initial_margin: true, n_paths: 4000, seed: 7,
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<QuoteResp>("/xva/quote", p, 400);

  const rows: [string, keyof Side, number][] = [
    ["CVA", "cva", 1], ["DVA (benefício)", "dva", -1], ["FCA", "fca", 1], ["FBA (benefício)", "fba", -1], ["MVA", "mva", 1],
  ];

  return (
    <Lab title="Cotação de um swap pré × CDI com fluxos">
      <div className="grid">
        <SelectField label="Fluxos" value={String(p.per_year)} onChange={(v) => set("per_year")(Number(v) as 0 | 1 | 2 | 4)}
          options={[["0", "Bullet (só no vencimento)"], ["1", "Anuais"], ["2", "Semestrais"], ["4", "Trimestrais"]]} />
        <SelectField label="Posição do banco" value={p.receive ? "a" : "b"} onChange={(v) => set("receive")(v === "a")}
          options={[["a", "Recebe pré, paga CDI"], ["b", "Paga pré, recebe CDI"]]} />
        <NumField label="Nocional" value={p.notional} onChange={set("notional")} step={5_000_000} />
        <NumField label="Prazo (anos)" value={p.maturity} onChange={set("maturity")} step={1} min={1} max={10} />
        <NumField label="Taxa pré de mercado" percent value={p.rate} onChange={set("rate")} step={0.25} />
        <NumField label="Vol. da taxa curta σ" percent value={p.hw_sigma} onChange={set("hw_sigma")} step={0.25} />
        <NumField label="CDS da contraparte" percent value={p.cpty_spread} onChange={set("cpty_spread")} step={0.25} />
        <NumField label="CDS do banco" percent value={p.own_spread} onChange={set("own_spread")} step={0.25} />
        <NumField label="Spread de captação" percent value={p.funding_spread} onChange={set("funding_spread")} step={0.1} />
        <NumField label="Spread de aplicação" percent value={p.lend_spread} onChange={set("lend_spread")} step={0.1} />
        <NumField label="MPOR com CSA (dias úteis)" value={p.mpor_days} onChange={set("mpor_days")} step={5} min={0} max={60} />
        <SelectField label="Margem inicial com CSA" value={p.initial_margin ? "y" : "n"} onChange={(v) => set("initial_margin")(v === "y")}
          options={[["y", "Sim (gera MVA)"], ["n", "Não"]]} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Taxa par (sem risco)" value={fmtPct(data.par_rate, 2)} sub={`${data.payments} fluxo(s)`} />
            <Stat label="Cotação sem CSA" value={fmtPct(data.no_csa.quote, 3)} sub={`${data.no_csa.bps >= 0 ? "+" : ""}${fmtNum(data.no_csa.bps, 1)} bps`} />
            <Stat label="Cotação com CSA" value={fmtPct(data.with_csa.quote, 3)} sub={`${data.with_csa.bps >= 0 ? "+" : ""}${fmtNum(data.with_csa.bps, 1)} bps`} />
            <Stat label="Diferença" value={`${fmtNum(Math.abs(data.no_csa.bps - data.with_csa.bps), 1)} bps`} sub={`∂V/∂K por 1 bp: ${fmtMoney(data.sensitivity / 10_000)}`} />
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ajuste (R$)</th><th className="num">Sem CSA</th><th className="num">Com CSA</th></tr></thead>
              <tbody>
                {rows.map(([label, key, sign]) => (
                  <tr key={key}><td>{label}</td><td className="num">{fmtMoney(sign * data.no_csa[key])}</td><td className="num">{fmtMoney(sign * data.with_csa[key])}</td></tr>
                ))}
                <tr><td><strong>XVA total</strong></td><td className="num"><strong>{fmtMoney(data.no_csa.total)}</strong></td><td className="num"><strong>{fmtMoney(data.with_csa.total)}</strong></td></tr>
                <tr><td><strong>Em taxa</strong></td><td className="num"><strong>{fmtNum(data.no_csa.bps, 1)} bps</strong></td><td className="num"><strong>{fmtNum(data.with_csa.bps, 1)} bps</strong></td></tr>
              </tbody>
            </table>
          </div>
          <div className="chart-title" style={{ marginTop: 18 }}>Exposição esperada com e sem CSA</div>
          <div className="chart-sub">Com fluxos periódicos, a exposição cai a cada pagamento (forma de serra).</div>
          <Legend items={[
            { label: "EE sem CSA", color: "var(--series-1)" },
            { label: "EE com CSA", color: "var(--series-2)" },
          ]} />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.profile} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as QuoteResp["profile"][number];
                return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
                  { label: "EE sem CSA", value: fmtMoney(d.ee_no_csa), color: "var(--series-1)" },
                  { label: "EE com CSA", value: fmtMoney(d.ee_csa), color: "var(--series-2)" },
                ]} />;
              }} />
              <Line dataKey="ee_no_csa" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="ee_csa" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
