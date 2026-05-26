// Convert a sheet range + chart config into the ECharts `option` object.
//
// This is the pure adapter between our data model and ECharts. It takes:
//   * the chart config (chartType, encoding, options, title, hasHeader)
//   * the source matrix (a 2D array from sheet.getRangeValues)
//
// and returns a fully-populated ECharts option suitable for `<v-chart :option="…" />`.
// No Vue, no DOM, no sheet engine — easy to unit-test.

import { ESPRESSO_PALETTE } from './charts.js'

const ESPRESSO_FONT = 'InterVar, Inter, ui-sans-serif, system-ui, sans-serif'

/**
 * Build the ECharts option object.
 * @param {object} config  — ChartConfig from createChartEngine
 * @param {Array[]} matrix — 2D source values from getRangeValues
 * @returns ECharts option object
 */
export function buildOption(config, matrix) {
	if (!matrix?.length) return _emptyOption(config)
	const { headerRow, dataRows } = _splitHeader(matrix, config.hasHeader !== false)
	const encoding = _normaliseEncoding(config.encoding, matrix[0]?.length || 0)

	switch (config.chartType) {
		case 'pie':     return _pieOption(config, headerRow, dataRows, encoding)
		case 'bar':     return _cartesianOption(config, headerRow, dataRows, encoding, 'bar')
		case 'line':    return _cartesianOption(config, headerRow, dataRows, encoding, 'line')
		case 'area':    return _cartesianOption(config, headerRow, dataRows, encoding, 'area')
		case 'scatter': return _cartesianOption(config, headerRow, dataRows, encoding, 'scatter')
		default:        return _cartesianOption(config, headerRow, dataRows, encoding, 'bar')
	}
}

// ── Cartesian (line / bar / area / scatter) ──────────────────────────────────

function _cartesianOption(config, headerRow, dataRows, encoding, kind) {
	const xs       = dataRows.map(r => r[encoding.x])
	const seriesIx = encoding.y
	const series   = seriesIx.map((colIdx, i) => ({
		name:      headerRow?.[colIdx] || `Series ${i + 1}`,
		type:      kind === 'area' || kind === 'line' ? 'line' : kind,
		stack:     config.options?.stacked ? 'total' : undefined,
		smooth:    !!config.options?.smooth,
		symbol:    kind === 'scatter' ? 'circle' : 'none',
		symbolSize: kind === 'scatter' ? 8 : 4,
		areaStyle: kind === 'area' ? { opacity: 0.25 } : undefined,
		data:      dataRows.map(r => _toNum(r[colIdx])),
	}))

	return {
		..._baseOption(config),
		tooltip: { trigger: 'axis', confine: true },
		grid:    { top: 56, left: 56, right: 24, bottom: 40, containLabel: true },
		xAxis: {
			type:        kind === 'scatter' ? 'value' : 'category',
			data:        kind === 'scatter' ? undefined : xs.map(_toLabel),
			axisLine:    { lineStyle: { color: '#d4d4d4' } },
			axisLabel:   { color: '#525252', fontFamily: ESPRESSO_FONT, fontSize: 11 },
			splitLine:   { show: false },
		},
		yAxis: {
			type:      'value',
			axisLine:  { lineStyle: { color: '#d4d4d4' } },
			axisLabel: { color: '#525252', fontFamily: ESPRESSO_FONT, fontSize: 11 },
			splitLine: { lineStyle: { color: '#f0f0f0' } },
		},
		series,
	}
}

// ── Pie ──────────────────────────────────────────────────────────────────────

function _pieOption(config, headerRow, dataRows, encoding) {
	const labelCol = encoding.x
	const valueCol = encoding.y[0]   // pies always use just the first y series
	const data = dataRows.map(r => ({
		name:  _toLabel(r[labelCol]),
		value: _toNum(r[valueCol]),
	})).filter(d => d.value !== 0)

	return {
		..._baseOption(config),
		tooltip: { trigger: 'item', confine: true, formatter: '{b}: {c} ({d}%)' },
		series: [{
			name: headerRow?.[valueCol] || 'Value',
			type: 'pie',
			radius: ['40%', '70%'],   // donut chart — easier to label, identical math
			avoidLabelOverlap: true,
			itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
			label: {
				show: true,
				fontFamily: ESPRESSO_FONT,
				fontSize: 11,
				color: '#171717',
			},
			data,
		}],
	}
}

// ── Shared ──────────────────────────────────────────────────────────────────

function _baseOption(config) {
	const title = config.title?.trim()
	return {
		color: config.options?.colorScheme || ESPRESSO_PALETTE,
		backgroundColor: 'transparent',
		title: title ? {
			text: title,
			left: 12, top: 8,
			textStyle: { color: '#171717', fontFamily: ESPRESSO_FONT, fontSize: 14, fontWeight: 600 },
		} : undefined,
		legend: config.options?.showLegend === false
			? { show: false }
			: {
				bottom: 4,
				type: 'scroll',
				textStyle: { color: '#525252', fontFamily: ESPRESSO_FONT, fontSize: 11 },
			},
		animation: true,
	}
}

function _splitHeader(matrix, hasHeader) {
	if (hasHeader && matrix.length > 1) {
		return { headerRow: matrix[0], dataRows: matrix.slice(1) }
	}
	return { headerRow: null, dataRows: matrix }
}

// Coerce a possibly-missing encoding into a usable one.
// Defaults: x = column 0, y = all remaining columns.
function _normaliseEncoding(enc, ncols) {
	const x = (enc && Number.isInteger(enc.x)) ? enc.x : 0
	let y = enc?.y
	if (!Array.isArray(y) || !y.length) {
		y = []
		for (let i = 0; i < ncols; i++) if (i !== x) y.push(i)
	}
	return { x, y }
}

function _toNum(v) {
	if (v === '' || v == null) return 0
	const n = Number(v)
	return isNaN(n) ? 0 : n
}

function _toLabel(v) {
	if (v == null) return ''
	return typeof v === 'string' ? v : String(v)
}

function _emptyOption(config) {
	return {
		..._baseOption(config),
		title: { text: 'No data', left: 'center', top: 'middle',
				 textStyle: { color: '#a3a3a3', fontFamily: ESPRESSO_FONT, fontSize: 12 } },
	}
}
