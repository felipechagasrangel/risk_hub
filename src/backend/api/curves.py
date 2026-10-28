from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import curves

router = APIRouter(prefix="/curves", tags=["Curvas"])


class DI1Contract(BaseModel):
    label: str
    du: int = Field(gt=1, le=10_000, description="Dias úteis até o vencimento")
    rate: float = Field(gt=-0.05, lt=1, description="Taxa negociada (base 252)")


class FXFuture(BaseModel):
    label: str
    du: int = Field(gt=0, le=10_000)
    dc: int = Field(gt=0, le=15_000, description="Dias corridos até o vencimento")
    price: float = Field(gt=0, description="Dólar futuro, em R$ por US$")


class CurveRequest(BaseModel):
    cdi: float = Field(0.149, gt=-0.05, lt=1)
    contracts: list[DI1Contract]
    spot: float = Field(5.40, gt=0)
    ptax: float = Field(5.38, gt=0, description="PTAX de D−1, usada no cupom sujo")
    fx: list[FXFuture] = []
    step: int = Field(5, ge=1, le=63)


@router.post("/build")
def build(req: CurveRequest):
    dus = [c.du for c in req.contracts]
    if len(dus) < 2 or len(set(dus)) != len(dus):
        raise HTTPException(422, "Informe pelo menos dois contratos de DI1 com prazos diferentes")
    contracts = [c.model_dump() for c in req.contracts]
    return {
        "pre": curves.pre_curve(contracts, req.cdi, req.step),
        "cupom": curves.cupom_curve(contracts, req.cdi, [f.model_dump() for f in req.fx], req.spot, req.ptax),
    }
