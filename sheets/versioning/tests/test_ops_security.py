# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Tests for the cell-id bound on ``ops.for_cell``.

Without the bound, callers could pass `%` / `_` to broaden the LIKE
pattern and probe ops on cells they aren't actually inspecting. The
match is still safe under SQL injection (the value is parameterised),
but the format guard keeps the surface tight.
"""

from __future__ import annotations

import unittest
from unittest import mock

from sheets.versioning import ops as ops_mod


class CellIdGuard(unittest.TestCase):
	def setUp(self):
		patcher = mock.patch("sheets.versioning.ops.frappe")
		self.frappe = patcher.start()
		self.addCleanup(patcher.stop)
		self.frappe.has_permission.return_value = True
		self.frappe.throw.side_effect = ValueError("bad cell id")

	def test_valid_cell_ids_pass(self):
		self.frappe.db.sql.return_value = []
		for cell in ("A1", "Z99", "AA1", "ZZ9999999"):
			ops_mod.for_cell("SH-1", cell)

	def test_wildcard_rejected(self):
		with self.assertRaises(ValueError):
			ops_mod.for_cell("SH-1", "%")

	def test_underscore_rejected(self):
		with self.assertRaises(ValueError):
			ops_mod.for_cell("SH-1", "A_")

	def test_quote_rejected(self):
		with self.assertRaises(ValueError):
			ops_mod.for_cell("SH-1", 'A1"')

	def test_lowercase_rejected(self):
		with self.assertRaises(ValueError):
			ops_mod.for_cell("SH-1", "a1")

	def test_empty_rejected(self):
		with self.assertRaises(ValueError):
			ops_mod.for_cell("SH-1", "")


if __name__ == "__main__":
	unittest.main()
