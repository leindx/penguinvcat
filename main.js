const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthFill = document.getElementById('health-bar-fill');
const hydrationFill = document.getElementById('hydration-bar-fill');
const inventorySnow = document.getElementById('inventory-snow');
const scoreDisplay = document.getElementById('score-display');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreDisplay = document.getElementById('final-score-display');
const highScoresList = document.getElementById('high-scores-list');
const btnStart = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');
const btnSuperpower = document.getElementById('btn-superpower');
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const skinBtns = document.querySelectorAll('.skin-btn');

let selectedSkin = 'penguin';
skinBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        skinBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSkin = btn.dataset.skin;
    });
});

// --- AUDIO ENGINE V2 (Softer, Kawaii Sounds) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const SFX = {
    playTone: (freq, type, duration, vol=0.1, slideFreq=null) => {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slideFreq) {
            osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
        }
        
        // Softer envelope (attack and release)
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + duration * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    jump: () => SFX.playTone(300, 'sine', 0.4, 0.15, 600), // smooth boing
    teleport: () => {
        SFX.playTone(500, 'sine', 0.2, 0.1, 800);
        setTimeout(() => SFX.playTone(800, 'sine', 0.3, 0.1, 1200), 100);
    },
    hurt: () => SFX.playTone(200, 'triangle', 0.3, 0.2, 100), // sad thud
    eat: () => SFX.playTone(800, 'sine', 0.2, 0.1, 1200), // cute chirp
    drink: () => {
        SFX.playTone(600, 'sine', 0.2, 0.1);
        setTimeout(() => SFX.playTone(800, 'sine', 0.2, 0.1), 100);
        setTimeout(() => SFX.playTone(1000, 'sine', 0.4, 0.1), 200);
    },
    catHit: () => SFX.playTone(400, 'triangle', 0.2, 0.1, 200),
    gameOver: () => {
        // Sad descending melody
        const notes = [400, 350, 300, 250];
        notes.forEach((n, i) => {
            setTimeout(() => SFX.playTone(n, 'sine', 0.5, 0.2), i * 300);
        });
    }
};

let musicInterval = null;
function startMusic() {
    if (musicInterval) clearInterval(musicInterval);
    // Pentatonic, music-box style melody
    const notes = [440, 523.25, 659.25, 783.99, 659.25, 523.25, 440, 392, 440, 523.25, 659.25, 880];
    let idx = 0;
    musicInterval = setInterval(() => {
        if (!isGameOver && gameLoopId) {
            SFX.playTone(notes[idx], 'sine', 0.4, 0.05); // Very soft volume, sine wave
            idx = (idx + 1) % notes.length;
        }
    }, 400); // Slower tempo
}

// --- ASSET LOADER ---
const images = {};
const assets = [
    {name: 'penguin', path: 'assets/kawaii_penguin.png'},
    {name: 'penguin_wizard', path: 'assets/kawaii_penguin_wizard.png'},
    {name: 'penguin_chef', path: 'assets/kawaii_penguin_chef.png'},
    {name: 'penguin_ninja', path: 'assets/kawaii_penguin_ninja.png'},
    {name: 'cat', path: 'assets/kawaii_cat.png'},
    {name: 'black_cat', path: 'assets/kawaii_black_cat.png'},
    {name: 'white_cat', path: 'assets/kawaii_white_cat.png'}, // Will fail gracefully if not generated
    {name: 'seal', path: 'assets/kawaii_seal.png'}, // Contains multiple seals
    {name: 'fish', path: 'assets/kawaii_fish.png'},
    {name: 'snow', path: 'assets/kawaii_snow.png'},
    {name: 'pot', path: 'assets/kawaii_pot.png'},
    {name: 'igloo', path: 'assets/kawaii_igloo.png'},
    {name: 'hole', path: 'assets/kawaii_hole.png'}
];

function loadImage(asset) {
    const img = new Image();
    img.src = asset.path;
    img.onload = () => { images[asset.name] = img; };
    img.onerror = () => { images[asset.name] = null; }
}
assets.forEach(loadImage);

