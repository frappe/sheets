"""Bucketed timeline listing for the version history panel.

Snapshots are grouped server-side into time buckets relative to the caller's
timezone offset. The client renders only what it receives — no client-side
date math, no surprise rebucketing on DST boundaries.

Pagination is cursor-based: callers pass back `next_cursor` opaque values and
never count, offset, or skip rows.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta

import frappe
from frappe.utils import get_datetime, now_datetime

# Bucket names returned to the client. The UI groups rows under these labels.
BUCKET_PINNED = "pinned"
BUCKET_TODAY = "today"
BUCKET_YESTERDAY = "yesterday"
BUCKET_WEEK = "week"
BUCKET_EARLIER = "earlier"

ALL_BUCKETS = (BUCKET_PINNED, BUCKET_TODAY, BUCKET_YESTERDAY, BUCKET_WEEK, BUCKET_EARLIER)


def list_buckets(sheet: str, tz_offset_minutes: int = 0, bucket_limit: int = 20) -> dict:
	"""Return a first-page payload for the history panel.

	Shape:
	  { "buckets": {
	      "pinned":    { "items": [...], "count": N, "next_cursor": str|None },
	      "today":     { ... },
	      "yesterday": { ... },
	      "week":      { ... },
	      "earlier":   { ... },
	    },
	    "head_snapshot": str|None,
	  }
	"""
	frappe.has_permission("Sheet", doc=sheet, throw=True)
	now_local = now_datetime() + timedelta(minutes=tz_offset_minutes)
	start_today = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
	start_yesterday = start_today - timedelta(days=1)
	start_week = start_today - timedelta(days=7)

	# Convert the local bucket boundaries back to server UTC for SQL.
	utc_today = start_today - timedelta(minutes=tz_offset_minutes)
	utc_yesterday = start_yesterday - timedelta(minutes=tz_offset_minutes)
	utc_week = start_week - timedelta(minutes=tz_offset_minutes)

	pinned = _query_bucket(sheet, pinned_only=True, limit=bucket_limit)
	today = _query_bucket(sheet, after=utc_today, limit=bucket_limit)
	yesterday = _query_bucket(
		sheet, after=utc_yesterday, before=utc_today, limit=bucket_limit
	)
	week = _query_bucket(
		sheet, after=utc_week, before=utc_yesterday, limit=bucket_limit
	)
	earlier = _query_bucket(sheet, before=utc_week, limit=bucket_limit)

	head_snapshot = frappe.db.get_value("Sheet", sheet, "head_snapshot")

	return {
		"buckets": {
			BUCKET_PINNED: pinned,
			BUCKET_TODAY: today,
			BUCKET_YESTERDAY: yesterday,
			BUCKET_WEEK: week,
			BUCKET_EARLIER: earlier,
		},
		"head_snapshot": head_snapshot,
	}


def list_bucket_page(
	sheet: str,
	bucket: str,
	cursor: str | None = None,
	limit: int = 20,
	tz_offset_minutes: int = 0,
) -> dict:
	"""Fetch a subsequent page within a single bucket."""
	if bucket not in ALL_BUCKETS:
		frappe.throw(f"Unknown bucket: {bucket}")
	frappe.has_permission("Sheet", doc=sheet, throw=True)

	now_local = now_datetime() + timedelta(minutes=tz_offset_minutes)
	start_today = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
	start_yesterday = start_today - timedelta(days=1)
	start_week = start_today - timedelta(days=7)
	utc_today = start_today - timedelta(minutes=tz_offset_minutes)
	utc_yesterday = start_yesterday - timedelta(minutes=tz_offset_minutes)
	utc_week = start_week - timedelta(minutes=tz_offset_minutes)

	kwargs = {"sheet": sheet, "limit": limit, "cursor": _decode_cursor(cursor)}
	if bucket == BUCKET_PINNED:
		kwargs["pinned_only"] = True
	elif bucket == BUCKET_TODAY:
		kwargs["after"] = utc_today
	elif bucket == BUCKET_YESTERDAY:
		kwargs["after"] = utc_yesterday
		kwargs["before"] = utc_today
	elif bucket == BUCKET_WEEK:
		kwargs["after"] = utc_week
		kwargs["before"] = utc_yesterday
	elif bucket == BUCKET_EARLIER:
		kwargs["before"] = utc_week

	return _query_bucket(**kwargs)


def _query_bucket(
	sheet: str,
	*,
	pinned_only: bool = False,
	after: datetime | None = None,
	before: datetime | None = None,
	limit: int = 20,
	cursor: int | None = None,
) -> dict:
	filters = {"sheet": sheet}
	if pinned_only:
		filters["pinned"] = 1
	if after is not None:
		filters["creation"] = (">=", after)
	if before is not None:
		# Combine with `after` if present — Frappe accepts a tuple of conditions
		# via the `between` operator, but two separate conditions is clearer.
		filters_extra = filters.copy()
		if after is not None:
			# We need both bounds; use raw SQL for the dual-condition case.
			return _query_dual_bound(
				sheet=sheet,
				after=after,
				before=before,
				pinned_only=pinned_only,
				limit=limit,
				cursor=cursor,
			)
		filters["creation"] = ("<", before)
	if cursor is not None:
		filters["seq"] = ("<", cursor)

	rows = frappe.get_all(
		"Sheet Snapshot",
		filters=filters,
		fields=["name", "seq", "kind", "label", "pinned", "op_count", "actor", "creation"],
		order_by="seq desc",
		limit=limit + 1,
	)
	return _shape(rows, limit)


def _query_dual_bound(
	sheet: str,
	after: datetime,
	before: datetime,
	pinned_only: bool,
	limit: int,
	cursor: int | None,
) -> dict:
	conditions = ["sheet = %(sheet)s", "creation >= %(after)s", "creation < %(before)s"]
	params: dict = {"sheet": sheet, "after": after, "before": before, "limit": limit + 1}
	if pinned_only:
		conditions.append("pinned = 1")
	if cursor is not None:
		conditions.append("seq < %(cursor)s")
		params["cursor"] = cursor
	sql = (
		"SELECT name, seq, kind, label, pinned, op_count, actor, creation "
		"FROM `tabSheet Snapshot` "
		f"WHERE {' AND '.join(conditions)} "
		"ORDER BY seq DESC LIMIT %(limit)s"
	)
	rows = frappe.db.sql(sql, params, as_dict=True)
	return _shape(rows, limit)


def _shape(rows: list[dict], limit: int) -> dict:
	has_more = len(rows) > limit
	items = rows[:limit]
	next_cursor = _encode_cursor(items[-1]["seq"]) if has_more and items else None
	return {
		"items": [_serialise(r) for r in items],
		"count": len(items),
		"next_cursor": next_cursor,
	}


def _serialise(row: dict) -> dict:
	return {
		"id": row["name"],
		"seq": int(row.get("seq") or 0),
		"kind": row.get("kind"),
		"label": row.get("label"),
		"pinned": bool(row.get("pinned")),
		"op_count": int(row.get("op_count") or 0),
		"actor": row.get("actor"),
		"creation": row.get("creation").isoformat() if row.get("creation") else None,
	}


def _encode_cursor(seq: int) -> str:
	return base64.urlsafe_b64encode(json.dumps({"seq": int(seq)}).encode()).decode()


def _decode_cursor(cursor: str | None) -> int | None:
	if not cursor:
		return None
	try:
		raw = base64.urlsafe_b64decode(cursor.encode()).decode()
		return int(json.loads(raw)["seq"])
	except Exception:
		frappe.throw("Invalid cursor")
