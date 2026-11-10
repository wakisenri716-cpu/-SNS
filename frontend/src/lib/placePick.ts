// 場所を選ぶ: shared shapes and helpers (components/PlacePickerSheet.tsx).
export type PlaceSource = "spot" | "post" | "station" | "municipality" | "osm";
export interface PlaceResult {
  name: string;
  detail: string;
  lat: number;
  lng: number;
  source: PlaceSource;
  type?: string;
}
export interface PickedPlace {
  name: string;
  lat: number;
  lng: number;
}

const OSM_CLASSES = ["tourism", "historic", "natural", "leisure", "amenity", "shop", "railway", "highway", "place", "building", "waterway", "boundary"];

/** "historic/castle" → the class's label key. */
export function osmClassKey(type: string | undefined) {
  const cls = (type ?? "").split("/")[0];
  return OSM_CLASSES.includes(cls) ? `place.osmClass.${cls}` : "place.source.osm";
}

/** The name a tapped map label shows (Japanese first). */
export function featureName(props: Record<string, unknown> | null | undefined) {
  const v = props?.["name:ja"] || props?.name || props?.name_int;
  return typeof v === "string" ? v.trim() : "";
}
