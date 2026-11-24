<script setup>
import { ref, computed, onMounted } from 'vue';
import SeatPreview3D from '../components/SeatPreview3D.vue';
import {
  ELEVATION_OVERLAP_THRESHOLD,
  isPointInPolygon,
  closestPointOnSegment,
  resolvePlatformPlacement
} from '../utils/stageGeometry.js';

const LAYOUTS_STORAGE_KEY = 'saved_multiplatform_layouts_v2';

const WALL_COLOR_PRESETS = [
  { name: 'Obsidiana', value: '#090d16' },
  { name: 'Azul Noche', value: '#0f172a' },
  { name: 'Teatro Borgoña', value: '#3f0d1c' },
  { name: 'Esmeralda', value: '#062c24' },
  { name: 'Concreto', value: '#27272a' },
  { name: 'Arena / Claro', value: '#cbd5e1' }
];

const mode = ref('build'); // 'build' | 'preview'
const builderStep = ref(1); // 1: Estructura | 2: Asientos | 3: Guardar
const step1SubTab = ref('venue'); // 'venue' | 'platforms' | 'focal'
const builderType = ref('free'); // 'free' | 'grid'
const selectedSeatId = ref(null);
const editingSeatId = ref(null); // ID de la silla con editor rápido de nombre abierto
const quickRenameOnClick = ref(true); // Opción para editar nombre con un clic rápido

// Estado de ventana flotante estilo Windows: 'normal' | 'minimized' | 'maximized'
const panelWindowState = ref('normal');

// Estado de colisiones en vivo
const collisionFeedback = ref({
  venue: false,
  platform: false,
  multilevel: false
});
let collisionClearTimer = null;

function notifyCollisionFeedback(status) {
  collisionFeedback.value = {
    venue: Boolean(status.collidedWithVenue),
    platform: Boolean(status.collidedWithPlatform),
    multilevel: Boolean(status.multilevelOverlap)
  };
  if (collisionClearTimer) clearTimeout(collisionClearTimer);
  collisionClearTimer = setTimeout(() => {
    collisionFeedback.value = { venue: false, platform: false, multilevel: false };
  }, 1400);
}

// --- LAYOUTS GUARDADOS ---
const savedLayouts = ref([]);
const activeLayoutId = ref(null);
const layoutName = ref('Estadio / Sala Principal');
const savedNotice = ref('');

// --- PASO 1A: ESCENARIO / RECINTO PRINCIPAL ---
const venueConfig = ref({
  shape: 'rect',
  width: 1120,
  depth: 940,
  wallColor: '#090d16',
  points: []
});

// --- PASO 1B: PLATAFORMAS (Hasta 4) ---
const platforms = ref([]);
const activePlatformId = ref('plat-1');

// --- PASO 1C: PUNTO FOCAL ---
const focalPoint = ref({
  type: 'screen',
  label: 'Pantalla Principal',
  x: 0,
  z: -340,
  width: 480
});

// --- PASO 2A: GRILLA ---
const gridConfig = ref({
  rows: 3,
  cols: 5,
  cells: []
});
const activeGridTool = ref('available');
const isPaintingGrid = ref(false);

// --- PASO 2B: ASIENTOS LIBRES ---
const freeSeats = ref([]);
const snapToGrid = ref(false);

function createRegularPolygonPoints(count, rx = 220, rz = 180) {
  const n = Math.min(12, Math.max(3, count));
  const pts = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / n;
    pts.push({
      x: Math.round(Math.cos(angle) * rx),
      z: Math.round(Math.sin(angle) * rz)
    });
  }
  return pts;
}

function initDefaultDraft() {
  activeLayoutId.value = null;
  layoutName.value = 'Cine con Palco Elevado';

  venueConfig.value = {
    shape: 'rect',
    width: 1080,
    depth: 920,
    wallColor: '#090d16',
    points: createRegularPolygonPoints(6, 540, 460)
  };

  focalPoint.value = {
    type: 'screen',
    label: 'Pantalla Principal',
    x: 0,
    z: -340,
    width: 480
  };

  platforms.value = [
    {
      id: 'plat-1',
      name: 'Platea Baja',
      shape: 'rect',
      x: 0,
      z: -40,
      width: 520,
      depth: 340,
      baseElevation: 0,
      slope: 45,
      points: createRegularPolygonPoints(5, 240, 170)
    },
    {
      id: 'plat-2',
      name: 'Palco VIP Alto',
      shape: 'polygon',
      x: 0,
      z: 270,
      width: 460,
      depth: 200,
      baseElevation: 105,
      slope: 30,
      points: [
        { x: -210, z: -85 },
        { x: 210, z: -85 },
        { x: 250, z: 40 },
        { x: 0, z: 95 },
        { x: -250, z: 40 }
      ]
    }
  ];
  activePlatformId.value = 'plat-1';

  freeSeats.value = [
    { id: 's-1', platformId: 'plat-1', label: 'A1', x: -165, z: -135, status: 'available' },
    { id: 's-2', platformId: 'plat-1', label: 'A2', x: -55, z: -135, status: 'available' },
    { id: 's-3', platformId: 'plat-1', label: 'A3', x: 55, z: -135, status: 'occupied' },
    { id: 's-4', platformId: 'plat-1', label: 'A4', x: 165, z: -135, status: 'available' },
    { id: 's-5', platformId: 'plat-1', label: 'B1', x: -165, z: 15, status: 'available' },
    { id: 's-6', platformId: 'plat-1', label: 'B2', x: -55, z: 15, status: 'available' },
    { id: 's-7', platformId: 'plat-1', label: 'B3', x: 55, z: 15, status: 'available' },
    { id: 's-8', platformId: 'plat-1', label: 'B4', x: 165, z: 15, status: 'available' },
    { id: 's-9', platformId: 'plat-2', label: 'VIP-1', x: -130, z: 255, status: 'available' },
    { id: 's-10', platformId: 'plat-2', label: 'VIP-2', x: 0, z: 245, status: 'available' },
    { id: 's-11', platformId: 'plat-2', label: 'VIP-3', x: 130, z: 255, status: 'occupied' }
  ];

  rebuildGridForPlatform('plat-1');
}

function loadStadiumOvalPreset() {
  activeLayoutId.value = null;
  layoutName.value = 'Estadio Ovalado 360° (4 Gradas)';

  venueConfig.value = {
    shape: 'oval',
    width: 1240,
    depth: 980,
    wallColor: venueConfig.value.wallColor || '#090d16',
    points: createRegularPolygonPoints(8, 600, 480)
  };

  focalPoint.value = {
    type: 'ring',
    label: 'Cancha Central',
    x: 0,
    z: 0,
    width: 240
  };

  platforms.value = [
    {
      id: 'plat-norte',
      name: 'Tribuna Norte',
      shape: 'circle',
      x: 0,
      z: -290,
      width: 420,
      depth: 190,
      baseElevation: 35,
      slope: 45,
      points: createRegularPolygonPoints(6, 200, 100)
    },
    {
      id: 'plat-sur',
      name: 'Tribuna Sur',
      shape: 'circle',
      x: 0,
      z: 290,
      width: 420,
      depth: 190,
      baseElevation: 35,
      slope: 45,
      points: createRegularPolygonPoints(6, 200, 100)
    },
    {
      id: 'plat-oeste',
      name: 'Palco Oeste',
      shape: 'rect',
      x: -350,
      z: 0,
      width: 210,
      depth: 300,
      baseElevation: 80,
      slope: 0,
      points: createRegularPolygonPoints(4, 110, 150)
    },
    {
      id: 'plat-este',
      name: 'Palco Este',
      shape: 'rect',
      x: 350,
      z: 0,
      width: 210,
      depth: 300,
      baseElevation: 80,
      slope: 0,
      points: createRegularPolygonPoints(4, 110, 150)
    }
  ];
  activePlatformId.value = 'plat-norte';

  freeSeats.value = [
    { id: 'ar-1', platformId: 'plat-norte', label: 'N1', x: -95, z: -275, status: 'available' },
    { id: 'ar-2', platformId: 'plat-norte', label: 'N2', x: 0, z: -290, status: 'available' },
    { id: 'ar-3', platformId: 'plat-norte', label: 'N3', x: 95, z: -275, status: 'available' },
    { id: 'ar-4', platformId: 'plat-sur', label: 'S1', x: -95, z: 275, status: 'available' },
    { id: 'ar-5', platformId: 'plat-sur', label: 'S2', x: 0, z: 290, status: 'available' },
    { id: 'ar-6', platformId: 'plat-sur', label: 'S3', x: 95, z: 275, status: 'occupied' },
    { id: 'ar-7', platformId: 'plat-oeste', label: 'O1', x: -340, z: -70, status: 'available' },
    { id: 'ar-8', platformId: 'plat-oeste', label: 'O2', x: -340, z: 70, status: 'available' },
    { id: 'ar-9', platformId: 'plat-este', label: 'E1', x: 340, z: -70, status: 'available' },
    { id: 'ar-10', platformId: 'plat-este', label: 'E2', x: 340, z: 70, status: 'available' }
  ];
  showToast('Plantilla Estadio Ovalado cargada');
}

