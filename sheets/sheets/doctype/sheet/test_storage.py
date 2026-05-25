# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Unit tests for the sheets_data gzip storage envelope."""

import json
import unittest

from sheets.sheets.doctype.sheet.storage import (
	decode_sheets_data,
	effective_size,
	encode_sheets_data,
)


class EncodeDecodeRoundTrip(unittest.TestCase):
	def test_simple_round_trip(self):
		original = '{"A1": "hello", "B2": "world"}'
		self.assertEqual(decode_sheets_data(encode_sheets_data(original)), original)

	def test_unicode_round_trip(self):
		original = '{"A1": "héllo 🌍 寿司"}'
		self.assertEqual(decode_sheets_data(encode_sheets_data(original)), original)

	def test_nested_workbook_round_trip(self):
		workbook = {
			"sheets": [{"name": "Sheet1", "cells": {"A1": "x", "B2": "y"}}],
			"formats": {"A1": {"bold": True, "fontFamily": "Inter"}},
			"viewState": {"zoom": 1, "freeze": {"rows": 1, "cols": 0}},
		}
		original = json.dumps(workbook)
		self.assertEqual(decode_sheets_data(encode_sheets_data(original)), original)

	def test_large_payload_compresses_at_least_5x(self):
		# Highly compressible: repeated cell values + format keys
		cells = {f"A{i}": "X" * 100 for i in range(2000)}
		original = json.dumps(cells)
		encoded = encode_sheets_data(original)
		self.assertLess(len(encoded), len(original) // 5)
		self.assertEqual(decode_sheets_data(encoded), original)


class DecodeBackwardCompat(unittest.TestCase):
	def test_plain_json_passes_through(self):
		# Pre-compression sheets: bare JSON should round-trip unchanged
		plain = '{"A1": "ok"}'
		self.assertEqual(decode_sheets_data(plain), plain)

	def test_none_returns_empty_object(self):
		self.assertEqual(decode_sheets_data(None), "{}")

	def test_empty_string_returns_empty_object(self):
		self.assertEqual(decode_sheets_data(""), "{}")

	def test_non_envelope_dict_passes_through(self):
		# A dict with a "data" key but no "_z" marker is not our envelope
		plain = '{"data": "looks like envelope but no marker"}'
		self.assertEqual(decode_sheets_data(plain), plain)

	def test_envelope_with_wrong_kind_passes_through(self):
		# Future format mismatch — don't try to decode
		other = json.dumps({"_z": "brotli", "data": "abc"})
		self.assertEqual(decode_sheets_data(other), other)


class EffectiveSize(unittest.TestCase):
	def test_plain_size(self):
		plain = '{"A1": "value"}'
		self.assertEqual(effective_size(plain), len(plain.encode("utf-8")))

	def test_envelope_reports_uncompressed_size(self):
		original = json.dumps({"A1": "X" * 5000})
		encoded = encode_sheets_data(original)
		self.assertEqual(effective_size(encoded), len(original.encode("utf-8")))

	def test_empty_inputs(self):
		self.assertEqual(effective_size(None), 0)
		self.assertEqual(effective_size(""), 0)
