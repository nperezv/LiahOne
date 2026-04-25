import { useEffect, useMemo, useRef, useState } from "react";
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
const PX = { top: 28, bottom: 24, sides: 28, gap: 12, footer: 36 };
const lightTint = (hex: string) => `${hex}18`;

export function SacramentalProgramView({ meeting, organizations, recognitionMembers, onPDF, onClose }: Props) {
  const { data: template } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: async () => {
      const res = await fetch("/api/pdf-template", { headers: getAuthHeaders() });
      if (!res.ok) return { wardName: "Barrio", stakeName: "", accentColor: "1a3554", footerText: "" };
      return res.json();
    },
  });

  const [curPage, setCurPage] = useState(0);
  const [layout, setLayout] = useState<number[][]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const headerMeasureRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const curPageRef = useRef(0);
  curPageRef.current = curPage;

  const accent = `#${template?.accentColor ?? "1a3554"}`;
  const wardName = template?.wardName ?? "Barrio";
  const stakeName = template?.stakeName ?? "";

  const meetingDate = new Date(meeting.date);
  const dayName = meetingDate.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const dayNum = meetingDate.getDate();
  const monthYear = meetingDate.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  const longDate = meetingDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const presider = parsePerson(meeting.presider);
  const director = parsePerson(meeting.director);
  const releases = (Array.isArray(meeting.releases) ? meeting.releases : []).filter((r: any) => r?.name && r?.oldCalling);
  const sustainments = (Array.isArray(meeting.sustainments) ? meeting.sustainments : []).filter((s: any) => s?.name && s?.calling);
  const confirmations = (Array.isArray(meeting.confirmations) ? meeting.confirmations : []).filter(Boolean);
  const newMembers = (Array.isArray(meeting.newMembers) ? meeting.newMembers : []).filter(Boolean);
  const childBlessings = (Array.isArray(meeting.childBlessings) ? meeting.childBlessings : []).filter(Boolean);
  const discourses = (Array.isArray(meeting.discourses) ? meeting.discourses : []).filter((d: any) => d?.speaker);
  const hasWardBusiness = releases.length > 0 || sustainments.length > 0 || confirmations.length > 0 || newMembers.length > 0 || childBlessings.length > 0;

  // ── Style atoms ────────────────────────────────────────────────
  const card: React.CSSProperties = { border: "1px solid #e0e0e0", borderRadius: 10, padding: "16px 20px", background: "#fff" };
  const lbl: React.CSSProperties = { display: "block", color: accent, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 };
  const pName: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 };
  const pRole: React.CSSProperties = { margin: 0, fontSize: 12, color: "#888", fontStyle: "italic", lineHeight: 1.3, marginTop: 2 };
  const subHead: React.CSSProperties = { color: accent, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6 };
  const empty = <span style={{ color: "#ccc", fontSize: 12 }}>—</span>;

  const bul = (items: string[]) => items.filter(Boolean).map((item, i) => (
    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2, fontSize: 12 }}>
      <span style={{ color: accent, flexShrink: 0 }}>·</span>
      <span style={{ color: "#444" }}>{item}</span>
    </div>
  ));

  // ── Flow sections (measured + paginated) ───────────────────────
  const sections = useMemo(() => {
    const s: { key: string; node: React.ReactNode }[] = [];

    if (presider.name || director.name) s.push({
      key: "preside-dirige",
      node: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {presider.name && <div style={card}><span style={lbl}>Preside</span><p style={pName}>{presider.name}</p>{presider.calling && <p style={pRole}>{presider.calling}</p>}</div>}
          {director.name && <div style={card}><span style={lbl}>Dirige</span><p style={pName}>{director.name}</p>{director.calling && <p style={pRole}>{director.calling}</p>}</div>}
        </div>
      ),
    });

    if (recognitionMembers.length > 0 || meeting.musicDirector || meeting.pianist) s.push({
      key: "recog-musica",
      node: (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px" }}>
            <span style={lbl}>Reconocimiento</span>
            {recognitionMembers.length > 0 ? (
              <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12 }}>
                {recognitionMembers.map((m, i) => (
                  <div key={i} style={{ marginBottom: i < recognitionMembers.length - 1 ? 10 : 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{m.name}</div>
                    {m.calling && <div style={pRole}>{m.calling}</div>}
                  </div>
                ))}
              </div>
            ) : empty}
          </div>
          <div style={{ padding: "16px 20px", borderLeft: "1px solid #e0e0e0" }}>
            {meeting.musicDirector && <div style={{ marginBottom: meeting.pianist ? 12 : 0 }}><span style={lbl}>Dirección de la música</span><p style={pName}>{meeting.musicDirector}</p></div>}
            {meeting.pianist && <div><span style={lbl}>Acompañamiento en el piano</span><p style={pName}>{meeting.pianist}</p></div>}
          </div>
        </div>
      ),
    });

    if (meeting.openingHymn || meeting.openingPrayer) s.push({
      key: "apertura",
      node: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {meeting.openingHymn && <div style={card}><span style={lbl}>Himno de apertura</span><p style={{ ...pName, fontStyle: "italic", fontWeight: 500 }}>{meeting.openingHymn}</p></div>}
          {meeting.openingPrayer && <div style={card}><span style={lbl}>Oración</span><p style={pName}>{meeting.openingPrayer}</p></div>}
        </div>
      ),
    });

    s.push({
      key: "anuncios",
      node: (
        <div style={card}>
          <span style={lbl}>Anuncios y Asuntos</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 12 }}>
            <div>
              <div style={subHead}>Anuncios</div>
              {meeting.announcements?.trim() ? bul(meeting.announcements.split("\n").map((l: string) => l.trim()).filter(Boolean)) : empty}
            </div>
            <div>
              <div style={subHead}>Asuntos de barrio</div>
              {!hasWardBusiness && empty}
              {releases.length > 0 && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Relevos:</div>{bul(releases.map((r: any) => { const o = orgName(organizations, r.organizationId); return `${r.name}${o ? ` (${o})` : ""}`; }))}</div>}
              {sustainments.length > 0 && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Sostenimientos:</div>{bul(sustainments.map((s: any) => { const o = orgName(organizations, s.organizationId); return `${s.name} — ${s.calling}${o ? ` (${o})` : ""}`; }))}</div>}
              {confirmations.length > 0 && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Confirmaciones:</div>{bul(confirmations)}</div>}
              {newMembers.length > 0 && <div style={{ marginBottom: 5 }}><div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Nuevos miembros:</div>{bul(newMembers)}</div>}
              {childBlessings.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2 }}>Bendición de niños:</div>{bul(childBlessings)}</div>}
            </div>
            <div>
              <div style={subHead}>Asuntos de estaca</div>
              {meeting.stakeBusiness?.trim() ? bul(meeting.stakeBusiness.split("\n").map((l: string) => l.trim()).filter(Boolean)) : empty}
            </div>
          </div>
        </div>
      ),
    });

    s.push({
      key: "santa-cena",
      node: (
        <div style={card}>
          <span style={lbl}>Santa Cena</span>
          {meeting.sacramentHymn && <p style={{ margin: "0 0 6px", fontSize: 13, color: "#1a1a1a" }}><strong>Himno sacramental:</strong> <span style={{ fontStyle: "italic" }}>{meeting.sacramentHymn}</span></p>}
          <p style={{ margin: 0, fontSize: 12, color: "#777" }}>La bendición y el reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.</p>
        </div>
      ),
    });

    if (meeting.isTestimonyMeeting) {
      s.push({ key: "testimonios", node: <div style={card}><span style={lbl}>Testimonios</span><p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "#555" }}>Reunión de Ayuno y Testimonio.</p></div> });
    } else if (discourses.length > 0) {
      s.push({
        key: "mensajes",
        node: (
          <div style={card}>
            <span style={lbl}>Mensajes</span>
            {discourses.map((d: any, i: number) => (
              <div key={i} style={{ marginBottom: i < discourses.length - 1 ? 8 : 0 }}>
                {i > 0 && <div style={{ borderTop: "1px solid #f0f0f0", margin: "8px 0" }} />}
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{d.speaker}</p>
                {d.topic && <p style={pRole}>{d.topic}</p>}
              </div>
            ))}
            {meeting.intermediateHymn && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
                <span style={{ ...lbl, marginBottom: 3 }}>Himno intermedio</span>
                <p style={{ margin: 0, fontStyle: "italic", fontSize: 13 }}>{meeting.intermediateHymn}</p>
              </div>
            )}
          </div>
        ),
      });
    }

    if (meeting.closingHymn || meeting.closingPrayer) s.push({
      key: "cierre",
      node: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {meeting.closingHymn && <div style={card}><span style={lbl}>Himno de cierre</span><p style={{ ...pName, fontStyle: "italic", fontWeight: 500 }}>{meeting.closingHymn}</p></div>}
          {meeting.closingPrayer && <div style={card}><span style={lbl}>Oración de cierre</span><p style={pName}>{meeting.closingPrayer}</p></div>}
        </div>
      ),
    });

    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, meeting, recognitionMembers, organizations]);

  // ── Pagination logic ───────────────────────────────────────────
  useEffect(() => {
    const run = () => {
      if (!measureRef.current || !scrollAreaRef.current || !headerMeasureRef.current) return;

      const areaH = scrollAreaRef.current.clientHeight;
      const headerH = headerMeasureRef.current.offsetHeight;
      const children = Array.from(measureRef.current.children) as HTMLElement[];
      const heights = children.map(el => el.offsetHeight);

      const page1Max = areaH - PX.top - PX.bottom - headerH - PX.footer;
      const pageNMax = areaH - PX.top - PX.bottom - PX.footer;

      const pages: number[][] = [];
      let cur: number[] = [];
      let used = 0;

      heights.forEach((h, i) => {
        const gap = cur.length > 0 ? PX.gap : 0;
        const max = pages.length === 0 ? page1Max : pageNMax;
        if (cur.length > 0 && used + gap + h > max) {
          pages.push([...cur]);
          cur = [i];
          used = h;
        } else {
          cur.push(i);
          used += gap + h;
        }
      });
      if (cur.length) pages.push(cur);

      setLayout(pages);
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(run);
    } else {
      setTimeout(run, 300);
    }
  }, [sections]);

  // keyboard + print CSS
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goTo(curPageRef.current + 1);
      if (e.key === "ArrowLeft") goTo(curPageRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    const style = document.createElement("style");
    style.id = "prog-print";
    style.textContent = `@media print{body>*:not(#prog-portal){display:none!important}#prog-portal{position:static!important;background:white!important}.prog-toolbar,.prog-dots{display:none!important}.prog-scroll{display:block!important;overflow:visible!important}.prog-page{width:100%!important;max-width:100%!important;height:auto!important;box-shadow:none!important;margin:0!important;border-radius:0!important;page-break-after:always;break-after:page}}`;
    document.head.appendChild(style);
    return () => { window.removeEventListener("keydown", onKey); document.head.removeChild(style); };
  }, [onClose]);

  const totalPages = Math.max(layout.length, 1);

  const goTo = (p: number) => {
    if (!scrollRef.current) return;
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    scrollRef.current.scrollTo({ left: clamped * (scrollRef.current.clientWidth + 16), behavior: "smooth" });
  };

  const onScroll = () => {
    if (!scrollRef.current) return;
    setCurPage(Math.round(scrollRef.current.scrollLeft / (scrollRef.current.clientWidth + 16)));
  };

  // ── Shared header (page 1 only) ────────────────────────────────
  const headerNode = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 400, color: "#777", fontSize: 13 }}>Barrio</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#1a1a1a", lineHeight: 1, letterSpacing: "-0.02em" }}>{wardName}</div>
          {stakeName && <div style={{ color: accent, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", marginTop: 4 }}>{stakeName.toUpperCase()}</div>}
        </div>
        <div style={{ background: lightTint(accent), padding: "12px 20px", borderRadius: 10, textAlign: "center", minWidth: 80, flexShrink: 0 }}>
          <div style={{ color: "#777", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>{dayName}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1, margin: "4px 0" }}>{dayNum}</div>
          <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.06em" }}>{monthYear}</div>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ textTransform: "uppercase", fontSize: 10, color: "#888", letterSpacing: "0.15em", marginBottom: 4 }}>Programa de</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1, letterSpacing: "-0.01em" }}>REUNIÓN SACRAMENTAL</div>
      </div>
    </>
  );

  const footerNode = (pageIdx: number) => (
    <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#bbb", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
      <span>{wardName}{stakeName ? ` · ${stakeName}` : ""}</span>
      <span>Página {pageIdx + 1} de {totalPages}</span>
      <span>{longDate}</span>
    </div>
  );

  const pageBase: React.CSSProperties = {
    flexShrink: 0,
    width: "calc(100vw - 32px)",
    maxWidth: "210mm",
    height: "100%",
    background: "#fff",
    scrollSnapAlign: "center",
    overflowY: "hidden",
    overflowX: "hidden",
    padding: `${PX.top}px ${PX.sides}px ${PX.bottom}px`,
    fontFamily: FONT,
    fontSize: 13,
    color: "#333",
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
    borderRadius: 12,
    boxShadow: "0 8px 48px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column" as const,
  };

  return createPortal(
    <div id="prog-portal" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0f172a", display: "flex", flexDirection: "column" }}>

      {/* Toolbar */}
      <div className="prog-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => goTo(curPage - 1)} disabled={curPage === 0}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: curPage === 0 ? "rgba(255,255,255,0.3)" : "white", cursor: curPage === 0 ? "default" : "pointer", display: "flex", alignItems: "center", fontFamily: FONT }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => goTo(curPage + 1)} disabled={curPage >= totalPages - 1}
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: curPage >= totalPages - 1 ? "rgba(255,255,255,0.3)" : "white", cursor: curPage >= totalPages - 1 ? "default" : "pointer", display: "flex", alignItems: "center", fontFamily: FONT }}>
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

      {/* Scroll area */}
      <div ref={scrollAreaRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* Hidden measurement container (off-screen, same page width) */}
        <div style={{ position: "absolute", left: -9999, top: 0, width: "calc(100vw - 32px)", maxWidth: "210mm", visibility: "hidden", pointerEvents: "none", fontFamily: FONT, fontSize: 13, lineHeight: 1.5, padding: `0 ${PX.sides}px`, boxSizing: "border-box" }}>
          <div ref={headerMeasureRef}>{headerNode}</div>
          <div ref={measureRef} style={{ display: "flex", flexDirection: "column", gap: PX.gap }}>
            {sections.map(s => <div key={s.key}>{s.node}</div>)}
          </div>
        </div>

        {/* Swipeable pages */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="prog-scroll"
          style={{ height: "100%", display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" as any, gap: 16, padding: "12px 16px", alignItems: "stretch", scrollbarWidth: "none" as any }}
        >
          {layout.length === 0 ? (
            // Before measurement: show all in one page (will reflow after)
            <div className="prog-page" style={pageBase}>
              {headerNode}
              <div style={{ display: "flex", flexDirection: "column", gap: PX.gap, flex: 1 }}>
                {sections.map(s => <div key={s.key}>{s.node}</div>)}
              </div>
              {footerNode(0)}
            </div>
          ) : (
            layout.map((idxs, pageIdx) => (
              <div key={pageIdx} className="prog-page" style={pageBase}>
                {pageIdx === 0 && headerNode}
                <div style={{ display: "flex", flexDirection: "column", gap: PX.gap, flex: 1 }}>
                  {idxs.map(i => <div key={sections[i].key}>{sections[i].node}</div>)}
                </div>
                {footerNode(pageIdx)}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dots */}
      <div className="prog-dots" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "10px 0", flexShrink: 0 }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{ width: curPage === i ? 22 : 6, height: 6, borderRadius: 3, border: "none", cursor: "pointer", background: curPage === i ? "white" : "rgba(255,255,255,0.3)", transition: "all 0.25s ease", padding: 0 }} />
        ))}
      </div>

    </div>,
    document.body
  );
}
