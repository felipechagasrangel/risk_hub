import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum } from "../../format";

type CsaResp = {
  series: { t: number; mtm: number; collateral: number; exposure: number }[];
  transfers: { t: number; amount: number }[];
  summary: { n_transfers: number; max_exposure_uncoll: number; max_exposure: number; avg_exposure_uncoll: number; avg_exposure: number };
};

const TERMS: [string, string, string][] = [
  ["Threshold (H)", "Exposição que cada parte aceita ter sem receber garantia.", "Quanto maior, mais exposição descoberta — e mais CVA. Muitas vezes depende do rating da contraparte."],
  ["Valor mínimo de transferência (MTA)", "Menor chamada de margem que vale a pena movimentar.", "Evita transferências pequenas e frequentes; cria uma faixa extra de exposição descoberta."],
  ["Arredondamento", "As transferências são arredondadas para múltiplos de um valor (ex.: R$ 50 mil).", "Detalhe operacional com efeito pequeno na exposição."],
  ["Valor independente (IA)", "Garantia fixa entregue no início, independente do MTM.", "Funciona como um colchão permanente; é a forma contratual mais antiga de margem inicial."],
  ["Garantias elegíveis e haircuts", "O que pode ser entregue (caixa, títulos públicos, outras moedas) e o desconto aplicado a cada um.", "Um título com haircut de 2% vale 98% do seu preço como garantia."],
  ["Frequência e prazo de liquidação", "Com que frequência o MTM é apurado e em quantos dias a garantia precisa ser entregue.", "Diário hoje em dia; cada dia de atraso aumenta a exposição residual."],
  ["Remuneração da garantia", "A taxa paga sobre o caixa recebido (no Brasil, tipicamente o CDI; lá fora, a taxa overnight).", "Define a curva de desconto do derivativo colateralizado."],
  ["Reutilização (rehypothecation)", "Se quem recebe a garantia pode usá-la em outras operações.", "Garantia que pode ser reutilizada serve de funding; segregada, não — daí o MVA."],
  ["Bilateral ou unilateral", "Se as duas partes entregam garantia ou só uma (comum com soberanos e corporativos).", "Num CSA unilateral a favor da contraparte, o banco tem exposição descoberta e custo de funding."],
  ["Gatilhos e disputas", "Eventos que mudam os termos (ex.: rebaixamento de rating zera o threshold) e o rito para divergências de MTM.", "Disputas atrasam chamadas — mais um motivo para o MPOR."],
];

