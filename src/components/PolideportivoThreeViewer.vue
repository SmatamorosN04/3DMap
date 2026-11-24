<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ARENA_DIMENSIONS, EVENT_CONFIGS } from '../data/polideportivoAlexisArguello.js';

const props = defineProps({
  seats: {
    type: Array,
    required: true
  },
  tierBlocks: {
    type: Array,
    required: true
  },
  vomitories: {
    type: Array,
    required: true
  },
  eventType: {
    type: String,
    default: 'basketball'
  },
  selectedSeat: {
    type: Object,
    default: null
  },
  highlightedSectorId: {
    type: String,
    default: ''
  },
  showRoofTrusses: {
    type: Boolean,
    default: true
  },
  stadiumLightsOn: {
    type: Boolean,
    default: true
  },
  wallColor: {
    type: String,
    default: '#0c1526'
  }
});

const emit = defineEmits(['select-seat', 'exit-seat-view']);

const containerRef = ref(null);
const hoveredSeat = ref(null);
const hoverScreenPos = ref({ x: 0, y: 0 });
const cameraMode = ref('orbit'); // 'orbit' | 'seat360'
const firstPersonFov = ref(68);

// Estado interno Three.js (no reactivo para máximo rendimiento a 60 FPS)
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animFrameId = null;

let arenaStructureGroup = null;
let eventFloorGroup = null;
let roofGroup = null;
let wallsMaterial = null;
let ambientLight = null;
let mainSpotlights = [];

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

// Control de mirada 360° desde la butaca
let isDraggingLook = false;
let dragStart = { x: 0, y: 0 };
let pointerMoved = false;
let headYaw = 0;
let headPitch = 0;
let baseSeatYaw = 0;

const isSeated360 = computed(() => cameraMode.value === 'seat360' && Boolean(props.selectedSeat));

