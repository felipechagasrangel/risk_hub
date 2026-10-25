# Risk Hub

Site didático para aprender conceitos de risco bancário: **mercado** (VaR, ES, backtesting,
diversificação), **capital** (RWA, Índice de Basileia, IRB), **liquidez** (LCR, NSFR) e
**IRRBB** (ΔEVE, ΔNII, gap de repricing).

Cada página tem a intuição, as fórmulas e um laboratório interativo; os cálculos ficam
numa API FastAPI.

## Estrutura

```
backend/
  app/core/     cálculos puros (numpy) — leia aqui para entender as fórmulas
  app/api/      rotas FastAPI e schemas Pydantic
  tests/        pytest
frontend/
  src/pages/    uma página por conceito (React + Recharts + KaTeX)
  src/components/
```

## Rodando

Backend (porta 8000, documentação interativa em http://localhost:8000/docs):

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Frontend (porta 5173, faz proxy de `/api` para o backend):

```bash
cd frontend
npm install
npm run dev
```

Testes:

```bash
cd backend
.venv/Scripts/python -m pytest
```

## Simplificações

Os modelos são versões didáticas dos padrões de Basileia: retornos sintéticos, abordagem
padronizada com FPRs informados manualmente, LCR sem unwind de compromissadas, IRRBB com
bullets de cupom anual e curva em taxas contínuas, sem floors pós-choque nem modelagem
comportamental de depósitos. Não use para fins regulatórios.
