import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateIndiaTargetDate, formatIndiaDate } from './date-format.ts';

test('formats date-only values in India time', () => {
  assert.equal(formatIndiaDate('2026-11-27'), '27 Nov');
  assert.equal(formatIndiaDate('2026-11-27', true), '27 Nov 2026');
});

test('accepts ISO timestamps and keeps their India calendar date', () => {
  assert.equal(formatIndiaDate('2026-11-26T18:30:00.000Z', true), '27 Nov 2026');
});

test('returns an explicit message for missing or invalid dates', () => {
  for (const value of [undefined, null, '', 'not-a-date', '2026-02-30', '2026-02-30T12:00:00Z']) {
    assert.equal(formatIndiaDate(value), 'Date not available');
  }
});

test('estimates the last day of each pathway from the India start date', () => {
  const startsOnNovember27InIndia = new Date('2026-11-26T18:30:00.000Z');
  assert.equal(estimateIndiaTargetDate(60, startsOnNovember27InIndia), '2027-01-21');
  assert.equal(estimateIndiaTargetDate(120, startsOnNovember27InIndia), '2027-03-18');
});
