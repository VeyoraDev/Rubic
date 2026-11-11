// ============================================================
// RUBIK 3x3 SOLVER — Three.js + cubejs
// Warna: F=hijau, U=kuning, D=putih, R=oren, L=merah, B=biru
// ============================================================

// --- Warna config ---
const COLORS = {
  F: { hex: 0x00a651, name: 'Hijau',  css: '#00a651' }, // Front  (depan)
  U: { hex: 0xffd500, name: 'Kuning', css: '#ffd500' }, // Up     (atas)
  D: { hex: 0xf5f5f5, name: 'Putih',  css: '#f5f5f5' }, // Down   (bawah)
  R: { hex: 0xff6a00, name: 'Oren',   css: '#ff6a00' }, // Right  (kanan)
  L: { hex: 0xc41e3a, name: 'Merah',  css: '#c41e3a' }, // Left   (kiri)
  B: { hex: 0x0051ba, name: 'Biru',   css: '#0051ba' }, // Back   (belakang)
};
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']; // cubejs order

// --- State ---
// stickers: object { meshId -> faceKey } 
// Setiap sticker mesh ada userData: { face: 'U'|'R'|..., index: 0..8, color: null|'F'|'U'... }
// Counter per warna: { F: 0..9, ... }
let stickers = [];          // array of sticker meshes
let colorCount = { F:0, U:0, D:0, R:0, L:0, B:0 };
let selectedColor = null;   // 'F'|'U'|... or null
let solution = [];          // array of moves e.g. ['R',"U'",'F2']
let currentStep = -1;       // -1 = belum start, 0..solution.length-1 = step semasa
let isAnimating = false;

// ============================================================
// THREE.JS SCENE
// ============================================================
const wrap = document.getElementById('canvasWrap');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4, 4, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
wrap.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const d1 = new THREE.DirectionalLight(0xffffff, 0.6); d1.position.set(5, 10, 7); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.4); d2.position.set(-5, -5, -7); scene.add(d2);

// ============================================================
// BUILD CUBE
// ============================================================
const CUBIE_SIZE = 1;
const GAP = 0.04;
const CUBE_GROUP = new THREE.Group();
scene.add(CUBE_GROUP);

const faceColors = {
  U: COLORS.U.hex, // top
  D: COLORS.D.hex, // bottom
  R: COLORS.R.hex, // right
  L: COLORS.L.hex, // left
  F: COLORS.F.hex, // front
  B: COLORS.B.hex, // back
};
const grayColor = 0x333333;

// Kita buat 27 cubies, setiap cubie ada 6 face materials
// Tapi untuk sticker interaction, kita letak sticker plane kecil atas setiap visible face
const cubies = [];

function createCubie(x, y, z) {
  const geo = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
  // material order: +x, -x, +y, -y, +z, -z
  const mats = [
    new THREE.MeshStandardMaterial({ color: grayColor }), // +x (R)
    new THREE.MeshStandardMaterial({ color: grayColor }), // -x (L)
    new THREE.MeshStandardMaterial({ color: grayColor }), // +y (U)
    new THREE.MeshStandardMaterial({ color: grayColor }), // -y (D)
    new THREE.MeshStandardMaterial({ color: grayColor }), // +z (F)
    new THREE.MeshStandardMaterial({ color: grayColor }), // -z (B)
  ];
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(x, y, z);
  mesh.userData = { x, y, z, faceStickers: {} };
  CUBE_GROUP.add(mesh);
  cubies.push(mesh);
  return mesh;
}

for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++)
      createCubie(x, y, z);

// Sticker plane (kecil, tampak atas permukaan)
const STICKER_SIZE = 0.85;
const stickerGeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
const offset = 0.501;

// Peta: face key -> normal vector + rotation untuk plane
const faceConfig = {
  U: { normal: [0, 1, 0],  rot: [-Math.PI/2, 0, 0] },
  D: { normal: [0,-1, 0],  rot: [ Math.PI/2, 0, 0] },
  R: { normal: [1, 0, 0],  rot: [0,  Math.PI/2, 0] },
  L: { normal: [-1,0, 0],  rot: [0, -Math.PI/2, 0] },
  F: { normal: [0, 0, 1],  rot: [0, 0, 0] },
  B: { normal: [0, 0,-1],  rot: [0, Math.PI, 0] },
};