// ============================================================================
// GENERACIÓN DE TEXTURAS PROCEDURALES REALISTAS (DUELA, LED RIBBON, MARCADOR)
// ============================================================================
function createBasketballCourtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 548;
  const ctx = canvas.getContext('2d');

  // Duela de madera clara con listones
  ctx.fillStyle = '#d99b52';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 12) {
    ctx.fillStyle = y % 24 === 0 ? 'rgba(146, 64, 14, 0.14)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, y, canvas.width, 6);
  }

  // Zonas pintadas FIBA (Azul Nicaragua)
  ctx.fillStyle = '#1d4ed8';
  const keyW = 195;
  const keyH = 175;
  ctx.fillRect(0, (canvas.height - keyH) / 2, keyW, keyH);
  ctx.fillRect(canvas.width - keyW, (canvas.height - keyH) / 2, keyW, keyH);

  // Líneas blancas reglamentarias
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // Línea central
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 4);
  ctx.lineTo(canvas.width / 2, canvas.height - 4);
  ctx.stroke();

  // Círculo central
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Texto central
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MANAGUA', canvas.width / 2, canvas.height / 2 - 4);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.fillText('ALEXIS ARGÜELLO', canvas.width / 2, canvas.height / 2 + 18);

  // Líneas de 3 puntos
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(52, canvas.height / 2, 225, -Math.PI / 2.15, Math.PI / 2.15);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width - 52, canvas.height / 2, 225, Math.PI - Math.PI / 2.15, Math.PI + Math.PI / 2.15);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createLedRibbonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.25, '#1d4ed8');
  grad.addColorStop(0.5, '#0284c7');
  grad.addColorStop(0.75, '#1d4ed8');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★  POLIDEPORTIVO ALEXIS ARGÜELLO  •  MANAGUA, NICARAGUA  ★', canvas.width / 2, 58);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function createScoreboardTexture(titleText) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#050914';
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 240);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POLIDEPORTIVO ALEXIS ARGÜELLO', 256, 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(titleText, 256, 118);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('VISTA 360° EN TIEMPO REAL', 256, 185);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// CONSTRUCCIÓN DE LA ARQUITECTURA DEL POLIDEPORTIVO
// ============================================================================
function buildArenaShell() {
  if (arenaStructureGroup) {
    scene.remove(arenaStructureGroup);
  }
  arenaStructureGroup = new THREE.Group();

  const { outerWidth, outerDepth, wallHeight, roofHeight } = ARENA_DIMENSIONS;

  // Suelo base del recinto
  const baseFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(outerWidth, outerDepth),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 })
  );
  baseFloor.rotation.x = -Math.PI / 2;
  baseFloor.receiveShadow = true;
  arenaStructureGroup.add(baseFloor);

  // Muros perimetrales exteriores (color personalizable)
  wallsMaterial = new THREE.MeshStandardMaterial({
    color: props.wallColor,
    roughness: 0.78,
    metalness: 0.12,
    side: THREE.BackSide
  });
  const outerBox = new THREE.Mesh(
    new THREE.BoxGeometry(outerWidth, wallHeight, outerDepth),
    wallsMaterial
  );
  outerBox.position.y = wallHeight / 2;
  arenaStructureGroup.add(outerBox);

  // Cinturón Perimetral LED 360° (entre anillo inferior y superior)
  const ledTex = createLedRibbonTexture();
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledTex,
    emissive: new THREE.Color('#1d4ed8'),
    emissiveMap: ledTex,
    emissiveIntensity: 0.65,
    roughness: 0.3
  });

  const ribbonN = new THREE.Mesh(new THREE.BoxGeometry(52, 1.15, 0.3), ledMat);
  ribbonN.position.set(0, 5.2, -22.7);
  const ribbonS = new THREE.Mesh(new THREE.BoxGeometry(52, 1.15, 0.3), ledMat);
  ribbonS.position.set(0, 5.2, 22.7);
  const ribbonE = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.15, 45.4), ledMat);
  ribbonE.position.set(29.8, 5.2, 0);
  const ribbonO = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.15, 45.4), ledMat);
  ribbonO.position.set(-29.8, 5.2, 0);
  arenaStructureGroup.add(ribbonN, ribbonS, ribbonE, ribbonO);

  // Pasillo de circulación intermedio y baranda de vidrio/acero del Anillo Superior
  const railMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.35,
    roughness: 0.2
  });
  const railN = new THREE.Mesh(new THREE.BoxGeometry(51, 0.95, 0.08), railMat);
  railN.position.set(0, 7.6, -24.7);
  const railS = new THREE.Mesh(new THREE.BoxGeometry(51, 0.95, 0.08), railMat);
  railS.position.set(0, 7.6, 24.7);
  arenaStructureGroup.add(railN, railS);

  // Escalones de concreto de las graderías (InstancedMesh para rendimiento)
  if (props.tierBlocks.length > 0) {
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const tierMat = new THREE.MeshStandardMaterial({ color: '#182234', roughness: 0.9 });
    const tierInstanced = new THREE.InstancedMesh(unitBoxGeo, tierMat, props.tierBlocks.length);

    props.tierBlocks.forEach((b, i) => {
      tempPos.set(b.x, b.y, b.z);
      tempScale.set(b.w, b.h, b.d);
      tempQuat.identity();
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      tierInstanced.setMatrixAt(i, tempMatrix);
    });
    tierInstanced.instanceMatrix.needsUpdate = true;
    arenaStructureGroup.add(tierInstanced);
  }

  // Vomitorios (Túneles de ingreso oscuros con marco)
  const vomMat = new THREE.MeshStandardMaterial({ color: '#030712', roughness: 0.95 });
  props.vomitories.forEach((v) => {
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 2.6), vomMat);
    tunnel.position.set(v.x, v.y + 0.6, v.z);
    tunnel.rotation.y = v.rotY;
    arenaStructureGroup.add(tunnel);
  });

  // Pantallas Gigantes en Cabeceras Este y Oeste
  const boardTex = createScoreboardTexture(EVENT_CONFIGS[props.eventType]?.name || 'Evento en Vivo');
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: boardTex,
    emissiveIntensity: 0.55
  });
  const boardEast = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, 10.5), boardMat);
  boardEast.position.set(42.5, 16.5, 0);
  const boardWest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, 10.5), boardMat);
  boardWest.position.set(-42.5, 16.5, 0);
  arenaStructureGroup.add(boardEast, boardWest);

  // Estructura Metálica del Techo (Cerchas y luminarias)
  roofGroup = new THREE.Group();
  roofGroup.visible = props.showRoofTrusses;
  const trussMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: new THREE.Color('#e0f2fe'),
    emissiveIntensity: 1.4
  });

  for (let x = -34; x <= 34; x += 11.3) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, outerDepth - 2), trussMat);
    beam.position.set(x, roofHeight, 0);
    roofGroup.add(beam);

    // Reflectores LED colgantes
    for (const zLamp of [-16, 0, 16]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.8), lampMat);
      lamp.position.set(x, roofHeight - 0.65, zLamp);
      roofGroup.add(lamp);
    }
  }
  arenaStructureGroup.add(roofGroup);

  scene.add(arenaStructureGroup);
}

