const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

const COMMON_MOJIBAKE_PATTERNS = [
  /\uFFFD/,
  /Ã[\x80-\xBF]/,
  /â[\x80-\xBF]/,
  /ð[\x80-\xBF]/,
];

export interface DecodedTextBuffer {
  text: string;
  encoding: "utf8" | "utf8-bom" | "utf16le" | "utf16be";
}

export function decodeTextBuffer(buffer: Buffer): DecodedTextBuffer | null {
  if (buffer.length === 0) {
    return {
      text: "",
      encoding: "utf8",
    };
  }

  if (startsWith(buffer, UTF8_BOM)) {
    return {
      text: normalizeTextForStorage(buffer.subarray(UTF8_BOM.length).toString("utf8")),
      encoding: "utf8-bom",
    };
  }

  if (startsWith(buffer, UTF16LE_BOM)) {
    return {
      text: normalizeTextForStorage(buffer.subarray(UTF16LE_BOM.length).toString("utf16le")),
      encoding: "utf16le",
    };
  }

  if (startsWith(buffer, UTF16BE_BOM)) {
    return {
      text: normalizeTextForStorage(swapUtf16ByteOrder(buffer.subarray(UTF16BE_BOM.length)).toString("utf16le")),
      encoding: "utf16be",
    };
  }

  if (looksLikeUtf16Le(buffer)) {
    return {
      text: normalizeTextForStorage(buffer.toString("utf16le")),
      encoding: "utf16le",
    };
  }

  if (looksLikeUtf16Be(buffer)) {
    return {
      text: normalizeTextForStorage(swapUtf16ByteOrder(buffer).toString("utf16le")),
      encoding: "utf16be",
    };
  }

  if (buffer.includes(0)) {
    return null;
  }

  return {
    text: normalizeTextForStorage(buffer.toString("utf8")),
    encoding: "utf8",
  };
}

export function normalizeTextForStorage(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

export function detectTextCorruption(value: string): boolean {
  const normalized = normalizeTextForStorage(String(value ?? ""));
  if (!normalized) {
    return false;
  }

  return COMMON_MOJIBAKE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function startsWith(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.length >= prefix.length && prefix.equals(buffer.subarray(0, prefix.length));
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer.length % 2 !== 0) {
    return false;
  }

  let zeroes = 0;
  let ascii = 0;
  for (let index = 1; index < buffer.length; index += 2) {
    if (buffer[index] === 0) {
      zeroes += 1;
      if (buffer[index - 1]! >= 0x20 && buffer[index - 1]! <= 0x7e) {
        ascii += 1;
      }
    }
  }

  return zeroes >= Math.max(2, Math.floor(buffer.length / 6)) && ascii >= 1;
}

function looksLikeUtf16Be(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer.length % 2 !== 0) {
    return false;
  }

  let zeroes = 0;
  let ascii = 0;
  for (let index = 0; index < buffer.length; index += 2) {
    if (buffer[index] === 0) {
      zeroes += 1;
      const next = buffer[index + 1]!;
      if (next >= 0x20 && next <= 0x7e) {
        ascii += 1;
      }
    }
  }

  return zeroes >= Math.max(2, Math.floor(buffer.length / 6)) && ascii >= 1;
}

function swapUtf16ByteOrder(buffer: Buffer): Buffer {
  const swapped = Buffer.from(buffer);
  for (let index = 0; index < swapped.length - 1; index += 2) {
    const first = swapped[index]!;
    swapped[index] = swapped[index + 1]!;
    swapped[index + 1] = first;
  }
  return swapped;
}
