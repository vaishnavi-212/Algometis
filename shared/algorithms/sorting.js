import { recorder, sources } from '../util.js'
import { aview } from './searching.js'

// Items carry their label with them so "Asha: 72" stays together while sorting.
// Each item also keeps a stable id so the UI can animate it sliding to its new position.
function setup(input) {
  const vals = [...input.values]
  const labs = input.itemLabels ? [...input.itemLabels] : null
  const ids = vals.map((_, i) => i)
  const swap = (i, j) => {
    ;[vals[i], vals[j]] = [vals[j], vals[i]]
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    if (labs) [labs[i], labs[j]] = [labs[j], labs[i]]
  }
  const view = (extra = {}) => aview(vals, labs, { ids: [...ids], ...extra })
  return { vals, labs, ids, swap, view }
}

// Recursion tree for divide-and-conquer sorts (shown under the bars).
function recursionTree() {
  const nodes = []
  return {
    open(lo, hi, parent, vals) {
      const id = nodes.length
      nodes.push({ id, parent, lo, hi, label: vals.slice(lo, hi + 1).join(' '), state: 'active' })
      return id
    },
    set(id, state, vals) {
      nodes[id].state = state
      if (vals) nodes[id].label = vals.slice(nodes[id].lo, nodes[id].hi + 1).join(' ')
    },
    snap: (active) => ({ nodes: nodes.map((n) => ({ ...n })), active }),
  }
}

const done = (vals, labs, stats, name) => ({
  answer: [...vals],
  compare: [...vals],
  labels: labs ? [...labs] : null,
  summary: `Sorted with ${name}: ${vals.join(', ')}.`,
  stats,
})

export const bubble_sort = {
  id: 'bubble_sort',
  code: sources(
    `
function bubbleSort(arr) {                          //@start
  for (let i = 0; i < arr.length - 1; i++) {        //@outer
    let swapped = false;
    for (let j = 0; j < arr.length - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {                    //@compare
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; //@swap
        swapped = true;
      }
    }
    if (!swapped) break;                            //@early
  }
  return arr;                                       //@done
}`,
    `
def bubble_sort(arr):                      #@start
    for i in range(len(arr) - 1):          #@outer
        swapped = False
        for j in range(len(arr) - 1 - i):
            if arr[j] > arr[j + 1]:        #@compare
                arr[j], arr[j + 1] = arr[j + 1], arr[j]  #@swap
                swapped = True
        if not swapped:                    #@early
            break
    return arr                             #@done`
  ),
  run(input) {
    const { vals, labs, swap, view } = setup(input)
    const R = recorder()
    const n = vals.length
    const sorted = []
    let comparisons = 0
    let swaps = 0
    R.add('start', `Bubble sort ${n} items.`, 'Repeatedly swap neighbours that are out of order; the largest item "bubbles" to the end each pass.', { n }, view())
    for (let i = 0; i < n - 1; i++) {
      R.add('outer', `Pass ${i + 1}.`, `After this pass the ${i + 1} largest item(s) will be in their final place.`, { i, comparisons, swaps }, view({ sorted: [...sorted] }))
      let swapped = false
      for (let j = 0; j < n - 1 - i; j++) {
        comparisons++
        const out = vals[j] > vals[j + 1]
        R.add('compare', `Compare ${vals[j]} and ${vals[j + 1]}: ${out ? 'out of order' : 'already in order'}.`, out ? 'A bigger item sits before a smaller one, so they must swap.' : 'No swap needed.', { i, j, comparisons, swaps }, view({ pointers: { j, 'j+1': j + 1 }, highlight: { [j]: 'compare', [j + 1]: 'compare' }, sorted: [...sorted] }))
        if (out) {
          swap(j, j + 1)
          swaps++
          swapped = true
          R.add('swap', `Swap them → ${vals[j]}, ${vals[j + 1]}.`, 'The larger value moves one step to the right.', { i, j, comparisons, swaps }, view({ highlight: { [j]: 'swap', [j + 1]: 'swap' }, sorted: [...sorted] }))
        }
      }
      sorted.push(n - 1 - i)
      if (!swapped) {
        for (let k = 0; k < n - 1 - i; k++) sorted.push(k)
        R.add('early', 'No swaps in this pass, so the list is already sorted. Stop early.', 'This early exit is why bubble sort is fast on nearly-sorted data.', { comparisons, swaps }, view({ sorted: [...sorted] }))
        break
      }
    }
    const all = vals.map((_, k) => k)
    R.add('done', `Sorted after ${comparisons} comparisons and ${swaps} swaps.`, 'Bubble sort is O(n²) in general but only O(n) if the data is already sorted.', { comparisons, swaps }, view({ sorted: all }))
    return { steps: R.steps, result: done(vals, labs, { comparisons, swaps }, 'bubble sort') }
  },
}

