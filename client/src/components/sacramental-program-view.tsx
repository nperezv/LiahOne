import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/auth-tokens";

type VoteType = "sostenimiento" | "relevo" | "ordenacion" | "avance";
type VotePhase = "vote" | "opposed";
interface VoteItem { type: VoteType; phrase: string; name: string; detail: string; organization?: string; }
interface VoteDialog { item: VoteItem; phase: VotePhase; opponentName: string; sending: boolean; done: boolean; }

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
const PX = { top: 20, bottom: 20, sides: 18, gap: 10, footer: 32 };
const SPLIT = "48%";

// ── Primitive components ─────────────────────────────────────────

function SectionCard({ left, right, accent }: { left: React.ReactNode; right: React.ReactNode; accent: string }) {
  return (
    <div style={{ border: "1px solid #ececec", borderRadius: 12, display: "flex", position: "relative", alignItems: "stretch" }}>
      <div style={{ position: "absolute", left: SPLIT, top: "12%", bottom: "12%", width: 1, background: "#ececec", pointerEvents: "none" }} />
      <div style={{ width: SPLIT, padding: "12px 14px", boxSizing: "border-box" }}>{left}</div>
      <div style={{ flex: 1, padding: "12px 14px 12px 18px", boxSizing: "border-box" }}>{right}</div>
    </div>
  );
}

function FullCard({ children }: { children: React.ReactNode }) {
  return <div style={{ border: "1px solid #ececec", borderRadius: 12, padding: "12px 14px" }}>{children}</div>;
}

function Lbl({ accent, small, children }: { accent: string; small?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: "block", color: accent, fontSize: small ? 8 : 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: small ? 7 : 5 }}>
      {children}
    </span>
  );
}

function Name({ children, italic }: { children: React.ReactNode; italic?: boolean }) {
  return <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#202124", lineHeight: 1.3, fontStyle: italic ? "italic" : undefined }}>{children}</p>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#70757a", fontStyle: "italic" }}>{children}</p>;
}

function BlueBar({ accent, children }: { accent: string; children: React.ReactNode }) {
  return <div style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 12, marginTop: 4 }}>{children}</div>;
}

