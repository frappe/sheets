<template>
  <div class="home">
    <!-- Top bar -->
    <div class="home-topbar">
      <div class="home-brand">
        <!-- Brand mark from claude.ai/design handoff (logo/preview.html).
             Deep cyan #0E7490, rising line in #A5F0FA, white nodes. -->
        <svg width="28" height="28" viewBox="0 0 256 256" fill="none" style="flex-shrink:0">
          <rect width="256" height="256" rx="60" fill="#0E7490"/>
          <rect x="0.5" y="0.5" width="255" height="255" rx="59.5" stroke="white" stroke-opacity="0.12"/>
          <g stroke="white" stroke-opacity="0.18" stroke-width="2" stroke-linecap="round">
            <line x1="85"  y1="32"  x2="85"  y2="224"/>
            <line x1="171" y1="32"  x2="171" y2="224"/>
            <line x1="32"  y1="85"  x2="224" y2="85"/>
            <line x1="32"  y1="171" x2="224" y2="171"/>
          </g>
          <polyline points="48,180 96,148 136,164 184,80 216,108"
                    fill="none" stroke="#A5F0FA" stroke-width="18"
                    stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="136" cy="164" r="11" fill="white"/>
          <circle cx="184" cy="80"  r="11" fill="white"/>
        </svg>
        <span class="home-brand-name">Frappe Sheets</span>
      </div>
      <!-- Inline error banner — destructive actions (delete / duplicate)
           use this instead of `window.alert` so the chrome stays in-app
           and Espresso-themed. Auto-clears after 4 s. -->
      <Badge v-if="errorMessage" theme="red" variant="subtle" size="sm" :label="errorMessage" />
      <FormControl
        type="text"
        size="sm"
        class="home-search"
        v-model="searchQuery"
        placeholder="Search spreadsheets…"
      >
        <template #prefix>
          <FeatherIcon name="search" class="home-search-icon" />
        </template>
      </FormControl>
      <!-- View-mode toggle: grid (card) vs list. State persists in
           localStorage so the user's choice survives reloads. Uses two
           Frappe UI Buttons inside a thin segmented frame; the active
           one switches to `subtle` so it inverts against the row. -->
      <div class="home-viewtoggle" role="tablist" aria-label="View mode">
        <Button
          :variant="viewMode === 'grid' ? 'subtle' : 'ghost'"
          size="sm" icon="grid"
          tooltip="Grid view"
          role="tab"
          :aria-selected="viewMode === 'grid'"
          @click="setViewMode('grid')"
        />
        <Button
          :variant="viewMode === 'list' ? 'subtle' : 'ghost'"
          size="sm" icon="list"
          tooltip="List view"
          role="tab"
          :aria-selected="viewMode === 'list'"
          @click="setViewMode('list')"
        />
      </div>
      <Button variant="solid" @click="emit('new')">New Spreadsheet</Button>
    </div>

    <!-- Content -->
    <div class="home-body">
      <!-- Loading -->
      <div v-if="loading" class="home-empty">
        <Spinner class="home-spinner" />
      </div>

      <!-- Empty state (no sheets at all) -->
      <div v-else-if="!sheets.length" class="home-empty">
        <div class="home-empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="8" fill="#f3f3f3"/>
            <rect x="10" y="10" width="13" height="13" rx="2" fill="#e2e2e2"/>
            <rect x="25" y="10" width="13" height="13" rx="2" fill="#e2e2e2"/>
            <rect x="10" y="25" width="13" height="13" rx="2" fill="#e2e2e2"/>
            <rect x="25" y="25" width="13" height="13" rx="2" fill="#e2e2e2"/>
          </svg>
        </div>
        <p class="home-empty-title">No spreadsheets yet</p>
        <p class="home-empty-sub">Create one to get started</p>
        <Button variant="solid" @click="emit('new')">New Spreadsheet</Button>
      </div>

      <!-- No search match -->
      <div v-else-if="!filteredSheets.length" class="home-empty">
        <p class="home-empty-title">No matches for “{{ searchQuery }}”</p>
        <p class="home-empty-sub">Try a different name.</p>
      </div>

      <!-- Sheet grid -->
      <div v-else-if="viewMode === 'grid'" class="home-grid">
        <div
          v-for="sheet in filteredSheets"
          :key="sheet.name"
          class="home-card"
          @click="emit('open', sheet.name)"
        >
          <!-- Preview placeholder -->
          <div class="home-card-preview">
            <svg width="100%" height="100%" viewBox="0 0 200 120" fill="none" preserveAspectRatio="xMidYMid meet">
              <rect width="200" height="120" fill="#F8F8F8"/>
              <line x1="0" y1="24" x2="200" y2="24" stroke="#E2E2E2"/>
              <line x1="0" y1="48" x2="200" y2="48" stroke="#E2E2E2"/>
              <line x1="0" y1="72" x2="200" y2="72" stroke="#E2E2E2"/>
              <line x1="0" y1="96" x2="200" y2="96" stroke="#E2E2E2"/>
              <line x1="40" y1="0" x2="40" y2="120" stroke="#E2E2E2"/>
              <line x1="100" y1="0" x2="100" y2="120" stroke="#E2E2E2"/>
              <line x1="160" y1="0" x2="160" y2="120" stroke="#E2E2E2"/>
              <rect x="8"   y="8"  width="24" height="9" rx="2" fill="#E2E2E2"/>
              <rect x="48"  y="8"  width="36" height="9" rx="2" fill="#C7C7C7"/>
              <rect x="108" y="8"  width="20" height="9" rx="2" fill="#E2E2E2"/>
              <rect x="48"  y="32" width="28" height="8" rx="2" fill="#EDEDED"/>
              <rect x="48"  y="56" width="44" height="8" rx="2" fill="#EDEDED"/>
              <rect x="48"  y="80" width="20" height="8" rx="2" fill="#EDEDED"/>
            </svg>
          </div>

          <!-- Card footer -->
          <div class="home-card-footer">
            <div class="home-card-info">
              <span class="home-card-title">{{ sheet.title }}</span>
              <span class="home-card-date">{{ formatDate(sheet.modified) }}</span>
            </div>
            <div class="home-card-menu" @click.stop>
              <Dropdown :options="cardActions(sheet)" placement="right">
                <template #default="{ open }">
                  <Button :variant="open ? 'subtle' : 'ghost'" size="sm" icon="more-vertical" tooltip="Actions" />
                </template>
              </Dropdown>
            </div>
          </div>
        </div>
      </div>

      <!-- Sheet list -->
      <div v-else class="home-list">
        <div class="home-list-head">
          <div class="home-list-col home-list-col--title">Name</div>
          <div class="home-list-col home-list-col--owner">Owner</div>
          <div class="home-list-col home-list-col--date">Last modified</div>
          <div class="home-list-col home-list-col--actions" aria-hidden="true"></div>
        </div>
        <div
          v-for="sheet in filteredSheets"
          :key="sheet.name"
          class="home-list-row"
          @click="emit('open', sheet.name)"
        >
          <div class="home-list-col home-list-col--title">
            <FeatherIcon name="file-text" class="home-list-icon" />
            <span class="home-list-title">{{ sheet.title }}</span>
          </div>
          <div class="home-list-col home-list-col--owner">{{ shortOwner(sheet.owner) }}</div>
          <div class="home-list-col home-list-col--date">{{ formatDate(sheet.modified) }}</div>
          <div class="home-list-col home-list-col--actions" @click.stop>
            <Dropdown :options="cardActions(sheet)" placement="right">
              <template #default="{ open }">
                <Button :variant="open ? 'subtle' : 'ghost'" size="sm" icon="more-vertical" tooltip="Actions" />
              </template>
            </Dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- Rename dialog -->
    <Dialog v-model="showRenameDialog" :options="{ title: 'Rename spreadsheet', size: 'sm' }">
      <template #body-content>
        <FormControl v-model="renameValue" label="New title" placeholder="Untitled Spreadsheet" @keydown.enter="confirmRename" />
      </template>
      <template #actions>
        <Button variant="solid" :loading="renaming" @click="confirmRename">Rename</Button>
        <Button @click="showRenameDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Delete confirm dialog -->
    <Dialog
      v-model="showDeleteDialog"
      :options="{ title: 'Delete spreadsheet?', size: 'sm' }"
    >
      <template #body-content>
        <p class="home-confirm-text">
          "<strong>{{ deleteTarget?.title }}</strong>" will be permanently deleted.
        </p>
      </template>
      <template #actions>
        <Button
          variant="solid"
          theme="red"
          :loading="deleting"
          @click="doDelete"
        >Delete</Button>
        <Button @click="showDeleteDialog = false">Cancel</Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Badge, Button, Dialog, Spinner, FormControl, FeatherIcon, Dropdown } from 'frappe-ui'
