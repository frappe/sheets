// @vitest-environment happy-dom
//
// ShareDialog — Drive-style chip-staged invite flow. We mount the
// component end-to-end (with thin stubs for frappe-ui's Dialog /
// Button / Dropdown / etc. so we can drive interactions without
// pulling in the entire frappe-ui DOM) and verify the user-visible
// contract: searching adds chips instead of sharing immediately,
// the role applies to the whole batch, Invite fans out one
// share_sheet call per chip, failed invitees stay as chips and
// successful ones disappear.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, defineComponent, h } from 'vue'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'

vi.mock('../../utils/api.js', () => ({ call: vi.fn() }))
// frappe-ui pulls in its full resource layer which can't resolve in a
// jsdom-style test env — stub at the package level so ShareDialog's
// `import { Badge } from 'frappe-ui'` lands on our local stub.
vi.mock('frappe-ui', () => {
  const { defineComponent, h } = require('vue')
  return {
    Badge: defineComponent({
      props: ['label', 'theme', 'variant', 'size', 'tooltip'],
      setup(props) { return () => h('span', { 'data-testid': 'badge' }, props.label) },
    }),
  }
})
import { call } from '../../utils/api.js'

import ShareDialog from './ShareDialog.vue'

// ── frappe-ui stubs ─────────────────────────────────────────────────────────
//
// The real components ship a lot of styling + teleport that doesn't
// matter for the chip-staging contract. Each stub is the minimum
// surface ShareDialog uses so events propagate and conditional
// rendering on labels / props still works.

function _stubs() {
  return {
    Dialog: defineComponent({
      props: ['modelValue', 'options'],
      setup(_, { slots }) {
        return () => h('div', { 'data-testid': 'dialog' }, [
          slots['body-content']?.(),
          slots.actions?.(),
        ])
      },
    }),
    Button: defineComponent({
      props: ['label', 'icon', 'iconLeft', 'iconRight', 'variant',
              'size', 'tooltip', 'loading', 'disabled'],
      emits: ['click'],
      setup(props, { slots, emit }) {
        return () => h('button', {
          'data-label': props.label,
          'data-loading': props.loading ? 'true' : 'false',
          disabled: props.disabled || props.loading,
          onClick: () => emit('click'),
        }, [props.label || slots.default?.()])
      },
    }),
    Dropdown: defineComponent({
      props: ['options', 'placement'],
      setup(props, { slots }) {
        // Render every option as a button labelled with its `label` so
        // tests can click "Can edit" / "Can view" / "Remove access"
        // directly.
        return () => h('div', { 'data-testid': 'dropdown' }, [
          slots.default?.({ open: false }),
          ...(props.options || []).map(opt => h('button', {
            'data-option': opt.label,
            onClick: opt.onClick,
          }, opt.label)),
        ])
      },
    }),
    FormControl: defineComponent({
      props: ['modelValue', 'type', 'placeholder', 'autocomplete'],
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        return () => h('input', {
          type: props.type || 'text',
          placeholder: props.placeholder,
          value: props.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
        })
      },
    }),
    Avatar: defineComponent({
      props: ['label', 'image', 'size', 'tooltip'],
      setup(props) { return () => h('span', {}, props.label || '') },
    }),
    Spinner: defineComponent({
      setup() { return () => h('span', { 'data-testid': 'spinner' }, 'loading') },
    }),
    FeatherIcon: defineComponent({
      props: ['name'],
      setup() { return () => h('span', {}, '') },
    }),
    Badge: defineComponent({
      props: ['label', 'theme', 'variant', 'size', 'tooltip'],
      setup(props) { return () => h('span', { 'data-testid': 'badge' }, props.label) },
    }),
  }
}

function _mountDialog(propsOverride = {}) {
  return render(ShareDialog, {
    props: {
      modelValue: true,
      sheetId:    'SH-1',
      sheetTitle: 'Q3 Forecast',
      ownerId:    'owner@example.com',
      ...propsOverride,
    },
    global: { stubs: _stubs() },
  })
}

beforeEach(() => {
  call.mockReset()
  // get_sheet_shares fetches when the dialog opens — return an empty
  // member list so the dialog mounts cleanly.
  call.mockImplementation((method) => {
    if (method === 'sheets.api.get_sheet_shares') return Promise.resolve([])
    return Promise.resolve({})
  })
  // window.frappe.session — read by ownerFullName computed.
  globalThis.window = globalThis.window || {}
  window.frappe = { session: { user_fullname: 'Owner', user: 'owner@example.com' }, boot: {} }
})

