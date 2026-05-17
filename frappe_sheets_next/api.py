from typing import Optional
import frappe


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
	doc = frappe.get_doc("Sheet", name)
	doc.title = title
	doc.save()
	return doc.name


@frappe.whitelist()
def duplicate_sheet(name: str) -> str:
	src = frappe.get_doc("Sheet", name)
	dup = frappe.new_doc("Sheet")
	dup.title = f"{src.title} (copy)"
	dup.sheets_data = src.sheets_data
	dup.insert()
	return dup.name
