import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ExternalLink } from "lucide-react";

interface WardInfo { wardName: string | null; stakeName: string | null; }

export default function PrivacyPolicyPage() {
  const [wardInfo, setWardInfo] = useState<WardInfo>({ wardName: null, stakeName: null });

  useEffect(() => {
    fetch("/api/public/ward-info").then(r => r.json()).then(d => setWardInfo(d)).catch(() => {});
  }, []);

  const wardName = wardInfo.wardName ?? "Barrio";
  const year = new Date().getFullYear();

  useEffect(() => {
    document.title = `Política de privacidad · ${wardName}`;
    return () => { document.title = "Barrio · La Iglesia de Jesucristo"; };
  }, [wardName]);

  return (
    <div className="min-h-screen bg-[#070709] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#070709]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-2 text-white/40 hover:text-white/80 transition-colors text-sm">
              <ArrowLeft className="h-4 w-4" />
              {wardName}
            </button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-3">Legal</p>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Política de Privacidad</h1>
        <p className="text-white/35 text-sm mb-12">Última actualización: {new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-3">1. Responsable del tratamiento</h2>
            <p>
              El responsable del tratamiento de los datos en este sitio web es el <strong className="text-white/80">{wardName}</strong>,
              congregación de <strong className="text-white/80">La Iglesia de Jesucristo de los Santos de los Últimos Días</strong>.
              Para cualquier consulta relacionada con la protección de datos puedes contactarnos a través del
              formulario de solicitud disponible en este sitio.
            </p>
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>
            <h2 className="text-base font-semibold text-white mb-3">2. Datos que tratamos</h2>
            <p className="mb-4">
              Este sitio web trata exclusivamente los datos mínimos necesarios para su funcionamiento:
            </p>
            <ul className="space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <span className="text-[#C9A227] mt-0.5 shrink-0">·</span>
                <span><strong className="text-white/75">Datos de sesión:</strong> identificador de sesión generado automáticamente para los líderes que acceden al panel de gestión. No se almacena información personal en la cookie de sesión.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C9A227] mt-0.5 shrink-0">·</span>
                <span><strong className="text-white/75">Solicitudes de acceso:</strong> si completas el formulario de solicitud de acceso, tratamos tu nombre y correo electrónico con el fin de gestionar tu alta como usuario de la plataforma. La base jurídica es tu consentimiento explícito.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C9A227] mt-0.5 shrink-0">·</span>
                <span><strong className="text-white/75">Registros de acceso:</strong> el servidor registra automáticamente la dirección IP y el navegador de los visitantes con fines de seguridad y diagnóstico. Estos registros se eliminan periódicamente.</span>
              </li>
            </ul>
            <p className="mt-4 text-white/40 text-xs">
              No utilizamos cookies de rastreo, publicidad ni análisis de terceros. No cedemos datos a terceros salvo obligación legal.
            </p>
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. Cookies</h2>
            <p className="mb-4">Este sitio utiliza únicamente <strong className="text-white/75">cookies técnicas estrictamente necesarias</strong> que no requieren consentimiento según la Directiva ePrivacy y el RGPD:</p>
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                    <th className="text-left px-4 py-3 text-white/50 font-semibold">Cookie</th>
                    <th className="text-left px-4 py-3 text-white/50 font-semibold">Propósito</th>
                    <th className="text-left px-4 py-3 text-white/50 font-semibold">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/[0.05]">
                    <td className="px-4 py-3 font-mono text-white/60">session_id</td>
                    <td className="px-4 py-3 text-white/45">Mantiene la sesión autenticada de líderes</td>
                    <td className="px-4 py-3 text-white/45">Sesión</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-white/60">cookie_consent_v1</td>
                    <td className="px-4 py-3 text-white/45">Recuerda que aceptaste este aviso</td>
                    <td className="px-4 py-3 text-white/45">1 año (localStorage)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. Tus derechos (RGPD)</h2>
            <p className="mb-4">Si eres usuario registrado o nos has proporcionado datos personales, puedes ejercer los siguientes derechos:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["Acceso", "Conocer qué datos tuyos tratamos."],
                ["Rectificación", "Corregir datos inexactos o incompletos."],
                ["Supresión", "Solicitar la eliminación de tus datos."],
                ["Portabilidad", "Recibir tus datos en formato estructurado."],
                ["Oposición", "Oponerte al tratamiento de tus datos."],
                ["Limitación", "Solicitar que restrinjamos el tratamiento."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <p className="text-white/75 font-medium text-xs mb-1">{title}</p>
                  <p className="text-white/40 text-xs">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-white/40 text-xs">
              También puedes presentar una reclamación ante la{" "}
              <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-[#C9A227]/70 hover:text-[#C9A227] underline underline-offset-2 transition-colors">
                Agencia Española de Protección de Datos (AEPD)
              </a>.
            </p>
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. Política de privacidad de la Iglesia</h2>
            <p>
              Como congregación de La Iglesia de Jesucristo de los Santos de los Últimos Días, también aplica la
              política de privacidad global de la Iglesia para los servicios y datos gestionados a nivel institucional.
            </p>
            <a
              href="https://www.churchofjesuschrist.org/legal/privacy-notice?lang=spa"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-[#C9A227]/70 hover:text-[#C9A227] transition-colors"
            >
              Ver política de privacidad de la Iglesia <ExternalLink className="h-3 w-3" />
            </a>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-14 pt-8 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-[11px] text-white/20">© {year} {wardName}</p>
          <Link href="/">
            <button className="text-xs text-white/25 hover:text-white/55 transition-colors">← Volver al inicio</button>
          </Link>
        </div>
      </main>
    </div>
  );
}