const activePlatform = computed(() => {
  return platforms.value.find((p) => p.id === activePlatformId.value) || platforms.value[0];
});

// --- REVALIDAR COLISIONES ---
function enforceAllPlatformCollisions(priorityPlatId = null) {
  const ordered = priorityPlatId
    ? [
        ...platforms.value.filter((p) => p.id === priorityPlatId),
        ...platforms.value.filter((p) => p.id !== priorityPlatId)
      ]
    : [...platforms.value];

  ordered.forEach((plat) => {
    const oldX = plat.x;
    const oldZ = plat.z;
    const resolved = resolvePlatformPlacement(
      plat,
      plat.x,
      plat.z,
      platforms.value,
      venueConfig.value
    );
    const dx = resolved.x - oldX;
    const dz = resolved.z - oldZ;
    if (dx !== 0 || dz !== 0) {
      plat.x = resolved.x;
      plat.z = resolved.z;
      freeSeats.value.forEach((s) => {
        if (s.platformId === plat.id) {
          s.x += dx;
          s.z += dz;
        }
      });
    }
    if (plat.id === priorityPlatId) {
      notifyCollisionFeedback(resolved);
    }
  });
}

// --- ACCIONES DEL ESCENARIO PRINCIPAL ---
function changeVenueShape(nextShape) {
  venueConfig.value.shape = nextShape;
  if (
    nextShape === 'polygon' &&
    (!venueConfig.value.points || venueConfig.value.points.length < 3)
  ) {
    venueConfig.value.points = createRegularPolygonPoints(
      6,
      venueConfig.value.width / 2,
      venueConfig.value.depth / 2
    );
  }
  enforceAllPlatformCollisions();
}

function setVenuePolygonVertexCount(count) {
  const n = Math.min(12, Math.max(3, count));
  venueConfig.value.points = createRegularPolygonPoints(
    n,
    venueConfig.value.width / 2,
    venueConfig.value.depth / 2
  );
  enforceAllPlatformCollisions();
}

function handleMoveVenueVertex({ vertexIndex, x, z }) {
  if (!venueConfig.value.points[vertexIndex]) return;
  venueConfig.value.points[vertexIndex] = { x, z };
  enforceAllPlatformCollisions();
}

// --- CONTENCIÓN DE ASIENTOS DENTRO DE PLATAFORMAS ---
function clampPointInsidePlatform(worldX, worldZ, plat) {
  if (!plat) return { x: worldX, z: worldZ };
  let lx = worldX - plat.x;
  let lz = worldZ - plat.z;
  const pad = 34;

  if (plat.shape === 'rect') {
    const maxX = Math.max(20, plat.width / 2 - pad);
    const maxZ = Math.max(20, plat.depth / 2 - pad);
    lx = Math.min(maxX, Math.max(-maxX, lx));
    lz = Math.min(maxZ, Math.max(-maxZ, lz));
  } else if (plat.shape === 'circle') {
    const rx = Math.max(30, plat.width / 2 - pad);
    const rz = Math.max(30, plat.depth / 2 - pad);
    const norm = (lx * lx) / (rx * rx) + (lz * lz) / (rz * rz);
    if (norm > 1) {
      const scale = 1 / Math.sqrt(norm);
      lx *= scale;
      lz *= scale;
    }
  } else if (plat.shape === 'polygon' && plat.points?.length >= 3) {
    const pts = plat.points;
    if (!isPointInPolygon(lx, lz, pts)) {
      let best = { x: 0, z: 0 };
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const cand = closestPointOnSegment(lx, lz, p1.x, p1.z, p2.x, p2.z);
        const d = Math.hypot(lx - cand.x, lz - cand.z);
        if (d < bestDist) {
          bestDist = d;
          best = cand;
        }
      }
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const toCenterLen = Math.hypot(cx - best.x, cz - best.z) || 1;
      const pull = Math.min(24, toCenterLen * 0.35);
      lx = best.x + ((cx - best.x) / toCenterLen) * pull;
      lz = best.z + ((cz - best.z) / toCenterLen) * pull;
    }
  }

  let finalX = plat.x + lx;
  let finalZ = plat.z + lz;
  if (snapToGrid.value) {
    finalX = Math.round(finalX / 20) * 20;
    finalZ = Math.round(finalZ / 20) * 20;
  }

  return {
    x: Math.round(finalX),
    z: Math.round(finalZ)
  };
}

function clampAllSeatsOnPlatform(platId) {
  const plat = platforms.value.find((p) => p.id === platId);
  if (!plat) return;
  freeSeats.value.forEach((seat) => {
    if (seat.platformId === platId) {
      const clamped = clampPointInsidePlatform(seat.x, seat.z, plat);
      seat.x = clamped.x;
      seat.z = clamped.z;
    }
  });
}

// --- ACCIONES DE PLATAFORMAS ---
function addPlatform() {
  if (platforms.value.length >= 4) return;
  const idx = platforms.value.length + 1;
  const offsets = [
    { x: 0, z: 0, elev: 0 },
    { x: 0, z: 250, elev: 105 },
    { x: -310, z: 40, elev: 55 },
    { x: 310, z: 40, elev: 55 }
  ];
  const preset = offsets[idx - 1] || { x: 0, z: 120, elev: 40 };

  const newPlat = {
    id: `plat-${Date.now()}`,
    name: `Módulo ${idx}`,
    shape: 'rect',
    x: preset.x,
    z: preset.z,
    width: 300,
    depth: 200,
    baseElevation: preset.elev,
    slope: 25,
    points: createRegularPolygonPoints(5, 150, 110)
  };

  const resolved = resolvePlatformPlacement(
    newPlat,
    newPlat.x,
    newPlat.z,
    platforms.value,
    venueConfig.value
  );
  newPlat.x = resolved.x;
  newPlat.z = resolved.z;

  platforms.value.push(newPlat);
  activePlatformId.value = newPlat.id;
  notifyCollisionFeedback(resolved);
}

function removePlatform(id) {
  if (platforms.value.length <= 1) return;
  platforms.value = platforms.value.filter((p) => p.id !== id);
  freeSeats.value = freeSeats.value.filter((s) => s.platformId !== id);
  if (activePlatformId.value === id) {
    activePlatformId.value = platforms.value[0].id;
  }
}

function changePlatformShape(plat, nextShape) {
  plat.shape = nextShape;
  if (nextShape === 'polygon' && (!plat.points || plat.points.length < 3)) {
    plat.points = createRegularPolygonPoints(5, plat.width / 2, plat.depth / 2);
  }
  enforceAllPlatformCollisions(plat.id);
  clampAllSeatsOnPlatform(plat.id);
}

function setPolygonVertexCount(plat, count) {
  const n = Math.min(12, Math.max(3, count));
  plat.points = createRegularPolygonPoints(n, plat.width / 2, plat.depth / 2);
  enforceAllPlatformCollisions(plat.id);
  clampAllSeatsOnPlatform(plat.id);
}

function handleMovePolygonVertex({ platformId, vertexIndex, x, z }) {
  const plat = platforms.value.find((p) => p.id === platformId);
  if (!plat || !plat.points[vertexIndex]) return;

  const prevPt = { ...plat.points[vertexIndex] };
  plat.points[vertexIndex] = { x, z };

  const resolved = resolvePlatformPlacement(
    plat,
    plat.x,
    plat.z,
    platforms.value,
    venueConfig.value
  );
  if (resolved.collidedWithVenue || resolved.collidedWithPlatform) {
    plat.points[vertexIndex] = prevPt;
    notifyCollisionFeedback(resolved);
    return;
  }

  clampAllSeatsOnPlatform(platformId);
}

