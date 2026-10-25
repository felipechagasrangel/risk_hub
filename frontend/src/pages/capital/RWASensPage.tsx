import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { EditableTable, type Column } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, M, RegNote, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtPct } from "../../format";

type Scenario = "medium" | "high" | "low";
type Resp = {
  vertices: number[];
  curves: { name: string; currency: string; settlement: string; category_factor: number; risk_weights: number[]; weighted_sensitivities: number[] }[];
  scenarios: Record<Scenario, { delta: number; categories: { currency: string; k: number; s: number }[] }>;
  binding_scenario: Scenario;
  requirement: number;
  rwa: number;
  correlation: Record<Scenario, number[][]>;
  curvature: {
    options: { name: string; curve: string; value: number; dv01: number; cvr_up: number; cvr_down: number }[];
    cvr_up: number; cvr_down: number; shock: number;
    scenarios: Record<Scenario, number>;
    profile: { shift_bps: number; value: number; linear: number }[];
  };
  totals: Record<Scenario, number>;
};

type OptionRow = {
  name: string; curve: string; kind: "call" | "put"; quantity: number;
  strike: number; rate: number; vol: number; expiry_du: number; underlying_du: string;
};

const VERTICES = [1, 63, 126, 252, 504, 756, 1260, 2520, 3780, 5040, 7560];
const YEARS = ["1 DU", "3m", "6m", "1a", "2a", "3a", "5a", "10a", "15a", "20a", "30a"];
const RW_BRL = [0, 3.2, 3.2, 3.1, 2.8, 2.7, 2.6, 2.6, 2.6, 2.6, 2.6];
const RW_OTHER = [0, 1.7, 1.7, 1.6, 1.3, 1.2, 1.1, 1.1, 1.1, 1.1, 1.1];
const SCEN_LABEL: Record<Scenario, string> = { medium: "Correlação média", high: "Correlação alta", low: "Correlação baixa" };
const CURRENCIES: [string, string][] = ["BRL", "USD", "EUR", "GBP", "JPY", "CHF"].map((c) => [c, c]);

type Row = { name: string; currency: string; settlement: string } & Record<`d${number}`, number>;
const toRow = (name: string, currency: string, settlement: string, dv01: Record<number, number>): Row =>
  ({ name, currency, settlement, ...Object.fromEntries(VERTICES.map((_, i) => [`d${i}`, dv01[i] ?? 0])) } as Row);

