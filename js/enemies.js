/**
 * enemies.js - Authentic Tempest Enemy Engine
 * 
 * Features:
 * - Flippers: Fast climbing, crisp 180-degree lane somersaults, rim capture crawl, bullet firing.
 * - Spikers: Rapid ascending helixes that lay down dangerous green spikes and buzz.
 * - Tankers: Diamond/cross pulsars that split into two Flippers when shot.
 * - Spikes: Persistent hazard lines that shorten when chipped by blaster fire.
 * - Dynamic pulsation tracker feeding audio cues based on closest enemy depth.
 */

/**
 * ============================================================================
 * FLIPPER TUNING CONTROLS
 * ============================================================================
 * You can adjust the flipper flipping speed and timing right here!
 *
 * How the speed numbers work:
 *   flip duration (in seconds) = 1.0 / speed
 *
 *   Speed 1.55  => ~0.65 seconds to flip to next lane (current relaxed pace)
 *   Speed 2.20  => ~0.45 seconds to flip to next lane (moderate challenge)
 *   Speed 3.00  => ~0.33 seconds to flip to next lane (authentic arcade pace)
 *   Speed 4.00  => ~0.25 seconds to flip to next lane (fast & frantic)
 *
 * You can also change this LIVE in the browser console at any time by typing:
 *   window.FLIPPER_CONFIG.rimFlipSpeed = 2.5;
 */
export const FLIPPER_CONFIG = {
  // Speed of flipper somersaulting from lane to lane along the RIM (higher = faster)
  rimFlipSpeed: 2.2, // 1.55 _ 0.65sec, 2.2 _ 0.45sec, 3.0 _ 0.33sec, 4.0 _ 0.25sec

  // Speed of flipper somersaulting from lane to lane inside the TUBE (higher = faster)
  tubeFlipSpeed: 4.6,

  // How long (in seconds) a flipper pauses in a lane on the rim before starting its next flip
  rimPauseMin: 0.35,
  rimPauseMax: 0.65
};

// Expose globally on window for instant live tuning in DevTools console without reloading:
if (typeof window !== 'undefined') {
  window.FLIPPER_CONFIG = FLIPPER_CONFIG;
}

export class EnemyManager {
  constructor(web) {
    this.web = web;
    this.flippers = [];
    this.spikers = [];
    this.tankers = [];
    this.spikes = new Map(); // laneIndex -> maxZ
    this.enemyBullets = [];
    this.particles = [];
    this.abyssFlies = [];

    // Wave parameters (faster arcade pacing)
    this.spawnTimer = 0;
    this.spawnInterval = 1.6;
    this.enemiesRemainingInWave = 16;
    this.level = 1;
    this.highestEnemyZ = 0;
  }

  resetForLevel(web, level = 1) {
    this.web = web;
    this.level = level;
    this.flippers = [];
    this.spikers = [];
    this.tankers = [];
    this.spikes.clear();
    this.enemyBullets = [];
    this.particles = [];

    this.spawnTimer = 1.2;
    this.spawnInterval = Math.max(0.7, 1.8 - level * 0.12);
    this.enemiesRemainingInWave = 14 + level * 4;
    this.highestEnemyZ = 0;

    // Pre-populate initial abyss swirl pool: 3-4 flippers swirling far away in the center hole
    const initialSwirlCount = Math.min(4, Math.max(2, Math.floor(web.laneCount / 4)));
    for (let i = 0; i < initialSwirlCount; i++) {
      const swirlLane = (i * (web.laneCount / initialSwirlCount)) % web.laneCount;
      this.flippers.push({
        lane: Math.floor(swirlLane),
        z: 0.0,
        speed: 0.22 + (level * 0.015),
        isSwirling: true,
        swirlLane: swirlLane,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (1.8 + Math.random() * 0.8),
        swirlTimer: 1.8 + i * 1.2, // Sequentially exit swirl pool into lanes
        isFlipping: false,
        flipProgress: 0,
        flipSourceLane: Math.floor(swirlLane),
        flipTargetLane: Math.floor(swirlLane),
        flipCooldown: 0.9 + Math.random() * 1.2,
        onRim: false,
        rimDirection: Math.random() < 0.5 ? 1 : -1,
        rimMoveTimer: 0,
        color: '#ff0000',
        shootTimer: 2.2 + Math.random() * 2.5
      });
    }
    this.enemiesRemainingInWave = Math.max(0, this.enemiesRemainingInWave - initialSwirlCount);

    // Initialize the swarm of red abyss flies buzzing far away around the center hole
    this._initAbyssFlies(web);
  }