function handleMovePlatform({ id, x, z }) {
  const plat = platforms.value.find((p) => p.id === id);
  if (!plat) return;

  const resolved = resolvePlatformPlacement(plat, x, z, platforms.value, venueConfig.value);
  const dx = resolved.x - plat.x;
  const dz = resolved.z - plat.z;

  plat.x = resolved.x;
  plat.z = resolved.z;

  if (dx !== 0 || dz !== 0) {
    freeSeats.value.forEach((seat) => {
      if (seat.platformId === id) {
        seat.x += dx;
        seat.z += dz;
      }
    });
  }

  notifyCollisionFeedback(resolved);
}

// --- ACCIONES DE GRILLA ---
function rebuildGridForPlatform(platId) {
  const cells = [];
  for (let r = 0; r < gridConfig.value.rows; r++) {
    for (let c = 0; c < gridConfig.value.cols; c++) {
      cells.push({
        platformId: platId,
        row: r,
        col: c,
        status: 'available'
      });
    }
  }
  gridConfig.value.cells = cells;
}

const computedGridData = computed(() => {
  const plat = activePlatform.value;
  if (!plat) return { activeSeats: [], placeholders: [] };

  const activeSeats = [];
  const placeholders = [];
  const usableW = Math.max(120, plat.width - 90);
  const usableD = Math.max(100, plat.depth - 90);
  const spacingX = Math.min(92, usableW / Math.max(1, gridConfig.value.cols));
  const stepZ = Math.min(95, usableD / Math.max(1, gridConfig.value.rows));
  const startX = plat.x - ((gridConfig.value.cols - 1) * spacingX) / 2;
  const startZ = plat.z - ((gridConfig.value.rows - 1) * stepZ) / 2;

  for (let r = 0; r < gridConfig.value.rows; r++) {
    const rowLetter = String.fromCharCode(65 + r);
    let seatNum = 1;
    for (let c = 0; c < gridConfig.value.cols; c++) {
      const cell = gridConfig.value.cells[r * gridConfig.value.cols + c];
      const status = cell ? cell.status : 'empty';
      const x = Math.round(startX + c * spacingX);
      const z = Math.round(startZ + r * stepZ);

      const insideShape =
        plat.shape === 'rect'
          ? true
          : plat.shape === 'circle'
            ? ((x - plat.x) ** 2) / ((plat.width / 2 - 28) ** 2) +
                ((z - plat.z) ** 2) / ((plat.depth / 2 - 28) ** 2) <=
              1
            : isPointInPolygon(x - plat.x, z - plat.z, plat.points || []);

      if (!insideShape) continue;

      if (status === 'empty') {
        placeholders.push({
          id: `empty-${r}-${c}`,
          platformId: plat.id,
          row: r,
          col: c,
          x,
          z,
          status: 'empty'
        });
      } else {
        activeSeats.push({
          id: `grid-${r}-${c}`,
          platformId: plat.id,
          row: r,
          col: c,
          x,
          z,
          status,
          label: `${rowLetter}${seatNum++}`
        });
      }
    }
  }

  return { activeSeats, placeholders };
});

const isGridActive = computed(() => builderType.value === 'grid');

const currentSeats = computed(() => {
  return isGridActive.value ? computedGridData.value.activeSeats : freeSeats.value;
});

const selectedSeat = computed(() => {
  if (!selectedSeatId.value) return null;
  return currentSeats.value.find((s) => s.id === selectedSeatId.value) || null;
});

// --- ACCIONES DE ASIENTOS LIBRES + EDICIÓN RÁPIDA DE NOMBRE ---
function addFreeSeatAt(payload) {
  const platId = payload?.platformId || activePlatformId.value;
  const plat = platforms.value.find((p) => p.id === platId) || activePlatform.value;
  if (!plat) return;

  const pos = clampPointInsidePlatform(payload?.x ?? plat.x, payload?.z ?? plat.z, plat);
  const nextNum = freeSeats.value.length + 1;
  const newSeat = {
    id: `seat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platformId: plat.id,
    label: `S${nextNum}`,
    x: pos.x,
    z: pos.z,
    status: 'available'
  };
  freeSeats.value.push(newSeat);
  selectedSeatId.value = newSeat.id;
  if (quickRenameOnClick.value) {
    editingSeatId.value = newSeat.id;
  }
}

function handleQuickClickSeat(seat) {
  selectedSeatId.value = seat.id;
  if (quickRenameOnClick.value) {
    editingSeatId.value = seat.id;
  }
}

function finishSeatRename() {
  if (editingSeatId.value) {
    const seat = freeSeats.value.find((s) => s.id === editingSeatId.value);
    if (seat && !seat.label.trim()) {
      const idx = freeSeats.value.indexOf(seat);
      seat.label = `S${idx + 1}`;
    } else if (seat) {
      seat.label = seat.label.trim();
    }
  }
  editingSeatId.value = null;
}

function handleMoveFreeSeat({ id, x, z }) {
  const seat = freeSeats.value.find((s) => s.id === id);
  if (!seat) return;
  const plat = platforms.value.find((p) => p.id === seat.platformId);
  const clamped = clampPointInsidePlatform(x, z, plat);
  seat.x = clamped.x;
  seat.z = clamped.z;
}

function reassignSeatPlatform(seat, nextPlatformId) {
  const nextPlat = platforms.value.find((p) => p.id === nextPlatformId);
  if (!nextPlat) return;
  seat.platformId = nextPlatformId;
  const clamped = clampPointInsidePlatform(nextPlat.x, nextPlat.z, nextPlat);
  seat.x = clamped.x;
  seat.z = clamped.z;
}

function duplicateSelectedSeat() {
  if (!selectedSeat.value || isGridActive.value) return;
  const src = selectedSeat.value;
  const plat = platforms.value.find((p) => p.id === src.platformId);
  const pos = clampPointInsidePlatform(src.x + 65, src.z, plat);

  const copy = {
    id: `seat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    platformId: src.platformId,
    label: `${src.label}-2`.slice(0, 10),
    x: pos.x,
    z: pos.z,
    status: src.status
  };
  freeSeats.value.push(copy);
  selectedSeatId.value = copy.id;
  if (quickRenameOnClick.value) {
    editingSeatId.value = copy.id;
  }
}

function toggleSeatStatus(seat) {
  if (isGridActive.value) {
    const cell = gridConfig.value.cells[seat.row * gridConfig.value.cols + seat.col];
    if (cell) cell.status = cell.status === 'available' ? 'occupied' : 'available';
  } else {
    seat.status = seat.status === 'available' ? 'occupied' : 'available';
  }
}

function removeSeat(seat) {
  if (isGridActive.value) {
    const cell = gridConfig.value.cells[seat.row * gridConfig.value.cols + seat.col];
    if (cell) cell.status = 'empty';
  } else {
    freeSeats.value = freeSeats.value.filter((s) => s.id !== seat.id);
  }
  if (selectedSeatId.value === seat.id) {
    selectedSeatId.value = null;
  }
  if (editingSeatId.value === seat.id) {
    editingSeatId.value = null;
  }
}

function importGridToFree() {
  const platId = activePlatformId.value;
  freeSeats.value = freeSeats.value.filter((s) => s.platformId !== platId);
  computedGridData.value.activeSeats.forEach((s, idx) => {
    freeSeats.value.push({
      id: `seat-imp-${Date.now()}-${idx}`,
      platformId: platId,
      label: s.label,
      x: s.x,
      z: s.z,
      status: s.status
    });
  });
  builderType.value = 'free';
  selectedSeatId.value = null;
  editingSeatId.value = null;
  showToast('Asientos de grilla integrados al modo libre');
}

function resizeGrid(newRows, newCols) {
  gridConfig.value.rows = Math.min(7, Math.max(2, newRows));
  gridConfig.value.cols = Math.min(9, Math.max(2, newCols));
  rebuildGridForPlatform(activePlatformId.value);
}

function applyToolToGridCell(cell) {
  const target = gridConfig.value.cells[cell.row * gridConfig.value.cols + cell.col];
  if (!target) return;
  if (target.status === activeGridTool.value && !isPaintingGrid.value) {
    target.status = 'empty';
  } else {
    target.status = activeGridTool.value;
  }
}

