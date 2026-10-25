import { Link } from "react-router-dom";
import { Callout, Formula } from "../components/ui";

type Doc = {
  id: string;
  code: string;
  acronym: string;
  name: string;
  scope: string;
  frequency: string;
  norms: string[];
  concepts: { to: string; label: string }[];
};

/** Nomes e normas conforme a página "Leiaute de arquivos e base normativa" do BCB. */
const DOCS: Doc[] = [
  {
    id: "ddr", code: "2011", acronym: "DDR",
    name: "Demonstrativo Diário de Acompanhamento das Parcelas de Requerimento de Capital e dos Limites Operacionais",
    scope: "Acompanhamento diário das parcelas de RWA (em especial as de risco de mercado, que mudam todo dia com as posições) e dos limites operacionais. É a visão diária do que o DLO consolida no fechamento.",
    frequency: "Diária",
    norms: ["Circular nº 3.947/2019", "Resolução BCB nº 100/2021", "Instrução Normativa BCB nº 118/2021"],
    concepts: [{ to: "/capital/rwa", label: "RWA e Índice de Basileia" }, { to: "/mercado/var", label: "Risco de mercado" }],
  },
  {
    id: "drm", code: "2060", acronym: "DRM",
    name: "Demonstrativo de Risco de Mercado",
    scope: "Informações de risco de mercado previstas na Resolução BCB nº 84/2021: exposições por fator de risco, risco de taxa de juros da carteira bancária (IRRBB) e o RWA de risco de mercado. Enviado por instituições dos segmentos S1 a S4.",
    frequency: "Mensal (data-base no último dia útil do mês)",
    norms: ["Resolução BCB nº 84/2021", "Instrução Normativa BCB nº 101/2021"],
    concepts: [{ to: "/mercado/var", label: "VaR" }, { to: "/irrbb", label: "ΔEVE e ΔNII" }],
  },
  {
    id: "dlo", code: "2061", acronym: "DLO",
    name: "Demonstrativo de Limites Operacionais",
    scope: "O “boletim” de solvência do conglomerado prudencial: Patrimônio de Referência, RWA (crédito, mercado e operacional), índices de Basileia, adicionais de capital principal e demais limites operacionais.",
    frequency: "Mensal",
    norms: ["Resoluções CMN nº 4.955, 4.957 e 4.958/2021", "Resolução BCB nº 69/2021", "Instrução Normativa BCB nº 81/2021"],
    concepts: [{ to: "/capital/rwa", label: "RWA e Índice de Basileia" }],
  },
  {
    id: "dli", code: "2062", acronym: "DLI",
    name: "Demonstrativo de Limites Operacionais Individuais",
    scope: "Detalha o cálculo dos limites monitorados para cada instituição individual — integrante ou não de conglomerado —, como patrimônio líquido e capital realizado mínimos, operações com partes relacionadas e limites de empréstimo e financiamento de TVM. Para cada limite: a situação da instituição, a exigência do BCB e a margem ou insuficiência.",
    frequency: "Mensal",
    norms: ["Instrução Normativa BCB nº 85/2021", "Resolução BCB nº 69/2021", "Resolução CMN nº 5.008/2022"],
    concepts: [],
  },
  {
    id: "drl", code: "2160", acronym: "DRL",
    name: "Demonstrativo de Risco de Liquidez",
    scope: "Controle da exposição ao risco de liquidez e, para as instituições do S1, o indicador LCR: estoque de ativos líquidos, saídas e entradas de caixa no cenário de estresse.",
    frequency: "Mensal (até o 10º dia útil do mês seguinte)",
    norms: ["Resolução CMN nº 4.401/2015", "Circular nº 3.749/2015", "Instrução Normativa BCB nº 399/2023", "Instrução Normativa BCB nº 755/2026"],
    concepts: [{ to: "/liquidez/lcr", label: "LCR" }],
  },
];

