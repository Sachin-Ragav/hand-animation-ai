/**
 * Maps finger extension states to standard hand gestures.
 * 
 * @param {Object} fingers - Object containing finger boolean states:
 *   { thumb: boolean, index: boolean, middle: boolean, ring: boolean, pinky: boolean }
 * @returns {Object} - Object containing gesture key and display label:
 *   { id: string, name: string }
 */
export const GESTURE_TYPES = {
  OPEN_HAND: { id: 'OPEN_HAND', name: 'OPEN HAND' },
  FIST: { id: 'FIST', name: 'FIST' },
  POINT: { id: 'POINT', name: 'POINT' },
  PEACE: { id: 'PEACE', name: 'PEACE' },
  THUMBS_UP: { id: 'THUMBS_UP', name: 'THUMBS UP' },
  UNKNOWN: { id: 'UNKNOWN', name: 'UNKNOWN' },
}

export function detectGesture(fingers) {
  if (!fingers) {
    return GESTURE_TYPES.UNKNOWN
  }

  const { thumb, index, middle, ring, pinky } = fingers

  // 1. OPEN_HAND: All 5 fingers extended
  if (thumb && index && middle && ring && pinky) {
    return GESTURE_TYPES.OPEN_HAND
  }

  // 2. FIST: All 5 fingers folded
  if (!thumb && !index && !middle && !ring && !pinky) {
    return GESTURE_TYPES.FIST
  }

  // 3. POINT: Index extended, others folded
  if (index && !thumb && !middle && !ring && !pinky) {
    return GESTURE_TYPES.POINT
  }

  // 4. PEACE: Index + Middle extended, others folded
  if (index && middle && !thumb && !ring && !pinky) {
    return GESTURE_TYPES.PEACE
  }

  // 5. THUMBS_UP: Thumb extended, others folded
  if (thumb && !index && !middle && !ring && !pinky) {
    return GESTURE_TYPES.THUMBS_UP
  }

  // Default: Unrecognized finger combination
  return GESTURE_TYPES.UNKNOWN
}