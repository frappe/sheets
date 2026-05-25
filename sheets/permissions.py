"""Permission scoping for Sheet's child doctypes.

`Sheet Op Log` and `Sheet Snapshot` carry the full content of every workbook
edit (and, in the snapshot's case, the entire workbook payload). Their
DocType row-perms grant `role: "All", read: 1` so the in-app history views
work for shared collaborators — but without these hooks the stock
`frappe.client.get_list` / `frappe.client.get` endpoints would let any
authenticated user enumerate every sheet on the site.

These hooks scope reads to sheets the caller can actually read on the parent
`Sheet` doctype (owner OR explicitly shared via DocShare). System Managers
and the Administrator bypass — they already have unrestricted access by
design.

Wiring lives in :mod:`sheets.hooks`.
"""

from __future__ import annotations

import frappe

_PRIVILEGED_ROLES = frozenset({"Administrator", "System Manager"})


# ── permission_query_conditions ──────────────────────────────────────────────


def sheet_op_log_query(user: str | None = None) -> str:
	return _scope_to_readable_sheets("`tabSheet Op Log`", user)


def sheet_snapshot_query(user: str | None = None) -> str:
	return _scope_to_readable_sheets("`tabSheet Snapshot`", user)


def _scope_to_readable_sheets(table_prefix: str, user: str | None) -> str:
	"""Return a SQL fragment restricting child rows to readable parent sheets.

	Empty string = no restriction (privileged users). The fragment is AND'd
	into the WHERE clause by Frappe's permission machinery.
	"""
	user = user or frappe.session.user
	if _is_privileged(user):
		return ""
	user_lit = frappe.db.escape(user)
	# Readable sheet = owned by caller OR shared with caller via DocShare.
	# Mirrors the Sheet doctype's `if_owner` rule plus the standard share grant.
	return (
		f"{table_prefix}.sheet IN ("
		f"SELECT name FROM `tabSheet` WHERE owner = {user_lit} "
		f"UNION "
		f"SELECT share_name FROM `tabDocShare` "
		f"WHERE share_doctype = 'Sheet' AND user = {user_lit} AND `read` = 1"
		f")"
	)


# ── has_permission ───────────────────────────────────────────────────────────


def sheet_op_log_has_permission(doc, ptype: str = "read", user: str | None = None) -> bool:
	return _child_has_permission(doc, ptype, user)


def sheet_snapshot_has_permission(doc, ptype: str = "read", user: str | None = None) -> bool:
	return _child_has_permission(doc, ptype, user)


def _child_has_permission(doc, ptype: str, user: str | None) -> bool:
	"""Per-doc gate: a child row is readable iff its parent Sheet is readable.

	Mutations on a child are gated on *write* on the parent — these doctypes
	are append-only logs that nobody should be hand-editing via the Desk or
	the client API anyway (internal writers use `ignore_permissions=True`).
	"""
	user = user or frappe.session.user
	if _is_privileged(user):
		return True
	sheet_name = _extract_sheet(doc)
	if not sheet_name:
		return False
	parent_ptype = "read" if ptype in _READ_PTYPES else "write"
	return bool(
		frappe.has_permission("Sheet", doc=sheet_name, ptype=parent_ptype, user=user)
	)


_READ_PTYPES = frozenset({"read", "report", "export", "email", "print", "select"})


def _extract_sheet(doc) -> str | None:
	"""Pull the parent sheet name from either a Document or a plain dict."""
	if doc is None:
		return None
	if isinstance(doc, dict):
		return doc.get("sheet")
	return getattr(doc, "sheet", None)


def _is_privileged(user: str) -> bool:
	if user == "Administrator":
		return True
	return bool(_PRIVILEGED_ROLES.intersection(frappe.get_roles(user)))
