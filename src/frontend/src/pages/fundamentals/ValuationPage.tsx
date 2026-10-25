import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Callout, Formula, Lab, Legend, NumField, RegNote, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum } from "../../format";

type Category = { carrying: number; income: number; oci: number };
type Resp = {
  price_paid: number;
  path: { t: number; accrual: number; mtm: number }[];
  today: {
    t: number; accrual: number; mtm: number; unrealized: number;
    categories: { amortized_cost: Category; fvoci: Category; fvtpl: Category };
  };
};

const CATEGORY_LABEL: [keyof Resp["today"]["categories"], string, string][] = [
  ["amortized_cost", "Custo amortizado (CA)", "curva"],
  ["fvoci", "Valor justo em outros resultados abrangentes (VJORA)", "curva no resultado, marcação no PL"],
  ["fvtpl", "Valor justo no resultado (VJR)", "MTM no resultado"],
];

export default function ValuationPage() {
  const [p, setP] = useState({
    face: 1_000_000, maturity_years: 3, purchase_rate: 0.13, market_rate: 0.15, shock_years: 0.5, today_years: 1,
  });
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/valuation/bond", p);

  return (
    <>
      <h1>Apreçamento: curva, MTM e as carteiras</h1>
      <p className="lead">
        Antes de medir risco é preciso saber <em>quanto vale</em> cada posição — e “valor” tem mais de um
        significado. Esta página explica as duas formas de apreçar, quando cada uma é usada, a hierarquia de
        preços e a fronteira entre carteira de negociação e carteira bancária.
      </p>

      <h2>1. Duas formas de dizer quanto vale um título</h2>
      <div className="grid-2">
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Na curva (accrual)</h3>
          <p>
            O ativo é registrado pelo preço pago e cresce todo dia à <strong>taxa efetiva da operação</strong>,
            a taxa contratada na origem. O valor não muda se o mercado mudar: só passa o tempo.
          </p>
          <Formula tex={String.raw`V^{\text{curva}}_t = P_0\,(1 + y_0)^{t}`} where={[[String.raw`V^{\text{curva}}_t`, "valor do título na curva na data t"], [String.raw`P_0`, "preço pago na compra"], [String.raw`y_0`, "taxa efetiva da compra, ao ano"], [String.raw`t`, "tempo desde a compra, em anos (dias úteis ÷ 252)"]]} />
          <p style={{ marginBottom: 0 }}>Responde: <em>quanto este ativo me rende se eu o carregar até o fim?</em></p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>A mercado (MTM)</h3>
          <p>
            O ativo é reavaliado pelo preço que se obteria <strong>hoje</strong>: os fluxos restantes são
            descontados pela taxa de mercado do dia. Se os juros sobem, o valor cai.
          </p>
          <Formula tex={String.raw`V^{\text{MTM}}_t = \frac{F}{(1 + y^{\text{mercado}}_t)^{T - t}}`} where={[[String.raw`V^{\text{MTM}}_t`, "valor a mercado do título na data t"], [String.raw`F`, "valor de face, pago no vencimento"], [String.raw`y^{\text{mercado}}_t`, "taxa de mercado em t para o prazo restante"], [String.raw`T`, "data de vencimento, em anos"], [String.raw`T - t`, "prazo restante até o vencimento"]]} />
          <p style={{ marginBottom: 0 }}>Responde: <em>por quanto eu venderia este ativo agora?</em></p>
        </div>
      </div>
      <p>
        A diferença entre os dois é o <strong>resultado não realizado</strong> (a “marcação”). No vencimento ela
        some: os dois valores convergem para o valor de face — é o <em>pull to par</em>. Por isso, para quem
        de fato carrega o título até o fim, a marcação é temporária; para quem pode precisar vendê-lo antes, ela é
        real.
      </p>

      <h2>2. Quando se usa cada uma</h2>
      <p>
        Desde 2025, a <strong>Resolução CMN nº 4.966/2021</strong> (alinhada ao IFRS 9) classifica os ativos
        financeiros em três categorias, com base em duas perguntas: <strong>qual o modelo de negócio</strong> da
        carteira e se o instrumento passa no <strong>teste de SPPJ</strong> (os fluxos são somente pagamento de
        principal e juros?).
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Categoria</th><th>Modelo de negócio</th><th>Valor no balanço</th><th>Variação de valor vai para</th><th>Exemplos</th></tr></thead>
          <tbody>
            <tr><td><strong>Custo amortizado (CA)</strong></td><td>Manter para receber os fluxos contratuais (e passar no SPPJ)</td><td>Curva</td><td>Só os juros pela taxa efetiva, no resultado</td><td>Crédito, financiamentos, títulos carregados até o vencimento</td></tr>
            <tr><td><strong>VJORA</strong></td><td>Receber fluxos <em>e</em> vender (e passar no SPPJ)</td><td>MTM</td><td>Juros no resultado; marcação no patrimônio líquido (outros resultados abrangentes)</td><td>Carteira de títulos da tesouraria para liquidez e ALM</td></tr>
            <tr><td><strong>VJR</strong></td><td>Negociar, ou qualquer instrumento que não passe no SPPJ</td><td>MTM</td><td>Tudo no resultado</td><td>Carteira de negociação, derivativos, cotas de fundos</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Antes, a Circular nº 3.068/2001 usava “para negociação”, “disponíveis para venda” e “mantidos até o
        vencimento” — que correspondem, grosso modo, a VJR, VJORA e custo amortizado. Derivativos são sempre a
        valor justo; o crédito a custo amortizado convive com a provisão para perdas esperadas.
      </p>
      <Callout title="Contabilidade ≠ gestão de risco">
        A categoria contábil diz onde a variação de valor aparece no balanço. A gestão de risco olha o valor
        econômico de tudo: o <Link to="/irrbb">ΔEVE do IRRBB</Link> reavalia a mercado inclusive o crédito que a
        contabilidade carrega na curva.
      </Callout>

      <h2>3. Laboratório</h2>
      <Lab title="Um prefixado na curva e a mercado">
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Título sem cupom (como uma LTN), taxas exponenciais base 252. A taxa de mercado começa igual à da compra
          e muda para a nova taxa na data do choque.
        </p>
        <div className="grid">
          <NumField label="Valor de face" value={p.face} onChange={set("face")} step={100000} />
          <NumField label="Prazo (anos)" value={p.maturity_years} onChange={set("maturity_years")} step={0.5} min={0.5} max={30} />
          <NumField label="Taxa de compra" percent value={p.purchase_rate} onChange={set("purchase_rate")} step={0.25} />
          <NumField label="Taxa de mercado após o choque" percent value={p.market_rate} onChange={set("market_rate")} step={0.25} />
          <NumField label="Choque em (anos)" value={p.shock_years} onChange={set("shock_years")} step={0.25} min={0} />
          <NumField label="Observar em (anos)" value={p.today_years} onChange={set("today_years")} step={0.25} min={0} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && <BondResults data={data} />}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Com alta de juros, o MTM cai abaixo da curva no dia do choque e depois converge para o valor de face.</li>
          <li>O mesmo título, no mesmo dia, gera três resultados contábeis diferentes conforme a categoria.</li>
          <li>Ponha a observação no vencimento: a marcação some e as três categorias mostram o mesmo resultado acumulado.</li>
          <li>Aumente o prazo para 10 anos: o mesmo choque produz uma marcação muito maior (duration maior).</li>
        </ul>
      </Callout>

      <h2>4. Hierarquia de preços</h2>
      <p>
        Marcar a mercado exige um preço — e nem todo instrumento tem um preço observável. O <strong>CPC 46</strong>
        (IFRS 13) organiza o valor justo em três níveis, conforme a qualidade dos dados usados:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Nível</th><th>Dado de entrada</th><th>Exemplos no Brasil</th></tr></thead>
          <tbody>
            <tr><td><strong>1</strong></td><td>Preço cotado, sem ajuste, em mercado ativo para o instrumento idêntico</td><td>Ações e futuros negociados na B3 com liquidez; títulos públicos, quando a instituição demonstra mercado ativo</td></tr>
            <tr><td><strong>2</strong></td><td>Dados observáveis, mas não o preço do próprio instrumento: curvas, preços de similares, volatilidades de mercado</td><td>Swaps marcados com a curva de DI futuro; debêntures com taxas indicativas da ANBIMA; opções de balcão com volatilidade observável</td></tr>
            <tr><td><strong>3</strong></td><td>Dados não observáveis, estimados pela própria instituição</td><td>Crédito privado sem negociação; derivativos exóticos; participações em empresas fechadas</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Na prática, os manuais de apreçamento definem uma <strong>hierarquia de fontes</strong>: usa-se primeiro o
        preço negociado em mercado ativo; na falta dele, preços e taxas divulgados por fontes independentes (B3,
        ANBIMA, provedores); depois, modelos alimentados por dados observáveis; e, por último, modelos com
        premissas próprias. Quanto mais se desce, maior o <strong>risco de modelo</strong> e maior a necessidade de
        validação independente.
      </p>
      <Callout title="Apreçamento prudente">
        A Resolução CMN nº 4.277/2013 exige que as instituições tenham processos de apreçamento prudentes e
        documentados para os instrumentos avaliados a mercado, e que façam <strong>ajustes prudenciais</strong> — por
        exemplo, por custos de liquidação, baixa liquidez, risco de modelo e spread de crédito. Instrumentos
        negociados de forma ativa e frequente, com preços de fontes independentes, podem dispensar esses ajustes.
        Os ajustes são divulgados no Pilar 3 (tabela PV1).
      </Callout>

      <h2>5. Carteira de negociação × carteira bancária</h2>
      <p>
        Toda posição de um banco vive em uma de duas carteiras, e a escolha define <strong>qual risco ela gera e
        como é capitalizada</strong>. A fronteira é regulada pela Resolução nº 4.557/2017 (art. 26) e pela
        <strong> Resolução BCB nº 111/2021</strong>, que implementou a fase 1 do FRTB em 2023.
      </p>
      <div className="grid-2">
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Carteira de negociação (trading book)</h3>
          <p>Só pode conter instrumentos que atendam, <strong>ao mesmo tempo</strong>, a três condições:</p>
          <ol>
            <li>têm <strong>finalidade de negociação</strong> — revenda no curto prazo, ganho com movimentos de preço, arbitragem ou hedge de outras posições de negociação;</li>
            <li>não têm <strong>impedimento legal para venda</strong>;</li>
            <li>são avaliados <strong>diariamente a mercado, com ajustes no resultado</strong>.</li>
          </ol>
          <p style={{ marginBottom: 0 }}>Risco: mercado. Capital: <Link to="/mercado/rwa-sens">RWA SENS</Link> e DRC. Gestão: <Link to="/mercado/var">VaR</Link>, stress, limites por mesa.</p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Carteira bancária (banking book)</h3>
          <p>
            Tudo o que não está na carteira de negociação: o crédito, a captação, os títulos para liquidez e
            gestão de balanço, as participações e os hedges dessas posições.
          </p>
          <p style={{ marginBottom: 0 }}>
            Riscos: crédito e juros da carteira bancária. Capital: <Link to="/capital/rwa">RWA de crédito</Link>.
            Gestão: <Link to="/irrbb">IRRBB (ΔEVE e ΔNII)</Link>, risco de crédito, liquidez.
          </p>
        </div>
      </div>
      <Callout title="Marcado a mercado não quer dizer carteira de negociação">
        O FAQ do BCB sobre a Res. BCB 111 é explícito: avaliar a mercado com ajuste no resultado é necessário, mas
        <strong> não suficiente</strong> — falta a finalidade de negociação. E um título em VJORA (marcação no PL)
        <strong> não pode</strong> estar na carteira de negociação. Uma LTN da tesouraria de ALM, em VJORA, é carteira
        bancária e entra no IRRBB, não no RWA de mercado.
      </Callout>

      <h3>Regras específicas</h3>
      <ul>
        <li><strong>Opções</strong> (inclusive opcionalidades automáticas embutidas) vão, como regra, para a carteira de negociação. As expostas a juros podem ficar na carteira bancária se não tiverem finalidade de negociação, observando o mecanismo do art. 8º (autorização do BCB).</li>
        <li><strong>Derivativos de hedge</strong> de posições da carteira bancária podem ficar na carteira bancária — exceto opções; as de juros usadas como hedge da carteira bancária também podem (art. 6º, § 3º).</li>
        <li><strong>Compromissadas</strong> para gestão de liquidez podem ficar na carteira bancária.</li>
        <li>Um instrumento que criaria uma <strong>exposição líquida vendida</strong> a crédito ou ações na carteira bancária deve ir inteiro para a carteira de negociação.</li>
        <li>Sobras de <strong>garantia firme de subscrição</strong> esperadas na liquidação vão para a carteira de negociação.</li>
        <li><strong>Exceções e reclassificações</strong> dependem de autorização do BCB, em caráter extraordinário, e só podem ser pedidas por instituições S1, S2 e S3 (arts. 8º e 9º).</li>
        <li><strong>Transferências internas de risco</strong> entre as carteiras só têm efeito no capital se registradas numa mesa dedicada autorizada pelo BCB.</li>
      </ul>
      <p className="muted" style={{ fontSize: 14 }}>
        A ideia de fundo, herdada do FRTB: a fronteira precisa ser difícil de mover, para que o banco não escolha
        a carteira que exige menos capital para a mesma posição.
      </p>

      <h2>6. Teste: em qual carteira?</h2>
      <Quiz />

      <RegNote>
        <p>
          Fontes: Resolução CMN nº 4.966/2021 (classificação contábil), CPC 46 (hierarquia de valor justo),
          Resolução CMN nº 4.277/2013 (apreçamento prudente), Resolução nº 4.557/2017 e Resolução BCB nº 111/2021,
          com o <a href="https://www.bcb.gov.br/content/estabilidadefinanceira/regulacao_prudencial_docs/FAQ_FRTB_Fase1_Jul22.pdf">FAQ do BCB</a> (fronteira entre carteiras).
          As posições na carteira de negociação são reportadas no DRM e no DDR — veja <Link to="/cadocs">CADOCs</Link>.
        </p>
      </RegNote>
    </>
  );
}

