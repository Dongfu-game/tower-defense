const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const stageEl = document.getElementById("stage");
const coinsEl = document.getElementById("coins");
const escapedEl = document.getElementById("escaped");
const remainingEl = document.getElementById("remaining");
const timerEl = document.getElementById("timer");
const selectedInfoEl = document.getElementById("selectedInfo");

const buildBtn = document.getElementById("buildBtn");
const upgradeBtn = document.getElementById("upgradeBtn");
const startBtn = document.getElementById("startBtn");

const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");

let stage = 1;
let coins = 50;
let timer = 60;
let prepareTimer = 30;
let phase = "ready";

let enemies = [];
let towers = [];
let bullets = [];
let selectedTower = null;

let enemiesToSpawn = 100;
let bossToSpawn = 0;
let spawnTimer = 0;
let stageTimerInterval = null;

const BUILD_COST = 50;
const MAX_ENEMIES = 300;
const MAX_LEVEL = 99;
const SPAWN_INTERVAL = 30;

const BOSS_INTERVAL = 5;
const BOSS_HP_MULTIPLIER = 40;

const path = [
  { x: 150, y: 90 },
  { x: 750, y: 90 },
  { x: 750, y: 470 },
  { x: 150, y: 470 }
];

const towerSpots = [
  { x: 250, y: 150 },
  { x: 380, y: 150 },
  { x: 520, y: 150 },
  { x: 650, y: 150 },

  { x: 250, y: 270 },
  { x: 650, y: 270 },

  { x: 250, y: 390 },
  { x: 650, y: 390 },

  { x: 250, y: 510 },
  { x: 380, y: 510 },
  { x: 520, y: 510 },
  { x: 650, y: 510 }
];

const towerTypes = [
  { name: "장거리", color: "#3b82f6", damage: 1, range: 190, fireRate: 20, area: false, slow: false, poison: false },
  { name: "기본", color: "#22c55e", damage: 3, range: 130, fireRate: 10, area: false, slow: false, poison: false },
  { name: "강력", color: "#ef4444", damage: 10, range: 90, fireRate: 5, area: false, slow: false, poison: false },
  { name: "범위", color: "#f97316", damage: 2, range: 120, fireRate: 8, area: true, slow: false, poison: false },
  { name: "슬로우", color: "#a855f7", damage: 0, range: 130, fireRate: 10, area: false, slow: true, poison: false },
  { name: "독", color: "#84cc16", damage: 1, range: 120, fireRate: 7, area: false, slow: false, poison: true }
];

class Enemy {
  constructor(isBoss = false) {
    this.x = path[0].x;
    this.y = path[0].y;
    this.pathIndex = 1;
    this.isBoss = isBoss;

    const normalHp = Math.floor(15 * Math.pow(1.25, stage - 1));
    this.maxHp = isBoss ? normalHp * BOSS_HP_MULTIPLIER : normalHp;
    this.hp = this.maxHp;

    this.baseSpeed = isBoss ? (1 + stage * 0.05) * 0.65 : 1 + stage * 0.05;
    this.speed = this.baseSpeed;

    this.radius = isBoss ? 22 : 10;
    this.slowTimer = 0;

    this.poisonDamage = 0;
    this.poisonTimer = 0;
  }

  update() {
    this.speed = this.slowTimer > 0 ? this.baseSpeed * 0.55 : this.baseSpeed;
    if (this.slowTimer > 0) this.slowTimer--;

    if (this.poisonTimer > 0) {
      this.hp -= this.poisonDamage / 60;
      this.poisonTimer--;
    }

    const target = path[this.pathIndex] || path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed) {
      this.x = target.x;
      this.y = target.y;
      this.pathIndex++;

      if (this.pathIndex >= path.length) {
        this.pathIndex = 0;
      }
    } else {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }
  }

  draw() {
    const hpRatio = Math.max(this.hp / this.maxHp, 0);

    ctx.beginPath();

    if (this.isBoss) {
      ctx.fillStyle = "#facc15";
    } else if (this.poisonTimer > 0) {
      ctx.fillStyle = "#bef264";
    } else if (this.slowTimer > 0) {
      ctx.fillStyle = "#c084fc";
    } else {
      ctx.fillStyle = "#e5e7eb";
    }

    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    const barWidth = this.isBoss ? 44 : 24;
    const barHeight = this.isBoss ? 6 : 4;

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth, barHeight);

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth * hpRatio, barHeight);

    if (this.isBoss) {
      ctx.fillStyle = "#111827";
      ctx.font = "11px Arial";
      ctx.textAlign = "center";
      ctx.fillText("BOSS", this.x, this.y + 4);
    }
  }
}

