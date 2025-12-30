const { v4: uuidv4 } = require('uuid'); // If I had uuid, but I'll use Math.random for simplicity or require it if installed. I didn't install uuid. I'll use Math.random.

class GameRoom {
    constructor(roomId, io) {
        this.id = roomId;
        this.io = io;
        this.players = {};
        this.bullets = [];
        this.mapWidth = 2000;
        this.mapHeight = 2000;
        
        // Game loop (60 Updates Per Second)
        this.interval = setInterval(() => this.update(), 1000 / 60);
    }

    addPlayer(socketId, username) {
        this.players[socketId] = {
            id: socketId,
            username: username || `Player ${socketId.substr(0,4)}`,
            x: Math.random() * this.mapWidth,
            y: Math.random() * this.mapHeight,
            health: 100,
            score: 0,
            color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
            radius: 20,
            speed: 5
        };
    }

    removePlayer(socketId) {
        delete this.players[socketId];
    }

    handleInput(socketId, input) {
        const player = this.players[socketId];
        if (!player || player.health <= 0) return;

        // Normalize vector
        let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

        if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / length) * player.speed;
            dy = (dy / length) * player.speed;
            
            player.x += dx;
            player.y += dy;

            // Clamp to map bounds
            player.x = Math.max(player.radius, Math.min(this.mapWidth - player.radius, player.x));
            player.y = Math.max(player.radius, Math.min(this.mapHeight - player.radius, player.y));
        }
    }

    handleShoot(socketId, angle) {
        const player = this.players[socketId];
        if (!player || player.health <= 0) return;

        const bulletSpeed = 15;
        // Spawn bullet slightly in front of player
        const bx = player.x + Math.cos(angle) * (player.radius + 5);
        const by = player.y + Math.sin(angle) * (player.radius + 5);

        this.bullets.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socketId,
            x: bx,
            y: by,
            angle: angle,
            speed: bulletSpeed,
            damage: 10,
            distanceTraveled: 0,
            maxDistance: 1000
        });
    }

    update() {
        const bulletsToRemove = [];

        // Update Bullets
        this.bullets.forEach((b, index) => {
            const vx = Math.cos(b.angle) * b.speed;
            const vy = Math.sin(b.angle) * b.speed;
            
            b.x += vx;
            b.y += vy;
            b.distanceTraveled += b.speed;

            // Check max distance or bounds
            if (b.distanceTraveled > b.maxDistance || 
                b.x < 0 || b.x > this.mapWidth || 
                b.y < 0 || b.y > this.mapHeight) {
                bulletsToRemove.push(index);
                return;
            }

            // Check collision
            for (const pId in this.players) {
                const p = this.players[pId];
                if (pId !== b.ownerId && p.health > 0) {
                    const dist = Math.hypot(p.x - b.x, p.y - b.y);
                    if (dist < p.radius + 5) { // +5 for bullet radius approx
                        this.handleHit(pId, b.ownerId, b.damage);
                        bulletsToRemove.push(index);
                        return; // Bullet destroyed
                    }
                }
            }
        });

        // Remove destroyed bullets (iterate backwards)
        for (let i = bulletsToRemove.length - 1; i >= 0; i--) {
            this.bullets.splice(bulletsToRemove[i], 1);
        }

        // Send update
        // We optimize by only sending necessary data. 
        // For now, sending full state is easiest for a small game.
        this.io.to(this.id).emit('gameStateUpdate', {
            players: this.players,
            bullets: this.bullets
        });
    }

    handleHit(victimId, attackerId, damage) {
        const victim = this.players[victimId];
        if (!victim) return;

        victim.health -= damage;
        this.io.to(this.id).emit('playerHit', { id: victimId, damage });

        if (victim.health <= 0) {
            victim.health = 0;
            this.handleKill(victimId, attackerId);
        }
    }

    handleKill(victimId, attackerId) {
        const victim = this.players[victimId];
        const attacker = this.players[attackerId];

        if (attacker) {
            attacker.score++;
        }

        this.io.to(this.id).emit('playerKilled', {
            victimName: victim.username,
            killerName: attacker ? attacker.username : 'Unknown'
        });

        // Respawn
        setTimeout(() => {
            if (this.players[victimId]) {
                const p = this.players[victimId];
                p.health = 100;
                p.x = Math.random() * this.mapWidth;
                p.y = Math.random() * this.mapHeight;
                // Maybe a simplified respawn event or just let the position update handle it
            }
        }, 3000);
    }
    
    stop() {
        clearInterval(this.interval);
    }
}

module.exports = { GameRoom };
