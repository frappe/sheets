import frappe
from frappe.model.document import Document


class SheetCell(Document):
	"""One row per populated cell. Lifecycle is owned by the API layer
	(`patch_sheet_v2`), not by the Desk form — direct doc.insert / doc.save
	through Frappe ORM works but is not the primary path."""

	pass
