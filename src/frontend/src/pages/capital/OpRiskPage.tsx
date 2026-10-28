import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, NumField, RegNote, SelectField, Stat } from "../../components/ui";
import { fmtNum } from "../../format";

type Year = { label: string; ii: number; ie: number; iea: number; di: number; fi: number; fe: number; ooi: number; ooe: number; ntb: number; nbb: number };
type Segment = "S1S2" | "S3" | "S4";
type Resp = {
  ildc: number; sc: number; fc: number; bi: number; bic: number; lc: number;
  ilm: number; ilm_computed: number; capital: number; rwa: number;
  parts: { upper: number | null; coef: number; amount: number; bic: number }[];
  ilm_curve: { ratio: number; ilm: number }[];
};

const mi = (v: number) => `${fmtNum(v, 0)} mi`;
const year = (label: string, k: number): Year => ({
  label, ii: 30_000 * k, ie: 22_000 * k, iea: 400_000 * k, di: 200, fi: 6_000 * k, fe: 1_500 * k, ooi: 800, ooe: 1_200, ntb: 900, nbb: 300,
});

export default function OpRiskPage() {
  return (
    <>
      <h1>Risco operacional</h1>
      <p className="lead">
        Fraudes, falhas de sistema, processos trabalhistas, erros de execução: perdas que não vêm do mercado nem do
        crédito. É o terceiro bloco do <Link to="/capital/rwa">RWA</Link>, e desde janeiro de 2025 segue a nova
        abordagem padronizada de Basileia (Res. BCB 356/2023).
      </p>

      <h2>1. A lógica: tamanho do negócio × histórico de perdas</h2>
      <p>
        Não há um modelo de “preço” para risco operacional. A abordagem padronizada usa duas ideias: bancos maiores
        têm mais exposição (medida pelo <strong>Indicador de Negócios</strong>, uma espécie de receita bruta), e bancos
        que perderam mais no passado tendem a perder mais no futuro (o <strong>Multiplicador de Perdas Internas</strong>).
      </p>
      <Formula tex={String.raw`\text{RWA}_{\text{OPAD}} = \frac{\text{BIC} \times \text{ILM}}{F}`} where={[
        [String.raw`\text{BIC}`, "Indicador de Negócios Ponderado: o capital exigido antes do ajuste por perdas"],
        [String.raw`\text{ILM}`, "Multiplicador de Perdas Internas: 1 para S3 e S4; calculado para S1 e S2"],
        [String.raw`F`, "fator de 8% da Res. CMN 4.958 — dividir por 8% transforma capital em RWA"],
      ]} />

      <h2>2. O Indicador de Negócios (BI)</h2>
      <p>Três componentes, cada um em média dos três últimos períodos anuais:</p>
      <Formula tex={String.raw`\text{ILDC} = \min\!\big(\overline{|II - IE|},\ 2{,}25\%\cdot\overline{IEA}\big) + \overline{DI}`} where={[
        [String.raw`II,\ IE`, "receitas e despesas de juros e arrendamento"],
        [String.raw`IEA`, "ativos geradores de juros — o teto de 2,25% evita punir bancos de margem alta"],
        [String.raw`DI`, "receitas de participações"],
        [String.raw`\overline{x}`, "média dos três últimos períodos anuais"],
      ]} />
      <Formula tex={String.raw`\text{SC} = \max(\overline{FI}, \overline{|FE|}) + \max(\overline{OOI}, \overline{|OOE|}) \qquad \text{FC} = \overline{|NTB|} + \overline{|NBB|}`} where={[
        [String.raw`FI,\ FE`, "receitas e despesas de serviços (tarifas, comissões)"],
        [String.raw`OOI,\ OOE`, "outras receitas e despesas operacionais"],
        [String.raw`NTB,\ NBB`, "resultado líquido das carteiras de negociação e bancária, em valor absoluto: lucro e prejuízo contam igual"],
      ]} />
      <p>O BIC aplica coeficientes marginais, como uma tabela de imposto de renda:</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Faixa do BI</th><th className="num">Coeficiente</th></tr></thead>
          <tbody>
            <tr><td>até R$ 5 bilhões</td><td className="num">12%</td></tr>
            <tr><td>de R$ 5 bilhões a R$ 150 bilhões</td><td className="num">15%</td></tr>
            <tr><td>acima de R$ 150 bilhões</td><td className="num">18%</td></tr>
          </tbody>
        </table>
      </div>
      <CodeSnippet name="business_indicator" />
      <CodeSnippet name="bic" />

      <h2>3. O Multiplicador de Perdas Internas (ILM)</h2>
      <Formula tex={String.raw`\text{ILM} = \ln\!\Big(e - 1 + \big(\tfrac{LC}{\text{BIC}}\big)^{0{,}8}\Big), \qquad LC = 6 \times \overline{\text{perdas anuais}}_{10\ \text{anos}}`} where={[
        [String.raw`LC`, "componente de perdas: seis vezes a média anual das perdas operacionais dos últimos dez anos (eventos ≥ R$ 500 mil, líquidos de recuperações)"],
        [String.raw`e`, "número de Euler: quando LC = BIC, o ILM vale exatamente 1"],
        [String.raw`0{,}8`, "expoente menor que 1: o ILM cresce menos que proporcionalmente às perdas"],
      ]} />
      <p>
        Em Basileia o multiplicador do componente de perdas é 15; a regra brasileira usa 6. A base de perdas vem do
        registro de eventos de risco operacional exigido pela Circular 3.979/2020.
      </p>
      <CodeSnippet name="ilm" />

      <h2>4. Laboratório</h2>
      <OpRiskLab />
      <Callout title="O que observar">
        <ul>
          <li>Um prejuízo grande na tesouraria aumenta o BI, porque o componente financeiro usa valor absoluto: perder dinheiro também “mostra” atividade.</li>
          <li>Dobre as receitas de juros: o ILDC para de crescer quando bate no teto de 2,25% dos ativos geradores de juros.</li>
          <li>Aumente as perdas históricas: o ILM sobe, mas devagar (expoente 0,8 e logaritmo). Um ano ruim pesa por dez anos.</li>
          <li>Troque para S4: o ILM vira 1 e o histórico de perdas deixa de importar.</li>
        </ul>
      </Callout>
      <RegNote>O RWA de risco operacional entra no RWA total do <Link to="/cadocs#dlo">DLO</Link>; a composição do BI é divulgada nas tabelas OR do Pilar 3.</RegNote>
    </>
  );
}

