<template>
  <!-- Mobile / narrow-tablet blocker. The canvas grid has no touch support
       today, so we hide the entire app behind this overlay below 720px and
       ask the user to come back from desktop. The underlying components
       still mount so state is preserved when the user rotates back. -->
  <div class="sn-mobile-blocker">
    <div class="sn-mobile-card">
      <svg width="56" height="56" viewBox="0 0 256 256" fill="none">
        <rect width="256" height="256" rx="60" fill="#0E7490"/>
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
      <h2>Open on desktop</h2>
      <p>Frappe Sheets is built for desktop browsers — mobile and tablet
         support is on the roadmap. Please come back from a laptop or PC.</p>
    </div>
  </div>

  <Home v-if="!currentId" @open="openSheet" @new="newSheet" />
  <SheetEditor v-else :id="currentId" @close="goHome" @saved="onSaved" />
  <Dialogs />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Home        from './pages/Home.vue'
import SheetEditor from './pages/SheetEditor/index.vue'

const currentId = ref(null)

onMounted(() => {
  const id = new URLSearchParams(location.search).get('id')
  if (id) currentId.value = id

  window.addEventListener('popstate', () => {
    currentId.value = new URLSearchParams(location.search).get('id') ?? null
  })
})

function openSheet(id) { currentId.value = id;   history.pushState({}, '', `?id=${id}`) }
function newSheet()     { currentId.value = 'new'; history.pushState({}, '', '?id=new') }
function goHome()       { currentId.value = null;  history.pushState({}, '', location.pathname) }
function onSaved(name)  { currentId.value = name;  history.replaceState({}, '', `?id=${name}`) }
</script>

<style>
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
