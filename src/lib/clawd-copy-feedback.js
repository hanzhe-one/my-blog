// Capture the real success signal from the Shiki copy button: it adds .copied
// only after the clipboard write succeeds, and removes it 2s later. Nothing is
// announced (or loaded) unless that class really appears on the paper theme.
;(() => {
  if (window.__clawdCopyFeedbackBound) return
  window.__clawdCopyFeedbackBound = true
  let timer
  const reveal = () => {
    if (document.documentElement.dataset.appearance !== 'paper') return
    const bubble = document.querySelector('[data-clawd-copy-feedback]')
    if (!bubble) return
    bubble.hidden = false
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      bubble.hidden = true
    }, 1800)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element) || !target.matches('button.copy'))
        continue
      if (target.classList.contains('copied')) {
        reveal()
        return
      }
    }
  })
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
})()
