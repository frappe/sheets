// Hocuspocus collab server — authoritative Y.Doc per sheet, durable in
// `Sheet Collab State`, fanned out over websocket.
//
// Boot sequence:
//   1. Load env config (fail fast on missing required values).
//   2. Build the Database extension wired to Frappe's load/persist endpoints.
//   3. Optionally add Redis pub/sub for multi-instance scale-out.
//   4. Start the server on $COLLAB_HOST:$COLLAB_PORT.
//
// Auth happens in `onAuthenticate`: the browser forwards its Frappe `sid`
// cookie as the connection token, we POST it to check_collab_access, and
// reject the socket if the caller can't read the sheet. Read-only sharees
// stay connected (so they see updates and emit awareness) but their own
// updates are dropped server-side via `connection.readOnly = true`.

import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Redis } from '@hocuspocus/extension-redis'

import { config } from './env.js'
import { checkAccess, loadState, persistState } from './frappe-client.js'

const extensions = [
	new Database({
		// Hocuspocus calls fetch() once per document on first open. We return
		// the persisted Y.Doc binary or null — null tells Hocuspocus to start
		// from an empty doc, and the first browser to connect hydrates it
		// from `sheets_data` (see frontend/src/collab/hocuspocus-client.js).
		fetch: async ({ documentName }) => {
			const { ydoc_state } = await loadState(documentName)
			return ydoc_state ? Buffer.from(ydoc_state, 'base64') : null
		},

		// Debounced by the extension — defaults are 2s debounce / 10s max
		// wait, plus a flush on last-disconnect. Each call is one HTTP POST
		// to Frappe with the full Y.Doc binary, so we don't want it hot.
		store: async ({ documentName, state }) => {
			const b64 = Buffer.from(state).toString('base64')
			await persistState(documentName, b64, state.byteLength)
		},
	}),
]

if (config.redisHost) {
	extensions.push(new Redis({
		host: config.redisHost,
		port: config.redisPort,
	}))
}

const server = new Server({
	port: config.port,
	extensions,

	async onAuthenticate({ token, documentName, connection }) {
		// token = Frappe sid cookie value (the frontend passes it via the
		// y-provider's `token` option). No sid → can't even ask the server,
		// reject immediately.
		if (!token) throw new Error('Missing auth token')

		const access = await checkAccess(token, documentName)
		if (!access.canRead) throw new Error('Forbidden: no read access')

		// Read-only sharee: keep the connection (they receive updates and
		// publish awareness) but their own document updates are dropped
		// before fan-out. This is enforced inside Hocuspocus.
		if (!access.canWrite) connection.readOnly = true

		// Attached to the connection context — used by awareness payloads
		// and surfaces in logs.
		return {
			user:      access.user,
			fullName:  access.fullName,
			initials:  access.initials,
			userImage: access.userImage,
			canWrite:  access.canWrite,
		}
	},

	onListen({ port }) {
		// One line, easy to grep in supervisor logs.
		// eslint-disable-next-line no-console
		console.log(`[collab-server] listening on :${port}`)
	},
})

await server.listen()