export default function Cadocs() {
  return (
    <>
      <h1>CADOCs: como os riscos chegam ao Banco Central</h1>
      <p className="lead">
        Cada métrica deste site vira, na prática, um arquivo XML enviado ao BCB pelo STA. Os
        documentos são identificados por um código do <strong>CADOC</strong> (Catálogo de Documentos).
        Saber qual conceito alimenta qual documento ajuda a entender por que os números precisam
        bater entre si.
      </p>

      <h2>Visão geral</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Código</th><th>Sigla</th><th>Documento</th><th>Periodicidade</th><th>Conceitos no site</th></tr></thead>
          <tbody>
            {DOCS.map((d) => (
              <tr key={d.id}>
                <td className="num">{d.code}</td>
                <td><a href={`#${d.id}`}><strong>{d.acronym}</strong></a></td>
                <td>{d.name}</td>
                <td>{d.frequency}</td>
                <td>{d.concepts.length ? d.concepts.map((c, i) => (
                  <span key={c.to}>{i > 0 && " · "}<Link to={c.to}>{c.label}</Link></span>
                )) : <span className="muted">limites individuais</span>}</td>
              </tr>
            ))}
            <tr>
              <td className="num">—</td>
              <td><a href="#rwasens"><strong>RWA SENS</strong></a></td>
              <td>Novo componente do RWA de risco de mercado (abordagem padronizada por sensibilidades)</td>
              <td>A partir de jan/2027</td>
              <td><Link to="/mercado/rwa-sens">Calculadora RWA SENS</Link></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Como os documentos se conectam</h2>
      <ul>
        <li><strong>Mercado:</strong> o DRM traz as exposições por fator e o IRRBB; o RWA de mercado entra no acompanhamento diário do DDR e no fechamento do DLO.</li>
        <li><strong>Capital:</strong> o DLO é o ponto de encontro — PR no numerador e a soma dos RWAs (crédito, mercado e operacional) no denominador.</li>
        <li><strong>Liquidez:</strong> o DRL leva o LCR e as informações de exposição ao risco de liquidez.</li>
        <li><strong>Individual vs. consolidado:</strong> DLO e DDR olham o conglomerado prudencial; o DLI olha cada instituição separadamente.</li>
      </ul>
      <Callout title="Por que isso importa">
        O mesmo número aparece em mais de um lugar: o RWA de mercado do dia, o RWA do mês e o índice de
        Basileia precisam ser consistentes entre DDR, DRM e DLO. Boa parte do trabalho de reporte é
        garantir essa conciliação.
      </Callout>

      <h2>Os documentos</h2>
      {DOCS.map((d) => (
        <div key={d.id} id={d.id} className="card">
          <h3 style={{ marginTop: 0 }}>{d.code} — {d.acronym}</h3>
          <p style={{ marginTop: 0 }}><strong>{d.name}</strong></p>
          <p>{d.scope}</p>
          <p style={{ marginBottom: 0, fontSize: 14 }}>
            <span className="muted">Periodicidade:</span> {d.frequency}<br />
            <span className="muted">Base normativa:</span> {d.norms.join(" · ")}
          </p>
        </div>
      ))}

      <h2 id="rwasens">RWA SENS: o que muda em 2027</h2>
      <p>
        O RWA SENS é a fase 3 da adoção local do <strong>FRTB</strong> (a revisão de Basileia III para a
        carteira de negociação), estabelecida pela <strong>Resolução BCB nº 470/2025</strong> e pela Resolução
        CMN nº 5.207/2025, com efeitos a partir de <strong>1º de janeiro de 2027</strong>.
      </p>
      <h3>O que ele substitui</h3>
      <p>
        Para instituições dos segmentos <strong>S1, S2 e S3</strong>, um único componente RWA<sub>SENS</sub> substitui
        os componentes atuais da parcela RWA<sub>MPAD</sub> baseados em <em>exposição</em>:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Hoje (até 2026)</th><th>A partir de 2027 (S1–S3)</th></tr></thead>
          <tbody>
            <tr><td>RWA<sub>JUR1</sub>, RWA<sub>JUR2</sub>, RWA<sub>JUR3</sub>, RWA<sub>JUR4</sub> (juros prefixados e cupons de moeda estrangeira, de índices de preços e de taxas de juros)</td><td rowSpan={4}>RWA<sub>SENS</sub></td></tr>
            <tr><td>RWA<sub>ACS</sub> (ações)</td></tr>
            <tr><td>RWA<sub>COM</sub> (mercadorias)</td></tr>
            <tr><td>RWA<sub>CAM</sub> (ouro, moeda estrangeira e variação cambial)</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        As instituições do S4 continuam com os procedimentos atuais. A parcela RWA<sub>MINT</sub> (modelo
        interno) é revogada: quem usa modelo interno passa para a abordagem padronizada. Os modelos internos do
        FRTB (IMA) ficam para a fase 4. A fase 2 (RWA<sub>DRC</sub>, risco de default na carteira de negociação)
        já vale desde julho de 2024.
      </p>

      <h3>De exposição para sensibilidade</h3>
      <p>
        Em vez de aplicar fatores sobre exposições, o banco calcula <strong>sensibilidades</strong> de cada
        instrumento a fatores de risco, agrupadas em sete classes: juros livres de risco (GIRR), spread de
        crédito não securitizado (CSR<sub>NSEC</sub>), securitizado (CSR<sub>SEC</sub>), carteira de correlação
        (CSR<sub>CTP</sub>), ações (EQ), mercadorias (COM) e moedas estrangeiras (FX). A fórmula é:
      </p>
      <Formula tex={String.raw`\text{RWA}_{\text{SENS}} = \frac{1}{F}\Big[\max\big(R_{\text{alta}},\, R_{\text{média}},\, R_{\text{baixa}}\big) + R_{\text{RAO}}\Big], \qquad F = 8\%`} />
      <Formula tex={String.raw`R_{\text{cenário}} = R_{\Delta} + R_{\text{Vega}} + R_{\text{Curvatura}}`} />
      <ul>
        <li><strong>Delta</strong>: efeito linear de choques nos fatores de risco (como a aproximação por duration da página de stress);</li>
        <li><strong>Vega</strong>: efeito de mudanças na volatilidade implícita em instrumentos não lineares (opções);</li>
        <li><strong>Curvatura</strong>: correção pela não linearidade — a diferença entre reprecificar o instrumento e extrapolar pelo Delta;</li>
        <li><strong>Três cenários de correlação</strong> (alta, média e baixa): vale o mais conservador, porque as correlações mudam no estresse;</li>
        <li><strong>RRAO</strong>: adicional para riscos residuais (por exemplo, subjacentes exóticos) não captados pelas sensibilidades.</li>
      </ul>
      <p>
        👉 Experimente na <Link to="/mercado/rwa-sens">calculadora do RWA SENS</Link> (Delta e Curvatura GIRR, Delta FX), que reproduz os vértices,
        ponderadores e correlações da norma.
      </p>
      <Callout title="Conexões com o que você já viu aqui">
        A ideia do Delta é a mesma do VaR paramétrico de carteira: sensibilidade × choque, agregada com
        correlações (<Link to="/mercado/carteira">Diversificação</Link>). Pegar o pior de três cenários de
        correlação é a lição da <Link to="/mercado/stress">quebra de correlação no stress test</Link>. E a
        Curvatura é o termo de convexidade que aparece no stress do prefixado.
      </Callout>
      <p className="muted" style={{ fontSize: 13 }}>
        A Resolução BCB nº 592/2026 fez ajustes técnicos no RWA SENS (como a fórmula da Curvatura e ponderadores
        de spread de crédito), também com efeitos em 2027.
      </p>

      <p className="muted" style={{ fontSize: 13, marginTop: 32 }}>
        Fontes: página “Leiaute de arquivos e base normativa” do BCB (nomes, códigos e normas), instruções de
        preenchimento do DLI 2062 e Voto BCB nº 42/2025 (RWA SENS). Prazos e leiautes mudam com frequência —
        sempre confira a versão vigente no site do BCB.
      </p>
    </>
  );
}
