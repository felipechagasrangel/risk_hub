import inspect

from fastapi import APIRouter, HTTPException

from backend.core import credit_loss, curves, saccr, sensitivities, xva

router = APIRouter(prefix="/source", tags=["Código-fonte"])

# Funções cujo código-fonte pode ser exibido nas páginas (snippets). Só o que está nesta lista sai.
SNIPPETS = {f.__name__: f for f in (
    xva.simulate_gbm, xva.simulate_hull_white, xva.hw_zero_bond, xva.swap_mtm, xva.ndf_mtm,
    xva.swap_periodic_mtm, xva.fixed_rate_sensitivity, xva.quote_run, xva.lookback_index,
    xva.apply_collateral, xva.margin_calls, xva.exposure_profile, xva.epe_and_eepe,
    xva.default_probabilities, xva.cva, xva.dva, xva.fva, xva.initial_margin_swap, xva.mva,
    sensitivities.price, sensitivities.key_rate_dv01, sensitivities.fx_and_vol_greeks,
    sensitivities.pnl_explain, sensitivities.forward_fx,
    credit_loss.stage, credit_loss.marginal_pd, credit_loss.expected_loss, credit_loss.weighted_expected_loss,
    credit_loss.incurred_loss_floor, credit_loss.provision,
    saccr.supervisory_duration, saccr.maturity_factor, saccr.supervisory_delta, saccr.ir_effective_notional,
    saccr.add_ons, saccr.replacement_cost, saccr.multiplier, saccr.saccr_ead, saccr.cem_ead,
    curves.di1_pu, curves.flat_forward, curves.forward_rate, curves.implied_cupom, curves.cupom_curve,
)}


@router.get("/{name}")
def source(name: str):
    if name not in SNIPPETS:
        raise HTTPException(404, "Snippet não disponível")
    f = SNIPPETS[name]
    return {"name": name, "module": f.__module__, "code": inspect.getsource(f)}