export default function RWASensPage() {
  const [rows, setRows] = useState<Row[]>([
    toRow("Pré (DI e prefixados)", "BRL", "BRL", { 2: -1500, 3: -3000, 4: -4000, 6: 6000 }),
    toRow("Cupom cambial", "USD", "BRL", { 3: 1500, 4: 1000 }),
    toRow("Treasuries", "USD", "USD", { 7: -800 }),
  ]);
  const [options, setOptions] = useState<OptionRow[]>([
    { name: "Calls de taxa DI1 vendidas", curve: "Pré (DI e prefixados)", kind: "call", quantity: -500,
      strike: 0.145, rate: 0.14, vol: 0.02, expiry_du: 252, underlying_du: "504" },
  ]);
  const [investmentGrade, setInvestmentGrade] = useState(false);
  const [heatScenario, setHeatScenario] = useState<Scenario>("medium");

  const curves = rows.map((r) => ({
    name: r.name, currency: r.currency, settlement: r.settlement,
    dv01: VERTICES.map((_, i) => r[`d${i}`]),
  }));
  const { data, error } = useCompute<Resp>("/capital/rwa-sens/girr-delta", {
    curves,
    options: options.map((o) => ({ ...o, underlying_du: Number(o.underlying_du) })),
    brazil_investment_grade: investmentGrade,
  });
  const brlCurves = rows.filter((r) => r.currency === "BRL").map((r): [string, string] => [r.name, r.name]);

  const columns: Column<Row>[] = [
    { key: "name", label: "Curva", type: "text", width: 170 },
    { key: "currency", label: "Denominação", type: "select", options: CURRENCIES, width: 90 },
    { key: "settlement", label: "Liquidação", type: "select", options: CURRENCIES, width: 90 },
    ...VERTICES.map((_, i) => ({ key: `d${i}` as const, label: YEARS[i], type: "number" as const, width: 80 })),
  ];

  return (
    <>
      <h1>RWA SENS: Delta de juros (GIRR)</h1>
      <p className="lead">
        A partir de 2027, o capital de risco de mercado dos bancos S1–S3 passa a ser calculado por
        <strong> sensibilidades</strong>. Esta página reconstrói, passo a passo, a peça mais importante
        para um banco brasileiro: o componente Delta da classe de juros livres de risco (GIRR).
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        Contexto regulatório e o que o RWA SENS substitui: veja a seção <Link to="/cadocs#rwasens">RWA SENS</Link> na página de CADOCs.
      </p>

      <h2>1. Sensibilidades por vértice</h2>
      <p>
        Cada curva de juros é representada por 11 vértices, em dias úteis. A sensibilidade de um
        instrumento a um vértice é a variação de valor quando apenas aquela taxa sobe 1 ponto-base,
        dividida por 0,0001:
      </p>
      <Formula tex={String.raw`S_{i,m,t} = \frac{V_i(r_{m,t} + 0{,}0001,\; X_i) - V_i(r_{m,t},\; X_i)}{0{,}0001}`} />
      <p>
        O numerador é o famoso <strong>DV01</strong> (ou PV01) do vértice. Somando os instrumentos, chega-se à
        <strong> sensibilidade consolidada</strong> <M>NS_k</M> de cada fator de risco. Um título prefixado
        comprado tem DV01 negativo (perde valor quando a taxa sobe); um DI vendido em taxa, positivo.
      </p>
      <Callout title="Curvas e categorias">
        Cada <strong>moeda de denominação</strong> é uma categoria. Curvas com a mesma moeda de denominação mas
        moedas de liquidação diferentes são fatores de risco <em>distintos</em> — é o caso do cupom cambial (juros
        em dólar liquidados em reais) frente à curva de Treasuries.
      </Callout>

      <h2>2. Ponderação</h2>
      <p>Cada sensibilidade é multiplicada por um ponderador de risco, produto de dois fatores:</p>
      <Formula tex={String.raw`WS_k = NS_k \times RW_k, \qquad RW_k = F_{\text{categoria}} \times F_{\text{vértice}}`} />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Vértice</th>{YEARS.map((y, i) => <th key={y} className="num">{VERTICES[i].toLocaleString("pt-BR")} DU<br /><span className="muted">{y}</span></th>)}</tr>
          </thead>
          <tbody>
            <tr><td>F<sub>vértice</sub> — Reais (Anexo I)</td>{RW_BRL.map((v, i) => <td key={i} className="num">{v.toFixed(1)}%</td>)}</tr>
            <tr><td>F<sub>vértice</sub> — demais moedas (Anexo I-A)</td>{RW_OTHER.map((v, i) => <td key={i} className="num">{v.toFixed(1)}%</td>)}</tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li><strong>F<sub>categoria</sub> para o real</strong>: 0,7071 se a classificação de risco do Brasil for BBB− ou melhor; 1,0 caso contrário.</li>
        <li><strong>F<sub>categoria</sub> para EUR, USD, GBP, AUD, JPY, SEK e CAD</strong>: 0,7071 quando denominação e liquidação são a mesma moeda; 1,0 nos demais casos.</li>
        <li>O vértice de 1 dia útil tem ponderador zero.</li>
      </ul>
      <Callout title="Uma leitura intuitiva do ponderador">
        Como <M>{String.raw`NS = \text{DV01}/0{,}0001`}</M>, o produto <M>{String.raw`NS \times RW`}</M> é o DV01 vezes um
        choque de <M>{String.raw`RW \times 10.000`}</M> bps. Um ponderador de 2,6% equivale a um choque de 260 bps nos juros
        em reais — contra 110 bps para o vértice equivalente do dólar. O real é bem mais penalizado. Repare
        que 0,7071 ≈ 1/√2.
      </Callout>

      <h2>3. Agregação dentro da categoria</h2>
      <p>As sensibilidades ponderadas de uma mesma moeda são agregadas com correlações entre fatores:</p>
      <Formula tex={String.raw`K_b = \sqrt{\max\Big(0,\; \sum_k WS_k^2 + \sum_k \sum_{\ell \neq k} \rho_{k\ell}\, WS_k\, WS_\ell\Big)}`} />
      <ul>
        <li><strong>Mesma curva, vértices diferentes</strong>: <M>\rho</M> do Anexo VII — próxima de 100% para vértices vizinhos e com piso de 40% para os distantes;</li>
        <li><strong>Mesmo vértice, curvas diferentes</strong>: 99,9%;</li>
        <li><strong>Curvas e vértices diferentes</strong>: valor do Anexo VII × 99,9%.</li>
      </ul>
      <p>
        O Anexo VII segue a fórmula de Basileia <M>{String.raw`\rho_{k\ell} = \max\!\big(e^{-3\% \cdot |T_k - T_\ell| / \min(T_k, T_\ell)},\; 40\%\big)`}</M>,
        com os prazos em anos.
      </p>

      <h2>4. Agregação entre moedas</h2>
      <p>As categorias se combinam com correlação <M>\gamma = 50\%</M>, usando a soma simples <M>{String.raw`S_b = \sum_k WS_k`}</M>:</p>
      <Formula tex={String.raw`\Delta_{\text{GIRR}} = \sqrt{\sum_b K_b^2 + \sum_b \sum_{c \neq b} \gamma_{bc}\, S_b\, S_c}`} />
      <p>Se o termo dentro da raiz ficar negativo, cada <M>S_b</M> é limitado ao intervalo <M>{String.raw`[-K_b,\, K_b]`}</M> e a conta é refeita.</p>

      <h2>5. Os três cenários de correlação</h2>
      <p>Todas as correlações (<M>\rho</M> e <M>\gamma</M>) são recalculadas em três cenários:</p>
      <Formula tex={String.raw`\rho^{\text{alta}} = \min(1{,}25\,\rho;\; 1) \qquad \rho^{\text{baixa}} = \max(2\rho - 1;\; 0{,}75\,\rho)`} />
      <p>
        O requerimento é o <strong>maior</strong> dos três. A intuição: correlações estimadas em tempos normais
        são instáveis. Se a carteira tem posições na mesma direção, o pior caso é a correlação alta (nada se
        diversifica); se tem hedges entre vértices ou moedas, o pior caso é a correlação baixa (o hedge funciona menos).
      </p>
      <Formula tex={String.raw`\text{RWA}_{\text{SENS}} = \frac{1}{8\%}\,\max\big(R_{\text{alta}}, R_{\text{média}}, R_{\text{baixa}}\big), \qquad R = \Delta + \text{Vega} + \text{Curvatura} \text{ (todas as classes)}`} />
      <p className="muted" style={{ fontSize: 14 }}>
        Na conta completa, o máximo é tomado depois de somar todas as classes e componentes em cada cenário.
        Aqui somamos Delta e Curvatura GIRR por cenário e depois tomamos o máximo.
      </p>

      <h2>6. Curvatura: o que o Delta não vê</h2>
      <p>
        O Delta é uma aproximação linear: supõe que o valor muda proporcionalmente ao choque. Para uma
        <strong> opção</strong> isso não vale — o valor é convexo (comprado em opção) ou côncavo (vendido). A
        Curvatura mede a <strong>perda além da reta</strong> num choque grande, para cima e para baixo:
      </p>
      <Formula tex={String.raw`CVR_k^{+} = -\sum_i \Big[V_i\big(x_k^{+RW}\big) - V_i(x_k) - RW^{curv}\, s_{ik}\Big] \qquad CVR_k^{-} = -\sum_i \Big[V_i\big(x_k^{-RW}\big) - V_i(x_k) + RW^{curv}\, s_{ik}\Big]`} />
      <ul>
        <li>Para GIRR, o fator de risco é a <strong>curva inteira</strong> de cada moeda, e o choque é <strong>paralelo de ±1,7%</strong> (art. 96) — menor que o ponderador Delta do real, que chega a 3,2%;</li>
        <li><M>{"s_{ik}"}</M> é a soma das sensibilidades Delta da opção a todos os vértices da curva (art. 90);</li>
        <li>Comprado em opção: o valor fica <em>acima</em> da reta nos dois lados, os CVR são negativos e não há capital;</li>
        <li>Vendido em opção: perde mais que o linear para os dois lados — é aí que a Curvatura cobra capital.</li>
      </ul>
      <p>Na categoria (moeda), escolhe-se o pior lado; entre curvas da mesma moeda, <M>{String.raw`\rho = 99{,}8\%`}</M>; entre moedas, <M>{String.raw`\gamma = 25\%`}</M>:</p>
      <Formula tex={String.raw`K_b = \max\big(K_b^{+},\, K_b^{-}\big), \qquad K_b^{\pm} = \sqrt{\max\Big(0,\; \sum_k \max(0, CVR_k^{\pm})^2 + \sum_k\sum_{\ell\neq k} \rho_{k\ell}\, CVR_k^{\pm}\, CVR_\ell^{\pm}\, \psi\Big)}`} />
      <p className="muted" style={{ fontSize: 14 }}>
        ψ vale zero quando os dois CVR são negativos (dois ganhos não se compensam com perdas de terceiros) e
        um nos demais casos. Os mesmos três cenários de correlação valem aqui — mas, com uma única curva em
        reais, a Curvatura é igual nos três: a diferença entre cenários vem do Delta.
      </p>
      <Callout title="Opção sobre a taxa DI1 (como modelamos)">
        Uma <strong>call de taxa</strong> ganha quando o DI sobe: no vencimento paga, por contrato,
        PU(K) − PU(r<sub>T</sub>), com PU(r) = 100.000 / (1 + r)<sup>DU/252</sup> para os dias úteis restantes do DI1. A taxa
        terminal segue uma normal (modelo de Bachelier) com volatilidade anual em pontos percentuais. Sem desconto
        do prêmio — o objetivo é mostrar a forma da curva de valor, não precificar para negociação.
      </Callout>

      <h2>7. Laboratório</h2>
      <Lab title="Calcule o Delta e a Curvatura GIRR de uma carteira">
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Informe o DV01 de cada curva por vértice: a variação de valor, em R$, para +1 bp. Negativo = perde com alta de juros.
        </p>
        <EditableTable<Row>
          rows={rows}
          onChange={setRows}
          newRow={() => toRow("Nova curva", "BRL", "BRL", {})}
          columns={columns}
        />
        <h3>Opções sobre a taxa DI1</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          O delta de cada opção é somado à curva em reais escolhida, no vértice do DI1 subjacente. Quantidade negativa = vendido.
        </p>
        <EditableTable<OptionRow>
          rows={options}
          onChange={setOptions}
          newRow={() => ({ name: "Nova opção", curve: brlCurves[0]?.[0] ?? "Pré", kind: "call", quantity: 100,
            strike: 0.14, rate: 0.14, vol: 0.02, expiry_du: 126, underlying_du: "252" })}
          columns={[
            { key: "name", label: "Opção", type: "text", width: 180 },
            { key: "curve", label: "Curva", type: "select", options: brlCurves.length ? brlCurves : [["Pré", "Pré"]], width: 170 },
            { key: "kind", label: "Tipo", type: "select", options: [["call", "Call de taxa"], ["put", "Put de taxa"]], width: 120 },
            { key: "quantity", label: "Contratos", type: "number", width: 90 },
            { key: "strike", label: "Strike", type: "percent", width: 80 },
            { key: "rate", label: "Taxa DI1", type: "percent", width: 80 },
            { key: "vol", label: "Vol. normal", type: "percent", width: 80 },
            { key: "expiry_du", label: "Venc. opção (DU)", type: "number", width: 90 },
            { key: "underlying_du", label: "DI1 (DU)", type: "select", width: 100,
              options: VERTICES.slice(2).map((v) => [String(v), `${v.toLocaleString("pt-BR")} DU`]) },
          ]}
          computed={data && data.curvature.options.length === options.length ? [
            { label: "Valor", values: data.curvature.options.map((o) => fmtMoney(o.value)) },
            { label: "DV01", values: data.curvature.options.map((o) => fmtMoney(o.dv01)) },
            { label: "CVR⁺", values: data.curvature.options.map((o) => fmtMoney(o.cvr_up)) },
            { label: "CVR⁻", values: data.curvature.options.map((o) => fmtMoney(o.cvr_down)) },
          ] : []}
        />
        <div className="grid" style={{ marginTop: 16 }}>
          <SelectField label="Rating do Brasil" value={investmentGrade ? "ig" : "hy"} onChange={(v) => setInvestmentGrade(v === "ig")}
            options={[["hy", "Abaixo de BBB− (fator 1,0)"], ["ig", "BBB− ou melhor (fator 0,7071)"]]} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && <Results data={data} heatScenario={heatScenario} setHeatScenario={setHeatScenario} />}
      </Lab>

      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Na carteira padrão, o DI longo de 5 anos faz hedge dos prefixados curtos. Por isso o cenário de <strong>correlação baixa</strong> é o que define o capital.</li>
          <li>Troque o sinal do DV01 de 5 anos para −6.000 (tudo comprado): agora o cenário de <strong>correlação alta</strong> passa a ser o pior.</li>
          <li>Mude o rating do Brasil para grau de investimento: o capital das curvas em reais cai cerca de 29% (fator 0,7071).</li>
          <li>Mude a liquidação dos Treasuries para BRL: o fator de categoria sobe de 0,7071 para 1,0.</li>
          <li>Ponha o mesmo DV01 em 3 meses e em 30 anos com sinais opostos: a correlação de apenas 40% quase não deixa o hedge funcionar.</li>
          <li><strong>Hedge de delta não elimina a curvatura:</strong> some ao vértice de 2 anos da curva Pré o DV01 da opção com sinal trocado (cerca de +1.345). O delta da opção some, mas o CVR⁺ continua lá — vendido em opção é vendido em convexidade.</li>
          <li>Troque a quantidade da opção para +500 (comprado): os CVR ficam negativos e a Curvatura vai a zero.</li>
          <li>Aproxime o strike da taxa (opção no dinheiro) e veja os dois CVR ficarem parecidos; afaste o strike e a curvatura cai.</li>
        </ul>
      </Callout>

      <RegNote>
        <p>
          Parâmetros da Resolução BCB nº 470/2025 (texto anexo ao Voto BCB nº 42/2025): vértices do art. 9º,
          ponderadores dos Anexos I e I-A, correlações do Anexo VII e arts. 31, 32 e 38 a 42. A calculadora
          ignora o fator de expectativas de índices de preço (ponderador 1,6% e correlação de 40%), a Vega e
          a Curvatura. Confira sempre o texto vigente, incluindo os ajustes da Resolução BCB nº 592/2026.
        </p>
      </RegNote>
    </>
  );
}

