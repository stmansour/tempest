/**
 * game.js - Tempest Game State Machine & Rules Engine
 * 
 * Manages game progression:
 * - ATTRACT: Authentic 3D TEMPEST Rainbow Cascade Vector Logo, Fuji Logo, Coin Prompt
 * - PLAYING: Fast responsive vector combat, continuous tactical audio pulsation
 * - LEVEL_WARP: End-of-level tube dive sequence
 * - PLAYER_DYING: Vector explosion, life deduction
 * - GAME_OVER: High score recording, return to attract
 */

import { createLevelWeb, WELL_VISUAL_CENTER_OVERRIDES, WELL_SEQUENCE } from './web.js?v=warp_stage3_unified';
import { Player } from './player.js?v=warp_stage3_unified';
import { EnemyManager } from './enemies.js?v=warp_stage3_unified';

/**
 * OPERATOR DIP SWITCH SETTINGS (Atari Tempest PCB L12)
 *
 * BONUS_LIFE_INTERVAL: Score interval required to earn an extra Claw Blaster.
 * Set this value to change the score milestone for bonus claws.
 * Matches Atari QuadraScan PCB toggle switches 3, 4 & 5:
 *   10000 : Bonus claw every 10,000 pts (SW 3-5: ON, ON, OFF)
 *   20000 : Bonus claw every 20,000 pts (SW 3-5: ON, ON, ON) - Atari Factory Default
 *   30000 : Bonus claw every 30,000 pts (SW 3-5: ON, OFF, ON)
 *   40000 : Bonus claw every 40,000 pts (SW 3-5: ON, OFF, OFF)
 *   50000 : Bonus claw every 50,000 pts (SW 3-5: OFF, ON, ON)
 *   60000 : Bonus claw every 60,000 pts (SW 3-5: OFF, ON, OFF)
 *   70000 : Bonus claw every 70,000 pts (SW 3-5: OFF, OFF, ON)
 *   0     : No bonus claws awarded      (SW 3-5: OFF, OFF, OFF)
 */
export const BONUS_LIFE_INTERVAL = 70000;

export const GameState = {
  ATTRACT: 'ATTRACT',
  RATE_YOURSELF: 'RATE_YOURSELF',
  PLAYING: 'PLAYING',
  LEVEL_WARP: 'LEVEL_WARP',
  PLAYER_DYING: 'PLAYER_DYING',
  GAME_OVER: 'GAME_OVER',
  ENTER_INITIALS: 'ENTER_INITIALS',
  HIGH_SCORES: 'HIGH_SCORES'
};

export function getTierWellId(level) {
  return WELL_SEQUENCE[(level - 1) % WELL_SEQUENCE.length];
}

/**
 * Authentic Atari Tempest Skill-Step Tiers Table (from Dave Theurer's ALWELG.MAC:274)
 */
export const ALL_RATE_YOURSELF_TIERS = [
  { level: 1,  bonus: 0 },
  { level: 3,  bonus: 6000 },
  { level: 5,  bonus: 16000 },
  { level: 7,  bonus: 32000 },
  { level: 9,  bonus: 54000 },
  { level: 11, bonus: 74000 },
  { level: 13, bonus: 94000 },
  { level: 15, bonus: 114000 },
  { level: 17, bonus: 134000 },
  { level: 19, bonus: 152000 },
  { level: 21, bonus: 170000 },
  { level: 23, bonus: 188000 },
  { level: 25, bonus: 208000 },
  { level: 27, bonus: 226000 },
  { level: 29, bonus: 248000 },
  { level: 31, bonus: 266000 },
  { level: 33, bonus: 300000 },
  { level: 35, bonus: 340000 },
  { level: 37, bonus: 382000 },
  { level: 39, bonus: 415000 },
  { level: 41, bonus: 439000 },
  { level: 43, bonus: 472000 },
  { level: 45, bonus: 531000 },
  { level: 47, bonus: 581000 },
  { level: 49, bonus: 624000 },
  { level: 51, bonus: 656000 },
  { level: 53, bonus: 766000 },
  { level: 55, bonus: 898000 }
];

export const RATE_YOURSELF_TIERS = ALL_RATE_YOURSELF_TIERS.slice(0, 5).map(t => ({
  level: t.level,
  wellId: getTierWellId(t.level),
  bonus: t.bonus,
  label: (t.level === 1 ? 'NOVICE' : (t.level === 9 ? 'EXPERT' : ''))
}));

export const DEFAULT_HIGH_SCORES = [
  { score: 192689, level: 16, initials: 'BVD' }, // Top flyer score
  { score: 154200, level: 14, initials: 'DFT' }, // Dave Theurer
  { score: 121850, level: 12, initials: 'MH ' }, // Morgan Hoff
  { score: 98400,  level: 10, initials: 'PJM' },
  { score: 75100,  level: 8,  initials: 'HEB' },
  { score: 52000,  level: 6,  initials: 'LDS' },
  { score: 35400,  level: 4,  initials: 'RRR' },
  { score: 20000,  level: 2,  initials: 'DJE' }
];

