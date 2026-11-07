import { recorder, sources, fmt, unitOf } from '../util.js'

// ---------- 0/1 knapsack ----------
export const knapsack_01 = {
  id: 'knapsack_01',
  code: sources(
    `
function knapsack(items, W) {                                   //@start
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(0)); //@init
  for (let i = 1; i <= n; i++) {
    const { weight, value } = items[i - 1];
    for (let w = 0; w <= W; w++) {
      dp[i][w] = dp[i - 1][w];                                  //@skip
      if (weight <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weight] + value); //@take
      }
    }
  }
  return dp[n][W];                                              //@done
}`,
    `
def knapsack(items, W):                                  #@start
    n = len(items)
    dp = [[0] * (W + 1) for _ in range(n + 1)]           #@init
    for i in range(1, n + 1):
        weight, value = items[i - 1]
        for w in range(W + 1):
            dp[i][w] = dp[i - 1][w]                      #@skip
            if weight <= w:
                dp[i][w] = max(dp[i][w], dp[i - 1][w - weight] + value)  #@take
    return dp[n][W]                                      #@done`
  ),
  run(input) {
    const { items, capacity: W } = input
    const n = items.length
    const R = recorder()
    const U = unitOf(input)
    const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(null))
    const rowHeaders = ['(none)', ...items.map((it) => `${it.name} w${it.weight} v${it.value}`)]
    const colHeaders = Array.from({ length: W + 1 }, (_, w) => String(w))
    const view = (hl = {}, caption) => ({ kind: 'table', caption: caption || 'dp[i][w] = best value using the first i items with capacity w', rowHeaders, colHeaders, cells: dp.map((r) => r.map((x) => (x == null ? '' : fmt(x)))), highlight: hl })
    R.add('start', `Pack items into capacity ${W}${U}; each item is all-or-nothing.`, 'Greedy fails here, so we solve every smaller subproblem once and reuse the answers (dynamic programming).', { n, W }, view())
    for (let w = 0; w <= W; w++) dp[0][w] = 0
    R.add('init', 'Row 0: with no items, every capacity has value 0.', 'This is the base case the table builds on.', {}, view())
    let cells = 0
    for (let i = 1; i <= n; i++) {
      const { name, weight, value } = items[i - 1]
      for (let w = 0; w <= W; w++) {
        cells++
        const skip = dp[i - 1][w]
        if (weight > w) {
          dp[i][w] = skip
          R.add('skip', `${name} (w${weight}) doesn't fit in capacity ${w}: copy ${skip} from above.`, 'The only option is to leave this item out.', { i, w, item: name, skip, cells }, view({ [`${i},${w}`]: 'current', [`${i - 1},${w}`]: 'source' }))
        } else {
          const take = dp[i - 1][w - weight] + value
          dp[i][w] = Math.max(skip, take)
          R.add('take', `Capacity ${w}: skip ${name} → ${skip}, or take it → ${dp[i - 1][w - weight]} + ${value} = ${take}. Best = ${dp[i][w]}.`, take > skip ? `Taking ${name} wins.` : `Leaving ${name} out is at least as good.`, { i, w, item: name, skip, take, best: dp[i][w], cells }, view({ [`${i},${w}`]: 'current', [`${i - 1},${w}`]: 'source', [`${i - 1},${w - weight}`]: 'source' }))
        }
      }
    }
    // trace back which items were chosen
    const chosen = []
    const path = {}
    let w = W
    for (let i = n; i >= 1; i--) {
      path[`${i},${w}`] = 'path'
      if (dp[i][w] !== dp[i - 1][w]) {
        chosen.unshift(items[i - 1].name)
        w -= items[i - 1].weight
      }
    }
    path[`0,${w}`] = 'path'
    R.add('done', `Best value = ${dp[n][W]}, by taking: ${chosen.join(', ') || 'nothing'}.`, `We filled ${cells} cells: O(n·W). Walking back up the table shows which items were taken.`, { best: dp[n][W], cells }, view(path, 'Trace back: where the value changed, that item was taken'))
    return {
      steps: R.steps,
      result: {
        answer: { best: dp[n][W], chosen },
        compare: dp[n][W],
        summary: `Best value ${dp[n][W]} with ${chosen.join(', ') || 'no items'}.`,
        stats: { cells },
        metric: { label: 'Total value', value: dp[n][W] },
      },
    }
  },
}

