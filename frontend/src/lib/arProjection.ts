// ARで探す: where a spot appears over the camera picture, from where you
// stand, which way the camera faces and how the phone is tilted. Pure maths,
// so it can be tested without a phone.

import { bearingDeg, distanceKm } from "./geo.ts";

// Rough field of view of a phone's main camera held upright (portrait).
export const H_FOV = 55;
export const V_FOV = 70;

// Which way the back camera faces, in degrees clockwise from north, from an
// absolute DeviceOrientation reading (alpha/beta/gamma). This is the W3C
// "compass heading" formula: unlike 360 − alpha, it stays right when the
// phone is held upright to look through the camera.
export function cameraHeading(alpha: number, beta: number, gamma: number) {
  const rad = Math.PI / 180;
  const x = beta * rad;
  const y = gamma * rad;
  const z = alpha * rad;
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
  let heading = Math.atan(vx / vy);
  if (vy < 0) heading += Math.PI;
  else if (vx < 0) heading += 2 * Math.PI;
  return ((heading / rad) % 360 + 360) % 360;
}

/** Signed difference a − b in degrees, in (−180, 180]. */
export function angleDiff(a: number, b: number) {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export interface ArSpot {
  id: string;
  lat: number;
  lng: number;
}

export interface Projected<T> {
  spot: T;
  km: number;
  bearing: number;
  /** Where the spot is relative to the camera's direction (− left, + right). */
  relative: number;
  /** Inside the picture horizontally. */
  inView: boolean;
  /** 0–1 across and down the screen (y may go past the edges when tilted). */
  x: number;
  y: number;
  /** 0.6–1: nearer spots are drawn bigger. */
  scale: number;
}

// Nearer spots sit lower (closer to the horizon line of a person's view) and
// bigger; tilting the phone up moves everything down, as through a window.
// `pitch` is DeviceOrientation beta: 90 when the phone is upright.
export function project<T extends ArSpot>(
  me: { lat: number; lng: number },
  heading: number,
  pitch: number,
  spots: T[],
  maxKm: number
): Projected<T>[] {
  const tilt = (pitch - 90) / V_FOV;
  return spots
    .map((spot) => {
      const km = distanceKm(me, spot);
      const bearing = bearingDeg(me, spot);
      const relative = angleDiff(bearing, heading);
      const closeness = 1 - Math.min(1, Math.log10(1 + (9 * km) / maxKm));
      return {
        spot,
        km,
        bearing,
        relative,
        inView: Math.abs(relative) <= H_FOV / 2,
        x: 0.5 + relative / H_FOV,
        y: 0.3 + 0.25 * closeness + tilt,
        scale: 0.6 + 0.4 * closeness,
      };
    })
    .filter((p) => p.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}

// Keeps labels from covering each other: going from nearest to farthest, a
// label that would overlap one already placed moves up above it.
// `w` / `h` are a label's size as fractions of the screen.
export function spread<T extends { x: number; y: number }>(items: T[], w = 0.3, h = 0.085): T[] {
  const placed: T[] = [];
  for (const item of items) {
    let y = item.y;
    for (let moved = true, guard = 0; moved && guard < items.length; guard++) {
      moved = false;
      for (const other of placed) {
        if (Math.abs(other.x - item.x) < w && Math.abs(other.y - y) < h) {
          y = other.y - h;
          moved = true;
        }
      }
    }
    placed.push({ ...item, y });
  }
  return placed;
}
