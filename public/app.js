(() => {
  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  const DEFAULT_APR = 24;
  const DEBT_TYPES = ['Credit card', 'Auto loan', 'Student loans', 'Other'];
  const EXAMPLE = {
    pay: 2400, freq: 'biweekly',
    bills: 2300,
    debts: [
      { name: 'Credit card', bal: 6200, apr: 24 },
      { name: 'Auto loan', bal: 14500, apr: 7.4 },
      { name: 'Student loans', bal: 18000, apr: 5.5 }
    ],
    months: 36, investOn: true, invest: 300, saveOn: true, save: 200, goal: 5000, step: 1, reveal: 2
  };
  const BLANK = {
    pay: 0, freq: 'biweekly', bills: 0,
    debts: [{ name: 'Credit card', bal: 0, apr: DEFAULT_APR }],
    months: 36, investOn: false, invest: 200, saveOn: false, save: 200, goal: 5000, step: 1, reveal: 0
  };
  const levelFor = st => num(st.pay) > 0 ? (num(st.bills) > 0 ? 2 : 1) : 0;
  const KEY = 'paycheck-payoff-planner-v1';
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { S = null; }
  if (!S || !Array.isArray(S.debts)) S = structuredClone(BLANK);
  if (Array.isArray(S.bills)) S.bills = S.bills.reduce((a, b) => a + (parseFloat(b.amt) || 0), 0);
  // Older saves stored free-text debt names and could hold a blank 0% APR; normalize both
  S.debts.forEach(d => {
    if (!num(d.apr)) d.apr = DEFAULT_APR;
    if (DEBT_TYPES.includes(d.name)) return;
    const n = String(d.name || '').toLowerCase();
    d.name = !n || /card/.test(n) ? 'Credit card' : /car|auto/.test(n) ? 'Auto loan' : /student/.test(n) ? 'Student loans' : 'Other';
  });
  if (typeof S.reveal !== 'number') S.reveal = levelFor(S);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = (n, cents) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  // Paychecks counted per month: pay × this number = monthly income
  const FREQ = { weekly: 4, biweekly: 2, monthly: 1 };
  if (!FREQ[S.freq]) S.freq = 'biweekly';
  if (S.months > 60) S.months = 60;
  if (S.save === undefined) Object.assign(S, { saveOn: false, save: 200, goal: 5000 });
  const START = new Date();
  const monthLabel = m => { const d = new Date(START.getFullYear(), START.getMonth() + m, 1); return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
  const span = m => { const y = Math.floor(m / 12), r = m % 12; return [y && `${y} year${y > 1 ? 's' : ''}`, r && `${r} month${r > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 months'; };

  /* ---------- Math ---------- */
  const CAP = 600; // 50 years
  // Minimum payment estimate: this month's interest + 1% of the balance, at least $25 (common card formula)
  const minPay = (bal, apr) => bal <= 0 ? 0 : Math.min(bal * (1 + apr / 1200), Math.max(25, bal * apr / 1200 + bal * 0.01));
  const firstMins = debts => debts.reduce((a, d) => a + minPay(d.bal, d.apr), 0);
  function simulate(debts, payment) {
    const bals = debts.map(d => d.bal);
    const order = debts.map((d, i) => i).sort((a, b) => debts[b].apr - debts[a].apr);
    const cum = [0], remain = [bals.reduce((a, b) => a + b, 0)];
    let m = 0, total = remain[0];
    while (m < CAP && total > 0.005) {
      m++;
      let interest = 0;
      const mins = debts.map((d, i) => minPay(bals[i], d.apr));
      debts.forEach((d, i) => { if (bals[i] > 0) { const it = bals[i] * d.apr / 1200; bals[i] += it; interest += it; } });
      if (payment == null) {
        debts.forEach((d, i) => { bals[i] -= Math.min(mins[i], bals[i]); });
      } else {
        let budget = payment;
        debts.forEach((d, i) => { const p = Math.min(mins[i], bals[i], budget); bals[i] -= p; budget -= p; });
        for (const i of order) { if (budget <= 0) break; const p = Math.min(bals[i], budget); bals[i] -= p; budget -= p; }
      }
      total = bals.reduce((a, b) => a + Math.max(b, 0), 0);
      cum.push(cum[m - 1] + interest); remain.push(total);
    }
    return { cum, remain, months: m, paid: total <= 0.005 };
  }
  const at = (arr, k) => arr[Math.min(k, arr.length - 1)];

  function solvePayment(debts, months) {
    const sumMin = firstMins(debts);
    const lowSim = simulate(debts, sumMin);
    if (lowSim.paid && lowSim.months <= months) return sumMin;
    const total = debts.reduce((a, d) => a + d.bal, 0);
    const r = Math.max(...debts.map(d => d.apr)) / 1200;
    let hi = r > 0 ? total * r / (1 - Math.pow(1 + r, -months)) + 1 : total / months + 1;
    hi = Math.max(hi, sumMin);
    let lo = sumMin;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2, s = simulate(debts, mid);
      if (s.paid && s.months <= months) hi = mid; else lo = mid;
    }
    return Math.ceil(hi * 100) / 100;
  }
  const fv = (c, k) => { const r = 0.06 / 12; return c * (Math.pow(1 + r, k) - 1) / r; };
  // High-yield savings: 3.5% APY, credited monthly
  const SAVE_R = Math.pow(1.035, 1 / 12) - 1;
  const fvSave = (c, k) => c * (Math.pow(1 + SAVE_R, k) - 1) / SAVE_R;
  const monthsToGoal = (c, goal) => { if (goal <= 0) return 0; if (c <= 0) return Infinity; let b = 0, m = 0; while (b < goal && m < 1200) { b = b * (1 + SAVE_R) + c; m++; } return b >= goal ? m : Infinity; };

  /* ---------- Lists ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function renderDebts() {
    $('debts').innerHTML = S.debts.map((d, i) => `
      <div class="row debt">
        <div class="cell c-name"><label for="dn${i}">Type</label><select id="dn${i}" data-l="debts" data-i="${i}" data-k="name">${DEBT_TYPES.map(t => `<option${t === d.name ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="cell c-bal"><label for="db${i}">Balance $</label><input id="db${i}" type="number" inputmode="decimal" min="0" data-l="debts" data-i="${i}" data-k="bal" value="${d.bal || ''}" placeholder="e.g. 6200"></div>
        <div class="cell c-apr"><label for="dr${i}">APR %</label><input id="dr${i}" type="number" inputmode="decimal" min="0" step="0.1" data-l="debts" data-i="${i}" data-k="apr" value="${d.apr}" placeholder="24"></div>
        <button class="x" type="button" data-rm="debts" data-i="${i}" aria-label="Remove ${esc(d.name || 'debt')}">×</button>
      </div>`).join('') || '<div class="empty">No debts. Add one to see your interest savings.</div>';
  }
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.l) return;
    const item = S[t.dataset.l][+t.dataset.i];
    item[t.dataset.k] = t.dataset.k === 'name' ? t.value : num(t.value);
    compute();
  });
  // An APR box left empty goes back to the 24% default
  document.addEventListener('focusout', e => {
    const t = e.target;
    if (t.dataset.k !== 'apr' || t.value.trim() !== '') return;
    S.debts[+t.dataset.i].apr = DEFAULT_APR; t.value = DEFAULT_APR; compute();
  });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-rm]');
    if (!t) return;
    S[t.dataset.rm].splice(+t.dataset.i, 1);
    renderDebts();
    compute();
  });
  $('addDebt').onclick = () => { S.debts.push({ name: 'Credit card', bal: 0, apr: DEFAULT_APR }); renderDebts(); $('db' + (S.debts.length - 1)).focus(); compute(); };

  /* ---------- Paired input + slider ---------- */
  function fill(r) { const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
  function pair(inputId, rangeId, key, clampMax, snaps) {
    const inp = $(inputId), rng = $(rangeId);
    const sync = () => { inp.value = S[key] || (key === 'months' ? 3 : ''); rng.value = Math.min(S[key], +rng.max); fill(rng); };
    inp.addEventListener('input', () => {
      let v = num(inp.value);
      if (clampMax) v = Math.min(Math.max(Math.round(v), +rng.min), +rng.max);
      S[key] = v; if (key === 'pay' && v > 0) $('err1').hidden = true; rng.value = Math.min(v, +rng.max); fill(rng); compute();
    });
    inp.addEventListener('blur', () => { sync(); checkReveal(true); });
    let lastSnap = null, snapTimer;
    rng.addEventListener('input', () => {
      // Magnetic pull: within 1 step of a marker, land on the marker
      if (snaps) {
        const v = +rng.value, m = snaps.find(s => Math.abs(s - v) <= 1);
        if (m !== undefined && v !== m) rng.value = m;
        if (m !== undefined && m !== lastSnap) {
          rng.classList.add('snapped'); clearTimeout(snapTimer);
          snapTimer = setTimeout(() => rng.classList.remove('snapped'), 180);
          if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
        }
        lastSnap = m ?? null;
      }
      S[key] = +rng.value; inp.value = rng.value; fill(rng); compute();
    });
    return sync;
  }
  const syncPay = pair('pay', 'payR', 'pay');
  const syncBills = pair('bills', 'billsR', 'bills');
  const MONTH_MARKS = [6, 12, 18, 24, 36, 48, 60];
  const MARK_LABEL = { 6: '6m', 12: '1y', 18: '18m', 24: '2y', 36: '3y', 48: '4y', 60: '5y' };
  $('monthTicks').innerHTML = MONTH_MARKS.map(m =>
    `<button type="button" class="tick" data-m="${m}" style="--t:${(m - 3) / 57}" aria-label="${span(m)}">${MARK_LABEL[m] || ''}</button>`).join('');
  $('monthTicks').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const r = $('monthsR'); r.value = b.dataset.m; r.dispatchEvent(new Event('input'));
  });
  const syncMonths = pair('months', 'monthsR', 'months', true, MONTH_MARKS);
  const syncInvest = pair('invest', 'investR', 'invest');
  const syncSave = pair('save', 'saveR', 'save');
  const syncGoal = pair('goal', 'goalR', 'goal');

  function setFreq() { document.querySelectorAll('#freq .pill').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === S.freq)); }
  $('freq').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; S.freq = b.dataset.f; setFreq(); compute(); });

  function setInvestOn() { $('investOn').setAttribute('aria-checked', S.investOn); $('investBody').hidden = !S.investOn; }
  $('investOn').onclick = () => { S.investOn = !S.investOn; setInvestOn(); compute(); };
  function setSaveOn() { $('saveOn').setAttribute('aria-checked', S.saveOn); $('saveBody').hidden = !S.saveOn; }
  $('saveOn').onclick = () => { S.saveOn = !S.saveOn; setSaveOn(); compute(); };


  $('reset').onclick = () => { S = Object.assign(structuredClone(BLANK), { emailDone: S.emailDone }); init(); maxStep = 1; goTo(1, true); $('pay').focus(); };
  $('example').onclick = () => { S = Object.assign(structuredClone(EXAMPLE), { emailDone: S.emailDone }); init(); maxStep = 1; goTo(1, true); };

  /* ---------- Email wall ---------- */
  // The server (server.js) forwards the email to Kit, so the form ID and the developer code stay out of this file.
  function setGate(on) {
    $('page3').classList.toggle('gated', on);
    $('page3').inert = on;
    $('wall').hidden = !on;
  }
  function unlock(remember) {
    if (remember) { S.emailDone = true; save(); }
    setGate(false);
    $('h3p').focus({ preventScroll: true });
    playIntro();
  }
  $('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('gateEmail').value.trim(), err = $('gateErr'), btn = $('gateBtn');
    const fail = msg => { err.textContent = msg; err.hidden = false; $('gateEmail').focus(); };
    if (!email) return fail('Enter your email address.');
    err.hidden = true; btn.disabled = true; btn.textContent = 'Unlocking…';
    let res = null, data = {};
    try {
      res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10000)
      });
      data = await res.json().catch(() => ({}));
    } catch (x) { /* network error or timeout: handled below */ }
    btn.disabled = false; btn.textContent = 'Show my numbers';
    // 400 = the email was rejected; show why and let them fix it
    if (res && res.status === 400) return fail(data.error || 'Enter a valid email address, like name@example.com.');
    // Developer code: open the results without remembering the unlock
    if (data.dev) { $('gateEmail').value = ''; return unlock(false); }
    // Success, or Kit/server unreachable: show the results rather than trapping the visitor
    unlock(true);
  });

  /* ---------- Pages ---------- */
  let maxStep = 1;
  function canLeave1() { const ok = num(S.pay) > 0; $('err1').hidden = ok; return ok; }
  function paintStepper() {
    document.querySelectorAll('.stepper button').forEach(b => {
      const n = +b.dataset.go;
      b.classList.toggle('done', n < S.step);
      if (n === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.disabled = n > maxStep;
    });
  }
  function goTo(n, focus) {
    if (n > 1 && S.step === 1 && !canLeave1()) return;
    const from = S.step || 1;
    S.step = n; maxStep = Math.max(maxStep, n);
    [1, 2, 3].forEach(i => {
      const pg = $('page' + i);
      pg.hidden = i !== n;
      pg.classList.remove('enter-fwd', 'enter-back');
    });
    const pg = $('page' + n);
    if (n !== from) { void pg.offsetWidth; pg.classList.add(n > from ? 'enter-fwd' : 'enter-back'); }
    if (n === 3 && !S.emailDone) { stopIntro(); compute(); setGate(true); }
    else { setGate(false); if (n === 3) playIntro(); else stopIntro(); }
    paintStepper(); save();
    if (focus) { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); $('h' + n + 'p').focus({ preventScroll: true }); }
    if (!$('wall').hidden) $('gateEmail').focus({ preventScroll: true });
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) goTo(+b.dataset.go, true); });
  // Enter in any field moves to the next page
  /* ---------- Progressive reveal (page 1) ---------- */
  let revealTimer;
  function paintReveal() {
    document.querySelectorAll('.reveal').forEach(el => {
      const locked = +el.dataset.level > S.reveal;
      el.classList.toggle('locked', locked);
      el.inert = locked;
      el.setAttribute('aria-hidden', locked);
    });
    $('pay').closest('.bubble').classList.toggle('attn', S.reveal === 0 && !num(S.pay));
    $('bills').closest('.bubble').classList.toggle('attn', S.reveal === 1 && !num(S.bills));
  }
  // immediate: on blur / Enter. Otherwise wait for a pause in typing.
  function checkReveal(immediate) {
    clearTimeout(revealTimer);
    const target = levelFor(S);
    if (target <= S.reveal) { paintReveal(); return; }
    const apply = () => { S.reveal = target; paintReveal(); save(); };
    if (immediate) apply(); else revealTimer = setTimeout(apply, 800);
  }
  const firstFieldOf = lvl => lvl === 1 ? $('bills') : $('page1').querySelector('#debts input');

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.closest('#gateForm')) return;
    e.preventDefault();
    if (S.step === 1 && S.reveal < 2) {
      checkReveal(true);
      const next = firstFieldOf(S.reveal);
      if (S.reveal > 0 && next && next !== e.target) { next.focus(); next.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
      return;
    }
    if (S.step < 3) { e.target.blur(); goTo(S.step + 1, true); }
  });

  /* ---------- Hero count-up ---------- */
  let heroVal = 0, heroRaf;
  function animateHero(to, ms = 450) {
    cancelAnimationFrame(heroRaf);
    const from = heroVal, t0 = performance.now(), dur = reduce ? 0 : ms;
    const step = now => {
      const p = dur ? Math.min((now - t0) / dur, 1) : 1, e = 1 - Math.pow(1 - p, 3);
      heroVal = from + (to - from) * e;
      $('heroNum').textContent = money(heroVal, true);
      if (p < 1) heroRaf = requestAnimationFrame(step);
    };
    heroRaf = requestAnimationFrame(step);
  }

  /* ---------- Page 3 intro: hero counts up, then each row in turn ---------- */
  const R = {}; // latest computed values, filled by compute()
  let introTimers = [], introRafs = [];
  function countUp(el, to, cents, dur) {
    const t0 = performance.now();
    const step = now => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = money(to * e, cents);
      if (p < 1) introRafs.push(requestAnimationFrame(step));
    };
    introRafs.push(requestAnimationFrame(step));
  }
  function stopIntro() {
    introTimers.forEach(clearTimeout); introRafs.forEach(cancelAnimationFrame);
    introTimers = []; introRafs = [];
    document.querySelectorAll('.stat.waiting').forEach(r => r.classList.remove('waiting'));
  }
  function playIntro() {
    stopIntro();
    compute();
    if (reduce) return;
    const later = (fn, ms) => introTimers.push(setTimeout(fn, ms));
    // Hero: rise from zero
    heroVal = 0; $('heroNum').textContent = money(0, true);
    animateHero(R.hero, 1500);
    // Income bar grows in alongside
    const bars = ['bBills', 'bDebt', 'bInvest', 'bSave', 'bLeft'].map($);
    const widths = bars.map(b => b.style.flex);
    bars.forEach(b => { b.style.transition = 'none'; b.style.flex = '0 0 0%'; });
    later(() => bars.forEach((b, i) => { b.style.transition = ''; b.style.flex = widths[i]; }), 300);
    // Rows: one after another once the hero has mostly landed
    const rows = [
      ['sPay', R.pay, true], ['sInt', R.int, true], ['sRem', R.rem, false],
      ['sInv', R.inv, false], ['sSave', R.save, false], ['sLeft', R.left, false], ['sFree']
    ].filter(([id]) => !$(id).closest('.stat').hidden);
    rows.forEach(([id, val, cents]) => {
      $(id).closest('.stat').classList.add('waiting');
      if (val !== undefined) $(id).textContent = money(0, cents);
    });
    rows.forEach(([id, val, cents], i) => later(() => {
      $(id).closest('.stat').classList.remove('waiting');
      if (val !== undefined) countUp($(id), val, cents, 800);
    }, 1300 + i * 380));
  }

  /* ---------- Compute & render results ---------- */
  function compute() {
    checkReveal(false);
    save();
    const income = S.pay * FREQ[S.freq];
    const billsTotal = num(S.bills);
    const debts = S.debts.filter(d => num(d.bal) > 0).map(d => ({ bal: num(d.bal), apr: num(d.apr) }));
    const owed = debts.reduce((a, d) => a + d.bal, 0);
    const sumMin = firstMins(debts);
    const months = Math.max(3, Math.min(60, Math.round(S.months) || 3));
    const investAmt = S.investOn ? S.invest : 0;
    const saveAmt = S.saveOn ? S.save : 0;

    const per = FREQ[S.freq];
    $('incomeCaption').innerHTML = per === 1
      ? `That's <b>${money(income)}</b> a month.`
      : `${money(S.pay)} × ${per} paychecks = <b>${money(income)}</b> a month.`;
    $('debtTotal').textContent = money(owed);
    document.querySelectorAll('#monthTicks .tick').forEach(t => t.classList.toggle('on', +t.dataset.m === months));
    $('monthsCaption').innerHTML = `That's <b>${span(months)}</b>, debt-free by <b>${monthLabel(months)}</b>.`;

    // Results cover the timeline picked on page 2
    const k = months;
    const hName = `in ${span(months)}`;
    const hShort = `after ${span(months)}`;

    let P = 0, base = null, plan = null;
    if (debts.length) {
      base = simulate(debts, null);
      P = solvePayment(debts, months);
      plan = simulate(debts, P);
    }
    const leftover = income - billsTotal - P - investAmt - saveAmt;

    // Hero
    $('heroLabel').textContent = `Interest saved ${hName}`;
    if (debts.length) {
      const saved = Math.max(0, at(base.cum, k) - at(plan.cum, k));
      R.hero = saved;
      animateHero(saved);
      $('heroSub').innerHTML = `By paying <b>${money(P, true)}/mo</b> toward debt instead of just the minimums (about <b>${money(sumMin)}</b> to start).`;
    } else {
      R.hero = 0;
      animateHero(0);
      $('heroSub').textContent = 'Add a debt in step 1 to see how much interest you save.';
    }

    // Budget bar
    const parts = [billsTotal, P, investAmt, saveAmt, Math.max(leftover, 0)];
    const denom = Math.max(income, parts[0] + parts[1] + parts[2] + parts[3]) || 1;
    ['bBills', 'bDebt', 'bInvest', 'bSave', 'bLeft'].forEach((id, i) => { $(id).style.flex = `0 0 ${parts[i] / denom * 100}%`; });
    $('lBills').textContent = money(billsTotal);
    $('lDebt').textContent = money(P);
    $('lInvest').textContent = money(investAmt);
    $('lSave').textContent = money(saveAmt);
    $('lLeft').textContent = money(leftover);

    // Stats
    R.pay = P;
    $('sPay').textContent = money(P, true);
    $('minNote').textContent = debts.length ? `Minimums alone: about ${money(sumMin)} to start` : 'No debts entered';

    $('intLabel').textContent = `Interest you'll pay ${hName}`;
    if (debts.length) {
      R.int = at(plan.cum, k); R.rem = at(base.remain, k);
      $('sInt').textContent = money(R.int, true);
      $('intNote').textContent = `Minimums only: ${money(at(base.cum, k), true)}`;
      $('remLabel').textContent = `Still owed ${hShort} on minimums only`;
      $('sRem').textContent = money(R.rem);
      $('remNote').textContent = `On your plan: ${money(at(plan.remain, k))}`;
      $('sFree').textContent = monthLabel(plan.months);
      $('freeNote').textContent = base.paid
        ? `Minimums only: ${monthLabel(base.months)} (${span(base.months)})`
        : 'Minimums only: never. They barely cover the interest.';
    } else {
      R.int = 0; R.rem = 0;
      $('sInt').textContent = money(0); $('intNote').textContent = '';
      $('remLabel').textContent = `Still owed ${hShort} on minimums only`; $('sRem').textContent = money(0); $('remNote').textContent = '';
      $('sFree').textContent = 'Now'; $('freeNote').textContent = 'No debts entered';
    }

    $('investStat').hidden = !S.investOn;
    $('invLabel').textContent = `Investments ${hShort} at 6%`;
    const v = fv(investAmt, k), put = investAmt * k;
    R.inv = v; R.left = leftover;

    // Savings
    const goal = num(S.goal), toGoal = monthsToGoal(saveAmt, goal);
    $('goalCaption').innerHTML = !goal ? ''
      : toGoal === Infinity ? `Add a monthly amount to reach your <b>${money(goal)}</b> goal.`
      : `You'd reach your <b>${money(goal)}</b> goal in <b>${span(toGoal)}</b>, by <b>${monthLabel(toGoal)}</b>.`;
    $('saveStat').hidden = !S.saveOn;
    $('saveLabel').textContent = `Savings ${hShort} at 3.5%`;
    const sv = fvSave(saveAmt, k), sPut = saveAmt * k;
    R.save = sv;
    $('sSave').textContent = money(sv);
    $('saveNote').textContent = `${money(sPut)} saved + ${money(sv - sPut)} interest` +
      (goal ? (sv >= goal ? ` · Goal reached ${monthLabel(toGoal)}` : ` · ${Math.round(sv / goal * 100)}% of ${money(goal)} goal`) : '');
    $('sInv').textContent = money(v);
    $('invNote').textContent = `${money(put)} put in + ${money(v - put)} growth`;

    $('sLeft').textContent = money(leftover);
    $('leftStat').classList.toggle('warn', leftover < 0);
    $('leftNote').textContent = leftover < 0
      ? `You're ${money(-leftover)} short. Stretch the timeline, or invest or save less.`
      : 'After expenses, debt payments, investing and saving';
  }

  function init() {
    syncPay(); syncBills(); syncMonths(); syncInvest(); syncSave(); syncGoal(); setSaveOn();
    setFreq(); setInvestOn();
    renderDebts();
    paintReveal();
    compute();
  }
  init();
  maxStep = [1, 2, 3].includes(S.step) ? S.step : 1;
  goTo(maxStep);
})();
