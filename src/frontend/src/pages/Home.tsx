import { Link } from "react-router-dom";

const AREAS = [
  {
    title: "Fundamentos",
    to: "/fundamentos/aprecamento",
    text: "Quanto vale cada posição? Apreçamento na curva e a mercado, categorias contábeis, hierarquia de preços e a fronteira entre carteira de negociação e carteira bancária.",
  },
  {
    title: "Risco de Mercado",
    to: "/mercado/var",
    text: "Quanto posso perder com movimentos de preços, taxas e moedas? VaR paramétrico, histórico e Monte Carlo, Expected Shortfall, backtesting, diversificação, stress testing e o capital de mercado por sensibilidades (RWA SENS).",
  },
  {
    title: "Capital",
    to: "/capital/rwa",
    text: "Quanto capital próprio o banco precisa ter para absorver perdas inesperadas? RWA, fatores de ponderação, Índice de Basileia, buffers e a fórmula IRB.",
  },
  {
    title: "Liquidez",
    to: "/liquidez/lcr",
    text: "O banco sobrevive a uma corrida de 30 dias? E sua estrutura de funding é estável em 1 ano? LCR, HQLA, run-off e NSFR.",
  },
  {
    title: "IRRBB",
    to: "/irrbb",
    text: "Como a variação dos juros afeta o valor econômico (ΔEVE) e a margem financeira (ΔNII) da carteira bancária? Gap de repricing e os 6 cenários de choque de Basileia.",
  },
];

export default function Home() {
  return (
    <>
      <h1>Risk Hub</h1>
      <p className="lead">
        Um laboratório para entender — de verdade — os principais conceitos de gestão de riscos
        de um banco. Cada página traz a intuição, a fórmula e um experimento interativo calculado
        por uma API em Python.
      </p>

      <div className="grid-2">
        {AREAS.map((a) => (
          <Link key={a.to} to={a.to} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ height: "100%", margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>{a.title} →</h3>
              <p style={{ margin: 0, color: "var(--text-2)" }}>{a.text}</p>
            </div>
          </Link>
        ))}
      </div>

      <h2>Como usar</h2>
      <ol>
        <li><strong>Leia a intuição</strong> antes da fórmula: toda métrica responde a uma pergunta simples.</li>
        <li><strong>Mexa nos parâmetros</strong> do laboratório e tente prever o resultado antes de ver.</li>
        <li><strong>Leia os “O que observar”</strong>: são os experimentos que revelam as limitações de cada métrica.</li>
      </ol>

      <h2>O mapa dos riscos</h2>
      <p>
        Bancos transformam prazos e riscos: captam curto e emprestam longo, assumem risco de crédito,
        mantêm carteiras de títulos. Isso gera quatro perguntas centrais:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Pergunta</th><th>Risco</th><th>Métricas</th><th>Horizonte típico</th></tr></thead>
          <tbody>
            <tr><td>Quanto posso perder se os preços se moverem?</td><td>Mercado</td><td>VaR, ES, stress</td><td>1–10 dias</td></tr>
            <tr><td>Tenho colchão suficiente para perdas inesperadas?</td><td>Capital (solvência)</td><td>RWA, Índice de Basileia</td><td>1 ano</td></tr>
            <tr><td>Tenho caixa se todos quiserem sacar?</td><td>Liquidez</td><td>LCR, NSFR</td><td>30 dias / 1 ano</td></tr>
            <tr><td>Juros sobem: perco valor ou margem?</td><td>IRRBB</td><td>ΔEVE, ΔNII</td><td>Vida do balanço / 12 meses</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Os cálculos são simplificações didáticas dos padrões de Basileia (e de sua implementação no
        Brasil pelo Banco Central). Não use para fins regulatórios.
      </p>
    </>
  );
}
