import { CLAUDE_MODEL, getClaudeClient, isClaudeConfigured, logClaudeError } from "./claude";
import { REEL_CATEGORIES, TRAVELER_TAGS, type ReelCategory, type TravelerTag } from "../types";

// "AIに旅を相談" — the travel concierge. Given a free-text wish ("家族で雪景色
// が見たい") and the latest posts, it picks the ones that fit.
//
// With ANTHROPIC_API_KEY set it asks Claude, which may only choose from the
// posts it is shown (ids are constrained by the output schema) and must
// ground each reason in that post's own data. Without a key — or if the call
// fails or is declined — it falls back to transparent keyword matching, and
// the response says which mode answered so the UI never presents keyword
// matching as AI.

export interface ConciergeCandidate {
  id: string;
  caption: string;
  category: string;
  travelerTags: TravelerTag[];
  locationName: string | null;
  municipalityName: string;
  prefecture: string;
}

export interface ConciergePick {
  id: string;
  /** Claude's one-line reason (AI mode only). */
  reason: string | null;
  /** What matched (keyword mode), so the UI can explain it in any language. */
  matched: { category: boolean; tags: TravelerTag[]; text: boolean } | null;
}

export interface ConciergeResult {
  mode: "ai" | "keyword";
  reply: string | null;
  picks: ConciergePick[];
}

const MAX_PICKS = 5;

export const isAiConciergeConfigured = isClaudeConfigured;

// ---- Keyword mode ---------------------------------------------------------

const CATEGORY_WORDS: Record<ReelCategory, string[]> = {
  nature: ["自然", "山", "川", "湖", "池", "絶景", "景色", "紅葉", "雪", "星", "ハイキング", "登山", "散策", "nature", "mountain", "hike", "scenery", "view", "自然风光", "风景", "자연", "산", "풍경"],
  culture: ["文化", "歴史", "城", "寺", "神社", "国宝", "伝統", "建築", "culture", "history", "castle", "temple", "shrine", "历史", "城堡", "문화", "역사", "성"],
  activity: ["体験", "アクティビティ", "遊び", "スキー", "カヤック", "サイクリング", "activity", "experience", "ski", "活动", "체험", "액티비티"],
  lodging: ["宿", "泊", "ホテル", "旅館", "温泉", "宿泊", "lodging", "hotel", "stay", "inn", "onsen", "住宿", "酒店", "温泉", "숙소", "호텔", "온천"],
  restaurant: ["食", "グルメ", "ランチ", "ディナー", "そば", "蕎麦", "ラーメン", "カフェ", "飲食", "ごはん", "ご飯", "food", "lunch", "dinner", "restaurant", "soba", "cafe", "美食", "餐厅", "午餐", "맛집", "음식", "점심"],
};

const TAG_WORDS: Record<TravelerTag, string[]> = {
  barrierFree: ["バリアフリー", "車椅子", "車いす", "ベビーカー", "足が悪", "高齢", "wheelchair", "accessible", "barrier", "无障碍", "轮椅", "휠체어", "배리어프리"],
  familyFriendly: ["家族", "子ども", "子供", "子連れ", "キッズ", "親子", "family", "kids", "children", "家庭", "孩子", "가족", "아이"],
  couples: ["カップル", "デート", "夫婦", "恋人", "ふたり", "二人", "couple", "date", "romantic", "情侣", "커플", "데이트"],
  friends: ["友達", "友人", "仲間", "グループ", "friends", "group", "朋友", "친구"],
  multilingual: ["外国語", "英語", "多言語", "海外", "english", "multilingual", "外语", "英语", "외국어", "영어"],
};

