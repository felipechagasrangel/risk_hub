from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import irrbb

router = APIRouter(prefix="/irrbb", tags=["IRRBB"])


class Position(BaseModel):
    name: str
    side: Literal["asset", "liability"]
    amount: float = Field(ge=0)
    rate: float = Field(description="Taxa contratual anual")
    repricing: float = Field(gt=0, le=40, description="Anos até repricing/vencimento")


class CurvePoint(BaseModel):
    tenor: float = Field(gt=0)
    rate: float


class Shocks(BaseModel):
    parallel: float = Field(0.04, description="Choque paralelo (decimal)")
    short: float = Field(0.05, description="Choque de curto prazo")
    long: float = Field(0.03, description="Choque de longo prazo")


class IRRBBRequest(BaseModel):
    positions: list[Position]
    curve: list[CurvePoint]
    shocks: Shocks = Shocks()
    tier1: float = Field(0, ge=0)


@router.post("/analyze")
def analyze(req: IRRBBRequest):
    if len(req.curve) < 2:
        raise HTTPException(422, "A curva precisa de pelo menos dois vértices")
    return irrbb.analyze([p.model_dump() for p in req.positions],
                         [c.model_dump() for c in req.curve],
                         req.shocks.model_dump(), req.tier1)
