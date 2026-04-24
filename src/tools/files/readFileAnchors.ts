import { buildFileEditAnchor, type FileEditAnchor } from "./editAnchor.js";

export function buildReadFileAnchors(
  path: string,
  lines: string[],
  startLine: number,
): FileEditAnchor[] {
  return lines.map((lineText, index) => buildFileEditAnchor(path, startLine + index, lineText));
}
