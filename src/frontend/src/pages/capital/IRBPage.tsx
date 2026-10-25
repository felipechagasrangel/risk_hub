import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Callout, Formula, Lab, Legend, M, NumField, SelectField, Stat } from "../../components/ui";
import { fmtMoney, fmtPct } from "../../format";

type AssetClass = "corporate" | "mortgage" | "revolving" | "retail";
type Resp = {
  pd: number; correlation: number; conditional_pd: number; expected_loss_rate: number;
  capital_k: number; risk_weight: number; capital: number; rwa: number; expected_loss: number;
  curve: { pd: number; capital_k: number; risk_weight: number; expected_loss_rate: number }[];
};

export default function IRBPage() {
  const [p, setP] = useState({ pd: 0.01, lgd: 0.45, maturity: 2.5, ead: 1_000_000, asset_class: "corporate" as AssetClass });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/capital/irb", p);

  return (
    <>
      <h1>Abordagem IRB: de onde vem o capital de crédito</h1>
      <p className="lead">
        Na abordagem baseada em classificação interna (IRB), o banco estima o risco de cada tomador
        e uma fórmula de Basileia transforma essas estimativas em capital. Entender essa fórmula é
        entender a lógica de todo o capital regulatório.
      </p>

      <h2>1. Perda esperada vs. perda inesperada</h2>
      <p>Quatro parâmetros descrevem o risco de uma exposição:</p>
      <ul>
        <li><strong>PD</strong> — probabilidade de default em 1 ano;</li>
        <li><strong>LGD</strong> — perda dado o default (% da exposição que não se recupera);</li>
        <li><strong>EAD</strong> — exposição no momento do default;</li>
        <li><strong>M</strong> — prazo efetivo (maturidade).</li>
      </ul>
      <Formula tex={String.raw`\text{EL} = \text{PD} \times \text{LGD} \times \text{EAD}`} />
      <p>
        A <strong>perda esperada (EL)</strong> é custo do negócio: deve estar no preço do crédito e nas
        provisões. O <strong>capital</strong> existe para a <strong>perda inesperada (UL)</strong>: a
        diferença entre a perda num ano muito ruim e a perda média.
      </p>

      <h2>2. O modelo de Vasicek (ASRF)</h2>
      <p>
        Basileia supõe que os defaults dependem de um único fator sistêmico (a economia) com
        correlação <M>R</M>. Num cenário econômico tão ruim que só acontece 1 vez em 1.000 anos
        (99,9%), a PD de cada tomador vira a <strong>PD condicional</strong>:
      </p>
      <Formula tex={String.raw`\text{PD}_{99{,}9\%} = N\!\left(\frac{N^{-1}(\text{PD}) + \sqrt{R}\; N^{-1}(0{,}999)}{\sqrt{1-R}}\right)`} />
      <p>O capital por unidade de EAD é a perda nesse cenário menos a perda esperada, com ajuste de prazo:</p>
      <Formula tex={String.raw`K = \left[\text{LGD}\cdot \text{PD}_{99{,}9\%} - \text{PD}\cdot\text{LGD}\right] \cdot \frac{1 + (M-2{,}5)\,b}{1 - 1{,}5\,b}, \quad b = (0{,}11852 - 0{,}05478 \ln \text{PD})^2`} />
      <Formula tex={String.raw`\text{RWA} = 12{,}5 \times K \times \text{EAD}`} />
      <p>
        Para empresas, a correlação cai de 24% para 12% conforme a PD aumenta: empresas boas
        quebram quase só quando a economia inteira vai mal (alta correlação); as frágeis quebram
        por motivos próprios. No varejo há correlações fixas — 15% imobiliário, 4% rotativo.
      </p>

      <h2>3. Laboratório</h2>
      <Lab title="Calcule o capital de uma exposição">
        <div className="grid">
          <SelectField label="Classe" value={p.asset_class} onChange={set("asset_class")} options={[
            ["corporate", "Corporativo"], ["mortgage", "Varejo imobiliário"],
            ["revolving", "Varejo rotativo (cartão)"], ["retail", "Outros varejo"],
          ]} />
          <NumField label="PD" percent value={p.pd} onChange={set("pd")} step={0.1} min={0.03} max={99} />
          <NumField label="LGD" percent value={p.lgd} onChange={set("lgd")} step={5} min={0} max={100} />
          {p.asset_class === "corporate" && (
            <NumField label="Prazo M (anos)" value={p.maturity} onChange={set("maturity")} step={0.5} min={1} max={5} />
          )}
          <NumField label="EAD" value={p.ead} onChange={set("ead")} step={100000} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <div className="stats">
              <Stat label="Correlação R" value={fmtPct(data.correlation, 1)} />
              <Stat label="PD condicional 99,9%" value={fmtPct(data.conditional_pd, 2)} sub={`vs. PD de ${fmtPct(data.pd, 2)}`} />
              <Stat label="Perda esperada (EL)" value={fmtMoney(data.expected_loss)} sub={fmtPct(data.expected_loss_rate, 2) + " da EAD"} />
              <Stat label="Capital (K × EAD)" value={fmtMoney(data.capital)} sub={fmtPct(data.capital_k, 2) + " da EAD"} />
              <Stat label="FPR implícito" value={fmtPct(data.risk_weight, 1)} sub={`RWA: ${fmtMoney(data.rwa)}`} />
            </div>
            <div className="chart-title">Capital (K) e perda esperada por PD — mesma LGD e prazo</div>
            <div className="chart-sub">Eixo horizontal em escala logarítmica. O ponto marca a exposição atual.</div>
            <Legend items={[
              { label: "Capital K (perda inesperada)", color: "var(--series-1)" },
              { label: "Perda esperada PD × LGD", color: "var(--series-2)" },
            ]} />
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.curve} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="pd" type="number" scale="log" domain={["dataMin", "dataMax"]}
                  ticks={[0.001, 0.003, 0.01, 0.03, 0.1, 0.3]} tickFormatter={(v) => fmtPct(v, v < 0.01 ? 1 : 0)} {...axisProps} />
                <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={48} />
                <Tooltip content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox title={`PD ${fmtPct(payload[0].payload.pd, 2)}`} rows={[
                      { label: "K", value: fmtPct(payload[0].payload.capital_k, 2), color: "var(--series-1)" },
                      { label: "EL", value: fmtPct(payload[0].payload.expected_loss_rate, 2), color: "var(--series-2)" },
                      { label: "FPR", value: fmtPct(payload[0].payload.risk_weight, 0) },
                    ]} />
                  ) : null} />
                <Line dataKey="capital_k" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="expected_loss_rate" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceDot x={data.pd} y={data.capital_k} r={6} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Confira o valor de referência: corporativo, PD 1%, LGD 45%, M 2,5 → FPR ≈ 92%.</li>
          <li>O capital <strong>não</strong> cresce sem limite com a PD: para PDs muito altas, a perda vira <em>esperada</em> (provisão), não inesperada.</li>
          <li>O capital é linear na LGD: dobrar a LGD dobra o capital. Garantias reduzem a LGD.</li>
          <li>Prazos maiores exigem mais capital: há mais tempo para o tomador piorar (risco de migração).</li>
        </ul>
      </Callout>
    </>
  );
}
