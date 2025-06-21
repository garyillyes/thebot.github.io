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
let gameInterval, timerInterval;
let armAnimProgress = 0;
let pagesSeen = 0;
let correctDecisions = 0;
let incorrectDecisions = 0;
let garbagePileScale = 1;
let targetGarbagePileScale = 1;
let particles = []; // Array to hold active particles
let lastDecision = null;
let explanationBtn = null;

// Constants for page tossing physics
const PAGE_TOSS_GRAVITY = 0.8; // How fast the page falls (pixels/frame^2)
const PAGE_TOSS_INITIAL_VERTICAL_VELOCITY = -15; // Initial upward velocity (pixels/frame)

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

const scrollImage = new Image();
scrollImage.src = "scroll.png";

const treasureChestImage = new Image();
treasureChestImage.src = "treasure_chest.png";

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
  timeLeft = 100;
  pagesSeen = 0;
  correctDecisions = 0;
  incorrectDecisions = 0;
  garbagePileScale = 1;
  targetGarbagePileScale = 1;
  particles = []; // Clear particles on new game
  activePage = null;
  document.getElementById("score").textContent = score;
  document.getElementById("timer").textContent = timeLeft;
  updateComboDisplay();
}

function endGame() {
  clearInterval(gameInterval);
  clearInterval(timerInterval);

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
  const pageWidth = pageHeight * (180 / 252); // Maintain aspect ratio

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

function updateGame() {
  // Animate garbage pile growth
  garbagePileScale += (targetGarbagePileScale - garbagePileScale) * 0.1;
  updateParticles(); // Update particle positions and states

  // --- Update game state first ---
  if (activePage) {
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

  if (!activePage) spawnPage();

  // --- Then draw everything ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage.complete) {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  }
  drawRobotArm();
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
      const pileWidth = canvas.width * 0.18;
      const pileHeight = pileWidth / 1.2;
      const pileX = canvas.width * 0.03;
      const pileY = canvas.height - pileHeight;
      targetX = pileX + pileWidth / 2 + (Math.random() - 0.5) * 40; // Center of pile + random offset
      targetY = pileY + pileHeight / 2; // Aim for vertical middle of pile
      page.rotationSpeed = -(Math.random() * 0.2 + 0.05); // Random spin left
    } else {
      // Target: Treasure chest area (bottom-right)
      const chestWidth = canvas.width * 0.18;
      const chestHeight = chestWidth / 1.2;
      const chestX = canvas.width - chestWidth - canvas.width * 0.03;
      const chestY = canvas.height - chestHeight;
      targetX = chestX + chestWidth / 2 + (Math.random() - 0.5) * 40; // Center of chest + random offset
      targetY = chestY + chestHeight / 2; // Aim for vertical middle of chest
      page.rotationSpeed = Math.random() * 0.2 + 0.05; // Random spin right
    }

    const g = PAGE_TOSS_GRAVITY;
    const v0y = PAGE_TOSS_INITIAL_VERTICAL_VELOCITY;
    const t = (-v0y + Math.sqrt(v0y * v0y + 2 * g * (targetY - startY))) / g;
    page.vx = (targetX - startX) / t;
    page.vy = v0y;
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
      page.stateTimer++; // Increment the timer for the arm animation
      if (page.scale > 1) page.scale -= 0.01;
      // Apply physics
      page.vy += PAGE_TOSS_GRAVITY; // Apply gravity
      page.x += page.vx; // Update X position
      page.y += page.vy; // Update Y position
      page.rotation += page.rotationSpeed; // Update rotation
      break;
  }
}

