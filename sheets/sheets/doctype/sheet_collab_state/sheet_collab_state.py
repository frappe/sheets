"""Sheet Collab State — persisted Y.Doc binary for live multiplayer editing.

One row per Sheet (autoname = `field:sheet`, so the row's `name` *is* the
sheet's name — makes upserts a single keyed lookup). The blob is opaque
base64; only the collab server (Hocuspocus) decodes it. Frappe never
interprets the bytes.

Read and written exclusively by the internal collab endpoints in
`sheets.api` — Desk access is reserved for System Managers so an
operator can inspect / wipe stuck rows during incidents.
"""

import frappe
from frappe.model.document import Document


class SheetCollabState(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		byte_size: DF.Int
		last_persisted_at: DF.Datetime | None
		sheet: DF.Link
		ydoc_state: DF.LongText | None
	# end: auto-generated types

	def validate(self):
		if self.byte_size is not None and self.byte_size < 0:
			frappe.throw("byte_size must be non-negative")
