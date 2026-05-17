<template>
  <div class="sn-root">

    <!-- Bar 1 · Identity -->
    <div class="sn-topbar">
      <div class="sn-topbar-left">
        <!-- Brand mark doubles as the "back to home" action. Clicking it runs
             flushAndClose so any pending edits are saved before navigation. -->
        <button class="sn-app-icon-btn" type="button" aria-label="Back to home" title="Back to home" @click="flushAndClose">
          <svg class="sn-app-icon" width="28" height="28" viewBox="0 0 256 256" fill="none" aria-hidden="true">
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
        </button>
        <input
          class="sn-title-input"
          v-model="currentTitle"
          :style="{ width: titleInputWidth }"
          placeholder="Untitled Spreadsheet"
          spellcheck="false"
          @blur="onTitleBlur"
        />
        <!-- Save status: only shown for new unsaved docs or on error -->
        <Badge v-if="props.id === 'new' && isDirty" theme="orange" variant="subtle" size="sm" label="Unsaved" />
        <Badge v-else-if="isSaving"                 theme="gray"   variant="subtle" size="sm" label="Saving…" />
        <Badge v-else-if="justSaved"                theme="green"  variant="subtle" size="sm" label="Saved" />
        <Badge v-if="saveError" theme="red" variant="subtle" size="sm" :label="saveError" :tooltip="saveError" />
      </div>
      <div class="sn-topbar-right">
        <Button variant="ghost" size="sm" icon="help-circle" tooltip="Keyboard shortcuts (?)" @click="showShortcutsHelp = true" />
        <Avatar :label="userInitial" size="md" :tooltip="userEmail" />
      </div>
    </div>

    <!-- Bar 2 · Formula bar -->
    <div class="sn-formula-bar">
      <span class="sn-cell-ref">{{ activeCell }}</span>
      <div class="sn-formula-wrap">
        <input
          ref="formulaInputRef"
          class="sn-formula-input"
          :value="formulaValue"
          @input="onFormulaInput"
          @keydown="onFormulaKey"
          @blur="closeAc"
          placeholder="Enter value or formula"
          spellcheck="false"
          autocomplete="off"
        />
        <div v-if="acVisible" class="sn-ac-list">
          <div
            v-for="(fn, i) in acItems"
            :key="fn"
            class="sn-ac-item"
            :class="{ active: i === acIdx }"
            @mousedown.prevent="commitAc(fn)"
          >
            <span class="sn-ac-name">{{ fn }}</span>
            <span class="sn-ac-sig">{{ AC_FUNS[fn] }}</span>
          </div>
        </div>
      </div>
      <div class="sn-fbar-actions">
        <Dropdown :options="csvDropdownOptions" placement="right">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'outline'" size="sm" iconLeft="file-text" iconRight="chevron-down" label="CSV" tooltip="Import / export CSV" />
          </template>
        </Dropdown>
        <input ref="csvInputRef" type="file" accept=".csv" style="display:none" @change="importCSV" />
        <!-- For new/unsaved docs show Save button; existing docs auto-save -->
        <Button v-if="props.id === 'new'" variant="solid" size="sm" :loading="isSaving" @click="onSave">Save</Button>
      </div>
    </div>

    <!-- Bar 3 · Formatting toolbar -->
    <div class="sn-toolbar">
      <FormControl
        type="select"
        size="sm"
        :model-value="activeNumberFormatType"
        :options="NUMBER_FORMAT_OPTIONS"
        @update:model-value="onNumberFormatChange"
      />
      <div class="sn-tool-extra">
        <Button variant="ghost" size="sm" icon="lucide-trending-down" tooltip="Decrease decimal places" @click="adjustDecimals(-1)" />
        <Button variant="ghost" size="sm" icon="lucide-trending-up"   tooltip="Increase decimal places" @click="adjustDecimals(+1)" />
        <div class="sn-vr" />

        <Dropdown :options="fontFamilyDropdownOptions" placement="left" class="sn-font-family">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconRight="chevron-down" :label="activeFontFamilyLabel" tooltip="Font family" />
          </template>
        </Dropdown>
        <FormControl
          type="number"
          size="sm"
          class="sn-font-size-input"
          :model-value="activeFormat.fontSize || 13"
          :min="8"
          :max="72"
          @change="onFontSizeInput"
          @keydown.enter="onFontSizeInput"
        />
        <div class="sn-vr" />
      </div>

      <Button :variant="activeFormat.bold          ? 'subtle' : 'ghost'" size="sm" icon="bold"           tooltip="Bold (Ctrl+B)"               @click="toggleFmt('bold')" />
      <Button :variant="activeFormat.italic        ? 'subtle' : 'ghost'" size="sm" icon="italic"         tooltip="Italic (Ctrl+I)"             @click="toggleFmt('italic')" />
      <Button :variant="activeFormat.underline     ? 'subtle' : 'ghost'" size="sm" icon="underline"      tooltip="Underline (Ctrl+U)"          @click="toggleFmt('underline')" />
      <div class="sn-tool-extra">
        <Button :variant="activeFormat.strikethrough ? 'subtle' : 'ghost'" size="sm" icon="lucide-strikethrough" tooltip="Strikethrough (Ctrl+Shift+X)" @click="toggleFmt('strikethrough')" />
      </div>
      <div class="sn-vr" />

      <Button :variant="activeFormat.align === 'left'   ? 'subtle' : 'ghost'" size="sm" icon="align-left"   tooltip="Align left"   @click="setAlign('left')" />
      <Button :variant="activeFormat.align === 'center' ? 'subtle' : 'ghost'" size="sm" icon="align-center" tooltip="Align center" @click="setAlign('center')" />
      <Button :variant="activeFormat.align === 'right'  ? 'subtle' : 'ghost'" size="sm" icon="align-right"  tooltip="Align right"  @click="setAlign('right')" />
      <div class="sn-vr" />

      <div class="sn-tool-extra">
        <Button :variant="activeFormat.valign === 'top'                                            ? 'subtle' : 'ghost'" size="sm" icon="lucide-align-start-horizontal"  tooltip="Align top"    @click="setValign('top')" />
        <Button :variant="(activeFormat.valign === 'middle' || activeFormat.valign === undefined) ? 'subtle' : 'ghost'" size="sm" icon="lucide-align-center-horizontal" tooltip="Align middle" @click="setValign('middle')" />
        <Button :variant="activeFormat.valign === 'bottom'                                         ? 'subtle' : 'ghost'" size="sm" icon="lucide-align-end-horizontal"    tooltip="Align bottom" @click="setValign('bottom')" />
        <div class="sn-vr" />
      </div>

      <label class="sn-swatch-btn" title="Text colour">
        <FeatherIcon name="type" class="sn-swatch-glyph" />
        <span class="sn-swatch-underline" :style="{ background: activeFormat.color || '#171717' }"></span>
        <input type="color" :value="activeFormat.color || '#171717'" @input="setColor('color', $event.target.value)" />
      </label>
      <label class="sn-swatch-btn" title="Fill colour">
        <FeatherIcon name="droplet" class="sn-swatch-glyph" />
        <span class="sn-swatch-underline sn-swatch-fill" :style="{ background: activeFormat.backgroundColor || '#ffffff' }"></span>
        <input type="color" :value="activeFormat.backgroundColor || '#ffffff'" @input="setColor('backgroundColor', $event.target.value)" />
      </label>
      <div class="sn-vr" />

      <Button variant="ghost" size="sm" icon="corner-up-left"  tooltip="Undo (Ctrl+Z)" :disabled="!canUndo" @click="undo" />
      <Button variant="ghost" size="sm" icon="corner-up-right" tooltip="Redo (Ctrl+Y)" :disabled="!canRedo" @click="redo" />
      <div class="sn-vr" />

      <div class="sn-tool-extra">
        <Button variant="ghost" size="sm" icon="lucide-eraser" tooltip="Clear formatting" @click="clearFormatting" />
        <div class="sn-vr" />

        <Button :variant="showSortFilter        ? 'subtle' : 'ghost'" size="sm" iconLeft="filter"            label="Filter" tooltip="Toggle filter row" @click="showSortFilter = !showSortFilter" />
        <div class="sn-vr" />
        <Button :variant="activeFormat.wrapText ? 'subtle' : 'ghost'" size="sm" iconLeft="corner-down-left" label="Wrap"   tooltip="Wrap text"         @click="toggleFmt('wrapText')" />
        <div class="sn-vr" />

        <!-- Borders dropdown -->
        <Dropdown :options="borderDropdownOptions" placement="left">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconLeft="grid" label="Borders" tooltip="Cell borders" />
          </template>
        </Dropdown>

        <!-- Merge button -->
        <Button variant="ghost" size="sm" iconLeft="maximize-2" label="Merge" tooltip="Merge / unmerge cells" @click="toggleMerge" />
      </div>

      <!-- Overflow "more" dropdown — surfaces extras when toolbar is collapsed at narrow widths -->
      <div class="sn-tool-more">
        <Dropdown :options="moreToolbarOptions" placement="left">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconLeft="more-horizontal" tooltip="More" />
          </template>
        </Dropdown>
      </div>
    </div>

    <!-- Canvas grid + filter overlay -->
    <div ref="gridWrapRef" class="sn-grid-wrap">
      <canvas ref="canvasRef" />

      <!-- Filter chevrons on row 0 (the user's header row of data) -->
      <div v-if="showSortFilter" class="sn-filter-overlay">
        <button
          v-for="col in visibleFilterCols"
          :key="col.col"
          class="sn-filter-btn"
          :class="{ active: filterConfig[col.col] }"
          :style="col.style"
          @click="openFilterPanel(col.col, $event)"
        >
          <FeatherIcon name="chevron-down" class="sn-filter-btn-icon" />
        </button>
      </div>

      <!-- Inline filter panel -->
      <div v-if="filterPanel.open" class="sn-filter-panel" :style="filterPanel.style">
        <div class="sn-fp-title">Column {{ colLabel(filterPanel.col) }}</div>
        <div class="sn-fp-row">
          <Button class="sn-fp-grow" size="sm" iconLeft="arrow-up"   label="A → Z" tooltip="Sort ascending"  @click="doSort(filterPanel.col, 'asc')" />
          <Button class="sn-fp-grow" size="sm" iconLeft="arrow-down" label="Z → A" tooltip="Sort descending" @click="doSort(filterPanel.col, 'desc')" />
        </div>
        <FormControl
          type="select"
          size="sm"
          v-model="filterPanel.operator"
          :options="FILTER_OPERATOR_OPTIONS"
        />
        <FormControl
          v-if="!['empty','notempty'].includes(filterPanel.operator)"
          type="text"
          size="sm"
          v-model="filterPanel.value"
          placeholder="Value"
          @keydown.enter="applyFilter"
        />
        <div class="sn-fp-actions">
          <Button class="sn-fp-grow" variant="solid" size="sm" label="Apply" @click="applyFilter" />
          <Button class="sn-fp-grow"                 size="sm" label="Clear" @click="clearFilterCol" />
          <Button class="sn-fp-grow"                 size="sm" label="Close" @click="filterPanel.open = false" />
        </div>
      </div>
    </div>

    <!-- Add-more-rows strip — only when the user has scrolled near the bottom -->
    <div v-if="showAddRows" class="sn-addrows">
      <span class="sn-addrows-label">Add</span>
      <input class="sn-addrows-input" type="number" min="1" max="10000" v-model.number="addRowsCount" />
      <span class="sn-addrows-label">more rows at the bottom</span>
      <Button variant="subtle" size="sm" iconLeft="plus" label="Add" @click="doAddMoreRows" />
    </div>

    <!-- Bottom · sheet tabs + selection stats -->
    <div class="sn-bottom">
      <div class="sn-tabs">
        <div
          v-for="name in sheetNames"
          :key="name"
          class="sn-tab-wrap"
          :class="{ 'sn-tab-drag-over': tabDragOver === name && tabDragName !== name }"
          draggable="true"
          @dragstart="onTabDragStart($event, name)"
          @dragend="onTabDragEnd"
          @dragover.prevent="onTabDragOver($event, name)"
          @drop.prevent="onTabDrop($event, name)"
        >
          <Button
            :variant="name === currentSheet ? 'subtle' : 'ghost'"
            size="sm"
            :label="name"
            @click="switchSheet(name)"
            @contextmenu.prevent="openTabMenu($event, name)"
            @dblclick="openRenameDialog(name)"
          />
        </div>
        <Button variant="ghost" size="sm" icon="plus" tooltip="Add sheet" @click="addSheet" />
      </div>
      <div v-if="selectionStats" class="sn-stats">
        <span v-if="selectionStats.count > 0">Count: {{ selectionStats.count }}</span>
        <span v-if="selectionStats.sum !== null">Sum: {{ formatStat(selectionStats.sum) }}</span>
        <span v-if="selectionStats.avg !== null">Avg: {{ formatStat(selectionStats.avg) }}</span>
      </div>
    </div>

    <!-- Sheet-tab context menu (rename / duplicate / delete) -->
    <div v-if="tabMenu.open" class="sn-ctx-menu" :style="{ left: tabMenu.x + 'px', top: tabMenu.y + 'px' }">
      <Button variant="ghost" size="sm" iconLeft="edit-2"  label="Rename"    @click="openRenameDialog(tabMenu.name)" />
      <Button variant="ghost" size="sm" iconLeft="copy"    label="Duplicate" @click="doDuplicateSheet(tabMenu.name)" />
      <Button
        variant="ghost"
        size="sm"
        iconLeft="trash-2"
        label="Delete"
        :disabled="sheetNames.length <= 1"
        @click="doDeleteSheet(tabMenu.name)"
      />
    </div>

    <!-- Rename sheet dialog -->
    <Dialog v-model="showRenameDialog" :options="{ title: 'Rename sheet', size: 'sm' }">
      <template #body-content>
        <FormControl v-model="renameValue" label="New name" placeholder="Sheet name" @keydown.enter="confirmRename" />
        <p v-if="renameError" class="sn-rename-err">{{ renameError }}</p>
      </template>
      <template #actions>
        <Button variant="solid" @click="confirmRename">Rename</Button>
        <Button @click="showRenameDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Right-click context menu (cursor-anchored; uses Frappe UI Buttons internally) -->
    <div v-if="contextMenu.open" class="sn-ctx-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">

      <!-- Column-header menu -->
      <template v-if="contextMenu.mode === 'colHeader'">
        <Button variant="ghost" size="sm" iconLeft="arrow-left"  label="Insert column left"  @click="doInsertCol(false)" />
        <Button variant="ghost" size="sm" iconLeft="arrow-right" label="Insert column right" @click="doInsertCol(true)" />
        <Button variant="ghost" size="sm" iconLeft="plus"        label="Insert N columns…"   @click="openInsertMany('col', false)" />
        <Button variant="ghost" size="sm" iconLeft="trash-2"     label="Delete column"       @click="doDeleteCol()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="maximize-2"  label="Auto-fit width"      @click="doAutoFitCol()" />
        <Button variant="ghost" size="sm" iconLeft="eye-off"     label="Hide column"         @click="doHideCols()" />
        <Button v-if="manualHiddenCols.size > 0" variant="ghost" size="sm" iconLeft="eye" label="Unhide all columns" @click="doUnhideAllCols()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="lock"        label="Freeze up to this column" @click="doFreezeCol()" />
        <Button v-if="freezeCols > 0" variant="ghost" size="sm" iconLeft="unlock" label="Unfreeze columns" @click="doUnfreezeCols()" />
      </template>

      <!-- Row-header menu -->
      <template v-else-if="contextMenu.mode === 'rowHeader'">
        <Button variant="ghost" size="sm" iconLeft="arrow-up"    label="Insert row above" @click="doInsertRow(false)" />
        <Button variant="ghost" size="sm" iconLeft="arrow-down"  label="Insert row below" @click="doInsertRow(true)" />
        <Button variant="ghost" size="sm" iconLeft="plus"        label="Insert N rows…"   @click="openInsertMany('row', false)" />
        <Button variant="ghost" size="sm" iconLeft="trash-2"     label="Delete row"       @click="doDeleteRow()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="maximize-2"  label="Auto-fit height"  @click="doAutoFitRow()" />
        <Button variant="ghost" size="sm" iconLeft="eye-off"     label="Hide row"         @click="doHideRows()" />
        <Button v-if="manualHiddenRows.size > 0" variant="ghost" size="sm" iconLeft="eye" label="Unhide all rows" @click="doUnhideAllRows()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="lock"        label="Freeze up to this row" @click="doFreezeRow()" />
        <Button v-if="freezeRows > 0" variant="ghost" size="sm" iconLeft="unlock" label="Unfreeze rows" @click="doUnfreezeRows()" />
      </template>

      <!-- Cell menu (default) -->
      <template v-else>
        <Button v-if="clipboardHas" variant="ghost" size="sm" iconLeft="clipboard" label="Paste values only"  @click="doPasteSpecial('values')" />
        <Button v-if="clipboardHas" variant="ghost" size="sm" iconLeft="clipboard" label="Paste formats only" @click="doPasteSpecial('formats')" />
        <Button v-if="clipboardHas" variant="ghost" size="sm" iconLeft="clipboard" label="Paste formulas only" @click="doPasteSpecial('formulas')" />
        <hr v-if="clipboardHas" class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="arrow-up"    label="Insert row above"     @click="doInsertRow(false)" />
        <Button variant="ghost" size="sm" iconLeft="arrow-down"  label="Insert row below"     @click="doInsertRow(true)" />
        <Button variant="ghost" size="sm" iconLeft="trash-2"     label="Delete row"           @click="doDeleteRow()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="arrow-left"  label="Insert column left"   @click="doInsertCol(false)" />
        <Button variant="ghost" size="sm" iconLeft="arrow-right" label="Insert column right"  @click="doInsertCol(true)" />
        <Button variant="ghost" size="sm" iconLeft="trash-2"     label="Delete column"        @click="doDeleteCol()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="lock"        label="Freeze rows to here"  @click="doFreezeRow()" />
        <Button v-if="freezeRows > 0" variant="ghost" size="sm" iconLeft="unlock" label="Unfreeze rows" @click="doUnfreezeRows()" />
        <Button variant="ghost" size="sm" iconLeft="lock"        label="Freeze cols to here"  @click="doFreezeCol()" />
        <Button v-if="freezeCols > 0" variant="ghost" size="sm" iconLeft="unlock" label="Unfreeze cols" @click="doUnfreezeCols()" />
      </template>

    </div>

    <!-- Save-as dialog -->
    <Dialog v-model="showSaveDialog" :options="{ title: 'Save Spreadsheet', size: 'sm' }">
      <template #body-content>
        <FormControl v-model="saveTitle" label="Title" placeholder="Untitled Spreadsheet" @keydown.enter="confirmSave" />
      </template>
      <template #actions>
        <Button variant="solid" :loading="isSaving" @click="confirmSave">Save</Button>
        <Button @click="showSaveDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Find & Replace panel -->
    <FindReplace
      v-if="showFindReplace"
      :sheet="sheet"
      :grid="grid"
      @close="showFindReplace = false"
      @navigate-to="onNavigateTo"
    />

    <!-- Cmd+K command palette -->
    <CommandPalette
      v-model:show="showCmdPalette"
      v-model:searchQuery="cmdQuery"
      :groups="cmdGroups"
      @select="onCmdSelect"
    />

    <!-- Hyperlink dialog (Ctrl+L) — stores fmt.hyperlink on the active cell -->
    <Dialog v-model="showHyperlinkDialog" :options="{ title: 'Insert hyperlink', size: 'sm' }">
      <template #body-content>
        <FormControl v-model="hyperlinkText" label="Display text" placeholder="Click here" />
        <FormControl v-model="hyperlinkUrl"  label="Link URL"      placeholder="https://example.com" class="sn-hl-url" @keydown.enter="confirmHyperlink" />
      </template>
      <template #actions>
        <Button v-if="hasActiveHyperlink" theme="red" @click="removeHyperlink">Remove</Button>
        <Button variant="solid" @click="confirmHyperlink">Apply</Button>
        <Button @click="showHyperlinkDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Insert N rows / columns dialog -->
    <Dialog v-model="showInsertManyDialog" :options="{ title: insertMany.kind === 'row' ? 'Insert rows' : 'Insert columns', size: 'sm' }">
      <template #body-content>
        <FormControl
          v-model.number="insertMany.count"
          type="number"
          :min="1"
          :max="1000"
          :label="insertMany.kind === 'row' ? 'Number of rows' : 'Number of columns'"
          @keydown.enter="confirmInsertMany"
        />
      </template>
      <template #actions>
        <Button variant="solid" @click="confirmInsertMany">Insert</Button>
        <Button @click="showInsertManyDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Keyboard shortcut help (?) — uses Frappe UI's KeyboardShortcut for the
         key chips so modifiers render as proper Mac glyphs and look native. -->
    <Dialog v-model="showShortcutsHelp" :options="{ title: 'Keyboard shortcuts', size: 'xl' }">
      <template #body-content>
        <div class="sn-help-grid">
          <div v-for="g in SHORTCUT_GROUPS" :key="g.title" class="sn-help-group">
            <div class="sn-help-title">{{ g.title }}</div>
            <div v-for="s in g.items" :key="s.label" class="sn-help-row">
              <span class="sn-help-label">{{ s.label }}</span>
              <span class="sn-help-keys">
                <template v-for="(combo, i) in s.combos" :key="combo">
                  <KeyboardShortcut :combo="combo" />
                  <span v-if="i < s.combos.length - 1" class="sn-help-or">or</span>
                </template>
              </span>
            </div>
          </div>
        </div>
      </template>
    </Dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createGrid }          from '../../canvas/index.js'
