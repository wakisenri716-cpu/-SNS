// What the on-device summarizer is given (see onDeviceSummarize.ts).

/** Longest input sent to the model (it has a small context window). */
export const MAX_INPUT_CHARS = 4000;

/** The comments as one bulleted text, newest last, cut to fit the model. */
export function commentsForSummary(bodies: string[], max = MAX_INPUT_CHARS) {
  const lines: string[] = [];
  let used = 0;
  for (const body of bodies) {
    const line = `- ${body.replace(/\s+/g, " ").trim()}`;
    if (line.length < 4) continue;
    if (used + line.length + 1 > max) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}
