import { useEffect, useRef, useState } from "react";

// Live position + which way the phone is facing, for walking to a spot.
// heading is degrees clockwise from north, or null where the device has no
// compass (desktops) or didn't allow it; position updates as you walk.
type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export function useCompass() {
  const [active, setActive] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<"location" | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  function stop() {
    cleanup.current?.();
    cleanup.current = null;
    setActive(false);
  }

  // Must be called from a tap: iOS only asks for compass access then.
  async function start() {
    if (!navigator.geolocation) return setError("location");
    setError(null);
    const permission = (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;
    let compassAllowed = true;
    if (permission) compassAllowed = (await permission().catch(() => "denied")) === "granted";

    const onOrientation = (e: Event) => {
      const ev = e as OrientationEventWithCompass;
      if (ev.webkitCompassHeading != null) setHeading(ev.webkitCompassHeading);
      else if (ev.absolute && ev.alpha != null) setHeading((360 - ev.alpha) % 360);
    };
    // Android Chrome reports compass-relative angles on this event; iOS on the
    // plain one (with webkitCompassHeading).
    const eventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    if (compassAllowed) window.addEventListener(eventName, onOrientation);
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      (err) => {
        // Brief "position unavailable" / timeout errors happen while walking
        // (GPS hiccups) and are followed by fresh positions; only a refusal
        // ends the compass.
        if (err.code !== err.PERMISSION_DENIED) return;
        setError("location");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5_000 }
    );
    cleanup.current = () => {
      window.removeEventListener(eventName, onOrientation);
      navigator.geolocation.clearWatch(watchId);
    };
    setActive(true);
  }

  useEffect(() => () => cleanup.current?.(), []);

  return { active, heading, position, error, start, stop };
}
