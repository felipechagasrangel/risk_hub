const TERMS: [string, string][] = [
  ["ASF / RSF", "Available / Required Stable Funding: numerador e denominador do NSFR."],
  ["Backtesting", "Comparação entre perdas realizadas e o VaR previsto para validar o modelo."],
  ["Buffer de conservação", "Colchão de 2,5% do RWA em CET1 acima do mínimo; descumpri-lo restringe dividendos."],
  ["CADOC", "Catálogo de Documentos do BCB: identifica cada documento enviado pelo STA (ex.: 2060 = DRM)."],
  ["CCF", "Fator de conversão de crédito: transforma exposições fora do balanço em exposição equivalente."],
  ["CET1", "Capital Principal: ações ordinárias e lucros retidos, a camada de maior qualidade."],
  ["DDR (2011)", "Demonstrativo Diário de Acompanhamento das Parcelas de Requerimento de Capital e dos Limites Operacionais."],
  ["DLI (2062)", "Demonstrativo de Limites Operacionais Individuais: limites de cada instituição individual."],
  ["DLO (2061)", "Demonstrativo de Limites Operacionais: PR, RWA e índices de capital do conglomerado prudencial."],
  ["DRL (2160)", "Demonstrativo de Risco de Liquidez: exposição ao risco de liquidez e LCR."],
  ["DRM (2060)", "Demonstrativo de Risco de Mercado: exposições por fator de risco, IRRBB e RWA de mercado."],
  ["Duration", "Prazo médio dos fluxos ponderado pelo valor presente; mede a sensibilidade do preço aos juros."],
  ["EAD", "Exposure at Default: exposição no momento do default."],
  ["EL", "Expected Loss: perda esperada = PD × LGD × EAD; coberta por provisões e preço."],
  ["ES", "Expected Shortfall: perda média além do VaR. Medida coerente, usada no FRTB a 97,5%."],
  ["EVE", "Economic Value of Equity: VP dos ativos menos VP dos passivos da carteira bancária."],
  ["FPR", "Fator de ponderação de risco aplicado à EAD para obter o RWA."],
  ["FRTB", "Fundamental Review of the Trading Book: revisão de Basileia do capital de mercado."],
  ["GIRR", "General Interest Rate Risk: classe de risco de juros livres de risco no RWA SENS."],
  ["HQLA", "High Quality Liquid Assets: ativos líquidos de alta qualidade, numerador do LCR."],
  ["IRB", "Internal Ratings-Based: abordagem em que o banco estima PD (e às vezes LGD/EAD)."],
  ["IRRBB", "Interest Rate Risk in the Banking Book: risco de juros da carteira bancária."],
  ["LCR", "Liquidity Coverage Ratio: HQLA ÷ saídas líquidas em 30 dias de estresse ≥ 100%."],
  ["LGD", "Loss Given Default: percentual da exposição perdido em caso de default."],
  ["NII", "Net Interest Income: margem financeira (receitas menos despesas de juros)."],
  ["NMD", "Non-Maturity Deposits: depósitos sem vencimento, cuja duração é modelada comportamentalmente."],
  ["NSFR", "Net Stable Funding Ratio: ASF ÷ RSF ≥ 100%, horizonte de 1 ano."],
  ["PD", "Probability of Default: probabilidade de inadimplência em 1 ano."],
  ["PR", "Patrimônio de Referência: capital regulatório total (Nível I + Nível II)."],
  ["RRAO", "Residual Risk Add-On: adicional do RWA SENS para riscos residuais (ex.: subjacentes exóticos)."],
  ["Run-off", "Taxa de saída de um passivo no cenário de estresse do LCR."],
  ["RWA", "Risk-Weighted Assets: ativos ponderados pelo risco; denominador dos índices de capital."],
  ["RWA SENS", "Componente do RWA de mercado por sensibilidades (Delta, Vega, Curvatura), vigente para S1–S3 a partir de 2027."],
  ["STA", "Sistema de Transferência de Arquivos do BCB, pelo qual os documentos são enviados."],
  ["VaR", "Value at Risk: quantil da distribuição de perdas para um nível de confiança e horizonte."],
];

export default function Glossary() {
  return (
    <>
      <h1>Glossário</h1>
      <p className="lead">As siglas que aparecem ao longo do site, incluindo os documentos regulatórios.</p>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            {TERMS.map(([t, d]) => (
              <tr key={t}><td style={{ fontWeight: 600, width: 180, verticalAlign: "top" }}>{t}</td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
