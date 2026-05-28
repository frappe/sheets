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
          name="sheet-title"
          class="sn-title-input"
          v-model="currentTitle"
          :style="{ width: titleInputWidth }"
          placeholder="Untitled Spreadsheet"
          spellcheck="false"
          @blur="onTitleBlur"
        />
        <!-- Save status — muted inline text; never competes with the title -->
        <span v-if="isSaving" class="sn-save-status">
          <FeatherIcon name="loader" class="sn-save-icon sn-save-spin" />
          Saving…
        </span>
        <span v-else-if="justSaved" class="sn-save-status">
          <FeatherIcon name="check" class="sn-save-icon" />
          Saved
        </span>
        <Badge v-if="saveError" theme="red" variant="subtle" size="sm" :label="saveError" :tooltip="saveError" />
      </div>
      <div class="sn-topbar-right">
        <Dropdown :options="fileDropdownOptions" placement="right">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconLeft="file-text" iconRight="chevron-down" label="File" tooltip="Import / export" />
          </template>
        </Dropdown>
        <input ref="csvInputRef"  name="csv-import"  type="file" accept=".csv"                   style="display:none" @change="importCSV" />
        <input ref="xlsxInputRef" name="xlsx-import" type="file" accept=".xlsx,.xls,.xlsm,.ods"  style="display:none" @change="importXLSX" />
        <span class="sn-topbar-divider" aria-hidden="true" />
        <Button variant="ghost" size="sm" icon="lucide-message-square" tooltip="Insert/edit note (Shift+F2)" @click="openCommentPanel" />
        <!-- Variant flips to "subtle" while the panel is open so the trigger
             reads as toggled, matching Frappe UI's standard toggle pattern. -->
        <Button :variant="vhOpen ? 'subtle' : 'ghost'"
                size="sm" icon="clock"
                tooltip="Version history"
                @click="vhOpen ? closeVersionHistory() : openVersionHistory()" />
        <Button variant="ghost" size="sm" icon="help-circle" tooltip="Keyboard shortcuts (?)" @click="showShortcutsHelp = true" />
        <span class="sn-topbar-divider" aria-hidden="true" />
        <!-- Presence avatars — other users currently viewing this sheet -->
        <div v-if="presentUsers.length" class="sn-presence">
          <Avatar
            v-for="u in presentUsers.slice(0, 3)"
            :key="u.user"
            :label="u.initials"
            :image="u.user_image || undefined"
            size="sm"
            :tooltip="u.full_name"
            class="sn-presence-avatar"
          />
          <span
            v-if="presentUsers.length > 3"
            class="sn-presence-more"
            :title="`${presentUsers.length - 3} more people`"
          >+{{ presentUsers.length - 3 }}</span>
        </div>
        <!-- Share -->
        <Button
          variant="ghost"
          size="sm"
          icon="share-2"
          :label="shareCount > 0 ? `Share · ${shareCount}` : 'Share'"
          tooltip="Share this spreadsheet"
          @click="shareOpen = true"
        />
        <span class="sn-topbar-divider" aria-hidden="true" />
        <Avatar :label="userInitial" size="sm" :tooltip="userEmail" class="sn-user-avatar" />
      </div>
    </div>

    <!-- Bar 2 · Formatting toolbar -->
    <div class="sn-toolbar">

      <!-- Number format -->
      <Dropdown :options="numberFormatDropdownOptions" placement="left" class="sn-numfmt">
        <template #default="{ open }">
          <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconRight="chevron-down" :label="numberFormatLabel" tooltip="Number format" />
        </template>
      </Dropdown>
      <Dropdown :options="currencyDropdownOptions" placement="left" class="sn-currency">
        <template #default="{ open }">
          <Button :variant="activeNumberFormatType === 'currency' ? 'subtle' : (open ? 'subtle' : 'ghost')" size="sm" :label="activeCurrencySymbol" tooltip="Currency" />
        </template>
      </Dropdown>
      <Button :variant="activeNumberFormatType === 'percentage' ? 'subtle' : 'ghost'" size="sm" label="%" tooltip="Percentage" @click="toggleNumberFmt('percentage')" />
      <Button :variant="activeNumberFormatType === 'number'     ? 'subtle' : 'ghost'" size="sm" label="," tooltip="Thousands separator" @click="toggleNumberFmt('number')" />
      <div class="sn-tool-extra">
        <Button variant="ghost" size="sm" icon="lucide-trending-down" tooltip="Decrease decimal places" @click="adjustDecimals(-1)" />
        <Button variant="ghost" size="sm" icon="lucide-trending-up"   tooltip="Increase decimal places" @click="adjustDecimals(+1)" />
      </div>

      <div class="sn-vr" />

      <!-- Font -->
      <Dropdown :options="fontFamilyDropdownOptions" placement="left" class="sn-font-family">
        <template #default="{ open }">
          <Button :variant="open ? 'subtle' : 'ghost'" size="sm" iconRight="chevron-down" :label="activeFontFamilyLabel" tooltip="Font family" />
        </template>
      </Dropdown>
      <TextInput type="number" size="sm" class="sn-font-size-input" :model-value="activeFormat.fontSize || 13" min="8" max="72" @change="onFontSizeInput" @keydown.enter.prevent="onFontSizeInput" />

      <div class="sn-vr" />

      <!-- Style -->
      <Button :variant="activeFormat.bold        ? 'subtle' : 'ghost'" :class="{ 'sn-fmt-active': activeFormat.bold }"        size="sm" icon="bold"                tooltip="Bold (Ctrl+B)"             @click="toggleFmt('bold')" />
      <Button :variant="activeFormat.italic      ? 'subtle' : 'ghost'" :class="{ 'sn-fmt-active': activeFormat.italic }"      size="sm" icon="italic"              tooltip="Italic (Ctrl+I)"           @click="toggleFmt('italic')" />
      <Button :variant="activeFormat.underline   ? 'subtle' : 'ghost'" :class="{ 'sn-fmt-active': activeFormat.underline }"   size="sm" icon="underline"           tooltip="Underline (Ctrl+U)"        @click="toggleFmt('underline')" />
      <div class="sn-tool-extra">
        <Button :variant="activeFormat.strikethrough ? 'subtle' : 'ghost'" :class="{ 'sn-fmt-active': activeFormat.strikethrough }" size="sm" icon="lucide-strikethrough" tooltip="Strikethrough (Ctrl+Shift+X)" @click="toggleFmt('strikethrough')" />
      </div>

      <div class="sn-vr" />

      <!-- Align + Color -->
      <Dropdown :options="alignDropdownOptions" placement="bottom">
        <template #default="{ open }">
          <Button :variant="open ? 'subtle' : 'ghost'" size="sm" :icon="hAlignIcon" tooltip="Alignment" />
        </template>
      </Dropdown>
      <label class="sn-swatch-btn" title="Text colour">
        <FeatherIcon name="type" class="sn-swatch-glyph" />
        <span class="sn-swatch-underline" :style="{ background: activeFormat.color || '#171717' }"></span>
        <input name="text-color" type="color" :value="activeFormat.color || '#171717'" @input="setColor('color', $event.target.value)" />
      </label>
      <label class="sn-swatch-btn" title="Fill colour">
        <FeatherIcon name="droplet" class="sn-swatch-glyph" />
        <span class="sn-swatch-underline sn-swatch-fill" :style="{ background: activeFormat.backgroundColor || '#ffffff' }"></span>
        <input name="fill-color" type="color" :value="activeFormat.backgroundColor || '#ffffff'" @input="setColor('backgroundColor', $event.target.value)" />
      </label>

      <div class="sn-vr" />

      <!-- Undo / Redo -->
      <Button variant="ghost" size="sm" icon="corner-up-left"  tooltip="Undo (Ctrl+Z)" :disabled="!canUndo" @click="undo" />
      <Button variant="ghost" size="sm" icon="corner-up-right" tooltip="Redo (Ctrl+Y)" :disabled="!canRedo" @click="redo" />

      <div class="sn-vr" />

      <!-- Extra tools (visible at wide widths; hidden at narrow — overflow via ···) -->
      <div class="sn-tool-extra">
        <Button :variant="isPaintingFormat ? 'subtle' : 'ghost'" size="sm" icon="lucide-paint-roller"  tooltip="Format painter"             @click="toggleFormatPainter" />
        <Button variant="ghost"                                   size="sm" icon="lucide-eraser"         tooltip="Clear formatting"           @click="clearFormatting" />
        <div class="sn-vr" />
        <Button :variant="showSortFilter ? 'subtle' : 'ghost'"   size="sm" icon="filter"               tooltip="Toggle filter"              @click="showSortFilter = !showSortFilter" />
        <div class="sn-vr" />
        <Dropdown :options="textWrapDropdownOptions" placement="bottom">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" :icon="textWrapIcon" tooltip="Text wrapping" />
          </template>
        </Dropdown>
        <div class="sn-vr" />
        <Button variant="ghost" size="sm" icon="lucide-blend"    tooltip="Conditional formatting"      @click="openCfDialog(null)" />
        <Button variant="ghost" size="sm" icon="lucide-link"     tooltip="Insert hyperlink (Ctrl+L)"   @click="openHyperlinkDialog" />
        <div class="sn-vr" />
        <Dropdown :options="borderDropdownOptions" placement="bottom">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" icon="lucide-layout-grid" tooltip="Borders" />
          </template>
        </Dropdown>
        <Button variant="ghost" size="sm" icon="maximize-2" tooltip="Merge / unmerge cells" @click="toggleMerge" />
        <div class="sn-vr" />
        <Button variant="ghost" size="sm" icon="bar-chart-2" tooltip="Insert chart" @click="openChartDialog()" />
      </div>

      <!-- More -->
      <div class="sn-tool-more">
        <Dropdown :options="moreToolbarOptions" placement="left">
          <template #default="{ open }">
            <Button :variant="open ? 'subtle' : 'ghost'" size="sm" icon="more-horizontal" tooltip="More" />
          </template>
        </Dropdown>
      </div>
    </div>

    <!-- Bar 3 · Formula bar -->
    <div class="sn-formula-bar">
      <span class="sn-cell-ref" :title="`Active cell ${activeCell}`">{{ activeCell }}</span>
      <span class="sn-fx-label" aria-hidden="true">fx</span>
      <div class="sn-formula-wrap">
        <input
          ref="formulaInputRef"
          name="formula-bar"
          class="sn-formula-input"
          :value="formulaValue"
          @input="onFormulaInput"
          @keydown="onFormulaKey"
          @blur="closeAc"
          placeholder="Enter value or formula"
          spellcheck="false"
          autocomplete="off"
        />
        <div v-if="acVisible" class="sn-ac-list" :class="{ 'sn-ac-list--up': acUp }">
          <div
            v-for="(item, i) in acItems"
            :key="item.name + item.kind"
            class="sn-ac-item"
            :class="{ active: i === acIdx }"
            @mousedown.prevent="commitAc(item)"
          >
            <span class="sn-ac-name">{{ item.name }}</span>
            <span v-if="item.kind === 'fn'"    class="sn-ac-sig">{{ AC_FUNS[item.name] }}</span>
            <span v-else                        class="sn-ac-badge">sheet</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Version preview banner — only when previewing -->
    <VersionPreviewBanner
      :open="!!vhActive"
      :version="vhVersions.find(v => v.name === vhActive)"
      :restoring="vhRestoring"
      :diff="vhDiff"
      :step-index="vhStepIdx"
      @restore="restorePreview"
      @exit="exitPreview"
      @name="nameCurrentPreview"
      @step="stepPreviewDiff"
    />

    <!-- Canvas grid + filter overlay -->
    <div ref="gridWrapRef" class="sn-grid-wrap"
         :class="{ 'sn-painting-format': isPaintingFormat, 'sn-preview-locked': !!vhActive }">
      <canvas ref="canvasRef" />

      <!-- First-time hint. Only shown for a blank workbook on a fresh
           machine; dismissed forever after the user closes it. Uses
           Espresso surface tokens so it sits on the canvas without
           competing for attention. -->
      <div v-if="showOnboardingHint" class="sn-onboarding-hint">
        <div class="sn-onboarding-hint-title">Start typing — or try one of these:</div>
        <ul class="sn-onboarding-hint-list">
          <li><KeyboardShortcut combo="Mod+K" /> <span>Command palette — every action, searchable</span></li>
          <li><KeyboardShortcut combo="?" /> <span>Keyboard shortcuts</span></li>
          <li><KeyboardShortcut combo="Mod+E" /> <span>Smart Fill — type 1–2 examples, then fill the column</span></li>
        </ul>
        <div class="sn-onboarding-hint-actions">
          <Button size="sm" variant="solid" @click="dismissOnboardingHint">Got it</Button>
        </div>
      </div>

      <!-- Floating charts (filtered to current sub-sheet by the overlay). -->
      <ChartOverlay
        :charts="chartList"
        :current-sheet="currentSheet"
        :get-matrix="getChartMatrix"
        :selected-id="selectedChartId"
        :suppressed="chartDialogOpen"
        @select="selectChart"
        @edit="openChartEdit"
        @delete="onChartDelete"
        @refresh="onChartRefresh"
        @move="onChartMove"
        @resize="onChartResize"
      />

      <VersionHistory
        :open="vhOpen"
        :versions="vhVersions"
        :loading="vhLoading"
        :error="vhError"
        :active-version="vhActive"
        @close="closeVersionHistory"
        @select="previewVersion"
        @name="nameVersionInline"
        @copy="makeACopyInline"
        @restore="restoreVersionInline"
      />

      <CellHistoryPopover
        v-model="cellHistory.open"
        :cell-ref="cellHistory.cell"
        :entries="cellHistory.entries"
        :loading="cellHistory.loading"
        :error="cellHistory.error"
      />

      <SplitTextPopover
        :open="splitText.open"
        :anchor="splitText.anchor"
        :selected="splitText.choice"
        @choose="onSplitChoose"
        @apply="onSplitApply"
        @cancel="onSplitCancel"
      />

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

      <!-- Remote cursor overlays — one per peer on the same sub-sheet -->
      <div
        v-for="cur in visibleRemoteCursors"
        :key="cur.user"
        class="sn-remote-cursor"
        :style="cur.style"
        :title="cur.fullName"
      >
        <span class="sn-remote-cursor-label">{{ cur.initials }}</span>
      </div>

      <!-- Pivot FAB — floats below the Grand Total row, like Google Sheets -->
      <Dropdown v-if="activePivotConfig && pivotFabStyle" :options="pivotBannerMenuOptions" placement="top-start">
        <template #default="{ open }">
          <button class="sn-pivot-fab" :class="{ open }" :style="pivotFabStyle" title="Pivot table options">
            <FeatherIcon name="edit-2" class="sn-pivot-fab-icon" />
          </button>
        </template>
      </Dropdown>

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
      <input name="add-rows-count" class="sn-addrows-input" type="number" min="1" max="10000" v-model.number="addRowsCount" />
      <span class="sn-addrows-label">more rows at the bottom</span>
      <Button variant="subtle" size="sm" iconLeft="plus" label="Add" @click="doAddMoreRows" />
    </div>

    <!-- Bottom · sheet tabs + selection stats -->
    <div class="sn-bottom">
      <div class="sn-tabs-track">
        <div
          v-for="name in sheetNames"
          :key="name"
          class="sn-tab"
          :class="{
            'sn-tab--active':   name === currentSheet,
            'sn-tab--pivot':    isPivotSheet(name),
            'sn-tab-drag-over': tabDragOver === name && tabDragName !== name,
          }"
          draggable="true"
          @dragstart="onTabDragStart($event, name)"
          @dragend="onTabDragEnd"
          @dragover.prevent="onTabDragOver($event, name)"
          @drop.prevent="onTabDrop($event, name)"
        >
          <!-- One visual unit: label + (active-only) chevron share a single
               pill background so they read as one button. The chevron only
               renders on the active tab; right-click on any inactive tab
               opens the same menu. -->
          <Button
            variant="ghost"
            size="sm"
            :iconLeft="isPivotSheet(name) ? 'layout' : undefined"
            :label="name"
            class="sn-tab-btn"
            @mousedown="onTabMousedown($event, name)"
            @click="onTabClick(name)"
            @dblclick="openRenameDialog(name)"
            @contextmenu.prevent="openTabMenu($event, name)"
          />
          <Button
            v-if="name === currentSheet"
            variant="ghost"
            size="sm"
            icon="chevron-down"
            class="sn-tab-chevron"
            @click.stop="openTabMenu($event, name)"
          />
        </div>

        <Button variant="ghost" size="sm" icon="plus" class="sn-tab-add" tooltip="Add sheet" @click="addSheet" />
      </div>

      <div v-if="selectionStats" class="sn-stats">
        <span v-if="selectionStats.count > 0">Count: {{ selectionStats.count }}</span>
        <span v-if="selectionStats.sum !== null">Sum: {{ formatStat(selectionStats.sum) }}</span>
        <span v-if="selectionStats.avg !== null">Avg: {{ formatStat(selectionStats.avg) }}</span>
      </div>
    </div>

    <!-- Sheet-tab context menu (rename / duplicate / delete) -->
    <div v-if="tabMenu.open" class="sn-ctx-menu" :style="{ left: tabMenu.x + 'px', bottom: tabMenu.bottom + 'px' }">
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
        <FormControl ref="renameInputRef" v-model="renameValue" label="New name" placeholder="Sheet name" @keydown.enter="confirmRename" />
        <p v-if="renameError" class="sn-rename-err">{{ renameError }}</p>
      </template>
      <template #actions>
        <Button variant="solid" @click="confirmRename">Rename</Button>
        <Button @click="showRenameDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Right-click context menu (cursor-anchored; uses Frappe UI Buttons internally) -->
    <div v-if="contextMenu.open" class="sn-ctx-menu"
         :style="contextMenu.useBottom
           ? { left: contextMenu.x + 'px', bottom: contextMenu.bottom + 'px', maxHeight: contextMenu.maxH + 'px' }
           : { left: contextMenu.x + 'px', top:    contextMenu.y      + 'px', maxHeight: contextMenu.maxH + 'px' }">

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
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="check-square"   label="Data validation…" @click="contextMenu.open=false; openValidationDialog()" />
        <Button variant="ghost" size="sm" iconLeft="blend"          label="Conditional format…" @click="contextMenu.open=false; openCfDialog(null)" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="columns"        label="Split text to columns" @click="doSplitTextToColumns()" />
        <hr class="sn-ctx-sep" />
        <Button variant="ghost" size="sm" iconLeft="layout"         label="Insert pivot table…"   @click="openPivotDialog()" />
        <Button variant="ghost" size="sm" iconLeft="bar-chart-2"    label="Insert chart…"          @click="openChartDialog()" />
      </template>

    </div>

    <!-- Pivot dialog -->
    <PivotDialog
      v-model="pivotDialogOpen"
      :sheet="sheet"
      :current-sheet="currentSheet"
      :initial-range="pivotInitialRange"
      :pivot-id="pivotEditId"
      :existing-config="pivotEditConfig"
      @confirm="onPivotConfirm"
    />

    <!-- Chart dialog -->
    <ChartDialog
      v-model="chartDialogOpen"
      :sheet="sheet"
      :current-sheet="currentSheet"
      :initial-range="chartInitialRange"
      :chart-id="chartEditId"
      :existing-config="chartEditConfig"
      @confirm="onChartConfirm"
    />

    <!-- Named ranges dialog -->
    <NamedRangesDialog
      v-model="namedRangesDialogOpen"
      :named-ranges="namedRanges"
      :sheet-names="sheetNames"
      :current-sheet="currentSheet"
      @changed="_onNamedRangesChanged"
    />

    <!-- Share dialog -->
    <ShareDialog
      v-model="shareOpen"
      :sheet-id="props.id"
      :sheet-title="currentTitle"
      :owner-id="userEmail"
      @shares-changed="shareCount = $event"
    />

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
        <div class="sn-form-stack">
          <FormControl v-model="hyperlinkText" label="Display text" placeholder="Click here" />
          <FormControl v-model="hyperlinkUrl"  label="Link URL" placeholder="https://example.com" @keydown.enter="confirmHyperlink" />
        </div>
      </template>
      <template #actions>
        <Button v-if="hasActiveHyperlink" theme="red" @click="removeHyperlink">Remove</Button>
        <Button variant="solid" @click="confirmHyperlink">Apply</Button>
        <Button @click="showHyperlinkDialog = false">Cancel</Button>
      </template>
    </Dialog>

    <!-- Data validation dialog -->
    <Dialog v-model="validationDialog.open" :options="{ title: 'Data validation', size: 'sm' }">
      <template #body-content>
        <div class="sn-form-stack">
          <!-- Type -->
          <FormControl type="select" label="Type" v-model="validationDialog.type"
            :options="[
              { label: 'List of items',  value: 'list' },
              { label: 'Number',         value: 'number' },
              { label: 'Text length',    value: 'text_length' },
            ]"
          />

          <!-- List -->
          <FormControl v-if="validationDialog.type === 'list'"
            v-model="validationDialog.listRaw"
            label="Items (comma-separated)"
            placeholder="Yes, No, Maybe"
          />

          <!-- Operator (number / text_length) -->
          <FormControl v-if="validationDialog.type !== 'list'"
            type="select" label="Condition" v-model="validationDialog.operator"
            :options="[
              { label: 'Between',             value: 'between' },
              { label: 'Not between',         value: 'not_between' },
              { label: 'Greater than',        value: 'gt' },
              { label: 'Greater than or equal', value: 'gte' },
              { label: 'Less than',           value: 'lt' },
              { label: 'Less than or equal',  value: 'lte' },
              { label: 'Equal to',            value: 'eq' },
              { label: 'Not equal to',        value: 'neq' },
            ]"
          />

          <!-- Values -->
          <div v-if="validationDialog.type !== 'list'" class="sn-vd-vals">
            <FormControl
              v-model="validationDialog.val1"
              type="number"
              :label="['between','not_between'].includes(validationDialog.operator) ? 'Min' : 'Value'"
            />
            <FormControl
              v-if="['between','not_between'].includes(validationDialog.operator)"
              v-model="validationDialog.val2"
              type="number"
              label="Max"
            />
          </div>

          <!-- Custom error message -->
          <FormControl
            v-model="validationDialog.message"
            label="Error message (optional)"
            placeholder="This value is not allowed"
          />
        </div>
      </template>
      <template #actions>
        <Button variant="solid" @click="confirmValidation">Apply</Button>
        <Button variant="ghost" theme="red" @click="removeValidation">Remove rule</Button>
        <Button @click="validationDialog.open = false">Cancel</Button>
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

    <!-- Comment panel (floating near cell) -->
    <div v-if="commentPanel.open" class="sn-comment-panel"
         :style="{ left: commentPanel.x + 'px', top: commentPanel.y + 'px' }">
      <div class="sn-comment-header">
        <span class="sn-comment-title">Note</span>
        <Button variant="ghost" size="sm" icon="x" @click="commentPanel.open = false" />
      </div>
      <textarea class="sn-comment-ta" v-model="commentPanel.text" rows="4" placeholder="Add a note…" @blur="saveComment" />
      <div class="sn-comment-actions">
        <Button size="sm" variant="solid" @click="saveComment">Save</Button>
        <Button size="sm" variant="ghost" theme="red" @click="deleteComment">Delete</Button>
      </div>
    </div>

    <!-- Validation dropdown panel -->
    <div v-if="dropdownPanel.open" class="sn-dropdown-panel"
         :style="{ left: dropdownPanel.x + 'px', top: dropdownPanel.y + 'px', minWidth: dropdownPanel.w + 'px' }">
      <div v-for="opt in dropdownPanel.options" :key="opt"
           class="sn-dropdown-opt" @mousedown.prevent="pickDropdownOption(opt)">
        {{ opt }}
      </div>
    </div>

    <!-- Conditional formatting dialog -->
    <Dialog v-model="cfDialog.open" :options="{ title: 'Conditional formatting', size: 'sm' }">
      <template #body-content>
        <div class="sn-form-stack">
          <!-- Existing rules — click to edit, ✕ to delete. Only shown when
               the active sheet has any rules; otherwise we jump straight to
               the editor for the new rule. -->
          <div v-if="cfRulesForSheet.length" class="sn-cf-rule-list">
            <div class="sn-cf-rule-list-title">Rules on this sheet</div>
            <div v-for="r in cfRulesForSheet" :key="r.id" class="sn-cf-rule-row"
                 :class="{ 'sn-cf-rule-row--active': cfDialog.editId === r.id }">
              <button type="button" class="sn-cf-rule-pick" @click="openCfDialog(r.id)">
                {{ cfRuleLabel(r) }}
              </button>
              <Button variant="ghost" size="sm" icon="x" theme="red"
                      @click="deleteCfRuleById(r.id)" tooltip="Delete rule" />
            </div>
          </div>

          <FormControl type="select" label="Rule type" v-model="cfDialog.kind" :options="CF_KIND_OPTIONS" />

          <!-- Classic single-colour rule (the original feature). -->
          <template v-if="cfDialog.kind === 'classic'">
            <FormControl type="select" label="Condition" v-model="cfDialog.condType" :options="CF_COND_OPTIONS" />
            <FormControl v-if="!['empty','notempty'].includes(cfDialog.condType)"
                         v-model="cfDialog.condValue" label="Value" placeholder="e.g. 0" />
            <FormControl v-if="cfDialog.condType === 'between'"
                         v-model="cfDialog.condValue2" label="And" placeholder="e.g. 100" />
            <div class="sn-cf-fmt">
              <label class="sn-swatch-btn" title="Text colour">
                <FeatherIcon name="type" class="sn-swatch-glyph" />
                <span class="sn-swatch-underline" :style="{ background: cfDialog.fmtColor || '#171717' }"></span>
                <input name="cf-text-color" type="color" :value="cfDialog.fmtColor || '#171717'" @input="cfDialog.fmtColor = $event.target.value" />
              </label>
              <label class="sn-swatch-btn" title="Fill colour">
                <FeatherIcon name="droplet" class="sn-swatch-glyph" />
                <span class="sn-swatch-underline sn-swatch-fill" :style="{ background: cfDialog.fmtBg || '#ffffff' }"></span>
                <input name="cf-fill-color" type="color" :value="cfDialog.fmtBg || '#ffffff'" @input="cfDialog.fmtBg = $event.target.value" />
              </label>
              <span class="sn-cf-fmt-label">Apply to range: {{ cfRangeLabel }}</span>
            </div>
          </template>

          <!-- Colour scale: 2- or 3-stop gradient mapped across the range's min/max. -->
          <template v-else-if="cfDialog.kind === 'color-scale'">
            <FormControl type="select" label="Variant" v-model="cfDialog.scaleVariant" :options="CF_SCALE_VARIANT_OPTIONS" />
            <div class="sn-cf-scale">
              <label class="sn-cf-stop">
                <span>Min</span>
                <input name="cf-scale-min" type="color" v-model="cfDialog.scaleMin" />
              </label>
              <label v-if="cfDialog.scaleVariant === '3color'" class="sn-cf-stop">
                <span>Mid</span>
                <input name="cf-scale-mid" type="color" v-model="cfDialog.scaleMid" />
              </label>
              <label class="sn-cf-stop">
                <span>Max</span>
                <input name="cf-scale-max" type="color" v-model="cfDialog.scaleMax" />
              </label>
            </div>
            <div
              class="sn-cf-scale-preview"
              :style="{ background: cfDialog.scaleVariant === '3color'
                ? `linear-gradient(90deg, ${cfDialog.scaleMin}, ${cfDialog.scaleMid}, ${cfDialog.scaleMax})`
                : `linear-gradient(90deg, ${cfDialog.scaleMin}, ${cfDialog.scaleMax})` }"
            />
            <span class="sn-cf-fmt-label">Apply to range: {{ cfRangeLabel }}</span>
          </template>

          <!-- Data bars: horizontal bar inside each cell, proportional to value. -->
          <template v-else-if="cfDialog.kind === 'data-bar'">
            <label class="sn-cf-stop">
              <span>Bar colour</span>
              <input name="cf-bar-color" type="color" v-model="cfDialog.barColor" />
            </label>
            <div class="sn-cf-bar-preview">
              <div class="sn-cf-bar-row" v-for="t in [0.25, 0.5, 0.85]" :key="t">
                <div class="sn-cf-bar-fill" :style="{ width: (t * 100) + '%', background: cfDialog.barColor }" />
              </div>
            </div>
            <span class="sn-cf-fmt-label">Apply to range: {{ cfRangeLabel }}</span>
          </template>

          <!-- Icon sets: small icons at the start of each cell based on bucket. -->
          <template v-else-if="cfDialog.kind === 'icon-set'">
            <FormControl type="select" label="Icon set" v-model="cfDialog.iconSet" :options="CF_ICON_SET_OPTIONS" />
            <span class="sn-cf-fmt-label">Apply to range: {{ cfRangeLabel }}</span>
            <p class="sn-cf-hint">Values are split into three equal buckets across the range.</p>
          </template>
        </div>
      </template>
      <template #actions>
        <Button v-if="cfDialog.editId !== null" theme="red" @click="deleteCfRule">Delete</Button>
        <Button variant="solid" @click="saveCfRule">Apply</Button>
        <Button @click="cfDialog.open = false">Cancel</Button>
      </template>
    </Dialog>


  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createGrid }          from '../../canvas/index.js'
