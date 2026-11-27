import assert from "node:assert/strict";
import test from "node:test";
import { localDay, pathwayPace, standing } from "./pacing.ts";

const modules = [
  { id: "first", title: "Fieldwork", hours60: 45, hours120: 90 },
  { id: "second", title: "Report", hours60: 15, hours120: 30 },
];
const row = { hours: 60, completedModules: ["second"], createdAt: new Date("2026-11-25T18:30:00Z") };
test("eight-week targets use Kolkata dates and chapter hours", () => {
  const pace = pathwayPace(row, modules, new Date("2026-12-23T18:30:00Z"));
  assert.equal(pace.start, "2026-11-26");
  assert.equal(pace.end, "2027-01-20");
  assert.equal(pace.percent, 25);
  assert.equal(pace.expected, 50);
  assert.equal(pace.deltaHours, -15);
  assert.equal(pace.chapters[0]?.due, "2027-01-06");
  assert.equal(standing(25, [0, 25, 25, 100]), 75);
});
test("extended pathway spans sixteen weeks and the target caps at completion", () => {
  const extended = pathwayPace({ ...row, hours: 120 }, modules, new Date("2028-01-01"));
  assert.equal(extended.expected, 100);
  assert.equal(extended.deltaHours, -90);
  assert.equal((Date.parse(extended.end) - localDay(row.createdAt)) / 86400000 + 1, 112);
});
