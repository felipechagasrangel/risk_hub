import { Link } from "react-router-dom";
import { Callout } from "../../components/ui";
import BondLab from "./BondLab";

export default function AccountingPage() {
  return (
    <>
      <h1>Contabilidade e hierarquia de preços</h1>
      <p className="lead">
        Curva ou mercado não é escolha livre: a norma contábil diz qual vale para cada ativo, e a hierarquia
        de valor justo diz de onde tirar o preço quando é a mercado.
      </p>

      <h2>1. As três categorias da Resolução CMN nº 4.966</h2>
      <p>
        Desde 2025, a <strong>Resolução CMN nº 4.966/2021</strong> (alinhada ao IFRS 9) classifica os ativos
        financeiros com base em duas perguntas: <strong>qual o modelo de negócio</strong> da carteira e se o
        instrumento passa no <strong>teste de SPPJ</strong> (os fluxos são somente pagamento de principal e juros?).
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Categoria</th><th>Modelo de negócio</th><th>Valor no balanço</th><th>Variação de valor vai para</th><th>Exemplos</th></tr></thead>
          <tbody>
            <tr><td><strong>Custo amortizado (CA)</strong></td><td>Manter para receber os fluxos contratuais (e passar no SPPJ)</td><td>Curva</td><td>Só os juros pela taxa efetiva, no resultado</td><td>Crédito, financiamentos, títulos carregados até o vencimento</td></tr>
            <tr><td><strong>VJORA</strong></td><td>Receber fluxos <em>e</em> vender (e passar no SPPJ)</td><td>Mercado</td><td>Juros no resultado; marcação no patrimônio líquido (outros resultados abrangentes)</td><td>Títulos da tesouraria para liquidez e ALM</td></tr>
            <tr><td><strong>VJR</strong></td><td>Negociar, ou qualquer instrumento que não passe no SPPJ</td><td>Mercado</td><td>Tudo no resultado</td><td>Carteira de negociação, derivativos, cotas de fundos</td></tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li><strong>Passivos</strong> financeiros (CDB, LCI, LF emitidos) ficam, em regra, a custo amortizado: na curva.</li>
        <li><strong>Derivativos</strong> ficam sempre a valor justo; a contabilidade de hedge só muda onde a variação aparece (veja <Link to="/fundamentos/derivativos">Derivativos</Link>).</li>
        <li><strong>Crédito</strong> a custo amortizado convive com a provisão para perdas esperadas.</li>
      </ul>
      <p className="muted" style={{ fontSize: 14 }}>
        Antes, a Circular nº 3.068/2001 usava “para negociação”, “disponíveis para venda” e “mantidos até o
        vencimento” — que correspondem, grosso modo, a VJR, VJORA e custo amortizado.
      </p>
      <BondLab title="O mesmo título em cada categoria" showCategories />
      <Callout title="Contabilidade ≠ gestão de risco">
        A categoria contábil diz onde a variação de valor aparece no balanço. A gestão de risco olha o valor
        econômico de tudo: o <Link to="/irrbb">ΔEVE do IRRBB</Link> reavalia a mercado inclusive o crédito e a
        captação que a contabilidade carrega na curva.
      </Callout>

      <h2>2. Hierarquia de valor justo</h2>
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
    </>
  );
}
