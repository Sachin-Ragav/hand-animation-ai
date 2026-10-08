/**
 * Unified Interaction Manager & Canvas 2D Rendering Engine
 * Architecture:
 * - Tracking Layer: Consumes mapped landmarks & gesture states
 * - Interaction Layer: Primary Mode State Machine with explicit sub-effects
 * - Rendering Layer: Isolated composite drawing passes & particle physics
 */

export const INTERACTION_MODES = {
  STANDARD_FX: 'STANDARD_FX',
  ENERGY_ORB: 'ENERGY_ORB',
  TWO_HAND: 'TWO_HAND',
  AIR_DRAWING: 'AIR_DRAWING',
  TRACKING_ONLY: 'TRACKING_ONLY',
}

export class EffectsEngine {
  constructor() {
    this.primaryMode = INTERACTION_MODES.STANDARD_FX

    // Active Sub-Effect Choices
    this.standardSubEffect = 'AUTO' // AUTO, AURA, LIGHTNING, BURST, DUAL_TRAILS, OFF
    this.twoHandSubEffect = 'BEAM'   // BEAM, PORTAL, DUAL_BURST

    // Orb Sub-Settings
    this.enablePinchSize = true
    this.enableGrabRelease = true

    // Physics & Buffer Storage
    this.particles = []
    this.shockwaves = []
    this.flashes = []
    this.indexTrail = []
    this.middleTrail = []
    this.airDrawingPaths = []

    // Interactive Orb Physics State
    this.orbRadius = 45
    this.targetOrbRadius = 45
    this.isOrbCharged = false

    // Multi-Hand EMA Position Smoothers
    this.smoothedPalm0 = null
    this.smoothedPalm1 = null
    this.smoothedIndexTip = null
    this.smoothedMiddleTip = null

    // Transient Render Variables
    this.portalAngle = 0
    this.portalAlpha = 0
    this.auraAngle = 0

    // Gesture Transition Trackers
    this.lastGesture0 = 'UNKNOWN'
    this.lastGesture1 = 'UNKNOWN'
  }

  setPrimaryMode(mode) {
    if (this.primaryMode === mode) return
    this.primaryMode = mode
    this.resetAllState()
  }

  resetAllState() {
    this.particles = []
    this.shockwaves = []
    this.flashes = []
    this.indexTrail = []
    this.middleTrail = []
    this.smoothedPalm0 = null
    this.smoothedPalm1 = null
    this.smoothedIndexTip = null
    this.smoothedMiddleTip = null
    this.portalAlpha = 0
    this.isOrbCharged = false
    this.lastGesture0 = 'UNKNOWN'
    this.lastGesture1 = 'UNKNOWN'
  }

  clearParticles() {
    this.particles = []
    this.shockwaves = []
    this.flashes = []
    this.indexTrail = []
    this.middleTrail = []
  }

  clearDrawing() {
    this.airDrawingPaths = []
  }

  smoothPoint(current, target, factor = 0.35) {
    if (!current) return { x: target.x, y: target.y }
    return {
      x: current.x + (target.x - current.x) * factor,
      y: current.y + (target.y - current.y) * factor,
    }
  }

  mapLandmarks(landmarks, width, height) {
    return landmarks.map((lm) => ({
      x: (1 - lm.x) * width,
      y: lm.y * height,
    }))
  }

