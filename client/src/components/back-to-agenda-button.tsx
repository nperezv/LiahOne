import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";

export function BackToAgendaButton() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  if (!new URLSearchParams(search).get("from")?.includes("agenda")) return null;
  return (
    <Button variant="outline" className="rounded-full" onClick={() => setLocation("/agenda")}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Agenda
    </Button>
  );
}