function handleGridMouseDown(cell) {
  isPaintingGrid.value = true;
  applyToolToGridCell(cell);
}

function handleGridMouseEnter(cell) {
  if (!isPaintingGrid.value) return;
  const target = gridConfig.value.cells[cell.row * gridConfig.value.cols + cell.col];
  if (target) target.status = activeGridTool.value;
}

function stopPainting() {
  isPaintingGrid.value = false;
}

function clearCurrentSeats() {
  if (isGridActive.value) {
    gridConfig.value.cells.forEach((c) => (c.status = 'empty'));
  } else {
    freeSeats.value = [];
  }
  selectedSeatId.value = null;
  editingSeatId.value = null;
}

// --- PASO 3: GUARDAR / CARGAR LAYOUTS ---
function persistLayoutsList() {
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(savedLayouts.value));
}

function saveLayoutToStorage() {
  finishSeatRename();
  const cleanName = layoutName.value.trim() || `Sala ${savedLayouts.value.length + 1}`;
  layoutName.value = cleanName;

  const payload = {
    id: activeLayoutId.value || `layout-${Date.now()}`,
    name: cleanName,
    venueConfig: JSON.parse(JSON.stringify(venueConfig.value)),
    platforms: JSON.parse(JSON.stringify(platforms.value)),
    focalPoint: JSON.parse(JSON.stringify(focalPoint.value)),
    freeSeats: JSON.parse(JSON.stringify(freeSeats.value)),
    platformsCount: platforms.value.length,
    seatsCount: currentSeats.value.length
  };

  const idx = savedLayouts.value.findIndex((l) => l.id === payload.id);
  if (idx !== -1) {
    savedLayouts.value[idx] = payload;
  } else {
    savedLayouts.value.unshift(payload);
  }

  activeLayoutId.value = payload.id;
  persistLayoutsList();
  showToast(`✓ Layout "${cleanName}" guardado`);
}

function loadLayout(layout) {
  activeLayoutId.value = layout.id;
  layoutName.value = layout.name;
  venueConfig.value = layout.venueConfig
    ? {
        wallColor: '#090d16',
        ...JSON.parse(JSON.stringify(layout.venueConfig))
      }
    : {
        shape: 'rect',
        width: 1120,
        depth: 940,
        wallColor: '#090d16',
        points: createRegularPolygonPoints(6, 540, 460)
      };
  platforms.value = JSON.parse(JSON.stringify(layout.platforms));
  activePlatformId.value = platforms.value[0]?.id || 'plat-1';
  focalPoint.value = JSON.parse(JSON.stringify(layout.focalPoint));
  freeSeats.value = JSON.parse(JSON.stringify(layout.freeSeats || []));
  builderType.value = 'free';
  selectedSeatId.value = null;
  editingSeatId.value = null;
  showToast(`Layout "${layout.name}" cargado`);
}

function deleteLayout(id) {
  savedLayouts.value = savedLayouts.value.filter((l) => l.id !== id);
  if (activeLayoutId.value === id) activeLayoutId.value = null;
  persistLayoutsList();
}

function showToast(msg) {
  savedNotice.value = msg;
  setTimeout(() => {
    savedNotice.value = '';
  }, 2600);
}

function switchMode(nextMode) {
  finishSeatRename();
  mode.value = nextMode;
  selectedSeatId.value = null;
}

function goToStep(step) {
  finishSeatRename();
  builderStep.value = step;
  if (step !== 2) selectedSeatId.value = null;
}

function handleSelectSeat(seat) {
  if (!seat) {
    selectedSeatId.value = null;
    return;
  }
  if (mode.value === 'preview' && seat.status === 'occupied') return;
  selectedSeatId.value = selectedSeatId.value === seat.id ? null : seat.id;
}

function toggleMinimizePanel() {
  panelWindowState.value = panelWindowState.value === 'minimized' ? 'normal' : 'minimized';
}

function toggleMaximizePanel() {
  panelWindowState.value = panelWindowState.value === 'maximized' ? 'normal' : 'maximized';
}

const windowTitleText = computed(() => {
  if (mode.value === 'preview') return 'Simulador 360°';
  const stepNames = { 1: 'Paso 1: Estructura', 2: 'Paso 2: Asientos', 3: 'Paso 3: Guardar' };
  return `Diseño • ${stepNames[builderStep.value]}`;
});

onMounted(() => {
  const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        savedLayouts.value = parsed;
        loadLayout(parsed[0]);
        return;
      }
    } catch {
      // Fallback
    }
  }
  initDefaultDraft();
});
</script>

