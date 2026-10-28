const TERMS: [string, string][] = [
  ["Accrual (curva)", "Apreçamento pela taxa efetiva da operação: o valor cresce com o tempo e não reage ao mercado."],
  ["ACP", "Adicional de Capital Principal: conservação, contracíclico e sistêmico. Dentro dele, a distribuição de lucro é limitada por quartil."],
  ["ASF / RSF", "Available / Required Stable Funding: numerador e denominador do NSFR."],
  ["Ativo com problema de recuperação", "Estágio 3 da Res. CMN 4.966: atraso acima de 90 dias ou indício de que a obrigação não será integralmente paga."],
  ["Aumento significativo do risco de crédito", "Gatilho do estágio 2: piora da qualidade de crédito desde a originação, presumida com atraso acima de 30 dias."],
  ["Backtesting", "Comparação entre perdas realizadas e o VaR previsto para validar o modelo."],
  ["BI / BIC", "Indicador de Negócios e Indicador de Negócios Ponderado (Res. BCB 356): base do RWA de risco operacional, com coeficientes de 12%, 15% e 18%."],
  ["Buffer de conservação", "Colchão de 2,5% do RWA em CET1 acima do mínimo; descumpri-lo restringe dividendos."],
  ["CADOC", "Catálogo de Documentos do BCB: identifica cada documento enviado pelo STA (ex.: 2060 = DRM)."],
  ["Carteira bancária", "Banking book: tudo o que não está na carteira de negociação (crédito, captação, ALM, hedges)."],
  ["Carteira de negociação", "Trading book: instrumentos com finalidade de negociação, sem impedimento de venda e marcados a mercado no resultado."],
  ["Carteiras C1 a C5", "Classificação da Res. BCB 352 pelo tipo de garantia, usada nos pisos de provisão para perda incorrida."],
  ["CCF", "Fator de conversão de crédito: transforma exposições fora do balanço em exposição equivalente."],
  ["CEM", "Current Exposure Method: EAD de derivativos = exposição corrente + add-on sobre o nocional; alternativa do S2 ao S4."],
  ["CET1", "Capital Principal: ações ordinárias e lucros retidos, a camada de maior qualidade."],
  ["CGD", "Contrato Global de Derivativos: contrato-mãe usado no Brasil para derivativos de balcão, equivalente ao ISDA."],
  ["CPR / SMM", "Taxa anual de pré-pagamento e sua equivalente mensal: SMM = 1 − (1 − CPR)^(1/12)."],
  ["CS01", "Perda da carteira se todos os spreads de crédito abrirem 1 bp; o análogo do DV01 para spread."],
  ["CSA", "Credit Support Annex: anexo de garantias do ISDA que define margem de variação, threshold, MTA e garantias elegíveis."],
  ["CSRBB", "Risco de spread de crédito na carteira bancária: perda de valor por aumento do prêmio exigido pelo emissor, com os juros parados."],
  ["Custo amortizado (CA)", "Categoria da Res. CMN 4.966 para ativos mantidos para receber fluxos e que passam no SPPJ; valor na curva."],
  ["CVA", "Credit Valuation Adjustment: valor de mercado do risco de default da contraparte num derivativo."],
  ["DDR (2011)", "Demonstrativo Diário de Acompanhamento das Parcelas de Requerimento de Capital e dos Limites Operacionais."],
  ["DLI (2062)", "Demonstrativo de Limites Operacionais Individuais: limites de cada instituição individual."],
  ["DLO (2061)", "Demonstrativo de Limites Operacionais: PR, RWA e índices de capital do conglomerado prudencial."],
  ["DRL (2160)", "Demonstrativo de Risco de Liquidez: exposição ao risco de liquidez e LCR."],
  ["DRM (2060)", "Demonstrativo de Risco de Mercado: exposições por fator de risco, IRRBB e RWA de mercado."],
  ["Duration", "Prazo médio dos fluxos ponderado pelo valor presente; mede a sensibilidade do preço aos juros."],
  ["EAD", "Exposure at Default: exposição no momento do default."],
  ["EE / EPE / EEPE", "Exposição esperada em cada data; sua média no prazo; e a média no 1º ano da EE não decrescente (base do EAD no método interno)."],
  ["EL", "Expected Loss: perda esperada = PD × LGD × EAD; coberta por provisões e preço."],
  ["ES", "Expected Shortfall: perda média além do VaR. Medida coerente, usada no FRTB a 97,5%."],
  ["EVE", "Economic Value of Equity: VP dos ativos menos VP dos passivos da carteira bancária."],
  ["EWI", "Indicadores de alerta antecipado do plano de contingência de liquidez, com limites de alerta e de contingência."],
  ["FPR", "Fator de ponderação de risco aplicado à EAD para obter o RWA."],
  ["FRTB", "Fundamental Review of the Trading Book: revisão de Basileia do capital de mercado."],
  ["FTP", "Preço de transferência de recursos: taxa pela qual a tesouraria cobra o funding dos ativos e remunera os passivos das áreas de negócio."],
  ["GIRR", "General Interest Rate Risk: classe de risco de juros livres de risco no RWA SENS."],
  ["Grande exposição", "Exposição a um cliente ou grupo econômico de 10% do Nível I ou mais; o limite individual é de 25% (Res. CMN 4.677)."],
  ["HHI", "Índice de Herfindahl-Hirschman: soma dos quadrados das participações; mede concentração (1/n com n fontes iguais)."],
  ["Horizonte de sobrevivência", "Prazo até o caixa acumulado (colchão + entradas − saídas) ficar negativo num cenário de estresse."],
  ["HQLA", "High Quality Liquid Assets: ativos líquidos de alta qualidade, numerador do LCR."],
  ["ICAAP", "Processo interno de avaliação da adequação de capital (Pilar 2): riscos relevantes, plano de capital, estresse e contingência."],
  ["ILM", "Multiplicador de Perdas Internas: ajusta o capital de risco operacional pelo histórico de perdas; vale 1 quando LC = BIC."],
  ["IM", "Margem inicial: garantia que cobre a variação potencial do MTM durante o MPOR, segregada e calculada por modelos como o ISDA SIMM."],
  ["IRB", "Internal Ratings-Based: abordagem em que o banco estima PD (e às vezes LGD/EAD)."],
  ["IRRBB", "Interest Rate Risk in the Banking Book: risco de juros da carteira bancária."],
  ["LCR", "Liquidity Coverage Ratio: HQLA ÷ saídas líquidas em 30 dias de estresse ≥ 100%."],
  ["LGD", "Loss Given Default: percentual da exposição perdido em caso de default."],
  ["MPOR", "Margin period of risk: tempo entre a última margem paga e o encerramento das posições após o default (10 dias úteis no bilateral)."],
  ["MTA", "Minimum transfer amount: menor chamada de margem que é efetivamente transferida."],
  ["MTM", "Mark-to-market: reavaliação pelo preço de mercado do dia (valor justo)."],
  ["NICA", "Net independent collateral amount: colateral independente do MTM (valor independente, margem inicial) líquido."],
  ["NII", "Net Interest Income: margem financeira (receitas menos despesas de juros)."],
  ["NMD", "Non-Maturity Deposits: depósitos sem vencimento, cuja duração é modelada comportamentalmente."],
  ["NSFR", "Net Stable Funding Ratio: ASF ÷ RSF ≥ 100%, horizonte de 1 ano."],
  ["PD", "Probability of Default: probabilidade de inadimplência em 1 ano."],
  ["Perda esperada (PE)", "Provisão da Res. CMN 4.966: PD × LGD × EAD descontados, em 12 meses (estágio 1) ou na vida inteira (estágios 2 e 3)."],
  ["PFE", "Potential future exposure: quantil alto (95% ou 97,5%) da exposição em cada data futura."],
  ["PR", "Patrimônio de Referência: capital regulatório total (Nível I + Nível II)."],
  ["Razão de alavancagem", "Nível I sobre a exposição total sem ponderação de risco; mínimo de 3% (Res. CMN 4.615)."],
  ["RC", "Replacement cost: custo de reposição de um conjunto de derivativos se a contraparte quebrasse hoje."],
  ["Redesconto intradia", "Liquidez que o BCB fornece durante o dia, contra títulos públicos, para a liquidação de pagamentos na conta de reservas."],
  ["Risco de base", "Risco de ativos e passivos indexados a taxas diferentes (CDI, TR, poupança, IPCA) se moverem em proporções diferentes."],
  ["RRAO", "Residual Risk Add-On: adicional do RWA SENS para riscos residuais (ex.: subjacentes exóticos)."],
  ["Run-off", "Taxa de saída de um passivo no cenário de estresse do LCR."],
  ["RWA", "Risk-Weighted Assets: ativos ponderados pelo risco; denominador dos índices de capital."],
  ["RWA SENS", "Componente do RWA de mercado por sensibilidades (Delta, Vega, Curvatura), vigente para S1–S3 a partir de 2027."],
  ["SA-CCR", "Standardised Approach for Counterparty Credit Risk: EAD de derivativos = 1,4 × (RC + PFE), com add-ons supervisórios por classe."],
  ["SPPJ", "Teste de Somente Pagamento de Principal e Juros (SPPI no IFRS 9), usado na classificação contábil."],
  ["STA", "Sistema de Transferência de Arquivos do BCB, pelo qual os documentos são enviados."],
  ["Stop accrual", "Suspensão do reconhecimento de receita de juros enquanto o ativo tem problema de recuperação de crédito."],
  ["Threshold", "Exposição que uma parte aceita ter, num CSA, antes de exigir garantia."],
  ["TR", "Taxa Referencial: corrige a poupança, o FGTS e parte do crédito imobiliário; só é positiva com a Selic em níveis altos."],
  ["VaR", "Value at Risk: quantil da distribuição de perdas para um nível de confiança e horizonte."],
  ["VJORA", "Valor justo em outros resultados abrangentes: MTM no balanço, juros no resultado e marcação no PL."],
  ["VJR", "Valor justo no resultado: MTM com toda a variação de valor no resultado."],
  ["VM", "Margem de variação: garantia que acompanha o MTM atual do derivativo."],
  ["XVA", "Família de ajustes ao valor de derivativos: CVA, DVA, FVA, MVA, KVA."],
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
