const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

canvas.style.touchAction = "none";
document.body.style.userSelect = "none";
document.body.style.webkitUserSelect = "none";
document.body.style.msUserSelect = "none";
document.body.style.MozUserSelect = "none";

let score = 0;
let comboStreak = 0;
let timeLeft = 100;
let activePage = null;
let gameLoopId = null; // Will hold the requestAnimationFrame ID
let lastFrameTime = 0;
let timeSinceLastSecond = 0;
let armAnimProgress = 0;
let pagesSeen = 0;
let correctDecisions = 0;
let incorrectDecisions = 0;
let garbagePileScale = 1;
let targetGarbagePileScale = 1;
let particles = []; // Array to hold active particles
let lastDecision = null;
let explanationBtn = null;
let discardedPagesCount = 0;
let trexWalkEventTriggered = false;
let isGamePausedForEvent = false;
let eventMessageDiv = null;

// --- Game Configuration ---
const CONFIG = {
  GAME_DURATION_SECONDS: 100,
  PAGE_TOSS_GRAVITY: 0.8,
  PAGE_TOSS_INITIAL_VERTICAL_VELOCITY: -15,
  TREX_DIP_Y: 40,
  TOSS_ANIM_DURATION_FRAMES: 25,
  RETRACT_ANIM_DURATION_FRAMES: 30,
  PILE_WIDTH_PERCENT: 0.18,
  PILE_ASPECT_RATIO: 1.2,
  PILE_HORIZONTAL_OFFSET_PERCENT: 0.17, // Percentage of canvas width to offset the pile
  PILE_MARGIN_PERCENT: 0.03,
  CHEST_WIDTH_PERCENT: 0.18,
  CHEST_ASPECT_RATIO: 1.2,
  CHEST_MARGIN_PERCENT: 0.03,
};

// --- T-Rex Manipulator ---
const trexSpriteImage = new Image();
trexSpriteImage.src = "trex_sprite.png";

// Sprite definition for T-Rex (based on HDPI from engine.js)
const TREX_SPRITE_POS = { x: 1678, y: 2 }; // Top-left on sprite sheet
const TREX_SPRITE_WIDTH = 88; // Width of a single frame on sprite sheet
const TREX_SPRITE_HEIGHT = 94; // Height of a single frame on sprite sheet

// Re-purposed animation frames for manipulator actions (HDPI)
const TREX_ANIM_FRAMES = {
  IDLE: { frames: [0, TREX_SPRITE_WIDTH], msPerFrame: 1000 / 3 }, // [open, blink]
  RUNNING: {
    frames: [TREX_SPRITE_WIDTH * 2, TREX_SPRITE_WIDTH * 3],
    msPerFrame: 1000 / 12,
  },
  // Use the static jumping frame from engine.js for the toss action
  TOSS: { frames: [0], msPerFrame: 1000 / 60 },
};

class TrexManipulator {
  constructor(ctx) {
    this.ctx = ctx;
    this.x = 0;
    this.y = 0;
    this.width = 0; // Will be set by updateSize
    this.height = 0; // Will be set by updateSize
    this.currentFrame = 0;
    this.animTimer = 0;
    this.status = "IDLE";
    this.frames = TREX_ANIM_FRAMES.IDLE.frames;
    this.msPerFrame = TREX_ANIM_FRAMES.IDLE.msPerFrame;
    this.isJumping = false;
    this.jumpTimer = 0;
    this.restingY = 0;
    this.restingX = 0;

    // Properties for blinking logic
    this.blinkTimer = 0;
    this.nextBlinkDelay = 0;
    this.isBlinking = false;

    // Properties for intro animation
    this.isIntroRunning = false;
    this.introTimer = 0;
    this.introDuration = 2500; // ms

    // Properties for mid-game walk animation
    this.isWalkingToCenter = false;
    this.walkToCenterTimer = 0;
    this.walkToCenterDuration = 2000; // ms
    this.onWalkComplete = null;

    this.updateSize();
    this.setNextBlinkDelay();
  }

