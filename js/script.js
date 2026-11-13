/**
 * WORTH — turns the cost of living into hours of your life.
 *
 * Architecture
 * ------------
 * - Three plain files: index.html (markup), css/style.css and this script.
 *   No build step, no framework, no backend.
 * - All user data lives in one `state` object, saved to localStorage after
 *   every change. Render functions only ever READ from `state` and rebuild
 *   their own section, so what's on screen always matches what's saved.
 * - Every figure comes from one small set of "derived" functions
 *   (hourlyIncome, monthlyCost, …). No section does its own maths, so the
 *   same number is always the same everywhere on the page.
 * - Lists are rebuilt from state when their STRUCTURE changes (an item is
 *   added or removed). While the user is typing or dragging, only the
 *   affected numbers are updated, so the field or slider under their finger
 *   is never destroyed mid-gesture.
 * - Code order: constants, state & persistence, helpers, derived figures,
 *   one render function per section, event wiring, init.
 * - Modern JavaScript that every current browser runs natively (const/let,
 *   arrow functions, template literals), so there is nothing to transpile.
 */
(() => {
  'use strict';

  /* ============================================================================
     CONSTANTS
     ============================================================================ */

  const STORAGE_KEY = 'worth_state_v1';
  const CURRENCIES = ['€', '$', '£', 'CHF'];

  /** Lifestyle modes, as multiples of the user's own monthly spending. */
  const LIFESTYLE_MODES = [
    { name: 'Minimal', factor: 0.55, note: '≈ 55% of current' },
    { name: 'Current', factor: 1, note: 'your numbers' },
    { name: 'Luxury', factor: 2.8, note: '≈ 2.8× current' }
  ];
  /** Margin added to yearly cost for "required income" (taxes and saving, rule of thumb). */
  const INCOME_MARGIN = 0.8; // required income = yearly cost ÷ 0.8 (i.e. cost is 80% of income)
  /** The ages the Financial Future timeline aims for (from the brief: 18 → 25 → 30 → 40 → 50 → 60). */
  const TIMELINE_AGES = [18, 25, 30, 40, 50, 60, 70, 80];
  const TIMELINE_POINTS = 6;

  /** Validation bounds for every number the user can enter. */
  const BOUNDS = {
    age: [14, 100],
    income: [0, 10000000],
    savings: [0, 1000000000],
    hoursPerWeek: [1, 100],
    weeksPerYear: [1, 52],
    amount: [0, 10000000],
    percent: [0, 10],
    nameLength: 60,
    listLength: 60
  };

  const DEFAULT_STATE = {
    profile: {
      age: 28,
      monthlyIncome: 1500,
      currency: '€',
      savings: 1000,
      hoursPerWeek: 40,
      weeksPerYear: 52
    },
    expenses: [
      { id: 'e1', name: '🏠 Home', monthly: 600 },
      { id: 'e2', name: '🍔 Food', monthly: 280 },
      { id: 'e3', name: '🚗 Transport', monthly: 90 },
      { id: 'e4', name: '📱 Subscriptions', monthly: 35 },
      { id: 'e5', name: '👕 Shopping', monthly: 90 },
      { id: 'e6', name: '🏋️ Sport', monthly: 25 },
      { id: 'e7', name: '🎮 Entertainment', monthly: 55 },
      { id: 'e8', name: '✈️ Travel', monthly: 45 },
      { id: 'e9', name: '💳 Other', monthly: 80 }
    ],
    purchases: [],
    dreams: [],
    dreamMonthlySavings: 0,
    whatIfTargets: {}, // expense id → target monthly amount
    // monthlySavings: null means "follow my surplus" (income − expenses) until the user moves the slider
    future: { inflation: 3, salaryGrowth: 3, expenseGrowth: 2, monthlySavings: null }
  };

  /* ============================================================================
     STATE & PERSISTENCE
     ============================================================================ */

  /** Shorthand for document.getElementById. */
  function $(id) {
    return document.getElementById(id);
  }

  /**
   * Deep-copies plain data via a JSON round-trip (safe because state only
   * ever holds strings, numbers, booleans, arrays and plain objects).
   * @param {object} obj
   * @returns {object}
   */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Parses a value as a finite number and clamps it to [min, max].
   * Anything unreadable becomes `fallback`. Used on every number that comes
   * from an input field or from storage, which is what stops negative
   * expenses, 0-hour weeks or "NaN" from ever reaching the maths.
   * @param {*} value
   * @param {number} min
   * @param {number} max
   * @param {number} fallback
   * @returns {number}
   */
  function num(value, min, max, fallback) {
    const n = parseFloat(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /** Trims and shortens a user-provided name. */
  function cleanName(value) {
    return String(value == null ? '' : value).slice(0, BOUNDS.nameLength);
  }

  /**
   * Returns a short id that is unique even if two items are added in the
   * same millisecond (timestamp + random suffix).
   * @param {string} prefix
   */
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Cleans a list of {id, name, amount} items from storage.
   * @param {*} list
   * @param {string} amountKey - 'monthly' for expenses, 'price' for purchases/dreams
   * @param {string} prefix - id prefix for items missing an id
   * @returns {object[]}
   */
  function sanitizeList(list, amountKey, prefix) {
    if (!Array.isArray(list)) return null;
    return list
      .filter((x) => x && typeof x === 'object')
      .slice(0, BOUNDS.listLength)
      .map((x) => {
        const item = {
          id: typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : uid(prefix),
          name: cleanName(x.name)
        };
        item[amountKey] = num(x[amountKey], BOUNDS.amount[0], BOUNDS.amount[1], 0);
        return item;
      });
  }

  /**
   * Reads saved state and rebuilds it field by field on top of DEFAULT_STATE,
   * validating every value. Two benefits: (1) data saved by an older version
   * still gets sensible defaults for fields added later; (2) corrupted or
   * hand-edited storage can't crash the app or inject markup — it is simply
   * replaced by defaults.
   * @returns {object} the working state
   */
  function loadState() {
    const s = clone(DEFAULT_STATE);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return s;
      const p = JSON.parse(raw) || {};
      const pr = p.profile || {},
        d = s.profile;
      s.profile = {
        age: Math.round(num(pr.age, BOUNDS.age[0], BOUNDS.age[1], d.age)),
        monthlyIncome: num(pr.monthlyIncome, BOUNDS.income[0], BOUNDS.income[1], d.monthlyIncome),
        currency: CURRENCIES.indexOf(pr.currency) !== -1 ? pr.currency : d.currency,
        savings: num(pr.savings, BOUNDS.savings[0], BOUNDS.savings[1], d.savings),
        hoursPerWeek: num(pr.hoursPerWeek, BOUNDS.hoursPerWeek[0], BOUNDS.hoursPerWeek[1], d.hoursPerWeek),
        weeksPerYear: num(pr.weeksPerYear, BOUNDS.weeksPerYear[0], BOUNDS.weeksPerYear[1], d.weeksPerYear)
      };
      s.expenses = sanitizeList(p.expenses, 'monthly', 'e') || s.expenses;
      s.purchases = sanitizeList(p.purchases, 'price', 'p') || [];
      s.dreams = sanitizeList(p.dreams, 'price', 'd') || [];
      s.dreamMonthlySavings = num(p.dreamMonthlySavings, 0, BOUNDS.amount[1], 0);
      if (p.whatIfTargets && typeof p.whatIfTargets === 'object') {
        Object.keys(p.whatIfTargets).forEach((id) => {
          s.whatIfTargets[id] = num(p.whatIfTargets[id], 0, BOUNDS.amount[1], 0);
        });
      }
      const f = p.future || {};
      s.future = {
        inflation: num(f.inflation, 0, 10, 3),
        salaryGrowth: num(f.salaryGrowth, 0, 10, 3),
        expenseGrowth: num(f.expenseGrowth, 0, 10, 2),
        monthlySavings: f.monthlySavings == null ? null : num(f.monthlySavings, 0, BOUNDS.amount[1], 0)
      };
    } catch (e) {
      /* unreadable data: start from defaults rather than crash */
    }
    return s;
  }

  /** Writes state to localStorage (silently skipped if storage is unavailable, e.g. some private modes). */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* app keeps working, just not persisted */
    }
  }

  /** True if the user has completed the profile before (results are shown straight away on return). */
  function hasSavedData() {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  const state = loadState();
  let revealed = false; // true once the result sections are visible

  /* ============================================================================
     HELPERS
     ============================================================================ */

  /**
   * Escapes text for safe insertion into HTML — element content AND attribute
   * values (quotes included). Every user-provided string passes through here
   * before touching innerHTML, so a category called `"><img onerror=…>`
   * is shown as text instead of running as code.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** The selected currency symbol. */
  function cur() {
    return state.profile.currency;
  }

  /**
   * Formats an amount of money in the selected currency: "€1,300" or
   * "1,300 CHF" (CHF is conventionally written after the number).
   * @param {number} v
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function fmtMoney(v, decimals) {
    decimals = decimals || 0;
    if (!isFinite(v)) v = 0;
    const n = Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    const sign = v < 0 ? '−' : '';
    return cur() === 'CHF' ? `${sign + n} CHF` : sign + cur() + n;
  }

  /** Formats a number as a rounded integer with thousands separators. */
  function fmtInt(v) {
    return Math.round(isFinite(v) ? v : 0).toLocaleString('en-US');
  }

  /** Formats a number with one decimal and thousands separators. */
  function fmt1(v) {
    return (isFinite(v) ? v : 0).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  /** English plural helper: plural(1,'year','years') → "1 year". */
  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  /**
   * Turns a number of months into "3 years 4 months" (the format from the brief).
   * @param {number} months
   * @returns {string}
   */
  function fmtDuration(months) {
    if (months <= 0) return 'Already covered';
    const y = Math.floor(months / 12),
      m = months % 12;
    if (y > 99) return 'Over 99 years';
    return [y ? plural(y, 'year', 'years') : '', m ? plural(m, 'month', 'months') : '']
      .filter(Boolean)
      .join(' ');
  }

  /** True when the user has asked their OS for reduced motion. */
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Colours the part of a range slider left of its thumb: CSS draws the track
   * as a gradient that stops at --fill, and this keeps --fill in step with the
   * slider's value, min and max.
   * @param {HTMLInputElement} el
   */
  function paintRange(el) {
    const min = parseFloat(el.min) || 0;
    let max = parseFloat(el.max);
    const v = parseFloat(el.value) || 0;
    if (!isFinite(max)) max = 100;
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 100;
    el.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  }

  /**
   * Plays the leaving animation on a list item (.leaving), then calls `done`
   * (which removes it from the state and re-renders). Straight away with
   * reduced motion; a timer makes sure `done` runs even if no animation does.
   * @param {Element|null} el
   * @param {function} done
   */
  function leave(el, done) {
    let finished = false;
    // Calls `done` only once, whether the animation ends or the timer fires first.
    function finish() {
      if (!finished) {
        finished = true;
        done();
      }
    }
    if (!el || prefersReducedMotion()) {
      finish();
      return;
    }
    el.classList.add('leaving');
    el.addEventListener('animationend', finish);
    setTimeout(finish, 450);
  }

  /**
   * Animates a number from whatever it currently shows to `target`, so a
   * total ticks from 1,300 to 1,340 instead of restarting from zero on every
   * keystroke. The last value is remembered on the element itself.
   * @param {HTMLElement} el
   * @param {number} target
   * @param {function(number):string} format
   * @param {number} [duration=700] - milliseconds
   */
  function animateNumber(el, target, format, duration) {
    if (!isFinite(target)) target = 0;
    const from = typeof el._value === 'number' ? el._value : 0;
    el._value = target;
    if (from === target || prefersReducedMotion()) {
      el.textContent = format(target);
      return;
    }
    let start = null;
    duration = duration || 700;
    // One frame: the eased value for the time elapsed, until the target is reached.
    function tick(ts) {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      el.textContent = format(from + (target - from) * (1 - (1 - p) ** 3)); // ease-out cubic
      if (p < 1 && el._value === target) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ============================================================================
     DERIVED FIGURES
     The single source of every number shown on the page.
     ============================================================================ */

  /**
   * Hourly income = yearly income ÷ hours worked per year.
   * e.g. €1,500/month, 40 h/week, 52 weeks → 18,000 ÷ 2,080 = €8.65/hour.
   * @returns {number} 0 if the profile is incomplete
   */
  function hourlyIncome() {
    const p = state.profile;
    const hours = p.hoursPerWeek * p.weeksPerYear;
    return hours > 0 ? (p.monthlyIncome * 12) / hours : 0;
  }

  /** Hours in one working day: weekly hours spread over a 5-day week. */
  function workDayHours() {
    return state.profile.hoursPerWeek / 5;
  }

  /**
   * Converts a price into time.
   * @param {number} price
   * @returns {{hours:number, days:number}|null} null when no hourly rate is available
   */
  function timePrice(price) {
    const hi = hourlyIncome();
    if (hi <= 0) return null;
    const hours = price / hi;
    return { hours, days: hours / workDayHours() };
  }

  /** Total of all monthly expenses. */
  function monthlyCost() {
    return state.expenses.reduce((sum, e) => sum + e.monthly, 0);
  }

  /** Income minus expenses, per month (negative when spending more than earning). */
  function monthlySurplus() {
    return state.profile.monthlyIncome - monthlyCost();
  }

  /**
   * The target an expense is dragged to in What If, never above the expense
   * itself (the user may have lowered the expense since setting the target).
   * @param {object} e - expense
   * @returns {number}
   */
  function whatIfTarget(e) {
    const t = state.whatIfTargets[e.id];
    return t == null || t > e.monthly ? e.monthly : t;
  }

  /** Monthly savings used by the projection: the user's choice, or their surplus by default. */
  function projectionSavings() {
    const f = state.future.monthlySavings;
    return f == null ? Math.max(0, Math.round(monthlySurplus())) : f;
  }

  /* ============================================================================
     RENDER: PROFILE
     ============================================================================ */

  /** Updates the live hourly-income card under the profile form. */
  function renderHourlyPreview() {
    const p = state.profile,
      h = hourlyIncome();
    $('hourlyPreview').textContent = h > 0 ? `${fmtMoney(h, 2)} / hour` : '—';
    $('hourlyFormula').textContent =
      h > 0
        ? `${fmtMoney(p.monthlyIncome * 12)} ÷ ${fmtInt(p.hoursPerWeek * p.weeksPerYear)} hours a year`
        : '';
  }

  /* ============================================================================
     RENDER: YOUR LIFE COST
     ============================================================================ */

  /** Rebuilds the list of expense rows (only when an item is added or removed). */
  function renderExpenses() {
    $('expenseList').innerHTML =
      state.expenses
        .map(
          (e) =>
            `<div class="item-row">` +
            `<input type="text" class="item-name" value="${escapeHtml(e.name)}" data-id="${e.id}" maxlength="${BOUNDS.nameLength}" placeholder="Category name" aria-label="Category name">` +
            `<div class="item-amount-wrap">` +
            `<span class="curr" aria-hidden="true">${escapeHtml(cur())}</span>` +
            `<input type="number" class="item-amount" value="${e.monthly}" min="0" step="1" inputmode="decimal" data-id="${e.id}" aria-label="Monthly amount for ${escapeHtml(e.name || 'this category')}"></div>` +
            `<button class="item-remove" type="button" data-id="${e.id}" aria-label="Remove ${escapeHtml(e.name || 'category')}">×</button></div>`
        )
        .join('') || '<p class="list-empty">No categories yet. Add your first one below.</p>';
  }

  /** Monthly / yearly / daily / hourly cost of living. */
  function renderExpenseTotals() {
    const monthly = monthlyCost(),
      yearly = monthly * 12;
    const money0 = (v) => fmtMoney(v),
      money2 = (v) => fmtMoney(v, 2);
    animateNumber($('monthlyCostNum'), monthly, money0);
    animateNumber($('yearlyCostNum'), yearly, money0);
    animateNumber($('dailyCostNum'), yearly / 365, money2);
    animateNumber($('hourlyCostNum'), yearly / 365 / 24, money2);
  }

  /* ============================================================================
     RENDER: THE TIME PRICE
     ============================================================================ */

  /** The big dark readout that converts the typed price into hours, live. */
  function renderTimePriceReadout() {
    const name = $('tpName').value.trim();
    const price = num($('tpPrice').value, 0, BOUNDS.amount[1], 0);
    const tp = timePrice(price);
    $('tprPrice').textContent = (name ? `${name} — ` : '') + fmtMoney(price);
    animateNumber($('tprHours'), tp ? tp.hours : 0, fmt1, 400);
    $('tprDays').textContent = tp && price > 0 ? `${fmt1(tp.days)} working days` : '—';
    $('addPurchase').disabled = !(name && price > 0);
  }

  /** The saved shopping list: price → hours → working days, newest first. */
  function renderPurchases() {
    const list = $('purchaseList');
    if (state.purchases.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML =
      `<div class="purchase-head" aria-hidden="true">` +
      `<span>Item</span>` +
      `<span>Hours</span>` +
      `<span>Days</span>` +
      `<span></span></div>` +
      state.purchases
        .slice()
        .reverse()
        .map((p) => {
          const tp = timePrice(p.price);
          return (
            `<div class="purchase-row">` +
            `<span class="purchase-name">${escapeHtml(p.name)}<small>${fmtMoney(p.price)}</small></span>` +
            `<span class="purchase-metric">${tp ? `${fmt1(tp.hours)} hrs` : '—'}</span>` +
            `<span class="purchase-metric">${tp ? `${fmt1(tp.days)} days` : '—'}</span>` +
            `<button class="item-remove" type="button" data-id="${p.id}" aria-label="Remove ${escapeHtml(p.name)}">×</button></div>`
          );
        })
        .join('');
  }

  /* ============================================================================
     RENDER: DREAMS
     ============================================================================ */

  /**
   * Dream cards: price, hours and working days it represents, and — when a
   * monthly saving amount is set — how long it takes to afford.
   */
  function renderDreams() {
    const wrap = $('dreamsList');
    const save = state.dreamMonthlySavings;
    const input = $('dreamSavings');
    if (document.activeElement !== input) input.value = save || '';
    const surplus = monthlySurplus();
    $('dreamSavingsHint').textContent =
      surplus > 0
        ? `Your current surplus is ${fmtMoney(surplus)} a month (income minus expenses).`
        : 'Right now your expenses use up all of your income.';

    if (state.dreams.length === 0) {
      wrap.innerHTML = '<p class="list-empty">No dreams added yet. What are you working toward?</p>';
      return;
    }
    wrap.innerHTML = state.dreams
      .slice()
      .reverse()
      .map((d) => {
        const tp = timePrice(d.price);
        const months = save > 0 ? Math.ceil(d.price / save) : null;
        return (
          `<div class="dream-card">` +
          `<div class="dream-top">` +
          `<span class="dream-name">${escapeHtml(d.name)}</span>` +
          `<span class="dream-price">${fmtMoney(d.price)}</span></div>` +
          `<div class="dream-metrics">` +
          `<span>Hours of work<b>${tp ? fmtInt(tp.hours) : '—'}</b></span>` +
          `<span>Working days<b>${tp ? fmtInt(tp.days) : '—'}</b></span>` +
          `<span>Time to afford<b>${months ? fmtDuration(months) : 'Set a monthly amount'}</b></span>` +
          `<button class="item-remove" type="button" data-id="${d.id}" aria-label="Remove ${escapeHtml(d.name)}">×</button></div></div>`
        );
      })
      .join('');
  }

  /* ============================================================================
     RENDER: WHAT IF
     ============================================================================ */

  /** Rebuilds one slider per expense (only when the list of expenses changes). */
  function renderWhatIf() {
    const wrap = $('whatIfList');
    const items = state.expenses.filter((e) => e.monthly > 0);
    if (items.length === 0) {
      wrap.innerHTML = '<p class="list-empty">Add some expenses above first.</p>';
    } else {
      wrap.innerHTML = items
        .map((e) => {
          const label = e.name || 'Unnamed category';
          return (
            `<div class="whatif-row">` +
            `<div class="whatif-top">` +
            `<span class="whatif-name">${escapeHtml(label)}</span>` +
            `<span class="whatif-values" id="wif-${e.id}"></span></div>` +
            `<input type="range" class="whatif-slider" data-id="${e.id}" min="0" max="${e.monthly}" step="1" value="${whatIfTarget(e)}" aria-label="New monthly target for ${escapeHtml(label)}"></div>`
          );
        })
        .join('');
    }
    updateWhatIf();
  }

  /**
   * Updates the "€250 → €100" labels and the savings summary without
   * rebuilding the sliders — safe to call on every drag event.
   */
  function updateWhatIf() {
    let monthlySaved = 0;
    state.expenses.forEach((e) => {
      const t = whatIfTarget(e);
      monthlySaved += e.monthly - t;
      const label = $(`wif-${e.id}`);
      if (label) label.innerHTML = `${fmtMoney(e.monthly)} <span class="to">→ ${fmtMoney(t)}</span>`;
    });
    const yearly = monthlySaved * 12;
    const hi = hourlyIncome();
    const hours = hi > 0 ? yearly / hi : 0;
    $('wifMonthly').textContent = `${fmtMoney(monthlySaved)} / month`;
    $('wifYearly').textContent = `${fmtMoney(yearly)} a year`;
    $('wifHours').textContent = `${fmtInt(hours)} hours of work saved every year`;
    $('wifTenYear').textContent =
      monthlySaved > 0
        ? `Kept for 10 years: ${fmtMoney(yearly * 10)} — ${fmtInt(hours * 10)} hours of your life back.`
        : 'Move a slider to see what ten years of that change would give back.';
    Array.prototype.forEach.call(document.querySelectorAll('.whatif-slider'), paintRange);
  }

  /* ============================================================================
     RENDER: LIFESTYLE MODES
     ============================================================================ */

  /** Three cards (Minimal / Current / Luxury) computed from the user's own spending. */
  function renderLifestyle() {
    const current = monthlyCost(),
      hi = hourlyIncome();
    $('lifestyleSentence').innerHTML =
      `Your current lifestyle requires approximately <b>${fmtMoney(current * 12)}</b> a year.`;
    $('lifestyleGrid').innerHTML = LIFESTYLE_MODES.map((m) => {
      const monthly = current * m.factor,
        yearly = monthly * 12;
      const required = yearly / INCOME_MARGIN;
      return (
        `<div class="lifestyle-card${m.factor === 1 ? ' current' : ''}">` +
        `<div class="lifestyle-mode">${m.name} <small>· ${m.note}</small></div>` +
        `<div class="lifestyle-monthly">${fmtMoney(monthly)}<span> / mo</span></div>` +
        `<div class="lifestyle-detail">` +
        `<span>Yearly cost</span>` +
        `<b>${fmtMoney(yearly)}</b></div>` +
        `<div class="lifestyle-detail">` +
        `<span>Required income / yr</span>` +
        `<b>${fmtMoney(required)}</b></div>` +
        `<div class="lifestyle-detail">` +
        `<span>Hours of work / yr</span>` +
        `<b>${hi > 0 ? fmtInt(required / hi) : '—'}</b></div></div>`
      );
    }).join('');
  }

  /* ============================================================================
     RENDER: FINANCIAL FUTURE
     ============================================================================ */

  /**
   * The ages shown on the timeline: today, then the brief's milestones
   * (25, 30, 40, 50, 60…) that are still ahead. Someone aged 28 sees
   * 28 → 30 → 40 → 50 → 60 → 70.
   * @returns {number[]}
   */
  function timelineAges() {
    const age = state.profile.age;
    return [age].concat(TIMELINE_AGES.filter((a) => a > age)).slice(0, TIMELINE_POINTS);
  }

  /**
   * Runs the projection year by year, from today to the last timeline age.
   * Each year: spending grows by (1 + inflation) × (1 + lifestyle growth),
   * income by salary growth, and the monthly savings are added to the
   * savings balance (no interest — deliberately simple and transparent).
   *
   * @returns {{years:object[], milestones:object[], crossoverAge:(number|null)}}
   *   years: one entry per year with cumulative spent and saved;
   *   milestones: the entries at the timeline ages;
   *   crossoverAge: first age at which yearly spending exceeds yearly income.
   */
  function projectFuture() {
    const f = state.future,
      p = state.profile;
    const ages = timelineAges();
    const spendGrowth = (1 + f.inflation / 100) * (1 + f.expenseGrowth / 100);
    const incomeGrowth = 1 + f.salaryGrowth / 100;
    const yearlyCost = monthlyCost() * 12,
      yearlyIncome = p.monthlyIncome * 12;
    const yearlySave = projectionSavings() * 12;

    let spent = 0;
    let saved = p.savings;
    let crossoverAge = null;
    const years = [];
    const last = ages[ages.length - 1] - p.age;
    for (let y = 0; y <= last; y++) {
      years.push({ age: p.age + y, spent, saved });
      const cost = yearlyCost * spendGrowth ** y;
      const income = yearlyIncome * incomeGrowth ** y;
      if (crossoverAge === null && cost > income) crossoverAge = p.age + y;
      spent += cost;
      saved += yearlySave;
    }
    const milestones = ages.map((a) => years[a - p.age]);
    return { years, milestones, crossoverAge };
  }

  /** Compact money label for chart axes: €1.2M, €340k, €900. */
  function fmtShort(v) {
    if (v >= 1e6) return fmtMoney(v / 1e6, 1).replace(/(\.0)?( CHF)?$/, 'M$2');
    if (v >= 1e3) return fmtMoney(v / 1e3).replace(/( CHF)?$/, 'k$1');
    return fmtMoney(v);
  }

  /**
   * Draws the projection chart in SVG: two lines (spent, saved) over age,
   * with gridlines, axis labels and a dashed marker where spending would
   * overtake income. Colours come from CSS classes, not hardcoded values.
   * @param {object} proj - result of projectFuture()
   */
  function renderFutureChart(proj) {
    // The drawing is sized to the chart's real width on screen (not a fixed
    // 600 units scaled down), so axis labels stay legible on a phone.
    const svgEl = $('futureChart');
    const W = Math.round(Math.max(300, Math.min(760, svgEl.parentNode.clientWidth - 24 || 600)));
    const H = Math.round(Math.max(200, W * 0.4)),
      L = 54,
      R = 12,
      T = 12,
      B = 28;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ys = proj.years;
    const a0 = ys[0].age,
      a1 = ys[ys.length - 1].age;
    const yMax = Math.max(1, d3max(ys, 'spent'), d3max(ys, 'saved')) * 1.08;
    const x = (age) => L + (a1 === a0 ? 0 : (age - a0) / (a1 - a0)) * (W - L - R);
    const y = (v) => H - B - (v / yMax) * (H - T - B);
    const line = (key) => ys.map((p) => `${x(p.age).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

    let svg = '';
    for (let i = 0; i <= 4; i++) {
      // horizontal gridlines with value labels
      const v = (yMax / 4) * i;
      svg +=
        `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>` +
        `<text class="axis-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${escapeHtml(fmtShort(v))}</text>`;
    }
    let lastLabelX = -Infinity;
    proj.milestones.forEach((m) => {
      // age labels, skipping any that would overlap the previous one
      if (x(m.age) - lastLabelX < 24) return;
      lastLabelX = x(m.age);
      svg += `<text class="axis-label" x="${x(m.age)}" y="${H - 8}" text-anchor="middle">${m.age}</text>`;
    });
    if (proj.crossoverAge !== null && proj.crossoverAge > a0) {
      svg += `<line class="crossover-line" x1="${x(proj.crossoverAge)}" x2="${x(proj.crossoverAge)}" y1="${T}" y2="${H - B}"/>`;
    }
    svg +=
      `<polygon class="area-spent" points="${x(a0)},${y(0)} ${line('spent')} ${x(a1)},${y(0)}"/>` +
      `<polyline class="line-spent" points="${line('spent')}"/>` +
      `<polyline class="line-saved" points="${line('saved')}"/>`;
    proj.milestones.forEach((m) => {
      svg +=
        `<circle class="dot-spent" cx="${x(m.age)}" cy="${y(m.spent)}" r="4"/>` +
        `<circle class="dot-saved" cx="${x(m.age)}" cy="${y(m.saved)}" r="3.5"/>`;
    });
    svgEl.innerHTML = svg;
  }

  /** Largest value of `key` in a list of objects. */
  function d3max(list, key) {
    return list.reduce((m, o) => Math.max(m, o[key]), 0);
  }

  /** Sliders, chart, milestone cells and the plain-language summary under the chart. */
  function renderFuture() {
    const f = state.future;
    const save = projectionSavings();
    $('fInflationVal').textContent = `${f.inflation}%`;
    $('fSalaryGrowthVal').textContent = `${f.salaryGrowth}%`;
    $('fExpenseGrowthVal').textContent = `${f.expenseGrowth}%`;
    $('fMonthlySavingsVal').textContent =
      fmtMoney(save) + (f.monthlySavings == null ? ' (your surplus)' : '');
    const slider = $('fMonthlySavings');
    slider.max = Math.max(3000, Math.ceil(state.profile.monthlyIncome / 100) * 100, save);
    if (document.activeElement !== slider) slider.value = save;
    ['fInflation', 'fSalaryGrowth', 'fExpenseGrowth'].forEach((id) => {
      const el = $(id);
      if (document.activeElement !== el)
        el.value =
          f[{ fInflation: 'inflation', fSalaryGrowth: 'salaryGrowth', fExpenseGrowth: 'expenseGrowth' }[id]];
    });
    ['fInflation', 'fSalaryGrowth', 'fExpenseGrowth', 'fMonthlySavings'].forEach((id) => {
      paintRange($(id));
    });

    const proj = projectFuture();
    renderFutureChart(proj);
    $('milestoneTable').innerHTML = proj.milestones
      .map(
        (m, i) =>
          `<div class="milestone-cell">` +
          `<div class="milestone-age">${i === 0 ? 'TODAY · ' : 'AGE '}${m.age}</div>` +
          `<div class="milestone-val" title="Spent so far">${fmtShort(m.spent)}</div>` +
          `<div class="milestone-val saved" title="Saved so far">${fmtShort(m.saved)} saved</div></div>`
      )
      .join('');

    const end = proj.milestones[proj.milestones.length - 1];
    const note = $('futureNote');
    if (proj.crossoverAge !== null) {
      note.className = 'future-note';
      note.textContent =
        proj.crossoverAge === state.profile.age
          ? 'Right now your expenses are higher than your income.'
          : `At these rates, your yearly expenses would overtake your income around age ${proj.crossoverAge}.`;
    } else {
      note.className = 'future-note good';
      note.textContent = `By ${end.age}, this lifestyle would have cost about ${fmtMoney(end.spent)}, and your income stays ahead of your expenses the whole way.`;
    }
  }

  /* ============================================================================
     RENDER: WORTH SCORE
     ============================================================================ */

  /** Clamps a number to the 0–1 range. */
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * The WORTH score (0–100), from three factors, each scored 0–100:
   *  - Savings rate (55%): share of income left after expenses; 100 = saving it all.
   *  - Emergency runway (25%): savings ÷ 6 months of expenses; 100 = six months covered.
   *  - Income / cost ratio (20%): (income ÷ expenses) − 1; 100 = earning twice what you spend.
   * Weights favour the habit (saving) over the stock (savings) on purpose:
   * the app is about how you trade time for money every month.
   */
  function renderScore() {
    const income = state.profile.monthlyIncome,
      cost = monthlyCost(),
      savings = state.profile.savings;
    const factors = [
      {
        label: 'Savings rate',
        weight: 0.55,
        val: income > 0 ? clamp01((income - cost) / income) * 100 : 0,
        hint:
          income > 0
            ? `${fmtInt(Math.max(0, ((income - cost) / income) * 100))}% of your income is left after expenses.`
            : 'Add an income to calculate this.'
      },
      {
        label: 'Emergency runway',
        weight: 0.25,
        val: cost > 0 ? clamp01(savings / (cost * 6)) * 100 : savings > 0 ? 100 : 0,
        hint:
          cost > 0
            ? `Your savings cover ${fmt1(savings / cost)} months of expenses (target: 6).`
            : 'No expenses entered.'
      },
      {
        label: 'Income / cost ratio',
        weight: 0.2,
        val: cost > 0 ? clamp01(income / cost - 1) * 100 : income > 0 ? 100 : 0,
        hint:
          cost > 0
            ? `You earn ${(income / cost).toFixed(2)}× what you spend (100 points at 2×).`
            : 'No expenses entered.'
      }
    ];
    const score = Math.round(factors.reduce((s, f) => s + f.val * f.weight, 0));
    animateNumber($('scoreNum'), score, fmtInt, 1000);

    const wrap = $('scoreFactors');
    const oldWidths = Array.prototype.map.call(
      wrap.querySelectorAll('.score-bar-fill'),
      (el) => el.style.width
    );
    wrap.innerHTML = factors
      .map(
        (f, i) =>
          `<div>` +
          `<div class="score-factor-label">` +
          `<span>${f.label} <small>· ${Math.round(f.weight * 100)}%</small></span>` +
          `<b>${Math.round(f.val)}</b></div>` +
          `<div class="score-bar-track">` +
          `<div class="score-bar-fill" style="width:${oldWidths[i] || '0%'}"></div></div>` +
          `<div class="score-factor-hint">${escapeHtml(f.hint)}</div></div>`
      )
      .join('');
    const fills = wrap.querySelectorAll('.score-bar-fill');
    requestAnimationFrame(() => {
      Array.prototype.forEach.call(fills, (el, i) => {
        el.style.width = `${factors[i].val}%`;
      });
    });
  }

  /* ============================================================================
     RENDER: THE BIG NUMBER
     ============================================================================ */

  /** The closing screen: monthly cost, yearly cost, and the hours of work it takes. */
  function renderFinale() {
    const monthly = monthlyCost(),
      yearly = monthly * 12,
      hi = hourlyIncome();
    animateNumber($('finaleMonthly'), monthly, (v) => fmtMoney(v), 900);
    $('finaleYearly').textContent = `${fmtMoney(yearly)} / year`;
    $('finaleHours').textContent = hi > 0 ? `${fmtInt(yearly / hi)} hours of work / year` : '';
  }

  /* ============================================================================
     FLOW
     ============================================================================ */

  const RESULT_SECTIONS = [
    'lifeCost',
    'timePrice',
    'dreams',
    'whatIf',
    'lifestyle',
    'future',
    'worthScore',
    'finale'
  ];

  /** Every section that depends on totals — called whenever a number changes. */
  function renderDependents() {
    renderHourlyPreview();
    renderExpenseTotals();
    renderTimePriceReadout();
    renderPurchases();
    renderDreams();
    updateWhatIf();
    renderLifestyle();
    renderFuture();
    renderScore();
    renderFinale();
  }

  /** Full render, including lists whose structure may have changed. */
  function renderAll() {
    renderExpenses();
    renderWhatIf();
    renderDependents();
  }

  /**
   * Shows the result sections (hidden until the profile is submitted once).
   * @param {boolean} scroll - scroll to the first result
   */
  function revealResults(scroll) {
    renderAll();
    RESULT_SECTIONS.forEach((id) => {
      $(id).hidden = false;
    });
    revealed = true;
    setupReveal();
    if (scroll)
      $('lifeCost').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /** The profile fields and their bounds, in one place for reading and validation. */
  const PROFILE_FIELDS = [
    { id: 'ageInput', key: 'age', bounds: BOUNDS.age, int: true },
    { id: 'incomeInput', key: 'monthlyIncome', bounds: BOUNDS.income },
    { id: 'savingsInput', key: 'savings', bounds: BOUNDS.savings },
    { id: 'hoursWeekInput', key: 'hoursPerWeek', bounds: BOUNDS.hoursPerWeek },
    { id: 'weeksYearInput', key: 'weeksPerYear', bounds: BOUNDS.weeksPerYear }
  ];

  /**
   * Reads the profile form into state. Values out of range are flagged on
   * the field (aria-invalid) and clamped for the maths, so a half-typed
   * number never produces nonsense elsewhere on the page.
   * @returns {string|null} an error message for the first invalid field, or null
   */
  function readProfile() {
    let error = null;
    state.profile.currency =
      CURRENCIES.indexOf($('currencySelect').value) !== -1 ? $('currencySelect').value : '€';
    PROFILE_FIELDS.forEach((f) => {
      const el = $(f.id),
        raw = parseFloat(el.value);
      const bad =
        !isFinite(raw) || raw < f.bounds[0] || raw > f.bounds[1] || (f.key === 'monthlyIncome' && raw <= 0);
      el.setAttribute('aria-invalid', String(bad));
      if (bad && !error) {
        error =
          f.key === 'monthlyIncome'
            ? 'Enter a monthly income greater than zero.'
            : `Enter a value between ${f.bounds[0]} and ${fmtInt(f.bounds[1])} for “${el.labels[0].textContent}”.`;
      }
      const v = num(raw, f.bounds[0], f.bounds[1], state.profile[f.key]);
      state.profile[f.key] = f.int ? Math.round(v) : v;
    });
    return error;
  }

  /** "Show my worth": validate, save, reveal the results. */
  function handleCalc() {
    const error = readProfile();
    const box = $('profileError');
    if (error) {
      box.textContent = error;
      box.hidden = false;
      return;
    }
    box.hidden = true;
    saveState();
    revealResults(true);
  }

  /* ============================================================================
     EVENTS
     One delegated listener per list: rows are rebuilt from state, so
     listening on the stable container avoids re-attaching handlers.
     ============================================================================ */

  /** Finds the item with `id` in one of the state lists. */
  function findItem(list, id) {
    return list.filter((x) => x.id === id)[0];
  }

  /**
   * Adds an item from a name + price pair of inputs (Time Price and Dreams).
   * @param {string} nameId
   * @param {string} priceId
   * @param {object[]} list - state list to add to
   * @param {string} prefix - id prefix
   * @returns {boolean} true if something was added
   */
  function addFromInputs(nameId, priceId, list, prefix) {
    const name = cleanName($(nameId).value.trim());
    const price = num($(priceId).value, 0, BOUNDS.amount[1], 0);
    if (!name || price <= 0 || list.length >= BOUNDS.listLength) return false;
    list.push({ id: uid(prefix), name, price });
    $(nameId).value = '';
    $(priceId).value = '';
    $(nameId).focus();
    saveState();
    return true;
  }

  /** Wires every control on the page to state changes and re-renders. Called once at start-up. */
  function bindEvents() {
    $('ctaStart').addEventListener('click', () => {
      $('profile').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => {
        $('incomeInput').focus({ preventScroll: true });
      }, 600);
    });
    $('ctaCalc').addEventListener('click', handleCalc);

    // Profile: live hourly preview while typing; full update once results are visible.
    ['ageInput', 'currencySelect', 'incomeInput', 'savingsInput', 'hoursWeekInput', 'weeksYearInput'].forEach(
      (id) => {
        $(id).addEventListener('input', () => {
          readProfile();
          renderHourlyPreview();
          if (!revealed) return;
          saveState();
          if (id === 'currencySelect') renderExpenses(); // the currency symbol lives inside each row
          renderDependents();
        });
      }
    );

    // Expenses: typing updates totals only; adding/removing rebuilds the list.
    $('expenseList').addEventListener('input', (e) => {
      const item = findItem(state.expenses, e.target.dataset.id);
      if (!item) return;
      if (e.target.classList.contains('item-name')) item.name = cleanName(e.target.value);
      else item.monthly = num(e.target.value, BOUNDS.amount[0], BOUNDS.amount[1], 0);
      saveState();
      renderDependents();
    });
    $('expenseList').addEventListener('change', (e) => {
      // When the user leaves an amount field, show the cleaned value and refresh the sliders.
      const item = findItem(state.expenses, e.target.dataset.id);
      if (!item) return;
      if (e.target.classList.contains('item-amount')) e.target.value = item.monthly;
      renderWhatIf();
    });
    $('expenseList').addEventListener('click', (e) => {
      const btn = e.target.closest('.item-remove');
      if (!btn) return;
      const id = btn.dataset.id;
      leave(btn.closest('.item-row'), () => {
        state.expenses = state.expenses.filter((x) => x.id !== id);
        delete state.whatIfTargets[id];
        saveState();
        renderAll();
      });
    });
    $('addExpense').addEventListener('click', () => {
      if (state.expenses.length >= BOUNDS.listLength) return;
      state.expenses.push({ id: uid('e'), name: '', monthly: 0 });
      saveState();
      renderExpenses();
      const rows = document.querySelectorAll('#expenseList .item-row');
      if (rows.length) rows[rows.length - 1].classList.add('enter');
      const names = document.querySelectorAll('#expenseList .item-name');
      if (names.length) names[names.length - 1].focus();
    });

    // Time price
    ['tpName', 'tpPrice'].forEach((id) => {
      $(id).addEventListener('input', renderTimePriceReadout);
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (id === 'tpName') $('tpPrice').focus();
        else $('addPurchase').click();
      });
    });
    $('addPurchase').addEventListener('click', () => {
      if (addFromInputs('tpName', 'tpPrice', state.purchases, 'p')) {
        renderPurchases();
        renderTimePriceReadout();
        const first = document.querySelector('#purchaseList .purchase-row'); // newest first
        if (first) first.classList.add('enter');
      }
    });
    $('purchaseList').addEventListener('click', (e) => {
      const btn = e.target.closest('.item-remove');
      if (!btn) return;
      const id = btn.dataset.id;
      leave(btn.closest('.purchase-row'), () => {
        state.purchases = state.purchases.filter((x) => x.id !== id);
        saveState();
        renderPurchases();
      });
    });

    // Dreams
    function updateDreamButton() {
      $('addDream').disabled = !(
        $('dreamName').value.trim() && num($('dreamPrice').value, 0, BOUNDS.amount[1], 0) > 0
      );
    }
    ['dreamName', 'dreamPrice'].forEach((id) => {
      $(id).addEventListener('input', updateDreamButton);
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (id === 'dreamName') $('dreamPrice').focus();
        else $('addDream').click();
      });
    });
    $('addDream').addEventListener('click', () => {
      if (addFromInputs('dreamName', 'dreamPrice', state.dreams, 'd')) {
        renderDreams();
        updateDreamButton();
        const first = document.querySelector('#dreamsList .dream-card'); // newest first
        if (first) first.classList.add('enter');
      }
    });
    $('dreamSavings').addEventListener('input', (e) => {
      state.dreamMonthlySavings = num(e.target.value, 0, BOUNDS.amount[1], 0);
      saveState();
      renderDreams();
    });
    $('dreamsList').addEventListener('click', (e) => {
      const btn = e.target.closest('.item-remove');
      if (!btn) return;
      const id = btn.dataset.id;
      leave(btn.closest('.dream-card'), () => {
        state.dreams = state.dreams.filter((x) => x.id !== id);
        saveState();
        renderDreams();
      });
    });

    // What if: dragging updates numbers only — the slider itself is never rebuilt mid-drag.
    $('whatIfList').addEventListener('input', (e) => {
      if (!e.target.classList.contains('whatif-slider')) return;
      state.whatIfTargets[e.target.dataset.id] = num(e.target.value, 0, BOUNDS.amount[1], 0);
      saveState();
      updateWhatIf();
    });
    $('whatIfReset').addEventListener('click', () => {
      state.whatIfTargets = {};
      saveState();
      renderWhatIf();
    });

    // Financial future sliders
    $('future').addEventListener('input', (e) => {
      const f = state.future,
        v = parseFloat(e.target.value);
      switch (e.target.id) {
        case 'fInflation':
          f.inflation = num(v, 0, 10, 3);
          break;
        case 'fSalaryGrowth':
          f.salaryGrowth = num(v, 0, 10, 3);
          break;
        case 'fExpenseGrowth':
          f.expenseGrowth = num(v, 0, 10, 2);
          break;
        case 'fMonthlySavings':
          f.monthlySavings = num(v, 0, BOUNDS.amount[1], 0);
          break;
        default:
          return;
      }
      saveState();
      renderFuture();
    });

    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Erase all your WORTH data? This can’t be undone.')) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* storage unavailable: nothing to erase */
      }
      location.reload();
    });
  }

  /** Thin bar at the top of the screen showing how far down the page you are. */
  function setupScrollProgress() {
    const bar = $('progressBar');
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          // at most one layout read per frame
          const max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  /** Cards that a warm light follows across (see "Card stock" and "Ink panels" in the stylesheet). */
  const LIGHT_SELECTOR =
    '.hourly-preview, .stat-card, .item-row, .purchase-row, .dream-card, .whatif-row, .lifestyle-card, .chart-wrap, .future-note, .time-price-readout, .whatif-summary';
  /** Cards that also lean towards the mouse in 3D. */
  const TILT_SELECTOR = '.time-price-readout';
  /** Buttons that lean a few pixels towards the cursor. */
  const MAGNET_SELECTOR = '.btn-primary';

  /**
   * Pointer effects, for mouse users only. One listener for the page writes the
   * pointer position into CSS variables on the element under it: --px / --py (the
   * light on a card), --rx / --ry (a slight tilt), --mx / --my (a button's pull).
   * Tilt and pull are skipped when reduced motion is on.
   */
  function setupPointerEffects() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const still = prefersReducedMotion();
    let last = null,
      queued = false,
      tilted = null,
      pulled = null;

    // Drops a pair of CSS variables, so the element eases back to rest.
    function clear(el, a, b) {
      if (el) {
        el.style.removeProperty(a);
        el.style.removeProperty(b);
      }
    }

    // Once per frame: light, tilt and pull for whatever is under the pointer now.
    function apply() {
      queued = false;
      const t = last.target && last.target.closest ? last.target : null;
      const x = last.clientX,
        y = last.clientY;
      const lit = t && t.closest(LIGHT_SELECTOR);
      if (lit) {
        const r = lit.getBoundingClientRect();
        lit.style.setProperty('--px', `${x - r.left}px`);
        lit.style.setProperty('--py', `${y - r.top}px`);
      }
      if (still) return;
      const tilt = t && t.closest(TILT_SELECTOR);
      if (tilted !== tilt) clear(tilted, '--rx', '--ry');
      tilted = tilt;
      if (tilt) {
        const b = tilt.getBoundingClientRect();
        tilt.style.setProperty('--rx', `${(((y - b.top) / b.height - 0.5) * -5).toFixed(2)}deg`);
        tilt.style.setProperty('--ry', `${(((x - b.left) / b.width - 0.5) * 6).toFixed(2)}deg`);
      }
      let btn = t && t.closest(MAGNET_SELECTOR);
      if (btn && btn.disabled) btn = null;
      if (pulled !== btn) clear(pulled, '--mx', '--my');
      pulled = btn;
      if (btn) {
        const c = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${(((x - c.left) / c.width - 0.5) * 8).toFixed(1)}px`);
        btn.style.setProperty('--my', `${(((y - c.top) / c.height - 0.5) * 6).toFixed(1)}px`);
      }
    }

    document.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        last = e;
        if (!queued) {
          queued = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true }
    );
    // The pointer left the window: let everything settle back.
    document.documentElement.addEventListener('mouseleave', () => {
      clear(tilted, '--rx', '--ry');
      clear(pulled, '--mx', '--my');
      tilted = pulled = null;
    });
  }

  /** Fades sections in as they scroll into view; shows everything at once on browsers without IntersectionObserver. */
  function setupReveal() {
    const els = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, (el) => {
        el.classList.add('is-visible');
      });
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('is-visible');
            obs.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    Array.prototype.forEach.call(els, (el) => {
      obs.observe(el);
    });
  }

  /* ============================================================================
     INIT
     ============================================================================ */

  /**
   * Start-up: fill the profile form from saved state, wire the events and,
   * for returning visitors, show their results straight away.
   */
  function init() {
    const p = state.profile;
    $('ageInput').value = p.age;
    $('currencySelect').value = p.currency;
    $('incomeInput').value = p.monthlyIncome;
    $('savingsInput').value = p.savings;
    $('hoursWeekInput').value = p.hoursPerWeek;
    $('weeksYearInput').value = p.weeksPerYear;
    renderHourlyPreview();
    bindEvents();
    setupScrollProgress();
    setupPointerEffects();
    // Redraw the chart at the new width when the screen rotates or the window is resized.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (revealed) renderFuture();
      }, 150);
    });
    if (hasSavedData()) revealResults(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/*
   Service worker: makes the app installable and lets it open offline once
   visited. Only registered over http(s) — browsers don't allow service
   workers on file:// pages, where the app still works normally.
*/
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      /* offline mode unavailable; the app still works online */
    });
  });
}
