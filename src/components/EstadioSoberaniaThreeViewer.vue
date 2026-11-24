<script setup>
import { ref, computed, watch, toRaw, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SOBERANIA_DIMENSIONS, SOBERANIA_EVENTS } from '../data/estadioSoberania.js';
import {
  createOptimizedSeatShellGeometry,
  createOptimizedSeatFrameGeometry,
  getCachedTexture,
  getSafeContainerSize
} from '../utils/stadiumThreeOptimizer.js';

const props = defineProps({
  seats: { type: Array, required: true },
  tierBlocks: { type: Array, required: true },
  eventType: { type: String, default: 'baseball' },
  selectedSeat: { type: Object, default: null },
  highlightedSectorId: { type: String, default: '' },
  showGrandstandRoof: { type: Boolean, default: true },
  showExteriorEnvironment: { type: Boolean, default: true },
  stadiumLightsOn: { type: Boolean, default: true }
});

const emit = defineEmits(['select-seat', 'exit-seat-view']);

const containerRef = ref(null);
const hoveredSeat = ref(null);
const hoverScreenPos = ref({ x: 0, y: 0 });
const cameraMode = ref('orbit'); // 'orbit' | 'seat360'
const firstPersonFov = ref(72);

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let resizeObserver = null;
let animFrameId = null;

let stadiumGroup = null;
let exteriorGroup = null;
let eventOverlayGroup = null;
let roofGroup = null;
let ambientLight = null;
let towerLights = [];

// 2 capas instanciadas low-poly de alto rendimiento
let seatShellMesh = null;
let seatFrameMesh = null;
let hiddenSeatIndex = -1;

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
let hoverRafScheduled = false;
let lastPointerEvent = { clientX: 0, clientY: 0 };

let headYaw = 0;
let headPitch = 0;
let baseSeatYaw = 0;

const isSeated360 = computed(() => cameraMode.value === 'seat360' && Boolean(props.selectedSeat));

function disposeGroup(group) {
  if (!group) return;
  scene?.remove(group);
  const disposedGeos = new Set();
  const disposedMats = new Set();
  group.traverse((obj) => {
    if (obj.geometry && !disposedGeos.has(obj.geometry)) {
      obj.geometry.dispose();
      disposedGeos.add(obj.geometry);
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!disposedMats.has(m)) {
          m.dispose();
          disposedMats.add(m);
        }
      });
    }
  });
}

// ============================================================================
// TEXTURAS PROCEDURALES CACHEADAS DEL CAMPO DE BÉISBOL
// ============================================================================
function getBaseballFieldTexture() {
  return getCachedTexture('soberania-baseball-field', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 1024; i += 28) {
      ctx.fillStyle = i % 56 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, i, 1024, 14);
    }

    const toPxX = (x) => ((x + 105) / 210) * 1024;
    const toPxY = (z) => ((z + 105) / 210) * 1024;

    const homeZ = SOBERANIA_DIMENSIONS.homeZ;
    const homeX = toPxX(0);
    const homeY = toPxY(homeZ);

    ctx.strokeStyle = '#9a5b32';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(homeX, homeY, (119 / 210) * 1024, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();

    ctx.fillStyle = '#b46938';
    ctx.beginPath();
    ctx.arc(homeX, toPxY(23.56), (29.5 / 210) * 1024, -Math.PI * 0.89, -Math.PI * 0.11);
    ctx.lineTo(homeX + 44, homeY + 28);
    ctx.lineTo(homeX - 44, homeY + 28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(toPxX(0), toPxY(38.2));
    ctx.lineTo(toPxX(16.8), toPxY(22.6));
    ctx.lineTo(toPxX(0), toPxY(6.2));
    ctx.lineTo(toPxX(-16.8), toPxY(22.6));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b46938';
    ctx.beginPath();
    ctx.arc(homeX, homeY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(toPxX(0), toPxY(23.56), 15, 0, Math.PI * 2);
    ctx.fill();

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
    tex.anisotropy = 4;
    return tex;
  });
}