// Buat sticker untuk setiap muka cubie yang visible
for (const cubie of cubies) {
  const { x, y, z } = cubie.userData;
  for (const faceKey in faceConfig) {
    // Cek sama ada muka ni visible (paling luar)
    let visible = false;
    if (faceKey === 'U' && y === 1) visible = true;
    if (faceKey === 'D' && y === -1) visible = true;
    if (faceKey === 'R' && x === 1) visible = true;
    if (faceKey === 'L' && x === -1) visible = true;
    if (faceKey === 'F' && z === 1) visible = true;
    if (faceKey === 'B' && z === -1) visible = true;
    if (!visible) continue;

    const cfg = faceConfig[faceKey];
    const mat = new THREE.MeshStandardMaterial({ color: grayColor, side: THREE.DoubleSide });
    const sticker = new THREE.Mesh(stickerGeo, mat);
    sticker.position.set(
      x + cfg.normal[0] * offset,
      y + cfg.normal[1] * offset,
      z + cfg.normal[2] * offset
    );
    sticker.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    sticker.userData = {
      faceKey,       // 'U','R','F','D','L','B'
      cubie,         // parent cubie
      color: null,   // warna yang dipasang (null = kosong)
      originalPos: { x, y, z },
    };
    CUBE_GROUP.add(sticker);
    stickers.push(sticker);
    cubie.userData.faceStickers[faceKey] = sticker;
  }
}

// ============================================================
// RENDER LOOP
// ============================================================
function resize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// ============================================================
// ORBIT (drag to rotate view) — simple manual orbit
// ============================================================
let orbit = { theta: Math.PI/4, phi: Math.PI/4, radius: 8 };
function updateCamera() {
  const { theta, phi, radius } = orbit;
  camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = radius * Math.cos(phi);
  camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(0, 0, 0);
}
updateCamera();

let isDragging = false;
let lastX = 0, lastY = 0, moved = false;

renderer.domElement.addEventListener('pointerdown', (e) => {
  isDragging = true; moved = false;
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
  orbit.theta -= dx * 0.01;
  orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi - dy * 0.01));
  lastX = e.clientX; lastY = e.clientY;
  updateCamera();
});
renderer.domElement.addEventListener('pointerup', (e) => {
  isDragging = false;
});
renderer.domElement.addEventListener('pointercancel', () => { isDragging = false; });

// ============================================================
// RAYCAST — klik sticker
// ============================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('click', (e) => {
  if (moved) return; // kalau tadi drag, jangan trigger click
  if (!selectedColor) {
    setStatus('Pilih warna dulu di bawah 👇');
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(stickers, false);
  if (hits.length === 0) return;

  const sticker = hits[0].object;
  paintSticker(sticker, selectedColor);
});

// ============================================================
// PAINT STICKER
// ============================================================
function paintSticker(sticker, colorKey) {
  const prev = sticker.userData.color;

  // Kalau sticker dah ada warna sama, tak buat apa-apa
  if (prev === colorKey) return;

  // Kalau warna baru dah penuh 9 kali, tak boleh
  if (colorCount[colorKey] >= 9) {
    setStatus(`Warna ${COLORS[colorKey].name} dah penuh (9/9)`);
    return;
  }

  // Kalau ada warna lama, kurangkan counter
  if (prev) colorCount[prev] = Math.max(0, colorCount[prev] - 1);

  // Set warna baru
  sticker.userData.color = colorKey;
  sticker.material.color.setHex(COLORS[colorKey].hex);
  colorCount[colorKey]++;

  updateColorButtons();
  setStatus('');
  validateReady();
}

// ============================================================
// COLOR PICKER UI
// ============================================================
const pickerEl = document.getElementById('colorPicker');
const colorBtnEls = {};

for (const key of ['F','U','D','R','L','B']) {
  const btn = document.createElement('button');
  btn.className = 'colorBtn';
  btn.style.background = COLORS[key].css;
  btn.dataset.color = key;
  btn.innerHTML = `<span class="badge">9</span>`;
  btn.addEventListener('click', () => {
    if (colorCount[key] >= 9 && selectedColor !== key) {
      setStatus(`Warna ${COLORS[key].name} dah penuh`);
      return;
    }
    selectedColor = (selectedColor === key) ? null : key;
    updateColorButtons();
  });
  pickerEl.appendChild(btn);
  colorBtnEls[key] = btn;
}

function updateColorButtons() {
  for (const key in colorBtnEls) {
    const btn = colorBtnEls[key];
    const remain = 9 - colorCount[key];
    btn.querySelector('.badge').textContent = remain;
    btn.classList.toggle('selected', selectedColor === key);
    btn.classList.toggle('exhausted', remain === 0 && selectedColor !== key);
  }
}
updateColorButtons();

// ============================================================
// STATUS
// ============================================================
function setStatus(msg) {
  document.getElementById('status').textContent = msg;
  if (msg) setTimeout(() => {
    if (document.getElementById('status').textContent === msg)
      document.getElementById('status').textContent = '';
  }, 2500);
}

