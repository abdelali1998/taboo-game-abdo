const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- LOAD DATABASE ---
let WORD_DATABASE = {};
try {
    const rawData = require('./words.json');
    for (const lang in rawData) {
        WORD_DATABASE[lang] = {};
        if (Array.isArray(rawData[lang])) {
            rawData[lang].forEach(catObj => {
                WORD_DATABASE[lang][catObj.category] = catObj.words;
            });
        } else {
            WORD_DATABASE[lang] = rawData[lang];
        }
    }
} catch (e) {
    console.error("Error loading words.json", e);
    WORD_DATABASE = {
        en: { easy: ["Apple"], hard: ["Logic"], people: ["Elvis"], places: ["Rome"], culture: ["Music"] },
        fr: { easy: ["Pomme"], hard: ["Logique"], people: ["Elvis"], places: ["Rome"], culture: ["Musique"] },
        ar: { easy: ["تفاحة"], hard: ["منطق"], people: ["الفيس"], places: ["روما"], culture: ["موسيقى"] }
    };
}

app.use(express.static(path.join(__dirname, '../client')));

// --- ALGORITHMS ---
function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// --- GAME STATE ---
let games = {};

io.on('connection', (socket) => {
    
    socket.on('createGame', ({ hostName, language }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const selectedLang = WORD_DATABASE[language] ? language : 'en';
        
        const wordBag = JSON.parse(JSON.stringify(WORD_DATABASE[selectedLang]));

        games[roomId] = {
            id: roomId,
            hostName: hostName,
            language: selectedLang,
            players: [],
            scores: { team1: 0, team2: 0 },
            status: 'lobby', 
            currentDescriberId: null,
            targetWords: [],
            roundGuesses: [],
            turnDuration: 60,
            turnTimer: null,
            wordBag: wordBag,
            nextTeam: Math.random() > 0.5 ? 1 : 2,
            teamIndices: { 1: 0, 2: 0 } 
        };
        socket.emit('gameCreated', { roomId });
    });

    socket.on('joinGame', ({ roomId, playerName }) => {
        const game = games[roomId];
        if (!game) {
            socket.emit('errorMsg', "Room not found!");
            return;
        }

        socket.join(roomId);
        let player = game.players.find(p => p.name === playerName);
        if (player) {
            player.id = socket.id; 
            player.connected = true;
        } else {
            player = { id: socket.id, name: playerName, team: null, connected: true };
            game.players.push(player);
        }

        const isHost = (playerName === game.hostName);
        socket.emit('hostStatus', isHost);
        io.to(roomId).emit('updatePlayers', game.players);
        
        if (game.status === 'playing') {
            socket.emit('gameStarted', game.turnDuration);
            socket.emit('updateScore', game.scores);
            if (game.currentDescriberId) {
                const describer = game.players.find(p => p.id === game.currentDescriberId);
                socket.emit('newTurn', {
                    describerId: game.currentDescriberId,
                    describerName: describer ? describer.name : "Unknown",
                    words: (socket.id === game.currentDescriberId) ? game.targetWords : game.targetWords.map(w => ({...w, word: '???', guessed: w.guessed})),
                    scores: game.scores,
                    duration: 'SYNC' 
                });
            }
        }
    });

    // --- RESET GAME LOGIC (Updates Language) ---
    socket.on('resetGame', ({ roomId, newLanguage }) => {
        const game = games[roomId];
        if (!game) return;

        // 1. Update Language
        if (newLanguage && WORD_DATABASE[newLanguage]) {
            game.language = newLanguage;
        }

        // 2. Reset Scores & State
        game.scores = { team1: 0, team2: 0 };
        game.status = 'team_formation'; 
        game.currentDescriberId = null;
        game.targetWords = [];
        game.roundGuesses = [];
        
        // 3. Refill Word Bag with NEW Language
        game.wordBag = JSON.parse(JSON.stringify(WORD_DATABASE[game.language]));
        
        // 4. Reset Turn Order
        game.teamIndices = { 1: 0, 2: 0 };
        game.nextTeam = Math.random() > 0.5 ? 1 : 2;

        if (game.turnTimer) clearTimeout(game.turnTimer);

        // 5. Notify Clients
        io.to(roomId).emit('gameReset', game.players);
        io.to(roomId).emit('updateScore', game.scores);
    });

    socket.on('kickPlayer', ({ roomId, playerId }) => {
        const game = games[roomId];
        if (!game) return;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            const targetSocket = io.sockets.sockets.get(playerId);
            if (targetSocket) {
                targetSocket.emit('errorMsg', "You have been kicked by the host.");
                targetSocket.leave(roomId);
            }
            game.players.splice(playerIndex, 1);
            io.to(roomId).emit('updatePlayers', game.players);
        }
    });

    socket.on('hostRemoveStuckDescriber', (roomId) => {
        const game = games[roomId];
        if (!game) return;
        const describerId = game.currentDescriberId;
        if (!describerId) return;

        const describer = game.players.find(p => p.id === describerId);
        if (!describer) return;
        const teamNum = describer.team;

        const playerIndex = game.players.findIndex(p => p.id === describerId);
        if (playerIndex !== -1) {
             const targetSocket = io.sockets.sockets.get(describerId);
             if (targetSocket) {
                 targetSocket.emit('errorMsg', "You have been kicked by the host.");
                 targetSocket.leave(roomId);
             }
             game.players.splice(playerIndex, 1);
             io.to(roomId).emit('updatePlayers', game.players);
        }

        const teamPlayers = game.players.filter(p => p.team === teamNum && p.connected)
                                        .sort((a, b) => a.name.localeCompare(b.name));
        
        if (teamPlayers.length === 0) {
            io.to(roomId).emit('systemMessage', "No players left in this team! Round ended.");
            endTurn(roomId);
            return;
        }

        let idx = game.teamIndices[teamNum] % teamPlayers.length;
        const newDescriber = teamPlayers[idx];
        game.teamIndices[teamNum]++;
        game.currentDescriberId = newDescriber.id;

        io.to(roomId).emit('describerSelected', {
            describerId: newDescriber.id,
            describerName: newDescriber.name,
            team: teamNum
        });
    });

    socket.on('assignTeam', ({ roomId, playerId, teamNum }) => {
        const game = games[roomId];
        if (game) {
            const player = game.players.find(p => p.id === playerId);
            if (player) {
                player.team = teamNum;
                io.to(roomId).emit('updatePlayers', game.players);
            }
        }
    });

    socket.on('startGame', ({ roomId, timerSetting }) => {
        const game = games[roomId];
        if (!game) return;
        const t1 = game.players.filter(p => p.team === 1).length;
        const t2 = game.players.filter(p => p.team === 2).length;
        if (t1 < 2 || t2 < 2) {
            socket.emit('errorMsg', "Need minimum 2 players per team.");
            return;
        }
        game.turnDuration = parseInt(timerSetting) || 60;
        prepareNextTurn(roomId);
    });

    function prepareNextTurn(roomId) {
        const game = games[roomId];
        if (!game) return;

        game.status = 'waiting_for_describer';
        const teamToPlay = game.nextTeam;
        game.nextTeam = (teamToPlay === 1) ? 2 : 1;

        const teamPlayers = game.players.filter(p => p.team === teamToPlay && p.connected);
        if(teamPlayers.length === 0) return prepareNextTurn(roomId);

        teamPlayers.sort((a, b) => a.name.localeCompare(b.name));
        let currentIndex = game.teamIndices[teamToPlay];
        const describer = teamPlayers[currentIndex % teamPlayers.length];
        game.teamIndices[teamToPlay]++;

        game.currentDescriberId = describer.id;
        game.targetWords = []; 
        game.roundGuesses = []; 

        io.to(roomId).emit('describerSelected', {
            describerId: describer.id,
            describerName: describer.name,
            team: teamToPlay
        });
    }

    socket.on('confirmStartTurn', (roomId) => {
        const game = games[roomId];
        if (!game) return;
        if (game.currentDescriberId !== socket.id) return; 
        startActualTurn(roomId);
    });

    function startActualTurn(roomId) {
        const game = games[roomId];
        game.status = 'playing';

        const bag = game.wordBag;
        let selectedWords = [];
        const categories = ['easy', 'hard', 'people', 'places', 'culture'];

        categories.forEach(cat => {
            let list = bag[cat];
            if (!list || list.length === 0) {
                list = [...WORD_DATABASE[game.language][cat]];
                bag[cat] = list; 
            }
            if (list.length > 0) {
                const idx = Math.floor(Math.random() * list.length);
                const word = list.splice(idx, 1)[0];
                selectedWords.push({ word: word, guessed: false });
            }
        });

        selectedWords.sort(() => Math.random() - 0.5);

        game.targetWords = selectedWords;
        game.roundGuesses = []; 

        io.to(roomId).emit('newTurn', {
            describerId: game.currentDescriberId,
            describerName: game.players.find(p => p.id === game.currentDescriberId)?.name,
            words: game.targetWords,
            scores: game.scores,
            duration: game.turnDuration
        });

        if (game.turnTimer) clearTimeout(game.turnTimer);
        game.turnTimer = setTimeout(() => {
            endTurn(roomId);
        }, game.turnDuration * 1000);
    }

    // --- FIXED SCORING LOGIC ---
    socket.on('sendGuess', ({ roomId, rawInput }) => {
        const game = games[roomId];
        if (!game || game.status !== 'playing' || !game.targetWords.length) return;

        const player = game.players.find(p => p.id === socket.id);
        const describer = game.players.find(p => p.id === game.currentDescriberId);

        if (!player || !describer || player.id === game.currentDescriberId) return;
        
        const isTeammate = (player.team === describer.team);
        const guesses = rawInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

        guesses.forEach(guessWord => {
            let similarityScore = 0;
            let exactMatchFound = false;

            if (isTeammate) {
                game.targetWords.forEach((targetObj, index) => {
                    if (targetObj.guessed) return;

                    const similarity = getSimilarity(guessWord, targetObj.word);
                    if (similarity > similarityScore) similarityScore = similarity;

                    // STRICT RULE: ONLY EXACT MATCH (1.0) GIVES POINTS
                    // 0.85 to 0.99 gives 0 points (only visual feedback)
                    if (similarity === 1.0) {
                        exactMatchFound = true;
                        game.targetWords[index].guessed = true;
                        const teamKey = player.team === 1 ? 'team1' : 'team2';
                        
                        game.scores[teamKey] += 2; // +2 Points for Exact Match

                        io.to(roomId).emit('wordGuessedSuccess', { wordIndex: index, scores: game.scores });

                        if (game.targetWords.every(w => w.guessed)) {
                            clearTimeout(game.turnTimer);
                            endTurn(roomId);
                        }
                    }
                });
            }

            if (game.roundGuesses.length < 50) {
                game.roundGuesses.push({
                    playerName: player.name,
                    word: guessWord,
                    result: exactMatchFound ? 'CORRECT' : (similarityScore >= 0.85 ? 'CLOSE' : 'MISS')
                });
            }

            io.to(roomId).emit('guessReceived', { 
                playerName: player.name, 
                word: guessWord, 
                similarity: isTeammate ? similarityScore : 0 
            });
        });
    });

    socket.on('forceSkip', (roomId) => {
        const game = games[roomId];
        if(game && game.currentDescriberId === socket.id) {
            clearTimeout(game.turnTimer);
            endTurn(roomId); 
        }
    });

    function endTurn(roomId) {
        const game = games[roomId];
        if(!game) return;
        
        game.status = 'round_summary';
        const lastDescriberId = game.currentDescriberId;
        game.currentDescriberId = null;

        const summary = {
            scores: game.scores,
            team1Members: game.players.filter(p => p.team === 1).map(p => p.name).sort(),
            team2Members: game.players.filter(p => p.team === 2).map(p => p.name).sort(),
            lastDescriberId: lastDescriberId,
            targetWords: game.targetWords, 
            roundGuesses: game.roundGuesses
        };

        io.to(roomId).emit('roundSummary', summary);
    }

    socket.on('startNextTurnManual', (roomId) => {
        const game = games[roomId];
        if(game) prepareNextTurn(roomId);
    });

    socket.on('disconnect', () => {
         for (const roomId in games) {
            const game = games[roomId];
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const player = game.players[playerIndex];
                if (game.status === 'lobby') {
                    game.players.splice(playerIndex, 1);
                    io.to(roomId).emit('updatePlayers', game.players);
                } else {
                    player.connected = false;
                    io.to(roomId).emit('updatePlayers', game.players);
                }
                break;
            }
        }
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));