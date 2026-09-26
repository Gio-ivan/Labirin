/* ===================================================================
   3D Third-Person Labyrinth Game (High Performance / Auto-Run & Auto-Camera)
   Script (script.js)
   =================================================================== */

// ================= MAZE CONFIGURATION =================
const MAZE_SIZE = 11;
const CELL_SIZE = 4.0; // 3D units per grid cell
const WALL_HEIGHT = 3.6;

// 1 = Wall, 0 = Walkable Corridor
// Start: (1,1) facing South. Locked door at dead-end ujung (9,9) mounted on South wall
const DOOR_GRID_X = 9;
const DOOR_GRID_Z = 9;

const MAZE_GRID = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1], // row 1: (1,1) Start, opens to South
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1], // row 2
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // row 3
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1], // row 4
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // row 5
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1], // row 6
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1], // row 7: (8,7) to (9,7) corridor turns South
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // row 8: col 9 is 0
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1], // row 9: (9,9) is DEAD END (ujung) with door on South wall
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // row 10
];

class LabyrinthGame {
  constructor() {
    this.container = document.getElementById('canvasContainer');
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // State
    this.isMuted = false;
    this.exploredPercent = 0;
    this.doorPosition3D = new THREE.Vector3(DOOR_GRID_X * CELL_SIZE, 0, (DOOR_GRID_Z + 0.48) * CELL_SIZE);

    // Grid Coordinates & Heading
    // Start at (1, 1) facing South down the corridor (dx=0, dz=1)
    this.gridX = 1;
    this.gridZ = 1;
    this.heading = { dx: 0, dz: 1 }; // Initial forward direction
    this.targetRotationY = 0; // Facing South
    this.currentRotationY = 0;

    // Movement State
    this.isAutoRunning = false;
    this.runSpeed = 6.2; // Fast, energetic run speed
    this.stepAudioTimer = 0;

    // Fog of War
    this.fog = Array.from({ length: MAZE_SIZE }, () => Array(MAZE_SIZE).fill(true));
    this.totalWalkable = 0;
    for (let r = 0; r < MAZE_SIZE; r++) {
      for (let c = 0; c < MAZE_SIZE; c++) {
        if (MAZE_GRID[r][c] !== 1) this.totalWalkable++;
      }
    }

    // Animation & Three.js variables
    this.animations = {};
    this.currentAnimation = 'idle';

    // Camera follow parameters (High elevated camera to see over walls at corners)
    this.cameraDistance = 5.5;
    this.cameraHeight = 8.0; // Well above WALL_HEIGHT (3.6) so corners never occlude character
    this.cameraCurrentPos = new THREE.Vector3(1 * CELL_SIZE, 8.0, 1 * CELL_SIZE - 5.5);

    // DOM UI Elements
    this.loadingScreen = document.getElementById('loadingScreen');
    this.statusBanner = document.getElementById('statusBanner');
    this.exploredText = document.getElementById('exploredText');
    this.playerCoordText = document.getElementById('playerCoord');
    this.muteBtn = document.getElementById('muteBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.fullscreenBtn = document.getElementById('fullscreenBtn');

    // Door Interaction & Toast Elements
    this.btnDoorInteract = document.getElementById('btnDoorInteract');
    this.toastPopup = document.getElementById('toastPopup');
    this.toastTimeout = null;

    // D-Pad Decision Buttons (Bottom-Left)
    this.dpadWrapper = document.getElementById('dpadWrapper');
    this.btnForward = document.getElementById('btnForward');
    this.btnLeft = document.getElementById('btnLeft');
    this.btnRight = document.getElementById('btnRight');
    this.btnBackward = document.getElementById('btnBackward');

    this.initAudio();
    this.initThree();
    this.buildOptimizedMaze();
    this.loadCharacter();
    this.setupMinimap();
    this.bindEvents();

    // Start render loop
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // ================= AUDIO MANAGEMENT =================
  initAudio() {
    this.sounds = {
      footstep: new Audio('assets/sounds/footstep.ogg'),
      doorLocked: new Audio('assets/sounds/door_locked.wav'),
      blocked: new Audio('assets/sounds/blocked.ogg'),
      click: new Audio('assets/sounds/click.wav')
    };

    for (const s of Object.values(this.sounds)) {
      s.preload = 'auto';
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    } catch (e) {
      this.audioCtx = null;
    }
  }

  playSound(name) {
    if (this.isMuted) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    const snd = this.sounds[name];
    if (snd) {
      snd.currentTime = 0;
      snd.play().catch(() => {});
    }
  }

  // ================= THREE.JS HIGH PERFORMANCE SETUP =================
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d16);
    this.scene.fog = new THREE.Fog(0x090d16, 12, 42);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    // Renderer (No shadows, max 1.25 pixelRatio for rock-solid 60 FPS)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = false; // Disabled heavy shadow maps to eliminate lag
    this.container.appendChild(this.renderer.domElement);

    // Clean, crisp lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffedd5, 0.65);
    sunLight.position.set(25, 40, 20);
    this.scene.add(sunLight);

    // Window Resize Handler
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ================= PROCEDURAL TEXTURES =================
  createStoneWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Stone base
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 256, 256);

