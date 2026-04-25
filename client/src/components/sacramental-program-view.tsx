import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/auth-tokens";

interface RecognitionMember { name: string; role: string; calling: string; }
interface Props {
  meeting: any;
  organizations: any[];
  recognitionMembers: RecognitionMember[];
  onPDF: (meeting: any) => void;
  onClose: () => void;
}

const parsePerson = (v?: string | null) => {
  const t = (v ?? "").trim();
  if (!t) return { name: "", calling: "" };
  if (t.includes("|")) { const i = t.indexOf("|"); return { name: t.slice(0, i).trim(), calling: t.slice(i + 1).trim() }; }
  return { name: t, calling: "" };
};
const orgName = (orgs: any[], id?: string) => orgs.find((o: any) => o.id === id)?.name ?? "";

const FONT = "'Outfit', 'Segoe UI', system-ui, -apple-system, sans-serif";

/** Hex accent → very light tint for date box / santa cena bg */
const lightTint = (hex: string) => `${hex}18`;

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function SacramentalProgramView({ meeting, organizations, recognitionMembers, onPDF, onClose }: Props) {
  const { data: template } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: async () => {
      const res = await fetch("/api/pdf-template", { headers: getAuthHeaders() });
      if (!res.ok) return { wardName: "Barrio", stakeName: "", accentColor: "1a3554", footerText: "" };
      return res.json();
    },
  });

  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goTo(1);
      if (e.key === "ArrowLeft") goTo(0);
    };
    window.addEventListener("keydown", onKey);

    const style = document.createElement("style");
    style.id = "prog-print";
    style.textContent = `
      @media print {
        body > *:not(#prog-portal) { display: none !important; }
        #prog-portal { position: static !important; background: white !important; }
        .prog-toolbar { display: none !important; }
        .prog-dots { display: none !important; }
        .prog-scroll { display: block !important; overflow: visible !important; }
        .prog-page {
          width: 100% !important; max-width: 100% !important; height: auto !important;
          box-shadow: none !important; margin: 0 !important; border-radius: 0 !important;
          page-break-after: always; break-after: page;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.head.removeChild(style);
    };
  }, [onClose]);

  const goTo = (p: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: p * (scrollRef.current.clientWidth + 16), behavior: "smooth" });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    setPage(Math.round(scrollRef.current.scrollLeft / (scrollRef.current.clientWidth + 16)));
  };

  const accent = `#${template?.accentColor ?? "1a3554"}`;
  const wardName = template?.wardName ?? "Barrio";
  const stakeName = template?.stakeName ?? "";

  const meetingDate = new Date(meeting.date);
  const dayName = meetingDate.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const dayNum = meetingDate.getDate();
  const monthYear = meetingDate.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const presider = parsePerson(meeting.presider);
  const director = parsePerson(meeting.director);

  const releases = (Array.isArray(meeting.releases) ? meeting.releases : []).filter((r: any) => r?.name && r?.oldCalling);
  const sustainments = (Array.isArray(meeting.sustainments) ? meeting.sustainments : []).filter((s: any) => s?.name && s?.calling);
  const confirmations = (Array.isArray(meeting.confirmations) ? meeting.confirmations : []).filter(Boolean);
  const newMembers = (Array.isArray(meeting.newMembers) ? meeting.newMembers : []).filter(Boolean);
  const childBlessings = (Array.isArray(meeting.childBlessings) ? meeting.childBlessings : []).filter(Boolean);
  const discourses = (Array.isArray(meeting.discourses) ? meeting.discourses : []).filter((d: any) => d?.speaker);
  const hasWardBusiness = releases.length > 0 || sustainments.length > 0 || confirmations.length > 0 || newMembers.length > 0 || childBlessings.length > 0;

  // ── Shared style atoms ──────────────────────────────────────────
  const cardBorder: React.CSSProperties = {
    border: "1px solid #e0e0e0",
    borderRadius: 10,
    padding: "16px 20px",
    background: "#fff",
  };
  const lbl: React.CSSProperties = {
    display: "block",
    color: accent,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    marginBottom: 6,
  };
  const personName: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 };
  const personRole: React.CSSProperties = { margin: 0, fontSize: 12, color: "#888", fontStyle: "italic", lineHeight: 1.3, marginTop: 2 };
  const gap = (h = 12) => <div style={{ height: h }} />;

  const bullets = (items: string[]) => items.filter(Boolean).map((item, i) => (
    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2, fontSize: 12 }}>
      <span style={{ color: accent, flexShrink: 0 }}>·</span>
      <span style={{ color: "#444" }}>{item}</span>
    </div>
  ));

  const empty = <span style={{ color: "#ccc", fontSize: 12 }}>—</span>;

  const pageBase: React.CSSProperties = {
    flexShrink: 0,
    width: "calc(100vw - 32px)",
    maxWidth: "210mm",
    minHeight: "100%",
    background: "#fff",
    scrollSnapAlign: "center",
    overflowY: "auto",
    overflowX: "hidden",
    padding: "28px 28px 24px",
    fontFamily: FONT,
    fontSize: 13,
    color: "#333",
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
    borderRadius: 12,
    boxShadow: "0 8px 48px rgba(0,0,0,0.45)",
  };

  // ── PAGE 1 ─────────────────────────────────────────────────────
  const page1 = (
    <div className="prog-page" style={pageBase}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ margin: 0, fontWeight: 400, color: "#777", fontSize: 13 }}>Barrio</div>
          <div style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#1a1a1a", lineHeight: 1, letterSpacing: "-0.02em" }}>{wardName}</div>
          {stakeName && <div style={{ color: accent, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", marginTop: 4 }}>{stakeName.toUpperCase()}</div>}
        </div>
        {/* Date box */}
        <div style={{ background: lightTint(accent), padding: "12px 20px", borderRadius: 10, textAlign: "center", minWidth: 80, flexShrink: 0 }}>
          <div style={{ color: "#777", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>{dayName}</div>
          <div style={{ display: "block", fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1, margin: "4px 0" }}>{dayNum}</div>
          <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.06em" }}>{monthYear}</div>
        </div>
      </div>

      {/* Program title */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ textTransform: "uppercase", fontSize: 10, color: "#888", letterSpacing: "0.15em", marginBottom: 4 }}>Programa de</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1, letterSpacing: "-0.01em" }}>REUNIÓN SACRAMENTAL</div>
      </div>

      {/* Preside / Dirige */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {presider.name && (
          <div style={cardBorder}>
            <span style={lbl}>Preside</span>
            <p style={personName}>{presider.name}</p>
            {presider.calling && <p style={personRole}>{presider.calling}</p>}
          </div>
        )}
        {director.name && (
          <div style={cardBorder}>
            <span style={lbl}>Dirige</span>
            <p style={personName}>{director.name}</p>
            {director.calling && <p style={personRole}>{director.calling}</p>}
          </div>
        )}
      </div>

      {/* Reconocimiento + Música */}
      <div style={{ ...cardBorder, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 0, marginBottom: 12, padding: 0, overflow: "hidden" }}>
        {/* Reconocimiento */}
        <div style={{ padding: "16px 20px" }}>
          <span style={lbl}>Reconocimiento</span>
          {recognitionMembers.length > 0 ? (
            <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12 }}>
              {recognitionMembers.map((m, i) => (
                <div key={i} style={{ marginBottom: i < recognitionMembers.length - 1 ? 10 : 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{m.name}</div>
                  {m.calling && <div style={personRole}>{m.calling}</div>}
                </div>
              ))}
            </div>
          ) : <span style={{ color: "#ccc", fontSize: 12 }}>—</span>}
        </div>
        {/* Música */}
        <div style={{ padding: "16px 20px", borderLeft: "1px solid #e0e0e0" }}>
          {meeting.musicDirector && (
            <div style={{ marginBottom: 12 }}>
              <span style={lbl}>Dirección de la música</span>
              <p style={personName}>{meeting.musicDirector}</p>
            </div>
          )}
          {meeting.pianist && (
            <div>
              <span style={lbl}>Acompañamiento</span>
              <p style={personName}>{meeting.pianist}</p>
            </div>
          )}
        </div>
      </div>

      {/* Himno apertura + Oración */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {meeting.openingHymn && (
          <div style={cardBorder}>
            <span style={lbl}>Himno de apertura</span>
            <p style={{ ...personName, fontStyle: "italic", fontWeight: 500 }}>{meeting.openingHymn}</p>
          </div>
        )}
        {meeting.openingPrayer && (
          <div style={cardBorder}>
            <span style={lbl}>Oración</span>
            <p style={personName}>{meeting.openingPrayer}</p>
          </div>
        )}
      </div>

      {/* Footer page 1 */}
      <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#bbb", borderTop: "1px solid #f0f0f0" }}>
        <span>{wardName}{stakeName ? ` · ${stakeName}` : ""}</span>
        <span>Página 1 de 2 — desliza →</span>
      </div>
    </div>
  );

  // ── PAGE 2 ─────────────────────────────────────────────────────
  const page2 = (
    <div className="prog-page" style={pageBase}>
      {/* Anuncios y Asuntos — 3-column in one card */}
      <div style={{ ...cardBorder, marginBottom: 12 }}>
        <span style={lbl}>Anuncios y Asuntos</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 12 }}>
          {/* Anuncios */}
          <div>
            <div style={{ color: accent, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.09em", borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6 }}>Anuncios</div>
            {meeting.announcements?.trim()
              ? bullets(meeting.announcements.split("\n").map((l: string) => l.trim()).filter(Boolean))
              : empty}
          </div>
          {/* Asuntos de barrio */}
          <div>
            <div style={{ color: accent, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.09em", borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6 }}>Asuntos de barrio</div>
            {!hasWardBusiness && empty}
            {releases.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Relevos:</div>
                {bullets(releases.map((r: any) => { const o = orgName(organizations, r.organizationId); return `${r.name}${o ? ` (${o})` : ""}`; }))}
              </div>
            )}
            {sustainments.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Sostenimientos:</div>
                {bullets(sustainments.map((s: any) => { const o = orgName(organizations, s.organizationId); return `${s.name} — ${s.calling}${o ? ` (${o})` : ""}`; }))}
              </div>
            )}
            {confirmations.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Confirmaciones:</div>
                {bullets(confirmations)}
              </div>
            )}
            {newMembers.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Nuevos miembros:</div>
                {bullets(newMembers)}
              </div>
            )}
            {childBlessings.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Bendición de niños:</div>
                {bullets(childBlessings)}
              </div>
            )}
          </div>
          {/* Asuntos de estaca */}
          <div>
            <div style={{ color: accent, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.09em", borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6 }}>Asuntos de estaca</div>
            {meeting.stakeBusiness?.trim()
              ? bullets(meeting.stakeBusiness.split("\n").map((l: string) => l.trim()).filter(Boolean))
              : empty}
          </div>
        </div>
      </div>

      {/* Santa Cena */}
      <div style={{ ...cardBorder, marginBottom: 12 }}>
        <span style={lbl}>Santa Cena</span>
        {meeting.sacramentHymn && (
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#1a1a1a" }}>
            <strong>Himno sacramental:</strong> <span style={{ fontStyle: "italic" }}>{meeting.sacramentHymn}</span>
          </p>
        )}
        <p style={{ margin: 0, fontSize: 12, color: "#777" }}>
          La bendición y el reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.
        </p>
      </div>

      {/* Mensajes / Testimonios */}
      {meeting.isTestimonyMeeting ? (
        <div style={{ ...cardBorder, marginBottom: 12 }}>
          <span style={lbl}>Testimonios</span>
          <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "#555" }}>Reunión de Ayuno y Testimonio.</p>
        </div>
      ) : discourses.length > 0 && (
        <div style={{ ...cardBorder, marginBottom: 12 }}>
          <span style={lbl}>Mensajes</span>
          {discourses.map((d: any, i: number) => (
            <div key={i} style={{ marginBottom: i < discourses.length - 1 ? 8 : 0 }}>
              {i > 0 && <div style={{ borderTop: "1px solid #f0f0f0", margin: "8px 0" }} />}
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{d.speaker}</p>
              {d.topic && <p style={personRole}>{d.topic}</p>}
            </div>
          ))}
          {meeting.intermediateHymn && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
              <span style={{ ...lbl, marginBottom: 3 }}>Himno intermedio</span>
              <p style={{ margin: 0, fontStyle: "italic", fontSize: 13 }}>{meeting.intermediateHymn}</p>
            </div>
          )}
        </div>
      )}

      {/* Cierre */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {meeting.closingHymn && (
          <div style={cardBorder}>
            <span style={lbl}>Himno de cierre</span>
            <p style={{ ...personName, fontStyle: "italic", fontWeight: 500 }}>{meeting.closingHymn}</p>
          </div>
        )}
        {meeting.closingPrayer && (
          <div style={cardBorder}>
            <span style={lbl}>Oración de cierre</span>
            <p style={personName}>{meeting.closingPrayer}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#bbb", borderTop: "1px solid #f0f0f0" }}>
        <span>{stakeName || wardName}</span>
        <span>Página 2 de 2</span>
        <span>{wardName} · {meetingDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}</span>
      </div>
    </div>
  );

  return createPortal(
    <div id="prog-portal" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0f172a", display: "flex", flexDirection: "column" }}>

      {/* Toolbar */}
      <div className="prog-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => goTo(0)} disabled={page === 0}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: page === 0 ? "rgba(255,255,255,0.3)" : "white", cursor: page === 0 ? "default" : "pointer", display: "flex", alignItems: "center", fontFamily: FONT }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => goTo(1)} disabled={page === 1}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: page === 1 ? "rgba(255,255,255,0.3)" : "white", cursor: page === 1 ? "default" : "pointer", display: "flex", alignItems: "center", fontFamily: FONT }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onPDF(meeting)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
            <Printer size={14} /> PDF
          </button>
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
            <X size={14} /> Cerrar
          </button>
        </div>
      </div>

      {/* Horizontal scroll-snap */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="prog-scroll"
        style={{
          flex: 1,
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch" as any,
          gap: 16,
          padding: "12px 16px",
          alignItems: "stretch",
          scrollbarWidth: "none" as any,
        }}
      >
        {page1}
        {page2}
      </div>

      {/* Dots */}
      <div className="prog-dots" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "10px 0", flexShrink: 0 }}>
        {[0, 1].map(i => (
          <button key={i} onClick={() => goTo(i)} style={{
            width: page === i ? 22 : 6, height: 6, borderRadius: 3, border: "none", cursor: "pointer",
            background: page === i ? "white" : "rgba(255,255,255,0.3)",
            transition: "all 0.25s ease", padding: 0,
          }} />
        ))}
      </div>

    </div>,
    document.body
  );
}
