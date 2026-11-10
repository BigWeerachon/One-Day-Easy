"use client";
import { useActionState } from "react";
import { intakeStateAction, type IntakeState } from "@/lib/portal-actions";
import ImageInput from "./ImageInput";
import SubmitButton from "./SubmitButton";

export default function IntakeForm({ token, initial }: { token: string; initial: Record<string, string> }) {
  const [state, action] = useActionState<IntakeState, FormData>(intakeStateAction, {});
  const v = { ...initial, ...(state.values ?? {}) };
  return (
    // key เปลี่ยนทุกครั้งที่มีผลกลับมา → ช่องใช้ค่าที่ลูกค้ากรอกไว้ล่าสุด
    <form action={action} className="pt-bd" style={{ padding: 0 }} key={state.nonce ?? 0}>
      <input type="hidden" name="t" value={token} />
      {state.error && <div className="pt-err" role="alert">{state.error}{state.values && " · รูปต้องเลือกใหม่อีกครั้ง"}</div>}
      <div className="pt-card">
        <label className="pt-lbl" style={{ marginTop: 0 }} htmlFor="n">ชื่อร้าน</label><input id="n" name="name" className="pt-inp" defaultValue={v.name} required maxLength={80} />
        <label className="pt-lbl" htmlFor="ph">เบอร์โทร</label><input id="ph" name="phone" className="pt-inp" inputMode="tel" placeholder="08x-xxx-xxxx" defaultValue={v.phone} maxLength={20} />
        <label className="pt-lbl" htmlFor="em">อีเมล (ไม่บังคับ · รับใบแจ้งหนี้และใบเสร็จ)</label><input id="em" name="email" type="email" className="pt-inp" placeholder="you@example.com" defaultValue={v.email} maxLength={120} />
        <label className="pt-lbl" htmlFor="h">เวลาเปิด-ปิด</label><input id="h" name="hours" className="pt-inp" placeholder="เช่น ทุกวัน 07:00–14:00" defaultValue={v.hours} maxLength={80} />
        <label className="pt-lbl" htmlFor="ct">ลูกค้าเป็น</label>
        <select id="ct" name="customerType" className="pt-inp" defaultValue={v.customerType}><option value="person">บุคคลทั่วไป / ร้านค้า</option><option value="company">บริษัท / หจก.</option><option value="government">หน่วยงานราชการ</option><option value="foreigner">ชาวต่างชาติ</option></select>
      </div>
      <div className="pt-card pt-co">
        <div style={{ fontWeight: 600 }}>ข้อมูลสำหรับออกใบกำกับภาษี</div>
        <label className="pt-lbl" htmlFor="ln">ชื่อตามหนังสือรับรอง</label><input id="ln" name="legalName" className="pt-inp" defaultValue={v.legalName} maxLength={160} />
        <label className="pt-lbl" htmlFor="tx">เลขประจำตัวผู้เสียภาษี 13 หลัก</label><input id="tx" name="taxId" className="pt-inp" inputMode="numeric" placeholder="0105xxxxxxxxx" defaultValue={v.taxId} maxLength={17} />
        <label className="pt-lbl" htmlFor="br">สำนักงาน</label><select id="br" name="branch" className="pt-inp" defaultValue={v.branch}><option value="hq">สำนักงานใหญ่</option><option value="branch">สาขา</option></select>
        <label className="pt-lbl" htmlFor="bn">เลขสาขา (ถ้าเป็นสาขา)</label><input id="bn" name="branchNo" className="pt-inp" inputMode="numeric" maxLength={5} defaultValue={v.branchNo} />
        <label className="pt-lbl" htmlFor="ad">ที่อยู่จดทะเบียน</label><textarea id="ad" name="address" className="pt-inp" rows={3} defaultValue={v.address} maxLength={300} />
        <label className="pt-lbl" htmlFor="po">เลข PO (ถ้ามี)</label><input id="po" name="poNo" className="pt-inp" defaultValue={v.poNo} maxLength={40} />
        <label className="pt-sm" style={{ display: "flex", gap: 10, marginTop: 12 }}><input type="checkbox" name="wht" defaultChecked={!!v.wht} /> หัก ณ ที่จ่าย 3% (ค่าบริการ)</label>
      </div>
      <div className="pt-card"><div style={{ fontWeight: 600 }}>รูปและโลโก้</div><p className="pt-sm pt-mut" style={{ marginBottom: 10 }}>ระบบย่อรูปให้อัตโนมัติ ส่งจากมือถือได้เลย (สูงสุด 10 รูป)</p>
        <ImageInput name="photos" multiple label="+ เลือกรูป" /></div>
      <div className="pt-card"><label className="pt-sm" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" name="pdpa" required defaultChecked={!!v.pdpa} style={{ marginTop: 3 }} /> ยินยอมให้ One Day Easy เก็บและใช้ข้อมูลนี้เพื่อทำเว็บไซต์ ตามนโยบายความเป็นส่วนตัว (PDPA)</label></div>
      <SubmitButton className="pt-btn" pending="กำลังส่ง…">ส่งข้อมูล</SubmitButton>
    </form>
  );
}