function BondResults({ data }: { data: Resp }) {
  const t = data.today;
  return (
    <>
      <div className="stats">
        <Stat label="Preço pago" value={fmtMoney(data.price_paid)} />
        <Stat label={`Na curva em ${fmtNum(t.t, 2)} anos`} value={fmtMoney(t.accrual)} />
        <Stat label={`A mercado em ${fmtNum(t.t, 2)} anos`} value={fmtMoney(t.mtm)} />
        <Stat label="Marcação (MTM − curva)" value={<span className={t.unrealized < 0 ? "bad" : "good"}>{fmtMoney(t.unrealized)}</span>}
          sub="resultado não realizado" />
      </div>
      <div className="chart-title">Valor do título ao longo do tempo</div>
      <div className="chart-sub">Linhas verticais: data do choque e data de observação. As duas curvas terminam no valor de face.</div>
      <Legend items={[
        { label: "Na curva (accrual)", color: "var(--series-1)" },
        { label: "A mercado (MTM)", color: "var(--series-2)" },
      ]} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.path} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={60} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Resp["path"][number];
            return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
              { label: "Curva", value: fmtMoney(d.accrual), color: "var(--series-1)" },
              { label: "MTM", value: fmtMoney(d.mtm), color: "var(--series-2)" },
              { label: "Marcação", value: fmtMoney(d.mtm - d.accrual) },
            ]} />;
          }} />
          <ReferenceLine x={t.t} stroke="var(--text-2)" strokeDasharray="4 3" />
          <Line dataKey="accrual" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="mtm" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <h3>O mesmo título em cada categoria contábil</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Categoria</th><th className="num">Valor no balanço</th><th className="num">Resultado acumulado</th><th className="num">Patrimônio líquido (ORA)</th></tr></thead>
          <tbody>
            {CATEGORY_LABEL.map(([k, label, hint]) => (
              <tr key={k}>
                <td>{label}<br /><span className="muted" style={{ fontSize: 12 }}>{hint}</span></td>
                <td className="num">{fmtMoney(t.categories[k].carrying)}</td>
                <td className="num">{fmtMoney(t.categories[k].income)}</td>
                <td className="num">{fmtMoney(t.categories[k].oci)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Sem perdas esperadas de crédito nem impostos.</p>
    </>
  );
}

type Book = "trading" | "banking";
const QUIZ: { item: string; answer: Book; why: string }[] = [
  { item: "Ações do Ibovespa compradas pela mesa proprietária para girar no curto prazo", answer: "trading",
    why: "Finalidade de negociação, sem impedimento de venda e marcadas a mercado no resultado." },
  { item: "Carteira de crédito consignado", answer: "banking",
    why: "Crédito mantido para receber os fluxos: custo amortizado, carteira bancária." },
  { item: "LTN da tesouraria de ALM, classificada em VJORA", answer: "banking",
    why: "VJORA leva a marcação ao PL; a carteira de negociação exige ajustes no resultado." },
  { item: "Swap DI × pré contratado para proteger o consignado prefixado", answer: "banking",
    why: "Derivativo de hedge de posição da carteira bancária pode ficar na carteira bancária." },
  { item: "Opção de dólar vendida a um cliente corporativo", answer: "trading",
    why: "Opções vão, como regra, para a carteira de negociação; a exceção vale para opções de juros." },
  { item: "Operação compromissada para gestão de liquidez", answer: "banking",
    why: "Exceção expressa: compromissadas para gestão de liquidez podem ficar na carteira bancária." },
  { item: "Debêntures que sobraram para o banco numa garantia firme de subscrição", answer: "trading",
    why: "Sobras esperadas de subscrição com garantia firme vão para a carteira de negociação." },
  { item: "CDS comprado que deixaria a carteira bancária vendida em risco de crédito", answer: "trading",
    why: "Instrumento que criaria exposição líquida vendida a crédito na carteira bancária vai inteiro para negociação." },
];

function Quiz() {
  const [answers, setAnswers] = useState<(Book | null)[]>(QUIZ.map(() => null));
  const score = answers.filter((a, i) => a === QUIZ[i].answer).length;
  const answered = answers.filter(Boolean).length;
  return (
    <div className="card">
      {QUIZ.map((q, i) => {
        const a = answers[i];
        const ok = a === q.answer;
        return (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < QUIZ.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ marginBottom: 6 }}>{i + 1}. {q.item}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(["trading", "banking"] as Book[]).map((b) => (
                <button key={b} onClick={() => setAnswers((prev) => prev.map((x, j) => (j === i ? b : x)))}
                  style={a === b ? { borderColor: "var(--accent)", fontWeight: 600 } : undefined}>
                  {b === "trading" ? "Negociação" : "Bancária"}
                </button>
              ))}
              {a && (
                <span style={{ fontSize: 14 }}>
                  <strong className={ok ? "good" : "bad"}>{ok ? "✓ Certo." : "✕ Não."}</strong> {q.why}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <p style={{ marginBottom: 0, marginTop: 12 }}>
        <strong>{score}</strong> de {QUIZ.length} certas{answered < QUIZ.length && ` (${answered} respondidas)`}.
        {answered > 0 && <button className="link" onClick={() => setAnswers(QUIZ.map(() => null))}>recomeçar</button>}
      </p>
    </div>
  );
}
