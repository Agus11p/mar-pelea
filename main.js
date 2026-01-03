/* main.js - FINAL PRODUCTION VERSION */

/* ---------- CONFIGURACIÓN ---------- */
const STORAGE_KEYS = { USER: 'msgp_username' };
let dbRefGame = null;
let gameState = {
    gameId: null, board: Array(9).fill(null), turn: 'X', mySymbol: null,
    isActive: false, players: { X: '...', O: '...' },
    isMatchmaking: false, searchTimeout: null
};

/* ---------- SEGURIDAD INMEDIATA (Ejecución Global) ---------- */
(function () {
    const isLoginPage = window.location.pathname.includes('login.html');
    const sessionActive = localStorage.getItem('msgp_session_active');

    if (!isLoginPage && !sessionActive) {
        window.location.href = 'login.html';
    }
})();

function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.add('hidden');
}

/* ---------- UTILIDADES ---------- */
function $(s) { return document.querySelector(s); }
function getStorage(k, d) {
    const v = localStorage.getItem(k);
    if (!v) return d;
    try { return JSON.parse(v); } catch (e) { return v; }
}
function setStorage(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function goto(p) { window.location.href = p; }


/* ---------- INICIO DEL SISTEMA ---------- */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Mar App System Ready");

    console.log("🚀 Mar App System Ready");

    const path = window.location.pathname;
    const isLoginPage = path.includes('login.html');

    // 2. AUTH LISTENER
    auth.onAuthStateChanged(user => {
        const sessionActive = localStorage.getItem('msgp_session_active');

        if (user) {
            console.log("✅ Acceso autorizado:", user.uid);
            // Si hay usuario, nos aseguramos de que el flag de sesión esté activo
            localStorage.setItem('msgp_session_active', 'true');
            setupUserSession(user);

            if (isLoginPage) {
                goto('index.html');
            } else {
                document.body.style.setProperty('display', 'block', 'important');
                const page = document.body.getAttribute('data-page');
                if (page === 'home') initHome();
                else if (page === 'matching') initMatching();
                else if (page === 'tateti') initTateti();
                initGlobalData();
                hideLoader();
            }
        } else {
            console.log("⌛ Sin usuario detectado...");
            // Solo redirigir si no hay sesión activa Y no estamos en login
            if (!isLoginPage && !sessionActive) {
                goto('login.html');
            } else {
                hideLoader();
            }
        }
    });
});

