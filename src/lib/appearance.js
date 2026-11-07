// Runs synchronously in <head>; no storage, font, or network dependency.
// This is a Claude-inspired approximation, not Claude's proprietary typeface.
;(() => {
  if (window.__joyeAppearanceBound) return
  window.__joyeAppearanceBound = true
  const key = 'joye:appearance'
  let root = document.documentElement
  const read = () => {
    try {
      return localStorage.getItem(key) === 'paper' ? 'paper' : 'original'
    } catch {
      return root.dataset.appearance === 'paper' ? 'paper' : 'original'
    }
  }
  let appearance = read()

  function sync(scope = document) {
    scope.querySelectorAll('[data-appearance-toggle]').forEach((button) => {
      const paper = appearance === 'paper'
      button.setAttribute('aria-pressed', String(paper))
      button.setAttribute(
        'aria-label',
        paper ? button.dataset.originalLabel : button.dataset.paperLabel
      )
      button.title = paper ? button.dataset.originalLabel : button.dataset.paperLabel
      const label = button.querySelector('[data-appearance-label]')
      if (label) label.textContent = paper ? button.dataset.paperText : button.dataset.originalText
    })
  }

  function apply() {
    root.dataset.appearance = appearance
    sync()
  }
  apply()

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    if (!event.target.closest('[data-appearance-toggle]')) return
    appearance = root.dataset.appearance === 'paper' ? 'original' : 'paper'
    try {
      localStorage.setItem(key, appearance)
    } catch {
      // The current document still works when storage is blocked/full.
    }
    apply()
  })
  document.addEventListener('astro:page-load', () => {
    root = document.documentElement
    apply()
  })
  document.addEventListener('astro:before-swap', (event) => {
    event.newDocument.documentElement.dataset.appearance = appearance
    sync(event.newDocument)
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return
    appearance = read()
    apply()
  })
})()
