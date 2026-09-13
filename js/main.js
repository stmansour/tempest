/**
 * main.js - Application Entry Point & Game Loop Coordinator
 */

import { VectorRenderer } from './renderer.js?v=warp_stage3_unified';
import { AudioManager } from './audio.js?v=warp_stage3_unified';
import { InputManager } from './input.js?v=warp_stage3_unified';
import { Game, GameState } from './game.js?v=warp_stage3_unified';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const coinButton = document.getElementById('coin-button');
  const creditsVal = document.getElementById('credits-val');
  const startButton = document.getElementById('start-button');
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

  // Display active Bonus Claw score milestone in UI
  const bonusPtsStr = (game.bonusLifeInterval > 0)
    ? game.bonusLifeInterval.toLocaleString()
    : 'NO';
  const sidebarBonusEl = document.getElementById('sidebar-bonus-pts');
  const drawerBonusEl = document.getElementById('drawer-bonus-pts');
  const drawerBonusSubEl = document.getElementById('drawer-bonus-subtext-pts');
  if (sidebarBonusEl) sidebarBonusEl.textContent = bonusPtsStr;
  if (drawerBonusEl) drawerBonusEl.textContent = bonusPtsStr;
  if (drawerBonusSubEl) drawerBonusSubEl.textContent = bonusPtsStr;

  // URL parameter parsing:
  // ?level=N (jump to level), ?debug=1 or ?vp=1 (vanishing point overlay), ?god=1 (invulnerability), ?warp=1 (trigger warp immediately)
  const urlParams = new URLSearchParams(window.location.search);
  const startLevelParam = parseInt(urlParams.get('level'), 10);
  if (urlParams.get('debug') === '1' || urlParams.get('vp') === '1') {
    renderer.showDebugOverlay = true;
  }
  if (urlParams.get('god') === '1') {
    game.godMode = true;
  }

  if (!isNaN(startLevelParam) && startLevelParam >= 1) {
    game.startNewGame(startLevelParam, 0);
    if (urlParams.get('warp') === '1') {
      setTimeout(() => game.triggerLevelWarp(), 200);
    }
  } else if (urlParams.get('warp') === '1') {
    game.startNewGame(1, 0);
    setTimeout(() => game.triggerLevelWarp(), 200);
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


  // Coin insertion button
  if (coinButton) {
    coinButton.addEventListener('click', () => {
      unlockAudio();
      coinButton.blur();
      canvas.focus();
      audio.playCoinDrop();
      credits++;
      game.credits = credits;
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
      if (game.state === GameState.ATTRACT || game.state === GameState.GAME_OVER || game.state === GameState.HIGH_SCORES) {
        if (credits > 0) {
          credits--;
          game.credits = credits;
          if (creditsVal) {
            creditsVal.textContent = String(credits).padStart(2, '0');
          }
        }
        game.showRateYourself();
      } else if (game.state === GameState.RATE_YOURSELF) {
        if (game.rateYourselfState && game.rateYourselfState.debounceTimer <= 0) {
          game._commitRateYourself();
        }
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

  // Slide-out Arcade Guide Drawer Controllers
  const guideToggleBtn = document.getElementById('guide-toggle-btn');
  const guideDrawer = document.getElementById('arcade-guide-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');

  function openGuideDrawer() {
    if (guideDrawer && drawerBackdrop) {
      guideDrawer.classList.add('open');
      drawerBackdrop.classList.add('active');
      game._updateSidebarLeaderboard();
    }
  }

  function closeGuideDrawer() {
    if (guideDrawer && drawerBackdrop) {
      guideDrawer.classList.remove('open');
      drawerBackdrop.classList.remove('active');
      canvas.focus();
    }
  }

  function toggleGuideDrawer() {
    if (guideDrawer && guideDrawer.classList.contains('open')) {
      closeGuideDrawer();
    } else {
      openGuideDrawer();
    }
  }

  if (guideToggleBtn) {
    guideToggleBtn.addEventListener('click', () => {
      unlockAudio();
      guideToggleBtn.blur();
      toggleGuideDrawer();
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', () => {
      unlockAudio();
      closeGuideDrawer();
    });
  }

  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', () => {
      closeGuideDrawer();
    });
  }


  // Clicking canvas directly starts game or selects in Rate Yourself
  canvas.addEventListener('click', (e) => {
    unlockAudio();
    canvas.focus();
    if (game.state === GameState.ATTRACT || game.state === GameState.GAME_OVER || game.state === GameState.HIGH_SCORES) {
      if (credits > 0) {
        credits--;
        game.credits = credits;
        if (creditsVal) {
          creditsVal.textContent = String(credits).padStart(2, '0');
        }
      }
      game.showRateYourself();
    } else if (game.state === GameState.RATE_YOURSELF) {
      const tierIdx = game.getRateYourselfTierAtPos(e.clientX, e.clientY);
      if (tierIdx !== -1) {
        game.rateYourselfState.selectedIndex = tierIdx;
        game._updateRateYourselfWindow();
      }
      if (game.rateYourselfState && game.rateYourselfState.debounceTimer <= 0) {
        game._commitRateYourself();
      }
    }
  });

  // Keyboard interactions across game states
  window.addEventListener('keydown', (e) => {
    // Arcade Guide Drawer toggle (Tab / Escape / H)
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleGuideDrawer();
      return;
    }
    if (e.code === 'Escape') {
      if (guideDrawer && guideDrawer.classList.contains('open')) {
        e.preventDefault();
        closeGuideDrawer();
        return;
      }
    }
    if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && game.state !== GameState.NAME_ENTRY) {
      e.preventDefault();
      toggleGuideDrawer();
      return;
    }

    // Diagnostic Vanishing Point overlay toggle ('V' or 'D')
    if (e.code === 'KeyV' || (e.ctrlKey && e.code === 'KeyD')) {
      e.preventDefault();
      renderer.toggleDebugOverlay();
      return;
    }

    // Live Visual Vanishing Point nudging controls when overlay is active
    if (renderer.showDebugOverlay) {
      if (e.code === 'KeyI') {
        e.preventDefault();
        game.nudgeVisualCenter(0, -1.0);
        return;
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        game.nudgeVisualCenter(0, 1.0);
        return;
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        game.nudgeVisualCenter(-1.0, 0);
        return;
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        game.nudgeVisualCenter(1.0, 0);
        return;
      } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        game.resetVisualCenter();
        return;
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        game.printVisualCenterConfig();
        return;
      }
    }

    if (game.state === GameState.ATTRACT || game.state === GameState.GAME_OVER || game.state === GameState.HIGH_SCORES) {
      if (['Space', 'Enter', 'Digit1', 'KeyC', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        unlockAudio();
        if (e.code === 'KeyC') {
          audio.playCoinDrop();
          credits++;
          game.credits = credits;
          if (creditsVal) creditsVal.textContent = String(credits).padStart(2, '0');
          return;
        }
        if (credits > 0) {
          credits--;
          game.credits = credits;
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