// ---------- LCS ----------
export const lcs = {
  id: 'lcs',
  code: sources(
    `
function lcs(a, b) {                                            //@start
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0)); //@init
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {                              //@match
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);        //@max
      }
    }
  }
  return dp[a.length][b.length];                                //@done
}`,
    `
def lcs(a, b):                                           #@start
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)] #@init
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:                     #@match
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])  #@max
    return dp[len(a)][len(b)]                            #@done`
  ),
  run(input) {
    const a = input.a
    const b = input.b
    const R = recorder()
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(null))
    const rowHeaders = ['∅', ...a.split('')]
    const colHeaders = ['∅', ...b.split('')]
    const view = (hl = {}, caption) => ({ kind: 'table', caption: caption || 'dp[i][j] = LCS length of a[0..i) and b[0..j)', rowHeaders, colHeaders, cells: dp.map((r) => r.map((x) => (x == null ? '' : String(x)))), highlight: hl })
    R.add('start', `Longest common subsequence of "${a}" and "${b}".`, 'A subsequence keeps order but may skip characters. DP builds the answer for every pair of prefixes.', { a, b }, view())
    for (let i = 0; i <= a.length; i++) dp[i][0] = 0
    for (let j = 0; j <= b.length; j++) dp[0][j] = 0
    R.add('init', 'An empty prefix shares nothing: first row and column are 0.', 'Base cases.', {}, view())
    let cells = 0
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        cells++
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
          R.add('match', `'${a[i - 1]}' = '${b[j - 1]}': extend the diagonal → ${dp[i][j]}.`, 'A matching character can be added to the best answer without both characters.', { i, j, 'a[i-1]': a[i - 1], 'b[j-1]': b[j - 1], cells }, view({ [`${i},${j}`]: 'current', [`${i - 1},${j - 1}`]: 'source' }))
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
          R.add('max', `'${a[i - 1]}' ≠ '${b[j - 1]}': best of up (${dp[i - 1][j]}) and left (${dp[i][j - 1]}) → ${dp[i][j]}.`, 'Drop one of the two characters and keep whichever is better.', { i, j, cells }, view({ [`${i},${j}`]: 'current', [`${i - 1},${j}`]: 'source', [`${i},${j - 1}`]: 'source' }))
        }
      }
    }
    let i = a.length
    let j = b.length
    const out = []
    const path = {}
    while (i > 0 && j > 0) {
      path[`${i},${j}`] = 'path'
      if (a[i - 1] === b[j - 1]) {
        out.unshift(a[i - 1])
        i--
        j--
      } else if (dp[i - 1][j] >= dp[i][j - 1]) i--
      else j--
    }
    const s = out.join('')
    R.add('done', `LCS length ${dp[a.length][b.length]}: "${s}".`, `Filled ${cells} cells: O(m·n). Diagonal moves on the traced path are the shared characters.`, { length: s.length, cells }, view(path, 'Trace back from the bottom-right corner'))
    return { steps: R.steps, result: { answer: { length: s.length, sequence: s }, compare: s.length, summary: `Longest common subsequence: "${s}" (length ${s.length}).`, stats: { cells }, metric: { label: 'LCS length', value: s.length } } }
  },
}

// ---------- Coin change (min coins, DP) ----------
export const coin_change = {
  id: 'coin_change',
  code: sources(
    `
function coinChange(coins, amount) {                 //@start
  const dp = Array(amount + 1).fill(Infinity);       //@init
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of coins) {
      if (c <= x && dp[x - c] + 1 < dp[x]) {         //@check
        dp[x] = dp[x - c] + 1;                       //@update
      }
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];  //@done
}`,
    `
def coin_change(coins, amount):                      #@start
    dp = [float('inf')] * (amount + 1)               #@init
    dp[0] = 0
    for x in range(1, amount + 1):
        for c in coins:
            if c <= x and dp[x - c] + 1 < dp[x]:     #@check
                dp[x] = dp[x - c] + 1                #@update
    return -1 if dp[amount] == float('inf') else dp[amount]  #@done`
  ),
  run(input) {
    const { coins, amount } = input
    const R = recorder()
    const dp = Array(amount + 1).fill(Infinity)
    const last = Array(amount + 1).fill(null)
    const view = (hl = {}, caption) => ({ kind: 'table', caption: caption || 'dp[x] = fewest coins to make x; "via" = last coin used', rowHeaders: ['dp', 'via'], colHeaders: dp.map((_, x) => String(x)), cells: [dp.map((v) => fmt(v)), last.map((c) => (c == null ? '' : String(c)))], highlight: hl })
    R.add('start', `Fewest coins from {${coins.join(', ')}} to make ${amount}.`, 'Try every coin as the last coin and reuse the best answer for the rest. This guarantees the optimum.', { amount }, view())
    dp[0] = 0
    R.add('init', 'dp[0] = 0 (no coins for amount 0); everything else starts as ∞.', 'Base case.', {}, view({ '0,0': 'found' }))
    let checks = 0
    for (let x = 1; x <= amount; x++) {
      for (const c of coins) {
        if (c > x) continue
        checks++
        const cand = dp[x - c] + 1
        const better = cand < dp[x]
        R.add('check', `Amount ${x}, last coin ${c}: dp[${x - c}] + 1 = ${fmt(cand)} ${better ? '<' : '≥'} ${fmt(dp[x])}.`, better ? 'Using this coin last needs fewer coins.' : 'Not an improvement.', { x, c, cand, 'dp[x]': dp[x], checks }, view({ [`0,${x}`]: 'current', [`0,${x - c}`]: 'source' }))
        if (better) {
          dp[x] = cand
          last[x] = c
          R.add('update', `dp[${x}] = ${cand}.`, 'Best known way to make this amount.', { x, 'dp[x]': cand }, view({ [`0,${x}`]: 'found', [`1,${x}`]: 'found' }))
        }
      }
    }
    const ok = dp[amount] !== Infinity
    const used = []
    if (ok) {
      let x = amount
      while (x > 0) {
        used.push(last[x])
        x -= last[x]
      }
    }
    const path = {}
    if (ok) {
      let x = amount
      while (x > 0) {
        path[`0,${x}`] = 'path'
        x -= last[x]
      }
    }
    R.add('done', ok ? `Minimum ${dp[amount]} coins: ${used.join(' + ')}.` : `Amount ${amount} cannot be made.`, `O(amount × coins) = ${checks} checks. Following "via" backwards gives the coins.`, { result: ok ? dp[amount] : -1, checks }, view(path, 'Follow the "via" row back from the amount'))
    return { steps: R.steps, result: { answer: ok ? { count: dp[amount], coins: used } : { count: -1 }, compare: ok ? dp[amount] : -1, summary: ok ? `Minimum ${dp[amount]} coins (${used.join(' + ')}).` : 'Cannot make this amount.', stats: { checks }, metric: { label: 'Coins used', value: ok ? dp[amount] : Infinity } } }
  },
}