// ============================================================
// VALIDATION & SOLVE
// ============================================================
const solveBtn = document.getElementById('solveBtn');
const resetBtn = document.getElementById('resetBtn');

function validateReady() {
  const allFilled = stickers.every(s => s.userData.color !== null);
  // Setiap warna mesti tepat 9
  const countsOk = Object.values(colorCount).every(c => c === 9);
  solveBtn.disabled = !(allFilled && countsOk);
}

solveBtn.addEventListener('click', () => {
  const facelets = buildFacelets();
  if (!facelets) {
    setStatus('Setiap warna mesti tepat 9 kali!');
    return;
  }

  try {
    const Cube = window.Cube;
    const cube = Cube.fromString(facelets);
    if (!cube) throw new Error('invalid');
    const sol = cube.solve();
    if (!sol || sol.length === 0) {
      setStatus('Rubik dah siap!');
      solution = [];
      currentStep = -1;
      renderAlgoBar();
      updateStepInfo();
      return;
    }
    // sol = "R U R' U'" -> split
    solution = sol.trim().split(/\s+/);
    currentStep = -1;
    renderAlgoBar();
    updateStepInfo();
    setStatus(`Solution: ${solution.length} langkah`);
    solveBtn.disabled = true;
    document.getElementById('nextBtn').disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('Rubik tak valid — tak boleh solve');
  }
});

// Bina string 54-facelet ikut format cubejs:
// U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9
function buildFacelets() {
  // Kumpul sticker ikut faceKey, dan susun ikut posisi
  const byFace = { U: [], R: [], F: [], D: [], L: [], B: [] };

  for (const s of stickers) {
    if (!s.userData.color) return null;
    byFace[s.userData.faceKey].push(s);
  }

  // Setiap face, susun ikut orientasi pandangan standard
  // (kita kena susun sticker ikut posisi supaya match cubejs facelet order)
  const faceOrder = ['U','R','F','D','L','B'];
  const result = [];

  for (const fk of faceOrder) {
    const arr = byFace[fk];
    // Sort ikut row-major pada muka tersebut
    // Untuk muka, kita guna originalPos cubie & face
    const sorted = arr.slice().sort((a, b) => {
      const pa = getFaceletCoord(a, fk);
      const pb = getFaceletCoord(b, fk);
      if (pa.row !== pb.row) return pa.row - pb.row;
      return pa.col - pb.col;
    });
    for (const s of sorted) {
      result.push(s.userData.color);
    }
  }

  return result.join('');
}

// Dapatkan (row, col) sticker pada muka tertentu untuk sorting
function getFaceletCoord(sticker, faceKey) {
  const { x, y, z } = sticker.userData.originalPos;
  // Peta ke row/col mengikut pandangan standard bila tengok muka tersebut
  switch (faceKey) {
    case 'U': return { row: -(z) + 1, col: x + 1 }; // tengok dari atas
    case 'D': return { row: z + 1,      col: x + 1 }; // tengok dari bawah
    case 'F': return { row: -(y) + 1,   col: x + 1 }; // depan
    case 'B': return { row: -(y) + 1,   col: -(x) + 1 }; // belakang
    case 'R': return { row: -(y) + 1,   col: -(z) + 1 }; // kanan
    case 'L': return { row: -(y) + 1,   col: z + 1 }; // kiri
  }
}

// ============================================================
// ANIMATION — pusing muka
// ============================================================
const FACE_AXIS = {
  U: { axis: 'y', layer: 1,  dir: -1 },
  D: { axis: 'y', layer: -1, dir: 1 },
  R: { axis: 'x', layer: 1,  dir: -1 },
  L: { axis: 'x', layer: -1, dir: 1 },
  F: { axis: 'z', layer: 1,  dir: -1 },
  B: { axis: 'z', layer: -1, dir: 1 },
};

function parseMove(move) {
  const face = move[0];
  const suffix = move.slice(1);
  let turns = 1;
  if (suffix === "'") turns = -1;
  else if (suffix === '2') turns = 2;
  return { face, turns };
}