// --- GAME STATE ---
let width, height;
let gameLoopId = null;
let lastTime = 0;
let isGameOver = false;
let score = 0;

let player;
let cats = [];
let seals = [];
let whiteCats = [];
let items = [];
let superpowerPenguins = [];
let pot;
let igloo;
let holes = [];
let particles = [];
let ramps = [];
let icePatches = [];

let catSpawnTimer = 0;
let catSpawnRate = 3000;
let whiteCatSpawnTimer = 0;
let sealSpawnTimer = 0;
let itemSpawnTimer = 0;
let superpowerTimer = 0;
let superpowerReady = false;

let joystickActive = false;
let joystickVector = { x: 0, y: 0 };
let joystickId = null;

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if(pot) {
        pot.x = width / 2 - 100; pot.y = height / 2;
        igloo.x = width / 2 + 100; igloo.y = height / 2 - 50;
    }
}
window.addEventListener('resize', resize);

// --- ENTITIES ---

// Helper function for polygon collision check (Point in Polygon)
function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

class IcePatch {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.points = [];
        // Generate random organic polygon
        let numPoints = 5 + Math.floor(Math.random() * 5);
        let baseRadius = 80 + Math.random() * 150; // Random big size
        for(let i=0; i<numPoints; i++) {
            let angle = (i / numPoints) * Math.PI * 2;
            let radius = baseRadius * (0.5 + Math.random() * 0.5); // Jaggedness
            this.points.push([this.x + Math.cos(angle)*radius, this.y + Math.sin(angle)*radius]);
        }
    }
    contains(x, y) {
        return pointInPolygon([x, y], this.points);
    }
    draw(ctx) {
        ctx.fillStyle = 'rgba(150, 220, 255, 0.5)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.points[0][0], this.points[0][1]);
        for(let i=1; i<this.points.length; i++) {
            ctx.lineTo(this.points[i][0], this.points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

class Player {
    constructor(skinName) {
        this.size = 60;
        this.skin = skinName;
        this.x = width / 2;
        this.y = height / 2 + 150;
        this.z = 0;
        this.vz = 0;
        this.vx = 0;
        this.vy = 0;
        this.baseSpeed = 300;
        this.health = 100;
        this.hydration = 100;
        this.snowCount = 0;
        this.direction = 1;
        this.isJumping = false;
        this.hurtTimer = 0;
        this.teleportImmunity = 0;
    }

    update(dt) {
        if (this.hurtTimer > 0) this.hurtTimer -= dt;
        if (this.teleportImmunity > 0) this.teleportImmunity -= dt;

        this.health -= 2 * dt;
        if (this.health <= 0) {
            this.health = 0;
            gameOver();
            return;
        }

        let speedMultiplier = 1.0;
        if (this.hydration <= 0) speedMultiplier = 0.2;
        else if (this.hydration < 50) speedMultiplier = 0.6;

        let targetVx = joystickVector.x * (this.baseSpeed * speedMultiplier);
        let targetVy = joystickVector.y * (this.baseSpeed * speedMultiplier);

        // Deplete hydration much slower now (was 5, now 2.5)
        if (Math.abs(targetVx) > 0 || Math.abs(targetVy) > 0) {
            this.hydration = Math.max(0, this.hydration - 2.5 * dt);
        }

        let onIce = icePatches.some(ice => ice.contains(this.x, this.y));

        if (onIce) {
            // Extreme sliding physics (friction factor very low)
            this.vx += (targetVx - this.vx) * dt * 0.8;
            this.vy += (targetVy - this.vy) * dt * 0.8;
        } else {
            // Normal stopping
            this.vx += (targetVx - this.vx) * dt * 10;
            this.vy += (targetVy - this.vy) * dt * 10;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.isJumping) {
            this.z += this.vz * dt;
            this.vz -= 800 * dt;
            if (this.z <= 0) {
                this.z = 0;
                this.isJumping = false;
            }
        } else {
            for (let r of ramps) {
                if (Math.hypot(this.x - r.x, this.y - r.y) < r.radius) {
                    this.isJumping = true;
                    this.vz = 350;
                    SFX.jump();
                    break;
                }
            }
        }

        if (this.vx > 0.1) this.direction = 1;
        else if (this.vx < -0.1) this.direction = -1;

        this.x = Math.max(this.size/2, Math.min(width - this.size/2, this.x));
        this.y = Math.max(this.size/2, Math.min(height - this.size/2, this.y));
        
        if (!this.isJumping && this.teleportImmunity <= 0) {
            for (let i = 0; i < holes.length; i++) {
                const h = holes[i];
                if (Math.hypot(this.x - h.x, this.y - h.y) < 25) {
                    let available = holes.filter((_, idx) => idx !== i);
                    let target = available[Math.floor(Math.random() * available.length)];
                    this.x = target.x;
                    this.y = target.y + 10;
                    this.isJumping = true;
                    this.vz = 400;
                    this.teleportImmunity = 1.0;
                    SFX.teleport();
                    break;
                }
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size/2.5 * Math.max(0, 1 - this.z/200), this.size/4 * Math.max(0, 1 - this.z/200), 0, 0, Math.PI*2);
        ctx.fill();

        ctx.translate(0, -this.z);
        ctx.scale(this.direction, 1);
        if (this.hurtTimer > 0 && Math.floor(performance.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        
        let img = images[this.skin] || images['penguin'];
        if (img) ctx.drawImage(img, -this.size/2, -this.size/2, this.size, this.size);
        ctx.restore();
    }
}

class Cat {
    constructor() {
        this.size = 50;
        this.isBlack = Math.random() < 0.10;
        if (Math.random() > 0.5) {
            this.x = Math.random() > 0.5 ? -50 : width + 50;
            this.y = Math.random() * height;
        } else {
            this.x = Math.random() * width;
            this.y = Math.random() > 0.5 ? -50 : height + 50;
        }
        this.vx = 0;
        this.vy = 0;
        this.speed = this.isBlack ? (200 + Math.random()*50) : (100 + Math.random() * 50);
        this.direction = 1;
        this.dead = false;
        
        // Physics for getting punched by white cat
        this.flying = false;
        this.fz = 0;
    }

    update(dt) {
        if (this.flying) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.y -= this.fz * dt; // fake Z gravity
            this.fz -= 1000 * dt;
            if (this.x < -100 || this.x > width + 100 || this.y > height + 100) this.dead = true;
            return;
        }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const distToIgloo = Math.hypot(this.x - igloo.x, this.y - igloo.y);
        
        let onIce = icePatches.some(ice => ice.contains(this.x, this.y));

        if (dist > 0) {
            let targetVx = (dx / dist) * this.speed;
            let targetVy = (dy / dist) * this.speed;

            if (onIce) {
                this.vx += (targetVx - this.vx) * dt * 0.8;
                this.vy += (targetVy - this.vy) * dt * 0.8;
            } else {
                this.vx += (targetVx - this.vx) * dt * 5;
                this.vy += (targetVy - this.vy) * dt * 5;
            }

            if (distToIgloo < igloo.radius + this.size/2) {
                const nx = (this.x - igloo.x) / distToIgloo;
                const ny = (this.y - igloo.y) / distToIgloo;
                this.x = igloo.x + nx * (igloo.radius + this.size/2 + 1);
                this.y = igloo.y + ny * (igloo.radius + this.size/2 + 1);
            } else {
                this.x += this.vx * dt;
                this.y += this.vy * dt;
            }
        }

        if (this.vx > 0.1) this.direction = 1;
        else if (this.vx < -0.1) this.direction = -1;

        if (!player.isJumping && dist < (this.size + player.size) / 2 * 0.8) {
            player.health -= (this.isBlack ? 30 : 20) * dt;
            if (player.hurtTimer <= 0) {
                player.hurtTimer = 0.5;
                SFX.hurt();
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.direction, 1);
        if (this.flying) ctx.rotate(performance.now() * 0.01);
        let img = this.isBlack ? images['black_cat'] : images['cat'];
        if (img) ctx.drawImage(img, -this.size/2, -this.size/2, this.size, this.size);
        ctx.restore();
    }
}

class WhiteCat {
    constructor() {
        this.size = 55; // chubby
        this.x = width/2;
        this.y = height + 100;
        this.vx = 0;
        this.vy = 0;
        this.speed = 250;
        this.direction = 1;
        this.dead = false;
        this.lifeTime = 15; // Stays for 15 seconds
    }
    update(dt) {
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            // Walk away
            this.y += this.speed * dt;
            if (this.y > height + 100) this.dead = true;
            return;
        }

        // Find closest enemy cat
        let closestCat = null;
        let minDist = Infinity;
        for(let c of cats) {
            if (c.flying) continue;
            let d = Math.hypot(c.x - this.x, c.y - this.y);
            if (d < minDist) { minDist = d; closestCat = c; }
        }

        let targetVx = 0, targetVy = 0;

        if (closestCat) {
            const dx = closestCat.x - this.x;
            const dy = closestCat.y - this.y;
            targetVx = (dx / minDist) * this.speed;
            targetVy = (dy / minDist) * this.speed;
            
            // Attack!
            if (minDist < (this.size + closestCat.size) / 2) {
                closestCat.flying = true;
                closestCat.vx = targetVx * 3;
                closestCat.vy = targetVy * 3;
                closestCat.fz = 400; // Launch up
                SFX.catHit();
                score += 20;
            }
        } else {
            // Follow player slowly if no cats
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 150) {
                targetVx = (dx / dist) * (this.speed * 0.5);
                targetVy = (dy / dist) * (this.speed * 0.5);
            }
        }

        let onIce = icePatches.some(ice => ice.contains(this.x, this.y));
        if (onIce) {
            this.vx += (targetVx - this.vx) * dt * 0.8;
            this.vy += (targetVy - this.vy) * dt * 0.8;
        } else {
            this.vx += (targetVx - this.vx) * dt * 5;
            this.vy += (targetVy - this.vy) * dt * 5;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.vx > 0.1) this.direction = 1;
        else if (this.vx < -0.1) this.direction = -1;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.direction, 1);
        if (images['white_cat']) {
            ctx.drawImage(images['white_cat'], -this.size/2, -this.size/2, this.size, this.size);
        } else {
            // Fallback: draw a white circle if image failed to generate
            ctx.fillStyle = 'white';
            ctx.beginPath(); ctx.arc(0, 0, this.size/2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(10, -5, 4, 0, Math.PI*2); ctx.fill(); // cute eye
            ctx.strokeStyle = 'pink'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(10, 5, 5, 0, Math.PI); ctx.stroke(); // smile
        }
        ctx.restore();
    }
}

class Seal {
    constructor() {
        this.size = 160; // Doubled size
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.x = this.direction === 1 ? -150 : width + 150;
        this.y = 100 + Math.random() * (height - 200);
        this.speed = 400 + Math.random() * 200;
        this.dead = false;
    }
    update(dt) {
        this.x += this.speed * this.direction * dt;
        
        for (let c of cats) {
            if (!c.flying && Math.hypot(this.x - c.x, this.y - c.y) < (this.size + c.size) / 2 * 0.8) {
                c.flying = true;
                c.vx = this.speed * this.direction * 1.5;
                c.fz = 500;
                SFX.catHit();
            }
        }
        
        if (!player.isJumping && Math.hypot(this.x - player.x, this.y - player.y) < (this.size + player.size) / 2 * 0.7) {
            player.health = 0; 
        }
        
        if (this.direction === 1 && this.x > width + 200) return true;
        if (this.direction === -1 && this.x < -200) return true;
        return false;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(-this.direction, 1);
        let img = images['seal'];
        if (img) {
            // If it's the old spritesheet, crop it (assuming 2 cols 3 rows)
            // If it's a single image, this crop might look weird, but it will work
            let w = img.width > 300 ? img.width/2 : img.width;
            let h = img.height > 300 ? img.height/3 : img.height;
            ctx.drawImage(img, 0, 0, w, h, -this.size/2, -this.size/2, this.size, this.size);
        }
        ctx.restore();
    }
}

class Item {
    constructor(type) {
        this.type = type;
        this.size = 40;
        this.x = 50 + Math.random() * (width - 100);
        this.y = 50 + Math.random() * (height - 100);
        this.floatOffset = Math.random() * Math.PI * 2;
    }
    update(dt) {
        this.floatOffset += dt * 3;
        if (!player.isJumping) {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < (this.size + player.size) / 2) {
                if (this.type === 'fish') {
                    player.health = Math.min(100, player.health + 15);
                    score += 50;
                    SFX.eat();
                }
                else if (this.type === 'snow') {
                    player.snowCount++;
                }
                updateHUD();
                return true;
            }
        }
        return false;
    }
    draw(ctx) {
        const floatY = Math.sin(this.floatOffset) * 5;
        if (images[this.type]) ctx.drawImage(images[this.type], this.x - this.size/2, this.y - this.size/2 + floatY, this.size, this.size);
    }
}

class Pot {
    constructor() {
        this.size = 80;
        this.x = width / 2 - 100;
        this.y = height / 2;
        this.state = 'idle';
        this.timer = 0;
    }
    update(dt) {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (this.state === 'idle' && player.snowCount > 0 && dist < (this.size + player.size)/2 + 20) {
            player.snowCount--;
            this.state = 'cooking';
            this.timer = 3;
            updateHUD();
        }
        if (this.state === 'cooking') {
            this.timer -= dt;
            if (Math.random() < 0.3) particles.push(new Particle(this.x, this.y + 20));
            if (this.timer <= 0) this.state = 'ready';
        }
        if (this.state === 'ready' && dist < (this.size + player.size)/2 + 20) {
            player.hydration = Math.min(100, player.hydration + 50);
            score += 150;
            SFX.drink();
            this.state = 'idle';
        }
    }
    draw(ctx) {
        if (images['pot']) ctx.drawImage(images['pot'], this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.fillStyle = 'black';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        if (this.state === 'cooking') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - 20, this.y - this.size/2 - 20, 40, 5);
            ctx.fillStyle = 'orange';
            ctx.fillRect(this.x - 20, this.y - this.size/2 - 20, 40 * (1 - this.timer/3), 5);
        } else if (this.state === 'ready') {
            ctx.fillText("💧!", this.x, this.y - this.size/2 - 10);
        } else if (player.snowCount > 0) {
            ctx.fillText("⬇️ ❄️", this.x, this.y - this.size/2 - 10);
        }
    }
}

class Igloo {
    constructor() {
        this.size = 150;
        this.radius = 60;
        this.x = width / 2 + 100;
        this.y = height / 2 - 50;
    }
    draw(ctx) {
        if (images['igloo']) ctx.drawImage(images['igloo'], this.x - this.size/2, this.y - this.size/2 - 20, this.size, this.size);
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.stroke();
    }
}

class Hole {
    constructor(x, y) { this.x = x; this.y = y; this.size = 80; }
    draw(ctx) { if (images['hole']) ctx.drawImage(images['hole'], this.x - this.size/2, this.y - this.size/2, this.size, this.size); }
}

class Ramp {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 40; }
    draw(ctx) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.radius, this.radius/2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 10, this.radius*0.8, this.radius*0.4, 0, 0, Math.PI*2); ctx.fill();
    }
}

