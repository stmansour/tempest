/**
 * main.js - Application Entry Point & Game Loop Coordinator
 */

import { VectorRenderer } from './renderer.js';
import { AudioManager } from './audio.js';
import { InputManager } from './input.js';
import { Game, GameState } from './game.js';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const coinButton = document.getElementById('coin-button');
  const creditsVal = document.getElementById('credits-val');
  const startButton = document.getElementById('start-button');
  const lockButton = document.getElementById('lock-button');
  const lockStatusText = document.getElementById('lock-status-text');
  const fireButton = document.getElementById('fire-button');
  const zapButton = document.getElementById('zap-button');
  const warpButton = document.getElementById('warp-button');

  let credits = 1;

  const sidebar = document.getElementById('arcade-sidebar');
  if (sidebar) {
    sidebar.scrollTop = 0;
  }
  window.addEventListener('load', () => {
    if (sidebar) sidebar.scrollTop = 0;
  });

  // Initialize Subsystems
  const renderer = new VectorRenderer(canvas);
  const audio = new AudioManager();
  const input = new InputManager(canvas);
  const game = new Game(renderer, audio, input);
  window.game = game;

  // URL parameter to optionally jump directly to a level (e.g. ?level=8)
  const urlParams = new URLSearchParams(window.location.search);
  const startLevelParam = parseInt(urlParams.get('level'), 10);
  if (!isNaN(startLevelParam) && startLevelParam >= 1) {
    game.startNewGame(startLevelParam, 0);
  }

  // Global Audio Unlock Listener (resumes AudioContext on interaction)
  function unlockAudio() {
    audio.init();
    audio.resume();
  }
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });

  // Responsive Viewport Resize handling: scales stage to full height without arbitrary margins
  function handleResize() {
    const stage = canvas.parentElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
  }

  window.addEventListener('resize', handleResize);
  // Initial resize after styles have loaded
  requestAnimationFrame(handleResize);
  setTimeout(handleResize, 100);

  // Pointer Lock change listener
  input.onLockChange = (isLocked) => {
    if (lockStatusText && lockButton) {
      if (isLocked) {
        lockStatusText.textContent = 'SPINNER: LOCKED';
        lockButton.classList.add('locked');
      } else {
        lockStatusText.textContent = 'SPINNER: UNLOCKED';
        lockButton.classList.remove('locked');
      }
    }
  };

  // Coin insertion button
  if (coinButton) {
    coinButton.addEventListener('click', () => {
      unlockAudio();
      coinButton.blur();
      canvas.focus();
      audio.playCoinDrop();
      credits++;
      if (creditsVal) {
        creditsVal.textContent = String(credits).padStart(2, '0');
      }
    });
  }

  // Start game on button click
  if (startButton) {
    startButton.addEventListener('click', () => {
      unlockAudio();
      startButton.blur();
      canvas.focus();
      if (game.state === GameState.ATTRACT) {
        if (credits > 0) {
          credits--;
          if (creditsVal) {
            creditsVal.textContent = String(credits).padStart(2, '0');
          }
        }
        game.showRateYourself();
      } else if (game.state === GameState.RATE_YOURSELF) {
        game._commitRateYourself();
      } else {
        game.startNewGame();
      }
    });
  }

  // Spinner lock toggle button (explicit opt-in)
  if (lockButton) {
    lockButton.addEventListener('click', () => {
      unlockAudio();
      lockButton.blur();
      canvas.focus();
      if (input.isLocked) {
        document.exitPointerLock();
      } else {
        input.requestLock();
      }
    });
  }

  // On-screen tactical Fire button
  if (fireButton) {
    fireButton.addEventListener('click', () => {
      unlockAudio();
      fireButton.blur();
      canvas.focus();
      if (game.state === GameState.PLAYING && game.player.isAlive) {
        game.player.fire(audio);
      }
    });
  }

  // On-screen tactical Super Zapper button
  if (zapButton) {
    zapButton.addEventListener('click', () => {
      unlockAudio();
      zapButton.blur();
      canvas.focus();
      if (game.state === GameState.PLAYING && game.player.isAlive) {
        const pts = game.player.useSuperzapper(audio, game.enemies);
        if (pts > 0) game.addScore(pts);
      }
    });
  }

  // On-screen tactical Warp Level button
  if (warpButton) {
    warpButton.addEventListener('click', () => {
      unlockAudio();
      warpButton.blur();
      canvas.focus();
      if (game.state === GameState.PLAYING && game.player.isAlive) {
        game.triggerLevelWarp();
      }
    });
  }

  // Steering Mode & Calibration Buttons
  const modePrecisionBtn = document.getElementById('mode-precision');
  const modeTapBtn = document.getElementById('mode-tap');
  const modeFastBtn = document.getElementById('mode-fast');

  function updateModeButtons(activeBtn) {
    [modePrecisionBtn, modeTapBtn, modeFastBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  }

  if (modePrecisionBtn) {
    modePrecisionBtn.addEventListener('click', () => {
      unlockAudio();
      modePrecisionBtn.blur();
      canvas.focus();
      input.setControlMode('precision');
      updateModeButtons(modePrecisionBtn);
    });
  }

  if (modeTapBtn) {
    modeTapBtn.addEventListener('click', () => {
      unlockAudio();
      modeTapBtn.blur();
      canvas.focus();
      input.setControlMode('tap-only');
      updateModeButtons(modeTapBtn);
    });
  }

  if (modeFastBtn) {
    modeFastBtn.addEventListener('click', () => {
      unlockAudio();
      modeFastBtn.blur();
      canvas.focus();
      input.setControlMode('fast');
      updateModeButtons(modeFastBtn);
    });
  }

  // Clicking canvas directly starts game or selects in Rate Yourself
  canvas.addEventListener('click', (e) => {
    unlockAudio();
    canvas.focus();
    if (game.state === GameState.ATTRACT) {
      if (credits > 0) {
        credits--;
        if (creditsVal) {
          creditsVal.textContent = String(credits).padStart(2, '0');
        }
      }
      game.showRateYourself();
    } else if (game.state === GameState.RATE_YOURSELF) {
      const rect = canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const cx = renderer.viewport.centerX;
      const tiers = game.rateYourselfState.tiers;
      const colSpacing = 68;
      const startX = cx - ((tiers.length - 1) * colSpacing) * 0.5 + 24;
      let clickedTier = -1;
      for (let i = 0; i < tiers.length; i++) {
        const colX = startX + i * colSpacing;
        if (Math.abs(clickX - colX) < colSpacing * 0.5) {
          clickedTier = i;
          break;
        }
      }
      if (clickedTier !== -1) {
        if (game.rateYourselfState.selectedIndex === clickedTier) {
          game._commitRateYourself();
        } else {
          game.rateYourselfState.selectedIndex = clickedTier;
          if (audio && audio.playLetterCycle) audio.playLetterCycle();
        }
      } else {
        game._commitRateYourself();
      }
    }
  });

  // Start game or insert coin with keyboard in Attract mode
  window.addEventListener('keydown', (e) => {
    if (game.state === GameState.ATTRACT) {
      if (['Space', 'Enter', 'Digit1', 'KeyC', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        unlockAudio();
        if (e.code === 'KeyC') {
          audio.playCoinDrop();
          credits++;
          if (creditsVal) creditsVal.textContent = String(credits).padStart(2, '0');
          return;
        }
        if (credits > 0) {
          credits--;
          if (creditsVal) creditsVal.textContent = String(credits).padStart(2, '0');
        }
        game.showRateYourself();
        canvas.focus();
      }
    } else if (game.state === GameState.RATE_YOURSELF) {
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space', 'Enter', 'Digit1'].includes(e.code)) {
        e.preventDefault();
      }
    } else if (game.state === GameState.PLAYING && game.player.isAlive) {
      if (e.code === 'KeyW' || e.code === 'KeyN') {
        unlockAudio();
        game.triggerLevelWarp();
      }
    }
  });

  // Game Loop
  let lastTime = performance.now();

  function loop(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.06); // Cap delta time
    lastTime = currentTime;

    // Update & Render
    game.update(dt);
    game.render();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