function getLedRibbonTexture() {
  return getCachedTexture('soberania-led-ribbon', () => {
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
  });
}

function getScoreboardTexture(titleText) {
  return getCachedTexture(`soberania-board-${titleText}`, () => {
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
  });
}

// ============================================================================
// 1. ARQUITECTURA INTERIOR DEL ESTADIO SOBERANÍA
// ============================================================================
function buildStadiumInterior() {
  disposeGroup(stadiumGroup);
  stadiumGroup = new THREE.Group();

  const homeZ = SOBERANIA_DIMENSIONS.homeZ;

  const fieldTex = getBaseballFieldTexture();
  const fieldMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(210, 210),
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.78 })
  );
  fieldMesh.rotation.x = -Math.PI / 2;
  stadiumGroup.add(fieldMesh);

  const moundMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.7, 0.28, 20),
    new THREE.MeshStandardMaterial({ color: '#b46938', roughness: 0.85 })
  );
  moundMesh.position.set(0, 0.14, SOBERANIA_DIMENSIONS.moundZ);
  stadiumGroup.add(moundMesh);

  // Barda Perimetral de Jardines (geometrías compartidas)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.65 });
  const hrLineMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    emissive: '#ca8a04',
    emissiveIntensity: 0.35
  });

  const segments = 36;
  const rFence = 121.5;
  const segLen = ((Math.PI * 0.5) / segments) * rFence + 0.18;
  const wallSegGeo = new THREE.BoxGeometry(segLen, 3.2, 0.55);
  const topTrimGeo = new THREE.BoxGeometry(segLen, 0.22, 0.62);

  for (let i = 0; i < segments; i++) {
    const a1 = -Math.PI * 0.25 + (i / segments) * (Math.PI * 0.5);
    const a2 = -Math.PI * 0.25 + ((i + 1) / segments) * (Math.PI * 0.5);
    const x1 = Math.sin(a1) * rFence;
    const z1 = homeZ - Math.cos(a1) * rFence;
    const x2 = Math.sin(a2) * rFence;
    const z2 = homeZ - Math.cos(a2) * rFence;
    const angle = Math.atan2(-(z2 - z1), x2 - x1);

    const wallSeg = new THREE.Mesh(wallSegGeo, wallMat);
    wallSeg.position.set((x1 + x2) / 2, 1.6, (z1 + z2) / 2);
    wallSeg.rotation.y = angle;

    const topTrim = new THREE.Mesh(topTrimGeo, hrLineMat);
    topTrim.position.set((x1 + x2) / 2, 3.25, (z1 + z2) / 2);
    topTrim.rotation.y = angle;

    stadiumGroup.add(wallSeg, topTrim);
  }

  // Talud de Grama Natural detrás de la barda
  const bermMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.85 });
  const bermGeo = new THREE.BoxGeometry(10.5, 2.6, 13.5);
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI * 0.22 + ((i + 0.5) / 24) * (Math.PI * 0.44);
    const rBerm = 129.5;
    const berm = new THREE.Mesh(bermGeo, bermMat);
    berm.position.set(Math.sin(a) * rBerm, 1.1, homeZ - Math.cos(a) * rBerm);
    berm.rotation.y = -a;
    berm.rotation.x = -0.18;
    stadiumGroup.add(berm);
  }

  // Postes de Foul Amarillos
  const poleDist = SOBERANIA_DIMENSIONS.foulPoleDist;
  const poleX = poleDist * Math.SQRT1_2;
  const poleZ = homeZ - poleDist * Math.SQRT1_2;
  const poleMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    emissive: '#eab308',
    emissiveIntensity: 0.5
  });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 17, 10);
  [-1, 1].forEach((side) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * poleX, 8.5, poleZ);
    stadiumGroup.add(pole);
  });

  // Dugouts de 1ra y 3ra Base
  const dugoutMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
  const dugoutGeo = new THREE.BoxGeometry(15, 1.35, 2.5);
  [-1, 1].forEach((side) => {
    const dugout = new THREE.Mesh(dugoutGeo, dugoutMat);
    dugout.position.set(side * 19.5, 0.68, 22.5);
    dugout.rotation.y = side * (-Math.PI / 4);
    stadiumGroup.add(dugout);
  });

  // Cinturón LED Curvo y Cabina de Prensa
  const suiteWhiteMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.45 });
  const suiteGlassMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.15,
    metalness: 0.8
  });
  const ledTex = getLedRibbonTexture();
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledTex,
    emissive: '#38bdf8',
    emissiveMap: ledTex,
    emissiveIntensity: 0.7
  });

  const ledSegGeo = new THREE.BoxGeometry(3.4, 0.75, 0.35);
  const boxBaseGeo = new THREE.BoxGeometry(3.8, 3.8, 4.2);
  const glassBandGeo = new THREE.BoxGeometry(3.85, 1.5, 4.3);

  const suiteSegments = 14;
  for (let i = 0; i < suiteSegments; i++) {
    const theta = -0.68 + ((i + 0.5) / suiteSegments) * 1.36;

    const ledSeg = new THREE.Mesh(ledSegGeo, ledMat);
    ledSeg.position.set(Math.sin(theta) * 32.0, 10.65, homeZ + Math.cos(theta) * 32.0);
    ledSeg.rotation.y = theta;
    stadiumGroup.add(ledSeg);

    if (Math.abs(theta) < 0.36) {
      const boxBase = new THREE.Mesh(boxBaseGeo, suiteWhiteMat);
      boxBase.position.set(Math.sin(theta) * 48.2, 22.2, homeZ + Math.cos(theta) * 48.2);
      boxBase.rotation.y = theta;

      const glassBand = new THREE.Mesh(glassBandGeo, suiteGlassMat);
      glassBand.position.set(Math.sin(theta) * 48.0, 22.4, homeZ + Math.cos(theta) * 48.0);
      glassBand.rotation.y = theta;

      stadiumGroup.add(boxBase, glassBand);
    }
  }

  // Pantalla Gigante (Jumbotron)
  const boardTex = getScoreboardTexture(SOBERANIA_EVENTS[props.eventType]?.name || 'Juego Oficial');
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

  const steelMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.35 });
  const colGeo = new THREE.BoxGeometry(0.55, 22, 0.55);
  const backColGeo = new THREE.BoxGeometry(0.45, 22, 0.45);
  const crossGeo = new THREE.BoxGeometry(22, 0.4, 3.2);

  for (const px of [-9, -3, 3, 9]) {
    const col = new THREE.Mesh(colGeo, steelMat);
    col.position.set(px, -2.5, -1.6);
    const backCol = new THREE.Mesh(backColGeo, steelMat);
    backCol.position.set(px, -2.5, -4.2);
    jumbotronGroup.add(col, backCol);
  }
  for (const py of [-10, -5, 0, 5]) {
    const cross = new THREE.Mesh(crossGeo, steelMat);
    cross.position.set(0, py, -2.9);
    jumbotronGroup.add(cross);
  }
  stadiumGroup.add(jumbotronGroup);

  // Bloques de concreto bajo graderías
  const rawBlocks = toRaw(props.tierBlocks);
  if (rawBlocks.length > 0) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const tierMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.88 });
    const instancedTiers = new THREE.InstancedMesh(boxGeo, tierMat, rawBlocks.length);

    for (let i = 0; i < rawBlocks.length; i++) {
      const b = rawBlocks[i];
      tempPos.set(b.x, b.y, b.z);
      tempEuler.set(0, b.rotY || 0, 0);
      tempQuat.setFromEuler(tempEuler);
      tempScale.set(b.w, b.h, b.d);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      instancedTiers.setMatrixAt(i, tempMatrix);
    }
    tempScale.set(1, 1, 1);
    instancedTiers.instanceMatrix.needsUpdate = true;
    instancedTiers.computeBoundingSphere();
    stadiumGroup.add(instancedTiers);
  }

  // Techo Voladizo Blanco Segmentado
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

  const centerPanelGeo = new THREE.BoxGeometry(4.3, 0.32, 21.5);
  const centerRibGeo = new THREE.BoxGeometry(0.26, 0.85, 22.0);
  const centerRoofSegs = 12;

  for (let i = 0; i < centerRoofSegs; i++) {
    const theta = -0.58 + ((i + 0.5) / centerRoofSegs) * 1.16;
    const isHighCenter = Math.abs(theta) < 0.36;
    const roofY = isHighCenter ? 26.2 : 23.4;
    const rRoof = 41.2;
    const rx = Math.sin(theta) * rRoof;
    const rz = homeZ + Math.cos(theta) * rRoof;

    const panel = new THREE.Mesh(centerPanelGeo, whiteRoofMat);
    panel.position.set(rx, roofY, rz);
    panel.rotation.y = theta;
    panel.rotation.x = -0.07;

    const rib = new THREE.Mesh(centerRibGeo, trussSteelMat);
    rib.position.set(rx, roofY - 0.45, rz);
    rib.rotation.y = theta;
    rib.rotation.x = -0.07;

    roofGroup.add(panel, rib);
  }

  const wingRibGeo = new THREE.BoxGeometry(0.25, 0.8, 19.0);
  const addWingRoof = (sideSign, alongStart, alongEnd, roofY) => {
    const steps = 6;
    const stepLen = (alongEnd - alongStart) / steps;
    const wingPanelGeo = new THREE.BoxGeometry(stepLen + 0.2, 0.32, 18.5);
    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    for (let i = 0; i < steps; i++) {
      const along = alongStart + (i + 0.5) * stepLen;
      const lat = 35.2;
      const rx = dirAlongX * along + dirOutX * lat;
      const rz = homeZ + dirAlongZ * along + dirOutZ * lat;

      const panel = new THREE.Mesh(wingPanelGeo, whiteRoofMat);
      panel.position.set(rx, roofY, rz);
      panel.rotation.y = sideSign * (Math.PI / 4);

      const rib = new THREE.Mesh(wingRibGeo, trussSteelMat);
      rib.position.set(rx, roofY - 0.42, rz);
      rib.rotation.y = sideSign * (Math.PI / 4);

      roofGroup.add(panel, rib);
    }
  };

  addWingRoof(-1, 25, 50, 22.2);
  addWingRoof(-1, 52, 75, 20.8);
  addWingRoof(1, 25, 65, 22.2);

  // 6 Torres de Iluminación Monumentales
  const towerPositions = [
    [-46, 78],
    [46, 78],
    [-76, 12],
    [76, 12],
    [-64, -68],
    [64, -68]
  ];
  const mastMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.6 });
  const lampPanelMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fef9c3',
    emissiveIntensity: 1.7
  });
  const mastGeo = new THREE.CylinderGeometry(0.45, 0.8, 36, 10);
  const bankGeo = new THREE.BoxGeometry(7.2, 4.2, 0.9);

  towerPositions.forEach(([tx, tz]) => {
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(tx, 18, tz);

    const bank = new THREE.Mesh(bankGeo, lampPanelMat);
    bank.position.set(tx, 36.5, tz);
    bank.lookAt(0, 2, 18);

    roofGroup.add(mast, bank);
  });

  stadiumGroup.add(roofGroup);
  scene.add(stadiumGroup);
}

