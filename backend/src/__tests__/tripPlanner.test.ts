import { test } from "node:test";
import assert from "node:assert/strict";
import { planTrip, type PlanStopInput } from "../services/tripPlanner";

// Without ANTHROPIC_API_KEY, planTrip uses the distance-based route optimizer.
delete process.env.ANTHROPIC_API_KEY;

const stop = (id: string, category: string, lat: number | null, lng: number | null, stayMinutes = 60): PlanStopInput => ({
  id,
  name: id,
  municipality: "松本市",
  category,
  caption: "",
  lat,
  lng,
  stayMinutes,
});

// Matsumoto Castle and three Kamikochi spots (~40 km apart).
const castle = stop("castle", "culture", 36.2391, 137.9691);
const bridge = stop("bridge", "nature", 36.251, 137.6389);
const lunch = stop("lunch", "restaurant", 36.2508, 137.6387);
const hotel = stop("hotel", "lodging", 36.2427, 137.6284, 30);

test("ends at the place to stay and doesn't double back", async () => {
  const plan = await planTrip([hotel, lunch, bridge, castle], "", "09:00", "ja");
  assert.equal(plan.mode, "auto");
  assert.deepEqual(
    plan.stops.map((s) => s.id),
    ["castle", "bridge", "lunch", "hotel"]
  );
});

test("keeps stay times and includes every stop exactly once", async () => {
  const unlocated = stop("mystery", "activity", null, null, 45);
  const plan = await planTrip([castle, unlocated, hotel, bridge], "", "09:00", "ja");
  assert.equal(plan.stops.length, 4);
  assert.equal(new Set(plan.stops.map((s) => s.id)).size, 4);
  assert.equal(plan.stops.find((s) => s.id === "hotel")!.stayMinutes, 30);
  assert.equal(plan.stops.find((s) => s.id === "mystery")!.stayMinutes, 45);
});

test("without lodging the route starts at an end, not in the middle", async () => {
  const west = stop("west", "nature", 36.0, 137.0);
  const middle = stop("middle", "nature", 36.0, 137.5);
  const east = stop("east", "nature", 36.0, 138.0);
  const plan = await planTrip([middle, west, east], "", "09:00", "ja");
  const ids = plan.stops.map((s) => s.id);
  assert.equal(ids[1], "middle");
});
