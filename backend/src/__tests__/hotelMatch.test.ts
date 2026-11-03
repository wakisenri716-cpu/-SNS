import { test } from "node:test";
import assert from "node:assert/strict";
import { matchHotel, normalizeHotelName } from "../lib/hotelMatch";

const post = { name: "上高地帝国ホテル", lat: 36.2427, lng: 137.6284 };

test("names are compared without width, spaces or words like ホテル", () => {
  assert.equal(normalizeHotelName("上高地 帝国ホテル"), "上高地帝国");
  assert.equal(normalizeHotelName("ＨＯＴＥＬ ＡＬＰＳ"), "alps");
});

test("only a clear, nearby match links a post to a hotel", () => {
  const teikoku = { name: "上高地帝国ホテル", lat: 36.2425, lng: 137.6286 };
  const other = { name: "上高地温泉ホテル", lat: 36.2451, lng: 137.6382 };
  assert.equal(matchHotel(post, [other, teikoku]), teikoku);
  // Same name far away (another branch) doesn't count.
  assert.equal(matchHotel(post, [{ name: "帝国ホテル 東京", lat: 35.6727, lng: 139.7586 }]), null);
  // Two that fit is not clear.
  assert.equal(matchHotel({ name: "上高地", lat: 36.2427, lng: 137.6284 }, [teikoku, other]), null);
  // A post named only "ホテル" matches nothing.
  assert.equal(matchHotel({ name: "ホテル", lat: 36.2427, lng: 137.6284 }, [teikoku]), null);
});
