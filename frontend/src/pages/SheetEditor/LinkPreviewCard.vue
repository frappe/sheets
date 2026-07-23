<template>
	<div
		v-if="open"
		class="sn-lp-card"
		:style="style"
		@mouseenter="$emit('enter')"
		@mouseleave="$emit('leave')"
		@mousedown.stop
		@click.stop
	>
		<div class="sn-lp-main">
			<span class="sn-lp-favicon">
				<img
					v-if="preview.favicon && !faviconFailed"
					:src="preview.favicon"
					alt=""
					width="20"
					height="20"
					@error="faviconFailed = true"
				/>
				<svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none"
				     stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
					<circle cx="12" cy="12" r="9" />
					<path d="M3.5 12h17M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
				</svg>
			</span>

			<div class="sn-lp-text">
				<a
					class="sn-lp-title"
					:href="url"
					target="_blank"
					rel="noopener noreferrer"
					:title="url"
					@click.prevent="$emit('open')"
				>{{ titleText }}</a>
				<div class="sn-lp-host">{{ hostText }}</div>
			</div>

			<div class="sn-lp-actions">
				<Button variant="ghost" size="sm" :icon="copied ? 'lucide-check' : 'lucide-copy'"
				        :tooltip="copied ? 'Copied' : 'Copy link'" @click="copyUrl" />
				<Button v-if="canEdit" variant="ghost" size="sm" icon="lucide-pencil"
				        tooltip="Edit link" @click="$emit('edit')" />
				<Button v-if="canEdit" variant="ghost" size="sm" icon="lucide-unlink"
				        tooltip="Remove link" @click="$emit('unlink')" />
			</div>
		</div>

		<div v-if="preview.description" class="sn-lp-desc">{{ preview.description }}</div>

		<div v-if="showReplaceOffer" class="sn-lp-replace">
			<span class="sn-lp-replace-label">Replace URL with its title?</span>
			<button class="sn-lp-replace-yes" @click="$emit('replace')">Yes</button>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'

const props = defineProps({
	open:    { type: Boolean, default: false },
	anchor:  { type: Object,  default: null },   // { x, y } canvas-local px
	url:     { type: String,  default: '' },
	// { loading, error, title, description, favicon, host }
	preview: { type: Object,  default: () => ({}) },
	canEdit: { type: Boolean, default: false },
	// True when the cell's text is just the raw URL — the replace-with-title
	// offer only makes sense then.
	offerReplace: { type: Boolean, default: false },
})
defineEmits(['open', 'edit', 'unlink', 'replace', 'enter', 'leave'])

const copied        = ref(false)
const faviconFailed = ref(false)

watch(() => props.url, () => { copied.value = false; faviconFailed.value = false })

const titleText = computed(() => {
	if (props.preview.title) return props.preview.title
	if (props.preview.loading) return props.url
	return props.url
})

const hostText = computed(() => {
	if (props.preview.loading) return 'Loading preview…'
	if (props.preview.host) return props.preview.host
	// mailto: / unreachable pages — show the bare target, minus the scheme.
	return props.url.replace(/^(https?:\/\/|mailto:)/i, '')
})

const showReplaceOffer = computed(() =>
	props.offerReplace && props.canEdit && !!props.preview.title && !props.preview.loading)

function copyUrl() {
	navigator.clipboard?.writeText(props.url).catch(() => {})
	copied.value = true
	setTimeout(() => { copied.value = false }, 1500)
}

const style = computed(() => {
	if (!props.anchor) return { display: 'none' }
	return { left: `${props.anchor.x}px`, top: `${props.anchor.y}px` }
})
</script>

<style scoped>
.sn-lp-card {
	position: absolute;
	width: 340px;
	background: var(--surface-white, #ffffff);
	border: 1px solid var(--outline-gray-2, #e5e5e5);
	border-radius: 10px;
	box-shadow: 0 6px 20px -6px rgba(0, 0, 0, 0.16);
	z-index: 40;
	overflow: hidden;
	animation: sn-lp-rise 120ms ease-out;
	transform-origin: top left;
}
@keyframes sn-lp-rise {
	from { transform: translateY(-4px) scale(0.98); opacity: 0; }
	to   { transform: translateY(0)    scale(1);    opacity: 1; }
}

.sn-lp-main {
	display: flex; align-items: center; gap: 10px;
	padding: 10px 10px 8px 12px;
}
.sn-lp-favicon {
	width: 28px; height: 28px; flex-shrink: 0;
	display: inline-flex; align-items: center; justify-content: center;
	border-radius: 6px;
	background: var(--surface-gray-2, #f5f5f5);
	color: var(--ink-gray-6, #595959);
}
.sn-lp-favicon img { border-radius: 3px; }

.sn-lp-text { flex: 1; min-width: 0; }
.sn-lp-title {
	display: block;
	font-size: 13px; font-weight: 500; line-height: 18px;
	color: #007be0;   /* matches the canvas painter's hyperlink blue */
	text-decoration: none;
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sn-lp-title:hover { text-decoration: underline; }
.sn-lp-host {
	font-size: 12px; line-height: 16px;
	color: var(--ink-gray-5, #737373);
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sn-lp-actions { display: flex; gap: 2px; flex-shrink: 0; }

.sn-lp-desc {
	padding: 0 12px 10px;
	font-size: 12px; line-height: 17px;
	color: var(--ink-gray-6, #595959);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.sn-lp-replace {
	display: flex; align-items: center; justify-content: space-between; gap: 8px;
	padding: 8px 12px;
	background: #007be0;
	color: #ffffff;
	font-size: 12.5px;
}
.sn-lp-replace-yes {
	flex-shrink: 0;
	padding: 3px 14px;
	border: 1px solid rgba(255, 255, 255, 0.7);
	border-radius: 999px;
	background: transparent;
	color: #ffffff;
	font: inherit; font-weight: 500;
	cursor: pointer;
}
.sn-lp-replace-yes:hover { background: rgba(255, 255, 255, 0.12); }
</style>