import { colLabel, parseCellId } from '../../utils/cells.js'
import { createSheet }         from '../../engine/sheet.js'
import { createHistory }       from '../../engine/history.js'
import { createFormatsEngine } from '../../engine/formats.js'
import { createMergeEngine }   from '../../engine/merge.js'
import { createClipboard }     from '../../engine/clipboard.js'
import { createSortFilter }    from '../../engine/sortFilter.js'
import { useToolbar }          from './useToolbar.js'
import { usePersistence }      from './usePersistence.js'
import { useSheetTabs }        from './useSheetTabs.js'
import FindReplace             from './FindReplace.vue'
import { CommandPaletteItem, KeyboardShortcut } from 'frappe-ui'

const props = defineProps({ id: { type: String, default: 'new' } })
const emit  = defineEmits(['close', 'saved'])

// ── Engine instances ──────────────────────────────────────────────────────────

const sheet = createSheet({
  onCellChanged(id, displayValue) {
    if (showFormulas.value) {
      grid?.setCell(id, String(sheet.getCell(id) ?? ''))
      return
    }
    const fmt = formats.get(id, sheet.getCurrentSheet())
    const displayed = fmt.numberFormat ? applyNumberFmt(displayValue, fmt.numberFormat) : displayValue
    grid?.setCell(id, displayed)
  },
})
const formats   = createFormatsEngine()
const merge     = createMergeEngine()
const history   = createHistory({
  snapshot: () => ({ sheet: sheet.snapshot(), formats: formats.snapshot(), merge: merge.snapshot() }),
  restore(snap) {
    formats.restore(snap.formats)
    sheet.restore(snap.sheet)
    if (snap.merge) merge.restore(snap.merge)
    // Caller (undo/redo) repopulates the canvas — no render here
  },
})
const clipboard  = createClipboard({ sheet, formats })
const sortFilter = createSortFilter(sheet)

// ── Vue state ─────────────────────────────────────────────────────────────────

const canvasRef       = ref(null)
const gridWrapRef     = ref(null)
const formulaInputRef = ref(null)
const csvInputRef     = ref(null)

