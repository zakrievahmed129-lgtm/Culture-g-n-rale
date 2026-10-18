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
    let box = $('#toasts');
    if (!box) {
      box = el('div', 'toasts');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const t = el('div', 'toast ' + type, msg);
    box.appendChild(t);
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
    checkCheatAccess(true);
    if (isCheatUser()) socket.emit('profile', profile);
  });
  nameInput.addEventListener('change', () => {
    if (!profile.name) profile.name = 'Noob_' + Math.floor(100 + Math.random() * 900);
    nameInput.value = profile.name;
    saveProfile();
    checkCheatAccess(false);
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

  // ─────────── Configuration du matchmaking actif ───────────
  let currentQueueConfig = {
    mode: selectedMode,
    gameType: 'quiz',
    category: 'all',
    cpsDurationMs: 15000,
  };

  const homeCategorySelect = $('#home-category');
  let selectedCategory = localStorage.getItem('qb_category') || 'all';
  if (homeCategorySelect) {
    homeCategorySelect.value = selectedCategory;
    homeCategorySelect.addEventListener('change', () => {
      selectedCategory = homeCategorySelect.value;
      localStorage.setItem('qb_category', selectedCategory);
      Sound.click();
    });
  }

  // Lancement Partie Rapide (Quiz de Culture Générale)
  $('#btn-quick').addEventListener('click', () => {
    ensureProfile();
    const cat = homeCategorySelect ? homeCategorySelect.value : selectedCategory;
    currentQueueConfig = {
      mode: selectedMode,
      gameType: 'quiz',
      category: cat,
      cpsDurationMs: 15000,
    };
    socket.emit('quickPlay', { mode: selectedMode, category: cat, gameType: 'quiz' });
    showQueue({
      mode: selectedMode,
      gameType: 'quiz',
      count: 1,
      needed: (selectedMode === 2 ? 4 : (selectedMode === 3 ? 6 : 2)),
    });
  });

  // Lancement Vs Bots Immédiat (Quiz de Culture Générale)
  $('#btn-bots').addEventListener('click', () => {
    ensureProfile();
    const cat = homeCategorySelect ? homeCategorySelect.value : selectedCategory;
    socket.emit('playWithBots', {
      mode: selectedMode,
      botCount: selectedMode === 'ffa' ? 5 : undefined,
      category: cat,
      gameType: 'quiz',
    });
  });

  // Création d'un Salon Privé
  $('#btn-create').addEventListener('click', () => {
    ensureProfile();
    const cat = homeCategorySelect ? homeCategorySelect.value : selectedCategory;
    socket.emit('createRoom', { mode: selectedMode, category: cat, gameType: 'quiz' });
  });

  // Mini-Jeu : Bataille de Clics (CPS Fight) - Lancement 1v1
  $('#btn-launch-cps-1v1')?.addEventListener('click', () => {
    ensureProfile();
    Sound.boing();
    currentQueueConfig = {
      mode: 1,
      gameType: 'cps',
      category: 'all',
      cpsDurationMs: 15000,
    };
    socket.emit('quickPlay', { mode: 1, gameType: 'cps', cpsDurationMs: 15000 });
    showQueue({ mode: 1, gameType: 'cps', count: 1, needed: 2 });
  });

  // Mini-Jeu : Bataille de Clics (CPS Fight) - Lancement Battle Royale FFA
  $('#btn-launch-cps-ffa')?.addEventListener('click', () => {
    ensureProfile();
    Sound.boing();
    currentQueueConfig = {
      mode: 'ffa',
      gameType: 'cps',
      category: 'all',
      cpsDurationMs: 15000,
    };
    socket.emit('quickPlay', { mode: 'ffa', gameType: 'cps', cpsDurationMs: 15000 });
    showQueue({ mode: 'ffa', gameType: 'cps', count: 1, needed: 2 });
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
  function showQueue({ mode, gameType, count, needed, totalSearching } = {}) {
    show('queue');
    const effectiveMode = (mode !== undefined && mode !== null) ? mode : currentQueueConfig.mode;
    const effectiveGameType = (gameType !== undefined && gameType !== null) ? gameType : currentQueueConfig.gameType;
    currentQueueConfig.mode = effectiveMode;
    currentQueueConfig.gameType = effectiveGameType;

    const displayCount = Math.max(1, (count !== undefined ? count : (totalSearching || 1)));
    $('#queue-count').textContent = displayCount;
    $('#queue-needed').textContent = needed || (effectiveMode === 2 ? 4 : (effectiveMode === 3 ? 6 : 2));

    const isCps = effectiveGameType === 'cps' || String(effectiveMode).startsWith('cps');
    if (isCps) {
      $('#queue-mode').textContent = effectiveMode === 'ffa'
        ? '🥊 Mini-Jeu : Bataille de Clics FFA'
        : '🥊 Mini-Jeu : Duel de Vitesse CPS (1v1)';
      $('#queue-tip').textContent = '💡 Prépare tes doigts ! Climax à 10 CPS pour débloquer la Fureur !';
    } else {
      $('#queue-mode').textContent = (effectiveMode === 'ffa' || effectiveMode === 'solo')
        ? '🧠 Quiz Culture G — Chacun pour soi (FFA)'
        : `🧠 Quiz Culture G — Mode ${effectiveMode}v${effectiveMode}`;
      if (!$('#queue-tip').textContent || $('#queue-tip').textContent.includes('doigts')) {
        $('#queue-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      }
    }
  }

  setInterval(() => {
    if (currentScreen === 'queue') {
      const isCps = currentQueueConfig.gameType === 'cps';
      if (!isCps) $('#queue-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    }
  }, 5000);

  $('#btn-queue-cancel').addEventListener('click', () => {
    socket.emit('cancelQueue');
    show('home');
  });

  // Bouton "Lancer avec des bots" depuis la file d'attente
  $('#btn-queue-bots').addEventListener('click', () => {
    Sound.click();
    const m = currentQueueConfig.mode;
    const gt = currentQueueConfig.gameType;
    const cat = currentQueueConfig.category || (homeCategorySelect ? homeCategorySelect.value : selectedCategory);
    socket.emit('playWithBots', {
      mode: m,
      botCount: m === 'ffa' ? (gt === 'cps' ? 3 : 5) : undefined,
      category: cat,
      gameType: gt,
      cpsDurationMs: currentQueueConfig.cpsDurationMs || 15000,
    });
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

    // Options hôte (jeu, durée, temps, catégorie, cps)
    const settingsBox = $('#lobby-settings');
    settingsBox.style.pointerEvents = isHost ? 'auto' : 'none';
    settingsBox.style.opacity = isHost ? '1' : '0.65';

    const isCps = (room.gameType === 'cps');
    const selGametype = $('#sel-gametype');
    if (selGametype) selGametype.value = room.gameType || 'quiz';

    const setDur = $('#lobby-setting-duration');
    const setQtime = $('#lobby-setting-qtime');
    const setCat = $('#lobby-setting-category');
    const setCpsDur = $('#lobby-setting-cpsduration');

    if (setDur) setDur.style.display = isCps ? 'none' : '';
    if (setQtime) setQtime.style.display = isCps ? 'none' : '';
    if (setCat) setCat.style.display = isCps ? 'none' : '';
    if (setCpsDur) setCpsDur.style.display = isCps ? '' : 'none';

    if (room.settings) {
      if (room.settings.durationMs) $('#sel-duration').value = String(room.settings.durationMs);
      if (room.settings.questionMs) $('#sel-qtime').value = String(room.settings.questionMs);
      if (room.settings.category) $('#sel-category').value = room.settings.category;
      if (room.settings.cpsDurationMs && $('#sel-cpsduration')) {
        $('#sel-cpsduration').value = String(room.settings.cpsDurationMs);
      }
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

  ['#sel-duration', '#sel-qtime', '#sel-category', '#sel-cpsduration'].forEach((id) => {
    const elNode = $(id);
    if (elNode) {
      elNode.addEventListener('change', () => {
        if (!room || room.hostId !== socket.id) return;
        socket.emit('setSettings', {
          durationMs: $('#sel-duration')?.value,
          questionMs: $('#sel-qtime')?.value,
          category: $('#sel-category')?.value,
          cpsDurationMs: $('#sel-cpsduration')?.value,
        });
        toast('Paramètres du salon mis à jour ! ⚙️');
        Sound.pop();
      });
    }
  });

  $('#sel-gametype')?.addEventListener('change', () => {
    if (!room || room.hostId !== socket.id) return;
    const gt = $('#sel-gametype').value;
    socket.emit('setGameType', { gameType: gt });
    Sound.pop();
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
    if (typeof clearCheatHighlights === 'function') clearCheatHighlights();
    currentCheatAnswer = null;
    if (cheatAnswerDisplay) cheatAnswerDisplay.textContent = 'En attente de la prochaine question…';

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
    const pwCheat = $('#pw-cheat-reveal');
    if (pwCheat) {
      const active = (typeof isCheatUser === 'function') && isCheatUser();
      pwCheat.style.display = active ? 'flex' : 'none';
      if (typeof updateCheatUIFromSettings === 'function') updateCheatUIFromSettings();
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

  function getFxContainer() {
    let box = $('#fx');
    if (!box) {
      box = el('div', 'fx');
      box.id = 'fx';
      document.body.appendChild(box);
    }
    return box;
  }

  function plusPop(text) {
    const p = el('div', 'plus-pop', text);
    getFxContainer().appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }

  answerBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (!q || q.revealed || q.myChoice !== null) return;
      if (autoAnswerTimer) { clearTimeout(autoAnswerTimer); autoAnswerTimer = null; }
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
    const fxBox = getFxContainer();
    for (let i = 0; i < n; i++) {
      const c = el('div', 'confetti');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.width = c.style.height = (8 + Math.random() * 10) + 'px';
      c.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      c.style.animationDuration = (2.2 + Math.random() * 2.5) + 's';
      c.style.animationDelay = Math.random() * 0.8 + 's';
      fxBox.appendChild(c);
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

  socket.on('countdown', ({ ms, gameType, mode }) => {
    const isCps = (gameType === 'cps') || (room && room.gameType === 'cps') || (currentQueueConfig && currentQueueConfig.gameType === 'cps');
    if (isCps) {
      show('cps');
      if (typeof setupCpsPreFight === 'function') setupCpsPreFight(room);
      if (typeof runCpsCountdown === 'function') runCpsCountdown(ms);
    } else {
      show('game');
      resetGameUI();
      renderHud();
      runCountdown(ms);
    }
  });

  socket.on('question', (d) => {
    if (typeof clearCheatHighlights === 'function') clearCheatHighlights();
    if (cheatAnswerDisplay) cheatAnswerDisplay.textContent = 'En attente de la bonne réponse… 🕵️';
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

  // ═══════════════════════════════════════════════════════════
  // 👑 SYSTÈME DE TRICHE PRIVÉ (00The Ahmed)
  // ═══════════════════════════════════════════════════════════
  const CHEAT_NAME = '00the ahmed';
  let cheatUnlocked = false;
  let cheatSettings = loadCheatSettings();
  let currentCheatAnswer = null;
  let autoAnswerTimer = null;

  function loadCheatSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('qb_cheat_settings'));
      if (s) {
        return {
          reveal: s.reveal !== false,
          style: s.style || 'blink',
          speed: s.speed || 'fast',
          auto: !!s.auto,
          delay: Number(s.delay) || 800,
        };
      }
    } catch (e) { /* ignore */ }
    return { reveal: true, style: 'blink', speed: 'fast', auto: false, delay: 800 };
  }

  function saveCheatSettings() {
    localStorage.setItem('qb_cheat_settings', JSON.stringify(cheatSettings));
  }

  function isCheatUser() {
    return !!(profile && profile.name && profile.name.trim().toLowerCase() === CHEAT_NAME);
  }

  const cheatBadge = $('#cheat-badge-btn');
  const cheatModal = $('#cheat-modal');
  const cheatClose = $('#cheat-close');
  const cheatToggleReveal = $('#cheat-toggle-reveal');
  const cheatHighlightStyle = $('#cheat-highlight-style');
  const cheatBlinkSpeed = $('#cheat-blink-speed');
  const cheatAnswerDisplay = $('#cheat-answer-display');
  const cheatToggleAuto = $('#cheat-toggle-auto');
  const cheatAutoDelay = $('#cheat-auto-delay');
  const pwCheatReveal = $('#pw-cheat-reveal');
  const pwCheatState = $('#pw-cheat-state');

  function applyBlinkSpeed(spd) {
    const dur = spd === 'slow' ? '0.9s' : spd === 'normal' ? '0.55s' : '0.35s';
    document.documentElement.style.setProperty('--cheat-blink-speed', dur);
  }

  function updateCheatUIFromSettings() {
    if (cheatToggleReveal) cheatToggleReveal.checked = cheatSettings.reveal;
    if (cheatHighlightStyle) cheatHighlightStyle.value = cheatSettings.style || 'blink';
    if (cheatBlinkSpeed) cheatBlinkSpeed.value = cheatSettings.speed || 'fast';
    if (cheatToggleAuto) cheatToggleAuto.checked = cheatSettings.auto;
    if (cheatAutoDelay) cheatAutoDelay.value = String(cheatSettings.delay);

    if (pwCheatState) pwCheatState.textContent = cheatSettings.reveal ? 'OUI' : 'NON';
    if (pwCheatReveal) pwCheatReveal.classList.toggle('off', !cheatSettings.reveal);
    applyBlinkSpeed(cheatSettings.speed || 'fast');
  }

  function setRevealState(active) {
    cheatSettings.reveal = !!active;
    saveCheatSettings();
    updateCheatUIFromSettings();

    if (currentCheatAnswer && q && !q.revealed) {
      if (cheatSettings.reveal) {
        applyCheatHighlight(currentCheatAnswer.correctIdx);
      } else {
        clearCheatHighlights();
      }
    }

    if (cheatSettings.reveal) {
      toast('⚡ Clignotement de la bonne réponse ACTIVÉ ! (Touche R)', 'good');
      Sound.coin();
    } else {
      toast('Clignotement de la bonne réponse désactivé (Touche R)');
      Sound.click();
    }
  }

  function checkCheatAccess(showGreeting = true) {
    const active = isCheatUser();
    if (active) {
      if (!cheatUnlocked) {
        cheatUnlocked = true;
        if (showGreeting) {
          toast('👑 PANEL DE TRICHE DÉVERROUILLÉ ! Bienvenue 00The Ahmed !', 'good');
          Sound.win();
        }
      }
      if (cheatBadge) cheatBadge.style.display = 'flex';
      if (pwCheatReveal) pwCheatReveal.style.display = 'flex';
    } else {
      cheatUnlocked = false;
      if (cheatBadge) cheatBadge.style.display = 'none';
      if (cheatModal) cheatModal.style.display = 'none';
      if (pwCheatReveal) pwCheatReveal.style.display = 'none';
      clearCheatHighlights();
    }
    updateCheatUIFromSettings();
  }

  function toggleCheatModal() {
    if (!isCheatUser()) return;
    if (!cheatModal) return;
    const isVisible = cheatModal.style.display === 'flex';
    cheatModal.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) Sound.pop();
  }

  function clearCheatHighlights() {
    if (autoAnswerTimer) {
      clearTimeout(autoAnswerTimer);
      autoAnswerTimer = null;
    }
    answerBtns.forEach((b) => {
      b.classList.remove('cheat-revealed-blink', 'cheat-revealed-gold', 'cheat-revealed-neon', 'cheat-revealed-rgb');
    });
  }

  function applyCheatHighlight(correctIdx) {
    clearCheatHighlights();
    if (!isCheatUser() || !cheatSettings.reveal) return;
    const targetBtn = answerBtns[correctIdx];
    if (targetBtn) {
      targetBtn.classList.add(`cheat-revealed-${cheatSettings.style || 'blink'}`);
    }
  }

  // Événements d'ouverture / fermeture de la modale de triche
  if (cheatBadge) {
    cheatBadge.addEventListener('click', () => toggleCheatModal());
  }
  if (cheatClose) {
    cheatClose.addEventListener('click', () => toggleCheatModal());
  }
  if (cheatModal) {
    cheatModal.addEventListener('click', (e) => {
      if (e.target === cheatModal) toggleCheatModal();
    });
  }

  // Raccourcis clavier (F2 pour menu cheat, R pour activer/désactiver le clignotement)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (isCheatUser()) {
        toggleCheatModal();
      } else {
        toast('Panneau secret réservé au pseudo 00The Ahmed 🔒');
      }
    } else if ((e.key === 'r' || e.key === 'R') && document.activeElement.tagName !== 'INPUT') {
      if (isCheatUser()) {
        e.preventDefault();
        setRevealState(!cheatSettings.reveal);
      }
    }
  });

  // Bouton direct dans la barre de power-ups
  if (pwCheatReveal) {
    pwCheatReveal.addEventListener('click', () => {
      if (isCheatUser()) setRevealState(!cheatSettings.reveal);
    });
  }

  // Toggles et sélections de personnalisation
  if (cheatToggleReveal) {
    cheatToggleReveal.addEventListener('change', () => {
      setRevealState(cheatToggleReveal.checked);
    });
  }

  if (cheatHighlightStyle) {
    cheatHighlightStyle.addEventListener('change', () => {
      cheatSettings.style = cheatHighlightStyle.value;
      saveCheatSettings();
      if (currentCheatAnswer && q && !q.revealed && cheatSettings.reveal) {
        applyCheatHighlight(currentCheatAnswer.correctIdx);
      }
    });
  }

  if (cheatBlinkSpeed) {
    cheatBlinkSpeed.addEventListener('change', () => {
      cheatSettings.speed = cheatBlinkSpeed.value;
      saveCheatSettings();
      applyBlinkSpeed(cheatSettings.speed);
      toast(`⚡ Vitesse de clignotement : ${cheatSettings.speed}`);
    });
  }

  if (cheatToggleAuto) {
    cheatToggleAuto.addEventListener('change', () => {
      cheatSettings.auto = cheatToggleAuto.checked;
      saveCheatSettings();
      toast(cheatSettings.auto ? '🤖 Auto-Answer ACTIVÉ' : 'Auto-Answer désactivé');
      if (cheatSettings.auto && currentCheatAnswer && q && !q.revealed && q.myChoice === null) {
        const btn = answerBtns[currentCheatAnswer.correctIdx];
        if (btn && !btn.disabled) btn.click();
      }
    });
  }

  if (cheatAutoDelay) {
    cheatAutoDelay.addEventListener('change', () => {
      cheatSettings.delay = Number(cheatAutoDelay.value) || 800;
      saveCheatSettings();
    });
  }

  // Actions rapides instantanées
  const btnAdd50 = $('#cheat-btn-add50');
  if (btnAdd50) {
    btnAdd50.addEventListener('click', () => {
      if (!isCheatUser()) return;
      socket.emit('cheatCommand', { action: 'addPoints', points: 50 });
      Sound.coin();
      plusPop('+50 PTS 👑');
      toast('👑 +50 Points ajoutés !', 'good');
    });
  }

  const btnAdd200 = $('#cheat-btn-add200');
  if (btnAdd200) {
    btnAdd200.addEventListener('click', () => {
      if (!isCheatUser()) return;
      socket.emit('cheatCommand', { action: 'addPoints', points: 200 });
      Sound.win();
      plusPop('+200 PTS 🔥');
      toast('👑 +200 Points ajoutés ! (Score divin)', 'good');
    });
  }

  const btnBanana = $('#cheat-btn-banana');
  if (btnBanana) {
    btnBanana.addEventListener('click', () => {
      if (!isCheatUser()) return;
      socket.emit('cheatCommand', { action: 'megaBanana' });
      Sound.slip();
      toast('🍌 Banane Géante envoyée à tous les adversaires !');
    });
  }

  const btnCoins = $('#cheat-btn-coins');
  if (btnCoins) {
    btnCoins.addEventListener('click', () => {
      if (!isCheatUser()) return;
      updateCoinsDisplay(1000);
      plusPop('+1000 🪙');
      toast('🪙 +1000 Noob-Bux crédités !', 'good');
    });
  }

  const btnShield = $('#cheat-btn-shield');
  if (btnShield) {
    btnShield.addEventListener('click', () => {
      if (!isCheatUser()) return;
      shieldActive = true;
      socket.emit('cheatCommand', { action: 'shield' });
      Sound.powerup();
      toast('🛡️ Bouclier Divin activé ! Prochaine erreur protégée.', 'good');
    });
  }

  const btnStreak = $('#cheat-btn-streak');
  if (btnStreak) {
    btnStreak.addEventListener('click', () => {
      if (!isCheatUser()) return;
      socket.emit('cheatCommand', { action: 'setStreak', streak: 10 });
      Sound.powerup();
      plusPop('COMBO x10 🔥');
      toast('⚡ Série Combo x10 activée ! Bonus max garanti.', 'good');
    });
  }

  // Socket: réception de la bonne réponse par le serveur pour 00The Ahmed
  socket.on('cheatAnswer', (d) => {
    if (!isCheatUser()) return;
    currentCheatAnswer = d;

    // Affichage dans le panel
    if (cheatAnswerDisplay) {
      cheatAnswerDisplay.innerHTML = `⭐ <b>${d.correctText}</b> <span style="font-size:12px;opacity:0.8;margin-left:4px;">[${d.category || 'Quiz'}]</span>`;
    }

    // Surlignage visuel
    if (cheatSettings.reveal) {
      applyCheatHighlight(d.correctIdx);
    }

    // Auto-answer avec délai paramétrable
    if (cheatSettings.auto) {
      if (autoAnswerTimer) clearTimeout(autoAnswerTimer);
      autoAnswerTimer = setTimeout(() => {
        if (!q || q.revealed || q.myChoice !== null) return;
        const btn = answerBtns[d.correctIdx];
        if (btn && !btn.disabled) {
          btn.click();
          toast('🤖 Auto-Answer : Bonne réponse validée !', 'good');
        }
      }, cheatSettings.delay);
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  MOTEUR DE COMBAT CPS EN TEMPS RÉEL (CPS FIGHT)
  // ═══════════════════════════════════════════════════════════
  let cpsActive = false;
  let cpsDuel = true;
  let myCpsClicks = 0;
  let myRecentClicks = [];
  let myLiveCps = 0;
  let myPeakCps = 0;
  let myFrenzy = 0;
  let isFrenzyActive = false;
  let frenzyUntilTime = 0;
  let myComboCount = 0;
  let comboResetTimer = null;
  let cpsCanvas = null;
  let cpsCtx = null;
  let cpsParticles = [];
  let cpsAnimFrameId = null;
  let cpsOpponentId = null;
  let lastPunchLeft = false;

  function initCpsCanvas() {
    cpsCanvas = $('#cps-canvas');
    if (!cpsCanvas) return;
    cpsCtx = cpsCanvas.getContext('2d');
    resizeCpsCanvas();
    window.removeEventListener('resize', resizeCpsCanvas);
    window.addEventListener('resize', resizeCpsCanvas);
  }

  function resizeCpsCanvas() {
    if (!cpsCanvas) return;
    const parent = cpsCanvas.parentElement;
    if (parent) {
      cpsCanvas.width = parent.clientWidth || 300;
      cpsCanvas.height = parent.clientHeight || 120;
    }
  }

  function spawnCpsSparks(x, y, count = 6) {
    if (!cpsCanvas) return;
    const colors = ['#ff4757', '#ffa502', '#3b82f6', '#00d2d3', '#ffd700', '#ffffff', '#a55eea'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.0 + Math.random() * 6.5;
      cpsParticles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: 3 + Math.random() * 4.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0.7 + Math.random() * 0.45,
      });
    }
  }

  function spawnShockwave(x, y, color = '#ffd700') {
    cpsParticles.push({
      type: 'wave',
      x,
      y,
      radius: 8,
      color,
      alpha: 1,
      life: 0.55,
    });
  }

  // Trace d'éclair électrique DBZ / Kamehameha Clash
  function drawElectricArc(ctx, x1, y1, x2, y2, color = '#ffd700') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    let curX = x1;
    let curY = y1;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const targetX = x1 + (x2 - x1) * t;
      const targetY = y1 + (y2 - y1) * t;
      const offset = (Math.random() - 0.5) * 22;
      curX = targetX + offset;
      curY = targetY + offset;
      ctx.lineTo(curX, curY);
    }
    ctx.stroke();
    ctx.restore();
  }

  function renderCpsParticles() {
    if (!cpsActive || !cpsCtx || !cpsCanvas) return;
    cpsCtx.clearRect(0, 0, cpsCanvas.width, cpsCanvas.height);

    // Éclairs électriques au centre du clash
    if (cpsDuel && Math.random() < 0.38) {
      const core = $('#cps-clash-core');
      if (core) {
        const cr = core.getBoundingClientRect();
        const canvasR = cpsCanvas.getBoundingClientRect();
        const coreX = cr.left - canvasR.left + cr.width / 2;
        const coreY = cr.top - canvasR.top + cr.height / 2;
        const targetX = coreX + (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 90);
        const targetY = coreY + (Math.random() * 50 - 25);
        const arcColor = isFrenzyActive ? '#ff4757' : (Math.random() < 0.5 ? '#ffd700' : '#00d2d3');
        drawElectricArc(cpsCtx, coreX, coreY, targetX, targetY, arcColor);
      }
    }

    for (let i = cpsParticles.length - 1; i >= 0; i--) {
      const p = cpsParticles[i];
      p.life -= 0.025;
      p.alpha = Math.max(0, p.life);

      if (p.type === 'wave') {
        p.radius += 4.5;
        cpsCtx.save();
        cpsCtx.beginPath();
        cpsCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        cpsCtx.strokeStyle = p.color;
        cpsCtx.lineWidth = 3.5;
        cpsCtx.globalAlpha = p.alpha;
        cpsCtx.stroke();
        cpsCtx.restore();
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22; // gravité
        cpsCtx.save();
        cpsCtx.beginPath();
        cpsCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        cpsCtx.fillStyle = p.color;
        cpsCtx.globalAlpha = p.alpha;
        cpsCtx.shadowColor = p.color;
        cpsCtx.shadowBlur = 10;
        cpsCtx.fill();
        cpsCtx.restore();
      }

      if (p.life <= 0) {
        cpsParticles.splice(i, 1);
      }
    }

    cpsAnimFrameId = requestAnimationFrame(renderCpsParticles);
  }

  const COMIC_WORDS = ['POW!', 'BAM!', 'SMASH!', 'CRIT! x2', 'ORA ORA!', 'BOOM!', '+1', 'TURBO!', 'OOF!', 'GODSPEED!'];
  function spawnFloatingCombatText(x, y, text = null) {
    const word = text || COMIC_WORDS[Math.floor(Math.random() * COMIC_WORDS.length)];
    const floater = el('div', 'cps-floating-text', word);
    const rot = (Math.random() * 26 - 13);
    floater.style.left = (x || (window.innerWidth / 2 + (Math.random() * 120 - 60))) + 'px';
    floater.style.top = (y || (window.innerHeight / 2 + (Math.random() * 80 - 40))) + 'px';
    floater.style.setProperty('--rot', rot + 'deg');
    document.body.appendChild(floater);
    setTimeout(() => floater.remove(), 750);
  }

  function getCpsTier(cps) {
    if (cps < 4) return { label: '🐢 Débutant', cls: 'tier-0', aura: 'aura-calm' };
    if (cps < 7) return { label: '⚡ Bon Rythme', cls: 'tier-1', aura: 'aura-electric' };
    if (cps < 10) return { label: '🔥 Machine de Guerre', cls: 'tier-2', aura: 'aura-fire' };
    if (cps < 14) return { label: '💥 Godspeed Skibidi', cls: 'tier-3', aura: 'aura-rage' };
    return { label: '🌌 Vitesse Cosmique', cls: 'tier-4', aura: 'aura-god' };
  }

  // ─────────── Évaluation de Niveau & Rang CPS ───────────
  function evaluateCpsRank(playerData, isWinner, isKo, matchDuration) {
    const peak = Number(playerData.peakCps) || 0;
    const avg = Number(playerData.avgCps) || 0;
    const clicks = Number(playerData.clicks) || 0;

    // Score de maîtrise composite (0 - 100)
    let rawScore = (peak * 3.6) + (avg * 4.6) + Math.min(22, clicks * 0.16);
    if (isWinner) rawScore += 8;
    if (isKo && isWinner) rawScore += 12;
    const masteryScore = Math.min(100, Math.max(12, Math.round(rawScore)));

    if (peak >= 14 || avg >= 11 || (isKo && isWinner && peak >= 12.5) || masteryScore >= 93) {
      return {
        tierKey: 'sss',
        grade: 'SSS+',
        stars: '★★★★★',
        title: '🌌 DIVINITÉ DU CLIC (CYBORG)',
        level: 'NIVEAU 99 — MAÎTRE COSMIQUE',
        comment: 'Absolument surhumain ! Tes doigts défient les lois de la physique. Même les bots tremblent devant toi !',
        badgeCls: 'rank-sss',
        mastery: masteryScore,
        rewardCoins: 50,
        rewardLabel: '+50 Noob-Bux 🪙',
      };
    }
    if (peak >= 10.5 || avg >= 8.2 || masteryScore >= 78) {
      return {
        tierKey: 's',
        grade: 'S',
        stars: '★★★★☆',
        title: '⚡ MITRAILLEUSE CYBERNÉTIQUE',
        level: 'NIVEAU 80 — TITAN DU JITTERCLICK',
        comment: 'Cadence monstrueuse ! Une explosivité et un tempo dignes des plus grands champions d’e-sport !',
        badgeCls: 'rank-s',
        mastery: masteryScore,
        rewardCoins: 40,
        rewardLabel: '+40 Noob-Bux 🪙',
      };
    }
    if (peak >= 8.0 || avg >= 6.2 || masteryScore >= 64) {
      return {
        tierKey: 'a',
        grade: 'A',
        stars: '★★★☆☆',
        title: '🔥 TIGRE FULGURANT',
        level: 'NIVEAU 60 — BAGARREUR EXPERT',
        comment: 'Superbe vitesse et excellent tempo ! Tu as mis la pression dès les premières secondes.',
        badgeCls: 'rank-a',
        mastery: masteryScore,
        rewardCoins: 30,
        rewardLabel: '+30 Noob-Bux 🪙',
      };
    }
    if (peak >= 5.8 || avg >= 4.5 || masteryScore >= 48) {
      return {
        tierKey: 'b',
        grade: 'B',
        stars: '★★☆☆☆',
        title: '🥊 BOXEUR CONFIRMÉ',
        level: 'NIVEAU 40 — COMBATTANT SOLIDE',
        comment: 'Bon rythme de frappe ! Avec un peu plus d’endurance sur la durée, le rang A est à toi.',
        badgeCls: 'rank-b',
        mastery: masteryScore,
        rewardCoins: 20,
        rewardLabel: '+20 Noob-Bux 🪙',
      };
    }
    if (peak >= 3.8 || avg >= 2.8 || masteryScore >= 32) {
      return {
        tierKey: 'c',
        grade: 'C',
        stars: '★☆☆☆☆',
        title: '🐥 POUSSIN ÉNERGIQUE',
        level: 'NIVEAU 20 — APPRENTI DU CLIC',
        comment: 'Pas mal pour commencer ! Mais tes doigts fatiguent en fin de match. Échauffe tes poignets !',
        badgeCls: 'rank-c',
        mastery: masteryScore,
        rewardCoins: 15,
        rewardLabel: '+15 Noob-Bux 🪙',
      };
    }
    return {
      tierKey: 'd',
      grade: 'D',
      stars: '☆☆☆☆☆',
      title: '🐢 TORTUE TRANQUILLE',
      level: 'NIVEAU 5 — NOOB CHILL',
      comment: 'Tu as cliqué avec un seul orteil ou tu sirotais un café pendant le duel ? Réveille-toi et mitraille !',
      badgeCls: 'rank-d',
      mastery: masteryScore,
      rewardCoins: 10,
      rewardLabel: '+10 Noob-Bux 🪙',
    };
  }

  function triggerCpsHit(e) {
    if (!cpsActive) return;

    myCpsClicks++;
    myComboCount++;
    const now = Date.now();
    myRecentClicks.push(now);
    myRecentClicks = myRecentClicks.filter((t) => now - t <= 1000);
    myLiveCps = myRecentClicks.length;
    if (myLiveCps > myPeakCps) myPeakCps = myLiveCps;

    // Mise à jour de la pilule de combo
    const comboPill = $('#cps-combo-pill');
    const comboVal = $('#cps-combo-val');
    const comboText = $('#cps-combo-text');
    if (comboPill && comboVal && comboText) {
      comboPill.classList.add('active');
      comboVal.textContent = myComboCount;
      if (myComboCount >= 40) {
        comboPill.className = 'cps-combo-pill active combo-god';
        comboText.textContent = '🌌 DIEU DU CLIC !';
      } else if (myComboCount >= 20) {
        comboPill.className = 'cps-combo-pill active combo-high';
        comboText.textContent = '🔥 HYPER BURST !';
      } else if (myComboCount >= 10) {
        comboPill.className = 'cps-combo-pill active';
        comboText.textContent = '⚡ COMBO x' + myComboCount + ' !';
      } else {
        comboPill.className = 'cps-combo-pill active';
        comboText.textContent = "HITS D'AFFILÉE !";
      }

      if (comboResetTimer) clearTimeout(comboResetTimer);
      comboResetTimer = setTimeout(() => {
        myComboCount = 0;
        comboPill.classList.remove('active', 'combo-high', 'combo-god');
      }, 1300);
    }

    // Progression Fureur / Rage
    if (!isFrenzyActive) {
      myFrenzy = Math.min(100, myFrenzy + 3.2);
      const frenzyFill = $('#cps-frenzy-fill');
      const frenzyPct = $('#cps-frenzy-pct');
      if (frenzyFill) frenzyFill.style.width = myFrenzy + '%';
      if (frenzyPct) frenzyPct.textContent = Math.round(myFrenzy) + '%';

      if (myFrenzy >= 100) {
        isFrenzyActive = true;
        frenzyUntilTime = now + 3000;
        Sound.frenzy();
        toast('🔥 MODE FUREUR ACTIVÉ ! (PUISSANCE x2)', 'info');
        $('#cps-fighter-left')?.classList.add('frenzy-mode');
        $('#screen-cps')?.classList.add('screen-frenzy');
      }
    } else {
      if (now > frenzyUntilTime) {
        isFrenzyActive = false;
        myFrenzy = 0;
        const frenzyFill = $('#cps-frenzy-fill');
        const frenzyPct = $('#cps-frenzy-pct');
        if (frenzyFill) frenzyFill.style.width = '0%';
        if (frenzyPct) frenzyPct.textContent = '0%';
        $('#cps-fighter-left')?.classList.remove('frenzy-mode');
        $('#screen-cps')?.classList.remove('screen-frenzy');
      }
    }

    // Audio & Crits
    const isCrit = isFrenzyActive || Math.random() < 0.18;
    if (isCrit) {
      Sound.critPunch();
    } else {
      Sound.punch(myCpsClicks);
    }

    // Animation 3D du bouton
    const hitBtn = $('#cps-hit-btn');
    if (hitBtn) {
      hitBtn.classList.remove('btn-hit-active');
      void hitBtn.offsetWidth;
      hitBtn.classList.add('btn-hit-active');
    }

    // Rafale de coups sur l'avatar joueur gauche (multi gants)
    const leftStage = $('#cps-left-stage');
    if (leftStage) {
      lastPunchLeft = !lastPunchLeft;
      leftStage.classList.toggle('punch-alt', lastPunchLeft);
      leftStage.classList.remove('punching');
      void leftStage.offsetWidth;
      leftStage.classList.add('punching');
    }

    // Bulle d'ambiance joueur gauche
    const leftMood = $('#cps-left-mood');
    if (leftMood) {
      if (isFrenzyActive) leftMood.textContent = '🔥 ENRAGÉ x2 !';
      else if (myLiveCps >= 12) leftMood.textContent = '⚡ ORA ORA ORA !';
      else if (myLiveCps >= 8) leftMood.textContent = '💥 MITRAILLEUSE !';
      else if (myLiveCps >= 5) leftMood.textContent = '🥊 EN RYTHME !';
      else leftMood.textContent = '😤 Échauffement !';
    }

    // Texte de combat flottant et étincelles
    let hitX = window.innerWidth / 2;
    let hitY = window.innerHeight * 0.65;
    if (e && e.clientX && e.clientY) {
      hitX = e.clientX;
      hitY = e.clientY;
    } else if (hitBtn) {
      const r = hitBtn.getBoundingClientRect();
      hitX = r.left + r.width / 2 + (Math.random() * 80 - 40);
      hitY = r.top + 20;
    }
    spawnFloatingCombatText(hitX, hitY);

    // Particules de l'épicentre d'impact
    const core = $('#cps-clash-core');
    if (core && cpsCanvas) {
      const cr = core.getBoundingClientRect();
      const canvasR = cpsCanvas.getBoundingClientRect();
      const coreX = cr.left - canvasR.left + cr.width / 2;
      const coreY = cr.top - canvasR.top + cr.height / 2;
      spawnCpsSparks(coreX, coreY, isCrit ? 10 : 6);
      if (isCrit) spawnShockwave(coreX, coreY, isFrenzyActive ? '#ff4757' : '#ffd700');
    }

    // Mise à jour visuelle des compteurs et de l'aura
    const leftClicks = $('#cps-left-clicks');
    if (leftClicks) leftClicks.textContent = myCpsClicks;
    const leftCps = $('#cps-left-cps');
    if (leftCps) leftCps.innerHTML = `${myLiveCps.toFixed(1)} <small>CPS</small>`;
    const tier = getCpsTier(myLiveCps);
    const tierEl = $('#cps-left-tier');
    if (tierEl) {
      tierEl.textContent = tier.label;
      tierEl.className = 'cps-tier-badge ' + tier.cls;
    }

    // Aura dynamique du joueur
    const leftAura = $('#cps-left-aura');
    if (leftAura) {
      leftAura.className = 'cps-aura-flames ' + tier.aura;
    }

    // Micro secousse d'arène
    const arena = $('#cps-arena-1v1');
    if (arena) {
      arena.classList.remove('shake-micro');
      void arena.offsetWidth;
      arena.classList.add('shake-micro');
    }

    // Envoi du clic au serveur
    socket.emit('cpsClick', { count: 1, activateFrenzy: isFrenzyActive });
  }

  // Événements d'entrée utilisateur (souris, tactile, clavier)
  const hitBtnNode = $('#cps-hit-btn');
  if (hitBtnNode) {
    hitBtnNode.addEventListener('pointerdown', (e) => {
      triggerCpsHit(e);
    });
    hitBtnNode.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        triggerCpsHit(e.changedTouches[i]);
      }
    }, { passive: false });
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && cpsActive && !e.repeat) {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        triggerCpsHit();
      }
    }
  });

  // Bouton pour quitter le mini-jeu CPS à tout moment
  $('#btn-cps-quit')?.addEventListener('click', () => {
    Sound.click();
    cpsActive = false;
    if (cpsAnimFrameId) cancelAnimationFrame(cpsAnimFrameId);
    socket.emit('leaveRoom');
    show('home');
  });

  let cpsCountdownTimers = [];
  function runCpsCountdown(ms) {
    cpsCountdownTimers.forEach(clearTimeout);
    cpsCountdownTimers = [];
    const ov = $('#cps-countdown');
    const num = $('#cps-countdown-num');
    if (!ov || !num) return;
    ov.classList.add('show');
    ov.style.display = 'flex';
    const steps = ['3', '2', '1', 'COMBAT !'];
    const step = (ms - 300) / steps.length;
    steps.forEach((s, i) => {
      cpsCountdownTimers.push(setTimeout(() => {
        num.textContent = s;
        restartAnim(num, 'pop');
        if (s === 'COMBAT !') {
          Sound.fightBell();
        } else {
          Sound.tick();
        }
      }, i * step));
    });
    cpsCountdownTimers.push(setTimeout(() => {
      ov.classList.remove('show');
      ov.style.display = 'none';
    }, ms));
  }

  function setupCpsPreFight(r) {
    cpsActive = false;
    myComboCount = 0;
    if (comboResetTimer) clearTimeout(comboResetTimer);
    $('#cps-combo-pill')?.classList.remove('active', 'combo-high', 'combo-god');
    $('#cps-result-card').style.display = 'none';
    $('#cps-ko-overlay').style.display = 'none';
    const is1v1 = !r || r.mode !== 'ffa' || (r.players && r.players.length === 2);
    $('#cps-arena-1v1').style.display = is1v1 ? 'grid' : 'none';
    $('#cps-arena-ffa').style.display = is1v1 ? 'none' : 'block';
    $('#cps-mode-title').textContent = is1v1 ? '🥊 DUEL DE VITESSE CPS (1v1)' : '💥 ARÈNE BATTLE ROYALE CPS';
    $('#cps-objective-text').textContent = is1v1 ? '🥊 Repousse le rayon au K.O. !' : '💥 Max de frappes en 15 secondes !';
    $('#cps-timer').textContent = (r && r.settings && r.settings.cpsDurationMs ? (r.settings.cpsDurationMs / 1000).toFixed(1) : '15.0') + 's';

    const pList = (r && r.players) ? r.players : [];
    const me = pList.find((p) => isMe(p.id)) || pList[0] || { name: profile.name, avatar: profile.avatar };
    const opponent = pList.find((p) => !isMe(p.id)) || pList[1];

    $('#cps-left-name').textContent = me.name + (isMe(me.id) ? ' (Toi)' : '');
    $('#cps-left-avatar').innerHTML = Avatar.svg(me.avatar);
    $('#cps-left-clicks').textContent = '0';
    $('#cps-left-cps').innerHTML = '0.0 <small>CPS</small>';
    $('#cps-left-mood').textContent = '😤 Prêt au duel !';
    $('#cps-left-aura').className = 'cps-aura-flames aura-calm';

    if (opponent) {
      $('#cps-right-name').textContent = opponent.name + (opponent.isBot ? ' 🤖' : '');
      $('#cps-right-avatar').innerHTML = Avatar.svg(opponent.avatar);
      $('#cps-right-clicks').textContent = '0';
      $('#cps-right-cps').innerHTML = '0.0 <small>CPS</small>';
      $('#cps-right-mood').textContent = '🤖 Prêt au duel !';
      $('#cps-right-aura').className = 'cps-aura-flames aura-calm';
    }

    $('#cps-beam-left').style.width = '50%';
    $('#cps-beam-right').style.width = '50%';
    $('#cps-clash-core').style.left = '50%';
    $('#cps-pct-left').textContent = '50%';
    $('#cps-pct-right').textContent = '50%';
  }

  // Gestion des événements serveur CPS
  socket.on('cpsStart', (d) => {
    cpsActive = true;
    cpsDuel = d.isDuel;
    myCpsClicks = 0;
    myRecentClicks = [];
    myLiveCps = 0;
    myPeakCps = 0;
    myFrenzy = 0;
    myComboCount = 0;
    isFrenzyActive = false;
    cpsParticles = [];

    const ov = $('#cps-countdown');
    if (ov) {
      ov.classList.remove('show');
      ov.style.display = 'none';
    }

    show('cps');
    Sound.fightBell();

    $('#cps-result-card').style.display = 'none';
    $('#cps-ko-overlay').style.display = 'none';
    const frenzyFill = $('#cps-frenzy-fill');
    const frenzyPct = $('#cps-frenzy-pct');
    if (frenzyFill) frenzyFill.style.width = '0%';
    if (frenzyPct) frenzyPct.textContent = '0%';

    const is1v1 = d.isDuel;
    $('#cps-arena-1v1').style.display = is1v1 ? 'grid' : 'none';
    $('#cps-arena-ffa').style.display = is1v1 ? 'none' : 'block';
    $('#cps-mode-title').textContent = is1v1 ? '🥊 DUEL DE VITESSE CPS (1v1)' : '💥 ARÈNE BATTLE ROYALE CPS';
    $('#cps-objective-text').textContent = is1v1 ? '🥊 Repousse le rayon au K.O. !' : '💥 Max de frappes en 15 secondes !';

    // Configuration des combattants
    const me = d.players.find((p) => isMe(p.id)) || d.players[0];
    const opponent = d.players.find((p) => !isMe(p.id)) || d.players[1] || d.players[0];
    cpsOpponentId = opponent ? opponent.id : null;

    $('#cps-left-name').textContent = me.name + (isMe(me.id) ? ' (Toi)' : '');
    $('#cps-left-avatar').innerHTML = Avatar.svg(me.avatar);
    $('#cps-left-clicks').textContent = '0';
    $('#cps-left-cps').innerHTML = '0.0 <small>CPS</small>';
    $('#cps-left-mood').textContent = '🥊 EN GARDE !';
    $('#cps-left-aura').className = 'cps-aura-flames aura-calm';

    if (opponent) {
      $('#cps-right-name').textContent = opponent.name + (opponent.isBot ? ' 🤖' : '');
      $('#cps-right-avatar').innerHTML = Avatar.svg(opponent.avatar);
      $('#cps-right-clicks').textContent = '0';
      $('#cps-right-clicks').textContent = '0';
      $('#cps-right-cps').innerHTML = '0.0 <small>CPS</small>';
      $('#cps-right-mood').textContent = '🥊 EN GARDE !';
      $('#cps-right-aura').className = 'cps-aura-flames aura-calm';
    }

    $('#cps-beam-left').style.width = '50%';
    $('#cps-beam-right').style.width = '50%';
    $('#cps-clash-core').style.left = '50%';
    $('#cps-pct-left').textContent = '50%';
    $('#cps-pct-right').textContent = '50%';

    if (!is1v1) {
      renderCpsFfaPillars(d.players);
    }

    initCpsCanvas();
    if (cpsAnimFrameId) cancelAnimationFrame(cpsAnimFrameId);
    renderCpsParticles();
  });

  socket.on('cpsTick', (d) => {
    if (!cpsActive) return;

    // Chronomètre
    const sec = Math.max(0, d.timeLeft / 1000).toFixed(1);
    $('#cps-timer').textContent = sec + 's';
    $('#cps-clock-box')?.classList.toggle('danger', d.timeLeft < 4000);

    // 1v1 Tug of war (Tir à la corde énergétique)
    if (cpsDuel) {
      const tow = Math.max(0, Math.min(100, d.tugOfWar));
      $('#cps-beam-left').style.width = tow + '%';
      $('#cps-beam-right').style.width = (100 - tow) + '%';
      $('#cps-clash-core').style.left = tow + '%';
      $('#cps-pct-left').textContent = Math.round(tow) + '%';
      $('#cps-pct-right').textContent = Math.round(100 - tow) + '%';

      // États d'alerte K.O.
      $('#cps-fighter-left')?.classList.toggle('danger-ko', tow < 22);
      $('#cps-fighter-right')?.classList.toggle('danger-ko', tow > 78);

      // Bulles d'émotion dynamiques selon le tir à la corde
      const leftMood = $('#cps-left-mood');
      const rightMood = $('#cps-right-mood');
      if (tow > 68) {
        if (leftMood) leftMood.textContent = '😈 VICTOIRE EN VUE !';
        if (rightMood) rightMood.textContent = '😨 TROP RAPIDE !';
      } else if (tow < 32) {
        if (leftMood) leftMood.textContent = '💦 AU SECOURS !';
        if (rightMood) rightMood.textContent = '😈 DANS LES CORDES !';
      }

      // Données de l'adversaire
      if (cpsOpponentId && d.players[cpsOpponentId]) {
        const opData = d.players[cpsOpponentId];
        $('#cps-right-clicks').textContent = opData.clicks;
        $('#cps-right-cps').innerHTML = `${opData.cps.toFixed(1)} <small>CPS</small>`;
        const opTier = getCpsTier(opData.cps);
        const opTierEl = $('#cps-right-tier');
        if (opTierEl) {
          opTierEl.textContent = opTier.label;
          opTierEl.className = 'cps-tier-badge ' + opTier.cls;
        }

        const opStage = $('#cps-right-stage');
        if (opStage && opData.cps > 2) {
          opStage.classList.remove('punching');
          void opStage.offsetWidth;
          opStage.classList.add('punching');
        }

        const rightAura = $('#cps-right-aura');
        if (rightAura) {
          rightAura.className = 'cps-aura-flames ' + opTier.aura;
        }
      }

      // Aura dynamique du joueur
      const myTier = getCpsTier(myLiveCps);
      const leftAura = $('#cps-left-aura');
      if (leftAura) {
        leftAura.className = 'cps-aura-flames ' + myTier.aura;
      }
    } else {
      updateCpsFfaPillars(d.players);
    }
  });

  socket.on('cpsGameOver', (d) => {
    cpsActive = false;
    if (cpsAnimFrameId) cancelAnimationFrame(cpsAnimFrameId);

    const isWinner = isMe(d.winner);
    if (d.isKo) {
      const koOverlay = $('#cps-ko-overlay');
      if (koOverlay) koOverlay.style.display = 'flex';
      Sound.ko();
      const koSub = $('#cps-ko-sub');
      if (koSub) koSub.textContent = isWinner ? 'VICTOIRE PAR K.O. ÉCRASANTE ! 🏆' : 'K.O. TECHNIQUE ! 💀';
      setTimeout(() => {
        if (koOverlay) koOverlay.style.display = 'none';
        showCpsResults(d);
      }, 2300);
    } else {
      showCpsResults(d);
    }
  });

  function showCpsResults(d) {
    const card = $('#cps-result-card');
    if (!card) return;
    card.style.display = 'flex';

    const isWinner = isMe(d.winner);
    const winPlayer = d.results[0] || {};
    const myResult = d.results.find((r) => isMe(r.id)) || d.results[0] || {};

    // Titre et sous-titre de fin
    const titleEl = $('#cps-result-title');
    const subEl = $('#cps-result-sub');
    if (titleEl) {
      titleEl.textContent = isWinner ? (d.isKo ? '💥 K.O. VICTOIRE ÉCRASANTE !' : '🏆 VICTOIRE ÉPIQUE !') : (d.winner === 'tie' ? '🤝 MATCH NUL !' : '💀 DÉFAITE !');
    }
    if (subEl) {
      subEl.textContent = d.isKo ? 'Fin du combat par K.O. direct' : `Duel terminé au chrono (${d.durationSec || 15}s)`;
    }

    // 🌟 ÉVALUATION DU RANG & NIVEAU DU JOUEUR 🌟
    const rank = evaluateCpsRank(myResult, isWinner, d.isKo, d.durationSec);

    // Audio & effets du sceau
    Sound.stamp();
    if (rank.tierKey === 'sss' || rank.tierKey === 's') {
      setTimeout(() => Sound.rankFanfare(), 300);
    } else if (isWinner) {
      setTimeout(() => Sound.win(), 250);
    } else {
      setTimeout(() => Sound.lose(), 250);
    }

    // Affichage du Sceau de Rang
    const seal = $('#cps-rank-seal');
    if (seal) {
      seal.className = 'cps-rank-seal ' + rank.badgeCls;
      restartAnim(seal, 'rankStamp');
    }
    const rankLetter = $('#cps-rank-letter');
    if (rankLetter) rankLetter.textContent = rank.grade;
    const rankStars = $('#cps-rank-stars');
    if (rankStars) rankStars.textContent = rank.stars;
    const rankTitle = $('#cps-rank-title');
    if (rankTitle) rankTitle.textContent = rank.title;
    const rankLevel = $('#cps-rank-level');
    if (rankLevel) rankLevel.textContent = rank.level;
    const rankComment = $('#cps-rank-comment');
    if (rankComment) rankComment.textContent = `« ${rank.comment} »`;

    // Barre de Maîtrise animée
    const masteryPct = $('#cps-mastery-pct');
    const masteryFill = $('#cps-mastery-fill');
    if (masteryPct) masteryPct.textContent = rank.mastery + '%';
    if (masteryFill) {
      masteryFill.style.width = '0%';
      setTimeout(() => {
        masteryFill.style.width = rank.mastery + '%';
      }, 100);
    }

    // 4 Cartes de statistiques clés
    const statPeak = $('#cps-stat-peak');
    if (statPeak) statPeak.textContent = (Number(myResult.peakCps) || 0).toFixed(1) + ' CPS';
    const statAvg = $('#cps-stat-avg');
    if (statAvg) statAvg.textContent = (Number(myResult.avgCps) || 0).toFixed(1) + ' CPS';
    const statClicks = $('#cps-stat-clicks');
    if (statClicks) statClicks.textContent = myResult.clicks || 0;
    const statReward = $('#cps-stat-reward');
    if (statReward) statReward.textContent = rank.rewardLabel;

    // Podium Vainqueur
    $('#cps-winner-name').textContent = winPlayer.name || 'Gagnant';
    $('#cps-winner-avatar').innerHTML = Avatar.svg(winPlayer.avatar);
    $('#cps-winner-coins').textContent = rank.rewardLabel;

    // Crédit des Noob-Bux gagnés
    updateCoinsDisplay(rank.rewardCoins);
    plusPop(rank.rewardLabel);
    if (isWinner) confetti();

    // Tableau comparatif complet de tous les combattants
    const table = $('#cps-stats-table');
    if (table) {
      table.innerHTML = `
        <div class="cps-stat-row head">
          <span>Combattant</span>
          <span>Rang</span>
          <span>Clics</span>
          <span>CPS Max</span>
          <span>CPS Moyen</span>
        </div>
      `;
      d.results.forEach((r, i) => {
        const rRank = evaluateCpsRank(r, r.id === d.winner, d.isKo, d.durationSec);
        const row = el('div', 'cps-stat-row' + (isMe(r.id) ? ' me' : ''));
        row.innerHTML = `
          <span class="cps-row-name">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${r.name}</span>
          <span class="cps-row-rank-badge ${rRank.badgeCls}">${rRank.grade}</span>
          <b class="cps-row-clicks">${r.clicks}</b>
          <span>${r.peakCps} CPS</span>
          <span>${r.avgCps} CPS</span>
        `;
        table.appendChild(row);
      });
    }
  }

  function renderCpsFfaPillars(players) {
    const box = $('#cps-ffa-pillars');
    if (!box) return;
    box.innerHTML = '';
    players.forEach((p) => {
      const col = el('div', 'cps-ffa-col' + (isMe(p.id) ? ' me' : ''));
      col.dataset.pid = p.id;
      col.innerHTML = `
        <div class="cps-pillar-avatar">${Avatar.svg(p.avatar)}</div>
        <div class="cps-pillar-bar">
          <div class="cps-pillar-fill" style="height: 5%;"></div>
        </div>
        <span class="cps-pillar-name">${p.name}</span>
        <b class="cps-pillar-cps">0 CPS</b>
      `;
      box.appendChild(col);
    });
  }

  function updateCpsFfaPillars(playersData) {
    for (const id in playersData) {
      const col = document.querySelector(`.cps-ffa-col[data-pid="${CSS.escape(id)}"]`);
      if (col) {
        const pd = playersData[id];
        const fill = col.querySelector('.cps-pillar-fill');
        if (fill) fill.style.height = Math.min(100, Math.max(5, pd.clicks * 1.5)) + '%';
        const cpsLabel = col.querySelector('.cps-pillar-cps');
        if (cpsLabel) cpsLabel.textContent = pd.cps + ' CPS';
      }
    }
  }

  // Boutons Revanche & Salon
  $('#btn-cps-replay')?.addEventListener('click', () => {
    Sound.go();
    socket.emit('cpsPlayAgain');
  });

  $('#btn-cps-lobby')?.addEventListener('click', () => {
    Sound.click();
    socket.emit('playAgain');
    show('lobby');
  });

  // Action Triche Cheat CPS God pour 00The Ahmed
  const btnCpsGod = $('#cheat-btn-cpsgod');
  if (btnCpsGod) {
    btnCpsGod.addEventListener('click', () => {
      if (!isCheatUser()) return;
      socket.emit('cheatCommand', { action: 'cpsGod' });
      Sound.frenzy();
      toast('👑 GOD CPS ACTIVÉ (BURST 35 CPS) ! ⚡', 'good');
      if (cpsActive) {
        for (let i = 0; i < 15; i++) triggerCpsHit();
      }
    });
  }

  // ─────────── Init ───────────
  renderAvatarPreview();
  renderAvatarControls();
  updateCheatUIFromSettings();
  checkCheatAccess(false);
})();
