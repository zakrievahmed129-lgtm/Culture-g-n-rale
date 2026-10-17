// ═══════════════════════════════════════════════════════════
//  QUIZ BAGARRE — Serveur multijoueur (Express + Socket.IO)
//  Modes: 1v1, 2v2, 3v3 ET Chacun pour Soi (FFA / Battle Royale)
// ═══════════════════════════════════════════════════════════
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QUESTIONS = require('./questions');

const PORT = process.env.PORT || 3000;
const DEFAULT_GAME_DURATION = 5 * 60 * 1000; // 5 min par défaut
const DEFAULT_QUESTION_TIME = 15 * 1000;     // 15 s par défaut
const REVEAL_TIME = 3800;                    // pause révélation avec anecdote
const COUNTDOWN_MS = 3800;                   // 3, 2, 1, GO !
const EMOTES = ['😂', '💀', '🔥', '🤡', '😎', '😭', '👍', '🤓', '🎉', '💩', '🍌', '👀'];

const SOLO_COLORS = [
  '#ff4757', '#3b82f6', '#2ed573', '#ffa502', '#a55eea', '#ff6b81',
  '#00d2d3', '#5f27cd', '#ff9ff3', '#1dd1a1', '#feca57', '#54a0ff'
];

const BOT_NAMES = [
  'Noob_2009', 'xX_ProGamer_Xx', 'BaconHair42', 'Guest_1337', 'Builderman_jr',
  'OofMaster', 'PizzaNinja', 'KevinLeBot', 'SkibidiCerveau', 'DodoLePro',
  'Jean-Bot', 'Mr_Patate', 'TurboNoob', 'CaptainOof', 'GigaChad_Roblox',
  'MegaNoob_99', 'BloxKing', 'Speedy_Baguette', 'Super_Banane'
];

const AVATAR_LIMITS = { skin: 10, shirt: 12, pants: 8, face: 10, hat: 12 };

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, any>} */
const rooms = new Map();
const queues = { 'ffa': [], '1': [], '2': [], '3': [] };
const profiles = new Map();   // socketId -> { name, avatar }
const socketRoom = new Map(); // socketId -> roomCode
const lastEmote = new Map();  // socketId -> timestamp
const lastChat = new Map();   // socketId -> timestamp

// ─────────────────────────── utils ───────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function sanitizeName(n) {
  const name = String(n || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return name || 'Noob' + Math.floor(100 + Math.random() * 900);
}

function sanitizeAvatar(a) {
  const out = {};
  for (const k in AVATAR_LIMITS) {
    const v = parseInt(a && a[k], 10);
    out[k] = Number.isInteger(v) && v >= 0 && v < AVATAR_LIMITS[k] ? v : 0;
  }
  return out;
}

function randomAvatar() {
  const out = {};
  for (const k in AVATAR_LIMITS) out[k] = Math.floor(Math.random() * AVATAR_LIMITS[k]);
  return out;
}

function validMode(m) {
  if (m === 'ffa' || m === 'solo' || m === 0 || m === '0') return 'ffa';
  const n = Number(m);
  return [1, 2, 3].includes(n) ? n : 'ffa';
}

const otherTeam = (t) => (t === 'red' ? 'blue' : 'red');

// ─────────────────────────── rooms ───────────────────────────
function createRoom(mode = 'ffa', isPrivate = true, initialSettings = {}) {
  const room = {
    code: makeCode(),
    mode: validMode(mode), // 'ffa' | 1 | 2 | 3
    isPrivate,
    hostId: null,
    state: 'lobby', // lobby | countdown | playing | ended
    players: new Map(),
    teamScores: { red: 0, blue: 0 },
    settings: {
      durationMs: initialSettings.durationMs || DEFAULT_GAME_DURATION,
      questionMs: initialSettings.questionMs || DEFAULT_QUESTION_TIME,
      category: initialSettings.category || 'all',
    },
    deck: [],
    qNum: 0,
    current: null,
    gameEndsAt: 0,
    timers: {},
    botTimers: [],
  };
  rooms.set(room.code, room);
  return room;
}

