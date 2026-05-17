import { COLORS } from './constants.js'

export function createOverlay(parent) {
  const el = document.createElement('input')
  el.type         = 'text'
  el.spellcheck   = false
  el.autocomplete = 'off'
  el.style.cssText = [
    'position:absolute',
    'display:none',
    'box-sizing:border-box',
    `border:2px solid ${COLORS.selBorder}`,
    'background:#FFFFFF',
    'padding:0 4px',
    'font:13px InterVar,Inter,ui-sans-serif,system-ui,sans-serif',
    'letter-spacing:0.02em',
    `color:${COLORS.cellText}`,
    'outline:none',
    'z-index:10',
  ].join(';')
  parent.appendChild(el)

  function position(x, y, w, h, fmt = {}, zoom = 1) {
    el.style.left           = x + 'px'
    el.style.top            = y + 'px'
    el.style.width          = w + 'px'
    el.style.height         = h + 'px'
    el.style.fontWeight     = fmt.bold      ? 'bold'      : 'normal'
    el.style.fontStyle      = fmt.italic    ? 'italic'    : 'normal'
    el.style.fontSize       = ((fmt.fontSize || 13) * zoom) + 'px'
    el.style.fontFamily     = fmt.fontFamily || 'InterVar, Inter, ui-sans-serif, system-ui, sans-serif'
    el.style.textAlign      = fmt.align     || 'left'
    const deco = [fmt.underline && 'underline', fmt.strikethrough && 'line-through'].filter(Boolean).join(' ')
    el.style.textDecoration = deco || 'none'
    el.style.color          = fmt.color     || COLORS.cellText
  }

  function show(value) {
    el.style.display = 'block'
    el.value = value
    el.focus()
    el.setSelectionRange(value.length, value.length)
  }

  function hide() {
    el.style.display = 'none'
    el.value = ''
  }

  function getValue() { return el.value }

  function remove() { el.remove() }

  return { el, position, show, hide, getValue, remove }
}
