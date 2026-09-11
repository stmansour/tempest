/**
 * player.js - Player Blaster and Dual Laser Shot Engine
 * 
 * Features:
 * - Claw-shaped vector blaster positioned on the outer rim (z = 1.0)
 * - Lightning-fast dual-laser arcade fire (speed tuned for snappy responsive action)
 * - Superzapper management (2 charges per wave)
 * - Rapid fire cooldown and collision boundaries
 */

export class Player {
  constructor(web) {
    this.web = web;
    this.lane = 0;
    this.z = 1.0;
    this.isAlive = true;
    this.deathTimer = 0;

    // Dual-laser shots: tuned for rapid arcade burst firing (single bullets one behind the other)
    this.shots = [];
    this.maxShots = 10;
    this.shotSpeed = 2.7; // ~0.37s to abyss: punchy arcade flight
    this.fireCooldown = 0.088; // ~11.3 shots/sec: holding fire sends bursts of 5-6 bullets like an automatic weapon
    this.timeSinceLastShot = 999; // Available immediately on first press

    // Superzapper
    this.superzapperCharges = 2;
    this.superzapperActive = false;
    this.superzapperTimer = 0;

    // Visual lane interpolation
    this.displayLane = 0;
  }

  resetForLevel(web, targetLane = null) {
    this.web = web;
    this.lane = targetLane !== null ? targetLane : Math.floor(web.laneCount / 2);
    this.displayLane = this.lane;
    this.z = 1.0;
    this.isAlive = true;
    this.deathTimer = 0;
    this.shots = [];
    this.superzapperCharges = 2;
    this.superzapperActive = false;
    this.timeSinceLastShot = 999;
    this.spawnGraceTimer = 2.5; // 2.5s generous spawn protection window with vector shield
  }

  move(deltaLane, audio) {
    if (!this.isAlive || deltaLane === 0) return;

    const oldLane = this.lane;
    const newLane = this.web.clampLane(this.lane + deltaLane);

    if (newLane !== oldLane) {
      this.lane = newLane;
      this.displayLane = newLane; // Instantaneous visual response with zero lag
      if (audio) {
        audio.playSpinnerClick();
      }
    }
  }

  setLane(targetLane, audio) {
    if (!this.isAlive) return;

    const clamped = this.web.clampLane(targetLane);
    if (clamped !== this.lane) {
      this.lane = clamped;
      this.displayLane = clamped;
      if (audio) {
        audio.playSpinnerClick();
      }
    }
  }

  fire(audio) {
    if (!this.isAlive) return false;
    if (this.timeSinceLastShot < this.fireCooldown) return false;
    if (this.shots.length >= this.maxShots) return false;

    this.timeSinceLastShot = 0;

    this.shots.push({
      lane: this.lane,
      z: 1.0,
      speed: this.shotSpeed,
      active: true
    });

    if (audio) {
      audio.playLaser();
    }
    return true;
  }

  useSuperzapper(audio, enemiesManager) {
    if (!this.isAlive || this.superzapperCharges <= 0) return false;

    this.superzapperCharges--;
    this.superzapperActive = true;
    this.superzapperTimer = 0.9;

    if (audio) {
      audio.playSuperzapper();
    }

    if (enemiesManager) {
      if (this.superzapperCharges === 1) {
        return enemiesManager.killAllEnemies();
      } else {
        return enemiesManager.killRandomEnemy();
      }
    }
    return 0;
  }

  update(dt) {
    this.timeSinceLastShot += dt;

    // Direct 1:1 lane lock (arcade discrete vector display)
    this.displayLane = this.lane;

    // Update Superzapper effect timer
    if (this.superzapperActive) {
      this.superzapperTimer -= dt;
      if (this.superzapperTimer <= 0) {
        this.superzapperActive = false;
      }
    }

    // Update spawn grace timer
    if (this.spawnGraceTimer > 0) {
      this.spawnGraceTimer -= dt;
    }

    // Update shots with swept collision tracking (prevZ)
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.prevZ = shot.z;
      shot.z -= shot.speed * dt;
      if (shot.z <= 0.0 || !shot.active) {
        this.shots.splice(i, 1);
      }
    }

    // Death timer
    if (!this.isAlive) {
      this.deathTimer += dt;
    }
  }

  kill(audio) {
    if (!this.isAlive) return;
    // Spawn grace period protects player from instant spawn-fragging
    if (this.spawnGraceTimer && this.spawnGraceTimer > 0) return;

    this.isAlive = false;
    this.deathTimer = 0;
    if (audio) {
      audio.playPlayerDeath();
    }
  }
}
