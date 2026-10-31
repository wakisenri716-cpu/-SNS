import { Bike, Bus, Car, CarTaxiFront, Footprints, Plane, Route, Ship, TrainFront, type LucideIcon } from "lucide-react";

// Line icon for a transport mode — the access page's five modes plus the
// backend's leg modes (walk / drive / train / bus) and the ways written
// down for a leg (区間の行き方).
const ICONS: Record<string, LucideIcon> = {
  train: TrainFront,
  bus: Bus,
  car: Car,
  drive: Car,
  taxi: CarTaxiFront,
  walk: Footprints,
  bike: Bike,
  plane: Plane,
  ferry: Ship,
  other: Route,
};

export default function ModeIcon({ mode, className = "h-4 w-4" }: { mode: string | undefined; className?: string }) {
  const Icon = mode ? ICONS[mode] : undefined;
  return Icon ? <Icon className={className} strokeWidth={1.8} aria-hidden /> : null;
}
