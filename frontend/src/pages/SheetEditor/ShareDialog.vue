<template>
  <Dialog v-model="show" :options="{ title: dialogTitle, size: 'md' }">
    <template #body-content>

      <!-- Inline error banner for permission / network failures from any of
           the share endpoints. Auto-clears after 5 s. -->
      <Badge
        v-if="errorMessage"
        theme="red" variant="subtle" size="sm"
        class="sd-error"
        :label="errorMessage"
        :tooltip="errorMessage"
      />

      <!-- ── General Access ────────────────────────────────────────────────── -->
      <p class="sd-label">General Access</p>
      <div class="sd-access-row">
        <Dropdown :options="generalAccessOpts" placement="bottom-start">
          <template #default>
            <Button
              variant="outline"
              size="sm"
              :iconLeft="generalAccess === 'all' ? 'globe' : 'lock'"
              iconRight="chevron-down"
              :label="generalAccess === 'all' ? 'Accessible to all' : 'Restricted'"
              class="sd-pill-btn"
            />
          </template>
        </Dropdown>

        <Dropdown v-if="generalAccess === 'all'" :options="generalRoleOpts" placement="bottom-end">
          <template #default>
            <Button
              variant="outline"
              size="sm"
              icon-left="eye"
              icon-right="chevron-down"
              :label="generalRole === '1' ? 'Can edit' : 'Can view'"
              class="sd-pill-btn"
            />
          </template>
        </Dropdown>
      </div>

      <div class="sd-divider" />

      <!-- ── Members ────────────────────────────────────────────────────────── -->
      <p class="sd-label">Members</p>

      <div class="sd-search-wrap">
        <FormControl
          v-model="searchQuery"
          type="text"
          placeholder="Add people..."
          class="sd-search"
          autocomplete="off"
          @update:model-value="onSearchInput"
        />
        <div v-if="searchResults.length" class="sd-results">
          <button
            v-for="u in searchResults"
            :key="u.name"
            class="sd-result-row"
            @mousedown.prevent="inviteUser(u)"
          >
            <Avatar :label="u.initials" :image="u.user_image || undefined" size="sm" />
            <div class="sd-result-info">
              <span class="sd-result-name">{{ u.full_name }}</span>
              <span class="sd-result-email">{{ u.name }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Member list -->
      <div v-if="loading" class="sd-loading"><Spinner size="sm" /></div>
      <div v-else class="sd-member-list">
        <!-- Owner always first -->
        <div class="sd-member-row">
          <Avatar :label="ownerInitials" size="md" :tooltip="ownerFullName" />
          <div class="sd-member-info">
            <span class="sd-member-name">{{ ownerFullName }}</span>
            <span v-if="props.ownerId !== ownerFullName" class="sd-member-email">{{ props.ownerId }}</span>
          </div>
          <span class="sd-role-label">Owner (you)</span>
        </div>

        <div v-for="s in shares" :key="s.user" class="sd-member-row">
          <Avatar :label="s.initials" :image="s.user_image || undefined" size="md" :tooltip="s.full_name" />
          <div class="sd-member-info">
            <span class="sd-member-name">{{ s.full_name }}</span>
            <span class="sd-member-email">{{ s.user }}</span>
          </div>
          <Dropdown :options="memberRoleOpts(s)" placement="bottom-end">
            <template #default>
              <Button
                variant="ghost"
                size="sm"
                :label="s.write ? 'Can edit' : 'Can view'"
                icon-right="chevron-down"
              />
            </template>
          </Dropdown>
        </div>

        <p v-if="!shares.length" class="sd-empty">No one else has access yet.</p>
      </div>

    </template>

    <template #actions>
      <Button variant="outline" size="sm" icon="link-2" label="Copy link" @click="copyLink" />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Badge } from 'frappe-ui'
import { call } from '../../utils/api.js'

const props = defineProps({
  modelValue:  { type: Boolean, default: false },
  sheetId:     { type: String,  default: '' },
  sheetTitle:  { type: String,  default: '' },
  ownerId:     { type: String,  default: '' },
})
const emit = defineEmits(['update:modelValue', 'shares-changed'])

// ── open/close ─────────────────────────────────────────────────────────────

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const dialogTitle = computed(() => `Sharing "${props.sheetTitle || 'Untitled Spreadsheet'}"`)

