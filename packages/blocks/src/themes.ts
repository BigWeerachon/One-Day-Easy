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
// ค่าที่ปรับได้ต่อเว็บ (config.theme) · Design Agent ตั้งให้จากภาพ ref และรูปร้าน · ค่าที่ไม่ผ่านการตรวจจะใช้ของเทมเพลตแทน
export const FONTS = ["IBM Plex Sans Thai", "Sarabun", "Kanit", "Prompt", "Mitr", "Chonburi"] as const; // ต้องตรงกับที่ Engine โหลดไว้
export interface ThemeOverride { primary?: string; accent?: string; bg?: string; surface?: string; text?: string; heading?: string; font?: string; radius?: number }
const HEX = /^#[0-9a-f]{6}$/i;
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** อัตราคอนทราสต์ตาม WCAG (1–21) */
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** ตรวจค่าธีมทีละช่อง · คืนเฉพาะช่องที่ใช้ได้ และรายการที่ถูกตัดออกพร้อมเหตุผล */
export function sanitizeTheme(template: string, o: ThemeOverride): { theme: ThemeOverride; dropped: string[] } {
  const base = THEMES[template] ?? THEMES.T5, out: ThemeOverride = {}, dropped: string[] = [];
  for (const k of ["primary", "accent", "bg", "surface", "text"] as const) { const v = o[k]; if (v == null) continue; if (HEX.test(v)) out[k] = v.toLowerCase(); else dropped.push(`${k}: ไม่ใช่สี #rrggbb`); }
  for (const k of ["heading", "font"] as const) { const v = o[k]; if (v == null) continue; if ((FONTS as readonly string[]).includes(v)) out[k] = v; else dropped.push(`${k}: ฟอนต์ ${String(v).slice(0, 30)} ไม่อยู่ในรายการ`); }
  if (o.radius != null) { if (Number.isFinite(o.radius) && o.radius >= 0 && o.radius <= 28) out.radius = Math.round(o.radius); else dropped.push("radius: ต้อง 0–28"); }
  // อ่านออกจริง: ตัวหนังสือบนพื้นหลัง ≥ 4.5 · ตัวขาวบนสีหลัก (หัวเว็บ/ปุ่ม) ≥ 3
  const bg = out.bg ?? base.bg, text = out.text ?? base.text;
  if (contrast(text, bg) < 4.5) { dropped.push(`สีตัวหนังสือกับพื้นหลังอ่านยาก (${contrast(text, bg).toFixed(1)}:1)`); delete out.bg; delete out.text; delete out.surface; }
  if (out.primary && contrast("#ffffff", out.primary) < 3) { dropped.push(`สีหลัก ${out.primary} อ่อนเกินสำหรับตัวหนังสือขาว`); delete out.primary; }
  return { theme: out, dropped };
}
export const themeFor = (template: string, config: Record<string, unknown>): Theme => {
  const t = THEMES[template] ?? THEMES.T5;
  const { theme: o } = sanitizeTheme(template, (config.theme ?? {}) as ThemeOverride);
  return { ...t, ...(o.primary && { primary: o.primary }), ...(o.accent && { accent: o.accent }), ...(o.bg && { bg: o.bg }), ...(o.surface && { surface: o.surface }), ...(o.text && { text: o.text }),
    ...(o.heading && { heading: F(o.heading) }), ...(o.font && { font: F(o.font) }), ...(o.radius != null && { radius: o.radius }) };
};
