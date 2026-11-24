<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SOBERANIA_DIMENSIONS, SOBERANIA_EVENTS } from '../data/estadioSoberania.js';

const props = defineProps({
  seats: {
    type: Array,
    required: true
  },
  tierBlocks: {
    type: Array,
    required: true
  },
  eventType: {
    type: String,
    default: 'baseball'
  },
  selectedSeat: {
    type: Object,
    default: null
  },
  highlightedSectorId: {
    type: String,
    default: ''
  },
  showGrandstandRoof: {
    type: Boolean,
    default: true
  },
  showExteriorEnvironment: {
    type: Boolean,
    default: true
  },
  stadiumLightsOn: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['select-seat', 'exit-seat-view']);

const containerRef = ref(null);
const hoveredSeat = ref(null);
const hoverScreenPos = ref({ x: 0, y: 0 });
const cameraMode = ref('orbit'); // 'orbit' | 'seat360'
const firstPersonFov = ref(68);

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animFrameId = null;

let stadiumGroup = null;
let exteriorGroup = null;
let eventOverlayGroup = null;
let roofGroup = null;
let ambientLight = null;
let towerLights = [];

let seatBackrestMesh = null;
let seatCushionMesh = null;
let seatFrameMesh = null;

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();
const tempEuler = new THREE.Euler();
const tempQuat = new THREE.Quaternion();
const tempPos = new THREE.Vector3();
const tempScale = new THREE.Vector3(1, 1, 1);

let isDraggingLook = false;
let dragStart = { x: 0, y: 0 };
let pointerMoved = false;
let headYaw = 0;
let headPitch = 0;
let baseSeatYaw = 0;

const isSeated360 = computed(() => cameraMode.value === 'seat360' && Boolean(props.selectedSeat));

// ============================================================================
// TEXTURAS PROCEDURALES REALISTAS (GRAMA, DIAMANTE, LED RIBBON, JUMBOTRON)
// ============================================================================
function createBaseballFieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Césped esmeralda con franjas de corte horizontales y verticales
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 1024; i += 28) {
    ctx.fillStyle = i % 56 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, i, 1024, 14);
  }

  // Plano cubre X[-105, 105] (210m) y Z[-105, 105] (210m)
  const toPxX = (x) => ((x + 105) / 210) * 1024;
  const toPxY = (z) => ((z + 105) / 210) * 1024;

  const homeZ = SOBERANIA_DIMENSIONS.homeZ;
  const homeX = toPxX(0);
  const homeY = toPxY(homeZ);

  // Franja de advertencia (Warning Track de arcilla) antes de la barda
  ctx.strokeStyle = '#9a5b32';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(homeX, homeY, (119 / 210) * 1024, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.stroke();

  // Cuadro interior de arcilla (Infield Dirt)
  ctx.fillStyle = '#b46938';
  ctx.beginPath();
  ctx.arc(homeX, toPxY(23.56), (29.5 / 210) * 1024, -Math.PI * 0.89, -Math.PI * 0.11);
  ctx.lineTo(homeX + 44, homeY + 28);
  ctx.lineTo(homeX - 44, homeY + 28);
  ctx.closePath();
  ctx.fill();

  // Césped interno del diamante
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(toPxX(0), toPxY(38.2));
  ctx.lineTo(toPxX(16.8), toPxY(22.6));
  ctx.lineTo(toPxX(0), toPxY(6.2));
  ctx.lineTo(toPxX(-16.8), toPxY(22.6));
  ctx.closePath();
  ctx.fill();

  // Círculo de Home Plate y Montículo del Pitcher
  ctx.fillStyle = '#b46938';
  ctx.beginPath();
  ctx.arc(homeX, homeY, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(toPxX(0), toPxY(23.56), 15, 0, Math.PI * 2);
  ctx.fill();

  // Líneas de Foul Blancas (45° hacia Jardín Izquierdo y Derecho)
  const poleDist = SOBERANIA_DIMENSIONS.foulPoleDist;
  const poleX = poleDist * Math.SQRT1_2;
  const poleZ = homeZ - poleDist * Math.SQRT1_2;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(homeX, homeY);
  ctx.lineTo(toPxX(-poleX), toPxY(poleZ));
  ctx.moveTo(homeX, homeY);
  ctx.lineTo(toPxX(poleX), toPxY(poleZ));
  ctx.stroke();

  // Bases (1ra, 2da, 3ra) y goma del pitcher
  ctx.fillStyle = '#ffffff';
  const drawBase = (bx, bz) => {
    ctx.save();
    ctx.translate(toPxX(bx), toPxY(bz));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  };
  drawBase(19.4, 22.6);
  drawBase(0, 3.2);
  drawBase(-19.4, 22.6);
  ctx.fillRect(toPxX(0) - 5, toPxY(23.56) - 2, 10, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createLedRibbonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.3, '#0284c7');
  grad.addColorStop(0.5, '#38bdf8');
  grad.addColorStop(0.7, '#0284c7');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 64);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★  ESTADIO NACIONAL SOBERANÍA  •  MANAGUA, NICARAGUA  ★', 512, 40);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createScoreboardTexture(titleText) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, 640, 360);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 620, 340);

  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ESTADIO NACIONAL SOBERANÍA', 320, 56);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(titleText, 320, 128);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(52, 175, 536, 125);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('NICARAGUA   0 1 0  2 0 1  0 0 X  |  C: 4  H: 8  E: 0', 320, 224);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('VISITANTE   0 0 1  0 0 0  1 0 0  |  C: 2  H: 5  E: 1', 320, 268);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 1. ARQUITECTURA INTERIOR DEL ESTADIO SOBERANÍA
// ============================================================================
function buildStadiumInterior() {
  if (stadiumGroup) {
    scene.remove(stadiumGroup);
  }
  stadiumGroup = new THREE.Group();

  const homeZ = SOBERANIA_DIMENSIONS.homeZ;

  // Terreno de juego principal
  const fieldTex = createBaseballFieldTexture();
  const fieldMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(210, 210),
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.78 })
  );
  fieldMesh.rotation.x = -Math.PI / 2;
  stadiumGroup.add(fieldMesh);

  // Montículo elevado del pitcher
  const moundMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.7, 0.28, 24),
    new THREE.MeshStandardMaterial({ color: '#b46938', roughness: 0.85 })
  );
  moundMesh.position.set(0, 0.14, SOBERANIA_DIMENSIONS.moundZ);
  stadiumGroup.add(moundMesh);

  // Barda Perimetral de Jardines (Verde oscuro + franja amarilla de Home Run)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.65 });
  const hrLineMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    emissive: '#ca8a04',
    emissiveIntensity: 0.35
  });

  const segments = 36;
  const rFence = 121.5;
  for (let i = 0; i < segments; i++) {
    const a1 = -Math.PI * 0.25 + (i / segments) * (Math.PI * 0.5);
    const a2 = -Math.PI * 0.25 + ((i + 1) / segments) * (Math.PI * 0.5);
    const x1 = Math.sin(a1) * rFence;
    const z1 = homeZ - Math.cos(a1) * rFence;
    const x2 = Math.sin(a2) * rFence;
    const z2 = homeZ - Math.cos(a2) * rFence;

    const len = Math.hypot(x2 - x1, z2 - z1) + 0.15;
    const angle = Math.atan2(-(z2 - z1), x2 - x1);

    const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 0.55), wallMat);
    wallSeg.position.set((x1 + x2) / 2, 1.6, (z1 + z2) / 2);
    wallSeg.rotation.y = angle;

    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.62), hrLineMat);
    topTrim.position.set((x1 + x2) / 2, 3.25, (z1 + z2) / 2);
    topTrim.rotation.y = angle;

    stadiumGroup.add(wallSeg, topTrim);
  }

  // Talud de Grama Natural detrás de la barda (característico del Soberanía en jardines)
  const bermMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.85 });
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI * 0.22 + ((i + 0.5) / 24) * (Math.PI * 0.44);
    const rBerm = 129.5;
    const bx = Math.sin(a) * rBerm;
    const bz = homeZ - Math.cos(a) * rBerm;
    const berm = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2.6, 13.5), bermMat);
    berm.position.set(bx, 1.1, bz);
    berm.rotation.y = -a;
    berm.rotation.x = -0.18;
    stadiumGroup.add(berm);
  }

  // Postes de Foul Amarillos en Jardín Izquierdo (-X) y Derecho (+X)
  const poleDist = SOBERANIA_DIMENSIONS.foulPoleDist;
  const poleX = poleDist * Math.SQRT1_2;
  const poleZ = homeZ - poleDist * Math.SQRT1_2;
  const poleMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    emissive: '#eab308',
    emissiveIntensity: 0.5
  });
  [-1, 1].forEach((side) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 17, 12), poleMat);
    pole.position.set(side * poleX, 8.5, poleZ);
    stadiumGroup.add(pole);
  });

  // Dugouts de 1ra Base (+X) y 3ra Base (-X)
  const dugoutMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
  [-1, 1].forEach((side) => {
    const dugout = new THREE.Mesh(new THREE.BoxGeometry(15, 1.35, 2.5), dugoutMat);
    dugout.position.set(side * 19.5, 0.68, 22.5);
    dugout.rotation.y = side * (-Math.PI / 4);
    stadiumGroup.add(dugout);
  });

  // Edificio de Palcos VIP y Cabina de Prensa detrás de Home Plate + Cinturón LED Curvo
  const suiteWhiteMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.45 });
  const suiteGlassMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.15,
    metalness: 0.8
  });
  const ledTex = createLedRibbonTexture();
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledTex,
    emissive: '#38bdf8',
    emissiveMap: ledTex,
    emissiveIntensity: 0.7
  });

  const suiteSegments = 14;
  for (let i = 0; i < suiteSegments; i++) {
    const theta = -0.68 + ((i + 0.5) / suiteSegments) * 1.36;
    const rSuite = 31.2;
    const sx = Math.sin(theta) * rSuite;
    const sz = homeZ + Math.cos(theta) * rSuite;

    // Cinturón LED curvo en la fascia del Mezzanine
    const ledSeg = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.35), ledMat);
    ledSeg.position.set(Math.sin(theta) * 28.6, 6.7, homeZ + Math.cos(theta) * 28.6);
    ledSeg.rotation.y = theta;
    stadiumGroup.add(ledSeg);

    // Cabina de Prensa / Palcos elevados detrás de Home Plate (theta entre -0.35 y +0.35)
    if (Math.abs(theta) < 0.36) {
      const boxBase = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, 4.2), suiteWhiteMat);
      boxBase.position.set(Math.sin(theta) * 48.2, 20.4, homeZ + Math.cos(theta) * 48.2);
      boxBase.rotation.y = theta;

      const glassBand = new THREE.Mesh(new THREE.BoxGeometry(3.85, 1.5, 4.3), suiteGlassMat);
      glassBand.position.set(Math.sin(theta) * 48.0, 20.6, homeZ + Math.cos(theta) * 48.0);
      glassBand.rotation.y = theta;

      stadiumGroup.add(boxBase, glassBand);
    }
  }

  // Pantalla Gigante (Jumbotron) en Jardín Izquierdo-Central con estructura metálica trasera
  const boardTex = createScoreboardTexture(SOBERANIA_EVENTS[props.eventType]?.name || 'Juego Oficial');
  const jumbotronGroup = new THREE.Group();
  jumbotronGroup.position.set(-34, 13.5, -83);
  jumbotronGroup.rotation.y = 0.28;

  const screenMesh = new THREE.Mesh(
    new THREE.BoxGeometry(24, 13, 0.8),
    new THREE.MeshStandardMaterial({
      map: boardTex,
      emissive: '#ffffff',
      emissiveMap: boardTex,
      emissiveIntensity: 0.6
    })
  );
  jumbotronGroup.add(screenMesh);

  // Estructura de celosía de acero detrás de la pantalla (visible desde el exterior)
  const steelMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.35 });
  for (const px of [-9, -3, 3, 9]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.55, 22, 0.55), steelMat);
    col.position.set(px, -2.5, -1.6);
    const backCol = new THREE.Mesh(new THREE.BoxGeometry(0.45, 22, 0.45), steelMat);
    backCol.position.set(px, -2.5, -4.2);
    jumbotronGroup.add(col, backCol);
  }
  for (const py of [-10, -5, 0, 5]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 3.2), steelMat);
    cross.position.set(0, py, -2.9);
    jumbotronGroup.add(cross);
  }
  stadiumGroup.add(jumbotronGroup);

  // Bloques de concreto bajo graderías (InstancedMesh)
  if (props.tierBlocks.length > 0) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const tierMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.88 });
    const instancedTiers = new THREE.InstancedMesh(boxGeo, tierMat, props.tierBlocks.length);

    props.tierBlocks.forEach((b, i) => {
      tempPos.set(b.x, b.y, b.z);
      tempEuler.set(0, b.rotY || 0, 0);
      tempQuat.setFromEuler(tempEuler);
      tempScale.set(b.w, b.h, b.d);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      instancedTiers.setMatrixAt(i, tempMatrix);
    });
    instancedTiers.instanceMatrix.needsUpdate = true;
    stadiumGroup.add(instancedTiers);
  }

  // =========================================================================
  // TECHO VOLADIZO BLANCO SEGMENTADO (FIEL A LAS FOTOS AÉREAS DEL SOBERANÍA)
  // =========================================================================
  roofGroup = new THREE.Group();
  roofGroup.visible = props.showGrandstandRoof;

  const whiteRoofMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.3,
    metalness: 0.15,
    side: THREE.DoubleSide
  });
  const trussSteelMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.65,
    roughness: 0.35
  });

  // 1) Techo Central Curvo detrás de Home Plate (elevado sobre cabina de prensa)
  const centerRoofSegs = 12;
  for (let i = 0; i < centerRoofSegs; i++) {
    const theta = -0.58 + ((i + 0.5) / centerRoofSegs) * 1.16;
    const isHighCenter = Math.abs(theta) < 0.36;
    const roofY = isHighCenter ? 24.4 : 21.6;
    const rRoof = 40.5;
    const rx = Math.sin(theta) * rRoof;
    const rz = homeZ + Math.cos(theta) * rRoof;

    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.32, 21.5), whiteRoofMat);
    panel.position.set(rx, roofY, rz);
    panel.rotation.y = theta;
    panel.rotation.x = -0.07;

    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 22.0), trussSteelMat);
    rib.position.set(rx, roofY - 0.45, rz);
    rib.rotation.y = theta;
    rib.rotation.x = -0.07;

    roofGroup.add(panel, rib);
  }

  // 2) Ala de Techo en 3ra Base / Jardín Izquierdo (2 tramos escalonados como en la foto aérea)
  const addWingRoof = (sideSign, alongStart, alongEnd, roofY) => {
    const steps = 6;
    const stepLen = (alongEnd - alongStart) / steps;
    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    for (let i = 0; i < steps; i++) {
      const along = alongStart + (i + 0.5) * stepLen;
      const lat = 34.5;
      const rx = dirAlongX * along + dirOutX * lat;
      const rz = homeZ + dirAlongZ * along + dirOutZ * lat;

      const panel = new THREE.Mesh(new THREE.BoxGeometry(stepLen + 0.2, 0.32, 18.5), whiteRoofMat);
      panel.position.set(rx, roofY, rz);
      panel.rotation.y = sideSign * (Math.PI / 4);

      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 19.0), trussSteelMat);
      rib.position.set(rx, roofY - 0.42, rz);
      rib.rotation.y = sideSign * (Math.PI / 4);

      roofGroup.add(panel, rib);
    }
  };

  // Tramo 1 y Tramo 2 escalonados en Jardín Izquierdo (-1)
  addWingRoof(-1, 25, 50, 20.6);
  addWingRoof(-1, 52, 75, 19.2);
  // Ala continua en Jardín Derecho (+1)
  addWingRoof(1, 25, 65, 20.6);

  // 6 Torres de Iluminación Monumentales del Estadio Soberanía
  const towerPositions = [
    [-46, 78],
    [46, 78],
    [-76, 12],
    [76, 12],
    [-64, -68],
    [64, -68]
  ];
  const lampPanelMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fef9c3',
    emissiveIntensity: 1.7
  });

  towerPositions.forEach(([tx, tz]) => {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.8, 36, 10),
      new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.6 })
    );
    mast.position.set(tx, 18, tz);

    const bank = new THREE.Mesh(new THREE.BoxGeometry(7.2, 4.2, 0.9), lampPanelMat);
    bank.position.set(tx, 36.5, tz);
    bank.lookAt(0, 2, 18);

    roofGroup.add(mast, bank);
  });

  stadiumGroup.add(roofGroup);
  scene.add(stadiumGroup);
}

