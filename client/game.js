// Use a production URL if on Vercel (you will change this URL after deploying the backend)
const BACKEND_URL = window.location.hostname === 'localhost' ? '' : 'https://YOUR-RENDER-BACKEND-URL-HERE.onrender.com';
const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameContainer = document.getElementById('game-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const healthBar = document.getElementById('health-bar');
const healthText = document.getElementById('health-text');
const scoreCounter = document.getElementById('score-counter');
const killFeed = document.getElementById('kill-feed');
const leaderboardList = document.getElementById('leaderboard-list');
const deathOverlay = document.getElementById('death-overlay');
const respawnTimer = document.getElementById('respawn-timer');

// Game State
let myId = null;
let players = {};
let bullets = [];
let camera = { x: 0, y: 0 };
let mapSize = { w: 2000, h: 2000 };
let input = { up: false, down: false, left: false, right: false };

// Keep track of mouse for shooting direction relative to camera
let mouseX = 0;
let mouseY = 0;

// Responsive Canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Input Listeners
window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
        case 'w': input.up = true; break;
        case 's': input.down = true; break;
        case 'a': input.left = true; break;
        case 'd': input.right = true; break;
    }
    sendInput();
});

window.addEventListener('keyup', (e) => {
    switch (e.key.toLowerCase()) {
        case 'w': input.up = false; break;
        case 's': input.down = false; break;
        case 'a': input.left = false; break;
        case 'd': input.right = false; break;
    }
    sendInput();
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    if (!myId || !players[myId]) return;

    // Calculate angle based on mouse position relative to center (since camera follows player)
    // Actually, mouse position is on screen, player is in center of screen usually.
    // BUT at edges of map, player might not be centered.
    // So we use: (Mouse Wld Pos) - (Player Wld Pos)
    // MouseWorld = MouseScreen + Camera

    const worldMouseX = mouseX + camera.x;
    const worldMouseY = mouseY + camera.y;

    const me = players[myId];
    const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);

    socket.emit('playerShoot', angle);
});

function sendInput() {
    socket.emit('playerMove', input);
}

// Join Game
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim() || "Guest";
    const roomId = roomIdInput.value.trim() || "arena1";

    socket.emit('joinRoom', { username, roomId });
    lobbyScreen.style.display = 'none';
    gameContainer.style.display = 'block';
});

// Socket Events
socket.on('init', (data) => {
    myId = data.id;
    mapSize.w = data.mapWidth;
    mapSize.h = data.mapHeight;
});

socket.on('gameStateUpdate', (state) => {
    players = state.players;
    bullets = state.bullets;

    const me = players[myId];
    if (me) {
        updateHUD(me);
        updateLeaderboard();

        // Death Overlay Logic
        if (me.health <= 0) {
            if (deathOverlay.style.display === 'none') {
                deathOverlay.style.display = 'flex';
                startRespawnCountdown();
            }
        } else {
            deathOverlay.style.display = 'none';
        }

        // Camera Follow Logic (Smooth)
        const targetX = me.x - canvas.width / 2;
        const targetY = me.y - canvas.height / 2;

        // Simple Lerp
        camera.x += (targetX - camera.x) * 0.1;
        camera.y += (targetY - camera.y) * 0.1;

        // Clamp camera to map bounds
        camera.x = Math.max(0, Math.min(mapSize.w - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(mapSize.h - canvas.height, camera.y));
    }
});

socket.on('playerKilled', ({ victimName, killerName }) => {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.innerHTML = `<strong>${killerName}</strong> killed <strong>${victimName}</strong>`;
    killFeed.prepend(msg);
    setTimeout(() => msg.remove(), 5000);
});

// HUD Update
function updateHUD(player) {
    const hpPercent = Math.max(0, player.health);
    healthBar.style.width = `${hpPercent}%`;
    healthText.innerText = `${Math.ceil(player.health)} / 100`;
    scoreCounter.innerHTML = `<span class="icon">🏆</span> ${player.score}`;
}

function updateLeaderboard() {
    // Sort players by score
    const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score).slice(0, 5);

    leaderboardList.innerHTML = sortedPlayers.map(p => `
        <div class="leaderboard-item ${p.id === myId ? 'me' : ''}">
            <span>${p.username}</span>
            <span>${p.score}</span>
        </div>
    `).join('');
}

function startRespawnCountdown() {
    let timeLeft = 3;
    respawnTimer.innerText = timeLeft;
    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(interval);
        } else {
            respawnTimer.innerText = timeLeft;
        }
    }, 1000);
}

// Render Loop
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!myId) {
        requestAnimationFrame(render);
        return;
    }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw Map Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, mapSize.w, mapSize.h);

    // Draw Grid
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= mapSize.w; x += 100) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapSize.h);
    }
    for (let y = 0; y <= mapSize.h; y += 100) {
        ctx.moveTo(0, y);
        ctx.lineTo(mapSize.w, y);
    }
    ctx.stroke();

    // Draw Borders
    ctx.strokeStyle = '#00ffc8';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapSize.w, mapSize.h);

    // Draw Bullets
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffff00';
    ctx.fillStyle = '#ffff00';
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Draw Players
    for (const id in players) {
        const p = players[id];

        ctx.save();
        ctx.translate(p.x, p.y);

        // Player Body
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Stroke
        if (id === myId) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Direction Indicator (Triangle)
            const worldMouseX = mouseX + camera.x;
            const worldMouseY = mouseY + camera.y;
            const angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);

            ctx.rotate(angle);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.moveTo(p.radius + 5, 0);
            ctx.lineTo(p.radius + 15, -5);
            ctx.lineTo(p.radius + 15, 5);
            ctx.fill();
            ctx.rotate(-angle);

        } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(p.username, 0, -p.radius - 15);
        ctx.shadowBlur = 0;

        // Mini Health Bar
        ctx.fillStyle = '#333';
        ctx.fillRect(-20, -p.radius - 10, 40, 6);

        const hpPct = p.health / 100;
        ctx.fillStyle = hpPct > 0.5 ? '#0f0' : (hpPct > 0.2 ? '#ff0' : '#f00');
        ctx.fillRect(-20, -p.radius - 10, 40 * hpPct, 6);

        ctx.restore();
    }

    ctx.restore();
    requestAnimationFrame(render);
}

render();
