# Link preview metadata for hyperlinked cells — the hover card's title /
# description / favicon (Google Sheets' link chip UX).
#
# The browser can't fetch a foreign page's HTML (CORS), so the server does it.
# That makes this endpoint an SSRF vector by construction, so every fetch:
#   * allows only http/https on default ports,
#   * resolves the hostname and refuses private / loopback / link-local /
#     reserved address space (re-checked on every redirect hop),
#   * follows at most MAX_REDIRECTS redirects, manually,
#   * reads at most MAX_BYTES with a short timeout, HTML content types only.
# Results (including failures) are cached in Redis so hover traffic doesn't
# hammer external sites.
#
# Known limitation: the guard resolves DNS, then requests re-resolves for the
# actual fetch — a racing rebinding nameserver could slip a private IP between
# the two. Closing that needs IP-pinned transport (custom adapter + SNI);
# accepted for now since the endpoint is auth-only, rate-limited, and the
# response is only ever parsed as HTML metadata.

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import frappe
from frappe.rate_limiter import rate_limit

MAX_REDIRECTS = 3
MAX_BYTES = 100 * 1024
TIMEOUT = (3, 4)  # (connect, read) seconds
CACHE_OK_SEC = 24 * 60 * 60
CACHE_ERR_SEC = 5 * 60
USER_AGENT = "Mozilla/5.0 (compatible; FrappeSheets-LinkPreview/1.0)"


@frappe.whitelist(methods=["GET", "POST"])
@rate_limit(limit=60, seconds=60)
def get_link_preview(url: str) -> dict:
	"""Fetch {title, description, favicon, host} for a cell hyperlink."""
	cache_key = f"sheets_link_preview::{url}"
	cached = frappe.cache.get_value(cache_key)
	if cached is not None:
		return cached

	try:
		result = _fetch_preview(url)
		ttl = CACHE_OK_SEC
	except Exception:
		# Unreachable host, non-HTML target, blocked address, parse error —
		# the card just degrades to the bare URL. Cache briefly so a dead
		# link hovered repeatedly doesn't retry every time.
		frappe.logger("sheets").error(f"link preview failed for {url}", exc_info=True)
		result = {"error": True}
		ttl = CACHE_ERR_SEC

	frappe.cache.set_value(cache_key, result, expires_in_sec=ttl)
	return result


def _fetch_preview(url: str) -> dict:
	final_url, html = _fetch_html(url)
	soup = BeautifulSoup(html, "html.parser")

	title = _first(
		_meta(soup, property="og:title"),
		soup.title.string if soup.title else None,
	)
	description = _first(
		_meta(soup, property="og:description"),
		_meta(soup, name="description"),
	)
	favicon = _favicon(soup, final_url)
	host = urlparse(final_url).hostname or ""
	if host.startswith("www."):
		host = host[4:]

	return {
		"title": _clip(title, 200),
		"description": _clip(description, 300),
		"favicon": favicon,
		"host": host,
	}


def _fetch_html(url: str) -> tuple[str, str]:
	"""GET `url` with SSRF guards; returns (final_url, first MAX_BYTES of body)."""
	current = url
	for _ in range(MAX_REDIRECTS + 1):
		_assert_public_http_url(current)
		resp = requests.get(
			current,
			timeout=TIMEOUT,
			stream=True,
			allow_redirects=False,
			headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
		)
		try:
			if resp.is_redirect or resp.is_permanent_redirect:
				location = resp.headers.get("location")
				if not location:
					raise frappe.ValidationError("Redirect without location")
				current = urljoin(current, location)
				continue
			resp.raise_for_status()
			ctype = resp.headers.get("content-type", "")
			if "html" not in ctype:
				raise frappe.ValidationError("Not an HTML page")
			body = resp.raw.read(MAX_BYTES, decode_content=True)
			return current, body.decode(resp.encoding or "utf-8", errors="replace")
		finally:
			resp.close()
	raise frappe.ValidationError("Too many redirects")


def _assert_public_http_url(url: str) -> None:
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https"):
		raise frappe.ValidationError("Only http/https URLs allowed")
	if parsed.port not in (None, 80, 443):
		raise frappe.ValidationError("Non-standard port not allowed")
	host = parsed.hostname
	if not host:
		raise frappe.ValidationError("Invalid URL")
	# Resolve every A/AAAA record — a public name pointing at 127.0.0.1 or
	# 10.x (DNS-based SSRF) is refused, not just literal private IPs. The
	# explicit port + SOCK_STREAM matter: macOS getaddrinfo(host, None) fails
	# with EAI_NONAME inside threaded web workers.
	port = parsed.port or (443 if parsed.scheme == "https" else 80)
	try:
		infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
	except socket.gaierror:
		raise frappe.ValidationError("Host not resolvable")
	for info in infos:
		addr = ipaddress.ip_address(info[4][0])
		if (
			addr.is_private
			or addr.is_loopback
			or addr.is_link_local
			or addr.is_multicast
			or addr.is_reserved
			or addr.is_unspecified
		):
			raise frappe.ValidationError("Address not allowed")


def _meta(soup, **attrs):
	tag = soup.find("meta", attrs=attrs)
	return tag.get("content") if tag else None


def _favicon(soup, base_url: str) -> str:
	link = soup.find("link", rel=lambda r: r and "icon" in str(r).lower())
	href = link.get("href") if link else None
	icon = urljoin(base_url, href or "/favicon.ico")
	# Only expose http(s) icons — data: URIs are fine to render but can be
	# megabytes; skip anything else the page might declare.
	return icon if icon.startswith(("http://", "https://")) else ""


def _first(*values):
	for v in values:
		if v and str(v).strip():
			return str(v).strip()
	return ""


def _clip(text: str, limit: int) -> str:
	text = " ".join((text or "").split())
	return text[: limit - 1] + "…" if len(text) > limit else text