  _initAbyssFlies(web) {
    this.abyssFlies = [];
    const count = Math.min(8, Math.max(5, Math.floor(web.laneCount / 2)));
    for (let i = 0; i < count; i++) {
      this.abyssFlies.push({
        lane: (i * (web.laneCount / count) + Math.random() * 0.5) % web.laneCount,
        speed: (i % 2 === 0 ? 1 : -1) * (1.2 + Math.random() * 2.0),
        flutterPhase: Math.random() * Math.PI * 2,
        flutterFreq: 12 + Math.random() * 8,
        radialJitter: (Math.random() - 0.5) * 4,
        color: '#ff2233'
      });
    }
  }

  /**
   * Evaluates all lanes to find the safest spawn position furthest from any enemies
   */
  findSafeSpawnLane(web) {
    if (!web) return 0;

    let bestLane = 0;
    let maxSafety = -Infinity;

    for (let lane = 0; lane < web.laneCount; lane++) {
      let minDistanceToThreat = Infinity;

      // Distance to flippers: heavily penalize lanes near rim flippers
      for (const f of this.flippers) {
        let diff = Math.abs(lane - f.lane);
        if (web.isClosed) {
          diff = Math.min(diff, web.laneCount - diff);
        }
        // Rim flippers are deadly: threat is massive when diff is small
        const threatScore = f.onRim ? (diff * 2.5) : (diff * (1.0 + f.z));
        if (threatScore < minDistanceToThreat) minDistanceToThreat = threatScore;
      }

      // Distance to tankers
      for (const t of this.tankers) {
        let diff = Math.abs(lane - t.lane);
        if (web.isClosed) diff = Math.min(diff, web.laneCount - diff);
        const threatScore = diff * (1.0 + t.z);
        if (threatScore < minDistanceToThreat) minDistanceToThreat = threatScore;
      }

      // Spikes in this lane: prefer lanes without tall spikes
      const spikeZ = this.spikes.get(lane);
      if (spikeZ && spikeZ > 0.3) {
        minDistanceToThreat = Math.min(minDistanceToThreat, (1.0 - spikeZ) * 2.0);
      }

      if (minDistanceToThreat > maxSafety) {
        maxSafety = minDistanceToThreat;
        bestLane = lane;
      }
    }

    return bestLane;
  }

