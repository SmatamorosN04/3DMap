<script setup>
import { ref, computed, watch, toRaw, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ARENA_DIMENSIONS, EVENT_CONFIGS } from '../data/polideportivoAlexisArguello.js';
import {
  createOptimizedSeatShellGeometry,
  createOptimizedSeatFrameGeometry,
  getCachedTexture,
  getSafeContainerSize
} from '../utils/stadiumThreeOptimizer.js';

const props = defineProps({
  seats: { type: Array, required: true },
  tierBlocks: { type: Array, required: true },
  vomitories: { type: Array, required: true },
  eventType: { type: String, default: 'basketball' },
  selectedSeat: { type: Object, default: null },
  highlightedSectorId: { type: String, default: '' },
  showRoofTrusses: { type: Boolean, default: true },
  stadiumLightsOn: { type: Boolean, default: true },
  wallColor: { type: String, default: '#0c1526' }
});

const emit = defineEmits(['select-seat', 'exit-seat-view']);

const containerRef = ref(null);
const hoveredSeat = ref(null);
const hoverScreenPos = ref({ x: 0, y: 0 });
const cameraMode = ref('orbit');
const firstPersonFov = ref(74);

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let resizeObserver = null;
let animFrameId = null;

let arenaStructureGroup = null;
let eventFloorGroup = null;
let roofGroup = null;
let wallsMaterial = null;
let ambientLight = null;
let mainSpotlights = [];

// Solo 2 InstancedMesh ligeros en lugar de 4
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
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

// ============================================================================
// TEXTURAS CACHEADAS
// ============================================================================
function getBasketballCourtTexture() {
  return getCachedTexture('poli-court-fiba', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 548;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d99b52';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < canvas.height; y += 12) {
      ctx.fillStyle = y % 24 === 0 ? 'rgba(146, 64, 14, 0.14)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(0, y, canvas.width, 6);
    }

    ctx.fillStyle = '#1d4ed8';
    const keyW = 195;
    const keyH = 175;
    ctx.fillRect(0, (canvas.height - keyH) / 2, keyW, keyH);
    ctx.fillRect(canvas.width - keyW, (canvas.height - keyH) / 2, keyW, keyH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 4);
    ctx.lineTo(canvas.width / 2, canvas.height - 4);
    ctx.stroke();

    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MANAGUA', canvas.width / 2, canvas.height / 2 - 4);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('ALEXIS ARGÜELLO', canvas.width / 2, canvas.height / 2 + 18);

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
    tex.anisotropy = 4;
    return tex;
  });
}

function getLedRibbonTexture() {
  return getCachedTexture('poli-led-ribbon', () => {
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
    ctx.fillRect(0, 0, canvas.width, 96);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★  POLIDEPORTIVO ALEXIS ARGÜELLO  •  MANAGUA, NICARAGUA  ★', canvas.width / 2, 58);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    return tex;
  });
}

function getScoreboardTexture(titleText) {
  return getCachedTexture(`poli-board-${titleText}`, () => {
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
  });
}

