import { useParams } from "wouter";
import { useInventoryItem } from "@/hooks/use-api";

export default function InventoryPublicPage() {
  const { assetCode } = useParams<{ assetCode: string }>();
  const { data } = useInventoryItem(assetCode);

  if (!data?.item) return <div className="p-6">Item no encontrado</div>;

  return (
    <div className="mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-2xl font-bold">{data.item.assetCode}</h1>
      <p className="text-lg">{data.item.name}</p>
      <p className="text-muted-foreground">Estado: {data.item.status}</p>
    </div>
  );
}