  /**
   * Authentic Atari INEWLI (New Life Setup from ALWELG.MAC lines 37-51 & INIINV):
   * Clears the rim completely, removes all enemy bullets, pushes surviving enemies to the far bottom
   * opposite the safe spawn lane, and gives the player a completely clear board.
   */
  resetForNewLife(web, safeLane) {
    this.enemyBullets = [];

    // Clear any flippers on the rim so the rim is completely free of threats
    this.flippers = this.flippers.filter(f => !f.onRim);

    // Opposite lane to the safe spawn lane (maximum distance)
    const oppositeLane = Math.floor(web.laneCount / 2);

    // Push all surviving flippers down to the far bottom and away from player
    for (let i = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      f.onRim = false;
      f.isFlipping = false;
      f.flipProgress = 0;
      f.z = 0.05 + Math.random() * 0.10; // Far down in the abyss (z <= 0.15)
      f.rimMoveTimer = 1.0;
      // Distribute to opposite side of web
      const spread = (i % 2 === 0 ? 1 : -1) * Math.floor((i + 1) / 2);
      f.lane = web.clampLane((safeLane + oppositeLane + spread) % web.laneCount);
    }

    for (let i = 0; i < this.tankers.length; i++) {
      const t = this.tankers[i];
      t.z = 0.05 + Math.random() * 0.08;
      const spread = (i % 2 === 0 ? 1 : -1) * Math.floor((i + 1) / 2);
      t.lane = web.clampLane((safeLane + oppositeLane + spread) % web.laneCount);
    }

    for (const s of this.spikers) {
      s.z = Math.min(s.z, 0.15);
      s.ascending = true;
    }

    // Completely clear spikes in and adjacent to the player's spawn lane
    for (let offset = -2; offset <= 2; offset++) {
      const l = web.clampLane(safeLane + offset);
      this.spikes.delete(l);
    }

    this.spawnTimer = 2.4; // Grace period before next enemy spawn
    this.highestEnemyZ = 0.15;
  }

  /**
   * Synchronous hardware-speed collision check executed immediately on trigger press (ALWELG.MAC: COLCHK)
   * If any Flipper, Tanker, Spiker or Bullet is in or flipping into playerLane near the rim, it is destroyed instantly.
   */
  checkImmediateShotHit(playerLane, audio, onScore) {
    if (playerLane === null || playerLane === undefined) return false;

    // 1. Flippers: Check in playerLane or flipping into playerLane
    for (let i = this.flippers.length - 1; i >= 0; i--) {
      const f = this.flippers[i];
      const inLane = (f.lane === playerLane) ||
        (f.isFlipping && (f.flipTargetLane === playerLane || f.flipSourceLane === playerLane));

      // Immediate hit if on rim, flipping into playerLane, or high in tube (z >= 0.70)
      if (inLane && (f.onRim || f.z >= 0.70)) {
        const explodeLane = (f.isFlipping && f.flipTargetLane === playerLane) ? f.flipTargetLane : f.lane;
        const pt = this.web.getLaneCenter(explodeLane, f.z);
        this.createExplosion(pt, f.color || '#ff0000', 32);
        this.flippers.splice(i, 1);
        if (audio) audio.playExplosion(false);
        if (onScore) onScore(150);
        return true;
      }
    }

    // 2. Tankers near rim
    for (let i = this.tankers.length - 1; i >= 0; i--) {
      const t = this.tankers[i];
      if (t.lane === playerLane && t.z >= 0.75) {
        this._splitTanker(t, i, audio);
        if (onScore) onScore(100);
        return true;
      }
    }

    // 3. Spikers near rim
    for (let i = this.spikers.length - 1; i >= 0; i--) {
      const s = this.spikers[i];
      if (s.lane === playerLane && s.z >= 0.75) {
        const pt = this.web.getLaneCenter(s.lane, s.z);
        this.createExplosion(pt, s.color || '#00ff00', 24);
        this.spikers.splice(i, 1);
        if (audio) audio.playExplosion(false);
        if (onScore) onScore(50);
        return true;
      }
    }

    // 4. Enemy bullets near rim
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      if (b.lane === playerLane && b.z >= 0.75) {
        const pt = this.web.getLaneCenter(b.lane, b.z);
        this.createExplosion(pt, '#ffffff', 18);
        this.enemyBullets.splice(i, 1);
        return true;
      }
    }