import { colLabel, parseCellId, cellId } from '../../utils/cells.js'
import { parseNumberFmt, buildNumberFmt, applyNumberFmt } from '../../utils/format-number.js'
import { getTextWrap } from '../../utils/text-wrap.js'
import { computeFillDown, computeFillRight } from '../../engine/fill-series.js'
import { detectSeries }                       from '../../engine/patterns/index.js'
import { adjustFormula }                    from '../../engine/formula-adjust.js'
import { createSheet }         from '../../engine/sheet.js'
import { createHistory }       from '../../engine/history.js'
import { createFormatsEngine } from '../../engine/formats.js'
import { createMergeEngine }   from '../../engine/merge.js'
import { createClipboard }     from '../../engine/clipboard.js'
import { createSortFilter }    from '../../engine/sortFilter.js'
import { createCommentsEngine }  from '../../engine/comments.js'
import { createValidationEngine } from '../../engine/validation.js'
import { createCondFormatEngine } from '../../engine/cond-format.js'
import { useToolbar }          from './useToolbar.js'
import { usePersistence }      from './usePersistence.js'
import { useSheetTabs }        from './useSheetTabs.js'
import { useFormulaAutocomplete, AC_FUNS } from './useFormulaAutocomplete.js'
import { buildAlignOptions, buildBorderOptions, buildMoreToolbarOptions } from './toolbar.config.js'
import { useContextMenu } from './useContextMenu.js'
import { usePivotIntegration } from './usePivotIntegration.js'
import { useShortcuts } from './useShortcuts.js'
import { useCollaboration }    from './useCollaboration.js'
import { useExportImport }     from './useExportImport.js'
import { useVersionHistory }   from './useVersionHistory.js'
import { useSplitText }        from './useSplitText.js'
import { buildCommandGroups }  from './commandPalette.config.js'
import FindReplace             from './FindReplace.vue'
import VersionHistory          from './VersionHistory.vue'
import VersionPreviewBanner    from './VersionPreviewBanner.vue'
import CellHistoryPopover      from './CellHistoryPopover.vue'
import SplitTextPopover        from './SplitTextPopover.vue'
import ShareDialog             from './ShareDialog.vue'
import PivotDialog             from './PivotDialog.vue'
import { createPivotEngine } from '../../engine/pivot.js'
import { createChartEngine } from '../../engine/charts.js'
import { useChartIntegration } from './useChartIntegration.js'
import ChartDialog             from './ChartDialog.vue'
import ChartOverlay            from './ChartOverlay.vue'
import { createNamedRanges }   from '../../engine/named-ranges.js'
import { getFunctionNames }    from '../../engine/formula.js'
import NamedRangesDialog       from './NamedRangesDialog.vue'
import { useSmartFill }        from './useSmartFill.js'
import * as versionsApi        from '../../services/versions.js'
import { KeyboardShortcut, TextInput } from 'frappe-ui'

const props = defineProps({ id: { type: String, default: 'new' } })
const emit  = defineEmits(['close', 'saved'])

// ── Engine instances ──────────────────────────────────────────────────────────

const sheet = createSheet({
  onCellChanged(id, displayValue) {
    // Range-scoped cond-format rules (color-scale, data-bar, icon-set) cache
    // per-rule min/max stats — any cell change can shift those bounds, so the
    // cache must be cleared before the next paint.
    condFormat?.invalidate()
    if (showFormulas.value) {
      grid?.setCell(id, String(sheet.getCell(id) ?? ''))
      return
    }
    const fmt = formats.get(id, sheet.getCurrentSheet())
    const displayed = fmt.numberFormat ? applyNumberFmt(displayValue, fmt.numberFormat) : displayValue
    grid?.setCell(id, displayed)
  },
  // Bulk-write callback — fires once after batchSetCells (large imports).
  // Skip the per-cell repaint cascade and use _repopulateGrid's existing
  // bulk-fill path. condFormat stats are invalidated once instead of N times.
  onCellsChanged() {
    condFormat?.invalidate()
    _repopulateGrid()
  },
})
const formats    = createFormatsEngine()
const merge      = createMergeEngine()
const sortFilter = createSortFilter(sheet)
const comments   = createCommentsEngine()
const validation = createValidationEngine()
const condFormat = createCondFormatEngine()
const clipboard  = createClipboard({ sheet, formats, condFormat, validation })
const pivot      = createPivotEngine()
const charts     = createChartEngine()
// Named ranges: the validator hook prevents users from defining names that
// collide with the formula engine's built-in functions (SUM, VLOOKUP, etc.).
const _builtinFns = new Set(getFunctionNames())
const namedRanges = createNamedRanges({ isBuiltinFunction: n => _builtinFns.has(n) })

// Plug the named-range resolver into the sheet engine so `=Revenue` etc.
// resolve at evaluate-time without crossing engine boundaries via imports.
sheet.setNamedRangeResolver?.(name => namedRanges.resolve(name))

// Dialog state — toolbar / context-menu entries flip this open. Changes
// inside the dialog (add/edit/delete) mark the workbook dirty and push a
// history snapshot so undo/redo behaves predictably.
const namedRangesDialogOpen = ref(false)
function openNamedRangesDialog() {
  contextMenu.open = false
  namedRangesDialogOpen.value = true
}
function _onNamedRangesChanged() {
  // The engine notifies via onChange too, but we explicitly push history
  // here so each batched add/edit/delete becomes its own undoable event.
  history.push()
  isDirty.value = true
  // Names that map to range references can affect cell display via the
  // formula engine — repaint so any =Name cells refresh.
  _repopulateGrid()
}

