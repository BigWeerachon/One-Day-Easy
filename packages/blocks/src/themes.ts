// ธีมของแต่ละเทมเพลต (N2: เทมเพลต = บล็อก + theme) · สีหลักแทนได้ด้วย config.theme.primary
export interface Theme { primary: string; accent: string; bg: string; surface: string; text: string; font: string; heading: string; radius: number; dark?: boolean }
const F = (n: string) => `"${n}", "IBM Plex Sans Thai", system-ui, sans-serif`;
export const THEMES: Record<string, Theme> = {
  T1: { primary: "#7a4a2a", accent: "#e9b872", bg: "#faf6f0", surface: "#ffffff", text: "#2b1d12", font: F("Sarabun"), heading: F("Prompt"), radius: 18 },
  T2: { primary: "#6d5bd0", accent: "#9fe2e8", bg: "#f5f3ff", surface: "#ffffff", text: "#1e1b3a", font: F("IBM Plex Sans Thai"), heading: F("Kanit"), radius: 22 },
  T3: { primary: "#c8102e", accent: "#fcc419", bg: "#fff8f0", surface: "#ffffff", text: "#1f1a17", font: F("Sarabun"), heading: F("Kanit"), radius: 16 },
  T4: { primary: "#0f766e", accent: "#f2c14e", bg: "#f3faf8", surface: "#ffffff", text: "#12302c", font: F("Sarabun"), heading: F("Prompt"), radius: 14 },
  T5: { primary: "#0b6cf0", accent: "#ffb020", bg: "#f4f7fc", surface: "#ffffff", text: "#141a2b", font: F("IBM Plex Sans Thai"), heading: F("Kanit"), radius: 12 },
  T6: { primary: "#f47aa5", accent: "#7cd4c4", bg: "#fff6fa", surface: "#ffffff", text: "#3a2340", font: F("Mitr"), heading: F("Mitr"), radius: 26 },
  T7: { primary: "#4f7a3a", accent: "#e6c27a", bg: "#f7f5ee", surface: "#ffffff", text: "#25301c", font: F("Sarabun"), heading: F("Chonburi"), radius: 10 },
  T8: { primary: "#c9a24a", accent: "#c9a24a", bg: "#0e0e10", surface: "#18181b", text: "#f2efe8", font: F("IBM Plex Sans Thai"), heading: F("Prompt"), radius: 4, dark: true },
  T9: { primary: "#e11d48", accent: "#facc15", bg: "#0f1115", surface: "#181b22", text: "#f5f6f8", font: F("IBM Plex Sans Thai"), heading: F("Kanit"), radius: 8, dark: true },
  T10: { primary: "#2563eb", accent: "#f97316", bg: "#f8fafc", surface: "#ffffff", text: "#0f172a", font: F("IBM Plex Sans Thai"), heading: F("Prompt"), radius: 16 },
};
export const themeFor = (template: string, config: Record<string, unknown>): Theme => {
  const t = THEMES[template] ?? THEMES.T5;
  const custom = (config.theme ?? {}) as { primary?: string };
  return /^#[0-9a-f]{6}$/i.test(custom.primary ?? "") ? { ...t, primary: custom.primary! } : t;
};
