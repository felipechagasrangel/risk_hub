"""Rotas de capital: risco operacional, adicionais, planejamento de capital e grandes exposições."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import capital_mgmt

router = APIRouter(prefix="/capital", tags=["Capital"])


class AnnualPeriod(BaseModel):
    ii: float = Field(description="Receita de juros e arrendamento")
    ie: float = Field(description="Despesa de juros e arrendamento")
    iea: float = Field(ge=0, description="Ativos geradores de juros")
    di: float = Field(0, description="Receitas de participações")
    fi: float = Field(0, description="Receita de serviços")
    fe: float = Field(0, description="Despesa de serviços")
    ooi: float = Field(0, description="Outras receitas operacionais")
    ooe: float = Field(0, description="Outras despesas operacionais")
    ntb: float = Field(0, description="Resultado líquido da carteira de negociação")
    nbb: float = Field(0, description="Resultado líquido da carteira bancária")


class OpRiskRequest(BaseModel):
    years: list[AnnualPeriod] = Field(min_length=3, max_length=3)
    losses: list[float] = Field(min_length=5, max_length=10, description="Perdas operacionais anuais, até dez anos")
    segment: Literal["S1S2", "S3", "S4"] = "S1S2"
    s3_uses_ilm: bool = False


@router.post("/op-risk")
def compute_op_risk(req: OpRiskRequest):
    return capital_mgmt.op_risk(req.model_dump())


class BuffersRequest(BaseModel):
    cet1: float = Field(1_100, ge=0)
    at1: float = Field(120, ge=0)
    tier2: float = Field(180, ge=0)
    rwa: float = Field(10_000, gt=0)
    countercyclical: float = Field(0.0, ge=0, le=0.025)
    systemic: float = Field(0.01, ge=0, le=0.02)
    net_income: float = Field(300)


@router.post("/buffers")
def compute_buffers(req: BuffersRequest):
    return capital_mgmt.buffers(req.model_dump())


class Scenario(BaseModel):
    roe: float = Field(description="Retorno anual antes das perdas de estresse, sobre o Capital Principal")
    rwa_growth: float = Field(description="Crescimento anual do RWA")
    losses: list[float] = Field(min_length=1, max_length=3, description="Perdas de estresse por ano, em % do RWA inicial")


class CapitalPlanRequest(BaseModel):
    cet1: float = Field(1_100, ge=0)
    at1: float = Field(120, ge=0)
    tier2: float = Field(180, ge=0)
    rwa: float = Field(10_000, gt=0)
    countercyclical: float = Field(0.0, ge=0, le=0.025)
    systemic: float = Field(0.01, ge=0, le=0.02)
    management_buffer: float = Field(0.015, ge=0, le=0.05, description="Colchão gerencial acima dos requerimentos")
    payout: float = Field(0.4, ge=0, le=1)
    base: Scenario = Scenario(roe=0.16, rwa_growth=0.10, losses=[0, 0, 0])
    stress: Scenario = Scenario(roe=0.12, rwa_growth=0.04, losses=[0.03, 0.02, 0.005])


@router.post("/plan")
def compute_plan(req: CapitalPlanRequest):
    return capital_mgmt.capital_plan(req.model_dump())


class Exposure(BaseModel):
    name: str
    group: str = Field("", description="Grupo econômico (vazio = cliente isolado)")
    gross: float = Field(ge=0)
    mitigation: float = Field(0, ge=0, description="Colateral e garantias elegíveis")
    exempt: bool = False


class LargeExposuresRequest(BaseModel):
    tier1: float = Field(gt=0)
    exposures: list[Exposure] = Field(min_length=1)


@router.post("/large-exposures")
def compute_large_exposures(req: LargeExposuresRequest):
    return capital_mgmt.large_exposures([e.model_dump() for e in req.exposures], req.tier1)
