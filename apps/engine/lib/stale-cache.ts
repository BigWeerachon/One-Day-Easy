// แคชที่ "ใช้ของเก่าได้เมื่อฐานข้อมูลล่ม"
// ปกติ: ค่าใหม่ทุก ttl · ถ้าโหลดค่าใหม่ไม่สำเร็จ (ฐานข้อมูลล่ม/ช้า) ใช้ค่าล่าสุดที่เคยได้ต่อไปได้นานสุด staleFor
// เว็บร้านจึงยังเปิดได้ตอนฐานข้อมูลมีปัญหา (ร้านที่เคยมีคนเปิดในเครื่องนี้ภายใน staleFor)
export interface StaleCache<T> { get(key: string, load: () => Promise<T>): Promise<T>; size(): number }
export function staleCache<T>(o: { ttl: number; staleFor: number; max?: number; now?: () => number; onStale?: (key: string, err: unknown) => void }): StaleCache<T> {
  const now = o.now ?? Date.now;
  const map = new Map<string, { at: number; value: T }>();
  return {
    size: () => map.size,
    async get(key, load) {
      const hit = map.get(key);
      if (hit && now() - hit.at < o.ttl) return hit.value;
      try {
        const value = await load();
        map.delete(key); // ย้ายไปท้าย (ใช้ล่าสุด)
        map.set(key, { at: now(), value });
        if (map.size > (o.max ?? 5000)) map.delete(map.keys().next().value!);
        return value;
      } catch (err) {
        if (hit && now() - hit.at < o.staleFor) { o.onStale?.(key, err); return hit.value; }
        throw err;
      }
    },
  };
}
