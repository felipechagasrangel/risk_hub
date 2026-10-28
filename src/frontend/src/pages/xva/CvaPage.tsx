import { Link } from "react-router-dom";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, M } from "../../components/ui";
import XvaLab from "./XvaLab";

export default function CvaPage() {
  return (
    <>
      <h1>CVA e DVA</h1>
      <p className="lead">
        O preço “livre de risco” de um derivativo supõe que as duas partes sempre pagam. O CVA é o desconto que se
        aplica a esse preço pelo risco de a contraparte quebrar — o valor de mercado do risco de crédito do contrato.
      </p>

      <h2>1. A fórmula</h2>
      <p>
        Em cada intervalo de tempo, a perda esperada é: quanto se teria a perder (a EE), vezes a chance de a
        contraparte quebrar naquele intervalo, vezes a fração que não se recupera. Somando no prazo:
      </p>
      <Formula tex={String.raw`\text{CVA} = (1 - R) \sum_{i} \text{EE}^{*}(t_i)\,\big[S(t_{i-1}) - S(t_i)\big]`} where={[[String.raw`R`, "taxa de recuperação da contraparte (40% é a convenção de mercado para dívida sênior)"], [String.raw`\text{EE}^{*}(t_i)`, "exposição esperada descontada até hoje na data tᵢ"], [String.raw`S(t)`, "probabilidade de a contraparte sobreviver até t"], [String.raw`S(t_{i-1}) - S(t_i)`, "probabilidade de default dentro do intervalo"]]} />
      <p>A curva de sobrevivência sai do mercado de CDS (ou de spreads de títulos) da contraparte, pela aproximação do “triângulo de crédito”:</p>
      <Formula tex={String.raw`S(t) = e^{-\lambda t}, \qquad \lambda \approx \frac{s}{1 - R}`} where={[[String.raw`\lambda`, "intensidade de default (hazard rate), ao ano"], [String.raw`s`, "spread de CDS da contraparte, ao ano"], [String.raw`R`, "taxa de recuperação usada na cotação do CDS"]]} />
      <CodeSnippet name="default_probabilities" caption="probabilidades marginais a partir do spread" />
      <CodeSnippet name="cva" caption="o CVA e a contribuição de cada intervalo" />

      <h2>2. DVA: o mesmo, visto pela contraparte</h2>
      <p>
        A contraparte também corre o risco de o <em>banco</em> quebrar quando o contrato vale a favor dela. Para ela, isso é
        CVA; para o banco, é o <strong>DVA</strong> — um ajuste a favor, calculado com a exposição negativa e o risco de
        crédito do próprio banco.
      </p>
      <Formula tex={String.raw`\text{DVA} = -(1 - R_B) \sum_{i} \text{ENE}^{*}(t_i)\,\big[S_B(t_{i-1}) - S_B(t_i)\big], \qquad \text{CVA bilateral} = \text{CVA} - \text{DVA}`} where={[[String.raw`\text{ENE}^{*}(t_i)`, "exposição negativa esperada descontada (negativa, por isso o sinal de menos)"], [String.raw`R_B,\ S_B(t)`, "recuperação e sobrevivência do próprio banco"]]} />
      <CodeSnippet name="dva" />
      <Callout title="O paradoxo do DVA">
        Se o crédito do banco piora, o DVA aumenta e o banco registra um ganho — lucrar com a própria piora. Por isso o
        DVA entra na contabilidade (o CPC 46 / IFRS 13 exige refletir o risco de crédito no valor justo), mas é deduzido do
        capital regulatório e muitos bancos o neutralizam na gestão.
      </Callout>

      <h2>3. Por que o CVA importa</h2>
      <ul>
        <li><strong>Preço</strong>: o CVA é cobrado do cliente no momento da contratação. Uma mesa de XVA centraliza esse risco e faz o hedge com CDS e derivativos de mercado.</li>
        <li><strong>Contabilidade</strong>: o valor justo dos derivativos já inclui o ajuste de crédito.</li>
        <li><strong>Capital</strong>: na crise de 2008, boa parte das perdas com derivativos veio de <em>variação</em> do CVA, não de defaults. Basileia III passou a exigir capital para o risco de CVA, hoje pelas abordagens BA-CVA (básica) e SA-CVA (por sensibilidades, como o <Link to="/mercado/rwa-sens">RWA SENS</Link>).</li>
        <li><strong>Wrong-way risk</strong>: a fórmula acima supõe exposição e default independentes. Quando a exposição cresce justamente quando a contraparte piora (por exemplo, vender proteção de câmbio para um exportador muito endividado em dólar), o CVA verdadeiro é maior.</li>
      </ul>

      <h2>4. Laboratório</h2>
      <XvaLab view="cva" title="CVA e DVA de um derivativo" />
      <Callout title="O que observar">
        <ul>
          <li>Dobre o spread da contraparte: o CVA quase dobra — para spreads baixos ele é praticamente linear em <M>\lambda</M>.</li>
          <li>Aumente a recuperação mantendo o spread: o CVA muda pouco, porque λ = s/(1−R) sobe e compensa a menor perda — o mercado cota o spread, não a PD.</li>
          <li>No swap com troca no vencimento, a maior parte do CVA vem dos últimos anos, onde a exposição é maior.</li>
          <li>Ative o colateral: o CVA cai para uma fração — é o principal motivo para exigir CSA.</li>
        </ul>
      </Callout>
    </>
  );
}
