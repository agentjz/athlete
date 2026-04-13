export function chunkWeixinMessage(text: string, maxChars = 4_096): string[] {
  if (!text) {
    return [];
  }

  const limit = Math.max(1, Math.trunc(maxChars));
  if (Buffer.byteLength(text, "utf8") <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (Buffer.byteLength(remaining, "utf8") > limit) {
    const cut = findCutPoint(remaining, limit);
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function findCutPoint(text: string, limit: number): number {
  let candidate = 0;
  let usedBytes = 0;

  for (const char of text) {
    const nextBytes = Buffer.byteLength(char, "utf8");
    if (usedBytes + nextBytes > limit) {
      break;
    }

    usedBytes += nextBytes;
    candidate += char.length;
  }

  const head = text.slice(0, candidate);
  for (const separator of ["\n\n", "\n", " "]) {
    const cut = head.lastIndexOf(separator);
    if (cut > 0) {
      return cut + separator.length;
    }
  }

  return candidate > 0 ? candidate : 1;
}
