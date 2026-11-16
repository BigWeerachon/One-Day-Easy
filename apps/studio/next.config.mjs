/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@ode/blocks"],
  // pdfkit อ่านไฟล์ฟอนต์/AFM จากดิสก์ · ให้ Next รวมไฟล์เหล่านี้ตอน deploy
  serverExternalPackages: ["pdfkit"],
  // PDF ถูกสร้างจากหลายทาง (ดาวน์โหลด · Portal · แนบอีเมลจาก webhook/cron/action) → รวมฟอนต์ให้ทุก route
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  // รูปถูกย่อในเบราว์เซอร์ก่อนส่ง (≤1600px) · Vercel รับ body ได้ไม่เกิน 4.5MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
