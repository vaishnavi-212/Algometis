import { recorder, sources, fmt, unitOf } from '../util.js'

// ---------- Fractional knapsack ----------
export const fractional_knapsack = {
  id: 'fractional_knapsack',
  code: sources(
    `
function fractionalKnapsack(items, capacity) {          //@start
  items.sort((a, b) => b.value / b.weight - a.value / a.weight); //@sort
  let total = 0, left = capacity;
  for (const item of items) {
    if (left === 0) break;                              //@full
    const take = Math.min(item.weight, left);           //@take
    total += item.value * (take / item.weight);
    left -= take;
  }
  return total;                                         //@done
}`,
    `
def fractional_knapsack(items, capacity):                  #@start
    items.sort(key=lambda it: it.value / it.weight, reverse=True)  #@sort
    total, left = 0, capacity
    for it in items:
        if left == 0:                                      #@full
            break
        take = min(it.weight, left)                        #@take
        total += it.value * take / it.weight
        left -= take
    return total                                           #@done`
  ),
  run(input) {
    const { items, capacity } = input
    const R = recorder()
    const U = unitOf(input)
    const list = items.map((it) => ({ ...it, ratio: it.value / it.weight, taken: 0 }))
    let left = capacity
    let total = 0
    let current = -1
    const view = () => ({
      kind: 'items',
      items: list.map((it, i) => ({
        name: it.name,
        sub: `w ${fmt(it.weight)} · v ${fmt(it.value)} · ${fmt(it.ratio)}/unit`,
        fill: it.taken / it.weight,
        state: i === current ? 'current' : it.taken > 0 ? 'taken' : 'idle',
      })),
      meter: { label: `Capacity used${U}`, used: capacity - left, total: capacity },
    })
    R.add('start', `Fill capacity ${capacity}${U} with the most value; items can be split.`, 'Because we can take fractions, the best move is always the item with the highest value per unit of weight.', { capacity }, view())
    list.sort((a, b) => b.ratio - a.ratio)
    R.add('sort', `Sort by value per unit weight: ${list.map((it) => `${it.name} (${fmt(it.ratio)})`).join(', ')}.`, 'Greedy choice: most valuable per unit first.', {}, view())
    for (let i = 0; i < list.length; i++) {
      current = i
      if (left === 0) {
        R.add('full', 'The bag is full. Stop.', 'No capacity left for anything else.', { total }, view())
        break
      }
      const it = list[i]
      const take = Math.min(it.weight, left)
      it.taken = take
      total += it.value * (take / it.weight)
      left -= take
      R.add('take', take === it.weight ? `Take all of ${it.name} (${fmt(take)}${U}). Value so far: ${fmt(total)}.` : `Take ${fmt(take)} of ${fmt(it.weight)} of ${it.name} (a fraction). Value so far: ${fmt(total)}.`, take === it.weight ? 'It fits completely.' : 'Only part fits; splitting is allowed, so fill the remaining space with it.', { item: it.name, take, left, total }, view())
    }
    current = -1
    R.add('done', `Maximum value = ${fmt(total)}.`, 'This greedy is optimal only because items are divisible. For indivisible items you need 0/1 knapsack DP.', { total }, view())
    return {
      steps: R.steps,
      result: {
        answer: { total, taken: list.filter((it) => it.taken > 0).map((it) => ({ name: it.name, amount: it.taken })) },
        compare: Math.round(total * 100) / 100,
        summary: `Best value ${fmt(total)} (items may be split).`,
        stats: { itemsConsidered: list.length },
        metric: { label: 'Total value', value: Math.round(total * 100) / 100 },
      },
    }
  },
}