export default function CsaPage() {
  return (
    <>
      <h1>CSA: o contrato de colateral</h1>
      <p className="lead">
        Quase todo derivativo de balcão entre instituições financeiras vem acompanhado de um acordo de garantias.
        Ele define quem entrega colateral, quando e quanto — e, com isso, quanto risco de contraparte sobra, quanto
        custa financiar a operação e até qual curva usar para descontá-la.
      </p>

      <h2>1. O que é</h2>
      <p>
        O <strong>CSA</strong> (<em>Credit Support Annex</em>) é o anexo de garantias do contrato-mãe ISDA, o padrão
        internacional para derivativos de balcão. No Brasil, o contrato-mãe mais usado é o <strong>CGD</strong> (Contrato
        Global de Derivativos), e as regras de garantia ficam em cláusulas ou anexos equivalentes. A lógica é sempre a
        mesma: <strong>quem está devendo no MTM entrega garantia a quem está credor</strong>, e a garantia acompanha o MTM
        ao longo da vida do contrato.
      </p>
      <div className="grid-2">
        <div className="card">
          <h3>Margem de variação (VM)</h3>
          <p style={{ marginBottom: 0 }}>
            Cobre o <strong>MTM atual</strong>. É recalculada todo dia e troca de lado conforme o contrato vai a favor
            de um ou de outro. Zera a exposição corrente, mas não o que o MTM pode andar até o colateral chegar.
          </p>
        </div>
        <div className="card">
          <h3>Margem inicial (IM)</h3>
          <p style={{ marginBottom: 0 }}>
            Cobre o que o MTM <strong>pode variar</strong> durante o período de risco de margem (MPOR) se a contraparte
            quebrar. É depositada pelas duas partes, fica segregada e é calculada por modelos como o ISDA SIMM.
          </p>
        </div>
      </div>

      <h2>2. Os termos que importam</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Termo</th><th>O que define</th><th>Efeito no risco</th></tr></thead>
          <tbody>
            {TERMS.map(([term, what, effect]) => (
              <tr key={term}><td><strong>{term}</strong></td><td>{what}</td><td className="muted">{effect}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>3. A conta da chamada de margem</h2>
      <p>Em cada data de apuração, calcula-se quanto colateral deveria estar em mãos e compara-se com o saldo atual:</p>
      <Formula tex={String.raw`\text{CSA}(t) = \operatorname{sinal}(V)\cdot\max\big(|V(t)| - H,\; 0\big), \qquad \text{entrega} = \text{CSA}(t) - C(t^{-}) \;\;\text{se}\;\; |\text{CSA}(t) - C(t^{-})| \ge \text{MTA}`} where={[[String.raw`V(t)`, "MTM do conjunto de netting na data de apuração"], [String.raw`H`, "threshold da parte devedora"], [String.raw`\text{CSA}(t)`, "colateral que deveria estar com o credor (credit support amount)"], [String.raw`C(t^{-})`, "colateral já em mãos antes da chamada"], [String.raw`\text{MTA}`, "valor mínimo de transferência; abaixo dele, nada se move"]]} />
      <Formula tex={String.raw`E(t) = \max\big(V(t) - C(t) - \text{IA},\; 0\big), \qquad C_{\text{efetivo}} = \sum_j (1 - h_j)\,G_j`} where={[[String.raw`E(t)`, "exposição que sobra depois do colateral"], [String.raw`\text{IA}`, "valor independente entregue pela contraparte"], [String.raw`G_j`, "valor de mercado da garantia j"], [String.raw`h_j`, "haircut da garantia j"]]} />
      <CodeSnippet name="margin_calls" caption="as chamadas de margem dia a dia" />

      <h2>4. Laboratório</h2>
      <CsaLab />
      <Callout title="O que observar">
        <ul>
          <li>Enquanto o MTM fica entre −H e +H, ninguém entrega nada: a exposição é o próprio MTM.</li>
          <li>Acima do threshold, o colateral acompanha o MTM “em degraus”: o MTA e o arredondamento deixam pequenas faixas descobertas.</li>
          <li>Zere o threshold e o MTA: a exposição residual vira só o que o MTM anda entre a apuração e a entrega. Aumente o atraso para 10 dias e veja esse resíduo crescer — é o efeito do MPOR.</li>
          <li>Um valor independente igual ao threshold praticamente elimina a exposição descoberta.</li>
        </ul>
      </Callout>

      <h2>5. CSA, desconto e funding</h2>
      <ul>
        <li><strong>Desconto</strong>: o caixa recebido como garantia rende a taxa do CSA. Por isso um derivativo colateralizado em caixa é descontado pela curva dessa taxa (CDI no Brasil, taxas overnight lá fora), e não pela curva de captação do banco. Se o CSA aceita várias moedas, quem entrega escolhe a mais barata — uma opção embutida que muda o desconto.</li>
        <li><strong>Funding</strong>: sem CSA (ou com CSA unilateral), o hedge colateralizado do banco exige caixa que o cliente não devolve: é o <Link to="/xva/fva-mva">FVA</Link>. A margem inicial segregada gera o MVA.</li>
        <li><strong>Crédito</strong>: o colateral reduz a exposição e, com ela, o <Link to="/xva/cva">CVA</Link> — mas não a zera, por causa do threshold, do MTA e do MPOR, como mostra a próxima página.</li>
      </ul>

      <h2>6. Bilateral, câmara e regras de margem</h2>
      <ul>
        <li><strong>Câmara de compensação (CCP)</strong>: em derivativos listados e em parte do balcão, a câmara (na B3, inclusive para contratos de balcão registrados com garantia) é contraparte das duas pontas e exige margem inicial e ajuste diário. O CSA bilateral é o equivalente privado desse arranjo.</li>
        <li><strong>Regras de margem para derivativos não compensados</strong> (BCBS-IOSCO, implementadas entre 2016 e 2022): margem de variação obrigatória e margem inicial para os grandes participantes, com threshold de até € 50 milhões para a IM e MTA de até € 500 mil.</li>
      </ul>
    </>
  );
}

function CsaLab() {
  const [p, setP] = useState({
    notional: 50_000_000, maturity: 3, horizon: 1.5, rate: 0.14, fixed_rate: 0.14, hw_a: 0.15, hw_sigma: 0.02, receive: true,
    threshold: 1_000_000, mta: 250_000, rounding: 50_000, independent_amount: 0, lag_days: 1, seed: 21,
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<CsaResp>("/xva/csa", p, 300);
  const s = data?.summary;

  return (
    <Lab title="Chamadas de margem de um swap ao longo do tempo">
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Uma trajetória diária de um swap DI × pré (Hull-White) e as garantias que o CSA movimenta sobre ela.
        Colateral positivo = recebido pelo banco; negativo = entregue pelo banco.
      </p>
      <div className="grid">
        <SelectField label="Posição do banco" value={p.receive ? "a" : "b"} onChange={(v) => set("receive")(v === "a")}
          options={[["a", "Recebe pré, paga CDI"], ["b", "Paga pré, recebe CDI"]]} />
        <NumField label="Nocional" value={p.notional} onChange={set("notional")} step={5_000_000} />
        <NumField label="Threshold (H)" value={p.threshold} onChange={set("threshold")} step={250_000} min={0} />
        <NumField label="MTA" value={p.mta} onChange={set("mta")} step={50_000} min={0} />
        <NumField label="Arredondamento" value={p.rounding} onChange={set("rounding")} step={10_000} min={0} />
        <NumField label="Valor independente (IA)" value={p.independent_amount} onChange={set("independent_amount")} step={250_000} min={0} />
        <NumField label="Atraso de entrega (dias úteis)" value={p.lag_days} onChange={set("lag_days")} step={1} min={0} max={20} />
        <NumField label="Cenário (semente)" value={p.seed} onChange={set("seed")} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && s && (
        <>
          <div className="stats">
            <Stat label="Transferências" value={fmtNum(s.n_transfers, 0)} sub={`em ${fmtNum(p.horizon, 1)} ano(s)`} />
            <Stat label="Exposição máxima" value={fmtMoney(s.max_exposure)} sub={`sem CSA: ${fmtMoney(s.max_exposure_uncoll)}`} />
            <Stat label="Exposição média" value={fmtMoney(s.avg_exposure)} sub={`sem CSA: ${fmtMoney(s.avg_exposure_uncoll)}`} />
          </div>
          <div className="chart-title">MTM, colateral e exposição descoberta</div>
          <div className="chart-sub">Linhas tracejadas: ± threshold. A área é a exposição que o colateral não cobre.</div>
          <Legend items={[
            { label: "MTM do swap", color: "var(--series-1)" },
            { label: "Colateral em mãos", color: "var(--series-2)" },
            { label: "Exposição descoberta", color: "color-mix(in srgb, var(--critical) 35%, transparent)", box: true },
          ]} />
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data.series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <ReferenceLine y={p.threshold} stroke="var(--muted)" strokeDasharray="4 4" />
              <ReferenceLine y={-p.threshold} stroke="var(--muted)" strokeDasharray="4 4" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as CsaResp["series"][number];
                return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
                  { label: "MTM", value: fmtMoney(d.mtm), color: "var(--series-1)" },
                  { label: "Colateral", value: fmtMoney(d.collateral), color: "var(--series-2)" },
                  { label: "Exposição", value: fmtMoney(d.exposure) },
                ]} />;
              }} />
              <Area dataKey="exposure" stroke="none" fill="var(--critical)" fillOpacity={0.25} isAnimationActive={false} />
              <Line dataKey="mtm" stroke="var(--series-1)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line dataKey="collateral" type="stepAfter" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          {data.transfers.length > 0 && (
            <>
              <h3>Primeiras transferências</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th className="num">Data (anos)</th><th className="num">Valor</th><th>Sentido</th></tr></thead>
                  <tbody>
                    {data.transfers.slice(0, 8).map((tr, i) => (
                      <tr key={i}>
                        <td className="num">{fmtNum(tr.t, 2)}</td>
                        <td className="num">{fmtMoney(Math.abs(tr.amount))}</td>
                        <td>{tr.amount > 0 ? "Para o banco (contraparte entrega ou devolve)" : "Para a contraparte (banco entrega ou devolve)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Lab>
  );
}