function setupUserSession(user) {
    // Sincronización inteligente de nombre: 
    // Prioridad 1: LocalStorage (lo que escribió el usuario)
    // Prioridad 2: Perfil de Google
    // Prioridad 3: Guerrero (default)
    let localNick = getStorage(STORAGE_KEYS.USER, null);
    let name = localNick || user.displayName || "Guerrero";

    setStorage(STORAGE_KEYS.USER, name);

    // PRESENCIA ONLINE (Heartbeat)
    const userStatusRef = db.ref('server/activeUsers/' + user.uid);
    const connectionRef = db.ref('.info/connected');

    connectionRef.on('value', (snap) => {
        if (snap.val() === false) return;
        userStatusRef.onDisconnect().remove();
        userStatusRef.set({
            name: name,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Sincronizar nombre en el ranking sin alterar puntos
        updateUserRank(user.uid, name, null);
    });
}


/* ---------- DASHBOARD (HOME) ---------- */
function initHome() {
    const btn = $('#join-btn');
    if (btn) btn.onclick = () => window.location.href = `matching.html?find=true`;

    // Listener de Ranking y Peleas Totales
    db.ref('server/stats/totalFights').on('value', s => { if ($('#stat-total-fights')) $('#stat-total-fights').textContent = s.val() || 0; });
    db.ref('server/activeUsers').on('value', s => { if ($('#stat-active-users')) $('#stat-active-users').textContent = s.numChildren() || 1; });

    initLiveFightsList();
}

function initLiveFightsList() {
    const container = $('#live-fights-container');
    if (!container) return; // No estamos en home

    const myUid = auth.currentUser ? auth.currentUser.uid : null;

    // Listener para partidas en curso
    db.ref('games').orderByChild('status').equalTo('playing').limitToLast(5).on('value', gamesSnap => {
        // Listener para gente en la cola
        db.ref('queue').limitToLast(10).on('value', queueSnap => {
            renderLobby(container, gamesSnap, queueSnap, myUid);
        });
    });
}

function renderLobby(container, gamesSnap, queueSnap, myUid) {
    container.innerHTML = '';
    let hasContent = false;

    // 1. Mostrar gente esperando (Prioridad arriba)
    queueSnap.forEach(child => {
        const q = child.val();
        if (child.key === myUid) return; // No mostrarse a uno mismo

        hasContent = true;
        container.innerHTML += `
            <div class="fight-card" style="border-left: 3px solid var(--accent-pink);">
                <div class="fight-card-header" style="color:var(--accent-pink); font-weight:700;">
                    <i class="fa-solid fa-hourglass-half"></i> BUSCANDO RIVAL
                </div>
                <div class="fight-card-vs">
                    <span>${q.name}</span>
                    <button class="join-btn" onclick="joinSpecificPlayer('${child.key}', '${q.name}')">PELEAR</button>
                </div>
            </div>`;
    });

    // 2. Mostrar partidas en vivo
    gamesSnap.forEach(child => {
        const g = child.val();
        hasContent = true;
        container.innerHTML += `
            <div class="fight-card">
                <div class="fight-card-header">EN VIVO</div>
                <div class="fight-card-vs">
                    <span>${g.host}</span> <span class="vs-badge">⚡</span> <span>${g.guest}</span>
                </div>
            </div>`;
    });

    if (!hasContent) {
        container.innerHTML = '<div style="padding:1rem; opacity:0.6;">Arena tranquila...</div>';
    }
}

function joinSpecificPlayer(opponentUid, opponentName) {
    const myName = getStorage(STORAGE_KEYS.USER, 'Player');
    const myUid = auth.currentUser.uid;

    console.log("⚔️ Intentando unirse a:", opponentName);

    // Capturar oponente
    db.ref('queue/' + opponentUid).transaction(val => {
        return val ? null : undefined;
    }, (error, committed) => {
        if (committed) {
            console.log("✅ Captura exitosa. Creando arena...");
            createGameAndInvite(myName, opponentName, opponentUid);
        } else {
            alert("No se pudo unir: El oponente ya entró a otra partida o se retiró.");
        }
    });
}
window.joinSpecificPlayer = joinSpecificPlayer;

function initGlobalData() {
    // 1. ACTUALIZAR PERFIL PERSONAL (NUEVO)
    const myUid = auth.currentUser.uid;
    db.ref('ranking/' + myUid).on('value', snap => {
        const nameEl = $('#user-display-name');
        const ptEl = $('#user-stat-points');
        const streakEl = $('#user-stat-streak');
        const winsEl = $('#user-stat-wins');
        const tierEl = $('#user-stat-tier');
        const rankTitleEl = $('#user-display-rank');

        if (nameEl) {
            if (snap.exists()) {
                const data = snap.val();
                nameEl.textContent = data.name;
                if (ptEl) ptEl.textContent = data.points || 0;
                if (streakEl) streakEl.textContent = data.streak || 0;
                if (winsEl) winsEl.textContent = data.wins || 0;

                // Lógica de Rangos
                let tier = "Novato";
                let color = "#aaa";
                if (data.points >= 500) { tier = "Leyenda"; color = "#ffae00"; }
                else if (data.points >= 200) { tier = "Maestro"; color = "#00e5ff"; }
                else if (data.points >= 100) { tier = "Experto"; color = "#ff2f92"; }

                if (tierEl) {
                    tierEl.textContent = tier;
                    tierEl.style.color = color;
                }
                if (rankTitleEl) rankTitleEl.textContent = `${tier} de la Arena`;
            } else {
                const myName = getStorage(STORAGE_KEYS.USER, "Guerrero");
                nameEl.textContent = myName;
                if (ptEl) ptEl.textContent = "0";
                if (streakEl) streakEl.textContent = "0";
                if (winsEl) winsEl.textContent = "0";
                if (tierEl) tierEl.textContent = "Novato";
            }
        }
    });

    // 2. RANKING EN TIEMPO REAL
    const list = $('#home-top-list');
    if (!list) return;

    db.ref('ranking').orderByChild('points').limitToLast(10).on('value', snap => {
        list.innerHTML = '';
        const data = [];
        let maxGlobalStreak = 0;

        snap.forEach(c => {
            const d = c.val();
            data.push(d);
            if (d.maxStreak > maxGlobalStreak) maxGlobalStreak = d.maxStreak;
        });

        // Orden Descendente
        data.reverse().forEach((p, i) => {
            list.innerHTML += `
            <li class="ranking-item ${i === 0 ? 'top-1' : ''}">
               <div class="rank-pos">${i + 1}</div>
               <div class="rank-info">
                    <span class="rank-name">${p.name}</span>
                    <div style="display:flex; justify-content:space-between; width:100%">
                        <span class="rank-pts">${p.points} PTS</span>
                        ${p.streak > 2 ? `<span style="color:#ffae00; font-size:0.7rem;">🔥 ${p.streak}</span>` : ''}
                    </div>
               </div>
            </li>`;
        });

        const streakEl = $('#stat-knockouts');
        if (streakEl) streakEl.textContent = maxGlobalStreak;
    });
}


/* ---------- MOTOR DE JUEGO (MATCHMAKING & GAMEPLAY) ---------- */
function initMatching() {
    const params = new URLSearchParams(window.location.search);
    const find = params.has('find');
    const myName = getStorage(STORAGE_KEYS.USER, 'Player');
    const col = $('.center-col');

    if (find) {
        startMatchmakingQueue(myName, col);
    } else {
        goto('index.html');
    }
}

// 1. SISTEMA DE COLA (QUEUE) ROBUSTO
function startMatchmakingQueue(myName, container) {
    const myUid = auth.currentUser.uid;
    const queueRef = db.ref('queue');
    const myInviteRef = db.ref('invites/' + myUid);

    console.log("🚀 Iniciando radar para:", myUid);

    if (!gameState.isMatchmaking) {
        renderRadarSearching(container);
        gameState.isMatchmaking = true;
    }

    // Limpieza previa profunda
    myInviteRef.off();
    myInviteRef.remove();
    queueRef.child(myUid).remove();

    // Listener de Invitaciones (Si alguien nos elige)
    myInviteRef.on('value', snap => {
        const gameId = snap.val();
        if (gameId && gameState.isMatchmaking) {
            console.log("🎮 ¡Invitación recibida! GID:", gameId);
            stopMatchmaking(myUid);
            gameState.mySymbol = 'O';
            renderRadarFound(container, "OPONENTE");
            setTimeout(() => {
                window.location.replace(`tateti.html?gameId=${gameId}&symbol=O`);
            }, 1000);
        }
    });

    let myTimestamp = 0;

    // Función de búsqueda activa
    const performSearch = () => {
        if (!gameState.isMatchmaking) return;

        console.log("📡 Escaneando lobby (Yo:", myUid, "T:", myTimestamp, ")...");

        queueRef.orderByChild('timestamp').limitToFirst(10).once('value', snap => {
            if (!gameState.isMatchmaking) return;

            let opponent = null;
            snap.forEach(c => {
                const data = c.val();
                if (c.key === myUid) return; // Saltarse a uno mismo

                // LÓGICA DE DESEMPATE (OBLIGATORIA PARA EVITAR DOBLE ARENA)
                // El que tiene timestamp menor es el "viejo" (Guest).
                // El que tiene timestamp mayor es el "nuevo" (Host).
                // Si soy nuevo, puedo capturar a un viejo.
                const isOpponentOlder = (data.timestamp < myTimestamp) || (data.timestamp === myTimestamp && c.key < myUid);

                if (isOpponentOlder) {
                    opponent = { uid: c.key, name: data.name };
                    console.log("🎯 Candidato encontrado:", opponent.name, "(Older than me)");
                    return true;
                }
            });

            if (opponent) {
                console.log("⚔️ Intentando capturar a:", opponent.name);
                queueRef.child(opponent.uid).transaction(val => {
                    return val ? null : undefined; // Eliminar si existe
                }, (error, committed) => {
                    if (committed && gameState.isMatchmaking) {
                        console.log("✅ Captura exitosa. Creando arena...");
                        stopMatchmaking(myUid);
                        createGameAndInvite(myName, opponent.name, opponent.uid);
                    } else {
                        console.warn("⚠️ Fallo captura (ya no está). Reintentando...");
                        setTimeout(performSearch, 800);
                    }
                });
            } else {
                // No hay candidatos aptos (o soy el más viejo). Esperar 2 segundos.
                if (gameState.isMatchmaking) {
                    if (gameState.searchTimeout) clearTimeout(gameState.searchTimeout);
                    gameState.searchTimeout = setTimeout(performSearch, 2000);
                }
            }
        });
    };

    // REGISTRO Y LANZAMIENTO
    queueRef.child(myUid).set({
        name: myName,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        queueRef.child(myUid).onDisconnect().remove();
        // Esperar el timestamp real ANTES de buscar para que la lógica de Older funcione
        queueRef.child(myUid + '/timestamp').once('value', s => {
            myTimestamp = s.val() || Date.now();
            console.log("✅ Registrado en cola. Mi tiempo:", myTimestamp);
            performSearch(); // Iniciar loop
        });
    }).catch(err => {
        console.error("❌ Error registrando en cola:", err);
    });

    // Botón Cancelar
    const cBtn = $('#cancel-search');
    if (cBtn) {
        cBtn.onclick = () => {
            console.log("🚫 Matchmaking cancelado por el usuario");
            stopMatchmaking(myUid);
            goto('index.html');
        };
    }
}

function stopMatchmaking(uid) {
    gameState.isMatchmaking = false;
    if (gameState.searchTimeout) clearTimeout(gameState.searchTimeout);
    db.ref('invites/' + uid).off();
    db.ref('queue/' + uid).remove();
}

function createGameAndInvite(hostName, guestName, guestUid) {
    const gameRef = db.ref('games').push();
    const gid = gameRef.key;

    console.log("📝 Inicializando partida:", gid);

    // El host crea la estructura inicial
    const gameData = {
        host: hostName,
        hostUid: auth.currentUser.uid,
        guest: guestName,
        guestUid: guestUid,
        board: Array(9).fill(null),
        turn: 'X',
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    gameRef.set(gameData).then(() => {
        // Invitamos al guest
        db.ref('invites/' + guestUid).set(gid);

        gameState.mySymbol = 'X';
        renderRadarFound($('.center-col'), guestName);

        // El host redirige
        setTimeout(() => {
            window.location.replace(`tateti.html?gameId=${gid}&symbol=X`);
        }, 1200);
    });
}

function initTateti() {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gameId');
    const symbol = params.get('symbol');

    if (!gid || !symbol) {
        console.error("❌ Faltan parámetros de juego");
        goto('index.html');
        return;
    }

    gameState.mySymbol = symbol;

    // Conexión directa ya que auth ya está verificado en el listener global
    connectToGame(gid);
}

// 2. CONEXIÓN Y SINCRONIZACIÓN DE JUEGO (EN TATETI.HTML)
function connectToGame(gid) {
    console.log("🔌 Conectando a partida:", gid);
    gameState.gameId = gid;
    dbRefGame = db.ref('games/' + gid);

    // Pequeño workaround para que el guest "active" la partida cuando entre
    if (gameState.mySymbol === 'O') {
        dbRefGame.child('status').set('playing');
    }

    dbRefGame.on('value', snap => {
        const d = snap.val();

        if (!d) {
            console.warn("⚠️ Partida no encontrada.");
            setTimeout(() => { if (!gameState.isActive) goto('index.html'); }, 3000);
            return;
        }

        if (d.status === 'aborted' && !d.winner) {
            alert("El oponente abandonó la arena.");
            stopMatchmakingCleanup(gid);
            goto('index.html');
            return;
        }

        // Inicialización de la Arena
        if (!gameState.isActive) {
            gameState.isActive = true;
            gameState.players = {
                X: d.host || 'Jugador X',
                O: d.guest || 'Jugador O',
                X_uid: d.hostUid,
                O_uid: d.guestUid
            };

            // Anti-Ragequit Mejorado
            dbRefGame.child('status').onDisconnect().set('aborted');

            renderArena(gameState.players.X, gameState.players.O);
        }

        // Sincronización del Tablero y Turno
        gameState.board = d.board || Array(9).fill(null);
        gameState.turn = d.turn || 'X';

        updateBoardUI();
        updateTurnUI(gameState.turn);

        // Verificación de Ganador
        if (d.winner) {
            endGameUI(d.winner);
            dbRefGame.off(); // Dejar de escuchar esta partida

            // Limpieza pasiva después de un tiempo
            setTimeout(() => {
                if (gameState.mySymbol === 'X') {
                    dbRefGame.remove();
                    // También limpiar el status global si es necesario
                }
            }, 15000);
        }
    });
}

function stopMatchmakingCleanup(gid) {
    db.ref('games/' + gid).off();
    gameState.isActive = false;
}

// 3. LÓGICA DE MOVIMIENTOS ATÓMICOS
window.handleCellClick = function (idx) {
    if (!gameState.isActive || gameState.turn !== gameState.mySymbol || gameState.board[idx]) return;

    // Optimismo UI (Feedback instantáneo)
    $(`.game-cell[data-idx="${idx}"]`).textContent = gameState.mySymbol === 'X' ? '✕' : '◯';

    // Transacción para asegurar turno
    dbRefGame.transaction(game => {
        if (game && game.turn === gameState.mySymbol && !game.board[idx] && !game.winner) {
            game.board[idx] = gameState.mySymbol;

            // Check Win Local inside Transaction
            if (checkWin(game.board, gameState.mySymbol)) {
                game.winner = gameState.mySymbol;
                game.status = 'finished';
            } else if (!game.board.includes(null)) {
                game.winner = 'DRAW';
                game.status = 'finished';
            } else {
                game.turn = gameState.mySymbol === 'X' ? 'O' : 'X';
            }
            return game;
        }
        return; // Abortar si el estado cambió ajeno a mi
    });
}


/* ---------- RESULTADOS Y PUNTOS (ATÓMICOS) ---------- */
function endGameUI(winner) {
    const amIWinner = winner === gameState.mySymbol;
    const isDraw = winner === 'DRAW';

    // Solo el GANADOR (o el Host en empate) procesa los puntos para evitar doble contabilidad
    if (amIWinner || (isDraw && gameState.mySymbol === 'X')) {
        updateGlobalStats(winner);
    }

    // Mostrar Overlay
    const msg = isDraw ? 'EMPATE' : (amIWinner ? '¡VICTORIA!' : 'DERROTA');
    const color = isDraw ? '#fff' : (amIWinner ? '#ff2f92' : '#666');

    $('.center-col').innerHTML += `
        <div class="end-game-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.95); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:9999; animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(10px);">
             <div class="end-game-card" style="text-align:center; padding:3rem; border-radius:30px; border:1px solid ${color}; box-shadow:0 0 50px rgba(0,0,0,0.5);">
                 <p style="color:#888; text-transform:uppercase; letter-spacing:3px; font-size:0.8rem; margin-bottom:1rem;">Resultado Final</p>
                 <h1 style="font-size:4rem; color:${color}; text-shadow:0 0 30px ${color}; margin-bottom:2rem; font-weight:900;">${msg}</h1>
                 <button onclick="goto('index.html')" class="cta-button" style="background:${color}; color:#000; padding:15px 40px; border-radius:15px; border:none; font-weight:900; cursor:pointer; font-size:1.2rem; transition:0.3s;">VOLVER AL LOBBY</button>
             </div>
        </div>
    `;
}

function updateGlobalStats(winner) {
    // 1. Total Fights (+1)
    db.ref('server/stats/totalFights').transaction(c => (c || 0) + 1);

    // 2. Ranking Update
    if (winner !== 'DRAW') {
        const winnerUid = gameState.players[winner + '_uid'];
        const loserUid = gameState.players[(winner === 'X' ? 'O' : 'X') + '_uid'];
        const winnerName = gameState.players[winner];
        const loserName = gameState.players[winner === 'X' ? 'O' : 'X'];

        updateUserRank(winnerUid, winnerName, true);
        updateUserRank(loserUid, loserName, false);
    }
}

function updateUserRank(uid, name, won) {
    if (!uid) return;

    db.ref('ranking/' + uid).transaction(currentData => {
        if (currentData === null) {
            // Primer vez del usuario en el ranking
            return {
                name: name,
                points: won ? 25 : 0,
                wins: won ? 1 : 0,
                streak: won ? 1 : 0,
                maxStreak: won ? 1 : 0
            };
        }

        // Usuario existente, actualizamos atómicamente
        const data = { ...currentData };
        data.name = name; // Actualizar nombre por si lo cambió

        if (won !== null) {
            if (won) {
                data.points = (data.points || 0) + 25;
                data.wins = (data.wins || 0) + 1;
                data.streak = (data.streak || 0) + 1;
                if (data.streak > (data.maxStreak || 0)) data.maxStreak = data.streak;
            } else {
                data.points = Math.max(0, (data.points || 0) - 10);
                data.streak = 0;
            }
        }

        return data;
    });
}


/* ---------- HELPERS UI ---------- */
function checkWin(b, s) {
    const w = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    return w.some(c => c.every(i => b[i] === s));
}
function updateBoardUI() {
    gameState.board.forEach((v, i) => {
        const c = $(`.game-cell[data-idx="${i}"]`);
        if (c) { c.textContent = v == 'X' ? '✕' : (v == 'O' ? '◯' : ''); c.className = `game-cell ${v || ''}`; }
    });
}
function updateTurnUI(t) {
    $('#player-card-X')?.classList.toggle('active-turn', t === 'X');
    $('#player-card-O')?.classList.toggle('active-turn', t === 'O');
}
function renderRadarSearching(c) {
    c.innerHTML = `<div class="searching-container"><h2 class="search-title">BUSCANDO OPONENTE...</h2><div class="radar-wrapper"><div class="radar-circle"></div><div class="radar-circle" style="animation-delay:0.5s"></div><div class="radar-icon"><i class="fa-solid fa-earth-americas"></i></div></div><p style="text-align:center;color:#666;margin-top:2rem">Escaneando lobby...</p><button id="cancel-search" class="control-btn" style="width:auto;margin-top:1rem">CANCELAR</button></div>`;
}
function renderRadarFound(c, name) {
    c.innerHTML = `<div class="searching-container"><h2 class="search-title" style="color:#0f0">¡ENCONTRADO!</h2><div class="radar-wrapper"><div class="radar-icon" style="background:#0f0;color:#000"><i class="fa-solid fa-check"></i></div></div><p style="font-size:1.5rem;color:#fff;margin-top:1rem">VS ${name}</p></div>`;
}
function renderArena(h, g) {
    $('.center-col').innerHTML = `<div class="arena-container"><div class="arena-header"><div class="round-timer">EN JUEGO</div></div><div class="battle-ground"><div id="player-card-X" class="player-card"><div class="turn-badge">TURNO</div><div class="player-avatar"><i class="fa-solid fa-user"></i></div><div class="player-name">${h}</div></div><div class="board-frame"><div class="board-grid">${Array(9).fill(0).map((_, i) => `<div class="game-cell" onclick="handleCellClick(${i})" data-idx="${i}"></div>`).join('')}</div></div><div id="player-card-O" class="player-card is-rival"><div class="turn-badge">TURNO</div><div class="player-avatar"><i class="fa-solid fa-user"></i></div><div class="player-name">${g}</div></div></div></div>`;
}
