"""Sheet Seq — per-sheet monotonic counter for op-log sequence numbers.

One row per sheet. Allocation goes through `versioning.seq.allocate()` which
takes a row lock to serialise concurrent writers. Controller is a thin
shell — all logic is in the versioning module.
"""

import frappe
from frappe.model.document import Document


class SheetSeq(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		next_seq: DF.Int
		sheet: DF.Link
	# end: auto-generated types

	def validate(self):
		if self.next_seq is None or self.next_seq < 1:
			frappe.throw("next_seq must be >= 1")