// ============================================================================
// 2. ARQUITECTURA EXTERIOR DEL ESTADIO SOBERANÍA (FACHADA, RAMPAS Y ENTORNO)
// ============================================================================
function buildStadiumExterior() {
  if (exteriorGroup) {
    scene.remove(exteriorGroup);
  }
  exteriorGroup = new THREE.Group();
  exteriorGroup.visible = props.showExteriorEnvironment;

  const homeZ = SOBERANIA_DIMENSIONS.homeZ;

  // 1. Explanada Exterior / Plaza Perimetral Pavimentada
  const plazaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ color: '#1e242b', roughness: 0.92 })
  );
  plazaFloor.rotation.x = -Math.PI / 2;
  plazaFloor.position.y = -0.05;
  exteriorGroup.add(plazaFloor);

  // Áreas verdes / parques que rodean el estadio
  const parkGrassMat = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.9 });
  const parkRing = new THREE.Mesh(new THREE.RingGeometry(132, 175, 48), parkGrassMat);
  parkRing.rotation.x = -Math.PI / 2;
  parkRing.position.set(0, -0.03, 5);
  exteriorGroup.add(parkRing);

  // 2. Fachada Exterior Curva de Concreto Blanco + Columnas + Ventanales + Banderines Rojos
  const facadeWhiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.48 });
  const columnMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4 });
  const lobbyGlassMat = new THREE.MeshStandardMaterial({
    color: '#0c4a6e',
    roughness: 0.15,
    metalness: 0.75
  });
  const redBannerMat = new THREE.MeshStandardMaterial({
    color: '#dc2626',
    roughness: 0.5
  });

  const extSegments = 20;
  for (let i = 0; i < extSegments; i++) {
    const theta = -0.78 + ((i + 0.5) / extSegments) * 1.56;
    const rWall = 49.5;
    const wx = Math.sin(theta) * rWall;
    const wz = homeZ + Math.cos(theta) * rWall;

    // Muro exterior blanco de 3 niveles
    const wallPanel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 18.2, 1.1), facadeWhiteMat);
    wallPanel.position.set(wx, 9.1, wz);
    wallPanel.rotation.y = theta;

    // Contrafuerte / Columna estructural exterior
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 19.6, 2.2), columnMat);
    pillar.position.set(Math.sin(theta) * 50.3, 9.8, homeZ + Math.cos(theta) * 50.3);
    pillar.rotation.y = theta;

    // Ventanales panorámicos en el lobby central detrás de Home Plate
    if (Math.abs(theta) < 0.34) {
      const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(3.6, 13.5, 1.35), lobbyGlassMat);
      glassFacade.position.set(wx, 7.5, wz);
      glassFacade.rotation.y = theta;
      exteriorGroup.add(glassFacade);
    } else if (i % 2 === 0) {
      // Banderines verticales rojos característicos en los costados (como en la foto nocturna)
      const banner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 7.2, 0.2), redBannerMat);
      banner.position.set(Math.sin(theta) * 50.2, 11.5, homeZ + Math.cos(theta) * 50.2);
      banner.rotation.y = theta;
      exteriorGroup.add(banner);
    }

    exteriorGroup.add(wallPanel, pillar);
  }

  // Cierre exterior de las alas laterales (3ra Base y 1ra Base)
  const buildWingExteriorWall = (sideSign, alongStart, alongEnd) => {
    const span = alongEnd - alongStart;
    const midAlong = (alongStart + alongEnd) / 2;
    const lat = 43.2;

    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    const wx = dirAlongX * midAlong + dirOutX * lat;
    const wz = homeZ + dirAlongZ * midAlong + dirOutZ * lat;

    const wingWall = new THREE.Mesh(new THREE.BoxGeometry(span, 17.5, 1.2), facadeWhiteMat);
    wingWall.position.set(wx, 8.75, wz);
    wingWall.rotation.y = sideSign * (Math.PI / 4);
    exteriorGroup.add(wingWall);

    // Columnas exteriores cada 6 metros
    for (let a = alongStart; a <= alongEnd; a += 6) {
      const px = dirAlongX * a + dirOutX * (lat + 0.8);
      const pz = homeZ + dirAlongZ * a + dirOutZ * (lat + 0.8);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.85, 18.8, 2.1), columnMat);
      col.position.set(px, 9.4, pz);
      col.rotation.y = sideSign * (Math.PI / 4);
      exteriorGroup.add(col);
    }
  };

  buildWingExteriorWall(-1, 22, 74);
  buildWingExteriorWall(1, 22, 65);

  // 3. Plaza Principal de Acceso detrás de Home Plate + Escalinata Monumental
  const mainPlaza = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.25, 28),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.7 })
  );
  mainPlaza.position.set(0, 0.12, homeZ + 62);
  exteriorGroup.add(mainPlaza);

  // Pórtico de entrada principal con acento dorado
  const gateCanopy = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
  );
  gateCanopy.position.set(0, 6.2, homeZ + 52);
  const goldTrim = new THREE.Mesh(
    new THREE.BoxGeometry(24.2, 0.35, 8.2),
    new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.7, roughness: 0.25 })
  );
  goldTrim.position.set(0, 6.55, homeZ + 52);
  exteriorGroup.add(gateCanopy, goldTrim);

  // 4. Pabellón Exterior de Jardín Derecho (Visible en la esquina inferior derecha de las fotos aéreas)
  const rfPavilion = new THREE.Group();
  rfPavilion.position.set(84, 0, -34);
  rfPavilion.rotation.y = -0.55;

  const pavBody = new THREE.Mesh(new THREE.BoxGeometry(22, 8.5, 13), facadeWhiteMat);
  pavBody.position.y = 4.25;
  const pavRoof = new THREE.Mesh(new THREE.BoxGeometry(25, 0.5, 16), facadeWhiteMat);
  pavRoof.position.y = 9.0;
  pavRoof.rotation.x = 0.12;
  rfPavilion.add(pavBody, pavRoof);

  for (const bx of [-7, -2.5, 2.5, 7]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.2, 0.2), redBannerMat);
    b.position.set(bx, 4.6, 6.6);
    rfPavilion.add(b);
  }
  exteriorGroup.add(rfPavilion);

  // 5. Dos Canchas Auxiliares de Entrenamiento en el exterior de Jardín Izquierdo (foto aérea)
  const auxFieldMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.8 });
  [-102, -124].forEach((ax) => {
    const miniField = new THREE.Mesh(new THREE.BoxGeometry(18, 0.15, 26), auxFieldMat);
    miniField.position.set(ax, 0.08, -32);
    exteriorGroup.add(miniField);
  });

  // 6. Estacionamiento Exterior Este (Costado 1ra Base) con vehículos esquemáticos
  const parkingLot = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.12, 68),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 })
  );
  parkingLot.position.set(106, 0.06, 38);
  exteriorGroup.add(parkingLot);

  const carColors = ['#f8fafc', '#94a3b8', '#334155', '#1e293b'];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 3 === 0) continue;
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 1.35, 4.2),
        new THREE.MeshStandardMaterial({
          color: carColors[(row + col) % carColors.length],
          roughness: 0.4
        })
      );
      car.position.set(92 + row * 9.5, 0.72, 12 + col * 7.2);
      exteriorGroup.add(car);
    }
  }

  // 7. Arbolado Perimetral Exterior
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#451a03' });
  const foliageMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.85 });
  const treeCoords = [
    [-72, 85],
    [-55, 98],
    [-32, 108],
    [32, 108],
    [55, 98],
    [72, 85],
    [-112, 22],
    [-118, 52],
    [132, 12],
    [132, 68]
  ];
  treeCoords.forEach(([tx, tz]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8), trunkMat);
    trunk.position.set(tx, 1.6, tz);
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8, 1), foliageMat);
    crown.position.set(tx, 4.6, tz);
    exteriorGroup.add(trunk, crown);
  });

  scene.add(exteriorGroup);
}

