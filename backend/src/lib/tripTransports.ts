// The rides that count as the trip's 乗る便: entered on their own, or part
// of the way chosen for a leg (not the other ways written down for it).
export const ACTIVE_RIDE = { OR: [{ optionId: null }, { option: { chosen: true } }] };

// 乗る便 as the API returns them (see the TripTransport model).
export function serializeTransport(t: {
  id: string;
  optionId?: string | null;
  kind: string;
  name: string;
  operator: string;
  fromName: string;
  toName: string;
  departAt: Date;
  arriveAt: Date;
  departPlatform: string;
  arrivePlatform: string;
  seat: string;
  confirmation: string;
  note: string;
}, { forMembers }: { forMembers: boolean }) {
  return {
    id: t.id,
    optionId: t.optionId ?? null,
    kind: t.kind,
    name: t.name,
    operator: t.operator,
    fromName: t.fromName,
    toName: t.toName,
    departAt: t.departAt,
    arriveAt: t.arriveAt,
    departPlatform: t.departPlatform,
    arrivePlatform: t.arrivePlatform,
    // Seats, booking numbers and notes stay among the trip's members.
    seat: forMembers ? t.seat : "",
    confirmation: forMembers ? t.confirmation : "",
    note: forMembers ? t.note : "",
  };
}

type Ride = Parameters<typeof serializeTransport>[0] & { departAt: Date };

// 区間の行き方 as the API returns them (see the TripLegOption model).
export function serializeLegOption(
  o: { id: string; fromId: string; toId: string; mode: string; title: string; durationMin: number | null; fareYen: number | null; note: string; chosen: boolean; rides: Ride[] },
  { forMembers }: { forMembers: boolean }
) {
  return {
    id: o.id,
    fromId: o.fromId,
    toId: o.toId,
    mode: o.mode,
    title: o.title,
    durationMin: o.durationMin,
    fareYen: o.fareYen,
    note: forMembers ? o.note : "",
    chosen: o.chosen,
    rides: [...o.rides].sort((a, b) => a.departAt.getTime() - b.departAt.getTime()).map((r) => serializeTransport(r, { forMembers })),
  };
}
