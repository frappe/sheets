import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { _parseCSV, useExportImport } from './useExportImport.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSheet(initial = {}, sheetName = 'Sheet1') {
  const store = { ...initial }
  return {
    getRawData:       (sn = sheetName) => (void sn, store),
    getCell:          (id, sn = sheetName) => (void sn, store[id] ?? ''),
    setCell:          (id, v) => { store[id] = v },
    // Mirror the production engine's bulk-write contract: replace the sheet
    // with `map`, clearing keys not present. importCSV/importXLSX now use
    // this instead of setCell-per-cell so big imports don't freeze the page.
    batchSetCells:    (map, sn = sheetName) => {
      void sn
      for (const id of Object.keys(store)) if (!(id in map)) delete store[id]
      for (const [id, v] of Object.entries(map)) store[id] = v
    },
    getCurrentSheet:  () => sheetName,
    getSheetNames:    () => [sheetName],
    getDisplayValue:  (id, sn = sheetName) => (void sn, store[id] ?? ''),
    _store:           () => store,
  }
}

function makeGrid() {
  const cells = {}
  return {
    clearAll: vi.fn(() => { Object.keys(cells).forEach(k => delete cells[k]) }),
    setCell:  vi.fn((id, v) => { cells[id] = v }),
    _cells:   () => cells,
  }
}

function makeComposable(sheetData = {}) {
  const sheet          = makeSheet(sheetData)
  const grid           = makeGrid()
  const ops            = []
  const isDirty        = ref(false)
  const history        = { push: vi.fn() }
  const repopulateGrid = vi.fn()

  const ctx = useExportImport({
    getSheet:        () => sheet,
    getCurrentTitle: () => 'Test Sheet',
    getGrid:         () => grid,
    queueOp:         op => ops.push(op),
    markEdited:      vi.fn(),
    repopulateGrid,
    syncFlags:       vi.fn(),
    isDirty,
    history,
  })

  return { ...ctx, sheet, grid, ops, isDirty, history, repopulateGrid }
}

// ── _parseCSV ─────────────────────────────────────────────────────────────────

describe('_parseCSV', () => {
  it('parses a simple comma-separated row', () => {
    expect(_parseCSV('a,b,c')).toEqual([['a', 'b', 'c']])
  })

  it('handles quoted fields containing commas', () => {
    expect(_parseCSV('"hello, world",foo')).toEqual([['hello, world', 'foo']])
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(_parseCSV('"say ""hi""",end')).toEqual([['say "hi"', 'end']])
  })

  it('parses multiple rows separated by \\n', () => {
    const result = _parseCSV('a,b\n1,2')
    expect(result).toEqual([['a', 'b'], ['1', '2']])
  })

  it('normalises \\r\\n line endings', () => {
    const result = _parseCSV('x,y\r\nz,w')
    expect(result).toEqual([['x', 'y'], ['z', 'w']])
  })

  it('skips a trailing empty line', () => {
    const result = _parseCSV('a,b\n')
    expect(result).toEqual([['a', 'b']])
  })

  it('handles quoted fields that span multiple lines', () => {
    const result = _parseCSV('"foo\nbar",baz')
    expect(result).toEqual([['foo\nbar', 'baz']])
  })

  it('keeps a multi-line quoted field as a single cell in a single row', () => {
    const csv = 'a,"line1\nline2\nline3",b'
    const result = _parseCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(['a', 'line1\nline2\nline3', 'b'])
  })

  it('returns an empty array for an empty string', () => {
    expect(_parseCSV('')).toEqual([])
  })
})

// ── _sheetToAoa (via exportCSV internals) ────────────────────────────────────
// We test _sheetToAoa indirectly by checking what exportCSV serialises.

describe('exportCSV — sheet-to-array-of-arrays correctness', () => {
  beforeEach(() => {
    vi.stubGlobal('Blob', class {
      constructor(parts) { this.text = parts.join('') }
    })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock') })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const el = { click: vi.fn(), href: '', download: '' }
        return el
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serialises A1 and B1 values into a single CSV row', () => {
    const { exportCSV } = makeComposable({ A1: 'hello', B1: 'world' })
    exportCSV()
    const blobArg = vi.mocked(document.createElement).mock.results[0].value
    // The Blob is constructed with the csv string; check the anchor download attr
    expect(blobArg.download).toBe('Test Sheet.csv')
  })

  it('A1 is row 1 col A and B2 is row 2 col B', () => {
    let capturedCsv = ''
    vi.stubGlobal('Blob', class {
      constructor(parts) { capturedCsv = parts[0] }
    })
    const { exportCSV } = makeComposable({ A1: 'name', B1: 'age', A2: 'alice', B2: '30' })
    exportCSV()
    const rows = capturedCsv.split('\n').map(r => r.split(','))
    expect(rows[0]).toEqual(['name', 'age'])
    expect(rows[1]).toEqual(['alice', '30'])
  })
})

