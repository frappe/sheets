// FormulaEngine — full expression parser + evaluator for Frappe Sheets
// Converted from v1 IIFE to ES module. Zero dependencies.

const T = {
	NUM:'NUM', STR:'STR', BOOL:'BOOL', ERR:'ERR',
	REF:'REF', FN:'FN', OP:'OP',
	LP:'LP', RP:'RP', COMMA:'COMMA', COLON:'COLON',
	COLREF:'COLREF',
	SHEETREF:'SHEETREF',
	SHEETCOL:'SHEETCOL',
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
export function tokenize(src) {
	const out = []
	let i = 0
	while (i < src.length) {
		if (/\s/.test(src[i])) { i++; continue }

		if (src[i] === '"') {
			let s = ''; i++
			while (i < src.length && src[i] !== '"') {
				if (src[i] === '\\') i++
				s += src[i++]
			}
			i++
			out.push({ t: T.STR, v: s }); continue
		}

		if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i+1] || ''))) {
			let s = ''
			while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++]
			if (i < src.length && /[eE]/.test(src[i])) {
				s += src[i++]
				if (i < src.length && /[+\-]/.test(src[i])) s += src[i++]
				while (i < src.length && /[0-9]/.test(src[i])) s += src[i++]
			}
			out.push({ t: T.NUM, v: parseFloat(s) }); continue
		}

		if (src[i] === '#') {
			let s = '#'; i++
			while (i < src.length && !/[\s,();+\-*\/^&<>=]/.test(src[i]) && src[i] !== '"') s += src[i++]
			out.push({ t: T.ERR, v: s }); continue
		}

		if (/[A-Za-z_]/.test(src[i])) {
			let s = ''
			while (i < src.length && /[A-Za-z0-9_$ ]/.test(src[i])) {
				if (src[i] === ' ') {
					let k = i + 1
					while (k < src.length && src[k] === ' ') k++
					if (src[k] === '!') { s += src[i++] } else break
				} else {
					s += src[i++]
				}
			}
			const up = s.trim().toUpperCase()
			if (up === 'TRUE')  { out.push({ t: T.BOOL, v: true  }); continue }
			if (up === 'FALSE') { out.push({ t: T.BOOL, v: false }); continue }

			if (i < src.length && src[i] === '!') {
				i++
				let cell = ''
				while (i < src.length && /[A-Za-z0-9]/.test(src[i])) cell += src[i++]
				const cellUp = cell.toUpperCase()
				const sheetName = s.trim()
				if (/^[A-Z]+[0-9]+$/.test(cellUp))      out.push({ t: T.SHEETREF, sheet: sheetName, v: cellUp })
				else if (/^[A-Z]+$/.test(cellUp))        out.push({ t: T.SHEETCOL, sheet: sheetName, v: cellUp })
				else                                      out.push({ t: T.ERR, v: '#REF!' })
				continue
			}

			let j = i; while (j < src.length && src[j] === ' ') j++
			if (src[j] === '(')                          out.push({ t: T.FN, v: up })
			else if (/^[A-Z]+[0-9]+$/.test(up))         out.push({ t: T.REF, v: up })
			else if (/^[A-Z]+$/.test(up))               out.push({ t: T.COLREF, v: up })
			else                                          out.push({ t: T.FN, v: up })
			continue
		}

		const two = src.substring(i, i + 2)
		if (two === '>=' || two === '<=' || two === '<>') { out.push({ t: T.OP, v: two }); i += 2; continue }

		const c = src[i++]
		if ('+-*/^&%'.includes(c))  { out.push({ t: T.OP, v: c }); continue }
		if (c === '=') { out.push({ t: T.OP, v: '=' }); continue }
		if (c === '>') { out.push({ t: T.OP, v: '>' }); continue }
		if (c === '<') { out.push({ t: T.OP, v: '<' }); continue }
		if (c === '(') { out.push({ t: T.LP  }); continue }
		if (c === ')') { out.push({ t: T.RP  }); continue }
		if (c === ',' || c === ';') { out.push({ t: T.COMMA }); continue }
		if (c === ':') { out.push({ t: T.COLON }); continue }
	}
	return out
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Fully flatten nested arrays. Previous version only unwrapped one level,
// which "worked" for vertical ranges (single-element sub-arrays coerce to
// numbers via Number([n]) === n) but silently produced 0 for horizontal /
// rectangular ranges because Number([a, b]) is NaN.
function flatten(v) {
	if (!Array.isArray(v)) return [v]
	const r = []
	for (const item of v) {
		if (Array.isArray(item)) r.push(...flatten(item))
		else r.push(item)
	}
	return r
}

