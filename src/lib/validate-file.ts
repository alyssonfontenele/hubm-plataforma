const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "application/zip",
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Tipo de arquivo não permitido. Formatos aceitos: PDF, Word, Excel, PowerPoint, imagens, MP4, ZIP.";
  }
  if (file.size > MAX_SIZE) {
    return "Arquivo muito grande. Tamanho máximo: 50MB.";
  }
  return null;
}

export function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.]/g, "_");
}
