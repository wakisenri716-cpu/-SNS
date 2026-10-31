// Where a JPEG photo was taken, from its EXIF GPS tags — read on the device,
// nothing is uploaded. null when the photo has no location (many apps strip
// it when sharing) or isn't a JPEG.
export function readExifGps(buffer: ArrayBuffer): { lat: number; lng: number } | null {
  return withTiff(buffer, readTiffGps);
}

// When the photo was taken (EXIF DateTimeOriginal, the camera's local time,
// which for a trip in Japan is Japan time) as an ISO string, or null.
export function readExifTakenAt(buffer: ArrayBuffer): string | null {
  return withTiff(buffer, readTiffTakenAt);
}

function withTiff<T>(buffer: ArrayBuffer, read: (view: DataView, tiff: number) => T | null): T | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    // APP1 holding "Exif\0\0".
    if (marker === 0xe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      return read(view, offset + 10);
    }
    if (marker === 0xda) return null; // image data starts; no EXIF before it
    offset += 2 + size;
  }
  return null;
}

function tiffReader(view: DataView, tiff: number) {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(tiff + o, little);
  const u32 = (o: number) => view.getUint32(tiff + o, little);
  const entry = (ifd: number, tag: number) => {
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  return { u16, u32, entry };
}

function readTiffTakenAt(view: DataView, tiff: number) {
  try {
    const { u32, entry } = tiffReader(view, tiff);
    const exifPointer = entry(u32(4), 0x8769);
    if (exifPointer == null) return null;
    const e = entry(u32(exifPointer + 8), 0x9003);
    if (e == null) return null;
    const at = u32(e + 8);
    let text = "";
    for (let i = 0; i < 19; i++) text += String.fromCharCode(view.getUint8(tiff + at + i));
    const m = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00` : null;
  } catch {
    return null;
  }
}

function readTiffGps(view: DataView, tiff: number) {
  try {
    const { u32, entry } = tiffReader(view, tiff);
    const gpsPointer = entry(u32(4), 0x8825);
    if (gpsPointer == null) return null;
    const gps = u32(gpsPointer + 8);
    const ref = (tag: number) => {
      const e = entry(gps, tag);
      return e == null ? null : String.fromCharCode(view.getUint8(tiff + e + 8));
    };
    const dms = (tag: number) => {
      const e = entry(gps, tag);
      if (e == null) return null;
      const at = u32(e + 8);
      const rational = (i: number) => {
        const den = u32(at + i * 8 + 4);
        return den ? u32(at + i * 8) / den : 0;
      };
      return rational(0) + rational(1) / 60 + rational(2) / 3600;
    };
    const lat = dms(2);
    const lng = dms(4);
    if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
    return { lat: ref(1) === "S" ? -lat : lat, lng: ref(3) === "W" ? -lng : lng };
  } catch {
    return null;
  }
}

// Coordinates written in a shared map link or text: "@36.23,137.97",
// "?q=36.23,137.97", "ll=…", or a bare "36.23, 137.97".
export function coordsInText(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(?:@|[?&](?:q|ll|query|center|destination)=|^|\s)(-?\d{1,2}\.\d{3,})\s*(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/i);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
