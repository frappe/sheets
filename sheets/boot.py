"""Surface a handful of site_config values to the browser via ``frappe.boot``.

The frontend reads ``window.frappe.boot.collab_v2`` and
``window.frappe.boot.collab_ws_url`` to decide whether to use the
Hocuspocus-backed collab path and where to connect. Both are sourced
from ``site_config.json`` so toggling a single site doesn't require a
frontend rebuild.

Wired in ``sheets.hooks.extend_bootinfo``.
"""

from __future__ import annotations

import frappe


def extend_bootinfo(bootinfo) -> None:
	# Default to legacy behaviour — opt-in to the Hocuspocus path per-site.
	bootinfo.collab_v2 = bool(frappe.conf.get("collab_v2") or False)
	# `None` lets the frontend fall back to the same-origin `/collab/` URL.
	bootinfo.collab_ws_url = frappe.conf.get("collab_ws_url") or None
