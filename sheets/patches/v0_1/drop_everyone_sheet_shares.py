"""Remove blanket "accessible to all logged-in users" shares from sheets.

Sheets used to expose an org-wide share via a `DocShare` row with `everyone=1`
(labelled "Accessible to all" in the share dialog). That concept is gone:
public access is now an explicit, view-only `Sheet.is_public` link instead.

We delete the old `everyone=1` rows rather than converting them to public — a
public link is *more* exposing (anyone on the internet, no login), so silently
upgrading would be the wrong default. Affected sheets simply revert to
restricted; owners can re-enable the new public link deliberately if they
still want it. This directly resolves the "sheets made by me are accessible to
everyone" report.
"""

import frappe


def execute():
	frappe.db.delete(
		"DocShare",
		{"share_doctype": "Sheet", "everyone": 1},
	)