const activeCell        = ref('A1')
const formulaValue      = ref('')
const canUndo           = ref(false)
const canRedo           = ref(false)
const currentTitle      = ref('Untitled Spreadsheet')
const activeNumberFormat = ref('')
// Dropdown reflects the *type* only ('number' / 'currency' / ...), so a stored
// `number:3` still shows "Number" as selected.
const activeNumberFormatType = computed(() => parseNumberFmt(activeNumberFormat.value).type)
const showFindReplace   = ref(false)
const showShortcutsHelp = ref(false)
const showInsertManyDialog = ref(false)
const insertMany           = reactive({ kind: 'row', count: 5, below: false })
const showHyperlinkDialog  = ref(false)
const hyperlinkText        = ref('')
const hyperlinkUrl         = ref('')
const hasActiveHyperlink   = computed(() => !!activeFormat.value?.hyperlink)
const showFormulas      = ref(false)

// Each row's `combos` is an array of KeyboardShortcut-compatible strings —
// the dialog renders them as `<KeyboardShortcut :combo="…"/>` chips joined
// by a small "or" separator when there's more than one.
const SHORTCUT_GROUPS = [
  { title: 'Navigation', items: [
    { label: 'Move selection',            combos: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'] },
    { label: 'Jump to data-region edge',  combos: ['Mod+ArrowLeft'] },
    { label: 'Extend selection',          combos: ['Shift+ArrowRight'] },
    { label: 'Jump to start / end',       combos: ['Mod+Home', 'Mod+End'] },
  ]},
  { title: 'Editing', items: [
    { label: 'Edit cell',                 combos: ['F2'] },
    { label: 'Clear cell',                combos: ['Delete', 'Backspace'] },
    { label: 'Commit + move down',        combos: ['Enter'] },
    { label: 'Commit + move right',       combos: ['Tab'] },
    { label: 'Cancel edit',               combos: ['Escape'] },
    { label: 'Fill down / right',         combos: ['Mod+D', 'Mod+R'] },
    { label: 'Cut / Copy / Paste',        combos: ['Mod+X', 'Mod+C', 'Mod+V'] },
    { label: 'Undo / Redo',               combos: ['Mod+Z', 'Mod+Y'] },
    { label: 'Repeat last action',        combos: ['F4'] },
  ]},
  { title: 'Formatting', items: [
    { label: 'Bold',                      combos: ['Mod+B'] },
    { label: 'Italic',                    combos: ['Mod+I'] },
    { label: 'Underline',                 combos: ['Mod+U'] },
    { label: 'Strikethrough',             combos: ['Mod+Shift+X'] },
  ]},
  { title: 'View / Tools', items: [
    { label: 'Command palette',           combos: ['Mod+K'] },
    { label: 'Find & replace',            combos: ['Mod+F'] },
    { label: 'Save',                      combos: ['Mod+S'] },
    { label: 'Show formulas',             combos: ['Mod+`'] },
    { label: 'Insert hyperlink',          combos: ['Mod+L'] },
    { label: 'Quick filter on column',    combos: ['Alt+ArrowDown'] },
    { label: 'Zoom in / out / reset',     combos: ['Mod+=', 'Mod+-', 'Mod+0'] },
    { label: 'Shortcut help',             combos: ['?'] },
  ]},
]
const showSortFilter    = ref(false)
const selectionStats    = ref(null)
const isDirty           = ref(false)
const borderColor       = ref('#000000')
const borderStyle       = ref('thin')
const freezeRows        = ref(0)
const freezeCols        = ref(0)
const justSaved         = ref(false)

// Short keys keep the select narrow; the full CSS stack lives in FONT_FAMILY_STACK
// so the persisted format value is still a complete font-family string.
const FONT_FAMILY_OPTIONS = [
  { label: 'Inter',  value: 'inter' },
  { label: 'Serif',  value: 'serif' },
  { label: 'Mono',   value: 'mono' },
  { label: 'System', value: 'system' },
]
const FONT_FAMILY_STACK = {
  inter:  'InterVar, Inter, ui-sans-serif, system-ui, sans-serif',
  serif:  'ui-serif, Georgia, "Times New Roman", serif',
  mono:   'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
}
// `activeFontFamilyKey` is defined further down — after the useToolbar() call
// that creates `activeFormat`. See "Composables" block.

const NUMBER_FORMAT_OPTIONS = [
  { label: 'General',    value: '' },
  { label: 'Number',     value: 'number' },
  { label: 'Currency',   value: 'currency' },
  { label: 'Percentage', value: 'percentage' },
  { label: 'Date',       value: 'date' },
  { label: 'Text',       value: 'text' },
]

const BORDER_STYLE_OPTIONS = [
  { label: 'Thin',   value: 'thin' },
  { label: 'Medium', value: 'medium' },
  { label: 'Thick',  value: 'thick' },
]

const FILTER_OPERATOR_OPTIONS = [
  { label: 'Contains',     value: 'contains' },
  { label: 'Equals',       value: 'equals' },
  { label: 'Greater than', value: 'gt' },
  { label: 'Less than',    value: 'lt' },
  { label: 'Is empty',     value: 'empty' },
  { label: 'Is not empty', value: 'notempty' },
]

const csvDropdownOptions = [
  { label: 'Export CSV', icon: 'download', onClick: () => exportCSV() },
  { label: 'Import CSV', icon: 'upload',   onClick: () => triggerImport() },
]

const borderDropdownOptions = computed(() => [
  { group: 'Apply to selection', items: [
    { label: 'All borders',     icon: 'grid',         onClick: () => applyBorder('all') },
    { label: 'Outside borders', icon: 'square',       onClick: () => applyBorder('outside') },
    { label: 'Inner borders',   icon: 'plus',         onClick: () => applyBorder('inner') },
  ]},
  { group: 'Single side', items: [
    { label: 'Top border',    icon: 'arrow-up',    onClick: () => applyBorder('top') },
    { label: 'Bottom border', icon: 'arrow-down',  onClick: () => applyBorder('bottom') },
    { label: 'Left border',   icon: 'arrow-left',  onClick: () => applyBorder('left') },
    { label: 'Right border',  icon: 'arrow-right', onClick: () => applyBorder('right') },
  ]},
  { group: 'Remove', items: [
    { label: 'No border', icon: 'x-square', theme: 'red', onClick: () => applyBorder('none') },
  ]},
])

// Mirrors the .sn-tool-extra buttons. Surfaced via the "More" overflow dropdown
// when the toolbar is collapsed at narrow widths.
const moreToolbarOptions = computed(() => [
  { group: 'Numbers', items: [
    { label: 'Decrease decimal places', icon: 'minus', onClick: () => adjustDecimals(-1) },
    { label: 'Increase decimal places', icon: 'plus',  onClick: () => adjustDecimals(+1) },
  ]},
  { group: 'Text', items: [
    { label: 'Strikethrough', icon: 'minus',           onClick: () => toggleFmt('strikethrough') },
    { label: 'Wrap text',     icon: 'corner-down-left', onClick: () => toggleFmt('wrapText') },
    { label: 'Align top',     icon: 'chevron-up',      onClick: () => setValign('top') },
    { label: 'Align middle',  icon: 'minus',           onClick: () => setValign('middle') },
    { label: 'Align bottom',  icon: 'chevron-down',    onClick: () => setValign('bottom') },
    { label: 'Clear formatting', icon: 'x-circle',     onClick: () => clearFormatting() },
  ]},
  { group: 'Cells', items: [
    { label: 'Merge / unmerge', icon: 'maximize-2', onClick: () => toggleMerge() },
    { label: 'Toggle filter',   icon: 'filter',     onClick: () => { showSortFilter.value = !showSortFilter.value } },
  ]},
  { group: 'Borders', items: [
    { label: 'All borders',     icon: 'grid',       onClick: () => applyBorder('all') },
    { label: 'Outside borders', icon: 'square',     onClick: () => applyBorder('outside') },
    { label: 'No border',       icon: 'x-square',   onClick: () => applyBorder('none') },
  ]},
  { group: 'View', items: [
    { label: 'Zoom in',     icon: 'zoom-in',  onClick: () => zoomBy(+0.1) },
    { label: 'Zoom out',    icon: 'zoom-out', onClick: () => zoomBy(-0.1) },
    { label: 'Reset zoom',  icon: 'minimize', onClick: () => resetZoom() },
  ]},
])

// Title input auto-sizes to content so there's no trailing whitespace
const titleInputWidth = computed(() => {
  const text = currentTitle.value || 'Untitled Spreadsheet'
  return Math.max(80, Math.min(320, text.length * 8.5 + 24)) + 'px'
})

const AC_FUNS = {
  ABS:'(number)', AND:'(logical1, ...)', AVERAGE:'(number1, ...)',
  AVERAGEIF:'(range, criteria, [avg_range])', CEILING:'(number, significance)',
  CHOOSE:'(index, value1, ...)', COLUMN:'([reference])', COLUMNS:'(array)',
  CONCAT:'(text1, ...)', CONCATENATE:'(text1, ...)',
  COUNT:'(value1, ...)', COUNTA:'(value1, ...)', COUNTBLANK:'(range)',
  COUNTIF:'(range, criteria)', COUNTIFS:'(range1, criteria1, ...)',
  DATE:'(year, month, day)', DAY:'(date)', EXP:'(number)',
  FALSE:'()', FIND:'(find_text, within_text, [start])',
  FLOOR:'(number, significance)', HLOOKUP:'(value, table, row, [range])',
  HOUR:'(time)', IF:'(test, value_if_true, [value_if_false])',
  IFERROR:'(value, value_if_error)', IFS:'(condition1, value1, ...)',
  INDEX:'(array, row, [col])', INDIRECT:'(ref_text)',
  INT:'(number)', ISBLANK:'(value)', ISERROR:'(value)',
  ISNUMBER:'(value)', ISTEXT:'(value)',
  LARGE:'(array, k)', LEFT:'(text, [num_chars])',
  LEN:'(text)', LN:'(number)', LOG:'(number, [base])',
  LOWER:'(text)', MATCH:'(value, array, [type])',
  MAX:'(number1, ...)', MID:'(text, start, num_chars)',
  MIN:'(number1, ...)', MINUTE:'(time)', MOD:'(number, divisor)',
  MONTH:'(date)', NOT:'(logical)', NOW:'()',
  OR:'(logical1, ...)', PI:'()', POWER:'(base, exponent)',
  PRODUCT:'(number1, ...)', PROPER:'(text)',
  RAND:'()', RANDBETWEEN:'(bottom, top)', RANK:'(number, ref, [order])',
  REPLACE:'(text, start, num_chars, new_text)', REPT:'(text, times)',
  RIGHT:'(text, [num_chars])', ROUND:'(number, digits)',
  ROUNDDOWN:'(number, digits)', ROUNDUP:'(number, digits)',
  ROW:'([reference])', ROWS:'(array)',
  SEARCH:'(find_text, within_text, [start])',
  SMALL:'(array, k)', SQRT:'(number)',
  SUBSTITUTE:'(text, old, new, [instance])',
  SUM:'(number1, ...)', SUMIF:'(range, criteria, [sum_range])',
  SUMIFS:'(sum_range, range1, criteria1, ...)',
  TEXT:'(value, format_text)', TEXTJOIN:'(delimiter, ignore_empty, text1, ...)',
  TIME:'(hour, minute, second)', TODAY:'()', TRIM:'(text)', TRUE:'()',
  UPPER:'(text)', VALUE:'(text)',
  VLOOKUP:'(value, table, col_index, [range_lookup])',
  WEEKDAY:'(date, [return_type])', YEAR:'(date)',
}
const acItems   = ref([])
const acIdx     = ref(0)
const acVisible = computed(() => acItems.value.length > 0)

const userEmail   = window.frappe?.session?.user || ''
const userInitial = computed(() => (userEmail ? userEmail[0] : 'U').toUpperCase())

const filterPanel = reactive({
  open: false, col: 0, operator: 'contains', value: '', style: {},
})

let grid = null
let ro   = null

function syncFlags() { canUndo.value = history.canUndo(); canRedo.value = history.canRedo() }

function selectionIds() {
  if (!grid) return [activeCell.value]
  const { r0, c0, r1, c1 } = grid.getSelection()
  const ids = []
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      ids.push(colLabel(c) + (r + 1))
  return ids
}

// ── Selection stats ───────────────────────────────────────────────────────────

function computeSelectionStats() {
  if (!grid) return
  const { r0, c0, r1, c1 } = grid.getSelection()
  if ((r1 - r0 + 1) * (c1 - c0 + 1) <= 1) { selectionStats.value = null; return }

  let count = 0, numCount = 0, sum = 0
  for (const [id, val] of Object.entries(sheet.getRawData())) {
    const p = parseCellId(id)
    if (!p || p.row < r0 || p.row > r1 || p.col < c0 || p.col > c1) continue
    if (val !== '' && val != null) count++
    const n = parseFloat(val)
    if (!isNaN(n)) { numCount++; sum += n }
  }
  selectionStats.value = (count === 0 && numCount === 0) ? null : {
    count,
    sum:  numCount > 0 ? sum : null,
    avg:  numCount > 0 ? sum / numCount : null,
  }
}

function formatStat(n) {
  return Number.isInteger(n) ? n.toLocaleString() : parseFloat(n.toFixed(4)).toLocaleString()
}

// ── Formula autocomplete ──────────────────────────────────────────────────────

function _acToken(value, cursor) {
  if (!value || !value.startsWith('=')) return null
  const before = value.slice(0, cursor)
  const m = before.match(/(?:[=(+\-*/&^,])([A-Za-z][A-Za-z0-9_]*)$|^=([A-Za-z][A-Za-z0-9_]*)$/)
  return m ? (m[1] || m[2]) : null
}

function updateAc(value, cursor) {
  const tok = _acToken(value, cursor)
  if (!tok) { acItems.value = []; return }
  const up = tok.toUpperCase()
  acItems.value = Object.keys(AC_FUNS).filter(n => n.startsWith(up)).sort().slice(0, 8)
  acIdx.value = 0
}

function commitAc(name) {
  const input = formulaInputRef.value
  if (!input) return
  const cursor = input.selectionStart, value = input.value
  const before = value.slice(0, cursor)
  const m = before.match(/(?:[=(+\-*/&^,])([A-Za-z][A-Za-z0-9_]*)$|^=([A-Za-z][A-Za-z0-9_]*)$/)
  if (m) {
    const tok = m[1] || m[2], tokStart = cursor - tok.length
    const newVal = value.slice(0, tokStart) + name + '(' + value.slice(cursor)
    formulaValue.value = newVal
    nextTick(() => {
      const pos = tokStart + name.length + 1
      input.setSelectionRange(pos, pos)
    })
  }
  acItems.value = []
}

function closeAc() { acItems.value = [] }

// ── Number format helpers ─────────────────────────────────────────────────────

// Number format is encoded as either a bare type ('number') or `type:decimals`
// (e.g. 'number:3', 'currency:0'). The increase/decrease-decimals buttons
// mutate the trailing ':N'.
function parseNumberFmt(fmt) {
  if (!fmt) return { type: '', decimals: null }
  const [type, n] = String(fmt).split(':')
  return { type, decimals: n != null && n !== '' ? parseInt(n, 10) : null }
}

function buildNumberFmt(type, decimals) {
  if (!type) return ''
  return decimals == null ? type : `${type}:${decimals}`
}

function applyNumberFmt(value, format) {
  if (!format) return value
  const { type, decimals } = parseNumberFmt(format)
  // Text format leaves the value untouched (no numeric coercion at display).
  // Cells flagged 'text' should also be treated as text in formulas; that's
  // handled by the engine's strict-arithmetic — see toNumStrict.
  if (type === 'text') return value == null ? '' : String(value)
  const n = parseFloat(value)
  if (isNaN(n) && type !== 'date') return value
  if (type === 'number') {
    return decimals == null
      ? n.toLocaleString()
      : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  if (type === 'currency') {
    const d = decimals ?? 2
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
  }
  if (type === 'percentage') return (n * 100).toFixed(decimals ?? 2) + '%'
  if (type === 'date') {
    const d = parseFloat(value)
    return isNaN(d) ? value : new Date(d).toLocaleDateString()
  }
  return value
}

// Bump decimal precision for the selection. Treats 'General' as 'number:1' on
// first +, no-op on -. Numeric types pick a sensible default if no decimals
// were previously set.
function adjustDecimals(delta) {
  const ids = selectionIds()
  const sh = sheet.getCurrentSheet()
  for (const id of ids) {
    const cur = formats.get(id, sh).numberFormat || ''
    let { type, decimals } = parseNumberFmt(cur)
    if (!type) {
      if (delta < 0) continue
      type = 'number'
      decimals = 0
    }
    const defaultDec = type === 'currency' ? 2 : type === 'percentage' ? 2 : 2
    if (decimals == null) decimals = defaultDec
    decimals = Math.max(0, Math.min(20, decimals + delta))
    const next = buildNumberFmt(type, decimals)
    formats.applyToRange([id], { numberFormat: next }, sh)
    const raw = sheet.getDisplayValue(id)
    grid?.setCell(id, applyNumberFmt(raw, next))
  }
  history.push()   // post-mutate snapshot
  _syncNumberFormat(activeCell.value)
  syncFlags()
  isDirty.value = true
  recordAction?.('adjustDecimals', [delta])
}

// ── Composables ───────────────────────────────────────────────────────────────

const { activeFormat, refreshActiveFormat, toggleFmt, setAlign, setValign, setColor, clearFormatting, getLastAction, recordAction } =
  useToolbar({ sheet, formats, getGrid: () => grid, history, selectionIds, syncFlags, markDirty: () => { isDirty.value = true } })

// Maps the current cell's font-family string back to a short key so the
// toolbar select shows e.g. "Inter" instead of the full CSS stack.
const activeFontFamilyKey = computed(() => {
  const f = activeFormat.value?.fontFamily
  if (!f) return 'inter'
  for (const [k, v] of Object.entries(FONT_FAMILY_STACK)) if (v === f) return k
  return 'inter'
})

const activeFontFamilyLabel = computed(() =>
  FONT_FAMILY_OPTIONS.find(o => o.value === activeFontFamilyKey.value)?.label || 'Inter'
)

const fontFamilyDropdownOptions = computed(() =>
  FONT_FAMILY_OPTIONS.map(o => ({
    label: o.label,
    onClick: () => setFontFamily(o.value),
  }))
)

function repeatLast() {
  const last = getLastAction()
  if (!last) return
  const handlers = { toggleFmt, setAlign, setValign, setColor, clearFormatting, adjustDecimals, adjustFontSize, setFontSize, setFontFamily }
  handlers[last.kind]?.(...last.args)
}

const { isSaving, showSaveDialog, saveTitle, saveError, loadSheet, openSaveDialog, confirmSave, saveExisting } =
  usePersistence({
    sheet, formats, merge,
    getViewState:   () => grid?.viewSnapshot?.(),
    applyViewState: (s) => grid?.viewRestore?.(s),
    currentTitle, emit,
  })

const {
  sheetNames, currentSheet, switchSheet,
  addSheet:       _addSheet,
  renameSheet:    _renameSheet,
  duplicateSheet: _duplicateSheet,
  deleteSheet:    _deleteSheet,
  reorderSheets,
  syncNames,
} = useSheetTabs({ sheet, formats, getGrid: () => grid, activeCell, formulaValue, refreshActiveFormat, onSwitch: () => {
    _repopulateGrid()
    grid?.setMarchingAnts(null); clipboard.clear(); clipboardHas.value = false
  } })

function addSheet() { _addSheet(); isDirty.value = true }

// ── Sheet-tab drag-to-reorder ─────────────────────────────────────────────────
const tabDragName = ref(null)
const tabDragOver = ref(null)

function onTabDragStart(e, name) {
  tabDragName.value = name
  e.dataTransfer.effectAllowed = 'move'
  // Some browsers require setData to allow the drag
  try { e.dataTransfer.setData('text/plain', name) } catch (_) {}
}
function onTabDragOver(e, name) {
  if (!tabDragName.value || tabDragName.value === name) return
  e.dataTransfer.dropEffect = 'move'
  tabDragOver.value = name
}
function onTabDrop(e, target) {
  const src = tabDragName.value
  if (!src || src === target) { tabDragOver.value = null; return }
  const next = sheetNames.value.filter(n => n !== src)
  const idx  = next.indexOf(target)
  next.splice(idx, 0, src)
  reorderSheets(next)
  tabDragOver.value = null
  tabDragName.value = null
  isDirty.value = true
}
function onTabDragEnd() { tabDragName.value = null; tabDragOver.value = null }

// ── Add more rows ─────────────────────────────────────────────────────────────
const addRowsCount = ref(1000)

// The strip is hidden until the viewport reaches the last ~10 rows, then
// surfaces so the user can extend the sheet without scrolling past empty space.
// `renderVersion` ticks on every canvas render, so this reactively updates with
// scroll, resize, freeze, and expandRows.
const showAddRows = computed(() => {
  renderVersion.value
  return grid?.isNearBottom?.(10) ?? false
})

function doAddMoreRows() {
  const n = Math.max(1, Math.min(10000, parseInt(addRowsCount.value, 10) || 1000))
  grid?.expandRows(n)
  isDirty.value = true
}

// ── Filter overlay geometry ───────────────────────────────────────────────────

const filterConfig = computed(() => sortFilter.getFilterConfig())

// Bumped after every canvas render so the filter overlay tracks scroll/resize/freeze.
const renderVersion = ref(0)

// Chevron buttons sit on the right edge of each visible row-0 cell — row 0
// is the user's header row of data (the column letters A/B/C strip is the
// SPREADSHEET header, separate from this).
const visibleFilterCols = computed(() => {
  renderVersion.value
  if (!grid || !showSortFilter.value) return []
  const row0 = grid.getRow0Rect()
  const rects = grid.getColumnHeaderRects()
  const BTN = 16
  return rects.map(({ c, x, width }) => ({
    col: c,
    style: {
      left:   (x + width - BTN - 3) + 'px',
      top:    (row0.y + (row0.height - BTN) / 2) + 'px',
      width:  BTN + 'px',
      height: BTN + 'px',
    },
  }))
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  grid = createGrid(canvasRef.value, {
    onSelect(id) {
      activeCell.value   = id
      formulaValue.value = sheet.getCell(id)
      refreshActiveFormat()
      _syncNumberFormat(id)
      computeSelectionStats()
    },
    onCommit(id, value) { sheet.setCell(id, value); history.push(); syncFlags(); isDirty.value = true },
    onInput(id, value)  { formulaValue.value = value },
    onCancel(id)        { formulaValue.value = sheet.getCell(id) },
    getFormat:    id => formats.get(id, sheet.getCurrentSheet()),
    getMergeInfo: id => merge.getMasterInfo(id),
    isSlave:      id => merge.isSlave(id),
    getMasterId:  id => merge.getMasterId(id),
    onFill(srcId, targetIds) {
      const rawVal = sheet.getCell(srcId)
      for (const id of targetIds) sheet.setCell(id, rawVal)
      history.push()
      syncFlags(); isDirty.value = true
    },
    onBatchCommit(cells) {
      for (const { id, value } of cells) sheet.setCell(id, value)
      history.push()
      syncFlags(); isDirty.value = true
    },
  })

  // Keep DOM overlays (filter chevrons) in sync with canvas scroll/resize/freeze.
  grid.onRender(() => { renderVersion.value++ })

  canvasRef.value.addEventListener('contextmenu', onCanvasContextMenu)
  canvasRef.value.addEventListener('mouseup', computeSelectionStats)
  canvasRef.value.addEventListener('keyup',   computeSelectionStats)

  ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    grid.resize(width, height)
  })
  ro.observe(gridWrapRef.value)

  history.init()
  syncFlags()

  window.addEventListener('keydown',      onGlobalKey)
  window.addEventListener('beforeunload', onBeforeUnloadGuard)
  document.addEventListener('paste',     onDocPaste)
  document.addEventListener('copy',      onDocCopy)
  document.addEventListener('cut',       onDocCut)
  document.addEventListener('mousedown', _onDocMouseDown)

  if (props.id && props.id !== 'new') {
    await loadSheet(props.id)
    // Sync canvas cell data + Vue-side view-state mirrors from whatever the
    // engine/grid restored. This is the only place after a remote load where
    // the UI refs (freezeRows, manualHiddenRows, etc.) catch up with the grid.
    _repopulateGrid()
    const restored = grid.viewSnapshot?.()
    if (restored) {
      freezeRows.value = restored.freezeRows || 0
      freezeCols.value = restored.freezeCols || 0
      manualHiddenRows.clear(); for (const r of (restored.hiddenRows || [])) manualHiddenRows.add(r)
      manualHiddenCols.clear(); for (const c of (restored.hiddenCols || [])) manualHiddenCols.add(c)
    }
    syncNames()
    activeCell.value   = 'A1'
    formulaValue.value = sheet.getCell('A1')
    refreshActiveFormat()
    _syncNumberFormat('A1')
    history.init()
    syncFlags()
  }
})

onBeforeUnmount(() => {
  clearTimeout(_autoSaveTimer)
  // CRITICAL: flush any pending debounced save before the component dies.
  // Without this, navigating away within ~2s of an edit (the autosave
  // debounce window) silently drops the most recent changes — exactly the
  // "data is lost when I come back" report. The fetch uses `keepalive: true`
  // so the request survives the unmount.
  if (props.id !== 'new' && isDirty.value) {
    saveExisting(props.id, currentTitle.value, { keepalive: true })
  }
  window.removeEventListener('beforeunload', onBeforeUnloadGuard)
  ro?.disconnect()
  grid?.destroy()
  window.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('paste',     onDocPaste)
  document.removeEventListener('copy',      onDocCopy)
  document.removeEventListener('cut',       onDocCut)
  document.removeEventListener('mousedown', _onDocMouseDown)
})

// ── Save ──────────────────────────────────────────────────────────────────────

// Browser-level guard (tab close / refresh / cross-app nav). The native
// "Leave site?" prompt is the only thing that can preempt a unload reliably.
function onBeforeUnloadGuard(e) {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''   // Chrome requires returnValue to show the prompt
}

let _autoSaveTimer = null

function _triggerAutoSave() {
  if (props.id === 'new') return   // new docs require manual first-save
  clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(_doAutoSave, 2000)
}

async function _doAutoSave() {
  if (props.id === 'new' || !isDirty.value) return
  await saveExisting(props.id, currentTitle.value)
  if (!saveError.value) {
    isDirty.value  = false
    justSaved.value = true
    setTimeout(() => { justSaved.value = false }, 2500)
  }
}

// Awaits any pending autosave + flushes one more save if still dirty. Called
// before in-app navigation away from this view so the user never loses unsaved
// edits when clicking the back button.
async function flushSave() {
  if (props.id === 'new' || !isDirty.value) return
  clearTimeout(_autoSaveTimer)
  await _doAutoSave()
}

async function flushAndClose() {
  // New unsaved docs: ask the user whether to discard or save first. Existing
  // docs: silently flush, then close.
  if (props.id === 'new' && isDirty.value) {
    const ok = window.confirm('This spreadsheet has not been saved. Discard?')
    if (!ok) return
  } else {
    await flushSave()
  }
  emit('close')
}

// Watch for any dirty change → schedule auto-save
watch(isDirty, (dirty) => { if (dirty) _triggerAutoSave() })

// Also auto-save when the title itself is edited (for existing docs)
function onTitleBlur() {
  if (props.id !== 'new') _triggerAutoSave()
}

watch(isSaving, (cur, prev) => { if (prev && !cur && !saveError.value) isDirty.value = false })

function onSave() {
  if (props.id === 'new') openSaveDialog(currentTitle.value)
  else                    _doAutoSave()
}

// ── Formula bar ───────────────────────────────────────────────────────────────

function onFormulaInput(e) {
  formulaValue.value = e.target.value
  updateAc(e.target.value, e.target.selectionStart)
}

function onFormulaKey(e) {
  if (acVisible.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); acIdx.value = Math.min(acIdx.value + 1, acItems.value.length - 1); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); acIdx.value = Math.max(acIdx.value - 1, 0); return }
    if ((e.key === 'Tab' || e.key === 'Enter') && acItems.value[acIdx.value]) { e.preventDefault(); commitAc(acItems.value[acIdx.value]); return }
    if (e.key === 'Escape') { acItems.value = []; return }
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    sheet.setCell(activeCell.value, formulaValue.value); history.push(); syncFlags(); isDirty.value = true
    canvasRef.value?.focus()
  }
  if (e.key === 'Escape') {
    formulaValue.value = sheet.getCell(activeCell.value)
    canvasRef.value?.focus()
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function onGlobalKey(e) {
  const mod     = e.metaKey || e.ctrlKey
  const inInput = document.activeElement?.tagName === 'INPUT'
                  && document.activeElement !== formulaInputRef.value

  if (mod && e.key === 'z' && !e.shiftKey)                          { e.preventDefault(); undo(); return }
  if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z')))      { e.preventDefault(); redo(); return }
  if (mod && e.key === 'b' && !inInput)                             { e.preventDefault(); toggleFmt('bold'); return }
  if (mod && e.key === 'i' && !inInput)                             { e.preventDefault(); toggleFmt('italic'); return }
  if (mod && e.key === 'u' && !inInput)                             { e.preventDefault(); toggleFmt('underline'); return }
  if (mod && e.shiftKey && (e.key === 'x' || e.key === 'X') && !inInput) { e.preventDefault(); toggleFmt('strikethrough'); return }
  if (mod && (e.key === '`' || e.code === 'Backquote') && !inInput) {
    e.preventDefault()
    showFormulas.value = !showFormulas.value
    _repopulateGrid()
    return
  }
  if (mod && e.key === '`' && !inInput)                              { e.preventDefault(); toggleShowFormulas(); return }
  if (e.key === 'F4' && !inInput)                                    { e.preventDefault(); repeatLast(); return }
  if (mod && e.key === 's')                                         { e.preventDefault(); onSave(); return }
  if (mod && e.key === 'f')                                         { e.preventDefault(); showFindReplace.value = true; return }
  if (mod && e.key === 'l' && !inInput)                             { e.preventDefault(); openHyperlinkDialog(); return }
  if (e.altKey && e.key === 'ArrowDown' && !inInput)                { e.preventDefault(); openQuickFilterForActive(); return }
  if (mod && (e.key === '=' || e.key === '+'))                      { e.preventDefault(); zoomBy(+0.1); return }
  if (mod && e.key === '-')                                         { e.preventDefault(); zoomBy(-0.1); return }
  if (mod && e.key === '0')                                         { e.preventDefault(); resetZoom();  return }
  if (!mod && !inInput && e.key === '?')                            { e.preventDefault(); showShortcutsHelp.value = true; return }
  if (e.key === 'Escape' && !inInput) {
    // Cancel any active cut/copy "marching ants" highlight.
    if (clipboard.hasData()) { clipboard.clear(); clipboardHas.value = false; grid?.setMarchingAnts(null); return }
  }
  if (mod && e.key === 'd' && !inInput) {
    e.preventDefault()
    if (!grid) return
    const { r0, c0, r1, c1 } = grid.getSelection()
    if (r1 <= r0) return
    for (let c = c0; c <= c1; c++) {
      const srcVal = sheet.getCell(colLabel(c) + (r0 + 1))
      for (let r = r0 + 1; r <= r1; r++) sheet.setCell(colLabel(c) + (r + 1), srcVal)
    }
    history.push()
    syncFlags(); isDirty.value = true
    return
  }
  if (mod && e.key === 'r' && !inInput) {
    e.preventDefault()
    if (!grid) return
    const { r0, c0, r1, c1 } = grid.getSelection()
    if (c1 <= c0) return
    for (let r = r0; r <= r1; r++) {
      const srcVal = sheet.getCell(colLabel(c0) + (r + 1))
      for (let c = c0 + 1; c <= c1; c++) sheet.setCell(colLabel(c) + (r + 1), srcVal)
    }
    history.push()
    syncFlags(); isDirty.value = true
    return
  }
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

function _canvasActive() {
  const ae = document.activeElement
  return ae === canvasRef.value || ae === formulaInputRef.value || gridWrapRef.value?.contains(ae)
}

// Mirrors `clipboard.hasData()` reactively so the context menu can show /
// hide its Paste-Special entries without polling.
const clipboardHas = ref(false)

function onDocCopy(e) {
  if (!_canvasActive()) return
  e.preventDefault()
  const src = grid.getSelection()
  clipboard.copy(src)
  clipboardHas.value = true
  grid.setMarchingAnts(src)
}
function onDocCut(e) {
  if (!_canvasActive()) return
  e.preventDefault()
  const src = grid.getSelection()
  clipboard.cut(src); history.push(); syncFlags(); isDirty.value = true
  clipboardHas.value = true
  grid.setMarchingAnts(src)
}
function onDocPaste(e) {
  if (!_canvasActive()) return
  e.preventDefault()
  let pasted = false
  if (clipboard.hasData()) {
    // Internal cut/copy: use internal paste so cut properly clears source cells
    clipboard.paste(activeCell.value, () => { history.push(); syncFlags() })
    _repopulateGrid()
    pasted = true
  } else {
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      clipboard.pasteFromText(text, activeCell.value, () => { history.push(); syncFlags() })
      _repopulateGrid()
      pasted = true
    }
  }
  clipboardHas.value = clipboard.hasData()
  grid.setMarchingAnts(null)
  if (pasted) isDirty.value = true   // ensure autosave fires
}

// Right-click → Paste special. `kind` ∈ {'values', 'formats', 'formulas'}.
function doPasteSpecial(kind) {
  contextMenu.open = false
  if (!clipboard.hasData()) return
  clipboard.paste(activeCell.value, () => { history.push(); syncFlags() }, kind)
  _repopulateGrid()
  clipboardHas.value = clipboard.hasData()
  grid?.setMarchingAnts(null)
  isDirty.value = true
}

// ── History ───────────────────────────────────────────────────────────────────

function undo() {
  if (!history.undo()) return
  _repopulateGrid()
  syncNames(); activeCell.value = 'A1'; formulaValue.value = sheet.getCell('A1')
  refreshActiveFormat(); _syncNumberFormat('A1'); syncFlags()
  grid?.setMarchingAnts(null); clipboard.clear(); clipboardHas.value = false
}
function redo() {
  if (!history.redo()) return
  _repopulateGrid()
  syncNames(); activeCell.value = 'A1'; formulaValue.value = sheet.getCell('A1')
  refreshActiveFormat(); _syncNumberFormat('A1'); syncFlags()
  grid?.setMarchingAnts(null); clipboard.clear(); clipboardHas.value = false
}

// ── Export / Import CSV ───────────────────────────────────────────────────────

function exportCSV() {
  const data = sheet.getRawData()
  let maxR = 0, maxC = 0
  for (const id of Object.keys(data)) {
    const p = parseCellId(id)
    if (!p) continue
    if (p.row > maxR) maxR = p.row
    if (p.col > maxC) maxC = p.col
  }
  const rows = []
  for (let r = 0; r <= maxR; r++) {
    const row = []
    for (let c = 0; c <= maxC; c++) {
      const v = sheet.getDisplayValue(colLabel(c) + (r + 1))
      row.push(String(v).includes(',') ? `"${v}"` : v)
    }
    rows.push(row.join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${currentTitle.value}.csv`,
  })
  a.click()
}

function triggerImport() {
  csvInputRef.value?.click()
}

function importCSV(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const text = ev.target.result
    const rows = _parseCSV(text)
    grid.clearAll()
    const currentSh = sheet.getCurrentSheet()
    // Clear existing data first
    for (const id of Object.keys(sheet.getRawData(currentSh))) {
      sheet.setCell(id, '')
    }
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const id = colLabel(c) + (r + 1)
        const val = rows[r][c]
        if (val !== '') sheet.setCell(id, val)
      }
    }
    // Repopulate canvas
    for (const id of Object.keys(sheet.getRawData(currentSh))) {
      grid.setCell(id, sheet.getDisplayValue(id))
    }
    history.push()   // post-mutate snapshot
    syncFlags()
    isDirty.value = true   // critical: without this, the CSV import is never autosaved
  }
  reader.readAsText(file)
  // Reset so the same file can be imported again
  e.target.value = ''
}

function _parseCSV(text) {
  const rows = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (line === '' && rows.length === lines.length - 1) continue
    const cells = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++
        let cell = ''
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { cell += line[i++] }
        }
        if (line[i] === ',') i++
        cells.push(cell)
      } else {
        const end = line.indexOf(',', i)
        if (end === -1) { cells.push(line.slice(i)); i = line.length }
        else { cells.push(line.slice(i, end)); i = end + 1 }
      }
    }
    rows.push(cells)
  }
  return rows
}

// ── Number format ─────────────────────────────────────────────────────────────

function _syncNumberFormat(id) {
  const fmt = formats.get(id, sheet.getCurrentSheet())
  activeNumberFormat.value = fmt.numberFormat || ''
}

function onNumberFormatChange(value) {
  const ids = selectionIds()
  formats.applyToRange(ids, { numberFormat: value }, sheet.getCurrentSheet())
  for (const id of ids) {
    const raw = sheet.getDisplayValue(id)
    grid?.setCell(id, value ? applyNumberFmt(raw, value) : raw)
  }
  _syncNumberFormat(activeCell.value)
  history.push()   // post-mutate
  syncFlags()
  isDirty.value = true
}

// ── Find & Replace ────────────────────────────────────────────────────────────

function onNavigateTo(id) {
  if (!grid) return
  const p = parseCellId(id)
  if (!p) return
  // Move grid selection — use internal moveSel via re-using getSelection approach
  // We trigger a programmatic selection by dispatching to the grid's public API indirectly
  // The grid doesn't expose moveSel directly, so we update activeCell and re-render
  activeCell.value   = id
  formulaValue.value = sheet.getCell(id)
  refreshActiveFormat()
  _syncNumberFormat(id)
  // Use batchSetCells no-op to trigger a render; grid selection must be done via canvas focus + key
  // Since grid doesn't expose moveSel, we store coords and scroll via a workaround
  grid.render()
}

// ── Sort & Filter ─────────────────────────────────────────────────────────────

function openFilterPanel(colIdx, event) {
  const rect = event.target.getBoundingClientRect()
  const wrapRect = gridWrapRef.value.getBoundingClientRect()
  filterPanel.open     = true
  filterPanel.col      = colIdx
  filterPanel.operator = sortFilter.getFilterConfig()[colIdx]?.operator || 'contains'
  filterPanel.value    = sortFilter.getFilterConfig()[colIdx]?.value    || ''
  filterPanel.style    = {
    top:  (rect.bottom - wrapRect.top + 2) + 'px',
    left: (rect.left   - wrapRect.left)    + 'px',
  }
}

// Alt+↓ on a canvas cell opens the filter panel for that cell's column. Forces
// the filter row visible first (so chevrons exist) and anchors the popover at
// the column's row-0 cell rather than at a click target.
function openQuickFilterForActive() {
  const id = activeCell.value
  const p  = parseCellId(id)
  if (!p) return
  showSortFilter.value = true
  nextTick(() => {
    const rects   = grid?.getColumnHeaderRects?.() || []
    const colRect = rects.find(r => r.c === p.col)
    const row0    = grid?.getRow0Rect?.()
    if (!colRect || !row0) return
    filterPanel.open     = true
    filterPanel.col      = p.col
    filterPanel.operator = sortFilter.getFilterConfig()[p.col]?.operator || 'contains'
    filterPanel.value    = sortFilter.getFilterConfig()[p.col]?.value    || ''
    filterPanel.style    = {
      top:  (row0.y + row0.height + 2) + 'px',
      left: (colRect.x + colRect.width - 232 - 4) + 'px',  // 232px panel width
    }
  })
}

function applyFilter() {
  sortFilter.setFilter(filterPanel.col, { operator: filterPanel.operator, value: filterPanel.value })
  filterPanel.open = false
  _repopulateGrid()
  _applyHiddenRows()
  isDirty.value = true
}

function clearFilterCol() {
  sortFilter.clearFilter(filterPanel.col)
  filterPanel.open = false
  _repopulateGrid()
  _applyHiddenRows()
  isDirty.value = true
}

function doSort(colIdx, dir) {
  sortFilter.sort(colIdx, dir)
  filterPanel.open = false
  _repopulateGrid()
  _applyHiddenRows()
  history.push()   // post-mutate snapshot
  syncFlags()
  isDirty.value = true   // sort mutates cell values
}

function doSortActive(dir) {
  const p = parseCellId(activeCell.value)
  doSort(p ? p.col : 0, dir)
}

// ── Context menu ──────────────────────────────────────────────────────────────

const contextMenu = reactive({ open: false, x: 0, y: 0, targetRow: 0, targetCol: 0, mode: 'cell' })
const tabMenu     = reactive({ open: false, x: 0, y: 0, name: '' })

const showRenameDialog = ref(false)
const renameValue      = ref('')
const renameError      = ref('')
let _renameTarget      = ''

function onCanvasContextMenu(e) {
  e.preventDefault()
  tabMenu.open = false
  const hit = grid.getHitRegion(e.clientX, e.clientY)
  const sel = grid.getSelection()
  contextMenu.targetRow = hit.headerRow ?? hit.cell?.r ?? sel.r0
  contextMenu.targetCol = hit.headerCol ?? hit.cell?.c ?? sel.c0
  contextMenu.mode      = hit.headerCol !== null && hit.headerCol !== undefined ? 'colHeader'
                        : hit.headerRow !== null && hit.headerRow !== undefined ? 'rowHeader'
                        : 'cell'
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.open = true
}

function openTabMenu(e, name) {
  contextMenu.open = false
  tabMenu.name = name
  tabMenu.x = e.clientX
  tabMenu.y = e.clientY
  tabMenu.open = true
}

function openRenameDialog(name) {
  tabMenu.open = false
  _renameTarget      = name
  renameValue.value  = name
  renameError.value  = ''
  showRenameDialog.value = true
}

function confirmRename() {
  const ok = _renameSheet(_renameTarget, renameValue.value)
  if (!ok) {
    renameError.value = 'Name is empty or already used.'
    return
  }
  showRenameDialog.value = false
  isDirty.value = true
}

function doDuplicateSheet(name) {
  tabMenu.open = false
  _duplicateSheet(name)
  isDirty.value = true
}

function doDeleteSheet(name) {
  tabMenu.open = false
  if (_deleteSheet(name)) isDirty.value = true
}

function _onDocMouseDown(e) {
  // Close context menus only when clicking OUTSIDE them. Never close on
  // mousedown when clicking a button inside — that would remove the element
  // before its click event fires, making every menu item a no-op.
  const menus = document.querySelectorAll('.sn-ctx-menu')
  let inside = false
  for (const el of menus) if (el.contains(e.target)) { inside = true; break }
  if (!inside) { contextMenu.open = false; tabMenu.open = false }
}

function doInsertRow(below = false, count = 1) {
  contextMenu.open = false
  const atRow = contextMenu.targetRow + (below ? 1 : 0)
  for (let i = 0; i < count; i++) {
    sheet.insertRow(atRow)
    formats.insertRow(atRow, sheet.getCurrentSheet())
    grid.shiftRowHeights(atRow, 1)
  }
  _repopulateGrid()
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
const zoomLevel = ref(1)
function zoomBy(delta) {
  const next = Math.round(((grid?.getZoom() ?? 1) + delta) * 10) / 10
  grid?.setZoom(next)
  zoomLevel.value = grid?.getZoom() ?? 1
}
function resetZoom() { grid?.setZoom(1); zoomLevel.value = 1 }

// ── Font size / family ────────────────────────────────────────────────────────
function setFontFamily(keyOrStack) {
  // Accept either a short key ('inter', 'mono', …) from the toolbar select or
  // a raw CSS font-family stack (used by F4 replay). Normalize to the stack.
  const stack = FONT_FAMILY_STACK[keyOrStack] || keyOrStack
  const ids = selectionIds()
  formats.applyToRange(ids, { fontFamily: stack }, sheet.getCurrentSheet())
  history.push()   // post-mutate
  refreshActiveFormat()
  grid?.render()
  syncFlags()
  recordAction?.('setFontFamily', [stack])
  isDirty.value = true
}

function adjustFontSize(delta) {
  const ids = selectionIds()
  const sh  = sheet.getCurrentSheet()
  for (const id of ids) {
    const cur = formats.get(id, sh).fontSize || 13
    const next = Math.max(8, Math.min(72, cur + delta))
    formats.applyToRange([id], { fontSize: next }, sh)
  }
  history.push()   // post-mutate
  refreshActiveFormat()
  grid?.render()
  syncFlags()
  recordAction?.('adjustFontSize', [delta])
  isDirty.value = true
}

// Set font size on the selection directly to whatever the user typed. Clamped
// to [8, 72] to match adjustFontSize. Called from the toolbar's font-size
// input on commit (Enter / blur).
function setFontSize(px) {
  const n = Math.max(8, Math.min(72, parseInt(px, 10) || 13))
  const ids = selectionIds()
  const sh  = sheet.getCurrentSheet()
  formats.applyToRange(ids, { fontSize: n }, sh)
  history.push()   // post-mutate
  refreshActiveFormat()
  grid?.render()
  syncFlags()
  recordAction?.('setFontSize', [n])
  isDirty.value = true
}

function onFontSizeInput(e) {
  setFontSize(e.target.value)
  // Snap the displayed value back to the clamped result.
  e.target.value = activeFormat.value.fontSize || 13
  e.target.blur()
}

// ── Hyperlink ─────────────────────────────────────────────────────────────────
function openHyperlinkDialog() {
  const id  = activeCell.value
  const cur = sheet.getCell(id)
  const fmt = formats.get(id, sheet.getCurrentSheet())
  hyperlinkText.value = String(cur ?? '')
  hyperlinkUrl.value  = fmt.hyperlink || ''
  showHyperlinkDialog.value = true
}

function confirmHyperlink() {
  const url = (hyperlinkUrl.value || '').trim()
  if (!url) { showHyperlinkDialog.value = false; return }
  const id = activeCell.value
  const sh = sheet.getCurrentSheet()
  if (hyperlinkText.value !== sheet.getCell(id)) sheet.setCell(id, hyperlinkText.value)
  formats.applyToRange([id], { hyperlink: url }, sh)
  history.push()   // post-mutate
  refreshActiveFormat()
  grid?.render()
  syncFlags()
  isDirty.value = true
  showHyperlinkDialog.value = false
}

function removeHyperlink() {
  const id = activeCell.value
  const sh = sheet.getCurrentSheet()
  formats.applyToRange([id], { hyperlink: null }, sh)
  history.push()   // post-mutate
  refreshActiveFormat()
  grid?.render()
  syncFlags()
  isDirty.value = true
  showHyperlinkDialog.value = false
}

function openInsertMany(kind, below = false) {
  contextMenu.open = false
  insertMany.kind  = kind
  insertMany.below = below
  insertMany.count = 5
  showInsertManyDialog.value = true
}

function confirmInsertMany() {
  const n = Math.max(1, Math.min(1000, parseInt(insertMany.count, 10) || 1))
  showInsertManyDialog.value = false
  if (insertMany.kind === 'row') doInsertRow(insertMany.below, n)
  else                            doInsertCol(insertMany.below, n)
}

function doDeleteRow() {
  contextMenu.open = false
  const atRow = contextMenu.targetRow
  sheet.deleteRow(atRow)
  formats.deleteRow(atRow, sheet.getCurrentSheet())
  grid.shiftRowHeights(atRow + 1, -1)
  _repopulateGrid()
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
}

function doInsertCol(right = false, count = 1) {
  contextMenu.open = false
  const atCol = contextMenu.targetCol + (right ? 1 : 0)
  for (let i = 0; i < count; i++) {
    sheet.insertCol(atCol)
    formats.insertCol(atCol, sheet.getCurrentSheet())
    grid.shiftColWidths(atCol, 1)
  }
  _repopulateGrid()
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
}

function doDeleteCol() {
  contextMenu.open = false
  const atCol = contextMenu.targetCol
  sheet.deleteCol(atCol)
  formats.deleteCol(atCol, sheet.getCurrentSheet())
  grid.shiftColWidths(atCol + 1, -1)
  _repopulateGrid()
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
}

function doAutoFitCol() {
  contextMenu.open = false
  grid?.autoFitCol(contextMenu.targetCol)
  isDirty.value = true
}

function doAutoFitRow() {
  contextMenu.open = false
  grid?.autoFitRow(contextMenu.targetRow)
  isDirty.value = true
}

// ── Borders ───────────────────────────────────────────────────────────────────

function applyBorder(preset) {
  if (!grid) return
  const { r0, c0, r1, c1 } = grid.getSelection()
  const sheetName = sheet.getCurrentSheet()
  const b = { style: borderStyle.value, color: borderColor.value }

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = colLabel(c) + (r + 1)
      const isTop = r === r0, isBottom = r === r1
      const isLeft = c === c0, isRight = c === c1
      let upd = {}
      if (preset === 'none') {
        upd = { borderTop: null, borderBottom: null, borderLeft: null, borderRight: null }
      } else if (preset === 'all') {
        upd = { borderTop: b, borderBottom: b, borderLeft: b, borderRight: b }
      } else if (preset === 'outside') {
        if (isTop)    upd.borderTop    = b
        if (isBottom) upd.borderBottom = b
        if (isLeft)   upd.borderLeft   = b
        if (isRight)  upd.borderRight  = b
      } else if (preset === 'inner') {
        if (!isTop)    upd.borderTop    = b
        if (!isBottom) upd.borderBottom = b
        if (!isLeft)   upd.borderLeft   = b
        if (!isRight)  upd.borderRight  = b
      } else if (preset === 'top')    { upd.borderTop    = b }
        else if (preset === 'bottom') { upd.borderBottom = b }
        else if (preset === 'left')   { upd.borderLeft   = b }
        else if (preset === 'right')  { upd.borderRight  = b }
      if (Object.keys(upd).length) formats.applyToRange([id], upd, sheetName)
    }
  }
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
  grid.render()
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function toggleMerge() {
  if (!grid) return
  const { r0, c0, r1, c1 } = grid.getSelection()
  if (r0 === r1 && c0 === c1) return
  const masterId = colLabel(c0) + (r0 + 1)
  if (merge.isMaster(masterId)) merge.unmerge(r0, c0, r1, c1)
  else                          merge.merge(r0, c0, r1, c1)
  history.push()   // post-mutate
  syncFlags(); isDirty.value = true
  grid.render()
}

// ── Freeze ────────────────────────────────────────────────────────────────────

function doFreezeRow() {
  contextMenu.open = false
  freezeRows.value = contextMenu.targetRow + 1
  grid?.setFreeze(freezeRows.value, freezeCols.value)
}

function doFreezeCol() {
  contextMenu.open = false
  freezeCols.value = contextMenu.targetCol + 1
  grid?.setFreeze(freezeRows.value, freezeCols.value)
}

function doUnfreezeRows() {
  contextMenu.open = false
  freezeRows.value = 0
  grid?.setFreeze(freezeRows.value, freezeCols.value)
}

function doUnfreezeCols() {
  contextMenu.open = false
  freezeCols.value = 0
  grid?.setFreeze(freezeRows.value, freezeCols.value)
}

// ── Hide / unhide rows & cols ─────────────────────────────────────────────────

// Manual hides kept in reactive state so the context menu can conditionally
// render "Unhide all". Filter hides live in sortFilter; we merge both when
// pushing to the canvas via _applyHiddenRows().
const manualHiddenRows = reactive(new Set())
const manualHiddenCols = reactive(new Set())

function _applyHiddenRows() {
  const filterHidden = sortFilter.computeHiddenRows()
  const union = new Set([...filterHidden, ...manualHiddenRows])
  grid?.setHiddenRows(union)
}

function _applyHiddenCols() {
  grid?.setHiddenCols(new Set(manualHiddenCols))
}

function doHideRows() {
  contextMenu.open = false
  if (!grid) return
  const { r0, r1 } = grid.getSelection()
  for (let r = r0; r <= r1; r++) manualHiddenRows.add(r)
  _applyHiddenRows()
  isDirty.value = true
}

function doHideCols() {
  contextMenu.open = false
  if (!grid) return
  const { c0, c1 } = grid.getSelection()
  for (let c = c0; c <= c1; c++) manualHiddenCols.add(c)
  _applyHiddenCols()
  isDirty.value = true
}

function doUnhideAllRows() {
  contextMenu.open = false
  manualHiddenRows.clear()
  _applyHiddenRows()
  isDirty.value = true
}

function doUnhideAllCols() {
  contextMenu.open = false
  manualHiddenCols.clear()
  _applyHiddenCols()
  isDirty.value = true
}

// ── Cmd+K command palette ─────────────────────────────────────────────────────
// CommandPalette ships its own Cmd+K listener that flips `showCmdPalette`.
const showCmdPalette = ref(false)
const cmdQuery       = ref('')

const cmdGroups = computed(() => {
  const item = (name, title, description, fn) => ({ name, title, description, fn })
  return [
    {
      title: 'Format',
      component: CommandPaletteItem,
      items: [
        item('bold',          'Bold',                 'Ctrl+B',       () => toggleFmt('bold')),
        item('italic',        'Italic',               'Ctrl+I',       () => toggleFmt('italic')),
        item('underline',     'Underline',            'Ctrl+U',       () => toggleFmt('underline')),
        item('strikethrough', 'Strikethrough',        'Ctrl+Shift+X', () => toggleFmt('strikethrough')),
        item('wrap',          'Wrap text',            '',             () => toggleFmt('wrapText')),
        item('clearFmt',      'Clear formatting',     '',             () => clearFormatting()),
        item('align-left',    'Align left',           '',             () => setAlign('left')),
        item('align-center',  'Align center',         '',             () => setAlign('center')),
        item('align-right',   'Align right',          '',             () => setAlign('right')),
        item('valign-top',    'Align top',            '',             () => setValign('top')),
        item('valign-middle', 'Align middle',         '',             () => setValign('middle')),
        item('valign-bottom', 'Align bottom',         '',             () => setValign('bottom')),
        item('dec-inc',       'Increase decimal places', '',          () => adjustDecimals(+1)),
        item('dec-dec',       'Decrease decimal places', '',          () => adjustDecimals(-1)),
      ],
    },
    {
      title: 'Edit',
      component: CommandPaletteItem,
      items: [
        item('undo',     'Undo',         'Ctrl+Z', () => undo()),
        item('redo',     'Redo',         'Ctrl+Y', () => redo()),
        item('repeat',   'Repeat last action', 'F4', () => repeatLast()),
        item('find',     'Find & replace',     'Ctrl+F', () => { showFindReplace.value = true }),
        item('formulas', 'Show formulas',      'Ctrl+`', () => { showFormulas.value = !showFormulas.value; _repopulateGrid() }),
        item('shortcuts','Keyboard shortcuts', '?',      () => { showShortcutsHelp.value = true }),
      ],
    },
    {
      title: 'Structure',
      component: CommandPaletteItem,
      items: [
        item('row-above',  'Insert row above',     '', () => { contextMenu.targetRow = grid.getSelection().r0;     doInsertRow(false) }),
        item('row-below',  'Insert row below',     '', () => { contextMenu.targetRow = grid.getSelection().r0;     doInsertRow(true) }),
        item('row-del',    'Delete row',           '', () => { contextMenu.targetRow = grid.getSelection().r0;     doDeleteRow() }),
        item('col-left',   'Insert column left',   '', () => { contextMenu.targetCol = grid.getSelection().c0;     doInsertCol(false) }),
        item('col-right',  'Insert column right',  '', () => { contextMenu.targetCol = grid.getSelection().c0;     doInsertCol(true) }),
        item('col-del',    'Delete column',        '', () => { contextMenu.targetCol = grid.getSelection().c0;     doDeleteCol() }),
        item('row-hide',   'Hide row',             '', () => doHideRows()),
        item('col-hide',   'Hide column',          '', () => doHideCols()),
        item('row-unhide', 'Unhide all rows',      '', () => doUnhideAllRows()),
        item('col-unhide', 'Unhide all columns',   '', () => doUnhideAllCols()),
        item('autofit-w',  'Auto-fit column width', '', () => { contextMenu.targetCol = grid.getSelection().c0; doAutoFitCol() }),
        item('autofit-h',  'Auto-fit row height',   '', () => { contextMenu.targetRow = grid.getSelection().r0; doAutoFitRow() }),
        item('merge',      'Merge cells',          '', () => toggleMerge()),
        item('add-rows',   `Add ${addRowsCount.value} more rows`, '', () => doAddMoreRows()),
      ],
    },
    {
      title: 'View',
      component: CommandPaletteItem,
      items: [
        item('freeze-row',   'Freeze rows up to selection', '', () => { contextMenu.targetRow = grid.getSelection().r0; doFreezeRow() }),
        item('freeze-col',   'Freeze cols up to selection', '', () => { contextMenu.targetCol = grid.getSelection().c0; doFreezeCol() }),
        item('unfreeze-row', 'Unfreeze rows',               '', () => doUnfreezeRows()),
        item('unfreeze-col', 'Unfreeze columns',            '', () => doUnfreezeCols()),
        item('filter',       'Toggle filter',               '', () => { showSortFilter.value = !showSortFilter.value }),
      ],
    },
    {
      title: 'Sheet',
      component: CommandPaletteItem,
      items: [
        item('sheet-add',       'Add sheet',       '', () => addSheet()),
        item('sheet-rename',    'Rename sheet',    '', () => openRenameDialog(currentSheet.value)),
        item('sheet-duplicate', 'Duplicate sheet', '', () => doDuplicateSheet(currentSheet.value)),
        item('sheet-delete',    'Delete sheet',    '', () => doDeleteSheet(currentSheet.value)),
      ],
    },
    {
      title: 'File',
      component: CommandPaletteItem,
      items: [
        item('save',       'Save',        'Ctrl+S', () => onSave()),
        item('csv-export', 'Export CSV',  '',       () => exportCSV()),
        item('csv-import', 'Import CSV',  '',       () => triggerImport()),
      ],
    },
  ]
})

