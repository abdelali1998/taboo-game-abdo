const timer = {
    id: null,
    start(sec, tick, end) {
        this.stop(); 
        let left = sec; 
        tick(left);
        this.id = setInterval(() => {
            left--; 
            tick(left);
            if(left <= 0) { 
                this.stop(); 
                end(); 
            }
        }, 1000);
    },
    stop() { 
        if(this.id) clearInterval(this.id); 
    }
};