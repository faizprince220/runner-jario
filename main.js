/**
 * main.js - Master Game Controller & Loop for Shadow Quest
 */
window.SQ = window.SQ || {};

window.SQ.Game = class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Virtual internal resolution
    this.virtualWidth = 960;
    this.virtualHeight = 540;

    // Subsystems
    this.input = new window.SQ.Input();
    this.audio = new window.SQ.Audio();
    this.camera = new window.SQ.Camera(this.virtualWidth, this.virtualHeight);
    this.particles = new window.SQ.Particles(700);
    this.renderer = new window.SQ.Renderer(this.canvas);
    this.saveSystem = new window.SQ.SaveSystem();
    this.ui = new window.SQ.UIManager(this);

    // Apply saved settings
    this.audio.setSoundEnabled(this.saveSystem.data.settings.sound);
    this.audio.setMusicEnabled(this.saveSystem.data.settings.music);
    this.input.vibrationEnabled = this.saveSystem.data.settings.vibration;

    // Bind virtual touch controls
    this.input.bindTouchButton(document.getElementById('btn-left'), 'left');
    this.input.bindTouchButton(document.getElementById('btn-right'), 'right');
    this.input.bindTouchButton(document.getElementById('btn-jump'), 'jump');
    this.input.bindTouchButton(document.getElementById('btn-attack'), 'attack');
    this.input.bindTouchButton(document.getElementById('btn-dash'), 'dash');

    // Unlock Web Audio API on first user interaction
    const unlockAudio = () => {
      this.audio.resume();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Game state
    this.state = 'menu'; // 'menu', 'playing', 'paused', 'gameover', 'levelcomplete', 'victory'
    this.currentLevel = 1;
    this.currentWorld = 1;
    this.levelTime = 0;

    // Active Level Entities
    this.player = null;
    this.platforms = [];
    this.movingPlatforms = [];
    this.crumblingPlatforms = [];
    this.spikes = [];
    this.mysteryBlocks = [];
    this.crates = [];
    this.signposts = [];
    this.checkpoints = [];
    this.coins = [];
    this.crystals = [];
    this.starShards = [];
    this.powerups = [];
    this.enemies = [];
    this.boss = null;
    this.exitGate = null;

    // Loop timing
    this.lastTime = performance.now();

    this._initWindowResize();
    this._initVisibilityPause();
    this._dismissLoadingScreen();
    this._startLoop();
  }

  _initVisibilityPause() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.pause();
        this.ui.showModal('pause');
      }
    });

    window.addEventListener('blur', () => {
      if (this.state === 'playing') {
        this.pause();
        this.ui.showModal('pause');
      }
    });
  }

  _dismissLoadingScreen() {
    setTimeout(() => {
      const loader = document.getElementById('loading-screen');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
          if (loader.parentNode) {
            loader.parentNode.removeChild(loader);
          }
        }, 500);
      }
    }, 400);
  }

  _initWindowResize() {
    const handleResize = () => {
      const container = document.getElementById('game-container');
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const scale = Math.min(cw / this.virtualWidth, ch / this.virtualHeight);
      const renderW = Math.round(this.virtualWidth * scale);
      const renderH = Math.round(this.virtualHeight * scale);

      this.canvas.style.width = `${renderW}px`;
      this.canvas.style.height = `${renderH}px`;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
  }

  loadLevel(levelNum) {
    this.currentLevel = levelNum;
    const levelData = window.SQ.LevelData.getLevel(levelNum);
    this.currentWorld = levelData.worldId;
    this.levelTime = 0;

    // Create player
    this.player = new window.SQ.Player(levelData.spawn.x, levelData.spawn.y);

    // Setup camera
    this.camera.setBounds(0, 0, levelData.width, levelData.height);
    this.camera.x = levelData.spawn.x - this.virtualWidth / 3;
    this.camera.y = levelData.spawn.y - this.virtualHeight / 2;

    // Instantiate platforms & objects
    this.platforms = levelData.platforms.map((p) => ({ ...p }));
    this.movingPlatforms = (levelData.movingPlatforms || []).map((p) => new window.SQ.MovingPlatform(p.x, p.y, p.width, p.height, p));
    this.crumblingPlatforms = (levelData.crumblingPlatforms || []).map((p) => new window.SQ.CrumblingPlatform(p.x, p.y, p.width, p.height));

    this.spikes = (levelData.spikes || []).map((s) => new window.SQ.Spikes(s.x, s.y, s.width, s.height));
    this.mysteryBlocks = (levelData.mysteryBlocks || []).map((m) => new window.SQ.MysteryBlock(m.x, m.y, m.itemType));
    this.crates = (levelData.crates || []).map((c) => new window.SQ.Crate(c.x, c.y, c.contains));
    this.signposts = (levelData.signposts || []).map((s) => ({ ...s, width: 36, height: 40 }));
    this.checkpoints = (levelData.checkpoints || []).map((cp) => new window.SQ.Checkpoint(cp.x, cp.y));

    this.coins = (levelData.coins || []).map((c) => new window.SQ.Coin(c.x, c.y));
    this.crystals = (levelData.crystals || []).map((cr) => new window.SQ.Crystal(cr.x, cr.y));
    this.starShards = (levelData.starShards || []).map((sh) => new window.SQ.StarShard(sh.x, sh.y, sh.shardIndex));
    this.powerups = (levelData.powerups || []).map((pw) => new window.SQ.PowerupItem(pw.x, pw.y, pw.powerupType));

    this.enemies = (levelData.enemies || []).map((e) => new window.SQ.Enemy(e.type, e.x, e.y, e));

    if (levelData.boss) {
      this.boss = new window.SQ.Boss(levelData.boss.x, levelData.boss.y);
    } else {
      this.boss = null;
    }

    if (levelData.exitGate) {
      this.exitGate = new window.SQ.ExitGate(levelData.exitGate.x, levelData.exitGate.y);
    } else {
      this.exitGate = null;
    }

    this.particles.clear();
    this.state = 'playing';

    // Start atmospheric procedural music for this world
    this.audio.startMusic(this.currentWorld);
  }

  restartLevel() {
    this.loadLevel(this.currentLevel);
  }

  nextLevel() {
    if (this.currentLevel < 30) {
      this.loadLevel(this.currentLevel + 1);
    } else {
      this.goToMainMenu();
    }
  }

  respawnPlayer() {
    if (this.player) {
      this.player.respawnAtCheckpoint();
      this.state = 'playing';
    }
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.lastTime = performance.now();
    }
  }

  goToMainMenu() {
    this.state = 'menu';
    this.audio.stopMusic();
    this.ui.showModal('mainMenu');
  }

  _startLoop() {
    const frame = (time) => {
      const dt = Math.min(0.05, (time - this.lastTime) / 1000);
      this.lastTime = time;

      this._update(dt);
      this._render();

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  _update(dt) {
    this.input.update();

    // Check pause key
    if (this.input.isJustPressed('pause')) {
      if (this.state === 'playing') {
        this.pause();
        this.ui.showModal('pause');
      } else if (this.state === 'paused') {
        this.resume();
        this.ui.hideAllModals();
      }
    }

    this.renderer.update(dt);

    if (this.state !== 'playing' || !this.player) return;

    this.levelTime += dt;

    // 1. Update Player Input & Velocity
    this.player.update(this.input, this.audio, this.particles, this.camera, dt);

    // 2. Update Moving & Crumbling Platforms
    this.movingPlatforms.forEach((p) => p.update(dt));
    this.crumblingPlatforms.forEach((p) => p.update(dt, this.particles));

    // Combine all collidable platforms
    const allPlatforms = [
      ...this.platforms,
      ...this.movingPlatforms,
      ...this.crumblingPlatforms.filter((p) => !p.isFallen),
      ...this.mysteryBlocks,
      ...this.crates.filter((c) => !c.broken)
    ];

    // 3. Resolve Player Collisions with Platforms
    window.SQ.Physics.resolvePlatforms(this.player, allPlatforms, dt, this.audio, this.particles);

    // 4. Update Mystery Blocks
    this.mysteryBlocks.forEach((m) => m.update(dt));

    // 5. Update Hazards & Spikes
    this.spikes.forEach((s) => s.update(this.player, this.audio, this.particles, this.camera));

    // 6. Checkpoints
    this.checkpoints.forEach((cp) => cp.update(this.player, this.audio, this.particles));

    // 7. Collectibles (Coins, Crystals, Shards, Powerups)
    this.coins.forEach((c) => c.update(this.player, this.audio, this.particles, dt));
    this.crystals.forEach((cr) => cr.update(this.player, this.audio, this.particles, dt));
    this.starShards.forEach((sh) => sh.update(this.player, this.audio, this.particles, dt));
    this.powerups.forEach((pw) => pw.update(this.player, this.audio, this.particles));

    // 8. Player Attack Slash Collision (with Enemies, Mystery Blocks, and Crates)
    const attackBox = this.player.getAttackBox();
    if (attackBox) {
      // Hit enemies with slash
      for (let i = 0; i < this.enemies.length; i++) {
        const en = this.enemies[i];
        if (!en.isDead && window.SQ.Physics.checkAABB(attackBox, en)) {
          en.takeDamage(1, this.audio, this.particles);
          this.camera.shake(0.25);
          this.player.score += 200;
        }
      }

      // Hit boss with slash
      if (this.boss && !this.boss.isDead && window.SQ.Physics.checkAABB(attackBox, this.boss)) {
        this.boss.takeDamage(1, this.audio, this.particles, this.camera);
        this.player.score += 500;
      }

      // Smash crates
      for (let i = 0; i < this.crates.length; i++) {
        const cr = this.crates[i];
        if (!cr.broken && window.SQ.Physics.checkAABB(attackBox, cr)) {
          cr.break(this.player, this.audio, this.particles);
        }
      }

      // Hit mystery blocks
      for (let i = 0; i < this.mysteryBlocks.length; i++) {
        const mb = this.mysteryBlocks[i];
        if (!mb.isHit && window.SQ.Physics.checkAABB(attackBox, mb)) {
          mb.triggerHit(this.player, this.audio, this.particles);
        }
      }
    }

    // 9. Update Enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];
      if (en.isDead) continue;

      en.update(this.player, this.platforms, dt);

      // Collision with player
      if (window.SQ.Physics.checkAABB(this.player, en)) {
        if (this.player.isSpeedDashing) {
          // Speed Dash smash! Destroys enemy on impact
          en.takeDamage(2, this.audio, this.particles);
          this.player.score += 300;
          this.camera.shake(0.35);
        } else if (this.player.vy > 100 && this.player.y + this.player.height <= en.y + 20 && !en.isSpiky) {
          // Stomp weak enemy!
          en.takeDamage(1, this.audio, this.particles);
          this.player.vy = -380; // Bounce upward
          this.player.score += 200;
          this.camera.shake(0.2);
        } else {
          // Player takes damage on contact
          this.player.takeDamage(1, this.audio, this.particles, this.camera);
        }
      }
    }

    // 10. Update Boss (Level 30)
    if (this.boss) {
      this.boss.update(this.player, this.platforms, this.audio, this.particles, this.camera, dt);

      // Check boss contact with player
      if (!this.boss.isDead && window.SQ.Physics.checkAABB(this.player, this.boss)) {
        this.player.takeDamage(1, this.audio, this.particles, this.camera);
      }

      // If boss defeated, trigger Victory Sequence!
      if (this.boss.isDead && !this.player.isVictorious) {
        this.player.isVictorious = true;
        this.audio.playLevelComplete();
        setTimeout(() => {
          this.saveSystem.completeLevel(30, {
            coins: this.player.coins,
            shards: this.player.shards,
            score: this.player.score,
            time: this.levelTime
          });
          this.state = 'victory';
          this.ui.showVictory({ coins: this.player.coins });
        }, 1800);
      }
    }

    // 11. Exit Gate Level Completion
    if (this.exitGate && this.exitGate.update(this.player) && !this.player.isVictorious) {
      this.player.isVictorious = true;
      this.audio.playLevelComplete();
      this.particles.emitStarShardBurst(this.player.x + this.player.width / 2, this.player.y);

      setTimeout(() => {
        this.saveSystem.completeLevel(this.currentLevel, {
          coins: this.player.coins,
          shards: this.player.shards,
          score: this.player.score,
          time: this.levelTime
        });

        this.state = 'levelcomplete';
        this.ui.showLevelComplete({
          coins: this.player.coins,
          shards: this.player.shards,
          score: this.player.score,
          time: this.levelTime
        });
      }, 1000);
    }

    // 12. Check Fall into Abyss or Zero Health
    if (this.player.y > 680 || this.player.isDead) {
      if (!this.player.isDead) {
        this.player.health = 0;
        this.player.isDead = true;
        this.audio.playPlayerDeath();
      }
      this.state = 'gameover';
      setTimeout(() => {
        this.ui.showGameOver();
      }, 600);
    }

    // 13. Update Camera
    this.camera.update(this.player, this.player.facingRight, dt);

    // 14. Update Particles
    this.particles.update(dt);

    // 15. Update HUD
    this.ui.updateHUD(this.player);
  }

  _render() {
    const ctx = this.ctx;
    const w = this.virtualWidth;
    const h = this.virtualHeight;

    ctx.clearRect(0, 0, w, h);

    if (this.state === 'menu' && !this.player) {
      // Menu background: draw scenic Sky Meadow backdrop
      this.renderer.drawBackground(1, this.camera, w, h);
      return;
    }

    // 1. Draw Parallax Backgrounds
    this.renderer.drawBackground(this.currentWorld, this.camera, w, h);

    // 2. Draw Platforms & Blocks
    this.platforms.forEach((p) => this.renderer.drawPlatform(p, this.camera, this.currentWorld));
    this.movingPlatforms.forEach((p) => this.renderer.drawPlatform(p, this.camera, this.currentWorld));
    this.crumblingPlatforms.forEach((p) => {
      if (!p.isFallen) this.renderer.drawPlatform(p, this.camera, this.currentWorld);
    });

    this.mysteryBlocks.forEach((m) => this.renderer.drawMysteryBlock(m, this.camera));
    this.crates.forEach((c) => {
      if (!c.broken) this.renderer.drawCrate(c, this.camera);
    });
    this.signposts.forEach((s) => this.renderer.drawSignpost(s, this.camera));
    this.spikes.forEach((s) => this.renderer.drawSpikes(s, this.camera));
    this.checkpoints.forEach((cp) => this.renderer.drawCheckpoint(cp, this.camera));

    if (this.exitGate) {
      this.renderer.drawExitGate(this.exitGate, this.camera);
    }

    // 3. Draw Collectibles
    this.coins.forEach((c) => {
      if (!c.collected) this.renderer.drawCoin(c, this.camera);
    });
    this.crystals.forEach((cr) => {
      if (!cr.collected) this.renderer.drawCrystal(cr, this.camera);
    });
    this.starShards.forEach((sh) => {
      if (!sh.collected) this.renderer.drawStarShard(sh, this.camera);
    });
    this.powerups.forEach((pw) => {
      if (!pw.collected) this.renderer.drawPowerup(pw, this.camera);
    });

    // 4. Draw Enemies & Boss
    this.enemies.forEach((en) => {
      if (!en.isDead) this.renderer.drawEnemy(en, this.camera);
    });

    if (this.boss && !this.boss.isDead) {
      this.renderer.drawBoss(this.boss, this.camera);
      this.boss.drawProjectiles(ctx, this.camera);
    }

    // 5. Draw Player
    if (this.player && !this.player.isDead) {
      this.renderer.drawPlayer(this.player, this.camera);
    }

    // 6. Draw Particles
    this.particles.render(ctx, this.camera);
  }
};

// Initialize Game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.shadowQuest = new window.SQ.Game();
});