  setNextBlinkDelay() {
    // Randomly between 3 to 5 seconds (3000ms to 5000ms)
    this.nextBlinkDelay = Math.random() * 2000 + 3000;
  }

  updateSize() {
    this.height = this.ctx.canvas.height / 3;
    const aspectRatio = TREX_SPRITE_WIDTH / TREX_SPRITE_HEIGHT;
    this.width = this.height * aspectRatio;
    this.restingX = this.ctx.canvas.width / 4 - this.width / 2;
    if (!this.isIntroRunning) {
      this.x = this.restingX;
    }
    this.restingY = this.ctx.canvas.height - this.height - 10;
    if (!this.isJumping) {
      this.y = this.restingY;
    }
  }

  jump() {
    if (!this.isJumping) {
      this.isJumping = true;
      this.jumpTimer = 0;
      this.setStatus("TOSS");
    }
  }

  startIntro() {
    this.isIntroRunning = true;
    this.introTimer = 0;
    this.x = -this.width; // Start off-screen
    this.setStatus("RUNNING");
  }

  walkToCenter(onComplete) {
    if (this.isWalkingToCenter) return;
    this.isWalkingToCenter = true;
    this.walkToCenterTimer = 0;
    this.onWalkComplete = onComplete;
    this.setStatus("RUNNING");
  }

  update(deltaTime) {
    // --- Intro Animation ---
    if (this.isIntroRunning) {
      this.introTimer += deltaTime;
      const introProgress = Math.min(this.introTimer / this.introDuration, 1);
      const startX = -this.width;
      this.x = startX + (this.restingX - startX) * easeInOutSine(introProgress);

      if (introProgress >= 1) {
        this.isIntroRunning = false;
        this.x = this.restingX;
        this.setStatus("IDLE");
      }
    }

    // --- Walk to Center Animation ---
    if (this.isWalkingToCenter) {
      this.walkToCenterTimer += deltaTime;
      const progress = Math.min(
        this.walkToCenterTimer / this.walkToCenterDuration,
        1
      );
      const startX = this.restingX;
      const endX = this.ctx.canvas.width / 3 - this.width / 2; // Move to 1/3 of canvas width
      this.x = startX + (endX - startX) * easeInOutSine(progress);

      if (progress >= 1) {
        this.isWalkingToCenter = false;
        this.restingX = endX;
        this.x = this.restingX;
        this.setStatus("IDLE");
        if (this.onWalkComplete) this.onWalkComplete();
      }
    }

    // --- Blinking/Frame Animation Logic ---
    if (this.status === "IDLE") {
      this.blinkTimer += deltaTime;
      if (this.isBlinking) {
        // A blink is short. After 150ms, stop blinking.
        if (this.blinkTimer > 150) {
          this.isBlinking = false;
          this.blinkTimer = 0;
          this.setNextBlinkDelay();
        }
      } else if (this.blinkTimer > this.nextBlinkDelay) {
        // Time to blink.
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
      // Set frame based on state. IDLE frames are [open, blink].
      this.currentFrame = this.isBlinking ? 1 : 0;
    } else {
      // Regular animation for other states (e.g., TOSS)
      this.animTimer += deltaTime;
      if (this.animTimer >= this.msPerFrame) {
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        this.animTimer = 0;
      }
    }

    // --- Jump Position Logic ---
    if (this.isJumping) {
      this.jumpTimer += deltaTime;

      const tossDurationMs = CONFIG.TOSS_ANIM_DURATION_FRAMES * (1000 / 60);
      const retractDurationMs =
        CONFIG.RETRACT_ANIM_DURATION_FRAMES * (1000 / 60);
      const totalDurationMs = tossDurationMs + retractDurationMs;
      const jumpPeakY = this.restingY - CONFIG.TREX_DIP_Y * 2;

      if (this.jumpTimer <= tossDurationMs) {
        const progress = easeInOutSine(this.jumpTimer / tossDurationMs);
        this.y = this.restingY + (jumpPeakY - this.restingY) * progress;
      } else if (this.jumpTimer <= totalDurationMs) {
        const progress = easeInOutSine(
          (this.jumpTimer - tossDurationMs) / retractDurationMs
        );
        this.y = jumpPeakY + (this.restingY - jumpPeakY) * progress;
      } else {
        this.isJumping = false;
        this.y = this.restingY;
        this.setStatus("IDLE");
      }
    }
  }

  setStatus(newStatus) {
    if (this.status !== newStatus && TREX_ANIM_FRAMES[newStatus]) {
      this.status = newStatus;
      this.frames = TREX_ANIM_FRAMES[newStatus].frames;
      this.msPerFrame = TREX_ANIM_FRAMES[newStatus].msPerFrame;
      this.currentFrame = 0;
      this.animTimer = 0;
      if (newStatus === "IDLE") {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.setNextBlinkDelay();
      }
    }
  }

  draw() {
    if (!trexSpriteImage.complete) return;
    const frameX = this.frames[this.currentFrame];
    this.ctx.drawImage(
      trexSpriteImage,
      TREX_SPRITE_POS.x + frameX,
      TREX_SPRITE_POS.y,
      TREX_SPRITE_WIDTH,
      TREX_SPRITE_HEIGHT,
      this.x,
      this.y,
      this.width,
      this.height
    );
  }
}

let trexManipulator = new TrexManipulator(ctx);

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

const pageImage = new Image();
pageImage.src = "page.png";

const treasureChestImage = new Image();
treasureChestImage.src = "database.png";

const garbagePileImage = new Image();
garbagePileImage.src = "garbage.png";

const backgroundImage = new Image();
backgroundImage.src = "background.png";

let touchStartX = 0;
let touchEndX = 0;

canvas.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
});