    const rows = 6;
    const rowH = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const cols = 3;
      const colW = 256 / cols;
      const offset = (r % 2) * (colW / 2);

      for (let c = -1; c < cols + 1; c++) {
        const x = c * colW + offset;
        const shade = Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${75 + shade}, ${85 + shade}, ${99 + shade})`;
        ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x + 2, y + 2, colW - 4, 2);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x + 2, y + rowH - 4, colW - 4, 2);
      }
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, y, 256, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const s = Math.random() * 5 + 2;
      const shade = Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${80 + shade}, ${90 + shade}, ${105 + shade})`;
      ctx.fillRect(x, y, s, s);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(MAZE_SIZE, MAZE_SIZE);
    return texture;
  }

  // ================= BUILD HIGH-PERFORMANCE MAZE (INSTANCED MESH) =================
  buildOptimizedMaze() {
    const wallTex = this.createStoneWallTexture();
    const floorTex = this.createFloorTexture();

    // 1. Single Floor Plane
    const floorGeo = new THREE.PlaneGeometry(MAZE_SIZE * CELL_SIZE, MAZE_SIZE * CELL_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(((MAZE_SIZE - 1) * CELL_SIZE) / 2, 0, ((MAZE_SIZE - 1) * CELL_SIZE) / 2);
    this.scene.add(floorMesh);

    // 2. Count Walls for InstancedMesh
    let wallCount = 0;
    for (let r = 0; r < MAZE_SIZE; r++) {
      for (let c = 0; c < MAZE_SIZE; c++) {
        if (MAZE_GRID[r][c] === 1) wallCount++;
      }
    }

    // 3. Single InstancedMesh for ALL 126 Walls (1 Draw Call instead of 126!)
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75 });
    const instancedWalls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);

    const dummy = new THREE.Object3D();
    let instanceIdx = 0;

    for (let r = 0; r < MAZE_SIZE; r++) {
      for (let c = 0; c < MAZE_SIZE; c++) {
        const x = c * CELL_SIZE;
        const z = r * CELL_SIZE;

        if (MAZE_GRID[r][c] === 1) {
          dummy.position.set(x, WALL_HEIGHT / 2, z);
          dummy.updateMatrix();
          instancedWalls.setMatrixAt(instanceIdx++, dummy.matrix);
        }
      }
    }

    instancedWalls.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedWalls);

    // Create locked door mounted flush against the South wall at the dead end of (9,9)
    this.createLockedDoor();
  }

  // ================= 3D FORTIFIED LOCKED DOOR (FLUSH ON WALL) =================
  createLockedDoor() {
    const doorGroup = new THREE.Group();
    // Mounted flush into the southern perimeter wall at the dead end (ujung) of cell (9,9)
    // Boundary between Row 9 (corridor) and Row 10 (wall) is at z = (DOOR_GRID_Z + 0.48) * CELL_SIZE
    doorGroup.position.set(DOOR_GRID_X * CELL_SIZE, 0, (DOOR_GRID_Z + 0.48) * CELL_SIZE);
    doorGroup.rotation.y = Math.PI; // Facing North directly into the dead-end corridor!

    // Granite Arch
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const pillarGeo = new THREE.BoxGeometry(0.5, WALL_HEIGHT, 0.5);
    const leftPillar = new THREE.Mesh(pillarGeo, archMat);
    leftPillar.position.set(-CELL_SIZE * 0.45, WALL_HEIGHT / 2, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, archMat);
    rightPillar.position.set(CELL_SIZE * 0.45, WALL_HEIGHT / 2, 0);
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.6, 0.6), archMat);
    archTop.position.set(0, WALL_HEIGHT - 0.3, 0);
    doorGroup.add(leftPillar, rightPillar, archTop);

    // Thick Wooden Door
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE * 0.88, WALL_HEIGHT * 0.88, 0.25), woodMat);
    doorMesh.position.set(0, (WALL_HEIGHT * 0.88) / 2, 0);
    doorGroup.add(doorMesh);

    // Heavy Iron Crossbars
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
    for (let h = 0.8; h <= WALL_HEIGHT * 0.75; h += 0.8) {
      const ironBar = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE * 0.85, 0.12, 0.32), ironMat);
      ironBar.position.set(0, h, 0);
      doorGroup.add(ironBar);
    }

    // Heavy Iron Padlock
    const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9 }));
    lockBody.position.set(0, 1.6, 0.22);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 }));
    shackle.position.set(0, 1.9, 0.22);
    doorGroup.add(lockBody, shackle);

    // Red Danger Light
    const redLight = new THREE.PointLight(0xef4444, 2.0, 9);
    redLight.position.set(0, WALL_HEIGHT * 0.75, 0.8);
    doorGroup.add(redLight);

    this.scene.add(doorGroup);
  }

  // ================= LOAD 3D CHARACTER (GLTF/Mixamo) =================
  loadCharacter() {
    const loader = new THREE.GLTFLoader();

    const onModelLoaded = (gltf) => {
      this.character = gltf.scene;
      this.character.scale.set(1.15, 1.15, 1.15);

      // Place at Start Cell (1, 1)
      this.character.position.set(1 * CELL_SIZE, 0, 1 * CELL_SIZE);
      this.character.rotation.y = this.targetRotationY;

      this.scene.add(this.character);

      // Soft adventurer light attached to player
      const playerLight = new THREE.PointLight(0xffedd5, 1.4, 8);
      playerLight.position.set(0, 1.8, 0.4);
      this.character.add(playerLight);

      // Setup Animation Mixer
      this.mixer = new THREE.AnimationMixer(this.character);
      if (gltf.animations && gltf.animations.length > 0) {
        for (const clip of gltf.animations) {
          const action = this.mixer.clipAction(clip);
          this.animations[clip.name.toLowerCase()] = action;
        }
      }

      // Default state: standing at start
      this.playAnimation('idle');

      // Reveal starting area
      this.revealFogAt(1 * CELL_SIZE, 1 * CELL_SIZE, 2);

      // Hide loading screen
      if (this.loadingScreen) {
        this.loadingScreen.style.opacity = '0';
        setTimeout(() => {
          this.loadingScreen.style.display = 'none';
        }, 400);
      }

      // Initial decision update
      this.evaluateJunctionOptions();
    };

    // 1. Try embedded Base64 (Bypasses file:/// CORS blocks)
    if (window.CHARACTER_GLB_B64 && typeof window.CHARACTER_GLB_B64 === 'string') {
      try {
        const binStr = atob(window.CHARACTER_GLB_B64);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        loader.parse(bytes.buffer, '', onModelLoaded, () => {
          this.fetchCharacterModel(loader, onModelLoaded);
        });
        return;
      } catch (e) {}
    }

    this.fetchCharacterModel(loader, onModelLoaded);
  }

  fetchCharacterModel(loader, onModelLoaded) {
    loader.load('assets/models/character.glb', onModelLoaded, undefined, () => {
      this.createFallbackPlayer();
    });
  }

  createFallbackPlayer() {
    const charGroup = new THREE.Group();
    const clothesMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.4), clothesMat);
    torso.position.y = 1.0;
    charGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), skinMat);
    head.position.y = 1.62;
    charGroup.add(head);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.28), pantsMat);
    leftLeg.position.set(-0.18, 0.33, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.28), pantsMat);
    rightLeg.position.set(0.18, 0.33, 0);
    charGroup.add(leftLeg, rightLeg);

    charGroup.position.set(1 * CELL_SIZE, 0, 1 * CELL_SIZE);
    this.character = charGroup;
    this.scene.add(this.character);
    this.revealFogAt(1 * CELL_SIZE, 1 * CELL_SIZE, 2);

    if (this.loadingScreen) {
      this.loadingScreen.style.display = 'none';
    }
    this.evaluateJunctionOptions();
  }

  playAnimation(name) {
    if (!this.mixer) return;
    const targetAnim = this.animations[name.toLowerCase()];
    if (!targetAnim || this.currentAnimation === name) return;

    const currentAnim = this.animations[this.currentAnimation.toLowerCase()];
    if (currentAnim) {
      currentAnim.fadeOut(0.15);
    }
    targetAnim.reset().fadeIn(0.15).play();
    this.currentAnimation = name;
  }

  // ================= 2D MINIMAP WITH FOG OF WAR (TOP-LEFT) =================
  setupMinimap() {
    this.updateMinimap();
  }

  revealFogAt(worldX, worldZ, radius = 2) {
    const col = Math.round(worldX / CELL_SIZE);
    const row = Math.round(worldZ / CELL_SIZE);

    let changed = false;
    for (let r = row - radius; r <= row + radius; r++) {
      for (let c = col - radius; c <= col + radius; c++) {
        if (r >= 0 && r < MAZE_SIZE && c >= 0 && c < MAZE_SIZE) {
          const dist = Math.hypot(c - col, r - row);
          if (dist <= radius + 0.3 && this.fog[r][c]) {
            this.fog[r][c] = false;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      let exploredWalkable = 0;
      for (let r = 0; r < MAZE_SIZE; r++) {
        for (let c = 0; c < MAZE_SIZE; c++) {
          if (MAZE_GRID[r][c] !== 1 && !this.fog[r][c]) {
            exploredWalkable++;
          }
        }
      }
      this.exploredPercent = Math.min(100, Math.round((exploredWalkable / this.totalWalkable) * 100));
      this.exploredText.innerText = `Jelajah: ${this.exploredPercent}%`;
    }

    this.playerCoordText.innerText = `Pos: (${col}, ${row})`;
  }

  updateMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cellW = w / MAZE_SIZE;
    const cellH = h / MAZE_SIZE;

    ctx.clearRect(0, 0, w, h);

    // 1. Explored Cells
    for (let r = 0; r < MAZE_SIZE; r++) {
      for (let c = 0; c < MAZE_SIZE; c++) {
        const x = c * cellW;
        const y = r * cellH;

        if (this.fog[r][c]) {
          ctx.fillStyle = '#090d16'; // Dense fog
          ctx.fillRect(x, y, cellW, cellH);
        } else {
          const type = MAZE_GRID[r][c];
          if (type === 1) {
            ctx.fillStyle = '#475569'; // Wall
            ctx.fillRect(x, y, cellW, cellH);
          } else if (type === 0) {
            ctx.fillStyle = '#fef3c7'; // Walkable path
            ctx.fillRect(x, y, cellW, cellH);

            if (r === DOOR_GRID_Z && c === DOOR_GRID_X) {
              ctx.fillStyle = '#ef4444';
              ctx.font = '10px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('🔒', x + cellW / 2, y + cellH / 2);
            }
          }
        }
      }
    }

    // 2. Player Arrow on Minimap
    if (this.character) {
      const pCol = this.character.position.x / CELL_SIZE;
      const pRow = this.character.position.z / CELL_SIZE;
      const px = pCol * cellW;
      const py = pRow * cellH;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-this.currentRotationY + Math.PI);

      // Gold Player Arrow
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ================= INTERSECTION & NAVIGATION SYSTEM =================
  bindEvents() {
    // Navigation Buttons (Forward, Left, Right, Backward)
    this.btnForward.addEventListener('click', () => this.chooseDirection('forward'));
    this.btnLeft.addEventListener('click', () => this.chooseDirection('left'));
    this.btnRight.addEventListener('click', () => this.chooseDirection('right'));
    this.btnBackward.addEventListener('click', () => this.chooseDirection('backward'));

    // Keyboard Shortcuts (Arrow keys / WASD also trigger the buttons!)
    window.addEventListener('keydown', (e) => {
      if (this.isAutoRunning) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        if (!this.btnForward.disabled) this.chooseDirection('forward');
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        if (!this.btnLeft.disabled) this.chooseDirection('left');
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        if (!this.btnRight.disabled) this.chooseDirection('right');
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        if (!this.btnBackward.disabled) this.chooseDirection('backward');
      }
    });

    // Reset Button
    this.resetBtn.addEventListener('click', () => {
      this.playSound('click');
      this.resetPlayerPosition();
    });

    // Mute Button
    this.muteBtn.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      this.muteBtn.innerHTML = this.isMuted ? '🔇 Audio' : '🔊 Audio';
      this.playSound('click');
    });

    // Fullscreen Button
    this.fullscreenBtn.addEventListener('click', () => {
      this.playSound('click');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        this.fullscreenBtn.innerHTML = '⛶ Normal';
      } else {
        document.exitFullscreen().catch(() => {});
        this.fullscreenBtn.innerHTML = '⛶ Layar';
      }
    });

    // Door Interaction Button
    if (this.btnDoorInteract) {
      this.btnDoorInteract.addEventListener('click', () => this.interactWithDoor());
    }
  }

  resetPlayerPosition() {
    this.isAutoRunning = false;
    this.gridX = 1;
    this.gridZ = 1;
    this.heading = { dx: 0, dz: 1 };
    this.targetRotationY = 0;
    this.currentRotationY = 0;

    if (this.character) {
      this.character.position.set(1 * CELL_SIZE, 0, 1 * CELL_SIZE);
      this.character.rotation.y = this.targetRotationY;
    }

    if (this.cameraCurrentPos) {
      this.cameraCurrentPos.set(1 * CELL_SIZE, this.cameraHeight, 1 * CELL_SIZE - this.cameraDistance);
    }

    if (this.btnDoorInteract) {
      this.btnDoorInteract.classList.add('hidden');
    }
    if (this.toastPopup) {
      this.toastPopup.classList.remove('show');
    }

    this.playAnimation('idle');
    this.revealFogAt(1 * CELL_SIZE, 1 * CELL_SIZE, 2);
    this.evaluateJunctionOptions();
  }

  // Check which relative directions are open from current position and heading
  evaluateJunctionOptions() {
    const cx = this.gridX;
    const cz = this.gridZ;
    const h = this.heading;

    // Check if standing in front of the locked door at the dead end (DOOR_GRID_X, DOOR_GRID_Z)
    const isAtDoorCell = (cx === DOOR_GRID_X && cz === DOOR_GRID_Z);
    if (isAtDoorCell) {
      if (this.btnDoorInteract) {
        this.btnDoorInteract.classList.remove('hidden');
      }
      this.statusBanner.innerText = 'Di depanmu ada pintu gerbang berantai. Tekan Buka Pintu untuk memeriksa.';
      this.statusBanner.className = 'status-banner door-near';
    } else {
      if (this.btnDoorInteract) {
        this.btnDoorInteract.classList.add('hidden');
      }
    }

    // Relative Directions:
    // Forward: (dx, dz)
    // Left: (dz, -dx)
    // Right: (-dz, dx)
    // Backward: (-dx, -dz)
    const fwdCoord = { x: cx + h.dx, z: cz + h.dz };
    const leftCoord = { x: cx + h.dz, z: cz - h.dx };
    const rightCoord = { x: cx - h.dz, z: cz + h.dx };
    const backCoord = { x: cx - h.dx, z: cz - h.dz };

    const isWalkable = (coord) => {
      if (coord.x < 0 || coord.x >= MAZE_SIZE || coord.z < 0 || coord.z >= MAZE_SIZE) return false;
      return MAZE_GRID[coord.z][coord.x] !== 1;
    };

    const canForward = isWalkable(fwdCoord);
    const canLeft = isWalkable(leftCoord);
    const canRight = isWalkable(rightCoord);
    const canBack = isWalkable(backCoord);

    // Update UI Buttons
    this.btnForward.disabled = !canForward;
    this.btnLeft.disabled = !canLeft;
    this.btnRight.disabled = !canRight;
    this.btnBackward.disabled = !canBack;

    // Show D-Pad Controller
    this.dpadWrapper.classList.remove('hidden');

    if (!isAtDoorCell) {
      const forwardOptions = (canForward ? 1 : 0) + (canLeft ? 1 : 0) + (canRight ? 1 : 0);

      if (forwardOptions === 0) {
        // Dead End!
        this.statusBanner.innerText = '⚠️ JALAN BUNTU! Lorong ini tertutup tembok. Tekan PUTAR BALIK!';
        this.statusBanner.className = 'status-banner locked-alert';
        this.playSound('blocked');
      } else if (forwardOptions > 1) {
        // Intersection
        this.statusBanner.innerText = '🔀 PERSIMPANGAN! Pilih arah: Lurus, Belok Kiri, atau Belok Kanan!';
        this.statusBanner.className = 'status-banner decision';
      } else {
        // Corner or continuation
        this.statusBanner.innerText = '➡️ Belokan tersedia! Tekan tombol D-Pad untuk terus berlari.';
        this.statusBanner.className = 'status-banner decision';
      }
    }
  }

  showToast(message) {
    if (!this.toastPopup) return;
    const span = this.toastPopup.querySelector('span');
    if (span) span.innerText = message;
    this.toastPopup.classList.add('show');
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastPopup.classList.remove('show');
    }, 2500);
  }

  interactWithDoor() {
    this.playSound('doorLocked');
    if (this.animations['headshake']) {
      this.playAnimation('headshake');
    }
    this.showToast('🔒 Pintu terkunci, cari jalan lain');
    this.statusBanner.innerText = '🔒 Pintu terkunci, cari jalan lain';
    this.statusBanner.className = 'status-banner door-near';
  }

  chooseDirection(choice) {
    if (this.isAutoRunning) return;
    this.playSound('click');

    // Hide door interact button immediately when player runs away
    if (this.btnDoorInteract) {
      this.btnDoorInteract.classList.add('hidden');
    }
    if (this.toastPopup) {
      this.toastPopup.classList.remove('show');
    }

    const h = this.heading;
    let newHeading = { ...h };

    if (choice === 'forward') {
      newHeading = { dx: h.dx, dz: h.dz };
    } else if (choice === 'left') {
      newHeading = { dx: h.dz, dz: -h.dx };
    } else if (choice === 'right') {
      newHeading = { dx: -h.dz, dz: h.dx };
    } else if (choice === 'backward') {
      newHeading = { dx: -h.dx, dz: -h.dz };
    }

    this.heading = newHeading;
    // Set target rotation angle in radians
    this.targetRotationY = Math.atan2(newHeading.dx, newHeading.dz);

    // Dim D-Pad while running
    this.dpadWrapper.classList.add('hidden');
    this.statusBanner.innerText = '🏃 Sedang berlari menyusuri lorong...';
    this.statusBanner.className = 'status-banner running';

    // Start Auto-Run!
    this.isAutoRunning = true;
    this.playAnimation('run'); // RUN ONLY!
  }

  // ================= UPDATE & ANIMATION LOOP =================
  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.08);

    if (this.mixer) {
      this.mixer.update(delta);
    }

    this.updateCharacter(delta);
    this.updateCameraFollow(delta);
    this.updateMinimap();

    this.renderer.render(this.scene, this.camera);
  }

  updateCharacter(delta) {
    if (!this.character) return;

    // Smoothly rotate character to target heading
    let diff = this.targetRotationY - this.currentRotationY;
    // Normalize diff to [-PI, PI]
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentRotationY += diff * Math.min(1, delta * 14);
    this.character.rotation.y = this.currentRotationY;

    if (!this.isAutoRunning) return;

    // Running movement forward along current heading
    const moveStep = this.runSpeed * delta;
    this.character.position.x += this.heading.dx * moveStep;
    this.character.position.z += this.heading.dz * moveStep;

    // Running footsteps sound
    this.stepAudioTimer += delta;
    if (this.stepAudioTimer >= 0.26) {
      this.playSound('footstep');
      this.stepAudioTimer = 0;
    }

    // Reveal Fog along current position
    this.revealFogAt(this.character.position.x, this.character.position.z, 2);

    // Check if reached or passed the center of the next cell
    const targetCellX = this.gridX + this.heading.dx;
    const targetCellZ = this.gridZ + this.heading.dz;
    const targetWorldX = targetCellX * CELL_SIZE;
    const targetWorldZ = targetCellZ * CELL_SIZE;

    const distToTarget = Math.hypot(
      targetWorldX - this.character.position.x,
      targetWorldZ - this.character.position.z
    );

    // If within 0.15m of target cell center or overshot
    const hasReachedTarget =
      distToTarget < 0.22 ||
      (this.heading.dx > 0 && this.character.position.x >= targetWorldX) ||
      (this.heading.dx < 0 && this.character.position.x <= targetWorldX) ||
      (this.heading.dz > 0 && this.character.position.z >= targetWorldZ) ||
      (this.heading.dz < 0 && this.character.position.z <= targetWorldZ);

    if (hasReachedTarget) {
      // Snap to exact cell center
      this.gridX = targetCellX;
      this.gridZ = targetCellZ;
      this.character.position.x = targetWorldX;
      this.character.position.z = targetWorldZ;

      // Check if this cell is the Locked Door!
      if (MAZE_GRID[this.gridZ][this.gridX] === 2) {
        this.triggerLockedDoorEvent();
        return;
      }

      // Check available neighbors from this new cell
      const cx = this.gridX;
      const cz = this.gridZ;
      const h = this.heading;

      const fwdCoord = { x: cx + h.dx, z: cz + h.dz };
      const leftCoord = { x: cx + h.dz, z: cz - h.dx };
      const rightCoord = { x: cx - h.dz, z: cz + h.dx };

      const isWalkable = (coord) => {
        if (coord.x < 0 || coord.x >= MAZE_SIZE || coord.z < 0 || coord.z >= MAZE_SIZE) return false;
        return MAZE_GRID[coord.z][coord.x] !== 1;
      };

      const canForward = isWalkable(fwdCoord);
      const canLeft = isWalkable(leftCoord);
      const canRight = isWalkable(rightCoord);

      // If ONLY Forward is open (straight corridor): keep running automatically!
      if (canForward && !canLeft && !canRight) {
        // Continue auto-running straight!
      } else {
        // Intersection, Corner, or Dead-End! Stop and ask player!
        this.isAutoRunning = false;
        this.playAnimation('idle');
        this.evaluateJunctionOptions();
      }
    }
  }

  // ================= AUTOMATIC CAMERA FOLLOWING & ORBITING =================
  updateCameraFollow(delta) {
    if (!this.character) return;

    // Ideal camera position is behind the character based on currentRotationY
    const charPos = this.character.position;
    const targetCamX = charPos.x - Math.sin(this.currentRotationY) * this.cameraDistance;
    const targetCamZ = charPos.z - Math.cos(this.currentRotationY) * this.cameraDistance;
    const targetCamY = charPos.y + this.cameraHeight;

    const targetPos = new THREE.Vector3(targetCamX, targetCamY, targetCamZ);

    // Smoothly lerp camera position
    this.cameraCurrentPos.lerp(targetPos, Math.min(1, delta * 7));
    this.camera.position.copy(this.cameraCurrentPos);

    // Look at character's torso (slightly above ground) from high elevation
    const lookTarget = new THREE.Vector3(charPos.x, charPos.y + 0.5, charPos.z);
    this.camera.lookAt(lookTarget);
  }
}

// Start Game
window.addEventListener('DOMContentLoaded', () => {
  window.game = new LabyrinthGame();
});