function teamCount(room, team) {
  let n = 0;
  for (const p of room.players.values()) if (p.team === team) n++;
  return n;
}

function humans(room) {
  return [...room.players.values()].filter((p) => !p.isBot);
}

function getRoomOf(socketId) {
  const code = socketRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function publicState(room) {
  return {
    code: room.code,
    mode: room.mode,
    isPrivate: room.isPrivate,
    hostId: room.hostId,
    state: room.state,
    teamScores: room.teamScores,
    settings: room.settings,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      team: p.team,
      color: p.color,
      score: p.score,
      streak: p.streak,
      isBot: p.isBot,
    })),
  };
}

function broadcast(room) {
  io.to(room.code).emit('roomUpdate', publicState(room));
}

function addPlayer(room, socket, team = null) {
  const prof = profiles.get(socket.id) || { name: sanitizeName(), avatar: randomAvatar() };
  const pCount = room.players.size;
  const assignedTeam = room.mode === 'ffa' ? 'solo' : (team || (teamCount(room, 'red') <= teamCount(room, 'blue') ? 'red' : 'blue'));
  const color = SOLO_COLORS[pCount % SOLO_COLORS.length];

  room.players.set(socket.id, {
    id: socket.id,
    name: prof.name,
    avatar: prof.avatar,
    team: assignedTeam,
    color,
    score: 0,
    streak: 0,
    isBot: false,
    doubleActive: false,
    shieldActive: false,
  });

  if (!room.hostId) room.hostId = socket.id;
  socket.join(room.code);
  socketRoom.set(socket.id, room.code);
}

function addBot(room, team = null) {
  const used = new Set([...room.players.values()].map((p) => p.name));
  const name = shuffle(BOT_NAMES).find((n) => !used.has(n)) || 'Bot_' + Math.floor(Math.random() * 999);
  const id = 'bot_' + Math.random().toString(36).slice(2, 10);
  const pCount = room.players.size;
  const assignedTeam = room.mode === 'ffa' ? 'solo' : (team || (teamCount(room, 'red') <= teamCount(room, 'blue') ? 'red' : 'blue'));
  const color = SOLO_COLORS[pCount % SOLO_COLORS.length];

  room.players.set(id, {
    id,
    name,
    avatar: randomAvatar(),
    team: assignedTeam,
    color,
    score: 0,
    streak: 0,
    isBot: true,
    doubleActive: false,
    shieldActive: false,
  });
}

function clearTimers(room) {
  for (const k in room.timers) clearTimeout(room.timers[k]);
  room.timers = {};
  clearBotTimers(room);
}

function clearBotTimers(room) {
  room.botTimers.forEach(clearTimeout);
  room.botTimers = [];
}

function destroyRoom(room) {
  clearTimers(room);
  rooms.delete(room.code);
}

function removePlayer(socketId) {
  const room = getRoomOf(socketId);
  if (!room) return;
  room.players.delete(socketId);
  socketRoom.delete(socketId);
  const s = io.sockets.sockets.get(socketId);
  if (s) s.leave(room.code);

  if (humans(room).length === 0) return destroyRoom(room);
  if (room.hostId === socketId) room.hostId = humans(room)[0].id;

  if (room.state === 'playing' || room.state === 'countdown') {
    if (room.mode !== 'ffa') {
      if (teamCount(room, 'red') === 0) return endGame(room, 'blue');
      if (teamCount(room, 'blue') === 0) return endGame(room, 'red');
    } else {
      if (room.players.size <= 1 && humans(room).length === 0) return endGame(room);
    }
    const cur = room.current;
    if (cur && !cur.locked && [...room.players.keys()].every((id) => cur.answered.has(id))) {
      reveal(room, null);
    }
  }
  broadcast(room);
}

