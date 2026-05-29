import frappe


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/spreadsheet"
        raise frappe.Redirect

    context.no_cache = 1
    # Without this the Jinja template renders `window.csrf_token = ""`,
    # so every POST from the SPA fails with CSRFTokenError on sites
    # where CSRF protection is enabled (e.g. Frappe Cloud).
    context.csrf_token = frappe.sessions.get_csrf_token()