// ============================================================================
// 3. ELEMENTOS ESPECIALES POR TIPO DE EVENTO
// ============================================================================
function buildEventOverlay() {
  if (eventOverlayGroup) {
    scene.remove(eventOverlayGroup);
  }
  eventOverlayGroup = new THREE.Group();

  if (props.eventType === 'concert') {
    const stageDeck = new THREE.Mesh(
      new THREE.BoxGeometry(30, 2.2, 14),
      new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.35, metalness: 0.4 })
    );
    stageDeck.position.set(0, 1.1, -54);

    const stageBackdrop = new THREE.Mesh(
      new THREE.BoxGeometry(28, 11.5, 0.8),
      new THREE.MeshStandardMaterial({
        color: '#1e1b4b',
        emissive: '#d4af37',
        emissiveIntensity: 0.35
      })
    );
    stageBackdrop.position.set(0, 7.5, -60.5);

    eventOverlayGroup.add(stageDeck, stageBackdrop);
  } else if (props.eventType === 'derby') {
    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 3.2, 6.5),
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.25,
        wireframe: true
      })
    );
    cage.position.set(0, 1.6, SOBERANIA_DIMENSIONS.homeZ);
    eventOverlayGroup.add(cage);
  }

  scene.add(eventOverlayGroup);
}