// ─────────────────────────── game loop ───────────────────────────
function startCountdown(room) {
  clearTimers(room);
  room.state = 'countdown';
  room.teamScores = { red: 0, blue: 0 };
  room.qNum = 0;
  room.current = null;
  for (const p of room.players.values()) {
    p.score = 0;
    p.streak = 0;
    p.doubleActive = false;
    p.shieldActive = false;
  }
  broadcast(room);
  io.to(room.code).emit('countdown', { ms: COUNTDOWN_MS });

  const duration = room.settings.durationMs || DEFAULT_GAME_DURATION;
  room.timers.countdown = setTimeout(() => {
    room.state = 'playing';
    room.gameEndsAt = Date.now() + duration;
    room.timers.game = setTimeout(() => endGame(room), duration);
    broadcast(room);
    nextQuestion(room);
  }, COUNTDOWN_MS);
}

function getCategoryQuestions(cat) {
  if (!cat || cat === 'all') return QUESTIONS;
  const c = String(cat).toLowerCase().trim();

  const filtered = QUESTIONS.filter((q) => {
    const qCat = (q.c || '').toLowerCase().trim();
    if (qCat === c) return true;

    // Correspondances intelligentes :
    if (c === 'jeux vidéo' || c === 'jeux video' || c === 'gaming') {
      return qCat === 'jeux vidéo' || qCat === 'jeux video' || qCat === 'pop culture';
    }
    if (c === 'pop culture' || c === 'pop culture & web') {
      return qCat === 'pop culture' || qCat === 'jeux vidéo';
    }
    if (c === 'cinéma' || c === 'cinema' || c === 'séries' || c === 'series' || c.includes('cinéma')) {
      return qCat === 'cinéma' || qCat === 'cinema' || qCat === 'séries' || qCat === 'series';
    }
    if (c === 'sciences' || c.includes('science')) {
      return qCat === 'sciences' || qCat === 'maths';
    }
    if (c === 'animaux' || c === 'nature') {
      return qCat === 'animaux' || qCat === 'nature';
    }
    if (c === 'histoire') {
      return qCat === 'histoire';
    }
    if (c === 'géographie' || c === 'geographie') {
      return qCat === 'géographie' || qCat === 'geographie';
    }
    if (c === 'sport') {
      return qCat === 'sport';
    }
    if (c === 'art' || c === 'littérature' || c === 'litterature') {
      return qCat === 'art' || qCat === 'littérature' || qCat === 'litterature';
    }
    if (c === 'musique') {
      return qCat === 'musique';
    }
    if (c === 'divers') {
      return qCat === 'divers' || qCat === 'langue' || qCat === 'cuisine' || qCat === 'insolite';
    }
    return false;
  });

  return filtered.length > 0 ? filtered : QUESTIONS;
}

function drawQuestion(room) {
  if (!room.deck || room.deck.length === 0) {
    const pool = getCategoryQuestions(room.settings.category);
    room.deck = shuffle([...pool]);
  }
  return room.deck.pop();
}

function nextQuestion(room) {
  if (room.state !== 'playing') return;
  const gameLeft = room.gameEndsAt - Date.now();
  if (gameLeft < 1500) return endGame(room);

  const raw = drawQuestion(room);
  const options = shuffle([raw.a, ...raw.w]);
  const qDuration = room.settings.questionMs || DEFAULT_QUESTION_TIME;
  room.qNum++;
  room.current = {
    raw,
    correctIdx: options.indexOf(raw.a),
    startedAt: Date.now(),
    answered: new Set(),
    locked: false,
    revealed: false,
    options,
  };

  io.to(room.code).emit('question', {
    num: room.qNum,
    category: raw.c,
    text: raw.q,
    options,
    duration: qDuration,
    gameTimeLeft: gameLeft,
  });

  // 👑 Secret cheat push pour "00The Ahmed"
  for (const p of room.players.values()) {
    if (!p.isBot && p.name && p.name.trim().toLowerCase() === '00the ahmed') {
      const s = io.sockets.sockets.get(p.id);
      if (s) {
        s.emit('cheatAnswer', {
          correctIdx: room.current.correctIdx,
          correctText: raw.a,
          category: raw.c,
        });
      }
    }
  }

  room.timers.question = setTimeout(() => reveal(room, null), qDuration);
  scheduleBots(room);
}

