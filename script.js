(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const towers = [...document.querySelectorAll('.tower')];
  const el = {
    moves: $('moves'), optimal: $('optimal'), timer: $('timer'), best: $('best'),
    message: $('message'), count: $('diskCount'),
    undo: $('undo'), reset: $('reset'), solve: $('solve'),
  };

  const state = {
    n: 4, pegs: [[], [], []], selected: null,
    history: [], moves: 0,
    startTime: null, timerId: null,
    busy: false, won: false,
  };

  /* ---------- helpers ---------- */
  const bestKey = (n) => `hanoi-best-${n}`;
  const readBest = (n) => {
    try { return localStorage.getItem(bestKey(n)); } catch { return null; }
  };
  const writeBest = (n, v) => {
    try { localStorage.setItem(bestKey(n), v); } catch { /* storage unavailable */ }
  };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const say = (text, win = false) => {
    el.message.textContent = text;
    el.message.classList.toggle('win', win);
  };

  /* ---------- setup ---------- */
  function newGame(n = state.n) {
    stopTimer();
    state.n = n;
    state.pegs = [Array.from({ length: n }, (_, i) => n - i), [], []]; // bottom -> top
    state.selected = null;
    state.history = [];
    state.moves = 0;
    state.startTime = null;
    state.busy = false;
    state.won = false;
    el.timer.textContent = '0:00';
    el.optimal.textContent = 2 ** n - 1;
    el.best.textContent = readBest(n) ?? '–';
    say('Pick a peg to lift its top disc.');
    render();
  }

  /* ---------- rendering ---------- */
  function render() {
    const { n, pegs, selected } = state;
    const discHeight = Math.max(16, Math.min(28, 190 / n));

    towers.forEach((tower, i) => {
      const holder = tower.querySelector('.discs');
      holder.replaceChildren();
      pegs[i].forEach((size, idx) => {
        const d = document.createElement('span');
        d.className = 'disc';
        const width = 22 + (size / n) * 70; // percent of peg area
        d.style.width = `${width}%`;
        d.style.setProperty('--h', `${discHeight}px`);
        d.style.background = `hsl(${(size - 1) * (300 / n) + 20} 78% 58%)`;
        if (i === selected && idx === pegs[i].length - 1) d.classList.add('lifted');
        holder.appendChild(d);
      });
      tower.classList.toggle('active', i === selected);
    });

    el.moves.textContent = state.moves;
    el.undo.disabled = state.busy || state.history.length === 0 || state.won;
    el.solve.disabled = state.busy || state.won;
    el.count.disabled = state.busy;
  }

  /* ---------- timer ---------- */
  function startTimer() {
    if (state.timerId) return;
    state.startTime = Date.now();
    state.timerId = setInterval(() => {
      el.timer.textContent = fmtTime(Math.floor((Date.now() - state.startTime) / 1000));
    }, 250);
  }
  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  /* ---------- game logic ---------- */
  const canMove = (from, to) => {
    const src = state.pegs[from];
    if (!src.length) return false;
    const dst = state.pegs[to];
    return !dst.length || dst[dst.length - 1] > src[src.length - 1];
  };

  function applyMove(from, to, record = true) {
    state.pegs[to].push(state.pegs[from].pop());
    state.moves++;
    if (record) state.history.push([from, to]);
  }

  function reject(peg) {
    const t = towers[peg];
    t.classList.remove('reject');
    void t.offsetWidth; // restart animation
    t.classList.add('reject');
    say('A bigger disc cannot go on a smaller one.');
  }

  function checkWin() {
    if (state.pegs[2].length !== state.n) return false;
    state.won = true;
    stopTimer();
    const secs = Math.floor((Date.now() - state.startTime) / 1000);
    const optimal = 2 ** state.n - 1;
    const prev = Number(readBest(state.n));
    let text = `Solved in ${state.moves} moves (${fmtTime(secs)}).`;
    if (state.moves === optimal) text += ' That is a perfect solution.';
    if (!prev || state.moves < prev) {
      writeBest(state.n, state.moves);
      el.best.textContent = state.moves;
      if (prev) text += ' New personal best.';
    }
    say(text, true);
    return true;
  }

  function onPeg(peg) {
    if (state.busy || state.won) return;
    const { selected, pegs } = state;

    if (selected === null) {
      if (!pegs[peg].length) return say('That peg is empty. Pick one with discs.');
      state.selected = peg;
      say('Now pick the peg to drop it on.');
    } else if (selected === peg) {
      state.selected = null;
      say('Disc put back.');
    } else if (canMove(selected, peg)) {
      startTimer();
      applyMove(selected, peg);
      state.selected = null;
      say('');
      render();
      checkWin();
      return render();
    } else {
      reject(peg);
      state.selected = null;
    }
    render();
  }

  function undo() {
    if (state.busy || state.won || !state.history.length) return;
    const [from, to] = state.history.pop();
    state.pegs[from].push(state.pegs[to].pop());
    state.moves++; // undo counts as a move, so scores stay honest
    state.selected = null;
    say('Move undone.');
    render();
  }

  /* ---------- auto solver ---------- */
  function solution(n, from, to, via, out = []) {
    if (n === 0) return out;
    solution(n - 1, from, via, to, out);
    out.push([from, to]);
    solution(n - 1, via, to, from, out);
    return out;
  }

  function showSolution() {
    if (state.busy) return;
    newGame(state.n);
    state.busy = true;
    const steps = solution(state.n, 0, 2, 1);
    let i = 0;
    say('Watch the optimal solution…');
    render();
    const delay = Math.max(120, 600 - state.n * 50);
    const id = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(id);
        state.busy = false;
        state.won = true;
        say(`Solved in ${steps.length} moves. Press Restart to play yourself.`, true);
        return render();
      }
      applyMove(...steps[i++], false);
      render();
    }, delay);
  }

  /* ---------- events ---------- */
  towers.forEach((t) => t.addEventListener('click', () => onPeg(Number(t.dataset.peg))));
  el.undo.addEventListener('click', undo);
  el.reset.addEventListener('click', () => newGame());
  el.solve.addEventListener('click', showSolution);
  el.count.addEventListener('change', () => newGame(Number(el.count.value)));

  document.addEventListener('keydown', (e) => {
    if (e.target === el.count) return;
    if (['1', '2', '3'].includes(e.key)) onPeg(Number(e.key) - 1);
    else if (e.key.toLowerCase() === 'z') undo();
    else if (e.key.toLowerCase() === 'r') newGame();
  });

  el.count.value = String(state.n);
  newGame();
})();
