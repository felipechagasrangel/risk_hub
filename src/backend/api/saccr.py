from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import saccr

router = APIRouter(prefix="/credit", tags=["Risco de Crédito"])


class Trade(BaseModel):
    name: str
    kind: Literal["ir_swap", "fx_forward", "fx_option"]
    notional: float = Field(gt=0, description="Nocional em R$")
    start: float = Field(0, ge=0, description="Início, em anos")
    end: float = Field(gt=0, le=50, description="Vencimento, em anos")
    long: bool = Field(description="Juros: paga pré (comprado em taxa). Câmbio: comprado em dólar. Opção: comprada")
    mtm: float = Field(0, description="Valor de mercado da operação, em R$")
    currency: str = "BRL"
    pair: str = "USD/BRL"
    option: Literal["call", "put"] = "call"
    moneyness: float = Field(1.0, gt=0, description="Preço do subjacente ÷ strike (P/K)")


class Netting(BaseModel):
    margined: bool = False
    collateral: float = Field(0, description="Colateral líquido recebido (negativo = entregue)")
    threshold: float = Field(0, ge=0)
    mta: float = Field(0, ge=0)
    nica: float = Field(0, description="Colateral independente líquido (ex.: margem inicial) recebido")
    mpor_days: int = Field(10, ge=5, le=60)


class SACCRRequest(BaseModel):
    trades: list[Trade]
    netting: Netting = Netting()
    risk_weight: float = Field(1.0, ge=0, le=1.5, description="FPR da contraparte")


@router.post("/saccr")
def compute_saccr(req: SACCRRequest):
    if not req.trades:
        raise HTTPException(422, "Inclua pelo menos uma operação")
    if any(t.start >= t.end for t in req.trades):
        raise HTTPException(422, "O vencimento precisa ser posterior ao início")
    return saccr.run(req.model_dump())
