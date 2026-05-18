import json

import frappe
from frappe.model.document import Document

# Mirrors the cap in api.py. Defence in depth — anything that bypasses the
# whitelisted API (Desk form, fixture import, future scripted insert) still
# gets these checks.
MAX_SHEETS_DATA_BYTES = 5 * 1024 * 1024
MAX_TITLE_LEN = 280


class Sheet(Document):
	def validate(self):
		title = (self.title or "").strip()
		if not title:
			frappe.throw("Title is required")
		self.title = title[:MAX_TITLE_LEN]

		if self.sheets_data:
			if not isinstance(self.sheets_data, str):
				frappe.throw("sheets_data must be a string")
			if len(self.sheets_data.encode("utf-8")) > MAX_SHEETS_DATA_BYTES:
				frappe.throw(
					f"Sheet exceeds the {MAX_SHEETS_DATA_BYTES // (1024 * 1024)} MB limit"
				)
			try:
				json.loads(self.sheets_data)
			except (ValueError, TypeError):
				frappe.throw("sheets_data is not valid JSON")