// ============================================================================
// 2. ARQUITECTURA EXTERIOR DEL ESTADIO SOBERANÍA
// ============================================================================
function buildStadiumExterior() {
  disposeGroup(exteriorGroup);
  exteriorGroup = new THREE.Group();
  exteriorGroup.visible = props.showExteriorEnvironment;

  const homeZ = SOBERANIA_DIMENSIONS.homeZ;

  const plazaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ color: '#1e242b', roughness: 0.92 })
  );
  plazaFloor.rotation.x = -Math.PI / 2;
  plazaFloor.position.y = -0.05;
  exteriorGroup.add(plazaFloor);

  const parkGrassMat = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.9 });
  const parkRing = new THREE.Mesh(new THREE.RingGeometry(132, 175, 40), parkGrassMat);
  parkRing.rotation.x = -Math.PI / 2;
  parkRing.position.set(0, -0.03, 5);
  exteriorGroup.add(parkRing);

  const facadeWhiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.48 });
  const columnMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4 });
  const lobbyGlassMat = new THREE.MeshStandardMaterial({
    color: '#0c4a6e',
    roughness: 0.15,
    metalness: 0.75
  });
  const redBannerMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 });

  const wallPanelGeo = new THREE.BoxGeometry(4.2, 20.0, 1.1);
  const pillarGeo = new THREE.BoxGeometry(0.85, 21.4, 2.2);
  const glassFacadeGeo = new THREE.BoxGeometry(3.6, 15.0, 1.35);
  const bannerGeo = new THREE.BoxGeometry(1.1, 7.6, 0.2);

  const extSegments = 20;
  for (let i = 0; i < extSegments; i++) {
    const theta = -0.78 + ((i + 0.5) / extSegments) * 1.56;
    const rWall = 50.2;
    const wx = Math.sin(theta) * rWall;
    const wz = homeZ + Math.cos(theta) * rWall;

    const wallPanel = new THREE.Mesh(wallPanelGeo, facadeWhiteMat);
    wallPanel.position.set(wx, 10.0, wz);
    wallPanel.rotation.y = theta;

    const pillar = new THREE.Mesh(pillarGeo, columnMat);
    pillar.position.set(Math.sin(theta) * 51.0, 10.7, homeZ + Math.cos(theta) * 51.0);
    pillar.rotation.y = theta;

    if (Math.abs(theta) < 0.34) {
      const glassFacade = new THREE.Mesh(glassFacadeGeo, lobbyGlassMat);
      glassFacade.position.set(wx, 8.2, wz);
      glassFacade.rotation.y = theta;
      exteriorGroup.add(glassFacade);
    } else if (i % 2 === 0) {
      const banner = new THREE.Mesh(bannerGeo, redBannerMat);
      banner.position.set(Math.sin(theta) * 50.9, 12.2, homeZ + Math.cos(theta) * 50.9);
      banner.rotation.y = theta;
      exteriorGroup.add(banner);
    }

    exteriorGroup.add(wallPanel, pillar);
  }

  const wingColGeo = new THREE.BoxGeometry(0.85, 20.4, 2.1);
  const buildWingExteriorWall = (sideSign, alongStart, alongEnd) => {
    const span = alongEnd - alongStart;
    const midAlong = (alongStart + alongEnd) / 2;
    const lat = 43.8;

    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    const wx = dirAlongX * midAlong + dirOutX * lat;
    const wz = homeZ + dirAlongZ * midAlong + dirOutZ * lat;

    const wingWall = new THREE.Mesh(new THREE.BoxGeometry(span, 19.2, 1.2), facadeWhiteMat);
    wingWall.position.set(wx, 9.6, wz);
    wingWall.rotation.y = sideSign * (Math.PI / 4);
    exteriorGroup.add(wingWall);

    for (let a = alongStart; a <= alongEnd; a += 6) {
      const px = dirAlongX * a + dirOutX * (lat + 0.8);
      const pz = homeZ + dirAlongZ * a + dirOutZ * (lat + 0.8);
      const col = new THREE.Mesh(wingColGeo, columnMat);
      col.position.set(px, 10.2, pz);
      col.rotation.y = sideSign * (Math.PI / 4);
      exteriorGroup.add(col);
    }
  };

  buildWingExteriorWall(-1, 22, 74);
  buildWingExteriorWall(1, 22, 65);

  const mainPlaza = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.25, 28),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.7 })
  );
  mainPlaza.position.set(0, 0.12, homeZ + 63);
  exteriorGroup.add(mainPlaza);

  const gateCanopy = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
  );
  gateCanopy.position.set(0, 6.2, homeZ + 53);
  const goldTrim = new THREE.Mesh(
    new THREE.BoxGeometry(24.2, 0.35, 8.2),
    new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.7, roughness: 0.25 })
  );
  goldTrim.position.set(0, 6.55, homeZ + 53);
  exteriorGroup.add(gateCanopy, goldTrim);

  const rfPavilion = new THREE.Group();
  rfPavilion.position.set(84, 0, -34);
  rfPavilion.rotation.y = -0.55;

  const pavBody = new THREE.Mesh(new THREE.BoxGeometry(22, 8.5, 13), facadeWhiteMat);
  pavBody.position.y = 4.25;
  const pavRoof = new THREE.Mesh(new THREE.BoxGeometry(25, 0.5, 16), facadeWhiteMat);
  pavRoof.position.y = 9.0;
  pavRoof.rotation.x = 0.12;
  rfPavilion.add(pavBody, pavRoof);

  const pavBannerGeo = new THREE.BoxGeometry(1.4, 5.2, 0.2);
  for (const bx of [-7, -2.5, 2.5, 7]) {
    const b = new THREE.Mesh(pavBannerGeo, redBannerMat);
    b.position.set(bx, 4.6, 6.6);
    rfPavilion.add(b);
  }
  exteriorGroup.add(rfPavilion);

  const auxFieldMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.8 });
  const miniFieldGeo = new THREE.BoxGeometry(18, 0.15, 26);
  [-102, -124].forEach((ax) => {
    const miniField = new THREE.Mesh(miniFieldGeo, auxFieldMat);
    miniField.position.set(ax, 0.08, -32);
    exteriorGroup.add(miniField);
  });

  const parkingLot = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.12, 68),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 })
  );
  parkingLot.position.set(106, 0.06, 38);
  exteriorGroup.add(parkingLot);

  const carMaterials = ['#f8fafc', '#94a3b8', '#334155', '#1e293b'].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })
  );
  const carGeo = new THREE.BoxGeometry(2.1, 1.35, 4.2);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 3 === 0) continue;
      const car = new THREE.Mesh(carGeo, carMaterials[(row + col) % carMaterials.length]);
      car.position.set(92 + row * 9.5, 0.72, 12 + col * 7.2);
      exteriorGroup.add(car);
    }
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#451a03' });
  const foliageMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.85 });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8);
  const crownGeo = new THREE.DodecahedronGeometry(2.8, 1);

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
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 1.6, tz);
    const crown = new THREE.Mesh(crownGeo, foliageMat);
    crown.position.set(tx, 4.6, tz);
    exteriorGroup.add(trunk, crown);
  });

  scene.add(exteriorGroup);
}