canvas.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].clientX;
  handleSwipeGesture();
});

function handleSwipeGesture() {
  const dx = touchEndX - touchStartX;
  if (Math.abs(dx) > 50) {
    if (dx < 0) discardPage();
    else keepPage();
  }
}

function startGame() {
  document.getElementById("introScreen").style.display = "none";
  document.getElementById("gameUI").style.display = "block";
  animateCanvasResize();
  if (!explanationBtn) {
    createExplanationButton();
  }
  score = 0;
  comboStreak = 0;
  timeLeft = CONFIG.GAME_DURATION_SECONDS;
  pagesSeen = 0;
  correctDecisions = 0;
  incorrectDecisions = 0;
  garbagePileScale = 1;
  targetGarbagePileScale = 1;
  particles = []; // Clear particles on new game
  activePage = null;
  document.getElementById("score").textContent = score;
  trexManipulator.updateSize(); // Recalculate size and position for new game
  discardedPagesCount = 0;
  trexWalkEventTriggered = false;
  isGamePausedForEvent = false;
  trexManipulator.startIntro();
  document.getElementById("timer").textContent = timeLeft;
  updateComboDisplay();
}

function endGame() {
  if (gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  }

  // Create a translucent overlay for the canvas
  const overlay = document.createElement("div");
  const canvasRect = canvas.getBoundingClientRect();
  Object.assign(overlay.style, {
    position: "absolute",
    top: `${canvasRect.top}px`,
    left: `${canvasRect.left}px`,
    width: `${canvasRect.width}px`,
    height: `${canvasRect.height}px`,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: "999",
  });
  document.body.appendChild(overlay);

  const totalDecisions = correctDecisions + incorrectDecisions;
  const accuracy =
    totalDecisions > 0
      ? ((correctDecisions / totalDecisions) * 100).toFixed(1)
      : "0.0";
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#222";
  modal.style.color = "#fff";
  modal.style.padding = "30px";
  modal.style.borderRadius = "12px";
  modal.style.textAlign = "center";
  modal.style.zIndex = "1000";
  modal.innerHTML = `<h2>Congrats!</h2>
    <p>Your final score is: <strong>${score}</strong></p>
    <div style="text-align: left; margin: 20px 0; padding: 10px; border: 1px solid #444; border-radius: 8px; background: #333;">
      <h3 style="margin-top: 0; text-align: center;">Game Stats</h3>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Pages Sorted:</span><span>${totalDecisions}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Correct:</span><span style="color: #4CAF50;">${correctDecisions}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Incorrect:</span><span style="color: #F44336;">${incorrectDecisions}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>Accuracy:</span><strong>${accuracy}%</strong></div>
    </div>
    <button id='restartBtn'>Play Again</button>
  `;

  document.body.appendChild(modal);
  document.getElementById("restartBtn").onclick = () => {
    document.body.removeChild(modal);
    document.body.removeChild(overlay); // Also remove the overlay
    startGame();
  };
  document.getElementById("gameUI").style.display = "none";
}

