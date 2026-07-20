export interface OtaLink {
  label: string;
  url: string;
}

export function parseOtaLinks(raw: string): OtaLink[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OtaLink =>
        typeof item === "object" &&
        item !== null &&
        typeof item.label === "string" &&
        typeof item.url === "string"
    );
  } catch {
    return [];
  }
}

export function serializeOtaLinks(links: OtaLink[]): string {
  return JSON.stringify(links.slice(0, 20));
}
