import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { InventoryLocation } from "../types";

export function RegisterLocation({
  uid,
  locations,
  onSubmit,
}: {
  uid: string;
  locations: InventoryLocation[];
  onSubmit: (payload: { name: string; type: "room" | "cabinet" | "shelf"; parent_id?: string }) => void;
}) {
  const [name, setName] = useState("Armario AV");
  const [type, setType] = useState<"room" | "cabinet" | "shelf">("cabinet");
  const [parentId, setParentId] = useState<string | undefined>(locations[0]?.id);

  return (
    <div className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/90 p-4">
      <h2 className="text-2xl font-semibold">Nuevo armario</h2>
      <p className="text-slate-300">UID: {uid}</p>
      <div>
        <p className="mb-2 text-sm text-slate-400">Nombre</p>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border-white/15 bg-white/5" />
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-400">Tipo</p>
        <ToggleGroup className="grid grid-cols-3 gap-2" type="single" value={type} onValueChange={(value) => value && setType(value as any)}>
          <ToggleGroupItem value="room" className="rounded-xl border border-white/15 bg-white/5">Sala</ToggleGroupItem>
          <ToggleGroupItem value="cabinet" className="rounded-xl border border-white/15 bg-white/5">Armario</ToggleGroupItem>
          <ToggleGroupItem value="shelf" className="rounded-xl border border-white/15 bg-white/5">Estante</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-400">Ubicación padre</p>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-white"
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id} className="bg-slate-900">
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <Button className="h-12 w-full rounded-2xl bg-blue-500 hover:bg-blue-400" onClick={() => onSubmit({ name, type, parent_id: parentId })}>
        Crear ubicación
      </Button>
    </div>
  );
}
