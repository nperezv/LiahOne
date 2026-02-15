import { fetchWithAuthRetry } from "@/lib/auth-tokens";

type ResourceOpenMode = "download" | "inline";

const getFileExtension = (filename: string) => {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index) : "";
};

export const buildResourceFileUrl = (url: string, filename: string, mode: ResourceOpenMode = "download") => {
  const storedFilename = url.split("/").pop() ?? "";
  if (!storedFilename) {
    return url;
  }

  return `/api/uploads/${encodeURIComponent(storedFilename)}/download?filename=${encodeURIComponent(filename)}&mode=${mode}`;
};

export async function downloadResourceFile(url: string, placeholderName: string, originalFilename: string) {
  const extension = getFileExtension(originalFilename);
  const safeName = `${placeholderName || "recurso"}${extension}`;
  const downloadUrl = buildResourceFileUrl(url, safeName, "download");

  const response = await fetchWithAuthRetry(downloadUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error("No se pudo descargar el archivo");
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

export function openResourceFileInBrowser(url: string, placeholderName: string, originalFilename: string) {
  const extension = getFileExtension(originalFilename);
  const safeName = `${placeholderName || "recurso"}${extension}`;
  const openUrl = buildResourceFileUrl(url, safeName, "inline");
  const popup = window.open(openUrl, "_blank", "noopener,noreferrer");

  if (!popup) {
    window.location.assign(openUrl);
  }
}
