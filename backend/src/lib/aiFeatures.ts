import type { NextFunction, Request, Response } from "express";

// AI beyond the しおり is switched off for now (the operator's choice): the
// concierge (AIに旅を相談, 写真で探す), reading transit timetables, and
// translating posts, comments and transit notes. The しおり ones (AIでプランを
// 作る, AIで旅をつくる, 予約明細の読み取り) stay. AI_EXTRA_FEATURES=on brings
// the rest back (the API tests use it). The app reads the switch from
// GET /api/concierge/status and hides the buttons, including the on-device
// ones (翻訳, みんなの声, 文章を整える).
export const extraAiOn = () => process.env.AI_EXTRA_FEATURES === "on";

export function requireExtraAi(_req: Request, res: Response, next: NextFunction) {
  if (!extraAiOn()) return res.status(404).json({ code: "aiOff", error: "この機能は現在お休みしています" });
  next();
}
