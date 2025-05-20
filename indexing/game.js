const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let score = 0;
let timeLeft = 100;
let activePage = null;
let gameInterval, timerInterval;
let scrollImage = new Image();
scrollImage.src = "scroll.png"; // Make sure this is in the same directory

function startGame() {
  document.getElementById("introScreen").style.display = "none";
  document.getElementById("gameUI").style.display = "block";

  score = 0;
  timeLeft = 100;
  activePage = null;
  document.getElementById("score").textContent = score;
  document.getElementById("timer").textContent = timeLeft;

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
  alert("Time's up! Final Score: " + score);
  document.getElementById("introScreen").style.display = "flex";
  document.getElementById("gameUI").style.display = "none";
}

function spawnPage() {
  const statusCodes = [200, 200, 200, 200, 301, 302, 404, 410, 418, 500, 503];
  activePage = {
    statusCode: statusCodes[Math.floor(Math.random() * statusCodes.length)],
    isErrorPage: Math.random() < 0.3,
    quality: ["high", "medium", "low"][Math.floor(Math.random() * 3)],
    x: -150,
    y: 100,
    width: 100,
    height: 140,
    state: "scrollIn",
    stateTimer: 0,
    scale: 1,
    _decisionMade: false
  };
}

function updateGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawConveyorBelt();

  if (activePage) {
    updatePageState(activePage);
    drawPage(activePage);

    if (activePage.x > canvas.width + 100) {
      activePage = null;
    }
  } else {
    spawnPage();
  }
}

function updatePageState(page) {
  switch (page.state) {
    case "scrollIn":
      page.x += 4;
      if (page.x >= canvas.width / 2 - page.width / 2) {
        page.state = "focus";
        page.stateTimer = 0;
      }
      break;

    case "focus":
      if (page._decisionMade) {
        page.state = "scrollOut";
        return;
      }
      if (page.scale < 1.2) {
        page.scale += 0.01;
      } else {
        page.scale = 1.2;
        page.stateTimer++;
        if (page.stateTimer > 60) {
          page.state = "decision";
        }
      }
      break;

    case "decision":
      // Wait for user input
      break;

    case "scrollOut":
      if (page.scale > 1) {
        page.scale -= 0.01;
      }
      page.x += 4;
      break;
  }
}

function drawConveyorBelt() {
  ctx.fillStyle = "#444";
  ctx.fillRect(0, 260, canvas.width, 40);
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
  ctx.font = "10px monospace";
  ctx.fillText(`Status: ${page.statusCode}`, 8, 15);
  ctx.fillText(`Error: ${page.isErrorPage ? "Yes" : "No"}`, 8, 30);
  ctx.fillText(`Quality: ${page.quality}`, 8, 45);

  ctx.restore();
}

function keepPage() {
  if (!activePage || activePage.state === "scrollOut") return;

  const { statusCode, isErrorPage, quality } = activePage;

  if (!activePage._decisionMade) {
    if (statusCode === 200 && !isErrorPage) {
      if (quality === "high") score += 3;
      else if (quality === "medium") score += 2;
      else if (quality === "low") score += 1;
    }
    activePage._decisionMade = true;
    activePage.state = "scrollOut";
    document.getElementById("score").textContent = score;
  }
}

function discardPage() {
  if (!activePage || activePage.state === "scrollOut") return;

  const { statusCode, isErrorPage } = activePage;

  if (!activePage._decisionMade) {
    if (statusCode !== 200 || isErrorPage) {
      score += 1; // Reward correct discard
    }
    activePage._decisionMade = true;
    activePage.state = "scrollOut";
    document.getElementById("score").textContent = score;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "k") keepPage();
  if (e.key === "d") discardPage();
});
