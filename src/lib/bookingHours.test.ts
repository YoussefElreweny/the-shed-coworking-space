import assert from 'node:assert/strict';
import test from 'node:test';
import { getTimeSlots, isWithinClosingHours } from './bookingHours';

test('no selected date is safe; slots follow all seasonal boundaries', () => {
  assert.deepEqual(getTimeSlots(null), []);
  for (let month = 0; month < 12; month++) {
    const slots = getTimeSlots(new Date(2026, month, 15));
    const winter = month >= 9 || month <= 3;
    assert.equal(slots.length, winter ? 28 : 30);
    assert.equal(slots[0].getHours(), 9);
    assert.equal(slots.at(-1)!.getHours(), winter ? 22 : 23);
    assert.equal(slots.at(-1)!.getMinutes(), 30);
    assert.equal(slots[0].getMonth(), month);
  }
});

test('winter allows exactly 11 PM in Cairo and rejects anything later', () => {
  const start = new Date('2026-01-15T20:00:00Z');
  assert.equal(isWithinClosingHours(start, new Date('2026-01-15T21:00:00Z')), true);
  assert.equal(isWithinClosingHours(start, new Date('2026-01-15T21:00:00.001Z')), false);
  assert.equal(isWithinClosingHours(start, new Date('2026-01-16T00:00:00Z')), false);
});

test('summer allows midnight including September to October transition', () => {
  const start = new Date('2026-09-30T19:00:00Z');
  assert.equal(isWithinClosingHours(start, new Date('2026-09-30T21:00:00Z')), true);
  assert.equal(isWithinClosingHours(start, new Date('2026-09-30T21:00:01Z')), false);
});

test('October uses Cairo daylight saving time and winter closing', () => {
  const start = new Date('2026-10-07T19:00:00Z');
  assert.equal(isWithinClosingHours(start, new Date('2026-10-07T20:00:00Z')), true);
  assert.equal(isWithinClosingHours(start, new Date('2026-10-07T20:30:00Z')), false);
});

test('invalid and reversed booking dates are rejected', () => {
  const date = new Date('2026-01-15T20:00:00Z');
  assert.equal(isWithinClosingHours(date, date), false);
  assert.equal(isWithinClosingHours(new Date('invalid'), date), false);
});