// ---------- Activity selection ----------
export const activity_selection = {
  id: 'activity_selection',
  code: sources(
    `
function activitySelection(acts) {                 //@start
  acts.sort((a, b) => a.end - b.end);              //@sort
  const chosen = [];
  let lastEnd = -Infinity;
  for (const a of acts) {
    if (a.start >= lastEnd) {                      //@check
      chosen.push(a);                              //@pick
      lastEnd = a.end;
    }
  }
  return chosen;                                   //@done
}`,
    `
def activity_selection(acts):               #@start
    acts.sort(key=lambda a: a.end)          #@sort
    chosen, last_end = [], float('-inf')
    for a in acts:
        if a.start >= last_end:             #@check
            chosen.append(a)                #@pick
            last_end = a.end
    return chosen                           #@done`
  ),
  run(input) {
    const R = recorder()
    const acts = input.activities.map((a) => ({ ...a, state: 'idle' }))
    let lastEnd = -Infinity
    let current = null
    const view = () => ({ kind: 'timeline', activities: acts.map((a) => ({ name: a.name, start: a.start, end: a.end, state: a === current ? 'current' : a.state })), lastEnd: lastEnd === -Infinity ? null : lastEnd })
    R.add('start', `Pick the most non-overlapping events from ${acts.length}.`, 'Greedy rule: always pick the event that finishes earliest, which leaves the most room for the rest.', { n: acts.length }, view())
    acts.sort((a, b) => a.end - b.end || a.start - b.start)
    R.add('sort', `Sort by end time: ${acts.map((a) => `${a.name}(${a.end})`).join(', ')}.`, 'Finishing early never hurts: any optimal schedule can be swapped to start with the earliest-ending event.', {}, view())
    const chosen = []
    let checks = 0
    for (const a of acts) {
      current = a
      checks++
      const ok = a.start >= lastEnd
      R.add('check', `${a.name} runs ${a.start}–${a.end}. Starts ${ok ? 'after' : 'before'} the last pick ends (${lastEnd === -Infinity ? 'nothing picked yet' : lastEnd}).`, ok ? 'No clash, so it can be added.' : 'It overlaps the last chosen event, so skip it.', { name: a.name, start: a.start, end: a.end, lastEnd: lastEnd === -Infinity ? '-∞' : lastEnd, checks }, view())
      if (ok) {
        a.state = 'chosen'
        chosen.push(a)
        lastEnd = a.end
        R.add('pick', `Pick ${a.name}. Room is now busy until ${lastEnd}.`, 'Earliest finish among the remaining compatible events.', { picked: chosen.length, lastEnd }, view())
      } else {
        a.state = 'rejected'
      }
    }
    current = null
    R.add('done', `Maximum ${chosen.length} events: ${chosen.map((a) => a.name).join(', ')}.`, 'Sorting dominates, so O(n log n).', { picked: chosen.length, checks }, view())
    return {
      steps: R.steps,
      result: {
        answer: chosen.map((a) => a.name),
        compare: chosen.length,
        summary: `${chosen.length} events fit: ${chosen.map((a) => a.name).join(', ')}.`,
        stats: { checks },
        metric: { label: 'Events scheduled', value: chosen.length },
      },
    }
  },
}

// ---------- Greedy coin change ----------
export const greedy_coin_change = {
  id: 'greedy_coin_change',
  code: sources(
    `
function greedyCoins(coins, amount) {              //@start
  coins.sort((a, b) => b - a);                     //@sort
  let count = 0;
  for (const c of coins) {
    while (amount >= c) {                          //@check
      amount -= c;                                 //@take
      count++;
    }
  }
  return amount === 0 ? count : -1;                //@done
}`,
    `
def greedy_coins(coins, amount):       #@start
    coins.sort(reverse=True)           #@sort
    count = 0
    for c in coins:
        while amount >= c:             #@check
            amount -= c                #@take
            count += 1
    return count if amount == 0 else -1  #@done`
  ),
  run(input) {
    const R = recorder()
    const coins = [...input.coins].sort((a, b) => b - a)
    const used = Object.fromEntries(coins.map((c) => [c, 0]))
    let left = input.amount
    let count = 0
    let current = null
    const view = () => ({
      kind: 'items',
      items: coins.map((c) => ({ name: `Coin ${c}`, sub: `used ${used[c]}×`, fill: used[c] > 0 ? 1 : 0, state: c === current ? 'current' : used[c] > 0 ? 'taken' : 'idle' })),
      meter: { label: 'Amount paid', used: input.amount - left, total: input.amount },
    })
    R.add('start', `Pay ${input.amount} using as few coins as possible, the greedy way.`, 'Greedy rule: always use the biggest coin that still fits.', { amount: input.amount }, view())
    R.add('sort', `Coins from largest to smallest: ${coins.join(', ')}.`, 'Biggest first.', {}, view())
    for (const c of coins) {
      current = c
      while (true) {
        const fits = left >= c
        R.add('check', `Remaining ${left}. Does coin ${c} fit? ${fits ? 'Yes' : 'No'}.`, fits ? 'Use it.' : 'Move on to a smaller coin.', { left, coin: c, count }, view())
        if (!fits) break
        left -= c
        used[c]++
        count++
        R.add('take', `Use coin ${c}. Remaining ${left}, coins used ${count}.`, 'Greedy never reconsiders this choice.', { left, count }, view())
      }
    }
    current = null
    const ok = left === 0
    R.add('done', ok ? `Greedy used ${count} coins.` : `Greedy got stuck with ${left} left.`, 'Greedy is optimal for "canonical" coin systems (like 1, 2, 5, 10) but can be wrong for others, e.g. {1, 3, 4} for 6 gives 4+1+1 instead of 3+3.', { count, left }, view())
    return {
      steps: R.steps,
      result: {
        answer: ok ? { count, used } : { count: -1 },
        compare: ok ? count : -1,
        summary: ok ? `Greedy uses ${count} coins (${coins.filter((c) => used[c]).map((c) => `${used[c]}×${c}`).join(' + ')}).` : 'Greedy could not make the exact amount.',
        stats: { coinChecks: R.steps.filter((s) => s.line === 'check').length },
        metric: { label: 'Coins used', value: ok ? count : Infinity },
      },
    }
  },
}