function updateComboDisplay() {
  const comboLabel = document.getElementById("combo");
  if (!comboLabel) return;
  if (comboStreak >= 5) {
    const multiplier = 1 + Math.floor(comboStreak / 5);
    const glowAmount = (multiplier - 1) * 5;
    comboLabel.textContent = `Combo x${multiplier}`;
    comboLabel.style.visibility = "visible";
    comboLabel.style.textShadow = `0 0 ${glowAmount}px #ffd700`;
  } else {
    comboLabel.style.visibility = "hidden";
    comboLabel.style.textShadow = "none";
  }
}

function spawnPage() {
  pagesSeen++;
  const statusCodes = [200, 200, 200, 200, 301, 302, 404, 410, 418, 500, 503];
  const statusCode =
    statusCodes[Math.floor(Math.random() * statusCodes.length)];
  const isErrorPage = statusCode === 200 ? Math.random() < 0.3 : true;
  const quality =
    statusCode === 200
      ? ["high", "medium", "low"][Math.floor(Math.random() * 3)]
      : "-";
  armAnimProgress = 0;
  const pageHeight = canvas.height * 0.6;
  const pageWidth = pageHeight * (393 / 269); // Maintain aspect ratio for new 393x269 image

  activePage = {
    statusCode,
    isErrorPage,
    quality,
    x: 60,
    y: canvas.height - 100,
    width: pageWidth,
    height: pageHeight,
    state: "intro",
    stateTimer: 0,
    scale: 1,
    vx: 0, // Velocity X
    vy: 0, // Velocity Y
    rotation: 0, // Current rotation angle
    _decisionMade: false,
    _moveDirection: null,
  };
}

function updateGame(deltaTime) {
  // Animate garbage pile growth
  if (!isGamePausedForEvent) {
    garbagePileScale += (targetGarbagePileScale - garbagePileScale) * 0.1;
  }
  updateParticles(); // Update particle positions and states

  // --- Update game state first ---
  if (activePage && !isGamePausedForEvent) {
    updatePageState(activePage);
    if (
      activePage.state === "scrollOut" &&
      (activePage.y > canvas.height ||
        activePage.x < -200 ||
        activePage.x > canvas.width + 200)
    ) {
      activePage = null;
    }
  }

  if (!activePage && !trexManipulator.isIntroRunning && !isGamePausedForEvent)
    spawnPage();

  // --- Then draw everything ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage.complete) {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  }
  trexManipulator.draw();
  drawGarbagePile(); // Draw the garbage pile
  drawTreasureChest(); // Draw the treasure chest
  drawParticles(); // Draw particles on top of other elements

  if (activePage) {
    drawPage(activePage);
    if (
      isMobile &&
      pagesSeen <= 3 &&
      activePage.state === "focus" &&
      activePage.stateTimer > 15
    ) {
      drawSwipeCues(activePage);
    }
  }

  trexManipulator.update(deltaTime);
}

