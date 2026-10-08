import { Redirect, useParams } from "wouter";

// /a/:codigo es la dirección que llevan los QR impresos: lleva directamente a la ficha completa.
export default function InventoryPublicPage() {
  const { assetCode = "" } = useParams<{ assetCode: string }>();
  return <Redirect to={`/inventory/${encodeURIComponent(assetCode)}`} replace />;
}