// ============================================================================
// 3. ELEMENTOS ESPECIALES POR TIPO DE EVENTO
// ============================================================================
function buildEventOverlay() {
  disposeGroup(eventOverlayGroup);
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
// 4. BUTACAS INSTANCIADAS DE ALTO RENDIMIENTO (2 CAPAS LOW-POLY)
// ============================================================================
function setSeatShellMatrix(index, seat, hidden = false) {
  if (!seatShellMesh) return;
  if (hidden) {
    tempPos.set(seat.x, -200, seat.z);
    tempScale.set(0.0001, 0.0001, 0.0001);
    tempQuat.identity();
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatShellMesh.setMatrixAt(index, tempMatrix);
    tempScale.set(1, 1, 1);
  } else {
    tempPos.set(seat.x, seat.y, seat.z);
    tempEuler.set(0, seat.yaw, 0);
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatShellMesh.setMatrixAt(index, tempMatrix);
  }
}

function buildInstancedSeats() {
  [seatShellMesh, seatFrameMesh].forEach((m) => {
    if (m) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
  });
  hiddenSeatIndex = -1;

  const rawSeats = toRaw(props.seats);
  const count = rawSeats.length;
  if (count === 0) return;

  const shellGeo = createOptimizedSeatShellGeometry();
  const frameGeo = createOptimizedSeatFrameGeometry();

  const shellMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.65, metalness: 0.35 });

  seatShellMesh = new THREE.InstancedMesh(shellGeo, shellMat, count);
  seatFrameMesh = new THREE.InstancedMesh(frameGeo, frameMat, count);

  for (let i = 0; i < count; i++) {
    const s = rawSeats[i];
    tempPos.set(s.x, s.y, s.z);
    tempEuler.set(0, s.yaw, 0);
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);

    seatFrameMesh.setMatrixAt(i, tempMatrix);
    seatShellMesh.setMatrixAt(i, tempMatrix);
  }

  seatFrameMesh.instanceMatrix.needsUpdate = true;
  seatShellMesh.instanceMatrix.needsUpdate = true;
  seatFrameMesh.computeBoundingSphere();
  seatShellMesh.computeBoundingSphere();

  updateSeatColors();
  scene.add(seatFrameMesh, seatShellMesh);
}