// Smart Fill — Cmd/Ctrl+E. Looks at the user's example values in the
// selected column, detects a heuristic transform (case / concat / word /
// substring / email-part), and fills the rest.
const { runSmartFill: _runSmartFill } = useSmartFill({
  getSheet:        () => sheet,
  getGrid:         () => grid,
  queueOp:         (...a) => _queueOp(...a),
  captureRange:    (...a) => _captureRange(...a),
  diffRefs:        (...a) => _diffRefs(...a),
  getHistory:      () => history,
  getIsDirty:      () => isDirty,
  repopulateGrid:  () => _repopulateGrid(),
})
function runSmartFill() {
  const result = _runSmartFill()
  if (!result.ok) {
    // Hint the user when there's nothing to fill — quiet failure feels broken.
    const hints = {
      'single-column-only':  'Smart Fill works on a single column at a time.',
      'no-examples':         'Fill in 1–2 example cells first, then select the range and press Cmd+E.',
      'no-empty-cells':      'No empty cells in the selection to fill.',
      'no-source-columns':   'Smart Fill needs adjacent columns with source data.',
      'no-pattern':          "Couldn't detect a pattern from your examples.",
      'no-fills':            "Detected a pattern but couldn't apply it to any rows.",
    }
    saveError.value = hints[result.reason] || 'Smart Fill could not run.'
    setTimeout(() => { saveError.value = '' }, 3500)
  }
}

// Single source of truth for "what does undo restore?". Every engine that
// owns mutable state (sheet data, formats, merges, filters, comments,
// validations, conditional formats) plus the canvas-side view state (column
// widths, freeze, hidden rows/cols, zoom, total rows) is captured. Anything
// not snapshotted here is invisible to undo — that was the bug behind
// "filter doesn't undo".
const history = createHistory({
  snapshot() {
    return {
      sheet:        sheet.snapshot(),
      formats:      formats.snapshot(),
      merge:        merge.snapshot(),
      sortFilter:   sortFilter.snapshot(),
      comments:     comments.snapshot(),
      validation:   validation.snapshot(),
      condFormat:   condFormat.snapshot(),
      pivot:        pivot.snapshot(),
      charts:       charts.snapshot(),
      namedRanges:  namedRanges.snapshot(),
      view:         grid?.viewSnapshot?.() ?? null,
    }
  },
  restore(snap, opts = {}) {
    formats.restore(snap.formats)
    // Cell-level restore: in collab mode, the history hands us a `touches`
    // set listing exactly which cells THIS client touched in the undone
    // op. We revert only those — anything a remote peer changed in the
    // interim stays put. Non-collab mode (or initial snapshot with no
    // touches) falls back to the wholesale sheet.restore() to preserve
    // long-standing behaviour.
    if (opts.touches && opts.touches.size > 0) {
      _restoreTouchedCells(snap.sheet, opts.touches)
    } else {
      sheet.restore(snap.sheet)
    }
    if (snap.merge)       merge.restore(snap.merge)
    if (snap.sortFilter)  sortFilter.restore(snap.sortFilter)
    if (snap.comments)    comments.restore(snap.comments)
    if (snap.validation)  validation.restore(snap.validation)
    if (snap.condFormat)  condFormat.restore(snap.condFormat)
    if (snap.pivot)       pivot.restore(snap.pivot)
    if (snap.charts)      charts.restore(snap.charts)
    if (snap.namedRanges) namedRanges.restore(snap.namedRanges)
    if (snap.view && grid?.viewRestore) grid.viewRestore(snap.view)
    // Caller (undo/redo) repopulates the canvas + reapplies hidden rows.
  },
  getLocalTouches: () => _drainCollabLocalTouches(),
})

// Forward-declaration: `useCollaboration` (further down the script) sets
// `_collabDrainLocalTouches` to its real implementation once the binding
// is up. Before that, the history degrades cleanly to full-restore by
// returning an empty set.
let _collabDrainLocalTouches = () => new Set()
function _drainCollabLocalTouches() { return _collabDrainLocalTouches() }

// Revert just the cells in `touches` to their values from `sheetSnap`.
// `touches` is a Set of "sheetName|cellId" keys. Going through sheet.setCell
// keeps deps + the Y.Doc mirror + the engine notify-callbacks in sync, so
// peers see our undo as a regular write.
function _restoreTouchedCells(sheetSnap, touches) {
  const allSheets = sheetSnap?.sheets || sheetSnap || {}
  for (const key of touches) {
    const idx = key.indexOf('|')
    if (idx < 0) continue
    const sn = key.slice(0, idx)
    const id = key.slice(idx + 1)
    const original = allSheets[sn]?.[id] ?? ''
    sheet.setCell(id, original, sn)
  }
}

// ── Vue state ─────────────────────────────────────────────────────────────────

const canvasRef       = ref(null)
const gridWrapRef     = ref(null)
const formulaInputRef = ref(null)
const csvInputRef     = ref(null)
const xlsxInputRef    = ref(null)

const activeCell        = ref('A1')
const formulaValue      = ref('')
const canUndo           = ref(false)
const canRedo           = ref(false)
const currentTitle      = ref('Untitled Spreadsheet')
const activeNumberFormat = ref('')

// Cross-sheet picker: when the user starts a `=…` edit in the top formula
// bar then clicks another sheet's tab, we keep the in-progress formula alive
// across the switch. These refs remember where to write the formula back on
// commit; null when no cross-sheet edit is in flight.
const editingHomeSheet = ref(null)
const editingHomeCell  = ref(null)
// Dropdown reflects the *type* only ('number' / 'currency' / ...), so a stored
// `number:3` still shows "Number" as selected.
const activeNumberFormatType = computed(() => parseNumberFmt(activeNumberFormat.value).type)
const showFindReplace   = ref(false)
const showShortcutsHelp = ref(false)

// First-time onboarding hint. Persists dismissal across sessions via
// localStorage, and only shows for blank workbooks so it never gets in
// the way of users opening an existing sheet.
const ONBOARDING_HINT_KEY = 'fsn:onboardingHintDismissed'
const _onboardingHintDismissed = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDING_HINT_KEY) === '1',
)
const showOnboardingHint = computed(() => {
  if (_onboardingHintDismissed.value) return false
  if (isDirty.value) return false
  // Workbook is "blank" when no sub-sheet has any cell data.
  const sheets = sheet.getSheetNames()
  for (const name of sheets) {
    const raw = sheet.getRawData(name)
    if (raw && Object.keys(raw).length) return false
  }
  return true
})
function dismissOnboardingHint() {
  _onboardingHintDismissed.value = true
  try { localStorage.setItem(ONBOARDING_HINT_KEY, '1') } catch {}
}
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
    { label: 'Smart Fill from examples',  combos: ['Mod+E'] },
    { label: 'Cut / Copy / Paste',        combos: ['Mod+X', 'Mod+C', 'Mod+V'] },
    { label: 'Undo / Redo',               combos: ['Mod+Z', 'Mod+Y'] },
    { label: 'Repeat last action',        combos: ['F4'] },
    { label: 'Add / edit comment',        combos: ['Shift+F2'] },
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
    { label: 'Version history',           combos: ['Mod+Alt+Shift+H'] },
    { label: 'Zoom in / out / reset',     combos: ['Mod+=', 'Mod+-', 'Mod+0'] },
    { label: 'Shortcut help',             combos: ['?'] },
  ]},
]
const selectionStats    = ref(null)
const isDirty           = ref(false)
const isPaintingFormat  = ref(false)

// ── Comment UI state ──────────────────────────────────────────────────────────
const commentPanel  = reactive({ open: false, id: '', text: '', x: 0, y: 0 })

// ── Dropdown (validation) UI state ────────────────────────────────────────────
const dropdownPanel    = reactive({ open: false, id: '', options: [], x: 0, y: 0, w: 120 })
const validationDialog = reactive({
  open: false,
  type:     'list',      // 'list' | 'number' | 'text_length'
  operator: 'between',   // 'between' | 'not_between' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  val1:     '',
  val2:     '',
  listRaw:  '',
  message:  '',
})

// ── Conditional format dialog state ───────────────────────────────────────────
const cfDialog = reactive({
  open: false, editId: null,
  range: { r0: 0, c0: 0, r1: 0, c1: 0 },
  // 'classic' = one-off condition (the original feature).
  // 'color-scale' / 'data-bar' / 'icon-set' = range-scoped scales.
  kind: 'classic',
  condType: 'gt', condValue: '', condValue2: '',
  fmtColor: '', fmtBg: '',
  // Scale-rule state (read only when `kind` is non-classic).
  scaleVariant: '2color',
  scaleMin: '#FFFFFF',
  scaleMid: '#FFEB3B',
  scaleMax: '#0E7490',
  barColor: '#0E7490',
  iconSet:  'arrows3',
})



const cellHistory = reactive({
  open: false, cell: '', loading: false, error: '', entries: [],
})

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

// Flat list driving the dropdown — groups give the menu its sectioned layout.
// Each entry is a stored format string; clicking applies it as-is.
const NUMBER_FORMAT_GROUPS = [
  { group: 'General', items: [
    { label: 'General',         value: ''            },
    { label: 'Plain text',      value: 'text'        },
  ]},
  { group: 'Number', items: [
    { label: 'Decimal',         value: 'number'      },
    { label: 'Decimal — Indian (1,23,456)', value: 'number:in' },
    { label: 'Percent',         value: 'percentage'  },
  ]},
  { group: 'Currency', items: [
    { label: 'USD ($)',         value: 'currency:USD:2' },
    { label: 'EUR (€)',         value: 'currency:EUR:2' },
    { label: 'GBP (£)',         value: 'currency:GBP:2' },
    { label: 'INR (₹)',         value: 'currency:INR:2' },
    { label: 'JPY (¥)',         value: 'currency:JPY:0' },
  ]},
  { group: 'Date', items: [
    { label: 'Auto (locale)',           value: 'date'         },
    { label: 'DD/MM/YYYY',              value: 'date:dmy'     },
    { label: 'MM/DD/YYYY',              value: 'date:mdy'     },
    { label: 'YYYY-MM-DD',              value: 'date:ymd'     },
    { label: '15 Jan 2025',             value: 'date:long'    },
    { label: 'Mon, 15 Jan 2025',        value: 'date:full'    },
  ]},
  { group: 'Time', items: [
    { label: '15:30',           value: 'time:hm'     },
    { label: '15:30:45',        value: 'time:hms'    },
    { label: '3:30 PM',         value: 'time:hm12'   },
    { label: '3:30:45 PM',      value: 'time:hms12'  },
  ]},
  { group: 'Date + Time', items: [
    { label: '15/01/2025, 3:30 PM',     value: 'datetime:dmy_hm12'  },
    { label: '15 Jan 2025, 3:30 PM',    value: 'datetime:long_hm12' },
    { label: '2025-01-15, 15:30:00',    value: 'datetime:ymd_hms'   },
  ]},
]

