import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
// scrypt (N=2^15, r=8, p=1) · รูปแบบ scrypt$N$r$p$salt$hash (base64)
const N = 32768, R = 8, P = 1, LEN = 64;
const derive = (pw: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((ok, err) => scrypt(pw.normalize("NFKC"), salt, LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? err(e) : ok(k))));

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await derive(pw, salt)).toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await derive(pw, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return got.length === expected.length && timingSafeEqual(got, expected);
}
