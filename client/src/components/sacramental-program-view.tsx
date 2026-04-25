import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/auth-tokens";

interface RecognitionMember {
  name: string;
  role: string;
  calling: string;
}

interface Props {
  meeting: any;
  organizations: any[];
  recognitionMembers: RecognitionMember[];
  onClose: () => void;
}

const parsePerson = (value?: string | null): { name: string; calling: string } => {
  const t = (value ?? "").trim();
  if (!t) return { name: "", calling: "" };
  if (t.includes("|")) {
    const i = t.indexOf("|");
    return { name: t.slice(0, i).trim(), calling: t.slice(i + 1).trim() };
  }
  return { name: t, calling: "" };
};

const orgName = (orgs: any[], id?: string) => orgs.find((o: any) => o.id === id)?.name ?? "";

const bulletList = (items: string[]) =>
  items.filter(Boolean).map((item, i) => (
    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
      <span style={{ color: "#9ca3af", flexShrink: 0 }}>–</span>
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

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "program-print-style";
    style.textContent = `
      @media print {
        body > *:not(#program-portal) { display: none !important; }
        #program-portal { position: static !important; background: none !important; padding: 0 !important; }
        .program-toolbar { display: none !important; }
        .program-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        .program-scroll { overflow: visible !important; }
      }
    `;
    document.head.appendChild(style);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.head.removeChild(style);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const accent = `#${template?.accentColor ?? "1a3554"}`;
  const wardName = template?.wardName ?? "Barrio";
  const stakeName = template?.stakeName ?? "";

  const meetingDate = new Date(meeting.date);
  const dayName = meetingDate.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const dayNum = meetingDate.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const monthYear = meetingDate.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const presider = parsePerson(meeting.presider);
  const director = parsePerson(meeting.director);

  const releases = Array.isArray(meeting.releases)
    ? meeting.releases.filter((r: any) => r?.name && r?.oldCalling)
    : [];
  const sustainments = Array.isArray(meeting.sustainments)
    ? meeting.sustainments.filter((s: any) => s?.name && s?.calling)
    : [];
  const confirmations = Array.isArray(meeting.confirmations) ? meeting.confirmations.filter(Boolean) : [];
  const newMembers = Array.isArray(meeting.newMembers) ? meeting.newMembers.filter(Boolean) : [];
  const aaronicOrderings = Array.isArray(meeting.aaronicOrderings) ? meeting.aaronicOrderings.filter(Boolean) : [];
  const childBlessings = Array.isArray(meeting.childBlessings) ? meeting.childBlessings.filter(Boolean) : [];
  const discourses = Array.isArray(meeting.discourses) ? meeting.discourses.filter((d: any) => d?.speaker) : [];
  const hasWardBusiness = releases.length || sustainments.length || confirmations.length || newMembers.length || aaronicOrderings.length || childBlessings.length;

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "#6b7280", marginBottom: 4,
  };
  const divider: React.CSSProperties = {
    borderTop: "1px solid #e5e7eb", margin: "10px 0",
  };
  const colGrid = (cols: number): React.CSSProperties => ({
    display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "0 16px",
  });

  const program = (
    <div className="program-page" style={{
      background: "#fff", width: "210mm", minHeight: "297mm",
      margin: "0 auto", padding: "14mm 15mm 12mm",
      boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 10.5, color: "#111", lineHeight: 1.5,
      boxSizing: "border-box",
    }}>

      {/* ── CABECERA ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 2 }}>
            Barrio
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1, fontFamily: "Arial, sans-serif" }}>
            {wardName}
          </div>
          {stakeName && (
            <div style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginTop: 3 }}>
              {stakeName}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9ca3af" }}>
            {dayName}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: accent, lineHeight: 1, fontFamily: "Arial, sans-serif" }}>
            {dayNum}
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginTop: 2 }}>
            {monthYear}
          </div>
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${accent}`, marginBottom: 8 }} />

      {/* ── TÍTULO ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9ca3af" }}>
          Programa de
        </div>
        <div style={{ fontSize: 22, fontWeight: 400, fontFamily: "Georgia, serif", color: "#111", lineHeight: 1.2 }}>
          Reunión Sacramental
        </div>
      </div>

      <div style={divider} />

      {/* ── PRESIDE / DIRIGE ── */}
      <div style={colGrid(2)}>
        {presider.name && (
          <div>
            <div style={sectionLabel}>Preside</div>
            <div style={{ fontWeight: 600, fontSize: 11 }}>{presider.name}</div>
            {presider.calling && <div style={{ fontSize: 9.5, color: "#6b7280" }}>{presider.calling}</div>}
          </div>
        )}
        {director.name && (
          <div>
            <div style={sectionLabel}>Dirige</div>
            <div style={{ fontWeight: 600, fontSize: 11 }}>{director.name}</div>
            {director.calling && <div style={{ fontSize: 9.5, color: "#6b7280" }}>{director.calling}</div>}
          </div>
        )}
      </div>

      {/* ── RECONOCIMIENTO ── */}
      {recognitionMembers.length > 0 && (
        <>
          <div style={{ ...divider, marginTop: 8 }} />
          <div style={sectionLabel}>Reconocimiento</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(recognitionMembers.length, 4)}, 1fr)`, gap: "0 12px" }}>
            {recognitionMembers.map((m, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600, fontSize: 10.5 }}>{m.name}</div>
                {m.calling && <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.3 }}>{m.calling}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={divider} />

      {/* ── MÚSICA ── */}
      <div style={colGrid(2)}>
        {meeting.musicDirector && (
          <div>
            <div style={sectionLabel}>Dirección de la música</div>
            <div style={{ fontWeight: 500 }}>{meeting.musicDirector}</div>
          </div>
        )}
        {meeting.pianist && (
          <div>
            <div style={sectionLabel}>Acompañamiento en el Piano</div>
            <div style={{ fontWeight: 500 }}>{meeting.pianist}</div>
          </div>
        )}
      </div>

      <div style={divider} />

      {/* ── HIMNO APERTURA / ORACIÓN ── */}
      <div style={colGrid(2)}>
        {meeting.openingHymn && (
          <div>
            <div style={sectionLabel}>Himno de apertura</div>
            <div style={{ fontStyle: "italic" }}>{meeting.openingHymn}</div>
          </div>
        )}
        {meeting.openingPrayer && (
          <div>
            <div style={sectionLabel}>Oración</div>
            <div>{meeting.openingPrayer}</div>
          </div>
        )}
      </div>

      <div style={{ ...divider, marginTop: 10 }} />

      {/* ── ANUNCIOS Y ASUNTOS ── */}
      <div style={{ ...sectionLabel, fontSize: 10, marginBottom: 6 }}>Anuncios y Asuntos</div>
      <div style={colGrid(3)}>
        {/* Anuncios */}
        <div>
          <div style={sectionLabel}>Anuncios</div>
          {meeting.announcements?.trim() ? (
            bulletList(meeting.announcements.split("\n").map((l: string) => l.trim()).filter(Boolean))
          ) : (
            <span style={{ color: "#d1d5db" }}>—</span>
          )}
        </div>

        {/* Asuntos de barrio */}
        <div>
          <div style={sectionLabel}>Asuntos de barrio</div>
          {hasWardBusiness ? (
            <>
              {releases.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Relevos:</div>
                  {bulletList(releases.map((r: any) => {
                    const org = orgName(organizations, r.organizationId);
                    return `${r.name} — ${r.oldCalling}${org ? ` (${org})` : ""}`;
                  }))}
                </div>
              )}
              {sustainments.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Sostenimientos:</div>
                  {bulletList(sustainments.map((s: any) => {
                    const org = orgName(organizations, s.organizationId);
                    return `${s.name} — ${s.calling}${org ? ` (${org})` : ""}`;
                  }))}
                </div>
              )}
              {confirmations.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Confirmaciones:</div>
                  {bulletList(confirmations)}
                </div>
              )}
              {newMembers.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Nuevos conversos:</div>
                  {bulletList(newMembers)}
                </div>
              )}
              {childBlessings.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Bendición de niños:</div>
                  {bulletList(childBlessings)}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: "#d1d5db" }}>—</span>
          )}
        </div>

        {/* Asuntos de estaca */}
        <div>
          <div style={sectionLabel}>Asuntos de estaca</div>
          {meeting.stakeBusiness?.trim() ? (
            bulletList(meeting.stakeBusiness.split("\n").map((l: string) => l.trim()).filter(Boolean))
          ) : (
            <span style={{ color: "#d1d5db" }}>—</span>
          )}
        </div>
      </div>

      <div style={{ ...divider, marginTop: 10 }} />

      {/* ── SANTA CENA ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ ...sectionLabel, color: accent, fontSize: 11, borderBottom: `1.5px solid ${accent}`, paddingBottom: 3, marginBottom: 6 }}>
          Santa Cena
        </div>
        {meeting.sacramentHymn && (
          <div style={{ marginBottom: 4 }}>
            <span style={sectionLabel}>Himno sacramental </span>
            <span style={{ fontStyle: "italic" }}>{meeting.sacramentHymn}</span>
          </div>
        )}
        <div style={{ fontSize: 9.5, color: "#6b7280", fontStyle: "italic" }}>
          La bendición y reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.
        </div>
      </div>

      {/* ── MENSAJES / TESTIMONIOS ── */}
      {meeting.isTestimonyMeeting ? (
        <>
          <div style={{ ...sectionLabel, fontSize: 10, marginBottom: 4 }}>Testimonios</div>
          <div style={{ fontSize: 9.5, fontStyle: "italic", color: "#6b7280" }}>Reunión de Ayuno y Testimonio.</div>
        </>
      ) : discourses.length > 0 && (
        <>
          <div style={{ ...divider, marginTop: 8 }} />
          <div style={{ ...sectionLabel, fontSize: 10, marginBottom: 6 }}>Mensajes</div>
          {discourses.map((d: any, i: number) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{d.speaker}</span>
              {d.topic && <span style={{ color: "#6b7280" }}> — {d.topic}</span>}
            </div>
          ))}
          {meeting.intermediateHymn && (
            <div style={{ marginBottom: 4 }}>
              <span style={sectionLabel}>Himno intermedio </span>
              <span style={{ fontStyle: "italic" }}>{meeting.intermediateHymn}</span>
            </div>
          )}
        </>
      )}

      <div style={{ ...divider, marginTop: 10 }} />

      {/* ── CIERRE ── */}
      <div style={colGrid(2)}>
        {meeting.closingHymn && (
          <div>
            <div style={sectionLabel}>Himno de cierre</div>
            <div style={{ fontStyle: "italic" }}>{meeting.closingHymn}</div>
          </div>
        )}
        {meeting.closingPrayer && (
          <div>
            <div style={sectionLabel}>Oración de cierre</div>
            <div>{meeting.closingPrayer}</div>
          </div>
        )}
      </div>

      {/* ── PIE ── */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 8.5, color: "#9ca3af", fontFamily: "Arial, sans-serif" }}>
          {wardName}{stakeName ? ` · ${stakeName}` : ""}
        </div>
        <div style={{ fontSize: 8.5, color: "#9ca3af", fontFamily: "Arial, sans-serif" }}>
          {meetingDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      id="program-portal"
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" }}
    >
      {/* Toolbar */}
      <div className="program-toolbar" style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", flexShrink: 0 }}>
        <button
          onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "white", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
        >
          <Printer size={15} /> Imprimir
        </button>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "white", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
        >
          <X size={15} /> Cerrar
        </button>
      </div>

      {/* Scrollable content */}
      <div className="program-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px", WebkitOverflowScrolling: "touch" }}>
        {program}
      </div>
    </div>,
    document.body
  );
}