// ============================================================================
// CONSTRUCCIÓN DEL PUNTO FOCAL SEGÚN TIPO DE EVENTO
// ============================================================================
function buildEventCenterpiece() {
  if (eventFloorGroup) {
    scene.remove(eventFloorGroup);
  }
  eventFloorGroup = new THREE.Group();

  // Contorno azul exterior de la cancha
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(32.5, 0.04, 19.5),
    new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.6 })
  );
  apron.position.y = 0.02;
  eventFloorGroup.add(apron);

  if (props.eventType === 'basketball') {
    // Duela FIBA 28m x 15m
    const courtTex = createBasketballCourtTexture();
    const courtMesh = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.06, 15),
      new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.35, metalness: 0.05 })
    );
    courtMesh.position.y = 0.04;
    eventFloorGroup.add(courtMesh);

    // Canastas FIBA en ambos extremos
    const hoopMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.5, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.55,
      roughness: 0.1
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.3 });

    [-1, 1].forEach((dir) => {
      const baseX = dir * 15.3;
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.1), hoopMat);
      post.position.set(baseX, 1.3, 0);

      const backboard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 1.8), glassMat);
      backboard.position.set(dir * 12.8, 3.35, 0);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 10, 24), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(dir * 12.45, 3.05, 0);

      eventFloorGroup.add(post, backboard, rim);
    });
  } else if (props.eventType === 'boxing') {
    // Ring de Boxeo Central (7.8m x 7.8m)
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 1.1, 7.8),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 })
    );
    platform.position.y = 0.55;

    const canvasMat = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.08, 7.4),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5 })
    );
    canvasMat.position.y = 1.12;
    eventFloorGroup.add(platform, canvasMat);

    // 4 esquineros y cuerdas
    const postColors = ['#dc2626', '#2563eb', '#f8fafc', '#f8fafc'];
    const corners = [
      [-3.4, -3.4],
      [3.4, 3.4],
      [-3.4, 3.4],
      [3.4, -3.4]
    ];
    corners.forEach(([cx, cz], idx) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 1.45, 12),
        new THREE.MeshStandardMaterial({ color: postColors[idx] })
      );
      post.position.set(cx, 1.82, cz);
      eventFloorGroup.add(post);
    });

    const ropeMat = new THREE.MeshStandardMaterial({ color: '#ef4444' });
    [1.45, 1.85, 2.25].forEach((ry) => {
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.04, 0.04), ropeMat);
      r1.position.set(0, ry, -3.4);
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.04, 0.04), ropeMat);
      r2.position.set(0, ry, 3.4);
      const r3 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 6.8), ropeMat);
      r3.position.set(-3.4, ry, 0);
      const r4 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 6.8), ropeMat);
      r4.position.set(3.4, ry, 0);
      eventFloorGroup.add(r1, r2, r3, r4);
    });
  } else {
    // Concierto / Escenario en extremo Oeste (-X)
    const stageDeck = new THREE.Mesh(
      new THREE.BoxGeometry(11, 1.6, 17.5),
      new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.4, metalness: 0.3 })
    );
    stageDeck.position.set(-13.5, 0.8, 0);

    const screenTex = createScoreboardTexture('ESCENARIO PRINCIPAL • SHOW');
    const stageBackdrop = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 6.8, 15.5),
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissive: new THREE.Color('#6366f1'),
        emissiveMap: screenTex,
        emissiveIntensity: 0.75
      })
    );
    stageBackdrop.position.set(-18.2, 5.0, 0);

    // Pasarela frontal
    const catwalk = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 1.5, 3.2),
      new THREE.MeshStandardMaterial({ color: '#1e1b4b', roughness: 0.4 })
    );
    catwalk.position.set(-4.2, 0.75, 0);

    eventFloorGroup.add(stageDeck, stageBackdrop, catwalk);
  }

  scene.add(eventFloorGroup);
}

