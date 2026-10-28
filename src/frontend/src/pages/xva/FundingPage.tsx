import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula } from "../../components/ui";
import XvaLab from "./XvaLab";

export default function FundingPage() {
  return (
    <>
      <h1>FVA, MVA e a família XVA</h1>
      <p className="lead">
        Depois do CVA, o mercado passou a precificar outros custos que o preço livre de risco ignora: financiar a
        exposição (FVA), financiar a margem inicial (MVA) e remunerar o capital (KVA). Juntos, são os XVAs.
      </p>

      <h2>1. FVA: o custo de financiar derivativos não colateralizados</h2>
      <p>
        O banco faz o hedge de um derivativo com o cliente usando outro derivativo, colateralizado, no mercado. Se o
        contrato com o cliente vale a favor do banco, o hedge vale contra: o banco precisa <strong>depositar margem</strong>
        no hedge, mas não recebe nada do cliente. Esse caixa é captado à taxa do banco — acima da taxa livre de risco.
        No sentido contrário, o banco recebe margem no hedge e pode usá-la como funding.
      </p>
      <Formula tex={String.raw`\text{FCA} = s_B \sum_i \text{EE}^{*}(t_i)\,\Delta t_i, \qquad \text{FBA} = s_L \sum_i \big|\text{ENE}^{*}(t_i)\big|\,\Delta t_i, \qquad \text{FVA} = \text{FCA} - \text{FBA}`} where={[[String.raw`\text{FCA}`, "funding cost adjustment: o custo de financiar a exposição positiva"], [String.raw`\text{FBA}`, "funding benefit adjustment: o benefício da exposição negativa"], [String.raw`s_B`, "spread de captação do banco sobre a taxa livre de risco"], [String.raw`s_L`, "spread que o banco obtém ao aplicar caixa excedente"], [String.raw`\Delta t_i`, "tamanho do intervalo, em anos"]]} />
      <CodeSnippet name="fva" />
      <Callout title="Um debate que ficou na prática">
        Na teoria clássica de apreçamento, o custo de funding não deveria afetar o valor de um derivativo. Na prática,
        a maioria dos grandes bancos registra FVA desde a década de 2010. Há ainda sobreposição com o DVA: os dois
        dependem do crédito do próprio banco, e é preciso cuidado para não contar o mesmo benefício duas vezes.
      </Callout>

      <h2>2. MVA: o custo da margem inicial</h2>
      <p>
        Derivativos de balcão não compensados em câmara passaram a exigir <strong>margem inicial</strong> (IM), pelas
        regras de margem de BCBS e IOSCO, em geral calculada pelo ISDA SIMM, um modelo baseado em sensibilidades. A IM
        fica segregada e não pode ser reutilizada, então precisa ser financiada durante toda a vida do contrato.
      </p>
      <Formula tex={String.raw`\text{MVA} = s_f \sum_i \mathbb{E}\big[\text{IM}(t_i)\,D(0,t_i)\big]\,\Delta t_i, \qquad \text{IM}(t) \approx z_{99\%}\,|\Delta(t)|\,\sigma\sqrt{10/252}`} where={[[String.raw`\text{IM}(t)`, "margem inicial exigida na data t, em cada trajetória"], [String.raw`D(0,t)`, "fator de desconto até t"], [String.raw`s_f`, "spread de captação usado para financiar a margem"], [String.raw`z_{99\%}`, "quantil 99% da normal (2,326)"], [String.raw`\Delta(t)`, "sensibilidade do contrato ao fator de risco (delta) naquela data"], [String.raw`\sigma\sqrt{10/252}`, "volatilidade do fator em 10 dias úteis"]]} />
      <CodeSnippet name="initial_margin_swap" caption="IM paramétrica por trajetória" />
      <CodeSnippet name="mva" />
      <p className="muted" style={{ fontSize: 14 }}>
        A IM do laboratório é uma simplificação: um VaR paramétrico de 10 dias sobre o delta. O SIMM agrega
        sensibilidades por classe de risco com ponderadores e correlações — a mesma lógica do
        RWA SENS.
      </p>

      <h2>3. KVA e o XVA total</h2>
      <ul>
        <li><strong>KVA</strong>: o custo do capital regulatório consumido pelo contrato (risco de contraparte e de CVA) ao longo da vida, cobrado à taxa de retorno exigida pelos acionistas.</li>
        <li><strong>ColVA</strong>: diferenças entre a remuneração do colateral e a taxa de desconto.</li>
      </ul>
      <Formula tex={String.raw`V = V^{\text{livre de risco}} - \text{CVA} + \text{DVA} - \text{FVA} - \text{MVA} - \text{KVA}`} where={[[String.raw`V^{\text{livre de risco}}`, "valor do contrato supondo que ninguém quebra e que tudo é financiado à taxa livre de risco"], [String.raw`\text{CVA},\ \text{DVA}`, "ajustes de crédito da contraparte e do banco"], [String.raw`\text{FVA},\ \text{MVA},\ \text{KVA}`, "custos de funding, de margem inicial e de capital"]]} />

      <h2>4. Laboratório</h2>
      <XvaLab view="funding" title="O XVA completo de um derivativo" />
      <Callout title="O que observar">
        <ul>
          <li>Com spreads de captação e aplicação iguais, num swap a par, o FCA e o FBA quase se anulam; a assimetria entre eles é o que gera o FVA.</li>
          <li>Ative a margem de variação: o FVA despenca (o hedge deixa de exigir funding), mas a margem inicial continua — e com ela o MVA.</li>
          <li>Num swap longo, a IM é maior no início e cai com o tempo, conforme o prazo restante (e o delta) diminui.</li>
        </ul>
      </Callout>
    </>
  );
}
