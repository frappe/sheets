# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""Tests for tiered retention picking.

The rollup picks which auto-snapshot rows to delete from a per-sheet list.
The function is pure: given (snapshots, now, tiers, hard_cutoff) it returns
the names to delete. We exercise the tier matrix without a database.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from sheets.versioning import tasks as tasks_mod


def _snap(name: str, hours_ago: float) -> dict:
	return {
		"name": name,
		"seq": 0,
		"creation": datetime(2026, 5, 23, 12, 0, 0) - timedelta(hours=hours_ago),
	}


class TierLookup(unittest.TestCase):
	def test_first_tier_chosen_for_fresh_snapshot(self):
		idx, density = tasks_mod._tier_for(1.0, tasks_mod.DEFAULT_TIERS)
		self.assertEqual((idx, density), (0, 0))

	def test_hourly_tier_for_a_day_old(self):
		idx, density = tasks_mod._tier_for(48.0, tasks_mod.DEFAULT_TIERS)
		self.assertEqual((idx, density), (1, 1))

	def test_daily_tier_for_two_weeks_old(self):
		idx, density = tasks_mod._tier_for(24 * 14, tasks_mod.DEFAULT_TIERS)
		self.assertEqual((idx, density), (2, 24))


class PickDeletions(unittest.TestCase):
	def setUp(self):
		self.now = datetime(2026, 5, 23, 12, 0, 0)

	def test_keeps_all_in_freshest_tier(self):
		# Six snapshots, all within 24h — none deleted.
		snaps = [_snap(f"s{i}", hours_ago=i) for i in range(6)]
		picked = tasks_mod._pick_deletions(
			snaps, self.now, tasks_mod.DEFAULT_TIERS, hard_cutoff_h=24 * 90
		)
		self.assertEqual(picked, [])

	def test_thins_hourly_tier_to_one_per_hour(self):
		# Five snapshots inside hour-bucket "37h ago": only one survives.
		snaps = [
			_snap("a", hours_ago=37.0),
			_snap("b", hours_ago=37.2),
			_snap("c", hours_ago=37.5),
			_snap("d", hours_ago=37.8),
			_snap("e", hours_ago=37.95),
		]
		picked = tasks_mod._pick_deletions(
			snaps, self.now, tasks_mod.DEFAULT_TIERS, hard_cutoff_h=24 * 90
		)
		# 4 of 5 dropped, 1 kept (the first one encountered iterating
		# newest→oldest, which is the input order here).
		self.assertEqual(len(picked), 4)

	def test_keeps_one_snapshot_in_each_distinct_hour_bucket(self):
		# Two distinct hourly buckets within the hourly tier — keep one per.
		snaps = [
			_snap("a", hours_ago=36.0),  # bucket 36
			_snap("b", hours_ago=36.4),  # bucket 36 — duplicate
			_snap("c", hours_ago=40.0),  # bucket 40
			_snap("d", hours_ago=40.6),  # bucket 40 — duplicate
		]
		picked = tasks_mod._pick_deletions(
			snaps, self.now, tasks_mod.DEFAULT_TIERS, hard_cutoff_h=24 * 90
		)
		self.assertEqual(len(picked), 2)
		self.assertIn("b", picked)
		self.assertIn("d", picked)

	def test_hard_cutoff_deletes_everything_past_it(self):
		snaps = [
			_snap("recent", hours_ago=10),
			_snap("old", hours_ago=24 * 200),
			_snap("ancient", hours_ago=24 * 365),
		]
		picked = tasks_mod._pick_deletions(
			snaps, self.now, tasks_mod.DEFAULT_TIERS, hard_cutoff_h=24 * 90
		)
		self.assertIn("old", picked)
		self.assertIn("ancient", picked)
		self.assertNotIn("recent", picked)


if __name__ == "__main__":
	unittest.main()