function updatePageState(page) {
  // Handle the decision to toss the page, regardless of current state (as long as it's not already tossing)
  if (page._decisionMade && page.state !== "scrollOut") {
    page.state = "scrollOut";
    page.stateTimer = 0; // Reset timer for the toss animation
    // --- Calculate physics for a realistic toss towards the target ---
    const startX = page.x + page.width / 2;
    const startY = page.y + page.height / 2;

    let targetX, targetY;

    if (page._moveDirection === "discard") {
      // Target: Garbage pile area (bottom-left)
      const pileWidth = canvas.width * CONFIG.PILE_WIDTH_PERCENT;
      const pileHeight = pileWidth / CONFIG.PILE_ASPECT_RATIO;
      const pileX =
        canvas.width *
        (CONFIG.PILE_MARGIN_PERCENT - CONFIG.PILE_HORIZONTAL_OFFSET_PERCENT);
      const pileY = canvas.height - pileHeight + 40; // Move down
      targetX = pileX + pileWidth / 2 + (Math.random() - 0.5) * 40; // Center of pile + random offset
      targetY = pileY + pileHeight / 2; // Aim for vertical middle of pile
      page.rotationSpeed = -(Math.random() * 0.2 + 0.05); // Random spin left
    } else {
      // Target: Treasure chest area (bottom-right)
      const chestWidth = canvas.width * CONFIG.CHEST_WIDTH_PERCENT;
      const chestHeight = chestWidth / CONFIG.CHEST_ASPECT_RATIO;
      const chestX =
        canvas.width - chestWidth - canvas.width * CONFIG.CHEST_MARGIN_PERCENT;
      const chestY = canvas.height - chestHeight;
      targetX = chestX + chestWidth / 2 + (Math.random() - 0.5) * 40; // Center of chest + random offset
      targetY = chestY + chestHeight / 2; // Aim for vertical middle of chest
      page.rotationSpeed = Math.random() * 0.2 + 0.05; // Random spin right
    }

    const g = CONFIG.PAGE_TOSS_GRAVITY;
    const v0y = CONFIG.PAGE_TOSS_INITIAL_VERTICAL_VELOCITY;
    const t = (-v0y + Math.sqrt(v0y * v0y + 2 * g * (targetY - startY))) / g;
    page.vx = (targetX - startX) / t;
    page.vy = v0y;
    trexManipulator.jump();
    return; // Exit after setting up the toss
  }

  // Calculate the target Y position to be the vertical center of the canvas.
  const pageTargetY = canvas.height / 2 - page.height / 2;
  switch (page.state) {
    case "intro":
      // Animate the page from its spawn point to the center of the screen.
      armAnimProgress += 0.02;
      if (armAnimProgress > 1) armAnimProgress = 1;
      const easedProgress = easeInOutSine(armAnimProgress);
      // Calculate X position for horizontal centering
      page.x = 60 + (canvas.width / 2 - page.width / 2 - 60) * easedProgress;
      // Calculate Y position for vertical centering
      page.y =
        canvas.height -
        100 +
        (pageTargetY - (canvas.height - 100)) * easedProgress;
      if (armAnimProgress >= 1) {
        trexManipulator.setStatus("IDLE");
        page.state = "focus";
      }
      break;
    case "focus":
      // The decision logic is now handled above the switch statement.
      // This case now only handles the zoom-in and transition to 'decision' state.
      if (page.scale < 1.2) page.scale += 0.01;
      else {
        page.scale = 1.2;
        page.stateTimer++;
        if (page.stateTimer > 60) page.state = "decision";
      }
      break;
    case "decision":
      // The page is waiting for user input. The decision is handled above the switch.
      break;
    case "scrollOut":
      page.stateTimer++;
      if (page.scale > 1) page.scale -= 0.01;

      // Apply physics
      page.vy += CONFIG.PAGE_TOSS_GRAVITY; // Apply gravity
      page.x += page.vx; // Update X position
      page.y += page.vy; // Update Y position
      page.rotation += page.rotationSpeed; // Update rotation
      break;
  }
}

