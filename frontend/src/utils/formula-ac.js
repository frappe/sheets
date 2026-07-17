export const AC_FUNS = {
  ABS:'(number)', AND:'(logical1, ...)', AVERAGE:'(number1, ...)',
  AVERAGEIF:'(range, criteria, [avg_range])', CEILING:'(number, significance)',
  CHOOSE:'(index, value1, ...)', COLUMN:'([reference])', COLUMNS:'(array)',
  CONCAT:'(text1, ...)', CONCATENATE:'(text1, ...)',
  COUNT:'(value1, ...)', COUNTA:'(value1, ...)', COUNTBLANK:'(range)',
  COUNTIF:'(range, criteria)', COUNTIFS:'(range1, criteria1, ...)',
  DATE:'(year, month, day)', DAY:'(date)', EXP:'(number)',
  FALSE:'()', FIND:'(find_text, within_text, [start])',
  FLOOR:'(number, significance)', HLOOKUP:'(value, table, row, [range])',
  HOUR:'(time)', IF:'(test, value_if_true, [value_if_false])',
  IFERROR:'(value, value_if_error)', IFS:'(condition1, value1, ...)',
  INDEX:'(array, row, [col])', INDIRECT:'(ref_text)',
  INT:'(number)', ISBLANK:'(value)', ISERROR:'(value)',
  ISNUMBER:'(value)', ISTEXT:'(value)',
  LARGE:'(array, k)', LEFT:'(text, [num_chars])',
  LEN:'(text)', LN:'(number)', LOG:'(number, [base])',
  LOWER:'(text)', MATCH:'(value, array, [type])',
  MAX:'(number1, ...)', MID:'(text, start, num_chars)',
  MIN:'(number1, ...)', MINUTE:'(time)', MOD:'(number, divisor)',
  MONTH:'(date)', NOT:'(logical)', NOW:'()',
  OR:'(logical1, ...)', PI:'()', POWER:'(base, exponent)',
  PRODUCT:'(number1, ...)', PROPER:'(text)',
  RAND:'()', RANDBETWEEN:'(bottom, top)', RANK:'(number, ref, [order])',
  REPLACE:'(text, start, num_chars, new_text)', REPT:'(text, times)',
  RIGHT:'(text, [num_chars])', ROUND:'(number, digits)',
  ROUNDDOWN:'(number, digits)', ROUNDUP:'(number, digits)',
  ROW:'([reference])', ROWS:'(array)',
  SEARCH:'(find_text, within_text, [start])',
  SMALL:'(array, k)', SQRT:'(number)',
  SUBSTITUTE:'(text, old, new, [instance])',
  SUM:'(number1, ...)', SUMIF:'(range, criteria, [sum_range])',
  SUMIFS:'(sum_range, range1, criteria1, ...)',
  TEXT:'(value, format_text)', TEXTJOIN:'(delimiter, ignore_empty, text1, ...)',
  TIME:'(hour, minute, second)', TODAY:'()', TRIM:'(text)', TRUE:'()',
  UPPER:'(text)', VALUE:'(text)',
  VLOOKUP:'(value, table, col_index, [range_lookup])',
  WEEKDAY:'(date, [return_type])', YEAR:'(date)',
  SPARKLINE:'(data_range, [type], [color])',
}

// Pre-sorted for O(1) reuse in autocomplete filtering.
export const AC_FUN_KEYS = Object.keys(AC_FUNS).sort()

/**
 * Returns { tok, tokStart } for the identifier token being typed before `cursor`,
 * or null if the value is not a formula or there is no token at the cursor.
 * @param {string} value
 * @param {number} cursor
 * @returns {{ tok: string, tokStart: number } | null}
 */
export function parseAcToken(value, cursor) {
  if (!value || !value.startsWith('=')) return null
  const before = value.slice(0, cursor)
  const m = before.match(/(?:[=(+\-*/&^,])([A-Za-z][A-Za-z0-9_]*)$|^=([A-Za-z][A-Za-z0-9_]*)$/)
  if (!m) return null
  const tok = m[1] || m[2]
  return { tok, tokStart: cursor - tok.length }
}
