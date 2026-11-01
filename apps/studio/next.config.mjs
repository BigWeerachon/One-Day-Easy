/** @type {import('next').NextConfig} */
export default {
  // รูปถูกย่อในเบราว์เซอร์ก่อนส่ง (≤1600px) · Vercel รับ body ได้ไม่เกิน 4.5MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