  /**
   * Main Unified Execution & Render Pass
   */
  updateAndDraw({
    context,
    width,
    height,
    allLandmarks = [],
    gestures = [],
    primaryMode = INTERACTION_MODES.STANDARD_FX,
    standardSubEffect = 'AUTO',
    twoHandSubEffect = 'BEAM',
    enablePinchSize = true,
    enableGrabRelease = true,
    intensity = 65,
    primaryColor = '#00e5ff',
    secondaryColor = '#8a2be2',
    trailLength = 20,
    glowStrength = 12,
    particleDensity = 50,
  }) {
    context.clearRect(0, 0, width, height)

    // Sync state properties
    if (this.primaryMode !== primaryMode) {
      this.setPrimaryMode(primaryMode)
    }
    this.standardSubEffect = standardSubEffect
    this.twoHandSubEffect = twoHandSubEffect
    this.enablePinchSize = enablePinchSize
    this.enableGrabRelease = enableGrabRelease

    if (intensity <= 0 || this.primaryMode === INTERACTION_MODES.TRACKING_ONLY) {
      this.lastGesture0 = gestures[0]?.id || 'UNKNOWN'
      this.lastGesture1 = gestures[1]?.id || 'UNKNOWN'
      return
    }

    const hand0 = allLandmarks[0] ? this.mapLandmarks(allLandmarks[0], width, height) : null
    const hand1 = allLandmarks[1] ? this.mapLandmarks(allLandmarks[1], width, height) : null

    const gesture0 = gestures[0]?.id || 'UNKNOWN'
    const gesture1 = gestures[1]?.id || 'UNKNOWN'

    // Dispatch based on exclusive Primary Mode
    switch (this.primaryMode) {
      case INTERACTION_MODES.STANDARD_FX:
        this.processStandardFxMode({
          context, width, height, hand0, gesture0,
          intensity, primaryColor, secondaryColor, trailLength, glowStrength, particleDensity
        })
        break

      case INTERACTION_MODES.ENERGY_ORB:
        this.processEnergyOrbMode({
          context, width, height, hand0, gesture0,
          intensity, primaryColor, secondaryColor, glowStrength, particleDensity
        })
        break

      case INTERACTION_MODES.TWO_HAND:
        this.processTwoHandMode({
          context, width, height, hand0, hand1, gesture0, gesture1,
          intensity, primaryColor, secondaryColor, glowStrength, particleDensity
        })
        break

      case INTERACTION_MODES.AIR_DRAWING:
        this.processAirDrawingMode({
          context, hand0, gesture0, primaryColor, glowStrength
        })
        break

      default:
        break
    }

    // Render persistent global particle physics engine
    this.updateAndDrawFlashes(context, glowStrength)
    this.updateAndDrawShockwaves(context, glowStrength)
    this.updateAndDrawParticles(context, width, height, glowStrength)

    this.lastGesture0 = gesture0
    this.lastGesture1 = gesture1
  }

  /**
   * MODE A: STANDARD FX MODE
   */
  processStandardFxMode({
    context, width, height, hand0, gesture0,
    intensity, primaryColor, secondaryColor, trailLength, glowStrength, particleDensity
  }) {
    if (!hand0) {
      this.smoothedPalm0 = null
      this.smoothedIndexTip = null
      this.smoothedMiddleTip = null
      this.indexTrail = []
      this.middleTrail = []
      return
    }

    let activeEffect = this.standardSubEffect
    if (this.standardSubEffect === 'AUTO') {
      switch (gesture0) {
        case 'OPEN_HAND': activeEffect = 'AURA'; break
        case 'POINT': activeEffect = 'LIGHTNING'; break
        case 'FIST': activeEffect = 'BURST'; break
        case 'PEACE': activeEffect = 'DUAL_TRAILS'; break
        default: activeEffect = 'OFF'; break
      }
    }

    // Edge transition burst trigger
    if (
      activeEffect === 'BURST' &&
      this.lastGesture0 !== 'FIST' &&
      gesture0 === 'FIST'
    ) {
      this.spawnBurstAtPoint(
        hand0[9].x, hand0[9].y, intensity, primaryColor, secondaryColor, particleDensity
      )
    }

    switch (activeEffect) {
      case 'AURA':
        this.renderMagicAura(
          context, hand0, intensity, primaryColor, secondaryColor, glowStrength, particleDensity
        )
        break
      case 'LIGHTNING':
        this.renderLightningTrail(
          context, hand0[8], intensity, primaryColor, trailLength, glowStrength
        )
        break
      case 'DUAL_TRAILS':
        this.renderDualTrails(
          context, hand0[8], hand0[12], intensity, primaryColor, secondaryColor, trailLength, glowStrength
        )
        break
      default:
        break
    }
  }

