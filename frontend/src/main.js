import { createApp } from 'vue'
import {
  Button, Dialog, Dialogs, FormControl, FeatherIcon, Spinner,
  Dropdown, Popover, Tooltip, Avatar, Badge,
  CommandPalette,
} from 'frappe-ui'
import App from './App.vue'
import './index.css'

const app = createApp(App)

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
