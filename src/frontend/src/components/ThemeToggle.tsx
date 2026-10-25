import { useEffect, useState } from "react";
import { Icon } from "./icons";

type Theme = "light" | "dark" | "system";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Seletor Claro / Escuro / Sistema; "Sistema" segue o prefers-color-scheme do navegador. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {
      // sem armazenamento: o tema vale só nesta visita
    }
  }, [theme]);

  const options: [Theme, string, "sun" | "moon" | "monitor"][] = [
    ["light", "Claro", "sun"], ["dark", "Escuro", "moon"], ["system", "Sistema", "monitor"],
  ];
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Tema">
      {options.map(([value, label, icon]) => (
        <button key={value} role="radio" aria-checked={theme === value} title={label}
          className={theme === value ? "on" : ""} onClick={() => setTheme(value)}>
          <Icon name={icon} size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