  /**
   * MODE B: ENERGY ORB MODE
   */
  processEnergyOrbMode({
    context, hand0, gesture0,
    intensity, primaryColor, secondaryColor, glowStrength, particleDensity
  }) {
    if (!hand0) {
      this.smoothedPalm0 = null
      this.isOrbCharged = false
      return
    }

    // Handle Grab & Release transitions
    if (this.enableGrabRelease) {
      if (gesture0 === 'FIST') {
        this.isOrbCharged = true
      } else if (this.lastGesture0 === 'FIST' && gesture0 === 'OPEN_HAND' && this.isOrbCharged) {
        this.spawnBurstAtPoint(
          hand0[9].x, hand0[9].y, intensity * 1.3, '#ffffff', primaryColor, particleDensity * 1.5
        )
        this.isOrbCharged = false
      }
    } else {
      this.isOrbCharged = false
    }

    // Smooth palm position
    const rawPalm = {
      x: (hand0[0].x + hand0[5].x + hand0[17].x) / 3,
      y: (hand0[0].y + hand0[5].y + hand0[17].y) / 3,
    }
    this.smoothedPalm0 = this.smoothPoint(this.smoothedPalm0, rawPalm, 0.3)
    const { x: orbX, y: orbY } = this.smoothedPalm0

    // Calculate Pinch Ratio relative to Palm Scale
    if (this.enablePinchSize) {
      const dxPinch = hand0[4].x - hand0[8].x
      const dyPinch = hand0[4].y - hand0[8].y
      const pinchDist = Math.sqrt(dxPinch * dxPinch + dyPinch * dyPinch)

      const dxPalm = hand0[5].x - hand0[17].x
      const dyPalm = hand0[5].y - hand0[17].y
      const palmWidth = Math.max(20, Math.sqrt(dxPalm * dxPalm + dyPalm * dyPalm))

      const clampedRatio = Math.min(Math.max(pinchDist / palmWidth, 0.25), 2.2)
      this.targetOrbRadius = 15 + clampedRatio * 45 * (intensity / 65)
    } else {
      this.targetOrbRadius = 45 * (intensity / 65)
    }

    this.orbRadius += (this.targetOrbRadius - this.orbRadius) * 0.25

    context.save()
    context.globalCompositeOperation = 'screen'

    const r = Math.max(10, this.orbRadius)
    const haloGrad = context.createRadialGradient(orbX, orbY, 2, orbX, orbY, r * 1.8)
    const activeColor = this.isOrbCharged ? '#ff007f' : primaryColor

    haloGrad.addColorStop(0, '#ffffff')
    haloGrad.addColorStop(0.3, this.hexToRgba(activeColor, 0.8))
    haloGrad.addColorStop(0.75, this.hexToRgba(secondaryColor, 0.35))
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

    context.fillStyle = haloGrad
    context.beginPath()
    context.arc(orbX, orbY, r * 1.8, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.arc(orbX, orbY, r * 0.45, 0, Math.PI * 2)
    context.fillStyle = '#ffffff'
    context.shadowColor = activeColor
    context.shadowBlur = glowStrength * 1.5
    context.fill()

    if (this.isOrbCharged || Math.random() < 0.6) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * 3 + 1
      this.particles.push({
        x: orbX + Math.cos(angle) * r,
        y: orbY + Math.sin(angle) * r,
        vx: Math.cos(angle + Math.PI / 2) * speed,
        vy: Math.sin(angle + Math.PI / 2) * speed,
        size: Math.random() * 3.5 + 1.5,
        color: this.isOrbCharged ? '#ff007f' : activeColor,
        alpha: 0.9,
        decay: 0.03,
      })
    }

    context.restore()
  }

