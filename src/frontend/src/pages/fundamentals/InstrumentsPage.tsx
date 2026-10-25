import { useState } from "react";
import { Link } from "react-router-dom";
import { Callout } from "../../components/ui";

type Book = "Negociação" | "Bancária" | "Ambas";
type Instrument = {
  name: string;
  book: Book;
  accounting: string;
  pricing: string;
  source: string;
};

const GROUPS: { title: string; note?: string; items: Instrument[] }[] = [
  {
    title: "Títulos públicos",
    note: "A mesma LTN pode estar nas duas carteiras: depende da finalidade (negociação ou liquidez/ALM).",
    items: [
      { name: "LTN e NTN-F (prefixados)", book: "Ambas", accounting: "VJR (negociação); VJORA ou CA (ALM)",
        pricing: "PU = fluxos fixos descontados pela taxa pré de mercado; NTN-F com cupons semestrais",
        source: "Taxas indicativas ANBIMA, negócios no secundário · nível 1 ou 2" },
      { name: "LFT (Selic)", book: "Ambas", accounting: "VJR, VJORA ou CA",
        pricing: "VNA (Selic acumulada desde a data-base) × cotação; a marcação é só o ágio ou deságio",
        source: "Taxas indicativas ANBIMA · nível 1 ou 2" },
      { name: "NTN-B (IPCA + juro real)", book: "Ambas", accounting: "VJR, VJORA ou CA",
        pricing: "VNA corrigido pelo IPCA; cupons e principal descontados pela taxa real de mercado",
        source: "Taxas indicativas ANBIMA, projeção de IPCA · nível 1 ou 2" },
    ],
  },
  {
    title: "Crédito e captação",
    note: "Na contabilidade ficam na curva; para o IRRBB, os fluxos são reavaliados a mercado (ΔEVE).",
    items: [
      { name: "Crédito pré (consignado, CDC, imobiliário)", book: "Bancária", accounting: "CA + perda esperada",
        pricing: "Curva: saldo devedor pela taxa efetiva da operação",
        source: "Contrato · valor justo só para divulgação e gestão (nível 3)" },
      { name: "Crédito pós (capital de giro em CDI)", book: "Bancária", accounting: "CA + perda esperada",
        pricing: "Curva: principal × CDI acumulado × spread contratado",
        source: "Contrato · nível 3 para valor justo" },
      { name: "CDB, LCI, LCA e LF emitidos", book: "Bancária", accounting: "Passivo a CA",
        pricing: "Curva: pré pela taxa contratada; pós por % do CDI ou CDI + spread",
        source: "Contrato · MTM gerencial com a curva de captação do banco" },
      { name: "Depósitos à vista e poupança", book: "Bancária", accounting: "Passivo a custo",
        pricing: "Saldo contábil; para IRRBB, prazo comportamental modelado",
        source: "Modelos internos de estabilidade dos saldos" },
      { name: "Compromissadas", book: "Ambas", accounting: "CA (liquidez) ou VJR (negociação)",
        pricing: "Curva: taxa da operação, normalmente prazo curto e lastro em título público",
        source: "Contrato · nível 2" },
      { name: "Depósitos interfinanceiros (DI)", book: "Bancária", accounting: "CA",
        pricing: "Curva pela taxa contratada, geralmente CDI",
        source: "Contrato · nível 2" },
    ],
  },
  {
    title: "Títulos privados, ações e fundos",
    items: [
      { name: "Debêntures, CRI e CRA", book: "Ambas", accounting: "VJR, VJORA ou CA",
        pricing: "Fluxos descontados pela curva livre de risco + spread de crédito do emissor",
        source: "Taxas indicativas ANBIMA quando há · nível 2; sem negociação · nível 3" },
      { name: "Letras financeiras de outros bancos", book: "Ambas", accounting: "VJORA ou CA",
        pricing: "CDI + spread: marcação só pela mudança do spread",
        source: "Spreads de emissões e negócios recentes · nível 2" },
      { name: "Ações listadas", book: "Negociação", accounting: "VJR",
        pricing: "Preço de fechamento na B3",
        source: "B3 · nível 1" },
      { name: "Cotas de fundos", book: "Ambas", accounting: "VJR (não passam no SPPJ)",
        pricing: "Valor da cota divulgado pelo administrador, ou olhando as posições do fundo",
        source: "Administrador · nível 1 a 3, conforme os ativos do fundo" },
      { name: "Participações em empresas fechadas", book: "Bancária", accounting: "Equivalência patrimonial ou valor justo",
        pricing: "Fluxo de caixa descontado ou múltiplos",
        source: "Premissas próprias · nível 3" },
    ],
  },
  {
    title: "Derivativos",
    note: "Sempre a valor justo. Ficam na carteira bancária quando são hedge de posições dela (exceto opções, salvo as de juros).",
    items: [
      { name: "DI1 futuro", book: "Ambas", accounting: "VJR (ou hedge)",
        pricing: "Ajuste diário pelo PU de ajuste: o resultado passa pelo caixa todo dia",
        source: "B3 · nível 1" },
      { name: "DOL e índice futuro", book: "Ambas", accounting: "VJR (ou hedge)",
        pricing: "Ajuste diário pelo preço de ajuste",
        source: "B3 · nível 1" },
      { name: "Swap DI × pré", book: "Ambas", accounting: "VJR (ou hedge)",
        pricing: "Ponta pré descontada pela curva de DI futuro; ponta CDI ≈ valor na curva",
        source: "Curva de DI futuro · nível 2" },
      { name: "Swap cambial e NDF", book: "Ambas", accounting: "VJR (ou hedge)",
        pricing: "Dólar à vista, curva pré e curva de cupom cambial",
        source: "B3 (DOL, DDI, FRC) · nível 2" },
      { name: "Opções listadas (ações, dólar, IDI)", book: "Negociação", accounting: "VJR",
        pricing: "Prêmio negociado; se ilíquido, Black-Scholes ou Bachelier com vol implícita",
        source: "B3 · nível 1 ou 2" },
      { name: "Opções de balcão e exóticas", book: "Negociação", accounting: "VJR",
        pricing: "Modelos (Black, simulação, árvores) com superfície de volatilidade",
        source: "Vols de mercado · nível 2; parâmetros não observáveis · nível 3" },
      { name: "CDS e derivativos de crédito", book: "Ambas", accounting: "VJR (ou hedge)",
        pricing: "Curva de spread de crédito do emissor de referência e taxa de recuperação",
        source: "Cotações de mercado · nível 2; ilíquidos · nível 3" },
    ],
  },
];