export class Game {
  constructor(renderer, audio, input) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;

    this.state = GameState.ATTRACT;
    this.level = 1;
    this.score = 0;

    // Load High Scores & Top Initials
    this.highScores = this._loadHighScores();
    this.highScore = this.highScores[0].score;
    this.highScoreInitials = this.highScores[0].initials;

    this.lives = 3;
    this.bonusLifeInterval = BONUS_LIFE_INTERVAL;
    this.nextBonusScore = this.bonusLifeInterval;

    // Initial web (Level 1: Circle Tube)
    this.web = createLevelWeb(this.level);
    this.player = new Player(this.web);
    this.enemies = new EnemyManager(this.web);

    this.stateTimer = 0;
    this.totalTime = 0;
    this.warpZ = 1.0;
    this.nextWeb = null;
    this.superzapperNoticeTimer = 0;

    // High Score Initials Entry State
    this.initialsState = null;

    this.credits = 0;
    this.hiWave = 9; // Highest level unlocked for Rate Yourself (Atari ALWELG.MAC: HIWAVE)

    // Game paused state
    this.isPaused = false;

    // Rate Yourself Startup Skill Selection State
    this.rateYourselfState = {
      selectedIndex: 0,
      windowStart: 0,
      timer: 10.0,
      debounceTimer: 0,
      tiers: RATE_YOURSELF_TIERS
    };

    // Immediate input handlers for zero-millisecond hardware reaction
    this.bufferedFireOnSpawn = false;

    this.input.onImmediateStep = (delta) => {
      if (this.isPaused) return;
      const canMove = (this.state === GameState.PLAYING || 
                      (this.state === GameState.LEVEL_WARP && this.stateTimer < 2.4));
      if (canMove && this.player.isAlive) {
        this.player.move(delta, this.audio);
      } else if (this.state === GameState.ENTER_INITIALS) {
        this._cycleInitialLetter(delta > 0 ? 1 : -1);
      }
    };

    this.input.onImmediateFire = () => {
      if (this.isPaused) return;
      const canFire = (this.state === GameState.PLAYING || 
                      (this.state === GameState.LEVEL_WARP && this.stateTimer < 2.4));
      if (canFire && this.player.isAlive) {
        if (this.state === GameState.PLAYING) {
          this.enemies.checkImmediateShotHit(this.player.lane, this.audio, (pts) => this.addScore(pts));
        }
        this.player.fire(this.audio);
      } else if (this.state === GameState.PLAYER_DYING) {
        // Player drumming fire while respawning: buffer to fire immediately on spawn!
        this.bufferedFireOnSpawn = true;
      } else if (this.state === GameState.GAME_OVER) {
        // If player presses fire during GAME OVER (after 0.5s death debounce), finish game over immediately
        if (this.stateTimer <= 2.7) {
          this._finishGameOver();
        }
      } else if (this.state === GameState.ATTRACT || this.state === GameState.HIGH_SCORES) {
        this.showRateYourself();
      } else if (this.state === GameState.RATE_YOURSELF) {
        if (this.rateYourselfState && this.rateYourselfState.debounceTimer <= 0) {
          this._commitRateYourself();
        }
      } else if (this.state === GameState.ENTER_INITIALS) {
        this._commitInitialLetter();
      }
    };

    this.input.onImmediateAim = (screenX, screenY) => {
      if (this.isPaused) return;
      const canAim = (this.state === GameState.PLAYING || 
                     (this.state === GameState.LEVEL_WARP && this.stateTimer < 2.4));
      if (canAim && this.player.isAlive && !this.input.isLocked) {
        const targetLane = this.renderer.getLaneAtScreenPos(screenX, screenY, this.web);
        if (targetLane !== null && targetLane !== undefined) {
          this.player.setLane(targetLane, this.audio);
        }
      }
    };

    this.input.onMouseMove = (screenX, screenY) => {
      if (this.isPaused) return;
      if (this.state === GameState.RATE_YOURSELF) {
        const tierIdx = this.getRateYourselfTierAtPos(screenX, screenY);
        if (tierIdx !== -1) {
          if (this.rateYourselfState.selectedIndex !== tierIdx) {
            this.rateYourselfState.selectedIndex = tierIdx;
            if (this.audio && this.audio.playLetterCycle) {
              this.audio.playLetterCycle();
            }
          }
          if (this.renderer && this.renderer.canvas) {
            this.renderer.canvas.style.cursor = 'pointer';
          }
        } else {
          if (this.renderer && this.renderer.canvas) {
            this.renderer.canvas.style.cursor = 'default';
          }
        }
      }
    };

    this.input.onMouseDown = (e) => {
      if (this.isPaused) return false;
      if (this.state === GameState.RATE_YOURSELF) {
        if (e.button === 0) {
          const tierIdx = this.getRateYourselfTierAtPos(e.clientX, e.clientY);
          if (tierIdx !== -1) {
            this.rateYourselfState.selectedIndex = tierIdx;
          }
          this._commitRateYourself();
          return true;
        }
      }
      return false;
    };

