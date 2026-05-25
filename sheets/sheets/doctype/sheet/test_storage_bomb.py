# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Bomb-resistance tests for the gzip envelope.

These guard the invariant from the security audit: a malicious envelope
must not be able to OOM a worker by triggering an unbounded decompress.
``frappe.throw`` is monkey-patched to raise so the module's exception
type doesn't bleed into the test process.
"""

from __future__ import annotations

import base64
import gzip
import json
import unittest
from unittest import mock

from sheets.sheets.doctype.sheet import storage


def _envelope(payload: bytes) -> str:
	compressed = gzip.compress(payload, compresslevel=9)
	return json.dumps(
		{
			storage._GZ_MARKER: storage._GZ_KIND,
			storage._DATA_KEY: base64.b64encode(compressed).decode("ascii"),
		}
	)


class GzipBombGuards(unittest.TestCase):
	def _throw(self, *a, **kw):
		raise ValueError("bomb")

	def test_decompressed_size_at_cap_passes(self):
		# An envelope whose decompressed size is exactly at the cap is allowed.
		# (We choose the boundary deliberately to lock in the off-by-one.)
		payload = b"x" * storage.MAX_SHEETS_DATA_BYTES
		env = _envelope(payload)
		out = storage.decode_sheets_data(env)
		self.assertEqual(len(out.encode("utf-8")), storage.MAX_SHEETS_DATA_BYTES)

	def test_decompressed_size_over_cap_rejected(self):
		# One byte over → reject without allocating the full bomb. We use a
		# highly-compressible payload so the *compressed* size stays tiny but
		# the decompressed size goes over the cap.
		payload = b"x" * (storage.MAX_SHEETS_DATA_BYTES + 1)
		env = _envelope(payload)
		with mock.patch.object(storage.frappe if hasattr(storage, "frappe") else __import__("frappe"), "throw", side_effect=self._throw):
			with self.assertRaises(ValueError):
				storage.decode_sheets_data(env)

	def test_compressed_size_over_cap_rejected(self):
		# A huge *compressed* payload is rejected before we even attempt to
		# decompress — the base64 length guard catches the simplest case,
		# the raw-compressed guard catches anything that gets past it.
		payload = b"x" * (storage._MAX_COMPRESSED_BYTES + 1)
		env_obj = {
			storage._GZ_MARKER: storage._GZ_KIND,
			storage._DATA_KEY: base64.b64encode(payload).decode("ascii"),
		}
		env = json.dumps(env_obj)
		with mock.patch("frappe.throw", side_effect=self._throw):
			with self.assertRaises(ValueError):
				storage.decode_sheets_data(env)

	def test_invalid_base64_rejected(self):
		env = json.dumps({storage._GZ_MARKER: storage._GZ_KIND, storage._DATA_KEY: "!!!not base64!!!"})
		with mock.patch("frappe.throw", side_effect=self._throw):
			with self.assertRaises(ValueError):
				storage.decode_sheets_data(env)

	def test_malformed_gzip_rejected(self):
		# Valid base64, but the bytes don't form a gzip stream.
		env = json.dumps(
			{
				storage._GZ_MARKER: storage._GZ_KIND,
				storage._DATA_KEY: base64.b64encode(b"not really gzip").decode("ascii"),
			}
		)
		with mock.patch("frappe.throw", side_effect=self._throw):
			with self.assertRaises(ValueError):
				storage.decode_sheets_data(env)

	def test_plain_json_passthrough_unchanged(self):
		# Non-envelope strings still pass through verbatim.
		plain = json.dumps({"A1": "hi"})
		self.assertEqual(storage.decode_sheets_data(plain), plain)

	def test_effective_size_bounded(self):
		# `effective_size` shares the bomb path; same guarantee.
		payload = b"x" * (storage.MAX_SHEETS_DATA_BYTES + 1)
		env = _envelope(payload)
		with mock.patch("frappe.throw", side_effect=self._throw):
			with self.assertRaises(ValueError):
				storage.effective_size(env)


if __name__ == "__main__":
	unittest.main()