class Particle {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 30; this.y = y;
        this.vx = (Math.random() - 0.5) * 20; this.vy = -50 - Math.random() * 50;
        this.life = 1.0; this.size = 5 + Math.random() * 10;
        this.color = Math.random() > 0.5 ? '#ff4757' : '#ffa502';
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt * 2;
        return this.life <= 0;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class SuperpowerPenguin {
    constructor() {
        this.size = 60;
        this.x = -50 - Math.random() * 200;
        this.y = Math.random() * height;
        this.speed = 500 + Math.random() * 300;
    }
    update(dt) {
        this.x += this.speed * dt;
        for (let c of cats) {
            if (!c.flying && Math.hypot(this.x - c.x, this.y - c.y) < (this.size + c.size) / 2) {
                c.flying = true;
                c.vx = this.speed * 2;
                c.fz = 400;
                score += 10;
                SFX.catHit();
            }
        }
        return this.x > width + 100;
    }
    draw(ctx) {
        let img = images[selectedSkin] || images['penguin'];
        if (img) ctx.drawImage(img, this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    }
}

// --- CONTROLS ---
function handleJoystickStart(e) {
    e.preventDefault();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    joystickActive = true;
    joystickId = touch.identifier ?? 'mouse';
    updateJoystick(touch);
}
function handleJoystickMove(e) {
    e.preventDefault();
    if (!joystickActive) return;
    const touch = e.changedTouches ? Array.from(e.changedTouches).find(t => t.identifier === joystickId) : e;
    if (touch) updateJoystick(touch);
}
function handleJoystickEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches ? Array.from(e.changedTouches).find(t => t.identifier === joystickId) : e;
    if (touch || !e.changedTouches) {
        joystickActive = false; joystickId = null;
        joystickVector = { x: 0, y: 0 };
        joystickKnob.style.transform = `translate(0px, 0px)`;
    }
}
function updateJoystick(touch) {
    const rect = joystickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const maxDist = 45;
    if (distance > maxDist) { dx = (dx / distance) * maxDist; dy = (dy / distance) * maxDist; }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickVector.x = dx / maxDist; joystickVector.y = dy / maxDist;
}

joystickZone.addEventListener('mousedown', handleJoystickStart);
window.addEventListener('mousemove', handleJoystickMove);
window.addEventListener('mouseup', handleJoystickEnd);
joystickZone.addEventListener('touchstart', handleJoystickStart, {passive: false});
window.addEventListener('touchmove', handleJoystickMove, {passive: false});
window.addEventListener('touchend', handleJoystickEnd, {passive: false});
window.addEventListener('touchcancel', handleJoystickEnd, {passive: false});

btnSuperpower.addEventListener('click', activateSuperpower);
btnSuperpower.addEventListener('touchstart', activateSuperpower);

function activateSuperpower(e) {
    e.preventDefault();
    if (!superpowerReady) return;
    superpowerReady = false;
    btnSuperpower.classList.add('hidden');
    superpowerTimer = 0;
    for(let i=0; i<40; i++) superpowerPenguins.push(new SuperpowerPenguin());
}

// --- SCORE SYSTEM ---
function saveScore() {
    let scores = JSON.parse(localStorage.getItem('kawaiiScores') || '[]');
    scores.push(Math.floor(score));
    scores.sort((a,b) => b-a);
    scores = scores.slice(0, 3);
    localStorage.setItem('kawaiiScores', JSON.stringify(scores));
    updateHighScoresUI();
}
function updateHighScoresUI() {
    let scores = JSON.parse(localStorage.getItem('kawaiiScores') || '[]');
    highScoresList.innerHTML = '';
    if(scores.length === 0) highScoresList.innerHTML = '<li>Aún no hay récords</li>';
    else scores.forEach((s, i) => { highScoresList.innerHTML += `<li>${i===0?'🥇':(i===1?'🥈':'🥉')} ${s} pts</li>`; });
}

// --- GAME LOOP ---
function initGame() {
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    resize();
    player = new Player(selectedSkin);
    pot = new Pot();
    igloo = new Igloo();
    
    score = 0;
    holes = []; for(let i=0; i<5; i++) holes.push(new Hole(100 + Math.random()*(width-200), 100 + Math.random()*(height-200)));
    ramps = []; for(let i=0; i<5; i++) ramps.push(new Ramp(100 + Math.random()*(width-200), 100 + Math.random()*(height-200)));
    icePatches = []; for(let i=0; i<3; i++) icePatches.push(new IcePatch(200 + Math.random()*(width-400), 200 + Math.random()*(height-400)));

    cats = []; whiteCats = []; seals = []; items = []; particles = []; superpowerPenguins = [];
    isGameOver = false;
    
    catSpawnTimer = 0; catSpawnRate = 3000;
    whiteCatSpawnTimer = 0;
    sealSpawnTimer = 0;
    itemSpawnTimer = 0;
    superpowerTimer = 0; superpowerReady = false;
    btnSuperpower.classList.add('hidden');
    
    updateHUD();
    lastTime = performance.now();
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    
    startMusic();
    gameLoopId = requestAnimationFrame(loop);
}

btnStart.addEventListener('click', initGame);
btnStart.addEventListener('touchstart', (e) => { e.preventDefault(); initGame(); });
btnRestart.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});
btnRestart.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