// Quick-pick currencies surfaced via the $ button. Click cycles to that
// currency; clicking the active one toggles currency back off.
const CURRENCY_QUICK_PICKS = [
  { label: 'USD ($)', code: 'USD', symbol: '$' },
  { label: 'EUR (€)', code: 'EUR', symbol: '€' },
  { label: 'GBP (£)', code: 'GBP', symbol: '£' },
  { label: 'INR (₹)', code: 'INR', symbol: '₹' },
  { label: 'JPY (¥)', code: 'JPY', symbol: '¥' },
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

const fileDropdownOptions = computed(() => [
  { group: 'Export', items: [
    { label: 'Export as CSV',  icon: 'download',  onClick: () => exportCSV() },
    { label: 'Export as XLSX', icon: 'download',  onClick: () => exportXLSX() },
    { label: 'Export as PDF',  icon: 'printer',   onClick: () => exportPDF() },
  ]},
  { group: 'Import', items: [
    { label: 'Import CSV',  icon: 'upload', onClick: () => csvInputRef.value?.click() },
    { label: 'Import XLSX', icon: 'upload', onClick: () => xlsxInputRef.value?.click() },
  ]},
])

const hAlignIcon = computed(() => {
  if (activeFormat.value?.align === 'center') return 'align-center'
  if (activeFormat.value?.align === 'right')  return 'align-right'
  return 'align-left'
})


// Title input auto-sizes to content so the "Saved / Saving…" status sits
// right next to the title text — no trailing whitespace. Per-char width
// tracks the 15px/600 font in .sn-title-input. The lower bound is just a
// clickable target for very short titles, NOT a baseline width.
const titleInputWidth = computed(() => {
  const text = currentTitle.value || 'Untitled Spreadsheet'
  return Math.max(56, Math.min(360, text.length * 10 + 24)) + 'px'
})


const userEmail   = window.frappe?.session?.user || ''
const userInitial = computed(() => (userEmail ? userEmail[0] : 'U').toUpperCase())

// Collaboration — presence + sharing
const shareOpen   = ref(false)
const shareCount  = ref(0)   // explicit share count (excluding owner); updated by ShareDialog
const { exportCSV, exportXLSX, exportPDF, importCSV, importXLSX } = useExportImport({
  getSheet:        () => sheet,
  getCurrentTitle: () => currentTitle.value,
  getGrid:         () => grid,
  queueOp:         _queueOp,
  markEdited,
  repopulateGrid:  _repopulateGrid,
  syncFlags,
  isDirty,
  history,
})

const filterPanel = reactive({
  open: false, col: 0, operator: 'contains', value: '', style: {},
})

// Auto-close the filter popover on any click outside its body or the
// chevron that opened it. Mirrors how Google Sheets handles this — users
// shouldn't have to remember to hit "Close" before editing a cell.
function _filterPanelOutsideClick(e) {
  const t = e.target
  if (!t || !(t instanceof Element)) return
  if (t.closest('.sn-filter-panel')) return     // click inside the popover itself
  if (t.closest('.sn-filter-btn'))   return     // click on a chevron toggles its own panel
  filterPanel.open = false
}
watch(() => filterPanel.open, (open) => {
  // `mousedown` (not click) so the close fires before any other component
  // gets the focus/selection event — keeps the panel from leaving stale
  // state behind when the user just clicks elsewhere in the sheet.
  if (open) document.addEventListener('mousedown', _filterPanelOutsideClick, true)
  else      document.removeEventListener('mousedown', _filterPanelOutsideClick, true)
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


// ── Number format helpers ─────────────────────────────────────────────────────
// Grammar + renderer live in utils/format-number.js so they can be unit-tested
// in isolation. The toolbar wiring below is the only Vue-specific bit.

// Bump decimal precision for the selection. Treats 'General' as 'number:1' on
// first +, no-op on -. Numeric types pick a sensible default if no decimals
// were previously set.
function adjustDecimals(delta) {
  const ids = selectionIds()
  const sh = sheet.getCurrentSheet()
  for (const id of ids) {
    const cur = formats.get(id, sh).numberFormat || ''
    let { type, variant, decimals } = parseNumberFmt(cur)
    if (!type) {
      if (delta < 0) continue
      type = 'number'
      decimals = 0
    }
    const defaultDec = type === 'currency' ? 2 : type === 'percentage' ? 2 : 2
    if (decimals == null) decimals = defaultDec
    decimals = Math.max(0, Math.min(20, decimals + delta))
    const next = buildNumberFmt(type, variant, decimals)
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

// Toolbar dropdown configs that don't depend on pivot composable.
function toggleSortFilter() { showSortFilter.value = !showSortFilter.value }
const alignDropdownOptions  = buildAlignOptions({ setAlign, setValign })
const borderDropdownOptions = buildBorderOptions({ applyBorder })

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

// Maps the stored format string → human label shown on the dropdown trigger.
// Falls back to the type when the exact format isn't a named preset (e.g.
// the user bumped decimals on a currency format).
const _FORMAT_LABELS = (() => {
  const m = new Map()
  for (const g of NUMBER_FORMAT_GROUPS) for (const it of g.items) m.set(it.value, it.label)
  return m
})()

const numberFormatLabel = computed(() => {
  const cur = activeNumberFormat.value
  if (_FORMAT_LABELS.has(cur)) return _FORMAT_LABELS.get(cur)
  const { type, variant } = parseNumberFmt(cur)
  if (!type) return 'General'
  // Synthesise a label for variants that don't have a preset (e.g. user
  // adjusted decimals on a known type+variant combo).
  if (type === 'currency') return `Currency · ${variant || 'USD'}`
  if (type === 'date')     return variant ? `Date · ${variant}` : 'Date'
  if (type === 'time')     return variant ? `Time · ${variant}` : 'Time'
  if (type === 'datetime') return 'Date + Time'
  return type[0].toUpperCase() + type.slice(1)
})

const numberFormatDropdownOptions = computed(() =>
  NUMBER_FORMAT_GROUPS.map(g => ({
    group: g.group,
    items: g.items.map(it => ({
      label: it.label,
      onClick: () => onNumberFormatChange(activeNumberFormat.value === it.value ? '' : it.value),
    })),
  }))
)

// Active currency code (for the $-button symbol). Defaults to $ when the cell
// isn't a currency at all, so the button always says *something* clickable.
const activeCurrencySymbol = computed(() => {
  const { type, variant } = parseNumberFmt(activeNumberFormat.value)
  if (type !== 'currency') return '$'
  const hit = CURRENCY_QUICK_PICKS.find(c => c.code === (variant || 'USD'))
  return hit ? hit.symbol : '$'
})

const currencyDropdownOptions = computed(() =>
  CURRENCY_QUICK_PICKS.map(c => {
    const fmt = `currency:${c.code}:${c.code === 'JPY' ? 0 : 2}`
    return {
      label: c.label,
      onClick: () => onNumberFormatChange(activeNumberFormat.value === fmt ? '' : fmt),
    }
  })
)

function repeatLast() {
  const last = getLastAction()
  if (!last) return
  const handlers = { toggleFmt, setAlign, setValign, setColor, clearFormatting, adjustDecimals, adjustFontSize, setFontSize, setFontFamily, toggleWrap }
  handlers[last.kind]?.(...last.args)
}

// Wrap text needs a row-height bump to actually be visible — toggleFmt alone
// flips the format flag but the renderer's wrapped text gets clipped at the
// Writes `textWrap` (overflow | clip | wrap) for the selection. Auto-fits
// every row to fit wrapped content when the user opts into wrap mode; the
// other modes leave row heights alone (user may have grown rows manually).
function setTextWrap(mode) {
  formats.applyToRange(selectionIds(), { textWrap: mode }, sheet.getCurrentSheet())
  refreshActiveFormat()
  isDirty.value = true
  if (mode === 'wrap' && grid) {
    const { r0, r1 } = grid.getSelection()
    for (let r = r0; r <= r1; r++) grid.autoFitRow(r)
  }
  recordAction?.('setTextWrap', [mode])
}

// Kept for the repeat-last shortcut handler (which dispatches by action
// name); rebound to setTextWrap('wrap') / 'overflow' toggle.
function toggleWrap() {
  setTextWrap(activeTextWrap.value === 'wrap' ? 'overflow' : 'wrap')
}

const activeTextWrap = computed(() => getTextWrap(activeFormat.value))

const TEXT_WRAP_ICON = { overflow: 'corner-down-right', clip: 'minimize', wrap: 'corner-down-left' }
const textWrapIcon   = computed(() => TEXT_WRAP_ICON[activeTextWrap.value] || 'corner-down-left')

const textWrapDropdownOptions = computed(() => [
  { label: 'Overflow', icon: TEXT_WRAP_ICON.overflow, onClick: () => setTextWrap('overflow') },
  { label: 'Clip',     icon: TEXT_WRAP_ICON.clip,     onClick: () => setTextWrap('clip')     },
  { label: 'Wrap',     icon: TEXT_WRAP_ICON.wrap,     onClick: () => setTextWrap('wrap')     },
])

const { isSaving, saveError, loadSheet, autoCreate, saveExisting } =
  usePersistence({
    sheet, formats, merge, comments, validation, condFormat, sortFilter, pivot,
    charts, namedRanges,
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
} = useSheetTabs({ sheet, formats, extras: [comments, validation, condFormat, sortFilter], getGrid: () => grid, activeCell, formulaValue, refreshActiveFormat, onSwitch: () => {
    filterPanel.open = false     // close any open filter popover so it doesn't carry stale state
    _repopulateGrid()
    grid?.setMarchingAnts(null); clipboard.clear(); clipboardHas.value = false
    _applyHiddenRows()           // refresh filter-driven row hides for the new sheet
    // Diff overlay is keyed by sub-sheet name — re-point at the new sheet
    // so the highlight follows the user across tabs in preview mode.
    if (vhActive.value) grid?.setActiveDiffSheet?.(sheet.getCurrentSheet())
  } })

// Formula autocomplete — placed here because sheetNames comes from useSheetTabs above.
const { acItems, acIdx, acUp, acVisible, updateAc, commitAc, closeAc } =
  useFormulaAutocomplete({ formulaInputRef, formulaValue, sheetNames })

// Context menu — placed here because contextMenu is passed to usePivotIntegration below.
const { contextMenu, tabMenu, openCanvasContextMenu: onCanvasContextMenu, openTabMenu } =
  useContextMenu({ getGrid: () => grid })

// renderVersion is defined here because usePivotIntegration reads it at call time.
const renderVersion = ref(0)

// Pivot integration — placed here because switchSheet/syncNames come from useSheetTabs above.
const {
  pivotDialogOpen, pivotInitialRange, pivotEditId, pivotEditConfig, pivotVersion,
  activePivotConfig, pivotFabStyle, pivotBannerMenuOptions,
  isPivotSheet, openPivotDialog, onPivotEdit, onPivotRefresh, onPivotDelete, onPivotConfirm,
  recomputePivotsForSheet,
} = usePivotIntegration({
  pivot, sheet, currentSheet, renderVersion,
  getGrid: () => grid,
  contextMenu, switchSheet, syncNames,
  history, isDirty, repopulateGrid: _repopulateGrid,
})

// Chart integration — engine + dialog wiring. Charts float above the canvas
// (ChartOverlay) and re-derive their source matrices reactively from the
// sheet engine, so any cell edit propagates without explicit refresh calls.
const {
  chartDialogOpen, chartInitialRange, chartEditId, chartEditConfig,
  charts: chartList, selectedChartId, chartVersion,
  openInsert: openChartDialog, openEdit: openChartEdit,
  onChartConfirm, onChartDelete, onChartMove, onChartResize, onChartRefresh,
  selectChart, getMatrix: getChartMatrix,
} = useChartIntegration({
  chart: charts, sheet, currentSheet,
  contextMenu, history, isDirty,
  getGrid: () => grid,
})

const moreToolbarOptions = buildMoreToolbarOptions({
  toggleFmt, toggleWrap, toggleFormatPainter, clearFormatting,
  adjustDecimals, openCfDialog, openHyperlinkDialog, toggleMerge,
  toggleSortFilter, applyBorder, zoomBy, resetZoom, openPivotDialog,
  openChartDialog, openNamedRangesDialog, runSmartFill,
})

// Collaboration — placed here because currentSheet comes from useSheetTabs above.
const { presentUsers, remoteCursors, broadcastCellChange, broadcastBatchChange, broadcastCursor, drainLocalTouches } =
  useCollaboration({
    sheetId:        computed(() => props.id),
    currentSheet,
    getSheet:       () => sheet,
    repopulateGrid: _repopulateGrid,
  })
// Wire the binding's per-segment touch-tracking into the history we declared
// up top — undo() will now revert only this client's writes from the undone
// segment, leaving any remote-applied cells alone.
_collabDrainLocalTouches = drainLocalTouches

// Version history — placed after usePersistence (loadSheet) and useSheetTabs (switchSheet/syncNames).
const {
  vhOpen, vhVersions, vhLoading, vhError, vhActive, vhRestoring, vhDiff, vhStepIdx,
  openVersionHistory, closeVersionHistory,
  previewVersion, exitPreview, stepPreviewDiff,
  restorePreview, nameCurrentPreview, nameVersionInline,
  makeACopyInline, restoreVersionInline,
} = useVersionHistory({
  sheetId:        computed(() => props.id),
  getSheet:       () => sheet,
  getFormats:     () => formats,
  getMerge:       () => merge,
  getComments:    () => comments,
  getValidation:  () => validation,
  getCondFormat:  () => condFormat,
  getSortFilter:  () => sortFilter,
  getGrid:        () => grid,
  currentTitle,
  switchSheet,
  syncNames,
  repopulateGrid: _repopulateGrid,
  syncViewMirrors: _syncViewMirrors,
  loadSheet,
  history,
  activeCell,
})

// Split text — placed after currentSheet from useSheetTabs.
const {
  splitText,
  doSplitTextToColumns,
  onSplitChoose,
  onSplitApply,
  onSplitCancel,
  revertSplitPreview: _revertSplitPreview,
  closeSplit:         _closeSplit,
} = useSplitText({
  getSheet:       () => sheet,
  getGrid:        () => grid,
  getGridWrap:    () => gridWrapRef.value,
  contextMenu,
  currentSheet,
  queueOp:        _queueOp,
  markEdited,
  repopulateGrid: _repopulateGrid,
  syncFlags,
  captureRange:   _captureRange,
  diffRefs:       _diffRefs,
})

// `showSortFilter` is the existing template/handler API; with ranged filters
// it's now derived from "does this sheet have a filter range?".  Writing true
// creates a filter on the current selection; writing false removes it.
const showSortFilter = computed({
  get() {
    renderVersion.value
    return sortFilter.hasFilter(currentSheet.value)
  },
  set(v) { v ? _createFilterOnSelection() : _removeFilter() },
})

function addSheet() { _addSheet(); history.push(); isDirty.value = true }

// ── Sheet-tab click — cross-sheet picker support ──────────────────────────────
// When the user is mid-edit in the formula bar (`=…` content + bar has focus),
// clicking another tab should keep the edit alive instead of trashing it.
// The trick is two-fold: prevent the default mousedown so focus stays on the
// input, and call switchSheet with preserveEdit so activeCell + formulaValue
// don't get clobbered by the switch.
function _isEditingFormulaInBar() {
  return document.activeElement === formulaInputRef.value
    && typeof formulaValue.value === 'string'
    && formulaValue.value.startsWith('=')
}

function _isEditingFormulaInCell() {
  return grid?.isEditingFormula?.() ?? false
}

function _isEditingFormula() {
  return _isEditingFormulaInBar() || _isEditingFormulaInCell()
}

function onTabMousedown(e, _name) {
  // Default mousedown on the tab button focuses it, which would blur the
  // formula-bar input (or the in-cell overlay) before our click handler can
  // snapshot the edit. Suppress only when an active formula edit needs the
  // focused element to keep focus.
  if (_isEditingFormula()) e.preventDefault()
}

function onTabClick(name) {
  if (_isEditingFormula()) {
    if (!editingHomeSheet.value) {
      editingHomeSheet.value = sheet.getCurrentSheet()
      editingHomeCell.value  = activeCell.value
    }
    switchSheet(name, { preserveEdit: true })
    // Re-focus whichever input was being edited — some Buttons steal focus
    // on click despite mousedown preventDefault.
    nextTick(() => {
      if (_isEditingFormulaInCell()) return  // overlay handles its own focus
      formulaInputRef.value?.focus()
    })
  } else {
    switchSheet(name)
  }
}

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
  history.push()
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
  history.push()
  isDirty.value = true
}

// ── Filter overlay geometry ───────────────────────────────────────────────────

const filterConfig = computed(() => {
  renderVersion.value          // re-eval when canvas re-renders (e.g. filter apply)
  return sortFilter.getFilterConfig(currentSheet.value)
})

const filterRange = computed(() => {
  renderVersion.value
  return sortFilter.getRange(currentSheet.value)
})

// Chevron buttons appear only on the header row of the active filter range —
// at most one filter per sheet, scoped to its rectangle (Google-Sheets-style).
const visibleFilterCols = computed(() => {
  renderVersion.value
  if (!grid || !filterRange.value) return []
  const { r0, c0, c1 } = filterRange.value
  const rowRect = grid.getRowRect(r0)
  const rects   = grid.getColumnHeaderRects().filter(({ c }) => c >= c0 && c <= c1)
  const BTN = 16
  return rects.map(({ c, x, width }) => ({
    col: c,
    style: {
      left:   (x + width - BTN - 3) + 'px',
      top:    (rowRect.y + (rowRect.height - BTN) / 2) + 'px',
      width:  BTN + 'px',
      height: BTN + 'px',
    },
  }))
})

// Remote cursors for users on the same sheet — re-evaluated when the canvas renders
// (renderVersion) or when remoteCursors updates.
const visibleRemoteCursors = computed(() => {
  renderVersion.value
  if (!grid) return []
  return [...remoteCursors.value.entries()]
    .filter(([, cursor]) => cursor.subSheet === currentSheet.value)
    .map(([user, cursor]) => {
      // Compute a single rect that covers the whole remote range. We pull
      // the top-left cell rect for x/y and the bottom-right cell rect to
      // sum the trailing width/height — handles non-uniform column widths
      // / row heights correctly.
      const r = cursor.range || { r0: cursor.row, c0: cursor.col, r1: cursor.row, c1: cursor.col }
      const tl = grid.getCellRect?.(r.r0, r.c0)
      const br = grid.getCellRect?.(r.r1, r.c1)
      if (!tl || !br) return null
      const width  = (br.x + br.width)  - tl.x
      const height = (br.y + br.height) - tl.y
      return {
        user, initials: cursor.initials, color: cursor.color, fullName: cursor.fullName,
        style: {
          left:   tl.x + 'px',
          top:    tl.y + 'px',
          width:  width  + 'px',
          height: height + 'px',
          '--rc': cursor.color,
        },
      }
    })
    .filter(Boolean)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

// ── Fill handle helpers ───────────────────────────────────────────────────────
// These close over module-level engine vars (sheet, formats, etc.) and the
// module-level `grid` ref (set by _setupGridInstance before any fill fires).

function _fillValidation(src, total, sn) {
  const srcRows = src.r1 - src.r0 + 1, srcCols = src.c1 - src.c0 + 1
  for (let r = total.r0; r <= total.r1; r++) {
    for (let c = total.c0; c <= total.c1; c++) {
      if (r >= src.r0 && r <= src.r1 && c >= src.c0 && c <= src.c1) continue
      const srcR = src.r0 + ((r - src.r0 + srcRows) % srcRows)
      const srcC = src.c0 + ((c - src.c0 + srcCols) % srcCols)
      const rule = validation.get(cellId(srcR, srcC), sn)
      if (rule) validation.set(cellId(r, c), rule, sn)
    }
  }
}

// _runFill modes: 'auto' | 'series' | 'copy' | 'format-only' | 'without-format'
function _runFill(src, total, mode) {
  const sheetName  = sheet.getCurrentSheet()
  const fillBefore = _captureRange(total, sheetName)
  if (mode === 'format-only') {
    _fillFormatsOnly(src, total, sheetName)
  } else {
    const valueMode = mode === 'without-format' ? 'auto' : mode
    _fillValues(src, total, sheetName, valueMode)
    if (mode === 'without-format') _clearFormats(src, total, sheetName)
  }
  if (mode !== 'format-only') {
    _fillValidation(src, total, sheetName)
    condFormat.extendRulesToRange(src, total, sheetName)
  }
  const fillAfter = _captureRange(total, sheetName)
  const refs = _diffRefs(fillBefore, fillAfter)
  if (refs.length) {
    _queueOp({ opType: 'fill', subSheet: sheetName,
               cellRefs: refs, before: fillBefore, after: fillAfter,
               summary: _fillSummary(mode, refs.length) })
  }
  markEdited()
}

function _fillSummary(mode, n) {
  if (mode === 'copy')           return `Copied into ${n} cell${n === 1 ? '' : 's'}`
  if (mode === 'format-only')    return `Filled formats into ${n} cell${n === 1 ? '' : 's'}`
  if (mode === 'without-format') return `Filled (no format) ${n} cell${n === 1 ? '' : 's'}`
  return `Filled ${n} cell${n === 1 ? '' : 's'}`
}

function _fillValues(src, total, sheetName, valueMode) {
  const srcData = []
  for (let r = src.r0; r <= src.r1; r++) {
    const row = []
    for (let c = src.c0; c <= src.c1; c++) row.push(sheet.getCell(cellId(r, c)))
    srcData.push(row)
  }
  const goDown  = total.r1 > src.r1, goUp    = total.r0 < src.r0
  const goRight = total.c1 > src.c1, goLeft  = total.c0 < src.c0
  const srcRows = src.r1 - src.r0 + 1, srcCols = src.c1 - src.c0 + 1
  if (goDown || goUp) {
    const count  = goDown ? total.r1 - src.r1 : src.r0 - total.r0
    const dir    = goDown ? 1 : -1
    const filled = computeFillDown(srcData, count, dir, { mode: valueMode })
    const startR = goDown ? src.r1 + 1 : total.r0
    filled.forEach((row, rOff) => row.forEach((val, cOff) => {
      if (typeof val === 'string' && val.startsWith('=')) {
        const srcRowOff = dir > 0 ? rOff % srcRows : ((srcRows - 1 - rOff) % srcRows + srcRows) % srcRows
        val = adjustFormula(val, (startR + rOff) - (src.r0 + srcRowOff), 0)
      }
      sheet.setCell(cellId(startR + rOff, src.c0 + cOff), val)
    }))
  } else if (goRight || goLeft) {
    const count  = goRight ? total.c1 - src.c1 : src.c0 - total.c0
    const dir    = goRight ? 1 : -1
    const filled = computeFillRight(srcData, count, dir, { mode: valueMode })
    const startC = goRight ? src.c1 + 1 : total.c0
    filled.forEach((row, rOff) => row.forEach((val, cOff) => {
      if (typeof val === 'string' && val.startsWith('=')) {
        const srcColOff = dir > 0 ? cOff % srcCols : ((srcCols - 1 - cOff) % srcCols + srcCols) % srcCols
        val = adjustFormula(val, 0, (startC + cOff) - (src.c0 + srcColOff))
      }
      sheet.setCell(cellId(src.r0 + rOff, startC + cOff), val)
    }))
  }
}

function _fillFormatsOnly(src, total, sn) {
  const srcRows = src.r1 - src.r0 + 1, srcCols = src.c1 - src.c0 + 1
  for (let r = total.r0; r <= total.r1; r++) {
    for (let c = total.c0; c <= total.c1; c++) {
      if (r >= src.r0 && r <= src.r1 && c >= src.c0 && c <= src.c1) continue
      const srcR = src.r0 + ((r - src.r0 + srcRows) % srcRows)
      const srcC = src.c0 + ((c - src.c0 + srcCols) % srcCols)
      const fmt  = formats.get(cellId(srcR, srcC), sn)
      if (fmt && Object.keys(fmt).length) formats.set(cellId(r, c), fmt, sn)
      else                                formats.clear(cellId(r, c), sn)
    }
  }
}

function _clearFormats(src, total, sn) {
  for (let r = total.r0; r <= total.r1; r++) {
    for (let c = total.c0; c <= total.c1; c++) {
      if (r >= src.r0 && r <= src.r1 && c >= src.c0 && c <= src.c1) continue
      formats.clear(cellId(r, c), sn)
    }
  }
}

function _previewSeriesKind(src) {
  const sn  = sheet.getCurrentSheet()
  const sel = grid?.getSelection()
  const goingDown  = sel ? sel.r1 > src.r1 : false
  const goingRight = sel ? sel.c1 > src.c1 : false
  const sampleAlongCol = goingDown || !goingRight
  const vals = []
  if (sampleAlongCol) {
    for (let r = src.r0; r <= src.r1; r++) vals.push(sheet.getCell(cellId(r, src.c0), sn))
  } else {
    for (let c = src.c0; c <= src.c1; c++) vals.push(sheet.getCell(cellId(src.r0, c), sn))
  }
  const series = detectSeries(vals.map(v => v == null ? '' : String(v)))
  return series ? series.kind : null
}

// ── Mount phases ─────────────────────────────────────────────────────────────

function _setupGridInstance() {
  grid = createGrid(canvasRef.value, {
    onSelect(id) {
      activeCell.value   = id
      formulaValue.value = sheet.getCell(id)
      refreshActiveFormat()
      _syncNumberFormat(id)
      computeSelectionStats()
      if (isPaintingFormat.value) _applyPaintedFormat()
      const p = parseCellId(id)
      if (p) {
        // Send the full selection rect so peers can paint a range outline,
        // not just a single anchor cell.
        const sel = grid?.getSelection?.()
        const range = sel
          ? { r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: sel.c1 }
          : null
        broadcastCursor(p.row, p.col, sheet.getCurrentSheet(), range)
      }
    },
    onCommit(id, value) {
      // Cross-sheet path: in-cell overlay was editing on `homeSheet`, user
      // hopped over to another sheet to pick a range, then pressed Enter.
      // Write the formula back to the home sheet and snap the canvas there
      // so the next-row move-down on Enter lands on the home sheet too.
      const homeSheet = editingHomeSheet.value
      const writeSheet = (homeSheet && homeSheet !== sheet.getCurrentSheet()) ? homeSheet : sheet.getCurrentSheet()
      const before = sheet.getCell(id, writeSheet)
      sheet.setCell(id, value, writeSheet)
      if (writeSheet !== sheet.getCurrentSheet()) {
        switchSheet(writeSheet, { preserveEdit: true })
      }
      if (before !== value) {
        _queueOp({ opType: 'edit', subSheet: writeSheet,
                   cellRefs: [id], before: { [id]: before }, after: { [id]: value } })
        broadcastCellChange(writeSheet, id, value)
      }
      editingHomeSheet.value = null
      editingHomeCell.value  = null
      markEdited()
      recomputePivotsForSheet(writeSheet)
    },
    onInput(id, value)  { formulaValue.value = value },
    onCancel(id)        {
      const homeSheet = editingHomeSheet.value
      if (homeSheet && homeSheet !== sheet.getCurrentSheet()) {
        switchSheet(homeSheet)  // full reset so canvas snaps back to home cell
      }
      editingHomeSheet.value = null
      editingHomeCell.value  = null
      formulaValue.value = sheet.getCell(id)
    },
    getFormat:    id => formats.get(id, sheet.getCurrentSheet()),
    getMergeInfo: id => merge.getMasterInfo(id),
    isSlave:      id => merge.isSlave(id),
    getMasterId:  id => merge.getMasterId(id),
    getComment:   id => comments.get(id, sheet.getCurrentSheet()),
    getValidation: id => validation.get(id, sheet.getCurrentSheet()),
    getCondFormat: (id, val) => condFormat.getFormatOverride(
      id, val, sheet.getCurrentSheet(),
      (cid) => sheet.getDisplayValue(cid, sheet.getCurrentSheet()),
    ),
    getRightInset: id => {
      const range = sortFilter.getRange(sheet.getCurrentSheet())
      if (!range) return 0
      const p = parseCellId(id)
      if (!p) return 0
      // Reserve 19px right-padding in the filter header row inside the active range.
      return p.row === range.r0 && p.col >= range.c0 && p.col <= range.c1 ? 19 : 0
    },
    onHyperlinkClick(url) { window.open(url, '_blank', 'noopener,noreferrer') },
    onDropdownClick(id, rule, pos) { openDropdown(id, rule, pos) },
    getSheetNames() { return sheetNames.value },
    // Cross-sheet picker — grid prefixes inserted refs with the current sheet
    // when it differs from the edit's home sheet. Home is null outside of an
    // active cross-sheet edit, in which case the prefix is omitted.
    getCurrentSheet()    { return sheet.getCurrentSheet() },
    getEditingHomeSheet() { return editingHomeSheet.value },
    onFill(src, total, { withModifier = false } = {}) {
      const series = _previewSeriesKind(src)
      // Cmd/Ctrl held inverts the auto-detected mode — Google Sheets behaviour.
      const mode = withModifier ? (series ? 'copy' : 'series') : 'auto'
      _runFill(src, total, mode)
    },
    onBatchCommit(cells) {
      const { before, after, refs } = diffCells(cells, id => sheet.getCell(id))
      for (const { id, value } of cells) sheet.setCell(id, value)
      if (refs.length) {
        _queueOp({ opType: 'edit', subSheet: sheet.getCurrentSheet(),
                   cellRefs: refs, before, after,
                   summary: refs.length > 1 ? `Edited ${refs.length} cells` : '' })
        broadcastBatchChange(sheet.getCurrentSheet(), refs.map(id => ({ id, value: after[id] })))
      }
      markEdited()
      recomputePivotsForSheet(sheet.getCurrentSheet())
    },
    onResizeEnd() {
      history.push()
      isDirty.value = true
    },
  })
  // Keep DOM overlays (filter chevrons) in sync with canvas scroll/resize/freeze.
  grid.onRender(() => { renderVersion.value++ })
}

function _setupEventListeners() {
  canvasRef.value.addEventListener('contextmenu', onCanvasContextMenu)
  canvasRef.value.addEventListener('mouseup', computeSelectionStats)
  canvasRef.value.addEventListener('keyup',   computeSelectionStats)
  ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    grid.resize(width, height)
  })
  ro.observe(gridWrapRef.value)
  window.addEventListener('keydown',      onGlobalKey)
  window.addEventListener('beforeunload', onBeforeUnloadGuard)
  document.addEventListener('paste',     onDocPaste)
  document.addEventListener('copy',      onDocCopy)
  document.addEventListener('cut',       onDocCut)
  document.addEventListener('mousedown', _onDocMouseDown)
}

async function _loadInitialData() {
  history.init()
  syncFlags()
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
  } else if (props.id === 'new') {
    // Google-Sheets model: create the doc immediately so there is never an
    // "unsaved" state.  The parent swaps the URL to ?id=<name> via onSaved.
    const name = await autoCreate(currentTitle.value || 'Untitled Spreadsheet')
    if (name) emit('saved', name)
  }
}

onMounted(async () => {
  _setupGridInstance()
  _setupEventListeners()
  await _loadInitialData()
})

onBeforeUnmount(() => {
  clearTimeout(_autoSaveTimer)
  // CRITICAL: flush any pending debounced save before the component dies.
  // Without this, navigating away within ~2s of an edit (the autosave
  // debounce window) silently drops the most recent changes — exactly the
  // "data is lost when I come back" report. The fetch uses `keepalive: true`
  // so the request survives the unmount.
  if (isDirty.value && props.id && props.id !== 'new') {
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

// Operation queue — populated by _queueOp() at write sites (paste, fill,
// import, cell edit, etc.).  Flushed after each successful save so each
// op is hard-linked to the Version row it produced.  See versions.py
// record_op + list_versions for the consumer side.
const _opQueue = []
function _queueOp({ opType, cellRefs = null, before = null, after = null,
                    summary = '', subSheet = '' }) {
	if (props.id === 'new') return        // pre-save doc has no version yet
	_opQueue.push({ opType, cellRefs, before, after, summary, subSheet })
}

// Snapshot {id → value} for a rectangular cell range, used before/after each
// write so ops carry their own diff.  Caller passes the active sub-sheet.
function _captureRange(rect, sheetName) {
	const out = {}
	if (!rect) return out
	const sn = sheetName || sheet.getCurrentSheet()
	for (let r = rect.r0; r <= rect.r1; r++) {
		for (let c = rect.c0; c <= rect.c1; c++) {
			const id = cellId(r, c)
			out[id] = sheet.getCell(id, sn)
		}
	}
	return out
}

// Diff two id→value maps, returning the ids whose value changed.  Used to
// trim noisy before/after pairs down to the cells that actually moved.
function _diffRefs(before, after) {
	const ids = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
	return [...ids].filter(id => (before?.[id]) !== (after?.[id]))
}

// Per-op cap on the serialized before/after JSON. Anything larger drops
// the heavy fields and falls back to a lightweight summary — the new state
// still lives in sheets_data, and the prior state can be reconstructed from
// the preceding snapshot, so we lose nothing audit-wise. Without this, a
// large CSV import builds a 20+ MB op that blows past nginx's body cap and
// the server returns an HTML 413 instead of JSON.
const _MAX_OP_PAYLOAD_BYTES = 64 * 1024

// Drains the queue and returns the ops as a single batch shaped for the
// versioning save endpoint. We hand this directly to `saveExisting` so the
// server allocates one contiguous block of op-log seqs in user-action order.
function _drainOpsForSave() {
	if (!_opQueue.length || props.id === 'new') return []
	const batch = _opQueue.splice(0, _opQueue.length)
	return batch.map(_serialiseOp)
}

function _serialiseOp(op) {
	const cellRefsJson = op.cellRefs ? JSON.stringify(op.cellRefs) : undefined
	const beforeJson   = op.before   ? JSON.stringify(op.before)   : undefined
	const afterJson    = op.after    ? JSON.stringify(op.after)    : undefined
	const heavy = (beforeJson?.length || 0) + (afterJson?.length || 0)
	const truncated = heavy > _MAX_OP_PAYLOAD_BYTES
	return {
		op_type:   op.opType,
		sub_sheet: op.subSheet || undefined,
		cell_refs: cellRefsJson,
		before:    truncated ? undefined : beforeJson,
		after:     truncated ? undefined : afterJson,
		summary:   truncated ? _truncatedSummary(op) : (op.summary || undefined),
	}
}

function _truncatedSummary(op) {
	const base  = op.summary || op.opType || 'bulk edit'
	const count = Array.isArray(op.cellRefs) ? op.cellRefs.length : 0
	return count ? `${base} (${count} cells, details truncated)` : base
}

function _triggerAutoSave() {
  clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(_doAutoSave, 2000)
}

async function _doAutoSave() {
  if (!isDirty.value) return
  // Bootstrap is handled by _loadInitialData's autoCreate(); calling
  // saveExisting('new') would explode with "Sheet new not found". If the
  // bootstrap save failed for any reason, leave it to a subsequent reload
  // rather than spamming the server on every typed character.
  if (props.id === 'new') return
  // Drain queued ops BEFORE the save so the batch lands atomically with the
  // implicit `save` op and keeps the canonical user-action ordering intact.
  const ops = _drainOpsForSave()
  await saveExisting(props.id, currentTitle.value, { ops })
  if (!saveError.value) {
    isDirty.value   = false
    justSaved.value = true
    setTimeout(() => { justSaved.value = false }, 2500)
  }
}

async function flushSave() {
  if (!isDirty.value) return
  clearTimeout(_autoSaveTimer)
  await _doAutoSave()
}

async function flushAndClose() {
  await flushSave()
  emit('close')
}

// Watch for any dirty change → schedule auto-save
watch(isDirty, (dirty) => { if (dirty) _triggerAutoSave() })

// Re-render the canvas when the filter row is toggled so row-0 cells reserve
// (or release) right-padding for the chevron buttons.
watch(showSortFilter, () => { grid?.render?.() })

function onTitleBlur() { _triggerAutoSave() }

watch(isSaving, (cur, prev) => { if (prev && !cur && !saveError.value) isDirty.value = false })

function onSave() { _doAutoSave() }

// ── Formula bar ───────────────────────────────────────────────────────────────

function onFormulaInput(e) {
  formulaValue.value = e.target.value
  updateAc(e.target.value, e.target.selectionStart)
}

function onFormulaKey(e) {
  if (acVisible.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); acIdx.value = Math.min(acIdx.value + 1, acItems.value.length - 1); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); acIdx.value = Math.max(acIdx.value - 1, 0); return }
    if ((e.key === 'Tab' || e.key === 'Enter') && acItems.value[acIdx.value]) { e.preventDefault(); commitAc(acItems.value[acIdx.value]); return }  // item obj
    if (e.key === 'Escape') { acItems.value = []; return }
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    _commitFormulaBar()
    canvasRef.value?.focus()
  }
  if (e.key === 'Escape') {
    _cancelFormulaBar()
    canvasRef.value?.focus()
  }
}

// Write the in-progress formula back to the cell it was started on, even if
// the user wandered off to another sheet to pick a range. If there's no
// cross-sheet edit, this collapses to the legacy "write to activeCell" path.
function _commitFormulaBar() {
  const homeSheet = editingHomeSheet.value
  const homeCell  = editingHomeCell.value
  if (homeSheet && homeSheet !== sheet.getCurrentSheet()) {
    switchSheet(homeSheet, { preserveEdit: true })
    sheet.setCell(homeCell, formulaValue.value, homeSheet)
  } else {
    sheet.setCell(activeCell.value, formulaValue.value)
  }
  editingHomeSheet.value = null
  editingHomeCell.value  = null
  markEdited()
}

function _cancelFormulaBar() {
  const homeSheet = editingHomeSheet.value
  const homeCell  = editingHomeCell.value
  if (homeSheet && homeSheet !== sheet.getCurrentSheet()) {
    // Return to the home sheet *without* preserveEdit so activeCell snaps
    // back to where the user started and formulaValue reflects the cell's
    // committed contents (i.e. the edit is discarded cleanly).
    switchSheet(homeSheet)
    activeCell.value   = homeCell
    formulaValue.value = sheet.getCell(homeCell, homeSheet)
  } else {
    formulaValue.value = sheet.getCell(activeCell.value)
  }
  editingHomeSheet.value = null
  editingHomeCell.value  = null
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function fillDown() {
  if (!grid) return
  const { r0, c0, r1, c1 } = grid.getSelection()
  if (r1 <= r0) return
  for (let c = c0; c <= c1; c++) {
    const srcVal = sheet.getCell(colLabel(c) + (r0 + 1))
    for (let r = r0 + 1; r <= r1; r++) {
      const val = typeof srcVal === 'string' && srcVal.startsWith('=')
        ? adjustFormula(srcVal, r - r0, 0) : srcVal
      sheet.setCell(colLabel(c) + (r + 1), val)
    }
  }
  markEdited()
}

function fillRight() {
  if (!grid) return
  const { r0, c0, r1, c1 } = grid.getSelection()
  if (c1 <= c0) return
  for (let r = r0; r <= r1; r++) {
    const srcVal = sheet.getCell(colLabel(c0) + (r + 1))
    for (let c = c0 + 1; c <= c1; c++) {
      const val = typeof srcVal === 'string' && srcVal.startsWith('=')
        ? adjustFormula(srcVal, 0, c - c0) : srcVal
      sheet.setCell(colLabel(c) + (r + 1), val)
    }
  }
  markEdited()
}

// Mirrors `clipboard.hasData()` reactively so the context menu can show /
// hide its Paste-Special entries without polling.
const clipboardHas = ref(false)

const { onGlobalKey } = useShortcuts({
  formulaInputEl:           () => formulaInputRef.value,
  undo, redo, onSave, toggleFmt, repeatLast, toggleShowFormulas,
  showFindReplace, showShortcutsHelp,
  openVersionHistory, openHyperlinkDialog, openCommentPanel, openQuickFilterForActive,
  zoomBy, resetZoom,
  commentPanel, dropdownPanel, splitText,
  revertSplitPreview: _revertSplitPreview, closeSplit: _closeSplit,
  clipboard, clipboardHas, setMarchingAnts: (v) => grid?.setMarchingAnts(v),
  fillDown, fillRight,
  runSmartFill,
})

// ── Clipboard ─────────────────────────────────────────────────────────────────

function _canvasActive() {
  const ae = document.activeElement
  return ae === canvasRef.value || ae === formulaInputRef.value || gridWrapRef.value?.contains(ae)
}

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
  clipboard.cut(src); markEdited()
  clipboardHas.value = true
  grid.setMarchingAnts(src)
}
function onDocPaste(e) {
  if (!_canvasActive()) return
  e.preventDefault()
  let pasted = false
  const destSel = grid.getSelection()
  const sn = sheet.getCurrentSheet()
  const before = _captureRange(destSel, sn)
  if (clipboard.hasData()) {
    // Internal cut/copy: use internal paste so cut properly clears source cells
    clipboard.paste(activeCell.value, () => { history.push(); syncFlags() }, 'all', destSel)
    _repopulateGrid()
    pasted = true
  } else {
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      clipboard.pasteFromText(text, activeCell.value, () => { history.push(); syncFlags() }, destSel)
      _repopulateGrid()
      pasted = true
    }
  }
  clipboardHas.value = clipboard.hasData()
  grid.setMarchingAnts(null)
  if (pasted) {
    const after = _captureRange(destSel, sn)
    const refs  = _diffRefs(before, after)
    if (refs.length) {
      _queueOp({ opType: 'paste', subSheet: sn, cellRefs: refs,
                 before, after,
                 summary: `Pasted into ${refs.length} cell${refs.length === 1 ? '' : 's'}` })
    }
    isDirty.value = true   // ensure autosave fires
  }
}

// Right-click → Paste special. `kind` ∈ {'values', 'formats', 'formulas'}.
function doPasteSpecial(kind) {
  contextMenu.open = false
  if (!clipboard.hasData()) return
  const destSel = grid.getSelection()
  const sn = sheet.getCurrentSheet()
  const before = _captureRange(destSel, sn)
  clipboard.paste(activeCell.value, () => { history.push(); syncFlags() }, kind, destSel)
  _repopulateGrid()
  clipboardHas.value = clipboard.hasData()
  grid?.setMarchingAnts(null)
  const after = _captureRange(destSel, sn)
  const refs  = _diffRefs(before, after)
  if (refs.length) {
    _queueOp({ opType: 'paste', subSheet: sn, cellRefs: refs,
               before, after,
               summary: `Pasted ${kind} into ${refs.length} cell${refs.length === 1 ? '' : 's'}` })
  }
  isDirty.value = true
  recomputePivotsForSheet(sheet.getCurrentSheet())
}

// ── History ───────────────────────────────────────────────────────────────────

// Re-mirror the canvas view state into the Vue refs that drive context-menu
// predicates (freezeRows > 0, manualHiddenRows.size > 0, ...). Called every
// time a snapshot lands — load, undo, redo — so the UI catches up with the
// grid's restored state.
function _syncViewMirrors() {
  const v = grid?.viewSnapshot?.()
  if (!v) return
  freezeRows.value = v.freezeRows || 0
  freezeCols.value = v.freezeCols || 0
  manualHiddenRows.clear(); for (const r of (v.hiddenRows || [])) manualHiddenRows.add(r)
  manualHiddenCols.clear(); for (const c of (v.hiddenCols || [])) manualHiddenCols.add(c)
}

function _afterHistoryNavigate() {
  _repopulateGrid()
  _applyHiddenRows()        // filter state restored → re-apply to grid
  _syncViewMirrors()
  syncNames()
  activeCell.value   = 'A1'
  formulaValue.value = sheet.getCell('A1')
  refreshActiveFormat(); _syncNumberFormat('A1'); syncFlags()
  grid?.setMarchingAnts(null); clipboard.clear(); clipboardHas.value = false
}

function undo() {
  if (!history.undo()) return
  _afterHistoryNavigate()
}
function redo() {
  if (!history.redo()) return
  _afterHistoryNavigate()
}


// ── Number format ─────────────────────────────────────────────────────────────

function _syncNumberFormat(id) {
  const fmt = formats.get(id, sheet.getCurrentSheet())
  activeNumberFormat.value = fmt.numberFormat || ''
}

function toggleNumberFmt(type) {
  onNumberFormatChange(activeNumberFormatType.value === type ? '' : type)
}

// ── Format painter ────────────────────────────────────────────────────────────

let _copiedFormat = null

function toggleFormatPainter() {
  if (isPaintingFormat.value) {
    isPaintingFormat.value = false
    _copiedFormat = null
    return
  }
  const srcId = activeCell.value
  _copiedFormat = { ...formats.get(srcId, sheet.getCurrentSheet()) }
  isPaintingFormat.value = true
}

function _applyPaintedFormat() {
  if (!isPaintingFormat.value || !_copiedFormat) return
  const ids = selectionIds()
  formats.applyToRange(ids, _copiedFormat, sheet.getCurrentSheet())
  history.push()
  syncFlags()
  isDirty.value = true
  isPaintingFormat.value = false
  _copiedFormat = null
  refreshActiveFormat()
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

// ── Comments ──────────────────────────────────────────────────────────────────

function openCommentPanel() {
  if (!grid) return
  const id   = activeCell.value
  const rect = canvasRef.value?.getBoundingClientRect() || { left: 100, top: 100 }
  commentPanel.id   = id
  commentPanel.text = comments.get(id, sheet.getCurrentSheet()) || ''
  commentPanel.x    = rect.left + 60
  commentPanel.y    = rect.top  + 40
  commentPanel.open = true
}

function saveComment() {
  comments.set(commentPanel.id, commentPanel.text, sheet.getCurrentSheet())
  commentPanel.open = false
  grid?.render()
  isDirty.value = true
}

function deleteComment() {
  comments.clear(commentPanel.id, sheet.getCurrentSheet())
  commentPanel.open = false
  grid?.render()
  isDirty.value = true
}

// ── Data validation ───────────────────────────────────────────────────────────

function openValidationDialog() {
  const e = validation.get(activeCell.value, sheet.getCurrentSheet())
  validationDialog.type     = e?.type     || 'list'
  validationDialog.operator = e?.operator || 'between'
  validationDialog.val1     = String(e?.min ?? '')
  validationDialog.val2     = String(e?.max ?? '')
  validationDialog.listRaw  = (e?.options || []).join(', ')
  validationDialog.message  = e?.message  || ''
  validationDialog.open     = true
}

function confirmValidation() {
  const ids = selectionIds()
  const sn  = sheet.getCurrentSheet()
  const msg = validationDialog.message.trim() || undefined
  let rule
  if (validationDialog.type === 'list') {
    const options = validationDialog.listRaw.split(',').map(s => s.trim()).filter(Boolean)
    rule = { type: 'list', options, message: msg }
  } else {
    const op  = validationDialog.operator
    const v1  = parseFloat(validationDialog.val1)
    const v2  = parseFloat(validationDialog.val2)
    const min = isNaN(v1) ? undefined : v1
    const max = ['between', 'not_between'].includes(op) && !isNaN(v2) ? v2 : undefined
    rule = { type: validationDialog.type, operator: op, min, max, message: msg }
  }
  for (const id of ids) validation.set(id, rule, sn)
  validationDialog.open = false
  grid?.render()
  isDirty.value = true
}

function removeValidation() {
  const ids = selectionIds()
  const sn  = sheet.getCurrentSheet()
  for (const id of ids) validation.clear(id, sn)
  validationDialog.open = false
  grid?.render()
  isDirty.value = true
}

function openDropdown(id, rule, pos = {}) {
  if (rule?.type !== 'list') return
  dropdownPanel.id      = id
  dropdownPanel.options = rule.options
  dropdownPanel.x       = pos.x ?? 0
  dropdownPanel.y       = pos.y ?? 0
  dropdownPanel.w       = pos.w ?? 120
  dropdownPanel.open    = true
}

function pickDropdownOption(opt) {
  sheet.setCell(dropdownPanel.id, opt)
  dropdownPanel.open = false
  markEdited()
}

// ── Conditional formatting ────────────────────────────────────────────────────

const CF_COND_OPTIONS = [
  { label: 'Greater than',     value: 'gt'          },
  { label: 'Less than',        value: 'lt'          },
  { label: 'Greater or equal', value: 'gte'         },
  { label: 'Less or equal',    value: 'lte'         },
  { label: 'Equal to',         value: 'eq'          },
  { label: 'Not equal to',     value: 'neq'         },
  { label: 'Between',          value: 'between'     },
  { label: 'Contains',         value: 'contains'    },
  { label: 'Does not contain', value: 'notcontains' },
  { label: 'Is empty',         value: 'empty'       },
  { label: 'Is not empty',     value: 'notempty'    },
]

const CF_KIND_OPTIONS = [
  { label: 'Single colour rule', value: 'classic'     },
  { label: 'Colour scale',       value: 'color-scale' },
  { label: 'Data bars',          value: 'data-bar'    },
  { label: 'Icon set',           value: 'icon-set'    },
]

const CF_SCALE_VARIANT_OPTIONS = [
  { label: '2-colour (low → high)',         value: '2color' },
  { label: '3-colour (low → mid → high)',   value: '3color' },
]

const CF_ICON_SET_OPTIONS = [
  { label: 'Arrows (red/grey/green)',  value: 'arrows3'  },
  { label: 'Traffic lights',           value: 'traffic3' },
  { label: 'Circles (empty → full)',   value: 'circles3' },
]

const cfRangeLabel = computed(() => {
  const { r0, c0, r1, c1 } = cfDialog.range
  return `${colLabel(c0)}${r0 + 1}:${colLabel(c1)}${r1 + 1}`
})

// `<input type="color">` rejects anything that isn't a literal #rrggbb.
// Old rules may have been saved with CSS-var values back when the dialog
// defaulted to `var(--surface-red-1)`; coerce those to '' so the input
// falls back to its default rather than throwing a DOMException.
function _coerceHex(v) {
  if (typeof v !== 'string') return ''
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : ''
}

function openCfDialog(existingId) {
  const sel = grid?.getSelection() || { r0: 0, c0: 0, r1: 0, c1: 0 }
  cfDialog.range      = { ...sel }
  cfDialog.editId     = existingId
  cfDialog.kind       = 'classic'
  cfDialog.condType   = 'gt'
  cfDialog.condValue  = ''
  cfDialog.condValue2 = ''
  cfDialog.fmtColor   = ''
  // `<input type="color">` rejects CSS-var values — it requires a literal
  // #rrggbb. Use the resolved hex for --surface-red-1 instead.
  cfDialog.fmtBg      = '#FEE2E2'
  cfDialog.scaleVariant = '2color'
  cfDialog.scaleMin   = '#FFFFFF'
  cfDialog.scaleMid   = '#FFEB3B'
  cfDialog.scaleMax   = '#0E7490'
  cfDialog.barColor   = '#0E7490'
  cfDialog.iconSet    = 'arrows3'

  // If we're editing an existing rule, hydrate the dialog state from it so
  // the user sees their previous selections instead of the blank defaults.
  if (existingId !== null) {
    const existing = condFormat.getRules(sheet.getCurrentSheet()).find(r => r.id === existingId)
    if (existing) {
      cfDialog.range = { ...existing.range }
      cfDialog.kind  = existing.kind || 'classic'
      if (existing.kind === 'color-scale') {
        cfDialog.scaleVariant = existing.scale?.variant || '2color'
        cfDialog.scaleMin     = existing.scale?.minColor || cfDialog.scaleMin
        cfDialog.scaleMid     = existing.scale?.midColor || cfDialog.scaleMid
        cfDialog.scaleMax     = existing.scale?.maxColor || cfDialog.scaleMax
      } else if (existing.kind === 'data-bar') {
        cfDialog.barColor = existing.bar?.color || cfDialog.barColor
      } else if (existing.kind === 'icon-set') {
        cfDialog.iconSet = existing.icons?.set || cfDialog.iconSet
      } else {
        cfDialog.condType   = existing.condition?.type   || 'gt'
        cfDialog.condValue  = existing.condition?.value  ?? ''
        cfDialog.condValue2 = existing.condition?.value2 ?? ''
        cfDialog.fmtColor   = _coerceHex(existing.format?.color)           || ''
        cfDialog.fmtBg      = _coerceHex(existing.format?.backgroundColor) || cfDialog.fmtBg
      }
    }
  }
  cfDialog.open = true
}

function _buildCfRule() {
  const range = { ...cfDialog.range }
  if (cfDialog.kind === 'color-scale') {
    const scale = cfDialog.scaleVariant === '3color'
      ? { variant: '3color', minColor: cfDialog.scaleMin, midColor: cfDialog.scaleMid, maxColor: cfDialog.scaleMax, midPercent: 0.5 }
      : { variant: '2color', minColor: cfDialog.scaleMin, maxColor: cfDialog.scaleMax }
    return { range, kind: 'color-scale', scale }
  }
  if (cfDialog.kind === 'data-bar') {
    return { range, kind: 'data-bar', bar: { color: cfDialog.barColor } }
  }
  if (cfDialog.kind === 'icon-set') {
    return { range, kind: 'icon-set', icons: { set: cfDialog.iconSet, thresholds: [0.33, 0.66] } }
  }
  // Classic single-colour rule.
  return {
    range,
    condition: { type: cfDialog.condType, value: cfDialog.condValue, value2: cfDialog.condValue2 },
    format: {
      ...(cfDialog.fmtColor ? { color: cfDialog.fmtColor } : {}),
      ...(cfDialog.fmtBg && cfDialog.fmtBg !== '#ffffff' ? { backgroundColor: cfDialog.fmtBg } : {}),
    },
  }
}

function saveCfRule() {
  const sn = sheet.getCurrentSheet()
  const rule = _buildCfRule()
  history.push()
  if (cfDialog.editId !== null) condFormat.updateRule(cfDialog.editId, rule, sn)
  else condFormat.addRule(rule, sn)
  history.push()
  syncFlags()
  cfDialog.open = false
  grid?.render()
  isDirty.value = true
}

function deleteCfRule() {
  history.push()
  condFormat.removeRule(cfDialog.editId, sheet.getCurrentSheet())
  history.push()
  syncFlags()
  cfDialog.open = false
  grid?.render()
  isDirty.value = true
}

// Inline delete from the "existing rules" list — no need to open the dialog
// in edit mode first. Same history bracketing as deleteCfRule.
function deleteCfRuleById(id) {
  history.push()
  condFormat.removeRule(id, sheet.getCurrentSheet())
  history.push()
  syncFlags()
  grid?.render()
  isDirty.value = true
}

// Pretty label for the rule list. Mirrors CF_KIND_OPTIONS / CF_COND_OPTIONS.
function cfRuleLabel(rule) {
  const r = rule.range
  const range = `${colLabel(r.c0)}${r.r0 + 1}:${colLabel(r.c1)}${r.r1 + 1}`
  if (rule.kind === 'color-scale') return `${range} · Colour scale`
  if (rule.kind === 'data-bar')    return `${range} · Data bars`
  if (rule.kind === 'icon-set')    return `${range} · Icon set`
  const t = rule.condition?.type
  const v = rule.condition?.value
  const summary = t === 'between' ? `between ${v} and ${rule.condition?.value2}`
                : t === 'empty' || t === 'notempty' ? t
                : `${t} ${v}`
  return `${range} · ${summary}`
}

// Existing rules for the active sheet — exposed to the dialog template.
const cfRulesForSheet = computed(() => {
  // Touch renderVersion so the list re-evaluates when rules are mutated.
  renderVersion.value
  return condFormat.getRules(sheet.getCurrentSheet())
})



// ── Cell edit history ─────────────────────────────────────────────────────────

async function openCellHistory() {
  contextMenu.open = false
  if (props.id === 'new') return
  const id = activeCell.value
  cellHistory.cell    = id
  cellHistory.open    = true
  cellHistory.loading = true
  cellHistory.error   = ''
  cellHistory.entries = []
  try {
    cellHistory.entries = await versionsApi.cellHistory(
      props.id, id, sheet.getCurrentSheet(),
    )
  } catch (err) {
    cellHistory.error = err.message || 'Failed to load cell history'
  } finally {
    cellHistory.loading = false
  }
}


// ── Find & Replace ────────────────────────────────────────────────────────────

function onNavigateTo(id) {
  if (!grid) return
  const p = parseCellId(id)
  if (!p) return
  grid.moveTo(p.row, p.col)
}

// ── Sort & Filter ─────────────────────────────────────────────────────────────

// Expand a single anchor cell to the contiguous non-empty data block around it
// (Google-Sheets Ctrl+A behaviour).  Returns null when the anchor itself is
// empty so the caller can decide what to do.
function _detectContiguousBlock(r, c) {
  const id0 = cellId(r, c)
  if (!String(sheet.getCell(id0) ?? '').length) return null
  const hasVal = (rr, cc) => String(sheet.getCell(cellId(rr, cc)) ?? '').length > 0
  let r0 = r, r1 = r, c0 = c, c1 = c
  while (r0 > 0 && hasVal(r0 - 1, c)) r0--
  while (hasVal(r1 + 1, c))           r1++
  while (c0 > 0 && hasVal(r0, c0 - 1)) c0--
  while (hasVal(r0, c1 + 1))           c1++
  // Walk again from the new top-row left/right edges in case the block widens
  // below; this matches Google Sheets' "smart" expansion well enough for now.
  for (let rr = r0; rr <= r1; rr++) {
    while (c0 > 0 && hasVal(rr, c0 - 1)) c0--
    while (hasVal(rr, c1 + 1))           c1++
  }
  return { r0, c0, r1, c1 }
}

// Create a filter on the user's current selection.  Single-cell selection
// auto-expands to the contiguous data block (or refuses if the cell is empty).
function _createFilterOnSelection() {
  if (!grid) return
  const sel = grid.getSelection()
  const isSingle = sel.r0 === sel.r1 && sel.c0 === sel.c1
  const range = isSingle
    ? (_detectContiguousBlock(sel.r0, sel.c0) || { r0: sel.r0, c0: sel.c0, r1: sel.r0, c1: sel.c0 })
    : { r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: sel.c1 }
  sortFilter.setRange(range, sheet.getCurrentSheet())
  filterPanel.open = false
  _applyHiddenRows()
  grid?.render?.()
  history.push()
  isDirty.value = true
}

function _removeFilter() {
  sortFilter.clearRange(sheet.getCurrentSheet())
  filterPanel.open = false
  _applyHiddenRows()
  grid?.render?.()
  history.push()
  isDirty.value = true
}

function openFilterPanel(colIdx, event) {
  const rect = event.target.getBoundingClientRect()
  const wrapRect = gridWrapRef.value.getBoundingClientRect()
  const cfg = sortFilter.getFilterConfig(sheet.getCurrentSheet())
  filterPanel.open     = true
  filterPanel.col      = colIdx
  filterPanel.operator = cfg[colIdx]?.operator || 'contains'
  filterPanel.value    = cfg[colIdx]?.value    || ''
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
  if (!sortFilter.hasFilter(sheet.getCurrentSheet())) _createFilterOnSelection()
  nextTick(() => {
    const range = sortFilter.getRange(sheet.getCurrentSheet())
    if (!range || p.col < range.c0 || p.col > range.c1) return
    const rects   = grid?.getColumnHeaderRects?.() || []
    const colRect = rects.find(r => r.c === p.col)
    const rowRect = grid?.getRowRect?.(range.r0)
    if (!colRect || !rowRect) return
    const cfg = sortFilter.getFilterConfig(sheet.getCurrentSheet())
    filterPanel.open     = true
    filterPanel.col      = p.col
    filterPanel.operator = cfg[p.col]?.operator || 'contains'
    filterPanel.value    = cfg[p.col]?.value    || ''
    filterPanel.style    = {
      top:  (rowRect.y + rowRect.height + 2) + 'px',
      left: (colRect.x + colRect.width - 232 - 4) + 'px',  // 232px panel width
    }
  })
}

function applyFilter() {
  sortFilter.setFilter(
    filterPanel.col,
    { operator: filterPanel.operator, value: filterPanel.value },
    sheet.getCurrentSheet(),
  )
  filterPanel.open = false
  _repopulateGrid()
  _applyHiddenRows()
  history.push()
  isDirty.value = true
}

function clearFilterCol() {
  sortFilter.clearFilter(filterPanel.col, sheet.getCurrentSheet())
  filterPanel.open = false
  _repopulateGrid()
  _applyHiddenRows()
  history.push()
  isDirty.value = true
}

function doSort(colIdx, dir) {
  sortFilter.sort(colIdx, dir, sheet.getCurrentSheet())
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

const showRenameDialog = ref(false)
const renameValue      = ref('')
const renameError      = ref('')
const renameInputRef   = ref(null)
let _renameTarget      = ''

function openRenameDialog(name) {
  tabMenu.open = false
  _renameTarget      = name
  renameValue.value  = name
  renameError.value  = ''
  showRenameDialog.value = true
  // Dialog mounts the input asynchronously — focus + select on the next two
  // ticks so the user can type immediately instead of clicking the field.
  nextTick(() => nextTick(() => {
    const el = renameInputRef.value?.$el?.querySelector?.('input')
            ?? renameInputRef.value?.input
            ?? renameInputRef.value
    if (el?.focus) { el.focus(); el.select?.() }
  }))
}

function confirmRename() {
  const oldName = _renameTarget
  const newName = renameValue.value
  const ok = _renameSheet(oldName, newName)
  if (!ok) {
    renameError.value = 'Name is empty or already used.'
    return
  }
  // Keep named-range bindings pointed at the renamed sheet — without this,
  // `=Revenue` defined on "Sheet1" breaks after renaming Sheet1.
  namedRanges.renameSheet(oldName, newName)
  showRenameDialog.value = false
  history.push()
  isDirty.value = true
}

function doDuplicateSheet(name) {
  tabMenu.open = false
  _duplicateSheet(name)
  history.push()
  isDirty.value = true
}

function doDeleteSheet(name) {
  tabMenu.open = false
  if (_deleteSheet(name)) { history.push(); isDirty.value = true }
}

function _onDocMouseDown(e) {
  // Close context menus only when clicking OUTSIDE them. Never close on
  // mousedown when clicking a button inside — that would remove the element
  // before its click event fires, making every menu item a no-op.
  const menus = document.querySelectorAll('.sn-ctx-menu, .sn-comment-panel, .sn-dropdown-panel, .sn-sp-pop')
  let inside = false
  for (const el of menus) if (el.contains(e.target)) { inside = true; break }
  if (!inside) {
    contextMenu.open = false
    tabMenu.open = false
    dropdownPanel.open = false
    // Split-text outside-click is treated as Cancel — preview is reverted
    // because the user never explicitly committed to the result.
    if (splitText.open) { _revertSplitPreview(); _closeSplit() }
  }
}


function doInsertRow(below = false, count = 1) {
  contextMenu.open = false
  const atRow = contextMenu.targetRow + (below ? 1 : 0)
  for (let i = 0; i < count; i++) {
    const sn = sheet.getCurrentSheet()
    sheet.insertRow(atRow)
    formats.insertRow(atRow, sn)
    comments.insertRow(atRow, sn)
    validation.insertRow(atRow, sn)
    condFormat.insertRow(atRow, sn)
    sortFilter.insertRow(atRow, sn)
    grid.shiftRowHeights(atRow, 1)
  }
  _repopulateGrid()
  _applyHiddenRows()
  markEdited()
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
  const sn = sheet.getCurrentSheet()
  sheet.deleteRow(atRow)
  formats.deleteRow(atRow, sn)
  comments.deleteRow(atRow, sn)
  validation.deleteRow(atRow, sn)
  condFormat.deleteRow(atRow, sn)
  sortFilter.deleteRow(atRow, sn)
  grid.shiftRowHeights(atRow + 1, -1)
  _repopulateGrid()
  _applyHiddenRows()
  markEdited()
  recomputePivotsForSheet(sn)
}

function doInsertCol(right = false, count = 1) {
  contextMenu.open = false
  const atCol = contextMenu.targetCol + (right ? 1 : 0)
  const sn = sheet.getCurrentSheet()
  for (let i = 0; i < count; i++) {
    sheet.insertCol(atCol)
    formats.insertCol(atCol, sn)
    comments.insertCol(atCol, sn)
    validation.insertCol(atCol, sn)
    condFormat.insertCol(atCol, sn)
    sortFilter.insertCol(atCol, sn)
    grid.shiftColWidths(atCol, 1)
  }
  _repopulateGrid()
  _applyHiddenRows()
  markEdited()
}

function doDeleteCol() {
  contextMenu.open = false
  const atCol = contextMenu.targetCol
  const sn = sheet.getCurrentSheet()
  sheet.deleteCol(atCol)
  formats.deleteCol(atCol, sn)
  comments.deleteCol(atCol, sn)
  validation.deleteCol(atCol, sn)
  condFormat.deleteCol(atCol, sn)
  sortFilter.deleteCol(atCol, sn)
  grid.shiftColWidths(atCol + 1, -1)
  _repopulateGrid()
  _applyHiddenRows()
  markEdited()
  recomputePivotsForSheet(sn)
}

function doAutoFitCol() {
  contextMenu.open = false
  grid?.autoFitCol(contextMenu.targetCol)
  history.push()
  isDirty.value = true
}

function doAutoFitRow() {
  contextMenu.open = false
  grid?.autoFitRow(contextMenu.targetRow)
  history.push()
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
  markEdited()
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
  markEdited()
  grid.render()
}

// ── Freeze ────────────────────────────────────────────────────────────────────

function doFreezeRow() {
  contextMenu.open = false
  freezeRows.value = contextMenu.targetRow + 1
  grid?.setFreeze(freezeRows.value, freezeCols.value)
  history.push(); isDirty.value = true
}

function doFreezeCol() {
  contextMenu.open = false
  freezeCols.value = contextMenu.targetCol + 1
  grid?.setFreeze(freezeRows.value, freezeCols.value)
  history.push(); isDirty.value = true
}

function doUnfreezeRows() {
  contextMenu.open = false
  freezeRows.value = 0
  grid?.setFreeze(freezeRows.value, freezeCols.value)
  history.push(); isDirty.value = true
}

function doUnfreezeCols() {
  contextMenu.open = false
  freezeCols.value = 0
  grid?.setFreeze(freezeRows.value, freezeCols.value)
  history.push(); isDirty.value = true
}

// ── Hide / unhide rows & cols ─────────────────────────────────────────────────

// Manual hides kept in reactive state so the context menu can conditionally
// render "Unhide all". Filter hides live in sortFilter; we merge both when
// pushing to the canvas via _applyHiddenRows().
const manualHiddenRows = reactive(new Set())
const manualHiddenCols = reactive(new Set())

function _applyHiddenRows() {
  const filterHidden = sortFilter.computeHiddenRows(sheet.getCurrentSheet())
  const union = new Set([...filterHidden, ...manualHiddenRows])
  grid?.setHiddenRows(union)
  // Tag the filter subset so grid-painter can render those gaps with the
  // regular gridline color instead of the bold "rows hidden here" stroke.
  grid?.setFilterHiddenRows(filterHidden)
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
  history.push(); isDirty.value = true
}

function doHideCols() {
  contextMenu.open = false
  if (!grid) return
  const { c0, c1 } = grid.getSelection()
  for (let c = c0; c <= c1; c++) manualHiddenCols.add(c)
  _applyHiddenCols()
  history.push(); isDirty.value = true
}

function doUnhideAllRows() {
  contextMenu.open = false
  manualHiddenRows.clear()
  _applyHiddenRows()
  history.push(); isDirty.value = true
}

function doUnhideAllCols() {
  contextMenu.open = false
  manualHiddenCols.clear()
  _applyHiddenCols()
  history.push(); isDirty.value = true
}


// ── Cmd+K command palette ─────────────────────────────────────────────────────
// CommandPalette ships its own Cmd+K listener that flips `showCmdPalette`.
const showCmdPalette = ref(false)
const cmdQuery       = ref('')

const cmdGroups = computed(() => buildCommandGroups({
  toggleFmt, setAlign, setValign, adjustDecimals, toggleWrap, clearFormatting,
  undo, redo, repeatLast, showFindReplace, showFormulas, repopulateGrid: _repopulateGrid, showShortcutsHelp,
  contextMenu, getGrid: () => grid,
  doInsertRow, doDeleteRow, doInsertCol, doDeleteCol,
  doHideRows, doHideCols, doUnhideAllRows, doUnhideAllCols,
  doAutoFitCol, doAutoFitRow, toggleMerge, addRowsCount, doAddMoreRows,
  doFreezeRow, doFreezeCol, doUnfreezeRows, doUnfreezeCols, showSortFilter,
  openPivotDialog,
  addSheet, currentSheet, openRenameDialog, doDuplicateSheet, doDeleteSheet,
  onSave, exportCSV, exportXLSX, exportPDF, csvInputRef, xlsxInputRef,
}))

function onCmdSelect(item) { item?.fn?.() }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns { before, after, refs } for cells whose value actually changed.
// Separating diff from mutation keeps onBatchCommit readable and testable.
function diffCells(cells, getCell) {
  const before = {}, after = {}
  for (const { id, value } of cells) {
    const previous = getCell(id)
    if (previous !== value) { before[id] = previous; after[id] = value }
  }
  return { before, after, refs: Object.keys(after) }
}

// Snapshot the undo history, sync undo/redo button state, and flag the doc dirty.
// Called after every user mutation that should be undoable and trigger auto-save.
function markEdited() {
  history.push()
  syncFlags()
  isDirty.value = true
}

// ── Repopulate ────────────────────────────────────────────────────────────────

function _repopulateGrid() {
  if (!grid) return
  grid.clearAll()
  const data = sheet.getRawData()
  let maxCol = 0, maxRow = 0
  for (const id of Object.keys(data)) {
    const p = parseCellId(id)
    if (p) {
      if (p.col > maxCol) maxCol = p.col
      if (p.row > maxRow) maxRow = p.row
    }
    if (showFormulas.value) {
      grid.setCell(id, String(data[id] ?? ''))
      continue
    }
    const fmt = formats.get(id, sheet.getCurrentSheet())
    const displayValue = sheet.getDisplayValue(id)
    grid.setCell(id, fmt.numberFormat ? applyNumberFmt(displayValue, fmt.numberFormat) : displayValue)
  }
  const neededCols = maxCol + 1
  const neededRows = maxRow + 1
  if (grid.getTotalCols && grid.expandCols && neededCols > grid.getTotalCols())
    grid.expandCols(neededCols - grid.getTotalCols())
  if (grid.getTotalRows && grid.expandRows && neededRows > grid.getTotalRows())
    grid.expandRows(neededRows - grid.getTotalRows())
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
.sn-topbar       { display:flex; align-items:center; justify-content:space-between; height:48px; padding:0 16px; border-bottom:1px solid var(--outline-gray-2); background:var(--surface-white); flex-shrink:0; }
/* Left cluster groups: brand+title tight (gap:4); status chips sit further away
   (gap:12) so the title reads as the focal point, not crowded by badges. */
.sn-topbar-left  { display:flex; align-items:center; gap:8px; min-width:0; }
.sn-topbar-left  > .sn-app-icon-btn + .sn-title-input { margin-left:-8px; }
.sn-topbar-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

.sn-app-icon { width:28px; height:28px; flex-shrink:0; display:block; }
.sn-app-icon-btn {
  display:inline-flex; align-items:center; justify-content:center;
  width:36px; height:36px; padding:4px; margin:0; border:none; background:transparent; cursor:pointer;
  border-radius:8px; transition:background-color .12s;
}
.sn-app-icon-btn:hover  { background:var(--surface-gray-2); }
.sn-app-icon-btn:focus-visible { outline:2px solid var(--outline-gray-4); outline-offset:2px; }

.sn-title-input { height:32px; border:1px solid transparent; border-radius:6px; padding:0 10px; font-size:15px; font-weight:600; color:var(--ink-gray-9); background:transparent; outline:none; font-family:inherit; letter-spacing:-.005em; transition:background-color .12s, border-color .12s, width .1s; }

.sn-title-input:hover { background:var(--surface-gray-2); }
.sn-title-input:focus { border-color:var(--outline-gray-4); background:var(--surface-white); box-shadow:0 0 0 2px rgba(23,23,23,.10); }

/* Hairline between action buttons and avatar — groups the cluster without
   relying on extra padding. */
.sn-topbar-divider { width:1px; height:20px; background:var(--outline-gray-2); margin:0 4px; flex-shrink:0; }

/* Brand-coloured current-user avatar. Avatar's inner label uses
   `bg-surface-gray-2 text-ink-gray-5` by default — we override both so the
   chip reads as "you" against the otherwise-neutral topbar. Scoped styles
   need `:deep()` to reach into frappe-ui's component internals. */
.sn-user-avatar :deep(div) { background: #0D7490 !important; color: #FFFFFF !important; }

/* Presence avatars — stacked/overlapping, each with a white ring so they
   visually separate even when colors are similar. */
.sn-presence { display:inline-flex; align-items:center; }
.sn-presence-avatar { margin-left:-6px; border-radius:50%; outline:2px solid var(--surface-white); }
.sn-presence-avatar:first-child { margin-left:0; }
.sn-presence-more {
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; border-radius:50%;
  background:var(--surface-gray-3); border:2px solid var(--surface-white);
  margin-left:-6px; font-size:10px; font-weight:600; color:var(--ink-gray-7);
  flex-shrink:0; cursor:default;
}

/* Save status — small muted text, Espresso ink-gray-5.  Sits quietly next to
   the title; never competes for attention. */
.sn-save-status { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:400; letter-spacing:.01em; color:var(--ink-gray-5); white-space:nowrap; user-select:none; }
.sn-save-icon   { width:12px; height:12px; flex-shrink:0; }
@keyframes sn-spin { to { transform:rotate(360deg); } }
.sn-save-spin   { animation:sn-spin .9s linear infinite; }

/* ── Pivot FAB ── */
.sn-pivot-fab {
  position: absolute; z-index: 20;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--surface-white);
  border: 1px solid var(--outline-gray-2);
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-gray-6);
  transition: background .1s, color .1s, box-shadow .1s;
}
.sn-pivot-fab:hover, .sn-pivot-fab.open {
  background: var(--surface-gray-1);
  color: var(--ink-gray-9);
  box-shadow: 0 3px 12px rgba(0,0,0,.16);
}
.sn-pivot-fab-icon { width: 13px; height: 13px; }

/* ── Bar 2 · Formula bar ─────────────────────────────────────────────────── */

.sn-formula-bar   { display:flex; align-items:center; height:48px; padding:0 16px; border-bottom:1px solid var(--outline-gray-2); gap:8px; flex-shrink:0; background:var(--surface-white); }
/* Cell address tag */
.sn-cell-ref      { box-sizing:border-box; min-width:50px; padding:0 8px; flex-shrink:0; text-align:center; font-size:12px; font-weight:600; letter-spacing:.04em; color:var(--ink-gray-7); background:var(--surface-white); border:1px solid var(--outline-gray-2); border-radius:6px; height:30px; line-height:1; display:flex; align-items:center; justify-content:center; font-variant-numeric:tabular-nums; font-family:ui-monospace, "SF Mono", Menlo, Consolas, monospace; cursor:default; user-select:none; transition:border-color .12s, background-color .12s; }
.sn-cell-ref:hover { border-color:var(--outline-gray-3); background:var(--surface-gray-3); }
/* "fx" delimiter */
.sn-fx-label      { font-size:14px; font-style:italic; font-weight:500; color:var(--ink-gray-4); letter-spacing:.02em; flex-shrink:0; padding:0 6px 0 2px; user-select:none; font-family:ui-serif, Georgia, "Times New Roman", serif; }
.sn-formula-wrap  { position:relative; flex:1; display:flex; }
.sn-formula-wrap .sn-formula-input { flex:1; }
.sn-formula-input { box-sizing:border-box; width:100%; height:30px; line-height:1; border-radius:6px; outline:none; padding:0 10px; font-size:13px; color:var(--ink-gray-8); background:var(--surface-white); border:1px solid var(--outline-gray-2); font-family:'Fira Code', ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing:.005em; transition:background-color .15s, border-color .15s, box-shadow .15s; }
.sn-formula-input::placeholder { color:var(--ink-gray-3); font-style:italic; font-family:inherit; }
.sn-formula-input:hover { background:var(--surface-gray-3); border-color:var(--outline-gray-3); }
.sn-formula-input:focus { border-color:var(--outline-gray-4); background:var(--surface-white); box-shadow:0 0 0 2px rgba(23,23,23,.08); }
.sn-fbar-actions  { display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:4px; }

/* Formula autocomplete — Frappe UI Autocomplete is form-field oriented, so the inline popover is bespoke but uses Espresso surfaces. */
.sn-ac-list       { position:absolute; top:calc(100% + 4px); bottom:auto; left:0; right:0; background:var(--surface-modal); border:1px solid var(--outline-gray-2); border-radius:8px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); z-index:300; max-height:240px; overflow-y:auto; padding:4px; }
.sn-ac-list--up   { top:auto; bottom:calc(100% + 4px); }
.sn-ac-item  { display:flex; align-items:baseline; gap:10px; padding:6px 10px; cursor:pointer; white-space:nowrap; border-radius:4px; }
.sn-ac-item:hover, .sn-ac-item.active { background:var(--surface-gray-2); }
.sn-ac-name  { font-weight:600; font-size:13px; color:var(--ink-gray-9); min-width:90px; letter-spacing:.02em; }
.sn-ac-sig   { font-size:11px; color:var(--ink-gray-5); letter-spacing:.01em; }
.sn-ac-badge { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-cyan-6, #0891b2); background:var(--surface-cyan-1, #ecfeff); border-radius:3px; padding:1px 5px; }
/* Validation dialog two-column value row */
.sn-vd-vals  { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

/* ── Bar 3 · Formatting toolbar ──────────────────────────────────────────── */
.sn-toolbar { display:flex; align-items:center; gap:2px; height:44px; padding:0 15px; border-bottom:1px solid var(--outline-gray-2); background:var(--surface-white); flex-shrink:0; }
.sn-toolbar :deep(.fui-form-control) { width:auto; }
.sn-toolbar :deep(select) { min-width:118px; }
/* Font family dropdown — uses a Button trigger that hugs the short label. */
.sn-font-family :deep(button) { padding-left:6px; padding-right:4px; gap:2px; }

.sn-font-size-input { width:52px; margin:0 2px; }
.sn-font-size-input :deep(input) { text-align:center; font-variant-numeric:tabular-nums; -moz-appearance:textfield; }
.sn-font-size-input :deep(input::-webkit-outer-spin-button),
.sn-font-size-input :deep(input::-webkit-inner-spin-button) { -webkit-appearance:none; margin:0; }
.sn-vr  { width:1px; height:18px; background:var(--outline-gray-2); margin:0 6px; flex-shrink:0; }

/* Active-format pip — toolbar buttons (Bold / Italic / Underline /
   Strikethrough) flip from the default subtle gray to brand cyan-50 when
   their format is applied on the selected cell. Same hex as the active
   selection wash, so the eye learns "cyan = applied here". */
.sn-fmt-active :deep(button) {
  background: #ECF8FB !important;
  color: #0D7490 !important;
}
.sn-fmt-active :deep(button:hover) {
  background: #D8F1F6 !important;
}

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

/* First-run onboarding hint — floats above the empty grid, dismissed forever
   on click. Anchored bottom-right so it doesn't cover the visible cells. */
.sn-onboarding-hint {
  position:absolute; right:24px; bottom:24px;
  z-index:5;
  max-width:340px;
  padding:14px 16px;
  background:var(--surface-white);
  border:1px solid var(--outline-gray-1);
  border-radius:10px;
  box-shadow:0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
  font-size:13px;
  color:var(--ink-gray-7);
}
.sn-onboarding-hint-title {
  font-weight:600; color:var(--ink-gray-8); margin-bottom:8px;
}
.sn-onboarding-hint-list {
  list-style:none; padding:0; margin:0 0 10px 0;
  display:flex; flex-direction:column; gap:6px;
}
.sn-onboarding-hint-list li {
  display:flex; gap:8px; align-items:center; line-height:1.4;
}
.sn-onboarding-hint-list span { flex:1; color:var(--ink-gray-7); }
.sn-onboarding-hint-actions { display:flex; justify-content:flex-end; }
.sn-painting-format canvas { cursor: crosshair; }
/* Lock canvas interactions while a past version is being previewed.  The
   side panel + banner stay clickable because they live inside the same
   wrap but are absolutely positioned with pointer-events: auto restored. */
.sn-preview-locked canvas { pointer-events: none; opacity: 0.95; }
.sn-preview-locked .sn-vh-panel { pointer-events: auto; }

/* ── Filter overlay (chevrons sit on row 0 of data — the user's header row) ── */
/* Covers the full canvas; button positions come from grid.colX() which already
   includes ROW_HEADER_W. The clip-path masks the row-number gutter (left 50px). */
/* clip-path keeps chevrons out of the row-header strip on the left (50px =
   ROW_HEADER_W) AND the column-header strip on top (24px = COL_HEADER_H);
   without the top inset, the chevrons follow row 0 up over A/B/C/D when
   the user scrolls past the header row. */
.sn-filter-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; clip-path:inset(24px 0 0 50px); }
.sn-filter-btn     { position:absolute; border:1px solid var(--outline-gray-2); border-radius:4px; background:rgba(255,255,255,.92); cursor:pointer; pointer-events:all; padding:0; display:flex; align-items:center; justify-content:center; color:var(--ink-gray-7); box-shadow:0 1px 2px rgba(0,0,0,.05); transition:background-color .12s, border-color .12s, color .12s; }
.sn-filter-btn:hover  { background:var(--surface-white); border-color:var(--outline-gray-4); color:var(--ink-gray-9); }
.sn-filter-btn.active { background:var(--surface-gray-4); border-color:var(--outline-gray-4); color:var(--ink-gray-9); }
.sn-filter-btn-icon   { width:12px; height:12px; }

/* Remote selection rectangle — solid 2px border in the peer's hashed
   colour plus a soft fill so multi-cell ranges read as a region, not just
   an outline. `color-mix` falls back to a transparent rect on browsers
   that don't support it (all evergreen browsers do, and we use Chromium /
   WebKit / Firefox latest). */
.sn-remote-cursor {
  position:absolute; pointer-events:none; box-sizing:border-box;
  border:2px solid var(--rc);
  background: color-mix(in srgb, var(--rc) 10%, transparent);
}
.sn-remote-cursor-label { position:absolute; top:-18px; left:-1px; background:var(--rc); color:var(--surface-white); font-size:10px; font-weight:600; padding:1px 4px; border-radius:3px 3px 3px 0; white-space:nowrap; line-height:16px; }

.sn-filter-panel { position:absolute; z-index:100; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:10px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); padding:12px; width:232px; display:flex; flex-direction:column; gap:8px; }
.sn-fp-title   { font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--ink-gray-8); padding-bottom:2px; }
.sn-fp-row     { display:flex; gap:4px; }
.sn-fp-actions { display:flex; gap:4px; padding-top:2px; }
.sn-fp-grow    { flex:1; }

/* ── Bottom · tabs + stats ───────────────────────────────────────────────── */
.sn-bottom { display:flex; align-items:stretch; height:36px; border-top:1px solid var(--outline-gray-2); background:var(--surface-menu-bar); flex-shrink:0; overflow:hidden; }

.sn-tabs-track {
  display:flex; align-items:stretch; flex:1; gap:0;
  overflow-x:auto; overflow-y:hidden;
  scrollbar-width:none; padding:0 6px;
}
.sn-tabs-track::-webkit-scrollbar { display:none; }

.sn-tab {
  display:inline-flex; align-items:center; flex-shrink:0;
  position:relative; cursor:grab;
  /* The tab itself owns the pill background so label + chevron merge
     into a single visual unit — no inter-button seam, no double-pill
     look. The inner Buttons are transparent and rely on this wrapper
     for their background. */
  border-radius:6px;
  transition:background-color .12s;
}
.sn-tab:active { cursor:grabbing; }
.sn-tab:hover  { background:var(--surface-gray-2); }
.sn-tab--active,
.sn-tab--active:hover { background:var(--surface-gray-3); }

/* Active indicator: 2px line at the bottom */
.sn-tab--active::after {
  content:''; position:absolute; bottom:-2px; left:6px; right:6px;
  height:2px; background:var(--ink-gray-9); border-radius:1px 1px 0 0;
}
.sn-tab--pivot.sn-tab--active::after { background:var(--ink-cyan-7, #0e7490); }

/* Main label Button — transparent so the wrapper's pill shows through.
   No internal hover/active background; that lives on `.sn-tab` itself. */
.sn-tab-btn { max-width:148px; }
.sn-tab-btn :deep(button) {
  font-size:12px; font-weight:400; color:var(--ink-gray-7);
  padding:0 8px; height:28px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:148px; border-radius:0;
  background:transparent !important;
}
.sn-tab--active .sn-tab-btn :deep(button) { font-weight:600; color:var(--ink-gray-9); padding-right:2px; }

/* Pivot icon tint */
.sn-tab--pivot .sn-tab-btn :deep(.icon) { color:var(--ink-cyan-7, #0e7490); }

/* Chevron — active-tab only, sits flush against the label inside the
   same pill so the two read as one button. */
.sn-tab-chevron :deep(button) {
  padding:0 6px 0 2px;
  height:28px;
  border-radius:0;
  background:transparent !important;
  color:var(--ink-gray-6);
}
.sn-tab-chevron :deep(button:hover) { color:var(--ink-gray-9); }

/* Add-sheet button — pin its inner Button to the same 28px height as the
   tab labels and center within the track so the `+` sits on the same row
   axis as the tab text, not floating a couple of pixels above. */
.sn-tab-add { flex-shrink:0; align-self:center; margin:0 4px; }
.sn-tab-add :deep(button) { height:28px; width:28px; padding:0; display:inline-flex; align-items:center; justify-content:center; }

.sn-tab-drag-over::before {
  content:''; position:absolute; left:0; top:6px; bottom:6px;
  width:2px; background:var(--ink-gray-9); border-radius:1px;
}

.sn-stats { display:flex; align-items:center; gap:14px; padding:0 14px; font-size:11px; letter-spacing:.02em; color:var(--ink-gray-6); flex-shrink:0; white-space:nowrap; border-left:1px solid var(--outline-gray-2); height:100%; }

/* ── Right-click context menu (positioned at cursor; uses Frappe UI Buttons inside) ── */
.sn-ctx-menu { position:fixed; z-index:9000; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:10px; box-shadow:0 0 1px rgba(0,0,0,.35), 0 6px 8px -4px rgba(0,0,0,.1); padding:4px; min-width:208px; display:flex; flex-direction:column; gap:1px; overflow-y:auto; }
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
.sn-tab               { cursor:grab; }
.sn-tab:active        { cursor:grabbing; }
.sn-tab-drag-over::before {
  content: ''; position:absolute; left:-1px; top:4px; bottom:4px; width:2px;
  background: var(--ink-gray-9); border-radius:1px;
}

/* Add-more-rows strip — sits between the canvas and the bottom bar. */
.sn-addrows         { display:flex; align-items:center; gap:8px; height:32px; padding:0 12px; border-top:1px solid var(--outline-gray-2); background:var(--surface-menu-bar); flex-shrink:0; }
.sn-addrows-label   { font-size:12px; letter-spacing:.02em; color:var(--ink-gray-6); }
.sn-addrows-input   { width:72px; height:24px; border:1px solid var(--outline-gray-2); border-radius:6px; padding:0 8px; font-size:12px; color:var(--ink-gray-9); background:var(--surface-white); font-family:inherit; outline:none; }
.sn-addrows-input:focus { border-color:var(--outline-gray-4); box-shadow:0 0 0 2px rgba(23,23,23,.10); }

/* Comment panel */
.sn-comment-panel  { position:fixed; z-index:8500; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.14); padding:12px; min-width:240px; display:flex; flex-direction:column; gap:8px; }
.sn-comment-header { display:flex; align-items:center; justify-content:space-between; }
.sn-comment-title  { font-size:12px; font-weight:600; letter-spacing:.04em; color:var(--ink-gray-7); text-transform:uppercase; }
.sn-comment-close  { background:none; border:none; cursor:pointer; color:var(--ink-gray-5); font-size:14px; line-height:1; padding:2px 4px; }
.sn-comment-ta     { resize:vertical; font-family:inherit; font-size:13px; color:var(--ink-gray-9); background:var(--surface-gray-1); border:1px solid var(--outline-gray-2); border-radius:6px; padding:6px 8px; min-height:64px; outline:none; }
.sn-comment-ta:focus { border-color:var(--outline-gray-4); }
.sn-comment-actions { display:flex; gap:6px; justify-content:flex-end; }

/* Validation dropdown panel */
.sn-dropdown-panel { position:fixed; z-index:8500; background:var(--surface-modal); border:1px solid var(--outline-gray-modals); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.12); min-width:120px; max-height:200px; overflow-y:auto; }
.sn-dropdown-opt   { padding:7px 14px; font-size:13px; color:var(--ink-gray-9); cursor:pointer; white-space:nowrap; }
.sn-dropdown-opt:hover { background:var(--surface-gray-2); }

/* Conditional format dialog rows */
.sn-form-stack  { display:flex; flex-direction:column; gap:12px; }
.sn-cf-fmt      { display:flex; flex-direction:row; align-items:center; gap:12px; }
.sn-cf-fmt-label { font-size:12px; color:var(--ink-gray-6); flex:1; }
.sn-cf-hint     { font-size:11px; color:var(--ink-gray-5); margin:0; line-height:1.4; }

/* Colour-scale stop pickers + gradient preview strip */
.sn-cf-scale          { display:flex; gap:12px; align-items:flex-end; }
.sn-cf-stop           { display:flex; flex-direction:column; gap:4px; font-size:11px; color:var(--ink-gray-6); }
.sn-cf-stop input     { width:32px; height:28px; padding:0; border:1px solid var(--outline-gray-2); border-radius:6px; cursor:pointer; }
.sn-cf-scale-preview  {
  height:18px; width:100%; border-radius:4px; border:1px solid var(--outline-gray-2);
}

/* Data-bar preview rows — three bars at sample widths so users can sanity-check the colour. */
.sn-cf-bar-preview    { display:flex; flex-direction:column; gap:4px; padding:6px; background:var(--surface-gray-1); border-radius:6px; border:1px solid var(--outline-gray-2); }
.sn-cf-bar-row        { height:14px; background:var(--surface-white); border-radius:3px; overflow:hidden; }
.sn-cf-bar-fill       { height:100%; opacity:.55; }

/* Existing-rules list at the top of the CF dialog. */
.sn-cf-rule-list       { display:flex; flex-direction:column; gap:4px; padding:8px; background:var(--surface-gray-1); border:1px solid var(--outline-gray-2); border-radius:6px; }
.sn-cf-rule-list-title { font-size:11px; font-weight:500; color:var(--ink-gray-6); text-transform:uppercase; letter-spacing:.04em; padding:2px 4px 4px; }
.sn-cf-rule-row        { display:flex; align-items:center; gap:4px; }
.sn-cf-rule-pick       { flex:1; text-align:left; font-size:12px; color:var(--ink-gray-8); background:var(--surface-white); border:1px solid var(--outline-gray-2); border-radius:5px; padding:6px 8px; cursor:pointer; }
.sn-cf-rule-pick:hover { background:var(--surface-gray-2); }
.sn-cf-rule-row--active .sn-cf-rule-pick { border-color:var(--ink-gray-9); }

</style>

<!-- Unscoped: frappe-ui's Dropdown teleports its menu to document.body, so
     a scoped rule never reaches it. This caps the menu height (and the
     inner content body Reka renders inside it) so long lists like the
     number-format picker stay scrollable instead of falling off-screen. -->
<style>
.dropdown-content,
.dropdown-content [data-slot=content-body] {
  max-height: min(60vh, 480px);
  overflow-y: auto;
}
</style>
