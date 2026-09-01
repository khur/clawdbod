// MET (metabolic equivalent) lookup and calorie estimation. The exercise pool
// the model picks from lives in skills/clawdbod/SKILL.md; the test suite
// asserts every pool entry matches a pattern here so the two cannot drift.

export const DEFAULT_MET = 4.0;

// Ordered most-specific first. First regex to match the lowercased name wins.
const MET_PATTERNS = [
  [/wall push|desk push/, 3.5],
  [/standing calf/, 3.0],
  [/calf raise|glute bridge/, 3.5],
  [/wrist circle/, 1.5],
  [/neck roll|cat-cow|cat cow|thoracic|spinal twist/, 2.0],
  [/arm circle|hip circle|toe touch|seated leg raise/, 2.5],
  [/shoulder tap|chair squat|standing march/, 4.0],
  [/commando/, 8.0],
  [/plank|bear crawl|wall sit|hollow body|superman|bicycle crunch|flutter kick|leg raise|russian twist|dead bug/, 3.8],
  [/squat thrust|jump squat/, 8.0],
  [/squat|lunge|deadlift/, 5.0],
  [/step-up|step up|inchworm/, 6.0],
  [/push-up|pushup|push up|burpee|jumping jack|mountain climber|high knee|fast feet|skater|tricep dip|star jump/, 8.0],
];

function findMet(exerciseName) {
  const name = String(exerciseName ?? "").toLowerCase();
  for (const [re, met] of MET_PATTERNS) {
    if (re.test(name)) return met;
  }
  return null;
}

export function metFor(exerciseName) {
  return findMet(exerciseName) ?? DEFAULT_MET;
}

/** True when the name matches an explicit pattern (not the fallback). */
export function hasMetPattern(exerciseName) {
  return findMet(exerciseName) !== null;
}

/**
 * calories = MET × kg × hours; reps assume 3 s each. Returns null without a
 * usable weight. Rounded to 0.1.
 */
export function estimateCalories({ exercise, unit, count, weightLbs }) {
  const lbs = Number(weightLbs);
  const n = Number(count);
  if (!Number.isFinite(lbs) || lbs <= 0 || !Number.isFinite(n) || n <= 0) return null;
  const hours = unit === "seconds" ? n / 3600 : (n * 3) / 3600;
  const cal = metFor(exercise) * (lbs * 0.4536) * hours;
  return Math.round(cal * 10) / 10;
}