  /**
   * MODE C: TWO-HAND MODE
   */
  processTwoHandMode({
    context, hand0, hand1, gesture0, gesture1,
    intensity, primaryColor, secondaryColor, glowStrength, particleDensity
  }) {
    if (hand0 && hand1) {
      const palm0 = { x: (hand0[0].x + hand0[5].x + hand0[17].x) / 3, y: (hand0[0].y + hand0[5].y + hand0[17].y) / 3 }
      const palm1 = { x: (hand1[0].x + hand1[5].x + hand1[17].x) / 3, y: (hand1[0].y + hand1[5].y + hand1[17].y) / 3 }

      this.smoothedPalm0 = this.smoothPoint(this.smoothedPalm0, palm0, 0.3)
      this.smoothedPalm1 = this.smoothPoint(this.smoothedPalm1, palm1, 0.3)

      if (this.twoHandSubEffect === 'BEAM') {
        this.renderEnergyBeam(
          context, this.smoothedPalm0, this.smoothedPalm1, intensity, primaryColor, secondaryColor, glowStrength
        )
      } else if (this.twoHandSubEffect === 'PORTAL') {
        this.portalAlpha = Math.min(1.0, this.portalAlpha + 0.08)
        this.renderPortal(
          context, this.smoothedPalm0, this.smoothedPalm1, intensity, primaryColor, secondaryColor, glowStrength
        )
      } else if (this.twoHandSubEffect === 'DUAL_BURST') {
        if (
          this.lastGesture0 === 'FIST' && this.lastGesture1 === 'FIST' &&
          gesture0 === 'OPEN_HAND' && gesture1 === 'OPEN_HAND'
        ) {
          const midX = (this.smoothedPalm0.x + this.smoothedPalm1.x) / 2
          const midY = (this.smoothedPalm0.y + this.smoothedPalm1.y) / 2
          this.spawnBurstAtPoint(
            midX, midY, intensity * 1.5, primaryColor, secondaryColor, particleDensity * 2
          )
        }
      }
    } else {
      if (this.portalAlpha > 0 && this.twoHandSubEffect === 'PORTAL' && this.smoothedPalm0 && this.smoothedPalm1) {
        this.portalAlpha = Math.max(0, this.portalAlpha - 0.08)
        this.renderPortal(
          context, this.smoothedPalm0, this.smoothedPalm1, intensity, primaryColor, secondaryColor, glowStrength
        )
      } else {
        this.smoothedPalm1 = null
      }
    }
  }

  /**
   * MODE D: AIR DRAWING MODE
   */
  processAirDrawingMode({ context, hand0, gesture0, primaryColor, glowStrength }) {
    if (hand0) {
      const indexTip = hand0[8]
      if (indexTip && (gesture0 === 'POINT' || gesture0 === 'OPEN_HAND')) {
        this.airDrawingPaths.push({
          x: indexTip.x,
          y: indexTip.y,
          color: primaryColor,
          size: Math.max(2, (glowStrength / 12) * 4),
        })
        if (this.airDrawingPaths.length > 500) this.airDrawingPaths.shift()
      }
    }

    if (this.airDrawingPaths.length < 2) return

    context.save()
    context.globalCompositeOperation = 'screen'
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let i = 0; i < this.airDrawingPaths.length - 1; i++) {
      const p1 = this.airDrawingPaths[i]
      const p2 = this.airDrawingPaths[i + 1]

      context.beginPath()
      context.moveTo(p1.x, p1.y)
      context.lineTo(p2.x, p2.y)
      context.lineWidth = p1.size
      context.strokeStyle = p1.color
      context.shadowColor = p1.color
      context.shadowBlur = glowStrength
      context.stroke()
    }