function updateSeatColors() {
  if (!seatShellMesh) return;
  const rawSeats = toRaw(props.seats);
  const selId = props.selectedSeat?.id;
  const hlSector = props.highlightedSectorId;

  for (let i = 0; i < rawSeats.length; i++) {
    const s = rawSeats[i];
    if (s.id === selId) {
      tempColor.set('#10b981');
    } else if (s.blocked) {
      tempColor.set('#334155');
    } else if (hlSector && s.sectorId === hlSector) {
      tempColor.set('#f59e0b');
    } else {
      tempColor.set(s.baseColor);
    }
    seatShellMesh.setColorAt(i, tempColor);
  }

  if (seatShellMesh.instanceColor) {
    seatShellMesh.instanceColor.needsUpdate = true;
  }
}

// ============================================================================
// 5. CÁMARA 360° SIN OBSTRUCCIONES EN BUTACA
// ============================================================================
function restoreHiddenSeat() {
  const rawSeats = toRaw(props.seats);
  if (hiddenSeatIndex >= 0 && rawSeats[hiddenSeatIndex] && seatShellMesh) {
    setSeatShellMatrix(hiddenSeatIndex, rawSeats[hiddenSeatIndex], false);
    seatShellMesh.instanceMatrix.needsUpdate = true;
    hiddenSeatIndex = -1;
  }
}