function onCmdSelect(item) { item?.fn?.() }

// ── Repopulate ────────────────────────────────────────────────────────────────

function _repopulateGrid() {
  if (!grid) return
  grid.clearAll()
  const data = sheet.getRawData()
  for (const id of Object.keys(data)) {
    if (showFormulas.value) {
      grid.setCell(id, String(data[id] ?? ''))
      continue
    }
    const fmt = formats.get(id, sheet.getCurrentSheet())
    const displayValue = sheet.getDisplayValue(id)
    grid.setCell(id, fmt.numberFormat ? applyNumberFmt(displayValue, fmt.numberFormat) : displayValue)
  }
}

function toggleShowFormulas() {
  showFormulas.value = !showFormulas.value
  _repopulateGrid()
}
</script>

<style scoped>
/* Espresso tokens — every color comes from frappe-ui's semantic palette
   (--surface-*, --outline-*, --ink-*). No raw Tailwind hexes. */

/* ── Root layout ─────────────────────────────────────────────────────────── */
.sn-root { display:flex; flex-direction:column; height:100vh; overflow:hidden; background:var(--surface-white); font-family:InterVar, ui-sans-serif, system-ui, sans-serif; color:var(--ink-gray-9); }

/* ── Bar 1 · Identity / topbar ───────────────────────────────────────────── */
.sn-topbar       { display:flex; align-items:center; justify-content:space-between; height:44px; padding:0 12px; border-bottom:1px solid var(--outline-gray-2); background:var(--surface-white); flex-shrink:0; }
.sn-topbar-left  { display:flex; align-items:center; gap:8px; min-width:0; }
.sn-topbar-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }

.sn-app-icon { width:28px; height:28px; flex-shrink:0; display:block; }
.sn-app-icon-btn {
  display:inline-flex; align-items:center; justify-content:center;
  padding:2px; margin:0; border:none; background:transparent; cursor:pointer;
  border-radius:8px; transition:background-color .12s;
}
.sn-app-icon-btn:hover  { background:var(--surface-gray-2); }
.sn-app-icon-btn:focus-visible { outline:2px solid var(--outline-gray-4); outline-offset:2px; }

.sn-title-input { height:28px; border:1px solid transparent; border-radius:6px; padding:0 8px; font-size:14px; font-weight:500; color:var(--ink-gray-9); background:transparent; outline:none; font-family:inherit; letter-spacing:.01em; transition:background-color .12s, border-color .12s, width .1s; }
.sn-title-input:hover { background:var(--surface-gray-2); }
.sn-title-input:focus { border-color:var(--outline-gray-4); background:var(--surface-white); box-shadow:0 0 0 2px rgba(23,23,23,.10); }

/* ── Bar 2 · Formula bar ─────────────────────────────────────────────────── */
.sn-formula-bar   { display:flex; align-items:center; height:40px; padding:0 12px; border-bottom:1px solid var(--outline-gray-2); gap:8px; flex-shrink:0; background:var(--surface-white); }
.sn-cell-ref      { width:64px; flex-shrink:0; text-align:center; font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--ink-gray-8); background:var(--surface-gray-2); border-radius:6px; height:26px; display:flex; align-items:center; justify-content:center; }
.sn-formula-wrap  { position:relative; flex:1; display:flex; }
.sn-formula-wrap .sn-formula-input { flex:1; }
.sn-formula-input { width:100%; height:28px; border:1px solid var(--outline-gray-2); border-radius:6px; outline:none; padding:0 10px; font-size:13px; color:var(--ink-gray-9); background:var(--surface-gray-2); font-family:inherit; letter-spacing:.02em; transition:background-color .15s, border-color .15s, box-shadow .15s; }
.sn-formula-input:hover { background:var(--surface-gray-3); }
.sn-formula-input:focus { border-color:var(--outline-gray-4); background:var(--surface-white); box-shadow:0 0 0 2px rgba(23,23,23,.10); }
.sn-fbar-actions  { display:flex; align-items:center; gap:6px; flex-shrink:0; }

