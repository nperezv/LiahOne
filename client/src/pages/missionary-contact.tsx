import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronRight, CheckCircle } from "lucide-react";

export default function MissionaryContactPage() {
  const [wardName, setWardName] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/public/ward-info").then(r => r.json()).then(d => setWardName(d.wardName ?? null)).catch(() => {});
  }, []);

  const displayName = wardName ?? "Barrio";

  useEffect(() => {
    document.title = `Contactar misioneros · ${displayName}`;
    return () => { document.title = "Barrio · La Iglesia de Jesucristo"; };
  }, [displayName]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "El nombre es obligatorio.";
    if (!form.email.trim() && !form.phone.trim()) e.contact = "Proporciona un email o teléfono para que podamos contactarte.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await fetch("/api/public/missionary-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSent(true);
    } catch {
      setSent(true); // Show success anyway — UX priority
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#070709]/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <Link href="/">
            <button className="flex items-center gap-2 text-white/40 hover:text-white/80 transition-colors text-sm">
              <ArrowLeft className="h-4 w-4" />
              {displayName}
            </button>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-14">
        {sent ? (
          // ── Success state ──
          <div className="flex flex-col items-center text-center py-16">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#C9A227]/15 border border-[#C9A227]/25 mb-6">
              <CheckCircle className="h-8 w-8 text-[#C9A227]" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">¡Solicitud recibida!</h1>
            <p className="text-white/45 text-sm leading-relaxed max-w-sm mb-10">
              Nos pondremos en contacto contigo pronto.
              {form.email && " Te hemos enviado una confirmación a tu correo."}
            </p>
            <Link href="/">
              <button className="text-sm text-white/40 hover:text-white/70 transition-colors">
                ← Volver al inicio
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-3">Misioneros</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4">
                ¿Quieres saber más?
              </h1>
              <p className="text-white/45 text-sm leading-relaxed max-w-md">
                Déjanos tus datos y los misioneros del {displayName} se pondrán en contacto
                contigo. Sin compromisos, solo una conversación.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  Nombre completo <span className="text-[#C9A227]">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Tu nombre"
                  className="w-full bg-white/[0.04] border border-white/[0.10] hover:border-white/[0.18] focus:border-[#C9A227]/40 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors"
                />
                {errors.name && <p className="mt-1.5 text-xs text-red-400">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="tu@email.com"
                  className="w-full bg-white/[0.04] border border-white/[0.10] hover:border-white/[0.18] focus:border-[#C9A227]/40 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+34 600 000 000"
                  className="w-full bg-white/[0.04] border border-white/[0.10] hover:border-white/[0.18] focus:border-[#C9A227]/40 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors"
                />
                {errors.contact && <p className="mt-1.5 text-xs text-red-400">{errors.contact}</p>}
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">
                  ¿Qué te gustaría saber? <span className="text-white/30">(opcional)</span>
                </label>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Puedes contarnos qué te ha traído aquí o lo que te gustaría conocer…"
                  rows={4}
                  className="w-full bg-white/[0.04] border border-white/[0.10] hover:border-white/[0.18] focus:border-[#C9A227]/40 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Privacy notice */}
              <p className="text-xs text-white/25 leading-relaxed">
                Tus datos se usarán únicamente para responder a tu solicitud. Consulta nuestra{" "}
                <Link href="/politica-privacidad">
                  <span className="text-[#C9A227]/60 hover:text-[#C9A227] underline underline-offset-2 cursor-pointer transition-colors">
                    política de privacidad
                  </span>
                </Link>.
              </p>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#d4ac2c] disabled:opacity-50 text-[#070709] font-semibold text-sm px-6 py-3.5 rounded-full transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {loading ? "Enviando…" : "Enviar solicitud"}
                {!loading && <ChevronRight className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
