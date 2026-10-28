# Fontes regulatórias

De onde vêm os parâmetros e as regras usados no código. Normas mudam: confira sempre a
versão vigente no site do Banco Central.

## RWA SENS — `src/backend/core/rwa_sens.py`

Resolução BCB nº 470/2025 (texto anexo ao
[Voto BCB nº 42/2025](https://normativos.bcb.gov.br/Votos/BCB/202542/Voto_do_BC_42_2025.pdf)),
vigente a partir de 1º/1/2027 para S1, S2 e S3.

| Tema | Dispositivo | No código |
|---|---|---|
| Fórmula do RWA SENS, F = 8% | art. 3º | `F` |
| Vértices GIRR (1 a 7.560 DU) | art. 9º | `VERTICES_DU` |
| Sensibilidade GIRR (+1 bp / 0,0001) | art. 16 | DV01 / 0,0001 |
| Ponderadores GIRR — real | Anexo I | `RW_VERTEX_BRL` |
| Ponderadores GIRR — demais moedas | Anexo I-A | `RW_VERTEX_OTHER` |
| Fator de categoria 0,7071 | art. 30, VII | `category_factor` |
| Correlação entre vértices | Anexo VII, art. 32 | `_ANNEX_VII` |
| Cenários alta e baixa | arts. 38, 39, 49, 50 | `stress_correlation` |
| Agregação entre categorias, γ GIRR = 50% | arts. 40, 42 | `_class_requirement` |
| Delta FX: fator, sensibilidade, categoria | arts. 15, 20, 28 | `fx_delta` |
| Ponderador FX = 15%, γ FX = 60% | arts. 30 (VI), 48 | `RW_FX`, `GAMMA_FX` |
| Soma dos Deltas das classes | art. 51 | `compute` |
| Curvatura GIRR: fator e sensibilidade | arts. 83, 90 | `cvr` |
| CVR⁺ e CVR⁻, choque de 1,7% | arts. 95–98 | `RW_CURV_GIRR` |
| Agregação da Curvatura, ρ = 99,8%, γ = 25% | arts. 100–114 | `_curvature_category`, `_curvature_class` |

O sinal do termo linear do CVR⁻ segue Basileia (MAR21.5); a Resolução BCB nº 592/2026 corrigiu
esse sinal e também ajustou ponderadores de spread de crédito e os choques de IRRBB de moedas
estrangeiras.

## Fundamentos — `src/backend/core/valuation.py` e `src/frontend/src/pages/fundamentals/`

- Resolução CMN nº 4.966/2021 (IFRS 9): custo amortizado, VJORA e VJR por modelo de negócio e teste de SPPJ;
  derivativos a valor justo e contabilidade de hedge (antes, Circular nº 3.082/2002);
  substitui as categorias da Circular nº 3.068/2001.
- CPC 46 (IFRS 13): níveis 1, 2 e 3 de valor justo.
- Resolução CMN nº 4.277/2013 (alterada pela nº 4.389/2014): apreçamento prudente e ajustes prudenciais;
  divulgação no Pilar 3, tabela PV1.
- Resolução nº 4.557/2017, art. 26, e Resolução BCB nº 111/2021 (arts. 5º, 6º, 8º, 9º e transferências
  internas de risco): fronteira entre carteira de negociação e bancária, conforme o
  [FAQ do BCB, versão 2.0](https://www.bcb.gov.br/content/estabilidadefinanceira/regulacao_prudencial_docs/FAQ_FRTB_Fase1_Jul22.pdf).
  A Resolução BCB nº 470/2025 revoga apenas o art. 20 da nº 111.

## Perda esperada — `src/backend/core/credit_loss.py`

- Resolução CMN nº 4.966/2021 e Resolução BCB nº 352/2023, vigentes desde 1º/1/2025
  ([texto da Res. BCB 352](https://www.legisweb.com.br/legislacao/?id=452307)).
- Estágios: aumento significativo presumido com atraso acima de 30 dias (art. 38, § 7º; até 60 dias com
  evidência, § 8º); ativo com problema de recuperação com atraso acima de 90 dias (art. 3º, I); falência de
  pessoa jurídica com 100% de provisão (art. 77).
- Carteiras C1 a C5 (art. 81) e níveis mínimos para perda incorrida em ativos inadimplidos (art. 76 e
  Anexo I), aplicáveis às instituições do art. 1º, II; a provisão é o maior entre a perda esperada e o piso.
- Simplificações: PD anual constante, LGD constante, cenários como multiplicadores da PD e critério de piora
  da PD por razão simples (cada instituição define o seu).

## SA-CCR — `src/backend/core/saccr.py`

- Basileia CRE52: EAD = 1,4 × (RC + PFE); duration supervisória, delta supervisório (Black com vol de 15%
  em câmbio e 50% em juros), fator de prazo com e sem margem, três faixas de juros com correlações de 70% e
  30%, fatores supervisórios de 0,5% (juros) e 4% (câmbio), multiplicador com piso de 5%.
- Circular nº 3.904/2018: SA-CCR obrigatório no S1, CEM permitido do S2 ao S4; compilações indicam a
  incorporação à Resolução BCB nº 229/2022 a partir de julho de 2023 (não confirmado em fonte oficial).
- CEM com fatores de Basileia e netting pela NGR. Simplificações: um conjunto de netting, sem haircut de
  colateral, sem as classes de crédito, ações e mercadorias no cálculo.

## Curvas — `src/backend/core/curves.py`

- DI1: PU = 100.000/(1 + taxa)^(DU/252); a taxa negociada é a taxa zero do vencimento (sem bootstrapping),
  com o CDI no vértice de 1 DU.
- Interpolação flat-forward 252 (termo constante entre vértices, extrapolação pelo último termo), comparada
  com linear nas taxas e spline cúbica natural; a ANBIMA usa Svensson na ETTJ de títulos públicos.
- Cupom cambial pela paridade coberta, 1 + c·DC/360 = (1 + pré)^(DU/252)·S/F; cupom sujo com a PTAX de D−1;
  FRC como cupom a termo entre vencimentos. Dados de mercado padrão ilustrativos; DU e DC informados à mão,
  sem calendário de feriados.

## Sensibilidades — `src/backend/core/sensitivities.py`

- Curvas pré e cupom de IPCA em convenção exponencial base 252; cupom cambial linear base 360 (DC ≈ anos × 365).
- Dólar a termo F = S·(1+pré)^(DU/252)/(1+cupom·DC/360); call de dólar por Black sobre o termo.
- NTN-F com cupom de 10% a.a. e NTN-B com 6% a.a., semestrais, sobre o valor de face e o VNA corrente.
- DV01 por vértice com interpolação linear (choque triangular); delta, gamma e vega por diferenças
  centrais de 1% e 1 ponto; P&L explain por expansão de Taylor de 2ª ordem no dólar.

## XVA — `src/backend/core/xva.py`

- Modelos: GBM (solução exata) e Hull-White de 1 fator com curva flat (transição exata do processo de
  Ornstein-Uhlenbeck e zero-cupom fechado); o HJM é apresentado só conceitualmente.
- Exposição: EE, ENE, PFE, EPE e EEPE como no método de modelos internos de Basileia (CRE53), com
  EAD = 1,4 × EEPE; MPOR de 10 dias úteis para derivativos bilaterais.
- CSA: chamadas de margem com threshold, MTA, arredondamento, valor independente e atraso de entrega
  (`margin_calls`); regras de margem BCBS-IOSCO para derivativos não compensados citadas no texto.
- CVA unilateral com intensidade constante λ = s/(1 − R), sem wrong-way risk; DVA simétrico; capital de
  CVA por BA-CVA e SA-CVA (MAR50) citado apenas no texto.
- Swap pré × CDI com fluxos periódicos em fórmula fechada no Hull-White; cotação com e sem CSA convertendo
  o XVA em taxa por ∂V/∂K; estudo de frequência de verificação do CSA × passo da simulação, com a data
  de apuração t − MPOR arredondada na grade (`lookback_index`).
- FVA (FCA/FBA) e MVA com margem inicial paramétrica (VaR de 10 dias a 99% sobre o delta), em lugar do
  ISDA SIMM.

## CADOCs — `src/frontend/src/pages/Cadocs.tsx`

- [Leiaute de arquivos e base normativa](https://www.bcb.gov.br/estabilidadefinanceira/leiautedocumentoscrd):
  nomes, códigos e normas do DDR (2011), DRM (2060), DLO (2061), DLI (2062) e DRL (2160).
- Instruções de preenchimento do DLI 2062 (Departamento de Monitoramento do Sistema Financeiro).
- IN BCB nº 101/2021 (DRM) e IN BCB nº 399/2023 (DRL): periodicidade e prazos.

## IRRBB — `src/backend/core/irrbb.py`

- BCBS d368 e Circular nº 3.876/2018: seis cenários de choque e teste de outlier de 15% do Nível I.
- Presets de USD e EUR seguem a calibração original do BCBS; o Anexo I foi substituído pela
  Resolução BCB nº 592/2026.

## Capital — `src/backend/core/capital.py`

- Resolução CMN nº 4.958/2021: RWA, mínimos de capital e adicionais.
- Fórmula IRB de Basileia (CRE31), conferida contra o valor de referência PD 1%, LGD 45%, M 2,5 → FPR ≈ 92,3%.

## Composição do PR e alavancagem — `src/backend/core/capital_structure.py`

- Resolução CMN nº 4.955/2021: composição do PR (Capital Principal, Complementar e Nível II) e ajustes
  prudenciais, com os limites de 10% (individual) e 15% (agregado) para créditos tributários de
  diferenças temporárias e participações relevantes; o que fica abaixo dos limites pondera a 250%.
- Resolução CMN nº 4.615/2017: Razão de Alavancagem mínima de 3%. A exposição de derivativos usa
  1,4 × (RC + PFE), como no SA-CCR; a medida é simplificada (sem compensações de SFT).

## Gap de liquidez e FTP — `src/backend/core/liquidity_mgmt.py`

- Faixas de prazo e cenário de estresse inspirados no DLI 2062; percentuais de renovação e de
  recebimento são ilustrativos, não regulatórios.
- FTP de base + prêmio de liquidez por prazo: prática de mercado, sem norma específica.

## IRRBB comportamental — `src/backend/core/irrbb_behavioral.py`

- BCBS d368 (tabela 2): tetos de núcleo e prazo médio de depósitos sem vencimento por segmento
  (90%/5 anos, 70%/4,5 anos, 50%/4 anos), recepcionados pela Circular nº 3.876/2018.
- Pré-pagamento em CPR/SMM com sensibilidade linear ao incentivo: simplificação didática.

## Capital: risco operacional, adicionais, planejamento e grandes exposições — `src/backend/core/capital_mgmt.py`

- Resolução BCB nº 356/2023 (em vigor desde 1º/1/2025): RWAOPAD = BIC × ILM / F; componentes ILDC, SC e FC
  (arts. 5º a 8º); coeficientes de 12%, 15% e 18% com faixas de R$ 5 bi e R$ 150 bi (art. 4º); ILM para S1 e
  S2 com LC = 6 × média anual de perdas de dez anos (arts. 10 e 11); ILM = 1 para S3 (opcional) e S4.
- Resolução CMN nº 4.958/2021: mínimos de capital, Adicionais de Capital Principal e restrição à
  distribuição de resultados. As faixas por quartil do ACP seguem o arcabouço de Basileia (RBC30).
- Resolução CMN nº 4.557/2017: plano de capital, testes de estresse e ICAAP. A projeção do laboratório é
  uma simplificação (ROE sobre o Capital Principal, perdas como % do RWA inicial).
- Resolução CMN nº 4.677/2018 (com a redação da Res. CMN nº 5.077/2023): limite de 25% do Nível I por
  cliente ou grupo, exposição concentrada a partir de 10% e limite agregado de 600%.

## Concentração de funding, contingência e intradiária — `src/backend/core/liquidity_monitoring.py`

- Resolução CMN nº 4.557/2017: plano de contingência de liquidez. Indicadores e limites do laboratório
  são ilustrativos.
- BCBS 248 (2013), *Monitoring tools for intraday liquidity management*: maior uso de liquidez
  intradiária e cenários de estresse. O redesconto intradia segue as regras do BCB para a conta de reservas.

## Indexadores, risco de base e ΔNII dinâmico — `src/backend/core/irrbb_indexers.py`

- Lei nº 12.703/2012: regra da poupança (0,5% a.m. + TR com Selic acima de 8,5%; 70% da Selic + TR abaixo).
- A TR é aproximada por 0,35 × (Selic − 8%), com piso zero; a metodologia oficial usa a TBF e um redutor.
- CDI aproximado por Selic − 0,10 p.p.

## ΔEVE regulatório — `src/backend/core/irrbb_regulatory.py`

- Basel Framework SRP31: agregação só das perdas entre moedas (SRP31.129), piso pós-choque a critério do
  supervisor e não maior que zero (SRP31.93), escolha sobre margens comerciais (SRP31.100).
- O piso de −100 bps subindo 5 bps por ano e o peso de 50% nos ganhos são exemplos da EBA (EBA/GL/2018/02),
  não regras brasileiras.

## CSRBB — `src/backend/core/csrbb.py`

- BCBS d368 e SRP31: o CSRBB deve ser monitorado e avaliado junto com o IRRBB. Os choques de spread por
  rating do laboratório são ilustrativos.

## IRRBB comportamental (resgate antecipado) — `src/backend/core/irrbb_behavioral.py`

- Resgate antecipado de CDB sensível ao incentivo de taxa: simplificação didática da opcionalidade do passivo.