// ============================================================================
// 4. INSTANCED MESH DE BUTACAS
// ============================================================================
function buildInstancedSeats() {
  if (seatBackrestMesh) {
    scene.remove(seatBackrestMesh);
    seatBackrestMesh.geometry.dispose();
  }
  if (seatCushionMesh) {
    scene.remove(seatCushionMesh);
    seatCushionMesh.geometry.dispose();
  }
  if (seatFrameMesh) {
    scene.remove(seatFrameMesh);
    seatFrameMesh.geometry.dispose();
  }

  const count = props.seats.length;
  if (count === 0) return;

  const backrestGeo = new THREE.BoxGeometry(0.46, 0.46, 0.08);
  const cushionGeo = new THREE.BoxGeometry(0.46, 0.08, 0.42);
  const frameGeo = new THREE.BoxGeometry(0.08, 0.36, 0.08);

  const backrestMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  const cushionMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.7 });

  seatBackrestMesh = new THREE.InstancedMesh(backrestGeo, backrestMat, count);
  seatCushionMesh = new THREE.InstancedMesh(cushionGeo, cushionMat, count);
  seatFrameMesh = new THREE.InstancedMesh(frameGeo, frameMat, count);

  for (let i = 0; i < count; i++) {
    const s = props.seats[i];
    const cosY = Math.cos(s.yaw);
    const sinY = Math.sin(s.yaw);

    tempPos.set(s.x, s.y + 0.18, s.z);
    tempEuler.set(0, s.yaw, 0);
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatFrameMesh.setMatrixAt(i, tempMatrix);

    tempPos.set(s.x + sinY * 0.12, s.y + 0.36, s.z + cosY * 0.12);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatCushionMesh.setMatrixAt(i, tempMatrix);

    tempPos.set(s.x - sinY * 0.08, s.y + 0.6, s.z - cosY * 0.08);
    tempEuler.set(-0.14, s.yaw, 0);
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatBackrestMesh.setMatrixAt(i, tempMatrix);
  }

  seatFrameMesh.instanceMatrix.needsUpdate = true;
  seatCushionMesh.instanceMatrix.needsUpdate = true;
  seatBackrestMesh.instanceMatrix.needsUpdate = true;

  updateSeatColors();
  scene.add(seatFrameMesh, seatCushionMesh, seatBackrestMesh);
}

