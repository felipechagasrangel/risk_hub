import { Link } from "react-router-dom";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, M } from "../../components/ui";
import XvaLab from "./XvaLab";

export default function ExposurePage() {
  return (
    <>
      <h1>Exposição de contraparte e PFE</h1>
      <p className="lead">
        Num derivativo de balcão, se a contraparte quebra quando o contrato vale a seu favor, você perde esse valor.
        Como o valor futuro é incerto, o risco é medido por uma <em>distribuição</em> de exposições — e é daí que
        nascem a PFE e, depois, o CVA.
      </p>

      <h2>1. Exposição é a parte positiva do MTM</h2>
      <p>
        Em cada data futura e em cada cenário simulado, reavalia-se o contrato. Se o MTM é positivo, a contraparte
        deve ao banco e há o que perder; se é negativo, quem deve é o banco e não há exposição (há risco para a
        contraparte).
      </p>
      <Formula tex={String.raw`E^{(k)}(t) = \max\!\big(V^{(k)}(t),\, 0\big)`} where={[[String.raw`V^{(k)}(t)`, "MTM do contrato (ou do conjunto de netting) na data t, no cenário k"], [String.raw`E^{(k)}(t)`, "exposição nesse cenário: o que se perde se a contraparte quebrar em t, antes da recuperação"]]} />
      <p>Resumindo a distribuição em cada data:</p>
      <Formula tex={String.raw`\text{EE}(t) = \mathbb{E}[E(t)], \qquad \text{PFE}_q(t) = \text{quantil}_q\big(E(t)\big), \qquad \text{ENE}(t) = \mathbb{E}[\min(V(t), 0)]`} where={[[String.raw`\text{EE}(t)`, "exposição esperada: média da exposição na data t"], [String.raw`\text{PFE}_q(t)`, "exposição potencial futura: o quantil q (95% ou 97,5%) da exposição — usada para limites de crédito"], [String.raw`\text{ENE}(t)`, "exposição negativa esperada: o que a contraparte tem a perder com o banco"], [String.raw`q`, "nível de confiança da PFE"]]} />
      <Formula tex={String.raw`\text{EPE} = \frac{1}{T}\int_0^T \text{EE}(t)\,dt, \qquad \text{EEPE} = \frac{1}{1\text{ ano}}\int_0^{1} \max_{s \le t} \text{EE}(s)\,dt`} where={[[String.raw`\text{EPE}`, "exposição positiva esperada: a média da EE no prazo do contrato"], [String.raw`\text{EEPE}`, "EPE efetiva: média, no primeiro ano, da EE forçada a nunca diminuir"], [String.raw`T`, "prazo do contrato, em anos"]]} />
      <p className="muted" style={{ fontSize: 14 }}>
        A EEPE é a medida regulatória do método de modelos internos: o EAD de risco de contraparte é
        <M>{String.raw`\alpha \times \text{EEPE}`}</M>, com <M>{String.raw`\alpha = 1{,}4`}</M>. O “nunca diminuir” evita que o banco
        se beneficie de exposições que caem só porque os contratos vencem e seriam renovados.
      </p>
      <CodeSnippet name="swap_mtm" caption="MTM do swap DI × pré em cada cenário" />
      <CodeSnippet name="exposure_profile" caption="EE, ENE e PFE a partir das trajetórias" />
      <CodeSnippet name="epe_and_eepe" />

      <h2>2. O formato da exposição</h2>
      <ul>
        <li><strong>Swap DI × pré (troca no vencimento)</strong>: não há pagamentos intermediários, então a exposição cresce até o fim — o fluxo inteiro está em jogo no vencimento. Veja o <Link to="/fundamentos/derivativos">swap na página de derivativos</Link>.</li>
        <li><strong>Swap com pagamentos periódicos</strong> (o padrão internacional): a exposição sobe e depois cai, porque cada pagamento reduz o que falta trocar — o famoso formato de “corcova”.</li>
        <li><strong>NDF e termos</strong>: a incerteza do câmbio cresce com <M>{String.raw`\sqrt t`}</M> e tudo se liquida no fim — a exposição cresce até o vencimento.</li>
      </ul>

      <h2>3. Netting e colateral</h2>
      <p>
        <strong>Netting</strong>: com um acordo de compensação (ISDA ou CGD no Brasil), a exposição é calculada sobre a
        soma dos contratos com a contraparte, não contrato a contrato — e <M>{String.raw`\max(\sum V_i, 0) \le \sum \max(V_i, 0)`}</M>.
      </p>
      <p>
        <strong>Colateral (margem de variação)</strong>: num CSA, a parte devedora deposita garantias à medida que o MTM
        se move. Mesmo assim sobra exposição, por dois motivos:
      </p>
      <Formula tex={String.raw`C(t) = \operatorname{sinal}\big(V(t-\text{MPOR})\big)\cdot\max\big(|V(t - \text{MPOR})| - H,\; 0\big), \qquad E(t) = \max\big(V(t) - C(t),\; 0\big)`} where={[[String.raw`C(t)`, "colateral em mãos na data t"], [String.raw`H`, "threshold: exposição que a contraparte pode ter antes de precisar depositar"], [String.raw`\text{MPOR}`, "período de risco de margem: o tempo entre a última margem paga e o encerramento das posições após o default (10 dias úteis para derivativos bilaterais)"], [String.raw`V(t - \text{MPOR})`, "o MTM sobre o qual a última chamada de margem foi feita"]]} />
      <CodeSnippet name="apply_collateral" caption="CSA bilateral com threshold e MPOR" />
      <Callout title="Por que a exposição colateralizada não é zero">
        Durante o MPOR o mercado continua andando e a contraparte, já inadimplente, para de pagar margem. A exposição
        residual é, aproximadamente, o quanto o MTM pode variar em 10 dias — por isso ela aparece mesmo com threshold
        zero.
      </Callout>

      <h2>4. Laboratório</h2>
      <XvaLab view="exposure" title="Perfil de exposição de um derivativo" />
      <Callout title="O que observar">
        <ul>
          <li>No swap, a EE cresce até o vencimento (troca única no fim); no NDF, cresce como <M>{String.raw`\sqrt t`}</M>.</li>
          <li>Ative a margem de variação: a PFE cai para uma fração do valor sem colateral. Aumente o MPOR e veja a exposição residual crescer.</li>
          <li>Um threshold alto funciona como “sem colateral” até a exposição superá-lo.</li>
          <li>Troque a posição (recebe ↔ paga pré): EE e ENE trocam de papel — a exposição de um lado é a exposição negativa do outro.</li>
        </ul>
      </Callout>
    </>
  );
}