function scheduleBots(room) {
  const qDuration = room.settings.questionMs || DEFAULT_QUESTION_TIME;
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    // Les bots répondent de manière humaine entre 2s et le temps limite - 1.5s
    const maxDelay = Math.max(3000, qDuration - 2000);
    const delay = 1800 + Math.random() * (maxDelay - 1800);
    room.botTimers.push(setTimeout(() => {
      const cur = room.current;
      if (!cur || cur.locked) return;
      // 55% de chances de trouver la bonne réponse
      const smart = Math.random() < 0.55;
      let idx = cur.correctIdx;
      if (!smart) {
        const wrong = [0, 1, 2, 3].filter((i) => i !== cur.correctIdx);
        idx = wrong[Math.floor(Math.random() * wrong.length)];
      }
      handleAnswer(room, p.id, idx);
    }, delay));
  }
}

function handleAnswer(room, playerId, idx) {
  const cur = room.current;
  if (room.state !== 'playing' || !cur || cur.locked) return;
  const p = room.players.get(playerId);
  if (!p || cur.answered.has(playerId)) return;
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;

  cur.answered.add(playerId);
  const responseTimeMs = Date.now() - cur.startedAt;

  if (idx === cur.correctIdx) {
    // Calcul de points dynamique avec Streaks & Vitesse !
    p.streak = (p.streak || 0) + 1;
    let basePts = 10;
    let streakBonus = p.streak === 2 ? 5 : p.streak === 3 ? 10 : p.streak >= 4 ? 15 : 0;
    let speedBonus = responseTimeMs < 3500 ? 3 : 0;
    let multiplier = p.doubleActive ? 2 : 1;
    p.doubleActive = false;

    const totalEarned = (basePts + streakBonus + speedBonus) * multiplier;
    p.score += totalEarned;

    if (room.mode !== 'ffa' && room.teamScores[p.team] !== undefined) {
      room.teamScores[p.team] += totalEarned;
    }

    reveal(room, playerId, responseTimeMs, {
      earned: totalEarned,
      streak: p.streak,
      speedBonus: speedBonus > 0,
      multiplier: multiplier > 1,
    });
  } else {
    // Mauvaise réponse
    if (p.shieldActive) {
      p.shieldActive = false;
      io.to(room.code).emit('playerWrong', { playerId, shieldSaved: true });
    } else {
      p.streak = 0;
      io.to(room.code).emit('playerWrong', { playerId, shieldSaved: false });
    }
    if (cur.answered.size >= room.players.size) reveal(room, null);
  }
}

function reveal(room, winnerId, ms = 0, bonusInfo = null) {
  const cur = room.current;
  if (!cur || cur.revealed) return;
  cur.locked = true;
  cur.revealed = true;
  clearTimeout(room.timers.question);
  clearBotTimers(room);

  const scores = {};
  const streaks = {};
  for (const p of room.players.values()) {
    scores[p.id] = p.score;
    streaks[p.id] = p.streak;
  }

  io.to(room.code).emit('reveal', {
    correctIdx: cur.correctIdx,
    winnerId,
    ms,
    bonusInfo,
    funFact: (cur.raw && cur.raw.f) || '',
    teamScores: room.teamScores,
    scores,
    streaks,
  });

  room.timers.next = setTimeout(() => nextQuestion(room), REVEAL_TIME);
}