function drawGarbagePile() {
  if (!garbagePileImage.complete) return; // Don't draw if the image hasn't loaded yet

  // Define garbage pile size and position relative to canvas dimensions
  // This ensures the pile scales with the game area
  const pileWidth = canvas.width * CONFIG.PILE_WIDTH_PERCENT;
  const pileHeight = pileWidth / CONFIG.PILE_ASPECT_RATIO;

  // Base position for the pile
  const baseX =
    canvas.width *
    (CONFIG.PILE_MARGIN_PERCENT - CONFIG.PILE_HORIZONTAL_OFFSET_PERCENT);
  const baseY = canvas.height - pileHeight + 40; // Positioned lower

  // Apply the dynamic scale
  const scaledWidth = pileWidth * garbagePileScale;
  const scaledHeight = pileHeight * garbagePileScale;

  // Adjust X and Y to make it grow from the bottom-center
  const drawX = baseX + (pileWidth - scaledWidth) / 2;
  const drawY = baseY + (pileHeight - scaledHeight);

  ctx.drawImage(garbagePileImage, drawX, drawY, scaledWidth, scaledHeight);
}

function drawTreasureChest() {
  if (!treasureChestImage.complete) return; // Don't draw if the image hasn't loaded yet

  // Define chest size and position relative to canvas dimensions
  // This ensures the chest scales with the game area
  const chestWidth = canvas.width * CONFIG.CHEST_WIDTH_PERCENT;
  const chestHeight = chestWidth / CONFIG.CHEST_ASPECT_RATIO;

  // Position it in the bottom right corner with a small margin
  const chestX =
    canvas.width - chestWidth - canvas.width * CONFIG.CHEST_MARGIN_PERCENT;
  const chestY = canvas.height - chestHeight; // Positioned at the bottom

  ctx.drawImage(treasureChestImage, chestX, chestY, chestWidth, chestHeight);
}

