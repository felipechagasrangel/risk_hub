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

## Apreçamento e carteiras — `src/backend/core/valuation.py` e `pages/fundamentals/ValuationPage.tsx`

- Resolução CMN nº 4.966/2021 (IFRS 9): custo amortizado, VJORA e VJR por modelo de negócio e teste de SPPJ;
  substitui as categorias da Circular nº 3.068/2001.
- CPC 46 (IFRS 13): níveis 1, 2 e 3 de valor justo.
- Resolução CMN nº 4.277/2013 (alterada pela nº 4.389/2014): apreçamento prudente e ajustes prudenciais;
  divulgação no Pilar 3, tabela PV1.
- Resolução nº 4.557/2017, art. 26, e Resolução BCB nº 111/2021 (arts. 5º, 6º, 8º, 9º e transferências
  internas de risco): fronteira entre carteira de negociação e bancária, conforme o
  [FAQ do BCB, versão 2.0](https://www.bcb.gov.br/content/estabilidadefinanceira/regulacao_prudencial_docs/FAQ_FRTB_Fase1_Jul22.pdf).
  A Resolução BCB nº 470/2025 revoga apenas o art. 20 da nº 111.

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
