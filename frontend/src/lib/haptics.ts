// A tiny vibration as tap feedback, where the device supports it.
export function haptic() {
  navigator.vibrate?.(8);
}
