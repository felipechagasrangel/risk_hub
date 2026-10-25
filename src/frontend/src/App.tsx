import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Icon } from "./components/icons";
import { ThemeToggle } from "./components/ThemeToggle";
import Home from "./pages/Home";
import { NAV } from "./nav";

const PAGES = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g })));

export default function App() {
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    const target = hash && document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  const index = PAGES.findIndex((p) => p.to === pathname);
  const page = index >= 0 ? PAGES[index] : null;

  return (
    <div className={`layout${menuOpen ? " menu-open" : ""}`}>
      <header className="topbar">
        <Brand />
        <button className="icon-button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
      </header>

      <nav className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="nav-scroll">
          <NavLink to="/" end className="nav-link">Início</NavLink>
          {NAV.map((g) => (
            <div key={g.group} className="nav-group" style={{ ["--tone" as string]: g.tone }}>
              <div className="group"><Icon name={g.icon} size={14} />{g.group}</div>
              {g.items.map((i) => <NavLink key={i.to} to={i.to} className="nav-link">{i.label}</NavLink>)}
            </div>
          ))}
        </div>
        <div className="sidebar-footer"><ThemeToggle /></div>
      </nav>

      <main>
        <div className="content">
          {page && (
            <div className="eyebrow" style={{ ["--tone" as string]: page.group.tone }}>
              <Icon name={page.group.icon} size={14} />{page.group.group}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Home />} />
            {PAGES.map((i) => <Route key={i.to} path={i.to} element={i.el} />)}
            <Route path="/fundamentos/aprecamento" element={<Navigate to="/fundamentos/curva-mtm" replace />} />
          </Routes>
          {page && <Pager prev={PAGES[index - 1]} next={PAGES[index + 1]} />}
          <footer className="site-footer">
            Risk Hub — material didático. Simplificações dos padrões de Basileia e da regulação do BCB; não use para fins regulatórios.
          </footer>
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark"><Icon name="chart" size={16} /></span>
      <span>Risk Hub<small>aprendendo riscos financeiros</small></span>
    </Link>
  );
}

function Pager({ prev, next }: { prev?: (typeof PAGES)[number]; next?: (typeof PAGES)[number] }) {
  return (
    <nav className="pager" aria-label="Navegação entre páginas">
      {prev ? (
        <Link to={prev.to} className="pager-link">
          <span className="pager-dir"><Icon name="arrowLeft" size={14} /> Anterior</span>
          <span className="pager-title">{prev.label}</span>
        </Link>
      ) : <span />}
      {next && (
        <Link to={next.to} className="pager-link next">
          <span className="pager-dir">Próxima <Icon name="arrowRight" size={14} /></span>
          <span className="pager-title">{next.label}</span>
        </Link>
      )}
    </nav>
  );
}