watch(show, (open) => {
  if (open) {
    errorMessage.value = ''
    fetchShares()
  }
})

// ── inline error banner ──────────────────────────────────────────────────
//
// Every share endpoint can fail with PermissionError (e.g. a read-only
// member trying to add or remove someone else). Without surfacing the
// failure the optimistic UI revert just makes things "snap back" with no
// explanation. Auto-clear after 5 s so the banner doesn't linger after
// the user has read it.
const errorMessage = ref('')
function _flashError(err) {
  const msg = (err && err.message) ? String(err.message) : 'Something went wrong'
  errorMessage.value = msg
  setTimeout(() => { if (errorMessage.value === msg) errorMessage.value = '' }, 5000)
}

// ── owner ──────────────────────────────────────────────────────────────────

const ownerFullName = computed(() =>
  window.frappe?.session?.user_fullname
  || window.frappe?.boot?.user_info?.[props.ownerId]?.fullname
  || props.ownerId
  || 'You'
)
const ownerInitials = computed(() =>
  ownerFullName.value.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
)

// ── general access ─────────────────────────────────────────────────────────

const generalAccess = ref('restricted')
const generalRole   = ref('0')

const generalAccessOpts = computed(() => [
  { label: 'Restricted',        onClick: () => applyGeneralAccess('restricted') },
  { label: 'Accessible to all', onClick: () => applyGeneralAccess('all') },
])
const generalRoleOpts = computed(() => [
  { label: 'Can view', onClick: () => { generalRole.value = '0'; applyGeneralAccess('all') } },
  { label: 'Can edit', onClick: () => { generalRole.value = '1'; applyGeneralAccess('all') } },
])

async function applyGeneralAccess(type) {
  const prevAccess = generalAccess.value
  generalAccess.value = type
  if (!props.sheetId) return
  try {
    if (type === 'all') {
      await call('spreadsheet.api.share_sheet', {
        name: props.sheetId, everyone: 1, write: generalRole.value === '1' ? 1 : 0,
      })
    } else {
      await call('spreadsheet.api.unshare_sheet', { name: props.sheetId, everyone: 1 })
    }
  } catch (err) {
    generalAccess.value = prevAccess   // revert visual state
    _flashError(err)
  }
}

// ── shares ─────────────────────────────────────────────────────────────────

const loading = ref(false)
const shares  = ref([])

async function fetchShares() {
  if (!props.sheetId) return
  loading.value = true
  try {
    const rows = await call('spreadsheet.api.get_sheet_shares', { name: props.sheetId })
    // The "everyone" row encodes general access; keep it out of the member
    // list and use it to seed the General Access dropdown so the dialog
    // reflects persisted state on re-open.
    const everyoneRow = rows.find(r => r.everyone)
    if (everyoneRow) {
      generalAccess.value = 'all'
      generalRole.value   = everyoneRow.write ? '1' : '0'
    } else {
      generalAccess.value = 'restricted'
    }
    shares.value = rows
      .filter(r => !r.everyone && r.user !== props.ownerId)
      .map(r => ({ ...r, write: !!r.write }))
    emit('shares-changed', shares.value.length)
  } catch (err) {
    _flashError(err)
  }
  finally { loading.value = false }
}

function memberRoleOpts(s) {
  return [
    { label: 'Can view',      onClick: () => changeRole(s, false) },
    { label: 'Can edit',      onClick: () => changeRole(s, true)  },
    { label: 'Remove access', onClick: () => removeShare(s)       },
  ]
}

async function changeRole(s, write) {
  const prev = s.write; s.write = write
  try {
    await call('spreadsheet.api.share_sheet', {
      name: props.sheetId, user: s.user, write: write ? 1 : 0,
    })
  } catch (err) {
    s.write = prev
    _flashError(err)
  }
}

async function removeShare(s) {
  shares.value = shares.value.filter(r => r.user !== s.user)
  emit('shares-changed', shares.value.length)
  try {
    await call('spreadsheet.api.unshare_sheet', { name: props.sheetId, user: s.user })
  } catch (err) {
    _flashError(err)
    await fetchShares()
  }
}

// ── search ─────────────────────────────────────────────────────────────────