function enterSeat360(seat) {
  if (!seat || !camera || !controls) return;
  cameraMode.value = 'seat360';
  controls.enabled = false;
  hoveredSeat.value = null;

  restoreHiddenSeat();
  const rawSeats = toRaw(props.seats);
  const seatIdx = rawSeats.findIndex((s) => s.id === seat.id);
  if (seatIdx >= 0 && seatShellMesh) {
    setSeatShellMatrix(seatIdx, seat, true);
    seatShellMesh.instanceMatrix.needsUpdate = true;
    hiddenSeatIndex = seatIdx;
  }

  // Ojos adelantados +0.18m sobre el cojín y +1.18m sobre el escalón
  const sinY = Math.sin(seat.yaw);
  const cosY = Math.cos(seat.yaw);
  const eyeX = seat.x + sinY * 0.18;
  const eyeY = seat.y + 1.18;
  const eyeZ = seat.z + cosY * 0.18;
  camera.position.set(eyeX, eyeY, eyeZ);

  const target = SOBERANIA_EVENTS[props.eventType]?.focalTarget || { x: 0, y: 0.8, z: 18 };
  const dx = target.x - eyeX;
  const dy = target.y - eyeY;
  const dz = target.z - eyeZ;
  const horizDist = Math.hypot(dx, dz);

  baseSeatYaw = Math.atan2(-dx, -dz);
  headYaw = baseSeatYaw;
  headPitch = Math.max(-0.48, Math.min(0.42, Math.atan2(dy, horizDist)));

  camera.fov = firstPersonFov.value;
  camera.updateProjectionMatrix();
  applyFirstPersonRotation();
}

