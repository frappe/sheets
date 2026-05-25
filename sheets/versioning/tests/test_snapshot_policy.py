# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Tests for snapshot-creation policy (the pure decision function).

The on-disk write path is exercised by integration tests under
`test_save_flow.py`; here we cover only the boolean policy gate so the
matrix of conditions is verifiable without a live bench.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from unittest import mock

from sheets.versioning import snapshots as snap_mod


def _last(seq: int, mins_ago: float) -> dict:
	"""Build a fake `_last_snapshot` row."""
	return {
		"name": "snap-x",
		"seq": seq,
		"creation": datetime(2026, 5, 23, 12, 0, 0) - timedelta(minutes=mins_ago),
	}


class ShouldSnapshotPolicy(unittest.TestCase):
	def setUp(self):
		# Pin "now" so age computations are deterministic.
		self._now = datetime(2026, 5, 23, 12, 0, 0)
		patcher = mock.patch.object(snap_mod, "now_datetime", return_value=self._now)
		self.addCleanup(patcher.stop)
		patcher.start()
		# Ignore site-config overrides during tests.
		conf_patch = mock.patch("sheets.versioning.snapshots.frappe.conf", {})
		self.addCleanup(conf_patch.stop)
		conf_patch.start()

	def test_no_ops_yet_no_snapshot(self):
		self.assertFalse(snap_mod._should_snapshot(head_seq=0, last=None))

	def test_first_snapshot_taken_when_ops_exist(self):
		self.assertTrue(snap_mod._should_snapshot(head_seq=1, last=None))

	def test_skipped_when_head_did_not_advance(self):
		last = _last(seq=50, mins_ago=10)
		self.assertFalse(snap_mod._should_snapshot(head_seq=50, last=last))

	def test_skipped_when_under_both_thresholds(self):
		# 5 ops, 10 seconds ago — under both the 25-op and 30-s thresholds,
		# so rapid autosaves cluster into the previous snapshot rather than
		# spamming a row per save.
		last = _last(seq=50, mins_ago=10 / 60)
		self.assertFalse(snap_mod._should_snapshot(head_seq=55, last=last))

	def test_triggered_by_ops_threshold(self):
		last = _last(seq=0, mins_ago=1 / 60)
		# 25-op threshold — even a burst of edits within a few seconds
		# produces a new snapshot so the timeline stays accurate.
		self.assertTrue(snap_mod._should_snapshot(head_seq=25, last=last))

	def test_triggered_by_time_threshold_with_any_ops(self):
		last = _last(seq=50, mins_ago=1)
		# 1 op in 1 minute — under op threshold but over the 30-s time
		# threshold; the next save snapshots so the panel reflects activity.
		self.assertTrue(snap_mod._should_snapshot(head_seq=51, last=last))

	def test_time_threshold_alone_does_not_fire_without_ops(self):
		last = _last(seq=50, mins_ago=60)
		self.assertFalse(snap_mod._should_snapshot(head_seq=50, last=last))


if __name__ == "__main__":
	unittest.main()
