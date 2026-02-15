import { fetchWithAuthRetry } from "@/lib/auth-tokens";

const getFileExtension = (filename: string) => {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index) : "";
};

const buildDownloadUrl = (url: string, filename: string) => {
  const storedFilename = url.split("/").pop() ?? "";
  if (!storedFilename) {
    return url;
  }

  return `/api/uploads/${encodeURIComponent(storedFilename)}/download?filename=${encodeURIComponent(filename)}`;
};

export async function downloadResourceFile(url: string, placeholderName: string, originalFilename: string) {
  const extension = getFileExtension(originalFilename);
  const safeName = `${placeholderName || "recurso"}${extension}`;
  const downloadUrl = buildDownloadUrl(url, safeName);

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