describe('ShareDialog — chip-staged invite flow', () => {
  it('mounts with an empty staged area and a disabled Invite button', async () => {
    _mountDialog()
    await nextTick()
    await waitFor(() => screen.getByText('Members'))
    const invite = screen.getByRole('button', { name: 'Invite' })
    expect(invite.hasAttribute('disabled')).toBe(true)
  })

  it('addChip pushes the picked user into staged without committing the share', async () => {
    const { container } = _mountDialog()
    await nextTick()
    await waitFor(() => screen.getByText('Members'))

    // Simulate the user picking a search result by invoking the same
    // path the search result mousedown does. The component exposes
    // chips by rendering their user email — once addChip runs, the
    // email becomes visible inline.
    //
    // Drive it via the search input + mocked get_list response so the
    // result row renders, then click the result.
    call.mockImplementation((method, args) => {
      if (method === 'sheets.api.get_sheet_shares') return Promise.resolve([])
      if (method === 'frappe.client.get_list') {
        return Promise.resolve([
          { name: 'bob@example.com', full_name: 'Bob', user_image: '' },
        ])
      }
      return Promise.resolve({})
    })

    const input = container.querySelector('input.sd-stage-input')
    await fireEvent.input(input, { target: { value: 'bo' } })
    // searchUsers is debounced by 250 ms in the component. The mocked
    // timers approach was rejected for ShareDialog because reka-ui
    // internals don't tolerate fake timers — instead, wait for the
    // search result to appear via the result row text.
    await waitFor(() => screen.getByText('Bob'), { timeout: 1500 })

    // mousedown.prevent on the result triggers addChip
    const row = screen.getByText('Bob').closest('button')
    await fireEvent.mouseDown(row)

    // The chip surfaces the user's email. share_sheet must NOT have
    // been called yet — chips are staged, not committed.
    await waitFor(() => screen.getByText('bob@example.com'))
    const shareSheetCalls = call.mock.calls.filter(([m]) => m === 'sheets.api.share_sheet')
    expect(shareSheetCalls).toHaveLength(0)
  })

  it('clicking Invite fans out one share_sheet call per staged chip with the chosen role', async () => {
    const { container } = _mountDialog()
    await nextTick()
    await waitFor(() => screen.getByText('Members'))

    call.mockImplementation((method, args) => {
      if (method === 'sheets.api.get_sheet_shares') return Promise.resolve([])
      if (method === 'frappe.client.get_list') {
        const q = args?.filters?.find(f => f[1] === 'like')?.[2] || ''
        if (q.includes('bob')) return Promise.resolve([{ name: 'bob@example.com', full_name: 'Bob' }])
        if (q.includes('car')) return Promise.resolve([{ name: 'carol@example.com', full_name: 'Carol' }])
        return Promise.resolve([])
      }
      if (method === 'sheets.api.share_sheet') return Promise.resolve({ status: 'ok' })
      return Promise.resolve({})
    })

    const input = container.querySelector('input.sd-stage-input')

    // Stage Bob
    await fireEvent.input(input, { target: { value: '%bob%' } })
    await waitFor(() => screen.getByText('Bob'), { timeout: 1500 })
    await fireEvent.mouseDown(screen.getByText('Bob').closest('button'))
    await waitFor(() => screen.getByText('bob@example.com'))

    // Stage Carol
    await fireEvent.input(input, { target: { value: '%car%' } })
    await waitFor(() => screen.getByText('Carol'), { timeout: 1500 })
    await fireEvent.mouseDown(screen.getByText('Carol').closest('button'))
    await waitFor(() => screen.getByText('carol@example.com'))

    // Pick "Can edit" — that's one of the pendingRoleOpts buttons our
    // Dropdown stub renders inline.
    await fireEvent.click(screen.getByRole('button', { name: /Can edit/ }))

    // Click Invite. Wait for both share_sheet calls to fire.
    await fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() => {
      const shareCalls = call.mock.calls.filter(([m]) => m === 'sheets.api.share_sheet')
      expect(shareCalls).toHaveLength(2)
    })

    const shareCalls = call.mock.calls.filter(([m]) => m === 'sheets.api.share_sheet')
    const users = shareCalls.map(c => c[1].user).sort()
    expect(users).toEqual(['bob@example.com', 'carol@example.com'])
    // All chips invited with write=1 because the selected role was "Can edit"
    for (const [, args] of shareCalls) expect(args.write).toBe(1)
  })

  it('leaves failed invitees as chips and clears successful ones', async () => {
    const { container } = _mountDialog()
    await nextTick()
    await waitFor(() => screen.getByText('Members'))

    let inviteCallCount = 0
    call.mockImplementation((method, args) => {
      if (method === 'sheets.api.get_sheet_shares') return Promise.resolve([])
      if (method === 'frappe.client.get_list') {
        const q = args?.filters?.find(f => f[1] === 'like')?.[2] || ''
        if (q.includes('bob'))   return Promise.resolve([{ name: 'bob@example.com',   full_name: 'Bob' }])
        if (q.includes('car'))   return Promise.resolve([{ name: 'carol@example.com', full_name: 'Carol' }])
        return Promise.resolve([])
      }
      if (method === 'sheets.api.share_sheet') {
        inviteCallCount++
        // First call succeeds (Bob), second fails (Carol).
        if (inviteCallCount === 1) return Promise.resolve({ status: 'ok' })
        return Promise.reject(new Error('User Carol is disabled'))
      }
      return Promise.resolve({})
    })

    const input = container.querySelector('input.sd-stage-input')

    // Stage Bob then Carol.
    await fireEvent.input(input, { target: { value: '%bob%' } })
    await waitFor(() => screen.getByText('Bob'), { timeout: 1500 })
    await fireEvent.mouseDown(screen.getByText('Bob').closest('button'))
    await waitFor(() => screen.getByText('bob@example.com'))

    await fireEvent.input(input, { target: { value: '%car%' } })
    await waitFor(() => screen.getByText('Carol'), { timeout: 1500 })
    await fireEvent.mouseDown(screen.getByText('Carol').closest('button'))
    await waitFor(() => screen.getByText('carol@example.com'))

    await fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    // Once both share_sheet calls have resolved, Bob (success) should
    // be gone from chips, Carol (failed) should remain so the user
    // can see who didn't go through.
    await waitFor(() => {
      expect(screen.queryByText('bob@example.com')).toBeNull()
      expect(screen.getByText('carol@example.com')).toBeTruthy()
    })
  })
})
