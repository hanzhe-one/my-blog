// Independent of appearance and light/dark preferences. No image URLs are fetched
// until a paper mascot is present. Reduced motion always wins over saved consent.
;(() => {
  if (window.__joyeMascotBound) return
  window.__joyeMascotBound = true
  const key = 'joye:clawd-motion'
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  let preference = 'on'
  const read = () => {
    try {
      return localStorage.getItem(key) === 'off' ? 'off' : 'on'
    } catch {
      return preference
    }
  }
  preference = read()
  function sync() {
    const paper = document.documentElement.dataset.appearance === 'paper'
    const moving = preference === 'on' && !media.matches
    document.querySelectorAll('[data-clawd-image]').forEach((image) => {
      const src = paper
        ? moving
          ? image.dataset.gif
          : image.dataset.still
        : null
      if (src === null) image.removeAttribute('src')
      else if (image.getAttribute('src') !== src) image.setAttribute('src', src)
    })
    document.querySelectorAll('[data-clawd-toggle]').forEach((button) => {
      button.disabled = media.matches
      button.setAttribute('aria-pressed', String(moving))
      button.textContent = media.matches
        ? button.dataset.reducedLabel
        : moving
          ? button.dataset.onLabel
          : button.dataset.offLabel
    })
  }
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    if (!event.target.closest('[data-clawd-toggle]') || media.matches) return
    preference = preference === 'on' ? 'off' : 'on'
    try {
      localStorage.setItem(key, preference)
    } catch {
      // Private mode / full storage: retain the preference for this document.
    }
    sync()
  })
  const observer = new MutationObserver(sync)
  function observe() {
    observer.disconnect()
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-appearance'],
    })
    sync()
  }
  document.addEventListener('DOMContentLoaded', observe)
  document.addEventListener('astro:page-load', observe)
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return
    preference = read()
    sync()
  })
  media.addEventListener('change', sync)
  observe()
})()
