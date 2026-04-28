import { useState, useEffect } from "react";
import { Link } from "wouter";
import { MessageCircle, X, ArrowLeft, ChevronRight, CheckCircle } from "lucide-react";

type Screen =
  | "menu"
  | "faq_reuniones" | "faq_ubicacion" | "faq_creemos" | "faq_unirse"
  | "actividades"
  | "misioneros_check" | "misioneros_miembro" | "misioneros_no" | "misioneros_sent"
  | "entrevista_check" | "entrevista_form" | "entrevista_lider" | "entrevista_sent"
  | "whatsapp";

interface WardInfo {
  wardName: string | null;
  sacramentMeetingTime: string | null;
  meetingCenterName: string | null;
  meetingCenterAddress: string | null;
  whatsappPhone: string | null;
}

const ASUNTOS = [
  "Consejo personal",
  "Recomendación de templo",
  "Llamamiento",
  "Bendición de salud",
  "Asuntos generales",
  "Otro",
];

const LIDERES = [
  { v: "obispo",      l: "Obispo" },
  { v: "consejero_1", l: "Primer Consejero" },
  { v: "consejero_2", l: "Segundo Consejero" },
];

// ── UI atoms ──────────────────────────────────────────────────────────────────

function ChioAvatar() {
  return (
    <div className="shrink-0 w-7 h-7 rounded-full bg-[#C9A227] flex items-center justify-center text-[#070709] font-black text-xs select-none">
      C
    </div>
  );
}

function ChioMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <ChioAvatar />
      <div
        className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-white/80 leading-relaxed"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", maxWidth: "88%" }}
      >
        {children}
      </div>
    </div>
  );
}

function Opt({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left text-sm px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-all"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.70)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.70)"; }}
    >
      <span>{children}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-[#C9A227] hover:bg-[#d4ac2c] disabled:opacity-40 text-[#070709] font-semibold text-xs px-4 py-2.5 rounded-full transition-all flex items-center justify-center gap-2"
    >
      {children}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[11px] mb-3 transition-colors" style={{ color: "rgba(255,255,255,0.28)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.28)"; }}>
      <ArrowLeft className="h-3 w-3" /> Volver
    </button>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>
        {label}{required && <span className="text-[#C9A227] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-400 mt-0.5">{error}</p>}
    </div>
  );
}

const inputCls = "w-full text-xs px-3 py-2 rounded-lg transition-colors placeholder:text-white/20 focus:outline-none text-white";
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" };