function keywordConcierge(message: string, candidates: ConciergeCandidate[]): ConciergeResult {
  const text = message.toLowerCase();
  const wantedCategories = REEL_CATEGORIES.filter((c) => CATEGORY_WORDS[c].some((w) => text.includes(w.toLowerCase())));
  const wantedTags = TRAVELER_TAGS.filter((t) => TAG_WORDS[t].some((w) => text.includes(w.toLowerCase())));
  // Free-text hits on place names: any 2+ character run of the message that
  // appears in the post's place, municipality, prefecture or caption.
  const terms = message
    .split(/[\s、。，,.!?！？・/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const scored = candidates.map((c) => {
    const category = wantedCategories.includes(c.category as ReelCategory);
    const tags = wantedTags.filter((t) => c.travelerTags.includes(t));
    const haystack = `${c.locationName ?? ""} ${c.municipalityName} ${c.prefecture} ${c.caption}`.toLowerCase();
    // ...or the message names the place itself ("松本で" matches 松本市, "上高地" matches 上高地 河童橋).
    const names = [c.locationName, c.municipalityName, c.prefecture]
      .flatMap((n) => (n ? [n, ...n.split(/\s+/), n.replace(/[市町村県府都]$/, "")] : []))
      .filter((n) => n.length >= 2);
    const textHit =
      terms.some((term) => haystack.includes(term.toLowerCase())) || names.some((n) => text.includes(n.toLowerCase()));
    const score = (category ? 3 : 0) + tags.length * 2 + (textHit ? 4 : 0);
    return { c, score, matched: { category, tags, text: textHit } };
  });

  const picks = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PICKS)
    .map((s) => ({ id: s.c.id, reason: null, matched: s.matched }));
  return { mode: "keyword", reply: null, picks };
}

// ---- AI mode --------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean" };

const SYSTEM_PROMPT = `You are the travel concierge of Jaziba, a tourism social network where only municipalities and local businesses post short videos about places in Japan.
A traveler describes the kind of trip they want. You are given the posts currently on Jaziba, as JSON. Choose the posts that best fit the request (at most ${MAX_PICKS}, best first) and explain each choice in one short sentence.

Ground everything in the post data you are given: each reason must refer only to what that post's caption, place, category or tags actually say. Do not add facts about the places (opening hours, prices, access, accessibility, seasons) that the data does not state, and do not suggest places that are not in the list. If nothing fits, return no picks and say so kindly in the reply, suggesting what the traveler could try asking instead.

The reply is one or two friendly sentences addressed to the traveler, written in the requested language, as are the reasons.`;

async function aiConcierge(message: string, lang: string, candidates: ConciergeCandidate[]): Promise<ConciergeResult> {
  const ids = candidates.map((c) => c.id);
  const posts = candidates.map((c) => ({
    id: c.id,
    place: c.locationName,
    municipality: c.municipalityName,
    prefecture: c.prefecture,
    category: c.category,
    tags: c.travelerTags,
    caption: c.caption.slice(0, 280),
  }));

  const response = await getClaudeClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    // Re-runs a safety-declined request on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Picking from a short list is quick work; low effort keeps the reply fast.
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            reply: { type: "string" },
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string", enum: ids }, reason: { type: "string" } },
                required: ["id", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["reply", "picks"],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Answer in ${LANGUAGE_NAMES[lang] ?? "Japanese"}.\n\n<posts>\n${JSON.stringify(posts)}\n</posts>\n\n<traveler_request>\n${message}\n</traveler_request>`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`concierge stopped: ${response.stop_reason}`);
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("concierge returned no text");
  const parsed = JSON.parse(textBlock.text) as { reply: string; picks: { id: string; reason: string }[] };

  const seen = new Set<string>();
  const picks = parsed.picks
    .filter((p) => ids.includes(p.id) && !seen.has(p.id) && seen.add(p.id))
    .slice(0, MAX_PICKS)
    .map((p) => ({ id: p.id, reason: p.reason, matched: null }));
  return { mode: "ai", reply: parsed.reply, picks };
}

export async function runConcierge(message: string, lang: string, candidates: ConciergeCandidate[]): Promise<ConciergeResult> {
  if (isAiConciergeConfigured() && candidates.length > 0) {
    try {
      return await aiConcierge(message, lang, candidates);
    } catch (err) {
      logClaudeError("concierge, using keyword matching", err);
    }
  }
  return keywordConcierge(message, candidates);
}
