// おすすめ 9マス: how well known a town is, in three tiers — 1 定番 (famous),
// 2 注目 (in between), 3 穴場 (little known). The operator can set it per town
// in the admin site (Municipality.fameTier); otherwise it's worked out here:
// a short list of Japan's best-known destinations (Jaziba's own rough
// judgement, not statistics) → 1, other cities and Tokyo's wards → 2,
// towns and villages → 3.
export type FameTier = 1 | 2 | 3;

const FAMOUS: Record<string, string[]> = {
  北海道: ["札幌市", "小樽市", "函館市", "富良野市", "美瑛町", "ニセコ町", "登別市"],
  宮城県: ["仙台市", "松島町"],
  栃木県: ["日光市"],
  群馬県: ["草津町"],
  千葉県: ["浦安市"],
  東京都: ["台東区", "中央区", "新宿区", "渋谷区", "港区", "千代田区"],
  神奈川県: ["横浜市", "鎌倉市", "箱根町"],
  山梨県: ["富士河口湖町"],
  長野県: ["軽井沢町", "松本市", "白馬村"],
  静岡県: ["熱海市"],
  石川県: ["金沢市"],
  岐阜県: ["高山市", "白川村"],
  愛知県: ["名古屋市"],
  三重県: ["伊勢市"],
  京都府: ["京都市"],
  奈良県: ["奈良市"],
  大阪府: ["大阪市"],
  兵庫県: ["神戸市", "姫路市"],
  岡山県: ["倉敷市"],
  広島県: ["広島市", "廿日市市"],
  島根県: ["出雲市", "松江市"],
  愛媛県: ["松山市"],
  福岡県: ["福岡市"],
  長崎県: ["長崎市"],
  熊本県: ["熊本市"],
  大分県: ["別府市", "由布市"],
  鹿児島県: ["鹿児島市", "屋久島町"],
  沖縄県: ["那覇市", "石垣市", "宮古島市"],
};

export function isFameTier(v: unknown): v is FameTier {
  return v === 1 || v === 2 || v === 3;
}

/** The tier worked out from the name (when the operator hasn't set one). */
export function defaultFameTier(m: { prefecture: string; name: string }): FameTier {
  if (FAMOUS[m.prefecture]?.includes(m.name)) return 1;
  return /[市区]$/.test(m.name) ? 2 : 3;
}

export function fameTierOf(m: { prefecture: string; name: string; fameTier?: number | null }): FameTier {
  return isFameTier(m.fameTier) ? m.fameTier : defaultFameTier(m);
}
