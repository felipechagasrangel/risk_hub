import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, RegNote, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";

type Portfolio = "C1" | "C2" | "C3" | "C4" | "C5";
type Resp = {
  current: { stage: 1 | 2 | 3; ecl: number; floor: number; provision: number; coverage: number;
    scenarios: { name: string; weight: number; pd: number; ecl: number }[] };
  ecl_12m: number;
  ecl_lifetime: number;
  curve: { days: number; stage: number; ecl: number; floor: number; provision: number }[];
  floor_table: Record<Portfolio, number[]>;
};

const PORTFOLIOS: { key: Portfolio; what: string; color: string }[] = [
  { key: "C1", what: "Alienação fiduciária de imóveis; garantia da União, de governos centrais estrangeiros ou de organismos multilaterais", color: "var(--series-1)" },
  { key: "C2", what: "Arrendamento mercantil; hipoteca residencial de 1º grau; penhor; alienação fiduciária de móveis; depósitos e títulos públicos em garantia; fiança bancária; seguro de crédito", color: "var(--series-2)" },
  { key: "C3", what: "Desconto de direitos creditórios (recebíveis); cessão fiduciária, caução ou penhor de direitos creditórios; outras garantias não incluídas em C1 e C2", color: "var(--series-3)" },
  { key: "C4", what: "Capital de giro, ACC/ACE, debêntures e títulos privados, crédito rural de investimento — sem garantia", color: "var(--series-4)" },
  { key: "C5", what: "Crédito pessoal (com ou sem consignação), CDC, rotativo e demais operações sem garantia", color: "var(--series-5)" },
];
const STAGE_COLOR = { 1: "var(--good)", 2: "var(--warning)", 3: "var(--critical)" } as const;

