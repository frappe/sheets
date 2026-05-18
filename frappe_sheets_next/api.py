import json

import frappe

# 5 MB cap on the serialized workbook. Larger than any realistic sheet today;
# the validation is here so a runaway client / malicious payload can't crash
# the database backend.
MAX_SHEETS_DATA_BYTES = 5 * 1024 * 1024
MAX_TITLE_LEN = 280


@frappe.whitelist()
def list_sheets() -> list:
	return frappe.get_list(
		"Sheet",
		fields=["name", "title", "modified", "owner"],
		filters={"owner": frappe.session.user},
		order_by="modified desc",
		limit=100,
	)


@frappe.whitelist()
def get_sheet(name: str) -> dict:
	doc = frappe.get_doc("Sheet", name)
	return {
		"name": doc.name,
		"title": doc.title,
		"sheets_data": doc.sheets_data or "{}",
	}


@frappe.whitelist()
def save_sheet(title: str, sheets_data: str, name: str = "") -> str:
	_validate_payload(title, sheets_data)
	title = _clean_title(title)
	if name:
		doc = frappe.get_doc("Sheet", name)
		doc.title = title
		doc.sheets_data = sheets_data
		doc.save()
	else:
		doc = frappe.new_doc("Sheet")
		doc.title = title
		doc.sheets_data = sheets_data
		doc.insert()
	return doc.name


@frappe.whitelist()
def delete_sheet(name: str) -> str:
	frappe.delete_doc("Sheet", name, ignore_permissions=False)
	return "ok"


@frappe.whitelist()
def rename_sheet(name: str, title: str) -> str:
	title = _clean_title(title)
	if not title:
		frappe.throw("Title is required")
	doc = frappe.get_doc("Sheet", name)
	doc.title = title
	doc.save()
	return doc.name


@frappe.whitelist()
def duplicate_sheet(name: str) -> str:
	src = frappe.get_doc("Sheet", name)
	dup = frappe.new_doc("Sheet")
	dup.title = _clean_title(f"{src.title} (copy)")
	dup.sheets_data = src.sheets_data
	dup.insert()
	return dup.name


# ── internal helpers ──────────────────────────────────────────────────────────


def _validate_payload(title: str, sheets_data: str) -> None:
	if not isinstance(sheets_data, str):
		frappe.throw("sheets_data must be a JSON string")
	if len(sheets_data.encode("utf-8")) > MAX_SHEETS_DATA_BYTES:
		frappe.throw(
			f"Sheet exceeds the {MAX_SHEETS_DATA_BYTES // (1024 * 1024)} MB limit"
		)
	try:
		json.loads(sheets_data)
	except (ValueError, TypeError):
		frappe.throw("sheets_data is not valid JSON")


def _clean_title(title: str) -> str:
	title = (title or "").strip() or "Untitled Spreadsheet"
	if len(title) > MAX_TITLE_LEN:
		title = title[:MAX_TITLE_LEN]
	return title
