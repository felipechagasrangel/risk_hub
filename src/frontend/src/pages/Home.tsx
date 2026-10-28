import { Link } from "react-router-dom";
import { Icon } from "../components/icons";
import { NAV } from "../nav";

const DESCRIPTIONS: Record<string, string> = {
  "Fundamentos": "Quanto vale cada posição? Construção da curva de juros (DI1 e cupom cambial), na curva e a mercado, derivativos, contabilidade, hierarquia de preços e a fronteira entre as carteiras.",
  "Risco de Mercado": "Quanto posso perder com preços, taxas e moedas? Sensibilidades por fator de risco, VaR, Expected Shortfall, backtesting, diversificação, stress e o capital por sensibilidades.",
  "XVA": "Quanto custa o risco de contraparte? Monte Carlo com GBM e Hull-White, exposição e PFE, CVA, DVA, FVA e MVA — com o código Python de cada cálculo.",
  "Risco de Capital": "Quanto capital próprio é preciso para absorver perdas inesperadas? RWA, Índice de Basileia, buffers e a fórmula IRB.",
  "Risco de Crédito": "Quanto se espera perder com o crédito concedido? Perda esperada da Res. CMN 4.966: estágios, PD de 12 meses e da vida inteira, cenários e o piso de perda incorrida.",
  "Risco de Liquidez": "O banco sobrevive a 30 dias de estresse? Sua estrutura de funding é estável em 1 ano? LCR, HQLA e NSFR.",
  "IRRBB": "Como os juros afetam o valor (ΔEVE) e a margem (ΔNII) da carteira bancária, nos seis cenários de choque de Basileia.",
  "Referência": "Os documentos regulatórios (CADOCs) em que cada métrica chega ao BCB e o glossário das siglas.",
};

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Risk Hub</h1>
        <p className="lead">
          Um laboratório para entender — de verdade — os principais riscos de um banco. Cada página traz a
          intuição, a fórmula com todos os termos definidos e um experimento interativo calculado por uma API em Python.
        </p>
        <div className="hero-actions">
          <Link to="/fundamentos/curva-mtm" className="button-primary">Começar pelos fundamentos <Icon name="arrowRight" size={16} /></Link>
          <Link to="/mercado/var" className="button-secondary">Ir direto ao VaR</Link>
        </div>
      </section>

      <div className="area-grid">
        {NAV.map((g) => (
          <div key={g.group} className="area-card" style={{ ["--tone" as string]: g.tone }}>
            <h3><Icon name={g.icon} />{g.group}</h3>
            <p>{DESCRIPTIONS[g.group]}</p>
            <ul>
              {g.items.map((i) => <li key={i.to}><Link to={i.to}>{i.label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>

      <h2>Como usar</h2>
      <div className="steps">
        <div className="step"><div className="step-number">1</div><p><strong>Leia a intuição</strong> antes da fórmula: toda métrica responde a uma pergunta simples.</p></div>
        <div className="step"><div className="step-number">2</div><p><strong>Mexa nos parâmetros</strong> do laboratório e tente prever o resultado antes de ver.</p></div>
        <div className="step"><div className="step-number">3</div><p><strong>Siga o “O que observar”</strong>: são os experimentos que revelam as limitações de cada métrica.</p></div>
      </div>

      <h2>O mapa dos riscos</h2>
      <p>
        Bancos transformam prazos e riscos: captam curto e emprestam longo, assumem risco de crédito,
        mantêm carteiras de títulos. Isso gera quatro perguntas centrais:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Pergunta</th><th>Risco</th><th>Métricas</th><th>Horizonte típico</th></tr></thead>
          <tbody>
            <tr><td>Quanto posso perder se os preços se moverem?</td><td>Mercado</td><td>VaR, ES, stress, RWA SENS</td><td>1–10 dias</td></tr>
            <tr><td>Tenho colchão suficiente para perdas inesperadas?</td><td>Capital (solvência)</td><td>RWA, Índice de Basileia</td><td>1 ano</td></tr>
            <tr><td>Tenho caixa se todos quiserem sacar?</td><td>Liquidez</td><td>LCR, NSFR</td><td>30 dias / 1 ano</td></tr>
            <tr><td>Juros sobem: perco valor ou margem?</td><td>IRRBB</td><td>ΔEVE, ΔNII</td><td>Vida do balanço / 12 meses</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
