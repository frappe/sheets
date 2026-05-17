<template>
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
