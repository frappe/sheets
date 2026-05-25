"""Gzip + base64 storage encoding for the Sheet ``sheets_data`` field.

Spreadsheet JSON is highly compressible (repeated format keys, sheet names,
empty-cell padding), so compressing at rest gives roughly 5-10× more effective
headroom for the same row footprint without changing the schema or the client
contract — the API still speaks plain JSON in both directions.

Wire format on disk::

    {"_z": "gzip", "data": "<base64-encoded gzip bytes>"}

Documents written before this change remain plain JSON strings; the decoder
falls back to returning the input unchanged in that case, so existing sheets
keep working and migrate lazily on their next save.
"""

import base64
import gzip
import json

# Cap on the *uncompressed* (effective workbook) byte size. Lifted from the
# original 5 MB now that compression gives us roughly 5-10× headroom for the
# same physical row size.
MAX_SHEETS_DATA_BYTES = 30 * 1024 * 1024

_GZ_MARKER = "_z"
_GZ_KIND = "gzip"
_DATA_KEY = "data"


def encode_sheets_data(json_str: str) -> str:
	"""Wrap a plain sheets_data JSON string into the on-disk envelope."""
	raw = (json_str or "{}").encode("utf-8")
	compressed = gzip.compress(raw, compresslevel=6)
	payload = base64.b64encode(compressed).decode("ascii")
	return json.dumps({_GZ_MARKER: _GZ_KIND, _DATA_KEY: payload})


def decode_sheets_data(stored: str | None) -> str:
	"""Unwrap a stored envelope back into a plain JSON string.

	Pre-compression values pass through unchanged.
	"""
	if not stored:
		return "{}"
	envelope = _try_parse_envelope(stored)
	if envelope is None:
		return stored
	compressed = base64.b64decode(envelope[_DATA_KEY])
	return gzip.decompress(compressed).decode("utf-8")


def effective_size(stored: str | None) -> int:
	"""Return the uncompressed byte size of a stored value (envelope-aware)."""
	if not stored:
		return 0
	envelope = _try_parse_envelope(stored)
	if envelope is None:
		return len(stored.encode("utf-8"))
	return len(gzip.decompress(base64.b64decode(envelope[_DATA_KEY])))


def _try_parse_envelope(stored: str) -> dict | None:
	"""Return the envelope dict iff `stored` matches our wire format."""
	try:
		obj = json.loads(stored)
	except (ValueError, TypeError):
		return None
	if (
		isinstance(obj, dict)
		and obj.get(_GZ_MARKER) == _GZ_KIND
		and isinstance(obj.get(_DATA_KEY), str)
	):
		return obj
	return None