function drawSwipeCues(page) {
  const animCycle = (Date.now() / 600) % 1;
  const alpha = 0.4 + Math.sin(animCycle * Math.PI) * 0.4; // Fades in and out
  const offset = Math.sin(Date.now() / 250) * 10; // Moves back and forth

  const visualPageWidth = page.width * page.scale;
  const visualPageHeight = page.height * page.scale;
  const visualPageX = page.x + page.width / 2 - visualPageWidth / 2;
  const visualPageY = page.y + page.height / 2 - visualPageHeight / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.font = `bold 48px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cueY = visualPageY + visualPageHeight / 2;

  // Left cue for "discard"
  const leftCueX = visualPageX - 50;
  ctx.fillText("«", leftCueX + offset, cueY);

  // Right cue for "keep"
  const rightCueX = visualPageX + visualPageWidth + 50;
  ctx.fillText("»", rightCueX - offset, cueY);

  ctx.restore();
}

function drawPage(page) {
  ctx.save();
  ctx.translate(page.x + page.width / 2, page.y + page.height / 2);
  // Correct order for rotation and scaling around the center
  ctx.rotate(page.rotation);
  ctx.scale(page.scale, page.scale);
  ctx.translate(-page.width / 2, -page.height / 2);

  if (pageImage.complete) {
    ctx.drawImage(pageImage, 0, 0, page.width, page.height);
  } else {
    ctx.fillStyle = "#e3dcc5";
    ctx.fillRect(0, 0, page.width, page.height);
  }

  const baseWidth = 393; // The original width for which the text was designed
  const scaleFactor = page.width / baseWidth;

  const paddingX = 35 * scaleFactor;
  const startY = 50 * scaleFactor;
  const lineHeight = 30 * scaleFactor;
  const fontSize = 18 * scaleFactor;

  ctx.fillStyle = "#000";
  ctx.font = `${fontSize}px monospace`;
  ctx.fillText(`Status: ${page.statusCode}`, paddingX, startY);
  ctx.fillText(
    `Error: ${page.isErrorPage ? "Yes" : "No"}`,
    paddingX,
    startY + lineHeight
  );
  ctx.fillText(`Quality: ${page.quality}`, paddingX, startY + lineHeight * 2);
  ctx.restore();
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2; // Apply slight gravity
    p.alpha -= 0.015; // Fade out
    p.size -= 0.05; // Shrink

    if (p.alpha <= 0 || p.size <= 0) {
      particles.splice(i, 1); // Remove dead particles
    }
  }
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function createTreasureBurstParticles() {
  const chestWidth = canvas.width * CONFIG.CHEST_WIDTH_PERCENT;
  const chestHeight = chestWidth / CONFIG.CHEST_ASPECT_RATIO;
  const chestX =
    canvas.width - chestWidth - canvas.width * CONFIG.CHEST_MARGIN_PERCENT;
  const chestY = canvas.height - chestHeight;
  const centerX = chestX + chestWidth / 2;
  const centerY = chestY + chestHeight / 2;
  const numParticles = 25;
  const particleColor = "#FFD700"; // Gold color

  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * Math.PI * 2; // Random direction
    const speed = Math.random() * 5 + 2; // Random speed
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    particles.push({
      x: centerX,
      y: centerY,
      vx: vx,
      vy: vy,
      size: Math.random() * 5 + 3, // Random size
      alpha: 1,
      color: particleColor,
    });
  }
}

function keepPage() {
  if (!activePage || activePage.state === "scrollOut") return;
  const { statusCode, isErrorPage, quality } = activePage;
  if (!activePage._decisionMade) {
    recordDecision(activePage, "keep");
    let basePoints = 0;
    if (statusCode === 200 && !isErrorPage) {
      correctDecisions++;
      if (quality === "high") basePoints = 3;
      else if (quality === "medium") basePoints = 2;
      else basePoints = 1;

      comboStreak++;
      score += basePoints + Math.floor(comboStreak / 5);
      createTreasureBurstParticles(); // Trigger particle burst
    } else {
      incorrectDecisions++;
      comboStreak = 0;
    }
    document.getElementById("score").textContent = score;
    updateComboDisplay();
    activePage._decisionMade = true;
    activePage._moveDirection = "keep";
  }
}

function discardPage() {
  if (!activePage || activePage.state === "scrollOut") return;
  const { statusCode, isErrorPage } = activePage;
  if (!activePage._decisionMade) {
    discardedPagesCount++;
    if (discardedPagesCount >= 15 && !trexWalkEventTriggered) {
      trexWalkEventTriggered = true; // Prevent re-triggering
      triggerTrexWalkEvent();
    }
    recordDecision(activePage, "discard");
    if (statusCode !== 200 || isErrorPage) {
      correctDecisions++;
      comboStreak++;
      score += 1 + Math.floor(comboStreak / 5);
      targetGarbagePileScale += 0.05; // Make the pile grow
    } else {
      incorrectDecisions++;
      comboStreak = 0;
    }
    document.getElementById("score").textContent = score;
    updateComboDisplay();
    activePage._decisionMade = true;
    activePage._moveDirection = "discard";
  }
}

function triggerTrexWalkEvent() {
  isGamePausedForEvent = true;

  if (!eventMessageDiv) {
    eventMessageDiv = document.createElement("div");
    eventMessageDiv.id = "eventMessage";
    Object.assign(eventMessageDiv.style, {
      position: "absolute",
      top: "30%",
      left: "50%",
      transform: "translateX(-50%)",
      color: "white",
      fontSize: "2em",
      fontWeight: "bold",
      textShadow: "2px 2px 4px #000",
      zIndex: "100",
      display: "none",
    });
    document.body.appendChild(eventMessageDiv);
  }

  eventMessageDiv.textContent = "hang on a second";
  eventMessageDiv.style.display = "block";

  trexManipulator.walkToCenter(() => {
    isGamePausedForEvent = false;
    eventMessageDiv.style.display = "none";
  });
}

function recordDecision(page, action) {
  lastDecision = {
    statusCode: page.statusCode,
    isErrorPage: page.isErrorPage,
    quality: page.quality,
    action: action,
  };
  if (explanationBtn) explanationBtn.style.display = "flex";
}

function createExplanationButton() {
  explanationBtn = document.createElement("div");
  explanationBtn.id = "explanationBtn";
  explanationBtn.textContent = "?";
  Object.assign(explanationBtn.style, {
    position: "absolute",
    top: "20px",
    right: "20px",
    width: "40px",
    height: "40px",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    color: "white",
    borderRadius: "50%",
    display: "none", // Initially hidden
    justifyContent: "center",
    alignItems: "center",
    fontSize: "24px",
    fontWeight: "bold",
    cursor: "pointer",
    zIndex: "20",
    userSelect: "none",
  });
  document.body.appendChild(explanationBtn);
  explanationBtn.addEventListener("click", showExplanationModal);
}

function showExplanationModal() {
  if (!lastDecision) return;

  const { statusCode, isErrorPage, action } = lastDecision;
  let explanation = "";
  let title = "";

  const wasGoodPage = statusCode === 200 && !isErrorPage;

  if (action === "keep") {
    if (wasGoodPage) {
      title = "Correct!";
      explanation = `You correctly kept this page. Pages with status 200 and no errors are valuable and earn you points.`;
    } else {
      title = "Incorrect!";
      explanation = `You kept this page even though it had a status of ${statusCode}${
        isErrorPage ? " and was an error page" : ""
      }. These pages should be discarded. You didn't get any points.`;
    }
  } else {
    // action === 'discard'
    if (!wasGoodPage) {
      title = "Correct!";
      explanation = `You correctly discarded this page. Pages with status ${statusCode}${
        isErrorPage ? " or that are error pages" : ""
      } are not valuable.`;
    } else {
      title = "Incorrect!";
      explanation = `You discarded a valuable page. This page had a status of 200 and no errors, so it should have been kept to earn points.`;
    }
  }

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#222",
    color: "#fff",
    padding: "30px",
    borderRadius: "12px",
    textAlign: "center",
    zIndex: "1001",
    maxWidth: "400px",
  });
  modal.innerHTML = `<h2>${title}</h2><p>${explanation}</p><button id='closeExplanationBtn'>Got it</button>`;
  document.body.appendChild(modal);
  document.getElementById("closeExplanationBtn").onclick = () => {
    document.body.removeChild(modal);
  };
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") keepPage();
  if (e.key === "ArrowLeft") discardPage();
});

