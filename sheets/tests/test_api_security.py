# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Permission-shape tests for the whitelisted API.

These are *not* end-to-end (no DB), they just assert that each endpoint
calls ``frappe.has_permission`` with the right ptype. That's the
specific shape the security audit said needed to stick: read-only users
must not be able to push mutation-shaped broadcasts, and write-shaped
endpoints must consult write permission before doing anything else.
"""

from __future__ import annotations

import unittest
from unittest import mock


class _PermCheckBase(unittest.TestCase):
	def setUp(self):
		patcher = mock.patch("sheets.api.frappe")
		self.frappe = patcher.start()
		self.addCleanup(patcher.stop)
		self.frappe.session.user = "alice@example.com"
		# `has_permission` returns True by default — endpoints proceed past
		# the gate so we can also assert what they emit downstream.
		self.frappe.has_permission.return_value = True
		# Content-write endpoints now delegate to the shared helpers (which
		# fold in the public-edit link). Patch them in the api namespace so
		# the unit tests stay DB-free and can assert the delegation shape.
		acw = mock.patch("sheets.api.assert_can_write_sheet")
		self.assert_can_write = acw.start()
		self.addCleanup(acw.stop)
		cw = mock.patch("sheets.api.can_write_sheet", return_value=True)
		self.can_write = cw.start()
		self.addCleanup(cw.stop)


class BroadcastsRequireWrite(_PermCheckBase):
	def test_broadcast_op_requires_write(self):
		from sheets import api

		api.broadcast_op("SH-1", '{"op_type":"edit"}')
		# Delegates to the shared write gate (which folds in the public-edit link).
		self.assert_can_write.assert_called_once_with("SH-1")

	def test_yjs_update_requires_write(self):
		from sheets import api

		api.yjs_relay("SH-1", "yjs_update", "<opaque>")
		self.assert_can_write.assert_called_once_with("SH-1")

	def test_yjs_state_requires_write(self):
		from sheets import api

		api.yjs_relay("SH-1", "yjs_state", "<opaque>")
		self.assert_can_write.assert_called_once_with("SH-1")


class PresenceStaysRead(_PermCheckBase):
	def test_ping_presence_is_read(self):
		from sheets import api

		# user_identity does a db lookup; stub the fields out.
		self.frappe.db.get_value.return_value = ""
		api.ping_presence("SH-1")
		# Only the read-shape call matters here.
		args, kwargs = self.frappe.has_permission.call_args
		self.assertEqual(kwargs.get("doc"), "SH-1")
		self.assertEqual(kwargs.get("throw"), True)
		# No ptype kwarg ⇒ defaults to read.
		self.assertNotIn("ptype", kwargs)

	def test_yjs_awareness_is_read(self):
		from sheets import api

		# Read-side events probe read perm non-throwing (throw=False) so a
		# public-link viewer can fall through to the is_public bypass.
		api.yjs_relay("SH-1", "yjs_awareness", "<opaque>")
		self.frappe.has_permission.assert_called_with(
			"Sheet", doc="SH-1", ptype="read", throw=False
		)

	def test_yjs_state_request_is_read(self):
		from sheets import api

		api.yjs_relay("SH-1", "yjs_state_request", "<opaque>")
		self.frappe.has_permission.assert_called_with(
			"Sheet", doc="SH-1", ptype="read", throw=False
		)


class UnknownYjsEventRejected(_PermCheckBase):
	def test_unknown_event_throws_before_perm_check(self):
		from sheets import api

		self.frappe.throw.side_effect = RuntimeError("nope")
		with self.assertRaises(RuntimeError):
			api.yjs_relay("SH-1", "yjs_eval_payload", "<opaque>")
		# Throw must fire before we even consult perms — otherwise an attacker
		# can use the perm check as an oracle for sheet existence.
		self.frappe.has_permission.assert_not_called()


class ShareSheetRejectsDisabledUsers(_PermCheckBase):
	def test_disabled_user_rejected(self):
		from sheets import api

		# `enabled = 0` → throw.
		self.frappe.db.get_value.return_value = 0
		self.frappe.throw.side_effect = RuntimeError("disabled")
		with self.assertRaises(RuntimeError):
			api.share_sheet("SH-1", "bob@example.com")
		self.frappe.share.add.assert_not_called()

	def test_missing_user_rejected(self):
		from sheets import api

		self.frappe.db.get_value.return_value = None
		self.frappe.throw.side_effect = RuntimeError("not found")
		with self.assertRaises(RuntimeError):
			api.share_sheet("SH-1", "ghost@example.com")
		self.frappe.share.add.assert_not_called()

	def test_enabled_user_shared(self):
		from sheets import api

		self.frappe.db.get_value.return_value = 1
		api.share_sheet("SH-1", "bob@example.com", write=1)
		self.frappe.share.add.assert_called_once()


class GetSheetPublicGate(_PermCheckBase):
	"""The public-link gate: only public sheets skip the read permission check.

	`get_sheet` is `allow_guest=True`, so the read gate is what stops a guest /
	stranger from reading a *private* sheet. We assert the gate fires for
	private sheets and is skipped for public ones.
	"""

	def test_private_sheet_checks_read_permission(self):
		from sheets import api

		# is_public falsy → the read gate must fire (throw=True).
		self.frappe.db.get_value.return_value = {"is_public": 0, "public_write": 0}
		api.get_sheet("SH-1", compressed=1)
		read_gate = [
			c for c in self.frappe.has_permission.call_args_list
			if c.kwargs.get("throw") is True
		]
		self.assertTrue(read_gate, "private sheet must hit the read gate")
		self.assertEqual(read_gate[0].kwargs.get("doc"), "SH-1")

	def test_public_sheet_skips_read_gate(self):
		from sheets import api

		# is_public truthy → no throwing read gate (anyone may read).
		self.frappe.db.get_value.return_value = {"is_public": 1, "public_write": 0}
		out = api.get_sheet("SH-1", compressed=1)
		threw = [
			c for c in self.frappe.has_permission.call_args_list
			if c.kwargs.get("throw") is True
		]
		self.assertEqual(threw, [], "public sheet must not throw on read")
		self.assertTrue(out["is_public"])

	def test_guest_on_public_sheet_is_view_only(self):
		from sheets import api

		self.frappe.session.user = "Guest"
		self.frappe.db.get_value.return_value = {"is_public": 1, "public_write": 1}
		out = api.get_sheet("SH-1", compressed=1)
		# Guests never get write — even on a public_write sheet, and we
		# short-circuit before consulting can_write_sheet at all.
		self.assertFalse(out["can_write"])
		self.can_write.assert_not_called()

	def test_logged_in_writer_gets_can_write(self):
		from sheets import api

		self.frappe.db.get_value.return_value = {"is_public": 1, "public_write": 0}
		self.can_write.return_value = True
		out = api.get_sheet("SH-1", compressed=1)
		self.assertTrue(out["can_write"])

	def test_public_write_flag_is_returned(self):
		from sheets import api

		self.frappe.db.get_value.return_value = {"is_public": 1, "public_write": 1}
		out = api.get_sheet("SH-1", compressed=1)
		self.assertTrue(out["public_write"])


class SetSheetPublicGated(_PermCheckBase):
	def test_requires_share_permission(self):
		from sheets import api

		api.set_sheet_public("SH-1", public=1)
		# Share right is the gate — same bar as granting access to a user.
		self.frappe.has_permission.assert_called_with(
			"Sheet", doc="SH-1", ptype="share", throw=True
		)

	def test_sets_is_public_flag(self):
		from sheets import api

		api.set_sheet_public("SH-1", public=1)
		self.frappe.db.set_value.assert_called_with(
			"Sheet", "SH-1", {"is_public": 1, "public_write": 0}
		)
		api.set_sheet_public("SH-1", public=0)
		self.frappe.db.set_value.assert_called_with(
			"Sheet", "SH-1", {"is_public": 0, "public_write": 0}
		)

	def test_public_write_requires_public(self):
		from sheets import api

		# write=1 with a public link → both flags on.
		api.set_sheet_public("SH-1", public=1, write=1)
		self.frappe.db.set_value.assert_called_with(
			"Sheet", "SH-1", {"is_public": 1, "public_write": 1}
		)
		# write=1 but public off → public_write is forced back to 0. You
		# can't have an editable link nobody can open.
		api.set_sheet_public("SH-1", public=0, write=1)
		self.frappe.db.set_value.assert_called_with(
			"Sheet", "SH-1", {"is_public": 0, "public_write": 0}
		)


class UnshareSheetGated(_PermCheckBase):
	def test_unshare_removes_named_user(self):
		from sheets import api

		api.unshare_sheet("SH-1", "bob@example.com")
		self.frappe.has_permission.assert_called_with(
			"Sheet", doc="SH-1", ptype="share", throw=True
		)
		self.frappe.share.remove.assert_called_once_with(
			"Sheet", "SH-1", "bob@example.com"
		)


class RenameSheetGated(_PermCheckBase):
	def test_rename_checks_write_before_load(self):
		from sheets import api

		self.frappe.get_doc.return_value = mock.Mock(name="SH-1")
		api.rename_sheet("SH-1", "New title")
		# Rename is gated through the shared write helper (which honours the
		# public-edit link), not a bare has_permission call.
		self.assert_can_write.assert_called_once_with("SH-1")


if __name__ == "__main__":
	unittest.main()