function MiniCard({ title, onClick, children }: { title: string; color?: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      className={onClick ? "spv-clickable" : undefined}
      style={{ border: "1px solid #ececec", borderRadius: 8, padding: "7px 10px", marginBottom: 6, cursor: onClick ? "pointer" : undefined, transition: "background .15s" }}
      onClick={onClick}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLElement).style.background = "#e8f0fb"; } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLElement).style.background = ""; } : undefined}
    >
      <div style={{ fontSize: 9, fontWeight: 800, color: "#004481", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
        {title}
      </div>
      {children}
    </div>
  );
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

  const [curPage, setCurPage] = useState(0);
  const [layout, setLayout] = useState<number[][]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const headerMeasureRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const curPageRef = useRef(0);
  curPageRef.current = curPage;

  const [voteDialog, setVoteDialog] = useState<VoteDialog | null>(null);

  const VOTE_PHRASE: Record<VoteType, (name: string, detail: string, org?: string) => string> = {
    sostenimiento: (n, d, o) => `Proponemos que ${n} sea sostenido(a) como ${d}${o ? ` en ${o}` : ""}. Los que estén a favor, sírvanse indicarlo levantando la mano. Opuestos si los hay, también pueden manifestarlo.`,
    relevo:        (n, d, o) => `Proponemos relevar a ${n} como ${d}${o ? ` en ${o}` : ""} y agradecemos su servicio. Los que estén a favor, sírvanse indicarlo levantando la mano. Opuestos si los hay, también pueden manifestarlo.`,
    ordenacion:    (n, d)    => `Proponemos que ${n} reciba el Sacerdocio Aarónico y sea ordenado al oficio de ${d}. Los que estén a favor, sírvanse indicarlo levantando la mano. Opuestos si los hay, también pueden manifestarlo.`,
    avance:        (n, d)    => `Proponemos que ${n} avance en el Sacerdocio Aarónico al oficio de ${d}. Los que estén a favor, sírvanse indicarlo levantando la mano. Opuestos si los hay, también pueden manifestarlo.`,
  };

  const meetingDate = new Date(meeting.date);
  const dayName = meetingDate.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" }).toUpperCase();
  const dayNum = meetingDate.getDate();
  const monthYear = meetingDate.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" }).toUpperCase();
  const longDate = meetingDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const openVote = useCallback((type: VoteType, name: string, detail: string, organization?: string) => {
    const phrase = VOTE_PHRASE[type](name, detail, organization);
    setVoteDialog({ item: { type, phrase, name, detail, organization }, phase: "vote", opponentName: "", sending: false, done: false });
  }, []);

  const submitVote = useCallback(async (result: "unanimous" | "opposed") => {
    if (!voteDialog) return;
    setVoteDialog(d => d ? { ...d, sending: true } : null);
    try {
      await fetch("/api/sacramental-meetings/vote-result", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          meetingDate: longDate,
          type: voteDialog.item.type,
          name: voteDialog.item.name,
          detail: voteDialog.item.detail,
          organization: voteDialog.item.organization,
          result,
          opponentName: voteDialog.opponentName || undefined,
        }),
      });
      setVoteDialog(d => d ? { ...d, sending: false, done: true } : null);
      setTimeout(() => setVoteDialog(null), 1800);
    } catch {
      setVoteDialog(d => d ? { ...d, sending: false } : null);
    }
  }, [voteDialog, longDate]);

  const accent = "#004481";
  const wardName = template?.wardName ?? "Barrio";
  const stakeName = template?.stakeName ?? "";
  // Strip leading "Barrio " so the small label above doesn't duplicate
  const displayWardName = wardName.replace(/^[Bb]arrio\s+/i, "") || wardName;

  const presider = parsePerson(meeting.presider);
  const director = parsePerson(meeting.director);
  const releases = (Array.isArray(meeting.releases) ? meeting.releases : []).filter((r: any) => r?.name && r?.oldCalling);
  const sustainments = (Array.isArray(meeting.sustainments) ? meeting.sustainments : []).filter((s: any) => s?.name && s?.calling);
  const confirmations = (Array.isArray(meeting.confirmations) ? meeting.confirmations : []).filter(Boolean);
  const newMembers = (Array.isArray(meeting.newMembers) ? meeting.newMembers : []).filter(Boolean);
  const childBlessings = (Array.isArray(meeting.childBlessings) ? meeting.childBlessings : []).filter(Boolean);
  const OFFICE_LABEL: Record<string, string> = { diacono: "Diácono", maestro: "Maestro", presbitero: "Presbítero" };
  const fmtAaronic = (o: any) => typeof o === "string" ? o : `${o.name}${o.office ? ` — ${OFFICE_LABEL[o.office] ?? o.office}` : ""}`;
  const aaronicOrderings = (Array.isArray(meeting.aaronicOrderings) ? meeting.aaronicOrderings : []).filter((o: any) => typeof o === "string" ? o : o?.name);
  const aaronicAdvancements = (Array.isArray(meeting.aaronicAdvancements) ? meeting.aaronicAdvancements : []).filter((o: any) => o?.name);
  const discourses = (Array.isArray(meeting.discourses) ? meeting.discourses : []).filter((d: any) => d?.speaker);
  const intermediateHymnLabel = meeting.intermediateHymn
    ? `${meeting.intermediateHymn}${meeting.intermediateHymnType === "choir" ? " (Coro)" : meeting.intermediateHymnType === "congregation" ? " (Congregación)" : ""}`
    : "";
  const hasWardBusiness = releases.length > 0 || sustainments.length > 0 || confirmations.length > 0 || newMembers.length > 0 || childBlessings.length > 0 || aaronicOrderings.length > 0 || aaronicAdvancements.length > 0;

  // Don't append "(OrgName)" if a significant word from it already appears in the calling
  const fmtCallingOrg = (calling: string, oName: string) => {
    if (!oName) return calling;
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const nCalling = norm(calling);
    const orgWords = norm(oName).split(/\s+/).filter(w => w.length > 3);
    if (orgWords.some(w => nCalling.includes(w))) return calling;
    return `${calling} (${oName})`;
  };

  const bul = (items: string[]) => items.filter(Boolean).map((item, i) => (
    <div key={i} style={{ fontSize: 10.5, color: "#3c4043", marginBottom: 2, display: "flex", gap: 5 }}>
      <span style={{ color: accent, flexShrink: 0 }}>·</span><span>{item}</span>
    </div>
  ));

  const itemText = (label: string) => (
    <div style={{ fontSize: 10.5, color: "#3c4043", display: "flex", gap: 5, alignItems: "flex-start" }}>
      <span style={{ color: accent, flexShrink: 0 }}>·</span><span>{label}</span>
    </div>
  );

  const empty = <span style={{ color: "#ccc", fontSize: 11 }}>—</span>;

  // ── Flow sections ──────────────────────────────────────────────
  const sections = useMemo(() => {
    const s: { key: string; node: React.ReactNode }[] = [];

    // Preside / Dirige
    if (presider.name || director.name) s.push({
      key: "preside-dirige",
      node: (
        <SectionCard accent={accent}
          left={presider.name ? <><Lbl accent={accent}>Preside</Lbl><Name>{presider.name}</Name>{presider.calling && <Sub>{presider.calling}</Sub>}</> : null}
          right={director.name ? <><Lbl accent={accent}>Dirige</Lbl><Name>{director.name}</Name>{director.calling && <Sub>{director.calling}</Sub>}</> : null}
        />
      ),
    });

    // Reconocimiento + Música
    if (recognitionMembers.length > 0 || meeting.musicDirector || meeting.pianist) s.push({
      key: "recog-musica",
      node: (
        <SectionCard accent={accent}
          left={
            <>
              <Lbl accent={accent}>Reconocimiento</Lbl>
              {recognitionMembers.length > 0 ? (
                <BlueBar accent={accent}>
                  {recognitionMembers.map((m, i) => (
                    <div key={i} style={{ marginBottom: i < recognitionMembers.length - 1 ? 12 : 0 }}>
                      <Name>{m.name}</Name>
                      {m.calling && <Sub>{m.calling}</Sub>}
                    </div>
                  ))}
                </BlueBar>
              ) : empty}
            </>
          }
          right={
            <>
              {meeting.musicDirector && (
                <div style={{ marginBottom: meeting.pianist ? 20 : 0 }}>
                  <Lbl accent={accent}>Dirección de la música</Lbl>
                  <Name>{meeting.musicDirector}</Name>
                </div>
              )}
              {meeting.pianist && (
                <div>
                  <Lbl accent={accent}>Acompañamiento en el piano</Lbl>
                  <Name>{meeting.pianist}</Name>
                </div>
              )}
            </>
          }
        />
      ),
    });

    // Himno apertura + Oración
    if (meeting.openingHymn || meeting.openingPrayer) s.push({
      key: "apertura",
      node: (
        <SectionCard accent={accent}
          left={meeting.openingHymn ? <><Lbl accent={accent}>Himno de apertura</Lbl><Name italic>{meeting.openingHymn}</Name></> : null}
          right={meeting.openingPrayer ? <><Lbl accent={accent}>Oración</Lbl><Name>{meeting.openingPrayer}</Name></> : null}
        />
      ),
    });

    // Anuncios y Asuntos
    s.push({
      key: "anuncios",
      node: (
        <FullCard>
          <Lbl accent={accent}>Anuncios y Asuntos</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 10, borderTop: "1px solid #f1f3f4", paddingTop: 12 }}>
            <div>
              <Lbl accent={accent} small>Anuncios</Lbl>
              {meeting.announcements?.trim() ? bul(meeting.announcements.split("\n").map((l: string) => l.trim()).filter(Boolean)) : empty}
            </div>
            <div>
              <Lbl accent={accent} small>Asuntos de barrio</Lbl>
              {!hasWardBusiness && empty}
              {releases.map((r: any, i: number) => { const o = orgName(organizations, r.organizationId); const label = `${r.name}${r.oldCalling ? ` — ${fmtCallingOrg(r.oldCalling, o)}` : o ? ` (${o})` : ""}`; return <MiniCard key={`rel-${i}`} title="Relevo" onClick={() => openVote("relevo", r.name, r.oldCalling || "", o || undefined)}>{itemText(label)}</MiniCard>; })}
              {sustainments.map((s: any, i: number) => { const o = orgName(organizations, s.organizationId); const label = `${s.name} — ${fmtCallingOrg(s.calling, o)}`; return <MiniCard key={`sus-${i}`} title="Sostenimiento" onClick={() => openVote("sostenimiento", s.name, s.calling, o || undefined)}>{itemText(label)}</MiniCard>; })}
              {confirmations.length > 0 && <MiniCard title="Confirmaciones">{bul(confirmations)}</MiniCard>}
              {newMembers.length > 0 && <MiniCard title="Nuevos miembros">{bul(newMembers)}</MiniCard>}
              {aaronicOrderings.map((o: any, i: number) => { const office = OFFICE_LABEL[o.office] ?? o.office ?? ""; return <MiniCard key={`ord-${i}`} title="Ordenación Sacerdocio Aarónico" onClick={() => openVote("ordenacion", o.name, office)}>{itemText(fmtAaronic(o))}</MiniCard>; })}
              {aaronicAdvancements.map((a: any, i: number) => { const office = OFFICE_LABEL[a.office] ?? a.office ?? ""; return <MiniCard key={`adv-${i}`} title="Avance Sacerdocio Aarónico" onClick={() => openVote("avance", a.name, office)}>{itemText(fmtAaronic(a))}</MiniCard>; })}
              {childBlessings.length > 0 && <MiniCard title="Bendición de niños">{bul(childBlessings)}</MiniCard>}
            </div>
            <div>
              <Lbl accent={accent} small>Asuntos de estaca</Lbl>
              {meeting.stakeBusiness?.trim() ? bul(meeting.stakeBusiness.split("\n").map((l: string) => l.trim()).filter(Boolean)) : empty}
            </div>
          </div>
        </FullCard>
      ),
    });

    // Santa Cena — card invertida para resaltar
    s.push({
      key: "santa-cena",
      node: (
        <div style={{ background: accent, borderRadius: 12, padding: "12px 14px" }}>
          <span style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
            Santa Cena
          </span>
          {meeting.sacramentHymn && (
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#fff" }}>
              <strong>Himno sacramental:</strong> <span style={{ fontStyle: "italic" }}>{meeting.sacramentHymn}</span>
            </p>
          )}
          <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.75)" }}>
            La bendición y el reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.
          </p>
        </div>
      ),
    });

    // Mensajes / Testimonios
    if (meeting.isTestimonyMeeting) {
      s.push({
        key: "testimonios",
        node: <FullCard><Lbl accent={accent}>Testimonios</Lbl><p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "#70757a" }}>Reunión de Ayuno y Testimonio.</p></FullCard>,
      });
    } else if (discourses.length > 0 || intermediateHymnLabel) {
      s.push({
        key: "mensajes",
        node: (
          <FullCard>
            <Lbl accent={accent}>Mensajes</Lbl>
            {/* Discourse 0 */}
            {discourses[0] && (
              <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: accent, fontSize: 13, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>①</span>
                <div><Name>{discourses[0].speaker}</Name>{discourses[0].topic && <Sub>{discourses[0].topic}</Sub>}</div>
              </div>
            )}
            {/* Intermediate hymn — visually distinct from discourses */}
            {intermediateHymnLabel && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#f0f7ff", borderRadius: 8, borderLeft: `2px solid ${accent}` }}>
                <span style={{ display: "block", color: accent, fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
                  Himno intermedio
                </span>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: accent, fontStyle: "italic" }}>{intermediateHymnLabel}</p>
              </div>
            )}
            {/* Remaining discourses */}
            {discourses.slice(1).map((d: any, i: number) => {
              const circled = ["②","③","④","⑤","⑥","⑦","⑧","⑨"][i] ?? `${i + 2}.`;
              return (
                <div key={i + 1} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f3f4", display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ color: accent, fontSize: 13, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>{circled}</span>
                  <div><Name>{d.speaker}</Name>{d.topic && <Sub>{d.topic}</Sub>}</div>
                </div>
              );
            })}
          </FullCard>
        ),
      });
    }

    // Cierre
    if (meeting.closingHymn || meeting.closingPrayer) s.push({
      key: "cierre",
      node: (
        <SectionCard accent={accent}
          left={meeting.closingHymn ? <><Lbl accent={accent}>Himno de cierre</Lbl><Name italic>{meeting.closingHymn}</Name></> : null}
          right={meeting.closingPrayer ? <><Lbl accent={accent}>Oración de cierre</Lbl><Name>{meeting.closingPrayer}</Name></> : null}
        />
      ),
    });

    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, meeting, recognitionMembers, organizations]);

  // ── Pagination ─────────────────────────────────────────────────
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
          pages.push([...cur]); cur = [i]; used = h;
        } else {
          cur.push(i); used += gap + h;
        }
      });
      if (cur.length) pages.push(cur);
      setLayout(pages);
    };

    if (document.fonts?.ready) document.fonts.ready.then(run);
    else setTimeout(run, 300);
  }, [sections]);

  // keyboard + print
  useEffect(() => {
    const goTo = (p: number) => {
      if (!scrollRef.current) return;
      const total = layout.length || 1;
      const clamped = Math.max(0, Math.min(p, total - 1));
      scrollRef.current.scrollTo({ left: clamped * (scrollRef.current.clientWidth + 16), behavior: "smooth" });
    };
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
  }, [onClose, layout]);

  const totalPages = Math.max(layout.length, 1);

  const goTo = (p: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: Math.max(0, Math.min(p, totalPages - 1)) * (scrollRef.current.clientWidth + 16), behavior: "smooth" });
  };

  const onScroll = () => {
    if (!scrollRef.current) return;
    setCurPage(Math.round(scrollRef.current.scrollLeft / (scrollRef.current.clientWidth + 16)));
  };

  // ── Header ─────────────────────────────────────────────────────
  const headerNode = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ margin: 0, fontWeight: 400, color: "#70757a", fontSize: 11 }}>Barrio</div>
          <div style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, letterSpacing: "-0.5px" }}>{displayWardName}</div>
          {stakeName && <div style={{ color: accent, fontWeight: 700, fontSize: 9, letterSpacing: "0.8px", marginTop: 6, textTransform: "uppercase" }}>{stakeName}</div>}
        </div>
        <div style={{ background: "#f1f3f4", padding: "10px 16px", borderRadius: 12, textAlign: "center", flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#70757a", letterSpacing: "0.06em" }}>{dayName}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1, margin: "3px 0" }}>{dayNum}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#70757a", letterSpacing: "0.06em" }}>{monthYear}</div>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ margin: 0, fontSize: 9, textTransform: "uppercase", color: "#70757a", letterSpacing: "1.5px", fontWeight: 600 }}>Programa de</div>
        <div style={{ fontSize: 17, fontWeight: 700, textTransform: "uppercase", color: "#1a1a1a", margin: "3px 0 0", letterSpacing: "-0.3px" }}>Reunión Sacramental</div>
      </div>
    </>
  );

  const footerNode = (pageIdx: number) => (
    <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #f1f3f4", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9aa0a6", flexShrink: 0 }}>
      <span>{stakeName || wardName}</span>
      <span>Página {pageIdx + 1} de {totalPages}</span>
      <span>{wardName} · {longDate}</span>
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
    fontSize: 11,
    color: "#333",
    lineHeight: 1.45,
    boxSizing: "border-box" as const,
    borderRadius: 12,
    boxShadow: "0 8px 48px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column" as const,
  };

  const mainPortal = createPortal(
    <div id="prog-portal" style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#0f172a", display: "flex", flexDirection: "column" }}>

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

        {/* Measurement container (off-screen, invisible) */}
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
      <div className="prog-dots" style={{ display: "flex", justifyContent: "center", gap: 6, padding: "10px 0", flexShrink: 0 }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{ width: curPage === i ? 22 : 6, height: 6, borderRadius: 3, border: "none", cursor: "pointer", background: curPage === i ? "white" : "rgba(255,255,255,0.3)", transition: "all 0.25s ease", padding: 0 }} />
        ))}
      </div>

    </div>,
    document.body
  );

  // ── Vote dialog ────────────────────────────────────────────────────────────
  const votePortal = voteDialog ? createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={() => !voteDialog.sending && setVoteDialog(null)}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 540, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.35)", position: "relative" }}
        onClick={e => e.stopPropagation()}
      >
        {voteDialog.done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#166534" }}>Notificación enviada</p>
          </div>
        ) : voteDialog.phase === "vote" ? (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              {{ sostenimiento: "Sostenimiento", relevo: "Relevo", ordenacion: "Ordenación", avance: "Avance" }[voteDialog.item.type]}
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#1a1a2e", fontStyle: "italic", background: "#f8f9fe", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              "{voteDialog.item.phrase}"
            </p>
            <p style={{ fontSize: 12, color: "#555", marginBottom: 16, fontWeight: 600 }}>Resultado de la votación:</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                disabled={voteDialog.sending}
                onClick={() => submitVote("unanimous")}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                ✅ Unánime
              </button>
              <button
                disabled={voteDialog.sending}
                onClick={() => setVoteDialog(d => d ? { ...d, phase: "opposed" } : null)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#f59e0b", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                ⚠️ Con oposición
              </button>
            </div>
            <button onClick={() => setVoteDialog(null)} style={{ marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid #e5e7eb", background: "transparent", fontSize: 13, color: "#888", cursor: "pointer" }}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#b45309", marginBottom: 16 }}>⚠️ Registrar oposición</p>
            <p style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Nombre de quien se opuso <span style={{ color: "#aaa" }}>(opcional)</span></p>
            <input
              type="text"
              placeholder="Nombre completo..."
              value={voteDialog.opponentName}
              onChange={e => setVoteDialog(d => d ? { ...d, opponentName: e.target.value } : null)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setVoteDialog(d => d ? { ...d, phase: "vote" } : null)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e5e7eb", background: "transparent", fontSize: 13, color: "#555", cursor: "pointer" }}
              >
                ← Atrás
              </button>
              <button
                disabled={voteDialog.sending}
                onClick={() => submitVote("opposed")}
                style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {voteDialog.sending ? "Enviando..." : "Confirmar y notificar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  const pulseStyle = (
    <style>{`
      @keyframes spv-pulse {
        0%, 100% { box-shadow: none; }
        50% { box-shadow: 0 0 0 2px rgba(0,68,129,0.25); }
      }
      .spv-clickable { animation: spv-pulse 2.2s ease-in-out infinite; }
    `}</style>
  );

  return <>{pulseStyle}{mainPortal}{votePortal}</>;
}
