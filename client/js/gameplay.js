const gameplay = {
    turnDuration: 60,

    requestStart() { 
        const duration = document.getElementById('timer-setting').value;
        socket.emit('startGame', { roomId: gameState.roomId, timerSetting: duration }); 
    },
    
    confirmStart() {
        socket.emit('confirmStartTurn', gameState.roomId);
    },

    handleInputKey(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault(); 
            const input = e.target;
            const val = input.value;
            
            if(val.trim()) {
                socket.emit('sendGuess', { roomId: gameState.roomId, rawInput: val });
                input.value = ""; 
            }
        }
    },

    forceSkip() {
        if(confirm("Skip turn?")) {
            socket.emit('forceSkip', gameState.roomId);
        }
    },

    removeStuckDescriber() {
        if(confirm("Kick player and pass turn?")) {
            socket.emit('hostRemoveStuckDescriber', gameState.roomId);
        }
    },

    nextTurn() {
        socket.emit('startNextTurnManual', gameState.roomId);
    },

    // UPDATED: Pass language to reset
    resetGame() {
        if(confirm("Are you sure you want to RESET?")) {
            const lang = document.getElementById('reset-lang-select').value;
            socket.emit('resetGame', { roomId: gameState.roomId, newLanguage: lang });
        }
    }
};

socket.on('gameStarted', (duration) => {
    gameplay.turnDuration = duration;
    ui.showScreen('screen-game');
});

socket.on('gameReset', () => {
    ui.showScreen('screen-teams');
});

socket.on('describerSelected', (data) => {
    ui.showScreen('screen-game'); 
    ui.hide('screen-summary');
    document.getElementById('turn-info').innerText = `Waiting for ${data.describerName} to start...`;
    
    ui.hide('describer-view');
    ui.hide('guesser-view');
    ui.hide('describer-ready-area');
    document.getElementById('guess-feed').innerHTML = '';

    if (data.describerId === socket.id) {
        ui.show('describer-ready-area');
        ui.hide('host-stuck-controls'); 
    } else {
        if (gameState.isHost) ui.show('host-stuck-controls');
        else ui.hide('host-stuck-controls');
    }
});

socket.on('newTurn', (data) => {
    ui.hide('describer-ready-area'); 
    ui.hide('host-stuck-controls');
    
    const isMe = (data.describerId === socket.id);
    const describer = gameState.players.find(p => p.id === data.describerId);
    const me = gameState.players.find(p => p.id === socket.id);
    const isTeammate = (describer && me && describer.team === me.team);

    if(isMe) {
        ui.show('describer-view');
        const list = document.getElementById('target-words-list');
        list.innerHTML = data.words.map(w => 
            `<li class="${w.guessed ? 'word-found' : ''}">${w.word}</li>`
        ).join('');
    } else {
        ui.show('guesser-view');
        document.getElementById('turn-info').innerText = `${data.describerName} is describing!`;
        
        const input = document.getElementById('guess-input');
        input.disabled = false;
        if(!isTeammate) {
            input.placeholder = "Opponent's turn (Chat only)...";
        } else {
            input.placeholder = "Type guesses then press ENTER...";
        }
        input.value = "";
        input.focus();
    }

    timer.start(data.duration, 
        (t) => document.getElementById('timer').innerText = t, 
        () => document.getElementById('timer').innerText = "0"
    );
});

socket.on('roundSummary', (data) => {
    ui.showScreen('screen-summary');
    ui.hide('host-stuck-controls');

    document.getElementById('summ-score-1').innerText = data.scores.team1;
    document.getElementById('summ-score-2').innerText = data.scores.team2;

    document.getElementById('summ-members-1').innerHTML = data.team1Members.map(n => `<div>• ${n}</div>`).join('');
    document.getElementById('summ-members-2').innerHTML = data.team2Members.map(n => `<div>• ${n}</div>`).join('');

    const wordsList = document.getElementById('summary-words-list');
    wordsList.innerHTML = data.targetWords.map(w => 
        `<li class="${w.guessed ? 'sum-found' : 'sum-missed'}">
            ${w.word} ${w.guessed ? '✓' : '✗'}
        </li>`
    ).join('');

    const guessesList = document.getElementById('summary-guesses-list');
    if (data.roundGuesses.length === 0) {
        guessesList.innerHTML = "<em>No guesses made.</em>";
    } else {
        guessesList.innerHTML = data.roundGuesses.map(g => {
            let cls = '';
            if (g.result === 'CORRECT') cls = 'log-correct';
            else if (g.result === 'CLOSE') cls = 'log-close';
            // UPDATED HTML STRUCTURE FOR WRAPPING
            return `<div class="log-item ${cls}">
                        <strong>${g.playerName}:</strong><br>
                        <span class="log-word">${g.word}</span>
                    </div>`;
        }).join('');
    }

    if(socket.id === data.lastDescriberId) {
        ui.show('btn-next-turn');
        ui.hide('msg-wait-host');
    } else {
        ui.hide('btn-next-turn');
        ui.show('msg-wait-host');
        document.getElementById('msg-wait-host').innerText = "Waiting for previous describer...";
    }
    
    if (gameState.isHost) {
        ui.show('reset-controls');
    } else {
        ui.hide('reset-controls');
    }
});

socket.on('updateScore', (scores) => {
    document.getElementById('score-board').innerText = `Team 1: ${scores.team1} | Team 2: ${scores.team2}`;
});

socket.on('guessReceived', (data) => {
    const feed = document.getElementById('guess-feed');
    let indicator = '';

    if (data.similarity === 1.0) {
        indicator = `<i class="fa-solid fa-check" style="color: #00c853; margin-left: 8px;"></i>`;
    } else if (data.similarity >= 0.85) {
        indicator = `<span class="blue-rect"></span>`;
    }
    
    feed.innerHTML += `<div class="guess-msg"><strong>${data.playerName}:</strong> ${data.word} ${indicator}</div>`;
    feed.scrollTop = feed.scrollHeight;
});

socket.on('wordGuessedSuccess', ({ wordIndex, scores }) => {
    document.getElementById('score-board').innerText = `Team 1: ${scores.team1} | Team 2: ${scores.team2}`;
    const items = document.querySelectorAll('#target-words-list li');
    if(items[wordIndex]) items[wordIndex].classList.add('word-found');
});