/* Formula autocomplete — Frappe UI Autocomplete is form-field oriented, so the inline popover is bespoke but uses Espresso surfaces. */
.sn-ac-list  { position:absolute; top:calc(100% + 4px); left:0; right:0; background:var(--surface-modal); border:1px solid var(--outline-gray-2); border-radius:8px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); z-index:300; max-height:240px; overflow-y:auto; padding:4px; }
.sn-ac-item  { display:flex; align-items:baseline; gap:10px; padding:6px 10px; cursor:pointer; white-space:nowrap; border-radius:4px; }
.sn-ac-item:hover, .sn-ac-item.active { background:var(--surface-gray-2); }
.sn-ac-name  { font-weight:600; font-size:13px; color:var(--ink-gray-9); min-width:90px; letter-spacing:.02em; }
.sn-ac-sig   { font-size:11px; color:var(--ink-gray-5); letter-spacing:.01em; }

/* ── Bar 3 · Formatting toolbar ──────────────────────────────────────────── */
.sn-toolbar { display:flex; align-items:center; gap:2px; height:38px; padding:0 10px; border-bottom:1px solid var(--outline-gray-2); background:var(--surface-menu-bar); flex-shrink:0; }
.sn-toolbar :deep(.fui-form-control) { width:auto; }
.sn-toolbar :deep(select) { min-width:118px; }
/* Font family dropdown — uses a Button trigger that hugs the short label. */
.sn-font-family :deep(button) { padding-left:6px; padding-right:4px; gap:2px; }

