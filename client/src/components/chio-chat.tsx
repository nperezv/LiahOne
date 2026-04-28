import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { MessageCircle, X, Send, CheckCircle, ArrowLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChioMsg  = { id: number; from: "chio"; content: React.ReactNode };
type UserMsg  = { id: number; from: "user"; text: string };
type Msg = ChioMsg | UserMsg;

type QR = { label: string; onPress: () => void };
type FormPhase = "misioneros_miembro" | "misioneros_no" | "entrevista" | "lider" | null;

interface WardInfo {
  wardName: string | null;
  sacramentMeetingTime: string | null;
  meetingCenterName: string | null;
  meetingCenterAddress: string | null;
  whatsappPhone: string | null;
}

// ── Intent detection ──────────────────────────────────────────────────────────

const INTENTS = [
  { id: "reuniones",   kw: ["reunion","horario","hora","cuando","domingo","sacrament","misa","culto","servicio"] },
  { id: "ubicacion",   kw: ["donde","direccion","lugar","capilla","centro","llegar","ubicacion","mapa","address"] },
  { id: "creemos",     kw: ["creen","creencia","doctrina","fe","mormon","santos","libro","biblia","jesucristo","que son"] },
  { id: "unirse",      kw: ["unir","bautiz","convert","miembro","como puedo","quiero ser","agregar","hacer","registro"] },
  { id: "actividades", kw: ["actividad","evento","proxim","semana","programa","que hay","planea","agenda","ocio"] },
  { id: "misioneros",  kw: ["misionero","mision","visita","aprender","saber","conocer","hablar","contact","preguntar"] },
  { id: "entrevista",  kw: ["entrevista","obispo","consejero","cita","solicitar","reunion con","hablar con el"] },
  { id: "whatsapp",    kw: ["whatsapp","directo","alguien","persona","representante","chat","humano","real"] },
] as const;

type IntentId = typeof INTENTS[number]["id"];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ");

function detectIntents(text: string): IntentId[] {
  const n = norm(text);
  return INTENTS.filter(i => i.kw.some(k => n.includes(k))).map(i => i.id);
}

const ASUNTOS = ["Consejo personal","Recomendación de templo","Llamamiento","Bendición de salud","Asuntos generales","Otro"];
const LIDERES = [{ v: "obispo", l: "Obispo" },{ v: "consejero_1", l: "Primer Consejero" },{ v: "consejero_2", l: "Segundo Consejero" }];

const GREETING_QUOTES = [
  { text: "¡Hola! Estoy aquí para ayudarte 😊", source: null },
  { text: "«Venid a mí todos los que estáis trabajados y cargados»", source: "Mat. 11:28" },
  { text: "«El Señor es mi pastor; nada me faltará»", source: "Salmo 23:1" },
  { text: "«Confía en el Señor con todo tu corazón»", source: "Prov. 3:5" },
  { text: "«Sed valientes, y el Señor estará con vosotros»", source: "2 Cró. 19:11" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function GreetingBubble({ onOpen }: { onOpen: () => void }) {
  const [visible, setVisible] = useState(false);
  const [gone, setGone] = useState(false);
  const quote = useMemo(() => GREETING_QUOTES[Math.floor(Math.random() * GREETING_QUOTES.length)], []);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 3200);
    const hide = setTimeout(() => setVisible(false), 13000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  if (gone) return null;
  return (
    <div
      className="fixed bottom-[88px] right-6 z-50 max-w-[230px] transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)", pointerEvents: visible ? "auto" : "none" }}
    >
      <div
        className="relative rounded-2xl rounded-br-sm px-4 py-3 cursor-pointer shadow-2xl"
        style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.09)" }}
        onClick={() => { setGone(true); onOpen(); }}
      >
        <button
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.10)" }}
          onClick={e => { e.stopPropagation(); setGone(true); }}
        >
          <X className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.35)" }} />
        </button>
        <p className="text-[11px] leading-relaxed italic" style={{ color: "rgba(255,255,255,0.65)" }}>{quote.text}</p>
        {quote.source && <p className="text-[9px] mt-1.5 font-semibold" style={{ color: "rgba(201,162,39,0.65)" }}>— {quote.source}</p>}
        <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>Chio · Toca para abrir</p>
        <div className="absolute -bottom-[6px] right-4 w-3 h-3 rotate-45" style={{ background: "#111113", borderRight: "1px solid rgba(255,255,255,0.09)", borderBottom: "1px solid rgba(255,255,255,0.09)" }} />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[#C9A227] flex items-center justify-center text-[#070709] font-black text-[10px]">C</div>
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl rounded-tl-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {[0,150,300].map(d => (
          <div key={d} className="w-1.5 h-1.5 rounded-full bg-white/35 animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

function CMsg({ content }: { content: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[#C9A227] flex items-center justify-center text-[#070709] font-black text-[10px]">C</div>
      <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-white/80 leading-relaxed" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", maxWidth: "85%" }}>
        {content}
      </div>
    </div>
  );
}

function UMsg({ text }: { text: string }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] font-medium leading-relaxed" style={{ background: "rgba(201,162,39,0.18)", border: "1px solid rgba(201,162,39,0.25)", color: "rgba(255,255,255,0.85)", maxWidth: "85%" }}>
        {text}
      </div>
    </div>
  );
}

const inputCls = "w-full text-xs px-3 py-2 rounded-lg transition-colors placeholder:text-white/20 focus:outline-none text-white";
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" };

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

function GdprCheck({ value, onChange, error }: { value: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="mt-0.5 accent-[#C9A227]" />
        <span className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
          Acepto el tratamiento de mis datos.{" "}
          <Link href="/politica-privacidad"><span className="underline cursor-pointer" style={{ color: "rgba(201,162,39,0.65)" }}>Ver política</span></Link>
        </span>
      </label>
      {error && <p className="text-[10px] text-red-400 mt-0.5">{error}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChioChat() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quickReplies, setQRs]  = useState<QR[]>([]);
  const [isTyping, setTyping]   = useState(false);
  const [inputValue, setInput]  = useState("");
  const [formPhase, setForm]    = useState<FormPhase>(null);
  const [isMiembro, setIsMiembro] = useState(false);
  const [submitting, setSub]    = useState(false);
  const [fData, setFData]       = useState({ nombre:"", apellidos:"", email:"", telefono:"", asunto:"", notas:"", mensaje:"", gdpr:false });
  const [fErr, setFErr]         = useState<Record<string,string>>({});
  const [pendingLeaderCb, setPendingLeader] = useState<((r:string)=>void)|null>(null);

  const [wardInfo, setWardInfo] = useState<WardInfo>({ wardName:null, sacramentMeetingTime:null, meetingCenterName:null, meetingCenterAddress:null, whatsappPhone:null });
  const [activities, setActivities] = useState<any[]>([]);

  const msgId   = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/public/ward-info").then(r=>r.json()).then(d=>setWardInfo(d)).catch(()=>{});
    fetch("/api/public/activities").then(r=>r.json()).then(d=>setActivities(Array.isArray(d)?d:[])).catch(()=>{});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, formPhase, quickReplies]);

  const ward    = wardInfo.wardName ?? "el barrio";
  const mapsUrl = wardInfo.meetingCenterAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wardInfo.meetingCenterAddress)}` : null;
  const waUrl   = wardInfo.whatsappPhone ? `https://wa.me/${wardInfo.whatsappPhone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola, me gustaría hablar con alguien de ${ward}`)}` : null;
  const upcoming = activities.filter(a=>new Date(a.date)>new Date()).slice(0,4);

  const addMsg = useCallback((msg: Omit<Msg,"id">) => {
    setMessages(prev => [...prev, { ...msg, id: ++msgId.current } as Msg]);
  }, []);

  // Chio says something + sets quick replies
  const chioSay = useCallback((content: React.ReactNode, replies: QR[] = [], delay = 650) => {
    setTyping(true);
    setQRs([]);
    setTimeout(() => {
      setTyping(false);
      addMsg({ from:"chio", content });
      setQRs(replies);
    }, delay);
  }, [addMsg]);

  // ── Answer builders ───────────────────────────────────────────────────────

  const menuReplies = useCallback((): QR[] => [
    { label:"📅 Reuniones e información", onPress:()=>handleInput("reuniones horario") },
    { label:"📍 ¿Dónde estáis?",           onPress:()=>handleInput("donde estáis") },
    { label:"📖 ¿Qué creemos?",            onPress:()=>handleInput("qué creéis") },
    { label:"🎯 Próximas actividades",     onPress:()=>handleInput("actividades") },
    { label:"🕊️ Hablar con misioneros",   onPress:()=>handleInput("misioneros") },
    { label:"🗓️ Solicitar entrevista",    onPress:()=>handleInput("entrevista obispo") },
    { label:"💬 Hablar con alguien",       onPress:()=>handleInput("hablar persona") },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [wardInfo, activities]);

  const moreReplies = useCallback((): QR[] => [
    { label:"¿Algo más?", onPress:()=>chioSay("¿En qué más puedo ayudarte?", menuReplies(), 400) },
  ], [chioSay, menuReplies]);

  const showAnswer = useCallback((intentId: IntentId) => {
    switch (intentId) {

      case "reuniones":
        chioSay(
          <span>
            Nos reunimos cada <strong className="text-white">domingo</strong>
            {wardInfo.sacramentMeetingTime ? <> a las <strong className="text-white">{wardInfo.sacramentMeetingTime}h</strong></> : ""}.
            {wardInfo.meetingCenterName && <><br/><br/>En <strong className="text-white">{wardInfo.meetingCenterName}</strong>.</>}
            {wardInfo.meetingCenterAddress && <><br/>{wardInfo.meetingCenterAddress}.</>}
            <br/><br/>¡Todos son bienvenidos! 🙌
          </span>,
          [
            ...(mapsUrl ? [{ label:"Ver cómo llegar →", onPress:()=>window.open(mapsUrl,"_blank") }] : []),
            ...moreReplies(),
          ]
        );
        break;

      case "ubicacion":
        chioSay(
          <span>
            {wardInfo.meetingCenterName ? <><strong className="text-white">{wardInfo.meetingCenterName}</strong><br/></> : ""}
            {wardInfo.meetingCenterAddress || "La dirección no está configurada aún."}
          </span>,
          [
            ...(mapsUrl ? [{ label:"Abrir en Google Maps →", onPress:()=>window.open(mapsUrl,"_blank") }] : []),
            ...moreReplies(),
          ]
        );
        break;

      case "creemos":
        chioSay(
          <span>
            Creemos en <strong className="text-white">Jesucristo</strong> y en su Expiación, en la{" "}
            <strong className="text-white">familia eterna</strong> y en el evangelio restaurado.
            La Biblia y el Libro de Mormón son nuestras escrituras.
          </span>,
          [
            { label:"Saber más en churchofjesuschrist.org", onPress:()=>window.open("https://www.churchofjesuschrist.org/comeuntochrist/es","_blank") },
            ...moreReplies(),
          ]
        );
        break;

      case "unirse":
        chioSay(
          <span>
            ¡Nos alegra que preguntes! Puedes visitarnos cualquier{" "}
            <strong className="text-white">domingo</strong>
            {wardInfo.sacramentMeetingTime ? ` a las ${wardInfo.sacramentMeetingTime}h` : ""},{" "}
            hablar con los misioneros o solicitar una entrevista con el obispo.
          </span>,
          [
            { label:"🕊️ Hablar con misioneros", onPress:()=>handleInput("misioneros") },
            { label:"🗓️ Solicitar entrevista",  onPress:()=>handleInput("entrevista") },
            ...moreReplies(),
          ]
        );
        break;

      case "actividades":
        chioSay(
          upcoming.length > 0 ? (
            <div className="space-y-2">
              <p>Estas son las próximas actividades:</p>
              {upcoming.map(a => {
                const d = new Date(a.date);
                const ds = d.toLocaleDateString("es-ES",{ weekday:"short",day:"numeric",month:"short",timeZone:"UTC" });
                const ts = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
                return (
                  <div key={a.id} className="rounded-xl px-3 py-2 mt-2" style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xs font-semibold text-white/90">{a.title}</p>
                    <p className="text-[10px] capitalize mt-0.5" style={{ color:"rgba(255,255,255,0.42)" }}>{ds} · {ts}h</p>
                    {a.location && <p className="text-[10px] mt-0.5" style={{ color:"rgba(255,255,255,0.30)" }}>{a.location}</p>}
                  </div>
                );
              })}
            </div>
          ) : <span>No hay actividades programadas próximamente. ¡Vuelve pronto!</span>,
          [
            { label:"Ver todas →", onPress:()=>window.open("/actividades","_blank") },
            ...moreReplies(),
          ]
        );
        break;

      case "misioneros":
        chioSay("¿Eres miembro de La Iglesia de Jesucristo?", [
          { label:"Sí, soy miembro",  onPress:()=>{ addMsg({ from:"user", text:"Sí, soy miembro" }); setIsMiembro(true); chioSay("Déjanos tus datos y el líder misional se pondrá en contacto contigo.", [], 500); setTimeout(()=>{ setForm("misioneros_miembro"); setQRs([]); }, 1200); } },
          { label:"Todavía no",        onPress:()=>{ addMsg({ from:"user", text:"Todavía no" }); setIsMiembro(false); chioSay("¡Estupendo! Déjanos tus datos y nuestros misioneros se pondrán en contacto contigo 🙏", [], 500); setTimeout(()=>{ setForm("misioneros_no"); setQRs([]); }, 1200); } },
        ]);
        break;

      case "entrevista":
        chioSay("¿Eres miembro de La Iglesia de Jesucristo?", [
          { label:"Sí, soy miembro", onPress:()=>{ addMsg({ from:"user", text:"Sí, soy miembro" }); chioSay("Rellena tus datos para solicitar la entrevista. Los guardaremos para futuras comunicaciones del barrio.", [], 500); setTimeout(()=>{ setForm("entrevista"); setQRs([]); }, 1200); } },
          { label:"Todavía no",       onPress:()=>handleInput("misioneros") },
        ]);
        break;

      case "whatsapp":
        if (waUrl) {
          chioSay("Te abrimos WhatsApp para que puedas hablar con alguien del barrio directamente 💬", [
            { label:"Abrir WhatsApp →", onPress:()=>window.open(waUrl,"_blank") },
            ...moreReplies(),
          ]);
        } else {
          chioSay("En este momento no hay nadie disponible para el chat en directo. Puedes dejarnos un mensaje o solicitar una entrevista 🙏", [
            { label:"🗓️ Solicitar entrevista", onPress:()=>handleInput("entrevista") },
            { label:"📩 Formulario de contacto", onPress:()=>window.open("/contacto-misioneros","_blank") },
          ]);
        }
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardInfo, activities, mapsUrl, waUrl, upcoming, chioSay, moreReplies, addMsg]);

  // ── Input handler ─────────────────────────────────────────────────────────

  const handleInput = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMsg({ from:"user", text: trimmed });
    setInput("");
    setQRs([]);
    setForm(null);

    const matched = detectIntents(trimmed);

    if (matched.length === 1) {
      showAnswer(matched[0]);
    } else if (matched.length > 1) {
      // Ambiguous — show top matches
      chioSay("Mmm, creo que te puedo ayudar con alguna de estas cosas:", matched.slice(0,3).map(id => ({
        label: INTENTS.find(i=>i.id===id) ? id === "reuniones" ? "📅 Horarios de reunión" : id === "ubicacion" ? "📍 Ubicación" : id === "creemos" ? "📖 Qué creemos" : id === "unirse" ? "❓ Cómo unirme" : id === "actividades" ? "🎯 Actividades" : id === "misioneros" ? "🕊️ Misioneros" : id === "entrevista" ? "🗓️ Entrevista" : "💬 Hablar con alguien" : id,
        onPress: () => { addMsg({ from:"user", text: id }); showAnswer(id); },
      })));
    } else {
      chioSay("Hmm, no he entendido bien 😅 ¿Te puedo ayudar con alguna de estas opciones?", menuReplies(), 600);
    }
  }, [addMsg, showAnswer, chioSay, menuReplies]);

  // ── Open / init ───────────────────────────────────────────────────────────

  const handleOpen = () => {
    if (!open) {
      setMessages([]);
      setQRs([]);
      setForm(null);
      setInput("");
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addMsg({ from:"chio", content: <span>¡Hola! Soy Chio 👋 El asistente de {ward}.<br/>¿Sobre qué te puedo ayudar? Escribe tu pregunta o elige una opción.</span> });
        setQRs(menuReplies());
      }, 800);
    }
    setOpen(o => !o);
  };

  // ── Form validation + submit ───────────────────────────────────────────────

  const validateMisioneros = () => {
    const e: Record<string,string> = {};
    if (!fData.nombre.trim())   e.nombre   = "Obligatorio";
    if (!fData.apellidos.trim()) e.apellidos = "Obligatorio";
    if (!fData.email.trim() && !fData.telefono.trim()) e.contacto = "Email o teléfono requerido";
    if (!fData.gdpr) e.gdpr = "Debes aceptar el tratamiento de datos";
    setFErr(e);
    return Object.keys(e).length === 0;
  };

  const validateEntrevista = () => {
    const e: Record<string,string> = {};
    if (!fData.nombre.trim())   e.nombre   = "Obligatorio";
    if (!fData.apellidos.trim()) e.apellidos = "Obligatorio";
    if (!fData.email.trim())     e.email    = "Obligatorio";
    if (!fData.asunto)           e.asunto   = "Elige un asunto";
    if (!fData.gdpr)             e.gdpr     = "Debes aceptar el tratamiento de datos";
    setFErr(e);
    return Object.keys(e).length === 0;
  };

  const submitMisioneros = async (isMember: boolean) => {
    if (!validateMisioneros()) return;
    setSub(true);
    try {
      await fetch("/api/public/missionary-contact", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:`${fData.nombre} ${fData.apellidos}`, email:fData.email||undefined, phone:fData.telefono||undefined, message:fData.mensaje||undefined, isMember }) });
    } catch {}
    setSub(false);
    setForm(null);
    setFData({ nombre:"",apellidos:"",email:"",telefono:"",asunto:"",notas:"",mensaje:"",gdpr:false });
    addMsg({ from:"chio", content:<span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A227] shrink-0"/>¡Datos recibidos! {isMember ? "El líder misional se pondrá en contacto pronto." : "Nuestros misioneros se pondrán en contacto pronto 🙏"}</span> });
    setQRs(moreReplies());
  };

  const submitEntrevista = async (leaderRole: string, preferredDate?: string, preferredTime?: string) => {
    setSub(true);
    try {
      await fetch("/api/public/interview-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fData, leaderRole, preferredDate, preferredTime }),
      });
    } catch {}
    setSub(false);
    setForm(null);
    setFData({ nombre:"",apellidos:"",email:"",telefono:"",asunto:"",notas:"",mensaje:"",gdpr:false });
    const slotInfo = preferredDate ? ` para el ${new Date(preferredDate+"T12:00:00").toLocaleDateString("es-ES",{ weekday:"long", day:"numeric", month:"long" })}${preferredTime ? ` a las ${preferredTime}h` : ""}` : "";
    addMsg({ from:"chio", content:<span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A227] shrink-0"/>¡Solicitud enviada{slotInfo}! Recibirás confirmación por email en menos de <strong className="text-white">24 horas</strong>.</span> });
    setQRs(moreReplies());
  };

  const checkEmailAndProceed = async () => {
    if (!validateEntrevista()) return;
    setForm("lider");
    setTyping(true);

    try {
      const res = await fetch(`/api/public/member-lookup?email=${encodeURIComponent(fData.email.trim())}`);
      const data = await res.json();
      setTyping(false);

      if (data.found) {
        // Already know this person
        const nombre = data.nombre || fData.nombre;
        addMsg({ from: "chio", content: <span>¡Hola de nuevo, <strong className="text-white">{nombre}</strong>! 👋 Ya tenemos tus datos en nuestro sistema, no hace falta que los vuelvas a introducir.</span> });
        setQRs(LIDERES.map(l => ({ label: l.l, onPress: () => pickLeaderAndFetchSlots(l.v, l.l) })));
      } else {
        addMsg({ from: "chio", content: "¿Con quién te gustaría tener la entrevista?" });
        setQRs(LIDERES.map(l => ({ label: l.l, onPress: () => pickLeaderAndFetchSlots(l.v, l.l) })));
      }
    } catch {
      setTyping(false);
      addMsg({ from: "chio", content: "¿Con quién te gustaría tener la entrevista?" });
      setQRs(LIDERES.map(l => ({ label: l.l, onPress: () => pickLeaderAndFetchSlots(l.v, l.l) })));
    }
  };

  const pickLeaderAndFetchSlots = async (leaderRole: string, leaderLabel: string) => {
    addMsg({ from: "user", text: leaderLabel });
    setQRs([]);
    setTyping(true);
    try {
      const res = await fetch(`/api/public/interview-availability?leaderRole=${leaderRole}&weeks=3`);
      const slots: Array<{ date: string; label: string; times: string[] }> = await res.json();
      setTyping(false);

      if (!slots.length) {
        addMsg({ from:"chio", content:<span>No hay huecos disponibles en las próximas semanas 😔<br/>Aun así tramitaré tu solicitud y el líder te confirmará una fecha en <strong className="text-white">menos de 24h</strong>.</span> });
        submitEntrevista(leaderRole);
        return;
      }

      addMsg({ from:"chio", content:"Estos son los próximos huecos disponibles. ¿Cuál te viene bien?" });
      const slotReplies: QR[] = slots.flatMap(s =>
        s.times.map(t => ({
          label: `${s.label.charAt(0).toUpperCase() + s.label.slice(1)} · ${t}h`,
          onPress: () => {
            addMsg({ from:"user", text: `${s.label} · ${t}h` });
            setQRs([]);
            chioSay(<span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#C9A227] shrink-0"/>Perfecto, queda registrado. Recibirás confirmación por email en <strong className="text-white">menos de 24h</strong>.</span>, moreReplies(), 400);
            submitEntrevista(leaderRole, s.date, t);
          },
        }))
      );
      setQRs(slotReplies);
    } catch {
      setTyping(false);
      submitEntrevista(leaderRole);
    }
  };

  const setF = (k: string, v: any) => setFData(f=>({...f,[k]:v}));

  // ── Forms ─────────────────────────────────────────────────────────────────

  const renderForm = () => {
    if (!formPhase) return null;

    if (formPhase === "misioneros_miembro" || formPhase === "misioneros_no") {
      const isMember = formPhase === "misioneros_miembro";
      return (
        <div className="px-4 pb-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre" required error={fErr.nombre}><input className={inputCls} style={inputStyle} placeholder="Nombre" value={fData.nombre} onChange={e=>setF("nombre",e.target.value)} /></Field>
            <Field label="Apellidos" required error={fErr.apellidos}><input className={inputCls} style={inputStyle} placeholder="Apellidos" value={fData.apellidos} onChange={e=>setF("apellidos",e.target.value)} /></Field>
          </div>
          {isMember ? (
            <Field label="Email" required error={fErr.email}><input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={fData.email} onChange={e=>setF("email",e.target.value)} /></Field>
          ) : (
            <>
              <Field label="Email" error={fErr.contacto}><input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={fData.email} onChange={e=>setF("email",e.target.value)} /></Field>
              <Field label="Teléfono"><input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={fData.telefono} onChange={e=>setF("telefono",e.target.value)} /></Field>
              <Field label="¿Qué te gustaría saber?"><textarea rows={2} className={inputCls+" resize-none"} style={inputStyle} placeholder="Cuéntanos…" value={fData.mensaje} onChange={e=>setF("mensaje",e.target.value)} /></Field>
            </>
          )}
          {isMember && <Field label="Teléfono"><input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={fData.telefono} onChange={e=>setF("telefono",e.target.value)} /></Field>}
          <GdprCheck value={fData.gdpr} onChange={v=>setF("gdpr",v)} error={fErr.gdpr} />
          <button onClick={()=>submitMisioneros(isMember)} disabled={submitting} className="w-full bg-[#C9A227] hover:bg-[#d4ac2c] disabled:opacity-40 text-[#070709] font-semibold text-xs px-4 py-2.5 rounded-full transition-all">
            {submitting ? "Enviando…" : "Enviar →"}
          </button>
        </div>
      );
    }

    if (formPhase === "entrevista") {
      return (
        <div className="px-4 pb-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nombre" required error={fErr.nombre}><input className={inputCls} style={inputStyle} placeholder="Nombre" value={fData.nombre} onChange={e=>setF("nombre",e.target.value)} /></Field>
            <Field label="Apellidos" required error={fErr.apellidos}><input className={inputCls} style={inputStyle} placeholder="Apellidos" value={fData.apellidos} onChange={e=>setF("apellidos",e.target.value)} /></Field>
          </div>
          <Field label="Email" required error={fErr.email}><input type="email" className={inputCls} style={inputStyle} placeholder="email@ejemplo.com" value={fData.email} onChange={e=>setF("email",e.target.value)} /></Field>
          <Field label="Teléfono"><input className={inputCls} style={inputStyle} placeholder="+34 600 000 000" value={fData.telefono} onChange={e=>setF("telefono",e.target.value)} /></Field>
          <Field label="Asunto" required error={fErr.asunto}>
            <select value={fData.asunto} onChange={e=>setF("asunto",e.target.value)} className={inputCls} style={{...inputStyle,WebkitAppearance:"none"}}>
              <option value="" disabled>Selecciona un asunto…</option>
              {ASUNTOS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Notas"><textarea rows={2} className={inputCls+" resize-none"} style={inputStyle} placeholder="Contexto opcional…" value={fData.notas} onChange={e=>setF("notas",e.target.value)} /></Field>
          <GdprCheck value={fData.gdpr} onChange={v=>setF("gdpr",v)} error={fErr.gdpr} />
          <button
            onClick={checkEmailAndProceed}
            className="w-full bg-[#C9A227] hover:bg-[#d4ac2c] disabled:opacity-40 text-[#070709] font-semibold text-xs px-4 py-2.5 rounded-full transition-all"
          >
            Continuar →
          </button>
        </div>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <GreetingBubble onOpen={handleOpen} />

      {/* FAB */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{ background:"#C9A227", color:"#070709", boxShadow:"0 8px 32px rgba(201,162,39,0.35)" }}
      >
        {open ? <X className="h-4 w-4" /> : <><MessageCircle className="h-4 w-4"/><span>Chio</span></>}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{ width:320, maxHeight:"calc(100svh - 140px)", background:"#0d0d0f", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 24px 80px rgba(0,0,0,0.7)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background:"#111113", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-8 h-8 rounded-full bg-[#C9A227] flex items-center justify-center text-[#070709] font-black text-sm">C</div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Chio</p>
              <p className="text-[10px] mt-0.5" style={{ color:"rgba(255,255,255,0.35)" }}>Asistente del {ward}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"/>
              <span className="text-[10px]" style={{ color:"rgba(255,255,255,0.28)" }}>En línea</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ scrollbarWidth:"none" }}>
            {messages.map(m =>
              m.from === "chio"
                ? <CMsg key={m.id} content={(m as ChioMsg).content} />
                : <UMsg key={m.id} text={(m as UserMsg).text} />
            )}
            {isTyping && <TypingIndicator />}

            {/* Quick replies */}
            {!isTyping && quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {quickReplies.map((qr, i) => (
                  <button
                    key={i}
                    onClick={qr.onPress}
                    className="text-xs px-3 py-1.5 rounded-full transition-all"
                    style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.70)" }}
                    onMouseEnter={e=>{ Object.assign((e.currentTarget as HTMLElement).style,{ background:"rgba(255,255,255,0.10)", color:"#fff" }); }}
                    onMouseLeave={e=>{ Object.assign((e.currentTarget as HTMLElement).style,{ background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.70)" }); }}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Form (shown when active) */}
          {formPhase && formPhase !== "lider" && renderForm()}

          {/* Text input (hidden during forms) */}
          {!formPhase && (
            <div className="px-3 py-3 shrink-0" style={{ borderTop:"1px solid rgba(255,255,255,0.07)" }}>
              <form
                onSubmit={e=>{ e.preventDefault(); handleInput(inputValue); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e=>setInput(e.target.value)}
                  placeholder="Escribe tu pregunta…"
                  className="flex-1 text-xs px-3 py-2 rounded-full text-white placeholder:text-white/25 focus:outline-none transition-colors"
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.10)" }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background:"#C9A227" }}
                >
                  <Send className="h-3.5 w-3.5 text-[#070709]" />
                </button>
              </form>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-1.5 shrink-0" style={{ borderTop:"1px solid rgba(255,255,255,0.04)" }}>
            <p className="text-[9px] text-center" style={{ color:"rgba(255,255,255,0.12)" }}>{ward} · La Iglesia de Jesucristo</p>
          </div>
        </div>
      )}
    </>
  );
}
