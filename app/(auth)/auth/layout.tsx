import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl rounded-[24px] bg-white shadow-[0_22px_45px_-30px_rgba(15,23,42,0.28)] border border-border/70 flex items-center justify-center">
        <div className="w-full max-w-[520px] py-12 px-6 md:px-10">{children}</div>
      </div>
    </div>
  );
}
