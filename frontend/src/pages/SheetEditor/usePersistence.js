import { ref } from 'vue'
import { call } from '../../utils/api.js'

// `merge` and the view-state getters/setters are optional — they were missing
// from earlier versions and their absence caused merged cells / column widths /
// freeze panes / hidden cols/rows to silently disappear after every save.
export function usePersistence({ sheet, formats, merge, getViewState, applyViewState, currentTitle, emit }) {
  const isSaving       = ref(false)
  const showSaveDialog = ref(false)
  const saveTitle      = ref('')
  const saveError      = ref('')

  async function loadSheet(name) {
    try {
      const doc    = await call('frappe_sheets_next.api.get_sheet', { name })
      const saved  = JSON.parse(doc.sheets_data || '{}')
      if (saved.formats) formats.restore(saved.formats)
      sheet.restore(saved.sheet ?? { sheets: { Sheet1: {} }, current: 'Sheet1' })
      if (saved.merge && merge?.restore)  merge.restore(saved.merge)
      if (saved.view  && applyViewState)  applyViewState(saved.view)
      currentTitle.value = doc.title
    } catch (err) {
      console.error('Load failed:', err)
    }
  }

  function openSaveDialog(title) {
    saveTitle.value      = title === 'Untitled Spreadsheet' ? '' : title
    showSaveDialog.value = true
  }

  async function confirmSave() {
    const title = saveTitle.value.trim() || 'Untitled Spreadsheet'
    showSaveDialog.value = false
    const name = await _persist(null, title)
    if (name) {
      currentTitle.value = title
      emit('saved', name)
    }
  }

  async function saveExisting(name, title, { keepalive = false } = {}) {
    await _persist(name, title, { keepalive })
  }

  async function _persist(name, title, { keepalive = false } = {}) {
    isSaving.value = true
    saveError.value = ''
    try {
      const sheetsData = JSON.stringify({
        sheet:   sheet.snapshot(),
        formats: formats.snapshot(),
        merge:   merge?.snapshot?.() ?? null,
        view:    getViewState?.() ?? null,
      })
      const docName = await call('frappe_sheets_next.api.save_sheet', {
        title,
        sheets_data: sheetsData,
        ...(name ? { name } : {}),
      }, { keepalive })
      currentTitle.value = title
      return docName
    } catch (err) {
      saveError.value = err.message || 'Save failed'
      setTimeout(() => { saveError.value = '' }, 5000)
      return null
    } finally {
      isSaving.value = false
    }
  }

  return { isSaving, showSaveDialog, saveTitle, saveError, loadSheet, openSaveDialog, confirmSave, saveExisting }
}