export const insertion_sort = {
  id: 'insertion_sort',
  code: sources(
    `
function insertionSort(arr) {               //@start
  for (let i = 1; i < arr.length; i++) {    //@outer
    const key = arr[i];                     //@key
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {        //@compare
      arr[j + 1] = arr[j];                  //@shift
      j--;
    }
    arr[j + 1] = key;                       //@insert
  }
  return arr;                               //@done
}`,
    `
def insertion_sort(arr):                 #@start
    for i in range(1, len(arr)):         #@outer
        key = arr[i]                     #@key
        j = i - 1
        while j >= 0 and arr[j] > key:   #@compare
            arr[j + 1] = arr[j]          #@shift
            j -= 1
        arr[j + 1] = key                 #@insert
    return arr                           #@done`
  ),
  run(input) {
    const { vals, labs, ids, view } = setup(input)
    const R = recorder()
    const n = vals.length
    let comparisons = 0
    let shifts = 0
    R.add('start', `Insertion sort ${n} items.`, 'Grow a sorted prefix: take the next item and slide it left into its correct place, like sorting playing cards in your hand.', { n }, view({ sorted: [0] }))
    for (let i = 1; i < n; i++) {
      const prefix = () => Array.from({ length: i }, (_, k) => k)
      R.add('outer', `Items 0..${i - 1} are sorted. Next: index ${i}.`, 'Everything left of i is already in order relative to each other.', { i, comparisons, shifts }, view({ pointers: { i }, sorted: prefix() }))
      const key = vals[i]
      const keyLab = labs ? labs[i] : null
      const keyId = ids[i]
      R.add('key', `Pick up key = ${key}.`, 'We hold this value aside while larger items shift right to make room.', { i, key }, view({ pointers: { i }, highlight: { [i]: 'pivot' }, sorted: prefix() }))
      let j = i - 1
      while (true) {
        if (j < 0) break
        comparisons++
        const bigger = vals[j] > key
        R.add('compare', `Is ${vals[j]} > ${key}? ${bigger ? 'Yes' : 'No'}.`, bigger ? 'A larger item must move right.' : 'Found the spot: everything to the left is ≤ key.', { i, j, key, comparisons, shifts }, view({ pointers: { j }, highlight: { [j]: 'compare' }, sorted: prefix() }))
        if (!bigger) break
        vals[j + 1] = vals[j]
        ids[j + 1] = ids[j]
        ids[j] = keyId
        vals[j] = key
        if (labs) {
          labs[j + 1] = labs[j]
          labs[j] = keyLab
        }
        shifts++
        R.add('shift', `Shift ${vals[j]} right to index ${j + 1}.`, 'Makes a gap for the key.', { j, key, shifts }, view({ highlight: { [j + 1]: 'swap' }, sorted: prefix() }))
        j--
      }
      vals[j + 1] = key
      ids[j + 1] = keyId
      if (labs) labs[j + 1] = keyLab
      R.add('insert', `Insert ${key} at index ${j + 1}.`, `Now items 0..${i} are sorted.`, { i, key, comparisons, shifts }, view({ highlight: { [j + 1]: 'found' }, sorted: Array.from({ length: i + 1 }, (_, k) => k) }))
    }
    R.add('done', `Sorted after ${comparisons} comparisons and ${shifts} shifts.`, 'Insertion sort is O(n²) worst case but close to O(n) for nearly-sorted data.', { comparisons, shifts }, view({ sorted: vals.map((_, k) => k) }))
    return { steps: R.steps, result: done(vals, labs, { comparisons, shifts }, 'insertion sort') }
  },
}

