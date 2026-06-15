import { createApp } from 'vue'
import {
  Button, Dialog, Dialogs, FormControl, FeatherIcon, Spinner,
  Dropdown, Popover, Tooltip, Avatar, Badge,
  CommandPalette,
} from 'frappe-ui'
import { TooltipProvider, TooltipRoot } from 'reka-ui'
import App from './App.vue'
import './index.css'
import { initSentry } from './utils/sentry.js'

// Lower the default tooltip hover delay from reka-ui's 700 ms (and frappe-ui
// Tooltip's 500 ms) to 300 ms — closer to Google Sheets / Material guidance,
// which feels right for a power-user app where users hover the toolbar to
// confirm icons. Buttons in frappe-ui mount their own TooltipProvider with
// no delayDuration prop, so the only way to influence them globally is to
// mutate the component's prop default before any are rendered.
for (const c of [TooltipProvider, TooltipRoot]) {
  if (c?.props?.delayDuration) c.props.delayDuration.default = 300
}

// frappe-ui 1.0-beta changed FormControl's default `variant` from outline
// to `subtle` (gray fill, no border). Revert globally so every input across
// the app keeps the previous bordered look — touching ~30 call sites is
// worse than overriding the prop default at registration time.
if (FormControl?.props?.variant) {
  FormControl.props.variant.default = 'outline'
}

const app = createApp(App)

// Optional Sentry — only activates when the deploying site set
// `sheets_sentry_dsn` in site_config.json (injected via the boot
// shim in sheets.html). No-op locally.
initSentry(app)

app.component('Button', Button)
app.component('Dialog', Dialog)
app.component('Dialogs', Dialogs)
app.component('FormControl', FormControl)
app.component('FeatherIcon', FeatherIcon)
app.component('Spinner', Spinner)
app.component('Dropdown', Dropdown)
app.component('Popover', Popover)
app.component('Tooltip', Tooltip)
app.component('Avatar', Avatar)
app.component('Badge', Badge)
app.component('CommandPalette', CommandPalette)

app.mount('#root')
