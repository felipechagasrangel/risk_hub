import { useState } from "react";
import { Link } from "react-router-dom";
import { Callout, RegNote } from "../../components/ui";

export default function BooksPage() {
  return (
    <>
      <h1>Carteira de negociação × carteira bancária</h1>
      <p className="lead">
        Toda posição vive em uma de duas carteiras, e a escolha define que risco ela gera, como é capitalizada e
        em que relatórios aparece. Para os instrumentos um a um, veja o <Link to="/fundamentos/instrumentos">catálogo</Link>.
      </p>

      <h2>1. As duas carteiras</h2>
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

      <h2>2. Regras específicas</h2>
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

      <h2>3. Teste: em qual carteira?</h2>
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
