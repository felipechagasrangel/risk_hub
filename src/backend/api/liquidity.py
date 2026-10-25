from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import liquidity

router = APIRouter(prefix="/liquidity", tags=["Liquidez"])


class HQLAItem(BaseModel):
    name: str
    amount: float = Field(ge=0)
    level: Literal["1", "2A", "2B"]


class FlowItem(BaseModel):
    name: str
    amount: float = Field(ge=0)
    rate: float = Field(ge=0, le=1, description="Taxa de saída (run-off) ou de entrada")


class LCRRequest(BaseModel):
    hqla: list[HQLAItem]
    outflows: list[FlowItem]
    inflows: list[FlowItem]


@router.post("/lcr")
def compute_lcr(req: LCRRequest):
    return liquidity.lcr([h.model_dump() for h in req.hqla],
                         [o.model_dump() for o in req.outflows],
                         [i.model_dump() for i in req.inflows])


class FundingItem(BaseModel):
    name: str
    amount: float = Field(ge=0)
    factor: float = Field(ge=0, le=1)


class NSFRRequest(BaseModel):
    asf: list[FundingItem]
    rsf: list[FundingItem]


@router.post("/nsfr")
def compute_nsfr(req: NSFRRequest):
    return liquidity.nsfr([a.model_dump() for a in req.asf], [r.model_dump() for r in req.rsf])