    context.restore()
  }

  /**
   * Helper Renderers
   */
  spawnBurstAtPoint(x, y, intensity, primaryColor, secondaryColor, particleDensity) {
    const scale = intensity / 100

    this.flashes.push({
      x, y, radius: 90 * scale + 20, alpha: 1.0, decay: 0.06, color: '#ffffff',
    })

    this.shockwaves.push({
      x, y, radius: 10, maxRadius: 160 * scale + 40, speed: 10 * scale + 4,
      lineWidth: 6, color: primaryColor, alpha: 1.0, decay: 0.025,
    })

    this.shockwaves.push({
      x, y, radius: 5, maxRadius: 120 * scale + 30, speed: 7 * scale + 3,
      lineWidth: 4, color: secondaryColor, alpha: 0.9, decay: 0.03,
    })

    const particleCount = Math.floor((particleDensity / 50) * 70 * scale) + 20
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * 12 + 3.5
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: Math.random() * 5 + 2,
        color: Math.random() > 0.4 ? primaryColor : Math.random() > 0.5 ? secondaryColor : '#ffffff',
        alpha: 1.0, decay: Math.random() * 0.025 + 0.012,
      })
    }
  }

  renderMagicAura(context, points, intensity, primaryColor, secondaryColor, glowStrength, particleDensity) {
    const rawPalm = {
      x: (points[0].x + points[5].x + points[17].x) / 3,
      y: (points[0].y + points[5].y + points[17].y) / 3,
    }

    this.smoothedPalm0 = this.smoothPoint(this.smoothedPalm0, rawPalm, 0.35)
    const { x: palmX, y: palmY } = this.smoothedPalm0

    const dx = points[9].x - points[0].x
    const dy = points[9].y - points[0].y
    const palmRadius = Math.max(30, Math.sqrt(dx * dx + dy * dy) * 0.65)
    const scale = intensity / 65

    context.save()
    context.globalCompositeOperation = 'screen'

    const outerRadius = palmRadius * 2.2 * scale
    const auraGrad = context.createRadialGradient(palmX, palmY, 5, palmX, palmY, outerRadius)
    auraGrad.addColorStop(0, this.hexToRgba(primaryColor, 0.75))
    auraGrad.addColorStop(0.4, this.hexToRgba(secondaryColor, 0.45))
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

    context.fillStyle = auraGrad
    context.beginPath()
    context.arc(palmX, palmY, outerRadius, 0, Math.PI * 2)
    context.fill()

    this.auraAngle += 0.04
    for (let r = 0; r < 2; r++) {
      const ringRadius = palmRadius * (0.8 + r * 0.45) * scale
      const startAngle = this.auraAngle * (r === 0 ? 1 : -1.3)

      context.beginPath()
      context.ellipse(palmX, palmY, ringRadius, ringRadius * 0.55, startAngle, 0, Math.PI * 2)
      context.lineWidth = 2
      context.strokeStyle = r === 0 ? this.hexToRgba(primaryColor, 0.6) : this.hexToRgba(secondaryColor, 0.6)
      context.shadowColor = r === 0 ? primaryColor : secondaryColor
      context.shadowBlur = glowStrength
      context.stroke()
    }

    const spawnCount = Math.floor((particleDensity / 50) * (intensity / 50))
    for (let i = 0; i < spawnCount; i++) {
      const orbitAngle = Math.random() * Math.PI * 2
      const spawnDist = Math.random() * palmRadius * 1.3
      const speed = Math.random() * 2 + 1
      const isOrbiting = Math.random() > 0.4

      this.particles.push({
        x: palmX + Math.cos(orbitAngle) * spawnDist,
        y: palmY + Math.sin(orbitAngle) * spawnDist,
        vx: isOrbiting ? Math.cos(orbitAngle + Math.PI / 2) * speed : (Math.random() - 0.5) * 2,
        vy: isOrbiting ? Math.sin(orbitAngle + Math.PI / 2) * speed : (Math.random() - 0.5) * 2 - 1,
        size: Math.random() * 3.5 + 1.5,
        color: Math.random() > 0.4 ? primaryColor : Math.random() > 0.5 ? secondaryColor : '#ffffff',
        alpha: 0.9, decay: Math.random() * 0.02 + 0.012,
      })
    }

    context.restore()
  }

  renderLightningTrail(context, tipPoint, intensity, primaryColor, trailLength, glowStrength) {
    if (!tipPoint) return

    this.smoothedIndexTip = this.smoothPoint(this.smoothedIndexTip, tipPoint, 0.4)
    this.indexTrail.unshift({ ...this.smoothedIndexTip })

    if (this.indexTrail.length > trailLength) this.indexTrail.length = trailLength
    if (this.indexTrail.length < 2) return

    context.save()
    context.globalCompositeOperation = 'screen'

    this.renderGlowingPath(context, this.indexTrail, primaryColor, '#ffffff', glowStrength, intensity)

    if (this.indexTrail.length > 4 && Math.random() < 0.65) {
      const segIndex = Math.floor(Math.random() * (this.indexTrail.length - 2))
      const p1 = this.indexTrail[segIndex]
      const p2 = this.indexTrail[segIndex + 1]
      this.drawElectricBranch(context, p1, p2, primaryColor, intensity, glowStrength)
    }

    context.restore()
  }

  renderDualTrails(context, indexTip, middleTip, intensity, primaryColor, secondaryColor, trailLength, glowStrength) {
    if (!indexTip || !middleTip) return

    this.smoothedIndexTip = this.smoothPoint(this.smoothedIndexTip, indexTip, 0.4)
    this.smoothedMiddleTip = this.smoothPoint(this.smoothedMiddleTip, middleTip, 0.4)

    this.indexTrail.unshift({ ...this.smoothedIndexTip })
    this.middleTrail.unshift({ ...this.smoothedMiddleTip })

    if (this.indexTrail.length > trailLength) this.indexTrail.length = trailLength
    if (this.middleTrail.length > trailLength) this.middleTrail.length = trailLength

    context.save()
    context.globalCompositeOperation = 'screen'

    this.renderGlowingPath(context, this.indexTrail, primaryColor, '#ffffff', glowStrength, intensity)
    this.renderGlowingPath(context, this.middleTrail, secondaryColor, '#ffffff', glowStrength, intensity)

    context.restore()
  }

  renderEnergyBeam(context, p1, p2, intensity, primaryColor, secondaryColor, glowStrength) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 10) return

    const scale = intensity / 65

    context.save()
    context.globalCompositeOperation = 'screen'

    context.beginPath()
    context.moveTo(p1.x, p1.y)
    context.lineTo(p2.x, p2.y)
    context.lineWidth = Math.max(2, 12 * scale)
    context.strokeStyle = this.hexToRgba(primaryColor, 0.6)
    context.shadowColor = primaryColor
    context.shadowBlur = glowStrength * 1.2
    context.stroke()

    context.beginPath()
    context.moveTo(p1.x, p1.y)
    context.lineTo(p2.x, p2.y)
    context.lineWidth = Math.max(1, 3.5 * scale)
    context.strokeStyle = '#ffffff'
    context.stroke()

    if (Math.random() < 0.8) {
      const t = Math.random()
      this.particles.push({
        x: p1.x + dx * t + (Math.random() - 0.5) * 8,
        y: p1.y + dy * t + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 3.5 + 1.5,
        color: Math.random() > 0.5 ? primaryColor : secondaryColor,
        alpha: 0.9, decay: 0.04,
      })
    }

    context.restore()
  }

  renderPortal(context, p1, p2, intensity, primaryColor, secondaryColor, glowStrength) {
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const handDist = Math.sqrt(dx * dx + dy * dy)

    const portalRadius = Math.min(Math.max(handDist * 0.45, 30), 160) * (intensity / 65)
    this.portalAngle += 0.03

    context.save()
    context.globalCompositeOperation = 'screen'
    context.globalAlpha = this.portalAlpha

    for (let r = 0; r < 3; r++) {
      const ringR = portalRadius * (0.4 + r * 0.3)
      const ringAngle = this.portalAngle * (r % 2 === 0 ? 1 : -1.2)

      context.beginPath()
      context.ellipse(midX, midY, ringR, ringR * 0.6, ringAngle, 0, Math.PI * 2)
      context.lineWidth = 3 - r * 0.5
      context.strokeStyle = r === 0 ? '#ffffff' : r === 1 ? primaryColor : secondaryColor
      context.shadowColor = primaryColor
      context.shadowBlur = glowStrength
      context.stroke()
    }

    const vortexGrad = context.createRadialGradient(midX, midY, 5, midX, midY, portalRadius)
    vortexGrad.addColorStop(0, '#ffffff')
    vortexGrad.addColorStop(0.4, this.hexToRgba(primaryColor, 0.6))
    vortexGrad.addColorStop(0.8, this.hexToRgba(secondaryColor, 0.3))
    vortexGrad.addColorStop(1, 'rgba(0,0,0,0)')

    context.fillStyle = vortexGrad
    context.beginPath()
    context.arc(midX, midY, portalRadius, 0, Math.PI * 2)
    context.fill()

    context.restore()
  }

  renderGlowingPath(context, trail, glowHex, coreHex, glowStrength, intensity) {
    if (trail.length < 2) return

    const scale = intensity / 65
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i]
      const p2 = trail[i + 1]
      const progress = 1 - i / trail.length

      context.beginPath()
      context.moveTo(p1.x, p1.y)
      context.lineTo(p2.x, p2.y)
      context.lineWidth = Math.max(1, 14 * progress * scale)
      context.strokeStyle = this.hexToRgba(glowHex, 0.6 * progress)
      context.shadowColor = glowHex
      context.shadowBlur = glowStrength
      context.stroke()
    }

    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i]
      const p2 = trail[i + 1]
      const progress = 1 - i / trail.length

      context.beginPath()
      context.moveTo(p1.x, p1.y)
      context.lineTo(p2.x, p2.y)
      context.lineWidth = Math.max(1, 3.5 * progress)
      context.strokeStyle = this.hexToRgba(coreHex, 0.95 * progress)
      context.shadowColor = '#ffffff'
      context.shadowBlur = Math.min(6, glowStrength)
      context.stroke()
    }
  }

  drawElectricBranch(context, p1, p2, color, intensity, glowStrength) {
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2
    const offset = (Math.random() - 0.5) * 35 * (intensity / 65)

    context.beginPath()
    context.moveTo(midX, midY)
    context.lineTo(midX + offset, midY + offset)
    context.lineWidth = 1.8
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    context.shadowColor = color
    context.shadowBlur = glowStrength
    context.stroke()
  }

  updateAndDrawFlashes(context) {
    if (this.flashes.length === 0) return

    context.save()
    context.globalCompositeOperation = 'screen'

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.alpha -= f.decay

      if (f.alpha <= 0) {
        this.flashes.splice(i, 1)
        continue
      }

      const grad = context.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius)
      grad.addColorStop(0, `rgba(255, 255, 255, ${f.alpha})`)
      grad.addColorStop(0.5, this.hexToRgba(f.color, f.alpha * 0.6))
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')

      context.fillStyle = grad
      context.beginPath()
      context.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
      context.fill()
    }

    context.restore()
  }

  updateAndDrawShockwaves(context, glowStrength) {
    if (this.shockwaves.length === 0) return

    context.save()
    context.globalCompositeOperation = 'screen'

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i]
      s.radius += s.speed
      s.alpha -= s.decay

      if (s.alpha <= 0 || s.radius >= s.maxRadius) {
        this.shockwaves.splice(i, 1)
        continue
      }

      context.beginPath()
      context.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
      context.lineWidth = s.lineWidth
      context.strokeStyle = s.color
      context.globalAlpha = Math.max(0, s.alpha)
      context.shadowColor = s.color
      context.shadowBlur = glowStrength
      context.stroke()
    }

    context.restore()
  }

  updateAndDrawParticles(context, width, height, glowStrength) {
    if (this.particles.length === 0) return

    context.save()
    context.globalCompositeOperation = 'screen'

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]

      p.x += p.vx
      p.y += p.vy
      p.alpha -= p.decay

      if (p.alpha <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        this.particles.splice(i, 1)
        continue
      }

      context.beginPath()
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      context.fillStyle = p.color
      context.globalAlpha = Math.max(0, p.alpha)
      context.shadowColor = p.color
      context.shadowBlur = Math.min(8, glowStrength)
      context.fill()
    }

    context.restore()
  }

  hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(0, 229, 255, ${alpha})`
    let cleanHex = hex.replace('#', '')
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map((char) => char + char).join('')
    }
    const num = parseInt(cleanHex, 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
}