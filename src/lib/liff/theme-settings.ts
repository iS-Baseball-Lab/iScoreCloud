// filepath: src/lib/liff/theme-settings.ts

export type LiffColorThemeId =
  | "blue"
  | "red"
  | "green"
  | "orange"
  | "teal"
  | "purple"
  | "indigo";

export type LiffDesignStyleId = "sharp" | "sleek" | "modern" | "rounded";

export interface LiffColorThemeOption {
  id: LiffColorThemeId;
  color: string;
  label: string;
}

export interface LiffDesignStyleOption {
  id: LiffDesignStyleId;
  label: string;
  description: string;
}

export const LIFF_COLOR_THEMES: readonly LiffColorThemeOption[] = [
  { id: "blue", color: "#0284c7", label: "ブルー" },
  { id: "red", color: "#e11d48", label: "レッド" },
  { id: "green", color: "#16a34a", label: "グリーン" },
  { id: "orange", color: "#ea580c", label: "オレンジ" },
  { id: "teal", color: "#0d9488", label: "ティール" },
  { id: "purple", color: "#7c3aed", label: "パープル" },
  { id: "indigo", color: "#4338ca", label: "インディゴ" },
];

export const LIFF_DESIGN_STYLES: readonly LiffDesignStyleOption[] = [
  { id: "sharp", label: "Sharp", description: "シャープ" },
  { id: "sleek", label: "Sleek", description: "スリーク" },
  { id: "modern", label: "Modern", description: "モダン" },
  { id: "rounded", label: "Rounded", description: "ラウンド" },
];

export const LIFF_COLOR_STORAGE_KEY = "iscore-color-theme";
export const LIFF_DESIGN_STORAGE_KEY = "iscore-design-theme";
export const LIFF_THEME_CHANGE_EVENT = "iscore-liff-theme-change";

export function getSavedLiffColorTheme(): LiffColorThemeId {
  if (typeof window === "undefined") return "blue";
  const raw = localStorage.getItem(LIFF_COLOR_STORAGE_KEY);
  const found = LIFF_COLOR_THEMES.find((t) => t.id === raw);
  return found ? found.id : "blue";
}

export function getSavedLiffDesignStyle(): LiffDesignStyleId {
  if (typeof window === "undefined") return "modern";
  const raw = localStorage.getItem(LIFF_DESIGN_STORAGE_KEY);
  const found = LIFF_DESIGN_STYLES.find((d) => d.id === raw);
  return found ? found.id : "modern";
}

export function syncLiffThemeClasses(): {
  color: LiffColorThemeId;
  design: LiffDesignStyleId;
} {
  const color = getSavedLiffColorTheme();
  const design = getSavedLiffDesignStyle();

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    LIFF_COLOR_THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${color}`);

    LIFF_DESIGN_STYLES.forEach((d) => root.classList.remove(`design-${d.id}`));
    root.classList.add(`design-${design}`);
  }

  return { color, design };
}

export function applyLiffColorTheme(themeId: LiffColorThemeId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIFF_COLOR_STORAGE_KEY, themeId);
  syncLiffThemeClasses();
  window.dispatchEvent(new Event(LIFF_THEME_CHANGE_EVENT));
}

export function applyLiffDesignStyle(designId: LiffDesignStyleId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIFF_DESIGN_STORAGE_KEY, designId);
  syncLiffThemeClasses();
  window.dispatchEvent(new Event(LIFF_THEME_CHANGE_EVENT));
}