function GdprCheck({ value, onChange, error }: { value: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="mt-0.5 accent-[#C9A227]" />
        <span className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
          Acepto el tratamiento de mis datos para gestionar esta solicitud.{" "}
          <Link href="/politica-privacidad">
            <span className="underline cursor-pointer" style={{ color: "rgba(201,162,39,0.65)" }}>Ver política</span>
          </Link>
        </span>
      </label>
      {error && <p className="text-[10px] text-red-400 mt-0.5">{error}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChioChat() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("menu");
  const [navStack, setNavStack] = useState<Screen[]>([]);

  const [wardInfo, setWardInfo] = useState<WardInfo>({
    wardName: null, sacramentMeetingTime: null,
    meetingCenterName: null, meetingCenterAddress: null, whatsappPhone: null,
  });
  const [activities, setActivities] = useState<any[]>([]);

  const [form, setForm] = useState({ nombre: "", apellidos: "", email: "", telefono: "", asunto: "", notas: "", mensaje: "", gdpr: false });
  const [isMisionerosMiembro, setIsMisionerosMiembro] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/public/ward-info").then(r => r.json()).then(d => setWardInfo(d)).catch(() => {});
    fetch("/api/public/activities").then(r => r.json()).then(d => setActivities(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const nav = (s: Screen) => { setNavStack(h => [...h, screen]); setScreen(s); };
  const back = () => { const p = navStack[navStack.length - 1] ?? "menu"; setNavStack(h => h.slice(0, -1)); setScreen(p); };
  const goMenu = () => { setNavStack([]); setScreen("menu"); setForm({ nombre: "", apellidos: "", email: "", telefono: "", asunto: "", notas: "", mensaje: "", gdpr: false }); setErrors({}); };
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const ward = wardInfo.wardName ?? "el barrio";
  const mapsUrl = wardInfo.meetingCenterAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wardInfo.meetingCenterAddress)}`
    : null;
  const waUrl = wardInfo.whatsappPhone
    ? `https://wa.me/${wardInfo.whatsappPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, me gustaría hablar con alguien de ${ward}`)}`
    : null;

  const upcoming = activities
    .filter(a => new Date(a.date) > new Date())
    .slice(0, 4);

  const validateEntrevista = () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = "Obligatorio";
    if (!form.apellidos.trim()) e.apellidos = "Obligatorio";
    if (!form.email.trim()) e.email = "Obligatorio";
    if (!form.asunto) e.asunto = "Elige un asunto";
    if (!form.gdpr) e.gdpr = "Debes aceptar el tratamiento de datos";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateMisioneros = () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = "Obligatorio";
    if (!form.apellidos.trim()) e.apellidos = "Obligatorio";
    if (!form.email.trim() && !form.telefono.trim()) e.contacto = "Proporciona email o teléfono";
    if (!form.gdpr) e.gdpr = "Debes aceptar el tratamiento de datos";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitMisioneros = async (isMember: boolean) => {
    if (!validateMisioneros()) return;
    setSubmitting(true);
    try {
      await fetch("/api/public/missionary-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.nombre.trim()} ${form.apellidos.trim()}`,
          email: form.email || undefined,
          phone: form.telefono || undefined,
          message: form.mensaje || undefined,
          isMember,
        }),
      });
    } catch {}
    setSubmitting(false);
    nav("misioneros_sent");
  };

  const submitEntrevista = async (leaderRole: string) => {
    setSubmitting(true);
    try {
      await fetch("/api/public/interview-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, leaderRole }),
      });
    } catch {}
    setSubmitting(false);
    setNavStack([]);
    setScreen("entrevista_sent");
  };

  // ── Screens ──────────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (screen) {

      case "menu":
        return (
          <div className="space-y-1.5">
            <ChioMsg>¡Hola! Soy Chio 👋<br />¿En qué puedo ayudarte?</ChioMsg>
            <div className="space-y-1.5">
              <Opt onClick={() => nav("faq_reuniones")}>📅 ¿Cuándo son las reuniones?</Opt>
              <Opt onClick={() => nav("faq_ubicacion")}>📍 ¿Dónde estáis?</Opt>
              <Opt onClick={() => nav("faq_creemos")}>📖 ¿Qué creemos?</Opt>
              <Opt onClick={() => nav("faq_unirse")}>❓ ¿Cómo puedo unirme?</Opt>
              <Opt onClick={() => nav("actividades")}>🎯 Próximas actividades</Opt>
              <Opt onClick={() => nav("misioneros_check")}>🕊️ Contactar con los misioneros</Opt>
              <Opt onClick={() => nav("entrevista_check")}>🗓️ Solicitar entrevista</Opt>
              <Opt onClick={() => nav("whatsapp")}>💬 Hablar con alguien del barrio</Opt>
            </div>
          </div>
        );

      case "faq_reuniones":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              Nos reunimos cada <strong className="text-white">domingo</strong>
              {wardInfo.sacramentMeetingTime ? <> a las <strong className="text-white">{wardInfo.sacramentMeetingTime}h</strong></> : ""}.
              {wardInfo.meetingCenterName && <><br /><br />En <strong className="text-white">{wardInfo.meetingCenterName}</strong>.</>}
              {wardInfo.meetingCenterAddress && <><br />{wardInfo.meetingCenterAddress}.</>}
              <br /><br />¡Todos son bienvenidos! 🙌
            </ChioMsg>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <PrimaryBtn onClick={() => {}}>Ver cómo llegar →</PrimaryBtn>
              </a>
            )}
          </div>
        );

      case "faq_ubicacion":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              {wardInfo.meetingCenterName && <><strong className="text-white">{wardInfo.meetingCenterName}</strong><br /></>}
              {wardInfo.meetingCenterAddress || "La dirección no está configurada aún."}
            </ChioMsg>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <PrimaryBtn onClick={() => {}}>Abrir en Google Maps →</PrimaryBtn>
              </a>
            )}
          </div>
        );

      case "faq_creemos":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              Creemos en <strong className="text-white">Jesucristo</strong> y en su Expiación, en la{" "}
              <strong className="text-white">familia eterna</strong> y en el evangelio restaurado.
              La Biblia y el Libro de Mormón son nuestras escrituras.
            </ChioMsg>
            <a href="https://www.churchofjesuschrist.org/comeuntochrist/es" target="_blank" rel="noopener noreferrer">
              <Opt onClick={() => {}}>Saber más en churchofjesuschrist.org →</Opt>
            </a>
          </div>
        );

      case "faq_unirse":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              ¡Nos alegra que preguntes! Puedes:<br /><br />
              • Visitarnos cualquier <strong className="text-white">domingo</strong>
              {wardInfo.sacramentMeetingTime ? ` a las ${wardInfo.sacramentMeetingTime}h` : ""}<br />
              • Hablar con los <strong className="text-white">misioneros</strong><br />
              • Solicitar una <strong className="text-white">entrevista</strong> con el obispo
            </ChioMsg>
            <div className="space-y-1.5">
              <Opt onClick={() => nav("misioneros_check")}>🕊️ Contactar misioneros</Opt>
              <Opt onClick={() => nav("entrevista_check")}>🗓️ Solicitar entrevista</Opt>
            </div>
          </div>
        );

      case "actividades":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              {upcoming.length > 0
                ? "Estas son las próximas actividades:"
                : "No hay actividades programadas próximamente. ¡Vuelve pronto!"}
            </ChioMsg>
            {upcoming.length > 0 && (
              <div className="space-y-2 mb-3">
                {upcoming.map(a => {
                  const d = new Date(a.date);
                  const dateStr = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
                  const timeStr = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
                  return (
                    <div key={a.id} className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xs font-semibold text-white/85">{a.title}</p>
                      <p className="text-[10px] mt-0.5 capitalize" style={{ color: "rgba(255,255,255,0.40)" }}>{dateStr} · {timeStr}h</p>
                      {a.location && <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>{a.location}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <Link href="/actividades">
              <Opt onClick={() => {}}>Ver todas las actividades →</Opt>
            </Link>
          </div>
        );

      case "misioneros_check":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>¿Eres miembro de La Iglesia de Jesucristo?</ChioMsg>
            <div className="space-y-1.5">
              <Opt onClick={() => { setIsMisionerosMiembro(true); nav("misioneros_miembro"); }}>Sí, soy miembro</Opt>
              <Opt onClick={() => { setIsMisionerosMiembro(false); nav("misioneros_no"); }}>Todavía no</Opt>
            </div>
          </div>
        );

      case "misioneros_miembro":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>Déjanos tus datos y el líder misional se pondrá en contacto contigo.</ChioMsg>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre" required error={errors.nombre}>
                  <input className={inputCls} style={inputStyle} placeholder="Tu nombre" value={form.nombre} onChange={e => setF("nombre", e.target.value)} />
                </Field>
                <Field label="Apellidos" required error={errors.apellidos}>
                  <input className={inputCls} style={inputStyle} placeholder="Apellidos" value={form.apellidos} onChange={e => setF("apellidos", e.target.value)} />
                </Field>
              </div>
              <Field label="Email" required error={errors.email}>
                <input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={form.email} onChange={e => setF("email", e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={form.telefono} onChange={e => setF("telefono", e.target.value)} />
              </Field>
              {errors.contacto && <p className="text-[10px] text-red-400">{errors.contacto}</p>}
              <GdprCheck value={form.gdpr} onChange={v => setF("gdpr", v)} error={errors.gdpr} />
              <PrimaryBtn onClick={() => submitMisioneros(true)} disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar →"}
              </PrimaryBtn>
            </div>
          </div>
        );

      case "misioneros_no":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>¡Estupendo! Déjanos tus datos y nuestros misioneros se pondrán en contacto contigo 🙏</ChioMsg>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre" required error={errors.nombre}>
                  <input className={inputCls} style={inputStyle} placeholder="Tu nombre" value={form.nombre} onChange={e => setF("nombre", e.target.value)} />
                </Field>
                <Field label="Apellidos" required error={errors.apellidos}>
                  <input className={inputCls} style={inputStyle} placeholder="Apellidos" value={form.apellidos} onChange={e => setF("apellidos", e.target.value)} />
                </Field>
              </div>
              <Field label="Email" error={errors.contacto}>
                <input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={form.email} onChange={e => setF("email", e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={form.telefono} onChange={e => setF("telefono", e.target.value)} />
              </Field>
              <Field label="¿Qué te gustaría saber?">
                <textarea rows={2} className={inputCls + " resize-none"} style={inputStyle} placeholder="Cuéntanos…" value={form.mensaje} onChange={e => setF("mensaje", e.target.value)} />
              </Field>
              <GdprCheck value={form.gdpr} onChange={v => setF("gdpr", v)} error={errors.gdpr} />
              <PrimaryBtn onClick={() => submitMisioneros(false)} disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar →"}
              </PrimaryBtn>
            </div>
          </div>
        );

      case "misioneros_sent":
        return (
          <div className="text-center py-6">
            <CheckCircle className="h-10 w-10 text-[#C9A227] mx-auto mb-3" />
            <p className="text-sm font-semibold text-white mb-2">¡Datos recibidos!</p>
            <p className="text-xs leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.42)" }}>
              {isMisionerosMiembro
                ? "El líder misional se pondrá en contacto contigo pronto."
                : "Nuestros misioneros se pondrán en contacto contigo pronto. ¡Hasta pronto! 🙏"}
            </p>
            <button onClick={goMenu} className="text-xs transition-colors" style={{ color: "rgba(201,162,39,0.65)" }}>← Volver al menú</button>
          </div>
        );

      case "entrevista_check":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>¿Eres miembro de La Iglesia de Jesucristo?</ChioMsg>
            <div className="space-y-1.5">
              <Opt onClick={() => nav("entrevista_form")}>Sí, soy miembro</Opt>
              <Opt onClick={() => { setIsMisionerosMiembro(false); nav("misioneros_no"); }}>Todavía no — contáctame con los misioneros</Opt>
            </div>
          </div>
        );

      case "entrevista_form":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>
              Rellena tus datos para solicitar la entrevista. Los guardaremos para futuras comunicaciones del barrio.
            </ChioMsg>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre" required error={errors.nombre}>
                  <input className={inputCls} style={inputStyle} placeholder="Tu nombre" value={form.nombre} onChange={e => setF("nombre", e.target.value)} />
                </Field>
                <Field label="Apellidos" required error={errors.apellidos}>
                  <input className={inputCls} style={inputStyle} placeholder="Apellidos" value={form.apellidos} onChange={e => setF("apellidos", e.target.value)} />
                </Field>
              </div>
              <Field label="Email" required error={errors.email}>
                <input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={form.email} onChange={e => setF("email", e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={form.telefono} onChange={e => setF("telefono", e.target.value)} />
              </Field>
              <Field label="Asunto" required error={errors.asunto}>
                <select
                  value={form.asunto}
                  onChange={e => setF("asunto", e.target.value)}
                  className={inputCls}
                  style={{ ...inputStyle, WebkitAppearance: "none" }}
                >
                  <option value="" disabled>Selecciona un asunto…</option>
                  {ASUNTOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Notas adicionales">
                <textarea rows={2} className={inputCls + " resize-none"} style={inputStyle} placeholder="Añade contexto si lo deseas…" value={form.notas} onChange={e => setF("notas", e.target.value)} />
              </Field>
              <GdprCheck value={form.gdpr} onChange={v => setF("gdpr", v)} error={errors.gdpr} />
              <PrimaryBtn onClick={() => { if (validateEntrevista()) nav("entrevista_lider"); }}>
                Continuar →
              </PrimaryBtn>
            </div>
          </div>
        );

      case "entrevista_lider":
        return (
          <div>
            <BackBtn onClick={back} />
            <ChioMsg>¿Con quién te gustaría tener la entrevista?</ChioMsg>
            <div className="space-y-1.5">
              {LIDERES.map(l => (
                <Opt key={l.v} onClick={() => submitEntrevista(l.v)}>{l.l}</Opt>
              ))}
            </div>
            {submitting && <p className="text-center text-[11px] mt-3" style={{ color: "rgba(255,255,255,0.30)" }}>Enviando solicitud…</p>}
          </div>
        );

      case "entrevista_sent":
        return (
          <div className="text-center py-6">
            <CheckCircle className="h-10 w-10 text-[#C9A227] mx-auto mb-3" />
            <p className="text-sm font-semibold text-white mb-2">¡Solicitud enviada!</p>
            <p className="text-xs leading-relaxed mb-1" style={{ color: "rgba(255,255,255,0.42)" }}>
              Recibirás la confirmación por email en <strong className="text-white/70">menos de 24 horas</strong>.
            </p>
            <p className="text-[11px] leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Si no recibes respuesta, vuelve a contactarnos.
            </p>
            <button onClick={goMenu} className="text-xs transition-colors" style={{ color: "rgba(201,162,39,0.65)" }}>← Volver al menú</button>
          </div>
        );

      case "whatsapp":
        return (
          <div>
            <BackBtn onClick={back} />
            {waUrl ? (
              <>
                <ChioMsg>Te abrimos WhatsApp para que puedas hablar directamente con alguien del barrio 💬</ChioMsg>
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <PrimaryBtn onClick={() => {}}>Abrir WhatsApp →</PrimaryBtn>
                </a>
              </>
            ) : (
              <>
                <ChioMsg>
                  En este momento no hay nadie disponible para el chat en directo. Puedes dejarnos un mensaje o solicitar una entrevista 🙏
                </ChioMsg>
                <div className="space-y-1.5">
                  <Opt onClick={() => nav("entrevista_check")}>🗓️ Solicitar entrevista</Opt>
                  <Link href="/contacto-misioneros"><Opt onClick={() => {}}>📩 Formulario de contacto</Opt></Link>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ── Shell ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => !o); }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{ background: "#C9A227", color: "#070709", boxShadow: "0 8px 32px rgba(201,162,39,0.35)" }}
      >
        {open ? <X className="h-4 w-4" /> : <><MessageCircle className="h-4 w-4" /><span>Chio</span></>}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{
            width: 320,
            maxHeight: "calc(100svh - 140px)",
            background: "#0d0d0f",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background: "#111113", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-8 h-8 rounded-full bg-[#C9A227] flex items-center justify-center text-[#070709] font-black text-sm">C</div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Chio</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Asistente del {ward}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>En línea</span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
            {renderContent()}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[9px] text-center" style={{ color: "rgba(255,255,255,0.13)" }}>
              {ward} · La Iglesia de Jesucristo
            </p>
          </div>
        </div>
      )}
    </>
  );
}
