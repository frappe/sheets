# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Lock-in tests for child-doctype permission scoping.

These guard against regressions in the most serious finding from the
security audit: the stock `frappe.client.get_list` reading Sheet Op Log /
Sheet Snapshot must be scoped to sheets the caller can actually read.

We exercise the pure functions directly — they're branch-y but free of
side effects, so we mock `frappe.session.user`, `frappe.get_roles`,
`frappe.has_permission`, and `frappe.db.escape` to keep the tests
hermetic.
"""

from __future__ import annotations

import unittest
from unittest import mock

from sheets import permissions


def _esc(value):
	return f"'{value}'"


class QueryConditions(unittest.TestCase):
	def test_administrator_gets_no_filter(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "Administrator"
			self.assertEqual(permissions.sheet_op_log_query(), "")
			self.assertEqual(permissions.sheet_snapshot_query(), "")

	def test_system_manager_gets_no_filter(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "sm@example.com"
			f.get_roles.return_value = ["System Manager", "All"]
			self.assertEqual(permissions.sheet_op_log_query(), "")

	def test_regular_user_scoped_to_owned_and_shared(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			f.db.escape.side_effect = _esc
			sql = permissions.sheet_op_log_query()
		# Restriction must reference both ownership and DocShare paths, AND
		# must scope by the *caller's* identity (no other email leaked in).
		self.assertIn("`tabSheet Op Log`.sheet IN", sql)
		self.assertIn("FROM `tabSheet` WHERE owner = 'alice@example.com'", sql)
		self.assertIn("FROM `tabDocShare`", sql)
		self.assertIn("share_doctype = 'Sheet'", sql)
		self.assertIn("user = 'alice@example.com'", sql)

	def test_snapshot_query_targets_snapshot_table(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			f.db.escape.side_effect = _esc
			sql = permissions.sheet_snapshot_query()
		self.assertIn("`tabSheet Snapshot`.sheet IN", sql)


class HasPermission(unittest.TestCase):
	def test_admin_short_circuits(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "Administrator"
			doc = mock.Mock(sheet="SH-1")
			self.assertTrue(
				permissions.sheet_op_log_has_permission(doc, ptype="read")
			)
			# `has_permission` on parent must not be consulted for the admin.
			f.has_permission.assert_not_called()

	def test_read_on_child_delegates_to_read_on_parent(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			f.has_permission.return_value = True
			doc = mock.Mock(sheet="SH-1")
			self.assertTrue(
				permissions.sheet_op_log_has_permission(doc, ptype="read")
			)
			f.has_permission.assert_called_once_with(
				"Sheet", doc="SH-1", ptype="read", user="alice@example.com"
			)

	def test_write_on_child_requires_write_on_parent(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			f.has_permission.return_value = False
			doc = mock.Mock(sheet="SH-1")
			self.assertFalse(
				permissions.sheet_snapshot_has_permission(doc, ptype="write")
			)
			f.has_permission.assert_called_once_with(
				"Sheet", doc="SH-1", ptype="write", user="alice@example.com"
			)

	def test_doc_with_no_sheet_denied(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			# Plain dict shape (Frappe sometimes hands raw dicts to the hook).
			self.assertFalse(
				permissions.sheet_op_log_has_permission({}, ptype="read")
			)

	def test_dict_doc_extracts_sheet(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.get_roles.return_value = ["All"]
			f.has_permission.return_value = True
			self.assertTrue(
				permissions.sheet_snapshot_has_permission(
					{"sheet": "SH-7"}, ptype="read"
				)
			)


class CanWriteSheet(unittest.TestCase):
	"""The public-edit link: write via real perm OR a public_write sheet."""

	def test_real_write_perm_short_circuits(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "alice@example.com"
			f.has_permission.return_value = True
			self.assertTrue(permissions.can_write_sheet("SH-1"))
			# We never fall through to the public-flag lookup.
			f.db.get_value.assert_not_called()

	def test_guest_never_writes_even_on_public_write(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "Guest"
			f.has_permission.return_value = False
			self.assertFalse(permissions.can_write_sheet("SH-1"))
			# Guests are refused before the public-flag lookup runs.
			f.db.get_value.assert_not_called()

	def test_signed_in_user_writes_via_public_write_link(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "bob@example.com"
			f.has_permission.return_value = False
			f.db.get_value.return_value = {"is_public": 1, "public_write": 1}
			self.assertTrue(permissions.can_write_sheet("SH-1"))

	def test_public_view_only_link_is_not_writable(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "bob@example.com"
			f.has_permission.return_value = False
			f.db.get_value.return_value = {"is_public": 1, "public_write": 0}
			self.assertFalse(permissions.can_write_sheet("SH-1"))

	def test_assert_raises_permission_error_when_denied(self):
		with mock.patch("sheets.permissions.frappe") as f:
			f.session.user = "bob@example.com"
			f.has_permission.return_value = False
			f.db.get_value.return_value = {"is_public": 0, "public_write": 0}
			f.PermissionError = type("PermissionError", (Exception,), {})
			f.throw.side_effect = lambda msg, exc=Exception: (_ for _ in ()).throw(exc(msg))
			f._ = lambda s: s
			with self.assertRaises(f.PermissionError):
				permissions.assert_can_write_sheet("SH-1")


if __name__ == "__main__":
	unittest.main()
