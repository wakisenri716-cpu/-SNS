// Builds a CSV that Excel opens correctly with Japanese text, and downloads it.

// Cells starting with these are treated as formulas by Excel/Sheets. Values
// here include free text written by posters (captions), so neutralize them
// with a leading apostrophe rather than letting a caption run a formula on
// the municipality's machine ("CSV injection").
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const body = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  // The BOM makes Excel read the file as UTF-8 instead of Shift_JIS.
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
