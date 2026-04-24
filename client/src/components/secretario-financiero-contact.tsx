import { useQuery } from "@tanstack/react-query";
import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserRow {
  id: string;
  name: string;
  displayName?: string | null;
  role: string;
  phone?: string | null;
}

export function SecretarioFinancieroContact() {
  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ["/api/users"] });
  const secretary = users.find((u) => u.role === "secretario_financiero");

  const name = secretary ? (secretary.displayName || secretary.name) : null;
  const rawPhone = secretary?.phone?.replace(/[^\d+]/g, "") ?? null;
  const waPhone = rawPhone?.replace(/^\+/, "") ?? null;

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
      <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
        Para no almacenar datos bancarios sensibles en la plataforma, ponte en contacto directamente con el Secretario Financiero:
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-sm">{name ?? "Secretario Financiero"}</p>
          <p className="text-xs text-muted-foreground">Secretario Financiero del barrio</p>
        </div>
        {rawPhone && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={`tel:${rawPhone}`}>
                <Phone className="h-3.5 w-3.5 mr-1.5" />
                Llamar
              </a>
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                WhatsApp
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