function updateSeatColors() {
  if (!seatBackrestMesh || !seatCushionMesh) return;
  const selId = props.selectedSeat?.id;
  const hlSector = props.highlightedSectorId;

  for (let i = 0; i < props.seats.length; i++) {
    const s = props.seats[i];
    if (s.id === selId) {
      tempColor.set('#10b981');
    } else if (s.blocked) {
      tempColor.set('#334155');
    } else if (hlSector && s.sectorId === hlSector) {
      tempColor.set('#f59e0b');
    } else {
      tempColor.set(s.baseColor);
    }

    seatBackrestMesh.setColorAt(i, tempColor);
    tempColor.multiplyScalar(0.84);
    seatCushionMesh.setColorAt(i, tempColor);
  }

  if (seatBackrestMesh.instanceColor) seatBackrestMesh.instanceColor.needsUpdate = true;
  if (seatCushionMesh.instanceColor) seatCushionMesh.instanceColor.needsUpdate = true;
}

// ============================================================================
// 5. CÁMARA 360° EN PRIMERA PERSONA VS CÁMARA ORBITAL / EXTERIOR
// ============================================================================
function enterSeat360(seat) {
  if (!seat || !camera || !controls) return;
  cameraMode.value = 'seat360';
  controls.enabled = false;

  const eyeX = seat.x;
  const eyeY = seat.y + 1.12;
  const eyeZ = seat.z;
  camera.position.set(eyeX, eyeY, eyeZ);

  const target = SOBERANIA_EVENTS[props.eventType]?.focalTarget || { x: 0, y: 0.8, z: 18 };
  const dx = target.x - eyeX;
  const dy = target.y - eyeY;
  const dz = target.z - eyeZ;
  const horizDist = Math.hypot(dx, dz);

  baseSeatYaw = Math.atan2(-dx, -dz);
  headYaw = baseSeatYaw;
  headPitch = Math.max(-0.55, Math.min(0.45, Math.atan2(dy, horizDist)));

  camera.fov = firstPersonFov.value;
  camera.updateProjectionMatrix();
  applyFirstPersonRotation();
}