const BOOK_FILTERS: ("Todas" | Book)[] = ["Todas", "Negociação", "Bancária", "Ambas"];

export default function InstrumentsPage() {
  const [filter, setFilter] = useState<(typeof BOOK_FILTERS)[number]>("Todas");

  return (
    <>
      <h1>Catálogo de instrumentos</h1>
      <p className="lead">
        Como cada instrumento costuma ser classificado e apreçado num banco brasileiro: em que carteira vive, em
        que categoria contábil cai, como se calcula o valor e de onde vem o preço.
      </p>
      <Callout title="Leia como “típico”, não como regra">
        A carteira depende da <Link to="/fundamentos/carteiras">finalidade</Link> de cada operação e a categoria
        contábil do <Link to="/fundamentos/contabil">modelo de negócio</Link>, então o mesmo instrumento pode cair
        em lugares diferentes em bancos diferentes. O nível de preço também depende de haver mercado ativo na data.
      </Callout>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <span className="muted" style={{ alignSelf: "center", fontSize: 14 }}>Carteira típica:</span>
        {BOOK_FILTERS.map((b) => (
          <button key={b} onClick={() => setFilter(b)}
            style={filter === b ? { borderColor: "var(--accent)", fontWeight: 600 } : undefined}>{b}</button>
        ))}
      </div>

      {GROUPS.map((g) => {
        const items = g.items.filter((i) => filter === "Todas" || i.book === filter);
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <h2>{g.title}</h2>
            {g.note && <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>{g.note}</p>}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Instrumento</th><th>Carteira típica</th><th>Categoria contábil</th><th>Como se apreça</th><th>Fonte e nível</th></tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.name}>
                      <td><strong>{i.name}</strong></td>
                      <td>{i.book}</td>
                      <td>{i.accounting}</td>
                      <td>{i.pricing}</td>
                      <td>{i.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