function drawRobotArm() {
  const shoulderX = canvas.width / 2;
  const shoulderY = 0; // Fixed shoulder joint at top-center

  // Arm segment lengths, relative to canvas height for responsiveness
  const armSegmentLength1 = canvas.height * 0.3; // Upper arm
  const armSegmentLength2 = canvas.height * 0.3; // Forearm

  // --- Determine Target Position for the Gripper ---
  let targetX = shoulderX;
  let targetY = canvas.height / 2; // Default resting position

  if (activePage) {
    // Target the top-center of the page's final position
    const pageRestingY = canvas.height / 2 - activePage.height / 2;
    const pageRestingX = canvas.width / 2;

    if (activePage.state === "intro") {
      // Animate the target point during the intro animation
      const easedProgress = easeInOutSine(armAnimProgress);
      const startX = 60 + activePage.width / 2;
      const startY = canvas.height - 100;
      targetX = startX + (pageRestingX - startX) * easedProgress;
      targetY = startY + (pageRestingY - startY) * easedProgress;
    } else if (activePage.state === "scrollOut") {
      const followThroughDuration = 25; // frames for follow-through
      const retractDuration = 30; // frames for retraction

      const releaseX = pageRestingX;
      const releaseY = pageRestingY;

      // Define the point the arm extends to during the toss
      const followThroughTargetX =
        releaseX + (activePage._moveDirection === "discard" ? -150 : 150);
      const followThroughTargetY = releaseY + 100;

      // Default resting position for the arm
      const restingArmX = shoulderX;
      const restingArmY = canvas.height / 2;

      const timer = activePage.stateTimer;

      if (timer <= followThroughDuration) {
        // Phase 1: Animate from release point to follow-through point
        const progress = easeInOutSine(timer / followThroughDuration);
        targetX = releaseX + (followThroughTargetX - releaseX) * progress;
        targetY = releaseY + (followThroughTargetY - releaseY) * progress;
      } else if (timer <= followThroughDuration + retractDuration) {
        // Phase 2: Animate from follow-through point to resting position
        const progress = easeInOutSine(
          (timer - followThroughDuration) / retractDuration
        );
        targetX =
          followThroughTargetX +
          (restingArmX - followThroughTargetX) * progress;
        targetY =
          followThroughTargetY +
          (restingArmY - followThroughTargetY) * progress;
      } else {
        // Animation finished, stay at resting position
        targetX = restingArmX;
        targetY = restingArmY;
      }
    } else {
      // When in focus or other states, keep it above the page
      targetX = pageRestingX;
      targetY = pageRestingY;
    }
  }

  // --- Inverse Kinematics Calculation ---
  const dx = targetX - shoulderX;
  const dy = targetY - shoulderY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Check if the target is reachable
  if (dist > armSegmentLength1 + armSegmentLength2) {
    // Target is too far, stretch the arm towards it
    const angle = Math.atan2(dy, dx);
    const elbowX = shoulderX + armSegmentLength1 * Math.cos(angle);
    const elbowY = shoulderY + armSegmentLength1 * Math.sin(angle);
    drawArticulatedArm(shoulderX, shoulderY, elbowX, elbowY, targetX, targetY);
    return;
  }

  // Law of Cosines to find elbow angle
  const angle2_cos =
    (dist * dist -
      armSegmentLength1 * armSegmentLength1 -
      armSegmentLength2 * armSegmentLength2) /
    (2 * armSegmentLength1 * armSegmentLength2);
  const angle2 = Math.acos(angle2_cos); // Elbow angle relative to the first segment

  // Find shoulder angle
  const angle1_base = Math.atan2(dy, dx);
  const angle1_offset_cos =
    (dist * dist +
      armSegmentLength1 * armSegmentLength1 -
      armSegmentLength2 * armSegmentLength2) /
    (2 * dist * armSegmentLength1);
  const angle1_offset = Math.acos(angle1_offset_cos);
  const angle1 = angle1_base - angle1_offset; // Final shoulder angle

  const elbowX = shoulderX + armSegmentLength1 * Math.cos(angle1);
  const elbowY = shoulderY + armSegmentLength1 * Math.sin(angle1);

  drawArticulatedArm(shoulderX, shoulderY, elbowX, elbowY, targetX, targetY);
}

