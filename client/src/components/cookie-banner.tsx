import { useState, useEffect } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";

const STORAGE_KEY = "cookie_consent_v1";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, "accepted"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4"
      role="region"
      aria-label="Aviso de cookies"
    >
      <div
        className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-white/[0.10] px-5 py-4"
        style={{ background: "rgba(12,12,14,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <p className="text-xs text-white/55 leading-relaxed flex-1">
          Este sitio usa <strong className="text-white/70 font-medium">cookies técnicas necesarias</strong> para
          su funcionamiento (sesión de usuario). No usamos cookies de rastreo ni publicidad.{" "}
          <Link href="/politica-privacidad">
            <span className="text-[#C9A227]/70 hover:text-[#C9A227] underline underline-offset-2 cursor-pointer transition-colors">
              Política de privacidad
            </span>
          </Link>
        </p>
        <button
          onClick={accept}
          className="shrink-0 flex items-center gap-2 bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white/80 hover:text-white text-xs font-semibold px-4 py-2 rounded-full transition-all"
        >
          Entendido
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
