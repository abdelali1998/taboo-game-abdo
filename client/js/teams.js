const teams = {
    init() {
        ui.showScreen('screen-teams');
        this.render();
    },

    allowDrop(ev) {
        ev.preventDefault();
        ev.currentTarget.classList.add('drag-over');
    },

    drag(ev, playerId) {
        ev.dataTransfer.setData("playerId", playerId);
    },

    drop(ev, teamNum) {
        ev.preventDefault();
        ev.currentTarget.classList.remove('drag-over');
        const playerId = ev.dataTransfer.getData("playerId");
        if(gameState.isHost) {
            socket.emit('assignTeam', { 
                roomId: gameState.roomId, 
                playerId: playerId, 
                teamNum: teamNum 
            });
        }
    },

    kick(playerId) {
        if(confirm("Are you sure you want to KICK this player?")) {
            socket.emit('kickPlayer', { roomId: gameState.roomId, playerId: playerId });
        }
    },

    render() {
        const waiting = document.getElementById('waiting-room');
        const t1 = document.getElementById('team-1-box');
        const t2 = document.getElementById('team-2-box');

        if (!waiting || !t1 || !t2) return setTimeout(() => this.render(), 100);

        document.querySelectorAll('.team-box').forEach(b => b.classList.remove('drag-over'));
        waiting.innerHTML = ''; t1.innerHTML = ''; t2.innerHTML = '';

        gameState.players.forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-pill';
            let html = `<span>${p.name}</span>`;
            
            if (gameState.isHost && p.id !== socket.id) {
                 html += `<i class="fa-solid fa-times-circle kick-btn" onclick="teams.kick('${p.id}')" title="Kick Player"></i>`;
            }
            el.innerHTML = html;

            if (gameState.isHost) {
                el.draggable = true;
                el.style.cursor = 'grab';
                el.ondragstart = (ev) => this.drag(ev, p.id);
            }
            if (p.team === 1) t1.appendChild(el);
            else if (p.team === 2) t2.appendChild(el);
            else waiting.appendChild(el);
        });

        const btn = document.getElementById('btn-start');
        const controls = document.getElementById('host-controls');
        
        if (gameState.isHost) {
            if(btn) btn.style.display = 'block';
            if(controls) controls.style.display = 'block';
        } else {
            if(btn) btn.style.display = 'none';
            if(controls) controls.style.display = 'none';
        }
    }
};