function gameLoop(timestamp) {
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  // Update game logic
  updateGame(deltaTime);

  // Update 1-second timer
  if (!isGamePausedForEvent) {
    timeSinceLastSecond += deltaTime;
    if (timeSinceLastSecond >= 1000) {
      timeLeft--;
      document.getElementById("timer").textContent = timeLeft;
      if (timeLeft <= 0) {
        endGame();
        return; // Stop the loop
      }
      timeSinceLastSecond -= 1000;
    }
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

function animateCanvasResize(duration = 500) {
  const startHeight = canvas.height;
  const endHeight = window.innerHeight * 0.5;
  const startTime = performance.now();
  function animate(time) {
    const progress = Math.min((time - startTime) / duration, 1);
    const currentHeight = startHeight + (endHeight - startHeight) * progress;
    canvas.height = currentHeight;
    canvas.width = window.innerWidth;
    trexManipulator.updateSize(); // Update size and position on each frame
    canvas.style.position = "absolute";
    canvas.style.top = `${(window.innerHeight - currentHeight) / 2}px`;
    canvas.style.left = "0";
    if (progress < 1) requestAnimationFrame(animate);
    else {
      positionUIBelowCanvas();
      // Start the main game loop
      lastFrameTime = 0;
      timeSinceLastSecond = 0;
      gameLoopId = requestAnimationFrame(gameLoop);
    }
  }
  requestAnimationFrame(animate);
}

function positionUIBelowCanvas() {
  const ui = document.getElementById("gameUI");
  ui.style.position = "absolute";
  ui.style.top = `${canvas.offsetTop + canvas.height + 20}px`;
  ui.style.left = "50%";
  ui.style.transform = "translateX(-50%)";
  ui.style.display = "flex";
  ui.style.flexDirection = "column";
  ui.style.alignItems = "center";
  ui.style.justifyContent = "center";
}

function resizeCanvasToHalfHeight() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight * 0.5;
}

window.addEventListener("resize", () => {
  if (gameLoopId) {
    resizeCanvasToHalfHeight();
    trexManipulator.updateSize();
    positionUIBelowCanvas();
  }
});
