import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDrift,
  calculateDriftScore,
  calculateSpeed,
  checkCoinCollision,
  unlockCar,
  selectCar,
  catmullRom,
  CAR_CATALOG,
  DEFAULT_TIMING_WINDOW,
} from './drift-logic.ts';

test('evaluateDrift returns EARLY when tapped prior to good window', () => {
  const early1 = evaluateDrift(0.2, DEFAULT_TIMING_WINDOW);
  assert.equal(early1.result, 'EARLY');
  assert.equal(early1.points, 0);

  const early2 = evaluateDrift(0.55, DEFAULT_TIMING_WINDOW);
  assert.equal(early2.result, 'EARLY');
});

test('evaluateDrift returns PERFECT within sweet spot', () => {
  const perfect = evaluateDrift(0.89, DEFAULT_TIMING_WINDOW);
  assert.equal(perfect.result, 'PERFECT');
  assert.equal(perfect.points, 100);
  assert.equal(perfect.bonusCoins, 2);
});

test('evaluateDrift returns GOOD on approach and exit boundaries', () => {
  const goodPre = evaluateDrift(0.72, DEFAULT_TIMING_WINDOW);
  assert.equal(goodPre.result, 'GOOD');
  assert.equal(goodPre.points, 60);

  const goodPost = evaluateDrift(1.02, DEFAULT_TIMING_WINDOW);
  assert.equal(goodPost.result, 'GOOD');
  assert.equal(goodPost.points, 60);
});

test('evaluateDrift returns LATE just before miss deadline', () => {
  const late = evaluateDrift(1.12, DEFAULT_TIMING_WINDOW);
  assert.equal(late.result, 'LATE');
  assert.equal(late.points, 30);
});

test('evaluateDrift returns MISS past deadline', () => {
  const miss = evaluateDrift(1.25, DEFAULT_TIMING_WINDOW);
  assert.equal(miss.result, 'MISS');
  assert.equal(miss.points, 0);
});

test('calculateDriftScore applies combo multiplier capped at 8x', () => {
  assert.equal(calculateDriftScore(100, 1), 100);
  assert.equal(calculateDriftScore(100, 3), 300);
  assert.equal(calculateDriftScore(60, 5), 300);
  assert.equal(calculateDriftScore(100, 10), 800); // capped at 8x
});

test('calculateSpeed increases with distance and respects limits', () => {
  const base = calculateSpeed(0);
  assert.equal(base, 280);

  const mid = calculateSpeed(500);
  assert.ok(mid > 280 && mid < 540);

  const maxed = calculateSpeed(1000000);
  assert.equal(maxed, 540);
});

test('checkCoinCollision accurately checks distance bounds', () => {
  // Overlapping
  assert.equal(checkCoinCollision(100, 100, 20, 110, 100, 15), true);
  // Touching exactly
  assert.equal(checkCoinCollision(100, 100, 10, 130, 100, 20), true);
  // Separate
  assert.equal(checkCoinCollision(100, 100, 10, 150, 100, 10), false);
});

test('garage unlocking and selection enforces coin rules', () => {
  const initial = {
    coins: 50,
    unlockedCars: ['car-cyan'],
    selectedCarId: 'car-cyan',
  };

  // Orange car costs 45 -> should succeed
  const purchaseOrange = unlockCar(initial, 'car-orange');
  assert.equal(purchaseOrange.success, true);
  assert.equal(purchaseOrange.newState.coins, 5);
  assert.ok(purchaseOrange.newState.unlockedCars.includes('car-orange'));
  assert.equal(purchaseOrange.newState.selectedCarId, 'car-orange');

  // Red car costs 90, user only has 5 -> should fail
  const purchaseRed = unlockCar(purchaseOrange.newState, 'car-red');
  assert.equal(purchaseRed.success, false);
  assert.equal(purchaseRed.newState.coins, 5);

  // Switching between unlocked cars
  const selectCyan = selectCar(purchaseOrange.newState, 'car-cyan');
  assert.equal(selectCyan.success, true);
  assert.equal(selectCyan.newState.selectedCarId, 'car-cyan');

  // Selecting locked car fails
  const selectLocked = selectCar(purchaseOrange.newState, 'car-gold');
  assert.equal(selectLocked.success, false);
});

test('catmullRom spline interpolates endpoints correctly', () => {
  const p0 = 0, p1 = 10, p2 = 20, p3 = 30;
  assert.equal(catmullRom(p0, p1, p2, p3, 0), 10);
  assert.equal(catmullRom(p0, p1, p2, p3, 1), 20);
  assert.equal(catmullRom(p0, p1, p2, p3, 0.5), 15);
});
