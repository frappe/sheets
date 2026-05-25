// Gzip + base64 envelope for uploading large sheets_data payloads.
//
// Mirrors the server-side wire format in
// sheets/sheets/doctype/sheet/storage.py:
//
//   {"_z": "gzip", "data": "<base64-encoded gzip bytes>"}
//
// The server's `_validate_payload` and `save_sheet` accept either the envelope
// or plain JSON, so this is purely an optimisation — if `CompressionStream`
// isn't available (older Safari) or the payload is tiny, we fall back to
// sending the raw string.

const MARKER     = '_z'
const KIND       = 'gzip'
// Only compress payloads larger than this — below it the round-trip overhead
// outweighs the wire-size saving.
const MIN_BYTES  = 64 * 1024

export function isCompressionSupported() {
  return typeof CompressionStream !== 'undefined'
}

export async function encodeForUpload(jsonString) {
  if (!jsonString || jsonString.length < MIN_BYTES) return jsonString
  if (!isCompressionSupported())                    return jsonString
  const gz       = await _gzip(jsonString)
  const data     = _bytesToBase64(gz)
  return JSON.stringify({ [MARKER]: KIND, data })
}

async function _gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf    = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

// Chunked to avoid "Maximum call stack size exceeded" on multi-MB inputs.
function _bytesToBase64(bytes) {
  const CHUNK = 0x8000
  let binary  = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}
