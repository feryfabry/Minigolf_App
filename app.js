(function () {
    'use strict';

    const COLORS = ['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1'];
    const SESSION_KEY = 'minigolf_session';

    let state = {
        roomCode: null,
        playerId: null,
        playerName: null,
        isHost: false,
        holes: 12,
        started: false,
        currentHole: 0,
        players: {},   // { id: { name, color, order } }
        scores: {}     // { playerId: { "0": 3, "1": 2, ... } }
    };

    let gameRef = null;
    let listeners = [];

    // DOM refs
    const screens = {
        home: document.getElementById('home-screen'),
        create: document.getElementById('create-screen'),
        join: document.getElementById('join-screen'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
        scoreboard: document.getElementById('scoreboard-screen')
    };

    // ========== SCREENS ==========
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    // ========== AUTO-REJOIN ON LOAD ==========
    (function tryAutoRejoin() {
        const session = loadSession();
        if (!session) return;
        const ref = db.ref('games/' + session.roomCode);
        ref.once('value').then(snap => {
            if (!snap.exists()) {
                clearSession();
                return;
            }
            const data = snap.val();
            const players = data.players || {};
            // Check if our player still exists in the game
            if (!players[session.playerId]) {
                clearSession();
                return;
            }
            // Rejoin!
            state.roomCode = session.roomCode;
            state.playerId = session.playerId;
            state.playerName = session.playerName;
            state.isHost = session.isHost;
            state.holes = data.settings ? data.settings.holes : 12;
            gameRef = ref;
            listenToGame();
            if (data.started) {
                state.started = true;
                state.currentHole = 0;
                showScreen('game');
            } else {
                showScreen('lobby');
                renderLobby();
            }
        }).catch(() => clearSession());
    })();

    // ========== HOME ==========
    document.getElementById('create-game-btn').addEventListener('click', () => showScreen('create'));
    document.getElementById('join-game-btn').addEventListener('click', () => showScreen('join'));

    // ========== CREATE GAME ==========
    const hostNameInput = document.getElementById('host-name-input');
    const doCreateBtn = document.getElementById('do-create-btn');

    document.getElementById('create-back-btn').addEventListener('click', () => showScreen('home'));

    hostNameInput.addEventListener('input', () => {
        doCreateBtn.disabled = !hostNameInput.value.trim();
    });

    document.querySelectorAll('.hole-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hole-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.holes = parseInt(btn.dataset.holes);
        });
    });

    doCreateBtn.addEventListener('click', createGame);

    function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    function createGame() {
        const name = hostNameInput.value.trim();
        if (!name) return;

        state.roomCode = generateRoomCode();
        state.playerId = generatePlayerId();
        state.playerName = name;
        state.isHost = true;

        gameRef = db.ref('games/' + state.roomCode);

        gameRef.set({
            settings: { holes: state.holes },
            started: false,
            players: {
                [state.playerId]: { name, color: COLORS[0], order: 0 }
            },
            scores: {}
        }).then(() => {
            saveSession();
            listenToGame();
            showScreen('lobby');
            renderLobby();
        }).catch(err => {
            alert('Fehler: ' + err.message);
        });
    }

    // ========== JOIN GAME ==========
    const joinNameInput = document.getElementById('join-name-input');
    const roomCodeInput = document.getElementById('room-code-input');
    const doJoinBtn = document.getElementById('do-join-btn');

    document.getElementById('join-back-btn').addEventListener('click', () => showScreen('home'));

    function updateJoinBtn() {
        doJoinBtn.disabled = !(joinNameInput.value.trim() && roomCodeInput.value.trim().length === 4);
    }
    joinNameInput.addEventListener('input', updateJoinBtn);
    roomCodeInput.addEventListener('input', () => {
        roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
        updateJoinBtn();
    });

    doJoinBtn.addEventListener('click', joinGame);

    function joinGame() {
        const name = joinNameInput.value.trim();
        const code = roomCodeInput.value.trim().toUpperCase();
        if (!name || code.length !== 4) return;

        gameRef = db.ref('games/' + code);

        gameRef.once('value').then(snap => {
            if (!snap.exists()) {
                alert('Raum nicht gefunden! Prüfe den Code.');
                return;
            }
            const data = snap.val();
            const players = data.players || {};
            const playerCount = Object.keys(players).length;

            // Check if player with same name already exists (rejoin)
            const existingEntry = Object.entries(players).find(
                ([, p]) => p.name.toLowerCase() === name.toLowerCase()
            );

            if (existingEntry) {
                // Rejoin as existing player
                state.roomCode = code;
                state.playerId = existingEntry[0];
                state.playerName = name;
                state.isHost = false;
                state.holes = data.settings ? data.settings.holes : 12;
                saveSession();
                listenToGame();
                if (data.started) {
                    state.started = true;
                    state.currentHole = 0;
                    showScreen('game');
                } else {
                    showScreen('lobby');
                    renderLobby();
                }
                return;
            }

            if (playerCount >= 6) {
                alert('Raum ist voll (max. 6 Spieler).');
                return;
            }

            if (data.started) {
                alert('Spiel läuft bereits! Verwende deinen ursprünglichen Namen zum Rejoinen.');
                return;
            }

            state.roomCode = code;
            state.playerId = generatePlayerId();
            state.playerName = name;
            state.isHost = false;
            state.holes = data.settings.holes;

            return gameRef.child('players/' + state.playerId).set({
                name,
                color: COLORS[playerCount % COLORS.length],
                order: playerCount
            });
        }).then(() => {
            if (!state.roomCode) return;
            saveSession();
            listenToGame();
            showScreen('lobby');
        }).catch(err => {
            alert('Fehler: ' + err.message);
        });
    }

    // ========== LOBBY ==========
    document.getElementById('lobby-back-btn').addEventListener('click', leaveLobby);

    function renderLobby() {
        document.getElementById('lobby-code').textContent = state.roomCode;
        const startBtn = document.getElementById('start-game-btn');
        startBtn.style.display = state.isHost ? 'block' : 'none';
    }

    function renderLobbyPlayers(players) {
        const list = document.getElementById('lobby-player-list');
        const sorted = Object.entries(players).sort((a, b) => a[1].order - b[1].order);
        list.innerHTML = sorted.map(([id, p]) => `
            <div class="player-chip">
                <div class="player-info">
                    <span class="player-color" style="background:${p.color}"></span>
                    ${escapeHtml(p.name)}${id === state.playerId ? ' (Du)' : ''}
                </div>
            </div>
        `).join('');

        const hint = document.getElementById('lobby-hint');
        const startBtn = document.getElementById('start-game-btn');
        if (state.isHost) {
            hint.textContent = sorted.length < 2 ? 'Warte auf Mitspieler...' : `${sorted.length} Spieler bereit!`;
            startBtn.disabled = sorted.length < 2;
        } else {
            hint.textContent = 'Warte auf Host...';
        }
    }

    function leaveLobby() {
        if (gameRef && state.playerId && !state.started) {
            gameRef.child('players/' + state.playerId).remove();
        }
        cleanup();
        showScreen('home');
    }

    // Start button (host only)
    document.getElementById('start-game-btn').addEventListener('click', () => {
        if (!state.isHost) return;
        gameRef.child('started').set(true);
    });

    // ========== GAME ==========
    const holePlayers = document.getElementById('hole-players');
    const currentHoleSpan = document.getElementById('current-hole');
    const totalHolesSpan = document.getElementById('total-holes');
    const prevBtn = document.getElementById('prev-hole-btn');
    const nextBtn = document.getElementById('next-hole-btn');

    document.getElementById('back-btn').addEventListener('click', () => {
        if (confirm('Spiel verlassen?')) {
            leaveLobby();
        }
    });
    document.getElementById('scoreboard-btn').addEventListener('click', () => {
        showScreen('scoreboard');
        renderScoreboard();
    });
    document.getElementById('scoreboard-back-btn').addEventListener('click', () => {
        showScreen('game');
        renderHole();
    });
    document.getElementById('new-game-btn').addEventListener('click', () => {
        if (state.isHost && confirm('Neues Spiel? Alle Punkte gehen verloren.')) {
            gameRef.remove().then(() => {
                cleanup();
                showScreen('home');
            });
        } else if (!state.isHost) {
            cleanup();
            showScreen('home');
        }
    });

    prevBtn.addEventListener('click', () => navigateHole(-1));
    nextBtn.addEventListener('click', () => navigateHole(1));

    function renderHole() {
        const hole = state.currentHole;
        currentHoleSpan.textContent = hole + 1;
        totalHolesSpan.textContent = state.holes;
        prevBtn.disabled = hole === 0;
        nextBtn.textContent = hole === state.holes - 1 ? 'Ergebnis 📊' : 'Weiter →';

        const playersList = getSortedPlayers();
        holePlayers.innerHTML = playersList.map(([pid, p]) => {
            const scores = state.scores[pid] || {};
            const score = scores[hole] || 0;
            const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
            return `
                <div class="player-score-card">
                    <div>
                        <div class="player-name">
                            <span class="dot" style="background:${p.color}"></span>
                            ${escapeHtml(p.name)}${pid === state.playerId ? ' (Du)' : ''}
                        </div>
                        <div class="player-total">Gesamt: ${total}</div>
                    </div>
                    <div class="score-input">
                        <button class="btn-minus" data-player="${pid}" data-dir="-1">−</button>
                        <span class="score-value">${score}</span>
                        <button class="btn-plus" data-player="${pid}" data-dir="1">+</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind score buttons
        holePlayers.querySelectorAll('.btn-minus, .btn-plus').forEach(btn => {
            btn.addEventListener('click', () => {
                const pid = btn.dataset.player;
                const dir = parseInt(btn.dataset.dir);
                changeScore(pid, dir);
            });
        });
    }

    function changeScore(playerId, dir) {
        const hole = state.currentHole;
        const scores = state.scores[playerId] || {};
        const current = scores[hole] || 0;
        const newVal = current + dir;
        if (newVal < 0 || newVal > 9) return;

        // Write to Firebase
        gameRef.child(`scores/${playerId}/${hole}`).set(newVal);
    }

    function navigateHole(dir) {
        const next = state.currentHole + dir;
        if (next < 0) return;
        if (next >= state.holes) {
            showScreen('scoreboard');
            renderScoreboard();
            return;
        }
        state.currentHole = next;
        renderHole();
    }

    // ========== SCOREBOARD ==========
    function renderScoreboard() {
        const playersList = getSortedPlayers();
        const holes = state.holes;

        let html = '<thead><tr><th>Bahn</th>';
        playersList.forEach(([, p]) => {
            html += `<th>${escapeHtml(p.name)}</th>`;
        });
        html += '</tr></thead><tbody>';

        for (let h = 0; h < holes; h++) {
            html += `<tr><td>${h + 1}</td>`;
            playersList.forEach(([pid]) => {
                const s = (state.scores[pid] || {})[h] || 0;
                html += `<td>${s || '-'}</td>`;
            });
            html += '</tr>';
        }

        // Total row
        html += '<tr><td><strong>Σ</strong></td>';
        const totals = playersList.map(([pid]) => {
            const scores = state.scores[pid] || {};
            return Object.values(scores).reduce((a, b) => a + (b || 0), 0);
        });
        const minTotal = Math.min(...totals.filter(t => t > 0));
        playersList.forEach(([, p], i) => {
            const isWinner = totals[i] === minTotal && totals[i] > 0;
            html += `<td class="${isWinner ? 'winner' : ''}"><strong>${totals[i]}</strong>${isWinner ? ' 🏆' : ''}</td>`;
        });
        html += '</tr></tbody>';

        document.getElementById('scoreboard-table').innerHTML = html;
    }

    // ========== FIREBASE LISTENERS ==========
    function listenToGame() {
        // Listen to full game state
        const ref = gameRef.on('value', snap => {
            if (!snap.exists()) {
                // Game deleted
                cleanup();
                showScreen('home');
                return;
            }
            const data = snap.val();
            state.players = data.players || {};
            state.scores = data.scores || {};
            state.holes = data.settings ? data.settings.holes : state.holes;

            if (!data.started) {
                renderLobbyPlayers(state.players);
            } else if (!state.started) {
                // Game just started
                state.started = true;
                state.currentHole = 0;
                showScreen('game');
                renderHole();
            } else {
                // Update during game
                renderHole();
            }
        });
        listeners.push({ ref: gameRef, event: 'value', callback: ref });
    }

    function cleanup() {
        if (gameRef) {
            listeners.forEach(l => gameRef.off(l.event, l.callback));
        }
        listeners = [];
        gameRef = null;
        clearSession();
        state = {
            roomCode: null,
            playerId: null,
            playerName: null,
            isHost: false,
            holes: 12,
            started: false,
            currentHole: 0,
            players: {},
            scores: {}
        };
    }

    // ========== SESSION PERSISTENCE ==========
    function saveSession() {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                roomCode: state.roomCode,
                playerId: state.playerId,
                playerName: state.playerName,
                isHost: state.isHost
            }));
        } catch (e) {}
    }

    function loadSession() {
        try {
            const s = localStorage.getItem(SESSION_KEY);
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    }

    // ========== UTILS ==========
    function generatePlayerId() {
        return 'p_' + Math.random().toString(36).substring(2, 9);
    }

    function getSortedPlayers() {
        return Object.entries(state.players).sort((a, b) => a[1].order - b[1].order);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
})();
