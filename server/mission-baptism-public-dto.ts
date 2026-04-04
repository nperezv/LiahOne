export type PublicProgramInputItem = {
  type: string;
  title: string | null;
  order: number;
  publicVisibility: boolean;
  hymnId: string | null;
  hymnNumber: number | null;
  hymnTitle: string | null;
  hymnExternalUrl: string | null;
  participantUserId?: string | null;
  participantDisplayName?: string | null;
  notes?: string | null;
};

export type PublicPostInput = {
  id: string;
  displayName: string | null;
  message: string;
  createdAt: Date;
  status?: string;
  clientRequestId?: string;
};

export function formatMadrid(date: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export type PublicCandidate = {
  nombre: string;
  sexo: string | null;
  fechaNacimiento: string | null;
};

export function toPublicServiceDTO(input: {
  items: PublicProgramInputItem[];
  approvedPosts: PublicPostInput[];
  expiresAt: Date;
  candidates?: PublicCandidate[];
  serviceAt?: Date | null;
  wardName?: string | null;
}) {
  return {
    program: input.items
      .filter((item) => item.publicVisibility)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        type: item.type,
        title: item.title,
        order: item.order,
        hymn: item.hymnId
          ? {
              number: item.hymnNumber,
              title: item.hymnTitle,
              externalUrl: item.hymnExternalUrl,
            }
          : null,
      })),
    posts: input.approvedPosts.map((post) => ({
      id: post.id,
      displayName: post.displayName || "Anónimo",
      message: post.message,
      createdAt: post.createdAt,
    })),
    candidates: (input.candidates ?? []).map((c) => ({
      nombre: c.nombre,
      sexo: c.sexo,
      fechaNacimiento: c.fechaNacimiento,
    })),
    serviceAt: input.serviceAt ? input.serviceAt.toISOString() : null,
    wardName: input.wardName ?? null,
    expiresAt: input.expiresAt,
    expiresAtMadrid: formatMadrid(input.expiresAt),
  };
}
