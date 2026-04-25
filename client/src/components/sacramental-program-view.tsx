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
  onClose: () => void;
}

const parsePerson = (v?: string | null) => {
  const t = (v ?? "").trim();
  if (!t) return { name: "", calling: "" };
  if (t.includes("|")) { const i = t.indexOf("|"); return { name: t.slice(0, i).trim(), calling: t.slice(i + 1).trim() }; }
  return { name: t, calling: "" };
};
const orgName = (orgs: any[], id?: string) => orgs.find((o: any) => o.id === id)?.name ?? "";
const bullets = (items: string[], accent: string) =>
  items.filter(Boolean).map((item, i) => (
    <div key={i} style={{ display: "flex", gap: 5, marginBottom: 2 }}>
      <span style={{ color: accent, flexShrink: 0, fontWeight: 700 }}>–</span>
      <span>{item}</span>
    </div>
  ));

export function SacramentalProgramView({ meeting, organizations, recognitionMembers, onClose }: Props) {
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
        .prog-scroll {
          display: block !important;
          overflow: visible !important;
        }
        .prog-page {
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          box-shadow: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
          page-break-after: always;
          break-after: page;
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
    const w = scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left: p * (w + 16), behavior: "smooth" });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    setPage(Math.round(scrollLeft / (clientWidth + 16)));
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

  const label: React.CSSProperties = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#9ca3af", marginBottom: 3 };
  const divider: React.CSSProperties = { borderTop: "1px solid #e5e7eb", margin: "9px 0" };
  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" };
  const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 10px" };

  const pageStyle: React.CSSProperties = {
    flexShrink: 0,
    width: "calc(100vw - 32px)",
    maxWidth: "210mm",
    minHeight: "100%",
    background: "#fff",
    scrollSnapAlign: "center",
    overflowY: "auto",
    overflowX: "hidden",
    padding: "9mm 10mm",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 10,
    color: "#111",
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
    borderRadius: 8,
    boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
  };

  // ── PAGE 1: Authorities + Opening ──
  const page1 = (
    <div className="prog-page" style={pageStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ ...label, marginBottom: 1 }}>Barrio</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: accent, lineHeight: 1, fontFamily: "Arial, sans-serif" }}>{wardName}</div>
          {stakeName && <div style={{ fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginTop: 2 }}>{stakeName}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...label, marginBottom: 0 }}>{dayName}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: accent, lineHeight: 1, fontFamily: "Arial, sans-serif" }}>{dayNum}</div>
          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{monthYear}</div>
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${accent}`, marginBottom: 7 }} />

      <div style={{ marginBottom: 9 }}>
        <div style={{ ...label, marginBottom: 0 }}>Programa de</div>
        <div style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.2, color: "#111" }}>Reunión Sacramental</div>
      </div>

      <div style={divider} />

      {/* Preside / Dirige */}
      <div style={grid2}>
        {presider.name && (
          <div>
            <div style={label}>Preside</div>
            <div style={{ fontWeight: 600 }}>{presider.name}</div>
            {presider.calling && <div style={{ fontSize: 8.5, color: "#6b7280" }}>{presider.calling}</div>}
          </div>
        )}
        {director.name && (
          <div>
            <div style={label}>Dirige</div>
            <div style={{ fontWeight: 600 }}>{director.name}</div>
            {director.calling && <div style={{ fontSize: 8.5, color: "#6b7280" }}>{director.calling}</div>}
          </div>
        )}
      </div>

      {/* Reconocimiento */}
      {recognitionMembers.length > 0 && (
        <>
          <div style={divider} />
          <div style={label}>Reconocimiento</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(recognitionMembers.length, 3)}, 1fr)`, gap: "0 10px" }}>
            {recognitionMembers.map((m, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600, fontSize: 9.5 }}>{m.name}</div>
                {m.calling && <div style={{ fontSize: 8.5, color: "#6b7280", lineHeight: 1.3 }}>{m.calling}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={divider} />

      {/* Música */}
      <div style={grid2}>
        {meeting.musicDirector && (
          <div>
            <div style={label}>Dirección de la música</div>
            <div>{meeting.musicDirector}</div>
          </div>
        )}
        {meeting.pianist && (
          <div>
            <div style={label}>Acompañamiento</div>
            <div>{meeting.pianist}</div>
          </div>
        )}
      </div>

      <div style={divider} />

      {/* Himno apertura / Oración */}
      <div style={grid2}>
        {meeting.openingHymn && (
          <div>
            <div style={label}>Himno de apertura</div>
            <div style={{ fontStyle: "italic" }}>{meeting.openingHymn}</div>
          </div>
        )}
        {meeting.openingPrayer && (
          <div>
            <div style={label}>Oración</div>
            <div>{meeting.openingPrayer}</div>
          </div>
        )}
      </div>

      {/* Page indicator */}
      <div style={{ marginTop: "auto", paddingTop: 12, textAlign: "center", color: "#d1d5db", fontSize: 8 }}>
        Pág. 1 de 2 · desliza →
      </div>
    </div>
  );

  // ── PAGE 2: Program flow ──
  const page2 = (
    <div className="prog-page" style={pageStyle}>
      {/* Anuncios y Asuntos */}
      <div style={{ ...label, fontSize: 9.5, marginBottom: 5 }}>Anuncios y Asuntos</div>
      <div style={grid3}>
        <div>
          <div style={label}>Anuncios</div>
          {meeting.announcements?.trim()
            ? bullets(meeting.announcements.split("\n").map((l: string) => l.trim()).filter(Boolean), accent)
            : <span style={{ color: "#d1d5db" }}>—</span>}
        </div>
        <div>
          <div style={label}>Asuntos de barrio</div>
          {releases.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 1 }}>Relevos:</div>
              {bullets(releases.map((r: any) => { const org = orgName(organizations, r.organizationId); return `${r.name}${org ? ` (${org})` : ""}`; }), accent)}
            </div>
          )}
          {sustainments.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 1 }}>Sostenimientos:</div>
              {bullets(sustainments.map((s: any) => { const org = orgName(organizations, s.organizationId); return `${s.name} — ${s.calling}${org ? ` (${org})` : ""}`; }), accent)}
            </div>
          )}
          {confirmations.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 1 }}>Confirmaciones:</div>
              {bullets(confirmations, accent)}
            </div>
          )}
          {newMembers.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 1 }}>Nuevos conversos:</div>
              {bullets(newMembers, accent)}
            </div>
          )}
          {childBlessings.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, marginBottom: 1 }}>Bendición de niños:</div>
              {bullets(childBlessings, accent)}
            </div>
          )}
          {!releases.length && !sustainments.length && !confirmations.length && !newMembers.length && !childBlessings.length &&
            <span style={{ color: "#d1d5db" }}>—</span>}
        </div>
        <div>
          <div style={label}>Asuntos de estaca</div>
          {meeting.stakeBusiness?.trim()
            ? bullets(meeting.stakeBusiness.split("\n").map((l: string) => l.trim()).filter(Boolean), accent)
            : <span style={{ color: "#d1d5db" }}>—</span>}
        </div>
      </div>

      <div style={{ borderTop: `1px solid #e5e7eb`, margin: "9px 0" }} />

      {/* Santa Cena */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: accent, borderBottom: `1.5px solid ${accent}`, paddingBottom: 3, marginBottom: 6 }}>
          Santa Cena
        </div>
        {meeting.sacramentHymn && (
          <div style={{ marginBottom: 3 }}>
            <span style={{ ...label, display: "inline" }}>Himno: </span>
            <span style={{ fontStyle: "italic" }}>{meeting.sacramentHymn}</span>
          </div>
        )}
        <div style={{ fontSize: 8.5, color: "#9ca3af", fontStyle: "italic" }}>
          La bendición y reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.
        </div>
      </div>

      {/* Mensajes / Testimonios */}
      {meeting.isTestimonyMeeting ? (
        <>
          <div style={{ ...label, fontSize: 9.5, marginBottom: 4 }}>Testimonios</div>
          <div style={{ fontSize: 9, fontStyle: "italic", color: "#6b7280" }}>Reunión de Ayuno y Testimonio.</div>
        </>
      ) : discourses.length > 0 && (
        <>
          <div style={{ borderTop: "1px solid #e5e7eb", margin: "9px 0" }} />
          <div style={{ ...label, fontSize: 9.5, marginBottom: 5 }}>Mensajes</div>
          {discourses.map((d: any, i: number) => (
            <div key={i} style={{ marginBottom: 5 }}>
              <span style={{ fontWeight: 600 }}>{d.speaker}</span>
              {d.topic && <span style={{ color: "#6b7280" }}> — {d.topic}</span>}
            </div>
          ))}
          {meeting.intermediateHymn && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ ...label, display: "inline" }}>Himno intermedio: </span>
              <span style={{ fontStyle: "italic" }}>{meeting.intermediateHymn}</span>
            </div>
          )}
        </>
      )}

      <div style={{ borderTop: "1px solid #e5e7eb", margin: "9px 0" }} />

      {/* Cierre */}
      <div style={grid2}>
        {meeting.closingHymn && (
          <div>
            <div style={label}>Himno de cierre</div>
            <div style={{ fontStyle: "italic" }}>{meeting.closingHymn}</div>
          </div>
        )}
        {meeting.closingPrayer && (
          <div>
            <div style={label}>Oración de cierre</div>
            <div>{meeting.closingPrayer}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", fontSize: 8, color: "#9ca3af" }}>
        <span>{wardName}{stakeName ? ` · ${stakeName}` : ""}</span>
        <span>{meetingDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}</span>
      </div>
    </div>
  );

  return createPortal(
    <div id="prog-portal" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0f172a", display: "flex", flexDirection: "column" }}>

      {/* Toolbar */}
      <div className="prog-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => goTo(0)} disabled={page === 0}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: page === 0 ? "rgba(255,255,255,0.3)" : "white", cursor: page === 0 ? "default" : "pointer", display: "flex", alignItems: "center" }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => goTo(1)} disabled={page === 1}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: page === 1 ? "rgba(255,255,255,0.3)" : "white", cursor: page === 1 ? "default" : "pointer", display: "flex", alignItems: "center" }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <X size={14} /> Cerrar
          </button>
        </div>
      </div>

      {/* Horizontal scroll-snap container */}
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

      {/* Dots indicator */}
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