    // Keyboard input hook for typing initials directly or navigating Rate Yourself
    this.input.onKeyDown = (e) => {
      if (this.isPaused) return;
      if (this.state === GameState.RATE_YOURSELF) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this._stepRateYourself(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this._stepRateYourself(1);
        } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Digit1') {
          if (this.rateYourselfState && this.rateYourselfState.debounceTimer <= 0) {
            this._commitRateYourself();
          }
        }
      } else if (this.state === GameState.GAME_OVER) {
        if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'Digit1') && this.stateTimer <= 2.7) {
          this._finishGameOver();
        }
      } else if (this.state === GameState.ATTRACT || this.state === GameState.HIGH_SCORES) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Digit1') {
          this.showRateYourself();
        }
      } else if (this.state === GameState.ENTER_INITIALS && this.initialsState) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this._cycleInitialLetter(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this._cycleInitialLetter(1);
        } else if (e.code === 'Enter' || e.code === 'Space') {
          this._commitInitialLetter();
        } else if (e.code === 'Backspace') {
          if (this.initialsState.currentIndex > 0) {
            this.initialsState.currentIndex--;
            if (this.audio && this.audio.playLetterCycle) this.audio.playLetterCycle();
          }
        } else if (e.key && e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) {
          this.initialsState.letters[this.initialsState.currentIndex] = e.key.toUpperCase();
          this._commitInitialLetter();
        }
      }
    };

    // Populate sidebar leaderboard
    this._updateSidebarLeaderboard();
  }

  isGameRunning() {
    return this.state === GameState.PLAYING ||
           this.state === GameState.LEVEL_WARP ||
           this.state === GameState.PLAYER_DYING;
  }

  pauseGame() {
    if (!this.isGameRunning() || this.isPaused) return;
    this.isPaused = true;

    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (e) {
        // Ignore
      }
    }

    if (this.input && typeof this.input.resetAccumulators === 'function') {
      this.input.resetAccumulators();
    }

    if (this.audio && typeof this.audio.pause === 'function') {
      this.audio.pause();
    }

    const stage = document.getElementById('game-stage');
    if (stage) stage.classList.add('game-paused');
    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;

    if (this.input && typeof this.input.resetAccumulators === 'function') {
      this.input.resetAccumulators();
    }

    const stage = document.getElementById('game-stage');
    if (stage) stage.classList.remove('game-paused');
    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }

    if (this.audio && typeof this.audio.resume === 'function') {
      this.audio.resume();
    }

    if (this.renderer && this.renderer.canvas) {
      this.renderer.canvas.focus();
    }
  }

  togglePause() {
    if (this.isPaused) {
      this.resumeGame();
    } else if (this.isGameRunning()) {
      this.pauseGame();
    }
  }

  _loadHighScores() {
    if (typeof window !== 'undefined') {
      const urlStr = window.location.href || '';
      const search = window.location.search || '';
      const params = new URLSearchParams(search);
      if (params.has('resetscores') || params.has('resetscore') || /[?&#]resetscores?(?:[=&#]|$)/i.test(urlStr)) {
        try {
          localStorage.removeItem('tempest_highscores');
          localStorage.removeItem('tempest_highscore');
        } catch (e) {
          // Ignore
        }
        console.log('[Tempest] High scores reset via URL parameter (?resetscores).');
        return DEFAULT_HIGH_SCORES.map(entry => ({ ...entry }));
      }
    }

    try {
      const saved = localStorage.getItem('tempest_highscores');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(entry => ({
            score: Number(entry.score) || 0,
            level: Number(entry.level) || 1,
            initials: (entry.initials || 'AAA').slice(0, 3)
          }));
        }
      }
    } catch (e) {
      // Ignore
    }
    return DEFAULT_HIGH_SCORES.map(entry => ({ ...entry }));
  }

  resetHighScores() {
    try {
      localStorage.removeItem('tempest_highscores');
      localStorage.removeItem('tempest_highscore');
    } catch (e) {
      // Ignore
    }
    this.highScores = DEFAULT_HIGH_SCORES.map(entry => ({ ...entry }));
    this.highScore = this.highScores[0].score;
    this.highScoreInitials = this.highScores[0].initials;
    this._updateSidebarLeaderboard();
    console.log('[Tempest] High scores reset to defaults.');
  }

  setBonusLifeInterval(val) {
    this.bonusLifeInterval = val;
    if (val > 0) {
      this.nextBonusScore = (Math.floor(this.score / val) + 1) * val;
    } else {
      this.nextBonusScore = 0;
    }
  }

  _saveHighScores() {
    try {
      localStorage.setItem('tempest_highscores', JSON.stringify(this.highScores));
      localStorage.setItem('tempest_highscore', String(this.highScores[0].score));
    } catch (e) {
      // Ignore
    }
    this._updateSidebarLeaderboard();
  }

  _qualifiesForHighScore(score) {
    if (score <= 0) return false;
    if (this.highScores.length < 8) return true;
    return score > this.highScores[this.highScores.length - 1].score;
  }

  _recordHighScore(initials, score, level) {
    const cleanInitials = (initials || 'AAA').toUpperCase().slice(0, 3).padEnd(3, ' ');
    const entryLevel = Number(level) || 1;
    this.highScores.push({ score, level: entryLevel, initials: cleanInitials });
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 8);
    this.highScore = this.highScores[0].score;
    this.highScoreInitials = this.highScores[0].initials;
    this._saveHighScores();
  }

  _updateSidebarLeaderboard() {
    const el = document.getElementById('high-score-list');
    if (!el) return;
    el.innerHTML = this.highScores.slice(0, 8).map((entry, idx) => {
      const rank = (idx === 0) ? '1ST' : (idx === 1) ? '2ND' : (idx === 2) ? '3RD' : `${idx + 1}TH`;
      const rankClass = (idx < 3) ? ` rank-${idx + 1}` : '';
      return `
        <div class="leaderboard-row${rankClass}">
          <span class="leaderboard-rank">${rank}</span>
          <span class="leaderboard-initials">${entry.initials}</span>
          <span class="leaderboard-level">LVL ${entry.level || 1}</span>
          <span class="leaderboard-score">${String(entry.score).padStart(6, '0')}</span>
        </div>
      `;
    }).join('');
  }

  _cycleInitialLetter(dir) {
    if (!this.initialsState) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789';
    const cur = this.initialsState.letters[this.initialsState.currentIndex] || 'A';
    let idx = chars.indexOf(cur);
    if (idx === -1) idx = 0;
    idx = (idx + dir + chars.length) % chars.length;
    this.initialsState.letters[this.initialsState.currentIndex] = chars[idx];
    if (this.audio && this.audio.playLetterCycle) {
      this.audio.playLetterCycle();
    }
  }

  _commitInitialLetter() {
    if (!this.initialsState) return;
    if (this.audio && this.audio.playLetterCommit) {
      this.audio.playLetterCommit();
    }
    this.initialsState.currentIndex++;
    if (this.initialsState.currentIndex >= 3) {
      const initials = this.initialsState.letters.join('');
      this._recordHighScore(initials, this.initialsState.score, this.initialsState.level);
      this.state = GameState.HIGH_SCORES;
      this.stateTimer = 5.0; // Display high score table for 5s then return to attract
      if (this.audio && this.audio.playHighScoreFanfare) {
        this.audio.playHighScoreFanfare();
      }
    }
  }

  updateHiWave(level) {
    if (level > this.hiWave) {
      this.hiWave = level;
    }
  }

  resetHiWaveIfNoCredits() {
    if (this.credits === 0) {
      this.hiWave = 9;
    }
  }

  showRateYourself() {
    if (this.isPaused) {
      this.resumeGame();
    }
    this.state = GameState.RATE_YOURSELF;

    // Filter tiers up to highest odd level unlocked by hiWave (minimum 9)
    const maxUnlocked = Math.max(9, (this.hiWave % 2 === 1) ? this.hiWave : (this.hiWave - 1));
    const tiers = ALL_RATE_YOURSELF_TIERS
      .filter(t => t.level <= maxUnlocked)
      .map(t => ({
        level: t.level,
        wellId: getTierWellId(t.level),
        bonus: t.bonus,
        label: (t.level === 1 ? 'NOVICE' : (t.level === maxUnlocked ? 'EXPERT' : ''))
      }));

    this.rateYourselfState = {
      tiers,
      selectedIndex: 0,
      windowStart: 0,
      timer: 10.0,
      debounceTimer: 0.75 // Debounce window matching Atari ALWELG.MAC CPY I,8
    };

    if (this.input && this.input.lastMouseX && this.input.lastMouseY) {
      const tierIdx = this.getRateYourselfTierAtPos(this.input.lastMouseX, this.input.lastMouseY);
      if (tierIdx !== -1) {
        this.rateYourselfState.selectedIndex = tierIdx;
        this._updateRateYourselfWindow();
      }
    }
    if (this.renderer && this.renderer.canvas) {
      this.renderer.canvas.style.cursor = 'default';
    }
    if (this.audio) this.audio.resume();
  }

  getRateYourselfTierAtPos(screenX, screenY) {
    if (this.state !== GameState.RATE_YOURSELF || !this.renderer) return -1;
    const canvas = this.renderer.canvas;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return -1;
    const canvasX = (screenX - rect.left) * (canvas.width / rect.width);
    const canvasY = (screenY - rect.top) * (canvas.height / rect.height);

    const cx = this.renderer.viewport.centerX;
    const cy = this.renderer.viewport.centerY;
    const colSpacing = 68;
    const numVisible = Math.min(5, this.rateYourselfState.tiers.length);
    const startX = cx - ((numVisible - 1) * colSpacing) * 0.5 + 24;

    // Generous vertical bounding area: from above NOVICE/EXPERT to below BONUS
    if (canvasY < cy - 45 || canvasY > cy + 165) {
      return -1;
    }

    // Horizontal bounds check across the 5 visible columns
    const minX = startX - colSpacing * 0.5;
    const maxX = startX + (numVisible - 1) * colSpacing + colSpacing * 0.5;
    if (canvasX < minX - 10 || canvasX > maxX + 10) {
      return -1;
    }

    const visibleIdx = Math.round((canvasX - startX) / colSpacing);
    if (visibleIdx < 0 || visibleIdx >= numVisible) return -1;
    const ws = this.rateYourselfState.windowStart || 0;
    const targetIdx = ws + visibleIdx;
    return Math.max(0, Math.min(this.rateYourselfState.tiers.length - 1, targetIdx));
  }

  _stepRateYourself(dir) {
    const prev = this.rateYourselfState.selectedIndex;
    const maxIdx = this.rateYourselfState.tiers.length - 1;
    this.rateYourselfState.selectedIndex = Math.max(0, Math.min(maxIdx, prev + dir));
    this._updateRateYourselfWindow();
    if (this.rateYourselfState.selectedIndex !== prev && this.audio && this.audio.playLetterCycle) {
      this.audio.playLetterCycle();
    }
  }

  _updateRateYourselfWindow() {
    const idx = this.rateYourselfState.selectedIndex;
    let ws = this.rateYourselfState.windowStart || 0;
    if (idx < ws) {
      ws = idx;
    } else if (idx >= ws + 5) {
      ws = idx - 4;
    }
    const maxWs = Math.max(0, this.rateYourselfState.tiers.length - 5);
    this.rateYourselfState.windowStart = Math.max(0, Math.min(maxWs, ws));
  }

  _commitRateYourself() {
    if (this.renderer && this.renderer.canvas) {
      this.renderer.canvas.style.cursor = '';
    }
    const tier = this.rateYourselfState.tiers[this.rateYourselfState.selectedIndex];
    this.startNewGame(tier.level, tier.bonus);
  }

  _updateRateYourself(dt) {
    this.rateYourselfState.timer -= dt;
    if (this.rateYourselfState.debounceTimer > 0) {
      this.rateYourselfState.debounceTimer -= dt;
    }

    const delta = this.input.consumeLaneDelta();
    if (delta !== 0) {
      this._stepRateYourself(delta > 0 ? 1 : -1);
    }

    // Require debounceTimer <= 0 before allowing fire confirmation
    if ((this.rateYourselfState.debounceTimer <= 0 && this.input.consumeFire()) || this.rateYourselfState.timer <= 0) {
      this._commitRateYourself();
    }
  }

  startNewGame(startingLevel = 1, startingBonus = 0) {
    if (this.isPaused) {
      this.resumeGame();
    }
    if (this.renderer && this.renderer.canvas) {
      this.renderer.canvas.style.cursor = '';
    }
    this.score = startingBonus;
    this.lives = 3;
    if (this.bonusLifeInterval > 0) {
      if (startingBonus > 0) {
        const earnedBonusLives = Math.floor(startingBonus / this.bonusLifeInterval);
        this.lives = Math.min(6, this.lives + earnedBonusLives);
        this.nextBonusScore = (earnedBonusLives + 1) * this.bonusLifeInterval;
      } else {
        this.nextBonusScore = this.bonusLifeInterval;
      }
    } else {
      this.nextBonusScore = 0;
    }
    this.level = startingLevel;
    this.updateHiWave(startingLevel);
    this.web = createLevelWeb(this.level);
    this.player.resetForLevel(this.web);
    this.enemies.resetForLevel(this.web, this.level);
    this.state = GameState.PLAYING;
    this.stateTimer = 0;
    this.superzapperNoticeTimer = 2.8;

    if (this.audio && this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
    this.audio.resume();
    this.audio.startPulsation();
  }

  addScore(pts) {
    this.score += pts;
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }

    // Award extra claw when reaching configured score thresholds (up to 6 reserve claws max)
    if (this.bonusLifeInterval > 0 && this.nextBonusScore > 0) {
      while (this.score >= this.nextBonusScore) {
        if (this.lives < 6) {
          this.lives++;
        }
        if (this.audio && this.audio.playExtraLife) {
          this.audio.playExtraLife();
        }
        this.nextBonusScore += this.bonusLifeInterval;
      }
    }
  }

  update(dt) {
    this.totalTime += dt;
    this.input.update(dt);

    switch (this.state) {
      case GameState.ATTRACT:
        this._updateAttract(dt);
        break;
      case GameState.RATE_YOURSELF:
        this._updateRateYourself(dt);
        break;
      case GameState.PLAYING:
        this._updatePlaying(dt);
        break;
      case GameState.LEVEL_WARP:
        this._updateLevelWarp(dt);
        break;
      case GameState.PLAYER_DYING:
        this._updatePlayerDying(dt);
        break;
      case GameState.GAME_OVER:
        this._updateGameOver(dt);
        break;
      case GameState.ENTER_INITIALS:
        this._updateEnterInitials(dt);
        break;
      case GameState.HIGH_SCORES:
        this._updateHighScores(dt);
        break;
    }
  }

  _updateAttract(dt) {
    // Animate demo particles or attract sequence
    this.enemies.update(dt, this.player, null, null);
  }

  _updatePlaying(dt) {
    // 1. Process any unconsumed delta movement (rotary spinner, wheel, or repeat)
    const deltaLane = this.input.consumeLaneDelta();
    if (deltaLane !== 0) {
      this.player.move(deltaLane, this.audio);
    }

    // 2. Primary fire (supports single shots and automatic weapon bursts)
    if (this.bufferedFireOnSpawn && this.player.isAlive) {
      this.bufferedFireOnSpawn = false;
      this.enemies.checkImmediateShotHit(this.player.lane, this.audio, (pts) => this.addScore(pts));
      this.player.fire(this.audio);
    } else if (this.input.keys.fire || this.input.consumeFire()) {
      if (this.player.timeSinceLastShot >= this.player.fireCooldown) {
        this.enemies.checkImmediateShotHit(this.player.lane, this.audio, (pts) => this.addScore(pts));
        this.player.fire(this.audio);
      }
    }

    // Update Superzapper Notice Timer
    if (this.superzapperNoticeTimer > 0) {
      this.superzapperNoticeTimer -= dt;
    }

    // 3. Superzapper
    if (this.input.consumeSuperzapper()) {
      const pts = this.player.useSuperzapper(this.audio, this.enemies);
      if (pts > 0) this.addScore(pts);
    }

    // 4. Update player entity
    this.player.update(dt);

    // Player death check
    if (!this.player.isAlive) {
      this.state = GameState.PLAYER_DYING;
      this.stateTimer = 1.6;
      this.audio.stopPulsation();
      if (this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      return;
    }

    // 5. Update enemies & collisions
    this.enemies.update(dt, this.player, this.audio, (pts) => this.addScore(pts));

    // Wave cleared check
    if (this.enemies.isWaveCleared()) {
      this.triggerLevelWarp();
    }
  }

  /**
   * Triggers the authentic 2-phase Level Transition:
   * Phase 1: Tube dive down into current tube; green spikes persist and can kill claw; shots chip spikes
   * Phase 2: Hyperspace light trail lines; next level shape starts tiny in center and grows to full size
   */
  triggerLevelWarp() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.LEVEL_WARP;
      this.stateTimer = 0;
      this.warpZ = 1.0;
      this.nextWeb = createLevelWeb(this.level + 1);
      this.addScore(1000);
      this.audio.stopPulsation();
      if (this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      this.audio.playLevelWarp();
    }
  }

  _updateLevelWarp(dt) {
    this.stateTimer += dt;
    const diveDuration = 1.9;
    const totalWarpDuration = 4.8;

    // Phase 1 (0.0s - 1.9s): Player dives down into the current tube
    if (this.stateTimer < diveDuration) {
      this.warpZ = Math.max(0.0, 1.0 - (this.stateTimer / diveDuration));
      this.player.z = this.warpZ;

      // 1. Player can steer during warp dive!
      const deltaLane = this.input.consumeLaneDelta();
      if (deltaLane !== 0) {
        this.player.move(deltaLane, this.audio);
      }

      // 2. Player can shoot during warp dive to break down spikes!
      if (this.input.keys.fire || this.input.consumeFire()) {
        if (this.player.timeSinceLastShot >= this.player.fireCooldown) {
          this.player.fire(this.audio);
        }
      }

      // 3. Update player entity (shot movement & fire cooldowns)
      this.player.update(dt);

      // 4. Update shots and check collisions against green spikes (with swept collision)
      for (let i = this.player.shots.length - 1; i >= 0; i--) {
        const shot = this.player.shots[i];
        if (!shot.active) continue;

        const spikeZ = this.enemies.spikes.get(shot.lane);
        if (spikeZ !== undefined && spikeZ !== null) {
          const prevZ = shot.prevZ !== undefined ? shot.prevZ : shot.z;
          const hitSpike = (shot.z <= spikeZ) || (prevZ >= spikeZ && shot.z <= spikeZ + 0.05);
          if (hitSpike) {
            shot.active = false;
            const newZ = spikeZ - 0.09;
            const pt = this.web.getLaneCenter(shot.lane, Math.max(0.0, spikeZ));
            this.enemies.createExplosion(pt, '#ffffff', 1, shot.lane, Math.max(0.0, spikeZ));
            if (this.audio) this.audio.playSpikeChip();

            if (newZ <= 0.08 || spikeZ <= 0.10) {
              this.enemies.spikes.delete(shot.lane);
              this.addScore(10);
            } else {
              this.enemies.spikes.set(shot.lane, newZ);
            }
          }
        }
      }

      // 5. Check collision between Player Claw and Spike in player's current lane!
      const curSpikeZ = this.enemies.spikes.get(this.player.lane);
      if (!this.godMode && curSpikeZ !== undefined && this.player.z <= curSpikeZ + 0.03) {
        // CLAW HITS SPIKE AND IS KILLED!
        this.player.kill(this.audio, this.enemies, this.web);
        this.state = GameState.PLAYER_DYING;
        this.stateTimer = 1.6;
        this.audio.stopPulsation();
        if (this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
        return;
      }
    } else {
      // Phase 2 (2.4s - 5.2s): In transit, next level emerges & grows
      this.warpZ = 0.0;
      this.player.z = 0.0;
    }

    // Update particles (e.g. from chipped spikes) during warp transit
    this.enemies.updateParticlesOnly(dt);

    // Transition complete: lock into next level
    if (this.stateTimer >= totalWarpDuration) {
      this.level++;
      this.updateHiWave(this.level);
      this.web = this.nextWeb || createLevelWeb(this.level);
      this.nextWeb = null;
      this.player.resetForLevel(this.web);
      this.enemies.resetForLevel(this.web, this.level);
      this.state = GameState.PLAYING;
      this.superzapperNoticeTimer = 2.8; // Remind player: SUPERZAPPER RECHARGE
      this.audio.playSlam();
      this.audio.startPulsation();
    }
  }

  _updatePlayerDying(dt) {
    this.stateTimer -= dt;
    this.player.update(dt);
    // Authentic arcade: enemies freeze in place during death explosion, no congregating!
    this.enemies.updateParticlesOnly(dt);

    if (this.stateTimer <= 0) {
      this.lives--;
      if (this.lives > 0) {
        // Clear any accumulated pending inputs so player doesn't unintentionally move
        this.input.consumeLaneDelta();
        // Authentic Atari INEWLI: Find safest cleared lane and reset enemies down the tube
        const safeLane = this.enemies.findSafeSpawnLane(this.web);
        this.player.resetForLevel(this.web, safeLane);
        this.enemies.resetForNewLife(this.web, safeLane);
        this.state = GameState.PLAYING;
        this.audio.startPulsation();
      } else {
        this.state = GameState.GAME_OVER;
        this.stateTimer = 3.2;
        if (this.audio && this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      }
    }
  }

  _finishGameOver() {
    if (this._qualifiesForHighScore(this.score)) {
      this.state = GameState.ENTER_INITIALS;
      this.stateTimer = 0;
      this.initialsState = {
        letters: ['A', 'A', 'A'],
        currentIndex: 0,
        score: this.score,
        level: this.level
      };
      if (this.audio && this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      if (this.audio && this.audio.playHighScoreFanfare) {
        this.audio.playHighScoreFanfare();
      }
    } else {
      this.state = GameState.ATTRACT;
      this.resetHiWaveIfNoCredits();
      if (this.audio && this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      const overlay = document.getElementById('ui-overlay');
      if (overlay) overlay.classList.remove('hidden');
    }
  }

  _updateGameOver(dt) {
    this.stateTimer -= dt;
    this.enemies.update(dt, this.player, null, null);
    if (this.stateTimer <= 0) {
      this._finishGameOver();
    }
  }

  _updateEnterInitials(dt) {
    this.stateTimer += dt;
    // 60-second arcade timeout
    if (this.stateTimer >= 60) {
      const initials = (this.initialsState ? this.initialsState.letters.join('') : 'AAA');
      this._recordHighScore(
        initials,
        this.initialsState ? this.initialsState.score : this.score,
        this.initialsState ? this.initialsState.level : this.level
      );
      this.state = GameState.HIGH_SCORES;
      this.stateTimer = 5.0;
    }
  }

  _updateHighScores(dt) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = GameState.ATTRACT;
      this.resetHiWaveIfNoCredits();
      if (this.audio && this.audio.stopPulsarHum) this.audio.stopPulsarHum(true);
      const overlay = document.getElementById('ui-overlay');
      if (overlay) overlay.classList.remove('hidden');
    }
  }

  render() {
    this.renderer.clear();

    if (this.state === GameState.ATTRACT) {
      // Authentic Arcade Attract Cycle: Alternate between 3D Rainbow Tempest Logo (8s) and High Scores Table (8s)
      const cycleTime = Math.floor(this.totalTime / 8.0) % 2;
      if (cycleTime === 0) {
        this.renderer.renderTempestRainbowLogo(this.totalTime);
      } else {
        this.renderer.renderHighScoresTable(this.highScores, this.totalTime);
      }
      return;
    }

    if (this.state === GameState.HIGH_SCORES) {
      this.renderer.renderHighScoresTable(this.highScores, this.totalTime);
      return;
    }

    if (this.state === GameState.RATE_YOURSELF) {
      this.renderer.renderRateYourself(this.rateYourselfState);
      return;
    }

    if (this.state === GameState.ENTER_INITIALS && this.initialsState) {
      this.renderer.renderEnterInitials(this.initialsState, this.totalTime);
      return;
    }

    // --- Playing / Warp / Dying / Game Over Rendering ---

    if (this.state === GameState.LEVEL_WARP) {
      // Authentic Two-Phase Level Transition: Seamless Tube Dive -> Next Level Growth
      this.renderer.renderLevelTransition(
        this.web,
        this.nextWeb,
        this.stateTimer,
        this.player,
        this.level + 1,
        this.enemies
      );
    } else {
      // 1. Render Parametric Web
      const activeLane = (this.state === GameState.PLAYING) ? this.player.lane : -1;
      this.renderer.renderWeb(this.web, activeLane, null, this.enemies ? this.enemies.pulsars : null);

      // 2. Render Spikes
      this.renderer.renderSpikes(this.enemies, this.web);

      // 3. Render Abyss Fly Dots buzzing around the faraway hole!
      this.renderer.renderAbyssFlies(this.enemies.abyssFlies, this.web);

      // 4. Render Spikers, Flippers, Tankers, Pulsars & Fuseballs
      this.renderer.renderSpikers(this.enemies.spikers, this.web);
      this.renderer.renderFlippers(this.enemies.flippers, this.web);
      if (this.renderer.renderTankers) {
        this.renderer.renderTankers(this.enemies.tankers, this.web);
      }
      if (this.renderer.renderPulsars) {
        this.renderer.renderPulsars(this.enemies.pulsars, this.web);
      }
      if (this.renderer.renderFuseballs) {
        this.renderer.renderFuseballs(this.enemies.fuseballs, this.web);
      }

      // 5. Render Enemy Bullets
      this.renderer.renderBullets(this.enemies.enemyBullets, this.web);

      // 6. Render Player Shots
      this.renderer.renderShots(this.player, this.web);

      // 7. Render Player Blaster
      if (this.state === GameState.PLAYING) {
        this.renderer.renderBlaster(this.player, this.web);
      }
    }

    // 7. Render Particles
    this.renderer.renderParticles(this.enemies.particles);

    // 8. Superzapper Lightning Effect
    if (this.player.superzapperActive) {
      this.renderer.renderSuperzapper(this.player.superzapperTimer / 0.9);
    }

    // 9. Authentic Vector HUD (with High Score Initials & Skill Level under score)
    const isWarpDeepSpace = (this.state === GameState.LEVEL_WARP && this.stateTimer >= 1.9);
    const currentHudLevel = isWarpDeepSpace ? this.level + 1 : this.level;

    this.renderer.renderHUD(
      this.score,
      this.highScore,
      this.highScoreInitials,
      currentHudLevel,
      this.lives,
      this.player.superzapperCharges,
      isWarpDeepSpace
    );

    // 10. SUPERZAPPER RECHARGE Announcement Banner
    if (this.state === GameState.PLAYING && this.superzapperNoticeTimer > 0) {
      const alpha = Math.min(1.0, this.superzapperNoticeTimer * 1.5);
      const pulse = 0.8 + Math.sin(this.totalTime * 12) * 0.2;
      this.renderer.ctx.save();
      this.renderer.ctx.globalAlpha = alpha * pulse;
      this.renderer.drawVectorText(
        'SUPERZAPPER RECHARGE',
        this.renderer.viewport.centerX,
        this.renderer.viewport.y + 54,
        13,
        '#00ffff',
        'center'
      );
      this.renderer.ctx.restore();
    }

    // 11. State Overlays
    if (this.state === GameState.GAME_OVER) {
      this.renderer.drawVectorText(
        'GAME OVER',
        this.renderer.viewport.centerX,
        this.renderer.viewport.centerY,
        22,
        '#ff2233',
        'center'
      );
    }

    // 12. Visual Vanishing Point Diagnostic Overlay (toggled via 'V' or ?debug=1)
    if (this.renderer.renderDebugOverlay) {
      this.renderer.renderDebugOverlay(this.web, this.level);
    }
  }

  nudgeVisualCenter(dx, dy) {
    if (!this.web) return;
    if (!this.web.visualCenter) this.web.visualCenter = { x: 0, y: 0 };
    this.web.visualCenter.x = parseFloat((this.web.visualCenter.x + dx).toFixed(1));
    this.web.visualCenter.y = parseFloat((this.web.visualCenter.y + dy).toFixed(1));
    WELL_VISUAL_CENTER_OVERRIDES[this.web.id] = { ...this.web.visualCenter };
    console.log(`[VP OVERRIDE] Level ${this.level} (${this.web.name}, Well ${this.web.id}):`, 
      `WELL_VISUAL_CENTER_OVERRIDES[${this.web.id}] = { x: ${this.web.visualCenter.x.toFixed(1)}, y: ${this.web.visualCenter.y.toFixed(1)} };`);
  }

  resetVisualCenter() {
    if (!this.web) return;
    delete WELL_VISUAL_CENTER_OVERRIDES[this.web.id];
    const defaultWeb = createLevelWeb(this.level);
    this.web.visualCenter = { ...defaultWeb.visualCenter };
    console.log(`[VP RESET] Level ${this.level} (${this.web.name}) reset to default:`, this.web.visualCenter);
  }

  printVisualCenterConfig() {
    if (!this.web) return;
    const vc = this.web.visualCenter || { x: 0, y: 0 };
    const code = `WELL_VISUAL_CENTER_OVERRIDES[${this.web.id}] = { x: ${vc.x.toFixed(1)}, y: ${vc.y.toFixed(1)} }; // ${this.web.name}`;
    console.log(`%c${code}`, 'color: #00ff88; font-weight: bold; font-size: 13px;');
    try {
      navigator.clipboard.writeText(code);
      console.log('(Copied to clipboard!)');
    } catch (e) {
      // Ignore
    }
  }
}
