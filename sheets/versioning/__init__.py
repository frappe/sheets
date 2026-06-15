"""Versioning module — event log + checkpointed snapshots.

The architecture, in three lines:

* `Sheet Op Log` is the canonical, append-only history (event sourcing).
* `Sheet Snapshot` rows are *derived* checkpoints — deleting one is
  non-destructive because the ops are still there.
* The live `Sheet.sheets_data` blob is the materialised head, kept hot
  for fast reads and updated in-place on every save.

Public surface:

* `seq.allocate(sheet)`          — atomically allocate the next op-log seq
* `snapshots.create(sheet, ...)` — write a snapshot row + bump head pointer
* `snapshots.maybe_snapshot(...)`— policy-driven snapshot (worker entry)
* `state.at(sheet, snapshot_id)` — restore historical state by snapshot id
* `timeline.list_buckets(...)`   — paginated, grouped snapshot list
* `api.*`                        — whitelisted endpoints (v2)
* `tasks.*`                      — scheduled rollup + truncation
"""