function OpRiskLab() {
  const [years, setYears] = useState<Year[]>([year("t (mais recente)", 1), year("t − 1", 0.93), year("t − 2", 0.87)]);
  const [losses, setLosses] = useState([380, 420, 350, 500, 610, 300, 340, 410, 450, 390].map((v, i) => ({ year: `${2025 - i}`, loss: v })));
  const [segment, setSegment] = useState<Segment>("S1S2");
  const body = { years: years.map(({ label: _, ...y }) => y), losses: losses.map((l) => l.loss), segment };
  const { data, error } = useCompute<Resp>("/capital/op-risk", body);
  const n = (key: keyof Year & string, label: string) => ({ key, label, type: "number" as const, width: 86 });

  return (
    <Lab title="RWA de risco operacional (R$ milhões)">
      <h3 style={{ marginTop: 0 }}>Demonstração de resultado dos três últimos períodos anuais</h3>
      <EditableTable<Year> rows={years} onChange={(r) => setYears(r.slice(0, 3))} newRow={() => year("novo", 1)}
        columns={[
          { key: "label", label: "Período", type: "text", width: 120 },
          n("ii", "Rec. juros"), n("ie", "Desp. juros"), n("iea", "Ativos ger. juros"), n("di", "Particip."),
          n("fi", "Rec. serviços"), n("fe", "Desp. serviços"), n("ooi", "Outras rec."), n("ooe", "Outras desp."),
          n("ntb", "Res. negociação"), n("nbb", "Res. bancária"),
        ]} />
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Perdas operacionais anuais</h3>
          <EditableTable<{ year: string; loss: number }> rows={losses} onChange={(r) => setLosses(r.slice(0, 10))}
            newRow={() => ({ year: "", loss: 0 })}
            columns={[{ key: "year", label: "Ano", type: "text", width: 80 }, { key: "loss", label: "Perda líquida", type: "number" }]} />
        </div>
        <div>
          <SelectField label="Segmento" value={segment} onChange={setSegment}
            options={[["S1S2", "S1 ou S2 (calcula o ILM)"], ["S3", "S3 (ILM = 1)"], ["S4", "S4 (ILM = 1)"]]} />
          {data && (
            <>
              <div className="chart-title" style={{ marginTop: 16 }}>ILM em função de LC / BIC</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.ilm_curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="ratio" type="number" domain={[0, 4]} {...axisProps} />
                  <YAxis {...axisProps} width={40} domain={[0.6, 1.6]} tickFormatter={(v) => fmtNum(v, 1)} />
                  <ReferenceLine y={1} stroke="var(--axis)" strokeDasharray="4 4" />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <TooltipBox title={`LC/BIC = ${fmtNum(payload[0].payload.ratio, 2)}`} rows={[{ label: "ILM", value: fmtNum(payload[0].payload.ilm, 3) }]} />
                  ) : null} />
                  <Line dataKey="ilm" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={Math.min(data.lc / data.bic, 4)} y={data.ilm_computed} r={5} fill="var(--series-2)" stroke="none" />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Juros (ILDC)" value={mi(data.ildc)} />
            <Stat label="Serviços (SC)" value={mi(data.sc)} />
            <Stat label="Financeiro (FC)" value={mi(data.fc)} />
            <Stat label="Indicador de Negócios" value={mi(data.bi)} />
          </div>
          <div className="stats">
            <Stat label="BIC" value={mi(data.bic)} sub={`${fmtNum((data.bic / data.bi) * 100, 1)}% do BI`} />
            <Stat label="Componente de perdas (LC)" value={mi(data.lc)} sub={`LC/BIC = ${fmtNum(data.lc / data.bic, 2)}`} />
            <Stat label="ILM" value={fmtNum(data.ilm, 3)} sub={segment === "S1S2" ? "calculado" : `calculado seria ${fmtNum(data.ilm_computed, 3)}`} />
            <Stat label="RWA operacional" value={mi(data.rwa)} sub={`capital: ${mi(data.capital)}`} />
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Faixa do BI</th><th className="num">Parcela do BI</th><th className="num">Coeficiente</th><th className="num">BIC</th></tr></thead>
              <tbody>
                {data.parts.map((p, i) => (
                  <tr key={i}>
                    <td>{i === 0 ? "até 5 bi" : i === 1 ? "5 bi a 150 bi" : "acima de 150 bi"}</td>
                    <td className="num">{mi(p.amount)}</td><td className="num">{fmtNum(p.coef * 100, 0)}%</td><td className="num">{mi(p.bic)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Lab>
  );
}
