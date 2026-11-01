"use client";
import { useRef, useState } from "react";

/** เลือกรูปแล้วย่อในเบราว์เซอร์ (ด้านยาว ≤ max px, JPEG) ก่อนส่ง · ถ้าย่อไม่ได้ใช้ไฟล์เดิม */
async function shrink(file: File, max: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 700_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export default function ImageInput({ name, multiple, max = 1600, limit = 10, required, label }: { name: string; multiple?: boolean; max?: number; limit?: number; required?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label className="pt-pick">
        <input ref={ref} type="file" name={name} accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} required={required} aria-label={label}
          onChange={async (e) => {
            const input = e.currentTarget, picked = [...(input.files ?? [])].slice(0, limit);
            setBusy(true);
            const out = await Promise.all(picked.map((f) => shrink(f, max)));
            const dt = new DataTransfer(); out.forEach((f) => dt.items.add(f)); input.files = dt.files;
            setPreviews(out.map((f) => URL.createObjectURL(f))); setBusy(false);
          }} />
        <span>{busy ? "กำลังย่อรูป…" : label}</span>
      </label>
      {previews.length > 0 && <div className="pt-thumbs">{previews.map((u, i) => <img key={i} src={u} alt={`รูปที่ ${i + 1}`} />)}</div>}
    </div>
  );
}
