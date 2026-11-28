export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PROJECT_SUBMISSION_FILES = 5;
export const MAX_PROJECT_SUBMISSION_BYTES = 40 * 1024 * 1024;
export const MAX_PORTFOLIO_FILES = 10;
export const MAX_PORTFOLIO_TOTAL_BYTES = 100 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".html", ".htm", ".xml", ".yaml", ".yml",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".h", ".cpp", ".hpp",
  ".cs", ".go", ".rs", ".php", ".rb", ".sh", ".sql", ".ipynb",
]);
const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export function getProjectFileExtension(fileName: string): string {
  const cleanName = fileName.split(/[\\/]/).at(-1) ?? "";
  const dot = cleanName.lastIndexOf(".");
  return dot < 0 ? "" : cleanName.slice(dot).toLocaleLowerCase();
}

export function isAllowedProjectFile(fileName: string, contentType: string, size: number): boolean {
  const type = contentType.trim().toLowerCase().split(";")[0] ?? "";
  const extension = getProjectFileExtension(fileName);
  if (!Number.isInteger(size) || size < 1 || size > MAX_PROJECT_FILE_BYTES) return false;
  if (TEXT_EXTENSIONS.has(extension)) {
    return type.startsWith("text/")
      || type === "application/json"
      || type === "application/xml"
      || type === "application/yaml"
      || type === "application/x-yaml"
      || type === "application/javascript"
      || type === "application/x-ipynb+json"
      || type === "application/octet-stream";
  }
  return MIME_BY_EXTENSION[extension]?.includes(type) ?? false;
}

export function sanitizeProjectFileName(value: string): string {
  return value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160) || "project-file";
}

export function isSafeArchiveEntryName(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return !!normalized
    && !normalized.startsWith("/")
    && !/^[a-z]:/i.test(normalized)
    && normalized.split("/").every((part) => part !== ".." && part !== ".");
}

export function isTextProjectEntry(fileName: string): boolean {
  const extension = getProjectFileExtension(fileName);
  return TEXT_EXTENSIONS.has(extension)
    || [".docx", ".pptx", ".xlsx"].includes(extension)
    || extension === ".pdf";
}