import { call } from '../utils/api.js'

const emit = defineEmits(['open', 'new'])

const sheets       = ref([])
const loading      = ref(true)
const searchQuery  = ref('')

// Inline error banner used by the destructive actions (delete / duplicate).
// Mirrors the editor's `saveError` pattern — Frappe UI Badge, auto-dismissed
// after a few seconds — so we never reach for `window.alert`.
const errorMessage = ref('')
function _flashError(msg) {
  errorMessage.value = msg
  setTimeout(() => { if (errorMessage.value === msg) errorMessage.value = '' }, 4000)
}

// Persisted view preference. Default to grid because the previews are the
// existing visual identity of the page; users who want density opt in.
const VIEW_KEY = 'frappe_sheets:home_view_mode'
const viewMode = ref(_readViewMode())

function _readViewMode() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'list' || v === 'grid' ? v : 'grid'
  } catch (_) {
    return 'grid'
  }
}

function setViewMode(mode) {
  if (mode !== 'grid' && mode !== 'list') return
  viewMode.value = mode
  try { localStorage.setItem(VIEW_KEY, mode) } catch (_) { /* private mode */ }
}

function shortOwner(u) {
  if (!u) return ''
  return u.includes('@') ? u.split('@')[0] : u
}

// Filter by title, case-insensitive substring match. Sort order from the API
// (modified desc) is preserved by `filter`.
const filteredSheets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return sheets.value
  return sheets.value.filter(s => (s.title || '').toLowerCase().includes(q))
})

