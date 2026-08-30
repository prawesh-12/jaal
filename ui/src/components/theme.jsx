import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "jaal-theme";

/*
  Light by default. The choice is written to the root element, which is where
  index.css reads it, and remembered so a reload does not flip back.
*/
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be refused. The theme still applies for this visit.
    }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to the ${next} theme`}
      className="interactive inline-flex size-8 shrink-0 items-center justify-center border border-line text-fg-faint hover:border-line-strong hover:text-fg"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
