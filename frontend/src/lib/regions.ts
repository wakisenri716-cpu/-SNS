// Japan's 47 prefectures grouped into the eight conventional regions, in the
// standard (JIS) order.
export const REGIONS = [
  { key: "hokkaido", prefectures: ["北海道"] },
  { key: "tohoku", prefectures: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { key: "kanto", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { key: "chubu", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { key: "kinki", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { key: "chugoku", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { key: "shikoku", prefectures: ["徳島県", "香川県", "愛媛県", "高知県"] },
  { key: "kyushu", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
] as const;

export const PREFECTURES: string[] = REGIONS.flatMap((r) => [...r.prefectures]);