function animateMove(move, reverse = false) {
  return new Promise((resolve) => {
    const { face, turns: rawTurns } = parseMove(move);
    let turns = reverse ? -rawTurns : rawTurns;
    if (turns === 0) { resolve(); return; }

    const cfg = FACE_AXIS[face];
    const axisVec = new THREE.Vector3(cfg.axis === 'x' ? 1 : 0, cfg.axis === 'y' ? 1 : 0, cfg.axis === 'z' ? 1 : 0);

    // Kumpul cubies dalam layer
    const affected = cubies.filter(c => {
      const p = c.position;
      const v = cfg.axis === 'x' ? p.x : cfg.axis === 'y' ? p.y : p.z;
      return Math.abs(v - cfg.layer) < 0.1;
    });

    // Group sementara
    const pivot = new THREE.Group();
    scene.add(pivot);
    affected.forEach(c => {
      pivot.attach(c);
      // Sticker pun ikut sekali sebab sticker adalah child of scene
    });
    // Attach stickers yang belong to affected cubies
    for (const s of stickers) {
      if (affected.includes(s.userData.cubie)) {
        pivot.attach(s);
      }
    }

    const totalAngle = (Math.PI / 2) * turns * cfg.dir;
    const duration = 300;
    const start = performance.now();
    const startAngle = 0;

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const angle = startAngle + totalAngle * eased;

      // Set pivot rotation
      if (cfg.axis === 'x') pivot.rotation.x = angle;
      if (cfg.axis === 'y') pivot.rotation.y = angle;
      if (cfg.axis === 'z') pivot.rotation.z = angle;

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Snap & kembalikan ke CUBE_GROUP
        if (cfg.axis === 'x') pivot.rotation.x = totalAngle;
        if (cfg.axis === 'y') pivot.rotation.y = totalAngle;
        if (cfg.axis === 'z') pivot.rotation.z = totalAngle;
        pivot.updateMatrixWorld(true);

        // Kembalikan cubies & stickers ke CUBE_GROUP
        const toMove = [...affected];
        for (const s of stickers) {
          if (affected.includes(s.userData.cubie)) toMove.push(s);
        }
        toMove.forEach(obj => CUBE_GROUP.attach(obj));

        // Round positions & rotations untuk elak drift
        cubies.forEach(c => {
          c.position.x = Math.round(c.position.x * 2) / 2;
          c.position.y = Math.round(c.position.y * 2) / 2;
          c.position.z = Math.round(c.position.z * 2) / 2;
        });

        scene.remove(pivot);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// ============================================================
// ALGO BAR & STEP NAV
// ============================================================
function renderAlgoBar() {
  const bar = document.getElementById('algoBar');
  bar.innerHTML = '';
  if (solution.length === 0) {
    bar.innerHTML = `<span class="empty">Set warna pada Rubik, kemudian tekan Solve</span>`;
    return;
  }
  solution.forEach((mv, i) => {
    const span = document.createElement('span');
    span.className = 'step';
    if (i < currentStep) span.classList.add('done');
    if (i === currentStep) span.classList.add('current');
    span.textContent = mv;
    bar.appendChild(span);
  });
}

function updateStepInfo() {
  const info = document.getElementById('stepInfo');
  if (solution.length === 0) {
    info.textContent = '—';
    document.getElementById('nextBtn').disabled = true;
    document.getElementById('prevBtn').disabled = true;
    return;
  }
  info.textContent = `${currentStep + 1} / ${solution.length}`;
  document.getElementById('nextBtn').disabled = currentStep >= solution.length - 1;
  document.getElementById('prevBtn').disabled = currentStep < 0;
}

const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');

nextBtn.addEventListener('click', async () => {
  if (isAnimating) return;
  if (currentStep >= solution.length - 1) return;
  isAnimating = true;
  nextBtn.disabled = true;
  prevBtn.disabled = true;

  const nextStep = currentStep + 1;
  const move = solution[nextStep];
  currentStep = nextStep;
  renderAlgoBar();
  updateStepInfo();

  await animateMove(move, false);

  isAnimating = false;
  updateStepInfo();
});

prevBtn.addEventListener('click', async () => {
  if (isAnimating) return;
  if (currentStep < 0) return;
  isAnimating = true;
  nextBtn.disabled = true;
  prevBtn.disabled = true;

  const move = solution[currentStep];
  currentStep--;
  renderAlgoBar();
  updateStepInfo();

  await animateMove(move, true);

  isAnimating = false;
  updateStepInfo();
});

// ============================================================
// RESET
// ============================================================
resetBtn.addEventListener('click', () => {
  if (isAnimating) return;

  // Reset warna stickers
  for (const s of stickers) {
    s.userData.color = null;
    s.material.color.setHex(grayColor);
  }
  // Reset counter
  for (const k in colorCount) colorCount[k] = 0;
  selectedColor = null;
  solution = [];
  currentStep = -1;
  isAnimating = false;

  updateColorButtons();
  renderAlgoBar();
  updateStepInfo();
  solveBtn.disabled = true;
  setStatus('Reset selesai');
});

// ============================================================
// INIT
// ============================================================
renderAlgoBar();
updateStepInfo();