export default function ExpectedLossPage() {
  return (
    <>
      <h1>Perda esperada: Resolução CMN nº 4.966</h1>
      <p className="lead">
        Desde 2025, os bancos brasileiros provisionam o crédito pela <strong>perda esperada</strong>, no modelo do IFRS 9:
        a provisão nasce junto com a operação e acompanha a piora do risco, em vez de esperar o atraso acontecer.
      </p>

      <h2>1. Da perda incorrida à perda esperada</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Antes: Res. CMN nº 2.682/1999</h3>
          <p style={{ marginBottom: 0 }}>
            Cada operação recebia um nível de risco de AA a H, definido principalmente pelos dias de atraso, e cada nível
            tinha um percentual fixo de provisão. A provisão crescia <em>depois</em> que o problema aparecia.
          </p>
        </div>
        <div className="card">
          <h3>Hoje: Res. CMN nº 4.966/2021</h3>
          <p style={{ marginBottom: 0 }}>
            A provisão estima a perda que o banco <em>espera</em> ter, usando PD, LGD e EAD, informação atual e cenários
            futuros. Os procedimentos estão na Res. BCB nº 352/2023. Vigência: 1º de janeiro de 2025.
          </p>
        </div>
      </div>

      <h2>2. Os três estágios</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Estágio</th><th>Quando</th><th>Horizonte da perda esperada</th><th>Receita de juros</th></tr></thead>
          <tbody>
            <tr><td><strong>1</strong></td><td>Sem aumento significativo do risco de crédito desde a originação</td><td>Próximos 12 meses</td><td>Pela taxa efetiva, sobre o saldo bruto</td></tr>
            <tr><td><strong>2</strong></td><td>Aumento significativo do risco — presumido com atraso acima de 30 dias</td><td>Vida inteira do instrumento</td><td>Pela taxa efetiva, sobre o saldo bruto</td></tr>
            <tr><td><strong>3</strong></td><td>Ativo com problema de recuperação de crédito — atraso acima de 90 dias ou indício de que não será integralmente pago</td><td>Vida inteira, com o default já ocorrido</td><td>Deixa de ser reconhecida enquanto o ativo for problemático (stop accrual)</td></tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li><strong>Aumento significativo</strong> (art. 38 da Res. BCB 352): o atraso acima de 30 dias é uma presunção; com evidência, o prazo pode ir até 60 dias, e deve ser menor se a piora aparecer antes. Os critérios quantitativos (piora da PD) e qualitativos (lista de observação, renegociação) são definidos por cada instituição.</li>
        <li><strong>Problema de recuperação</strong> (art. 3º): atraso acima de 90 dias, ou menos se houver evidência de perda de capacidade de pagamento — recuperação judicial, reestruturação, execução de garantias. Na falência de pessoa jurídica, a provisão é de 100% (art. 77).</li>
        <li><strong>Volta de estágio</strong>: cessadas as condições, o instrumento volta ao estágio anterior, observados os períodos de “cura” para operações reestruturadas.</li>
      </ul>

      <h2>3. A conta da perda esperada</h2>
      <Formula tex={String.raw`\text{PE} = \sum_{t=1}^{H} \text{PD}^{\text{marg}}(t)\cdot \text{LGD}(t)\cdot \text{EAD}(t)\cdot \text{DF}(t), \qquad H = \begin{cases} 12 \text{ meses} & \text{estágio 1} \\ \text{prazo restante} & \text{estágios 2 e 3}\end{cases}`} where={[[String.raw`\text{PE}`, "perda esperada (a provisão), em R$"], [String.raw`\text{PD}^{\text{marg}}(t)`, "probabilidade de o default acontecer no mês t (e não antes)"], [String.raw`\text{LGD}(t)`, "perda dado o default naquele momento, líquida das garantias"], [String.raw`\text{EAD}(t)`, "exposição no mês t — cai com a amortização"], [String.raw`\text{DF}(t)`, "fator de desconto pela taxa efetiva do contrato"], [String.raw`H`, "horizonte, conforme o estágio"]]} />
      <p>A visão é prospectiva: a perda é calculada em cenários macroeconômicos e ponderada pela probabilidade de cada um.</p>
      <Formula tex={String.raw`\text{PE} = \sum_{s} w_s\,\text{PE}_s, \qquad \text{PD}_s = \text{PD}_{\text{base}} \times m_s`} where={[[String.raw`w_s`, "peso do cenário s (otimista, base, pessimista)"], [String.raw`\text{PE}_s`, "perda esperada calculada no cenário s"], [String.raw`m_s`, "multiplicador da PD no cenário — no laboratório, uma simplificação dos modelos que ligam a PD a PIB, juros e desemprego"]]} />
      <Callout title="PD da provisão × PD do capital">
        A PD da provisão é <strong>point-in-time</strong> e prospectiva: reage ao ciclo econômico. A PD do capital no
        <Link to="/capital/irb"> modelo IRB</Link> é <strong>through-the-cycle</strong>, mais estável. Do mesmo modo, a LGD da
        provisão é a melhor estimativa, e a do capital é a de recessão (downturn). Mesma família de parâmetros, objetivos
        diferentes: a provisão cobre a perda esperada, o capital a inesperada.
      </Callout>
      <CodeSnippet name="stage" caption="o estágio de um instrumento" />
      <CodeSnippet name="expected_loss" caption="a perda esperada até o horizonte" />
      <CodeSnippet name="weighted_expected_loss" caption="ponderação por cenários" />

      <h2>4. O piso de perda incorrida (Res. BCB nº 352)</h2>
      <p>
        Para os ativos inadimplidos, a Res. BCB 352 exige níveis mínimos de provisão para <strong>perda incorrida</strong>
        (art. 76 e Anexo I), sem dispensar o cálculo da perda esperada: a provisão é o maior dos dois. Os níveis dependem
        da <strong>carteira</strong> da operação — definida pelo tipo de garantia (art. 81) — e dos meses de atraso desde o
        inadimplemento. O artigo se aplica ao grupo de instituições definido no art. 1º da norma.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Carteira</th><th>O que inclui</th></tr></thead>
          <tbody>{PORTFOLIOS.map((p) => <tr key={p.key}><td><strong>{p.key}</strong></td><td>{p.what}</td></tr>)}</tbody>
        </table>
      </div>
      <FloorChart />
      <CodeSnippet name="incurred_loss_floor" caption="o piso do Anexo I" />

      <h2>5. Laboratório</h2>
      <EclLab />
      <Callout title="O que observar">
        <ul>
          <li>No dia 31 de atraso a provisão salta: o horizonte passa de 12 meses para a vida inteira (estágio 2). Quanto mais longo o contrato, maior o salto.</li>
          <li>Suba a PD atual até 2,5 vezes a da originação: o contrato vai para o estágio 2 sem nenhum atraso — é o “aumento significativo” pela piora do risco.</li>
          <li>No dia 91 o ativo vira problemático: a perda passa a ser LGD × saldo. Com o passar dos meses, o piso do Anexo I sobe e, na C5, passa a dominar.</li>
          <li>Troque a carteira para C1 (garantia imobiliária): o piso começa em 5,5% e sobe devagar — a garantia sustenta a recuperação.</li>
          <li>Aumente o peso do cenário pessimista: a provisão sobe antes de qualquer atraso. É a visão prospectiva da norma.</li>
        </ul>
      </Callout>

      <RegNote>
        <p>
          A provisão afeta o resultado e o capital (a diferença entre provisão e perda esperada regulatória entra no
          cálculo do capital nas instituições IRB). As operações de crédito são informadas ao BCB no Sistema de Informações
          de Crédito (SCR, documento 3040). Base normativa: Resolução CMN nº 4.966/2021 e Resolução BCB nº 352/2023; confira
          sempre o texto vigente.
        </p>
      </RegNote>
    </>
  );
}

