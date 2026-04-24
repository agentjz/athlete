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

      const rest = line.slice(marker.length);
      return `${colorizeMarker(marker)}${rest}`;
    })
    .join("\n");
}

function colorizeMarker(marker: string): string {
  switch (marker) {
    case "[>]":
      return chalk.cyan(marker);
    case "[x]":
      return chalk.green(marker);
    case "[ ]":
      return chalk.gray(marker);
    default:
      return marker;
  }
}