/* Font size — Frappe UI FormControl in a compact pill. We just tighten width
   and hide the native spin buttons; the surface / border / focus ring come
   from the frappe-ui tailwind preset so they match every other input. */
.sn-font-size-input { width:44px; margin:0 4px; }
.sn-font-size-input :deep(input) { padding-left:6px; padding-right:6px; text-align:center; font-variant-numeric:tabular-nums; -moz-appearance:textfield; }
.sn-font-size-input :deep(input::-webkit-outer-spin-button),
.sn-font-size-input :deep(input::-webkit-inner-spin-button) { -webkit-appearance:none; margin:0; }
.sn-vr  { width:1px; height:18px; background:var(--outline-gray-2); margin:0 6px; flex-shrink:0; }

/* Toolbar overflow — `.sn-tool-extra` groups stay inline at wide widths;
   collapse below 1280px into the `.sn-tool-more` "…" dropdown. Using
   `display:contents` on the wrappers means the buttons participate in the
   parent flex layout when shown, with zero visual nesting. */
.sn-tool-extra { display: contents; }
.sn-tool-more  { display: none; margin-left: auto; }
@media (max-width: 1280px) {
  .sn-tool-extra { display: none; }
  .sn-tool-more  { display: inline-flex; }
}

/* Color-picker swatch buttons (FeatherIcon glyph above a colored underline). Native <input type=color> kept; Frappe UI has no color picker. */
.sn-swatch-btn { position:relative; height:28px; width:28px; border-radius:6px; display:inline-flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; border:1px solid transparent; gap:1px; transition:background-color .12s; }
.sn-swatch-btn:hover { background:var(--surface-gray-3); }
.sn-swatch-btn input[type=color] { position:absolute; opacity:0; width:100%; height:100%; left:0; top:0; cursor:pointer; }
.sn-swatch-glyph     { width:14px; height:14px; color:var(--ink-gray-8); pointer-events:none; }
.sn-swatch-underline { width:16px; height:3px; border-radius:1px; pointer-events:none; }
.sn-swatch-fill      { border:1px solid var(--outline-gray-2); }

