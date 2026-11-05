// 予約明細 as the API returns them (see the TripReservation model). On a
// shared link (forMembers: false) only what, where and when: no booking
// number, price, payment, notes or booking page.
export function serializeReservation(
  r: {
    id: string;
    kind: string;
    status: string;
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
    status: r.status,
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

/** Names compared loosely (width, spaces, brackets), for matching a confirmation to a pending booking. */
export const sameBookingName = (a: string, b: string) => {
  const n = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s・()（）【】「」\[\]-]/g, "");
  const x = n(a);
  const y = n(b);
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
};
