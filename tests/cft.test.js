'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hoppusCft, sawnCft, sheetCft, fyLabel, addDays } = require('../server/util');

test('Hoppus rule: (girth/4)² × length / 144', () => {
  assert.equal(hoppusCft(48, 12), 12);
  assert.equal(hoppusCft(40, 10), 6.94);
  assert.equal(hoppusCft(0, 10), 0);
  assert.equal(hoppusCft(-5, 10), 0);
});
test('sawn timber and plywood sheet volume', () => {
  assert.equal(sawnCft(12, 4, 2), 0.67);
  assert.equal(sheetCft(18), 1.89);
});
test('Indian financial year and date maths', () => {
  assert.equal(fyLabel('2026-11-20'), '26-27');
  assert.equal(fyLabel('2027-03-31'), '26-27');
  assert.equal(fyLabel('2027-04-01'), '27-28');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});
test('plywood is sold per square foot', () => {
  const { lineSqft, lineAmount, stockValue } = require('../server/util');
  const p = { sqftPerSheet: 32, rate: 79 };
  assert.equal(lineSqft(p, 20), 640);
  assert.equal(lineAmount(p, 20, 77.42), Math.round(640 * 77.42));
  assert.equal(stockValue(p, 10), 320 * 79);
  assert.equal(sheetCft(18, 28), 1.65);
});
