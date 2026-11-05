// 予約明細 as the API returns them (see the TripReservation model). On a
// shared link (forMembers: false) only what, where and when: no booking
// number, price, payment, notes or booking page.
export function serializeReservation(
  r: {
    id: string;
    kind: string;
    name: string;
    reelId: string | null;
    startAt: Date;
    endAt: Date | null;
    address: string;
    phone: string;
    confirmation: string;
    guests: number | null;
    planName: string;
    priceYen: number | null;
    payment: string;
    bookedVia: string;
    url: string;
    note: string;
  },
  { forMembers }: { forMembers: boolean }
) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    reelId: r.reelId,
    startAt: r.startAt,
    endAt: r.endAt,
    address: r.address,
    phone: r.phone,
    bookedVia: r.bookedVia,
    guests: r.guests,
    ...(forMembers
      ? { confirmation: r.confirmation, planName: r.planName, priceYen: r.priceYen, payment: r.payment, url: r.url, note: r.note }
      : { confirmation: "", planName: "", priceYen: null, payment: "", url: "", note: "" }),
  };
}
