export function iconForFile(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "json"].includes(ext)) return "bi-filetype-js";
  if (["md", "markdown"].includes(ext)) return "bi-markdown";
  if (["css", "scss"].includes(ext)) return "bi-filetype-css";
  if (["html", "htm"].includes(ext)) return "bi-filetype-html";
  return "bi-file-earmark";
}

export function languageForPath(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    ps1: "powershell",
  };
  return map[ext] || "plaintext";
}

export function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
