// 乗る便 as the API returns them (see the TripTransport model).
export function serializeTransport(t: {
  id: string;
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
