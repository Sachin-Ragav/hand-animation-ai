/**
 * Calculates 3D Euclidean distance between two MediaPipe landmarks.
 */
function getDistance(p1, p2) {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  const dz = (p1.z || 0) - (p2.z || 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Detects extension status for each individual finger.
 */
export function detectFingers(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    }
  }

  const wrist = landmarks[0]

  const fingers = {
    index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
    middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
    ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
    pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
  }

  const result = {}

  for (const [fingerName, joints] of Object.entries(fingers)) {
    const mcp = landmarks[joints.mcp]
    const pip = landmarks[joints.pip]
    const tip = landmarks[joints.tip]

    const distMcpTip = getDistance(mcp, tip)
    const distMcpPip = getDistance(mcp, pip)
    const distWristTip = getDistance(wrist, tip)
    const distWristPip = getDistance(wrist, pip)

    const extensionRatio = distMcpTip / (distMcpPip || 1)
    const isExtended = extensionRatio > 1.35 && distWristTip > distWristPip
    result[fingerName] = isExtended
  }

  const thumbIp = landmarks[3]
  const thumbTip = landmarks[4]
  const indexMcp = landmarks[5]
  const pinkyMcp = landmarks[17]

  const palmCenter = {
    x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
    y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
    z: ((wrist.z || 0) + (indexMcp.z || 0) + (pinkyMcp.z || 0)) / 3,
  }

  const distThumbTipPalm = getDistance(thumbTip, palmCenter)
  const distThumbIpPalm = getDistance(thumbIp, palmCenter)
  const distThumbTipIndexMcp = getDistance(thumbTip, indexMcp)

  const isThumbExtended =
    distThumbTipPalm > distThumbIpPalm * 1.15 &&
    distThumbTipIndexMcp > getDistance(landmarks[2], indexMcp) * 0.9

  result.thumb = isThumbExtended

  return result
}

/**
 * Maps finger extension states to standard hand gestures.
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

  if (thumb && index && middle && ring && pinky) {
    return GESTURE_TYPES.OPEN_HAND
  }

  if (!thumb && !index && !middle && !ring && !pinky) {
    return GESTURE_TYPES.FIST
  }

  if (index && !thumb && !middle && !ring && !pinky) {
    return GESTURE_TYPES.POINT
  }

  if (index && middle && !thumb && !ring && !pinky) {
    return GESTURE_TYPES.PEACE
  }

  if (thumb && !index && !middle && !ring && !pinky) {
    return GESTURE_TYPES.THUMBS_UP
  }

  return GESTURE_TYPES.UNKNOWN
}