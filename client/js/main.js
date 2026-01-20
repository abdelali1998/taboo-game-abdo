const socket = io();

// Global State
let gameState = {
    roomId: null,
    isHost: false,
    players: [],
    myTeam: null
};

// --- THEME LOGIC ---
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-btn');
    if(btn) {
        btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
}

window.addEventListener('DOMContentLoaded', initTheme);

// --- SOCKET LOGIC ---
socket.on('updatePlayers', (players) => {
    gameState.players = players;
    
    // 1. Update Lobby
    const lobbyList = document.getElementById('player-list');
    if (lobbyList && !document.getElementById('screen-lobby').classList.contains('hidden')) {
        lobbyList.innerHTML = players.map(p => `<div class="player-pill">${p.name}</div>`).join('');
    }

    // 2. Update Teams
    const teamScreen = document.getElementById('screen-teams');
    if (teamScreen && !teamScreen.classList.contains('hidden')) {
        teams.render();
    }

    // 3. Update Host Buttons
    const btnCont = document.getElementById('btn-continue');
    if (gameState.isHost && btnCont) {
        btnCont.disabled = players.length < 2; 
    }
});

socket.on('errorMsg', (msg) => {
    alert(msg);
});