// ============================================================================
// ARQUITECTURA DEL POLIDEPORTIVO
// ============================================================================
function buildArenaShell() {
  disposeGroup(arenaStructureGroup);
  arenaStructureGroup = new THREE.Group();

  const { outerWidth, outerDepth, wallHeight, roofHeight } = ARENA_DIMENSIONS;

  const baseFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(outerWidth, outerDepth),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 })
  );
  baseFloor.rotation.x = -Math.PI / 2;
  arenaStructureGroup.add(baseFloor);

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

  const ledTex = getLedRibbonTexture();
  const ledMat = new THREE.MeshStandardMaterial({
    map: ledTex,
    emissive: new THREE.Color('#1d4ed8'),
    emissiveMap: ledTex,
    emissiveIntensity: 0.65,
    roughness: 0.3
  });

  const ribbonN = new THREE.Mesh(new THREE.BoxGeometry(52, 0.85, 0.3), ledMat);
  ribbonN.position.set(0, 5.95, -22.6);
  const ribbonS = new THREE.Mesh(new THREE.BoxGeometry(52, 0.85, 0.3), ledMat);
  ribbonS.position.set(0, 5.95, 22.6);
  const ribbonE = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 45.2), ledMat);
  ribbonE.position.set(29.8, 5.95, 0);
  const ribbonO = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 45.2), ledMat);
  ribbonO.position.set(-29.8, 5.95, 0);
  arenaStructureGroup.add(ribbonN, ribbonS, ribbonE, ribbonO);

  const railMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.25,
    roughness: 0.15
  });
  const railN = new THREE.Mesh(new THREE.BoxGeometry(51, 0.36, 0.06), railMat);
  railN.position.set(0, 8.45, -25.1);
  const railS = new THREE.Mesh(new THREE.BoxGeometry(51, 0.36, 0.06), railMat);
  railS.position.set(0, 8.45, 25.1);
  arenaStructureGroup.add(railN, railS);

  const rawBlocks = toRaw(props.tierBlocks);
  if (rawBlocks.length > 0) {
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const tierMat = new THREE.MeshStandardMaterial({ color: '#182234', roughness: 0.9 });
    const tierInstanced = new THREE.InstancedMesh(unitBoxGeo, tierMat, rawBlocks.length);

    for (let i = 0; i < rawBlocks.length; i++) {
      const b = rawBlocks[i];
      tempPos.set(b.x, b.y, b.z);
      tempScale.set(b.w, b.h, b.d);
      tempQuat.identity();
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      tierInstanced.setMatrixAt(i, tempMatrix);
    }
    tempScale.set(1, 1, 1);
    tierInstanced.instanceMatrix.needsUpdate = true;
    tierInstanced.computeBoundingSphere();
    arenaStructureGroup.add(tierInstanced);
  }

  const vomMat = new THREE.MeshStandardMaterial({ color: '#030712', roughness: 0.95 });
  const rawVoms = toRaw(props.vomitories);
  for (let i = 0; i < rawVoms.length; i++) {
    const v = rawVoms[i];
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 2.6), vomMat);
    tunnel.position.set(v.x, v.y + 0.6, v.z);
    tunnel.rotation.y = v.rotY;
    arenaStructureGroup.add(tunnel);
  }

  const boardTex = getScoreboardTexture(EVENT_CONFIGS[props.eventType]?.name || 'Evento en Vivo');
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: boardTex,
    emissiveIntensity: 0.55
  });
  const boardEast = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, 10.5), boardMat);
  boardEast.position.set(42.5, 17.5, 0);
  const boardWest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, 10.5), boardMat);
  boardWest.position.set(-42.5, 17.5, 0);
  arenaStructureGroup.add(boardEast, boardWest);

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
// PUNTO FOCAL DEL EVENTO
// ============================================================================
function buildEventCenterpiece() {
  disposeGroup(eventFloorGroup);
  eventFloorGroup = new THREE.Group();

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(32.5, 0.04, 19.5),
    new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.6 })
  );
  apron.position.y = 0.02;
  eventFloorGroup.add(apron);

  if (props.eventType === 'basketball') {
    const courtTex = getBasketballCourtTexture();
    const courtMesh = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.06, 15),
      new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.35, metalness: 0.05 })
    );
    courtMesh.position.y = 0.04;
    eventFloorGroup.add(courtMesh);

    const hoopMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.5, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.48,
      roughness: 0.1
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.3 });

    [-1, 1].forEach((dir) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.1), hoopMat);
      post.position.set(dir * 15.3, 1.3, 0);

      const backboard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 1.8), glassMat);
      backboard.position.set(dir * 12.8, 3.35, 0);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 20), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(dir * 12.45, 3.05, 0);

      eventFloorGroup.add(post, backboard, rim);
    });
  } else if (props.eventType === 'boxing') {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 1.1, 7.8),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 })
    );
    platform.position.y = 0.55;

    const canvasMesh = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.08, 7.4),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5 })
    );
    canvasMesh.position.y = 1.12;
    eventFloorGroup.add(platform, canvasMesh);

    const postColors = ['#dc2626', '#2563eb', '#f8fafc', '#f8fafc'];
    const corners = [
      [-3.4, -3.4],
      [3.4, 3.4],
      [-3.4, 3.4],
      [3.4, -3.4]
    ];
    corners.forEach(([cx, cz], idx) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 1.45, 10),
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
    const stageDeck = new THREE.Mesh(
      new THREE.BoxGeometry(11, 1.6, 17.5),
      new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.4, metalness: 0.3 })
    );
    stageDeck.position.set(-13.5, 0.8, 0);

    const screenTex = getScoreboardTexture('ESCENARIO PRINCIPAL • SHOW');
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
// BUTACAS INSTANCIADAS DE ALTO RENDIMIENTO (2 CAPAS LOW-POLY)
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
// CÁMARA 360° DESDE BUTACA
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

  const sinY = Math.sin(seat.yaw);
  const cosY = Math.cos(seat.yaw);
  const eyeX = seat.x + sinY * 0.22;
  const eyeY = seat.y + 1.24;
  const eyeZ = seat.z + cosY * 0.22;
  camera.position.set(eyeX, eyeY, eyeZ);

  const target = EVENT_CONFIGS[props.eventType]?.focalTarget || { x: 0, y: 1.35, z: 0 };
  const dx = target.x - eyeX;
  const dy = target.y - eyeY;
  const dz = target.z - eyeZ;
  const horizDist = Math.hypot(dx, dz);

  baseSeatYaw = Math.atan2(-dx, -dz);
  headYaw = baseSeatYaw;
  headPitch = Math.max(-0.45, Math.min(0.4, Math.atan2(dy, horizDist)));

  camera.fov = firstPersonFov.value;
  camera.updateProjectionMatrix();
  applyFirstPersonRotation();
}

