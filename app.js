(function () {
    'use strict';

    const COLORS = ['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1','#6d4c41','#ec407a','#26a69a','#ab47bc'];
    const SESSION_KEY = 'minigolf_session';

    let state = {
        roomCode: null,
        playerId: null,
        playerName: null,
        isHost: false,
        holes: 12,
        maxAttempts: 7,
        started: false,
        currentHole: 0,
        players: {},   // { id: { name, color, order } }
        scores: {}     // { playerId: { "0": 3, "1": 2, ... } }
    };

    let selectedColor = null;

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
    let currentScreen = 'home';

    function showScreen(name, pushState = true) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
        if (pushState && name !== currentScreen) {
            history.pushState({ screen: name }, '', '');
        }
        currentScreen = name;
    }

    // Handle back button / swipe-back gesture
    window.addEventListener('popstate', (e) => {
        const target = e.state ? e.state.screen : 'home';
        if (target === 'home' && state.started) {
            // Don't leave game on back, go to game screen instead
            showScreen('game', false);
            renderHole();
            // Push state again so next back doesn't exit
            history.pushState({ screen: 'game' }, '', '');
        } else if (target === 'game' && state.started) {
            showScreen('game', false);
            renderHole();
        } else if (target === 'scoreboard') {
            showScreen('scoreboard', false);
            renderScoreboard();
        } else if (target === 'lobby' && state.roomCode) {
            showScreen('lobby', false);
            renderLobby();
        } else {
            showScreen('home', false);
        }
    });

    // Set initial state
    history.replaceState({ screen: 'home' }, '', '');

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
    const customHolesInput = document.getElementById('custom-holes-input');
    const customAttemptsInput = document.getElementById('custom-attempts-input');

    document.getElementById('create-back-btn').addEventListener('click', () => showScreen('home'));

    function updateCreateBtn() {
        const hasName = !!hostNameInput.value.trim();
        const hasHoles = state.holes >= 1 && state.holes <= 36;
        const hasAttempts = state.maxAttempts >= 1 && state.maxAttempts <= 15;
        doCreateBtn.disabled = !(hasName && hasHoles && hasAttempts);
    }

    hostNameInput.addEventListener('input', updateCreateBtn);

    document.querySelectorAll('.hole-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hole-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            customHolesInput.value = '';
            state.holes = parseInt(btn.dataset.holes);
            updateCreateBtn();
        });
    });

    customHolesInput.addEventListener('input', () => {
        const val = parseInt(customHolesInput.value);
        if (val >= 1 && val <= 36) {
            document.querySelectorAll('.hole-option').forEach(b => b.classList.remove('active'));
            state.holes = val;
        } else {
            state.holes = 0;
        }
        updateCreateBtn();
    });

    document.querySelectorAll('.attempts-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.attempts-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            customAttemptsInput.value = '';
            state.maxAttempts = parseInt(btn.dataset.attempts);
            updateCreateBtn();
        });
    });

    customAttemptsInput.addEventListener('input', () => {
        const val = parseInt(customAttemptsInput.value);
        if (val >= 1 && val <= 15) {
            document.querySelectorAll('.attempts-option').forEach(b => b.classList.remove('active'));
            state.maxAttempts = val;
        } else {
            state.maxAttempts = 0;
        }
        updateCreateBtn();
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
            settings: { holes: state.holes, maxAttempts: state.maxAttempts },
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

    // Color picker
    const colorPicker = document.getElementById('color-picker');
    selectedColor = COLORS[0];
    colorPicker.innerHTML = COLORS.map((c, i) =>
        `<button class="color-dot${i === 0 ? ' selected' : ''}" style="background:${c}" data-color="${c}"></button>`
    ).join('');
    colorPicker.addEventListener('click', (e) => {
        const dot = e.target.closest('.color-dot');
        if (!dot) return;
        colorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        selectedColor = dot.dataset.color;
    });

    document.getElementById('join-back-btn').addEventListener('click', () => showScreen('home'));

    function updateJoinBtn() {
        doJoinBtn.disabled = !(joinNameInput.value.trim() && roomCodeInput.value.trim().length === 4);
    }
    joinNameInput.addEventListener('input', updateJoinBtn);
    roomCodeInput.addEventListener('input', () => {
        roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
        updateJoinBtn();
    });

    // Check URL for ?code= parameter (from QR scan)
    (function checkUrlCode() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code && code.length === 4) {
            const session = loadSession();
            if (!session) {
                roomCodeInput.value = code.toUpperCase();
                showScreen('join');
                updateJoinBtn();
            }
            // Clean URL
            history.replaceState(null, '', window.location.pathname);
        }
    })();

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
                // Late join: send request to host
                const requestId = generatePlayerId();
                const color = selectedColor || COLORS[playerCount % COLORS.length];
                gameRef.child('joinRequests/' + requestId).set({
                    name,
                    color,
                    order: playerCount
                });
                // Wait for host approval
                state.roomCode = code;
                state.playerId = requestId;
                state.playerName = name;
                state.isHost = false;
                state.holes = data.settings.holes;
                state.maxAttempts = data.settings.maxAttempts || 7;
                showScreen('lobby');
                document.getElementById('lobby-code').textContent = code;
                document.getElementById('lobby-hint').textContent = 'Warte auf Bestätigung vom Host...';
                document.getElementById('start-game-btn').style.display = 'none';
                document.getElementById('lobby-player-list').innerHTML = '';
                document.getElementById('qr-code').innerHTML = '';
                // Listen for approval (player added) or denial (request removed)
                const reqRef = gameRef.child('joinRequests/' + requestId);
                const playerRef = gameRef.child('players/' + requestId);
                const approvalListener = playerRef.on('value', snap => {
                    if (snap.exists()) {
                        // Approved! Enter game
                        playerRef.off('value', approvalListener);
                        reqRef.off('value', denialListener);
                        saveSession();
                        state.started = true;
                        state.currentHole = 0;
                        listenToGame();
                        showScreen('game');
                        renderHole();
                    }
                });
                const denialListener = reqRef.on('value', snap => {
                    if (!snap.exists()) {
                        // Request removed (denied or cleaned up)
                        playerRef.off('value', approvalListener);
                        reqRef.off('value', denialListener);
                        // Check if player was added (approval removes request too)
                        playerRef.once('value').then(pSnap => {
                            if (!pSnap.exists()) {
                                alert('Der Host hat die Anfrage abgelehnt.');
                                showScreen('home');
                                state.roomCode = null;
                                state.playerId = null;
                            }
                        });
                    }
                });
                return;
            }

            state.roomCode = code;
            state.playerId = generatePlayerId();
            state.playerName = name;
            state.isHost = false;
            state.holes = data.settings.holes;
            state.maxAttempts = data.settings.maxAttempts || 7;

            return gameRef.child('players/' + state.playerId).set({
                name,
                color: selectedColor || COLORS[playerCount % COLORS.length],
                order: playerCount
            });
        }).then(() => {
            if (!state.roomCode) return;
            saveSession();
            listenToGame();
            showScreen('lobby');
            renderLobby();
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

        // Generate QR code with join URL
        const qrContainer = document.getElementById('qr-code');
        qrContainer.innerHTML = '';
        if (state.roomCode) {
            const joinUrl = window.location.origin + window.location.pathname + '?code=' + state.roomCode;
            const qr = qrcode(0, 'M');
            qr.addData(joinUrl);
            qr.make();
            qrContainer.innerHTML = qr.createSvgTag(4, 0);
        }
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
            hint.textContent = sorted.length < 2 ? 'Du kannst allein starten oder auf Mitspieler warten...' : `${sorted.length} Spieler bereit!`;
            startBtn.disabled = false;
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
    document.getElementById('info-btn').addEventListener('click', () => {
        const panel = document.getElementById('room-code-panel');
        document.getElementById('panel-code').textContent = state.roomCode;
        if (panel.classList.contains('hidden')) {
            // Generate QR
            const qrContainer = document.getElementById('panel-qr');
            const joinUrl = window.location.origin + window.location.pathname + '?code=' + state.roomCode;
            const qr = qrcode(0, 'M');
            qr.addData(joinUrl);
            qr.make();
            qrContainer.innerHTML = qr.createSvgTag(4, 0);
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
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
    document.getElementById('scoreboard-play-btn').addEventListener('click', () => {
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
    document.getElementById('email-results-btn').addEventListener('click', sendResultsEmail);

    prevBtn.addEventListener('click', () => navigateHole(-1));
    nextBtn.addEventListener('click', () => navigateHole(1));

    function renderHole() {
        const hole = state.currentHole;
        currentHoleSpan.textContent = hole + 1;
        totalHolesSpan.textContent = state.holes;
        prevBtn.disabled = hole === 0;
        nextBtn.textContent = hole === state.holes - 1 ? 'Ergebnis 📊' : 'Weiter →';

        // Sort: own player first, then by order
        const playersList = getSortedPlayers();
        const myIndex = playersList.findIndex(([pid]) => pid === state.playerId);
        if (myIndex > 0) {
            const [me] = playersList.splice(myIndex, 1);
            playersList.unshift(me);
        }

        holePlayers.innerHTML = playersList.map(([pid, p]) => {
            const scores = state.scores[pid] || {};
            const score = scores[hole] || 0;
            const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
            const canEdit = state.isHost || pid === state.playerId;
            return `
                <div class="player-score-card${!canEdit ? ' disabled' : ''}">
                    <div>
                        <div class="player-name">
                            <span class="dot" style="background:${p.color}"></span>
                            ${escapeHtml(p.name)}${pid === state.playerId ? ' (Du)' : ''}
                        </div>
                        <div class="player-total">Gesamt: ${total}</div>
                    </div>
                    <div class="score-input">
                        <button class="btn-minus" data-player="${pid}" data-dir="-1" ${!canEdit ? 'disabled' : ''}>−</button>
                        <span class="score-value">${score}</span>
                        <button class="btn-plus" data-player="${pid}" data-dir="1" ${!canEdit ? 'disabled' : ''}>+</button>
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
        if (newVal < 0 || newVal > state.maxAttempts) return;

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);

        // Animations
        if (newVal === 1 && dir === 1) showConfetti();
        if (newVal === 7 && dir === 1) showBadLuck();

        // Write to Firebase
        gameRef.child(`scores/${playerId}/${hole}`).set(newVal);
    }

    function showConfetti() {
        const overlay = document.createElement('div');
        overlay.className = 'confetti-overlay';
        const colors = ['#ff0', '#f0f', '#0ff', '#f00', '#0f0', '#00f', '#ff8800'];
        for (let i = 0; i < 40; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = Math.random() * 0.5 + 's';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
            overlay.appendChild(piece);
        }
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 2000);
    }

    function showBadLuck() {
        const overlay = document.createElement('div');
        overlay.className = 'badluck-overlay';
        overlay.innerHTML = '<span class="emoji">😢</span>';
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 2000);
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

    // Swipe between holes
    let touchStartX = 0;
    let touchStartY = 0;
    holePlayers.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    holePlayers.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) navigateHole(1);   // swipe left = next
            else navigateHole(-1);          // swipe right = prev
        }
    }, { passive: true });

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

        // Total + placement row
        html += '<tr><td><strong>\u03a3</strong></td>';
        const totals = playersList.map(([pid]) => {
            const scores = state.scores[pid] || {};
            return Object.values(scores).reduce((a, b) => a + (b || 0), 0);
        });

        // Calculate placements
        const sorted = totals.map((t, i) => ({ total: t, idx: i }))
            .filter(x => x.total > 0)
            .sort((a, b) => a.total - b.total);
        const placements = new Array(playersList.length).fill('');
        let rank = 1;
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i].total > sorted[i - 1].total) rank = i + 1;
            const medals = ['🥇', '🥈', '🥉'];
            placements[sorted[i].idx] = rank <= 3 ? medals[rank - 1] : `#${rank}`;
        }

        playersList.forEach(([, p], i) => {
            const isWinner = placements[i] === '\ud83e\udd47';
            html += `<td class="${isWinner ? 'winner' : ''}"><strong>${totals[i]}</strong> ${placements[i]}</td>`;
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
            state.maxAttempts = data.settings ? (data.settings.maxAttempts || 7) : 7;

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

            // Host: handle late join requests
            if (state.isHost && data.joinRequests) {
                handleJoinRequests(data.joinRequests);
            }
        });
        listeners.push({ ref: gameRef, event: 'value', callback: ref });
    }

    let pendingRequest = null; // prevent multiple popups
    function handleJoinRequests(requests) {
        const entries = Object.entries(requests);
        if (entries.length === 0 || pendingRequest) return;
        const [reqId, reqData] = entries[0];
        pendingRequest = reqId;
        const allow = confirm(`${reqData.name} möchte dem laufenden Spiel beitreten. Zulassen?`);
        if (allow) {
            // Add player and remove request
            const playerCount = Object.keys(state.players).length;
            gameRef.child('players/' + reqId).set({
                name: reqData.name,
                color: reqData.color,
                order: playerCount
            }).then(() => {
                return gameRef.child('joinRequests/' + reqId).remove();
            });
        } else {
            // Deny: remove request
            gameRef.child('joinRequests/' + reqId).remove();
        }
        pendingRequest = null;
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

    // ========== EMAIL RESULTS ==========
    function sendResultsEmail() {
        const playersList = getSortedPlayers();
        const holes = state.holes;

        // Build totals with proper score reading
        const results = playersList.map(([pid, p]) => {
            const playerScores = state.scores[pid] || {};
            let total = 0;
            const perHole = [];
            for (let h = 0; h < holes; h++) {
                const s = Number(playerScores[h]) || 0;
                perHole.push(s);
                total += s;
            }
            return { name: p.name, total, perHole };
        });

        const sorted = [...results].sort((a, b) => a.total - b.total);

        let body = 'Minigolf Ergebnis\n\n';
        body += 'Platzierung:\n';
        sorted.forEach((p, i) => {
            body += `${i + 1}. ${p.name}: ${p.total} Schläge\n`;
        });
        body += '\n--- Details ---\n\n';

        results.forEach(p => {
            body += `${p.name}: `;
            p.perHole.forEach((s, h) => {
                body += `B${h + 1}:${s} `;
            });
            body += `= ${p.total}\n`;
        });

        const subject = 'Minigolf Ergebnis - ' + new Date().toLocaleDateString('de-DE');
        window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
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
})();