function exitSeat360() {
  cameraMode.value = 'orbit';
  if (!camera || !controls) return;
  camera.fov = 48;
  camera.updateProjectionMatrix();
  camera.position.set(0, 74, 128);
  controls.target.set(0, 6, 4);
  controls.enabled = true;
  controls.update();
  emit('exit-seat-view');
}

function applyFirstPersonRotation() {
  if (!camera) return;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = headYaw;
  camera.rotation.x = headPitch;
  camera.rotation.z = 0;
}

function lookPreset(dir) {
  if (!isSeated360.value) return;
  if (dir === 'focal') {
    const seat = props.selectedSeat;
    const target = SOBERANIA_EVENTS[props.eventType]?.focalTarget || { x: 0, y: 0.8, z: 18 };
    const dx = target.x - seat.x;
    const dy = target.y - (seat.y + 1.12);
    const dz = target.z - seat.z;
    headYaw = Math.atan2(-dx, -dz);
    headPitch = Math.atan2(dy, Math.hypot(dx, dz));
  } else if (dir === 'left') {
    headYaw = baseSeatYaw + Math.PI / 2;
    headPitch = 0;
  } else if (dir === 'right') {
    headYaw = baseSeatYaw - Math.PI / 2;
    headPitch = 0;
  } else if (dir === 'back') {
    headYaw = baseSeatYaw + Math.PI;
    headPitch = 0.12;
  }
  applyFirstPersonRotation();
}

