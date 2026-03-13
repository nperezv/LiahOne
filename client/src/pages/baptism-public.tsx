import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function rid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function BaptismPublicPage() {
  const [, params] = useRoute("/b/:slug");
  const slug = params?.slug || "";
  const code = new URLSearchParams(window.location.search).get("c") || "";
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");

  const service = useQuery<any>({ queryKey: [`/b/${slug}?c=${code}`], enabled: Boolean(slug && code) });
  const post = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/b/${slug}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, displayName, message, clientRequestId: rid(), company: "" }) });
      if (!res.ok) throw new Error("No se pudo enviar");
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      alert("Tu felicitación quedó pendiente de moderación.");
    },
  });

  if (service.isError) return <main className="mx-auto max-w-md p-6">Enlace caducado.</main>;
  if (!service.data) return <main className="mx-auto max-w-md p-6">Cargando...</main>;

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <p className="rounded bg-muted p-2 text-xs">Disponible hasta {service.data.expiresAtMadrid}</p>
      <h1 className="text-xl font-semibold">Programa bautismal</h1>
      <div className="space-y-2">
        {service.data.program.map((item: any) => (
          <div key={`${item.type}-${item.order}`} className="rounded border p-3 text-sm">
            <p className="font-medium">{item.title || item.type}</p>
            {item.hymn?.externalUrl ? <a href={item.hymn.externalUrl} className="text-blue-600 underline" target="_blank">Abrir himno #{item.hymn.number}</a> : null}
          </div>
        ))}
      </div>
      <section className="space-y-2">
        <h2 className="font-medium">Enviar felicitación</h2>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tu nombre (opcional)" maxLength={40} />
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe un mensaje" maxLength={240} />
        <Button onClick={() => post.mutate()} disabled={!message.trim() || post.isPending}>Enviar felicitación</Button>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Felicitaciones</h2>
        {(service.data.posts || []).length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay felicitaciones aprobadas.</p> : null}
        <div className="grid grid-cols-2 gap-2">
          {service.data.posts.map((p: any) => <div key={p.id} className="rounded border p-2 text-xs"><p className="font-medium">{p.displayName}</p><p>{p.message}</p></div>)}
        </div>
      </section>
    </main>
  );
}
