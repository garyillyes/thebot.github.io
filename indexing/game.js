const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let score = 0;
let timeLeft = 100;
let activePage = null;
let gameInterval, timerInterval;
let beltOffset = 0;

const scrollImage = new Image();
scrollImage.src = "scroll.png"; // Make sure this image is in the same folder as your HTML

scrollImage.onload = () => console.log("Scroll image loaded");

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
    y: 120,
    width: 100,
    height: 134,
    state: "scrollIn",
    stateTimer: 0,
    scale: 1,
    _decisionMade: false
  };
}

function updateGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let conveyorShouldMove = !activePage || (activePage.state !== "focus" && activePage.state !== "decision");
  if (conveyorShouldMove) {
    beltOffset += 2;
  }
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
      if (page.x >= (canvas.width / 2) - (page.width / 2)) {
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
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 250, canvas.width, 30);

  // add stripes
  for (let i = 0; i < canvas.width; i += 40) {
    ctx.fillStyle = "#0ff2";
    ctx.fillRect((i + beltOffset) % canvas.width, 250, 20, 30);
  }
}

function drawPage(page) {
  if (!scrollImage.complete) return;

  const drawWidth = page.width;
  const drawHeight = page.height;

  ctx.save();
  ctx.translate(page.x + drawWidth / 2, page.y + drawHeight / 2);
  ctx.scale(page.scale, page.scale);
  ctx.translate(-drawWidth / 2, -drawHeight / 2);

  ctx.drawImage(scrollImage, 0, 0, drawWidth, drawHeight);

  // Overlay text
  ctx.fillStyle = "#000";
  ctx.font = "10px monospace";
  ctx.fillText(`Status: ${page.statusCode}`, 10, 20);
  ctx.fillText(`Error: ${page.isErrorPage ? "Yes" : "No"}`, 10, 35);
  ctx.fillText(`Quality: ${page.quality}`, 10, 50);

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
      document.getElementById("score").textContent = score;
    }
    activePage._decisionMade = true;
  }

  activePage.state = "scrollOut";
}

function discardPage() {
  if (!activePage || activePage.state === "scrollOut") return;
  if (!activePage._decisionMade) {
    const { statusCode, isErrorPage } = activePage;
    // Award 1 point for correctly discarding a bad page
    if (statusCode !== 200 || isErrorPage) {
      score += 1;
      document.getElementById("score").textContent = score;
    }
    activePage._decisionMade = true;
  }
  activePage.state = "scrollOut";
}


document.addEventListener("keydown", (e) => {
  if (e.key === "k") keepPage();
  if (e.key === "d") discardPage();
});