// ============================================================================
// INSTANCED MESH DE 8,100+ BUTACAS (1 DRAW CALL POR PIEZA)
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

  // Geometrías realistas de butaca de estadio (en metros)
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

    // 1. Soporte metálico al piso
    tempPos.set(s.x, s.y + 0.18, s.z);
    tempEuler.set(0, s.yaw, 0);
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatFrameMesh.setMatrixAt(i, tempMatrix);

    // 2. Asiento / Cojín (desplazado hacia el frente de la silla)
    tempPos.set(s.x + sinY * 0.12, s.y + 0.36, s.z + cosY * 0.12);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    seatCushionMesh.setMatrixAt(i, tempMatrix);

    // 3. Respaldo ligeramente reclinado
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
      tempColor.set('#10b981'); // Esmeralda brillante: silla seleccionada
    } else if (s.blocked) {
      tempColor.set('#334155'); // Gris apagado: vista obstruida por escenario
    } else if (hlSector && s.sectorId === hlSector) {
      tempColor.set('#f59e0b'); // Ámbar: sector resaltado
    } else {
      tempColor.set(s.baseColor);
    }

    seatBackrestMesh.setColorAt(i, tempColor);
    // Cojín ligeramente más oscuro para contraste 3D
    tempColor.multiplyScalar(0.84);
    seatCushionMesh.setColorAt(i, tempColor);
  }

  if (seatBackrestMesh.instanceColor) seatBackrestMesh.instanceColor.needsUpdate = true;
  if (seatCushionMesh.instanceColor) seatCushionMesh.instanceColor.needsUpdate = true;
}

// ============================================================================
// CÁMARA 360° EN PRIMERA PERSONA VS CÁMARA ORBITAL
// ============================================================================
function enterSeat360(seat) {
  if (!seat || !camera || !controls) return;
  cameraMode.value = 'seat360';
  controls.enabled = false;

  // Posición real de los ojos del espectador sentado (+1.12m sobre la grada)
  const eyeX = seat.x;
  const eyeY = seat.y + 1.12;
  const eyeZ = seat.z;
  camera.position.set(eyeX, eyeY, eyeZ);

  const target = EVENT_CONFIGS[props.eventType]?.focalTarget || { x: 0, y: 1.1, z: 0 };
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
  camera.fov = 50;
  camera.updateProjectionMatrix();
  camera.position.set(0, 34, 46);
  controls.target.set(0, 3, 0);
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
    const target = EVENT_CONFIGS[props.eventType]?.focalTarget || { x: 0, y: 1.1, z: 0 };
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

  if (preset === 'aerial') {
    camera.position.set(0, 35, 46);
    controls.target.set(0, 3, 0);
  } else if (preset === 'top') {
    camera.position.set(0, 68, 0.1);
    controls.target.set(0, 0, 0);
  } else if (preset === 'courtside') {
    camera.position.set(-14, 3.2, 11.5);
    controls.target.set(4, 2.5, -2);
  } else if (preset === 'upper') {
    camera.position.set(0, 15.5, 34);
    controls.target.set(0, 1.5, 0);
  }
  controls.update();
}

// ============================================================================
// INTERACCIÓN DE PUNTERO (RAYCASTING Y GIRO 360°)
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

  // Tooltip al pasar el cursor sobre cualquiera de las 8,100 butacas
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
  firstPersonFov.value = Math.min(88, Math.max(38, firstPersonFov.value + e.deltaY * 0.03));
  camera.fov = firstPersonFov.value;
  camera.updateProjectionMatrix();
}