export const merge_sort = {
  id: 'merge_sort',
  code: sources(
    `
function mergeSort(arr, lo = 0, hi = arr.length - 1) { //@start
  if (lo >= hi) return;                                //@base
  const mid = Math.floor((lo + hi) / 2);               //@split
  mergeSort(arr, lo, mid);
  mergeSort(arr, mid + 1, hi);
  merge(arr, lo, mid, hi);                             //@merge
}
function merge(arr, lo, mid, hi) {
  const left = arr.slice(lo, mid + 1);                 //@copy
  const right = arr.slice(mid + 1, hi + 1);
  let i = 0, j = 0, k = lo;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) arr[k++] = left[i++];     //@compare
    else arr[k++] = right[j++];
  }
  while (i < left.length) arr[k++] = left[i++];        //@rest
  while (j < right.length) arr[k++] = right[j++];
}`,
    `
def merge_sort(arr, lo=0, hi=None):      #@start
    if hi is None:
        hi = len(arr) - 1
    if lo >= hi:                         #@base
        return
    mid = (lo + hi) // 2                 #@split
    merge_sort(arr, lo, mid)
    merge_sort(arr, mid + 1, hi)
    merge(arr, lo, mid, hi)              #@merge

def merge(arr, lo, mid, hi):
    left = arr[lo:mid + 1]               #@copy
    right = arr[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:          #@compare
            arr[k] = left[i]; i += 1
        else:
            arr[k] = right[j]; j += 1
        k += 1
    while i < len(left):                 #@rest
        arr[k] = left[i]; i += 1; k += 1
    while j < len(right):
        arr[k] = right[j]; j += 1; k += 1`
  ),
  run(input) {
    const { vals, labs, ids, view: base } = setup(input)
    const T = recursionTree()
    let active = null
    const view = (extra = {}) => base({ tree: T.snap(active), ...extra })
    const R = recorder()
    let comparisons = 0
    let writes = 0
    R.add('start', `Merge sort ${vals.length} items.`, 'Divide and conquer: split in half, sort each half, then merge two sorted halves in one linear pass.', { n: vals.length }, view())
    const sort = (lo, hi, depth, parent = null) => {
      const node = T.open(lo, hi, parent, vals)
      active = node
      if (lo >= hi) {
        T.set(node, 'done')
        R.add('base', `Range [${lo}..${hi}] has one item, already sorted.`, 'A single item is trivially sorted. This is where recursion stops.', { lo, hi, depth }, view({ range: [lo, hi] }))
        return
      }
      const mid = Math.floor((lo + hi) / 2)
      R.add('split', `Split [${lo}..${hi}] into [${lo}..${mid}] and [${mid + 1}..${hi}].`, 'Halving means only about log2(n) levels of splitting.', { lo, mid, hi, depth }, view({ range: [lo, hi], pointers: { lo, mid, hi } }))
      T.set(node, 'waiting')
      sort(lo, mid, depth + 1, node)
      sort(mid + 1, hi, depth + 1, node)
      active = node
      T.set(node, 'active')
      R.add('merge', `Merge sorted halves [${lo}..${mid}] and [${mid + 1}..${hi}].`, 'Both halves are sorted, so we only ever compare their front items.', { lo, mid, hi, depth }, view({ range: [lo, hi] }))
      const left = vals.slice(lo, mid + 1)
      const right = vals.slice(mid + 1, hi + 1)
      const ll = labs ? labs.slice(lo, mid + 1) : null
      const rl = labs ? labs.slice(mid + 1, hi + 1) : null
      const li = ids.slice(lo, mid + 1)
      const ri = ids.slice(mid + 1, hi + 1)
      R.add('copy', `Copy halves: left = [${left}], right = [${right}].`, 'Merge needs this extra O(n) memory.', { left: `[${left}]`, right: `[${right}]` }, view({ range: [lo, hi] }))
      let i = 0
      let j = 0
      let k = lo
      while (i < left.length && j < right.length) {
        comparisons++
        const takeLeft = left[i] <= right[j]
        if (takeLeft) {
          vals[k] = left[i]
          ids[k] = li[i]
          if (labs) labs[k] = ll[i]
          i++
        } else {
          vals[k] = right[j]
          ids[k] = ri[j]
          if (labs) labs[k] = rl[j]
          j++
        }
        writes++
        // For display, the not-yet-written positions show what is still waiting in the
        // two halves (left remainder, then right remainder), so every item stays visible once.
        const wl = left.slice(i).concat(right.slice(j))
        const wi = li.slice(i).concat(ri.slice(j))
        const wb = labs ? ll.slice(i).concat(rl.slice(j)) : null
        for (let t = 0; t < wl.length; t++) {
          vals[k + 1 + t] = wl[t]
          ids[k + 1 + t] = wi[t]
          if (labs) labs[k + 1 + t] = wb[t]
        }
        R.add('compare', `${takeLeft ? left[i - 1] : right[j - 1]} is the smaller front item → write it at index ${k}.`, takeLeft ? 'Taking from the left on ties keeps merge sort stable.' : 'The right half had the smaller front item.', { i, j, k, comparisons, writes }, view({ range: [lo, hi], highlight: { [k]: 'swap' } }))
        k++
      }
      if (i < left.length || j < right.length) {
        while (i < left.length) {
          vals[k] = left[i]
          ids[k] = li[i]
          if (labs) labs[k] = ll[i]
          i++
          k++
          writes++
        }
        while (j < right.length) {
          vals[k] = right[j]
          ids[k] = ri[j]
          if (labs) labs[k] = rl[j]
          j++
          k++
          writes++
        }
        R.add('rest', 'One half is used up; copy the rest of the other half as is.', 'Those leftovers are already sorted and all larger than what we wrote.', { comparisons, writes }, view({ range: [lo, hi] }))
      }
      T.set(node, 'done', vals)
    }
    sort(0, vals.length - 1, 0)
    active = null
    R.add('base', `Sorted after ${comparisons} comparisons and ${writes} writes.`, 'Merge sort is always O(n log n), whatever the input order.', { comparisons, writes }, view({ sorted: vals.map((_, k) => k) }))
    return { steps: R.steps, result: done(vals, labs, { comparisons, writes }, 'merge sort') }
  },
}

