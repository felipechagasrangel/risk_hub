import type { ReactNode } from "react";
import type { IconName } from "./components/icons";
import SensitivitiesPage from "./pages/market/SensitivitiesPage";
import VaRPage from "./pages/market/VaRPage";
import PortfolioPage from "./pages/market/PortfolioPage";
import StressPage from "./pages/market/StressPage";
import RWAPage from "./pages/capital/RWAPage";
import IRBPage from "./pages/capital/IRBPage";
import CapitalStructurePage from "./pages/capital/CapitalStructurePage";
import LiquidityGapPage from "./pages/liquidity/LiquidityGapPage";
import BehavioralPage from "./pages/irrbb/BehavioralPage";
import RWASensPage from "./pages/market/RWASensPage";
import LCRPage from "./pages/liquidity/LCRPage";
import NSFRPage from "./pages/liquidity/NSFRPage";
import IRRBBPage from "./pages/irrbb/IRRBBPage";
import Glossary from "./pages/Glossary";
import Cadocs from "./pages/Cadocs";
import ExpectedLossPage from "./pages/credit/ExpectedLossPage";
import SaccrPage from "./pages/credit/SaccrPage";
import CurvesPage from "./pages/fundamentals/CurvesPage";
import CurveMtmPage from "./pages/fundamentals/CurveMtmPage";
import DerivativesPage from "./pages/fundamentals/DerivativesPage";
import AccountingPage from "./pages/fundamentals/AccountingPage";
import BooksPage from "./pages/fundamentals/BooksPage";
import InstrumentsPage from "./pages/fundamentals/InstrumentsPage";
import MonteCarloPage from "./pages/xva/MonteCarloPage";
import CsaPage from "./pages/xva/CsaPage";
import ExposurePage from "./pages/xva/ExposurePage";
import CvaPage from "./pages/xva/CvaPage";
import FundingPage from "./pages/xva/FundingPage";
import QuotePage from "./pages/xva/QuotePage";
import MarginGridPage from "./pages/xva/MarginGridPage";

export type NavGroup = {
  group: string;
  icon: IconName;
  /** Cor de identidade da área: usada só em detalhes de navegação, nunca em dados. */
  tone: string;
  items: { to: string; label: string; el: ReactNode }[];
};

export const NAV: NavGroup[] = [
  { group: "Fundamentos", icon: "layers", tone: "var(--tone-fund)", items: [
    { to: "/fundamentos/curva-de-juros", label: "Construção da curva de juros", el: <CurvesPage /> },
    { to: "/fundamentos/curva-mtm", label: "Na curva × a mercado", el: <CurveMtmPage /> },
    { to: "/fundamentos/derivativos", label: "Derivativos", el: <DerivativesPage /> },
    { to: "/fundamentos/contabil", label: "Contabilidade e preços", el: <AccountingPage /> },
    { to: "/fundamentos/carteiras", label: "Negociação × bancária", el: <BooksPage /> },
    { to: "/fundamentos/instrumentos", label: "Catálogo de instrumentos", el: <InstrumentsPage /> },
  ] },
  { group: "Risco de Capital", icon: "shield", tone: "var(--tone-capital)", items: [
    { to: "/capital/rwa", label: "RWA e Índice de Basileia", el: <RWAPage /> },
    { to: "/capital/irb", label: "Modelo IRB", el: <IRBPage /> },
    { to: "/capital/pr-alavancagem", label: "Composição do PR e alavancagem", el: <CapitalStructurePage /> },
  ] },
  { group: "Risco de Crédito", icon: "coins", tone: "var(--tone-credit)", items: [
    { to: "/credito/perda-esperada", label: "Perda esperada (Res. 4.966)", el: <ExpectedLossPage /> },
    { to: "/credito/sa-ccr", label: "SA-CCR: EAD de derivativos", el: <SaccrPage /> },
  ] },
  { group: "Risco de Liquidez", icon: "drop", tone: "var(--tone-liquidity)", items: [
    { to: "/liquidez/lcr", label: "LCR", el: <LCRPage /> },
    { to: "/liquidez/nsfr", label: "NSFR", el: <NSFRPage /> },
    { to: "/liquidez/gap-ftp", label: "Gap de liquidez e FTP", el: <LiquidityGapPage /> },
  ] },
  { group: "Risco de Mercado", icon: "chart", tone: "var(--tone-market)", items: [
    { to: "/mercado/sensibilidades", label: "Sensibilidades e fatores", el: <SensitivitiesPage /> },
    { to: "/mercado/var", label: "VaR e Expected Shortfall", el: <VaRPage /> },
    { to: "/mercado/carteira", label: "Diversificação", el: <PortfolioPage /> },
    { to: "/mercado/stress", label: "Stress testing", el: <StressPage /> },
    { to: "/mercado/rwa-sens", label: "RWA SENS: GIRR e FX", el: <RWASensPage /> },
  ] },
  { group: "IRRBB", icon: "wave", tone: "var(--tone-irrbb)", items: [
    { to: "/irrbb", label: "ΔEVE e ΔNII", el: <IRRBBPage /> },
    { to: "/irrbb/comportamental", label: "Modelagem comportamental", el: <BehavioralPage /> },
  ] },
  { group: "XVA", icon: "link", tone: "var(--tone-xva)", items: [
    { to: "/xva/monte-carlo", label: "Monte Carlo: GBM, HW e HJM", el: <MonteCarloPage /> },
    { to: "/xva/csa", label: "CSA e colateral", el: <CsaPage /> },
    { to: "/xva/exposicao", label: "Exposição e PFE", el: <ExposurePage /> },
    { to: "/xva/cva", label: "CVA e DVA", el: <CvaPage /> },
    { to: "/xva/fva-mva", label: "FVA, MVA e XVA total", el: <FundingPage /> },
    { to: "/xva/cotacao", label: "Cotação com e sem CSA", el: <QuotePage /> },
    { to: "/xva/margem-grade", label: "Margem × discretização", el: <MarginGridPage /> },
  ] },
  { group: "Referência", icon: "book", tone: "var(--tone-ref)", items: [
    { to: "/cadocs", label: "CADOCs", el: <Cadocs /> },
    { to: "/glossario", label: "Glossário", el: <Glossary /> },
  ] },
];
