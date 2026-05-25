/**
 * Compresses an image File using Canvas before upload.
 * - Skips non-image files (PDF, DOCX, etc.)
 * - Skips files already below the target size
 * - Resizes to max 1600px and exports as JPEG at 0.78 quality
 * - Handles HEIC/HEIF by letting the browser decode and re-encode as JPEG
 */
export async function compressImageIfNeeded(file: File, maxBytes = 900 * 1024): Promise<File> {
  if (!file.type.startsWith("image/") && !file.name.match(/\.(heic|heif)$/i)) return file;
  if (file.size <= maxBytes) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const safeName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
          resolve(new File([blob], safeName, { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        0.78,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