function toNum(v) {
	if (v === true)  return 1
	if (v === false) return 0
	if (v === '' || v === null || v === undefined) return 0
	const n = Number(v)
	return isNaN(n) ? 0 : n
}

// Stricter numeric coercion for *scalar arithmetic* — Excel/Sheets treat
// `=A1+B1` as `#VALUE!` when one operand is text, rather than silently
// pretending text is 0. Aggregate functions (SUM, AVERAGE, …) keep using
// `toNum` so they continue to skip text rather than poison the whole result.
function toNumStrict(v) {
	if (typeof v === 'string' && v.startsWith('#')) return v   // propagate errors
	if (v === true)  return 1
	if (v === false) return 0
	if (v === '' || v === null || v === undefined) return 0
	if (typeof v === 'number') return v
	const n = Number(v)
	return isNaN(n) ? '#VALUE!' : n
}

function isErr(v) { return typeof v === 'string' && v.startsWith('#') }

function makeCriteriaTest(c) {
	if (typeof c === 'string') {
		if (c.startsWith('>=')) { const n=parseFloat(c.slice(2)); return x=>toNum(x)>=n }
		if (c.startsWith('<=')) { const n=parseFloat(c.slice(2)); return x=>toNum(x)<=n }
		if (c.startsWith('<>')) { const s=c.slice(2); return x=>String(x)!==s }
		if (c.startsWith('>'))  { const n=parseFloat(c.slice(1)); return x=>toNum(x)>n }
		if (c.startsWith('<'))  { const n=parseFloat(c.slice(1)); return x=>toNum(x)<n }
		if (c.startsWith('='))  { const s=c.slice(1); return x=>String(x).toLowerCase()===s.toLowerCase() }
		if (c.includes('*') || c.includes('?')) {
			const re = new RegExp('^' + c.replace(/\*/g,'.*').replace(/\?/g,'.') + '$', 'i')
			return x => re.test(String(x))
		}
		return x => String(x).toLowerCase() === c.toLowerCase()
	}
	if (typeof c === 'number') return x => toNum(x) === c
	return x => x === c
}

