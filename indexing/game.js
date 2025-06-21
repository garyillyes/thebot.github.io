const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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

const scrollImage = new Image();
scrollImage.src = "scroll.png";

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
  score = 0;
  comboStreak = 0;
  timeLeft = 100;
  activePage = null;
  document.getElementById("score").textContent = score;
  document.getElementById("timer").textContent = timeLeft;
  updateComboDisplay();
  gameInterval = setInterval(updateGame, 1000 / 60);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById("timer").textContent = timeLeft;
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  clearInterval(gameInterval);
  clearInterval(timerInterval);

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
  modal.innerHTML = `<h2>Congrats!</h2><p>Your score is: <strong>${score}</strong></p><button id='restartBtn'>Play Again</button>`;

  document.body.appendChild(modal);
  document.getElementById("restartBtn").onclick = () => {
    document.body.removeChild(modal);
    startGame();
  };
  document.getElementById("introScreen").style.display = "flex";
  document.getElementById("gameUI").style.display = "none";
}

function updateComboDisplay() {
  const comboLabel = document.getElementById("combo");
  if (!comboLabel) return;
  if (comboStreak >= 5) {
    const multiplier = 1 + Math.floor(comboStreak / 5);
    comboLabel.textContent = `Combo x${multiplier}`;
    comboLabel.style.visibility = "visible";
  } else {
    comboLabel.style.visibility = "hidden";
  }
}

function spawnPage() {
  const statusCodes = [200, 200, 200, 200, 301, 302, 404, 410, 418, 500, 503];
  const statusCode =
    statusCodes[Math.floor(Math.random() * statusCodes.length)];
  const isErrorPage = Math.random() < 0.3;
  const quality =
    statusCode === 200
      ? ["high", "medium", "low"][Math.floor(Math.random() * 3)]
      : "low";
  armAnimProgress = 0;
  activePage = {
    statusCode,
    isErrorPage,
    quality,
    x: 60,
    y: canvas.height - 100,
    width: 180,
    height: 252,
    state: "intro",
    stateTimer: 0,
    scale: 1,
    _decisionMade: false,
    _moveDirection: null,
  };
}

function updateGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRobotArm();
  drawSortingBoxes();

  if (activePage) {
    updatePageState(activePage);
    drawPage(activePage);
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
}

function updatePageState(page) {
  switch (page.state) {
    case "intro":
      armAnimProgress += 0.02;
      page.x = 60 + (canvas.width / 2 - 90 - 60) * armAnimProgress;
      page.y =
        canvas.height - 100 + (100 - (canvas.height - 100)) * armAnimProgress;
      if (armAnimProgress >= 1) page.state = "focus";
      break;
    case "focus":
      if (page._decisionMade) {
        page.state = "scrollOut";
        return;
      }
      if (page.scale < 1.2) page.scale += 0.01;
      else {
        page.scale = 1.2;
        page.stateTimer++;
        if (page.stateTimer > 60) page.state = "decision";
      }
      break;
    case "decision":
      break;
    case "scrollOut":
      if (page.scale > 1) page.scale -= 0.01;
      if (page._moveDirection === "discard") {
        page.x -= 6;
        page.y += 6;
      } else {
        page.x += 6;
        page.y += 6;
      }
      break;
  }
}

function drawRobotArm() {
  const baseX = canvas.width / 2;
  const baseY = 0;
  const armLength = 100;

  let endX = baseX;
  let endY = 110;

  if (activePage && activePage.state === "intro") {
    const startX = 60;
    const startY = canvas.height - 100;
    endX = startX + (baseX - startX) * armAnimProgress;
    endY = startY + (110 - startY) * armAnimProgress;
  }

  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(endX - 15, endY);
  ctx.lineTo(endX - 15, endY + 30);
  ctx.moveTo(endX + 15, endY);
  ctx.lineTo(endX + 15, endY + 30);
  ctx.stroke();
}

function drawSortingBoxes() {
  ctx.fillStyle = "#222";
  ctx.fillRect(30, canvas.height - 100, 100, 60);
  ctx.fillRect(canvas.width - 130, canvas.height - 100, 100, 60);
  ctx.fillStyle = "white";
  ctx.font = "16px sans-serif";
  ctx.fillText("Garbage", 40, canvas.height - 65);
  ctx.fillText("Index", canvas.width - 110, canvas.height - 65);
}

function drawPage(page) {
  ctx.save();
  ctx.translate(page.x + page.width / 2, page.y + page.height / 2);
  ctx.scale(page.scale, page.scale);
  ctx.translate(-page.width / 2, -page.height / 2);

  if (scrollImage.complete) {
    ctx.drawImage(scrollImage, 0, 0, page.width, page.height);
  } else {
    ctx.fillStyle = "#e3dcc5";
    ctx.fillRect(0, 0, page.width, page.height);
  }

  ctx.fillStyle = "#000";
  ctx.font = "18px monospace";
  ctx.fillText(`Status: ${page.statusCode}`, 20, 36);
  ctx.fillText(`Error: ${page.isErrorPage ? "Yes" : "No"}`, 20, 66);
  ctx.fillText(`Quality: ${page.quality}`, 20, 96);
  ctx.restore();
}

function keepPage() {
  if (!activePage || activePage.state === "scrollOut") return;
  const { statusCode, isErrorPage, quality } = activePage;
  if (!activePage._decisionMade) {
    let basePoints = 0;
    if (statusCode === 200 && !isErrorPage) {
      if (quality === "high") basePoints = 3;
      else if (quality === "medium") basePoints = 2;
      else basePoints = 1;

      comboStreak++;
      score += basePoints + Math.floor(comboStreak / 5);
    } else {
      comboStreak = 0;
    }
    document.getElementById("score").textContent = score;
    updateComboDisplay();
    activePage._decisionMade = true;
    activePage._moveDirection = "keep";
    activePage.state = "scrollOut";
  }
}

function discardPage() {
  if (!activePage || activePage.state === "scrollOut") return;
  const { statusCode, isErrorPage } = activePage;
  if (!activePage._decisionMade) {
    if (statusCode !== 200 || isErrorPage) {
      comboStreak++;
      score += 1 + Math.floor(comboStreak / 5);
    } else {
      comboStreak = 0;
    }
    document.getElementById("score").textContent = score;
    updateComboDisplay();
    activePage._decisionMade = true;
    activePage._moveDirection = "discard";
    activePage.state = "scrollOut";
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "k") keepPage();
  if (e.key === "d") discardPage();
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
    else positionUIBelowCanvas();
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
