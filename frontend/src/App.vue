<template>
  <!-- Mobile / narrow-tablet blocker. The canvas grid has no touch support
       today, so we hide the entire app behind this overlay below 720px and
       ask the user to come back from desktop. The underlying components
       still mount so state is preserved when the user rotates back. -->
  <div class="sn-mobile-blocker">
    <div class="sn-mobile-card">
      <svg width="56" height="56" viewBox="0 0 118 118" fill="none">
        <path d="M93.9278 0H23.1013C10.3428 0 0 10.3428 0 23.1013V93.9278C0 106.686 10.3428 117.029 23.1013 117.029H93.9278C106.686 117.029 117.029 106.686 117.029 93.9278V23.1013C117.029 10.3428 106.686 0 93.9278 0Z" fill="#278F5E"/>
        <path d="M77.757 25.9364H23.5215V36.437H77.757C80.6447 36.437 83.0073 38.7996 83.0073 41.6873V75.3942C83.0073 78.2818 80.6447 80.6445 77.757 80.6445H39.2724C36.3847 80.6445 34.0221 78.2818 34.0221 75.3942V50.6653H23.5215V75.3942C23.5215 84.0572 30.6094 91.1451 39.2724 91.1451H77.757C86.42 91.1451 93.5079 84.0572 93.5079 75.3942V41.6873C93.5079 33.0243 86.42 25.9364 77.757 25.9364Z" fill="white"/>
        <path d="M53.8678 59.6958H43.3672V70.0914H53.8678V59.6958Z" fill="white"/>
        <path d="M73.6617 50.6653H63.1611V70.1439H73.6617V50.6653Z" fill="white"/>
      </svg>
      <h2>Open on desktop</h2>
      <p>Frappe Sheets is built for desktop browsers — mobile and tablet
         support is on the roadmap. Please come back from a laptop or PC.</p>
    </div>
  </div>

  <SheetEditor v-if="currentId" :id="currentId" @close="goHome" @saved="onSaved" />
  <Trash v-else-if="view === 'trash'" @home="goHome" />
  <Home v-else @open="openSheet" @new="newSheet" @trash="openTrash" />
  <Dialogs />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Home        from './pages/Home.vue'
import Trash       from './pages/Trash.vue'
import SheetEditor from './pages/SheetEditor/index.vue'

// Two independent axes of navigation: `currentId` (an open sheet, via ?id=)
// takes precedence; otherwise `view` (?view=trash) picks the home surface.
const currentId = ref(null)
const view      = ref('home')

onMounted(() => {
  syncFromUrl()
  window.addEventListener('popstate', syncFromUrl)
})

function syncFromUrl() {
  const params = new URLSearchParams(location.search)
  currentId.value = params.get('id') ?? null
  view.value      = params.get('view') === 'trash' ? 'trash' : 'home'
}

function openSheet(id) { currentId.value = id;   view.value = 'home';  history.pushState({}, '', `?id=${id}`) }
function newSheet()     { currentId.value = 'new'; view.value = 'home';  history.pushState({}, '', '?id=new') }
function openTrash()    { currentId.value = null;  view.value = 'trash'; history.pushState({}, '', '?view=trash') }
function goHome()       { currentId.value = null;  view.value = 'home';  history.pushState({}, '', location.pathname) }
function onSaved(name)  { currentId.value = name;  history.replaceState({}, '', `?id=${name}`) }
</script>

<style>
/* Frappe UI's Dialog overlay relies on DOM order (portal at body level) to
   stack above page content — fine until something on the page sets an
   explicit z-index. The pivot edit-fab (z-20) and pivot-output highlight
   border (z-15) on a pivot sheet poke through the overlay because explicit
   z-index beats DOM order. Pin a known z-index so any positioned page
   element below this value stays under the modal. */
.dialog-overlay { z-index: 40; }
/* Popovers inside dialogs (Dropdown menus, autocomplete lists) portal to
   body with implicit z-index 0 — they'd render BEHIND .dialog-overlay
   above. Bump them past the overlay so they remain visible. */
.dropdown-content { z-index: 50; }

/* The overlay above sits ABOVE the grid, but its scrim is only ~12% black —
   translucent. Absolutely-positioned grid decorations that span the whole data
   region (the filter-range outline and pivot-output highlight, both full-height
   dark 1.5px borders) therefore stay visible THROUGH the scrim, drawing a line
   that flanks the open dialog. Hide those decorations whenever a dialog is up.
   `.dialog-overlay` portals to <body>, so `:has` from body catches every one. */
body:has(.dialog-overlay) .sn-filter-range,
body:has(.dialog-overlay) .sn-pivot-highlight { display: none; }

/* Hidden on desktop; shown via @media on narrow viewports. position:fixed
   over everything (max z-index) covers any underlying app surface without
   unmounting it. */
.sn-mobile-blocker { display: none; }
@media (max-width: 720px) {
  .sn-mobile-blocker {
    display: flex; position: fixed; inset: 0; z-index: 99999;
    align-items: center; justify-content: center; padding: 24px;
    background: var(--surface-gray-1, #F8F8F8);
    font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
    color: var(--ink-gray-9, #171717);
  }
  .sn-mobile-card {
    max-width: 360px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    padding: 32px 24px; border-radius: 14px;
    background: var(--surface-white, #FFFFFF);
    border: 1px solid var(--outline-gray-2, #E2E2E2);
    box-shadow: 0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1);
  }
  .sn-mobile-card h2 {
    margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.005em;
  }
  .sn-mobile-card p {
    margin: 0; font-size: 14px; line-height: 1.5; letter-spacing: .02em;
    color: var(--ink-gray-7, #525252);
  }
}
</style>
