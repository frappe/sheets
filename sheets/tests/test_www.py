# Copyright (c) 2026, Asif and Contributors
# See license.txt
"""www/sheets.py — boot context + Vite manifest plumbing.

The www page is what every user hits. The manifest reader is what
converts content-hashed bundle filenames into the URLs the Jinja
template injects into the page, so regressions here break the
deployed SPA's ability to load at all. We pin:

  * manifest path + JSON shape resolution
  * the dev/legacy fallback when the manifest file is missing
  * the per-process cache invalidating on mtime change so a fresh
    `vite build` is picked up without a worker restart
  * the boot context Jinja receives (session_user, sentry_dsn, …)
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock


class AssetManifestResolution(unittest.TestCase):
    """The Vite-manifest reader inside sheets/www/sheets.py."""

    def setUp(self):
        # Each test gets its own tmpdir + a frappe.get_app_path that
        # points at it. The module reads the manifest from
        # <app>/public/sheets/.vite/manifest.json — mirror that
        # structure under tmpdir.
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.manifest_dir = os.path.join(
            self.tmp.name, "public", "sheets", ".vite"
        )
        os.makedirs(self.manifest_dir, exist_ok=True)
        self.manifest_path = os.path.join(self.manifest_dir, "manifest.json")

        patcher = mock.patch("sheets.www.sheets.frappe")
        self.frappe = patcher.start()
        self.addCleanup(patcher.stop)
        self.frappe.get_app_path.return_value = self.tmp.name

        # Reset the module-level cache between tests so we always start
        # from a known state — otherwise mtime checks across tests can
        # interact in surprising ways.
        from sheets.www import sheets as www

        www._ASSET_CACHE = None
        www._ASSET_CACHE_MTIME = None

    def _write_manifest(self, payload: dict):
        with open(self.manifest_path, "w") as fh:
            json.dump(payload, fh)

    def test_resolves_hashed_paths_from_manifest(self):
        self._write_manifest({
            "index.html": {
                "file": "index.ABCDEF.js",
                "css":  ["index.GHIJKL.css"],
            },
        })
        from sheets.www import sheets as www

        paths = www._asset_paths()
        self.assertEqual(paths["js"], "/assets/sheets/sheets/index.ABCDEF.js")
        self.assertEqual(paths["css"], ["/assets/sheets/sheets/index.GHIJKL.css"])

    def test_falls_back_to_legacy_filenames_when_manifest_is_missing(self):
        # Dev / unbuilt — vite serves the SPA itself, no manifest on disk.
        # The fallback keeps the Jinja template working rather than 500ing.
        from sheets.www import sheets as www

        paths = www._asset_paths()
        self.assertEqual(paths["js"], "/assets/sheets/sheets/index.js")
        self.assertEqual(paths["css"], ["/assets/sheets/sheets/index.css"])

    def test_falls_back_when_manifest_is_malformed(self):
        with open(self.manifest_path, "w") as fh:
            fh.write("not valid json {{{")
        from sheets.www import sheets as www

        paths = www._asset_paths()
        # Bad JSON shouldn't take the page down — fall back to legacy.
        self.assertIn("index.js", paths["js"])

    def test_caches_within_a_single_mtime(self):
        # First call populates the cache; second call should return the
        # cached object without re-reading. We assert via the cache flag.
        self._write_manifest({
            "index.html": {"file": "index.A.js", "css": ["index.A.css"]},
        })
        from sheets.www import sheets as www

        first  = www._read_asset_manifest()
        second = www._read_asset_manifest()
        self.assertIs(first, second)  # exact object identity → cache hit

    def test_invalidates_cache_when_manifest_mtime_changes(self):
        # Simulates `vite build` overwriting the manifest. The cache
        # should pick up the new content without a worker restart.
        self._write_manifest({
            "index.html": {"file": "index.OLD.js", "css": []},
        })
        from sheets.www import sheets as www

        first = www._read_asset_manifest()
        self.assertEqual(first["index.html"]["file"], "index.OLD.js")

        # Bump mtime explicitly — writing a file on a fast disk can land
        # on the same second as the previous write and silently fool the
        # cache check.
        self._write_manifest({
            "index.html": {"file": "index.NEW.js", "css": []},
        })
        new_mtime = os.path.getmtime(self.manifest_path) + 5
        os.utime(self.manifest_path, (new_mtime, new_mtime))

        second = www._read_asset_manifest()
        self.assertEqual(second["index.html"]["file"], "index.NEW.js")


class BootContext(unittest.TestCase):
    """get_context populates the keys sheets.html injects into
    `window.frappe.{session,boot}`. The SPA branches on these for the
    avatar, ShareDialog, CSRF, and Sentry — so the shape is load-bearing."""

    def setUp(self):
        patcher = mock.patch("sheets.www.sheets.frappe")
        self.frappe = patcher.start()
        self.addCleanup(patcher.stop)
        self.frappe.session.user = "alice@example.com"
        self.frappe.session.sid  = "sid-xyz"
        self.frappe.db.get_value.side_effect = (
            lambda doctype, name, field: {
                "full_name":  "Alice",
                "user_image": "",
                "enabled":    1,
            }.get(field)
        )
        self.frappe.local.site = "test.localhost"
        self.frappe.conf.get.side_effect = lambda key, default=None: {
            "collab_v2":     0,
            "collab_ws_url": None,
            "socketio_port": 9001,
        }.get(key, default)
        self.frappe.sessions.get_csrf_token.return_value = "csrf-token"

        # Class-style context object — what Frappe's www renderer hands in.
        class _Context:
            pass
        self.ctx = _Context()

    def test_guest_is_redirected_to_login(self):
        self.frappe.session.user = "Guest"
        self.frappe.Redirect = RuntimeError  # any exception we can catch
        from sheets.www import sheets as www

        with self.assertRaises(RuntimeError):
            www.get_context(self.ctx)
        self.assertEqual(
            self.frappe.local.flags.redirect_location,
            "/login?redirect-to=/sheets",
        )

    def test_session_and_csrf_populated_for_logged_in_user(self):
        from sheets.www import sheets as www

        www.get_context(self.ctx)
        self.assertEqual(self.ctx.session_user, "alice@example.com")
        self.assertEqual(self.ctx.session_user_fullname, "Alice")
        self.assertEqual(self.ctx.csrf_token, "csrf-token")

    def test_sentry_dsn_defaults_to_empty_string(self):
        # No DSN configured → context still has the key, just empty,
        # so the Jinja template's `| tojson` never renders `undefined`.
        from sheets.www import sheets as www

        www.get_context(self.ctx)
        self.assertEqual(self.ctx.sentry_dsn, "")

    def test_sentry_dsn_picked_up_from_site_config(self):
        self.frappe.conf.get.side_effect = lambda key, default=None: {
            "sheets_sentry_dsn": "https://k@o.ingest.sentry.io/p",
            "developer_mode":         0,
        }.get(key, default)
        from sheets.www import sheets as www

        www.get_context(self.ctx)
        self.assertEqual(self.ctx.sentry_dsn, "https://k@o.ingest.sentry.io/p")
        self.assertEqual(self.ctx.sentry_environment, "production")

    def test_sentry_environment_falls_back_to_development_in_dev_mode(self):
        self.frappe.conf.get.side_effect = lambda key, default=None: {
            "developer_mode": 1,
        }.get(key, default)
        from sheets.www import sheets as www

        www.get_context(self.ctx)
        self.assertEqual(self.ctx.sentry_environment, "development")