function setCameraViewPreset(preset) {
  if (isSeated360.value) exitSeat360();
  if (!camera || !controls) return;

  if (preset === 'panoramic') {
    camera.position.set(0, 74, 128);
    controls.target.set(0, 6, 4);
  } else if (preset === 'exterior') {
    camera.position.set(68, 34, 136);
    controls.target.set(0, 10, 56);
  } else if (preset === 'top') {
    camera.position.set(0, 175, 0);
    controls.target.set(0, 0, -0.1);
  } else if (preset === 'homeplate') {
    camera.position.set(0, 11, 66);
    controls.target.set(0, 2, -25);
  } else if (preset === 'outfield') {
    camera.position.set(0, 18, -74);
    controls.target.set(0, 10, 48);
  }
  controls.update();
}

// ============================================================================
// 6. INTERACCIÓN DE PUNTERO
// ============================================================================
function pickSeatAtPointer(clientX, clientY) {
  if (!containerRef.value || !camera || !seatBackrestMesh || !seatCushionMesh) return null;
  const rect = containerRef.value.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects([seatBackrestMesh, seatCushionMesh], false);
  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    return props.seats[hits[0].instanceId] || null;
  }
  return null;
}

function onPointerDown(e) {
  pointerMoved = false;
  dragStart = { x: e.clientX, y: e.clientY };
  if (isSeated360.value) {
    isDraggingLook = true;
  }
}

function onPointerMove(e) {
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (Math.hypot(dx, dy) > 5) {
    pointerMoved = true;
  }

  if (isSeated360.value && isDraggingLook) {
    headYaw -= dx * 0.0042;
    headPitch = Math.max(-0.95, Math.min(0.85, headPitch - dy * 0.0038));
    dragStart = { x: e.clientX, y: e.clientY };
    applyFirstPersonRotation();
    return;
  }

  const hitSeat = pickSeatAtPointer(e.clientX, e.clientY);
  hoveredSeat.value = hitSeat;
  if (hitSeat && containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    hoverScreenPos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }
}

function onPointerUp(e) {
  isDraggingLook = false;
  if (!pointerMoved) {
    const clickedSeat = pickSeatAtPointer(e.clientX, e.clientY);
    if (clickedSeat && !clickedSeat.blocked) {
      emit('select-seat', clickedSeat);
    }
  }
}

function onWheel(e) {
  if (!isSeated360.value || !camera) return;
  e.preventDefault();
  firstPersonFov.value = Math.min(88, Math.max(36, firstPersonFov.value + e.deltaY * 0.03));
  camera.fov = firstPersonFov.value;
  camera.updateProjectionMatrix();
}

// ============================================================================
// 7. INICIALIZACIÓN THREE.JS
// ============================================================================
function initThreeScene() {
  const container = containerRef.value;
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(SOBERANIA_EVENTS[props.eventType]?.skyColor || '#070b14');
  scene.fog = new THREE.FogExp2('#070b14', 0.0018);

  camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.25, 520);
  camera.position.set(0, 74, 128);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.minDistance = 8;
  controls.maxDistance = 240;
  controls.target.set(0, 6, 4);

  ambientLight = new THREE.AmbientLight('#cbd5e1', 0.95);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight('#e0f2fe', '#0f172a', 0.7);
  scene.add(hemiLight);

  const lightCoords = [
    [-46, 36, 78],
    [46, 36, 78],
    [-76, 36, 12],
    [76, 36, 12],
    [0, 38, -72]
  ];
  towerLights = lightCoords.map(([lx, ly, lz]) => {
    const pt = new THREE.PointLight('#fefce8', 1750, 260, 1.25);
    pt.position.set(lx, ly, lz);
    scene.add(pt);
    return pt;
  });

  buildStadiumInterior();
  buildStadiumExterior();
  buildEventOverlay();
  buildInstancedSeats();

  const animate = () => {
    animFrameId = requestAnimationFrame(animate);
    if (controls && controls.enabled) {
      controls.update();
    }
    renderer.render(scene, camera);
  };
  animate();
}