function exitSeat360() {
  restoreHiddenSeat();
  cameraMode.value = 'orbit';
  if (!camera || !controls) return;
  camera.fov = 50;
  camera.updateProjectionMatrix();
  camera.position.set(0, 35, 46);
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
    const sinY = Math.sin(seat.yaw);
    const cosY = Math.cos(seat.yaw);
    const target = EVENT_CONFIGS[props.eventType]?.focalTarget || { x: 0, y: 1.35, z: 0 };
    const dx = target.x - (seat.x + sinY * 0.22);
    const dy = target.y - (seat.y + 1.24);
    const dz = target.z - (seat.z + cosY * 0.22);
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
    camera.position.set(0, 16.5, 35);
    controls.target.set(0, 1.5, 0);
  }
  controls.update();
}

// ============================================================================
// RAYCASTING OPTIMIZADO (THROTTLED POR FRAME + 1 SOLA MALLA)
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
// CICLO DE VIDA THREE.JS + RESIZE OBSERVER
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
  scene.background = new THREE.Color('#04070f');
  scene.fog = new THREE.FogExp2('#04070f', 0.0052);

  camera = new THREE.PerspectiveCamera(50, aspect, 0.25, 260);
  camera.position.set(0, 35, 46);

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
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 6;
  controls.maxDistance = 95;
  controls.target.set(0, 3, 0);

  ambientLight = new THREE.AmbientLight('#cbd5e1', 0.85);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight('#e0f2fe', '#0f172a', 0.65);
  scene.add(hemiLight);

  const spotCoords = [
    [-16, 22, -12],
    [16, 22, -12],
    [-16, 22, 12],
    [16, 22, 12]
  ];
  mainSpotlights = spotCoords.map(([sx, sy, sz]) => {
    const spot = new THREE.PointLight('#f8fafc', 380, 95, 1.4);
    spot.position.set(sx, sy, sz);
    scene.add(spot);
    return spot;
  });

  buildArenaShell();
  buildEventCenterpiece();
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
      l.intensity = isOn ? 380 : 75;
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
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  if (resizeObserver) resizeObserver.disconnect();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (controls) controls.dispose();
  disposeGroup(arenaStructureGroup);
  disposeGroup(eventFloorGroup);
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

    <!-- Barra Inferior de Navegación -->
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