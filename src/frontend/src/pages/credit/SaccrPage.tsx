import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, NumField, RegNote, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Kind = "ir_swap" | "fx_forward" | "fx_option";
type Row = { name: string; kind: Kind; notional: number; start: number; end: number; direction: "long" | "short"; mtm: number; option: "call" | "put"; moneyness: number };
type Term = { asset_class: "ir" | "fx"; hedging_set: string; bucket: number | null; adjusted_notional: number; delta: number; mf: number; effective: number };
type Result = {
  terms: Term[];
  add_on: { hedging_sets: { asset_class: string; hedging_set: string; buckets: number[]; effective_notional: number; add_on: number }[]; aggregate: number };
  mtm: number; rc: number; multiplier: number; pfe: number; ead: number;
};
type Resp = { chosen: Result; unmargined: Result; margined: Result; cem: { current_exposure: number; gross_add_on: number; ngr: number; ead: number }; rwa: number };

const KIND_LABEL: Record<Kind, string> = { ir_swap: "Swap de juros", fx_forward: "Termo / NDF de dólar", fx_option: "Opção de dólar" };
const BUCKETS = ["até 1 ano", "1 a 5 anos", "acima de 5 anos"];

export default function SaccrPage() {
  return (
    <>
      <h1>SA-CCR: a exposição regulatória de derivativos</h1>
      <p className="lead">
        Para o RWA de crédito, um derivativo precisa de uma <strong>exposição no default</strong> (EAD), como um
        empréstimo. Mas o valor de um derivativo muda com o mercado. O SA-CCR é a fórmula padronizada de Basileia
        para essa exposição: o que já se perderia hoje mais um colchão para o que o MTM ainda pode andar.
      </p>

      <h2>1. A fórmula</h2>
      <Formula tex={String.raw`\text{EAD} = \alpha\,\big(\text{RC} + \text{PFE}\big), \qquad \alpha = 1{,}4, \qquad \text{PFE} = \text{multiplicador}\times\text{AddOn}^{\text{agregado}}`} where={[[String.raw`\text{RC}`, "custo de reposição: o que se perderia se a contraparte quebrasse hoje"], [String.raw`\text{PFE}`, "exposição potencial futura: o quanto o MTM pode crescer até o encerramento das posições"], [String.raw`\alpha`, "fator de 1,4, herdado do método de modelos internos (EAD = 1,4 × EEPE)"], [String.raw`\text{AddOn}`, "soma, por classe de risco, dos add-ons dos conjuntos de hedge"]]} />
      <p>
        É a versão regulatória da PFE da <Link to="/xva/exposicao">página de exposição</Link>: em vez de simular trajetórias, o SA-CCR
        usa parâmetros supervisórios por classe de risco. O EAD resultante entra no RWA de crédito com o fator de ponderação da contraparte.
      </p>

      <h2>2. Custo de reposição</h2>
      <Formula tex={String.raw`\text{RC}^{\text{sem margem}} = \max(V - C,\ 0), \qquad \text{RC}^{\text{com margem}} = \max\big(V - C,\ \text{TH} + \text{MTA} - \text{NICA},\ 0\big)`} where={[[String.raw`V`, "MTM líquido do conjunto de netting"], [String.raw`C`, "colateral líquido recebido (negativo se o banco entregou)"], [String.raw`\text{TH},\ \text{MTA}`, "threshold e valor mínimo de transferência do CSA"], [String.raw`\text{NICA}`, "colateral independente líquido (valor independente, margem inicial) que não acompanha o MTM"]]} />
      <p>Com margem, o RC nunca fica abaixo da exposição que o CSA deixa descoberta (threshold + MTA), mesmo com o MTM zerado.</p>
      <CodeSnippet name="replacement_cost" />

      <h2>3. Os ingredientes de cada operação</h2>
      <Formula tex={String.raw`\text{nocional efetivo}_i = \delta_i \cdot d_i \cdot \text{MF}_i, \qquad d_i^{\text{juros}} = N_i \cdot \text{SD}_i, \qquad \text{SD}_i = \frac{e^{-0{,}05\,S_i} - e^{-0{,}05\,E_i}}{0{,}05}`} where={[[String.raw`\delta_i`, "delta supervisório: +1 se comprado no fator principal (paga pré, comprado em dólar), −1 se vendido; em opções, o delta de Black"], [String.raw`d_i`, "nocional ajustado: em juros, o nocional × duration supervisória; em câmbio, o nocional em reais"], [String.raw`S_i,\ E_i`, "início e fim da operação, em anos"], [String.raw`\text{MF}_i`, "fator de prazo"]]} />
      <Formula tex={String.raw`\text{MF}^{\text{sem margem}} = \sqrt{\min(M, 1\text{ ano})}, \qquad \text{MF}^{\text{com margem}} = 1{,}5\,\sqrt{\frac{\text{MPOR}}{250}}, \qquad \delta^{\text{call comprada}} = N\!\left(\frac{\ln(P/K) + \tfrac12\sigma^2 T}{\sigma\sqrt T}\right)`} where={[[String.raw`M`, "prazo remanescente (mínimo de 10 dias úteis)"], [String.raw`\text{MPOR}`, "período de risco de margem, em dias úteis (10 no bilateral)"], [String.raw`P/K`, "preço do subjacente sobre o strike"], [String.raw`\sigma`, "volatilidade supervisória: 15% para câmbio, 50% para juros"], [String.raw`T`, "prazo até o exercício"]]} />
      <CodeSnippet name="supervisory_duration" />
      <CodeSnippet name="maturity_factor" />
      <CodeSnippet name="supervisory_delta" />

      <h2>4. Conjuntos de hedge e add-ons</h2>
      <p>
        As operações só se compensam dentro do mesmo <strong>conjunto de hedge</strong>: em juros, a mesma moeda; em câmbio,
        o mesmo par. Nos juros, os nocionais efetivos são somados em três faixas de vencimento e agregados com correlações
        supervisórias — vizinhas compensam 70%, extremas 30%:
      </p>
      <Formula tex={String.raw`\text{NE}^{\text{juros}} = \sqrt{D_1^2 + D_2^2 + D_3^2 + 1{,}4\,D_1 D_2 + 1{,}4\,D_2 D_3 + 0{,}6\,D_1 D_3}, \qquad \text{AddOn}^{\text{juros}} = 0{,}5\%\cdot\text{NE}, \qquad \text{AddOn}^{\text{câmbio}} = 4\%\cdot\Big|\sum_i \delta_i d_i \text{MF}_i\Big|`} where={[[String.raw`D_1,\ D_2,\ D_3`, "soma dos nocionais efetivos com vencimento até 1 ano, de 1 a 5 anos e acima de 5 anos"], [String.raw`\text{NE}`, "nocional efetivo do conjunto de hedge"], [String.raw`0{,}5\%,\ 4\%`, "fatores supervisórios de juros e de câmbio"]]} />
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Classe</th><th>Conjunto de hedge</th><th className="num">Fator supervisório</th></tr></thead>
          <tbody>
            <tr><td>Juros</td><td>Moeda</td><td className="num">0,5%</td></tr>
            <tr><td>Câmbio</td><td>Par de moedas</td><td className="num">4%</td></tr>
            <tr><td>Crédito</td><td>Toda a classe (nome a nome, com correlação)</td><td className="num">0,38% a 6% por rating; índices 0,38% e 1,06%</td></tr>
            <tr><td>Ações</td><td>Toda a classe</td><td className="num">32% (nome) · 20% (índice)</td></tr>
            <tr><td>Mercadorias</td><td>Energia, metais, agrícolas, outros</td><td className="num">40% (eletricidade) · 18% (demais)</td></tr>
          </tbody>
        </table>
      </div>
      <CodeSnippet name="ir_effective_notional" />
      <CodeSnippet name="add_ons" caption="add-on por conjunto de hedge" />

      <h2>5. O multiplicador</h2>
      <p>Um conjunto com MTM negativo ou com colateral em excesso tem menos chance de virar exposição. O multiplicador reconhece isso, com piso de 5%:</p>
      <Formula tex={String.raw`\text{multiplicador} = \min\!\left\{1;\ 5\% + 95\%\cdot\exp\!\left(\frac{V - C}{2 \cdot 95\% \cdot \text{AddOn}^{\text{agregado}}}\right)\right\}`} where={[[String.raw`V - C`, "MTM líquido descontado o colateral: quanto mais negativo, menor o multiplicador"], [String.raw`5\%`, "piso: nunca se zera a PFE"]]} />
      <CodeSnippet name="multiplier" />

      <h2>6. CEM: o método das instituições menores</h2>
      <p>Instituições S2 a S4 podem usar o método da exposição corrente, mais simples e insensível a hedges entre prazos:</p>
      <Formula tex={String.raw`\text{EAD}^{\text{CEM}} = \max(V, 0) + \big(0{,}4 + 0{,}6\cdot\text{NGR}\big)\sum_i N_i\,f_i, \qquad \text{NGR} = \frac{\max(V, 0)}{\sum_i \max(V_i, 0)}`} where={[[String.raw`f_i`, "fator por prazo: juros 0%, 0,5% e 1,5%; câmbio 1%, 5% e 7,5% (até 1 ano, 1 a 5, acima de 5)"], [String.raw`\text{NGR}`, "razão entre a exposição líquida e a bruta: mede o quanto o netting reduz a exposição"]]} />
      <CodeSnippet name="cem_ead" />

      <h2>7. Laboratório</h2>
      <SaccrLab />
      <Callout title="O que observar">
        <ul>
          <li>Os dois swaps de juros estão em faixas diferentes (1–5 anos e acima de 5): a compensação é só parcial (correlação de 70%). Mude o segundo para 3 anos e R$ 20 milhões: na mesma faixa, os dois se anulam e o add-on de juros vai a zero.</li>
          <li>O par USD/BRL compensa por inteiro: NDF comprado e call vendida se anulam em parte, pelo delta da opção.</li>
          <li>Ative a margem: o MF cai de até 1 para 1,5·√(10/250) ≈ 0,30 e o EAD encolhe. Um threshold alto aparece no RC mesmo com MTM zero.</li>
          <li>Deixe o MTM líquido bem negativo: o multiplicador cai abaixo de 1 e reduz a PFE.</li>
          <li>Compare com o CEM: ele não enxerga hedges entre prazos nem o delta das opções, e costuma dar EAD maior para carteiras bem hedgeadas.</li>
        </ul>
      </Callout>

      <RegNote>
        <p>
          No Brasil, o SA-CCR foi estabelecido pela Circular nº 3.904/2018: obrigatório para o S1, com o CEM disponível para S2
          a S4. Compilações normativas indicam a incorporação dessas regras à Resolução BCB nº 229/2022 a partir de julho de
          2023 — confira o texto vigente. O EAD de derivativos entra no RWA de crédito (DLO) e é divulgado no Pilar 3 (tabela CCR1).
        </p>
      </RegNote>
    </>
  );
}

