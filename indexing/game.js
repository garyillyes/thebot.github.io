const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let score = 0;
let timeLeft = 100;
let activePage = null;
let gameInterval, timerInterval;
let scrollImage = new Image();
scrollImage.src = "scroll.png"; // Make sure this file is in the same directory

function startGame() {
  document.getElementById("introScreen").style.display = "none";
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
}

function spawnPage() {
  activePage = randomPage();
}

function randomPage() {
  const statusCodes = [200, 200, 200, 200, 301, 302, 404, 410, 418, 500, 503];
  return {
    statusCode: statusCodes[Math.floor(Math.random() * statusCodes.length)],
    isErrorPage: Math.random() < 0.3,
    quality: ["high", "medium", "low"][Math.floor(Math.random() * 3)],
    x: -150,
    y: canvas.height / 2 - 100,
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

    if (activePage.x > canvas.width) {
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
      if (page.x + page.width / 2 >= canvas.width / 2) {
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
      // Waits for user input
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
  ctx.fillStyle = "#333";
  const beltY = canvas.height / 2 + 40;
  ctx.fillRect(0, beltY, canvas.width, 40);

  // Draw neon stripes
  for (let i = 0; i < canvas.width; i += 40) {
    ctx.fillStyle = i % 80 === 0 ? "#0ff" : "#099";
    ctx.fillRect(i, beltY + 15, 20, 10);
  }
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

  // Text
  ctx.fillStyle = "#000";
  ctx.font = "10px monospace";
  ctx.fillText(`Status: ${page.statusCode}`, 6, 20);
  ctx.fillText(`Error: ${page.isErrorPage ? "Yes" : "No"}`, 6, 35);
  ctx.fillText(`Quality: ${page.quality}`, 6, 50);

  ctx.restore();
}

function keepPage() {
  if (!activePage || activePage.state === "scrollOut") return;

  if (!activePage._decisionMade) {
    const { statusCode, isErrorPage, quality } = activePage;

    if (statusCode === 200 && !isErrorPage) {
      if (quality === "high") score += 3;
      else if (quality === "medium") score += 2;
      else if (quality === "low") score += 1;
    }

    document.getElementById("score").textContent = score;
    activePage._decisionMade = true;
  }

  activePage.state = "scrollOut";
}

function discardPage() {
  if (!activePage || activePage.state === "scrollOut") return;

  if (!activePage._decisionMade) {
    const { statusCode, isErrorPage } = activePage;

    if (statusCode !== 200 || isErrorPage) {
      score += 1;
    }

    document.getElementById("score").textContent = score;
    activePage._decisionMade = true;
  }

  activePage.state = "scrollOut";
}

// Optional: keyboard support for desktop
document.addEventListener("keydown", (e) => {
  if (e.key === "k") keepPage();
  if (e.key === "d") discardPage();
});
