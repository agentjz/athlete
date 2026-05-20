import chalk from "chalk";

const TODO_MARKER_PATTERN = /^\[(?: |>|x)\]/;

export function colorizeTodoMarkers(text: string): string {
  if (!text) {
    return text;
  }

  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const marker = line.match(TODO_MARKER_PATTERN)?.[0];
      if (!marker) {
        return line;
      }

      return `${colorizeMarker(marker)}${line.slice(marker.length)}`;
    })
    .join("\n");
}

function colorizeMarker(marker: string): string {
  switch (marker) {
    case "[>]":
      return chalk.magenta(marker);
    case "[x]":
    case "[ ]":
      return chalk.gray(marker);
    default:
      return marker;
  }
}
