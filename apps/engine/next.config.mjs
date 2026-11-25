/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@ode/blocks"],
  poweredByHeader: false,
  async headers() {
    // เว็บร้าน (หน้าแรก /s/<ร้าน> และหน้าสั่งออนไลน์): ให้ CDN ของ Vercel เก็บไว้
    // ใหม่ทุก 60 วินาที · ระหว่างโหลดใหม่ใช้ของเดิมไปก่อน · เซิร์ฟเวอร์หรือฐานข้อมูลล่ม → CDN ใช้หน้าเดิมได้ 7 วัน
    // หน้าตัวอย่าง (preview/template-preview) และ API ไม่เก็บ
    const cdn = [{ key: "Vercel-CDN-Cache-Control", value: "max-age=60, stale-while-revalidate=86400, stale-if-error=604800" }];
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ] },
      { source: "/", headers: cdn },
      { source: "/order", headers: cdn },
      { source: "/s/:slug", headers: cdn },
      { source: "/s/:slug/order", headers: cdn },
    ];
  },
};