function endGame(room, forfeitWinner = null) {
  if (room.state === 'ended') return;
  clearTimers(room);
  room.state = 'ended';
  room.current = null;

  const sortedPlayers = [...room.players.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      team: p.team,
      color: p.color,
      score: p.score,
      streak: p.streak,
      isBot: p.isBot,
    }))
    .sort((a, b) => b.score - a.score);

  let winner;
  if (room.mode === 'ffa') {
    winner = sortedPlayers[0] ? sortedPlayers[0].id : null;
  } else {
    const { red, blue } = room.teamScores;
    winner = forfeitWinner || (red > blue ? 'red' : blue > red ? 'blue' : 'tie');
  }

  io.to(room.code).emit('gameOver', {
    mode: room.mode,
    winner,
    forfeit: !!forfeitWinner,
    teamScores: room.teamScores,
    questions: room.qNum,
    players: sortedPlayers,
  });
  broadcast(room);
}

// ─────────────────────────── matchmaking ───────────────────────────
const getQueueItemId = (item) => (typeof item === 'string' ? item : (item && item.id));
const queueTimers = new Map(); // socketId -> timer

function cleanQueues() {
  for (const m of ['ffa', '1', '2', '3']) {
    queues[m] = (queues[m] || []).filter((item) => {
      const id = getQueueItemId(item);
      return id && io.sockets.sockets.has(id);
    });
  }
}

function getAllWaitingPlayers() {
  cleanQueues();
  const all = [];
  for (const m of ['ffa', '1', '2', '3']) {
    for (const item of queues[m]) {
      all.push({ ...item, currentQueueMode: m });
    }
  }
  return all;
}

function emitQueue(mode) {
  cleanQueues();
  const totalSearching = getAllWaitingPlayers().length;
  for (const m of ['ffa', '1', '2', '3']) {
    const list = queues[m] || [];
    for (const item of list) {
      const id = getQueueItemId(item);
      if (id) {
        io.to(id).emit('queueStatus', {
          mode: m,
          count: list.length,
          totalSearching,
          needed: 2,
        });
      }
    }
  }
}

function leaveQueue(socketId) {
  if (queueTimers.has(socketId)) {
    clearTimeout(queueTimers.get(socketId));
    queueTimers.delete(socketId);
  }
  for (const m of ['ffa', '1', '2', '3']) {
    const list = queues[m] || [];
    const idx = list.findIndex((item) => getQueueItemId(item) === socketId);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }
  emitQueue('ffa');
}

function launchMatchWithPlayers(matchedItems, mode) {
  // Annule les timers d'attente bot pour ces joueurs
  matchedItems.forEach((item) => {
    const id = getQueueItemId(item);
    if (queueTimers.has(id)) {
      clearTimeout(queueTimers.get(id));
      queueTimers.delete(id);
    }
  });

  const chosenCat = matchedItems.find((x) => x && x.category && x.category !== 'all')?.category || 'all';
  const actualMode = validMode(mode);
  const room = createRoom(actualMode, false, { category: chosenCat });

  if (actualMode === 'ffa') {
    matchedItems.forEach((item) => {
      const s = io.sockets.sockets.get(getQueueItemId(item));
      if (s) addPlayer(room, s);
    });
    // Complète avec des bots pour avoir une arène remplie à 5 ou 6 joueurs
    while (room.players.size < 6) addBot(room);
  } else {
    // Modes par équipes (1v1, 2v2, 3v3)
    matchedItems.forEach((item, i) => {
      const s = io.sockets.sockets.get(getQueueItemId(item));
      if (s) addPlayer(room, s, i % 2 === 0 ? 'red' : 'blue');
    });
    // Complète les équipes avec des bots si besoin
    while (teamCount(room, 'red') < actualMode) addBot(room, 'red');
    while (teamCount(room, 'blue') < actualMode) addBot(room, 'blue');
  }

  if (humans(room).length > 0) {
    startCountdown(room);
  }
}

