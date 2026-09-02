/* Arena God Tracker — all state lives in localStorage, nothing leaves the browser. */
(function () {
  'use strict';

  var GOAL = 60;
  var STORE_KEY = 'arenaGod.progress.v1';

  /* Icons come from Data Dragon by default. To remove the runtime dependency
     entirely, run `node tools/update-champions.mjs --icons` and change this to
     './icons/'. Tiles fall back to an initial if an icon fails to load. */
  var ICON_BASE = 'https://ddragon.leagueoflegends.com/cdn/' +
                  (window.DDRAGON_VERSION || '16.17.1') + '/img/champion/';

  var CHAMPIONS = Array.isArray(window.CHAMPIONS) ? window.CHAMPIONS : [];

  var el = {
    rail:      document.getElementById('rail'),
    count:     document.getElementById('tally-count'),
    remaining: document.getElementById('tally-remaining'),
    roster:    document.getElementById('tally-roster'),
    crowned:   document.getElementById('crowned'),
    search:    document.getElementById('search'),
    roles:     document.getElementById('roles'),
    grid:      document.getElementById('grid'),
    empty:     document.getElementById('empty'),
    showing:   document.getElementById('showing'),
    saveMsg:   document.getElementById('save-msg'),
    importIn:  document.getElementById('import'),
    patch:     document.getElementById('patch')
  };

  var won = new Set();
  var activeRoles = new Set();
  var query = '';
  var status = 'all';          // all | won | todo
  var tiles = [];              // { champ, node, haystack }
  var notches = [];
  var wasCrowned = false;

  /* ---------- helpers ---------- */

  // "Kai'Sa" -> "kaisa", so searching kaisa / dr mundo / velkoz all work
  function flatten(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /* ---------- persistence ---------- */

  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (err) {
      return; // private mode / storage disabled — run in memory
    }
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      var list = Array.isArray(data) ? data : (data && data.champions);
      if (Array.isArray(list)) adopt(list);
    } catch (err) {
      /* corrupt entry: start clean rather than dying on load */
    }
  }

  // Returns false when the browser refuses to store (private mode, quota, etc.)
  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        app: 'arena-god-tracker',
        version: 1,
        patch: window.DDRAGON_VERSION,
        savedAt: new Date().toISOString(),
        champions: Array.from(won)
      }));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Keep only ids we actually know about, so a stale or hand-edited file
  // can't wedge the counter above the real roster.
  function adopt(list) {
    var known = new Set(CHAMPIONS.map(function (c) { return c.id; }));
    won = new Set(list.filter(function (id) { return known.has(id); }));
    return list.length - won.size; // number of dropped entries
  }

  /* ---------- build ---------- */

  function buildRail() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < GOAL; i++) {
      var n = document.createElement('span');
      n.className = 'notch';
      n.style.setProperty('--i', i);
      frag.appendChild(n);
      notches.push(n);
    }
    el.rail.appendChild(frag);
  }

  function buildGrid() {
    var frag = document.createDocumentFragment();

    CHAMPIONS.forEach(function (champ) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile';
      btn.dataset.id = champ.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.title = champ.name + ' — ' + champ.tags.join(', ');

      var art = document.createElement('span');
      art.className = 'tile__art';

      var img = document.createElement('img');
      img.className = 'tile__img';
      img.src = ICON_BASE + champ.id + '.png';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 120;
      img.height = 120;
      img.addEventListener('error', function () { btn.classList.add('no-art'); });

      var fallback = document.createElement('span');
      fallback.className = 'tile__fallback';
      fallback.textContent = champ.name.charAt(0);
      fallback.setAttribute('aria-hidden', 'true');

      var mark = document.createElement('span');
      mark.className = 'tile__mark';

      art.appendChild(img);
      art.appendChild(fallback);
      art.appendChild(mark);

      var name = document.createElement('span');
      name.className = 'tile__name';
      name.textContent = champ.name;

      btn.appendChild(art);
      btn.appendChild(name);
      frag.appendChild(btn);

      tiles.push({
        champ: champ,
        node: btn,
        haystack: flatten(champ.name) + ' ' + flatten(champ.id)
      });
    });

    el.grid.appendChild(frag);
  }

  /* ---------- render ---------- */

  function renderTallies() {
    var total = won.size;
    var scored = Math.min(total, GOAL);   // the achievement caps at 60
    var left = GOAL - scored;

    el.count.textContent = String(scored);
    el.rail.setAttribute('aria-valuenow', String(scored));

    for (var i = 0; i < notches.length; i++) {
      notches[i].classList.toggle('lit', i < scored);
    }

    if (left > 0) {
      el.remaining.textContent = plural(left, 'champion to go', 'champions to go');
    } else {
      el.remaining.textContent = 'Complete';
    }

    var extra = total - scored;
    el.roster.textContent = total + ' of ' + CHAMPIONS.length + ' champions marked' +
      (extra > 0 ? ' (' + extra + ' past the goal)' : '');

    var crowned = scored >= GOAL;
    el.crowned.hidden = !crowned;
    if (crowned && !wasCrowned) {
      document.body.classList.remove('is-crowned');
      void el.rail.offsetWidth;              // restart the one animation
      document.body.classList.add('is-crowned');
    }
    if (!crowned) document.body.classList.remove('is-crowned');
    wasCrowned = crowned;
  }

  function matches(t) {
    if (query && t.haystack.indexOf(query) === -1) return false;

    if (activeRoles.size) {
      var hit = t.champ.tags.some(function (tag) { return activeRoles.has(tag); });
      if (!hit) return false;
    }

    if (status === 'won' && !won.has(t.champ.id)) return false;
    if (status === 'todo' && won.has(t.champ.id)) return false;

    return true;
  }

  function renderGrid() {
    var shown = 0;

    tiles.forEach(function (t) {
      var isWon = won.has(t.champ.id);
      t.node.classList.toggle('is-won', isWon);
      t.node.setAttribute('aria-pressed', isWon ? 'true' : 'false');

      var show = matches(t);
      t.node.hidden = !show;
      if (show) shown++;
    });

    el.empty.hidden = shown !== 0;

    var filtered = query || activeRoles.size || status !== 'all';
    el.showing.textContent = filtered
      ? 'Showing ' + plural(shown, 'champion', 'champions') + ' of ' + CHAMPIONS.length
      : '';
  }

  function render() {
    renderTallies();
    renderGrid();
  }

  function note(msg, bad) {
    el.saveMsg.textContent = msg || '';
    el.saveMsg.classList.toggle('is-bad', !!bad);
  }

  /* ---------- events ---------- */

  function onGridClick(e) {
    var btn = e.target.closest ? e.target.closest('.tile') : null;
    if (!btn || !el.grid.contains(btn)) return;

    var id = btn.dataset.id;
    if (won.has(id)) won.delete(id); else won.add(id);

    if (save()) {
      note('');
    } else {
      note('Progress could not be saved — this browser is blocking storage. Export a backup to keep it.', true);
    }
    render();
  }

  function onSearch() {
    query = flatten(el.search.value);
    renderGrid();
  }

  function onRoleClick(e) {
    var chip = e.target.closest ? e.target.closest('.chip') : null;
    if (!chip) return;

    var role = chip.dataset.role;
    if (!role) {
      activeRoles.clear();                       // "Every class" resets
    } else if (activeRoles.has(role)) {
      activeRoles.delete(role);
    } else {
      activeRoles.add(role);
    }

    Array.prototype.forEach.call(el.roles.querySelectorAll('.chip'), function (c) {
      var on = c.dataset.role ? activeRoles.has(c.dataset.role) : activeRoles.size === 0;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    renderGrid();
  }

  function onStatusClick(e) {
    var btn = e.target.closest ? e.target.closest('.seg__btn') : null;
    if (!btn) return;

    status = btn.dataset.status;

    Array.prototype.forEach.call(document.querySelectorAll('.seg__btn'), function (b) {
      var on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    renderGrid();
  }

  function onExport() {
    var payload = {
      app: 'arena-god-tracker',
      version: 1,
      patch: window.DDRAGON_VERSION,
      savedAt: new Date().toISOString(),
      champions: Array.from(won).sort()
    };

    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'arena-god-progress.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      note('Exported ' + plural(won.size, 'champion', 'champions') + ' to arena-god-progress.json.');
    } catch (err) {
      note('Export failed in this browser. Copy your progress manually instead.', true);
    }
  }

  function onImportFile() {
    var file = el.importIn.files && el.importIn.files[0];
    if (!file) return;

    var reader = new FileReader();

    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (err) {
        note("That file isn't valid JSON. Pick a file exported from this tracker.", true);
        el.importIn.value = '';
        return;
      }

      var list = Array.isArray(data) ? data : (data && data.champions);
      if (!Array.isArray(list)) {
        note('No champion list found in that file. Expected a "champions" array.', true);
        el.importIn.value = '';
        return;
      }

      var dropped = adopt(list);
      save();
      render();
      note('Imported ' + plural(won.size, 'champion', 'champions') +
           (dropped > 0 ? '. Skipped ' + dropped + ' unrecognised ' +
                          (dropped === 1 ? 'entry' : 'entries') + '.' : '.'));
      el.importIn.value = '';
    };

    reader.onerror = function () {
      note("That file couldn't be read. Try exporting a fresh backup.", true);
      el.importIn.value = '';
    };

    reader.readAsText(file);
  }

  function onReset() {
    if (won.size === 0) {
      note('Nothing to clear yet.');
      return;
    }
    var ok = window.confirm('Clear all ' + won.size + ' marked champions? Export first if you want a backup.');
    if (!ok) return;

    won.clear();
    save();
    render();
    note('All wins cleared.');
  }

  /* ---------- go ---------- */

  var started = false;

  function init() {
    if (started) return;
    started = true;

    if (!CHAMPIONS.length) {
      el.empty.hidden = false;
      el.empty.textContent = 'Champion data failed to load. Check that champions.js is present.';
      return;
    }

    el.patch.textContent = window.DDRAGON_VERSION || 'unknown';

    load();
    buildRail();
    buildGrid();
    render();

    el.grid.addEventListener('click', onGridClick);
    el.search.addEventListener('input', onSearch);
    el.roles.addEventListener('click', onRoleClick);
    document.querySelector('.seg').addEventListener('click', onStatusClick);
    document.getElementById('export').addEventListener('click', onExport);
    document.getElementById('import-open').addEventListener('click', function () {
      el.importIn.click();
    });
    el.importIn.addEventListener('change', onImportFile);
    document.getElementById('reset').addEventListener('click', onReset);

    // Reflect changes made in another tab.
    window.addEventListener('storage', function (e) {
      if (e.key !== STORE_KEY) return;
      won.clear();
      load();
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
