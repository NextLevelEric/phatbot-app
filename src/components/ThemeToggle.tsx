"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "phatbot:theme";
type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "light" ? "#f7f7f8" : "#0a0a0a");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: Theme = "dark";
    try {
      const value = localStorage.getItem(THEME_KEY);
      if (value === "light" || value === "dark") saved = value;
    } catch {}
    setTheme(saved);
    applyTheme(saved);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="theme-toggle flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-lg text-white"
    >
      <span aria-hidden="true">{ready && theme === "light" ? "☾" : "☀"}</span>
    </button>
  );
}
