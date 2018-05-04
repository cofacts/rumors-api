const LEVEL_POINTS = [
  0,
  1,
  2,
  3,
  5,
  8,
  13,
  21,
  34,
  55,
  89,
  144,
  233,
  377,
  610,
  987,
  1587,
  2584,
  4181,
  6765,
  10946,
  17711,
  28657,
  46368,
  75025,
  121393,
];

/**
 * @param {number} level
 * @returns {number} points required to reach the level
 */
export function getPointsRequired(level) {
  if (level >= LEVEL_POINTS.length) return Infinity;
  return LEVEL_POINTS[level];
}

/**
 * @param {number[]} sortedArr
 * @param {number} item
 * @returns {number} the index in the sortedArr, whose value is the max value in sortedArr <= item
 */
function binarySearchIdx(sortedArr, item) {
  let start = 0;
  let end = sortedArr.length;
  while (end - start > 1) {
    const middleIdx = Math.floor((start + end) / 2);
    if (item === sortedArr[middleIdx]) return middleIdx;
    if (item < sortedArr[middleIdx]) end = middleIdx;
    else start = middleIdx;
  }

  return start;
}

/**
 * @param {number} point
 * @returns {number} level of the given point
 */
export function getLevel(point) {
  return binarySearchIdx(LEVEL_POINTS, point);
}
