"""Whitelisted v2 versioning endpoints.

Public surface (all under /api/method/sheets.versioning.api.*):

  * timeline(sheet, tz_offset_minutes)        — first-page bucketed listing
  * timeline_page(sheet, bucket, cursor)      — paginated bucket fetch
  * save_snapshot(sheet, label)               — explicit "Save version"
  * state_at(snapshot)                        — historical state read
  * restore(snapshot)                         — non-destructive restore
  * label_snapshot(snapshot, label, pinned)   — rename/pin
  * delete_snapshot(snapshot)                 — unpinned only
  * ops_between(sheet, from_seq, to_seq)      — activity timeline expansion
  * ops_for_cell(sheet, cell_id, sub_sheet)   — cell history popover
  * head(sheet)                               — quick head metadata
"""

from __future__ import annotations

import frappe

from . import labels as labels_mod
from . import ops as ops_mod
from . import snapshots as snap_mod
from . import state as state_mod
from . import timeline as timeline_mod


# Hard upper bounds on user-supplied `limit` parameters. The underlying
# modules already gate on read permission, but an authenticated caller
# could otherwise pass `limit=99_999_999` and force the DB to walk huge
# slices of the op-log / snapshot table — cheap DoS we have no reason
# to leave open. Defaults (`bucket_limit=20`, page `limit=20`, etc.)
# stay where they are; these caps only kick in when the caller passes
# an absurd value.
_MAX_BUCKET_LIMIT = 200
_MAX_PAGE_LIMIT   = 500
_MAX_OPS_LIMIT    = 1000


def _clamp(value: int, hi: int) -> int:
	v = int(value)
	if v < 1:
		return 1
	return v if v <= hi else hi


@frappe.whitelist()
def timeline(sheet: str, tz_offset_minutes: int = 0, bucket_limit: int = 20) -> dict:
	return timeline_mod.list_buckets(
		sheet,
		tz_offset_minutes=int(tz_offset_minutes),
		bucket_limit=_clamp(bucket_limit, _MAX_BUCKET_LIMIT),
	)


@frappe.whitelist()
def timeline_page(
	sheet: str,
	bucket: str,
	cursor: str = "",
	limit: int = 20,
	tz_offset_minutes: int = 0,
) -> dict:
	return timeline_mod.list_bucket_page(
		sheet,
		bucket,
		cursor=cursor or None,
		limit=_clamp(limit, _MAX_PAGE_LIMIT),
		tz_offset_minutes=int(tz_offset_minutes),
	)


@frappe.whitelist()
def save_snapshot(sheet: str, label: str = "") -> dict:
	frappe.has_permission("Sheet", doc=sheet, ptype="write", throw=True)
	clean = (label or "").strip()
	if not clean:
		frappe.throw("Label is required for a named snapshot")
	name = snap_mod.create(sheet, kind=snap_mod.KIND_NAMED, label=clean)
	return {"id": name}


@frappe.whitelist()
def state_at(snapshot: str) -> dict:
	return state_mod.at(snapshot)


@frappe.whitelist()
def restore(snapshot: str) -> dict:
	snap = frappe.db.get_value("Sheet Snapshot", snapshot, "sheet")
	if not snap:
		frappe.throw(f"Snapshot {snapshot} not found")
	frappe.has_permission("Sheet", doc=snap, ptype="write", throw=True)
	return state_mod.restore(snapshot)


@frappe.whitelist()
def label_snapshot(snapshot: str, label: str = "", pinned: int | None = None) -> dict:
	return labels_mod.set_label(
		snapshot,
		label=label if label != "" else None,
		pinned=None if pinned is None else bool(int(pinned)),
	)


@frappe.whitelist()
def delete_snapshot(snapshot: str) -> dict:
	return labels_mod.delete(snapshot)


@frappe.whitelist()
def ops_between(sheet: str, from_seq: int, to_seq: int, limit: int = 200) -> list[dict]:
	return ops_mod.between(
		sheet, int(from_seq), int(to_seq), limit=_clamp(limit, _MAX_OPS_LIMIT)
	)


@frappe.whitelist()
def ops_for_cell(
	sheet: str, cell_id: str, sub_sheet: str = "", limit: int = 50
) -> list[dict]:
	return ops_mod.for_cell(
		sheet, cell_id, sub_sheet=sub_sheet or None, limit=_clamp(limit, _MAX_OPS_LIMIT)
	)


@frappe.whitelist()
def head(sheet: str) -> dict:
	frappe.has_permission("Sheet", doc=sheet, throw=True)
	row = frappe.db.get_value(
		"Sheet", sheet, ["head_seq", "head_snapshot"], as_dict=True
	) or {}
	return {
		"sheet": sheet,
		"head_seq": int(row.get("head_seq") or 0),
		"head_snapshot": row.get("head_snapshot"),
	}
