from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import capital

router = APIRouter(prefix="/capital", tags=["Capital"])


class Exposure(BaseModel):
    name: str
    amount: float = Field(ge=0)
    risk_weight: float = Field(ge=0, le=12.5, description="FPR, ex.: 1.0 = 100%")
    ccf: float = Field(1.0, ge=0, le=1, description="Fator de conversão de crédito")


class RWARequest(BaseModel):
    exposures: list[Exposure]
    capital_market: float = Field(0, ge=0, description="Exigência de capital de mercado")
    capital_operational: float = Field(0, ge=0, description="Exigência de capital operacional")
    cet1: float = Field(ge=0)
    at1: float = Field(0, ge=0)
    tier2: float = Field(0, ge=0)
    conservation_buffer: float = 0.025
    countercyclical_buffer: float = 0.0


@router.post("/rwa")
def compute_rwa(req: RWARequest):
    rows = capital.standardized_rwa([e.model_dump() for e in req.exposures])
    rwa_credit = sum(r["rwa"] for r in rows)
    return {
        "exposures": rows,
        **capital.capital_ratios(rwa_credit, req.capital_market, req.capital_operational,
                                 req.cet1, req.at1, req.tier2,
                                 req.conservation_buffer, req.countercyclical_buffer),
    }


class IRBRequest(BaseModel):
    pd: float = Field(0.01, gt=0, lt=1)
    lgd: float = Field(0.45, ge=0, le=1)
    maturity: float = Field(2.5, ge=1, le=5)
    ead: float = Field(1_000_000, ge=0)
    asset_class: Literal["corporate", "mortgage", "revolving", "retail"] = "corporate"


@router.post("/irb")
def compute_irb(req: IRBRequest):
    result = capital.irb_capital(req.pd, req.lgd, req.maturity, req.asset_class)
    pds = [0.0003, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.05,
           0.075, 0.1, 0.15, 0.2, 0.3]
    curve = [
        {"pd": p, **{k: capital.irb_capital(p, req.lgd, req.maturity, req.asset_class)[k]
                     for k in ("capital_k", "risk_weight", "expected_loss_rate")}}
        for p in pds
    ]
    return {
        **result,
        "ead": req.ead,
        "capital": result["capital_k"] * req.ead,
        "rwa": result["risk_weight"] * req.ead,
        "expected_loss": result["expected_loss_rate"] * req.ead,
        "curve": curve,
    }