// ─── Built-in functions ───────────────────────────────────────────────────────
const FUNCTIONS = {
	SUM:     args => flatten(args).reduce((s,v)=>isErr(v)?s:s+toNum(v), 0),
	AVERAGE: args => {
		const vals = flatten(args).filter(v=>!isErr(v)&&v!==''&&v!==null)
		return vals.length ? vals.reduce((s,v)=>s+toNum(v),0)/vals.length : '#DIV/0!'
	},
	MAX: args => { const n=flatten(args).map(toNum); return n.length ? Math.max(...n) : 0 },
	MIN: args => { const n=flatten(args).map(toNum); return n.length ? Math.min(...n) : 0 },
	COUNT:      args => flatten(args).filter(v=>!isErr(v)&&v!==''&&v!==null&&!isNaN(Number(v))).length,
	COUNTA:     args => flatten(args).filter(v=>v!==''&&v!==null&&v!==undefined).length,
	COUNTBLANK: args => flatten(args).filter(v=>v===''||v===null||v===undefined).length,
	PRODUCT:    args => flatten(args).reduce((p,v)=>p*toNum(v), 1),

	ROUND:     ([v,d])   => { const f=Math.pow(10,toNum(d)); return Math.round(toNum(v)*f)/f },
	ROUNDUP:   ([v,d])   => { const f=Math.pow(10,toNum(d)); return Math.ceil(toNum(v)*f)/f },
	ROUNDDOWN: ([v,d])   => { const f=Math.pow(10,toNum(d)); return Math.floor(toNum(v)*f)/f },
	ABS:    ([v])        => Math.abs(toNum(v)),
	INT:    ([v])        => Math.floor(toNum(v)),
	SQRT:   ([v])        => { const n=toNum(v); return n<0 ? '#NUM!' : Math.sqrt(n) },
	POWER:  ([b,e])      => Math.pow(toNum(b), toNum(e)),
	MOD:    ([n,d])      => { const dn=toNum(d); return dn===0 ? '#DIV/0!' : toNum(n)%dn },
	LOG:    ([v,b])      => { const n=toNum(v); if(n<=0) return '#NUM!'; return Math.log(n)/Math.log(b!==undefined?toNum(b):10) },
	LN:     ([v])        => { const n=toNum(v); return n<=0 ? '#NUM!' : Math.log(n) },
	EXP:    ([v])        => Math.exp(toNum(v)),
	PI:     ()           => Math.PI,
	RAND:   ()           => Math.random(),
	RANDBETWEEN: ([lo,hi]) => Math.floor(Math.random()*(Math.floor(toNum(hi))-Math.ceil(toNum(lo))+1))+Math.ceil(toNum(lo)),
	FLOOR:  ([v,s])      => { const sig=s!==undefined?toNum(s):1; return sig===0?'#DIV/0!':Math.floor(toNum(v)/sig)*sig },
	CEILING:([v,s])      => { const sig=s!==undefined?toNum(s):1; return sig===0?'#DIV/0!':Math.ceil(toNum(v)/sig)*sig },
	TRUNC:  ([v])        => Math.trunc(toNum(v)),
	SIGN:   ([v])        => Math.sign(toNum(v)),
	FACT:   ([n])        => { let v=toNum(n),r=1; for(let i=2;i<=v;i++) r*=i; return r },
	QUOTIENT:([n,d])     => { const dn=toNum(d); return dn===0?'#DIV/0!':Math.trunc(toNum(n)/dn) },
	GCD:    ([a,b])      => { let x=Math.abs(toNum(a)),y=Math.abs(toNum(b)); while(y){const t=y;y=x%y;x=t;} return x },
	EVEN:   ([v])        => { const n=Math.ceil(Math.abs(toNum(v))); return n%2===0?n:n+1 },
	ODD:    ([v])        => { const n=Math.ceil(Math.abs(toNum(v))); return n%2!==0?n:n+1 },

	SUMPRODUCT: args => {
		const arrays = args.map(a => flatten([a]).map(toNum))
		const len = Math.min(...arrays.map(a=>a.length))
		let s = 0
		for (let i=0; i<len; i++) s += arrays.reduce((p,a)=>p*(a[i]||0), 1)
		return s
	},
	SUMIF: ([range,criteria,sumRange]) => {
		const r=flatten([range]), s=sumRange!==undefined?flatten([sumRange]):r
		const test=makeCriteriaTest(criteria)
		return r.reduce((acc,v,i)=>test(v)?acc+toNum(s[i]||0):acc, 0)
	},
	SUMIFS: args => {
		const sr=flatten([args[0]])
		const mask=sr.map(()=>true)
		for (let i=1; i<args.length-1; i+=2) {
			const range=flatten([args[i]]), test=makeCriteriaTest(args[i+1])
			range.forEach((v,j)=>{ if(!test(v)) mask[j]=false })
		}
		return sr.reduce((acc,v,i)=>mask[i]?acc+toNum(v):acc, 0)
	},
	COUNTIF:  ([range,criteria]) => { const test=makeCriteriaTest(criteria); return flatten([range]).filter(test).length },
	COUNTIFS: args => {
		const first=flatten([args[0]])
		const mask=first.map(()=>true)
		for (let i=0; i<args.length-1; i+=2) {
			const range=flatten([args[i]]), test=makeCriteriaTest(args[i+1])
			range.forEach((v,j)=>{ if(!test(v)) mask[j]=false })
		}
		return mask.filter(Boolean).length
	},
	AVERAGEIF: ([range,criteria,avgRange]) => {
		const r=flatten([range]), a=avgRange!==undefined?flatten([avgRange]):r
		const test=makeCriteriaTest(criteria)
		const vals=r.reduce((acc,v,i)=>test(v)?[...acc,toNum(a[i]||0)]:acc,[])
		return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : '#DIV/0!'
	},
	LARGE: ([range,k]) => {
		const arr=flatten([range]).map(toNum).sort((a,b)=>b-a)
		const n=toNum(k)-1; return n>=0&&n<arr.length ? arr[n] : '#NUM!'
	},
	SMALL: ([range,k]) => {
		const arr=flatten([range]).map(toNum).sort((a,b)=>a-b)
		const n=toNum(k)-1; return n>=0&&n<arr.length ? arr[n] : '#NUM!'
	},
	MEDIAN: args => {
		const arr=flatten(args).map(toNum).sort((a,b)=>a-b)
		const m=Math.floor(arr.length/2)
		return arr.length%2 ? arr[m] : (arr[m-1]+arr[m])/2
	},
	STDEV: args => {
		const vals=flatten(args).map(toNum)
		if(vals.length<2) return '#DIV/0!'
		const mean=vals.reduce((s,v)=>s+v,0)/vals.length
		return Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/(vals.length-1))
	},
	PERCENTILE: ([range,k]) => {
		const arr=flatten([range]).map(toNum).sort((a,b)=>a-b)
		const p=toNum(k)
		if(p<0||p>1) return '#NUM!'
		const idx=p*(arr.length-1), lo=Math.floor(idx), hi=Math.ceil(idx)
		return arr[lo]+(arr[hi]-arr[lo])*(idx-lo)
	},

	IF:      ([cond,t,f])  => cond ? t : (f!==undefined?f:false),
	IFS:     args          => { for(let i=0;i<args.length-1;i+=2) if(args[i]) return args[i+1]; return '#N/A' },
	AND:     args          => flatten(args).every(v=>!!v),
	OR:      args          => flatten(args).some(v=>!!v),
	NOT:     ([v])         => !v,
	XOR:     args          => flatten(args).filter(v=>!!v).length%2===1,
	IFERROR: ([v,alt])     => isErr(v) ? alt : v,
	IFNA:    ([v,alt])     => v==='#N/A' ? alt : v,
	TRUE:    ()            => true,
	FALSE:   ()            => false,
	SWITCH:  args => {
		const e=args[0]
		for(let i=1;i<args.length-1;i+=2) if(e===args[i]) return args[i+1]
		return args.length%2===0 ? args[args.length-1] : '#N/A'
	},

	LEN:    ([v])            => String(v??'').length,
	UPPER:  ([v])            => String(v).toUpperCase(),
	LOWER:  ([v])            => String(v).toLowerCase(),
	PROPER: ([v])            => String(v).replace(/\b\w/g,c=>c.toUpperCase()),
	TRIM:   ([v])            => String(v).trim().replace(/\s+/g,' '),
	CLEAN:  ([v])            => String(v).replace(/[\x00-\x1F]/g,''),
	LEFT:   ([v,n])          => String(v).substring(0, toNum(n)),
	RIGHT:  ([v,n])          => { const s=String(v); return s.substring(s.length-toNum(n)) },
	MID:    ([v,st,len])     => String(v).substring(toNum(st)-1, toNum(st)-1+toNum(len)),
	CONCAT: args             => flatten(args).map(v=>v==null?'':String(v)).join(''),
	CONCATENATE: args        => flatten(args).map(v=>v==null?'':String(v)).join(''),
	TEXTJOIN: ([delim,ig,...rest]) => {
		const vals=flatten(rest).map(v=>v==null?'':String(v))
		return (ig?vals.filter(v=>v!==''):vals).join(String(delim))
	},
	REPT:   ([v,n])          => String(v).repeat(Math.max(0,toNum(n))),
	CHAR:   ([v])            => String.fromCharCode(toNum(v)),
	CODE:   ([v])            => String(v).charCodeAt(0),
	EXACT:  ([a,b])          => String(a)===String(b),
	SUBSTITUTE: ([v,old,nv,n]) => {
		const s=String(v),o=String(old),r=String(nv)
		if(n===undefined) return s.split(o).join(r)
		let count=0
		return s.split(o).reduce((acc,part,i)=>i===0?part:acc+(++count===toNum(n)?r:o)+part)
	},
	REPLACE: ([v,st,len,nv]) => { const s=String(v); return s.substring(0,toNum(st)-1)+String(nv)+s.substring(toNum(st)-1+toNum(len)) },
	FIND:   ([ft,wt,st])     => { const idx=String(wt).indexOf(String(ft),(toNum(st)||1)-1); return idx===-1?'#VALUE!':idx+1 },
	SEARCH: ([ft,wt,st])     => { const idx=String(wt).toLowerCase().indexOf(String(ft).toLowerCase(),(toNum(st)||1)-1); return idx===-1?'#VALUE!':idx+1 },
	VALUE:  ([v])            => { const n=parseFloat(String(v).replace(/[$, ]/g,'')); return isNaN(n)?'#VALUE!':n },
	TEXT:   ([v,fmt])        => {
		const n=toNum(v)
		if(typeof fmt!=='string') return String(v)
		if(fmt.includes('%')){ const d=(fmt.match(/\.([0#]+)$/)||['',''])[1].length; return (n*100).toFixed(d)+'%' }
		if(fmt.startsWith('$')) return '$'+n.toFixed(2)
		const dm=fmt.match(/\.([0#]+)$/); if(dm) return n.toFixed(dm[1].length)
		if(/[0#,]+/.test(fmt)) return n.toLocaleString()
		return String(v)
	},
	DOLLAR: ([v,d]) => '$'+toNum(v).toFixed(d!==undefined?toNum(d):2),
	FIXED:  ([v,d]) => toNum(v).toFixed(d!==undefined?toNum(d):2),
	NUMBERVALUE: ([v]) => parseFloat(String(v).replace(/[,\s]/g,'')),

	TODAY:  () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` },
	NOW:    () => new Date().toLocaleString(),
	DATE:   ([y,m,d]) => { const dt=new Date(toNum(y),toNum(m)-1,toNum(d)); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` },
	YEAR:   ([v]) => new Date(v).getFullYear(),
	MONTH:  ([v]) => new Date(v).getMonth()+1,
	DAY:    ([v]) => new Date(v).getDate(),
	HOUR:   ([v]) => new Date(v).getHours(),
	MINUTE: ([v]) => new Date(v).getMinutes(),
	SECOND: ([v]) => new Date(v).getSeconds(),
	DAYS:   ([en,st]) => Math.round((new Date(en)-new Date(st))/86400000),
	WEEKDAY:([v,type]) => { const d=new Date(v).getDay(),t=toNum(type)||1; if(t===2) return d||7; if(t===3) return d===0?6:d-1; return d+1 },
	EOMONTH:([v,m]) => {
		const d=new Date(v), nm=d.getMonth()+toNum(m)+1
		const nd=new Date(d.getFullYear()+Math.floor(nm/12),nm%12,0)
		return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`
	},
	DATEDIF:([st,en,unit]) => {
		const s=new Date(st),e=new Date(en),u=String(unit).toUpperCase()
		if(u==='D') return Math.floor((e-s)/86400000)
		if(u==='M') return (e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())
		if(u==='Y') return e.getFullYear()-s.getFullYear()
		return 0
	},
	NETWORKDAYS: ([st,en]) => {
		let count=0,d=new Date(st),end=new Date(en)
		while(d<=end){ const day=d.getDay(); if(day!==0&&day!==6) count++; d.setDate(d.getDate()+1) }
		return count
	},

	VLOOKUP: ([lookup,table,colIdx,exactMatch]) => {
		if(!Array.isArray(table)) return '#VALUE!'
		const ci=toNum(colIdx)-1
		const exact=(exactMatch===false||toNum(exactMatch)===0)?false:true
		if(!exact) {
			let best=null
			for(const row of table) {
				if(!Array.isArray(row)) continue
				if(toNum(row[0])<=toNum(lookup)) best=row; else break
			}
			return best ? (best[ci]!==undefined?best[ci]:'#REF!') : '#N/A'
		}
		const row=table.find(r=>Array.isArray(r)&&(String(r[0]).toLowerCase()===String(lookup).toLowerCase()||toNum(r[0])===toNum(lookup)))
		return row ? (row[ci]!==undefined?row[ci]:'#REF!') : '#N/A'
	},
	HLOOKUP: ([lookup,table,rowIdx,exactMatch]) => {
		if(!Array.isArray(table)||!Array.isArray(table[0])) return '#VALUE!'
		const ri=toNum(rowIdx)-1, first=table[0]
		const exact=(exactMatch===false||toNum(exactMatch)===0)?false:true
		let ci=-1
		if(!exact) { for(let i=0;i<first.length;i++){if(toNum(first[i])<=toNum(lookup))ci=i;else break;} }
		else { ci=first.findIndex(v=>String(v).toLowerCase()===String(lookup).toLowerCase()||toNum(v)===toNum(lookup)) }
		if(ci===-1) return '#N/A'
		return table[ri] ? (table[ri][ci]!==undefined?table[ri][ci]:'#REF!') : '#REF!'
	},
	MATCH: ([lookup,range,matchType]) => {
		const arr=flatten([range]), mt=matchType!==undefined?toNum(matchType):1
		if(mt===0){ const i=arr.findIndex(v=>String(v).toLowerCase()===String(lookup).toLowerCase()||toNum(v)===toNum(lookup)); return i===-1?'#N/A':i+1 }
		if(mt===1){ for(let i=0;i<arr.length;i++){if(toNum(arr[i])>toNum(lookup))return i>0?i:'#N/A';} return arr.length }
		if(mt===-1){ for(let i=0;i<arr.length;i++){if(toNum(arr[i])<toNum(lookup))return i>0?i:'#N/A';} return arr.length }
		return '#N/A'
	},
	INDEX: ([range,rowNum,colNum]) => {
		const r=toNum(rowNum)-1, c=colNum!==undefined?toNum(colNum)-1:0
		if(!Array.isArray(range)) return range
		const row=Array.isArray(range[r])?range[r]:range
		return row[Array.isArray(range[r])?c:r]!==undefined ? row[Array.isArray(range[r])?c:r] : '#REF!'
	},
	CHOOSE: ([idx,...vals]) => { const i=toNum(idx); return i>=1&&i<=vals.length?vals[i-1]:'#VALUE!' },

	ISBLANK:  ([v]) => v===''||v===null||v===undefined,
	ISNUMBER: ([v]) => !isErr(v)&&v!==''&&v!==null&&!isNaN(Number(v)),
	ISTEXT:   ([v]) => typeof v==='string'&&(isNaN(Number(v))||v===''),
	ISERROR:  ([v]) => isErr(v),
	ISERR:    ([v]) => isErr(v)&&v!=='#N/A',
	ISNA:     ([v]) => v==='#N/A',
	ISLOGICAL:([v]) => typeof v==='boolean',
	ISODD:    ([v]) => Math.abs(toNum(v))%2===1,
	ISEVEN:   ([v]) => Math.abs(toNum(v))%2===0,
	N:        ([v]) => toNum(v),
	T:        ([v]) => typeof v==='string'?v:'',
	NA:       ()    => '#N/A',
	ROW: ([v]) => {
		if(typeof v==='string'&&/^[A-Z]+[0-9]+$/.test(v)) return parseInt(v.match(/[0-9]+/)[0])
		return 1
	},
	COLUMN: ([v]) => {
		if(typeof v==='string'&&/^[A-Z]+[0-9]+$/.test(v))
			return v.match(/[A-Z]+/)[0].split('').reduce((acc,c)=>acc*26+(c.charCodeAt(0)-64),0)
		return 1
	},
	ROWS:    ([v]) => Array.isArray(v)?v.length:1,
	COLUMNS: ([v]) => Array.isArray(v)&&Array.isArray(v[0])?v[0].length:(Array.isArray(v)?v.length:1),
}

// ─── Parser (recursive descent) ───────────────────────────────────────────────
function createParser(tokens, getCellValue, getRangeValues, getSheetCellValue, getSheetRangeValues) {
	getSheetCellValue   = getSheetCellValue   || ((sheet, ref) => getCellValue(ref))
	getSheetRangeValues = getSheetRangeValues || ((sheet, s, e) => getRangeValues(s, e))
	let pos = 0
	const peek = (off=0) => tokens[pos+off]
	const next = ()      => tokens[pos++]
	const expect = type  => {
		const t = tokens[pos++]
		if (!t || t.t !== type) throw new Error('Expected ' + type)
		return t
	}

	function expr()       { return comparison() }

	function comparison() {
		let l = concat()
		while (peek()?.t===T.OP && ['=','<>','>','<','>=','<='].includes(peek().v)) {
			const op=next().v, r=concat()
			switch(op) {
				case '=':  l = String(l).toLowerCase()===String(r).toLowerCase() || toNum(l)===toNum(r); break
				case '<>': l = String(l).toLowerCase()!==String(r).toLowerCase(); break
				case '>':  l = toNum(l)>toNum(r);  break
				case '<':  l = toNum(l)<toNum(r);  break
				case '>=': l = toNum(l)>=toNum(r); break
				case '<=': l = toNum(l)<=toNum(r); break
			}
		}
		return l
	}

	function concat() {
		let l = add()
		while (peek()?.t===T.OP && peek().v==='&') {
			next()
			const r = add()
			l = (l==null?'':String(l)) + (r==null?'':String(r))
		}
		return l
	}

	function add() {
		let l = mul()
		while (peek()?.t===T.OP && (peek().v==='+'||peek().v==='-')) {
			const op=next().v, r=mul()
			if (isErr(l)) return l
			if (isErr(r)) return r
			const ln = toNumStrict(l); if (isErr(ln)) return ln
			const rn = toNumStrict(r); if (isErr(rn)) return rn
			l = op==='+' ? ln+rn : ln-rn
		}
		return l
	}

	function mul() {
		let l = pow()
		while (peek()?.t===T.OP && (peek().v==='*'||peek().v==='/')) {
			const op=next().v, r=pow()
			if (isErr(l)) return l
			if (isErr(r)) return r
			const ln = toNumStrict(l); if (isErr(ln)) return ln
			const rn = toNumStrict(r); if (isErr(rn)) return rn
			if (op==='/') { if (rn===0) return '#DIV/0!'; l = ln/rn }
			else l = ln*rn
		}
		return l
	}

	function pow() {
		const b = unary()
		if (peek()?.t===T.OP && peek().v==='^') {
			next()
			const bn = toNumStrict(b); if (isErr(bn)) return bn
			const en = toNumStrict(unary()); if (isErr(en)) return en
			return Math.pow(bn, en)
		}
		return b
	}

	function unary() {
		if (peek()?.t===T.OP && peek().v==='-') { next(); const n = toNumStrict(primary()); return isErr(n) ? n : -n }
		if (peek()?.t===T.OP && peek().v==='+') { next(); const n = toNumStrict(primary()); return n }
		let v = primary()
		if (peek()?.t===T.OP && peek().v==='%') { next(); const n = toNumStrict(v); return isErr(n) ? n : n/100 }
		return v
	}

	function primary() {
		const tok = peek()
		if (!tok) throw new Error('Unexpected end')

		if (tok.t===T.NUM)  { next(); return tok.v }
		if (tok.t===T.STR)  { next(); return tok.v }
		if (tok.t===T.BOOL) { next(); return tok.v }
		if (tok.t===T.ERR)  { next(); return tok.v }

		if (tok.t===T.REF) {
			next()
			if (peek()?.t===T.COLON) {
				next()
				const endTok = next()
				if (!endTok || (endTok.t!==T.REF && endTok.t!==T.COLREF)) throw new Error('Bad range')
				const endRef = endTok.t===T.COLREF
					? `${endTok.v}${tok.v.match(/[0-9]+$/)[0]}`
					: endTok.v
				return getRangeValues(tok.v, endRef)
			}
			return getCellValue(tok.v)
		}

		if (tok.t===T.COLREF) {
			next()
			if (peek()?.t===T.COLON) {
				next()
				const endTok = next()
				if (!endTok || (endTok.t!==T.COLREF && endTok.t!==T.REF)) throw new Error('Bad col range')
				const endCol = endTok.t===T.REF ? endTok.v.match(/^[A-Z]+/)[0] : endTok.v
				return getRangeValues(`${tok.v}1`, `${endCol}1048576`)
			}
			return '#REF!'
		}

		if (tok.t===T.SHEETREF) {
			next()
			if (peek()?.t===T.COLON) {
				next()
				const endTok = next()
				if (!endTok || (endTok.t!==T.REF && endTok.t!==T.SHEETREF && endTok.t!==T.COLREF)) throw new Error('Bad sheet range')
				const endRef = endTok.t===T.SHEETREF ? endTok.v : (endTok.t===T.COLREF ? `${endTok.v}1048576` : endTok.v)
				return getSheetRangeValues(tok.sheet, tok.v, endRef)
			}
			return getSheetCellValue(tok.sheet, tok.v)
		}

		if (tok.t===T.SHEETCOL) {
			next()
			if (peek()?.t===T.COLON) {
				next()
				const endTok = next()
				const endCol = endTok ? (endTok.t===T.SHEETCOL||endTok.t===T.COLREF ? endTok.v : endTok.v.match(/^[A-Z]+/)?.[0] || tok.v) : tok.v
				return getSheetRangeValues(tok.sheet, `${tok.v}1`, `${endCol}1048576`)
			}
			return '#REF!'
		}

		if (tok.t===T.FN) {
			next()
			expect(T.LP)
			const args = []
			while (peek()?.t !== T.RP) {
				if (!peek()) throw new Error('Unclosed (')
				args.push(expr())
				if (peek()?.t===T.COMMA) next()
			}
			expect(T.RP)
			const fn = FUNCTIONS[tok.v]
			if (!fn) return '#NAME?'
			try { return fn(args) } catch(e) { return '#VALUE!' }
		}

		if (tok.t===T.LP) {
			next()
			const v = expr()
			expect(T.RP)
			return v
		}

		next(); return 0
	}

	return expr
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function evaluate(formula, getCellValue, getRangeValues, getSheetCellValue, getSheetRangeValues) {
	try {
		const tokens = tokenize(formula)
		if (!tokens.length) return ''
		return createParser(tokens, getCellValue, getRangeValues, getSheetCellValue, getSheetRangeValues)()
	} catch(e) {
		return '#ERROR!'
	}
}

const _fnNames = Object.keys(FUNCTIONS).sort()

const FN_HINTS = {
	SUM:'(number1, [number2, ...])', AVERAGE:'(number1, [number2, ...])',
	MAX:'(number1, [number2, ...])', MIN:'(number1, [number2, ...])',
	COUNT:'(value1, [value2, ...])', COUNTA:'(value1, [value2, ...])',
	COUNTBLANK:'(range)', COUNTIF:'(range, criteria)', COUNTIFS:'(range1, criteria1, ...)',
	PRODUCT:'(number1, [number2, ...])',
	ROUND:'(number, digits)', ROUNDUP:'(number, digits)', ROUNDDOWN:'(number, digits)',
	ABS:'(number)', INT:'(number)', SQRT:'(number)', POWER:'(base, exponent)',
	MOD:'(number, divisor)', LOG:'(number, [base])', LN:'(number)', EXP:'(number)',
	PI:'()', RAND:'()', RANDBETWEEN:'(bottom, top)',
	FLOOR:'(number, [significance])', CEILING:'(number, [significance])',
	SUMIF:'(range, criteria, [sum_range])', SUMIFS:'(sum_range, criteria_range1, criteria1, ...)',
	AVERAGEIF:'(range, criteria, [average_range])',
	IF:'(logical_test, value_if_true, [value_if_false])',
	IFS:'(condition1, value1, [condition2, value2, ...])',
	AND:'(logical1, [logical2, ...])', OR:'(logical1, [logical2, ...])',
	NOT:'(logical)', TRUE:'()', FALSE:'()',
	IFERROR:'(value, value_if_error)', IFNA:'(value, value_if_na)',
	ISBLANK:'(value)', ISNUMBER:'(value)', ISTEXT:'(value)', ISERROR:'(value)',
	LEN:'(text)', UPPER:'(text)', LOWER:'(text)', PROPER:'(text)', TRIM:'(text)',
	LEFT:'(text, [num_chars])', RIGHT:'(text, [num_chars])', MID:'(text, start, num_chars)',
	FIND:'(find_text, within_text, [start])', SEARCH:'(find_text, within_text, [start])',
	SUBSTITUTE:'(text, old_text, new_text, [instance])', REPLACE:'(text, start, num_chars, new_text)',
	CONCATENATE:'(text1, [text2, ...])', CONCAT:'(text1, [text2, ...])',
	TEXT:'(value, format_text)', VALUE:'(text)', REPT:'(text, times)',
	TEXTJOIN:'(delimiter, ignore_empty, text1, [text2, ...])',
	TODAY:'()', NOW:'()', DATE:'(year, month, day)',
	YEAR:'(date)', MONTH:'(date)', DAY:'(date)',
	HOUR:'(time)', MINUTE:'(time)', SECOND:'(time)', WEEKDAY:'(date, [return_type])',
	DATEDIF:'(start_date, end_date, unit)',
	VLOOKUP:'(lookup_value, table_array, col_index, [range_lookup])',
	HLOOKUP:'(lookup_value, table_array, row_index, [range_lookup])',
	MATCH:'(lookup_value, lookup_array, [match_type])',
	INDEX:'(array, row_num, [col_num])',
	CHOOSE:'(index_num, value1, [value2, ...])',
	ROW:'([reference])', COLUMN:'([reference])', ROWS:'(array)', COLUMNS:'(array)',
	LARGE:'(array, k)', SMALL:'(array, k)',
}

export function getFunctionNames() { return _fnNames }
export function getFunctionHint(name) { return FN_HINTS[name] || '(...)' }