<template>
  <div
    class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
    @mouseup="stopPainting"
    @mouseleave="stopPainting"
  >
    <!-- Encabezado superior -->
    <div class="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="font-bold text-slate-800 text-sm">
          Creador de Escenarios, Multi-Plataforma y Simulador 360°
        </h2>
        <p class="text-xs text-slate-500 mt-0.5">
          Layout: <span class="font-semibold text-slate-700">{{ layoutName }}</span>
          • Escenario {{ venueConfig.shape === 'oval' ? 'Ovalado' : venueConfig.shape === 'polygon' ? 'Polígono' : 'Cuadrado' }}
          • {{ platforms.length }} {{ platforms.length === 1 ? 'módulo' : 'módulos' }}
          • {{ currentSeats.length }} asientos
        </p>
      </div>

      <span
        v-if="savedNotice"
        class="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full"
      >
        {{ savedNotice }}
      </span>
    </div>

    <!-- Contenedor principal -->
    <div class="relative p-3 bg-slate-950">
      <SeatPreview3D
        :venue-config="venueConfig"
        :platforms="platforms"
        :active-platform-id="activePlatformId"
        :seats="currentSeats"
        :focal-point="focalPoint"
        :selected-seat="selectedSeat"
        :editing-seat-id="editingSeatId"
        :wall-presets="WALL_COLOR_PRESETS"
        :mode="mode"
        :builder-step="builderStep"
        :step1-sub-tab="step1SubTab"
        :builder-type="builderType"
        :grid-placeholders="computedGridData.placeholders"
        :snap-to-grid="snapToGrid"
        :collision-feedback="collisionFeedback"
        @move-venue-vertex="handleMoveVenueVertex"
        @update-wall-color="(color) => (venueConfig.wallColor = color)"
        @select-platform="(id) => (activePlatformId = id)"
        @move-platform="handleMovePlatform"
        @move-polygon-vertex="handleMovePolygonVertex"
        @select-seat="handleSelectSeat"
        @quick-click-seat="handleQuickClickSeat"
        @finish-seat-rename="finishSeatRename"
        @paint-grid-cell="applyToolToGridCell"
        @move-free-seat="handleMoveFreeSeat"
        @add-free-seat-at="addFreeSeatAt"
      />

      <!-- ==================== VENTANA FLOTANTE CON MINIMIZAR / MAXIMIZAR ESTILO WINDOWS ==================== -->
      <aside
        data-hud="true"
        :class="[
          'absolute top-5 right-5 z-30 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/85 shadow-2xl text-slate-100 overflow-hidden transition-all duration-200',
          panelWindowState === 'minimized'
            ? 'w-64'
            : panelWindowState === 'maximized'
              ? 'w-[450px] max-w-[92vw]'
              : 'w-72 sm:w-80'
        ]"
      >
        <!-- Barra de título estilo Windows -->
        <div
          @dblclick="toggleMaximizePanel"
          class="flex items-center justify-between px-3 py-2 bg-slate-950/90 border-b border-slate-800 select-none cursor-default"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              :class="[
                'w-2 h-2 rounded-full shrink-0',
                mode === 'build' ? 'bg-indigo-400' : 'bg-emerald-400'
              ]"
            ></span>
            <span class="text-[11px] font-bold tracking-wide text-slate-200 truncate">
              {{ windowTitleText }}
            </span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              @click.stop="toggleMinimizePanel"
              :title="panelWindowState === 'minimized' ? 'Restaurar panel' : 'Minimizar panel'"
              class="w-7 h-6 rounded hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
            >
              <span v-if="panelWindowState === 'minimized'" class="text-[11px] leading-none">▢</span>
              <span v-else class="w-2.5 h-[1.5px] bg-current block mt-1.5"></span>
            </button>

            <button
              type="button"
              @click.stop="toggleMaximizePanel"
              :title="panelWindowState === 'maximized' ? 'Restaurar tamaño' : 'Maximizar panel'"
              class="w-7 h-6 rounded hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
            >
              <span v-if="panelWindowState === 'maximized'" class="relative w-2.5 h-2.5 inline-block">
                <span class="absolute top-0 right-0 w-2 h-2 border border-current"></span>
                <span class="absolute bottom-0 left-0 w-2 h-2 border border-current bg-slate-950"></span>
              </span>
              <span v-else class="w-2.5 h-2.5 border border-current inline-block"></span>
            </button>
          </div>
        </div>

        <!-- Cuerpo de la ventana -->
        <div
          v-show="panelWindowState !== 'minimized'"
          :class="[
            'p-4 overflow-y-auto',
            panelWindowState === 'maximized' ? 'max-h-[590px]' : 'max-h-[575px]'
          ]"
        >
          <!-- Switch Principal -->
          <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950/85 border border-slate-800 mb-3">
            <button
              type="button"
              @click="switchMode('build')"
              :class="[
                'py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
                mode === 'build'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              ]"
            >
              Crear Diseño
            </button>
            <button
              type="button"
              @click="switchMode('preview')"
              :class="[
                'py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
                mode === 'preview'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              ]"
            >
              Probar Vista 360°
            </button>
          </div>

          <!-- ==================== MODO CREAR DISEÑO (3 PASOS) ==================== -->
          <template v-if="mode === 'build'">
            <div class="grid grid-cols-3 gap-1.5 mb-3">
              <button
                type="button"
                @click="goToStep(1)"
                :class="[
                  'py-1.5 px-2 rounded-xl border text-left transition cursor-pointer',
                  builderStep === 1
                    ? 'bg-cyan-600/90 border-cyan-400 text-white shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                ]"
              >
                <span class="block text-[9px] uppercase tracking-wider opacity-80">Paso 1</span>
                <span class="block text-[11px] font-bold truncate">Estructura</span>
              </button>

              <button
                type="button"
                @click="goToStep(2)"
                :class="[
                  'py-1.5 px-2 rounded-xl border text-left transition cursor-pointer',
                  builderStep === 2
                    ? 'bg-fuchsia-600/90 border-fuchsia-400 text-white shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                ]"
              >
                <span class="block text-[9px] uppercase tracking-wider opacity-80">Paso 2</span>
                <span class="block text-[11px] font-bold truncate">Asientos</span>
              </button>

              <button
                type="button"
                @click="goToStep(3)"
                :class="[
                  'py-1.5 px-2 rounded-xl border text-left transition cursor-pointer',
                  builderStep === 3
                    ? 'bg-emerald-600/90 border-emerald-400 text-white shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                ]"
              >
                <span class="block text-[9px] uppercase tracking-wider opacity-80">Paso 3</span>
                <span class="block text-[11px] font-bold truncate">Guardar</span>
              </button>
            </div>

            <!-- ==================== PASO 1: ESCENARIO, PLATAFORMAS Y PUNTO FOCAL ==================== -->
            <template v-if="builderStep === 1">
              <div class="grid grid-cols-3 gap-1 mb-3 text-[11px]">
                <button
                  type="button"
                  @click="step1SubTab = 'venue'"
                  :class="[
                    'py-1.5 px-1.5 rounded-lg border font-medium transition cursor-pointer truncate',
                    step1SubTab === 'venue'
                      ? 'bg-emerald-600/85 border-emerald-400 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  ]"
                >
                  🏟 Escenario
                </button>
                <button
                  type="button"
                  @click="step1SubTab = 'platforms'"
                  :class="[
                    'py-1.5 px-1.5 rounded-lg border font-medium transition cursor-pointer truncate',
                    step1SubTab === 'platforms'
                      ? 'bg-cyan-600/85 border-cyan-400 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  ]"
                >
                  ⬡ Módulos ({{ platforms.length }}/4)
                </button>
                <button
                  type="button"
                  @click="step1SubTab = 'focal'"
                  :class="[
                    'py-1.5 px-1.5 rounded-lg border font-medium transition cursor-pointer truncate',
                    step1SubTab === 'focal'
                      ? 'bg-amber-600/85 border-amber-400 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  ]"
                >
                  🎯 Foco
                </button>
              </div>

              <!-- SUB-TAB 1A: EDITOR DEL ESCENARIO PRINCIPAL -->
              <template v-if="step1SubTab === 'venue'">
                <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs mb-3">
                  <span class="block text-[10px] uppercase tracking-wider text-slate-400">
                    Forma del escenario / recinto
                  </span>

                  <div class="grid grid-cols-3 gap-1 text-[11px]">
                    <button
                      type="button"
                      @click="changeVenueShape('rect')"
                      :class="[
                        'py-1.5 rounded-lg border font-medium cursor-pointer',
                        venueConfig.shape === 'rect'
                          ? 'bg-emerald-600/85 border-emerald-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      ▣ Cuadrado
                    </button>
                    <button
                      type="button"
                      @click="changeVenueShape('oval')"
                      :class="[
                        'py-1.5 rounded-lg border font-medium cursor-pointer',
                        venueConfig.shape === 'oval'
                          ? 'bg-emerald-600/85 border-emerald-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      ⬭ Estadio
                    </button>
                    <button
                      type="button"
                      @click="changeVenueShape('polygon')"
                      :class="[
                        'py-1.5 rounded-lg border font-medium cursor-pointer',
                        venueConfig.shape === 'polygon'
                          ? 'bg-emerald-600/85 border-emerald-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      ⬡ Puntos
                    </button>
                  </div>

                  <div
                    v-if="venueConfig.shape === 'polygon'"
                    class="bg-emerald-950/35 border border-emerald-500/40 rounded-lg p-2 space-y-1.5"
                  >
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-emerald-200 font-medium">Puntos del escenario</span>
                      <div class="flex items-center gap-1.5">
                        <button
                          type="button"
                          @click="setVenuePolygonVertexCount(venueConfig.points.length - 1)"
                          class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                        >-</button>
                        <span class="font-bold text-emerald-300 w-4 text-center">
                          {{ venueConfig.points.length }}
                        </span>
                        <button
                          type="button"
                          @click="setVenuePolygonVertexCount(venueConfig.points.length + 1)"
                          class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                        >+</button>
                      </div>
                    </div>
                    <p class="text-[10px] text-emerald-200/80 leading-tight">
                      Arrastra los nodos verdes <strong>E1..E{{ venueConfig.points.length }}</strong> en el piso para dar forma al escenario.
                    </p>
                  </div>

                  <div v-else :class="panelWindowState === 'maximized' ? 'grid grid-cols-2 gap-3' : 'space-y-2'">
                    <div>
                      <div class="flex justify-between text-[11px] mb-0.5">
                        <span class="text-slate-400">Ancho</span>
                        <span class="font-semibold text-emerald-300">{{ venueConfig.width }}</span>
                      </div>
                      <input
                        v-model.number="venueConfig.width"
                        @input="enforceAllPlatformCollisions()"
                        type="range"
                        min="640"
                        max="1560"
                        step="20"
                        class="w-full accent-emerald-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div class="flex justify-between text-[11px] mb-0.5">
                        <span class="text-slate-400">Largo</span>
                        <span class="font-semibold text-emerald-300">{{ venueConfig.depth }}</span>
                      </div>
                      <input
                        v-model.number="venueConfig.depth"
                        @input="enforceAllPlatformCollisions()"
                        type="range"
                        min="560"
                        max="1360"
                        step="20"
                        class="w-full accent-emerald-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <!-- Color de paredes (también editable aquí y en Vista 360°) -->
                  <div class="bg-slate-900 border border-slate-800 rounded-lg p-2 space-y-1.5">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-slate-300">Color de paredes (360°)</span>
                      <span class="text-[10px] font-mono text-slate-400 uppercase">{{ venueConfig.wallColor }}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button
                        v-for="preset in WALL_COLOR_PRESETS"
                        :key="preset.value"
                        type="button"
                        @click="venueConfig.wallColor = preset.value"
                        :title="preset.name"
                        :class="[
                          'w-5 h-5 rounded-full border transition cursor-pointer',
                          venueConfig.wallColor.toLowerCase() === preset.value.toLowerCase()
                            ? 'border-white scale-110 ring-2 ring-emerald-400/70'
                            : 'border-slate-600 hover:border-white'
                        ]"
                        :style="{ backgroundColor: preset.value }"
                      ></button>
                      <input
                        v-model="venueConfig.wallColor"
                        type="color"
                        title="Color personalizado"
                        class="w-6 h-5 rounded bg-transparent border-0 cursor-pointer ml-auto"
                      />
                    </div>
                  </div>

                  <label class="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <span>Ajuste magnético de puntos (20px)</span>
                    <input
                      v-model="snapToGrid"
                      type="checkbox"
                      class="accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  <button
                    type="button"
                    @click="loadStadiumOvalPreset"
                    class="w-full py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-emerald-950/70 border border-slate-700 hover:border-emerald-500/60 text-[11px] text-emerald-300 transition cursor-pointer"
                  >
                    Cargar ejemplo Estadio Ovalado (4 gradas)
                  </button>
                </div>
              </template>

              <!-- SUB-TAB 1B: EDITOR DE MÚLTIPLES PLATAFORMAS -->
              <template v-else-if="step1SubTab === 'platforms' && activePlatform">
                <div class="flex items-center gap-1 mb-2.5">
                  <button
                    v-for="(plat, idx) in platforms"
                    :key="plat.id"
                    type="button"
                    @click="activePlatformId = plat.id"
                    :class="[
                      'flex-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer truncate',
                      plat.id === activePlatformId
                        ? 'bg-cyan-600 border-cyan-300 text-white'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    ]"
                  >
                    M{{ idx + 1 }}
                  </button>
                  <button
                    v-if="platforms.length < 4"
                    type="button"
                    @click="addPlatform"
                    class="py-1.5 px-2.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    title="Añadir otra plataforma (máx. 4)"
                  >
                    +
                  </button>
                </div>

                <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs mb-3">
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model="activePlatform.name"
                      type="text"
                      maxlength="24"
                      class="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      v-if="platforms.length > 1"
                      type="button"
                      @click="removePlatform(activePlatform.id)"
                      class="px-2 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-200 text-xs cursor-pointer"
                      title="Eliminar plataforma"
                    >
                      ✕
                    </button>
                  </div>

                  <div>
                    <span class="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                      Forma de la plataforma
                    </span>
                    <div class="grid grid-cols-3 gap-1 text-[11px]">
                      <button
                        type="button"
                        @click="changePlatformShape(activePlatform, 'rect')"
                        :class="[
                          'py-1.5 rounded-lg border font-medium cursor-pointer',
                          activePlatform.shape === 'rect'
                            ? 'bg-cyan-600/80 border-cyan-400 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        ]"
                      >
                        ▣ Cuadrada
                      </button>
                      <button
                        type="button"
                        @click="changePlatformShape(activePlatform, 'circle')"
                        :class="[
                          'py-1.5 rounded-lg border font-medium cursor-pointer',
                          activePlatform.shape === 'circle'
                            ? 'bg-cyan-600/80 border-cyan-400 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        ]"
                      >
                        ◯ Circular
                      </button>
                      <button
                        type="button"
                        @click="changePlatformShape(activePlatform, 'polygon')"
                        :class="[
                          'py-1.5 rounded-lg border font-medium cursor-pointer',
                          activePlatform.shape === 'polygon'
                            ? 'bg-amber-600/85 border-amber-300 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        ]"
                      >
                        ⬡ Puntos
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="activePlatform.shape === 'polygon'"
                    class="bg-amber-950/35 border border-amber-500/40 rounded-lg p-2 space-y-1.5"
                  >
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-amber-200 font-medium">Cantidad de puntos</span>
                      <div class="flex items-center gap-1.5">
                        <button
                          type="button"
                          @click="setPolygonVertexCount(activePlatform, activePlatform.points.length - 1)"
                          class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                        >-</button>
                        <span class="font-bold text-amber-300 w-4 text-center">
                          {{ activePlatform.points.length }}
                        </span>
                        <button
                          type="button"
                          @click="setPolygonVertexCount(activePlatform, activePlatform.points.length + 1)"
                          class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                        >+</button>
                      </div>
                    </div>
                    <p class="text-[10px] text-amber-200/80 leading-tight">
                      Arrastra los pines dorados <strong>P1..P{{ activePlatform.points.length }}</strong> en el visor 3D.
                    </p>
                  </div>

                  <div>
                    <div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-slate-400">Elevación (≥ {{ ELEVATION_OVERLAP_THRESHOLD }} dif. permite solapar)</span>
                      <span class="font-semibold text-cyan-300">+{{ activePlatform.baseElevation }}</span>
                    </div>
                    <input
                      v-model.number="activePlatform.baseElevation"
                      @change="enforceAllPlatformCollisions(activePlatform.id)"
                      type="range"
                      min="0"
                      max="220"
                      step="5"
                      class="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-slate-400">Inclinación interna</span>
                      <span class="font-semibold text-cyan-300">{{ activePlatform.slope }}</span>
                    </div>
                    <input
                      v-model.number="activePlatform.slope"
                      type="range"
                      min="0"
                      max="120"
                      step="5"
                      class="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div v-if="activePlatform.shape !== 'polygon'" class="grid grid-cols-2 gap-2">
                    <div>
                      <div class="flex justify-between text-[10px] text-slate-400">
                        <span>Ancho</span>
                        <span>{{ activePlatform.width }}</span>
                      </div>
                      <input
                        v-model.number="activePlatform.width"
                        @input="enforceAllPlatformCollisions(activePlatform.id); clampAllSeatsOnPlatform(activePlatform.id)"
                        type="range"
                        min="160"
                        max="860"
                        step="20"
                        class="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div class="flex justify-between text-[10px] text-slate-400">
                        <span>Largo</span>
                        <span>{{ activePlatform.depth }}</span>
                      </div>
                      <input
                        v-model.number="activePlatform.depth"
                        @input="enforceAllPlatformCollisions(activePlatform.id); clampAllSeatsOnPlatform(activePlatform.id)"
                        type="range"
                        min="140"
                        max="740"
                        step="20"
                        class="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                    <label class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                      <span class="text-slate-400">Pos X</span>
                      <input
                        :value="activePlatform.x"
                        @change="(e) => handleMovePlatform({ id: activePlatform.id, x: Number(e.target.value), z: activePlatform.z })"
                        type="number"
                        step="20"
                        class="w-14 bg-transparent text-right text-slate-200 focus:outline-none"
                      />
                    </label>
                    <label class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                      <span class="text-slate-400">Pos Z</span>
                      <input
                        :value="activePlatform.z"
                        @change="(e) => handleMovePlatform({ id: activePlatform.id, x: activePlatform.x, z: Number(e.target.value) })"
                        type="number"
                        step="20"
                        class="w-14 bg-transparent text-right text-slate-200 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              </template>

              <!-- SUB-TAB 1C: CONFIGURAR PUNTO FOCAL -->
              <template v-else-if="step1SubTab === 'focal'">
                <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs mb-3">
                  <span class="block text-[10px] uppercase tracking-wider text-slate-400">
                    Tipo de Punto Focal
                  </span>
                  <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                    <button
                      type="button"
                      @click="focalPoint.type = 'screen'; focalPoint.label = 'Pantalla Principal'"
                      :class="[
                        'py-1.5 px-2 rounded-lg border font-medium cursor-pointer',
                        focalPoint.type === 'screen'
                          ? 'bg-indigo-600/90 border-indigo-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      🎬 Pantalla
                    </button>
                    <button
                      type="button"
                      @click="focalPoint.type = 'stage'; focalPoint.label = 'Escenario Central'"
                      :class="[
                        'py-1.5 px-2 rounded-lg border font-medium cursor-pointer',
                        focalPoint.type === 'stage'
                          ? 'bg-amber-600/90 border-amber-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      🎤 Tarima
                    </button>
                    <button
                      type="button"
                      @click="focalPoint.type = 'ring'; focalPoint.label = 'Cancha 360°'; focalPoint.x = 0; focalPoint.z = 0"
                      :class="[
                        'py-1.5 px-2 rounded-lg border font-medium cursor-pointer',
                        focalPoint.type === 'ring'
                          ? 'bg-emerald-600/90 border-emerald-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      🏟 Cancha 360°
                    </button>
                    <button
                      type="button"
                      @click="focalPoint.type = 'podium'; focalPoint.label = 'Podio Conferencia'"
                      :class="[
                        'py-1.5 px-2 rounded-lg border font-medium cursor-pointer',
                        focalPoint.type === 'podium'
                          ? 'bg-sky-600/90 border-sky-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      ]"
                    >
                      🎙 Podio
                    </button>
                  </div>

                  <div>
                    <label class="block text-[10px] text-slate-400 mb-1">Nombre / Etiqueta</label>
                    <input
                      v-model="focalPoint.label"
                      type="text"
                      maxlength="28"
                      class="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-slate-400">Tamaño / Ancho</span>
                      <span class="font-semibold text-amber-300">{{ focalPoint.width }}</span>
                    </div>
                    <input
                      v-model.number="focalPoint.width"
                      type="range"
                      min="140"
                      max="760"
                      step="20"
                      class="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                    <label class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                      <span class="text-slate-400">Foco X</span>
                      <input
                        v-model.number="focalPoint.x"
                        type="number"
                        step="20"
                        class="w-14 bg-transparent text-right text-slate-200 focus:outline-none"
                      />
                    </label>
                    <label class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                      <span class="text-slate-400">Foco Z</span>
                      <input
                        v-model.number="focalPoint.z"
                        type="number"
                        step="20"
                        class="w-14 bg-transparent text-right text-slate-200 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              </template>

              <button
                type="button"
                @click="goToStep(2)"
                class="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition cursor-pointer shadow"
              >
                Siguiente: Colocar Asientos →
              </button>
            </template>

            <!-- ==================== PASO 2: COLOCACIÓN DE ASIENTOS ==================== -->
            <template v-else-if="builderStep === 2">
              <div class="mb-2.5">
                <span class="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Plataforma activa para colocar asientos
                </span>
                <div :class="panelWindowState === 'maximized' ? 'grid grid-cols-2 gap-1.5' : 'flex gap-1'">
                  <button
                    v-for="(plat, idx) in platforms"
                    :key="plat.id"
                    type="button"
                    @click="activePlatformId = plat.id; if (isGridActive) rebuildGridForPlatform(plat.id)"
                    :class="[
                      'flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer truncate',
                      plat.id === activePlatformId
                        ? 'bg-cyan-600/90 border-cyan-300 text-white'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    ]"
                  >
                    M{{ idx + 1 }}: {{ plat.name }}
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-1.5 mb-2.5 text-[11px]">
                <button
                  type="button"
                  @click="builderType = 'free'; selectedSeatId = null; editingSeatId = null"
                  :class="[
                    'py-1.5 px-2 rounded-lg border font-medium transition cursor-pointer',
                    builderType === 'free'
                      ? 'bg-fuchsia-600/90 border-fuchsia-400 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  ]"
                >
                  ✦ Diseño Libre
                </button>
                <button
                  type="button"
                  @click="builderType = 'grid'; selectedSeatId = null; editingSeatId = null; rebuildGridForPlatform(activePlatformId)"
                  :class="[
                    'py-1.5 px-2 rounded-lg border font-medium transition cursor-pointer',
                    builderType === 'grid'
                      ? 'bg-indigo-600/90 border-indigo-400 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  ]"
                >
                  ⊞ Cuadrícula
                </button>
              </div>

              <template v-if="builderType === 'free'">
                <div class="space-y-1.5 mb-2.5">
                  <button
                    type="button"
                    @click="addFreeSeatAt({ platformId: activePlatformId, x: activePlatform.x, z: activePlatform.z })"
                    class="w-full py-1.5 px-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold transition cursor-pointer shadow"
                  >
                    + Añadir butaca en {{ activePlatform.name }}
                  </button>

                  <label class="flex items-center justify-between text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 cursor-pointer">
                    <span>Editar nombre con clic rápido</span>
                    <input
                      v-model="quickRenameOnClick"
                      type="checkbox"
                      class="accent-fuchsia-500 cursor-pointer"
                    />
                  </label>

                  <label class="flex items-center justify-between text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 cursor-pointer">
                    <span>Ajuste magnético (20px)</span>
                    <input
                      v-model="snapToGrid"
                      type="checkbox"
                      class="accent-fuchsia-500 cursor-pointer"
                    />
                  </label>
                </div>
              </template>

              <template v-else>
                <div class="grid grid-cols-2 gap-2 mb-2 text-xs">
                  <div class="bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1 flex items-center justify-between">
                    <span class="text-slate-400">Filas</span>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="resizeGrid(gridConfig.rows - 1, gridConfig.cols)"
                        class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                      >-</button>
                      <span class="font-bold w-3 text-center">{{ gridConfig.rows }}</span>
                      <button
                        type="button"
                        @click="resizeGrid(gridConfig.rows + 1, gridConfig.cols)"
                        class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                      >+</button>
                    </div>
                  </div>

                  <div class="bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1 flex items-center justify-between">
                    <span class="text-slate-400">Cols</span>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="resizeGrid(gridConfig.rows, gridConfig.cols - 1)"
                        class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                      >-</button>
                      <span class="font-bold w-4 text-center">{{ gridConfig.cols }}</span>
                      <button
                        type="button"
                        @click="resizeGrid(gridConfig.rows, gridConfig.cols + 1)"
                        class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                      >+</button>
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-1.5 text-[11px] mb-2">
                  <button
                    type="button"
                    @click="activeGridTool = 'available'"
                    :class="[
                      'py-1 px-2 rounded-lg border font-medium transition cursor-pointer',
                      activeGridTool === 'available'
                        ? 'bg-indigo-600/90 border-indigo-400 text-white'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    ]"
                  >+ Libre</button>
                  <button
                    type="button"
                    @click="activeGridTool = 'occupied'"
                    :class="[
                      'py-1 px-2 rounded-lg border font-medium transition cursor-pointer',
                      activeGridTool === 'occupied'
                        ? 'bg-amber-600/90 border-amber-400 text-white'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    ]"
                  >× Ocupado</button>
                  <button
                    type="button"
                    @click="activeGridTool = 'empty'"
                    :class="[
                      'py-1 px-2 rounded-lg border font-medium transition cursor-pointer',
                      activeGridTool === 'empty'
                        ? 'bg-slate-600 border-slate-400 text-white'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                    ]"
                  >␣ Espacio</button>
                </div>

                <div
                  class="grid gap-1 mb-2"
                  :style="{ gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))` }"
                >
                  <button
                    v-for="cell in gridConfig.cells"
                    :key="`${cell.row}-${cell.col}`"
                    type="button"
                    @mousedown.prevent="handleGridMouseDown(cell)"
                    @mouseenter="handleGridMouseEnter(cell)"
                    :class="[
                      'h-6 rounded text-[10px] font-bold transition border flex items-center justify-center cursor-pointer',
                      cell.status === 'empty'
                        ? 'bg-slate-950/50 border-dashed border-slate-700/80 text-slate-600'
                        : cell.status === 'occupied'
                          ? 'bg-amber-900/70 border-amber-500/70 text-amber-200'
                          : 'bg-indigo-600/70 border-indigo-400/80 text-white'
                    ]"
                  >
                    {{ cell.status === 'empty' ? '·' : '■' }}
                  </button>
                </div>

                <button
                  type="button"
                  @click="importGridToFree"
                  class="w-full mb-2.5 py-1.5 px-2.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/50 text-[11px] text-indigo-200 font-medium cursor-pointer"
                >
                  Fijar grilla en {{ activePlatform.name }} y pasar a Libre
                </button>
              </template>

              <!-- Inspector de la Butaca Seleccionada -->
              <div
                v-if="selectedSeat"
                class="bg-slate-950/85 border border-fuchsia-500/40 rounded-xl p-2.5 mb-2.5 space-y-2"
              >
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-semibold text-fuchsia-300">Editar butaca</span>
                  <span class="text-[10px] font-mono text-slate-400">
                    X: {{ selectedSeat.x }} | Z: {{ selectedSeat.z }}
                  </span>
                </div>

                <div class="flex items-center gap-1.5">
                  <input
                    v-if="!isGridActive"
                    v-model="selectedSeat.label"
                    type="text"
                    maxlength="10"
                    class="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-fuchsia-400"
                  />
                  <span
                    v-else
                    class="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-semibold"
                  >
                    {{ selectedSeat.label }}
                  </span>

                  <button
                    type="button"
                    @click="toggleSeatStatus(selectedSeat)"
                    :class="[
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer shrink-0',
                      selectedSeat.status === 'available'
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                    ]"
                  >
                    {{ selectedSeat.status === 'available' ? 'Libre' : 'Ocupado' }}
                  </button>
                </div>

                <div v-if="!isGridActive && platforms.length > 1" class="text-[11px]">
                  <select
                    :value="selectedSeat.platformId"
                    @change="(e) => reassignSeatPlatform(selectedSeat, e.target.value)"
                    class="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 cursor-pointer"
                  >
                    <option v-for="(p, i) in platforms" :key="p.id" :value="p.id">
                      M{{ i + 1 }}: {{ p.name }} (+{{ p.baseElevation }})
                    </option>
                  </select>
                </div>

                <div class="flex items-center gap-1.5">
                  <button
                    v-if="!isGridActive"
                    type="button"
                    @click="duplicateSelectedSeat"
                    class="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 cursor-pointer"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    @click="removeSeat(selectedSeat)"
                    class="flex-1 py-1 px-2 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-[11px] text-red-200 cursor-pointer"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-1.5 pt-2 border-t border-slate-700/60 text-[11px]">
                <button
                  type="button"
                  @click="goToStep(1)"
                  class="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                >
                  ← Paso 1
                </button>
                <button
                  type="button"
                  @click="clearCurrentSeats"
                  class="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-red-950/80 border border-slate-700 text-slate-300 hover:text-red-200 cursor-pointer"
                >
                  Vaciar
                </button>
                <button
                  type="button"
                  @click="goToStep(3)"
                  class="flex-1 py-1.5 px-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold cursor-pointer"
                >
                  Paso 3: Guardar →
                </button>
              </div>
            </template>

            <!-- ==================== PASO 3: GUARDAR LAYOUT EN LOCALSTORAGE ==================== -->
            <template v-else>
              <div class="space-y-3 mb-3 text-xs">
                <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-2">
                  <label class="block text-[10px] uppercase tracking-wider text-slate-400">
                    Nombre del Layout
                  </label>
                  <input
                    v-model="layoutName"
                    type="text"
                    maxlength="32"
                    placeholder="Ej. Estadio Ovalado 360"
                    class="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-400"
                  />

                  <div class="grid grid-cols-3 gap-1.5 pt-1 text-center text-[11px]">
                    <div class="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span class="block text-[10px] text-slate-400">Módulos</span>
                      <strong class="text-cyan-300">{{ platforms.length }}/4</strong>
                    </div>
                    <div class="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span class="block text-[10px] text-slate-400">Butacas</span>
                      <strong class="text-white">{{ currentSeats.length }}</strong>
                    </div>
                    <div class="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span class="block text-[10px] text-slate-400">Recinto</span>
                      <strong class="text-emerald-300 truncate block px-1">{{ venueConfig.shape }}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    @click="saveLayoutToStorage"
                    class="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer shadow"
                  >
                    💾 Guardar Layout en LocalStorage
                  </button>
                </div>

                <div class="space-y-1.5">
                  <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                    <span>Layouts guardados ({{ savedLayouts.length }})</span>
                    <button
                      type="button"
                      @click="initDefaultDraft(); builderStep = 1"
                      class="text-indigo-400 hover:underline font-semibold cursor-pointer normal-case"
                    >
                      + Nuevo
                    </button>
                  </div>

                  <div
                    v-if="savedLayouts.length === 0"
                    class="text-[11px] text-slate-500 bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5 text-center"
                  >
                    Aún no hay layouts guardados.
                  </div>

                  <div v-else class="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                    <div
                      v-for="item in savedLayouts"
                      :key="item.id"
                      :class="[
                        'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px]',
                        activeLayoutId === item.id
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300'
                      ]"
                    >
                      <button
                        type="button"
                        @click="loadLayout(item)"
                        class="text-left flex-1 truncate cursor-pointer"
                      >
                        <span class="block font-semibold truncate">{{ item.name }}</span>
                        <span class="block text-[10px] text-slate-400">
                          {{ item.platformsCount }} módulos • {{ item.seatsCount }} asientos
                        </span>
                      </button>

                      <button
                        type="button"
                        @click="deleteLayout(item.id)"
                        class="px-1.5 py-0.5 rounded text-slate-400 hover:text-red-400 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 pt-2 border-t border-slate-700/60 text-[11px]">
                <button
                  type="button"
                  @click="goToStep(2)"
                  class="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                >
                  ← Paso 2
                </button>
                <button
                  type="button"
                  @click="switchMode('preview')"
                  class="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                >
                  Probar Vista 360° →
                </button>
              </div>
            </template>
          </template>

          <!-- ==================== MODO PROBAR VISTA 3D / 360° ==================== -->
          <template v-else>
            <div v-if="savedLayouts.length > 0" class="mb-2.5">
              <label class="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                Layout cargado
              </label>
              <select
                :value="activeLayoutId || ''"
                @change="(e) => {
                  const found = savedLayouts.find((l) => l.id === e.target.value);
                  if (found) loadLayout(found);
                }"
                class="w-full px-2.5 py-1.5 rounded-xl bg-slate-950/90 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                <option v-if="!activeLayoutId" value="">Borrador actual ({{ layoutName }})</option>
                <option v-for="l in savedLayouts" :key="l.id" :value="l.id">
                  {{ l.name }} ({{ l.seatsCount }} asientos)
                </option>
              </select>
            </div>

            <!-- Control de color de paredes dentro de Vista 360° -->
            <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5 mb-2.5 space-y-1.5">
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-slate-300 font-medium">Color de paredes (360°)</span>
                <span class="text-[10px] font-mono text-slate-400 uppercase">{{ venueConfig.wallColor }}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  v-for="preset in WALL_COLOR_PRESETS"
                  :key="preset.value"
                  type="button"
                  @click="venueConfig.wallColor = preset.value"
                  :title="preset.name"
                  :class="[
                    'w-5 h-5 rounded-full border transition cursor-pointer',
                    venueConfig.wallColor.toLowerCase() === preset.value.toLowerCase()
                      ? 'border-white scale-110 ring-2 ring-emerald-400/70'
                      : 'border-slate-600 hover:border-white'
                  ]"
                  :style="{ backgroundColor: preset.value }"
                ></button>
                <label
                  title="Selector de color libre"
                  class="ml-auto px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <span>Otro</span>
                  <input
                    v-model="venueConfig.wallColor"
                    type="color"
                    class="w-4 h-4 bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <p class="text-[11px] text-slate-400 mb-2">
              <template v-if="selectedSeat">
                Sentado en <strong class="text-emerald-400">{{ selectedSeat.label }}</strong> mirando hacia <strong>{{ focalPoint.label }}</strong>:
              </template>
              <template v-else>
                Selecciona una butaca para entrar en vista 360°:
              </template>
            </p>

            <div
              :class="[
                'max-h-40 overflow-y-auto pr-1 grid gap-1.5 mb-3',
                panelWindowState === 'maximized' ? 'grid-cols-4' : 'grid-cols-3'
              ]"
            >
              <button
                v-for="seat in currentSeats"
                :key="seat.id"
                type="button"
                :disabled="seat.status === 'occupied'"
                @click="handleSelectSeat(seat)"
                :class="[
                  'py-1.5 px-2 rounded-lg text-[11px] font-semibold transition border truncate',
                  seat.status === 'occupied'
                    ? 'bg-slate-800/40 border-slate-700/50 text-slate-500 cursor-not-allowed'
                    : selectedSeat?.id === seat.id
                      ? 'bg-emerald-500 border-emerald-300 text-slate-950 shadow-md shadow-emerald-500/25'
                      : 'bg-slate-800/80 border-slate-600/70 text-slate-200 hover:bg-indigo-600/80 hover:border-indigo-400 cursor-pointer'
                ]"
              >
                {{ seat.label }}
              </button>
            </div>

            <button
              v-if="selectedSeat"
              type="button"
              @click="selectedSeatId = null"
              class="mt-2 w-full py-2 px-3 rounded-xl bg-slate-800/90 hover:bg-indigo-600 border border-slate-600/80 hover:border-indigo-400 text-xs font-semibold text-slate-100 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>↑</span>
              <span>Volver a vista general</span>
            </button>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>