# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Boot info plumbing — the frontend feature flags ride on these keys."""

from __future__ import annotations

import unittest
from unittest import mock

from sheets import boot as _boot  # noqa: F401  — see test_collab.py


class ExtendBootinfo(unittest.TestCase):
	def setUp(self):
		patcher = mock.patch("sheets.boot.frappe")
		self.frappe = patcher.start()
		self.addCleanup(patcher.stop)

	def _bootinfo(self):
		class B:
			pass

		return B()

	def test_defaults_to_legacy_path_when_unset(self):
		from sheets import boot

		self.frappe.conf.get.return_value = None
		b = self._bootinfo()
		boot.extend_bootinfo(b)
		self.assertEqual(b.collab_v2, False)
		self.assertIsNone(b.collab_ws_url)

	def test_picks_up_site_config_values(self):
		from sheets import boot

		# Distinct return values per key, in lookup order.
		self.frappe.conf.get.side_effect = lambda key: {
			"collab_v2": True,
			"collab_ws_url": "wss://example.invalid/collab/",
		}.get(key)
		b = self._bootinfo()
		boot.extend_bootinfo(b)
		self.assertTrue(b.collab_v2)
		self.assertEqual(b.collab_ws_url, "wss://example.invalid/collab/")

	def test_collab_v2_is_truthy_coerced_to_bool(self):
		# site_config sometimes holds 1/0 rather than literal True/False.
		from sheets import boot

		self.frappe.conf.get.side_effect = lambda key: {"collab_v2": 1}.get(key)
		b = self._bootinfo()
		boot.extend_bootinfo(b)
		self.assertIs(b.collab_v2, True)