export const quick_sort = {
  id: 'quick_sort',
  code: sources(
    `
function quickSort(arr, lo = 0, hi = arr.length - 1) { //@start
  if (lo >= hi) return;                                //@base
  const p = partition(arr, lo, hi);                    //@partition
  quickSort(arr, lo, p - 1);
  quickSort(arr, p + 1, hi);
}
function partition(arr, lo, hi) {
  const pivot = arr[hi];                               //@pivot
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {                              //@compare
      [arr[i], arr[j]] = [arr[j], arr[i]];             //@swap
      i++;
    }
  }
  [arr[i], arr[hi]] = [arr[hi], arr[i]];               //@place
  return i;
}`,
    `
def quick_sort(arr, lo=0, hi=None):         #@start
    if hi is None:
        hi = len(arr) - 1
    if lo >= hi:                            #@base
        return
    p = partition(arr, lo, hi)              #@partition
    quick_sort(arr, lo, p - 1)
    quick_sort(arr, p + 1, hi)

def partition(arr, lo, hi):
    pivot = arr[hi]                         #@pivot
    i = lo
    for j in range(lo, hi):
        if arr[j] < pivot:                  #@compare
            arr[i], arr[j] = arr[j], arr[i] #@swap
            i += 1
    arr[i], arr[hi] = arr[hi], arr[i]       #@place
    return i`
  ),
  run(input) {
    const { vals, labs, swap, view: base } = setup(input)
    const T = recursionTree()
    let active = null
    const view = (extra = {}) => base({ tree: T.snap(active), ...extra })
    const R = recorder()
    const placed = []
    let comparisons = 0
    let swaps = 0
    R.add('start', `Quick sort ${vals.length} items (last element as pivot).`, 'Pick a pivot, move smaller items to its left and larger to its right, then sort each side.', { n: vals.length }, view())
    const sort = (lo, hi, parent = null) => {
      const node = lo <= hi ? T.open(lo, hi, parent, vals) : null
      if (node != null) active = node
      if (lo >= hi) {
        if (node != null) T.set(node, 'done')
        if (lo === hi) placed.push(lo)
        R.add('base', `Range [${lo}..${hi}] has at most one item, nothing to do.`, 'Recursion stops here.', { lo, hi }, view({ range: lo <= hi ? [lo, hi] : null, sorted: [...placed] }))
        return
      }
      R.add('partition', `Partition range [${lo}..${hi}].`, 'After partitioning, the pivot lands in its final sorted position.', { lo, hi }, view({ range: [lo, hi], sorted: [...placed] }))
      const pivot = vals[hi]
      let i = lo
      R.add('pivot', `Pivot = ${pivot} (index ${hi}).`, 'Using the last item is simple, but on already-sorted data it makes every split lopsided (O(n²)).', { pivot, lo, hi, i }, view({ range: [lo, hi], highlight: { [hi]: 'pivot' }, pointers: { i }, sorted: [...placed] }))
      for (let j = lo; j < hi; j++) {
        comparisons++
        const smaller = vals[j] < pivot
        R.add('compare', `Is ${vals[j]} < pivot ${pivot}? ${smaller ? 'Yes' : 'No'}.`, smaller ? 'It belongs on the left side.' : 'It stays on the right side.', { pivot, i, j, comparisons, swaps }, view({ range: [lo, hi], highlight: { [hi]: 'pivot', [j]: 'compare' }, pointers: { i, j }, sorted: [...placed] }))
        if (smaller) {
          if (i !== j) {
            swap(i, j)
            swaps++
            R.add('swap', `Swap indices ${i} and ${j}.`, 'Grow the "smaller than pivot" zone by one.', { pivot, i, j, swaps }, view({ range: [lo, hi], highlight: { [hi]: 'pivot', [i]: 'swap', [j]: 'swap' }, sorted: [...placed] }))
          }
          i++
        }
      }
      swap(i, hi)
      swaps++
      placed.push(i)
      T.set(node, 'waiting', vals)
      R.add('place', `Place pivot ${pivot} at index ${i}: its final position.`, 'Everything left is smaller, everything right is larger or equal.', { pivot, p: i, swaps }, view({ range: [lo, hi], highlight: { [i]: 'found' }, sorted: [...placed] }))
      sort(lo, i - 1, node)
      sort(i + 1, hi, node)
      T.set(node, 'done', vals)
    }
    sort(0, vals.length - 1)
    active = null
    R.add('base', `Sorted after ${comparisons} comparisons and ${swaps} swaps.`, 'Average O(n log n); worst case O(n²) when pivots are badly chosen.', { comparisons, swaps }, view({ sorted: vals.map((_, k) => k) }))
    return { steps: R.steps, result: done(vals, labs, { comparisons, swaps }, 'quick sort') }
  },
}
