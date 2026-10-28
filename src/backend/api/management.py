"""Rotas de gestão: composição do PR e alavancagem, gap de liquidez e FTP, IRRBB comportamental."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import capital_structure, irrbb_behavioral, liquidity_mgmt

router = APIRouter(tags=["Gestão"])


class OffBalance(BaseModel):
    name: str
    amount: float = Field(ge=0)
    ccf: float = Field(ge=0, le=1)


class CapitalStructureRequest(BaseModel):
    share_capital: float = Field(800, ge=0)
    reserves: float = Field(300, ge=0)
    retained_earnings: float = Field(150)
    oci: float = Field(-20, description="Outros resultados abrangentes (ajustes de avaliação patrimonial)")
    treasury_shares: float = Field(10, ge=0)
    goodwill: float = Field(60, ge=0)
    intangibles: float = Field(40, ge=0)
    dta_tax_losses: float = Field(30, ge=0)
    pension_assets: float = Field(5, ge=0)
    other_deductions: float = Field(0, ge=0)
    dta_temporary: float = Field(150, ge=0, description="Créditos tributários de diferenças temporárias")
    significant_investments: float = Field(70, ge=0, description="Participações relevantes em instituições não consolidadas")
    at1: float = Field(100, ge=0)
    tier2: float = Field(150, ge=0)
    rwa_before_thresholds: float = Field(9_000, gt=0, description="RWA de crédito, mercado e operacional")
    total_assets: float = Field(18_000, gt=0)
    derivatives_rc: float = Field(150, ge=0)
    derivatives_pfe: float = Field(250, ge=0)
    sft: float = Field(600, ge=0, description="Exposição de operações compromissadas")
    off_balance: list[OffBalance] = [
        OffBalance(name="Limites de cartão (canceláveis)", amount=2_000, ccf=0.10),
        OffBalance(name="Limites de crédito a empresas", amount=1_500, ccf=0.40),
        OffBalance(name="Fianças e garantias prestadas", amount=800, ccf=1.0),
    ]


@router.post("/capital/structure")
def compute_capital_structure(req: CapitalStructureRequest):
    return capital_structure.run(req.model_dump())


class GapItem(BaseModel):
    name: str
    kind: Literal["in", "out"]
    amounts: list[float] = Field(min_length=8, max_length=8)
    stress: float = Field(ge=0, le=1, description="Entrada: fração recebida no estresse. Saída: fração que sai")
    base_rollover: float = Field(0, ge=0, le=1, description="Saída: fração renovada no cenário normal")


class PremiumPoint(BaseModel):
    term: float = Field(ge=0)
    bps: float


class Product(BaseModel):
    name: str
    side: Literal["asset", "liability"]
    amount: float = Field(gt=0)
    term: float = Field(ge=0, description="Prazo de liquidez (contratual ou comportamental), em anos")
    client_rate: float


class LiquidityMgmtRequest(BaseModel):
    buffer: float = Field(1_500, ge=0)
    buffer_haircut: float = Field(0.05, ge=0, le=1)
    items: list[GapItem]
    base_rate: float = Field(0.14, description="Curva base (CDI/pré) — flat")
    premium_curve: list[PremiumPoint]
    products: list[Product]


@router.post("/liquidity/management")
def compute_liquidity_mgmt(req: LiquidityMgmtRequest):
    return liquidity_mgmt.run(req.model_dump())


class BehavioralRequest(BaseModel):
    market_rate: float = Field(0.14, gt=-0.05, lt=1)
    loan_balance: float = Field(1_000, gt=0)
    loan_rate: float = Field(0.18, gt=-0.05, lt=2)
    loan_months: int = Field(60, ge=6, le=360)
    base_cpr: float = Field(0.08, ge=0, le=0.6)
    cpr_sensitivity: float = Field(0.03, ge=0, le=0.2, description="Aumento do CPR por ponto de incentivo")
    nmd_balance: float = Field(600, ge=0)
    nmd_segment: Literal["retail_transactional", "retail_non_transactional", "wholesale"] = "retail_transactional"
    stable_share: float = Field(0.8, ge=0, le=1, description="Fração do saldo que é estável")
    core_share: float = Field(1.0, ge=0, le=1, description="Fração da parte estável tratada como núcleo")
    nmd_avg_maturity: float = Field(3.0, gt=0, le=10)
    cdb_balance: float = Field(300, ge=0)
    cdb_rate: float = Field(0.145, gt=-0.05, lt=1)
    cdb_months: int = Field(24, ge=1, le=120)
    cdb_redemption_base: float = Field(0.05, ge=0, le=0.9, description="Resgate antecipado anual estrutural do CDB")
    cdb_redemption_sensitivity: float = Field(0.08, ge=0, le=0.5, description="Aumento do resgate por ponto de incentivo")


@router.post("/irrbb/behavioral")
def compute_behavioral(req: BehavioralRequest):
    return irrbb_behavioral.run(req.model_dump())