    return false;
  }

  /**
   * Updates only vector explosion particles while the player is dying (enemies freeze in place)
   */
  updateParticlesOnly(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  spawnEnemy() {
    if (this.enemiesRemainingInWave <= 0) return;
    this.enemiesRemainingInWave--;

    const lane = Math.floor(Math.random() * this.web.laneCount);
    const rand = Math.random();

    // Wave 1: Flippers ONLY (matching authentic 1981 Atari Tempest Level 1 specifications)
    if (this.level === 1) {
      this.flippers.push({
        lane: lane,
        z: 0.0,
        speed: 0.22,
        isSwirling: true,
        swirlLane: lane,
        swirlSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.2),
        swirlTimer: 1.4 + Math.random() * 2.2, // Swirl in abyss before picking a lane to climb
        isFlipping: false,
        flipProgress: 0,
        flipSourceLane: lane,
        flipTargetLane: lane,
        flipCooldown: 0.9 + Math.random() * 1.2,
        onRim: false,
        rimDirection: Math.random() < 0.5 ? 1 : -1,
        rimMoveTimer: 0,
        color: '#ff0000',
        shootTimer: 2.2 + Math.random() * 2.5
      });
      return;
    }

    // On wave >= 3, introduce Tankers (OPTANK from ALWELG.MAC)
    if (this.level >= 3 && rand < 0.22) {
      this.tankers.push({
        lane: lane,
        z: 0.0,
        speed: 0.18 + this.level * 0.012,
        pulseTimer: 0,
        color: '#cc00ff'
      });
    } else if (rand < 0.55) {
      // Spiker
      this.spikers.push({
        lane: lane,
        z: 0.0,
        speed: 0.32 + Math.random() * 0.12,
        targetZ: 0.55 + Math.random() * 0.32,
        ascending: true,
        rotation: 0,
        color: '#00ff00'
      });
    } else {
      // Flipper
      this.flippers.push({
        lane: lane,
        z: 0.0,
        speed: 0.22 + (this.level * 0.018),
        isSwirling: true,
        swirlLane: lane,
        swirlSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.2),
        swirlTimer: 1.2 + Math.random() * 2.0,
        isFlipping: false,
        flipProgress: 0,
        flipSourceLane: lane,
        flipTargetLane: lane,
        flipCooldown: 0.8 + Math.random() * 1.2,
        onRim: false,
        rimDirection: Math.random() < 0.5 ? 1 : -1,
        rimMoveTimer: 0,
        color: '#ff0000',
        shootTimer: 1.8 + Math.random() * 2.5
      });
    }
  }

  update(dt, player, audio, onScore) {
    let maxZ = 0;

    // 1. Spawning
    if (this.enemiesRemainingInWave > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.spawnTimer = this.spawnInterval + (Math.random() * 0.4 - 0.2);
      }
    }

    // Update abyss fly dots buzzing around center hole
    for (const fly of this.abyssFlies) {
      fly.lane = (fly.lane + fly.speed * dt + this.web.laneCount) % this.web.laneCount;
      fly.flutterPhase += dt * fly.flutterFreq;
    }

    // 2. Update Spikers
    for (let i = this.spikers.length - 1; i >= 0; i--) {
      const spiker = this.spikers[i];
      spiker.rotation += dt * 14;

      if (spiker.ascending) {
        spiker.z += spiker.speed * dt;
        if (spiker.z > maxZ) maxZ = spiker.z;

        // Lay / extend spikes
        const curSpikeZ = this.spikes.get(spiker.lane) || 0;
        if (spiker.z > curSpikeZ) {
          this.spikes.set(spiker.lane, Math.min(0.88, spiker.z));
          if (audio && Math.random() < 0.15) audio.playSpikerHum();
        }

        if (spiker.z >= spiker.targetZ) {
          spiker.ascending = false;
        }
      } else {
        // Fast descent back to hole
        spiker.z -= spiker.speed * 1.5 * dt;
        if (spiker.z <= 0.0) {
          this.spikers.splice(i, 1);
          continue;
        }
      }
    }

    // 3. Update Tankers
    for (let i = this.tankers.length - 1; i >= 0; i--) {
      const tanker = this.tankers[i];
      tanker.z += tanker.speed * dt;
      tanker.pulseTimer += dt;
      if (tanker.z > maxZ) maxZ = tanker.z;

      if (tanker.z >= 0.98) {
        // Tanker splits at rim into two Flippers
        this._splitTanker(tanker, i, audio);
      }
    }

    // 4. Update Flippers
    for (let i = this.flippers.length - 1; i >= 0; i--) {
      const flipper = this.flippers[i];

      // Swirling in abyss at bottom of tube before committing to a lane
      if (flipper.isSwirling) {
        flipper.swirlTimer -= dt;
        flipper.swirlLane = (flipper.swirlLane + flipper.swirlSpeed * dt + this.web.laneCount) % this.web.laneCount;
        flipper.lane = Math.floor(flipper.swirlLane) % this.web.laneCount;
        flipper.z = 0.0;

        if (flipper.swirlTimer <= 0) {
          flipper.isSwirling = false;
          flipper.lane = Math.floor(flipper.swirlLane) % this.web.laneCount;
          flipper.flipCooldown = 0.8 + Math.random() * 1.2;
        }
        continue;
      }

      // Enemy shooting
      flipper.shootTimer -= dt;
      if (flipper.shootTimer <= 0 && flipper.z > 0.2 && flipper.z < 0.95) {
        flipper.shootTimer = 2.4 + Math.random() * 2.8;
        this.enemyBullets.push({
          lane: flipper.lane,
          z: flipper.z,
          speed: 0.85,
          color: '#ff44aa'
        });
      }

      if (flipper.onRim) {
        if (maxZ < 1.0) maxZ = 1.0;

        if (flipper.isFlipping) {
          // Somersault flip along the rim between adjacent lanes
          const rimSpeed = FLIPPER_CONFIG.rimFlipSpeed || 1.55;
          flipper.flipProgress += dt * rimSpeed;
          if (flipper.flipProgress >= 1.0) {
            flipper.isFlipping = false;
            flipper.lane = flipper.flipTargetLane;
            flipper.flipProgress = 0;
            const pMin = FLIPPER_CONFIG.rimPauseMin ?? 0.35;
            const pMax = FLIPPER_CONFIG.rimPauseMax ?? 0.65;
            flipper.rimMoveTimer = pMin + Math.random() * Math.max(0, pMax - pMin);

            // Flip complete: check capture only after landing in the lane
            if (player.isAlive && flipper.lane === player.lane) {
              if (player.spawnGraceTimer > 0) {
                // Vector shield disintegrates flipper during spawn grace!
                const pt = this.web.getLaneCenter(flipper.lane, 1.0);
                this.createExplosion(pt, flipper.color, 32);
                this.flippers.splice(i, 1);
                if (audio) audio.playExplosion(false);
                if (onScore) onScore(150);
                continue;
              } else {
                player.kill(audio);
                this.createExplosion(this.web.getLaneCenter(player.lane, 1.0), '#ffff00', 30);
              }
            }
          }
        } else {
          flipper.rimMoveTimer -= dt;
          if (flipper.rimMoveTimer <= 0) {
            // Decide direction towards player (authentic Dave Theurer JCHPLA)
            let dir = 1;
            if (this.web.isClosed) {
              let diff = player.lane - flipper.lane;
              if (diff > this.web.laneCount / 2) diff -= this.web.laneCount;
              if (diff < -this.web.laneCount / 2) diff += this.web.laneCount;
              dir = diff >= 0 ? 1 : -1;
            } else {
              dir = player.lane >= flipper.lane ? 1 : -1;
            }
            if (Math.random() < 0.18) dir *= -1; // Subtle variation

            const nextLane = this.web.clampLane(flipper.lane + dir);
            if (nextLane !== flipper.lane) {
              flipper.isFlipping = true;
              flipper.flipProgress = 0;
              flipper.flipSourceLane = flipper.lane;
              flipper.flipTargetLane = nextLane;
              if (audio) audio.playFlipperFlip();
            } else {
              flipper.rimMoveTimer = FLIPPER_CONFIG.rimPauseMin ?? 0.35;
            }
          }

          // If resting on rim and player runs directly into this lane:
          if (player.isAlive && flipper.lane === player.lane) {
            if (player.spawnGraceTimer > 0) {
              const pt = this.web.getLaneCenter(flipper.lane, 1.0);
              this.createExplosion(pt, flipper.color, 32);
              this.flippers.splice(i, 1);
              if (audio) audio.playExplosion(false);
              if (onScore) onScore(150);
              continue;
            } else {
              player.kill(audio);
              this.createExplosion(this.web.getLaneCenter(player.lane, 1.0), '#ffff00', 30);
            }
          }
        }
      } else {
        flipper.z += flipper.speed * dt;
        if (flipper.z > maxZ) maxZ = flipper.z;

        // Somersault between adjacent lanes down the tube
        if (flipper.isFlipping) {
          const tubeSpeed = FLIPPER_CONFIG.tubeFlipSpeed || 4.6;
          flipper.flipProgress += dt * tubeSpeed;
          if (flipper.flipProgress >= 1.0) {
            flipper.isFlipping = false;
            flipper.lane = flipper.flipTargetLane;
            flipper.flipProgress = 0;
            flipper.flipCooldown = 0.7 + Math.random() * 1.5;
          }
        } else {
          flipper.flipCooldown -= dt;
          if (flipper.flipCooldown <= 0) {
            let dir = 1;
            if (this.web.isClosed) {
              let diff = player.lane - flipper.lane;
              if (diff > this.web.laneCount / 2) diff -= this.web.laneCount;
              if (diff < -this.web.laneCount / 2) diff += this.web.laneCount;
              dir = diff >= 0 ? 1 : -1;
            } else {
              dir = player.lane >= flipper.lane ? 1 : -1;
            }
            if (Math.random() < 0.25) dir *= -1;

            const target = this.web.clampLane(flipper.lane + dir);
            if (target !== flipper.lane) {
              flipper.isFlipping = true;
              flipper.flipProgress = 0;
              flipper.flipSourceLane = flipper.lane;
              flipper.flipTargetLane = target;
              if (audio) audio.playFlipperFlip();
            }
          }
        }

        if (flipper.z >= 1.0) {
          flipper.z = 1.0;
          flipper.onRim = true;
          flipper.isFlipping = false;
          flipper.flipProgress = 0;
          flipper.rimMoveTimer = FLIPPER_CONFIG.rimPauseMin ?? 0.35;
          if (player.isAlive && flipper.lane === player.lane) {
            if (player.spawnGraceTimer > 0) {
              const pt = this.web.getLaneCenter(flipper.lane, 1.0);
              this.createExplosion(pt, flipper.color, 32);
              this.flippers.splice(i, 1);
              if (audio) audio.playExplosion(false);
              if (onScore) onScore(150);
              continue;
            } else {
              player.kill(audio);
              this.createExplosion(this.web.getLaneCenter(player.lane, 1.0), '#ffff00', 30);
            }
          }
        }
      }
    }

    // 5. Update Enemy Bullets
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.z += b.speed * dt;

      if (b.z >= 0.96 && player.isAlive && b.lane === player.lane) {
        if (player.spawnGraceTimer > 0) {
          const pt = this.web.getLaneCenter(b.lane, 1.0);
          this.createExplosion(pt, '#ffffff', 16);
          this.enemyBullets.splice(i, 1);
          continue;
        } else {
          player.kill(audio);
          this.createExplosion(this.web.getLaneCenter(player.lane, 1.0), '#ffff00', 30);
          this.enemyBullets.splice(i, 1);
          continue;
        }
      }

      if (b.z >= 1.05) {
        this.enemyBullets.splice(i, 1);
      }
    }

    // 6. Fast Laser Collisions with Enemies, Tankers & Spikes
    for (let sIdx = player.shots.length - 1; sIdx >= 0; sIdx--) {
      const shot = player.shots[sIdx];
      if (!shot.active) continue;

      let shotHit = false;

      // Check Tankers
      for (let i = this.tankers.length - 1; i >= 0; i--) {
        const t = this.tankers[i];
        if (t.lane === shot.lane && Math.abs(t.z - shot.z) < 0.1) {
          this._splitTanker(t, i, audio);
          shot.active = false;
          shotHit = true;
          if (onScore) onScore(100);
          break;
        }
      }
      if (shotHit) continue;

      // Check Spikers
      for (let i = this.spikers.length - 1; i >= 0; i--) {
        const spiker = this.spikers[i];
        if (spiker.lane === shot.lane && Math.abs(spiker.z - shot.z) < 0.09) {
          const pt = this.web.getLaneCenter(spiker.lane, spiker.z);
          this.createExplosion(pt, spiker.color, 24);
          this.spikers.splice(i, 1);
          shot.active = false;
          shotHit = true;
          if (audio) audio.playExplosion(false);
          if (onScore) onScore(50);
          break;
        }
      }
      if (shotHit) continue;

      // Check Flippers (swirling in abyss, climbing in tube, or cartwheeling on rim)
      for (let i = this.flippers.length - 1; i >= 0; i--) {
        const flipper = this.flippers[i];

        if (flipper.isSwirling) {
          const laneDiff = Math.abs(flipper.swirlLane - shot.lane);
          const closedDiff = this.web.isClosed ? Math.min(laneDiff, this.web.laneCount - laneDiff) : laneDiff;
          if (shot.z <= 0.08 && closedDiff < 0.75) {
            const pt = this.web.getLaneCenter(shot.lane, 0.0);
            this.createExplosion(pt, flipper.color || '#ff0000', 30);
            this.flippers.splice(i, 1);
            shot.active = false;
            shotHit = true;
            if (audio) audio.playExplosion(false);
            if (onScore) onScore(150);
            break;
          }
          continue;
        }

        // Match lane: current lane OR the lane it is actively flipping into / out of
        const inLane = (shot.lane === flipper.lane) ||
          (flipper.isFlipping && (shot.lane === flipper.flipTargetLane || shot.lane === flipper.flipSourceLane));

        if (inLane) {
          // Depth collision check:
          // 1. If flipper is on rim: any shot fired at rim depth (shot.z >= 0.80) hits instantly!
          // 2. If in tube: swept interval check (shot crossed flipper) or direct proximity check
          const zHit = (flipper.onRim && shot.z >= 0.80) ||
            (Math.abs(flipper.z - shot.z) < 0.14) ||
            (shot.prevZ !== undefined && shot.prevZ >= flipper.z && shot.z <= flipper.z);

          if (zHit) {
            const explodeLane = (flipper.isFlipping && shot.lane === flipper.flipTargetLane) ? flipper.flipTargetLane : flipper.lane;
            const pt = this.web.getLaneCenter(explodeLane, flipper.z);
            this.createExplosion(pt, flipper.color, 28);
            this.flippers.splice(i, 1);
            shot.active = false;
            shotHit = true;
            if (audio) audio.playExplosion(false);
            if (onScore) onScore(150); // Authentic 150 PTS for Flippers!
            break;
          }
        }
      }
      // Check Abyss Fly Dots
      for (let i = 0; i < this.abyssFlies.length; i++) {
        const fly = this.abyssFlies[i];
        let diff = Math.abs(fly.lane - shot.lane);
        if (this.web.isClosed) diff = Math.min(diff, this.web.laneCount - diff);
        if (shot.z <= 0.05 && diff < 0.65) {
          const pt = this.web.getLaneCenter(shot.lane, 0.0);
          this.createExplosion(pt, '#ff2233', 12);
          fly.lane = (fly.lane + this.web.laneCount * 0.5) % this.web.laneCount;
          shot.active = false;
          shotHit = true;
          if (onScore) onScore(50);
          break;
        }
      }
      if (shotHit) continue;

      // Check Spike Tips
      const spikeZ = this.spikes.get(shot.lane);
      if (spikeZ && shot.z <= spikeZ) {
        shot.active = false;
        const newZ = spikeZ - 0.09;
        const pt = this.web.getLaneCenter(shot.lane, spikeZ);
        this.createExplosion(pt, '#00ff55', 12);
        if (audio) audio.playSpikeChip();

        if (newZ <= 0.05) {
          this.spikes.delete(shot.lane);
          if (onScore) onScore(10);
        } else {
          this.spikes.set(shot.lane, newZ);
        }
      }
    }

    // 7. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update highest enemy depth for audio pulsation
    this.highestEnemyZ = maxZ;
    if (audio && audio.isPulsing) {
      audio.updatePulsationRate(maxZ);
    }
  }

  _splitTanker(tanker, index, audio) {
    const pt = this.web.getLaneCenter(tanker.lane, tanker.z);
    this.createExplosion(pt, tanker.color, 32);
    this.tankers.splice(index, 1);
    if (audio) audio.playExplosion(true);

    // Spawn 2 flippers into adjacent lanes
    const lane1 = tanker.lane;
    const lane2 = this.web.clampLane(tanker.lane + 1);

    this.flippers.push({
      lane: lane1,
      z: tanker.z,
      speed: 0.25,
      isFlipping: false,
      flipProgress: 0,
      flipSourceLane: lane1,
      flipTargetLane: lane1,
      flipCooldown: 0.8,
      onRim: false,
      rimDirection: 1,
      rimMoveTimer: 0,
      color: '#ff0000',
      shootTimer: 2.0
    });

    this.flippers.push({
      lane: lane2,
      z: tanker.z,
      speed: 0.25,
      isFlipping: false,
      flipProgress: 0,
      flipSourceLane: lane2,
      flipTargetLane: lane2,
      flipCooldown: 0.8,
      onRim: false,
      rimDirection: -1,
      rimMoveTimer: 0,
      color: '#ff0000',
      shootTimer: 2.0
    });
  }

  createExplosion(pos, color, count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 45;
      const life = 0.35 + Math.random() * 0.45;
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 5 + Math.random() * 10,
        angle: angle,
        color: color,
        life: life,
        maxLife: life,
        alpha: 1.0
      });
    }
  }

  killAllEnemies() {
    let count = 0;
    const all = [...this.flippers, ...this.spikers, ...this.tankers];
    for (const e of all) {
      const pt = this.web.getLaneCenter(e.lane, e.z);
      this.createExplosion(pt, e.color || '#ff00aa', 24);
      count++;
    }
    this.flippers = [];
    this.spikers = [];
    this.tankers = [];
    this.enemyBullets = [];
    return count * 100;
  }

  killRandomEnemy() {
    const list = [...this.flippers, ...this.spikers, ...this.tankers];
    if (list.length === 0) return 0;

    const target = list[Math.floor(Math.random() * list.length)];
    const pt = this.web.getLaneCenter(target.lane, target.z);
    this.createExplosion(pt, target.color || '#ff00aa', 24);

    const fIdx = this.flippers.indexOf(target);
    if (fIdx >= 0) this.flippers.splice(fIdx, 1);
    const sIdx = this.spikers.indexOf(target);
    if (sIdx >= 0) this.spikers.splice(sIdx, 1);
    const tIdx = this.tankers.indexOf(target);
    if (tIdx >= 0) this.tankers.splice(tIdx, 1);

    return 100;
  }

  isWaveCleared() {
    return this.enemiesRemainingInWave <= 0 &&
      this.flippers.length === 0 &&
      this.spikers.length === 0 &&
      this.tankers.length === 0;
  }
}
