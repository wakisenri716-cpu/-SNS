import { useTranslation } from "react-i18next";

export interface SchematicMapPoint {
  x: number;
  y: number;
  label: string;
}

// A simplified, explicitly-not-a-real-map route diagram: numbered points in
// order, connected by a dashed line. Used wherever a real map image isn't
// available (Static Maps not configured, geocoding failed, or — for
// itineraries — there's simply no "real map" concept spanning saved reels
// from different municipalities). Square viewBox with the default
// (letterboxing) preserveAspectRatio, so labels/circles never get stretched
// no matter what aspect ratio the container ends up being.
export default function SchematicRouteMap({
  points,
  className,
  captionKey = "reelAccessPage.mapUnavailable",
}: {
  points: SchematicMapPoint[];
  className?: string;
  // Defaults to "couldn't load a real map" wording (the ReelAccessPage
  // fallback case); callers where the schematic is the intended view rather
  // than a failure fallback (e.g. the itinerary's own map tab) should pass a
  // caption that doesn't imply something went wrong.
  captionKey?: string;
}) {
  const { t } = useTranslation();
  if (points.length < 2) return null;

  const path = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className={className}>
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={t(captionKey)}>
        <rect x="0" y="0" width="100" height="100" fill="#f9fafb" rx="3" />
        <polyline points={path} fill="none" stroke="#0d9488" strokeWidth="1.4" strokeDasharray="2.5 2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i === 0 ? 3 : i === points.length - 1 ? 3.4 : 2.6} fill={i === points.length - 1 ? "#d6293c" : "#0f766e"} />
            <text
              x={p.x}
              y={p.y - 4.5}
              textAnchor="middle"
              fontSize="3.4"
              fontWeight="700"
              fill="#374151"
              style={{ paintOrder: "stroke", stroke: "#f9fafb", strokeWidth: 2.4 }}
            >
              {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-gray-400">{t(captionKey)}</p>
    </div>
  );
}