const DEFAULT_TRADES: Row[] = [
  { name: "Swap recebe pré 3a", kind: "ir_swap", notional: 20_000_000, start: 0, end: 3, direction: "short", mtm: 300_000, option: "call", moneyness: 1 },
  { name: "Swap paga pré 7a", kind: "ir_swap", notional: 10_000_000, start: 0, end: 7, direction: "long", mtm: -150_000, option: "call", moneyness: 1 },
  { name: "NDF compra 1a", kind: "fx_forward", notional: 15_000_000, start: 0, end: 1, direction: "long", mtm: 200_000, option: "call", moneyness: 1 },
  { name: "NDF venda 6m", kind: "fx_forward", notional: 5_000_000, start: 0, end: 0.5, direction: "short", mtm: -50_000, option: "call", moneyness: 1 },
  { name: "Call de dólar vendida 1a", kind: "fx_option", notional: 10_000_000, start: 0, end: 1, direction: "short", mtm: -250_000, option: "call", moneyness: 1 },
];

function SaccrLab() {
  const [rows, setRows] = useState<Row[]>(DEFAULT_TRADES);
  const [netting, setNetting] = useState({ margined: false, collateral: 0, threshold: 0, mta: 0, nica: 0, mpor_days: 10 });
  const [riskWeight, setRiskWeight] = useState(1.0);
  const setN = <K extends keyof typeof netting>(k: K) => (v: (typeof netting)[K]) => setNetting({ ...netting, [k]: v });

  const trades = rows.map((r) => ({
    name: r.name, kind: r.kind, notional: r.notional, start: r.start, end: r.end, long: r.direction === "long",
    mtm: r.mtm, option: r.option, moneyness: r.moneyness,
  }));
  const { data, error } = useCompute<Resp>("/credit/saccr", { trades, netting, risk_weight: riskWeight }, 250);
  const c = data?.chosen;
  const compare = data ? [
    { label: "SA-CCR sem margem", ead: data.unmargined.ead, on: !netting.margined },
    { label: "SA-CCR com margem", ead: data.margined.ead, on: netting.margined },
    { label: "CEM", ead: data.cem.ead, on: false },
  ] : [];

  return (
    <Lab title="EAD de um conjunto de netting">
      <EditableTable<Row>
        rows={rows} onChange={setRows}
        newRow={() => ({ name: "Nova operação", kind: "ir_swap", notional: 5_000_000, start: 0, end: 2, direction: "long", mtm: 0, option: "call", moneyness: 1 })}
        columns={[
          { key: "name", label: "Operação", type: "text", width: 170 },
          { key: "kind", label: "Tipo", type: "select", width: 150, options: Object.entries(KIND_LABEL) as [string, string][] },
          { key: "notional", label: "Nocional (R$)", type: "number", width: 120 },
          { key: "start", label: "Início (a)", type: "number", width: 70 },
          { key: "end", label: "Fim (a)", type: "number", width: 70 },
          { key: "direction", label: "Posição", type: "select", width: 160, options: [["long", "Comprado / paga pré"], ["short", "Vendido / recebe pré"]] },
          { key: "mtm", label: "MTM (R$)", type: "number", width: 110 },
          { key: "option", label: "Opção", type: "select", width: 80, options: [["call", "Call"], ["put", "Put"]] },
          { key: "moneyness", label: "P/K", type: "number", width: 70 },
        ]}
        computed={data && data.chosen.terms.length === rows.length ? [
          { label: "δ", values: data.chosen.terms.map((t) => fmtNum(t.delta, 2)) },
          { label: "MF", values: data.chosen.terms.map((t) => fmtNum(t.mf, 2)) },
          { label: "Nocional efetivo", values: data.chosen.terms.map((t) => fmtCompact(t.effective)) },
        ] : []}
      />
      <h3>Conjunto de netting e contraparte</h3>
      <div className="grid">
        <SelectField label="Margem de variação (CSA)" value={netting.margined ? "y" : "n"} onChange={(v) => setN("margined")(v === "y")}
          options={[["n", "Sem margem"], ["y", "Com margem"]]} />
        <NumField label="Colateral líquido recebido" value={netting.collateral} onChange={setN("collateral")} step={100_000} />
        {netting.margined && (
          <>
            <NumField label="Threshold" value={netting.threshold} onChange={setN("threshold")} step={250_000} min={0} />
            <NumField label="MTA" value={netting.mta} onChange={setN("mta")} step={50_000} min={0} />
            <NumField label="NICA (colateral independente)" value={netting.nica} onChange={setN("nica")} step={100_000} />
            <NumField label="MPOR (dias úteis)" value={netting.mpor_days} onChange={setN("mpor_days")} step={5} min={5} max={60} />
          </>
        )}
        <SelectField label="FPR da contraparte" value={String(riskWeight)} onChange={(v) => setRiskWeight(Number(v))}
          options={[["0.2", "20%"], ["0.5", "50%"], ["0.65", "65%"], ["1", "100%"]]} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && c && (
        <>
          <div className="stats">
            <Stat label="MTM líquido (V)" value={fmtMoney(c.mtm)} />
            <Stat label="Custo de reposição (RC)" value={fmtMoney(c.rc)} />
            <Stat label="AddOn agregado" value={fmtMoney(c.add_on.aggregate)} sub={`multiplicador ${fmtNum(c.multiplier, 3)}`} />
            <Stat label="PFE" value={fmtMoney(c.pfe)} />
            <Stat label="EAD = 1,4 × (RC + PFE)" value={fmtMoney(c.ead)} sub={`${fmtPct(c.ead / rows.reduce((a, r) => a + r.notional, 0), 2)} do nocional`} />
            <Stat label="RWA" value={fmtMoney(data.rwa)} sub={`FPR ${fmtPct(riskWeight, 0)}`} />
          </div>
          <h3>Add-on por conjunto de hedge</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Classe</th><th>Conjunto</th><th>Nocional efetivo por faixa</th><th className="num">Nocional efetivo</th><th className="num">AddOn</th></tr></thead>
              <tbody>
                {c.add_on.hedging_sets.map((h) => (
                  <tr key={h.asset_class + h.hedging_set}>
                    <td>{h.asset_class === "ir" ? "Juros" : "Câmbio"}</td>
                    <td>{h.hedging_set}</td>
                    <td className="muted">{h.asset_class === "ir" ? h.buckets.map((b, i) => `${BUCKETS[i]}: ${fmtCompact(b)}`).join(" · ") : "um único conjunto (soma com sinal)"}</td>
                    <td className="num">{fmtMoney(h.effective_notional)}</td>
                    <td className="num">{fmtMoney(h.add_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="chart-title" style={{ marginTop: 18 }}>EAD pelos três métodos</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={compare} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" tickFormatter={fmtCompact} {...axisProps} />
              <YAxis type="category" dataKey="label" {...axisProps} width={140} />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: "EAD", value: fmtMoney(payload[0].payload.ead) }]} /> : null} />
              <Bar dataKey="ead" radius={4} maxBarSize={26} isAnimationActive={false}>
                {compare.map((x, i) => <Cell key={i} fill={x.on ? "var(--series-1)" : "var(--axis)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="muted" style={{ fontSize: 13 }}>Em destaque, o método aplicado ao conjunto. O EAD com margem é limitado ao EAD sem margem.</p>
        </>
      )}
    </Lab>
  );
}
