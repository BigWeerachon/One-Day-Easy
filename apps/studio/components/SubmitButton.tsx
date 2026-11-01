"use client";
import { useFormStatus } from "react-dom";
export default function SubmitButton({ children, pending, className = "btn" }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return <button className={className} disabled={busy} aria-busy={busy}>{busy ? pending : children}</button>;
}
