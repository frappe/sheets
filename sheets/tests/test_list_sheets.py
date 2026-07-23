# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Shape tests for ``list_sheets`` pagination, filtering and sorting.

DB-free (``sheets.api.frappe`` is mocked, matching test_api_security.py):
they assert what the endpoint passes to ``get_list`` — the clamped window,
the whitelisted ORDER BY literal, the derived filters — and the shape of
the response. The order_by test is the important one: caller input must
never reach the SQL clause, only dict-mapped literals may.
"""

from __future__ import annotations

import unittest
from unittest import mock

ME = "alice@example.com"

_DEFAULT_ORDER = "`tabSheet`.`modified` desc"


class _ListSheetsBase(unittest.TestCase):
	def setUp(self):
		patcher = mock.patch("sheets.api.frappe")
		self.frappe = patcher.start()
		self.addCleanup(patcher.stop)
		self.frappe.session.user = ME
		# The module calls frappe.utils.cint for clamping — give the mock a
		# real implementation so the arithmetic works.
		self.frappe.utils.cint.side_effect = _cint
		self.frappe.utils.now.return_value = "2026-07-23 12:00:00.000001"
		self.rows = [
			{"name": "SH-1", "title": "Mine", "modified": "2026-07-22 10:00:00", "owner": ME, "is_public": 0},
			{"name": "SH-2", "title": "Theirs", "modified": "2026-07-21 10:00:00", "owner": "bob@example.com", "is_public": 1},
		]
		self.frappe.get_list.side_effect = [self.rows, [{"total": 42}]]

	def call(self, **kwargs):
		from sheets import api

		return api.list_sheets(**kwargs)

	def rows_kwargs(self):
		return self.frappe.get_list.call_args_list[0].kwargs

	def count_kwargs(self):
		return self.frappe.get_list.call_args_list[1].kwargs


class Defaults(_ListSheetsBase):
	def test_default_window_and_order(self):
		self.call()
		kw = self.rows_kwargs()
		self.assertEqual(kw["limit_start"], 0)
		self.assertEqual(kw["limit_page_length"], 50)
		self.assertEqual(kw["order_by"], _DEFAULT_ORDER)
		self.assertEqual(kw["filters"], {"trashed": 0})

	def test_response_shape_and_is_owner(self):
		res = self.call()
		self.assertEqual(res["total"], 42)
		# Server-clock `now` rides along so the client buckets recency in the
		# same timezone frame as `modified`.
		self.assertEqual(res["now"], "2026-07-23 12:00:00.000001")
		self.assertTrue(res["sheets"][0]["is_owner"])
		self.assertFalse(res["sheets"][1]["is_owner"])
		self.assertIs(res["sheets"][1]["is_public"], True)

	def test_count_uses_aggregate_with_same_filters(self):
		self.call(search="foo", owner_filter="mine")
		kw = self.count_kwargs()
		# Frappe 17 dict field syntax — string "count(...)" fields are rejected.
		self.assertEqual(kw["fields"], [{"COUNT": "*", "as": "total"}])
		self.assertEqual(kw["filters"], self.rows_kwargs()["filters"])


class OrderBy(_ListSheetsBase):
	def test_known_keys_map_to_literals(self):
		self.call(order_by="title")
		self.assertEqual(self.rows_kwargs()["order_by"], "`tabSheet`.`title` asc")

	def test_owner_sort_has_modified_tiebreak(self):
		self.call(order_by="owner")
		self.assertEqual(
			self.rows_kwargs()["order_by"],
			"`tabSheet`.`owner` asc, `tabSheet`.`modified` desc",
		)

	def test_unknown_order_by_falls_back_to_default(self):
		malicious = "modified desc; DROP TABLE `tabSheet`--"
		self.call(order_by=malicious)
		kw = self.rows_kwargs()
		self.assertEqual(kw["order_by"], _DEFAULT_ORDER)
		# The caller's string must not appear anywhere in the query kwargs.
		for call in self.frappe.get_list.call_args_list:
			self.assertNotIn(malicious, repr(call))


class OwnerFilter(_ListSheetsBase):
	def test_mine(self):
		self.call(owner_filter="mine")
		self.assertEqual(self.rows_kwargs()["filters"]["owner"], ME)

	def test_shared(self):
		self.call(owner_filter="shared")
		self.assertEqual(self.rows_kwargs()["filters"]["owner"], ["!=", ME])

	def test_unknown_means_all(self):
		self.call(owner_filter="everything-please")
		self.assertNotIn("owner", self.rows_kwargs()["filters"])


class Search(_ListSheetsBase):
	def test_search_is_trimmed_like_filter(self):
		self.call(search="  foo  ")
		self.assertEqual(self.rows_kwargs()["filters"]["title"], ["like", "%foo%"])

	def test_blank_search_adds_no_filter(self):
		self.call(search="   ")
		self.assertNotIn("title", self.rows_kwargs()["filters"])


class WindowClamping(_ListSheetsBase):
	def test_limit_capped_at_100(self):
		self.call(limit=1000)
		self.assertEqual(self.rows_kwargs()["limit_page_length"], 100)

	def test_zero_limit_uses_default(self):
		self.call(limit=0)
		self.assertEqual(self.rows_kwargs()["limit_page_length"], 50)

	def test_negative_start_clamped_to_zero(self):
		self.call(start=-5)
		self.assertEqual(self.rows_kwargs()["limit_start"], 0)

	def test_string_params_from_http_are_coerced(self):
		# Whitelisted endpoints receive query params as strings.
		self.call(start="50", limit="25")
		kw = self.rows_kwargs()
		self.assertEqual(kw["limit_start"], 50)
		self.assertEqual(kw["limit_page_length"], 25)


def _cint(value):
	try:
		return int(float(value))
	except (TypeError, ValueError):
		return 0


if __name__ == "__main__":
	unittest.main()
