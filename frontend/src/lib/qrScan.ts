// QR codes from the camera with the browser's own Shape Detection API
// (BarcodeDetector: Chrome on Android and macOS, Edge; not Safari yet).
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export const detectorCtor = () => (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

/** Whether this browser can read QR codes from the camera. */
export function qrScanSupported() {
  return !!detectorCtor() && !!navigator.mediaDevices?.getUserMedia;
}
