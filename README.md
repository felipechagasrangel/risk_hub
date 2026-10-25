# Risk Hub

Site didático para aprender conceitos de risco bancário: **mercado** (VaR, ES, backtesting, stress testing,
diversificação, RWA SENS), **capital** (RWA, Índice de Basileia, IRB), **liquidez** (LCR, NSFR) e
**IRRBB** (ΔEVE, ΔNII, gap de repricing), além dos CADOCs em que cada métrica é reportada ao BCB.

Cada página tem a intuição, as fórmulas e um laboratório interativo; os cálculos ficam
numa API FastAPI.

## Estrutura

```
src/
  backend/core/     cálculos puros (numpy) — leia aqui para entender as fórmulas
  backend/api/      rotas FastAPI e schemas Pydantic
  backend/main.py   aplicação FastAPI
  frontend/         React + Vite (src/pages: uma página por conceito)
tests/              pytest do backend
files/              arquivos do projeto
docs/               documentação (fontes regulatórias usadas)
```

## Rodando

Todos os comandos a partir da pasta raiz do projeto.

Instalação (uma vez):

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
npm --prefix src/frontend install
```

Backend (porta 8000, documentação interativa em http://localhost:8000/docs):

```bash
.venv/Scripts/python -m uvicorn backend.main:app --reload --app-dir src
```

Frontend (porta 5173, faz proxy de `/api` para o backend):

```bash
npm --prefix src/frontend run dev
```

Testes:

```bash
.venv/Scripts/python -m pytest
```

## Simplificações

Os modelos são versões didáticas dos padrões de Basileia: retornos sintéticos, abordagem
padronizada com FPRs informados manualmente, LCR sem unwind de compromissadas, IRRBB com
bullets de cupom anual e curva em taxas contínuas, sem floors pós-choque nem modelagem
comportamental de depósitos. O RWA SENS cobre Delta e Curvatura GIRR e Delta FX. Veja as
fontes em [docs/fontes-regulatorias.md](docs/fontes-regulatorias.md). Não use para fins regulatórios.
