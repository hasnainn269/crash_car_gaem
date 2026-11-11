/**
 * Pure gameplay logic and mathematical helpers for One-Tap Drift.
 * Decoupled from DOM/Canvas for fast unit testing and determinism.
 */

export type DriftResult = 'PERFECT' | 'GOOD' | 'LATE' | 'EARLY' | 'MISS';

export interface DriftTimingWindow {
  earlyThreshold: number; // e.g. 0.45
  goodStart: number;      // e.g. 0.70
  perfectStart: number;   // e.g. 0.85
  perfectEnd: number;     // e.g. 0.95
  goodEnd: number;        // e.g. 1.05
  lateDeadline: number;   // e.g. 1.15
}

export const DEFAULT_TIMING_WINDOW: DriftTimingWindow = {
  earlyThreshold: 0.45,
  goodStart: 0.65,
  perfectStart: 0.82,
  perfectEnd: 0.96,
  goodEnd: 1.08,
  lateDeadline: 1.18,
};

export interface DriftEvaluation {
  result: DriftResult;
  points: number;
  bonusCoins: number;
  message: string;
}

/**
 * Evaluates a player tap at a given timing progress (0 = turn enters radar, 1 = ideal turn apex).
 */
export function evaluateDrift(
  progress: number,
  windowConfig: DriftTimingWindow = DEFAULT_TIMING_WINDOW
): DriftEvaluation {
  if (progress < windowConfig.earlyThreshold) {
    return {
      result: 'EARLY',
      points: 0,
      bonusCoins: 0,
      message: 'TOO EARLY!',
    };
  }

  if (progress < windowConfig.goodStart) {
    return {
      result: 'EARLY',
      points: 0,
      bonusCoins: 0,
      message: 'TOO EARLY!',
    };
  }

  if (progress >= windowConfig.perfectStart && progress <= windowConfig.perfectEnd) {
    return {
      result: 'PERFECT',
      points: 100,
      bonusCoins: 2,
      message: 'PERFECT!',
    };
  }

  if (
    (progress >= windowConfig.goodStart && progress < windowConfig.perfectStart) ||
    (progress > windowConfig.perfectEnd && progress <= windowConfig.goodEnd)
  ) {
    return {
      result: 'GOOD',
      points: 60,
      bonusCoins: 1,
      message: 'GOOD!',
    };
  }

  if (progress > windowConfig.goodEnd && progress <= windowConfig.lateDeadline) {
    return {
      result: 'LATE',
      points: 30,
      bonusCoins: 0,
      message: 'LATE!',
    };
  }

  return {
    result: 'MISS',
    points: 0,
    bonusCoins: 0,
    message: 'MISSED TURN!',
  };
}

/**
 * Calculates drift score reward adjusted by combo multiplier.
 */
export function calculateDriftScore(basePoints: number, combo: number): number {
  const multiplier = Math.min(Math.max(1, combo), 8);
  return basePoints * multiplier;
}

/**
 * Calculates current forward speed smoothly based on distance travelled.
 */
export function calculateSpeed(
  distance: number,
  baseSpeed: number = 280,
  maxSpeed: number = 540,
  accelFactor: number = 1.8
): number {
  if (distance <= 0) return baseSpeed;
  const speed = baseSpeed + Math.sqrt(distance) * accelFactor;
  return Math.min(maxSpeed, Math.round(speed));
}

/**
 * Circle-to-circle collision check for coin pickup.
 */
export function checkCoinCollision(
  carX: number,
  carY: number,
  carRadius: number,
  coinX: number,
  coinY: number,
  coinRadius: number
): boolean {
  const dx = carX - coinX;
  const dy = carY - coinY;
  const distSq = dx * dx + dy * dy;
  const radiusSum = carRadius + coinRadius;
  return distSq <= radiusSum * radiusSum;
}

export interface CarConfig {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  roofColor: string;
  price: number;
  description: string;
  speedRating: number;
  driftRating: number;
}

export const CAR_CATALOG: CarConfig[] = [
  {
    id: 'car-cyan',
    name: 'Cobalt Apex',
    color: '#00d2ff',
    secondaryColor: '#0077b6',
    roofColor: '#1a2a3a',
    price: 0,
    description: 'Balanced agile starter sports car with crisp handling.',
    speedRating: 3,
    driftRating: 4,
  },
  {
    id: 'car-orange',
    name: 'Flame GT',
    color: '#ff6b35',
    secondaryColor: '#d64515',
    roofColor: '#2b1b17',
    price: 45,
    description: 'High-torque drift racer built for sharp corners.',
    speedRating: 4,
    driftRating: 5,
  },
  {
    id: 'car-red',
    name: 'Crimson Fury',
    color: '#ef233c',
    secondaryColor: '#b01026',
    roofColor: '#2b1418',
    price: 90,
    description: 'Aggressive track monster with instant drift response.',
    speedRating: 5,
    driftRating: 4,
  },
  {
    id: 'car-gold',
    name: 'Midas Velocity',
    color: '#ffc300',
    secondaryColor: '#cc9a00',
    roofColor: '#262010',
    price: 160,
    description: 'Ultra-luxurious golden hypercar for drifting legends.',
    speedRating: 5,
    driftRating: 5,
  },
];

export interface GarageState {
  unlockedCars: string[];
  selectedCarId: string;
  coins: number;
}

export function unlockCar(
  state: GarageState,
  carId: string
): { success: boolean; newState: GarageState; error?: string } {
  const car = CAR_CATALOG.find((c) => c.id === carId);
  if (!car) {
    return { success: false, newState: state, error: 'Car does not exist' };
  }
  if (state.unlockedCars.includes(carId)) {
    return { success: true, newState: { ...state, selectedCarId: carId } };
  }
  if (state.coins < car.price) {
    return { success: false, newState: state, error: 'Insufficient coins' };
  }
  return {
    success: true,
    newState: {
      coins: state.coins - car.price,
      unlockedCars: [...state.unlockedCars, carId],
      selectedCarId: carId,
    },
  };
}

export function selectCar(
  state: GarageState,
  carId: string
): { success: boolean; newState: GarageState; error?: string } {
  if (!state.unlockedCars.includes(carId)) {
    return { success: false, newState: state, error: 'Car not unlocked' };
  }
  return {
    success: true,
    newState: {
      ...state,
      selectedCarId: carId,
    },
  };
}

/**
 * 2D vector distance calculation.
 */
export function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Evaluates a cubic Hermite / Catmull-Rom spline point.
 */
export function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