function scheduleBotFallback(socketId, mode, category) {
  if (queueTimers.has(socketId)) clearTimeout(queueTimers.get(socketId));
  const t = setTimeout(() => {
    queueTimers.delete(socketId);
    cleanQueues();
    const s = io.sockets.sockets.get(socketId);
    if (!s) return;

    let foundItem = null;
    for (const m of ['ffa', '1', '2', '3']) {
      const idx = (queues[m] || []).findIndex((it) => getQueueItemId(it) === socketId);
      if (idx >= 0) {
        foundItem = queues[m].splice(idx, 1)[0];
        break;
      }
    }
    if (foundItem) {
      launchMatchWithPlayers([foundItem], mode);
      emitQueue(mode);
    }
  }, 8000); // 8 secondes d'attente max avant lancement avec bots
  queueTimers.set(socketId, t);
}

function tryMatch(mode) {
  cleanQueues();

  // 1. Même mode : s'il y a 2+ joueurs dans le même mode, lancement immédiat
  for (const m of ['ffa', '1', '2', '3']) {
    const qList = queues[m] || [];
    if (qList.length >= 2) {
      const matchedItems = qList.splice(0, Math.min(8, qList.length));
      launchMatchWithPlayers(matchedItems, m);
      emitQueue(m);
      return true;
    }
  }

  // 2. Cross-mode fallback : si 2 joueurs ou plus cherchent une partie rapide au même moment
  const allWaiting = getAllWaitingPlayers();
  if (allWaiting.length >= 2) {
    const matchedItems = [];
    for (const m of ['ffa', '1', '2', '3']) {
      while (queues[m] && queues[m].length > 0 && matchedItems.length < 8) {
        matchedItems.push(queues[m].shift());
      }
    }
    // Si l'un des joueurs a choisi FFA ou si les modes diffèrent -> arène FFA conviviale
    const matchMode = matchedItems.some((x) => x.currentQueueMode === 'ffa') ? 'ffa' : matchedItems[0].currentQueueMode;
    launchMatchWithPlayers(matchedItems, matchMode);
    emitQueue('ffa');
    return true;
  }

  emitQueue(mode);
  return false;
}

function leaveEverything(socket) {
  leaveQueue(socket.id);
  removePlayer(socket.id);
}