/* ── Canvas grid ─────────────────────────────────────────────────────────── */
.sn-grid-wrap        { flex:1; overflow:hidden; position:relative; background:var(--surface-white); }
.sn-grid-wrap canvas { display:block; outline:none; }

/* ── Filter overlay (chevrons sit on row 0 of data — the user's header row) ── */
/* Covers the full canvas; button positions come from grid.colX() which already
   includes ROW_HEADER_W. The clip-path masks the row-number gutter (left 50px). */
.sn-filter-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; clip-path:inset(0 0 0 50px); }
.sn-filter-btn     { position:absolute; border:1px solid var(--outline-gray-2); border-radius:4px; background:rgba(255,255,255,.92); cursor:pointer; pointer-events:all; padding:0; display:flex; align-items:center; justify-content:center; color:var(--ink-gray-7); box-shadow:0 1px 2px rgba(0,0,0,.05); transition:background-color .12s, border-color .12s, color .12s; }
.sn-filter-btn:hover  { background:var(--surface-white); border-color:var(--outline-gray-4); color:var(--ink-gray-9); }
.sn-filter-btn.active { background:var(--surface-gray-4); border-color:var(--outline-gray-4); color:var(--ink-gray-9); }
.sn-filter-btn-icon   { width:12px; height:12px; }

.sn-filter-panel { position:absolute; z-index:100; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:10px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); padding:12px; width:232px; display:flex; flex-direction:column; gap:8px; }
.sn-fp-title   { font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--ink-gray-8); padding-bottom:2px; }
.sn-fp-row     { display:flex; gap:4px; }
.sn-fp-actions { display:flex; gap:4px; padding-top:2px; }
.sn-fp-grow    { flex:1; }

/* ── Bottom · tabs + stats ───────────────────────────────────────────────── */
.sn-bottom    { display:flex; align-items:center; height:34px; border-top:1px solid var(--outline-gray-2); background:var(--surface-menu-bar); flex-shrink:0; overflow:hidden; }
.sn-tabs      { display:flex; align-items:center; gap:2px; padding:0 8px; flex:1; overflow:hidden; }
.sn-stats     { display:flex; align-items:center; gap:14px; padding:0 14px; font-size:11px; letter-spacing:.02em; color:var(--ink-gray-6); flex-shrink:0; white-space:nowrap; border-left:1px solid var(--outline-gray-2); height:100%; }

/* ── Right-click context menu (positioned at cursor; uses Frappe UI Buttons inside) ── */
.sn-ctx-menu { position:fixed; z-index:9000; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:10px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); padding:4px; min-width:208px; display:flex; flex-direction:column; gap:1px; }
/* Frappe UI Button defaults to `justify-content:center`. Override inside
   context menus so every row's icon sits at the same left padding and the
   labels line up regardless of length. */
.sn-ctx-menu :deep(button) { width:100%; justify-content:flex-start; padding-left:10px; padding-right:10px; }
.sn-ctx-sep { height:1px; background:var(--outline-gray-1); margin:4px 0; border:none; }
.sn-rename-err { margin:6px 0 0; font-size:12px; color:var(--ink-red-3); letter-spacing:.02em; }

/* Keyboard-shortcut help dialog — two-column grid of grouped Espresso list rows. */
.sn-help-grid    { display:grid; grid-template-columns:1fr 1fr; gap:20px 28px; }
.sn-help-group   { display:flex; flex-direction:column; gap:2px; }
.sn-help-title   { font-size:11px; font-weight:600; letter-spacing:.06em; color:var(--ink-gray-5); text-transform:uppercase; padding:0 4px; margin-bottom:6px; }
.sn-help-row     { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 8px; border-radius:6px; }
.sn-help-row:hover { background:var(--surface-gray-2); }
.sn-help-label   { font-size:13px; letter-spacing:.02em; color:var(--ink-gray-9); }
.sn-help-keys    { display:inline-flex; align-items:center; gap:6px; color:var(--ink-gray-7); }
.sn-help-keys :deep(> div) {
  padding:2px 6px; border:1px solid var(--outline-gray-2); border-radius:4px;
  background:var(--surface-white); color:var(--ink-gray-8); min-height:20px;
}
.sn-help-or      { font-size:11px; letter-spacing:.02em; color:var(--ink-gray-5); }

/* Sheet-tab drag visual — Espresso ink-gray-9 left edge on the drop target. */
.sn-tab-wrap          { display:inline-flex; position:relative; cursor:grab; }
.sn-tab-wrap:active   { cursor:grabbing; }
.sn-tab-drag-over::before {
  content: ''; position:absolute; left:-1px; top:4px; bottom:4px; width:2px;
  background: var(--ink-gray-9); border-radius:1px;
}

/* Add-more-rows strip — sits between the canvas and the bottom bar. */
.sn-addrows         { display:flex; align-items:center; gap:8px; height:32px; padding:0 12px; border-top:1px solid var(--outline-gray-2); background:var(--surface-menu-bar); flex-shrink:0; }
.sn-addrows-label   { font-size:12px; letter-spacing:.02em; color:var(--ink-gray-6); }
.sn-addrows-input   { width:72px; height:24px; border:1px solid var(--outline-gray-2); border-radius:6px; padding:0 8px; font-size:12px; color:var(--ink-gray-9); background:var(--surface-white); font-family:inherit; outline:none; }
.sn-addrows-input:focus { border-color:var(--outline-gray-4); box-shadow:0 0 0 2px rgba(23,23,23,.10); }
</style>
