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
    # The SPA reads `window.frappe.session.{user,user_fullname}` for the
    # top-right avatar and the ShareDialog owner row. Frappe's boot script
    # is desk-only, so on this www page nothing populates `window.frappe`
    # unless we do it here.
    user = frappe.session.user
    context.session_user = user
    context.session_user_fullname = frappe.db.get_value("User", user, "full_name") or user
    context.session_user_image = frappe.db.get_value("User", user, "user_image") or ""
