"""Frappe endpoints that back the Hocuspocus collab server.

Three responsibilities, split by who calls them and how they authenticate:

  1. ``check_collab_access`` — called by Hocuspocus' ``onAuthenticate`` hook
     with the user's session cookie forwarded from the browser. Returns the
     read/write flags + identity bundle (name, initials, avatar) the server
     attaches to the connection.

  2. ``load_collab_state`` / ``persist_collab_state`` — server-to-server
     calls from the Node process to read/write the persisted Y.Doc binary
     in ``Sheet Collab State``. No browser cookie is available on these,
     so they authenticate with a shared secret (``collab_server_secret``
     in ``site_config.json``) sent in the ``X-Collab-Secret`` header.

The Y.Doc binary itself is opaque to Frappe — we move base64 blobs in
and out of MariaDB and never decode them.

Bootstrap is *not* an endpoint: the first browser to open a sheet whose
Y.Doc is empty hydrates it from the ``sheets_data`` blob it already
loaded for the editor, then sets a ``bootstrapped`` flag inside the
Y.Doc so concurrent first-openers don't double-hydrate. Keeps the
collab server schema-agnostic.
"""

from __future__ import annotations

import hmac

import frappe

# Header the collab server sends with every server-to-server call.
_COLLAB_SECRET_HEADER = "X-Collab-Secret"


# ── Browser-side: auth hook called by Hocuspocus ──────────────────────────────


@frappe.whitelist()
def check_collab_access(name: str) -> dict:
	"""Return the caller's read/write capability + identity for a given sheet.

	Cookie-authenticated. Hocuspocus' ``onAuthenticate`` calls this with the
	user's session forwarded; the response decides whether the websocket is
	accepted and whether it's allowed to push updates.

	Read access without write means "viewer" — the connection still receives
	updates and emits awareness (cursor, presence), but writes are dropped
	at the server before fan-out.
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Login required", frappe.AuthenticationError)

	can_read = bool(frappe.has_permission("Sheet", doc=name, ptype="read", throw=False))
	if not can_read:
		# Don't 403 here — the collab server treats {canRead: False} as a
		# clean refusal and closes the socket. Returning structured data
		# is easier to surface to the client than parsing exception text.
		return {"canRead": False, "canWrite": False}

	can_write = bool(frappe.has_permission("Sheet", doc=name, ptype="write", throw=False))
	user = frappe.session.user
	identity = _user_identity(user)
	return {
		"canRead": True,
		"canWrite": can_write,
		"user": user,
		"fullName": identity["full_name"],
		"initials": identity["initials"],
		"userImage": identity["user_image"],
	}


# ── Server-to-server: persistence endpoints ───────────────────────────────────


@frappe.whitelist(allow_guest=True)
def load_collab_state(name: str) -> dict:
	"""Return the persisted Y.Doc binary for ``name``, or ``None``.

	``allow_guest=True`` because this is invoked from the Hocuspocus process
	without a user session — auth is via the shared ``collab_server_secret``
	checked below. The endpoint never accepts cookie-only callers.
	"""
	_require_collab_secret()

	if not frappe.db.exists("Sheet Collab State", name):
		return {"sheet": name, "ydoc_state": None, "byte_size": 0}

	# Direct DB read — the doctype has System-Manager-only perms, but the
	# secret check above is the gate that matters here.
	row = frappe.db.get_value(
		"Sheet Collab State",
		name,
		("ydoc_state", "byte_size"),
		as_dict=True,
	) or {}
	return {
		"sheet": name,
		"ydoc_state": row.get("ydoc_state"),
		"byte_size": int(row.get("byte_size") or 0),
	}


@frappe.whitelist(allow_guest=True)
def persist_collab_state(name: str, ydoc_state: str, byte_size: int = 0) -> dict:
	"""Upsert the Y.Doc binary for ``name``.

	The collab server debounces this — expect roughly one call every few
	seconds of active editing per sheet, plus one on last-client-disconnect.

	The ``Sheet`` must exist (it always does — sheets are created via the
	save path before any collab session opens against them). We don't
	create the parent here.
	"""
	_require_collab_secret()

	if not frappe.db.exists("Sheet", name):
		frappe.throw(f"Sheet {name!r} does not exist", frappe.DoesNotExistError)

	byte_size = int(byte_size or 0)
	now = frappe.utils.now()

	if frappe.db.exists("Sheet Collab State", name):
		# Direct UPDATE — avoids loading the doc + permission noise on a
		# hot persistence path. The doctype has only data fields, no
		# Document hooks that need to run.
		frappe.db.set_value(
			"Sheet Collab State",
			name,
			{
				"ydoc_state": ydoc_state,
				"byte_size": byte_size,
				"last_persisted_at": now,
			},
			update_modified=True,
		)
	else:
		doc = frappe.new_doc("Sheet Collab State")
		doc.sheet = name
		doc.ydoc_state = ydoc_state
		doc.byte_size = byte_size
		doc.last_persisted_at = now
		doc.insert(ignore_permissions=True)

	return {"sheet": name, "byte_size": byte_size, "persisted_at": now}


# ── helpers ───────────────────────────────────────────────────────────────────


def _require_collab_secret() -> None:
	"""Reject the call unless the request carries the configured shared secret.

	Misconfiguration (no secret in ``site_config.json``) is a deploy bug, not
	a runtime accident — raise loudly so it surfaces in the collab server
	logs on first boot rather than silently allowing unauthenticated writes.
	"""
	expected = (frappe.conf.get("collab_server_secret") or "").strip()
	if not expected:
		frappe.throw(
			"Collab server secret is not configured "
			"(set `collab_server_secret` in site_config.json)",
			frappe.AuthenticationError,
		)
	sent = (frappe.get_request_header(_COLLAB_SECRET_HEADER) or "").strip()
	# Constant-time compare — secrets are short enough that timing attacks
	# are vanishingly improbable, but hmac.compare_digest is the right
	# habit anyway.
	if not sent or not hmac.compare_digest(expected, sent):
		frappe.throw("Invalid collab server credentials", frappe.AuthenticationError)


def _user_identity(user: str) -> dict:
	"""Return full_name, initials, and user_image — mirrors api._user_identity."""
	full_name = frappe.db.get_value("User", user, "full_name") or user
	user_image = frappe.db.get_value("User", user, "user_image") or ""
	parts = full_name.split()
	initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()
	return {"full_name": full_name, "initials": initials, "user_image": user_image}
