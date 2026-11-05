// 予約明細を貼り付け: the fields read from a confirmation email on the device.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessReservation, readDate } from "../src/lib/reservationPaste.ts";

test("a 楽天トラベル-style confirmation", () => {
  const mail = `【楽天トラベル】ご予約ありがとうございます
■予約番号：RY1234567890
■宿泊施設名：上高地帝国ホテル（カミコウチテイコクホテル）
■住所：長野県松本市安曇上高地
■電話番号：0263-95-2001
■チェックイン日：2027年5月20日(木)
■チェックイン時間：15:30
■宿泊日数：2泊
■人数：大人2名 子供1名
■プラン名：【朝食付き】山の朝ごはん
■合計金額：78,000円（税込）
■お支払い方法：現地決済
予約の確認・変更はこちら https://travel.rakuten.co.jp/my/booking/123?x=1`;
  assert.deepEqual(guessReservation(mail), {
    bookedVia: "楽天トラベル",
    kind: "lodging",
    confirmation: "RY1234567890",
    name: "上高地帝国ホテル",
    address: "長野県松本市安曇上高地",
    phone: "0263-95-2001",
    planName: "【朝食付き】山の朝ごはん",
    start: "2027-05-20T15:30",
    end: "2027-05-22T10:00",
    guests: 3,
    priceYen: 78000,
    payment: "onsite",
    url: "https://travel.rakuten.co.jp/my/booking/123?x=1",
  });
});

test("an English hotel confirmation and a restaurant booking", () => {
  const en = guessReservation(`Booking.com\nConfirmation number: 4123.567.890\nCheck-in: Thu 20 May 2027 (from 15:00)\nCheck-out: Sat 22 May 2027 (until 11:00)\nTotal price: ¥52,000`);
  assert.deepEqual([en.bookedVia, en.kind, en.confirmation, en.start, en.end, en.priceYen], ["Booking.com", "lodging", "4123.567.890", "2027-05-20T15:00", "2027-05-22T11:00", 52000]);
  const dinner = guessReservation(`食べログ ネット予約\n予約番号：T-998877\n店名：そば処 上高地\nご来店日時：2027/5/20 18:30\n人数：2名\nコース：信州そばコース`);
  assert.deepEqual([dinner.kind, dinner.name, dinner.start, dinner.end, dinner.guests, dinner.planName], ["restaurant", "そば処 上高地", "2027-05-20T18:30", undefined, 2, "信州そばコース"]);
});

test("dates in several forms", () => {
  assert.equal(readDate("2027/5/3"), "2027-05-03");
  assert.equal(readDate("May 3, 2027"), "2027-05-03");
  assert.equal(readDate("Mon 3 May 2027"), "2027-05-03");
  assert.equal(readDate("明日"), "");
});
