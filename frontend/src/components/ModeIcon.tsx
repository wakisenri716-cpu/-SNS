import { Bus, Car, CarTaxiFront, Footprints, TrainFront, type LucideIcon } from "lucide-react";

// Line icon for a transport mode — the access page's five modes plus the
// backend's leg modes (walk / drive / train / bus).
const ICONS: Record<string, LucideIcon> = {
  train: TrainFront,
  bus: Bus,
  car: Car,
  drive: Car,
  taxi: CarTaxiFront,
  walk: Footprints,
};

export default function ModeIcon({ mode, className = "h-4 w-4" }: { mode: string | undefined; className?: string }) {
  const Icon = mode ? ICONS[mode] : undefined;
  return Icon ? <Icon className={className} strokeWidth={1.8} aria-hidden /> : null;
}
