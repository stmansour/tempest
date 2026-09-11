/**
 * input.js - Arcade Rotary Spinner, Keyboard & Precision Mouse Controller Engine
 * 
 * Features:
 * - Three distinct keyboard steering profiles:
 *   - PRECISION (Default): 340ms initial hold delay + calm 160ms repeat (~6.2 lanes/sec).
 *     Quick, normal, and firm taps NEVER repeat. When held, moves steadily without runaway overshooting.
 *   - TAP ONLY: Zero auto-repeat. 1 tap = exactly 1 lane. Physically impossible to overshoot.
 *   - FAST: 220ms delay + 90ms repeat for fast spinning.
 * - Direct Mouse Radial Aiming:
 *   Moving mouse cursor over screen translates directly to the nearest tube lane.
 *   Point right at an enemy to instantly target them with zero overshoot.
 * - Two-Finger Trackpad / Mouse Wheel Rotary Emulation:
 *   Smoothly steps lanes per scroll notch.
 * - Palm Rejection:
 *   Suppresses trackpad drift while keyboard arrow keys are being pressed.
 * - Pointer Lock Spinner Mode:
 *   Full 360° unbounded rotary knob emulation with calibrated sensitivity.
 */

export class InputManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.isLocked = false;

    // Control mode: 'precision', 'tap-only', 'fast'
    this.controlMode = 'precision';
    this.allowRepeat = true;

    // Spinner accumulator & sensitivity
    this.mouseAccumulator = 0;
    this.spinnerSensitivity = 58;

    // Trackpad / Wheel accumulator
    this.wheelAccumulator = 0;
    this.wheelThreshold = 35;

    // Direct mouse aiming coordinates
    this.mouseAimPos = null;
    this.lastKeyboardTime = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Keyboard state
    this.keys = {
      left: false,
      right: false,
      fire: false,
      superzapper: false
    };

    // Event queue
    this.pendingLaneDelta = 0;
    this.firePressed = false;
    this.superzapperPressed = false;

    // Keyboard repeat settings (defaults to PRECISION)
    this.keyRepeatTimer = 0;
    this.keyRepeatDelay = 280; // 280ms initial hold threshold
    this.keyRepeatRate = 120;  // 120ms per lane (~8.3 lanes/sec, steady and controllable)

    this._bindEvents();
  }

  setControlMode(mode) {
    this.controlMode = mode;
    switch (mode) {
      case 'precision':
        this.keyRepeatDelay = 280;
        this.keyRepeatRate = 120;
        this.allowRepeat = true;
        break;
      case 'tap-only':
        this.allowRepeat = false;
        break;
      case 'fast':
        this.keyRepeatDelay = 180;
        this.keyRepeatRate = 75;
        this.allowRepeat = true;
        break;
    }
  }

  _bindEvents() {
    // Pointer Lock change
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) {
        this.onLockChange(this.isLocked);
      }
    });

    document.addEventListener('pointerlockerror', (err) => {
      // Quiet fallback if pointer lock is cancelled or unrequested
    });

    // Mouse movement: supports both Pointer Lock rotary spinner and Direct Aiming
    window.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        // Rotary Spinner Mode
        let deltaX = e.movementX || 0;
        deltaX = Math.max(-120, Math.min(120, deltaX));
        this.mouseAccumulator += deltaX;

        const threshold = this.spinnerSensitivity;
        while (this.mouseAccumulator >= threshold) {
          this.pendingLaneDelta += 1;
          this.mouseAccumulator -= threshold;
        }
        while (this.mouseAccumulator <= -threshold) {
          this.pendingLaneDelta -= 1;
          this.mouseAccumulator += threshold;
        }
      } else {
        // 1. Strict Palm Rejection: Ignore mouse/trackpad events for 1.2s after any keystroke!
        if (performance.now() - this.lastKeyboardTime < 1200) {
          return;
        }

        // 2. Ignore trackpad tremor (requires at least 8px deliberate movement)
        const dist = Math.hypot(e.clientX - this.lastMouseX, e.clientY - this.lastMouseY);
        if (dist < 8) return;

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.mouseAimPos = { x: e.clientX, y: e.clientY };

        if (this.onImmediateAim) {
          this.onImmediateAim(e.clientX, e.clientY);
        }
      }
    });

    // Trackpad Two-Finger Scroll / Mouse Wheel
    window.addEventListener('wheel', (e) => {
      // Allow scrolling inside sidebar panel if cursor is over sidebar
      if (e.target.closest('#arcade-sidebar')) return;

      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
      this.wheelAccumulator += delta;

      while (this.wheelAccumulator >= this.wheelThreshold) {
        this.pendingLaneDelta -= 1;
        this.wheelAccumulator -= this.wheelThreshold;
      }
      while (this.wheelAccumulator <= -this.wheelThreshold) {
        this.pendingLaneDelta += 1;
        this.wheelAccumulator += this.wheelThreshold;
      }
    }, { passive: false });

    // Mouse buttons
    window.addEventListener('mousedown', (e) => {
      if (e.target !== this.canvas && !this.isLocked) return;

      if (e.button === 0) {
        this.keys.fire = true;
        this.firePressed = true;
      } else if (e.button === 2) {
        this.keys.superzapper = true;
        this.superzapperPressed = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.keys.fire = false;
      if (e.button === 2) this.keys.superzapper = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.isLocked || e.target === this.canvas) {
        e.preventDefault();
      }
    });

    // Keyboard events: prioritized instantaneous reaction with zero-overshoot repeat
    window.addEventListener('keydown', (e) => {
      if (this.onKeyDown) {
        this.onKeyDown(e);
      }

      // Prevent browser default actions (page scrolling, focus switching) for game keys
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyZ', 'Digit1', 'Enter', 'Backspace'].includes(e.code)) {
        e.preventDefault();
      }

      if (e.repeat) return; // Prevent erratic OS repeat rates

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.lastKeyboardTime = performance.now();
          this.mouseAimPos = null; // Keyboard takes immediate precedence
          this.keys.left = true;
          this.keyRepeatTimer = performance.now() + this.keyRepeatDelay;
          if (this.onImmediateStep) {
            this.onImmediateStep(1);
          } else {
            this.pendingLaneDelta += 1;
          }
          break;

        case 'ArrowRight':
        case 'KeyD':
          this.lastKeyboardTime = performance.now();
          this.mouseAimPos = null; // Keyboard takes immediate precedence
          this.keys.right = true;
          this.keyRepeatTimer = performance.now() + this.keyRepeatDelay;
          if (this.onImmediateStep) {
            this.onImmediateStep(-1);
          } else {
            this.pendingLaneDelta -= 1;
          }
          break;

        case 'Space':
          this.keys.fire = true;
          if (this.onImmediateFire) {
            this.onImmediateFire();
          } else {
            this.firePressed = true;
          }
          break;

        case 'KeyZ':
          this.keys.superzapper = true;
          this.superzapperPressed = true;
          break;

        case 'Escape':
          if (this.isLocked) {
            document.exitPointerLock();
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.keys.left = false;
          e.preventDefault();
          break;

        case 'ArrowRight':
        case 'KeyD':
          this.keys.right = false;
          e.preventDefault();
          break;

        case 'Space':
          this.keys.fire = false;
          e.preventDefault();
          break;

        case 'KeyZ':
          this.keys.superzapper = false;
          e.preventDefault();
          break;
      }
    });
  }

  requestLock() {
    try {
      this.canvas.requestPointerLock();
    } catch (err) {
      console.warn('requestPointerLock error:', err);
    }
  }

  update(dt) {
    if (!this.allowRepeat) return;

    const now = performance.now();

    // Controlled, smooth auto-repeat only after initial hold delay
    if (this.keys.left && !this.keys.right) {
      if (now >= this.keyRepeatTimer) {
        if (this.onImmediateStep) {
          this.onImmediateStep(1);
        } else {
          this.pendingLaneDelta += 1;
        }
        this.keyRepeatTimer = now + this.keyRepeatRate;
      }
    } else if (this.keys.right && !this.keys.left) {
      if (now >= this.keyRepeatTimer) {
        if (this.onImmediateStep) {
          this.onImmediateStep(-1);
        } else {
          this.pendingLaneDelta -= 1;
        }
        this.keyRepeatTimer = now + this.keyRepeatRate;
      }
    }
  }

  consumeLaneDelta() {
    const delta = this.pendingLaneDelta;
    this.pendingLaneDelta = 0;
    return delta;
  }

  consumeFire() {
    const fired = this.firePressed;
    this.firePressed = false;
    return fired;
  }

  consumeSuperzapper() {
    const zap = this.superzapperPressed;
    this.superzapperPressed = false;
    return zap;
  }
}
