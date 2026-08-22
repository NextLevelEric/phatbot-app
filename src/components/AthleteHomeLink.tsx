"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AthleteHomeLink() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 120);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  // The dashboard already carries the primary PHATBOT brand, and coach/admin
  // surfaces have their own navigation model. Keep this control focused on the
  // athlete experience where getting home during training should be effortless.
  if (pathname === "/" || pathname.startsWith("/auth") || pathname.startsWith("/coach") || pathname.startsWith("/admin")) return null;

  return (
    <Link
      href="/"
      aria-label="Return to athlete dashboard"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed left-3 top-[max(.75rem,env(safe-area-inset-top))] z-50 rounded-full border border-zinc-700/80 bg-black/90 px-3 py-2 text-xs font-black uppercase tracking-[.18em] text-white shadow-lg backdrop-blur transition-all duration-200 hover:border-[#ff0032] focus:outline-none focus:ring-2 focus:ring-[#ff0032] sm:left-5 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"}`}
    >
      PHATBOT
    </Link>
  );
}
