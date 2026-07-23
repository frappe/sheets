# Link preview metadata for hyperlinked cells — the hover card's title /
# description / favicon (Google Sheets' link chip UX).
#
# The browser can't fetch a foreign page's HTML (CORS), so the server does it.
# That makes this endpoint an SSRF vector by construction, so every fetch:
#   * allows only http/https on default ports,
#   * resolves the hostname, refuses private / loopback / link-local / reserved
#     address space, and then CONNECTS TO THAT EXACT IP — the Host header, TLS
#     SNI, and cert hostname stay the original name, so the address we validated
#     is the address we talk to. A rebinding nameserver can't hand a public IP
#     to the check and a private one to the connection (re-done per redirect).
#   * follows at most MAX_REDIRECTS redirects, manually,
#   * reads at most MAX_BYTES with a short timeout, HTML content types only.
# Results (including failures) are cached in Redis so hover traffic doesn't
# hammer external sites.

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import certifi
import urllib3
from bs4 import BeautifulSoup

import frappe
from frappe.rate_limiter import rate_limit

MAX_REDIRECTS = 3
MAX_BYTES = 100 * 1024
CONNECT_TIMEOUT = 3
READ_TIMEOUT = 4
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
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
	# Hand raw bytes to BeautifulSoup so it detects the page's charset itself.
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


def _fetch_html(url: str) -> tuple[str, bytes]:
	"""GET `url` with SSRF guards; returns (final_url, first MAX_BYTES of body)."""
	current = url
	for _ in range(MAX_REDIRECTS + 1):
		ip, host, port, scheme, path = _validate_and_resolve(current)
		pool = _pinned_pool(ip, host, port, scheme)
		try:
			resp = pool.urlopen(
				"GET",
				path,
				headers={"Host": host, "User-Agent": USER_AGENT, "Accept": "text/html"},
				redirect=False,
				preload_content=False,
				decode_content=True,
			)
			if resp.status in REDIRECT_STATUSES:
				location = resp.headers.get("location")
				if not location:
					raise frappe.ValidationError("Redirect without location")
				current = urljoin(current, location)
				continue
			if resp.status >= 400:
				raise frappe.ValidationError(f"HTTP {resp.status}")
			if "html" not in resp.headers.get("content-type", ""):
				raise frappe.ValidationError("Not an HTML page")
			return current, resp.read(MAX_BYTES)
		finally:
			pool.close()
	raise frappe.ValidationError("Too many redirects")


def _pinned_pool(ip: str, host: str, port: int, scheme: str):
	"""Connection pool bound to the pre-validated IP, but presenting the original
	hostname for Host header, TLS SNI, and cert verification."""
	timeout = urllib3.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT)
	if scheme == "https":
		return urllib3.HTTPSConnectionPool(
			ip,
			port=port,
			maxsize=1,
			retries=False,
			timeout=timeout,
			cert_reqs="CERT_REQUIRED",
			ca_certs=certifi.where(),
			server_hostname=host,
			assert_hostname=host,
		)
	return urllib3.HTTPConnectionPool(ip, port=port, maxsize=1, retries=False, timeout=timeout)


def _validate_and_resolve(url: str) -> tuple[str, str, int, str, str]:
	"""Resolve `url`'s host, reject non-public targets, and return the exact IP to
	connect to plus (host, port, scheme, path+query)."""
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https"):
		raise frappe.ValidationError("Only http/https URLs allowed")
	if parsed.port not in (None, 80, 443):
		raise frappe.ValidationError("Non-standard port not allowed")
	host = parsed.hostname
	if not host:
		raise frappe.ValidationError("Invalid URL")
	port = parsed.port or (443 if parsed.scheme == "https" else 80)
	# Resolve every A/AAAA record and reject if ANY is non-public — a rebinding
	# nameserver can rotate which record it hands out, so one bad answer taints
	# the name. We then connect to the first (validated) IP directly.
	try:
		infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
	except socket.gaierror:
		raise frappe.ValidationError("Host not resolvable")
	pinned_ip = None
	for info in infos:
		ip = info[4][0]
		addr = ipaddress.ip_address(ip)
		if (
			addr.is_private
			or addr.is_loopback
			or addr.is_link_local
			or addr.is_multicast
			or addr.is_reserved
			or addr.is_unspecified
		):
			raise frappe.ValidationError("Address not allowed")
		if pinned_ip is None:
			pinned_ip = ip
	path = (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")
	return pinned_ip, host, port, parsed.scheme, path


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
