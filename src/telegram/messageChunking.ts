export function chunkTelegramMessage(text: string, maxChars = 4_096): string[] {
  if (!text) {
    return [];
  }

  const limit = Math.max(1, Math.trunc(maxChars));
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const cut = findCutPoint(remaining, limit);
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function findCutPoint(text: string, limit: number): number {
  for (const separator of ["\n\n", "\n", " "]) {
    const cut = text.lastIndexOf(separator, limit);
    if (cut > 0) {
      return cut + separator.length <= limit ? cut + separator.length : cut;
    }
  }

  return limit;
}
