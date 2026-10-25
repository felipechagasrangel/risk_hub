import { useEffect } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import VaRPage from "./pages/market/VaRPage";
import PortfolioPage from "./pages/market/PortfolioPage";
import StressPage from "./pages/market/StressPage";
import RWAPage from "./pages/capital/RWAPage";
import IRBPage from "./pages/capital/IRBPage";
import RWASensPage from "./pages/capital/RWASensPage";
import LCRPage from "./pages/liquidity/LCRPage";
import NSFRPage from "./pages/liquidity/NSFRPage";
import IRRBBPage from "./pages/irrbb/IRRBBPage";
import Glossary from "./pages/Glossary";
import Cadocs from "./pages/Cadocs";

export const NAV = [
  { group: "Risco de Mercado", items: [
    { to: "/mercado/var", label: "VaR e Expected Shortfall", el: <VaRPage /> },
    { to: "/mercado/carteira", label: "Diversificação", el: <PortfolioPage /> },
    { to: "/mercado/stress", label: "Stress testing", el: <StressPage /> },
  ] },
  { group: "Capital", items: [
    { to: "/capital/rwa", label: "RWA e Índice de Basileia", el: <RWAPage /> },
    { to: "/capital/irb", label: "Modelo IRB", el: <IRBPage /> },
    { to: "/capital/rwa-sens", label: "RWA SENS: Delta GIRR", el: <RWASensPage /> },
  ] },
  { group: "Liquidez", items: [
    { to: "/liquidez/lcr", label: "LCR", el: <LCRPage /> },
    { to: "/liquidez/nsfr", label: "NSFR", el: <NSFRPage /> },
  ] },
  { group: "IRRBB", items: [
    { to: "/irrbb", label: "ΔEVE e ΔNII", el: <IRRBBPage /> },
  ] },
];

export default function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const target = hash && document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Risk Hub<span>aprendendo riscos financeiros</span></div>
        <NavLink to="/" end>Início</NavLink>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="group">{g.group}</div>
            {g.items.map((i) => <NavLink key={i.to} to={i.to}>{i.label}</NavLink>)}
          </div>
        ))}
        <div className="group">Referência</div>
        <NavLink to="/cadocs">CADOCs</NavLink>
        <NavLink to="/glossario">Glossário</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          {NAV.flatMap((g) => g.items).map((i) => <Route key={i.to} path={i.to} element={i.el} />)}
          <Route path="/cadocs" element={<Cadocs />} />
          <Route path="/glossario" element={<Glossary />} />
        </Routes>
      </main>
    </div>
  );
}
