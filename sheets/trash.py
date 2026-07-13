"""Sheet trash lifecycle: soft-delete retention and permanent purge.

`delete_sheet` no longer destroys a Sheet — it flags it `trashed` so the owner
can restore it (see :mod:`sheets.api`). This module owns the two ends that flag
implies:

  * ``hard_delete_sheet`` — the actual cascade that erases a Sheet and its
    versioning tables. Called by the user-facing "delete forever" endpoint and
    by the nightly purge. Kept here (not in the API) so both paths share one
    definition of "gone".

  * ``purge_trashed_sheets`` — the scheduled job that permanently removes
    sheets trashed longer than the retention window.

Retention defaults to 30 days (matching Google Drive / Figma / iCloud), and is
overridable per-site via ``sheets_trash_retention_days`` in site_config. The
floor of 1 day stops a misconfigured ``0`` from turning the trash back into an
instant hard delete.
"""

from __future__ import annotations

from datetime import timedelta

import frappe
from frappe.utils import now_datetime

DEFAULT_RETENTION_DAYS = 30
MIN_RETENTION_DAYS = 1


def retention_days() -> int:
	configured = frappe.conf.get("sheets_trash_retention_days")
	if configured is None:
		return DEFAULT_RETENTION_DAYS
	return max(MIN_RETENTION_DAYS, int(configured))


def hard_delete_sheet(name: str) -> None:
	"""Permanently erase a Sheet and its versioning tables, in dependency order.

	Frappe's default link enforcement blocks deletion while child rows exist, so
	the head pointer is cleared first and the child tables are dropped directly
	before the parent doc. This is the original `delete_sheet` cascade, moved
	here so the "delete forever" endpoint and the purge job stay in lockstep.
	"""
	frappe.db.set_value("Sheet", name, "head_snapshot", None, update_modified=False)
	frappe.db.delete("Sheet Snapshot", {"sheet": name})
	frappe.db.delete("Sheet Op Log",   {"sheet": name})
	frappe.db.delete("Sheet Seq",      {"sheet": name})
	frappe.delete_doc("Sheet", name, ignore_permissions=True)


def purge_trashed_sheets() -> dict:
	"""Permanently delete sheets trashed longer than the retention window.

	Idempotent and safe to re-run. Commits per sheet so a mid-run failure
	doesn't strand progress. Returns a counter for telemetry.
	"""
	cutoff = now_datetime() - timedelta(days=retention_days())
	expired = frappe.get_all(
		"Sheet",
		filters={"trashed": 1, "trashed_on": ["<", cutoff]},
		pluck="name",
	)
	for name in expired:
		hard_delete_sheet(name)
		frappe.db.commit()
	return {"purged": len(expired)}