function loop(timestamp) {
    if (isGameOver) return;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    update(dt);
    draw();
    gameLoopId = requestAnimationFrame(loop);
}

function update(dt) {
    score += dt * 5;
    
    player.update(dt);
    pot.update(dt);

    catSpawnTimer += dt * 1000;
    if (catSpawnTimer >= catSpawnRate) {
        catSpawnTimer = 0;
        cats.push(new Cat());
        catSpawnRate = Math.max(500, catSpawnRate - 20);
    }
    
    whiteCatSpawnTimer += dt * 1000;
    if (whiteCatSpawnTimer > 15000) {
        whiteCatSpawnTimer = 0;
        if (Math.random() < 0.2) whiteCats.push(new WhiteCat()); // 20% chance every 15s
    }
    
    sealSpawnTimer += dt * 1000;
    if (sealSpawnTimer > 8000) {
        if (Math.random() < 0.6) seals.push(new Seal());
        sealSpawnTimer = 0;
    }

    itemSpawnTimer += dt * 1000;
    if (itemSpawnTimer >= 2000) {
        itemSpawnTimer = 0;
        if (items.length < 5) items.push(new Item(Math.random() > 0.5 ? 'fish' : 'snow'));
    }

    if (!superpowerReady) {
        superpowerTimer += dt * 1000;
        if (superpowerTimer >= 20000) {
            superpowerReady = true;
            btnSuperpower.classList.remove('hidden');
        }
    }

    cats.forEach(c => c.update(dt));
    cats = cats.filter(c => !c.dead);
    
    whiteCats.forEach(wc => wc.update(dt));
    whiteCats = whiteCats.filter(wc => !wc.dead);
    
    seals = seals.filter(s => !s.update(dt));
    items = items.filter(i => !i.update(dt));
    particles = particles.filter(p => !p.update(dt));
    superpowerPenguins = superpowerPenguins.filter(p => !p.update(dt));

    updateHUD();
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#e6f7ff'; ctx.fillRect(0, 0, width, height);
    icePatches.forEach(ice => ice.draw(ctx));
    
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for(let i=0; i<100; i++) {
        const px = (i * 137) % width; const py = (i * 251) % height;
        ctx.beginPath(); ctx.arc(px, py, (i % 3) + 2, 0, Math.PI*2); ctx.fill();
    }

    ramps.forEach(r => r.draw(ctx));
    holes.forEach(h => h.draw(ctx));
    pot.draw(ctx);
    igloo.draw(ctx);
    
    let renderables = [...items, ...cats, ...whiteCats, ...seals, player];
    renderables.sort((a, b) => a.y - b.y);
    renderables.forEach(r => r.draw(ctx));
    
    particles.forEach(p => p.draw(ctx));
    superpowerPenguins.forEach(p => p.draw(ctx));
}

function updateHUD() {
    healthFill.style.width = `${Math.max(0, player.health)}%`;
    healthFill.style.background = player.health < 30 ? '#ff4757' : '#2ed573';
    hydrationFill.style.width = `${Math.max(0, player.hydration)}%`;
    inventorySnow.textContent = `❄️ x${player.snowCount}`;
    scoreDisplay.textContent = Math.floor(score);
}

function gameOver() {
    if (isGameOver) return; // Prevent multiple triggers
    isGameOver = true;
    if(musicInterval) clearInterval(musicInterval);
    
    SFX.gameOver();
    
    saveScore();
    finalScoreDisplay.textContent = Math.floor(score);
    gameOverScreen.classList.remove('hidden');
    btnSuperpower.classList.add('hidden');
}

document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
