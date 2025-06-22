// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// extract from chromium source code by @liuwayong
(function () {
  "use strict";
  /**
   * T-Rex runner.
   * @param {string} outerContainerId Outer containing element id.
   * @param {Object} opt_config
   * @constructor
   * @export
   */
  function Runner(outerContainerId, opt_config) {
    // Singleton
    if (Runner.instance_) {
      return Runner.instance_;
    }
    Runner.instance_ = this;

    this.outerContainerEl = document.querySelector(outerContainerId);
    this.containerEl = null;
    this.snackbarEl = null;
    this.detailsButton = this.outerContainerEl.querySelector("#details-button");

    // Set start message for desktop; mobile is now the default in HTML.
    if (!IS_MOBILE) {
      var messageBox = document.getElementById("messageBox");
      if (messageBox) {
        messageBox.querySelector("h1").textContent = "Press Space to start";
      }
    }

    this.config = opt_config || Runner.config;

    this.dimensions = Runner.defaultDimensions;

    this.canvas = null;
    this.canvasCtx = null;

    this.tRex = null;

    this.distanceMeter = null;
    this.currentScore = 0;
    this.totalObstaclesHit = 0;
    this.criticalObstaclesHit = 0;

    this.budget = 100;
    this.budgetBar = null;

    this.highestScore = 0;

    this.time = 0;
    this.flashEffect = { active: false, timer: 0, duration: 150 }; // Added for visual feedback
    this.runningTime = 0;
    this.msPerFrame = 1000 / FPS;
    this.currentSpeed = this.config.SPEED;

    this.obstacles = [];

    this.activated = false; // Whether the easter egg has been activated.
    this.playing = false; // Whether the game is currently in play state.
    this.crashed = false;
    this.paused = false;
    this.inverted = false;
    this.invertTimer = 0;
    this.resizeTimerId_ = null;

    this.playCount = 0;

    // Sound FX.
    this.audioBuffer = null;
    this.soundFx = {};

    // Global web audio context for playing sounds.
    this.audioContext = null;

    // Images.
    this.images = {};
    this.imagesLoaded = 0;

    this.loadImages();
  }
  window["Runner"] = Runner;

  /**
   * Default game width.
   * @const
   */
  var DEFAULT_WIDTH = 600;

  /**
   * Frames per second.
   * @const
   */
  var FPS = 60;

  /** @const */
  var IS_HIDPI = window.devicePixelRatio > 1;

  /** @const */
  var IS_IOS = /iPad|iPhone|iPod/.test(window.navigator.platform);

  /** @const */
  var IS_MOBILE = /Android/.test(window.navigator.userAgent) || IS_IOS;

  /** @const */
  var IS_TOUCH_ENABLED = "ontouchstart" in window;

  /**
   * Default game configuration.
   * @enum {number}
   */
  Runner.config = {
    ACCELERATION: 0.001,
    BG_CLOUD_SPEED: 0.2,
    BOTTOM_PAD: 10,
    CLEAR_TIME: 3000,
    CLOUD_FREQUENCY: 0.5,
    GAMEOVER_CLEAR_TIME: 750,
    GAP_COEFFICIENT: 0.6,
    GRAVITY: 0.6,
    INITIAL_JUMP_VELOCITY: 12,
    INVERT_FADE_DURATION: 12000,
    INVERT_DISTANCE: 700,
    MAX_BLINK_COUNT: 3,
    MAX_CLOUDS: 6,
    MAX_OBSTACLE_LENGTH: 3,
    MAX_OBSTACLE_DUPLICATION: 2,
    MAX_SPEED: 13,
    MIN_JUMP_HEIGHT: 35,
    MOBILE_SPEED_COEFFICIENT: 1.2,
    RESOURCE_TEMPLATE_ID: "audio-resources",
    SPEED: 6,
    SPEED_DROP_COEFFICIENT: 3,
    ARCADE_MODE_INITIAL_TOP_POSITION: 35,
    ARCADE_MODE_TOP_POSITION_PERCENT: 0.1,
  };

  /**
   * Default dimensions.
   * @enum {string}
   */
  Runner.defaultDimensions = {
    WIDTH: DEFAULT_WIDTH,
    HEIGHT: 150,
  };

  /**
   * CSS class names.
   * @enum {string}
   */
  Runner.classes = {
    ARCADE_MODE: "arcade-mode",
    CANVAS: "runner-canvas",
    CONTAINER: "runner-container",
    CRASHED: "crashed",
    ICON: "icon-offline",
    INVERTED: "inverted",
    SNACKBAR: "snackbar",
    SNACKBAR_SHOW: "snackbar-show",
    TOUCH_CONTROLLER: "controller",
  };

  /**
   * Sprite definition layout of the spritesheet.
   * @enum {Object}
   */
  Runner.spriteDefinition = {
    LDPI: {
      CACTUS_LARGE: { x: 332, y: 2 },
      CACTUS_SMALL: { x: 228, y: 2 },
      CLOUD: { x: 86, y: 2 },
      HORIZON: { x: 2, y: 54 },
      MOON: { x: 484, y: 2 },
      PTERODACTYL: { x: 134, y: 2 },
      RESTART: { x: 2, y: 2 },
      TEXT_SPRITE: { x: 655, y: 2 },
      TREX: { x: 848, y: 2 },
      STAR: { x: 645, y: 2 },
    },
    HDPI: {
      CACTUS_LARGE: { x: 652, y: 2 },
      CACTUS_SMALL: { x: 446, y: 2 },
      CLOUD: { x: 166, y: 2 },
      HORIZON: { x: 2, y: 104 },
      MOON: { x: 954, y: 2 },
      PTERODACTYL: { x: 260, y: 2 },
      RESTART: { x: 2, y: 2 },
      TEXT_SPRITE: { x: 1294, y: 2 },
      TREX: { x: 1678, y: 2 },
      STAR: { x: 1276, y: 2 },
    },
  };

  /**
   * Sound FX. Reference to the ID of the audio tag on interstitial page.
   * @enum {string}
   */
  Runner.sounds = {
    BUTTON_PRESS: "offline-sound-press",
    HIT: "offline-sound-hit",
    SCORE: "offline-sound-reached",
  };

  /**
   * Key code mapping.
   * @enum {Object}
   */
  Runner.keycodes = {
    JUMP: { 38: 1, 32: 1 }, // Up, spacebar
    DUCK: { 40: 1 }, // Down
    RESTART: { 13: 1 }, // Enter
  };

  /**
   * Runner event names.
   * @enum {string}
   */
  Runner.events = {
    ANIM_END: "webkitAnimationEnd",
    CLICK: "click",
    KEYDOWN: "keydown",
    KEYUP: "keyup",
    MOUSEDOWN: "mousedown",
    MOUSEUP: "mouseup",
    RESIZE: "resize",
    TOUCHEND: "touchend",
    TOUCHSTART: "touchstart",
    VISIBILITY: "visibilitychange",
    BLUR: "blur",
    FOCUS: "focus",
    LOAD: "load",
  };

  Runner.prototype = {
    /**
     * Setting individual settings for debugging.
     * @param {string} setting
     * @param {*} value
     */
    updateConfigSetting: function (setting, value) {
      if (setting in this.config && value != undefined) {
        this.config[setting] = value;

        switch (setting) {
          case "GRAVITY":
          case "MIN_JUMP_HEIGHT":
          case "SPEED_DROP_COEFFICIENT":
            this.tRex.config[setting] = value;
            break;
          case "INITIAL_JUMP_VELOCITY":
            this.tRex.setJumpVelocity(value);
            break;
          case "SPEED":
            this.setSpeed(value);
            break;
        }
      }
    },

    /**
     * Cache the appropriate image sprite from the page and get the sprite sheet
     * definition.
     */
    loadImages: function () {
      if (IS_HIDPI) {
        Runner.imageSprite = document.getElementById("offline-resources-2x");
        this.spriteDef = Runner.spriteDefinition.HDPI;
      } else {
        Runner.imageSprite = document.getElementById("offline-resources-1x");
        this.spriteDef = Runner.spriteDefinition.LDPI;
      }

      if (Runner.imageSprite.complete) {
        this.init();
      } else {
        // If the images are not yet loaded, add a listener.
        Runner.imageSprite.addEventListener(
          Runner.events.LOAD,
          this.init.bind(this)
        );
      }
    },

    /**
     * Load and decode base 64 encoded sounds.
     */
    loadSounds: function () {
      if (!IS_IOS) {
        this.audioContext = new AudioContext();

        var resourceTemplate = document.getElementById(
          this.config.RESOURCE_TEMPLATE_ID
        ).content;

        for (var sound in Runner.sounds) {
          var soundSrc = resourceTemplate.getElementById(
            Runner.sounds[sound]
          ).src;
          soundSrc = soundSrc.substr(soundSrc.indexOf(",") + 1);
          var buffer = decodeBase64ToArrayBuffer(soundSrc);

          // Async, so no guarantee of order in array.
          this.audioContext.decodeAudioData(
            buffer,
            function (index, audioData) {
              this.soundFx[index] = audioData;
            }.bind(this, sound)
          );
        }
      }
    },

    /**
     * Sets the game speed. Adjust the speed accordingly if on a smaller screen.
     * @param {number} opt_speed
     */
    setSpeed: function (opt_speed) {
      var speed = opt_speed || this.currentSpeed;

      // Reduce the speed on smaller mobile screens.
      if (this.dimensions.WIDTH < DEFAULT_WIDTH) {
        var mobileSpeed =
          ((speed * this.dimensions.WIDTH) / DEFAULT_WIDTH) *
          this.config.MOBILE_SPEED_COEFFICIENT;
        this.currentSpeed = mobileSpeed > speed ? speed : mobileSpeed;
      } else if (opt_speed) {
        this.currentSpeed = opt_speed;
      }
    },

    /**
     * Game initialiser.
     */
    init: function () {
      // Hide the static icon.
      document.querySelector("." + Runner.classes.ICON).style.visibility =
        "hidden";
      this.adjustDimensions();
      this.setSpeed();

      this.containerEl = document.createElement("div");
      this.containerEl.className = Runner.classes.CONTAINER;

      // Player canvas container.
      this.canvas = createCanvas(
        this.containerEl,
        this.dimensions.WIDTH,
        this.dimensions.HEIGHT,
        Runner.classes.PLAYER
      );
      this.budgetBar = new BudgetBar(this.canvas, this.dimensions);

      this.canvasCtx = this.canvas.getContext("2d");
      this.canvasCtx.fillStyle = "#f7f7f7";
      this.canvasCtx.fill();
      Runner.updateCanvasScaling(this.canvas);

      // Horizon contains clouds, obstacles and the ground.
      this.horizon = new Horizon(
        this.canvas,
        this.spriteDef,
        this.dimensions,
        this.config.GAP_COEFFICIENT
      );

      // Distance meter
      this.distanceMeter = new DistanceMeter(
        this.canvas,
        this.spriteDef.TEXT_SPRITE,
        this.dimensions.WIDTH
      );

      // Draw t-rex
      this.tRex = new Trex(this.canvas, this.spriteDef.TREX);

      this.outerContainerEl.appendChild(this.containerEl);

      if (IS_MOBILE) {
        this.createTouchController();
      }

      this.startListening();
      this.update();

      window.addEventListener(
        Runner.events.RESIZE,
        this.debounceResize.bind(this)
      );
    },

    /**
     * Create the touch controller. A div that covers whole screen.
     */
    createTouchController: function () {
      this.touchController = document.createElement("div");
      this.touchController.className = Runner.classes.TOUCH_CONTROLLER;
      this.outerContainerEl.appendChild(this.touchController);
    },

    /**
     * Debounce the resize event.
     */
    debounceResize: function () {
      if (!this.resizeTimerId_) {
        this.resizeTimerId_ = setInterval(
          this.adjustDimensions.bind(this),
          250
        );
      }
    },

    /**
     * Adjust game space dimensions on resize.
     */
    adjustDimensions: function () {
      clearInterval(this.resizeTimerId_);
      this.resizeTimerId_ = null;

      var boxStyles = window.getComputedStyle(this.outerContainerEl);
      var padding = Number(
        boxStyles.paddingLeft.substr(0, boxStyles.paddingLeft.length - 2)
      );

      this.dimensions.WIDTH = this.outerContainerEl.offsetWidth - padding * 2;
      this.dimensions.WIDTH = Math.min(DEFAULT_WIDTH, this.dimensions.WIDTH); //Arcade Mode
      if (this.activated) {
        this.setArcadeModeContainerScale();
      }

      // Redraw the elements back onto the canvas.
      if (this.canvas) {
        this.canvas.width = this.dimensions.WIDTH;
        this.canvas.height = this.dimensions.HEIGHT;

        // The game over panel is now handled by a custom modal, no need to draw it here.
        Runner.updateCanvasScaling(this.canvas);

        this.distanceMeter.calcXPos(this.dimensions.WIDTH);
        this.budgetBar.calcXPos(this.dimensions.WIDTH);
        this.clearCanvas();
        this.horizon.update(0, 0, true);
        // Don't call update as it's stateful and doesn't always draw.
        // Instead, just draw the T-Rex in its current animation frame.
        // This prevents the flickering on load.
        this.tRex.draw(this.tRex.currentAnimFrames[this.tRex.currentFrame], 0);

        // Outer container and distance meter.
        if (this.playing || this.crashed || this.paused) {
          this.containerEl.style.width = this.dimensions.WIDTH + "px";
          this.containerEl.style.height = this.dimensions.HEIGHT + "px";
          this.distanceMeter.update(0, Math.ceil(this.currentScore));
          this.budgetBar.update(this.budget);
          this.stop();
        } else {
        }
      }
    },

    /**
     * Play the game intro.
     * Canvas container width expands out to the full width.
     */
    playIntro: function () {
      if (!this.activated && !this.crashed) {
        this.playingIntro = true;
        this.tRex.playingIntro = true;

        // CSS animation definition.
        var keyframes =
          "@-webkit-keyframes intro { " +
          "from { width:" +
          Trex.config.WIDTH +
          "px }" +
          "to { width: " +
          this.dimensions.WIDTH +
          "px }" +
          "}";

        // create a style sheet to put the keyframe rule in
        // and then place the style sheet in the html head
        var sheet = document.createElement("style");
        sheet.innerHTML = keyframes;
        document.head.appendChild(sheet);

        this.containerEl.addEventListener(
          Runner.events.ANIM_END,
          this.startGame.bind(this)
        );

        this.containerEl.style.webkitAnimation = "intro .6s ease-in-out 1 both";

        // if (this.touchController) {
        //     this.outerContainerEl.appendChild(this.touchController);
        // }
        this.playing = true;
        this.activated = true;
      } else if (this.crashed) {
        this.restart();
      }
    },

    /**
     * Update the game status to started.
     */
    startGame: function () {
      this.setArcadeMode();
      this.runningTime = 0;
      this.playingIntro = false;
      this.tRex.playingIntro = false;
      // Set the final width after the animation has finished.
      this.containerEl.style.width = this.dimensions.WIDTH + "px";
      this.containerEl.style.webkitAnimation = ""; // Now clear the animation.
      this.playCount++;

      // Handle tabbing off the page. Pause the current game.
      document.addEventListener(
        Runner.events.VISIBILITY,
        this.onVisibilityChange.bind(this)
      );

      window.addEventListener(
        Runner.events.BLUR,
        this.onVisibilityChange.bind(this)
      );

      window.addEventListener(
        Runner.events.FOCUS,
        this.onVisibilityChange.bind(this)
      );
    },

    clearCanvas: function () {
      this.canvasCtx.clearRect(
        0,
        0,
        this.dimensions.WIDTH,
        this.dimensions.HEIGHT
      );
    },

    /**
     * Update the game frame and schedules the next one.
     */
    update: function () {
      this.updatePending = false;

      var now = getTimeStamp();
      var deltaTime = now - (this.time || now);
      this.time = now;

      this.clearCanvas();

      // Update and draw horizon (includes ground, clouds, obstacles)
      var hasObstacles = false;
      if (this.playing) {
        this.runningTime += deltaTime;
        hasObstacles = this.runningTime > this.config.CLEAR_TIME;

        // The horizon moves based on game speed
        if (this.playingIntro) {
          this.horizon.update(0, this.currentSpeed, hasObstacles);
        } else {
          // Use a local deltaTime so the horizon doesn't move before activation.
          var localDeltaTime = !this.activated ? 0 : deltaTime;
          this.horizon.update(
            localDeltaTime,
            this.currentSpeed,
            hasObstacles,
            this.inverted
          );
        }
      } else {
        // If not playing, still draw horizon but without movement
        this.horizon.update(0, 0, false);
      }

      // Update and draw T-Rex (handles blinking when not playing)
      this.tRex.update(deltaTime);

      // Game logic (only if playing)
      if (this.playing) {
        if (this.tRex.jumping) {
          this.tRex.updateJump(deltaTime);
        }

        // First jump triggers the intro.
        if (this.tRex.jumpCount == 1 && !this.playingIntro) {
          this.playIntro();
        }

        // Check for collisions and update score/speed based on obstacle value.
        if (hasObstacles && this.horizon.obstacles.length > 0) {
          var collision = checkForCollision(
            this.horizon.obstacles[0],
            this.tRex
          );

          if (collision) {
            const hitObstacle = this.horizon.obstacles[0];
            this.totalObstaclesHit++; // Increment total hits

            // Budget reduction logic
            if (hitObstacle.value >= 200 && hitObstacle.value <= 399) {
              this.budget -= 0.1;
            } else if (hitObstacle.value >= 429) {
              this.flashEffect.active = true;
              this.flashEffect.timer = 0;
              this.budget -= 1; //
              this.criticalObstaclesHit++; // Increment critical hits
            }

            // Speed reduction logic (only for 5xx)
            if (hitObstacle.value >= 500) {
              // Corrected from 429
              this.currentSpeed -= 0.5;
              this.playSound(this.soundFx.HIT);
              // No score change for 5xx, but speed penalty
            } else if (hitObstacle.value === 200) {
              this.currentScore += 1; // Increase score by 1 for 200
              this.playSound(this.soundFx.SCORE); // Play score sound
              // Increase speed slightly on collecting a '200'
              if (this.currentSpeed < this.config.MAX_SPEED) {
                this.currentSpeed += 0.05;
              }
            } else {
              this.playSound(this.soundFx.HIT); // Play hit sound for 3xx and 400-418
            }
            this.horizon.removeFirstObstacle(); // Remove the obstacle after collision
            vibrate(200); // Vibrate on any hit
          }
        }
      }

      // Draw flash effect if active
      if (this.flashEffect.active) {
        this.flashEffect.timer += deltaTime;
        if (this.flashEffect.timer < this.flashEffect.duration) {
          const flashAlpha =
            1 - this.flashEffect.timer / this.flashEffect.duration;
          this.canvasCtx.save();
          this.canvasCtx.globalAlpha = flashAlpha * 0.7; // Semi-transparent red flash
          this.canvasCtx.fillStyle = "#FF0000";
          this.canvasCtx.fillRect(
            this.tRex.xPos,
            this.tRex.yPos,
            this.tRex.config.WIDTH,
            this.tRex.config.HEIGHT
          );
          this.canvasCtx.restore();
        } else {
          this.flashEffect.active = false;
        }
      }

      // Update and draw UI elements (only if not crashed)
      if (!this.crashed) {
        this.budgetBar.update(this.budget);
        var playAchievementSound = this.distanceMeter.update(
          deltaTime,
          Math.ceil(this.currentScore)
        );

        if (playAchievementSound) {
          this.playSound(this.soundFx.SCORE);
        }
      }

      // Post-draw game logic
      if (this.playing) {
        // Don't update UI elements if crashed.
        if ((this.budget <= 0 || this.currentSpeed <= 0) && !this.crashed) {
          this.gameOver();
        }

        // Night mode.
        if (this.invertTimer > this.config.INVERT_FADE_DURATION) {
          this.invertTimer = 0;
          this.invertTrigger = false;
          this.invert();
        } else if (this.invertTimer) {
          this.invertTimer += deltaTime;
        } else {
          var actualDistance = this.distanceMeter.getActualDistance(
            Math.ceil(this.currentScore)
          );

          if (actualDistance > 0) {
            this.invertTrigger = !(
              actualDistance % this.config.INVERT_DISTANCE
            );

            if (this.invertTrigger && this.invertTimer === 0) {
              this.invertTimer += deltaTime;
              this.invert();
            }
          }
        }
      }

      this.scheduleNextUpdate();
    },

    // The `gameOver` function is no longer called on collision.
    // It remains in case it's triggered by other means (e.g., a future feature).
    // The game will now continue indefinitely, with score based on 200 hits.
    // The T-Rex will not enter a "crashed" state from hitting obstacles.

    /**
     * Event handler.
     */
    handleEvent: function (e) {
      return function (evtType, events) {
        switch (evtType) {
          case events.KEYDOWN:
          case events.TOUCHSTART:
          case events.MOUSEDOWN:
            this.onKeyDown(e);
            break;
          case events.KEYUP:
          case events.TOUCHEND:
          case events.MOUSEUP:
            this.onKeyUp(e);
            break;
        }
      }.bind(this)(e.type, Runner.events);
    },

    /**
     * Bind relevant key / mouse / touch listeners.
     */
    startListening: function () {
      // Keys.
      document.addEventListener(Runner.events.KEYDOWN, this);
      document.addEventListener(Runner.events.KEYUP, this);

      if (IS_MOBILE) {
        // Mobile only touch devices.
        this.touchController.addEventListener(Runner.events.TOUCHSTART, this);
        this.touchController.addEventListener(Runner.events.TOUCHEND, this);
        this.containerEl.addEventListener(Runner.events.TOUCHSTART, this);
      } else {
        // Mouse.
        document.addEventListener(Runner.events.MOUSEDOWN, this);
        document.addEventListener(Runner.events.MOUSEUP, this);
      }
    },

    /**
     * Remove all listeners.
     */
    stopListening: function () {
      document.removeEventListener(Runner.events.KEYDOWN, this);
      document.removeEventListener(Runner.events.KEYUP, this);

      if (IS_MOBILE) {
        this.touchController.removeEventListener(
          Runner.events.TOUCHSTART,
          this
        );
        this.touchController.removeEventListener(Runner.events.TOUCHEND, this);
        this.containerEl.removeEventListener(Runner.events.TOUCHSTART, this);
      } else {
        document.removeEventListener(Runner.events.MOUSEDOWN, this);
        document.removeEventListener(Runner.events.MOUSEUP, this);
      }
    },

    /**
     * Process keydown.
     * @param {Event} e
     */
    onKeyDown: function (e) {
      // Prevent native page scrolling whilst tapping on mobile.
      if (IS_MOBILE && this.playing) {
        e.preventDefault();
      }

      if (e.target != this.detailsButton) {
        if (
          !this.crashed &&
          (Runner.keycodes.JUMP[e.keyCode] ||
            e.type == Runner.events.TOUCHSTART)
        ) {
          if (!this.playing) {
            // Hide the initial message box on game start.
            var box = document.getElementById("messageBox");
            if (box) {
              box.style.visibility = "hidden";
            }

            this.loadSounds();
            this.playing = true;
            this.update();
            if (window.errorPageController) {
              errorPageController.trackEasterEgg();
            }
          }
          // Handle touch input for jump/duck
          if (e.type == Runner.events.TOUCHSTART) {
            const touchX = e.touches[0].clientX;
            const halfWidth = this.dimensions.WIDTH / 2;

            if (touchX < halfWidth) {
              // Left side tap: JUMP
              if (!this.tRex.jumping && !this.tRex.ducking) {
                this.playSound(this.soundFx.BUTTON_PRESS);
                this.tRex.startJump(this.currentSpeed);
              }
            } else if (this.tRex.jumping) {
              // Right side tap while jumping: Speed drop
              this.tRex.setSpeedDrop();
            } else if (!this.tRex.ducking) {
              // Right side tap while on ground: Duck
              this.tRex.setDuck(true);
            }
          } else {
            // Keyboard jump
            if (!this.tRex.jumping && !this.tRex.ducking) {
              this.playSound(this.soundFx.BUTTON_PRESS);
              this.tRex.startJump(this.currentSpeed);
            }
          }
        }

        if (
          this.crashed &&
          e.type == Runner.events.TOUCHSTART &&
          e.currentTarget == this.containerEl
        ) {
          this.restart();
        }
      }

      if (this.playing && !this.crashed && Runner.keycodes.DUCK[e.keyCode]) {
        e.preventDefault();
        if (this.tRex.jumping) {
          // Speed drop, activated only when jump key is not pressed.
          this.tRex.setSpeedDrop();
        } else if (!this.tRex.jumping && !this.tRex.ducking) {
          // Duck.
          this.tRex.setDuck(true);
        }
      }
    },

    /**
     * Process key up.
     * @param {Event} e
     */
    onKeyUp: function (e) {
      var keyCode = String(e.keyCode);
      var isKeyboardJump = Runner.keycodes.JUMP[keyCode];
      var isKeyboardDuck = Runner.keycodes.DUCK[keyCode];
      var isMouseEvent = e.type == Runner.events.MOUSEDOWN;

      // Handle touchend for all relevant states.
      if (e.type == Runner.events.TOUCHEND) {
        if (this.crashed) {
          var deltaTime = getTimeStamp() - this.time;
          if (deltaTime >= this.config.GAMEOVER_CLEAR_TIME) {
            this.restart();
          }
        } else if (this.paused) {
          this.tRex.reset();
          this.play();
        } else if (this.isRunning()) {
          this.tRex.endJump();
          this.tRex.speedDrop = false;
          this.tRex.setDuck(false);
        }
        return; // Done with touch event
      }

      // Handle keyboard/mouse events
      if (this.isRunning() && (isKeyboardJump || isMouseEvent)) {
        this.tRex.endJump();
      } else if (isKeyboardDuck) {
        this.tRex.speedDrop = false;
        this.tRex.setDuck(false);
      } else if (this.crashed) {
        var deltaTime = getTimeStamp() - this.time;
        if (
          Runner.keycodes.RESTART[keyCode] ||
          this.isLeftClickOnCanvas(e) ||
          (deltaTime >= this.config.GAMEOVER_CLEAR_TIME && isKeyboardJump)
        ) {
          this.restart();
        }
      } else if (this.paused && (isKeyboardJump || isMouseEvent)) {
        this.tRex.reset();
        this.play();
      }
    },

    /**
     * Returns whether the event was a left click on canvas.
     * On Windows right click is registered as a click.
     * @param {Event} e
     * @return {boolean}
     */
    isLeftClickOnCanvas: function (e) {
      return (
        e.button != null &&
        e.button < 2 &&
        e.type == Runner.events.MOUSEUP &&
        e.target == this.canvas
      );
    },

    /**
     * RequestAnimationFrame wrapper.
     */
    scheduleNextUpdate: function () {
      if (!this.updatePending) {
        this.updatePending = true;
        this.raqId = requestAnimationFrame(this.update.bind(this));
      }
    },

    /**
     * Whether the game is running.
     * @return {boolean}
     */
    isRunning: function () {
      return !!this.raqId;
    },

    /**
     * Game over state.
     */
    gameOver: function () {
      this.playSound(this.soundFx.HIT);
      vibrate(200);

      this.stop();
      this.crashed = true;
      this.distanceMeter.acheivement = false;
      this.tRex.update(100, Trex.status.CRASHED);

      // Update the high score.
      if (this.currentScore > this.highestScore) {
        this.highestScore = Math.ceil(this.currentScore);
        this.distanceMeter.setHighScore(this.highestScore);
      }
      // Reset the time clock.
      this.time = getTimeStamp();

      // --- NEW: Display Game Over Modal with Stats ---
      const modal = document.createElement("div");
      modal.id = "gameOverModal";
      Object.assign(modal.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "rgba(0, 0, 0, 0.8)",
        color: "#fff",
        padding: "30px",
        borderRadius: "12px",
        textAlign: "center",
        zIndex: "1000",
        maxWidth: "300px",
        boxShadow: "0 0 20px rgba(0, 0, 0, 0.5)",
        fontFamily: "'Open Sans', sans-serif",
        fontSize: "16px",
      });

      const collected200s = this.currentScore; // currentScore is 200s collected
      const budgetRemaining = Math.max(0, this.budget).toFixed(1); // Ensure it doesn't show negative

      modal.innerHTML = `
        <h2 style="margin-top: 0; color: #FFD700;">GAME OVER!</h2>
        <p><strong>Score:</strong> ${collected200s}</p>
        <p><strong>High Score:</strong> ${this.highestScore}</p>
        <p><strong>Budget Remaining:</strong> ${budgetRemaining}%</p>
        <p><strong>Total Obstacles Hit:</strong> ${this.totalObstaclesHit}</p>
        <p><strong>Critical Hits (429+):</strong> ${this.criticalObstaclesHit}</p>
        <button id="restartButton" style="
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 18px;
            margin-top: 20px;
        ">Play Again</button>
      `;

      this.outerContainerEl.appendChild(modal);

      document.getElementById("restartButton").onclick = () => {
        this.outerContainerEl.removeChild(modal);
        this.restart();
      };
    },

    stop: function () {
      this.playing = false;
      this.paused = true;
      cancelAnimationFrame(this.raqId);
      this.raqId = 0;
    },

    play: function () {
      if (!this.crashed) {
        this.playing = true;
        this.paused = false;
        this.tRex.update(0, Trex.status.RUNNING);
        this.time = getTimeStamp();
        this.update();
      }
    },

    restart: function () {
      if (!this.raqId) {
        this.playCount++;
        this.runningTime = 0;
        this.playing = true;
        this.crashed = false;
        this.currentScore = 0;
        this.totalObstaclesHit = 0; // Reset new stat
        this.criticalObstaclesHit = 0; // Reset new stat
        this.budget = 100;
        this.setSpeed(this.config.SPEED);
        this.time = getTimeStamp();
        this.containerEl.classList.remove(Runner.classes.CRASHED);
        this.clearCanvas();
        this.distanceMeter.reset(this.highestScore);
        this.horizon.reset();
        this.tRex.reset();
        this.playSound(this.soundFx.BUTTON_PRESS);
        this.invert(true);
        this.update();
      }
    },

    /**
     * Hides offline messaging for a fullscreen game only experience.
     */
    setArcadeMode() {
      document.body.classList.add(Runner.classes.ARCADE_MODE);
      this.setArcadeModeContainerScale();
    },

    /**
     * Sets the scaling for arcade mode.
     */
    setArcadeModeContainerScale() {
      const windowHeight = window.innerHeight;
      const scaleHeight = windowHeight / this.dimensions.HEIGHT;
      const scaleWidth = window.innerWidth / this.dimensions.WIDTH;
      const scale = Math.max(1, Math.min(scaleHeight, scaleWidth));
      const scaledCanvasHeight = this.dimensions.HEIGHT * scale;
      // Positions the game container at 10% of the available vertical window
      // height minus the game container height.
      const translateY =
        Math.ceil(
          Math.max(
            0,
            (windowHeight -
              scaledCanvasHeight -
              Runner.config.ARCADE_MODE_INITIAL_TOP_POSITION) *
              Runner.config.ARCADE_MODE_TOP_POSITION_PERCENT
          )
        ) * window.devicePixelRatio;

      const cssScale = scale;
      this.containerEl.style.transform =
        "scale(" + cssScale + ") translateY(" + translateY + "px)";
    },

    /**
     * Pause the game if the tab is not in focus.
     */
    onVisibilityChange: function (e) {
      if (
        document.hidden ||
        document.webkitHidden ||
        e.type == "blur" ||
        document.visibilityState != "visible"
      ) {
        this.stop();
      } else if (!this.crashed) {
        this.tRex.reset();
        this.play();
      }
    },

    /**
     * Play a sound.
     * @param {SoundBuffer} soundBuffer
     */
    playSound: function (soundBuffer) {
      if (soundBuffer) {
        var sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = soundBuffer;
        sourceNode.connect(this.audioContext.destination);
        sourceNode.start(0);
      }
    },

    /**
     * Inverts the current page / canvas colors.
     * @param {boolean} Whether to reset colors.
     */
    invert: function (reset) {
      if (reset) {
        document.body.classList.toggle(Runner.classes.INVERTED, false);
        this.invertTimer = 0;
        this.inverted = false;
      } else {
        this.inverted = document.body.classList.toggle(
          Runner.classes.INVERTED,
          this.invertTrigger
        );
      }
    },
  };

  /**
   * Updates the canvas size taking into
   * account the backing store pixel ratio and
   * the device pixel ratio.
   *
   * See article by Paul Lewis:
   * http://www.html5rocks.com/en/tutorials/canvas/hidpi/
   *
   * @param {HTMLCanvasElement} canvas
   * @param {number} opt_width
   * @param {number} opt_height
   * @return {boolean} Whether the canvas was scaled.
   */
  Runner.updateCanvasScaling = function (canvas, opt_width, opt_height) {
    var context = canvas.getContext("2d");

    // Query the various pixel ratios
    var devicePixelRatio = Math.floor(window.devicePixelRatio) || 1;
    var backingStoreRatio =
      Math.floor(context.webkitBackingStorePixelRatio) || 1;
    var ratio = devicePixelRatio / backingStoreRatio;

    // Upscale the canvas if the two ratios don't match
    if (devicePixelRatio !== backingStoreRatio) {
      var oldWidth = opt_width || canvas.width;
      var oldHeight = opt_height || canvas.height;

      canvas.width = oldWidth * ratio;
      canvas.height = oldHeight * ratio;

      canvas.style.width = oldWidth + "px";
      canvas.style.height = oldHeight + "px";

      // Scale the context to counter the fact that we've manually scaled
      // our canvas element.
      context.scale(ratio, ratio);
      return true;
    } else if (devicePixelRatio == 1) {
      // Reset the canvas width / height. Fixes scaling bug when the page is
      // zoomed and the devicePixelRatio changes accordingly.
      canvas.style.width = canvas.width + "px";
      canvas.style.height = canvas.height + "px";
    }
    return false;
  };

  /**
   * Get random number.
   * @param {number} min
   * @param {number} max
   * @param {number}
   */
  function getRandomNum(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Vibrate on mobile devices.
   * @param {number} duration Duration of the vibration in milliseconds.
   */
  function vibrate(duration) {
    if (IS_MOBILE && window.navigator.vibrate) {
      window.navigator.vibrate(duration);
    }
  }

  /**
   * Create canvas element.
   * @param {HTMLElement} container Element to append canvas to.
   * @param {number} width
   * @param {number} height
   * @param {string} opt_classname
   * @return {HTMLCanvasElement}
   */
  function createCanvas(container, width, height, opt_classname) {
    var canvas = document.createElement("canvas");
    canvas.className = opt_classname
      ? Runner.classes.CANVAS + " " + opt_classname
      : Runner.classes.CANVAS;
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);

    return canvas;
  }

  /**
   * Decodes the base 64 audio to ArrayBuffer used by Web Audio.
   * @param {string} base64String
   */
  function decodeBase64ToArrayBuffer(base64String) {
    var len = (base64String.length / 4) * 3;
    var str = atob(base64String);
    var arrayBuffer = new ArrayBuffer(len);
    var bytes = new Uint8Array(arrayBuffer);

    for (var i = 0; i < len; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Return the current timestamp.
   * @return {number}
   */
  function getTimeStamp() {
    return IS_IOS ? new Date().getTime() : performance.now();
  }

  //******************************************************************************

  /**
   * Game over panel.
   * @param {!HTMLCanvasElement} canvas
   * @param {Object} textImgPos
   * @param {Object} restartImgPos
   * @param {!Object} dimensions Canvas dimensions.
   * @constructor
   */
  function GameOverPanel(canvas, textImgPos, restartImgPos, dimensions) {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.canvasDimensions = dimensions;
    this.textImgPos = textImgPos;
    this.restartImgPos = restartImgPos;
    this.draw();
  }

  /**
   * Dimensions used in the panel.
   * @enum {number}
   */
  GameOverPanel.dimensions = {
    TEXT_X: 0,
    TEXT_Y: 13,
    TEXT_WIDTH: 191,
    TEXT_HEIGHT: 11,
    RESTART_WIDTH: 36,
    RESTART_HEIGHT: 32,
  };

  GameOverPanel.prototype = {
    /**
     * Update the panel dimensions.
     * @param {number} width New canvas width.
     * @param {number} opt_height Optional new canvas height.
     */
    updateDimensions: function (width, opt_height) {
      this.canvasDimensions.WIDTH = width;
      if (opt_height) {
        this.canvasDimensions.HEIGHT = opt_height;
      }
    },

    /**
     * Draw the panel.
     */
    draw: function () {
      var dimensions = GameOverPanel.dimensions;

      var centerX = this.canvasDimensions.WIDTH / 2;

      // Game over text.
      var textSourceX = dimensions.TEXT_X;
      var textSourceY = dimensions.TEXT_Y;
      var textSourceWidth = dimensions.TEXT_WIDTH;
      var textSourceHeight = dimensions.TEXT_HEIGHT;

      var textTargetX = Math.round(centerX - dimensions.TEXT_WIDTH / 2);
      var textTargetY = Math.round((this.canvasDimensions.HEIGHT - 25) / 3);
      var textTargetWidth = dimensions.TEXT_WIDTH;
      var textTargetHeight = dimensions.TEXT_HEIGHT;

      var restartSourceWidth = dimensions.RESTART_WIDTH;
      var restartSourceHeight = dimensions.RESTART_HEIGHT;
      var restartTargetX = centerX - dimensions.RESTART_WIDTH / 2;
      var restartTargetY = this.canvasDimensions.HEIGHT / 2;

      if (IS_HIDPI) {
        textSourceY *= 2;
        textSourceX *= 2;
        textSourceWidth *= 2;
        textSourceHeight *= 2;
        restartSourceWidth *= 2;
        restartSourceHeight *= 2;
      }

      textSourceX += this.textImgPos.x;
      textSourceY += this.textImgPos.y;

      // Game over text from sprite.
      this.canvasCtx.drawImage(
        Runner.imageSprite,
        textSourceX,
        textSourceY,
        textSourceWidth,
        textSourceHeight,
        textTargetX,
        textTargetY,
        textTargetWidth,
        textTargetHeight
      );

      // Restart button.
      this.canvasCtx.drawImage(
        Runner.imageSprite,
        this.restartImgPos.x,
        this.restartImgPos.y,
        restartSourceWidth,
        restartSourceHeight,
        restartTargetX,
        restartTargetY,
        dimensions.RESTART_WIDTH,
        dimensions.RESTART_HEIGHT
      );
    },
  };

  //******************************************************************************

  /**
   * Check for a collision.
   * @param {!Obstacle} obstacle
   * @param {!Trex} tRex T-rex object.
   * @param {HTMLCanvasContext} opt_canvasCtx Optional canvas context for drawing
   *    collision boxes.
   * @return {Array<CollisionBox>}
   */
  function checkForCollision(obstacle, tRex, opt_canvasCtx) {
    var obstacleBoxXPos = Runner.defaultDimensions.WIDTH + obstacle.xPos;

    // Adjustments are made to the bounding box as there is a 1 pixel white
    // border around the t-rex and obstacles.
    var tRexBox = new CollisionBox(
      tRex.xPos + 1,
      tRex.yPos + 1,
      tRex.config.WIDTH - 2,
      tRex.config.HEIGHT - 2
    );

    var obstacleBox = new CollisionBox(
      obstacle.xPos + 1,
      obstacle.yPos + 1,
      obstacle.width - 2,
      obstacle.height - 2
    );

    // Debug outer box
    if (opt_canvasCtx) {
      drawCollisionBoxes(opt_canvasCtx, tRexBox, obstacleBox);
    }

    // Simple outer bounds check.
    if (boxCompare(tRexBox, obstacleBox)) {
      var collisionBoxes = obstacle.collisionBoxes;
      var tRexCollisionBoxes = tRex.ducking
        ? Trex.collisionBoxes.DUCKING
        : Trex.collisionBoxes.RUNNING;

      // Detailed axis aligned box check.
      for (var t = 0; t < tRexCollisionBoxes.length; t++) {
        for (var i = 0; i < collisionBoxes.length; i++) {
          // Adjust the box to actual positions.
          var adjTrexBox = createAdjustedCollisionBox(
            tRexCollisionBoxes[t],
            tRexBox
          );
          var adjObstacleBox = createAdjustedCollisionBox(
            collisionBoxes[i],
            obstacleBox
          );
          var crashed = boxCompare(adjTrexBox, adjObstacleBox);

          // Draw boxes for debug.
          if (opt_canvasCtx) {
            drawCollisionBoxes(opt_canvasCtx, adjTrexBox, adjObstacleBox);
          }

          if (crashed) {
            return [adjTrexBox, adjObstacleBox];
          }
        }
      }
    }
    return false;
  }

  /**
   * Adjust the collision box.
   * @param {!CollisionBox} box The original box.
   * @param {!CollisionBox} adjustment Adjustment box.
   * @return {CollisionBox} The adjusted collision box object.
   */
  function createAdjustedCollisionBox(box, adjustment) {
    return new CollisionBox(
      box.x + adjustment.x,
      box.y + adjustment.y,
      box.width,
      box.height
    );
  }

  /**
   * Draw the collision boxes for debug.
   */
  function drawCollisionBoxes(canvasCtx, tRexBox, obstacleBox) {
    canvasCtx.save();
    canvasCtx.strokeStyle = "#f00";
    canvasCtx.strokeRect(tRexBox.x, tRexBox.y, tRexBox.width, tRexBox.height);

    canvasCtx.strokeStyle = "#0f0";
    canvasCtx.strokeRect(
      obstacleBox.x,
      obstacleBox.y,
      obstacleBox.width,
      obstacleBox.height
    );
    canvasCtx.restore();
  }

  /**
   * Compare two collision boxes for a collision.
   * @param {CollisionBox} tRexBox
   * @param {CollisionBox} obstacleBox
   * @return {boolean} Whether the boxes intersected.
   */
  function boxCompare(tRexBox, obstacleBox) {
    var crashed = false;
    var tRexBoxX = tRexBox.x;
    var tRexBoxY = tRexBox.y;

    var obstacleBoxX = obstacleBox.x;
    var obstacleBoxY = obstacleBox.y;

    // Axis-Aligned Bounding Box method.
    if (
      tRexBox.x < obstacleBoxX + obstacleBox.width &&
      tRexBox.x + tRexBox.width > obstacleBoxX &&
      tRexBox.y < obstacleBox.y + obstacleBox.height &&
      tRexBox.height + tRexBox.y > obstacleBox.y
    ) {
      crashed = true;
    }

    return crashed;
  }

  //******************************************************************************

  /**
   * Collision box object.
   * @param {number} x X position.
   * @param {number} y Y Position.
   * @param {number} w Width.
   * @param {number} h Height.
   */
  function CollisionBox(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }

  //******************************************************************************

  /**
   * Obstacle.
   * @param {HTMLCanvasCtx} canvasCtx
   * @param {Obstacle.type} type
   * @param {Object} spritePos Obstacle position in sprite.
   * @param {Object} dimensions
   * @param {number} gapCoefficient Mutipler in determining the gap.
   * @param {number} speed
   * @param {number} opt_xOffset
   */
  function Obstacle(
    canvasCtx,
    value, // Changed from 'type'
    spriteImgPos,
    dimensions,
    gapCoefficient,
    speed,
    opt_xOffset
  ) {
    this.canvasCtx = canvasCtx;
    this.spritePos = spriteImgPos;
    this.value = value;
    this.stringValue = String(this.value);
    this.gapCoefficient = gapCoefficient;
    this.dimensions = dimensions;
    this.remove = false;
    this.xPos = dimensions.WIDTH + (opt_xOffset || 0);
    this.yPos = 0;
    this.width = 0;
    this.collisionBoxes = [];
    this.gap = 0;

    this.init(speed);
  }

  /**
   * Coefficient for calculating the maximum gap.
   * @const
   */
  Obstacle.MAX_GAP_COEFFICIENT = 1.5;

  /**
   * Maximum obstacle grouping count - not used, but kept for reference.
   * @const
   */
  (Obstacle.MAX_OBSTACLE_LENGTH = 3),
    (Obstacle.prototype = {
      /**
       * Initialise the DOM for the obstacle.
       * @param {number} speed
       */
      init: function (speed) {
        // Width of a single digit from the sprite.
        const digitWidth = DistanceMeter.dimensions.WIDTH;
        const digitHeight = DistanceMeter.dimensions.HEIGHT;

        // Calculate the total width of the number.
        this.width = this.stringValue.length * digitWidth;
        this.height = digitHeight;

        // Position it on the ground.
        // Calculate the ground level for the bottom of the obstacle.
        const groundLevelY = this.dimensions.HEIGHT - Runner.config.BOTTOM_PAD;

        // Calculate the highest point the T-Rex's head can reach during a jump.
        // This defines the absolute highest an obstacle's top can be.
        const tRexHighestHeadY =
          this.dimensions.HEIGHT -
          Trex.config.HEIGHT -
          Runner.config.BOTTOM_PAD -
          Trex.config.MAX_JUMP_HEIGHT;

        // The obstacle's yPos (top edge) should be between tRexHighestHeadY (highest)
        // and groundLevelY - this.height (lowest, where obstacle is on the ground).
        this.yPos = getRandomNum(tRexHighestHeadY, groundLevelY - this.height);

        // Create a single collision box for the whole number.
        this.collisionBoxes.push(
          new CollisionBox(0, 0, this.width, this.height)
        );

        this.gap = this.getGap(this.gapCoefficient, speed);
        this.draw();
      },

      /**
       * Draw and crop based on size.
       */
      draw: function () {
        const dimensions = DistanceMeter.dimensions;
        const digitWidth = dimensions.WIDTH;
        const digitHeight = dimensions.HEIGHT;

        let sourceDigitWidth = digitWidth;
        let sourceDigitHeight = digitHeight;

        if (IS_HIDPI) {
          sourceDigitWidth *= 2;
          sourceDigitHeight *= 2;
        }

        for (var i = 0; i < this.stringValue.length; i++) {
          const digit = parseInt(this.stringValue[i], 10);

          // X position of the digit in the sprite sheet.
          const spriteX = this.spritePos.x + digit * sourceDigitWidth;
          const spriteY = this.spritePos.y;

          // X position on the canvas.
          const canvasX = this.xPos + i * digitWidth;

          this.canvasCtx.drawImage(
            Runner.imageSprite,
            spriteX,
            spriteY,
            sourceDigitWidth,
            sourceDigitHeight,
            canvasX,
            this.yPos,
            digitWidth,
            digitHeight
          );
        }
      },

      /**
       * Obstacle frame update.
       * @param {number} deltaTime
       * @param {number} speed
       */
      update: function (deltaTime, speed) {
        if (!this.remove) {
          this.xPos -= ((speed * FPS) / 1000) * deltaTime;
          this.draw();

          if (!this.isVisible()) {
            this.remove = true;
          }
        }
      },

      /**
       * Calculate a random gap size.
       * - Minimum gap gets wider as speed increses
       * @param {number} gapCoefficient
       * @param {number} speed
       * @return {number} The gap size.
       */
      getGap: function (gapCoefficient, speed) {
        const minGap = Math.round(this.width * speed + 120 * gapCoefficient);
        var maxGap = Math.round(minGap * Obstacle.MAX_GAP_COEFFICIENT);
        return getRandomNum(minGap, maxGap);
      },

      /**
       * Check if obstacle is visible.
       * @return {boolean} Whether the obstacle is in the game area.
       */
      isVisible: function () {
        return this.xPos + this.width > 0;
      },
    });

  //******************************************************************************
  /**
   * T-rex game character.
   * @param {HTMLCanvas} canvas
   * @param {Object} spritePos Positioning within image sprite.
   * @constructor
   */
  function Trex(canvas, spritePos) {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.spritePos = spritePos;
    this.xPos = 0;
    this.yPos = 0;
    // Position when on the ground.
    this.groundYPos = 0;
    this.currentFrame = 0;
    this.currentAnimFrames = [];
    this.blinkDelay = 0;
    this.blinkCount = 0;
    this.animStartTime = 0;
    this.timer = 0;
    this.msPerFrame = 1000 / FPS;
    this.config = Trex.config;
    // Current status.
    this.status = Trex.status.WAITING;

    this.jumping = false;
    this.ducking = false;
    this.jumpVelocity = 0;
    this.reachedMinHeight = false;
    this.speedDrop = false;
    this.jumpCount = 0;
    this.jumpspotX = 0;

    this.init();
  }

  /**
   * T-rex player config.
   * @enum {number}
   */
  Trex.config = {
    DROP_VELOCITY: -5,
    GRAVITY: 0.6,
    HEIGHT: 47,
    HEIGHT_DUCK: 25,
    INIITAL_JUMP_VELOCITY: -10,
    INTRO_DURATION: 1500,
    MAX_JUMP_HEIGHT: 30,
    MIN_JUMP_HEIGHT: 30,
    SPEED_DROP_COEFFICIENT: 3,
    SPRITE_WIDTH: 262,
    START_X_POS: 50,
    WIDTH: 44,
    WIDTH_DUCK: 59,
  };

  /**
   * Used in collision detection.
   * @type {Array<CollisionBox>}
   */
  Trex.collisionBoxes = {
    DUCKING: [new CollisionBox(1, 18, 55, 25)],
    RUNNING: [
      new CollisionBox(22, 0, 17, 16),
      new CollisionBox(1, 18, 30, 9),
      new CollisionBox(10, 35, 14, 8),
      new CollisionBox(1, 24, 29, 5),
      new CollisionBox(5, 30, 21, 4),
      new CollisionBox(9, 34, 15, 4),
    ],
  };

  /**
   * Animation states.
   * @enum {string}
   */
  Trex.status = {
    CRASHED: "CRASHED",
    DUCKING: "DUCKING",
    JUMPING: "JUMPING",
    RUNNING: "RUNNING",
    WAITING: "WAITING",
  };

  /**
   * Blinking coefficient.
   * @const
   */
  Trex.BLINK_TIMING = 7000;

  /**
   * Animation config for different states.
   * @enum {Object}
   */
  Trex.animFrames = {
    WAITING: {
      frames: [44, 0],
      msPerFrame: 1000 / 3,
    },
    RUNNING: {
      frames: [88, 132],
      msPerFrame: 1000 / 12,
    },
    CRASHED: {
      frames: [220],
      msPerFrame: 1000 / 60,
    },
    JUMPING: {
      frames: [0],
      msPerFrame: 1000 / 60,
    },
    DUCKING: {
      frames: [264, 323],
      msPerFrame: 1000 / 8,
    },
  };

  Trex.prototype = {
    /**
     * T-rex player initaliser.
     * Sets the t-rex to blink at random intervals.
     */
    init: function () {
      this.groundYPos =
        Runner.defaultDimensions.HEIGHT -
        this.config.HEIGHT -
        Runner.config.BOTTOM_PAD;
      this.yPos = this.groundYPos;
      this.minJumpHeight = this.groundYPos - this.config.MIN_JUMP_HEIGHT;

      this.draw(0, 0);
      this.update(0, Trex.status.WAITING);
    },

    /**
     * Setter for the jump velocity.
     * The approriate drop velocity is also set.
     */
    setJumpVelocity: function (setting) {
      this.config.INIITAL_JUMP_VELOCITY = -setting;
      this.config.DROP_VELOCITY = -setting / 2;
    },

    /**
     * Set the animation status.
     * @param {!number} deltaTime
     * @param {Trex.status} status Optional status to switch to.
     */
    update: function (deltaTime, opt_status) {
      this.timer += deltaTime;

      // Update the status.
      if (opt_status) {
        this.status = opt_status;
        this.currentFrame = 0;
        this.msPerFrame = Trex.animFrames[opt_status].msPerFrame;
        this.currentAnimFrames = Trex.animFrames[opt_status].frames;

        if (opt_status == Trex.status.WAITING) {
          this.animStartTime = getTimeStamp();
          this.setBlinkDelay();
        }
      }

      // Game intro animation, T-rex moves in from the left.
      if (this.playingIntro && this.xPos < this.config.START_X_POS) {
        this.xPos += Math.round(
          (this.config.START_X_POS / this.config.INTRO_DURATION) * deltaTime
        );
      }

      // Update the frame position. The blink function is a timer for the WAITING
      // state, and the regular timer is used for all other states.
      if (this.timer >= this.msPerFrame) {
        this.currentFrame =
          this.currentFrame == this.currentAnimFrames.length - 1
            ? 0
            : this.currentFrame + 1;
        this.timer = 0;
      }

      if (this.status == Trex.status.WAITING) {
        this.blink(getTimeStamp());
      } else {
        // This draw call is now handled below, unconditionally.
      }
      this.draw(this.currentAnimFrames[this.currentFrame], 0);
      if (this.speedDrop && this.yPos == this.groundYPos) {
        this.speedDrop = false;
        this.setDuck(true);
      }
    },

    /**
     * Draw the t-rex to a particular position.
     * @param {number} x
     * @param {number} y
     */
    draw: function (x, y) {
      var sourceX = x;
      var sourceY = y;
      var sourceWidth =
        this.ducking && this.status != Trex.status.CRASHED
          ? this.config.WIDTH_DUCK
          : this.config.WIDTH;
      var sourceHeight = this.config.HEIGHT;

      if (IS_HIDPI) {
        sourceX *= 2;
        sourceY *= 2;
        sourceWidth *= 2;
        sourceHeight *= 2;
      }

      // Adjustments for sprite sheet position.
      sourceX += this.spritePos.x;
      sourceY += this.spritePos.y;

      // Ducking.
      if (this.ducking && this.status != Trex.status.CRASHED) {
        this.canvasCtx.drawImage(
          Runner.imageSprite,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          this.xPos,
          this.yPos,
          this.config.WIDTH_DUCK,
          this.config.HEIGHT
        );
      } else {
        // Crashed whilst ducking. Trex is standing up so needs adjustment.
        if (this.ducking && this.status == Trex.status.CRASHED) {
          this.xPos++;
        }
        // Standing / running
        this.canvasCtx.drawImage(
          Runner.imageSprite,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          this.xPos,
          this.yPos,
          this.config.WIDTH,
          this.config.HEIGHT
        );
      }
    },

    /**
     * Sets a random time for the blink to happen.
     */
    setBlinkDelay: function () {
      this.blinkDelay = Math.ceil(Math.random() * Trex.BLINK_TIMING);
    },

    /**
     * Make t-rex blink at random intervals.
     * @param {number} time Current time in milliseconds.
     */
    blink: function (time) {
      var deltaTime = time - this.animStartTime;

      if (deltaTime >= this.blinkDelay) {
        if (this.currentFrame == 1) {
          // Set new random delay to blink.
          this.setBlinkDelay();
          this.animStartTime = time;
          this.blinkCount++;
        }
      }
    },

    /**
     * Initialise a jump.
     * @param {number} speed
     */
    startJump: function (speed) {
      if (!this.jumping) {
        this.update(0, Trex.status.JUMPING);
        // Tweak the jump velocity based on the speed.
        this.jumpVelocity = this.config.INIITAL_JUMP_VELOCITY - speed / 10;
        this.jumping = true;
        this.reachedMinHeight = false;
        this.speedDrop = false;
      }
    },

    /**
     * Jump is complete, falling down.
     */
    endJump: function () {
      if (
        this.reachedMinHeight &&
        this.jumpVelocity < this.config.DROP_VELOCITY
      ) {
        this.jumpVelocity = this.config.DROP_VELOCITY;
      }
    },

    /**
     * Update frame for a jump.
     * @param {number} deltaTime
     * @param {number} speed
     */
    updateJump: function (deltaTime, speed) {
      var msPerFrame = Trex.animFrames[this.status].msPerFrame;
      var framesElapsed = deltaTime / msPerFrame;

      // Speed drop makes Trex fall faster.
      if (this.speedDrop) {
        this.yPos += Math.round(
          this.jumpVelocity * this.config.SPEED_DROP_COEFFICIENT * framesElapsed
        );
      } else {
        this.yPos += Math.round(this.jumpVelocity * framesElapsed);
      }

      this.jumpVelocity += this.config.GRAVITY * framesElapsed;

      // Minimum height has been reached.
      if (this.yPos < this.minJumpHeight || this.speedDrop) {
        this.reachedMinHeight = true;
      }

      // Reached max height
      if (this.yPos < this.config.MAX_JUMP_HEIGHT || this.speedDrop) {
        this.endJump();
      }

      // Back down at ground level. Jump completed.
      if (this.yPos > this.groundYPos) {
        this.reset();
        this.jumpCount++;
      }

      this.update(deltaTime);
    },

    /**
     * Set the speed drop. Immediately cancels the current jump.
     */
    setSpeedDrop: function () {
      this.speedDrop = true;
      this.jumpVelocity = 1;
    },

    /**
     * @param {boolean} isDucking.
     */
    setDuck: function (isDucking) {
      if (isDucking && this.status != Trex.status.DUCKING) {
        this.update(0, Trex.status.DUCKING);
        this.ducking = true;
      } else if (this.status == Trex.status.DUCKING) {
        this.update(0, Trex.status.RUNNING);
        this.ducking = false;
      }
    },

    /**
     * Reset the t-rex to running at start of game.
     */
    reset: function () {
      this.yPos = this.groundYPos;
      this.jumpVelocity = 0;
      this.jumping = false;
      this.ducking = false;
      this.update(0, Trex.status.RUNNING);
      this.midair = false;
      this.speedDrop = false;
      this.jumpCount = 0;
    },
  };

  //******************************************************************************

  /**
   * Handles displaying the distance meter.
   * @param {!HTMLCanvasElement} canvas
   * @param {Object} spritePos Image position in sprite.
   * @param {number} canvasWidth
   * @constructor
   */
  function DistanceMeter(canvas, spritePos, canvasWidth) {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.image = Runner.imageSprite;
    this.spritePos = spritePos;
    this.x = 0;
    this.y = 5;

    this.currentDistance = 0;
    this.maxScore = 0;
    this.highScore = 0;
    this.container = null;

    this.digits = [];
    this.acheivement = false;
    this.defaultString = "";
    this.flashTimer = 0;
    this.flashIterations = 0;
    this.invertTrigger = false;

    this.config = DistanceMeter.config;
    this.maxScoreUnits = this.config.MAX_DISTANCE_UNITS;
    this.init(canvasWidth);
  }

  /**
   * @enum {number}
   */
  DistanceMeter.dimensions = {
    WIDTH: 10,
    HEIGHT: 13,
    DEST_WIDTH: 11,
  };

  /**
   * Y positioning of the digits in the sprite sheet.
   * X position is always 0.
   * @type {Array<number>}
   */
  DistanceMeter.yPos = [0, 13, 27, 40, 53, 67, 80, 93, 107, 120];

  /**
   * Distance meter config.
   * @enum {number}
   */
  DistanceMeter.config = {
    // Number of digits.
    MAX_DISTANCE_UNITS: 5,

    // Distance that causes achievement animation.
    ACHIEVEMENT_DISTANCE: 100,

    // Used for conversion from pixel distance to a scaled unit.
    COEFFICIENT: 0.025,

    // Flash duration in milliseconds.
    FLASH_DURATION: 1000 / 4,

    // Flash iterations for achievement animation.
    FLASH_ITERATIONS: 3,
  };

  DistanceMeter.prototype = {
    /**
     * Initialise the distance meter to '00000'.
     * @param {number} width Canvas width in px.
     */
    init: function (width) {
      var maxDistanceStr = "";

      this.calcXPos(width);
      this.maxScore = this.maxScoreUnits;
      for (var i = 0; i < this.maxScoreUnits; i++) {
        this.draw(i, 0);
        this.defaultString += "0";
        maxDistanceStr += "9";
      }

      this.maxScore = parseInt(maxDistanceStr);
    },

    /**
     * Calculate the xPos in the canvas.
     * @param {number} canvasWidth
     */
    calcXPos: function (canvasWidth) {
      this.x =
        canvasWidth -
        DistanceMeter.dimensions.DEST_WIDTH * (this.maxScoreUnits + 1);
    },

    /**
     * Draw a digit to canvas.
     * @param {number} digitPos Position of the digit.
     * @param {number} value Digit value 0-9.
     * @param {boolean} opt_highScore Whether drawing the high score.
     */
    draw: function (digitPos, value, opt_highScore) {
      var sourceWidth = DistanceMeter.dimensions.WIDTH;
      var sourceHeight = DistanceMeter.dimensions.HEIGHT;
      var sourceX = DistanceMeter.dimensions.WIDTH * value;
      var sourceY = 0;

      var targetX = digitPos * DistanceMeter.dimensions.DEST_WIDTH;
      var targetY = this.y;
      var targetWidth = DistanceMeter.dimensions.WIDTH;
      var targetHeight = DistanceMeter.dimensions.HEIGHT;

      // For high DPI we 2x source values.
      if (IS_HIDPI) {
        sourceWidth *= 2;
        sourceHeight *= 2;
        sourceX *= 2;
      }

      sourceX += this.spritePos.x;
      sourceY += this.spritePos.y;

      this.canvasCtx.save();

      if (opt_highScore) {
        // Left of the current score.
        var highScoreX =
          this.x - this.maxScoreUnits * 2 * DistanceMeter.dimensions.WIDTH;
        this.canvasCtx.translate(highScoreX, this.y);
      } else {
        this.canvasCtx.translate(this.x, this.y);
      }

      this.canvasCtx.drawImage(
        this.image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        targetX,
        targetY,
        targetWidth,
        targetHeight
      );

      this.canvasCtx.restore();
    },

    /**
     * Covert pixel distance to a 'real' distance.
     * @param {number} distance Pixel distance ran.
     * @return {number} The 'real' distance ran.
     */
    getActualDistance: function (distance) {
      return distance; // Now currentScore is the actual score, no scaling needed.
    },

    /**
     * Update the distance meter.
     * @param {number} distance
     * @param {number} deltaTime
     * @return {boolean} Whether the acheivement sound fx should be played.
     */
    update: function (deltaTime, distance) {
      var paint = true;
      var playSound = false;

      if (!this.acheivement) {
        distance = this.getActualDistance(distance);
        // Score has gone beyond the initial digit count.
        if (
          distance > this.maxScore &&
          this.maxScoreUnits == this.config.MAX_DISTANCE_UNITS
        ) {
          this.maxScoreUnits++;
          this.maxScore = parseInt(this.maxScore + "9");
        } else {
          this.distance = 0;
        }

        if (distance > 0) {
          // Acheivement unlocked
          if (distance % this.config.ACHIEVEMENT_DISTANCE == 0) {
            // Flash score and play sound.
            this.acheivement = true;
            this.flashTimer = 0;
            playSound = true;
          }

          // Create a string representation of the distance with leading 0.
          var distanceStr = (this.defaultString + distance).substr(
            -this.maxScoreUnits
          );
          this.digits = distanceStr.split("");
        } else {
          this.digits = this.defaultString.split("");
        }
      } else {
        // Control flashing of the score on reaching acheivement.
        if (this.flashIterations <= this.config.FLASH_ITERATIONS) {
          this.flashTimer += deltaTime;

          if (this.flashTimer < this.config.FLASH_DURATION) {
            paint = false;
          } else if (this.flashTimer > this.config.FLASH_DURATION * 2) {
            this.flashTimer = 0;
            this.flashIterations++;
          }
        } else {
          this.acheivement = false;
          this.flashIterations = 0;
          this.flashTimer = 0;
        }
      }

      // Draw the digits if not flashing.
      if (paint) {
        for (var i = this.digits.length - 1; i >= 0; i--) {
          this.draw(i, parseInt(this.digits[i]));
        }
      }

      this.drawHighScore();
      return playSound;
    },

    /**
     * Draw the high score.
     */
    drawHighScore: function () {
      this.canvasCtx.save();
      this.canvasCtx.globalAlpha = 0.8;
      for (var i = this.highScore.length - 1; i >= 0; i--) {
        this.draw(i, parseInt(this.highScore[i], 10), true);
      }
      this.canvasCtx.restore();
    },

    /**
     * Set the highscore as a array string.
     * Position of char in the sprite: H - 10, I - 11.
     * @param {number} distance Distance ran in pixels.
     */
    setHighScore: function (distance) {
      distance = this.getActualDistance(distance);
      var highScoreStr = (this.defaultString + distance).substr(
        -this.maxScoreUnits
      );

      this.highScore = ["10", "11", ""].concat(highScoreStr.split(""));
    },

    /**
     * Reset the distance meter back to '00000'.
     */
    reset: function () {
      this.update(0);
      this.acheivement = false;
    },
  };

  //******************************************************************************

  /**
   * Budget bar.
   * @param {!HTMLCanvasElement} canvas
   * @param {!Object} dimensions Canvas dimensions.
   * @constructor
   */
  function BudgetBar(canvas, dimensions) {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.dimensions = dimensions;
    this.x = 0;
    this.y = 20; // Below the score
    this.width =
      DistanceMeter.dimensions.DEST_WIDTH *
      DistanceMeter.config.MAX_DISTANCE_UNITS;
    this.height = 8;
    this.init(dimensions.WIDTH);
  }

  BudgetBar.prototype = {
    /**
     * Initialise the budget bar.
     * @param {number} canvasWidth Canvas width in px.
     */
    init: function (canvasWidth) {
      this.calcXPos(canvasWidth);
    },

    /**
     * Update and draw the budget bar.
     * @param {number} budget The current budget percentage.
     */
    update: function (budget) {
      this.draw(budget);
    },

    /**
     * Draw the budget bar to the canvas.
     * @param {number} budget The current budget percentage.
     */
    draw: function (budget) {
      var ctx = this.canvasCtx;
      ctx.save();

      // Bar container
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y, this.width, this.height);

      // Bar fill
      var budgetFillWidth = (Math.max(0, budget) / 100) * this.width;

      ctx.fillStyle =
        budget < 25 ? "#F44336" : budget < 50 ? "#FFC107" : "#4CAF50";
      ctx.fillRect(this.x, this.y, budgetFillWidth, this.height);

      ctx.restore();
    },

    /**
     * Recalculate x position on canvas resize.
     * @param {number} canvasWidth
     */
    calcXPos: function (canvasWidth) {
      this.x =
        canvasWidth -
        DistanceMeter.dimensions.DEST_WIDTH *
          (DistanceMeter.config.MAX_DISTANCE_UNITS + 1);
    },
  };

  //******************************************************************************

  /**
   * Cloud background item.
   * Similar to an obstacle object but without collision boxes.
   * @param {HTMLCanvasElement} canvas Canvas element.
   * @param {Object} spritePos Position of image in sprite.
   * @param {number} containerWidth
   */
  function Cloud(canvas, spritePos, containerWidth) {
    this.canvas = canvas;
    this.canvasCtx = this.canvas.getContext("2d");
    this.spritePos = spritePos;
    this.containerWidth = containerWidth;
    this.xPos = containerWidth;
    this.yPos = 0;
    this.remove = false;
    this.cloudGap = getRandomNum(
      Cloud.config.MIN_CLOUD_GAP,
      Cloud.config.MAX_CLOUD_GAP
    );

    this.init();
  }

  /**
   * Cloud object config.
   * @enum {number}
   */
  Cloud.config = {
    HEIGHT: 14,
    MAX_CLOUD_GAP: 400,
    MAX_SKY_LEVEL: 30,
    MIN_CLOUD_GAP: 100,
    MIN_SKY_LEVEL: 71,
    WIDTH: 46,
  };

  Cloud.prototype = {
    /**
     * Initialise the cloud. Sets the Cloud height.
     */
    init: function () {
      this.yPos = getRandomNum(
        Cloud.config.MAX_SKY_LEVEL,
        Cloud.config.MIN_SKY_LEVEL
      );
      this.draw();
    },

    /**
     * Draw the cloud.
     */
    draw: function () {
      this.canvasCtx.save();
      var sourceWidth = Cloud.config.WIDTH;
      var sourceHeight = Cloud.config.HEIGHT;

      if (IS_HIDPI) {
        sourceWidth = sourceWidth * 2;
        sourceHeight = sourceHeight * 2;
      }

      this.canvasCtx.drawImage(
        Runner.imageSprite,
        this.spritePos.x,
        this.spritePos.y,
        sourceWidth,
        sourceHeight,
        this.xPos,
        this.yPos,
        Cloud.config.WIDTH,
        Cloud.config.HEIGHT
      );

      this.canvasCtx.restore();
    },

    /**
     * Update the cloud position.
     * @param {number} speed
     */
    update: function (speed) {
      if (!this.remove) {
        this.xPos -= Math.ceil(speed);
        this.draw();

        // Mark as removeable if no longer in the canvas.
        if (!this.isVisible()) {
          this.remove = true;
        }
      }
    },

    /**
     * Check if the cloud is visible on the stage.
     * @return {boolean}
     */
    isVisible: function () {
      return this.xPos + Cloud.config.WIDTH > 0;
    },
  };

  //******************************************************************************

  /**
   * Nightmode shows a moon and stars on the horizon.
   */
  function NightMode(canvas, spritePos, containerWidth) {
    this.spritePos = spritePos;
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.xPos = containerWidth - 50;
    this.yPos = 30;
    this.currentPhase = 0;
    this.opacity = 0;
    this.containerWidth = containerWidth;
    this.stars = [];
    this.drawStars = false;
    this.placeStars();
  }

  /**
   * @enum {number}
   */
  NightMode.config = {
    FADE_SPEED: 0.035,
    HEIGHT: 40,
    MOON_SPEED: 0.25,
    NUM_STARS: 2,
    STAR_SIZE: 9,
    STAR_SPEED: 0.3,
    STAR_MAX_Y: 70,
    WIDTH: 20,
  };

  NightMode.phases = [140, 120, 100, 60, 40, 20, 0];

  NightMode.prototype = {
    /**
     * Update moving moon, changing phases.
     * @param {boolean} activated Whether night mode is activated.
     * @param {number} delta
     */
    update: function (activated, delta) {
      // Moon phase.
      if (activated && this.opacity == 0) {
        this.currentPhase++;

        if (this.currentPhase >= NightMode.phases.length) {
          this.currentPhase = 0;
        }
      }

      // Fade in / out.
      if (activated && (this.opacity < 1 || this.opacity == 0)) {
        this.opacity += NightMode.config.FADE_SPEED;
      } else if (this.opacity > 0) {
        this.opacity -= NightMode.config.FADE_SPEED;
      }

      // Set moon positioning.
      if (this.opacity > 0) {
        this.xPos = this.updateXPos(this.xPos, NightMode.config.MOON_SPEED);

        // Update stars.
        if (this.drawStars) {
          for (var i = 0; i < NightMode.config.NUM_STARS; i++) {
            this.stars[i].x = this.updateXPos(
              this.stars[i].x,
              NightMode.config.STAR_SPEED
            );
          }
        }
        this.draw();
      } else {
        this.opacity = 0;
        this.placeStars();
      }
      this.drawStars = true;
    },

    updateXPos: function (currentPos, speed) {
      if (currentPos < -NightMode.config.WIDTH) {
        currentPos = this.containerWidth;
      } else {
        currentPos -= speed;
      }
      return currentPos;
    },

    draw: function () {
      var moonSourceWidth =
        this.currentPhase == 3
          ? NightMode.config.WIDTH * 2
          : NightMode.config.WIDTH;
      var moonSourceHeight = NightMode.config.HEIGHT;
      var moonSourceX = this.spritePos.x + NightMode.phases[this.currentPhase];
      var moonOutputWidth = moonSourceWidth;
      var starSize = NightMode.config.STAR_SIZE;
      var starSourceX = Runner.spriteDefinition.LDPI.STAR.x;

      if (IS_HIDPI) {
        moonSourceWidth *= 2;
        moonSourceHeight *= 2;
        moonSourceX =
          this.spritePos.x + NightMode.phases[this.currentPhase] * 2;
        starSize *= 2;
        starSourceX = Runner.spriteDefinition.HDPI.STAR.x;
      }

      this.canvasCtx.save();
      this.canvasCtx.globalAlpha = this.opacity;

      // Stars.
      if (this.drawStars) {
        for (var i = 0; i < NightMode.config.NUM_STARS; i++) {
          this.canvasCtx.drawImage(
            Runner.imageSprite,
            starSourceX,
            this.stars[i].sourceY,
            starSize,
            starSize,
            Math.round(this.stars[i].x),
            this.stars[i].y,
            NightMode.config.STAR_SIZE,
            NightMode.config.STAR_SIZE
          );
        }
      }

      // Moon.
      this.canvasCtx.drawImage(
        Runner.imageSprite,
        moonSourceX,
        this.spritePos.y,
        moonSourceWidth,
        moonSourceHeight,
        Math.round(this.xPos),
        this.yPos,
        moonOutputWidth,
        NightMode.config.HEIGHT
      );

      this.canvasCtx.globalAlpha = 1;
      this.canvasCtx.restore();
    },

    // Do star placement.
    placeStars: function () {
      var segmentSize = Math.round(
        this.containerWidth / NightMode.config.NUM_STARS
      );

      for (var i = 0; i < NightMode.config.NUM_STARS; i++) {
        this.stars[i] = {};
        this.stars[i].x = getRandomNum(segmentSize * i, segmentSize * (i + 1));
        this.stars[i].y = getRandomNum(0, NightMode.config.STAR_MAX_Y);

        if (IS_HIDPI) {
          this.stars[i].sourceY =
            Runner.spriteDefinition.HDPI.STAR.y +
            NightMode.config.STAR_SIZE * 2 * i;
        } else {
          this.stars[i].sourceY =
            Runner.spriteDefinition.LDPI.STAR.y +
            NightMode.config.STAR_SIZE * i;
        }
      }
    },

    reset: function () {
      this.currentPhase = 0;
      this.opacity = 0;
      this.update(false);
    },
  };

  //******************************************************************************

  /**
   * Horizon Line.
   * Consists of two connecting lines. Randomly assigns a flat / bumpy horizon.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} spritePos Horizon position in sprite.
   * @constructor
   */
  function HorizonLine(canvas, spritePos) {
    this.spritePos = spritePos;
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext("2d");
    this.sourceDimensions = {};
    this.dimensions = HorizonLine.dimensions;
    this.sourceXPos = [
      this.spritePos.x,
      this.spritePos.x + this.dimensions.WIDTH,
    ];
    this.xPos = [];
    this.yPos = 0;
    this.bumpThreshold = 0.5;

    this.setSourceDimensions();
    this.draw();
  }

  /**
   * Horizon line dimensions.
   * @enum {number}
   */
  HorizonLine.dimensions = {
    WIDTH: 600,
    HEIGHT: 12,
    YPOS: 127,
  };

  HorizonLine.prototype = {
    /**
     * Set the source dimensions of the horizon line.
     */
    setSourceDimensions: function () {
      for (var dimension in HorizonLine.dimensions) {
        if (IS_HIDPI) {
          if (dimension != "YPOS") {
            this.sourceDimensions[dimension] =
              HorizonLine.dimensions[dimension] * 2;
          }
        } else {
          this.sourceDimensions[dimension] = HorizonLine.dimensions[dimension];
        }
        this.dimensions[dimension] = HorizonLine.dimensions[dimension];
      }

      this.xPos = [0, HorizonLine.dimensions.WIDTH];
      this.yPos = HorizonLine.dimensions.YPOS;
    },

    /**
     * Return the crop x position of a type.
     */
    getRandomType: function () {
      return Math.random() > this.bumpThreshold ? this.dimensions.WIDTH : 0;
    },

    /**
     * Draw the horizon line.
     */
    draw: function () {
      this.canvasCtx.drawImage(
        Runner.imageSprite,
        this.sourceXPos[0],
        this.spritePos.y,
        this.sourceDimensions.WIDTH,
        this.sourceDimensions.HEIGHT,
        this.xPos[0],
        this.yPos,
        this.dimensions.WIDTH,
        this.dimensions.HEIGHT
      );

      this.canvasCtx.drawImage(
        Runner.imageSprite,
        this.sourceXPos[1],
        this.spritePos.y,
        this.sourceDimensions.WIDTH,
        this.sourceDimensions.HEIGHT,
        this.xPos[1],
        this.yPos,
        this.dimensions.WIDTH,
        this.dimensions.HEIGHT
      );
    },

    /**
     * Update the x position of an indivdual piece of the line.
     * @param {number} pos Line position.
     * @param {number} increment
     */
    updateXPos: function (pos, increment) {
      var line1 = pos;
      var line2 = pos == 0 ? 1 : 0;

      this.xPos[line1] -= increment;
      this.xPos[line2] = this.xPos[line1] + this.dimensions.WIDTH;

      if (this.xPos[line1] <= -this.dimensions.WIDTH) {
        this.xPos[line1] += this.dimensions.WIDTH * 2;
        this.xPos[line2] = this.xPos[line1] - this.dimensions.WIDTH;
        this.sourceXPos[line1] = this.getRandomType() + this.spritePos.x;
      }
    },

    /**
     * Update the horizon line.
     * @param {number} deltaTime
     * @param {number} speed
     */
    update: function (deltaTime, speed) {
      var increment = speed * (FPS / 1000) * deltaTime;

      if (this.xPos[0] <= 0) {
        this.updateXPos(0, increment);
      } else {
        this.updateXPos(1, increment);
      }
      this.draw();
    },

    /**
     * Reset horizon to the starting position.
     */
    reset: function () {
      this.xPos[0] = 0;
      this.xPos[1] = HorizonLine.dimensions.WIDTH;
    },
  };

  //******************************************************************************

  /**
   * Horizon background class.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} spritePos Sprite positioning.
   * @param {Object} dimensions Canvas dimensions.
   * @param {number} gapCoefficient
   * @constructor
   */
  function Horizon(canvas, spritePos, dimensions, gapCoefficient) {
    this.canvas = canvas;
    this.canvasCtx = this.canvas.getContext("2d");
    this.config = Horizon.config;
    this.dimensions = dimensions;
    this.gapCoefficient = gapCoefficient;
    this.obstacles = [];
    this.horizonOffsets = [0, 0];
    this.cloudFrequency = this.config.CLOUD_FREQUENCY;
    this.spritePos = spritePos;
    this.nightMode = null;

    // Cloud
    this.clouds = [];
    this.cloudSpeed = this.config.BG_CLOUD_SPEED;

    // Horizon
    this.horizonLine = null;
    this.init();
  }

  /**
   * Horizon config.
   * @enum {number}
   */
  Horizon.config = {
    BG_CLOUD_SPEED: 0.2,
    BUMPY_THRESHOLD: 0.3,
    CLOUD_FREQUENCY: 0.5,
    HORIZON_HEIGHT: 16,
    MAX_CLOUDS: 6,
  };

  Horizon.prototype = {
    /**
     * Initialise the horizon. Just add the line and a cloud. No obstacles.
     */
    init: function () {
      this.addCloud();
      this.horizonLine = new HorizonLine(this.canvas, this.spritePos.HORIZON);
      this.nightMode = new NightMode(
        this.canvas,
        this.spritePos.MOON,
        this.dimensions.WIDTH
      );
    },

    /**
     * @param {number} deltaTime
     * @param {number} currentSpeed
     * @param {boolean} updateObstacles Used as an override to prevent
     *     the obstacles from being updated / added. This happens in the
     *     ease in section.
     * @param {boolean} showNightMode Night mode activated.
     */
    update: function (deltaTime, currentSpeed, updateObstacles, showNightMode) {
      this.runningTime += deltaTime;
      this.horizonLine.update(deltaTime, currentSpeed);
      this.nightMode.update(showNightMode);
      this.updateClouds(deltaTime, currentSpeed);

      if (updateObstacles) {
        this.updateObstacles(deltaTime, currentSpeed);
      }
    },

    /**
     * Update the cloud positions.
     * @param {number} deltaTime
     * @param {number} currentSpeed
     */
    updateClouds: function (deltaTime, speed) {
      var cloudSpeed = (this.cloudSpeed / 1000) * deltaTime * speed;
      var numClouds = this.clouds.length;

      if (numClouds) {
        for (var i = numClouds - 1; i >= 0; i--) {
          this.clouds[i].update(cloudSpeed);
        }

        var lastCloud = this.clouds[numClouds - 1];

        // Check for adding a new cloud.
        if (
          numClouds < this.config.MAX_CLOUDS &&
          this.dimensions.WIDTH - lastCloud.xPos > lastCloud.cloudGap &&
          this.cloudFrequency > Math.random()
        ) {
          this.addCloud();
        }

        // Remove expired clouds.
        this.clouds = this.clouds.filter(function (obj) {
          return !obj.remove;
        });
      } else {
        this.addCloud();
      }
    },

    /**
     * Update the obstacle positions.
     * @param {number} deltaTime
     * @param {number} currentSpeed
     */
    updateObstacles: function (deltaTime, currentSpeed) {
      // Obstacles, move to Horizon layer.
      var updatedObstacles = this.obstacles.slice(0);

      for (var i = 0; i < this.obstacles.length; i++) {
        var obstacle = this.obstacles[i];
        obstacle.update(deltaTime, currentSpeed);

        // Clean up existing obstacles.
        if (obstacle.remove) {
          updatedObstacles.shift();
        }
      }
      this.obstacles = updatedObstacles;

      if (this.obstacles.length > 0) {
        var lastObstacle = this.obstacles[this.obstacles.length - 1];

        if (
          lastObstacle &&
          !lastObstacle.followingObstacleCreated &&
          lastObstacle.isVisible() &&
          lastObstacle.xPos + lastObstacle.width + lastObstacle.gap <
            this.dimensions.WIDTH
        ) {
          this.addNewObstacle(currentSpeed);
          lastObstacle.followingObstacleCreated = true;
        }
      } else {
        // Create new obstacles.
        this.addNewObstacle(currentSpeed);
      }
    },

    removeFirstObstacle: function () {
      this.obstacles.shift();
    },

    /**
     * Add a new obstacle.
     * @param {number} currentSpeed
     */
    addNewObstacle: function (currentSpeed) {
      // Array of numeric values to be used as obstacles.
      const statusCodes = [
        200, 200, 200, 200, 301, 302, 404, 410, 418, 429, 500, 503,
      ];
      const value = statusCodes[Math.floor(Math.random() * statusCodes.length)];

      // Use the TEXT_SPRITE for drawing the numbers.
      const textSpritePos = this.spritePos.TEXT_SPRITE;

      this.obstacles.push(
        new Obstacle(
          this.canvasCtx,
          value, // Pass the numeric value instead of a type object
          textSpritePos,
          this.dimensions,
          this.gapCoefficient,
          currentSpeed
        )
      );
    },

    /**
     * Reset the horizon layer.
     * Remove existing obstacles and reposition the horizon line.
     */
    reset: function () {
      this.obstacles = [];
      this.horizonLine.reset();
      this.nightMode.reset();
    },

    /**
     * Update the canvas width and scaling.
     * @param {number} width Canvas width.
     * @param {number} height Canvas height.
     */
    resize: function (width, height) {
      this.canvas.width = width;
      this.canvas.height = height;
    },

    /**
     * Add a new cloud to the horizon.
     */
    addCloud: function () {
      this.clouds.push(
        new Cloud(this.canvas, this.spritePos.CLOUD, this.dimensions.WIDTH)
      );
    },
  };
})();

new Runner(".interstitial-wrapper");