function handleResize() {
  if (!containerRef.value || !renderer || !camera) return;
  const w = containerRef.value.clientWidth;
  const h = containerRef.value.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

watch(
  () => props.selectedSeat,
  (seat) => {
    updateSeatColors();
    if (seat) {
      enterSeat360(seat);
    } else if (cameraMode.value === 'seat360') {
      exitSeat360();
    }
  }
);

watch(() => props.highlightedSectorId, updateSeatColors);

watch(
  () => props.seats,
  () => {
    buildInstancedSeats();
  }
);

watch(
  () => props.eventType,
  (nextType) => {
    if (scene) {
      scene.background = new THREE.Color(SOBERANIA_EVENTS[nextType]?.skyColor || '#070b14');
    }
    buildStadiumInterior();
    buildEventOverlay();
    if (props.selectedSeat) {
      enterSeat360(props.selectedSeat);
    }
  }
);

watch(
  () => props.showGrandstandRoof,
  (val) => {
    if (roofGroup) roofGroup.visible = val;
  }
);

watch(
  () => props.showExteriorEnvironment,
  (val) => {
    if (exteriorGroup) exteriorGroup.visible = val;
  }
);

watch(
  () => props.stadiumLightsOn,
  (isOn) => {
    if (ambientLight) ambientLight.intensity = isOn ? 0.95 : 0.28;
    towerLights.forEach((l) => {
      l.intensity = isOn ? 1750 : 240;
    });
  }
);

onMounted(() => {
  initThreeScene();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (controls) controls.dispose();
  if (renderer) {
    renderer.dispose();
    renderer.domElement?.remove();
  }
});
</script>

<template>
  <div class="relative w-full h-[700px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 select-none">
    <!-- Lienzo WebGL Three.js -->
    <div
      ref="containerRef"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @wheel="onWheel"
      :class="[
        'w-full h-full',
        isSeated360 ? 'cursor-grab active:cursor-grabbing' : hoveredSeat ? 'cursor-pointer' : 'cursor-grab'
      ]"
    ></div>

    <!-- Tooltip flotante -->
    <div
      v-if="hoveredSeat && !isSeated360"
      class="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full -mt-3 px-3 py-2 rounded-xl bg-slate-950/95 border border-[#D4AF37]/80 text-xs text-slate-100 shadow-2xl backdrop-blur-md whitespace-nowrap"
      :style="{ left: `${hoverScreenPos.x}px`, top: `${hoverScreenPos.y}px` }"
    >
      <div class="font-bold text-[#E6C55A]">{{ hoveredSeat.sectorName }}</div>
      <div class="text-[11px] text-slate-300 mt-0.5">
        Fila <strong class="text-white">{{ hoveredSeat.row }}</strong> • Asiento
        <strong class="text-white">#{{ hoveredSeat.number }}</strong>
        <span class="ml-1.5 text-slate-400">(Elev. {{ hoveredSeat.y }}m)</span>
      </div>
      <div class="text-[10px] text-emerald-400 mt-0.5">
        Clic para entrar en vista 360° desde esta butaca
      </div>
    </div>

    <!-- HUD Superior Izquierdo -->
    <div class="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-slate-950/85 border border-slate-700/80 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs text-slate-200 shadow-xl">
      <span
        :class="[
          'w-2.5 h-2.5 rounded-full',
          isSeated360 ? 'bg-emerald-400 animate-pulse' : 'bg-[#D4AF37]'
        ]"
      ></span>
      <template v-if="isSeated360">
        <span>
          Vista 360° en <strong class="text-emerald-400">{{ selectedSeat.sectorName }}</strong>
          • Fila <strong>{{ selectedSeat.row }}</strong> • Silla <strong>#{{ selectedSeat.number }}</strong>
        </span>
      </template>
      <template v-else>
        <span>
          <strong>Estadio Nacional Soberanía</strong> • {{ seats.length.toLocaleString() }} butacas 3D mapeadas
        </span>
      </template>
    </div>

    <!-- Barra Inferior de Cámaras (Interior y Exterior) -->
    <div class="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-1.5 bg-slate-950/85 border border-slate-700/80 backdrop-blur-md p-1.5 rounded-xl text-xs text-slate-200 shadow-xl">
      <template v-if="isSeated360">
        <span class="px-2 py-1 text-emerald-400 font-semibold border-r border-slate-800">
          👁 Vista Real 360°
        </span>
        <button
          type="button"
          @click="lookPreset('left')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          ← 3ra Base
        </button>
        <button
          type="button"
          @click="lookPreset('focal')"
          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
        >
          Mirar al Diamante
        </button>
        <button
          type="button"
          @click="lookPreset('right')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          1ra Base →
        </button>
        <button
          type="button"
          @click="lookPreset('back')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Gradas Atrás ↻
        </button>
        <button
          type="button"
          @click="exitSeat360"
          class="ml-1 px-3 py-1 rounded-lg bg-[#D4AF37] hover:bg-[#E6C55A] text-black font-bold transition cursor-pointer"
        >
          ↑ Salir al Estadio
        </button>
      </template>

      <template v-else>
        <span class="px-2 py-1 text-[#D4AF37] font-semibold border-r border-slate-800">
          🎥 Cámaras del Estadio
        </span>
        <button
          type="button"
          @click="setCameraViewPreset('panoramic')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Panorámica
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('exterior')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer text-[#E6C55A]"
        >
          Fachada Exterior
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('homeplate')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Desde Home Plate
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('outfield')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Desde Jardín Central
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('top')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Cenital
        </button>
      </template>
    </div>
  </div>
</template>