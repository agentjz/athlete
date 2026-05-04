export function configureMarkdown() {
  const parser = getMarkedParser();
  if (!parser?.setOptions) {
    throw new Error("Marked failed to initialize.");
  }
  if (!window.DOMPurify) {
    throw new Error("DOMPurify failed to initialize.");
  }
  parser.setOptions({
    async: false,
    breaks: true,
    gfm: true,
  });
}

export function renderMarkdown(value) {
  const parser = getMarkedParser();
  if (!parser?.parse || !window.DOMPurify) {
    throw new Error("Markdown renderer is not initialized.");
  }
  const html = parser.parse(value);
  return window.DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td"],
    ADD_ATTR: ["align"],
  });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getMarkedParser() {
  if (window.marked?.parse) {
    return window.marked;
  }
  if (window.marked?.marked?.parse) {
    return window.marked.marked;
  }
  return null;
}
