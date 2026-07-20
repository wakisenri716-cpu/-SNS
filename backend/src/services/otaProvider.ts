import { OtaLink } from "../lib/otaLinks";

/**
 * OTA (Online Travel Agency) integration placeholder.
 *
 * We don't have contracted API access to booking providers (じゃらん/楽天トラベル/
 * Booking.com 等), so instead of fabricating booking data we generate safe outbound
 * search links. Municipalities can override these with their own negotiated links
 * in their profile. When real OTA API contracts exist, replace this function body
 * with actual API calls — callers (routes/municipalities.ts) don't need to change.
 */
export function suggestDefaultOtaLinks(municipalityName: string): OtaLink[] {
  const query = encodeURIComponent(municipalityName);
  return [
    { label: "じゃらんで宿を探す", url: `https://www.google.com/search?q=site:jalan.net+${query}` },
    { label: "楽天トラベルで宿を探す", url: `https://www.google.com/search?q=site:travel.rakuten.co.jp+${query}` },
    { label: "Booking.comで宿を探す", url: `https://www.google.com/search?q=site:booking.com+${query}` },
  ];
}
