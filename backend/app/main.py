from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import capital, irrbb, liquidity, market, rwa_sens, stress

app = FastAPI(
    title="Risk Hub",
    description="API didática de riscos de mercado, capital, liquidez e IRRBB.",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (market, stress, capital, rwa_sens, liquidity, irrbb):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
