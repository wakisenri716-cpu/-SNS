import { Bus, Plane, Ship, Ticket, TrainFront } from "lucide-react";

// Shared by the 乗る便 list and 移動中モード.
export const KIND_ICON = { plane: Plane, train: TrainFront, bus: Bus, ferry: Ship, other: Ticket } as const;

export function clock(iso: string, lang: string) {
  return new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}
