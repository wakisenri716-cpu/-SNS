import { useEffect, useRef, useState } from "react";
import { cameraHeading } from "./arProjection";

// ARで探す: the camera picture, where you are, and which way the phone looks
// (heading of the back camera + how far it's tilted). Everything stays on the
// device: the picture is only shown, never recorded or sent.
type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export interface ArSensors {
  started: boolean;
  stream: MediaStream | null;
  /** Camera refused or missing: the view is drawn without the picture. */
  cameraFailed: boolean;
  position: { lat: number; lng: number; accuracy: number } | null;
  locationFailed: boolean;
  /** null until the device reports a compass reading (never, on most desktops). */
  heading: number | null;
  /** DeviceOrientation beta: 90 when the phone is upright. */
  pitch: number;
  start: () => Promise<void>;
  stop: () => void;
}

export function useArSensors(): ArSensors {
  const [started, setStarted] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [position, setPosition] = useState<ArSensors["position"]>(null);
  const [locationFailed, setLocationFailed] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState(90);
  const cleanup = useRef<(() => void) | null>(null);

  function stop() {
    cleanup.current?.();
    cleanup.current = null;
    setStarted(false);
    setStream(null);
  }

  // Must be called from a tap: iOS only asks for motion access then.
  async function start() {
    stop();
    const permission = (orientationApi() as OrientationPermission | undefined)?.requestPermission;
    const motionAllowed = permission ? (await permission().catch(() => "denied")) === "granted" : true;

    // Readings arrive ~60 times a second; React only hears the latest one per frame.
    const latest = { heading: null as number | null, pitch: 90 };
    let frame = 0;
    const flush = () => {
      frame = 0;
      setHeading(latest.heading);
      setPitch(latest.pitch);
    };
    const onOrientation = (e: Event) => {
      const ev = e as OrientationEventWithCompass;
      if (ev.beta != null) latest.pitch = ev.beta;
      if (ev.webkitCompassHeading != null) latest.heading = ev.webkitCompassHeading;
      else if (ev.absolute && ev.alpha != null && ev.beta != null && ev.gamma != null) {
        latest.heading = cameraHeading(ev.alpha, ev.beta, ev.gamma);
      }
      if (!frame) frame = requestAnimationFrame(flush);
    };
    // Android Chrome reports compass-relative angles on this event; iOS on the
    // plain one (with webkitCompassHeading).
    const eventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    if (motionAllowed) window.addEventListener(eventName, onOrientation);

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          setLocationFailed(false);
          setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        },
        // Brief GPS hiccups are followed by fresh positions; only a refusal counts.
        (err) => err.code === err.PERMISSION_DENIED && setLocationFailed(true),
        { enableHighAccuracy: true, maximumAge: 5_000 }
      );
    } else setLocationFailed(true);

    let media: MediaStream | null = null;
    try {
      media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setStream(media);
      setCameraFailed(false);
    } catch {
      setCameraFailed(true);
    }

    cleanup.current = () => {
      window.removeEventListener(eventName, onOrientation);
      if (frame) cancelAnimationFrame(frame);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      media?.getTracks().forEach((track) => track.stop());
    };
    setStarted(true);
  }

  useEffect(() => () => cleanup.current?.(), []);

  return { started, stream, cameraFailed, position, locationFailed, heading, pitch, start, stop };
}

function orientationApi() {
  return typeof DeviceOrientationEvent === "undefined" ? undefined : (DeviceOrientationEvent as unknown);
}
