const lobby = {
    create() {
        const name = document.getElementById('host-name-input').value || 'Host';
        const lang = document.getElementById('lang-select').value;
        sessionStorage.setItem('playerName', name);
        socket.emit('createGame', { hostName: name, language: lang });
    },

    checkAutoJoin() {
        const path = window.location.pathname.substring(1).toUpperCase();
        if (path.length === 5) {
            gameState.roomId = path;
            const cachedName = sessionStorage.getItem('playerName');
            if (cachedName) {
                document.getElementById('join-name-input').value = cachedName;
            }
            ui.showScreen('screen-join');
        }
    },

    confirmJoin() {
        const name = document.getElementById('join-name-input').value;
        if (!name) return alert("Please enter a name");
        
        sessionStorage.setItem('playerName', name);
        socket.emit('joinGame', { roomId: gameState.roomId, playerName: name });
    },

    copyLink() {
        const input = document.getElementById('game-link-input');
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).then(() => {
            alert("Link copied to clipboard!");
        });
    }
};

socket.on('gameCreated', (data) => {
    window.location.href = '/' + data.roomId;
});

socket.on('hostStatus', (isHost) => {
    gameState.isHost = isHost;
    ui.showScreen('screen-lobby');
    
    const link = window.location.origin + '/' + gameState.roomId;
    document.getElementById('game-link-input').value = link;
});

window.addEventListener('load', lobby.checkAutoJoin);