class Tower {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;

    this.level = 1;
    this.damage = type.damage;
    this.range = type.range;
    this.fireRate = type.fireRate;

    this.cooldown = 0;
    this.upgradeCost = 10;

    this.critChance = 0;
    this.explosionRadius = 45;
  }

  update() {
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    const target = this.findTarget();
    if (!target) return;

    if (this.type.slow) {
      this.applySlow();
    } else {
      bullets.push(new Bullet(this, target));
    }

    this.cooldown = Math.max(5, 60 / this.fireRate);
  }

  findTarget() {
    let target = null;
    let lowestHp = Infinity;

    for (const enemy of enemies) {
      const dist = getDistance(this, enemy);

      if (dist <= this.range && enemy.hp < lowestHp) {
        target = enemy;
        lowestHp = enemy.hp;
      }
    }

    return target;
  }

  applySlow() {
    const targetCount = 1 + Math.floor(this.level / 10);

    const targets = enemies
      .filter(enemy => getDistance(this, enemy) <= this.range)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, targetCount);

    for (const enemy of targets) {
      enemy.slowTimer = 90;
    }
  }

  upgrade() {
    if (this.level >= MAX_LEVEL) return false;
    if (coins < this.upgradeCost) return false;

    coins -= this.upgradeCost;
    this.level++;

    if (!this.type.slow) {
      this.damage *= 1.08;
    }

    if (this.level % 10 === 0) {
      this.applyLevelBonus();
    }

    this.upgradeCost = Math.ceil(this.upgradeCost * 1.08);

    return true;
  }

  applyLevelBonus() {
    if (this.type.name === "장거리") {
      this.range += 15;
    }

    if (this.type.name === "기본") {
      this.fireRate += 1;
    }

    if (this.type.name === "강력") {
      this.critChance += 3;
    }

    if (this.type.name === "범위") {
      this.explosionRadius += 5;
    }

    if (this.type.name === "슬로우") {
      this.range += 5;
    }

    if (this.type.name === "독") {
      this.range += 5;
    }
  }

  draw() {
    const size = 16 + Math.floor(this.level / 25) * 3;

    ctx.beginPath();
    ctx.fillStyle = this.type.color;
    ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
    ctx.fill();

    if (this === selectedTower) {
      ctx.beginPath();
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "white";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Lv.${this.level}`, this.x, this.y - 22);
  }
}

class Bullet {
  constructor(tower, target) {
    this.x = tower.x;
    this.y = tower.y;
    this.target = target;
    this.tower = tower;
    this.speed = 7;
    this.radius = 4;
  }

  update() {
    if (!enemies.includes(this.target)) {
      removeFromArray(bullets, this);
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed) {
      this.hit();
      removeFromArray(bullets, this);
    } else {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }
  }

  hit() {
    let finalDamage = this.tower.damage;

    if (this.tower.type.name === "강력") {
      if (Math.random() * 100 < this.tower.critChance) {
        finalDamage *= 3;
      }
    }

    if (this.tower.type.poison) {
      const poisonDuration = 180 + Math.floor(this.tower.level / 10) * 60;
      this.target.poisonDamage = finalDamage;
      this.target.poisonTimer = poisonDuration;
      this.target.hp -= finalDamage;
    } else if (this.tower.type.area) {
      for (const enemy of enemies) {
        if (getDistance(this.target, enemy) <= this.tower.explosionRadius) {
          enemy.hp -= finalDamage;
        }
      }
    } else {
      this.target.hp -= finalDamage;
    }

    checkDeadEnemies();
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = this.tower.type.color;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function giveStartingTower() {
  if (towers.length > 0) return;

  const startSpot = towerSpots[4];
  const basicType = towerTypes[1];

  const tower = new Tower(startSpot.x, startSpot.y, basicType);
  towers.push(tower);
  selectedTower = tower;
}

function startStage() {
  phase = "battle";
  timer = 60;
  prepareTimer = 30;
  enemiesToSpawn = 100;
  bossToSpawn = stage % BOSS_INTERVAL === 0 ? 1 : 0;
  spawnTimer = SPAWN_INTERVAL - 1;

  clearInterval(stageTimerInterval);

  stageTimerInterval = setInterval(() => {
    if (phase !== "battle") return;

    timer--;

    if (timer <= 0) {
      endBattlePhase();
    }
  }, 1000);
}

function endBattlePhase() {
  phase = "prepare";
  prepareTimer = 30;
  enemiesToSpawn = 0;
  bossToSpawn = 0;

  clearInterval(stageTimerInterval);

  stageTimerInterval = setInterval(() => {
    if (phase !== "prepare") return;

    prepareTimer--;

    if (prepareTimer <= 0) {
      stage++;
      startStage();
    }
  }, 1000);
}

function nextStageNow() {
  if (phase === "ready") {
    startStage();
    return;
  }

  if (phase === "battle" || phase === "prepare") {
    stage++;
    startStage();
    return;
  }
}

function spawnEnemy() {
  if (phase !== "battle") return;

  if (enemiesToSpawn > 0) {
    enemies.push(new Enemy(false));
    enemiesToSpawn--;
    return;
  }

  if (bossToSpawn > 0) {
    enemies.push(new Enemy(true));
    bossToSpawn--;
  }
}

function buildTower() {
  if (coins < BUILD_COST) {
    alert("코인이 부족합니다.");
    return;
  }

  const emptySpots = towerSpots.filter(
    spot => !towers.some(t => t.x === spot.x && t.y === spot.y)
  );

  if (emptySpots.length === 0) {
    alert("타워를 지을 공간이 없습니다.");
    return;
  }

  coins -= BUILD_COST;

  const spot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
  const type = towerTypes[Math.floor(Math.random() * towerTypes.length)];

  const tower = new Tower(spot.x, spot.y, type);
  towers.push(tower);
  selectedTower = tower;
}

function upgradeSelectedTower() {
  if (!selectedTower) {
    alert("업그레이드할 타워를 선택하세요.");
    return;
  }

  if (!selectedTower.upgrade()) {
    alert("코인이 부족하거나 최대 레벨입니다.");
  }
}

function checkDeadEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].hp <= 0) {
      const deadEnemy = enemies[i];
      enemies.splice(i, 1);
      giveCoin(deadEnemy);
    }
  }
}

function giveCoin(enemy) {
  if (enemy && enemy.isBoss) {
    coins += 50 + stage * 10;
    return;
  }

  coins += 1;
  if (Math.random() < 0.10) coins += 5;
  if (Math.random() < 0.03) coins += 10;
}

function resetGame() {
  stage = 1;
  coins = 50;
  timer = 60;
  prepareTimer = 30;
  phase = "ready";

  enemies = [];
  towers = [];
  bullets = [];
  selectedTower = null;

  enemiesToSpawn = 100;
  bossToSpawn = 0;
  spawnTimer = 0;

  clearInterval(stageTimerInterval);
  giveStartingTower();
}

function saveGame() {
  const saveData = {
    stage,
    coins,

    towers: towers.map(tower => ({
      x: tower.x,
      y: tower.y,
      typeName: tower.type.name,

      level: tower.level,
      damage: tower.damage,
      range: tower.range,
      fireRate: tower.fireRate,

      upgradeCost: tower.upgradeCost,
      critChance: tower.critChance,
      explosionRadius: tower.explosionRadius
    }))
  };

  localStorage.setItem(
    "randomTowerDefenseSave",
    JSON.stringify(saveData)
  );

  alert("저장 완료!");
}

function loadGame() {
  const data = localStorage.getItem(
    "randomTowerDefenseSave"
  );

  if (!data) {
    alert("저장 데이터가 없습니다.");
    return;
  }

  const saveData = JSON.parse(data);

  stage = saveData.stage;
  coins = saveData.coins;

  enemies = [];
  bullets = [];
  towers = [];

  selectedTower = null;

  phase = "ready";
  timer = 60;
  prepareTimer = 30;

  enemiesToSpawn = 100;
  bossToSpawn = 0;
  spawnTimer = 0;

  clearInterval(stageTimerInterval);

  for (const savedTower of saveData.towers) {

    const type = towerTypes.find(
      t => t.name === savedTower.typeName
    );

    if (!type) continue;

    const tower = new Tower(
      savedTower.x,
      savedTower.y,
      type
    );

    tower.level = savedTower.level;
    tower.damage = savedTower.damage;
    tower.range = savedTower.range;
    tower.fireRate = savedTower.fireRate;

    tower.upgradeCost = savedTower.upgradeCost;
    tower.critChance = savedTower.critChance;
    tower.explosionRadius = savedTower.explosionRadius;

    towers.push(tower);
  }

  if (towers.length > 0) {
    selectedTower = towers[0];
  }

  alert("불러오기 완료!");
}

function selectTowerByClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;

  selectedTower = null;

  for (const tower of towers) {
    if (getDistance({ x: mouseX, y: mouseY }, tower) < 24) {
      selectedTower = tower;
      break;
    }
  }
}

function drawPath() {
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);

  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }

  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawTowerSpots() {
  for (const spot of towerSpots) {
    const occupied = towers.some(t => t.x === spot.x && t.y === spot.y);

    ctx.beginPath();
    ctx.strokeStyle = occupied ? "#374151" : "#9ca3af";
    ctx.lineWidth = 2;
    ctx.arc(spot.x, spot.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCenterText() {
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "20px Arial";
  ctx.textAlign = "center";

  if (phase === "ready") {
    ctx.fillText("게임 시작 버튼을 누르세요", canvas.width / 2, 40);
  }

  if (phase === "prepare") {
    ctx.fillText(`준비 시간 ${prepareTimer}초`, canvas.width / 2, 40);
  }

  if (phase === "battle" && stage % BOSS_INTERVAL === 0) {
    ctx.fillStyle = "#facc15";
    ctx.fillText(`BOSS STAGE ${stage}`, canvas.width / 2, 40);
  }
}

function updateUI() {
  stageEl.textContent = stage;
  coinsEl.textContent = Math.floor(coins);
  escapedEl.textContent = enemies.length;
  remainingEl.textContent = enemiesToSpawn + bossToSpawn;

  buildBtn.textContent = `랜덤 타워 건설 - ${BUILD_COST}코인`;

  if (phase === "battle") {
    timerEl.textContent = `전투 ${timer}`;
  } else if (phase === "prepare") {
    timerEl.textContent = `준비 ${prepareTimer}`;
  } else {
    timerEl.textContent = "대기";
  }

  if (selectedTower) {
    let extraInfo = "";

    if (selectedTower.type.name === "장거리") {
      extraInfo = ` / 10레벨마다 사거리 +15`;
    }

    if (selectedTower.type.name === "기본") {
      extraInfo = ` / 공속 ${selectedTower.fireRate.toFixed(1)}`;
    }

    if (selectedTower.type.name === "강력") {
      extraInfo = ` / 치명타 ${selectedTower.critChance}%`;
    }

    if (selectedTower.type.name === "범위") {
      extraInfo = ` / 폭발범위 ${selectedTower.explosionRadius}`;
    }

    if (selectedTower.type.slow) {
      extraInfo = ` / 슬로우 대상 ${1 + Math.floor(selectedTower.level / 10)}마리`;
    }

    if (selectedTower.type.poison) {
      extraInfo = ` / 독 지속 ${3 + Math.floor(selectedTower.level / 10)}초`;
    }

    selectedInfoEl.textContent =
      `${selectedTower.type.name} 타워 / Lv.${selectedTower.level} / ` +
      `공격력 ${selectedTower.damage.toFixed(1)} / ` +
      `사거리 ${Math.floor(selectedTower.range)} / ` +
      `업글비용 ${selectedTower.upgradeCost}코인` +
      extraInfo;
  } else {
    selectedInfoEl.textContent = "선택된 타워 없음";
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawPath();
  drawTowerSpots();
  drawCenterText();

  if (phase === "battle" && (enemiesToSpawn > 0 || bossToSpawn > 0)) {
    spawnTimer++;

    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnEnemy();
      spawnTimer = 0;
    }
  }

  for (const enemy of [...enemies]) {
    enemy.update();
    enemy.draw();
  }

  for (const tower of towers) {
    tower.update();
    tower.draw();
  }

  for (const bullet of [...bullets]) {
    bullet.update();
    bullet.draw();
  }

  checkDeadEnemies();

  if (enemies.length >= MAX_ENEMIES) {
    alert("게임오버! 필드에 적이 300마리를 넘었습니다.");
    resetGame();
  }

  updateUI();
  requestAnimationFrame(gameLoop);
}

function getDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function removeFromArray(array, item) {
  const index = array.indexOf(item);

  if (index !== -1) {
    array.splice(index, 1);
  }
}

buildBtn.addEventListener("click", buildTower);
upgradeBtn.addEventListener("click", upgradeSelectedTower);
startBtn.addEventListener("click", nextStageNow);

saveBtn.addEventListener("click", saveGame);
loadBtn.addEventListener("click", loadGame);

canvas.addEventListener("click", selectTowerByClick);
giveStartingTower();
gameLoop();