// ── exportCSV — document.createElement / URL.createObjectURL ─────────────────

describe('exportCSV — DOM calls', () => {
  let anchorEl

  beforeEach(() => {
    anchorEl = { click: vi.fn(), href: '', download: '' }
    vi.stubGlobal('Blob', class { constructor() {} })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test-url') })
    vi.stubGlobal('document', { createElement: vi.fn(() => anchorEl) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls document.createElement("a")', () => {
    const { exportCSV } = makeComposable()
    exportCSV()
    expect(document.createElement).toHaveBeenCalledWith('a')
  })

  it('calls URL.createObjectURL with a Blob', () => {
    const { exportCSV } = makeComposable()
    exportCSV()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(
      /** @type {any} */ (global.Blob),
    )
  })

  it('sets the download filename from getCurrentTitle', () => {
    const { exportCSV } = makeComposable()
    exportCSV()
    expect(anchorEl.download).toBe('Test Sheet.csv')
  })

  it('clicks the anchor element', () => {
    const { exportCSV } = makeComposable()
    exportCSV()
    expect(anchorEl.click).toHaveBeenCalledTimes(1)
  })
})

// ── importCSV — sheet engine receives correct cells ───────────────────────────

describe('importCSV', () => {
  // The new importer is async and yields to the event loop while building
  // the cell map. runImport returns once the onload's async work has fully
  // resolved so test assertions can run against the post-import state.
  async function runImport(csvText, sheetData = {}) {
    const composable = makeComposable(sheetData)
    const mockReader = {
      onload: null,
      readAsText: vi.fn(),
    }
    vi.stubGlobal('FileReader', function FileReader() { return mockReader })

    const fakeFile = { name: 'data.csv' }
    const event    = { target: { files: [fakeFile], value: '' } }
    composable.importCSV(event)
    // onload returns a promise (it's async); await it so the batch write
    // and dirty flag have settled before assertions run.
    await mockReader.onload({ target: { result: csvText } })
    vi.unstubAllGlobals()
    return composable
  }

  it('writes parsed CSV cells into the sheet engine', async () => {
    const { sheet } = await runImport('foo,bar\n1,2')
    expect(sheet.getCell('A1')).toBe('foo')
    expect(sheet.getCell('B1')).toBe('bar')
    expect(sheet.getCell('A2')).toBe('1')
    expect(sheet.getCell('B2')).toBe('2')
  })

  it('does not write empty cells into the sheet', async () => {
    const { sheet } = await runImport('a,,b')
    expect(sheet.getCell('A1')).toBe('a')
    expect(sheet.getCell('B1')).toBe('')   // batchSetCells skips empty values
    expect(sheet.getCell('C1')).toBe('b')
  })

  it('sets isDirty to true', async () => {
    const { isDirty } = await runImport('x,y')
    expect(isDirty.value).toBe(true)
  })

  it('pushes a history snapshot', async () => {
    const { history } = await runImport('x,y')
    expect(history.push).toHaveBeenCalledTimes(1)
  })

  it('does not queue an undo op — imports are non-undoable (Sheets parity)', async () => {
    const { ops } = await runImport('a,b')
    expect(ops).toHaveLength(0)
  })

  it('resets e.target.value so the same file can be re-imported', async () => {
    const fakeFile = { name: 'data.csv' }
    const event    = { target: { files: [fakeFile], value: 'old' } }

    const mockReader = { onload: null, readAsText: vi.fn() }
    vi.stubGlobal('FileReader', function FileReader() { return mockReader })

    const composable = makeComposable()
    composable.importCSV(event)
    expect(event.target.value).toBe('')

    await mockReader.onload({ target: { result: '' } })
    vi.unstubAllGlobals()
  })
})
