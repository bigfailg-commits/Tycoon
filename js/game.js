(() => {
  'use strict';

  const SAVE_KEY = 'neon-tycoon-save-v1';
  const DEFINITIONS = {
    kiosk: { name: 'Corner Kiosk', baseCost: 100, baseProfit: 2, workers: 1, growth: 1.16 },
    cafe: { name: 'Urban Café', baseCost: 500, baseProfit: 8, workers: 4, growth: 1.17 },
    office: { name: 'Tech Office', baseCost: 2500, baseProfit: 30, workers: 15, growth: 1.18 },
    tower: { name: 'Skyline Tower', baseCost: 10000, baseProfit: 120, workers: 60, growth: 1.19 }
  };
  const INITIAL_STATE = {
    cash: 250, totalEarned: 0, day: 1, lastSeen: Date.now(),
    businesses: { kiosk: 0, cafe: 0, office: 0, tower: 0 },
    automation: 0, management: 0, sound: false, log: []
  };

  let state = loadState();
  let toastTimer = null;
  let saveTimer = null;
  let lastDay = state.day;

  const $ = (id) => document.getElementById(id);
  const money = (amount) => {
    if (!Number.isFinite(amount)) return '$0';
    const abs = Math.abs(amount);
    if (abs >= 1e9) return '$' + (amount / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (amount / 1e6).toFixed(2) + 'M';
    if (abs >= 10000) return '$' + (amount / 1000).toFixed(1) + 'K';
    return '$' + Math.floor(amount).toLocaleString('en-US');
  };
  const countProperties = () => Object.values(state.businesses).reduce((sum, n) => sum + n, 0);
  const workerCount = () => Object.entries(state.businesses).reduce((sum, [key, n]) => sum + n * DEFINITIONS[key].workers, 0);
  const globalMultiplier = () => 1 + state.automation * 0.25 + state.management * 0.5;
  const profitPerSecond = () => Object.entries(state.businesses).reduce((sum, [key, n]) => sum + n * DEFINITIONS[key].baseProfit, 0) * globalMultiplier();
  const nextCost = (key) => Math.ceil(DEFINITIONS[key].baseCost * Math.pow(DEFINITIONS[key].growth, state.businesses[key]));
  const upgradeCost = (key) => key === 'automation' ? Math.ceil(750 * Math.pow(2.15, state.automation)) : Math.ceil(2000 * Math.pow(3, state.management));

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return structuredClone(INITIAL_STATE);
      const parsed = JSON.parse(raw);
      const restored = { ...structuredClone(INITIAL_STATE), ...parsed };
      restored.businesses = { ...INITIAL_STATE.businesses, ...(parsed.businesses || {}) };
      restored.log = Array.isArray(parsed.log) ? parsed.log.slice(0, 20) : [];
      for (const key of Object.keys(DEFINITIONS)) {
        restored.businesses[key] = Math.max(0, Math.floor(Number(restored.businesses[key]) || 0));
      }
      restored.cash = Math.max(0, Number(restored.cash) || 0);
      restored.totalEarned = Math.max(0, Number(restored.totalEarned) || 0);
      restored.automation = Math.min(5, Math.max(0, Math.floor(Number(restored.automation) || 0)));
      restored.management = Math.min(3, Math.max(0, Math.floor(Number(restored.management) || 0)));
      restored.day = Math.max(1, Math.floor(Number(restored.day) || 1));
      restored.sound = Boolean(restored.sound);
      return restored;
    } catch (error) {
      console.warn('Save could not be read; starting a new game.', error);
      return structuredClone(INITIAL_STATE);
    }
  }

  function saveState() {
    try {
      state.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      $('save-status').textContent = 'Saved locally';
    } catch (error) {
      $('save-status').textContent = 'Save unavailable';
    }
  }

  function addLog(title, detail, color = 'green') {
    state.log.unshift({ title, detail, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), color });
    state.log = state.log.slice(0, 12);
    renderLog();
  }

  function renderLog() {
    const container = $('activity-log');
    container.replaceChildren();
    if (!state.log.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-log';
      empty.textContent = 'No recent activity. Make your first investment!';
      container.appendChild(empty);
      return;
    }
    for (const item of state.log) {
      const entry = document.createElement('div');
      entry.className = 'activity-entry';
      const dot = document.createElement('span');
      dot.className = 'activity-dot';
      if (item.color === 'purple') dot.style.background = 'var(--purple)';
      if (item.color === 'gold') dot.style.background = 'var(--gold)';
      const copy = document.createElement('span');
      const title = document.createElement('b');
      title.textContent = item.title;
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      copy.append(title, detail);
      const time = document.createElement('time');
      time.textContent = item.time || 'NOW';
      entry.append(dot, copy, time);
      container.appendChild(entry);
    }
  }

  function render() {
    const income = profitPerSecond();
    $('cash-value').textContent = money(state.cash);
    $('income-value').innerHTML = '';
    $('income-value').append(document.createTextNode(money(income)));
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = '/sec';
    $('income-value').append(unit);
    $('cash-change').textContent = '+' + money(income) + ' / sec';
    $('property-value').textContent = countProperties().toLocaleString('en-US');
    $('property-goal').textContent = Math.min(countProperties(), 10) + ' / 10 to expand';
    $('worker-value').textContent = workerCount().toLocaleString('en-US');
    $('day-number').textContent = state.day;

    for (const [key, definition] of Object.entries(DEFINITIONS)) {
      const owned = state.businesses[key];
      const cost = nextCost(key);
      $(`owned-${key}`).textContent = owned.toLocaleString('en-US');
      $(`level-${key}`).textContent = Math.min(99, 1 + Math.floor(owned / 3));
      $(`profit-${key}`).textContent = '+' + money(definition.baseProfit * globalMultiplier());
      $(`cost-${key}`).textContent = money(cost);
      const button = document.querySelector(`[data-buy="${key}"]`);
      button.disabled = state.cash < cost;
      button.setAttribute('aria-label', `Buy ${definition.name} for ${money(cost)}`);
    }

    for (const key of ['automation', 'management']) {
      const max = key === 'automation' ? 5 : 3;
      const level = state[key];
      $(`${key}-level`).textContent = `LEVEL ${level} / ${max}`;
      $(`${key}-cost`).textContent = level >= max ? 'MAX LEVEL' : money(upgradeCost(key));
      const button = $(`${key}-button`);
      button.disabled = level >= max || state.cash < upgradeCost(key);
      button.innerHTML = level >= max ? 'Fully upgraded' : `Upgrade <b id="${key}-cost">${money(upgradeCost(key))}</b>`;
    }

    const properties = countProperties();
    const earnedPct = Math.min(100, state.totalEarned / 1000 * 100);
    $('progress-property').style.width = (properties > 0 ? 100 : 0) + '%';
    $('status-property').textContent = properties > 0 ? '1/1' : '0/1';
    $('progress-earnings').style.width = earnedPct + '%';
    $('status-earnings').textContent = Math.floor(earnedPct) + '%';
    $('progress-city').style.width = Math.min(100, properties / 10 * 100) + '%';
    $('status-city').textContent = Math.min(properties, 10) + '/10';
    $('collect-button').disabled = income <= 0;
    $('sound-toggle').textContent = state.sound ? '♫' : '♪';
    $('sound-toggle').style.color = state.sound ? 'var(--green)' : '';
  }

  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  function beep(frequency = 600) {
    if (!state.sound) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.04, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
      oscillator.onended = () => context.close();
    } catch (_) { /* Audio is optional. */ }
  }

  function buyBusiness(key) {
    const definition = DEFINITIONS[key];
    if (!definition) return;
    const cost = nextCost(key);
    if (state.cash < cost) {
      showToast('Not enough cash yet. Let your businesses earn more!');
      return;
    }
    state.cash -= cost;
    state.businesses[key] += 1;
    addLog(`New ${definition.name} acquired!`, `Investment: ${money(cost)} · Now earning more every second.`);
    showToast(`${definition.name} acquired! Income increased.`);
    beep(720);
    render();
    saveState();
  }

  function buyUpgrade(key) {
    const max = key === 'automation' ? 5 : 3;
    if (state[key] >= max) return;
    const cost = upgradeCost(key);
    if (state.cash < cost) {
      showToast('Not enough cash for this upgrade yet.');
      return;
    }
    state.cash -= cost;
    state[key] += 1;
    const name = key === 'automation' ? 'Process automation' : 'Better management';
    addLog(`${name} upgraded!`, `Level ${state[key]} · Business income multiplier increased.`, 'purple');
    showToast(`${name} upgraded to level ${state[key]}!`);
    beep(820);
    render();
    saveState();
  }

  function collectProfits() {
    const income = profitPerSecond();
    if (income <= 0) {
      showToast('Buy a business first to start earning passive income.');
      return;
    }
    const bonus = Math.max(1, income * 3);
    state.cash += bonus;
    state.totalEarned += bonus;
    addLog('Profit boost collected!', `Bonus payout: ${money(bonus)}`, 'gold');
    showToast(`+ ${money(bonus)} bonus profit!`);
    beep(650);
    render();
    saveState();
  }

  function tick() {
    const income = profitPerSecond();
    if (income > 0) {
      state.cash += income;
      state.totalEarned += income;
    }
    state.day = Math.max(1, Math.floor((Date.now() - gameStartedAt) / 30000) + 1);
    if (state.day !== lastDay) {
      lastDay = state.day;
      addLog(`Day ${state.day} begins`, 'Your businesses keep working around the clock.');
    }
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 500);
  }

  let gameStartedAt = Date.now() - (state.day - 1) * 30000;

  function applyOfflineEarnings() {
    const awaySeconds = Math.max(0, Math.min(8 * 60 * 60, (Date.now() - (Number(state.lastSeen) || Date.now())) / 1000));
    const income = profitPerSecond();
    const earned = income * awaySeconds;
    if (earned >= 1) {
      state.cash += earned;
      state.totalEarned += earned;
      addLog('Welcome back, CEO!', `Your businesses earned ${money(earned)} while you were away.`, 'gold');
      showToast(`Welcome back! You earned ${money(earned)} offline.`);
    }
    gameStartedAt = Date.now() - (state.day - 1) * 30000;
  }

  function resetGame() {
    state = structuredClone(INITIAL_STATE);
    gameStartedAt = Date.now();
    lastDay = 1;
    state.log = [];
    addLog('Fresh start!', 'Your next empire begins right now.');
    saveState();
    render();
    showToast('A brand-new empire. Make it count!');
  }

  document.querySelectorAll('[data-buy]').forEach(button => {
    button.addEventListener('click', () => buyBusiness(button.dataset.buy));
  });
  $('automation-button').addEventListener('click', () => buyUpgrade('automation'));
  $('management-button').addEventListener('click', () => buyUpgrade('management'));
  $('collect-button').addEventListener('click', collectProfits);
  $('sound-toggle').addEventListener('click', () => {
    state.sound = !state.sound;
    render();
    saveState();
    showToast(state.sound ? 'Sound effects enabled.' : 'Sound effects muted.');
    if (state.sound) beep();
  });
  $('clear-log').addEventListener('click', () => {
    state.log = [];
    renderLog();
    showToast('Activity log cleared.');
    saveState();
  });
  $('reset-button').addEventListener('click', () => $('reset-dialog').showModal());
  $('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
  $('confirm-reset').addEventListener('click', () => {
    $('reset-dialog').close();
    resetGame();
  });
  $('reset-dialog').addEventListener('click', event => {
    if (event.target === $('reset-dialog')) $('reset-dialog').close();
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && !$('reset-dialog').open) {
      event.preventDefault();
      collectProfits();
    }
    if (event.key === 'Escape' && $('reset-dialog').open) $('reset-dialog').close();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });
  window.addEventListener('beforeunload', saveState);

  applyOfflineEarnings();
  render();
  renderLog();
  saveState();
  window.setInterval(tick, 1000);
})();