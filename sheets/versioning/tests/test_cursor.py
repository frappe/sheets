# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Tests for cursor encoding (timeline pagination).

Cursors are opaque base64-urlsafe strings carrying a single integer seq.
Round-trip and bad-input behaviour is the entire contract.
"""

from __future__ import annotations

import unittest
from unittest import mock

from sheets.versioning import timeline as tl


class CursorRoundTrip(unittest.TestCase):
	def test_round_trip_small(self):
		c = tl._encode_cursor(42)
		self.assertEqual(tl._decode_cursor(c), 42)

	def test_round_trip_large(self):
		c = tl._encode_cursor(2**40)
		self.assertEqual(tl._decode_cursor(c), 2**40)

	def test_none_and_empty_return_none(self):
		self.assertIsNone(tl._decode_cursor(None))
		self.assertIsNone(tl._decode_cursor(""))


class BadCursorRejected(unittest.TestCase):
	def test_garbage_string_throws(self):
		# `frappe.throw` raises a generic exception we can match by message.
		with mock.patch(
			"sheets.versioning.timeline.frappe.throw",
			side_effect=ValueError("Invalid cursor"),
		) as m:
			with self.assertRaises(ValueError):
				tl._decode_cursor("not-a-real-cursor")
			m.assert_called_once()


class CursorShape(unittest.TestCase):
	def test_encoded_cursor_is_url_safe(self):
		# Base64-urlsafe characters only — no "+" or "/" that break query strings.
		c = tl._encode_cursor(123456789)
		self.assertNotIn("+", c)
		self.assertNotIn("/", c)


if __name__ == "__main__":
	unittest.main()