// ============================================================================
// CICLO DE VIDA THREE.JS
// ============================================================================
function initThreeScene() {
  const container = containerRef.value;
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#04070f');
  scene.fog = new THREE.FogExp2('#04070f', 0.0055);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.15, 260);
  camera.position.set(0, 35, 46);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 6;
  controls.maxDistance = 95;
  controls.target.set(0, 3, 0);

  // Iluminación realista de estadio
  ambientLight = new THREE.AmbientLight('#cbd5e1', 0.85);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight('#e0f2fe', '#0f172a', 0.65);
  scene.add(hemiLight);

  const spotCoords = [
    [-16, 21, -12],
    [16, 21, -12],
    [-16, 21, 12],
    [16, 21, 12]
  ];
  mainSpotlights = spotCoords.map(([sx, sy, sz]) => {
    const spot = new THREE.PointLight('#f8fafc', 360, 95, 1.4);
    spot.position.set(sx, sy, sz);
    scene.add(spot);
    return spot;
  });

  buildArenaShell();
  buildEventCenterpiece();
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
  () => {
    buildArenaShell();
    buildEventCenterpiece();
    if (props.selectedSeat) {
      enterSeat360(props.selectedSeat);
    }
  }
);

watch(
  () => props.showRoofTrusses,
  (val) => {
    if (roofGroup) roofGroup.visible = val;
  }
);

watch(
  () => props.stadiumLightsOn,
  (isOn) => {
    if (ambientLight) ambientLight.intensity = isOn ? 0.85 : 0.25;
    mainSpotlights.forEach((l) => {
      l.intensity = isOn ? 360 : 75;
    });
  }
);

watch(
  () => props.wallColor,
  (newColor) => {
    if (wallsMaterial) {
      wallsMaterial.color.set(newColor);
    }
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

    <!-- Tooltip flotante al pasar el mouse sobre cualquiera de las 8,100+ butacas -->
    <div
      v-if="hoveredSeat && !isSeated360"
      class="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full -mt-3 px-3 py-2 rounded-xl bg-slate-950/95 border border-sky-400/70 text-xs text-slate-100 shadow-2xl backdrop-blur-md whitespace-nowrap"
      :style="{ left: `${hoverScreenPos.x}px`, top: `${hoverScreenPos.y}px` }"
    >
      <div class="font-bold text-sky-300">{{ hoveredSeat.sectorName }}</div>
      <div class="text-[11px] text-slate-300 mt-0.5">
        Fila <strong class="text-white">{{ hoveredSeat.row }}</strong> • Asiento
        <strong class="text-white">#{{ hoveredSeat.number }}</strong>
        <span class="ml-1.5 text-slate-400">(Elev. {{ hoveredSeat.y }}m)</span>
      </div>
      <div v-if="hoveredSeat.blocked" class="text-[10px] text-amber-400 font-semibold mt-0.5">
        ⚠ Visibilidad obstruida por escenario
      </div>
      <div v-else class="text-[10px] text-emerald-400 mt-0.5">
        Clic para probar vista 360° desde esta silla
      </div>
    </div>

    <!-- HUD Superior Izquierdo -->
    <div class="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-slate-950/85 border border-slate-700/80 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs text-slate-200 shadow-xl">
      <span
        :class="[
          'w-2.5 h-2.5 rounded-full',
          isSeated360 ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
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
          <strong>Polideportivo Alexis Argüello</strong> • {{ seats.length.toLocaleString() }} butacas 3D mapeadas
        </span>
      </template>
    </div>

    <!-- Barra Inferior de Navegación de Cámara -->
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
          ← Izquierda
        </button>
        <button
          type="button"
          @click="lookPreset('focal')"
          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
        >
          Mirar al Centro
        </button>
        <button
          type="button"
          @click="lookPreset('right')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Derecha →
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
          class="ml-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer"
        >
          ↑ Salir al Estadio
        </button>
      </template>

      <template v-else>
        <span class="px-2 py-1 text-sky-400 font-semibold border-r border-slate-800">
          🎥 Cámaras del Recinto
        </span>
        <button
          type="button"
          @click="setCameraViewPreset('aerial')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Panorámica
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('top')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Cenital 360°
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('courtside')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          A Nivel de Duela
        </button>
        <button
          type="button"
          @click="setCameraViewPreset('upper')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Gradería Alta
        </button>
      </template>
    </div>
  </div>
</template>