// ═══════════════════════════════════════════════════════════
//  QUIZ BAGARRE — Client complet (FFA, Teams, Power-ups, Chat, Pièces)
// ═══════════════════════════════════════════════════════════
(() => {
  const socket = io();
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const EMOTES = ['😂', '💀', '🔥', '🤡', '😎', '😭', '👍', '🤓', '🎉', '💩', '🍌', '👀'];
  const TIPS = [
    "Astuce : une seule chance par question, réfléchis vite mais bien 🧠",
    "Astuce : enchaîne les bonnes réponses pour déclencher les COMBOS x2 🔥 !",
    "Nouveau : en mode Chacun pour Soi, affronte autant de joueurs et de bots que tu veux ⚔️",
    "Astuce : utilise ta bombe 💣 50/50 pour faire exploser deux mauvaises réponses !",
    "Balance une peau de banane 🍌 pour secouer l'écran des adversaires !",
    "Gagne des Noob-Bux 🪙 à chaque victoire pour briller dans l'arène !",
  ];

  const AV_ROWS = [
    { key: 'skin', label: 'Peau', list: Avatar.SKIN, color: true },
    { key: 'shirt', label: 'T-shirt', list: Avatar.SHIRT, color: true },
    { key: 'pants', label: 'Pantalon', list: Avatar.PANTS, color: true },
    { key: 'face', label: 'Visage', list: Avatar.FACE_NAMES },
    { key: 'hat', label: 'Chapeau', list: Avatar.HAT_NAMES },
  ];

  // ─────────── État local ───────────
  let profile = loadProfile();
  let coins = Number(localStorage.getItem('qb_coins')) || 50;
  let selectedMode = localStorage.getItem('qb_mode') || 'ffa';
  let room = null;
  let q = null;
  let gameEndsAt = 0;
  let lastTick = null;
  let currentScreen = 'home';
  let countdownTimers = [];
  let pendingJoin = new URLSearchParams(location.search).get('salon');
  let wasDisconnected = false;

  // Gadgets disponibles par match
  let powerups = { bomb: 1, banana: 1, double: 1, shield: 1 };
  let shieldActive = false;
  let doubleActive = false;

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem('qb_profile'));
      if (p && p.avatar && p.name) return p;
    } catch (e) { /* ignore */ }
    return {
      name: 'Noob_' + Math.floor(100 + Math.random() * 900),
      avatar: { skin: 0, shirt: 0, pants: 0, face: 0, hat: 1 }
    };
  }

  function saveProfile() {
    localStorage.setItem('qb_profile', JSON.stringify(profile));
    socket.emit('profile', profile);
  }

  function updateCoinsDisplay(delta = 0) {
    if (delta !== 0) {
      coins += delta;
      localStorage.setItem('qb_coins', String(coins));
      Sound.coin();
    }
    const elCoins = $('#user-coins');
    if (elCoins) elCoins.textContent = coins;
  }
  updateCoinsDisplay();

  // ─────────── Helpers UI ───────────
  function show(name) {
    if (currentScreen === name) return;
    currentScreen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function miniAv(avatar, opts = {}) {
    const d = el('div', 'mini-av');
    d.innerHTML = Avatar.svg(avatar, opts);
    return d;
  }

  function toast(msg, type = '') {
    const t = el('div', 'toast ' + type, msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function restartAnim(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  const isMe = (id) => id === socket.id;
  const findPlayer = (id) => room && room.players.find((p) => p.id === id);
  const myTeam = () => (findPlayer(socket.id) || {}).team;

  // ─────────── Avatar Editor ───────────
  function renderAvatarPreview() {
    $('#avatar-preview').innerHTML = Avatar.svg(profile.avatar);
    $('#queue-avatar').innerHTML = Avatar.svg(profile.avatar);
  }

  function renderAvatarControls() {
    const box = $('#avatar-controls');
    box.innerHTML = '';
    AV_ROWS.forEach((row) => {
      const r = el('div', 'av-row');
      r.appendChild(el('span', 'lbl', row.label));
      const prev = el('button', 'arrow', '◀');
      prev.dataset.key = row.key; prev.dataset.dir = '-1';
      const val = el('div', 'val');
      const i = profile.avatar[row.key] || 0;
      if (row.color) {
        const sw = el('span', 'swatch');
        sw.style.background = row.list[i] || '#ccc';
        val.appendChild(sw);
        val.appendChild(document.createTextNode(`${i + 1}/${row.list.length}`));
      } else {
        val.textContent = row.list[i] || '0';
      }
      const next = el('button', 'arrow', '▶');
      next.dataset.key = row.key; next.dataset.dir = '1';
      r.append(prev, val, next);
      box.appendChild(r);
    });
  }

  $('#avatar-controls').addEventListener('click', (e) => {
    const b = e.target.closest('.arrow');
    if (!b) return;
    const key = b.dataset.key;
    const max = Avatar.LIMITS[key];
    profile.avatar[key] = ((profile.avatar[key] || 0) + Number(b.dataset.dir) + max) % max;
    Sound.click();
    renderAvatarPreview();
    renderAvatarControls();
    restartAnim($('#avatar-preview'), 'squishy');
    saveProfile();
  });

  $('#btn-random-avatar').addEventListener('click', () => {
    profile.avatar = Avatar.random();
    Sound.boing();
    renderAvatarPreview();
    renderAvatarControls();
    saveProfile();
  });

  $('#avatar-preview').addEventListener('click', () => Sound.boing());

  // ─────────── Accueil ───────────
  const nameInput = $('#input-name');
  nameInput.value = profile.name;
  nameInput.addEventListener('input', () => {
    profile.name = nameInput.value.trim().slice(0, 16);
    localStorage.setItem('qb_profile', JSON.stringify(profile));
  });
  nameInput.addEventListener('change', () => {
    if (!profile.name) profile.name = 'Noob_' + Math.floor(100 + Math.random() * 900);
    nameInput.value = profile.name;
    saveProfile();
  });

  function ensureProfile() {
    if (!nameInput.value.trim()) {
      profile.name = 'Noob_' + Math.floor(100 + Math.random() * 900);
      nameInput.value = profile.name;
    }
    saveProfile();
  }

  function setHomeMode(m) {
    selectedMode = (m === 'ffa' || m === 'solo' || m === 0 || m === '0') ? 'ffa' : Number(m);
    localStorage.setItem('qb_mode', String(selectedMode));
    $$('#mode-picker .mode-btn').forEach((b) => {
      b.classList.toggle('active', String(b.dataset.mode) === String(selectedMode));
    });
  }
  setHomeMode(selectedMode);

  $('#mode-picker').addEventListener('click', (e) => {
    const b = e.target.closest('.mode-btn');
    if (!b) return;
    Sound.click();
    setHomeMode(b.dataset.mode);
  });

  $('#btn-quick').addEventListener('click', () => {
    ensureProfile();
    socket.emit('quickPlay', { mode: selectedMode });
    showQueue({ mode: selectedMode, count: 1, needed: selectedMode === 'ffa' ? 4 : (selectedMode * 2) });
  });

  $('#btn-create').addEventListener('click', () => {
    ensureProfile();
    socket.emit('createRoom', { mode: selectedMode });
  });

  $('#btn-bots').addEventListener('click', () => {
    ensureProfile();
    socket.emit('playWithBots', { mode: selectedMode, botCount: selectedMode === 'ffa' ? 5 : undefined });
  });

  const codeInput = $('#input-code');
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });
  $('#btn-join').addEventListener('click', joinByCode);

  function joinByCode() {
    const code = codeInput.value.trim();
    if (code.length !== 4) return toast('Le code fait 4 caractères 🙃', 'error');
    ensureProfile();
    socket.emit('joinRoom', { code });
  }

  // ─────────── File d'attente ───────────
  function showQueue({ mode, count, needed }) {
    show('queue');
    $('#queue-count').textContent = count;
    $('#queue-needed').textContent = needed;
    $('#queue-mode').textContent = mode === 'ffa' ? 'Mode Chacun pour soi (FFA)' : `Mode ${mode}v${mode}`;
    $('#btn-queue-bots').dataset.mode = mode;
    if (!$('#queue-tip').textContent) $('#queue-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  setInterval(() => {
    if (currentScreen === 'queue') $('#queue-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }, 5000);

  $('#btn-queue-cancel').addEventListener('click', () => {
    socket.emit('cancelQueue');
    show('home');
  });

  $('#btn-queue-bots').addEventListener('click', (e) => {
    const m = e.currentTarget.dataset.mode || selectedMode;
    socket.emit('playWithBots', { mode: m, botCount: m === 'ffa' ? 5 : undefined });
  });

  // ─────────── Salon & Paramètres ───────────
  function renderLobby() {
    const isHost = room.hostId === socket.id;
    $('#btn-copy').textContent = room.code;

    // Mode picker dans le lobby
    const picker = $('#lobby-mode-picker');
    picker.classList.toggle('locked', !isHost);
    $$('#lobby-mode-picker .mode-btn').forEach((b) => {
      b.classList.toggle('active', String(b.dataset.mode) === String(room.mode));
    });

    // Options hôte (durée, temps, catégorie)
    const settingsBox = $('#lobby-settings');
    settingsBox.style.pointerEvents = isHost ? 'auto' : 'none';
    settingsBox.style.opacity = isHost ? '1' : '0.65';
    if (room.settings) {
      if (room.settings.durationMs) $('#sel-duration').value = String(room.settings.durationMs);
      if (room.settings.questionMs) $('#sel-qtime').value = String(room.settings.questionMs);
      if (room.settings.category) $('#sel-category').value = room.settings.category;
    }

    const isFFA = room.mode === 'ffa';
    $('#lobby-ffa-container').style.display = isFFA ? 'flex' : 'none';
    $('#lobby-teams-container').style.display = isFFA ? 'none' : 'grid';
    $('#btn-switch').style.display = isFFA ? 'none' : '';

    if (isFFA) {
      // Arène FFA unifiée
      $('#ffa-player-count').textContent = room.players.length;
      $('#ffa-bot-controls').style.display = isHost ? 'flex' : 'none';
      const grid = $('#ffa-slots');
      grid.innerHTML = '';
      room.players.forEach((p) => {
        const s = el('div', 'ffa-slot' + (isMe(p.id) ? ' me' : ''));
        s.dataset.pid = p.id;
        s.appendChild(miniAv(p.avatar));
        const info = el('div', 'ffa-slot-info');
        const topRow = el('div', 'row', '');
        topRow.style.gap = '6px';
        const pill = el('span', 'color-pill');
        pill.style.background = p.color || '#ff4757';
        topRow.append(pill, el('span', 'name', p.name));
        info.appendChild(topRow);

        const tags = el('div', 'tags');
        if (p.id === room.hostId) tags.appendChild(el('span', 'tag host', '👑 Hôte'));
        if (p.isBot) tags.appendChild(el('span', 'tag bot', '🤖 Bot'));
        if (isMe(p.id)) tags.appendChild(el('span', 'tag you', 'Toi'));
        info.appendChild(tags);
        s.appendChild(info);

        if (isHost && p.isBot) {
          const k = el('button', 'kick', '✖');
          k.title = 'Retirer ce bot';
          k.addEventListener('click', () => { Sound.click(); socket.emit('removeBot', { id: p.id }); });
          s.appendChild(k);
        }
        grid.appendChild(s);
      });

      $('#btn-start').style.display = isHost ? '' : 'none';
      $('#btn-start').disabled = room.players.length < 1;
      $('#lobby-status').textContent = isHost
        ? `${room.players.length} combattant(s) dans l'arène ! Lance quand tu es prêt 💥`
        : "En attente que l'hôte lance la partie… 🍿";
    } else {
      // Mode par équipes (1v1, 2v2, 3v3)
      let full = true;
      ['red', 'blue'].forEach((team) => {
        const box = $('#slots-' + team);
        box.innerHTML = '';
        const players = room.players.filter((p) => p.team === team);
        players.forEach((p) => {
          const s = el('div', 'slot' + (isMe(p.id) ? ' me' : ''));
          s.dataset.pid = p.id;
          s.appendChild(miniAv(p.avatar));
          const info = el('div');
          info.appendChild(el('div', 'name', p.name));
          const tags = el('div', 'tags');
          if (p.id === room.hostId) tags.appendChild(el('span', 'tag host', '👑 Hôte'));
          if (p.isBot) tags.appendChild(el('span', 'tag bot', '🤖 Bot'));
          if (isMe(p.id)) tags.appendChild(el('span', 'tag you', 'Toi'));
          info.appendChild(tags);
          s.appendChild(info);

          if (isHost && p.isBot) {
            const k = el('button', 'kick', '✖');
            k.title = 'Retirer ce bot';
            k.addEventListener('click', () => { Sound.click(); socket.emit('removeBot', { id: p.id }); });
            s.appendChild(k);
          }
          box.appendChild(s);
        });

        for (let i = players.length; i < room.mode; i++) {
          full = false;
          const s = el('div', 'slot empty');
          if (isHost) {
            const b = el('button', 'btn btn-yellow btn-sm', '+ 🤖 Ajouter un bot');
            b.addEventListener('click', () => { Sound.click(); socket.emit('addBot', { team }); });
            s.appendChild(b);
          } else {
            s.textContent = 'En attente d’un joueur…';
          }
          box.appendChild(s);
        }
      });

      $('#btn-start').style.display = isHost ? '' : 'none';
      $('#btn-start').disabled = !full;
      $('#lobby-status').textContent = full
        ? (isHost ? 'Tout le monde est là ! Lance la bagarre 🔥' : "En attente que l'hôte lance la partie… 🍿")
        : `Il faut ${room.mode} joueur(s) par équipe pour lancer !`;
    }
  }

  // Événements Hôte
  $('#lobby-mode-picker').addEventListener('click', (e) => {
    const b = e.target.closest('.mode-btn');
    if (!b || !room || room.hostId !== socket.id) return;
    Sound.click();
    socket.emit('setMode', { mode: b.dataset.mode });
  });

  ['#sel-duration', '#sel-qtime', '#sel-category'].forEach((id) => {
    $(id).addEventListener('change', () => {
      if (!room || room.hostId !== socket.id) return;
      socket.emit('setSettings', {
        durationMs: $('#sel-duration').value,
        questionMs: $('#sel-qtime').value,
        category: $('#sel-category').value,
      });
      toast('Paramètres du salon mis à jour ! ⚙️');
      Sound.pop();
    });
  });

  $('#btn-add-bot-1').addEventListener('click', () => {
    Sound.click();
    socket.emit('addBot');
  });

  $('#btn-add-bot-5').addEventListener('click', () => {
    Sound.boing();
    socket.emit('addMultipleBots', { count: 5 });
    toast('5 Bots ont sauté dans l’arène ! 🤖🤖🤖🤖🤖');
  });

  $('#btn-copy').addEventListener('click', async () => {
    const link = `${location.origin}/?salon=${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié ! Envoie-le à tes potes 📨');
    } catch (e) {
      toast('Code : ' + room.code);
    }
    Sound.pop();
  });

  $('#btn-switch').addEventListener('click', () => { Sound.click(); socket.emit('switchTeam'); });
  $('#btn-start').addEventListener('click', () => socket.emit('startGame'));
  $('#btn-leave').addEventListener('click', () => socket.emit('leaveRoom'));

  // ─────────── Tchat & Bulles ───────────
  function handleSendMessage(text, isQuick = false) {
    if (!text || !room) return;
    socket.emit('chat', { text, isQuick });
  }

  $('#lobby-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#lobby-chat-input');
    const txt = inp.value.trim();
    if (txt) {
      handleSendMessage(txt);
      inp.value = '';
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-quick-chat');
    if (btn) {
      handleSendMessage(btn.textContent.trim(), true);
    }
  });

  function showSpeechBubble(playerId, text) {
    const anchor = document.querySelector(`.screen.active [data-pid="${CSS.escape(playerId)}"]`);
    if (anchor) {
      const bubble = el('div', 'speech-bubble', text);
      anchor.appendChild(bubble);
      setTimeout(() => bubble.remove(), 2400);
    }
    // Ajoute aussi dans le journal du salon
    const log = $('#lobby-chat-log');
    if (log) {
      const p = findPlayer(playerId);
      const name = p ? p.name : 'Joueur';
      const row = el('div', 'chat-msg');
      row.innerHTML = `<b>${name} :</b> ${text}`;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }
  }

  // ─────────── Emotes ───────────
  $$('[data-emote-bar]').forEach((bar) => {
    bar.innerHTML = '';
    EMOTES.forEach((e) => {
      const b = el('button', 'emote-btn', e);
      b.addEventListener('click', () => socket.emit('emote', { e }));
      bar.appendChild(b);
    });
  });

  function spawnEmote(playerId, emoji) {
    const anchor = document.querySelector(`.screen.active [data-pid="${CSS.escape(playerId)}"]`);
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top;
    }
    const f = el('div', 'float-emote', emoji);
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    f.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1900);
    Sound.pop();
  }

  // ─────────── Jeu ───────────
  const answerBtns = $$('.answer');

  function resetGameUI() {
    $$('.game-clock').forEach((c) => { c.textContent = '5:00'; });
    $('#clock-box-teams').classList.remove('danger');
    $('#clock-box-ffa').classList.remove('danger');
    $('#q-cat').textContent = 'Prépare-toi';
    $('#q-num').textContent = 'Question 0';
    $('#q-text').textContent = 'Échauffe tes neurones… 🧠';
    $('#q-streak-badge').style.display = 'none';
    $('#q-funfact').style.display = 'none';
    $('#q-timer-fill').style.width = '100%';
    $('#q-timer-fill').className = 'q-timer-fill';
    $('#q-timer-num').textContent = '15';

    answerBtns.forEach((b) => {
      b.className = b.className.replace(/\b(correct|wrong|dim|picked|enter|bombed)\b/g, '').trim();
      b.querySelector('.ans-text').textContent = '…';
      b.disabled = true;
    });

    hideBanner();
    q = null;
    gameEndsAt = 0;

    // Reset power-ups pour ce match
    powerups = { bomb: 1, banana: 1, double: 1, shield: 1 };
    shieldActive = false;
    doubleActive = false;
    updatePowerupsUI();
  }

  function updatePowerupsUI() {
    for (const k in powerups) {
      const badge = $('#pw-count-' + k);
      const btn = $('#pw-' + k);
      if (badge) badge.textContent = powerups[k];
      if (btn) btn.disabled = powerups[k] <= 0;
    }
  }

  // Clics sur les Power-ups
  $('#pw-bomb').addEventListener('click', () => {
    if (powerups.bomb <= 0 || !q || q.revealed || q.myChoice !== null) return;
    powerups.bomb--;
    updatePowerupsUI();
    Sound.bomb();
    socket.emit('usePowerup', { type: 'bomb' });
  });

  $('#pw-banana').addEventListener('click', () => {
    if (powerups.banana <= 0 || !q || q.revealed) return;
    powerups.banana--;
    updatePowerupsUI();
    Sound.slip();
    socket.emit('usePowerup', { type: 'banana' });
    toast('Tu as jeté une peau de banane 🍌 aux adversaires !');
  });

  $('#pw-double').addEventListener('click', () => {
    if (powerups.double <= 0 || !q || q.revealed) return;
    powerups.double--;
    doubleActive = true;
    updatePowerupsUI();
    Sound.powerup();
    socket.emit('usePowerup', { type: 'double' });
    toast('Points doublés x2 sur cette question si tu trouves ! ⚡');
  });

  $('#pw-shield').addEventListener('click', () => {
    if (powerups.shield <= 0 || !q || q.revealed) return;
    powerups.shield--;
    shieldActive = true;
    updatePowerupsUI();
    Sound.powerup();
    socket.emit('usePowerup', { type: 'shield' });
    toast('Bouclier Anti-OOF activé : ta série est protégée ! 🛡️');
  });

  function renderHud() {
    if (!room) return;
    const isFFA = room.mode === 'ffa';
    $('#hud-ffa').style.display = isFFA ? 'grid' : 'none';
    $('#hud-teams').style.display = isFFA ? 'none' : 'grid';

    if (isFFA) {
      // Classement FFA en direct
      const sorted = [...room.players].sort((a, b) => b.score - a.score);
      const myIdx = sorted.findIndex((p) => isMe(p.id));
      const me = sorted[myIdx];

      if (me) {
        $('#my-rank-display').textContent = `#${myIdx + 1}`;
        $('#my-pts-display').textContent = `${me.score} pts`;
        $('#my-streak-display').textContent = me.streak >= 2 ? `🔥 Combo x${me.streak}` : '';
      }

      const board = $('#ffa-leaderboard');
      board.innerHTML = '';
      sorted.slice(0, 6).forEach((p, i) => {
        const item = el('div', 'ffa-board-item' + (isMe(p.id) ? ' me' : ''));
        item.dataset.pid = p.id;
        const posText = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        item.appendChild(el('span', 'pos', posText));
        item.appendChild(miniAv(p.avatar, { onFire: p.streak >= 3 }));
        item.appendChild(el('span', 'name', p.name));
        item.appendChild(el('span', 'score', p.score + 'p'));
        board.appendChild(item);
      });
    } else {
      // Équipes Rouge vs Bleu
      ['red', 'blue'].forEach((team) => {
        $('#score-' + team).textContent = room.teamScores[team] || 0;
        const box = $('#players-' + team);
        box.innerHTML = '';
        room.players.filter((p) => p.team === team).forEach((p) => {
          const c = el('div', 'chip' + (isMe(p.id) ? ' me' : ''));
          c.dataset.pid = p.id;
          c.appendChild(miniAv(p.avatar, { onFire: p.streak >= 3 }));
          c.appendChild(el('span', 'chip-name', (p.isBot ? '🤖 ' : '') + p.name));
          c.appendChild(el('span', 'chip-pts', p.score + ' pts'));
          const st = el('span', 'status');
          c.appendChild(st);
          if (q && q.wrong.has(p.id)) { c.classList.add('wrong'); st.textContent = '❌'; }
          if (q && q.winnerId === p.id) { c.classList.add('win'); st.textContent = '✅'; }
          box.appendChild(c);
        });
      });
    }
  }

  function markChip(id, cls, icon) {
    const c = document.querySelector(`#screen-game [data-pid="${CSS.escape(id)}"]`);
    if (!c) return;
    c.classList.add(cls);
    const st = c.querySelector('.status');
    if (st) st.textContent = icon;
  }

  function showBanner(text, type) {
    const b = $('#banner');
    b.textContent = text;
    b.className = 'banner ' + type;
    restartAnim(b, 'show');
  }
  function hideBanner() { $('#banner').className = 'banner'; }

  function plusPop(text) {
    const p = el('div', 'plus-pop', text);
    $('#fx').appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }

  answerBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (!q || q.revealed || q.myChoice !== null) return;
      const idx = Number(b.dataset.idx);
      q.myChoice = idx;
      b.classList.add('picked');
      answerBtns.forEach((x) => { x.disabled = true; });
      Sound.click();
      socket.emit('answer', { idx });
    });
  });

  // Raccourcis clavier 1-4
  document.addEventListener('keydown', (e) => {
    if (currentScreen !== 'game' || document.activeElement.tagName === 'INPUT') return;
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, '&': 0, 'é': 1, '"': 2, "'": 3 };
    if (e.key in map) answerBtns[map[e.key]].click();
  });

  function runCountdown(ms) {
    countdownTimers.forEach(clearTimeout);
    countdownTimers = [];
    const ov = $('#countdown');
    const num = $('#countdown-num');
    ov.classList.add('show');
    const steps = ['3', '2', '1', 'GO !'];
    const step = (ms - 300) / steps.length;
    steps.forEach((s, i) => {
      countdownTimers.push(setTimeout(() => {
        num.textContent = s;
        restartAnim(num, 'pop');
        if (i < 3) Sound.beep(); else Sound.go();
      }, i * step));
    });
    countdownTimers.push(setTimeout(() => ov.classList.remove('show'), ms));
  }

  function fmtClock(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function loop() {
    const now = Date.now();
    if (gameEndsAt && currentScreen === 'game') {
      const left = Math.max(0, gameEndsAt - now);
      const str = fmtClock(left);
      $$('.game-clock').forEach((c) => { c.textContent = str; });
      const isDanger = left <= 30000;
      $('#clock-box-teams').classList.toggle('danger', isDanger);
      $('#clock-box-ffa').classList.toggle('danger', isDanger);
    }
    if (q && !q.revealed) {
      const left = Math.max(0, q.endsAt - now);
      const ratio = left / q.duration;
      const fill = $('#q-timer-fill');
      fill.style.width = (ratio * 100) + '%';
      fill.className = 'q-timer-fill' + (ratio < 0.25 ? ' low' : ratio < 0.55 ? ' mid' : '');
      const sec = Math.ceil(left / 1000);
      $('#q-timer-num').textContent = sec;
      if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; Sound.tick(); }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ─────────── Confetti ───────────
  function confetti(n = 150) {
    const colors = ['#ff4757', '#3b82f6', '#ffc312', '#2ed573', '#a55eea', '#ff8a1f', '#fff', '#ffd700'];
    for (let i = 0; i < n; i++) {
      const c = el('div', 'confetti');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.width = c.style.height = (8 + Math.random() * 10) + 'px';
      c.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      c.style.animationDuration = (2.2 + Math.random() * 2.5) + 's';
      c.style.animationDelay = Math.random() * 0.8 + 's';
      $('#fx').appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  function updateEndButtons() {
    const isHost = room && room.hostId === socket.id;
    $('#btn-replay').style.display = isHost ? '' : 'none';
    $('#end-wait').style.display = isHost ? 'none' : '';
  }

  // ─────────── Événements Socket ───────────
  socket.on('connect', () => {
    socket.emit('profile', profile);
    if (wasDisconnected) {
      wasDisconnected = false;
      room = null;
      q = null;
      show('home');
      toast('Reconnecté ✅');
    }
    if (pendingJoin) {
      socket.emit('joinRoom', { code: pendingJoin });
      codeInput.value = pendingJoin.toUpperCase();
      pendingJoin = null;
      history.replaceState(null, '', location.pathname);
    }
  });

  socket.on('disconnect', () => {
    wasDisconnected = true;
    toast('Connexion perdue… reconnexion 🔌', 'error');
  });

  socket.on('errorMsg', (msg) => {
    toast(msg, 'error');
    Sound.oof();
    if (currentScreen === 'queue') show('home');
  });

  socket.on('queueStatus', showQueue);

  socket.on('roomUpdate', (state) => {
    room = state;
    if (state.state === 'lobby') {
      show('lobby');
      renderLobby();
    } else if (state.state === 'countdown' || state.state === 'playing') {
      if (currentScreen === 'game') renderHud();
    } else if (state.state === 'ended') {
      updateEndButtons();
    }
  });

  socket.on('countdown', ({ ms }) => {
    show('game');
    resetGameUI();
    renderHud();
    runCountdown(ms);
  });

  socket.on('question', (d) => {
    $('#countdown').classList.remove('show');
    q = {
      ...d,
      endsAt: Date.now() + d.duration,
      myChoice: null,
      revealed: false,
      wrong: new Set(),
      winnerId: null
    };
    gameEndsAt = Date.now() + d.gameTimeLeft;
    lastTick = null;

    $('#q-cat').textContent = d.category;
    $('#q-num').textContent = 'Question ' + d.num;
    $('#q-text').textContent = d.text;
    $('#q-funfact').style.display = 'none';

    // Badge combo si le joueur a une série
    const me = findPlayer(socket.id);
    const streakBadge = $('#q-streak-badge');
    if (me && me.streak >= 2) {
      streakBadge.style.display = 'inline-block';
      streakBadge.textContent = `🔥 SÉRIE x${me.streak} (+${me.streak === 2 ? 5 : me.streak === 3 ? 10 : 15} pts)`;
    } else {
      streakBadge.style.display = 'none';
    }

    restartAnim($('#question-card'), 'enter');
    answerBtns.forEach((b, i) => {
      b.className = `answer a${i}`;
      b.querySelector('.ans-text').textContent = d.options[i];
      b.disabled = false;
      restartAnim(b, 'enter');
    });

    hideBanner();
    renderHud();
    Sound.pop();
  });

  socket.on('playerWrong', ({ playerId, shieldSaved }) => {
    if (!q) return;
    q.wrong.add(playerId);
    markChip(playerId, 'wrong', '❌');

    if (isMe(playerId)) {
      if (q.myChoice !== null) answerBtns[q.myChoice].classList.add('wrong');
      restartAnim($('#question-card'), 'shake');
      if (shieldSaved) {
        showBanner('🛡️ BOUCLIER ! Série sauvée malgré l’erreur !', 'meh');
        Sound.powerup();
      } else {
        showBanner('OOF ! Mauvaise réponse 💀', 'bad');
        Sound.oof();
      }
    }
  });

  socket.on('reveal', (d) => {
    if (!q) return;
    q.revealed = true;
    q.winnerId = d.winnerId;
    $('#q-timer-fill').classList.remove('low');

    answerBtns.forEach((b, i) => {
      b.disabled = true;
      if (i === d.correctIdx) b.classList.add('correct');
      else if (!b.classList.contains('wrong')) b.classList.add('dim');
    });

    // Affiche l'anecdote
    if (d.funFact) {
      const ff = $('#q-funfact');
      ff.textContent = '💡 Le savais-tu ? ' + d.funFact;
      ff.style.display = 'block';
    }

    // Mise à jour des scores
    if (room) {
      if (room.mode !== 'ffa') {
        ['red', 'blue'].forEach((t) => {
          if (room.teamScores[t] !== d.teamScores[t]) restartAnim($('#score-' + t), 'bump');
        });
        room.teamScores = d.teamScores;
      }
      room.players.forEach((p) => {
        if (d.scores[p.id] !== undefined) p.score = d.scores[p.id];
        if (d.streaks[p.id] !== undefined) p.streak = d.streaks[p.id];
      });
    }
    renderHud();

    const winner = findPlayer(d.winnerId);
    const secs = (d.ms / 1000).toFixed(1).replace('.', ',');

    if (!d.winnerId) {
      showBanner("⏰ Personne n'a trouvé !", 'meh');
      Sound.timeout();
    } else if (isMe(d.winnerId)) {
      const earned = (d.bonusInfo && d.bonusInfo.earned) || 10;
      let extra = '';
      if (d.bonusInfo && d.bonusInfo.streak >= 2) extra += ` 🔥 Combo x${d.bonusInfo.streak}`;
      if (d.bonusInfo && d.bonusInfo.speedBonus) extra += ' ⚡ Éclair';
      if (d.bonusInfo && d.bonusInfo.multiplier) extra += ' 💥 Double';

      showBanner(`🎉 BIEN JOUÉ ! +${earned} pts en ${secs}s${extra}`, 'good');
      plusPop(`+${earned}`);
      Sound.correct();
      updateCoinsDisplay(10);
    } else if (winner && winner.team === myTeam() && room.mode !== 'ffa') {
      showBanner(`✅ ${winner.name} a trouvé ! +10 pour ton équipe`, 'good');
      Sound.correct();
    } else {
      showBanner(`😤 ${winner ? winner.name : 'Un adversaire'} a été plus rapide (${secs}s)`, 'bad');
      Sound.boing();
    }
  });

  socket.on('powerupResult', ({ type, eliminated, success }) => {
    if (type === 'bomb' && eliminated) {
      eliminated.forEach((idx) => {
        if (answerBtns[idx]) answerBtns[idx].classList.add('bombed');
      });
      toast('💥 50/50 : 2 mauvaises réponses éliminées !');
    }
  });

  socket.on('bananaSlipped', ({ by }) => {
    const ov = $('#banana-overlay');
    $('#banana-text').textContent = `${by} T'A FAIT GLISSER ! 🍌`;
    ov.classList.remove('slip');
    void ov.offsetWidth;
    ov.classList.add('slip');
    Sound.slip();
    setTimeout(() => ov.classList.remove('slip'), 2000);
  });

  socket.on('chatMessage', ({ playerId, text }) => {
    showSpeechBubble(playerId, text);
    Sound.pop();
  });

  socket.on('emote', ({ playerId, e }) => spawnEmote(playerId, e));

  socket.on('gameOver', (d) => {
    countdownTimers.forEach(clearTimeout);
    $('#countdown').classList.remove('show');
    q = null;
    gameEndsAt = 0;
    show('end');

    const me = d.players.find((p) => isMe(p.id));
    const isFFA = d.mode === 'ffa';
    $('#end-team-scores').style.display = isFFA ? 'none' : 'flex';

    const title = $('#end-title');
    title.className = 'end-title';

    let coinsWon = 30; // participation
    if (isFFA) {
      const myRank = d.players.findIndex((p) => isMe(p.id));
      if (myRank === 0) {
        title.textContent = '👑 VICTOIRE ROYALE !';
        confetti();
        Sound.win();
        coinsWon = 100;
      } else if (myRank <= 2) {
        title.textContent = 'PODIUM ! 🥈🥉';
        confetti(60);
        Sound.win();
        coinsWon = 60;
      } else {
        title.textContent = 'BIEN BATTU !';
        title.classList.add('lose');
        Sound.lose();
      }
      $('#end-sub').textContent = `Match Chacun pour Soi — ${d.players.length} combattants, ${d.questions} questions !`;
    } else {
      const team = me ? me.team : null;
      if (d.winner === 'tie') {
        title.textContent = 'ÉGALITÉ !';
        title.classList.add('tie');
        Sound.boing();
      } else if (d.winner === team) {
        title.textContent = 'VICTOIRE !';
        confetti();
        Sound.win();
        coinsWon = 100;
      } else {
        title.textContent = 'DÉFAITE…';
        title.classList.add('lose');
        Sound.lose();
      }

      $('#end-sub').textContent = d.forfeit
        ? "L'équipe adverse a pris la fuite 🏃💨"
        : `${d.questions} questions disputées en 5 minutes`;

      $('#end-red').textContent = d.teamScores.red;
      $('#end-blue').textContent = d.teamScores.blue;
      $('.end-team.red').classList.toggle('winner', d.winner === 'red');
      $('.end-team.blue').classList.toggle('winner', d.winner === 'blue');
    }

    // Récompense en Noob-Bux
    $('#end-coins-earned').textContent = `+${coinsWon} Noob-Bux 🪙`;
    updateCoinsDisplay(coinsWon);

    // Podium complet
    const list = $('#end-players');
    list.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    d.players.forEach((p, i) => {
      const row = el('div', `podium-row ${p.team}` + (isMe(p.id) ? ' me' : ''));
      row.dataset.pid = p.id;
      row.style.animationDelay = (i * 0.07) + 's';
      row.appendChild(el('span', 'rank', medals[i] || `#${i + 1}`));
      row.appendChild(miniAv(p.avatar));
      row.appendChild(el('span', 'pname', (p.isBot ? '🤖 ' : '') + p.name + (isMe(p.id) ? ' (toi)' : '') + (i === 0 && p.score > 0 ? '  👑 MVP' : '')));
      row.appendChild(el('span', 'pscore', p.score + ' pts'));
      list.appendChild(row);
    });

    updateEndButtons();
  });

  socket.on('leftRoom', () => {
    room = null;
    q = null;
    show('home');
  });

  $('#btn-replay').addEventListener('click', () => socket.emit('playAgain'));
  $('#btn-menu').addEventListener('click', () => socket.emit('leaveRoom'));

  // ─────────── Sons & Musique ───────────
  const muteBtn = $('#btn-mute');
  muteBtn.textContent = Sound.muted ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    muteBtn.textContent = Sound.toggle() ? '🔇' : '🔊';
  });

  const musicBtn = $('#btn-music');
  musicBtn.textContent = Sound.musicMuted ? '🎵❌' : '🎵';
  musicBtn.addEventListener('click', () => {
    musicBtn.textContent = Sound.toggleMusic() ? '🎵❌' : '🎵';
  });

  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  // ─────────── Init ───────────
  renderAvatarPreview();
  renderAvatarControls();
})();