// Per-card 3-dot menu. Returned as a Frappe UI Dropdown options array.
function cardActions(sheet) {
  return [
    { label: 'Rename',    icon: 'edit-2',  onClick: () => openRenameDialog(sheet) },
    { label: 'Duplicate', icon: 'copy',    onClick: () => duplicate(sheet) },
    { label: 'Delete',    icon: 'trash-2', onClick: () => confirmDelete(sheet) },
  ]
}

const showDeleteDialog = ref(false)
const deleteTarget     = ref(null)
const deleting         = ref(false)

const showRenameDialog = ref(false)
const renameTarget     = ref(null)
const renameValue      = ref('')
const renaming         = ref(false)

onMounted(fetchSheets)

async function fetchSheets() {
  loading.value = true
  try {
    sheets.value = await call('sheets.api.list_sheets')
  } finally {
    loading.value = false
  }
}

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60)           return 'just now'
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

function confirmDelete(sheet) {
  deleteTarget.value    = sheet
  showDeleteDialog.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await call('sheets.api.delete_sheet', { name: deleteTarget.value.name })
    sheets.value = sheets.value.filter(s => s.name !== deleteTarget.value.name)
    showDeleteDialog.value = false
  } catch (err) {
    console.error('Delete failed:', err)
    _flashError(err?.message || 'Delete failed')
  } finally {
    deleting.value = false
  }
}

function openRenameDialog(sheet) {
  renameTarget.value     = sheet
  renameValue.value      = sheet.title || ''
  showRenameDialog.value = true
}

async function confirmRename() {
  const target = renameTarget.value
  const title  = renameValue.value.trim()
  if (!target || !title) return
  renaming.value = true
  try {
    await call('sheets.api.rename_sheet', { name: target.name, title })
    const found = sheets.value.find(s => s.name === target.name)
    if (found) found.title = title
    showRenameDialog.value = false
  } finally {
    renaming.value = false
  }
}

async function duplicate(sheet) {
  try {
    await call('sheets.api.duplicate_sheet', { name: sheet.name })
    // Refresh the listing so the new doc shows up with its modified timestamp.
    await fetchSheets()
  } catch (err) {
    // Surface the failure instead of silently swallowing — keeps "nothing
    // happened" from being indistinguishable from server errors.
    console.error('Duplicate failed:', err)
    _flashError(err?.message || 'Duplicate failed')
  }
}
</script>

<style scoped>
/* Espresso tokens — every color comes from frappe-ui's semantic palette. */
.home {
  display: flex;
  flex-direction: column;
  /* The global stylesheet locks <html/body/#root> at 100% with overflow:hidden
     (the editor wants pixel-perfect viewport control). So Home owns its own
     scroll: a fixed-height column where the body region scrolls. */
  height: 100vh;
  background: var(--surface-white);
  font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
  color: var(--ink-gray-9);
}