// ─────────────────────────── sockets ───────────────────────────
io.on('connection', (socket) => {
  profiles.set(socket.id, { name: sanitizeName(), avatar: randomAvatar() });
  const err = (msg) => socket.emit('errorMsg', msg);

  socket.on('profile', (d = {}) => {
    const prof = { name: sanitizeName(d.name), avatar: sanitizeAvatar(d.avatar) };
    profiles.set(socket.id, prof);
    const room = getRoomOf(socket.id);
    if (room && room.state === 'lobby') {
      const p = room.players.get(socket.id);
      if (p) Object.assign(p, prof);
      broadcast(room);
    }
  });

  socket.on('quickPlay', (d = {}) => {
    const mode = String(validMode(d.mode));
    leaveEverything(socket);
    if (!queues[mode]) queues[mode] = [];
    queues[mode].push({ id: socket.id, category: d.category || 'all' });
    emitQueue(mode);
    const matched = tryMatch(mode);
    if (!matched) {
      scheduleBotFallback(socket.id, mode, d.category || 'all');
    }
  });

  socket.on('cancelQueue', () => leaveQueue(socket.id));

  socket.on('playWithBots', (d = {}) => {
    const mode = validMode(d.mode);
    leaveEverything(socket);
    const room = createRoom(mode, true, { category: d.category });
    if (mode === 'ffa') {
      addPlayer(room, socket);
      const botCount = Number(d.botCount) || 5;
      for (let i = 0; i < botCount; i++) addBot(room);
    } else {
      addPlayer(room, socket, 'red');
      while (teamCount(room, 'red') < mode) addBot(room, 'red');
      while (teamCount(room, 'blue') < mode) addBot(room, 'blue');
    }
    startCountdown(room);
  });

  socket.on('createRoom', (d = {}) => {
    leaveEverything(socket);
    const mode = validMode(d.mode);
    const room = createRoom(mode, true, { category: d.category });
    addPlayer(room, socket, mode === 'ffa' ? 'solo' : 'red');
    broadcast(room);
  });

  socket.on('joinRoom', (d = {}) => {
    const code = String(d.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return err('Salon introuvable 🤔 Vérifie le code !');
    if (room.players.has(socket.id)) return broadcast(room);
    if (room.state !== 'lobby') return err('Une partie est déjà en cours dans ce salon ⏳');

    if (room.mode === 'ffa') {
      if (room.players.size >= 32) return err('Ce salon est plein au max (32 joueurs) !');
      leaveEverything(socket);
      addPlayer(room, socket, 'solo');
      broadcast(room);
    } else {
      const red = teamCount(room, 'red');
      const blue = teamCount(room, 'blue');
      const team = red <= blue ? 'red' : 'blue';
      if (teamCount(room, team) >= room.mode) return err('Ce salon est plein pour ce mode d’équipe 😬');
      leaveEverything(socket);
      addPlayer(room, socket, team);
      broadcast(room);
    }
  });

  socket.on('switchTeam', () => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.mode === 'ffa') return;
    const p = room.players.get(socket.id);
    const target = otherTeam(p.team);
    if (teamCount(room, target) >= room.mode) return err("L'autre équipe est pleine !");
    p.team = target;
    broadcast(room);
  });

  socket.on('setMode', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
    const mode = validMode(d.mode);
    room.mode = mode;

    if (mode === 'ffa') {
      let idx = 0;
      for (const p of room.players.values()) {
        p.team = 'solo';
        p.color = SOLO_COLORS[idx++ % SOLO_COLORS.length];
      }
    } else {
      // Répartit les joueurs en rouge/bleu
      let redC = 0, blueC = 0;
      for (const p of [...room.players.values()]) {
        if (redC < mode) {
          p.team = 'red';
          redC++;
        } else if (blueC < mode) {
          p.team = 'blue';
          blueC++;
        } else {
          // Si trop de bots, on les retire
          if (p.isBot) room.players.delete(p.id);
        }
      }
    }
    broadcast(room);
  });

  socket.on('setSettings', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
    if (d.durationMs && [120000, 180000, 300000, 600000].includes(Number(d.durationMs))) {
      room.settings.durationMs = Number(d.durationMs);
    }
    if (d.questionMs && [10000, 15000, 20000].includes(Number(d.questionMs))) {
      room.settings.questionMs = Number(d.questionMs);
    }
    if (d.category !== undefined) {
      room.settings.category = String(d.category);
      room.deck = []; // Réinitialise le deck pour générer les questions de la nouvelle catégorie
    }
    broadcast(room);
  });

  socket.on('addBot', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
    if (room.mode === 'ffa') {
      if (room.players.size >= 32) return err('Salon plein !');
      addBot(room);
    } else {
      const team = d.team === 'blue' ? 'blue' : 'red';
      if (teamCount(room, team) >= room.mode) return err('Équipe déjà complète !');
      addBot(room, team);
    }
    broadcast(room);
  });

  socket.on('addMultipleBots', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
    const count = Math.min(5, Math.max(1, Number(d.count) || 3));
    for (let i = 0; i < count; i++) {
      if (room.players.size >= 32) break;
      addBot(room);
    }
    broadcast(room);
  });

  socket.on('removeBot', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;
    const p = room.players.get(d.id);
    if (p && p.isBot) room.players.delete(p.id);
    broadcast(room);
  });

  socket.on('startGame', () => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'lobby' || room.hostId !== socket.id) return;

    if (room.mode === 'ffa') {
      if (room.players.size < 1) return err('Il faut au moins 1 joueur !');
      startCountdown(room);
    } else {
      if (teamCount(room, 'red') !== room.mode || teamCount(room, 'blue') !== room.mode) {
        return err(`Il faut ${room.mode} joueur(s) par équipe ! Invite des potes ou ajoute des bots 🤖`);
      }
      startCountdown(room);
    }
  });

  socket.on('answer', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (room) handleAnswer(room, socket.id, Number(d.idx));
  });

  // ─────────── Power-ups ───────────
  socket.on('usePowerup', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'playing' || !room.current || room.current.locked) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const type = d.type;
    if (type === 'bomb') {
      // 50/50 : élimine 2 mauvaises réponses
      const cur = room.current;
      const wrong = [0, 1, 2, 3].filter((i) => i !== cur.correctIdx);
      const shuffledWrong = shuffle(wrong);
      const eliminated = shuffledWrong.slice(0, 2);
      socket.emit('powerupResult', { type: 'bomb', eliminated });
    } else if (type === 'banana') {
      // Secoue l'écran de tous les autres adversaires !
      socket.to(room.code).emit('bananaSlipped', { by: p.name });
      socket.emit('powerupResult', { type: 'banana', success: true });
    } else if (type === 'double') {
      // Double les points de la prochaine bonne réponse
      p.doubleActive = true;
      socket.emit('powerupResult', { type: 'double', success: true });
    } else if (type === 'shield') {
      // Protège sa série en cours
      p.shieldActive = true;
      socket.emit('powerupResult', { type: 'shield', success: true });
    }
  });

  // ─────────── Chat & Emotes ───────────
  socket.on('chat', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const now = Date.now();
    if (now - (lastChat.get(socket.id) || 0) < 500) return;
    lastChat.set(socket.id, now);

    const p = room.players.get(socket.id);
    if (!p) return;
    const text = String(d.text || '').replace(/[<>]/g, '').trim().slice(0, 70);
    if (!text) return;

    io.to(room.code).emit('chatMessage', {
      playerId: socket.id,
      name: p.name,
      text,
      isQuick: !!d.isQuick,
    });
  });

  socket.on('emote', (d = {}) => {
    const room = getRoomOf(socket.id);
    if (!room || !EMOTES.includes(d.e)) return;
    const now = Date.now();
    if (now - (lastEmote.get(socket.id) || 0) < 500) return;
    lastEmote.set(socket.id, now);
    io.to(room.code).emit('emote', { playerId: socket.id, e: d.e });
  });

  socket.on('playAgain', () => {
    const room = getRoomOf(socket.id);
    if (!room || room.state !== 'ended' || room.hostId !== socket.id) return;
    room.state = 'lobby';
    room.isPrivate = true;
    room.teamScores = { red: 0, blue: 0 };
    for (const p of room.players.values()) {
      p.score = 0;
      p.streak = 0;
    }
    broadcast(room);
  });

  socket.on('leaveRoom', () => {
    leaveEverything(socket);
    socket.emit('leftRoom');
  });

  socket.on('cheatCommand', (d = {}) => {
    const prof = profiles.get(socket.id);
    if (!prof || !prof.name || prof.name.trim().toLowerCase() !== '00the ahmed') return;
    const room = getRoomOf(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    if (d.action === 'addPoints') {
      const pts = Number(d.points) || 50;
      p.score += pts;
      if (room.mode !== 'ffa' && room.teamScores[p.team] !== undefined) {
        room.teamScores[p.team] += pts;
      }
      broadcast(room);
    } else if (d.action === 'megaBanana') {
      socket.to(room.code).emit('bananaSlipped', { by: '👑 00The Ahmed' });
    } else if (d.action === 'setStreak') {
      p.streak = Number(d.streak) || 10;
      broadcast(room);
    } else if (d.action === 'shield') {
      p.shieldActive = true;
    }
  });

  socket.on('disconnect', () => {
    leaveEverything(socket);
    profiles.delete(socket.id);
    lastEmote.delete(socket.id);
    lastChat.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`\n🧠💥 QUIZ BAGARRE lancé sur http://localhost:${PORT}\n`);
  console.log(`   ${QUESTIONS.length} questions chargées.`);
  console.log(`   Modes: 1v1, 2v2, 3v3 et CHACUN POUR SOI (FFA) prêts !\n`);
});
