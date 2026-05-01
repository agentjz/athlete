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

export interface TextFileEnvelope extends DecodedTextBuffer {
  lineEnding: "\n" | "\r\n";
}

export function decodeTextBuffer(buffer: Buffer): DecodedTextBuffer | null {
  const envelope = decodeTextFileEnvelope(buffer);
  if (!envelope) {
    return null;
  }

  return {
    text: envelope.text,
    encoding: envelope.encoding,
  };
}

export function decodeTextFileEnvelope(buffer: Buffer): TextFileEnvelope | null {
  if (buffer.length === 0) {
    return {
      text: "",
      encoding: "utf8",
      lineEnding: "\n",
    };
  }

  if (startsWith(buffer, UTF8_BOM)) {
    const rawText = buffer.subarray(UTF8_BOM.length).toString("utf8");
    return {
      text: normalizeTextForStorage(rawText),
      encoding: "utf8-bom",
      lineEnding: detectLineEnding(rawText),
    };
  }

  if (startsWith(buffer, UTF16LE_BOM)) {
    const rawText = buffer.subarray(UTF16LE_BOM.length).toString("utf16le");
    return {
      text: normalizeTextForStorage(rawText),
      encoding: "utf16le",
      lineEnding: detectLineEnding(rawText),
    };
  }

  if (startsWith(buffer, UTF16BE_BOM)) {
    const rawText = swapUtf16ByteOrder(buffer.subarray(UTF16BE_BOM.length)).toString("utf16le");
    return {
      text: normalizeTextForStorage(rawText),
      encoding: "utf16be",
      lineEnding: detectLineEnding(rawText),
    };
  }

  if (looksLikeUtf16Le(buffer)) {
    const rawText = buffer.toString("utf16le");
    return {
      text: normalizeTextForStorage(rawText),
      encoding: "utf16le",
      lineEnding: detectLineEnding(rawText),
    };
  }

  if (looksLikeUtf16Be(buffer)) {
    const rawText = swapUtf16ByteOrder(buffer).toString("utf16le");
    return {
      text: normalizeTextForStorage(rawText),
      encoding: "utf16be",
      lineEnding: detectLineEnding(rawText),
    };
  }

  if (buffer.includes(0)) {
    return null;
  }

  const rawText = buffer.toString("utf8");
  return {
    text: normalizeTextForStorage(rawText),
    encoding: "utf8",
    lineEnding: detectLineEnding(rawText),
  };
}

export function encodeTextFileEnvelope(content: string, envelope: Pick<TextFileEnvelope, "encoding" | "lineEnding">): Buffer {
  const restoredLineEndings = envelope.lineEnding === "\r\n"
    ? normalizeTextForStorage(content).replace(/\n/g, "\r\n")
    : normalizeTextForStorage(content);

  if (envelope.encoding === "utf8-bom") {
    return Buffer.concat([UTF8_BOM, Buffer.from(restoredLineEndings, "utf8")]);
  }

  if (envelope.encoding === "utf16le") {
    return Buffer.concat([UTF16LE_BOM, Buffer.from(restoredLineEndings, "utf16le")]);
  }

  if (envelope.encoding === "utf16be") {
    const utf16le = Buffer.from(restoredLineEndings, "utf16le");
    return Buffer.concat([UTF16BE_BOM, swapUtf16ByteOrder(utf16le)]);
  }

  return Buffer.from(restoredLineEndings, "utf8");
}

export function normalizeTextForStorage(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
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

function detectLineEnding(content: string): "\n" | "\r\n" {
  const crlfIndex = content.indexOf("\r\n");
  const lfIndex = content.indexOf("\n");
  if (lfIndex === -1) {
    return "\n";
  }
  if (crlfIndex === -1) {
    return "\n";
  }
  return crlfIndex <= lfIndex ? "\r\n" : "\n";
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
