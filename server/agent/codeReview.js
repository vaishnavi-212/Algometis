// Initial C-code review pipeline. Static analysis only: submitted code is NEVER compiled or executed.
// Hardware counters (cache misses/cycles) require OS-specific profiling permissions and are not fabricated.

const SORTS = [
  { id: 'bubble', name: 'Bubble Sort', best: 'O(n²)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, note: 'Simple, but scales poorly for large inputs.' },
  { id: 'selection', name: 'Selection Sort', best: 'O(n²)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, note: 'Performs few swaps, but still makes quadratic comparisons.' },
  { id: 'insertion', name: 'Insertion Sort', best: 'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, note: 'Excellent for small or nearly sorted arrays.' },
  { id: 'merge', name: 'Merge Sort', best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, note: 'Predictable performance and stability; requires auxiliary memory.' },
  { id: 'quick', name: 'Quick Sort', best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n²)', space: 'O(log n) average stack', stable: false, inPlace: true, note: 'Usually fast in practice, but pivot choice affects worst-case behaviour.' },
  { id: 'heap', name: 'Heap Sort', best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: false, inPlace: true, note: 'Guaranteed O(n log n) with constant auxiliary space.' },
]

function count(re, s) { return [...s.matchAll(re)].length }
function complexity(code) {
  const loops = [...code.matchAll(/\b(for|while)\s*\(/g)].length
  const nested = /for\s*\([^)]*\)[\s\S]{0,180}?for\s*\(/.test(code) || /while\s*\([^)]*\)[\s\S]{0,180}?while\s*\(/.test(code)
  if (/\bmerge\s*\(/i.test(code) || /mid\s*=\s*\([^;]+\)\s*\/\s*2/.test(code)) return { time: 'O(n log n) — likely divide-and-conquer', space: 'O(n) — likely auxiliary array', confidence: 'medium' }
  if (/\bquickSort\b|\bpartition\s*\(/i.test(code)) return { time: 'Average O(n log n), worst O(n²)', space: 'O(log n) average recursion stack; O(n) worst', confidence: 'high' }
  if (nested || loops >= 2) return { time: 'O(n²) — nested-loop pattern detected', space: 'O(1) auxiliary (if no dynamic allocation)', confidence: 'medium' }
  if (loops === 1) return { time: 'O(n) — one loop detected', space: 'O(1) auxiliary (if no dynamic allocation)', confidence: 'medium' }
  if (/\b(binarySearch|binary_search)\b/i.test(code)) return { time: 'O(log n) — binary-search pattern', space: 'O(1) iterative / O(log n) recursive', confidence: 'medium' }
  return { time: 'Not confidently inferred from syntax', space: 'Requires deeper data-flow analysis', confidence: 'low' }
}
function detectAlgorithm(code) {
  const c = code.toLowerCase()
  if (/merge\s*\(|mergesort|merge_sort/.test(c)) return SORTS.find(x => x.id === 'merge')
  if (/partition\s*\(|quicksort|quick_sort/.test(c)) return SORTS.find(x => x.id === 'quick')
  if (/heapify|heapsort|heap_sort/.test(c)) return SORTS.find(x => x.id === 'heap')
  if (/bubble.?sort|swapped|\btemp\b/.test(c) && /\[[^\]]+\]\s*[<>]=?\s*[^;]+\[[^\]]+\]/.test(c)) return SORTS.find(x => x.id === 'bubble')
  if (/selection.?sort|min_idx|minindex/.test(c)) return SORTS.find(x => x.id === 'selection')
  if (/insertion.?sort|key\s*=/.test(c) && /while\s*\(/.test(c)) return SORTS.find(x => x.id === 'insertion')
  if (/\bqsort\s*\(/.test(c)) return { ...SORTS.find(x => x.id === 'quick'), name: 'C standard-library qsort (algorithm implementation is library-defined)' }
  return null
}
function variableReport(code) {
  const sizes = { char: 1, short: 2, int: 4, float: 4, long: 8, double: 8, 'long long': 8, pointer: 8 }
  const vars = []
  const re = /\b(char|short|int|float|double|long long|long)\s+(\*\s*)?([A-Za-z_]\w*)\s*(\[\s*(\d*)\s*\])?/g
  for (const m of code.matchAll(re)) {
    const type = m[1], arraySyntax = !!m[4], unsizedArray = arraySyntax && m[5] === '', ptr = !!m[2] || unsizedArray, name = m[3], length = Number(m[5] || 1)
    const bytesEach = ptr ? sizes.pointer : (sizes[type] || 4)
    vars.push({ name, type: ptr ? `${type} *` : type, count: length, bytes: bytesEach * length, note: arraySyntax && !unsizedArray ? `${length} elements` : (ptr ? 'pointer; pointee size unknown' : 'one scalar') })
  }
  return vars.slice(0, 30)
}
function inferQuestion(question) {
  const q = question.toLowerCase()
  if (/sort|ascending|descending|arrange|order/.test(q)) return { category: 'Sorting', task: 'Sort the supplied values', candidates: ['Bubble Sort', 'Selection Sort', 'Insertion Sort', 'Merge Sort', 'Quick Sort', 'Heap Sort'], inputSize: (q.match(/\b(\d[\d,]*)\s*(numbers|elements|items)\b/) || [])[1]?.replaceAll(',', '') || null }
  if (/search|find|locate/.test(q)) return { category: 'Searching', task: 'Find a target in a collection', candidates: ['Linear Search', 'Binary Search'], inputSize: null }
  if (/shortest path|route/.test(q)) return { category: 'Graph', task: 'Find a shortest path', candidates: ['BFS', 'Dijkstra', 'Bellman-Ford'], inputSize: null }
  return { category: 'General programming', task: 'Infer from the problem statement', candidates: [], inputSize: null }
}
function recommend(question, current, category) {
  const q = question.toLowerCase()
  if (category === 'Searching') {
    const sorted = /sorted|ascending|descending/.test(q)
    return { id: sorted ? 'binary-search' : 'linear-search', name: sorted ? 'Binary Search' : 'Linear Search', best: sorted ? 'O(1)' : 'O(n)', avg: sorted ? 'O(log n)' : 'O(n)', worst: sorted ? 'O(log n)' : 'O(n)', space: 'O(1) iterative', stable: false, inPlace: true, note: sorted ? 'The prompt states the data is sorted, so Binary Search is suitable.' : 'The prompt does not guarantee sorted data, so Linear Search is the safe choice.' }
  }
  if (category !== 'Sorting') return current || { id: 'not-determined', name: 'No confident recommendation yet', best: '—', avg: '—', worst: '—', space: '—', stable: false, inPlace: false, note: 'The current prototype focuses on sorting recommendations. Other problem families need dedicated constraint rules.' }
  if (!['bubble','selection','insertion','merge','quick','heap'].includes(current?.id)) return SORTS.find(x => x.id === 'merge')
  if (/nearly sorted|almost sorted|small array|few elements/.test(q)) return SORTS.find(x => x.id === 'insertion')
  if (/limited memory|constant space|in-place/.test(q)) return SORTS.find(x => x.id === 'heap')
  if (/stable|preserve equal/.test(q)) return SORTS.find(x => x.id === 'merge')
  return SORTS.find(x => x.id === 'merge')
}

export function analyzeCSubmission({ question, code }) {
  const q = String(question || '').trim()
  const src = String(code || '').trim()
  if (!q || !src) throw new Error('Both the assignment question and C code are required.')
  if (src.length > 50000) throw new Error('C code is too large. Please keep it below 50,000 characters.')
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  const found = detectAlgorithm(clean)
  const qInfo = inferQuestion(q)
  const cx = complexity(clean)
  const vars = variableReport(clean)
  const n = Number(qInfo.inputSize) || 1000
  const loopCount = count(/\b(for|while)\s*\(/g, clean)
  const nested = /for\s*\([^)]*\)[\s\S]{0,180}?for\s*\(/.test(clean)
  const swaps = count(/\b(swap|temp)\b|\[[^\]]+\]\s*=\s*[^;]+\[[^\]]+\]/gi, clean)
  const comparisons = count(/(?:<=|>=|==|!=|<|>)/g, clean)
  const recursion = found && new RegExp(`\\b${found.id === 'quick' ? 'quickSort' : found.id === 'merge' ? 'mergeSort' : found.id === 'heap' ? 'heapSort' : found.id + 'Sort'}\\s*\\(`, 'i').test(clean)
  const codeLines = src.split(/\r?\n/).length
  const cyclomatic = 1 + count(/\b(if|for|while|case)\b|&&|\|\|/g, clean)
  const varBytes = vars.reduce((a, v) => a + v.bytes, 0)
  const nlogn = Math.ceil(n * Math.log2(Math.max(2, n)))
  const operationEstimate = /n\s*\*\s*n|nested/.test(cx.time) ? n * n : /n log n/.test(cx.time) ? nlogn : n
  const estimatedMs = Math.max(0.01, operationEstimate / 180000)
  const best = recommend(q, found, qInfo.category)
  const metrics = [
    metric('Time complexity', cx.time, 'Static pattern inference; confirm with tests.', cx.confidence),
    metric('Auxiliary space complexity', cx.space, 'Declaration-based estimate; dynamic allocations may be missed.', 'medium'),
    metric('Estimated execution time', `~${estimatedMs.toFixed(2)} ms at n=${n.toLocaleString()}`, 'Model-based estimate, NOT measured runtime. Benchmark the compiled program for a real measurement.', 'low'),
    metric('Estimated declared memory', `~${varBytes} bytes (${vars.length} detected declarations)`, 'Only recognized scalar/fixed-array declarations; excludes stack frames, heap allocations and runtime.', 'low'),
    metric('Cache memory / locality', found?.id === 'merge' ? 'Sequential access; auxiliary-buffer traffic. L1/L2/L3 cache footprint unknown.' : found?.id === 'bubble' || found?.id === 'insertion' ? 'Mostly sequential array access. Cache capacity/occupancy unknown.' : 'Pattern-dependent; cache hierarchy impact unknown.', 'Cache size, cache misses and hit rates require hardware performance counters; not inferred from source.', 'low'),
    metric('Execution speed class', /n²/.test(cx.time) ? 'Quadratic growth — slow for large n' : /n log n/.test(cx.time) ? 'Linearithmic growth — scales well' : /O\(n\)/.test(cx.time) ? 'Linear growth — generally scalable' : 'Unknown until benchmarked', 'Growth-class interpretation, not a measured speed ranking.', 'medium'),
    metric('Variable sizes', vars.length ? vars.map(v => `${v.name}: ${v.type}, ${v.bytes} B`).join(' · ') : 'No supported declarations detected', 'C type sizes use common ABI assumptions (int=4 B, pointer=8 B); actual sizes vary by compiler/platform.', 'medium'),
    metric('Loop count / nesting', `${loopCount} loop(s); ${nested ? 'nested-loop pattern detected' : 'no obvious nested-loop pattern'}`, 'Regex-based structural scan; complex control flow may be missed.', 'medium'),
    metric('Comparison density', `${comparisons} comparison/operator occurrence(s) detected`, 'Static source count, not dynamic comparison count.', 'low'),
    metric('Data movement proxy', `${swaps} swap/temp/array-assignment pattern(s) detected`, 'Source-pattern count; not an execution counter.', 'low'),
    metric('Recursion', recursion ? 'Recursive call pattern detected' : 'No recognized self-recursion detected', 'Indirect recursion may not be detected.', 'medium'),
    metric('Input scalability', `At n=${n.toLocaleString()}, inferred growth class is ${cx.time}`, 'Input size is taken from the question when explicitly stated; otherwise n=1,000 is used as a reference.', 'medium'),
    metric('Cyclomatic complexity', `${cyclomatic} (approximate)`, 'Estimated from branches, loops and boolean operators.', 'medium'),
    metric('Source size', `${codeLines} lines; ${src.length} characters`, 'Whitespace and comments are included in line/character counts.', 'high'),
    metric('Code pattern / maintainability', found ? `${found.name} pattern recognized` : 'Algorithm not confidently recognized', 'Heuristic classification; inspect the source and validate with test cases.', found ? 'medium' : 'low'),
  ]
  const issues = []
  if (!/#include\s*</.test(src)) issues.push('No #include directive detected. Confirm required headers are present.')
  const braceDelta = (clean.match(/\{/g) || []).length - (clean.match(/\}/g) || []).length
  const parenDelta = (clean.match(/\(/g) || []).length - (clean.match(/\)/g) || []).length
  if (braceDelta !== 0) issues.push(`Unbalanced braces detected (opening minus closing: ${braceDelta}).`)
  if (parenDelta !== 0) issues.push(`Unbalanced parentheses detected (opening minus closing: ${parenDelta}).`)
  if (!/\bmain\s*\(/.test(clean)) issues.push('No main() function detected; this may be a snippet rather than a complete C program.')
  if (!found && qInfo.category === 'Sorting') issues.push('The sorting algorithm could not be identified confidently. Add a clear function name or inspect the loop and swap logic.')
  if (/gets\s*\(/.test(clean)) issues.push('gets() is unsafe and removed from modern C; use fgets().')
  if (/\bvoid\s+main\s*\(/.test(clean)) issues.push('Use int main(void) or int main(int argc, char **argv) instead of void main().')
  if (/\bmalloc\s*\(/.test(clean) && !/\bfree\s*\(/.test(clean)) issues.push('malloc() detected without a visible free(); check for a possible memory leak.')
  if (/\bscanf\s*\([^;]*%s/.test(clean)) issues.push('Unbounded %s input detected; specify a maximum field width or use fgets().')
  const alternatives = qInfo.category === 'Sorting' ? SORTS.filter(x => x.id !== found?.id).map(x => ({ ...x, suitability: x.id === best.id ? 'Recommended for the stated requirements' : x.id === 'insertion' ? 'Best for small or nearly sorted input' : x.id === 'heap' ? 'Useful when auxiliary memory must stay O(1)' : x.id === 'quick' ? 'Often fast on average; worst case is O(n²)' : 'Alternative with different trade-offs' })) : []
  return {
    status: 'analyzed', language: 'C', generatedAt: new Date().toISOString(),
    agents: [
      { name: 'Assignment Understanding Agent', status: 'completed', detail: `Classified the task as ${qInfo.category}.` },
      { name: 'C Code Analysis Agent', status: 'completed', detail: found ? `Recognized a likely ${found.name} implementation.` : 'Scanned syntax and control-flow patterns; algorithm confidence is limited.' },
      { name: 'Metrics Evaluation Agent', status: 'completed', detail: 'Computed 15 static and model-based metrics.' },
      { name: 'Algorithm Recommendation Agent', status: 'completed', detail: `Compared candidates and selected ${best.name} for the stated requirements.` },
      { name: 'Critic / Validation Agent', status: 'completed', detail: 'Added confidence labels and separated measured facts from estimates.' },
    ],
    assignment: qInfo,
    detected: found ? { ...found, confidence: 'heuristic — review recommended' } : { name: 'Not confidently identified', confidence: 'low' },
    recommendation: { ...best, reason: best.id === 'merge' ? 'For a general-purpose assignment to sort n values, Merge Sort offers guaranteed O(n log n) time and stable ordering. Its trade-off is O(n) auxiliary memory.' : best.note },
    alternatives,
    metrics,
    issues,
    limitations: [
      'Submitted C is statically inspected and is NOT compiled or executed by this prototype. This avoids running untrusted student code on the server.',
      'Execution time is a model-based estimate, not a stopwatch measurement of the submitted program.',
      'Cache hit/miss counts, cache size, CPU cycles and hardware execution speed require platform-specific profiling tools and are not available from portable source inspection.',
      'Variable-size estimates use common ABI assumptions; verify with sizeof() on the target compiler and machine.',
    ],
    summary: `Your code appears to implement ${found?.name || 'an unclassified algorithm'}. The question is classified as ${qInfo.category}. For a general sorting task, ${best.name} is recommended because it provides ${best.avg} average time and ${best.space} auxiliary space. The recommendation changes when constraints such as nearly-sorted input, stability or strict memory limits are specified.`,
  }
}
function metric(name, value, method, confidence) { return { name, value, method, confidence } }
