// Drag artwork, not its layout box: every scene keeps its designed origin.
export function clampDelta(rect, dx, dy, width, height) {
  const gap = 6
  return {
    x: Math.max(gap - rect.left, Math.min(width - gap - rect.right, dx)),
    y: Math.max(gap - rect.top, Math.min(height - gap - rect.bottom, dy)),
  }
}

export function installClawdDrag() {
  if (window.__clawdDragBound) return
  window.__clawdDragBound = true
  const offsets = new WeakMap()
  let active = null
  const imageFor = (event) =>
    event.target instanceof Element
      ? event.target.closest('[data-clawd-image]')
      : null
  const apply = (image, x, y) => {
    offsets.set(image, { x, y })
    image.style.translate = `${x}px ${y}px`
  }
  const reset = (image) => {
    apply(image, 0, 0)
    image.removeAttribute('data-dragging')
  }
  document.addEventListener('dragstart', (event) => {
    if (imageFor(event)) event.preventDefault()
  })
  document.addEventListener('pointerdown', (event) => {
    const image = imageFor(event)
    if (!image || event.button !== 0 || !event.isPrimary) return
    if (document.documentElement.dataset.appearance !== 'paper') return
    const offset = offsets.get(image) || { x: 0, y: 0 }
    active = {
      image,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset,
      rect: image.getBoundingClientRect(),
    }
    image.setPointerCapture(event.pointerId)
    image.dataset.dragging = 'true'
    image.focus({ preventScroll: true })
    event.preventDefault()
  })
  document.addEventListener('pointermove', (event) => {
    if (!active || active.pointer !== event.pointerId) return
    const delta = clampDelta(
      active.rect,
      event.clientX - active.x,
      event.clientY - active.y,
      innerWidth,
      innerHeight,
    )
    apply(active.image, active.offset.x + delta.x, active.offset.y + delta.y)
  })
  const finish = (event) => {
    if (!active || active.pointer !== event.pointerId) return
    active.image.removeAttribute('data-dragging')
    if (active.image.hasPointerCapture(event.pointerId)) {
      active.image.releasePointerCapture(event.pointerId)
    }
    active = null
  }
  document.addEventListener('pointerup', finish)
  document.addEventListener('pointercancel', finish)
  document.addEventListener('lostpointercapture', finish)
  document.addEventListener('dblclick', (event) => {
    const image = imageFor(event)
    if (image) reset(image)
  })
  document.addEventListener('keydown', (event) => {
    const image = imageFor(event)
    if (!image) return
    if (event.key === 'Escape' || event.key === 'Home') {
      reset(image)
      event.preventDefault()
      return
    }
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 30 : 10
    const delta = clampDelta(
      image.getBoundingClientRect(),
      direction[0] * step,
      direction[1] * step,
      innerWidth,
      innerHeight,
    )
    const offset = offsets.get(image) || { x: 0, y: 0 }
    apply(image, offset.x + delta.x, offset.y + delta.y)
  })
  document.addEventListener('click', (event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-clawd-reset]')
    )
      return
    document.querySelectorAll('[data-clawd-image]').forEach(reset)
  })
  window.addEventListener('resize', () => {
    document.querySelectorAll('[data-clawd-image]').forEach(reset)
  })
}