function Results({ data, heatScenario, setHeatScenario }: {
  data: Resp; heatScenario: Scenario; setHeatScenario: (s: Scenario) => void;
}) {
  const scen: Scenario[] = ["medium", "high", "low"];
  const curv = data.curvature;
  const bars = scen.map((s) => ({
    s, label: SCEN_LABEL[s] + (s === data.binding_scenario ? " ★" : ""),
    delta: data.scenarios[s].delta, curvature: curv.scenarios[s], total: data.totals[s],
  }));
  const currencies = data.scenarios.medium.categories.map((c) => c.currency);

  return (
    <>
      <div className="stats">
        {scen.map((s) => (
          <Stat key={s} label={SCEN_LABEL[s]} value={fmtMoney(data.totals[s])}
            sub={<>
              Δ {fmtMoney(data.scenarios[s].delta)} + Curv. {fmtMoney(curv.scenarios[s])}
              {s === data.binding_scenario && (
                <div style={{ marginTop: 4 }}><span className="badge"><span className="dot" style={{ background: "var(--series-1)" }} />Define o capital</span></div>
              )}
            </>} />
        ))}
        <Stat label="RWA SENS (Delta + Curvatura GIRR)" value={fmtMoney(data.rwa)} sub={`= ${fmtMoney(data.requirement)} ÷ 8%`} />
      </div>

      <div className="chart-title">Requerimento GIRR por cenário de correlação</div>
      <div className="chart-sub">Delta e Curvatura somados em cada cenário; vale o maior total (★).</div>
      <Legend items={[
        { label: "Delta", color: "var(--series-1)", box: true },
        { label: "Curvatura", color: "var(--series-2)", box: true },
      ]} />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" tickFormatter={fmtCompact} {...axisProps} />
          <YAxis type="category" dataKey="label" {...axisProps} width={140} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
            active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[
              { label: "Delta", value: fmtMoney(payload[0].payload.delta), color: "var(--series-1)" },
              { label: "Curvatura", value: fmtMoney(payload[0].payload.curvature), color: "var(--series-2)" },
              { label: "Total", value: fmtMoney(payload[0].payload.total) },
            ]} /> : null} />
          <Bar dataKey="delta" stackId="r" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="curvature" stackId="r" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      {curv.profile.length > 0 && <CurvatureChart data={data} />}

      <h3>Sensibilidades ponderadas (WS = NS × RW)</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Curva</th><th className="num">F<sub>cat</sub></th>{YEARS.map((y) => <th key={y} className="num">{y}</th>)}</tr>
          </thead>
          <tbody>
            {data.curves.map((c, i) => (
              <tr key={i}>
                <td>{c.name} <span className="muted">({c.currency}/{c.settlement})</span></td>
                <td className="num">{c.category_factor.toLocaleString("pt-BR")}</td>
                {c.weighted_sensitivities.map((w, j) => (
                  <td key={j} className="num" title={`RW ${fmtPct(c.risk_weights[j], 2)}`}>{w ? fmtCompact(w) : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Por categoria (moeda)</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Moeda</th><th className="num">S<sub>b</sub> = ΣWS</th>{scen.map((s) => <th key={s} className="num">K<sub>b</sub> — {SCEN_LABEL[s].replace("Correlação ", "")}</th>)}</tr>
          </thead>
          <tbody>
            {currencies.map((cur, i) => (
              <tr key={cur}>
                <td>{cur}</td>
                <td className="num">{fmtMoney(data.scenarios.medium.categories[i].s)}</td>
                {scen.map((s) => <td key={s} className="num">{fmtMoney(data.scenarios[s].categories[i].k)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        |S<sub>b</sub>| maior que K<sub>b</sub> indica posições na mesma direção; S<sub>b</sub> próximo de zero com K<sub>b</sub> alto indica hedges entre vértices.
      </p>

      <h3>Correlação entre vértices da mesma curva</h3>
      <div className="grid" style={{ maxWidth: 320 }}>
        <SelectField label="Cenário" value={heatScenario} onChange={setHeatScenario}
          options={scen.map((s) => [s, SCEN_LABEL[s]])} />
      </div>
      <Heatmap matrix={data.correlation[heatScenario]} labels={YEARS.slice(1)} />
    </>
  );
}

function CurvatureChart({ data }: { data: Resp }) {
  const curv = data.curvature;
  const shockBps = Math.round(curv.shock * 10000);
  const at = (bps: number) => curv.profile.find((p) => p.shift_bps === bps);
  const up = at(shockBps);
  const down = at(-shockBps);
  return (
    <>
      <h3>A não linearidade das opções</h3>
      <div className="stats">
        <Stat label={`CVR⁺ (curva +${shockBps} bps)`} value={fmtMoney(curv.cvr_up)} sub={curv.cvr_up > 0 ? "perda além do linear" : "ganho além do linear"} />
        <Stat label={`CVR⁻ (curva −${shockBps} bps)`} value={fmtMoney(curv.cvr_down)} sub={curv.cvr_down > 0 ? "perda além do linear" : "ganho além do linear"} />
        <Stat label="Curvatura GIRR" value={fmtMoney(curv.scenarios.medium)} sub="= max(0, pior CVR), com uma curva só" />
      </div>
      <div className="chart-title">Valor das opções vs. aproximação linear (Delta) por deslocamento paralelo da curva</div>
      <div className="chart-sub">
        A distância vertical entre as linhas nas marcas de ±{shockBps} bps é o CVR. Linhas verticais: choques da Curvatura.
      </div>
      <Legend items={[
        { label: "Valor reprecificado", color: "var(--series-2)" },
        { label: "Aproximação linear (Delta)", color: "var(--series-1)" },
      ]} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={curv.profile} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="shift_bps" type="number" domain={[-300, 300]} ticks={[-300, -shockBps, 0, shockBps, 300]}
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v} bps`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Resp["curvature"]["profile"][number];
            return <TooltipBox title={`Curva ${p.shift_bps > 0 ? "+" : ""}${p.shift_bps} bps`} rows={[
              { label: "Reprecificado", value: fmtMoney(p.value), color: "var(--series-2)" },
              { label: "Linear", value: fmtMoney(p.linear), color: "var(--series-1)" },
              { label: "Diferença", value: fmtMoney(p.value - p.linear) },
            ]} />;
          }} />
          <ReferenceLine x={shockBps} stroke="var(--axis)" strokeDasharray="4 3" />
          <ReferenceLine x={-shockBps} stroke="var(--axis)" strokeDasharray="4 3" />
          <Line dataKey="linear" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="value" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          {up && down && <>
            <ReferenceLine segment={[{ x: shockBps, y: up.linear }, { x: shockBps, y: up.value }]} stroke="var(--critical)" strokeWidth={3} />
            <ReferenceLine segment={[{ x: -shockBps, y: down.linear }, { x: -shockBps, y: down.value }]} stroke="var(--critical)" strokeWidth={3} />
          </>}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function Heatmap({ matrix, labels }: { matrix: number[][]; labels: string[] }) {
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="data heat">
        <thead><tr><th />{labels.map((l) => <th key={l} className="num">{l}</th>)}</tr></thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th>{labels[i]}</th>
              {row.map((v, j) => {
                // Rampa sequencial de um só tom: 30% → claro, 100% → escuro
                const pct = Math.round(Math.max(0, (v - 0.3) / 0.7) * 85 + 10);
                return (
                  <td key={j} className="num" style={{
                    background: `color-mix(in srgb, var(--series-1) ${pct}%, var(--surface))`,
                    color: pct > 55 ? "#fff" : "var(--text)",
                  }}>{Math.round(v * 100)}%</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