.home-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 32px;
  height: 60px;
  background: var(--surface-white);
  border-bottom: 1px solid var(--outline-gray-2);
  flex-shrink: 0;
}

.home-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* Search input — compact, fixed 220px so it doesn't dominate the topbar. */
.home-search       { width: 220px; margin-left: auto; }
.home-search :deep(input) { height: 28px; font-size: 13px; }
.home-search-icon  { width: 13px; height: 13px; color: var(--ink-gray-5); }

.home-brand-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--ink-gray-9);
}

.home-body {
  flex: 1;
  min-height: 0;          /* lets flex children own their own scroll */
  overflow-y: auto;       /* the actual scroll container */
  padding: 40px 32px;
  width: 100%;
}

/* Inner constraint so the grid/list don't stretch full-width on big monitors
   but the scrollbar still tracks the full viewport on the right edge. */
.home-body > * {
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

/* Loading / empty */
.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 300px;
  color: var(--ink-gray-5);
}
.home-spinner       { width: 32px; height: 32px; color: var(--ink-gray-5); }
.home-empty-icon    { margin-bottom: 4px; }
.home-empty-title   { font-size: 15px; font-weight: 500; letter-spacing: .01em; color: var(--ink-gray-8); margin: 0; }
.home-empty-sub     { font-size: 13px; letter-spacing: .02em; color: var(--ink-gray-5); margin: 0 0 8px; }

/* Grid */
.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.home-card {
  background: var(--surface-cards);
  border: 1px solid var(--outline-gray-2);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow .15s, border-color .15s, transform .15s;
}
.home-card:hover {
  border-color: var(--outline-gray-3);
  box-shadow: 0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1);
}

.home-card-preview {
  height: 130px;
  background: var(--surface-gray-1);
  border-bottom: 1px solid var(--outline-gray-2);
  overflow: hidden;
}

.home-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  gap: 8px;
}

.home-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.home-card-title {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: .01em;
  color: var(--ink-gray-9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-card-date {
  font-size: 11px;
  letter-spacing: .02em;
  color: var(--ink-gray-5);
}

/* Per-card 3-dot menu — shown on hover only, like Google Sheets. */
.home-card-menu {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity .15s;
}
.home-card:hover .home-card-menu { opacity: 1; }
/* Keep the menu visible while its dropdown is open so the trigger doesn't
   vanish when the user moves the cursor onto the menu. */
.home-card-menu:has([data-headlessui-state~="open"]) { opacity: 1; }

.home-confirm-text {
  font-size: 14px;
  letter-spacing: .02em;
  color: var(--ink-gray-7);
  margin: 0;
}

/* ── View-mode toggle ──────────────────────────────────────────────────────
   Segmented control: thin frame around two Frappe UI Buttons. The Buttons
   own their own padding/typography; the wrapper just gives them the
   shared border + 2px inner gutter that makes them read as one control. */
.home-viewtoggle {
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--outline-gray-2);
  border-radius: 8px;
  padding: 2px;
  background: var(--surface-white);
  flex-shrink: 0;
}

/* ── List view ─────────────────────────────────────────────────────────────
   Dense table-like rendering. Four-column grid mirrors the header row so the
   columns line up without table semantics (we want row-level click + the
   trailing actions menu to live in a flex child, not a `<td>`). */
.home-list {
  background: var(--surface-white);
  border: 1px solid var(--outline-gray-2);
  border-radius: 10px;
  overflow: hidden;
}
.home-list-head,
.home-list-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 160px 48px;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
}
.home-list-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--ink-gray-5);
  border-bottom: 1px solid var(--outline-gray-2);
  background: var(--surface-gray-1);
}
.home-list-row {
  cursor: pointer;
  border-bottom: 1px solid var(--outline-gray-2);
  transition: background-color .1s;
}
.home-list-row:last-child { border-bottom: 0; }
.home-list-row:hover      { background: var(--surface-gray-2); }
.home-list-col            { min-width: 0; }
.home-list-col--title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-gray-9);
  overflow: hidden;
}
.home-list-icon {
  width: 14px;
  height: 14px;
  color: var(--ink-gray-5);
  flex-shrink: 0;
}
.home-list-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-list-col--owner,
.home-list-col--date {
  font-size: 12px;
  color: var(--ink-gray-6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-list-col--actions {
  display: flex;
  justify-content: flex-end;
}
</style>
