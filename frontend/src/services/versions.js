// Client for the v2 versioning API.
//
// Server-side architecture: event log (Sheet Op Log) + checkpointed
// snapshots (Sheet Snapshot). See sheets/versioning/ for the
// docstrings. This module is a thin shim that maps v2 endpoints to the
// shape the existing UI layer consumes, so the version-history panel and
// cell-history popover stay drop-in compatible while we keep moving.

import { call } from '../utils/api.js'

const PREFIX = 'sheets.versioning.api'

const _tzOffsetMinutes = () => -new Date().getTimezoneOffset()

// ── Timeline (replaces list_versions) ────────────────────────────────────────

const BUCKET_ORDER = ['pinned', 'today', 'yesterday', 'week', 'earlier']

// Flattens the bucketed timeline payload back into the per-row array the
// existing VersionHistory.vue consumes. The panel's own day-grouping then
// re-derives the visual sections from `timestamp`, so the change is
// transparent to UI code.
export async function list(sheet, _limit = 200) {
	const payload = await call(`${PREFIX}.timeline`, {
		sheet,
		tz_offset_minutes: _tzOffsetMinutes(),
		bucket_limit: 40,
	})
	const rows = []
	const seen = new Set()
	for (const bucket of BUCKET_ORDER) {
		const items = payload?.buckets?.[bucket]?.items || []
		for (const it of items) {
			if (seen.has(it.id)) continue   // pinned snapshots also appear in date buckets
			seen.add(it.id)
			rows.push(_toVersionRow(it))
		}
	}
	rows.sort((a, b) => (b.seq || 0) - (a.seq || 0))
	return rows
}

function _toVersionRow(item) {
	return {
		name:           item.id,
		seq:            item.seq,
		user:           item.actor,
		timestamp:      item.creation,
		version_name:   item.label || '',
		pinned:         !!item.pinned,
		primary_op:     item.kind,
		op_labels:      _opLabel(item),
		collapsed_count: 1,
	}
}

function _opLabel(item) {
	if (item.kind === 'milestone') return ['Milestone']
	if (item.kind === 'named')     return ['Named version']
	if (item.op_count > 0)         return [`${item.op_count} edit${item.op_count === 1 ? '' : 's'}`]
	return []
}

// ── State (replaces get_version_state) ────────────────────────────────────────

export async function getState(sheet, version) {
	const state = await call(`${PREFIX}.state_at`, { snapshot: version })
	// The panel reads { sheets_data, title }; we don't carry a separate
	// title in the snapshot — fall back to the live one.
	return { sheets_data: state.sheets_data || '{}', title: state.label || '' }
}

// ── Restore (replaces restore_version) ────────────────────────────────────────

export async function restore(_sheet, version) {
	return call(`${PREFIX}.restore`, { snapshot: version })
}

// ── Label / pin (replaces name_version + clear_version_name) ──────────────────

export async function name(_sheet, version, versionName) {
	return call(`${PREFIX}.label_snapshot`, { snapshot: version, label: versionName })
}

export async function clearName(_sheet, version) {
	return call(`${PREFIX}.label_snapshot`, { snapshot: version, label: '', pinned: 0 })
}

// ── Explicit "Save version" — UI button that pins right now. ─────────────────

export async function saveVersion(sheet, versionName) {
	return call(`${PREFIX}.save_snapshot`, { sheet, label: versionName })
}

// ── Make a copy ───────────────────────────────────────────────────────────────
//
// v2 doesn't have a dedicated copy endpoint; we replay the snapshot state
// into a brand-new sheet via the standard save flow.

export async function makeACopy(sheet, version, title = '') {
	const state = await call(`${PREFIX}.state_at`, { snapshot: version })
	const out = await call('sheets.api.save_sheet', {
		title:       title || 'Copy',
		sheets_data: state.sheets_data || '{}',
	})
	return out?.name || out
}

// ── Cell history (replaces cell_history) ──────────────────────────────────────
//
// v2 queries the canonical op log directly — much faster than the old
// version-diff walk because we don't materialise intermediate state.

export async function cellHistory(sheet, cellRef, sheetName = 'Sheet1', limit = 50) {
	const ops = await call(`${PREFIX}.ops_for_cell`, {
		sheet,
		cell_id:   cellRef,
		sub_sheet: sheetName,
		limit,
	})
	// Adapter for CellHistoryPopover.vue's existing field names.
	return (ops || []).map(o => ({
		version:   o.id,
		timestamp: o.creation,
		user:      o.actor,
		before:    o.before,
		after:     o.after,
	}))
}

// ── Cell diff (legacy, no v2 equivalent yet) ──────────────────────────────────
//
// The old preview-highlight feature diffed consecutive Version blobs. With
// sparse snapshots this becomes a server-heavy operation; we defer it until
// a dedicated diff endpoint lands. Returning empty keeps the panel happy.

export async function cellDiff(_sheet, _version, _against = '') {
	return { sheets: {} }
}

// ── Op recording — fire-and-forget audit logging. ─────────────────────────────
//
// In the new model ops are submitted as a batch with each save (see
// usePersistence). This single-op endpoint is kept for ad-hoc / realtime
// callers that want to record an action without forcing a save.

export function recordOp({ sheet, opType, cellRefs = null, before = null,
                           after = null, summary = '', subSheet = '' }) {
	return call('sheets.api.record_op', {
		sheet,
		op_type:   opType,
		cell_refs: cellRefs && JSON.stringify(cellRefs),
		before:    before && JSON.stringify(before),
		after:     after  && JSON.stringify(after),
		summary,
		sub_sheet: subSheet,
	})
}

// Used to be the Version row created by the latest save. The new model
// doesn't have a 1:1 (ops aren't pinned to versions), so we return the
// current head_seq — that's what callers actually need (a monotonic
// ordering anchor).

export async function latestVersion(sheet) {
	const head = await call(`${PREFIX}.head`, { sheet })
	return head?.head_seq ?? 0
}
