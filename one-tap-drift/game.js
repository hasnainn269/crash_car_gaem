/**
 * One-Tap Drift - Complete Arcade Browser Game
 * Pure HTML5 Canvas 2D + Web Audio API + LocalStorage
 */

(function () {
  'use strict';

  // --- CAR CATALOG ---
  const CAR_CATALOG = [
    {
      id: 'car-cyan',
      name: 'Cobalt Apex',
      color: '#00d2ff',
      secondaryColor: '#0077b6',
      roofColor: '#162638',
      accentColor: '#ffffff',
      price: 0,
      description: 'Balanced agile starter sports car with crisp handling.',
      speedRating: 3,
      driftRating: 4,
    },
    {
      id: 'car-orange',
      name: 'Flame GT',
      color: '#ff6b35',
      secondaryColor: '#d64515',
      roofColor: '#2b1b17',
      accentColor: '#ffd166',
      price: 45,
      description: 'High-torque drift racer built for sharp corners.',
      speedRating: 4,
      driftRating: 5,
    },
    {
      id: 'car-red',
      name: 'Crimson Fury',
      color: '#ef233c',
      secondaryColor: '#b01026',
      roofColor: '#2b1418',
      accentColor: '#ffffff',
      price: 90,
      description: 'Aggressive track monster with instant drift response.',
      speedRating: 5,
      driftRating: 4,
    },
    {
      id: 'car-gold',
      name: 'Midas Velocity',
      color: '#ffc300',
      secondaryColor: '#cc9a00',
      roofColor: '#262010',
      accentColor: '#fff5cc',
      price: 160,
      description: 'Ultra-luxurious golden hypercar for drifting legends.',
      speedRating: 5,
      driftRating: 5,
    },
  ];

  // --- TIMING CONFIG ---
  const TIMING = {
    radarDistance: 680, // pixels ahead when turn telegraph appears
    approachStart: 500, // drift meter starts filling
    apexSweetSpot: 0,   // car distance to apex
    earlyLimit: 140,    // px before apex: too early
    goodStart: 110,     // px before apex: good start
    perfectStart: 45,   // px before apex: perfect zone
    perfectEnd: -25,    // px after apex: perfect zone
    goodEnd: -75,       // px after apex: good end
    lateDeadline: -115, // px after apex: missed turn! crash!
  };

  // --- STORAGE & SAVE DATA ---
  const STORAGE_KEY = 'one_tap_drift_save_v1';

  function loadSavedData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
          bestDistance: typeof parsed.bestDistance === 'number' ? parsed.bestDistance : 0,
          coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
          unlockedCars: Array.isArray(parsed.unlockedCars) ? parsed.unlockedCars : ['car-cyan'],
          selectedCarId: typeof parsed.selectedCarId === 'string' ? parsed.selectedCarId : 'car-cyan',
          muted: Boolean(parsed.muted),
        };
      }
    } catch (e) {
      console.warn('Failed to load saved progress:', e);
    }
    return {
      bestScore: 0,
      bestDistance: 0,
      coins: 0,
      unlockedCars: ['car-cyan'],
      selectedCarId: 'car-cyan',
      muted: false,
    };
  }

  function saveGameData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }

  let saveData = loadSavedData();

  // --- WEB AUDIO SYNTHESIZER ---
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.muted = saveData.muted;
      this.engineGain = null;
      this.engineOsc = null;
      this.screechGain = null;
      this.screechNoise = null;
    }

    init() {
      if (this.ctx) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.setupContinuousSounds();
      } catch (e) {
        console.warn('Web Audio error:', e);
      }
    }

    setupContinuousSounds() {
      if (!this.ctx) return;
      // Engine hum
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(65, this.ctx.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(220, this.ctx.currentTime);

        gain.gain.setValueAtTime(0, this.ctx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();

        this.engineOsc = osc;
        this.engineGain = gain;

        // Tire screech (bandpassed white noise)
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const screechFilter = this.ctx.createBiquadFilter();
        screechFilter.type = 'bandpass';
        screechFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
        screechFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0, this.ctx.currentTime);

        whiteNoise.connect(screechFilter);
        screechFilter.connect(sGain);
        sGain.connect(this.ctx.destination);
        whiteNoise.start();

        this.screechNoise = whiteNoise;
        this.screechGain = sGain;
      } catch (e) {
        console.warn('Continuous sound init error:', e);
      }
    }

    setEngine(active, speedNorm = 0.5) {
      if (!this.ctx || this.muted || !this.engineGain) return;
      const now = this.ctx.currentTime;
      if (!active) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      } else {
        const targetGain = 0.07;
        const targetFreq = 55 + speedNorm * 80;
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
      }
    }

    setScreech(active) {
      if (!this.ctx || this.muted || !this.screechGain) return;
      const now = this.ctx.currentTime;
      const targetGain = active ? 0.12 : 0;
      this.screechGain.gain.setTargetAtTime(targetGain, now, 0.04);
    }

    toggleMute() {
      this.muted = !this.muted;
      saveData.muted = this.muted;
      saveGameData(saveData);
      if (this.muted && this.ctx) {
        if (this.engineGain) this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
        if (this.screechGain) this.screechGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return this.muted;
    }

    playTone(freq, duration, type = 'sine', volume = 0.15) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {}
    }

    playDriftSuccess(perfect = true) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      if (perfect) {
        this.playTone(523.25, 0.12, 'sine', 0.18); // C5
        setTimeout(() => this.playTone(659.25, 0.22, 'sine', 0.22), 80); // E5
        setTimeout(() => this.playTone(783.99, 0.28, 'triangle', 0.24), 160); // G5
      } else {
        this.playTone(440, 0.12, 'sine', 0.15); // A4
        setTimeout(() => this.playTone(554.37, 0.18, 'sine', 0.18), 70); // C#5
      }
    }

    playCoin() {
      if (this.muted) return;
      this.playTone(880, 0.08, 'sine', 0.18);
      setTimeout(() => this.playTone(1318.51, 0.16, 'sine', 0.2), 60);
    }

    playCrash() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        // Deep thud
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);

        // Noise crunch
        const bufferSize = this.ctx.sampleRate * 0.35;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.09));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.3, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        noise.connect(nGain);
        nGain.connect(this.ctx.destination);
        noise.start(now);
      } catch (e) {}
    }

    playCountdown(count) {
      if (count > 0) {
        this.playTone(392, 0.12, 'square', 0.15); // G4 beep
      } else {
        this.playTone(783.99, 0.35, 'square', 0.22); // G5 high start chime
      }
    }

    playClick() {
      this.playTone(600, 0.04, 'sine', 0.1);
    }
  }

  const audio = new SoundManager();

  // --- GAME APPLICATION CLASS ---
  class Game {
    constructor() {
      this.container = document.getElementById('game-container');
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');

      // Screens and UI refs
      this.screens = {
        menu: document.getElementById('screen-menu'),
        hud: document.getElementById('screen-hud'),
        countdown: document.getElementById('screen-countdown'),
        pause: document.getElementById('modal-pause'),
        gameOver: document.getElementById('modal-game-over'),
        garage: document.getElementById('modal-garage'),
        guide: document.getElementById('modal-guide'),
      };

      // HUD & Feedback elements
      this.hudScore = document.getElementById('hud-score');
      this.hudBest = document.getElementById('hud-best');
      this.hudDistance = document.getElementById('hud-distance');
      this.hudCoins = document.getElementById('hud-coins');
      this.hudCombo = document.getElementById('hud-combo');
      this.comboText = document.getElementById('combo-text');
      this.turnTelegraph = document.getElementById('turn-telegraph-container');
      this.turnArrowText = document.getElementById('turn-arrow-text');
      this.driftNeedle = document.getElementById('drift-needle');
      this.feedbackContainer = document.getElementById('feedback-container');
      this.countdownNumber = document.getElementById('countdown-number');

      // Modals text
      this.menuBestScore = document.getElementById('menu-best-score');
      this.menuCoins = document.getElementById('menu-coins');
      this.overScore = document.getElementById('over-score');
      this.overBest = document.getElementById('over-best');
      this.overDist = document.getElementById('over-dist');
      this.overCoins = document.getElementById('over-coins');
      this.overNewBestFlag = document.getElementById('new-best-flag');
      this.garageCoins = document.getElementById('garage-coins-val');
      this.garageCards = document.getElementById('garage-cards');
      this.muteToggles = document.querySelectorAll('.mute-toggle-btn');

      // State machine
      this.state = 'title'; // 'title' | 'countdown' | 'playing' | 'paused' | 'gameover'
      this.dpr = 1;
      this.width = 0;
      this.height = 0;

      // Gameplay simulation variables
      this.speed = 280; // px/sec
      this.baseSpeed = 280;
      this.maxSpeed = 540;
      this.distance = 0; // total px forward along road
      this.score = 0;
      this.coinsCollected = 0;
      this.combo = 0;
      this.perfectCount = 0;
      this.goodCount = 0;

      // Car state
      this.car = {
        x: 0,
        y: 0,
        angle: 0,        // world radians
        driftAngle: 0,   // extra slip rotation
        steerAngle: 0,   // front wheel turn
        lateralOffset: 0,// distance from path center
        isDrifting: false,
        driftDir: 0,     // -1 (left) or 1 (right)
        driftTimer: 0,
        crashed: false,
        crashSpin: 0,
        crashVelX: 0,
        crashVelY: 0,
      };

      // Camera
      this.camera = {
        x: 0,
        y: 0,
        angle: 0,
        trauma: 0,
      };

      // Road system
      this.roadWidth = 140;
      this.pathPoints = [];      // fine sampled centerline: { x, y, angle, dist }
      this.roadSegments = [];    // generator spline nodes
      this.turnEvents = [];      // drift milestones
      this.coins = [];           // track coins
      this.particles = [];       // smoke, sparks, coin pickup
      this.skidMarks = [];       // tire rubber marks on track
      this.sceneryProps = [];    // roadside trees, cones, signs

      // Loop & timing
      this.lastTime = 0;
      this.countdownValue = 3;
      this.countdownTimer = 0;

      // Input tracking
      this.inputBuffer = false;
      this.isTouch = false;

      this.initEvents();
      this.resize();
      this.updateStorageUI();
      this.renderGarageCards();

      // Check ?autostart=1 support for verification and headless test harnesses
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('autostart') === '1') {
        this.startRun(true);
      } else {
        this.initDemoTrack();
      }

      // Start animation loop
      requestAnimationFrame((t) => this.loop(t));
    }

    // --- EVENT LISTENERS ---
    initEvents() {
      window.addEventListener('resize', () => this.resize());

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          this.handleActionInput();
        } else if (e.code === 'KeyP' || e.code === 'Escape') {
          e.preventDefault();
          if (this.state === 'playing') {
            this.pauseGame();
          } else if (this.state === 'paused') {
            this.resumeGame();
          }
        }
      });

      // Pointer / Click Controls on Game Container
      this.container.addEventListener('pointerdown', (e) => {
        // If clicking a button or modal card, let button handler deal with it
        if (e.target.closest('button') || e.target.closest('.modal-card')) {
          return;
        }
        audio.init();
        this.handleActionInput();
      });

      // UI Buttons wiring
      document.getElementById('btn-play').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.startRun(false);
      });

      document.getElementById('btn-garage').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.openGarage();
      });

      document.getElementById('btn-guide').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.openGuide();
      });

      document.getElementById('btn-close-guide').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.closeGuide();
      });

      document.getElementById('btn-close-garage').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.closeGarage();
      });

      document.getElementById('btn-pause').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.pauseGame();
      });

      document.getElementById('btn-resume').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.resumeGame();
      });

      document.getElementById('btn-restart').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.startRun(true);
      });

      document.getElementById('btn-menu-from-pause').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.returnToMenu();
      });

      document.getElementById('btn-retry').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.startRun(true);
      });

      document.getElementById('btn-menu-from-over').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.returnToMenu();
      });

      document.getElementById('btn-garage-from-over').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.screens.gameOver.classList.add('hidden');
        this.openGarage();
      });

      // Mute toggles
      this.muteToggles.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const muted = audio.toggleMute();
          this.updateMuteButtons(muted);
        });
      });
      this.updateMuteButtons(audio.muted);
    }

    updateMuteButtons(muted) {
      this.muteToggles.forEach((btn) => {
        btn.innerHTML = muted
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
        btn.title = muted ? 'Unmute Sound' : 'Mute Sound';
      });
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.ctx.resetTransform?.();
      this.ctx.scale(this.dpr, this.dpr);

      // Adapt road width on mobile screens
      this.roadWidth = this.width < 500 ? 115 : 140;
    }

    setGameState(newState) {
      this.state = newState;
      document.body.dataset.state = newState;

      // Screen visibility sync
      this.screens.menu.classList.toggle('hidden', newState !== 'title');
      this.screens.hud.classList.toggle('hidden', newState !== 'playing' && newState !== 'countdown');
      this.screens.countdown.classList.toggle('hidden', newState !== 'countdown');
      this.screens.pause.classList.toggle('hidden', newState !== 'paused');
      this.screens.gameOver.classList.toggle('hidden', newState !== 'gameover');
      this.screens.garage.classList.toggle('hidden', newState !== 'garage');
    }

    updateStorageUI() {
      this.menuBestScore.textContent = saveData.bestScore.toLocaleString();
      this.menuCoins.textContent = saveData.coins.toLocaleString();
      this.hudBest.textContent = saveData.bestScore.toLocaleString();
      this.hudCoins.textContent = saveData.coins.toLocaleString();
      this.garageCoins.textContent = saveData.coins.toLocaleString();
    }

    // --- CAR SELECTION & GARAGE ---
    renderGarageCards() {
      this.garageCards.innerHTML = '';
      CAR_CATALOG.forEach((car) => {
        const isUnlocked = saveData.unlockedCars.includes(car.id);
        const isSelected = saveData.selectedCarId === car.id;

        const card = document.createElement('div');
        card.className = `car-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          <canvas class="car-preview-canvas" width="130" height="85" id="preview-${car.id}"></canvas>
          <div class="car-name">${car.name}</div>
          <div class="car-desc">${car.description}</div>
          <div class="car-specs">
            <div class="car-spec-row">
              <span>SPEED</span>
              <div class="spec-pips">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) => `<div class="spec-pip ${n <= car.speedRating ? 'active' : ''}"></div>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="car-spec-row">
              <span>DRIFT</span>
              <div class="spec-pips">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) => `<div class="spec-pip ${n <= car.driftRating ? 'active' : ''}"></div>`
                  )
                  .join('')}
              </div>
            </div>
          </div>
          <button class="btn car-action-btn ${isSelected ? 'btn-secondary' : isUnlocked ? 'btn-primary' : 'btn-accent'}" id="btn-car-${car.id}">
            ${isSelected ? 'SELECTED' : isUnlocked ? 'SELECT' : `UNLOCK (${car.price} 🪙)`}
          </button>
        `;

        this.garageCards.appendChild(card);

        // Render preview canvas
        setTimeout(() => {
          const previewCanvas = document.getElementById(`preview-${car.id}`);
          if (previewCanvas) {
            this.renderCarThumbnail(previewCanvas, car);
          }
        }, 10);

        // Action button
        const actionBtn = card.querySelector(`#btn-car-${car.id}`);
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.playClick();
          this.handleCarCardAction(car);
        });
      });
    }

    renderCarThumbnail(canvas, carConfig) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 4); // angled showcase preview
      this.drawCarBody(ctx, carConfig, 0, false);
      ctx.restore();
    }

    handleCarCardAction(car) {
      const isUnlocked = saveData.unlockedCars.includes(car.id);
      if (isUnlocked) {
        saveData.selectedCarId = car.id;
        saveGameData(saveData);
        this.renderGarageCards();
      } else {
        if (saveData.coins >= car.price) {
          saveData.coins -= car.price;
          saveData.unlockedCars.push(car.id);
          saveData.selectedCarId = car.id;
          saveGameData(saveData);
          this.updateStorageUI();
          this.renderGarageCards();
          audio.playCoin();
        } else {
          // Insufficient funds shake
          const btn = document.getElementById(`btn-car-${car.id}`);
          if (btn) {
            btn.style.transform = 'translateX(-6px)';
            setTimeout(() => (btn.style.transform = 'translateX(6px)'), 60);
            setTimeout(() => (btn.style.transform = 'none'), 120);
          }
        }
      }
    }

    openGarage() {
      this.screens.garage.classList.remove('hidden');
      this.renderGarageCards();
    }

    closeGarage() {
      this.screens.garage.classList.add('hidden');
    }

    openGuide() {
      this.screens.guide.classList.remove('hidden');
    }

    closeGuide() {
      this.screens.guide.classList.add('hidden');
    }

    // --- GAMEPLAY INITIALIZATION & RUN RESETS ---
    startRun(skipCountdown = false) {
      audio.init();
      this.score = 0;
      this.distance = 0;
      this.coinsCollected = 0;
      this.combo = 0;
      this.perfectCount = 0;
      this.goodCount = 0;
      this.speed = this.baseSpeed;

      this.car.isDrifting = false;
      this.car.crashed = false;
      this.car.driftAngle = 0;
      this.car.steerAngle = 0;
      this.car.lateralOffset = 0;
      this.car.driftTimer = 0;
      this.car.crashSpin = 0;

      this.particles = [];
      this.skidMarks = [];
      this.coins = [];
      this.camera.trauma = 0;

      // Build initial track
      this.buildTrack();

      // Position car at start
      if (this.pathPoints.length > 0) {
        const p0 = this.pathPoints[0];
        this.car.x = p0.x;
        this.car.y = p0.y;
        this.car.angle = p0.angle;
        this.camera.x = p0.x;
        this.camera.y = p0.y;
        this.camera.angle = p0.angle;
      }

      this.updateHUD();
      this.turnTelegraph.style.opacity = '0';

      if (skipCountdown) {
        this.setGameState('playing');
        audio.setEngine(true, 0.4);
      } else {
        this.countdownValue = 3;
        this.countdownTimer = 0;
        this.setGameState('countdown');
        this.countdownNumber.textContent = '3';
        audio.playCountdown(3);
      }
    }

    pauseGame() {
      if (this.state !== 'playing') return;
      this.setGameState('paused');
      audio.setEngine(false);
      audio.setScreech(false);
    }

    resumeGame() {
      if (this.state !== 'paused') return;
      this.setGameState('playing');
      audio.setEngine(true, (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed));
    }

    returnToMenu() {
      this.setGameState('title');
      audio.setEngine(false);
      audio.setScreech(false);
      this.updateStorageUI();
      this.initDemoTrack();
    }

    // --- PROCEDURAL ENDLESS ROAD GENERATION ---
    initDemoTrack() {
      // Background idle demo track for title screen
      this.distance = 0;
      this.buildTrack(true);
      if (this.pathPoints.length > 0) {
        const p = this.pathPoints[0];
        this.car.x = p.x;
        this.car.y = p.y;
        this.car.angle = p.angle;
        this.camera.x = p.x;
        this.camera.y = p.y;
      }
    }

    buildTrack(isDemo = false) {
      this.pathPoints = [];
      this.roadSegments = [];
      this.turnEvents = [];
      this.coins = [];
      this.sceneryProps = [];

      let curX = 0;
      let curY = 0;
      let curAngle = -Math.PI / 2; // Driving upwards initially

      // Initial straight runway (1000px)
      this.roadSegments.push({
        x: curX,
        y: curY,
        angle: curAngle,
        isTurn: false,
      });

      curX += Math.cos(curAngle) * 900;
      curY += Math.sin(curAngle) * 900;

      this.roadSegments.push({
        x: curX,
        y: curY,
        angle: curAngle,
        isTurn: false,
      });

      // Generate 25 rich road segments ahead
      for (let i = 0; i < 25; i++) {
        const segment = this.createNextSegment(curX, curY, curAngle, i);
        this.roadSegments.push(segment);
        curX = segment.x;
        curY = segment.y;
        curAngle = segment.angle;
      }

      this.sampleCenterline();
    }

    createNextSegment(lastX, lastY, lastAngle, index) {
      // Alternate between left and right turns with straights and chicanes
      const turnDir = (index % 2 === 0 ? 1 : -1) * (Math.random() > 0.15 ? 1 : -1);
      // Turn severity between 50 to 90 degrees
      const turnAngleRad = (Math.PI / 180) * (55 + Math.random() * 35) * turnDir;
      const arcRadius = 260 + Math.random() * 120;
      const straightLead = 280 + Math.random() * 160;

      const newAngle = lastAngle + turnAngleRad;
      const forwardDist = straightLead + arcRadius;

      // Approximate bezier curve endpoint
      const endX = lastX + Math.cos(lastAngle) * straightLead + Math.cos(newAngle) * arcRadius;
      const endY = lastY + Math.sin(lastAngle) * straightLead + Math.sin(newAngle) * arcRadius;

      return {
        x: endX,
        y: endY,
        angle: newAngle,
        isTurn: true,
        turnDir: turnDir > 0 ? 1 : -1, // 1: Right, -1: Left
        turnAngleRad: turnAngleRad,
        radius: arcRadius,
      };
    }

    sampleCenterline() {
      // Interpolate smooth path through all road segments
      this.pathPoints = [];
      this.turnEvents = [];
      let accumulatedDistance = 0;

      for (let i = 0; i < this.roadSegments.length - 1; i++) {
        const p0 = this.roadSegments[Math.max(0, i - 1)];
        const p1 = this.roadSegments[i];
        const p2 = this.roadSegments[i + 1];
        const p3 = this.roadSegments[Math.min(this.roadSegments.length - 1, i + 2)];

        const steps = 30; // fine sampling resolution
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const x = this.catmullRom(p0.x, p1.x, p2.x, p3.x, t);
          const y = this.catmullRom(p0.y, p1.y, p2.y, p3.y, t);

          // Calculate heading angle
          let angle = p1.angle;
          if (this.pathPoints.length > 0) {
            const prev = this.pathPoints[this.pathPoints.length - 1];
            const dx = x - prev.x;
            const dy = y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            accumulatedDistance += dist;
            angle = Math.atan2(dy, dx);
          }

          this.pathPoints.push({
            x,
            y,
            angle,
            dist: accumulatedDistance,
          });

          // Place roadside scenery props occasionally
          if (Math.random() < 0.12) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const perpX = -Math.sin(angle) * side;
            const perpY = Math.cos(angle) * side;
            const offset = this.roadWidth * 0.75 + 30 + Math.random() * 80;
            this.sceneryProps.push({
              x: x + perpX * offset,
              y: y + perpY * offset,
              type: Math.random() > 0.4 ? 'tree' : 'bush',
              size: 16 + Math.random() * 18,
            });
          }
        }

        // Create a Turn Drift Event for each turn segment
        if (p2.isTurn) {
          const apexIndex = this.pathPoints.length - Math.floor(steps * 0.4);
          if (apexIndex > 0 && apexIndex < this.pathPoints.length) {
            const apexPoint = this.pathPoints[apexIndex];
            this.turnEvents.push({
              apexDist: apexPoint.dist,
              x: apexPoint.x,
              y: apexPoint.y,
              angle: apexPoint.angle,
              turnDir: p2.turnDir,
              completed: false,
              failed: false,
            });

            // Spawn 3-4 golden coins along the curve!
            for (let c = -2; c <= 2; c++) {
              const cIdx = apexIndex + c * 4;
              if (cIdx >= 0 && cIdx < this.pathPoints.length) {
                const pt = this.pathPoints[cIdx];
                // Slightly offset towards apex inside
                const normAngle = pt.angle + (Math.PI / 2) * p2.turnDir;
                const coinOffset = (this.roadWidth * 0.22) * (c === 0 ? 1 : 0.6);
                this.coins.push({
                  x: pt.x + Math.cos(normAngle) * coinOffset,
                  y: pt.y + Math.sin(normAngle) * coinOffset,
                  dist: pt.dist,
                  collected: false,
                  spin: Math.random() * Math.PI,
                });
              }
            }
          }
        }
      }
    }

    catmullRom(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return (
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
      );
    }

    appendRoadAhead() {
      // Keep procedural road extending indefinitely
      const lastSeg = this.roadSegments[this.roadSegments.length - 1];
      const newSeg = this.createNextSegment(
        lastSeg.x,
        lastSeg.y,
        lastSeg.angle,
        this.roadSegments.length
      );
      this.roadSegments.push(newSeg);

      // Re-sample next points
      const i = this.roadSegments.length - 2;
      const p0 = this.roadSegments[Math.max(0, i - 1)];
      const p1 = this.roadSegments[i];
      const p2 = this.roadSegments[i + 1];
      const p3 = this.roadSegments[i + 1];

      let lastAccum = this.pathPoints[this.pathPoints.length - 1].dist;
      const steps = 30;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = this.catmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const y = this.catmullRom(p0.y, p1.y, p2.y, p3.y, t);

        const prev = this.pathPoints[this.pathPoints.length - 1];
        const dx = x - prev.x;
        const dy = y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        lastAccum += dist;
        const angle = Math.atan2(dy, dx);

        this.pathPoints.push({ x, y, angle, dist: lastAccum });

        // Add occasional trees
        if (Math.random() < 0.12) {
          const side = Math.random() > 0.5 ? 1 : -1;
          const perpX = -Math.sin(angle) * side;
          const perpY = Math.cos(angle) * side;
          const offset = this.roadWidth * 0.75 + 30 + Math.random() * 80;
          this.sceneryProps.push({
            x: x + perpX * offset,
            y: y + perpY * offset,
            type: Math.random() > 0.4 ? 'tree' : 'bush',
            size: 16 + Math.random() * 18,
          });
        }
      }

      if (p2.isTurn) {
        const apexIndex = this.pathPoints.length - Math.floor(steps * 0.4);
        const apexPoint = this.pathPoints[apexIndex];
        this.turnEvents.push({
          apexDist: apexPoint.dist,
          x: apexPoint.x,
          y: apexPoint.y,
          angle: apexPoint.angle,
          turnDir: p2.turnDir,
          completed: false,
          failed: false,
        });

        for (let c = -2; c <= 2; c++) {
          const cIdx = apexIndex + c * 4;
          if (cIdx >= 0 && cIdx < this.pathPoints.length) {
            const pt = this.pathPoints[cIdx];
            const normAngle = pt.angle + (Math.PI / 2) * p2.turnDir;
            const coinOffset = (this.roadWidth * 0.22) * (c === 0 ? 1 : 0.6);
            this.coins.push({
              x: pt.x + Math.cos(normAngle) * coinOffset,
              y: pt.y + Math.sin(normAngle) * coinOffset,
              dist: pt.dist,
              collected: false,
              spin: Math.random() * Math.PI,
            });
          }
        }
      }
    }

    // --- GAMEPLAY INPUT HANDLER ---
    handleActionInput() {
      if (this.state === 'title') {
        this.startRun(false);
        return;
      }

      if (this.state === 'gameover') {
        this.startRun(true);
        return;
      }

      if (this.state !== 'playing' || this.car.crashed) {
        return;
      }

      // Check upcoming turn event
      const upcomingEvent = this.turnEvents.find(
        (ev) => !ev.completed && !ev.failed && ev.apexDist > this.distance - 150
      );

      if (!upcomingEvent) {
        this.showDriftFeedback('WAIT!', 'feedback-early');
        return;
      }

      const distDiff = upcomingEvent.apexDist - this.distance;

      // Evaluation zones
      if (distDiff > TIMING.earlyLimit) {
        // Tapped way too early before the bend!
        this.showDriftFeedback('TOO EARLY!', 'feedback-early');
        this.camera.trauma = Math.max(this.camera.trauma, 0.15);
        return;
      }

      // Successful Drift!
      upcomingEvent.completed = true;
      this.car.isDrifting = true;
      this.car.driftDir = upcomingEvent.turnDir;
      this.car.driftTimer = 0.65; // duration of drift slide

      let feedbackClass = 'feedback-good';
      let feedbackText = 'GOOD!';
      let points = 60;
      let bonusCoins = 1;

      if (distDiff >= TIMING.perfectEnd && distDiff <= TIMING.perfectStart) {
        // PERFECT!
        feedbackClass = 'feedback-perfect';
        feedbackText = 'PERFECT!';
        points = 100;
        bonusCoins = 2;
        this.perfectCount++;
        audio.playDriftSuccess(true);
        this.camera.trauma = 0.4;
      } else if (distDiff < TIMING.perfectEnd && distDiff >= TIMING.lateDeadline) {
        // LATE!
        feedbackClass = 'feedback-late';
        feedbackText = 'LATE!';
        points = 30;
        bonusCoins = 0;
        this.goodCount++;
        audio.playDriftSuccess(false);
        this.camera.trauma = 0.25;
      } else {
        // GOOD!
        feedbackClass = 'feedback-good';
        feedbackText = 'GOOD!';
        points = 60;
        bonusCoins = 1;
        this.goodCount++;
        audio.playDriftSuccess(false);
        this.camera.trauma = 0.3;
      }

      // Combo update
      this.combo++;
      const multiplier = Math.min(this.combo, 8);
      const totalPoints = points * multiplier;
      this.score += totalPoints;

      if (bonusCoins > 0) {
        this.coinsCollected += bonusCoins;
        saveData.coins += bonusCoins;
      }

      this.showDriftFeedback(feedbackText, feedbackClass);
      audio.setScreech(true);

      // Tire smoke burst
      this.spawnTireSmokeBurst(this.car.x, this.car.y, 16);
    }

    showDriftFeedback(text, cssClass) {
      this.feedbackContainer.innerHTML = `<div class="drift-feedback ${cssClass}">${text}</div>`;
    }

    // --- GAME LOOP & PHYSICS UPDATE ---
    loop(timestamp) {
      requestAnimationFrame((t) => this.loop(t));

      if (!this.lastTime) {
        this.lastTime = timestamp;
        return;
      }

      // Clamped delta time to prevent tunneling during tab switch
      const rawDt = (timestamp - this.lastTime) / 1000;
      const dt = Math.min(rawDt, 0.05);
      this.lastTime = timestamp;

      // Handle states
      if (this.state === 'countdown') {
        this.updateCountdown(dt);
      } else if (this.state === 'playing') {
        this.updatePlaying(dt);
      } else if (this.state === 'title') {
        this.updateTitleDemo(dt);
      }

      // Update particles
      this.updateParticles(dt);

      // Render world
      this.render();
    }

    updateCountdown(dt) {
      this.countdownTimer += dt;
      if (this.countdownTimer >= 0.85) {
        this.countdownTimer = 0;
        this.countdownValue--;
        if (this.countdownValue > 0) {
          this.countdownNumber.textContent = this.countdownValue.toString();
          audio.playCountdown(this.countdownValue);
        } else if (this.countdownValue === 0) {
          this.countdownNumber.textContent = 'DRIFT!';
          audio.playCountdown(0);
        } else {
          this.setGameState('playing');
          audio.setEngine(true, 0.3);
        }
      }
    }

    updateTitleDemo(dt) {
      // Smooth automatic pan along road for title background
      this.distance += 220 * dt;
      this.findPathPosition(this.distance, this.car);
      this.camera.x = this.car.x;
      this.camera.y = this.car.y;
      this.camera.angle = this.car.angle;

      if (this.distance > this.pathPoints[this.pathPoints.length - 200].dist) {
        this.appendRoadAhead();
      }
    }

    updatePlaying(dt) {
      if (this.car.crashed) {
        // Crash spin physics
        this.car.x += this.car.crashVelX * dt;
        this.car.y += this.car.crashVelY * dt;
        this.car.crashSpin += 14 * dt;
        this.car.crashVelX *= 0.94;
        this.car.crashVelY *= 0.94;

        this.camera.trauma = Math.max(0, this.camera.trauma - dt * 1.5);
        this.camera.x += (this.car.x - this.camera.x) * 0.1;
        this.camera.y += (this.car.y - this.camera.y) * 0.1;
        return;
      }

      // Forward acceleration with distance
      this.speed = Math.min(this.maxSpeed, this.baseSpeed + Math.sqrt(this.distance) * 1.8);
      this.distance += this.speed * dt;
      this.score += Math.round(this.speed * dt * 0.2);

      // Position car along path
      const targetPoint = this.findPathPosition(this.distance, this.car);

      // Check upcoming turn event
      const upcomingEvent = this.turnEvents.find(
        (ev) => !ev.completed && !ev.failed && ev.apexDist > this.distance - 200
      );

      if (upcomingEvent) {
        const distToApex = upcomingEvent.apexDist - this.distance;

        // Show turn telegraph radar when within range
        if (distToApex <= TIMING.radarDistance && distToApex >= TIMING.lateDeadline) {
          this.turnTelegraph.style.opacity = '1';
          const dirSymbol = upcomingEvent.turnDir > 0 ? 'TURN RIGHT ➔' : '⬅ TURN LEFT';
          this.turnArrowText.textContent = dirSymbol;

          // Normalize needle position from approachStart down to lateDeadline
          const progressNorm =
            1 -
            (distToApex - TIMING.lateDeadline) /
              (TIMING.approachStart - TIMING.lateDeadline);
          const needlePercent = Math.max(0, Math.min(100, progressNorm * 100));
          this.driftNeedle.style.left = `${needlePercent}%`;
        } else {
          this.turnTelegraph.style.opacity = '0';
        }

        // Missed turn check!
        if (distToApex < TIMING.lateDeadline && !upcomingEvent.completed) {
          upcomingEvent.failed = true;
          this.triggerCrash();
          return;
        }
      } else {
        this.turnTelegraph.style.opacity = '0';
      }

      // Drifting physics
      if (this.car.isDrifting) {
        this.car.driftTimer -= dt;
        // Lateral slide angle
        const targetDriftAngle = this.car.driftDir * 0.48; // ~28 degrees drift angle
        this.car.driftAngle += (targetDriftAngle - this.car.driftAngle) * 0.18;
        this.car.steerAngle = -this.car.driftDir * 0.45; // Counter-steering front wheels

        // Skid marks behind both rear tires
        this.addSkidMarks();

        // Continuous tire smoke
        if (Math.random() < 0.8) {
          this.spawnTireSmoke(this.car.x, this.car.y);
        }

        if (this.car.driftTimer <= 0) {
          this.car.isDrifting = false;
          audio.setScreech(false);
        }
      } else {
        // Return smoothly to straight alignment
        this.car.driftAngle *= 0.82;
        this.car.steerAngle *= 0.78;
        audio.setScreech(false);
      }

      // Check coin pickups
      this.checkCoinCollisions();

      // Camera follow with slight lookahead
      const lookaheadDist = 120 + (this.speed / this.maxSpeed) * 80;
      const targetCamX = this.car.x + Math.cos(this.car.angle) * lookaheadDist;
      const targetCamY = this.car.y + Math.sin(this.car.angle) * lookaheadDist;

      this.camera.x += (targetCamX - this.camera.x) * 0.15;
      this.camera.y += (targetCamY - this.camera.y) * 0.15;
      this.camera.angle += (this.car.angle - this.camera.angle) * 0.1;

      // Decay camera trauma
      this.camera.trauma = Math.max(0, this.camera.trauma - dt * 1.8);

      // Sound update
      const speedNorm = (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed);
      audio.setEngine(true, speedNorm);

      // Append more road when nearing end of buffer
      if (this.distance > this.pathPoints[this.pathPoints.length - 250].dist) {
        this.appendRoadAhead();
      }

      this.updateHUD();
    }

    findPathPosition(dist, outCar) {
      if (this.pathPoints.length === 0) return null;

      // Binary search for closest point along distance
      let low = 0;
      let high = this.pathPoints.length - 1;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.pathPoints[mid].dist < dist) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const idx = Math.min(this.pathPoints.length - 1, Math.max(0, low));
      const pt = this.pathPoints[idx];

      outCar.x = pt.x;
      outCar.y = pt.y;
      outCar.angle = pt.angle;

      return pt;
    }

    checkCoinCollisions() {
      const carRadius = 26;
      const coinRadius = 16;
      const hitDistSq = (carRadius + coinRadius) * (carRadius + coinRadius);

      for (let i = 0; i < this.coins.length; i++) {
        const coin = this.coins[i];
        if (coin.collected) continue;

        // Proximity check
        const dx = this.car.x - coin.x;
        const dy = this.car.y - coin.y;
        if (dx * dx + dy * dy < hitDistSq) {
          coin.collected = true;
          this.coinsCollected++;
          saveData.coins++;
          this.score += 25;
          audio.playCoin();
          this.spawnCoinSparkles(coin.x, coin.y);
          this.updateHUD();
        }
      }
    }

    triggerCrash() {
      this.car.crashed = true;
      this.combo = 0;
      audio.setEngine(false);
      audio.setScreech(false);
      audio.playCrash();

      // Crash impulse: fly off tangent into the gravel
      this.car.crashVelX = Math.cos(this.car.angle) * this.speed * 1.1;
      this.car.crashVelY = Math.sin(this.car.angle) * this.speed * 1.1;
      this.camera.trauma = 1.0;

      this.showDriftFeedback('CRASH!', 'feedback-crash');
      this.spawnCrashBurst(this.car.x, this.car.y);

      // Transition to game over after short beat
      setTimeout(() => {
        this.showGameOverModal();
      }, 700);
    }

    showGameOverModal() {
      const isNewBest = this.score > saveData.bestScore;
      if (isNewBest) {
        saveData.bestScore = this.score;
      }
      if (Math.round(this.distance / 10) > saveData.bestDistance) {
        saveData.bestDistance = Math.round(this.distance / 10);
      }
      saveGameData(saveData);

      this.overScore.textContent = this.score.toLocaleString();
      this.overBest.textContent = saveData.bestScore.toLocaleString();
      this.overDist.textContent = `${Math.round(this.distance / 10)} m`;
      this.overCoins.textContent = `+${this.coinsCollected}`;
      this.overNewBestFlag.classList.toggle('hidden', !isNewBest);

      this.setGameState('gameover');
    }

    updateHUD() {
      this.hudScore.textContent = this.score.toLocaleString();
      this.hudDistance.textContent = `${Math.round(this.distance / 10)} m`;
      this.hudCoins.textContent = saveData.coins.toLocaleString();

      if (this.combo >= 2) {
        this.hudCombo.classList.remove('hidden');
        this.comboText.textContent = `COMBO x${this.combo} 🔥`;
      } else {
        this.hudCombo.classList.add('hidden');
      }
    }

    // --- SKID MARKS & PARTICLES ---
    addSkidMarks() {
      const cosA = Math.cos(this.car.angle + this.car.driftAngle);
      const sinA = Math.sin(this.car.angle + this.car.driftAngle);
      const perpX = -sinA;
      const perpY = cosA;

      const rearOffset = 18;
      const trackWidth = 14;

      const leftX = this.car.x - cosA * rearOffset - perpX * trackWidth;
      const leftY = this.car.y - sinA * rearOffset - perpY * trackWidth;
      const rightX = this.car.x - cosA * rearOffset + perpX * trackWidth;
      const rightY = this.car.y - sinA * rearOffset + perpY * trackWidth;

      this.skidMarks.push({
        x1: leftX,
        y1: leftY,
        x2: rightX,
        y2: rightY,
        alpha: 0.65,
      });

      // Cap skid marks for smooth performance
      if (this.skidMarks.length > 250) {
        this.skidMarks.shift();
      }
    }

    spawnTireSmoke(x, y) {
      const cosA = Math.cos(this.car.angle + this.car.driftAngle);
      const sinA = Math.sin(this.car.angle + this.car.driftAngle);

      this.particles.push({
        x: x - cosA * 20 + (Math.random() - 0.5) * 12,
        y: y - sinA * 20 + (Math.random() - 0.5) * 12,
        vx: -cosA * 40 + (Math.random() - 0.5) * 30,
        vy: -sinA * 40 + (Math.random() - 0.5) * 30,
        radius: 6 + Math.random() * 8,
        color: 'rgba(230, 235, 245,',
        alpha: 0.55,
        decay: 1.8,
        type: 'smoke',
      });
    }

    spawnTireSmokeBurst(x, y, count = 12) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 20 + Math.random() * 80;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 8 + Math.random() * 12,
          color: 'rgba(240, 245, 255,',
          alpha: 0.7,
          decay: 2.2,
          type: 'smoke',
        });
      }
    }

    spawnCoinSparkles(x, y) {
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 110;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 3 + Math.random() * 4,
          color: 'rgba(255, 209, 102,',
          alpha: 1,
          decay: 2.5,
          type: 'sparkle',
        });
      }
    }

    spawnCrashBurst(x, y) {
      // Sparks, smoke, glass shards
      for (let i = 0; i < 30; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 180;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 2 + Math.random() * 5,
          color: Math.random() > 0.4 ? 'rgba(255, 100, 50,' : 'rgba(255, 220, 100,',
          alpha: 1,
          decay: 2.0,
          type: 'sparkle',
        });
      }
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;
        p.radius += 8 * dt;

        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    // --- RENDERING PIPELINE ---
    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      ctx.clearRect(0, 0, w, h);

      // Camera transformation with screen shake trauma
      ctx.save();
      const shakeAmount = this.camera.trauma * this.camera.trauma * 16;
      const shakeX = (Math.random() - 0.5) * shakeAmount;
      const shakeY = (Math.random() - 0.5) * shakeAmount;

      // Car sits slightly below viewport center for forward road visibility
      const screenCarY = h * 0.65;
      ctx.translate(w / 2 + shakeX, screenCarY + shakeY);
      ctx.rotate(-this.camera.angle - Math.PI / 2);
      ctx.translate(-this.camera.x, -this.camera.y);

      // 1. Render Terrain & Grass background
      this.drawTerrain(ctx);

      // 2. Render Road Canvas (Asphalt, Borders, Rumble Strips, Markings)
      this.drawRoad(ctx);

      // 3. Render Skid Marks
      this.drawSkidMarks(ctx);

      // 4. Render Collectibles (Coins)
      this.drawCoins(ctx);

      // 5. Render Roadside Scenery (Trees, bushes)
      this.drawScenery(ctx);

      // 6. Render Player Car
      const currentCarConfig =
        CAR_CATALOG.find((c) => c.id === saveData.selectedCarId) || CAR_CATALOG[0];

      ctx.save();
      ctx.translate(this.car.x, this.car.y);
      ctx.rotate(this.car.angle + this.car.driftAngle + this.car.crashSpin);
      this.drawCarBody(ctx, currentCarConfig, this.car.steerAngle, this.car.isDrifting);
      ctx.restore();

      // 7. Render Particles
      this.drawParticles(ctx);

      ctx.restore();
    }

    drawTerrain(ctx) {
      // Grass backdrop with subtle grid/lawn stripes
      ctx.fillStyle = '#224a25';
      const boundSize = Math.max(this.width, this.height) * 2;
      ctx.fillRect(
        this.camera.x - boundSize / 2,
        this.camera.y - boundSize / 2,
        boundSize,
        boundSize
      );
    }

    drawRoad(ctx) {
      if (this.pathPoints.length < 2) return;

      const curbWidth = 10;
      const camX = this.camera.x;
      const camY = this.camera.y;
      const viewDistSq = 1300 * 1300;

      // Build continuous smooth path for all visible road points
      const roadPath = new Path2D();
      let started = false;

      for (let i = 0; i < this.pathPoints.length; i++) {
        const pt = this.pathPoints[i];
        const dx = pt.x - camX;
        const dy = pt.y - camY;
        if (dx * dx + dy * dy < viewDistSq) {
          if (!started) {
            roadPath.moveTo(pt.x, pt.y);
            started = true;
          } else {
            roadPath.lineTo(pt.x, pt.y);
          }
        }
      }

      if (!started) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Dark Road Shoulder & Gravel Border
      ctx.strokeStyle = '#0e1217';
      ctx.lineWidth = this.roadWidth + curbWidth * 2 + 14;
      ctx.stroke(roadPath);

      // 2. Continuous Red Curb (Base)
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = this.roadWidth + curbWidth * 2;
      ctx.stroke(roadPath);

      // 3. Alternating White Curb Rumble Strips
      ctx.strokeStyle = '#f1faee';
      ctx.lineWidth = this.roadWidth + curbWidth * 2;
      ctx.setLineDash([16, 16]);
      ctx.stroke(roadPath);
      ctx.setLineDash([]);

      // 4. Dark Charcoal Asphalt Surface
      ctx.strokeStyle = '#1e242b';
      ctx.lineWidth = this.roadWidth;
      ctx.stroke(roadPath);

      // 5. White Dashed Centerline Markings
      ctx.strokeStyle = '#f8f9fa';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([22, 22]);
      ctx.stroke(roadPath);
      ctx.setLineDash([]);

      ctx.restore();
    }

    drawSkidMarks(ctx) {
      if (this.skidMarks.length === 0) return;
      ctx.save();
      ctx.fillStyle = '#0a0d10';
      for (let i = 0; i < this.skidMarks.length; i++) {
        const sm = this.skidMarks[i];
        ctx.globalAlpha = sm.alpha * 0.6;
        ctx.beginPath();
        ctx.arc(sm.x1, sm.y1, 3.5, 0, Math.PI * 2);
        ctx.arc(sm.x2, sm.y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawCoins(ctx) {
      const now = performance.now() * 0.003;
      for (let i = 0; i < this.coins.length; i++) {
        const coin = this.coins[i];
        if (coin.collected) continue;

        ctx.save();
        ctx.translate(coin.x, coin.y);

        // Rotating coin 3D perspective squish
        const scaleX = Math.cos(now + coin.spin);
        ctx.scale(scaleX, 1);

        // Golden Outer Ring
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb703';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fb8500';
        ctx.stroke();

        // Inner Star / Core
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe484';
        ctx.fill();

        ctx.restore();
      }
    }

    drawScenery(ctx) {
      // Roadside trees and bushes
      ctx.save();
      for (let i = 0; i < this.sceneryProps.length; i++) {
        const p = this.sceneryProps[i];
        const dx = p.x - this.camera.x;
        const dy = p.y - this.camera.y;
        if (dx * dx + dy * dy > 1100 * 1100) continue;

        // Drop shadow
        ctx.beginPath();
        ctx.arc(p.x + 4, p.y + 4, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fill();

        // Foliage layers
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.type === 'tree' ? '#1b4332' : '#2d6a4f';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.2, p.y - p.size * 0.2, p.size * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = p.type === 'tree' ? '#2d6a4f' : '#40916c';
        ctx.fill();
      }
      ctx.restore();
    }

    drawCarBody(ctx, car, steerAngle = 0, isDrifting = false) {
      // High-detail 2D Vector Sports Car
      const length = 54;
      const width = 28;

      ctx.save();

      // 1. Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      this.fillRoundedRect(ctx, -length / 2 + 3, -width / 2 + 3, length, width, 8);

      // 2. Wheels (4 rubber tires)
      const wheelLen = 14;
      const wheelWid = 6.5;
      const frontX = 15;
      const rearX = -17;
      const wheelY = width / 2 - 2;

      ctx.fillStyle = '#111418';

      // Rear wheels (fixed straight)
      this.fillRoundedRect(ctx, rearX - wheelLen / 2, -wheelY - wheelWid / 2, wheelLen, wheelWid, 3);
      this.fillRoundedRect(ctx, rearX - wheelLen / 2, wheelY - wheelWid / 2, wheelLen, wheelWid, 3);

      // Front wheels (steerable with drift angle)
      ctx.save();
      ctx.translate(frontX, -wheelY);
      ctx.rotate(steerAngle);
      this.fillRoundedRect(ctx, -wheelLen / 2, -wheelWid / 2, wheelLen, wheelWid, 3);
      ctx.restore();

      ctx.save();
      ctx.translate(frontX, wheelY);
      ctx.rotate(steerAngle);
      this.fillRoundedRect(ctx, -wheelLen / 2, -wheelWid / 2, wheelLen, wheelWid, 3);
      ctx.restore();

      // 3. Main Aerodynamic Car Body
      ctx.fillStyle = car.color;
      this.fillRoundedRect(ctx, -length / 2, -width / 2, length, width, 9);

      // 4. Subtle Body Contour & Racing Stripes
      ctx.fillStyle = car.secondaryColor;
      this.fillRoundedRect(ctx, -length / 2 + 4, -width / 2 + 2, length - 8, 3, 2);
      this.fillRoundedRect(ctx, -length / 2 + 4, width / 2 - 5, length - 8, 3, 2);

      // Front splitter
      ctx.fillStyle = '#111';
      this.fillRoundedRect(ctx, length / 2 - 3, -width / 2 + 4, 3.5, width - 8, 2);

      // Rear spoiler
      ctx.fillStyle = car.secondaryColor;
      this.fillRoundedRect(ctx, -length / 2 - 2, -width / 2 + 3, 4, width - 6, 2);

      // 5. Cabin & Tinted Windows
      const cabinLen = 25;
      const cabinWid = 20;

      // Dark glass
      ctx.fillStyle = '#0f172a';
      this.fillRoundedRect(ctx, -cabinLen / 2 - 2, -cabinWid / 2, cabinLen, cabinWid, 5);

      // Roof panel
      ctx.fillStyle = car.roofColor;
      this.fillRoundedRect(ctx, -cabinLen / 2 - 4, -cabinWid / 2 + 3, cabinLen - 7, cabinWid - 6, 4);

      // Front Windshield Curved Glass Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.moveTo(cabinLen / 2 - 3, -cabinWid / 2 + 3);
      ctx.lineTo(cabinLen / 2 - 7, -cabinWid / 2 + 6);
      ctx.lineTo(cabinLen / 2 - 7, cabinWid / 2 - 6);
      ctx.lineTo(cabinLen / 2 - 3, cabinWid / 2 - 3);
      ctx.closePath();
      ctx.fill();

      // 6. Headlights (Bright Xenon glow casting beam forward)
      ctx.fillStyle = '#ffffff';
      this.fillRoundedRect(ctx, length / 2 - 4, -width / 2 + 3, 4, 6, 2);
      this.fillRoundedRect(ctx, length / 2 - 4, width / 2 - 9, 4, 6, 2);

      // Headlight Beam Cone
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(length / 2, -width / 2 + 6);
      ctx.lineTo(length / 2 + 90, -width / 2 - 30);
      ctx.lineTo(length / 2 + 90, width / 2 + 30);
      ctx.lineTo(length / 2, width / 2 - 6);
      ctx.closePath();
      ctx.fill();

      // 7. Taillights (Red LED)
      ctx.fillStyle = isDrifting ? '#ff1e42' : '#e63946';
      this.fillRoundedRect(ctx, -length / 2 - 1, -width / 2 + 4, 2.5, 5, 1);
      this.fillRoundedRect(ctx, -length / 2 - 1, width / 2 - 9, 2.5, 5, 1);

      if (isDrifting) {
        // Red brake glow during drift
        ctx.fillStyle = 'rgba(255, 30, 66, 0.3)';
        ctx.beginPath();
        ctx.arc(-length / 2 - 4, -width / 2 + 6, 9, 0, Math.PI * 2);
        ctx.arc(-length / 2 - 4, width / 2 - 6, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    fillRoundedRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }

    drawParticles(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.save();
        ctx.fillStyle = `${p.color}${Math.max(0, p.alpha)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Game());
  } else {
    new Game();
  }
})();
