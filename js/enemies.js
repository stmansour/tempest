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
    this.pulsars = [];
    this.fuseballs = [];
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
    this.pulsars = [];
    this.fuseballs = [];
    this.spikes.clear();
    this.enemyBullets = [];
    this.particles = [];

    this.spawnTimer = 0.8;
    this.spawnInterval = Math.max(0.65, 1.6 - level * 0.08);
    this.highestEnemyZ = 0;

    // Initialize the exact wave enemy pool and abyss flies
    this._initWaveQueue(web, level);

    // Immediately spawn 2 initial vanguard enemies into the tube so the action starts right away
    if (this.abyssFlies.length > 0) this.spawnEnemy();
    if (this.abyssFlies.length > 0) this.spawnEnemy();
  }

  _initWaveQueue(web, level) {
    const totalCount = 12 + Math.min(level * 3, 24);

    let flipperCount = 0;
    let spikerCount = 0;
    let tankerCount = 0;
    let pulsarCount = 0;
    let fuseballCount = 0;

    if (level === 1) {
      flipperCount = totalCount;
    } else if (level === 2) {
      spikerCount = Math.floor(totalCount * 0.35);
      flipperCount = totalCount - spikerCount;
    } else if (level >= 3 && level <= 8) {
      tankerCount = Math.max(3, Math.floor(totalCount * 0.28));
      spikerCount = Math.max(3, Math.floor(totalCount * 0.28));
      flipperCount = Math.max(2, totalCount - tankerCount - spikerCount);
    } else if (level === 9 || level === 10) {
      // Wave 9+: Guaranteed Pulsars (at least 4-5) + Tankers + Spikers + Flippers
      pulsarCount = Math.max(4, Math.floor(totalCount * 0.28));
      tankerCount = Math.max(3, Math.floor(totalCount * 0.22));
      spikerCount = Math.max(3, Math.floor(totalCount * 0.22));
      flipperCount = Math.max(2, totalCount - pulsarCount - tankerCount - spikerCount);
    } else {
      // Wave 11+: Guaranteed Fuseballs (at least 4) + Pulsars (at least 4) + Tankers + Spikers + Flippers
      fuseballCount = Math.max(4, Math.floor(totalCount * 0.24));
      pulsarCount = Math.max(4, Math.floor(totalCount * 0.24));
      tankerCount = Math.max(3, Math.floor(totalCount * 0.20));
      spikerCount = Math.max(3, Math.floor(totalCount * 0.16));
      flipperCount = Math.max(2, totalCount - fuseballCount - pulsarCount - tankerCount - spikerCount);
    }

    const enemyTypes = [];
    for (let i = 0; i < flipperCount; i++) enemyTypes.push({ type: 'flipper', color: '#ff2233' });
    for (let i = 0; i < spikerCount; i++) enemyTypes.push({ type: 'spiker', color: '#00ff44' });
    for (let i = 0; i < tankerCount; i++) {
      let subType = 'flipper';
      if (level >= 4 && Math.random() < 0.45) subType = 'pulsar';
      else if (level >= 5 && Math.random() < 0.45) subType = 'fuse';
      enemyTypes.push({ type: 'tanker', subType: subType, color: '#cc22ff' });
    }
    for (let i = 0; i < pulsarCount; i++) enemyTypes.push({ type: 'pulsar', color: '#ffff00' });
    for (let i = 0; i < fuseballCount; i++) enemyTypes.push({ type: 'fuseball', color: '#00ffff' });

    // Shuffle the queue so enemy variety appears evenly throughout the wave
    for (let i = enemyTypes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = enemyTypes[i];
      enemyTypes[i] = enemyTypes[j];
      enemyTypes[j] = temp;
    }

    // Every waiting enemy is represented by an active buzzing dot in the abyss hole
    const lCount = web.laneCount;
    this.abyssFlies = enemyTypes.map((item, idx) => ({
      type: item.type,
      subType: item.subType,
      color: item.color,
      lane: (idx * (lCount / enemyTypes.length) + Math.random() * 0.5) % lCount,
      speed: (idx % 2 === 0 ? 1 : -1) * (1.2 + Math.random() * 1.8),
      flutterPhase: Math.random() * Math.PI * 2,
      flutterFreq: 12 + Math.random() * 8,
      radialJitter: (Math.random() - 0.5) * 3
    }));

    this.enemiesRemainingInWave = this.abyssFlies.length;
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

    for (const p of this.pulsars) {
      p.z = 0.05 + Math.random() * 0.08;
      p.pulseHeight = 0;
    }

    for (const f of this.fuseballs) {
      f.z = 0.05 + Math.random() * 0.08;
      f.dir = 1;
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

    // 4. Pulsars near rim
    for (let i = this.pulsars.length - 1; i >= 0; i--) {
      const p = this.pulsars[i];
      if (p.lane === playerLane && p.z >= 0.70) {
        const pt = this.web.getLaneCenter(p.lane, p.z);
        this.createExplosion(pt, '#00ffff', 24);
        this.pulsars.splice(i, 1);
        if (audio) audio.playExplosion(false);
        if (onScore) onScore(200);
        return true;
      }
    }

    // 5. Fuseballs near rim
    for (let i = this.fuseballs.length - 1; i >= 0; i--) {
      const f = this.fuseballs[i];
      const leftRib = playerLane;
      const rightRib = (playerLane + 1) % this.web.vertexCount;
      if ((f.rib === leftRib || f.rib === rightRib) && f.z >= 0.70) {
        const pt = this.web.getVertexPos(f.rib, f.z);
        this.createExplosion(pt, '#ffff00', 24);
        this.fuseballs.splice(i, 1);
        if (audio) audio.playExplosion(false);
        if (onScore) onScore(250);
        return true;
      }
    }

    // 6. Enemy bullets near rim
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
      p.timer = (p.timer || 0) + dt;
      p.life = (p.life !== undefined ? p.life : 0.45) - dt;
      if (p.isShard) {
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        p.angle = (p.angle || 0) + (p.vAngle || 0) * dt;
      }
      if (p.timer >= (p.duration || 0.45) || p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  spawnEnemy() {
    if (!this.abyssFlies || this.abyssFlies.length === 0) {
      this.enemiesRemainingInWave = 0;
      return;
    }

    // Pop exactly one buzzing fly from the abyss: it departs the center and enters the tube!
    const fly = this.abyssFlies.shift();
    this.enemiesRemainingInWave = this.abyssFlies.length;

    const lane = Math.floor(fly.lane) % this.web.laneCount;

    if (fly.type === 'pulsar') {
      this.pulsars.push({
        lane: lane,
        z: 0.0,
        speed: 0.17 + this.level * 0.01,
        pulseTimer: Math.random() * 1.2,
        pulseHeight: 0.0,
        isElectrified: false,
        color: '#ffff00'
      });
      return;
    }

    if (fly.type === 'fuseball') {
      const rib = Math.floor(Math.random() * this.web.vertexCount);
      this.fuseballs.push({
        rib: rib,
        z: 0.05,
        speed: 0.46 + this.level * 0.015,
        dir: 1,
        reverseTimer: 0.3 + Math.random() * 0.5,
        colorTimer: 0,
        color: '#00e5ff'
      });
      return;
    }

    if (fly.type === 'tanker') {
      this.tankers.push({
        lane: lane,
        z: 0.0,
        speed: 0.18 + this.level * 0.012,
        pulseTimer: 0,
        type: fly.subType || 'flipper',
        color: '#cc00ff'
      });
      return;
    }

    if (fly.type === 'spiker') {
      this.spikers.push({
        lane: lane,
        z: 0.0,
        speed: 0.32 + Math.random() * 0.12,
        targetZ: 0.55 + Math.random() * 0.32,
        ascending: true,
        rotation: 0,
        color: '#00ff00'
      });
      return;
    }

    // Default: Flipper
    this.flippers.push({
      lane: lane,
      z: 0.0,
      speed: 0.22 + (this.level * 0.018),
      isSwirling: true,
      swirlLane: lane,
      swirlSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.2),
      swirlTimer: 1.0 + Math.random() * 1.6,
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

  update(dt, player, audio, onScore) {
    let maxZ = 0;

    // 1. Spawning from Abyss Queue
    if (this.abyssFlies && this.abyssFlies.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.spawnTimer = this.spawnInterval + (Math.random() * 0.3 - 0.15);
      }
    }

    // Update abyss fly dots buzzing around center hole
    if (this.abyssFlies) {
      for (const fly of this.abyssFlies) {
        fly.lane = (fly.lane + fly.speed * dt + this.web.laneCount) % this.web.laneCount;
        fly.flutterPhase += dt * fly.flutterFreq;
      }
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

    // 3b. Update Pulsars
    for (let i = this.pulsars.length - 1; i >= 0; i--) {
      const pulsar = this.pulsars[i];
      pulsar.z += pulsar.speed * dt;
      pulsar.pulseTimer += dt;

      // Oscillate pulse height between 0.0 (flat dormant) and 1.0 (tall electrified)
      const cycle = (pulsar.pulseTimer % 1.2) / 1.2;
      pulsar.pulseHeight = Math.max(0, Math.sin(cycle * Math.PI * 2));
      pulsar.isElectrified = (pulsar.pulseHeight > 0.42);

      if (pulsar.z > maxZ) maxZ = pulsar.z;

      // If electrified pulsar touches player's claw near rim (z >= 0.85)
      if (player && player.isAlive && player.lane === pulsar.lane && pulsar.z >= 0.85 && pulsar.isElectrified) {
        if (player.spawnGraceTimer <= 0) {
          player.kill(audio, this, this.web);
          return;
        }
      }

      if (pulsar.z >= 1.0) {
        this.pulsars.splice(i, 1);
      }
    }

    // 3c. Update Fuseballs
    const FUSEBALL_COLORS = ['#ff0055', '#00e5ff', '#ffff00', '#00ff44', '#ffffff', '#cc00ff'];
    for (let i = this.fuseballs.length - 1; i >= 0; i--) {
      const fuseball = this.fuseballs[i];
      fuseball.z += (fuseball.dir || 1) * fuseball.speed * dt;
      fuseball.reverseTimer -= dt;
      fuseball.colorTimer += dt;
      fuseball.color = FUSEBALL_COLORS[Math.floor(fuseball.colorTimer / 0.06) % FUSEBALL_COLORS.length];

      if (fuseball.z > maxZ) maxZ = fuseball.z;

      if (fuseball.reverseTimer <= 0) {
        fuseball.dir = -fuseball.dir;
        fuseball.reverseTimer = 0.25 + Math.random() * 0.6;
      }

      if (fuseball.z <= 0.02) {
        fuseball.z = 0.02;
        fuseball.dir = 1;
      } else if (fuseball.z >= 1.0) {
        fuseball.z = 1.0;
        fuseball.dir = -1;
        // Occasionally switch to adjacent rib on rim
        if (Math.random() < 0.5) {
          fuseball.rib = (fuseball.rib + (Math.random() < 0.5 ? 1 : -1) + this.web.vertexCount) % this.web.vertexCount;
        }
      }

      // If fuseball on rim touches player's claw
      if (player && player.isAlive && fuseball.z >= 0.88) {
        const leftRib = player.lane;
        const rightRib = (player.lane + 1) % this.web.vertexCount;
        if (fuseball.rib === leftRib || fuseball.rib === rightRib) {
          if (player.spawnGraceTimer <= 0) {
            player.kill(audio, this, this.web);
            return;
          }
        }
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
                player.kill(audio, this, this.web);
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
              player.kill(audio, this, this.web);
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
              player.kill(audio, this, this.web);
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
          player.kill(audio, this, this.web);
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
          this.createExplosion(pt, '#ffffff', 1, spiker.lane, spiker.z);
          this.spikers.splice(i, 1);
          shot.active = false;
          shotHit = true;
          if (audio) audio.playExplosion(false);
          if (onScore) onScore(50);
          break;
        }
      }
      if (shotHit) continue;

      // Check Pulsars
      for (let i = this.pulsars.length - 1; i >= 0; i--) {
        const p = this.pulsars[i];
        if (p.lane === shot.lane && Math.abs(p.z - shot.z) < 0.12) {
          const pt = this.web.getLaneCenter(p.lane, p.z);
          this.createExplosion(pt, '#00ffff', 1, p.lane, p.z);
          this.pulsars.splice(i, 1);
          shot.active = false;
          shotHit = true;
          if (audio) audio.playExplosion(false);
          if (onScore) onScore(200);
          break;
        }
      }
      if (shotHit) continue;

      // Check Fuseballs
      for (let i = this.fuseballs.length - 1; i >= 0; i--) {
        const f = this.fuseballs[i];
        const leftRib = shot.lane;
        const rightRib = (shot.lane + 1) % this.web.vertexCount;
        if ((f.rib === leftRib || f.rib === rightRib) && Math.abs(f.z - shot.z) < 0.12) {
          const pt = this.web.getVertexPos(f.rib, f.z);
          this.createExplosion(pt, '#ffff00', 1, shot.lane, f.z);
          const pts = (f.z < 0.33) ? 750 : ((f.z < 0.66) ? 500 : 250);
          this.fuseballs.splice(i, 1);
          shot.active = false;
          shotHit = true;
          if (audio) audio.playExplosion(false);
          if (onScore) onScore(pts);
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
            this.createExplosion(pt, '#ffffff', 1, shot.lane, 0.0);
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
            this.createExplosion(pt, '#ffffff', 1, explodeLane, flipper.z);
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
          this.createExplosion(pt, '#ffffff', 1, shot.lane, 0.0);
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
        this.createExplosion(pt, '#ffffff', 1, shot.lane, spikeZ);
        if (audio) audio.playSpikeChip();

        if (newZ <= 0.05) {
          this.spikes.delete(shot.lane);
          if (onScore) onScore(10);
        } else {
          this.spikes.set(shot.lane, newZ);
        }
      }
    }

    // 7. Update Particles / Sunburst Explosions / Shards
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.timer = (p.timer || 0) + dt;
      p.life = (p.life !== undefined ? p.life : (p.duration || 0.45)) - dt;
      if (p.isShard) {
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        p.angle = (p.angle || 0) + (p.vAngle || 0) * dt;
      }
      if (p.timer >= (p.duration || 0.45) || p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update highest enemy depth for audio pulsation
    this.highestEnemyZ = maxZ;
    if (audio && audio.isPulsing) {
      audio.updatePulsationRate(maxZ);
    }
    if (audio && audio.updatePulsarHum) {
      audio.updatePulsarHum(this.pulsars);
    }
  }

  _splitTanker(tanker, index, audio) {
    const pt = this.web.getLaneCenter(tanker.lane, tanker.z);
    this.createExplosion(pt, '#ffffff', 1, tanker.lane, tanker.z);
    this.tankers.splice(index, 1);
    if (audio) audio.playExplosion(true);

    const lane1 = tanker.lane;
    const lane2 = this.web.clampLane(tanker.lane + 1);

    if (tanker.type === 'pulsar') {
      this.pulsars.push({
        lane: lane1,
        z: tanker.z,
        speed: 0.18,
        pulseTimer: 0,
        pulseHeight: 0.0,
        isElectrified: false,
        color: '#ffff00'
      });
      this.pulsars.push({
        lane: lane2,
        z: tanker.z,
        speed: 0.18,
        pulseTimer: 0.6,
        pulseHeight: 0.0,
        isElectrified: false,
        color: '#ffff00'
      });
    } else if (tanker.type === 'fuse' || tanker.type === 'fuseball') {
      const [vL, vR] = this.web.getLaneIndices(tanker.lane);
      this.fuseballs.push({
        rib: vL,
        z: tanker.z,
        speed: 0.45,
        dir: 1,
        reverseTimer: 0.4,
        colorTimer: 0,
        color: '#00e5ff'
      });
      this.fuseballs.push({
        rib: vR,
        z: tanker.z,
        speed: 0.45,
        dir: -1,
        reverseTimer: 0.4,
        colorTimer: 0,
        color: '#ff0055'
      });
    } else {
      // Spawn 2 flippers into adjacent lanes
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
  }

  createExplosion(pos, color = '#ffffff', _count = 1, lane = -1, z = 1.0) {
    // Authentic 1981 Atari Tempest stationary white sunburst explosion
    this.particles.push({
      isSunburst: true,
      x: pos ? pos.x : 0,
      y: pos ? pos.y : 0,
      lane: lane,
      z: z,
      timer: 0,
      duration: 0.45,
      life: 0.45,
      maxLife: 0.45,
      color: color || '#ffffff'
    });
  }

  /**
   * Generates a spectacular vector Claw shatter explosion:
   * 16 glowing vector shards that fly outward with rotational velocity and decaying brilliance,
   * plus a central white sunburst flash at the player's exact 3D tube position!
   */
  createClawExplosion(lane, z = 1.0, web) {
    if (!web) web = this.web;
    const centerPt = web ? web.getLaneCenter(lane, z) : { x: 0, y: 0 };

    // 1. Core stationary brilliant sunburst flash
    this.particles.push({
      isSunburst: true,
      x: centerPt.x,
      y: centerPt.y,
      lane: lane,
      z: z,
      timer: 0,
      duration: 1.1,
      life: 1.1,
      maxLife: 1.1,
      color: '#ffffff'
    });

    // 2. 16 Vector line shard fragments that shatter and scatter in 3D
    const edges = web ? web.getLaneEdges(lane, z) : null;
    if (edges) {
      const pL = edges.left;
      const pR = edges.right;
      const midX = (pL.x + pR.x) * 0.5;
      const midY = (pL.y + pR.y) * 0.5;
      const dx = pR.x - pL.x;
      const dy = pR.y - pL.y;
      const W = Math.hypot(dx, dy) || 24;
      const ux = dx / W;
      const uy = dy / W;
      const nx = -uy;
      const ny = ux;

      const shardColors = ['#ffff00', '#ffea00', '#ff3344', '#ffffff', '#ffaa00'];

      for (let i = 0; i < 16; i++) {
        const uOffset = (Math.random() - 0.5) * W * 1.2;
        const nOffset = (Math.random() - 0.5) * W * 0.8;
        const originX = midX + ux * uOffset + nx * nOffset;
        const originY = midY + uy * uOffset + ny * nOffset;

        const outDirX = (originX - midX) / (W * 0.5 || 1);
        const outDirY = (originY - midY) / (W * 0.5 || 1);
        const speed = 25 + Math.random() * 45;

        this.particles.push({
          isShard: true,
          x: originX,
          y: originY,
          lane: lane,
          z: z,
          vx: outDirX * speed + (Math.random() - 0.5) * 15,
          vy: outDirY * speed + (Math.random() - 0.5) * 15,
          length: (W * 0.2) + Math.random() * (W * 0.35),
          angle: Math.random() * Math.PI * 2,
          vAngle: (Math.random() - 0.5) * 16,
          timer: 0,
          duration: 1.5,
          life: 1.5,
          color: shardColors[i % shardColors.length],
          lineWidth: 2.8
        });
      }
    }
  }

  killAllEnemies() {
    let count = 0;
    const all = [...this.flippers, ...this.spikers, ...this.tankers, ...this.pulsars, ...this.fuseballs];
    for (const e of all) {
      const pt = (e.rib !== undefined) ? this.web.getVertexPos(e.rib, e.z) : this.web.getLaneCenter(e.lane, e.z);
      this.createExplosion(pt, '#ffffff', 1, e.lane !== undefined ? e.lane : -1, e.z);
      count++;
    }
    this.flippers = [];
    this.spikers = [];
    this.tankers = [];
    this.pulsars = [];
    this.fuseballs = [];
    this.enemyBullets = [];
    return count * 100;
  }

  killRandomEnemy() {
    const list = [...this.flippers, ...this.spikers, ...this.tankers, ...this.pulsars, ...this.fuseballs];
    if (list.length === 0) return 0;
    const target = list[Math.floor(Math.random() * list.length)];
    const pt = (target.rib !== undefined) ? this.web.getVertexPos(target.rib, target.z) : this.web.getLaneCenter(target.lane, target.z);
    this.createExplosion(pt, '#ffffff', 1, target.lane !== undefined ? target.lane : -1, target.z);

    const fIdx = this.flippers.indexOf(target);
    if (fIdx >= 0) this.flippers.splice(fIdx, 1);
    const sIdx = this.spikers.indexOf(target);
    if (sIdx >= 0) this.spikers.splice(sIdx, 1);
    const tIdx = this.tankers.indexOf(target);
    if (tIdx >= 0) this.tankers.splice(tIdx, 1);
    const pIdx = this.pulsars.indexOf(target);
    if (pIdx >= 0) this.pulsars.splice(pIdx, 1);
    const fbIdx = this.fuseballs.indexOf(target);
    if (fbIdx >= 0) this.fuseballs.splice(fbIdx, 1);

    return 100;
  }

  isWaveCleared() {
    return (!this.abyssFlies || this.abyssFlies.length === 0) &&
      this.enemiesRemainingInWave <= 0 &&
      this.flippers.length === 0 &&
      this.spikers.length === 0 &&
      this.tankers.length === 0 &&
      this.pulsars.length === 0 &&
      this.fuseballs.length === 0;
  }
}