function FloorChart() {
  const { data } = useCompute<Resp>("/credit/ecl", {}, 0);
  if (!data) return null;
  const rows = Array.from({ length: 22 }, (_, m) => ({
    m, ...Object.fromEntries(PORTFOLIOS.map((p) => [p.key, data.floor_table[p.key][Math.min(m, data.floor_table[p.key].length - 1)] / 100])),
  }));
  return (
    <>
      <div className="chart-title">Piso de provisão por meses de inadimplência (Anexo I)</div>
      <div className="chart-sub">Mês 0 = menos de um mês desde o inadimplemento (atraso entre 91 e 120 dias).</div>
      <Legend items={PORTFOLIOS.map((p) => ({ label: p.key, color: p.color }))} />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="m" {...axisProps} tickFormatter={(v) => `${v}m`} />
          <YAxis tickFormatter={(v) => fmtPct(v, 0)} {...axisProps} width={48} domain={[0, 1]} />
          <Tooltip content={({ active, payload }) =>
            active && payload?.length ? <TooltipBox title={`${payload[0].payload.m} mês(es) de inadimplência`}
              rows={PORTFOLIOS.map((p) => ({ label: p.key, value: fmtPct(payload[0].payload[p.key], 1), color: p.color }))} /> : null} />
          {PORTFOLIOS.map((p) => (
            <Line key={p.key} dataKey={p.key} type="stepAfter" stroke={p.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function EclLab() {
  const [p, setP] = useState({
    balance: 100_000, remaining_months: 36, rate: 0.24, amortizing: true, portfolio: "C5" as Portfolio,
    pd_origination: 0.04, pd_now: 0.05, lgd: 0.65, sicr_multiple: 2.5, days_past_due: 0, problem_signal: false,
    scenarios: [
      { name: "Otimista", weight: 0.2, pd_multiplier: 0.8 },
      { name: "Base", weight: 0.6, pd_multiplier: 1.0 },
      { name: "Pessimista", weight: 0.2, pd_multiplier: 1.6 },
    ],
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const setScenario = (i: number, k: "weight" | "pd_multiplier") => (v: number) =>
    setP({ ...p, scenarios: p.scenarios.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const { data, error } = useCompute<Resp>("/credit/ecl", p, 250);
  const c = data?.current;

  return (
    <Lab title="Provisão de um contrato de crédito">
      <h3 style={{ marginTop: 0 }}>Contrato</h3>
      <div className="grid">
        <NumField label="Saldo devedor" value={p.balance} onChange={set("balance")} step={10_000} />
        <NumField label="Prazo restante (meses)" value={p.remaining_months} onChange={set("remaining_months")} step={6} min={1} max={420} />
        <NumField label="Taxa do contrato" percent value={p.rate} onChange={set("rate")} step={1} />
        <SelectField label="Amortização" value={p.amortizing ? "price" : "bullet"} onChange={(v) => set("amortizing")(v === "price")}
          options={[["price", "Parcelas iguais (Price)"], ["bullet", "Bullet"]]} />
        <SelectField label="Carteira (Res. BCB 352)" value={p.portfolio} onChange={set("portfolio")}
          options={PORTFOLIOS.map((x) => [x.key, x.key])} />
      </div>
      <h3>Risco</h3>
      <div className="grid">
        <NumField label="PD anual na originação" percent value={p.pd_origination} onChange={set("pd_origination")} step={0.5} />
        <NumField label="PD anual hoje" percent value={p.pd_now} onChange={set("pd_now")} step={0.5} />
        <NumField label="LGD" percent value={p.lgd} onChange={set("lgd")} step={5} />
        <NumField label="Gatilho de piora da PD" value={p.sicr_multiple} onChange={set("sicr_multiple")} step={0.5} min={1} hint="PD hoje ÷ PD na originação" />
        <NumField label="Dias de atraso" value={p.days_past_due} onChange={set("days_past_due")} step={15} min={0} />
        <SelectField label="Indício de não pagamento" value={p.problem_signal ? "y" : "n"} onChange={(v) => set("problem_signal")(v === "y")}
          options={[["n", "Não"], ["y", "Sim (ex.: recuperação judicial)"]]} />
      </div>
      <h3>Cenários</h3>
      <div className="grid">
        {p.scenarios.map((s, i) => (
          <div key={s.name} className="field" style={{ gap: 8 }}>
            <strong style={{ color: "var(--text)" }}>{s.name}</strong>
            <NumField label="Peso" value={s.weight} onChange={setScenario(i, "weight")} step={0.1} min={0} />
            <NumField label="Multiplicador da PD" value={s.pd_multiplier} onChange={setScenario(i, "pd_multiplier")} step={0.1} min={0.1} />
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {data && c && (
        <>
          <div className="stats">
            <Stat label="Estágio" value={<span className="badge" style={{ fontSize: 16 }}><span className="dot" style={{ background: STAGE_COLOR[c.stage] }} />Estágio {c.stage}</span>}
              sub={c.stage === 1 ? "perda de 12 meses" : c.stage === 2 ? "perda da vida inteira" : "ativo com problema de recuperação"} />
            <Stat label="Perda esperada" value={fmtMoney(c.ecl)} />
            <Stat label="Piso de perda incorrida" value={fmtMoney(c.floor)} sub={c.floor > 0 ? `carteira ${p.portfolio}` : "não se aplica (não inadimplido)"} />
            <Stat label="Provisão" value={fmtMoney(c.provision)} sub={`cobertura de ${fmtPct(c.coverage, 1)} do saldo`} />
          </div>
          <div className="stats">
            <Stat label="PE de 12 meses" value={fmtMoney(data.ecl_12m)} sub="o que seria provisionado no estágio 1" />
            <Stat label="PE da vida inteira" value={fmtMoney(data.ecl_lifetime)} sub={`${fmtNum(data.ecl_lifetime / data.ecl_12m, 2)}× a de 12 meses`} />
          </div>
          {c.scenarios.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Cenário</th><th className="num">Peso</th><th className="num">PD anual</th><th className="num">Perda esperada</th></tr></thead>
                <tbody>{c.scenarios.map((s) => (
                  <tr key={s.name}><td>{s.name}</td><td className="num">{fmtNum(s.weight, 2)}</td><td className="num">{fmtPct(s.pd, 2)}</td><td className="num">{fmtMoney(s.ecl)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div className="chart-title" style={{ marginTop: 18 }}>Provisão do mesmo contrato conforme os dias de atraso</div>
          <div className="chart-sub">Linhas verticais: 30 dias (estágio 2) e 90 dias (estágio 3). O ponto marca o atraso informado.</div>
          <Legend items={[
            { label: "Provisão (maior entre PE e piso)", color: "var(--series-1)" },
            { label: "Perda esperada", color: "var(--series-2)" },
            { label: "Piso do Anexo I", color: "var(--series-3)" },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.curve} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="days" type="number" domain={[0, 720]} ticks={[0, 30, 90, 180, 360, 540, 720]} {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} />
              <ReferenceLine x={30} stroke="var(--warning)" strokeDasharray="4 3" />
              <ReferenceLine x={90} stroke="var(--critical)" strokeDasharray="4 3" />
              <ReferenceLine x={Math.min(p.days_past_due, 720)} stroke="var(--text-2)" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Resp["curve"][number];
                return <TooltipBox title={`${d.days} dias de atraso · estágio ${d.stage}`} rows={[
                  { label: "Provisão", value: fmtMoney(d.provision), color: "var(--series-1)" },
                  { label: "Perda esperada", value: fmtMoney(d.ecl), color: "var(--series-2)" },
                  { label: "Piso", value: fmtMoney(d.floor), color: "var(--series-3)" },
                ]} />;
              }} />
              <Line dataKey="ecl" type="stepAfter" stroke="var(--series-2)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line dataKey="floor" type="stepAfter" stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line dataKey="provision" type="stepAfter" stroke="var(--series-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
