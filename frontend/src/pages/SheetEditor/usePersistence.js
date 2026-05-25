import { ref } from 'vue'
import { call }            from '../../utils/api.js'
import { encodeForUpload } from '../../utils/compress.js'

// `merge` and the view-state getters/setters are optional — they were missing
// from earlier versions and their absence caused merged cells / column widths /
// freeze panes / hidden cols/rows to silently disappear after every save.
export function usePersistence({ sheet, formats, merge, comments, validation, condFormat, sortFilter, pivot, charts, namedRanges, getViewState, applyViewState, currentTitle, emit }) {
  const isSaving  = ref(false)
  const saveError = ref('')

  async function loadSheet(name) {
    try {
      const doc    = await call('sheets.api.get_sheet', { name })
      const saved  = JSON.parse(doc.sheets_data || '{}')
      if (saved.formats)    formats.restore(saved.formats)
      sheet.restore(saved.sheet ?? { sheets: { Sheet1: {} }, current: 'Sheet1' })
      if (saved.merge      && merge?.restore)      merge.restore(saved.merge)
      if (saved.comments   && comments?.restore)   comments.restore(saved.comments)
      if (saved.validation && validation?.restore) validation.restore(saved.validation)
      if (saved.condFormat && condFormat?.restore) condFormat.restore(saved.condFormat)
      if (saved.sortFilter && sortFilter?.restore) sortFilter.restore(saved.sortFilter)
      if (saved.view       && applyViewState)      applyViewState(saved.view)
      if (saved.pivot      && pivot?.restore)      pivot.restore(saved.pivot)
      if (saved.charts     && charts?.restore)     charts.restore(saved.charts)
      if (saved.namedRanges && namedRanges?.restore) namedRanges.restore(saved.namedRanges)
      currentTitle.value = doc.title
    } catch (err) {
      console.error('Load failed:', err)
    }
  }

  // Creates a brand-new doc on the backend with the given title and returns the
  // doc name.  Called immediately on mount so every doc has a real ID from the
  // start — no manual-save step, matching Google Sheets' always-saved model.
  async function autoCreate(title, { ops } = {}) {
    return _persist(null, title || 'Untitled Spreadsheet', { ops })
  }

  async function saveExisting(name, title, { keepalive = false, ops } = {}) {
    return _persist(name, title, { keepalive, ops })
  }

  async function _persist(name, title, { keepalive = false, ops } = {}) {
    isSaving.value = true
    saveError.value = ''
    try {
      const sheetsData = JSON.stringify({
        sheet:      sheet.snapshot(),
        formats:    formats.snapshot(),
        merge:      merge?.snapshot?.()      ?? null,
        comments:   comments?.snapshot?.()   ?? null,
        validation: validation?.snapshot?.() ?? null,
        condFormat: condFormat?.snapshot?.() ?? null,
        sortFilter: sortFilter?.snapshot?.() ?? null,
        pivot:      pivot?.snapshot?.()      ?? null,
        charts:     charts?.snapshot?.()     ?? null,
        namedRanges: namedRanges?.snapshot?.() ?? null,
        view:       getViewState?.()         ?? null,
      })
      const payload = await encodeForUpload(sheetsData)
      // The save endpoint now returns { name, head_seq } so the client knows
      // where its batch of ops landed in the canonical op-log ordering.
      const result = await call('sheets.api.save_sheet', {
        title,
        sheets_data: payload,
        ...(name ? { name } : {}),
        ...(ops && ops.length ? { ops: JSON.stringify(ops) } : {}),
      }, { keepalive })
      currentTitle.value = title
      return typeof result === 'string' ? result : result?.name
    } catch (err) {
      // Network failures (offline, server restart) surface with no usable
      // message — fall back to a helpful prompt rather than a blank chip.
      saveError.value = err.message || "Couldn't save — check your connection, then try Cmd+S."
      setTimeout(() => { saveError.value = '' }, 5000)
      return null
    } finally {
      isSaving.value = false
    }
  }

  return { isSaving, saveError, loadSheet, autoCreate, saveExisting }
}