const searchQuery   = ref('')
const searchResults = ref([])
let   _searchTimer  = null

function onSearchInput(val) {
  clearTimeout(_searchTimer)
  const q = (val || '').trim()
  if (q.length < 2) { searchResults.value = []; return }
  _searchTimer = setTimeout(() => searchUsers(q), 250)
}

async function searchUsers(q) {
  try {
    const rows = await call('frappe.client.get_list', {
      doctype: 'User',
      filters: [
        ['enabled', '=', 1],
        ['user_type', '=', 'System User'],
        ['name', '!=', props.ownerId],
        ['full_name', 'like', `%${q}%`],
      ],
      fields: ['name', 'full_name', 'user_image'],
      limit: 6,
    })
    const existing = new Set(shares.value.map(s => s.user))
    searchResults.value = rows
      .filter(r => !existing.has(r.name))
      .map(r => ({
        ...r,
        initials: r.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
      }))
  } catch (_) { searchResults.value = [] }
}

async function inviteUser(u) {
  searchQuery.value   = ''
  searchResults.value = []
  const entry = { user: u.name, full_name: u.full_name, user_image: u.user_image,
                  initials: u.initials, write: false }
  shares.value.push(entry)
  emit('shares-changed', shares.value.length)
  try {
    await call('spreadsheet.api.share_sheet', { name: props.sheetId, user: u.name, write: 0 })
  } catch (err) {
    shares.value = shares.value.filter(s => s.user !== u.name)
    emit('shares-changed', shares.value.length)
    _flashError(err)
  }
}

async function copyLink() {
  try { await navigator.clipboard.writeText(window.location.href) } catch (_) {}
}
</script>

<style scoped>
/* Inline error banner — sits above the dialog body for permission / network
   failures from any of the share endpoints. */
.sd-error { display: block; margin: 0 0 12px; max-width: 100%; }

/* ── Labels ── */
.sd-label {
  font-size: 13px; font-weight: 500; color: var(--ink-gray-6);
  margin: 0 0 10px; letter-spacing: .01em;
}

/* ── General access row ── */
.sd-access-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 4px;
}

/* Make Frappe UI Button pill-shaped inside the access row */
.sd-pill-btn :deep(button) { border-radius: 999px; }

/* ── Divider ── */
.sd-divider { height: 1px; background: var(--outline-gray-1); margin: 16px 0; }

/* ── Search ── */
.sd-search-wrap { position: relative; margin-bottom: 4px; }

/* Restyle the FormControl input to a pill shape with gray fill */
.sd-search :deep(input) {
  border-radius: 999px;
  background: var(--surface-gray-2);
  border-color: transparent;
  padding-left: 16px;
}
.sd-search :deep(input:hover) { background: var(--surface-gray-3); border-color: transparent; }
.sd-search :deep(input:focus) { background: var(--surface-gray-3); border-color: var(--outline-gray-3); }

/* Search results popover */
.sd-results {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 500;
  background: var(--surface-modal); border: 1px solid var(--outline-gray-modals);
  border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.12); padding: 4px;
}
.sd-result-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; width: 100%;
  border-radius: 6px; border: none; background: transparent; cursor: pointer; text-align: left;
  transition: background-color .1s;
}
.sd-result-row:hover { background: var(--surface-gray-2); }
.sd-result-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sd-result-name  { font-size: 13px; font-weight: 500; color: var(--ink-gray-9); }
.sd-result-email { font-size: 11px; color: var(--ink-gray-5); }

/* ── Member list ── */
.sd-loading      { display: flex; justify-content: center; padding: 20px; }
.sd-member-list  { display: flex; flex-direction: column; margin-top: 8px; }
.sd-member-row   {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 4px; border-radius: 8px; transition: background-color .1s;
}
.sd-member-row:hover { background: var(--surface-gray-1); }
.sd-member-info  { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; overflow: hidden; }
.sd-member-name  { font-size: 13px; font-weight: 600; color: var(--ink-gray-9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-member-email { font-size: 11px; color: var(--ink-gray-5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-role-label   { font-size: 12px; color: var(--ink-gray-5); flex-shrink: 0; white-space: nowrap; padding-right: 4px; }
.sd-empty        { font-size: 13px; color: var(--ink-gray-5); padding: 12px 4px; margin: 0; }
</style>
