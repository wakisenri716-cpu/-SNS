// 見頃 (best season) helpers: posts store their months as "4,5,10".

// The current month (1–12) in Japan, where every listed place is.
export function monthInJapan(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).getUTCMonth() + 1;
}

// Prisma filter for posts whose 見頃 includes `month`. Matches whole list
// entries only, so month 1 doesn't match "10,11".
export function inSeasonWhere(month: number) {
  const m = String(month);
  return {
    OR: [
      { bestMonths: m },
      { bestMonths: { startsWith: `${m},` } },
      { bestMonths: { endsWith: `,${m}` } },
      { bestMonths: { contains: `,${m},` } },
    ],
  };
}