function drawArticulatedArm(shoulderX, shoulderY, elbowX, elbowY, endX, endY) {
  ctx.save();
  ctx.strokeStyle = "#555"; // Darker metal color
  ctx.fillStyle = "#888";
  ctx.lineWidth = 20; // Thicker arm segments
  ctx.lineCap = "round"; // Rounded ends for a softer look

  // Draw arm segments
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw joints as circles
  ctx.beginPath();
  ctx.arc(shoulderX, shoulderY, 15, 0, Math.PI * 2); // Shoulder joint
  ctx.fill();
  ctx.beginPath();
  ctx.arc(elbowX, elbowY, 15, 0, Math.PI * 2); // Elbow joint
  ctx.fill();

  // Draw a more detailed gripper
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#444";
  const gripperAngle = Math.atan2(endY - elbowY, endX - elbowX);
  const gripperLength = 25;

  // Gripper part 1
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX + gripperLength * Math.cos(gripperAngle + Math.PI / 4),
    endY + gripperLength * Math.sin(gripperAngle + Math.PI / 4)
  );
  ctx.stroke();

  // Gripper part 2
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX + gripperLength * Math.cos(gripperAngle - Math.PI / 4),
    endY + gripperLength * Math.sin(gripperAngle - Math.PI / 4)
  );
  ctx.stroke();

  ctx.restore();
}

function drawGarbagePile() {
  if (!garbagePileImage.complete) return; // Don't draw if the image hasn't loaded yet

  // Define garbage pile size and position relative to canvas dimensions
  // This ensures the pile scales with the game area
  const pileWidth = canvas.width * 0.18; // Example: 18% of canvas width, similar to chest
  const pileHeight = pileWidth / 1.2; // Assuming an aspect ratio of 1.2 (width:height)

  // Base position for the pile
  const baseX = canvas.width * 0.03; // 3% margin from left
  const baseY = canvas.height - pileHeight; // Positioned at the bottom

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
  const chestWidth = canvas.width * 0.18; // Example: 18% of canvas width
  const chestHeight = chestWidth / 1.2; // Assuming an aspect ratio of 1.2 (width:height)

  // Position it in the bottom right corner with a small margin
  const chestX = canvas.width - chestWidth - canvas.width * 0.03; // 3% margin from right
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

  if (scrollImage.complete) {
    ctx.drawImage(scrollImage, 0, 0, page.width, page.height);
  } else {
    ctx.fillStyle = "#e3dcc5";
    ctx.fillRect(0, 0, page.width, page.height);
  }

  const baseWidth = 180; // The original width for which the text was designed
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
  const chestWidth = canvas.width * 0.18;
  const chestHeight = chestWidth / 1.2;
  const chestX = canvas.width - chestWidth - canvas.width * 0.03;
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

function animateCanvasResize(duration = 500) {
  const startHeight = canvas.height;
  const endHeight = window.innerHeight * 0.5;
  const startTime = performance.now();
  function animate(time) {
    const progress = Math.min((time - startTime) / duration, 1);
    const currentHeight = startHeight + (endHeight - startHeight) * progress;
    canvas.height = currentHeight;
    canvas.width = window.innerWidth;
    canvas.style.position = "absolute";
    canvas.style.top = `${(window.innerHeight - currentHeight) / 2}px`;
    canvas.style.left = "0";
    if (progress < 1) requestAnimationFrame(animate);
    else {
      positionUIBelowCanvas();
      // Start the game loop only after the canvas is in its final position
      gameInterval = setInterval(updateGame, 1000 / 60);
      timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById("timer").textContent = timeLeft;
        if (timeLeft <= 0) endGame();
      }, 1000);
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

window.addEventListener("resize", () => {
  if (gameInterval) {
    resizeCanvasToHalfHeight();
    positionUIBelowCanvas();
  }
});
