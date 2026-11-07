import { recorder, sources, unitOf } from '../util.js'

const aview = (values, labels, extra = {}) => ({
  kind: 'array',
  values: [...values],
  labels: labels || null,
  highlight: {},
  pointers: {},
  range: null,
  sorted: [],
  ...extra,
})

export const linear_search = {
  id: 'linear_search',
  code: sources(
    `
function linearSearch(arr, target) {     //@start
  for (let i = 0; i < arr.length; i++) { //@loop
    if (arr[i] === target) {             //@compare
      return i;                          //@found
    }
  }
  return -1;                             //@notfound
}`,
    `
def linear_search(arr, target):   #@start
    for i in range(len(arr)):     #@loop
        if arr[i] == target:      #@compare
            return i              #@found
    return -1                     #@notfound`
  ),
  run(input) {
    const { values, target, itemLabels } = input
    const R = recorder()
    let comparisons = 0
    R.add('start', `Look for ${target} by checking items one by one.`, 'Linear search needs no ordering: it simply walks the list from the start.', { target, n: values.length }, aview(values, itemLabels))
    for (let i = 0; i < values.length; i++) {
      R.add('loop', `Move to index ${i}.`, 'Every item might be the one we want, so none can be skipped.', { i, target }, aview(values, itemLabels, { pointers: { i } }))
      comparisons++
      const hit = values[i] === target
      R.add('compare', `Is ${values[i]} equal to ${target}? ${hit ? 'Yes.' : 'No.'}`, hit ? 'Match found, we can stop early.' : 'Not a match, keep scanning.', { i, 'arr[i]': values[i], target, comparisons }, aview(values, itemLabels, { pointers: { i }, highlight: { [i]: hit ? 'found' : 'compare' } }))
      if (hit) {
        R.add('found', `Found ${target} at index ${i} after ${comparisons} comparisons.`, 'Linear search returns the first position that matches.', { result: i, comparisons }, aview(values, itemLabels, { highlight: { [i]: 'found' } }))
        return { steps: R.steps, result: { answer: i, compare: i, summary: `${target} is at index ${i}.`, stats: { comparisons } } }
      }
    }
    R.add('notfound', `${target} is not in the list (${comparisons} comparisons).`, 'We checked every item without a match.', { result: -1, comparisons }, aview(values, itemLabels))
    return { steps: R.steps, result: { answer: -1, compare: -1, summary: `${target} is not present.`, stats: { comparisons } } }
  },
}

export const binary_search = {
  id: 'binary_search',
  code: sources(
    `
function binarySearch(arr, target) {        //@start
  let lo = 0, hi = arr.length - 1;          //@init
  while (lo <= hi) {                        //@loop
    const mid = Math.floor((lo + hi) / 2);  //@mid
    if (arr[mid] === target) return mid;    //@found
    if (arr[mid] < target) lo = mid + 1;    //@right
    else hi = mid - 1;                      //@left
  }
  return -1;                                //@notfound
}`,
    `
def binary_search(arr, target):    #@start
    lo, hi = 0, len(arr) - 1       #@init
    while lo <= hi:                #@loop
        mid = (lo + hi) // 2       #@mid
        if arr[mid] == target:     #@found
            return mid
        elif arr[mid] < target:    #@right
            lo = mid + 1
        else:                      #@left
            hi = mid - 1
    return -1                      #@notfound`
  ),
  run(input) {
    const { values, target, itemLabels } = input
    const R = recorder()
    let probes = 0
    let lo = 0
    let hi = values.length - 1
    const v = (extra) => aview(values, itemLabels, { range: [lo, hi], ...extra })
    R.add('start', `Look for ${target} in a sorted list of ${values.length} items.`, 'Because the list is sorted, one comparison tells us which half can be thrown away.', { target }, aview(values, itemLabels))
    R.add('init', `Search window is the whole list: lo = 0, hi = ${hi}.`, 'lo and hi mark the only region where the target can still be.', { lo, hi }, v({ pointers: { lo, hi } }))
    while (lo <= hi) {
      R.add('loop', `Window [${lo}..${hi}] still has ${hi - lo + 1} item(s).`, 'As long as the window is not empty, the target may be inside it.', { lo, hi }, v({ pointers: { lo, hi } }))
      const mid = Math.floor((lo + hi) / 2)
      probes++
      R.add('mid', `Check the middle: index ${mid} holds ${values[mid]}.`, 'The middle splits the window into two equal halves, so either answer halves the work.', { lo, hi, mid, 'arr[mid]': values[mid], probes }, v({ pointers: { lo, mid, hi }, highlight: { [mid]: 'compare' } }))
      if (values[mid] === target) {
        R.add('found', `${values[mid]} = ${target}. Found at index ${mid} after ${probes} probes.`, 'Only about log2(n) probes are ever needed.', { result: mid, probes }, v({ pointers: { mid }, highlight: { [mid]: 'found' } }))
        return { steps: R.steps, result: { answer: mid, compare: mid, summary: `${target} is at index ${mid}.`, stats: { probes, comparisons: probes } } }
      }
      if (values[mid] < target) {
        lo = mid + 1
        R.add('right', `${values[mid]} < ${target}, so discard the left half: lo = ${lo}.`, 'Everything left of mid is even smaller, so the target cannot be there.', { lo, hi, mid }, v({ pointers: { lo, hi } }))
      } else {
        hi = mid - 1
        R.add('left', `${values[mid]} > ${target}, so discard the right half: hi = ${hi}.`, 'Everything right of mid is even larger, so the target cannot be there.', { lo, hi, mid }, v({ pointers: { lo, hi } }))
      }
    }
    R.add('notfound', `Window is empty: ${target} is not in the list (${probes} probes).`, 'lo passed hi, so no position is left to check.', { result: -1, probes }, aview(values, itemLabels))
    return { steps: R.steps, result: { answer: -1, compare: -1, summary: `${target} is not present.`, stats: { probes, comparisons: probes } } }
  },
}

export { aview, unitOf }
