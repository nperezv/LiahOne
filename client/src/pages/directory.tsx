import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useMembers } from "@/hooks/use-api";
import { CalendarPlus, Mail, Phone, Search, Send, Users } from "lucide-react";

export default function DirectoryPage() {
  const [, setLocation] = useLocation();
  const { data: members = [], isLoading } = useMembers();
  const [query, setQuery] = useState("");

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.nameSurename,
        member.phone ?? "",
        member.email ?? "",
        member.organizationName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [members, query]);

  const formatAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age;
  };

  const buildWhatsappLink = (phone?: string | null) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Directorio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los miembros del barrio y sus datos de contacto.
          </p>
        </div>
        <Button onClick={() => setLocation("/birthdays")}>Ver cumpleaños</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Miembros del barrio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, teléfono o correo"
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="self-start sm:self-auto">
              {filteredMembers.length} miembros
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className="space-y-3">
              {filteredMembers.map((member) => {
                const whatsappLink = buildWhatsappLink(member.phone);
                return (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">{member.nameSurename}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatAge(member.birthday)} años</span>
                        <span>•</span>
                        <span>{member.organizationName ?? "Sin organización"}</span>
                        {member.email && (
                          <>
                            <span>•</span>
                            <span>{member.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.phone && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`tel:${member.phone}`}>
                            <Phone className="mr-1 h-4 w-4" />
                            Llamar
                          </a>
                        </Button>
                      )}
                      {whatsappLink && (
                        <Button asChild size="sm" variant="outline">
                          <a href={whatsappLink} target="_blank" rel="noreferrer">
                            <Send className="mr-1 h-4 w-4" />
                            WhatsApp
                          </a>
                        </Button>
                      )}
                      {member.email && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`mailto:${member.email}`}>
                            <Mail className="mr-1 h-4 w-4" />
                            Email
                          </a>
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setLocation("/interviews")}>
                        <CalendarPlus className="mr-1 h-4 w-4" />
                        Agendar entrevista
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              No hay miembros para mostrar con ese filtro.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
