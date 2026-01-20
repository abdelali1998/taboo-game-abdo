const ui = {
    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const el = document.getElementById(id);
        if(el) el.classList.remove('hidden');
    },
    hide(id) { 
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden'); 
    },
    show(id) { 
        const el = document.getElementById(id);
        if(el) el.classList.remove('hidden'); 
    }
};