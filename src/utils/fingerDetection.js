/**
 * Calculates Euclidean distance between two 3D landmarks.
 */
function getDistance(p1, p2) {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  const dz = (p1.z || 0) - (p2.z || 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Detects extension status for each finger.
 * @param {Array} landmarks - Array of 21 MediaPipe hand landmarks.
 * @returns {Object} Finger extension state map { thumb, index, middle, ring, pinky }
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

  // Finger Joint Indices
  const fingers = {
    index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
    middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
    ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
    pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
  }

  const result = {}

  // 1. Evaluate Four Main Fingers
  for (const [fingerName, joints] of Object.entries(fingers)) {
    const mcp = landmarks[joints.mcp]
    const pip = landmarks[joints.pip]
    const tip = landmarks[joints.tip]

    const distMcpTip = getDistance(mcp, tip)
    const distMcpPip = getDistance(mcp, pip)
    const distWristTip = getDistance(wrist, tip)
    const distWristPip = getDistance(wrist, pip)

    // Distance extension ratio threshold
    const extensionRatio = distMcpTip / (distMcpPip || 1)

    // Extended if tip is extended far from knuckle AND tip is further from wrist than PIP joint
    const isExtended = extensionRatio > 1.35 && distWristTip > distWristPip
    result[fingerName] = isExtended
  }

  // 2. Evaluate Thumb
  const thumbCmc = landmarks[1]
  const thumbMcp = landmarks[2]
  const thumbIp = landmarks[3]
  const thumbTip = landmarks[4]
  const indexMcp = landmarks[5]
  const pinkyMcp = landmarks[17]

  // Approximate palm center using Wrist, Index MCP, Pinky MCP
  const palmCenter = {
    x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
    y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
    z: ((wrist.z || 0) + (indexMcp.z || 0) + (pinkyMcp.z || 0)) / 3,
  }

  const distThumbTipPalm = getDistance(thumbTip, palmCenter)
  const distThumbIpPalm = getDistance(thumbIp, palmCenter)
  const distThumbTipIndexMcp = getDistance(thumbTip, indexMcp)

  // Thumb is extended when tip is pushed outward away from index base and palm center
  const isThumbExtended =
    distThumbTipPalm > distThumbIpPalm * 1.15 && distThumbTipIndexMcp > getDistance(thumbMcp, indexMcp) * 0.9

  result.thumb = isThumbExtended

  return result
}