function exitSeat360() {
  restoreHiddenSeat();
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
    const sinY = Math.sin(seat.yaw);
    const cosY = Math.cos(seat.yaw);
    const target = SOBERANIA_EVENTS[props.eventType]?.focalTarget || { x: 0, y: 0.8, z: 18 };
    const dx = target.x - (seat.x + sinY * 0.18);
    const dy = target.y - (seat.y + 1.18);
    const dz = target.z - (seat.z + cosY * 0.18);
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
    headPitch = 0.1;
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
// 6. INTERACCIÓN DE PUNTERO Y TECLADO (RAYCAST OPTIMIZADO)
// ============================================================================
function pickSeatAtPointer(clientX, clientY) {
  if (!containerRef.value || !camera || !seatShellMesh) return null;
  const rect = containerRef.value.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(seatShellMesh, false);
  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    return toRaw(props.seats)[hits[0].instanceId] || null;
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

  if (isSeated360.value) {
    if (isDraggingLook) {
      headYaw -= dx * 0.0045;
      headPitch = Math.max(-0.92, Math.min(0.85, headPitch - dy * 0.004));
      dragStart = { x: e.clientX, y: e.clientY };
      applyFirstPersonRotation();
    }
    return;
  }

  // No raycastear mientras OrbitControls arrastra la cámara
  if (e.buttons !== 0) {
    if (hoveredSeat.value) hoveredSeat.value = null;
    return;
  }

  lastPointerEvent = { clientX: e.clientX, clientY: e.clientY };
  if (!hoverRafScheduled) {
    hoverRafScheduled = true;
    requestAnimationFrame(() => {
      hoverRafScheduled = false;
      if (isSeated360.value || !containerRef.value) return;
      const hitSeat = pickSeatAtPointer(lastPointerEvent.clientX, lastPointerEvent.clientY);
      hoveredSeat.value = hitSeat;
      if (hitSeat) {
        const rect = containerRef.value.getBoundingClientRect();
        hoverScreenPos.value = {
          x: lastPointerEvent.clientX - rect.left,
          y: lastPointerEvent.clientY - rect.top
        };
      }
    });
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

function onKeyDown(e) {
  if (!isSeated360.value) return;
  const step = 0.07;
  if (e.key === 'ArrowLeft') {
    headYaw += step;
    applyFirstPersonRotation();
  } else if (e.key === 'ArrowRight') {
    headYaw -= step;
    applyFirstPersonRotation();
  } else if (e.key === 'ArrowUp') {
    headPitch = Math.min(0.85, headPitch + step * 0.7);
    applyFirstPersonRotation();
  } else if (e.key === 'ArrowDown') {
    headPitch = Math.max(-0.92, headPitch - step * 0.7);
    applyFirstPersonRotation();
  } else if (e.key === 'Escape') {
    exitSeat360();
  }
}

// ============================================================================
// 7. INICIALIZACIÓN THREE.JS + RESIZE OBSERVER
// ============================================================================
function handleResize() {
  if (!containerRef.value || !renderer || !camera) return;
  const { width, height, aspect } = getSafeContainerSize(containerRef.value);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function initThreeScene() {
  const container = containerRef.value;
  if (!container) return;

  const { width, height, aspect } = getSafeContainerSize(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(SOBERANIA_EVENTS[props.eventType]?.skyColor || '#070b14');
  scene.fog = new THREE.FogExp2('#070b14', 0.0018);

  camera = new THREE.PerspectiveCamera(48, aspect, 0.25, 520);
  camera.position.set(0, 74, 128);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
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

  resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(container);

  const animate = () => {
    animFrameId = requestAnimationFrame(animate);
    if (controls && controls.enabled) {
      controls.update();
    }
    renderer.render(scene, camera);
  };
  animate();
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
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  if (resizeObserver) resizeObserver.disconnect();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (controls) controls.dispose();
  disposeGroup(stadiumGroup);
  disposeGroup(exteriorGroup);
  disposeGroup(eventOverlayGroup);
  if (renderer) {
    renderer.dispose();
    renderer.domElement?.remove();
  }
});
</script>

<template>
  <div class="relative w-full h-[700px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 select-none">
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

    <!-- Barra Inferior de Cámaras -->
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