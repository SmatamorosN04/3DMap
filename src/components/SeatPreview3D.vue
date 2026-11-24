<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({
  venueConfig: {
    type: Object,
    required: true
  },
  platforms: {
    type: Array,
    required: true
  },
  activePlatformId: {
    type: String,
    required: true
  },
  seats: {
    type: Array,
    required: true
  },
  focalPoint: {
    type: Object,
    required: true
  },
  selectedSeat: {
    type: Object,
    default: null
  },
  editingSeatId: {
    type: String,
    default: null
  },
  wallPresets: {
    type: Array,
    default: () => []
  },
  mode: {
    type: String,
    default: 'build'
  },
  builderStep: {
    type: Number,
    default: 1
  },
  step1SubTab: {
    type: String,
    default: 'venue'
  },
  builderType: {
    type: String,
    default: 'free'
  },
  gridPlaceholders: {
    type: Array,
    default: () => []
  },
  snapToGrid: {
    type: Boolean,
    default: false
  },
  collisionFeedback: {
    type: Object,
    default: () => ({ venue: false, platform: false, multilevel: false })
  }
});

const emit = defineEmits([
  'move-venue-vertex',
  'update-wall-color',
  'select-platform',
  'move-platform',
  'move-polygon-vertex',
  'select-seat',
  'quick-click-seat',
  'finish-seat-rename',
  'paint-grid-cell',
  'move-free-seat',
  'add-free-seat-at'
]);

const PERSPECTIVE = 1000;
const SCENE_Z_OFFSET = 900;
const FLOOR_Y = 130;
const ROOM_HEIGHT = 320;
const AERIAL_TARGET_Y = 20;
const POLY_CANVAS_SIZE = 1800;

// --- CÁMARA ORBITAL ---
const freeCameraEnabled = ref(false);
const orbitYaw = ref(0);
const orbitPitch = ref(-50);
const orbitZoom = ref(-180);

// --- CÁMARA 360° ---
const headYaw = ref(0);
const headPitch = ref(4);
const baseSeatYaw = ref(0);

const stageRef = ref(null);
const quickInputRef = ref(null);
const dragSession = ref(null);
let pendingPointerEvent = null;
let rafId = null;

const PLATFORM_THEMES = [
  {
    border: 'border-cyan-400/75',
    activeBorder: 'border-cyan-300 ring-2 ring-cyan-400/40',
    bg: 'rgba(14, 116, 144, 0.28)',
    wall: 'bg-cyan-950/85 border-cyan-500/40',
    badge: 'bg-cyan-950/90 text-cyan-200 border-cyan-400/70'
  },
  {
    border: 'border-indigo-400/75',
    activeBorder: 'border-indigo-300 ring-2 ring-indigo-400/40',
    bg: 'rgba(67, 56, 202, 0.28)',
    wall: 'bg-indigo-950/85 border-indigo-500/40',
    badge: 'bg-indigo-950/90 text-indigo-200 border-indigo-400/70'
  },
  {
    border: 'border-fuchsia-400/75',
    activeBorder: 'border-fuchsia-300 ring-2 ring-fuchsia-400/40',
    bg: 'rgba(162, 28, 175, 0.26)',
    wall: 'bg-fuchsia-950/85 border-fuchsia-500/40',
    badge: 'bg-fuchsia-950/90 text-fuchsia-200 border-fuchsia-400/70'
  },
  {
    border: 'border-amber-400/75',
    activeBorder: 'border-amber-300 ring-2 ring-amber-400/40',
    bg: 'rgba(180, 83, 9, 0.26)',
    wall: 'bg-amber-950/85 border-amber-500/40',
    badge: 'bg-amber-950/90 text-amber-200 border-amber-400/70'
  }
];

const SEAT_THEMES = {
  selected: {
    backrest: 'from-emerald-500 via-emerald-600 to-emerald-800 border-emerald-300',
    headrest: 'bg-emerald-400 border-emerald-200',
    cushion: 'from-emerald-400 to-emerald-600 border-emerald-200',
    badge: 'bg-emerald-950/90 text-emerald-200 border-emerald-400/80'
  },
  occupiedBuild: {
    backrest: 'from-amber-700 via-amber-800 to-amber-950 border-amber-400/80',
    headrest: 'bg-amber-600 border-amber-300/80',
    cushion: 'from-amber-600 to-amber-800 border-amber-400/70',
    badge: 'bg-amber-950/90 text-amber-200 border-amber-500/70'
  },
  occupiedPreview: {
    backrest: 'from-slate-700 via-slate-800 to-slate-900 border-slate-600',
    headrest: 'bg-slate-600 border-slate-500',
    cushion: 'from-slate-600 to-slate-800 border-slate-500',
    badge: 'bg-slate-900/90 text-slate-400 border-slate-700'
  },
  available: {
    backrest: 'from-rose-600 via-red-700 to-rose-950 border-rose-400/80 group-hover:from-rose-500 group-hover:to-red-800',
    headrest: 'bg-rose-500 border-rose-300/80',
    cushion: 'from-rose-500 to-red-700 border-rose-300/70',
    badge: 'bg-slate-950/85 text-white border-rose-400/60'
  }
};

const platformsMap = computed(() => {
  const map = new Map();
  for (let i = 0; i < props.platforms.length; i++) {
    map.set(props.platforms[i].id, props.platforms[i]);
  }
  return map;
});

function getPlatformById(id) {
  return platformsMap.value.get(id) || props.platforms[0];
}

function getSeatWorldY(seat) {
  const plat = getPlatformById(seat.platformId);
  if (!plat) return FLOOR_Y - 26;

  const topY = FLOOR_Y - plat.baseElevation;
  if (!plat.slope || plat.slope <= 0) {
    return topY - 26;
  }

  const localZ = seat.z - plat.z;
  const halfD = Math.max(60, plat.depth / 2);
  const focalIsBehind = props.focalPoint.z > plat.z + halfD;
  const ratio = focalIsBehind
    ? Math.min(1, Math.max(0, (halfD - localZ) / (2 * halfD)))
    : Math.min(1, Math.max(0, (localZ + halfD) / (2 * halfD)));

  return topY - 26 - ratio * plat.slope;
}

const isSeated360 = computed(() => props.mode === 'preview' && Boolean(props.selectedSeat));

// --- ENFOQUE AUTOMÁTICO AL EDITAR NOMBRE DE SILLA ---
const editingSeatObj = computed(() => {
  if (!props.editingSeatId || props.mode !== 'build' || props.builderStep !== 2) return null;
  return props.seats.find((s) => s.id === props.editingSeatId) || null;
});

watch(
  () => props.editingSeatId,
  async (newId) => {
    if (!newId) return;
    await nextTick();
    if (quickInputRef.value) {
      quickInputRef.value.focus();
      quickInputRef.value.select();
    }
  }
);

// Proyección exacta 3D -> 2D para posicionar el editor flotante justo sobre la silla
function worldToScreen(wx, wy, wz) {
  const stageW = stageRef.value?.clientWidth || 960;
  const stageH = stageRef.value?.clientHeight || 670;

  const yawRad = (orbitYaw.value * Math.PI) / 180;
  const pitchRad = (orbitPitch.value * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  const y0 = wy - AERIAL_TARGET_Y;
  const xCam = wx * cosY + wz * sinY;
  const zAfterY = -wx * sinY + wz * cosY;
  const yCam = y0 * cosP - zAfterY * sinP;
  const zCam = y0 * sinP + zAfterY * cosP + orbitZoom.value;

  const denom = Math.max(120, PERSPECTIVE - zCam);
  const scale = PERSPECTIVE / denom;

  const rawX = stageW / 2 + xCam * scale;
  const rawY = stageH / 2 + yCam * scale;

  return {
    left: Math.round(Math.min(stageW - 95, Math.max(95, rawX))),
    top: Math.round(Math.min(stageH - 60, Math.max(58, rawY)))
  };
}

const quickEditPopoverStyle = computed(() => {
  const seat = editingSeatObj.value;
  if (!seat) return { display: 'none' };
  const seatTopY = getSeatWorldY(seat) - 44;
  const pos = worldToScreen(seat.x, seatTopY, seat.z);
  return {
    left: `${pos.left}px`,
    top: `${pos.top}px`
  };
});

// --- PRE-CÁLCULO MEMOIZADO DE ASIENTOS ---
const renderedSeats = computed(() => {
  const fx = props.focalPoint.x;
  const fz = props.focalPoint.z;
  const selId = props.selectedSeat?.id;
  const editId = props.editingSeatId;
  const isBuild = props.mode === 'build';
  const seated = isSeated360.value;

  return props.seats.map((seat) => {
    const worldY = Math.round(getSeatWorldY(seat));
    const dx = fx - seat.x;
    const dz = fz - seat.z;
    const facingYaw = Math.round(Math.atan2(-dx, -dz) * (180 / Math.PI));

    let theme = SEAT_THEMES.available;
    if (selId === seat.id) {
      theme = SEAT_THEMES.selected;
    } else if (seat.status === 'occupied') {
      theme = isBuild ? SEAT_THEMES.occupiedBuild : SEAT_THEMES.occupiedPreview;
    }

    return {
      ...seat,
      worldY,
      facingYaw,
      theme,
      isSelected: selId === seat.id,
      isEditing: editId === seat.id,
      transform: `translate3d(${seat.x}px, ${worldY}px, ${seat.z + SCENE_Z_OFFSET}px) rotateY(${facingYaw}deg)`,
      badgeTransform: seated
        ? 'translate3d(0px, -6px, 8px)'
        : 'translate3d(0px, -6px, 8px) rotateX(38deg)'
    };
  });
});

// --- PRE-CÁLCULO MEMOIZADO DE ESCENARIO Y PAREDES ---
function getPolygonClipPath(points) {
  if (!points || points.length < 3) return 'none';
  const half = POLY_CANVAS_SIZE / 2;
  const coords = points
    .map((pt) => {
      const px = (((pt.x + half) / POLY_CANVAS_SIZE) * 100).toFixed(2);
      const py = (((pt.z + half) / POLY_CANVAS_SIZE) * 100).toFixed(2);
      return `${px}% ${py}%`;
    })
    .join(', ');
  return `polygon(${coords})`;
}

function buildPerimeterWalls(shape, width, depth, points, wallHeight, baseTopY, offsetX = 0, offsetZ = 0, ellipseSegments = 24) {
  const h = Math.max(12, wallHeight);

  if (shape === 'rect') {
    const hw = width / 2;
    const hd = depth / 2;
    const raw = [
      { key: 'n', x: 0, z: -hd, len: width, angle: 0 },
      { key: 's', x: 0, z: hd, len: width, angle: 180 },
      { key: 'w', x: -hw, z: 0, len: depth, angle: 90 },
      { key: 'e', x: hw, z: 0, len: depth, angle: -90 }
    ];
    return raw.map((s) => ({
      key: s.key,
      style: {
        width: `${s.len}px`,
        height: `${h}px`,
        left: `${-s.len / 2}px`,
        top: `${baseTopY}px`,
        transform: `translate3d(${offsetX + s.x}px, 0px, ${offsetZ + s.z + SCENE_Z_OFFSET}px) rotateY(${s.angle}deg)`
      }
    }));
  }

  if (shape === 'circle' || shape === 'oval') {
    const rx = width / 2;
    const rz = depth / 2;
    const list = [];
    for (let i = 0; i < ellipseSegments; i++) {
      const a1 = (i / ellipseSegments) * Math.PI * 2;
      const a2 = ((i + 1) / ellipseSegments) * Math.PI * 2;
      const x1 = Math.cos(a1) * rx;
      const z1 = Math.sin(a1) * rz;
      const x2 = Math.cos(a2) * rx;
      const z2 = Math.sin(a2) * rz;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz) + 2;
      const angle = Math.atan2(-dz, dx) * (180 / Math.PI);
      list.push({
        key: `e-${i}`,
        style: {
          width: `${len}px`,
          height: `${h}px`,
          left: `${-len / 2}px`,
          top: `${baseTopY}px`,
          transform: `translate3d(${offsetX + (x1 + x2) / 2}px, 0px, ${offsetZ + (z1 + z2) / 2 + SCENE_Z_OFFSET}px) rotateY(${angle}deg)`
        }
      });
    }
    return list;
  }

  const pts = points || [];
  const list = [];
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.hypot(dx, dz) + 1.5;
    const angle = Math.atan2(-dz, dx) * (180 / Math.PI);
    list.push({
      key: `p-${i}`,
      style: {
        width: `${len}px`,
        height: `${h}px`,
        left: `${-len / 2}px`,
        top: `${baseTopY}px`,
        transform: `translate3d(${offsetX + (p1.x + p2.x) / 2}px, 0px, ${offsetZ + (p1.z + p2.z) / 2 + SCENE_Z_OFFSET}px) rotateY(${angle}deg)`
      }
    });
  }
  return list;
}

const activeWallColor = computed(() => props.venueConfig.wallColor || '#090d16');

const venueWallSegments = computed(() => {
  const v = props.venueConfig;
  const wallH = isSeated360.value ? ROOM_HEIGHT : 32;
  const baseSegs = buildPerimeterWalls(v.shape, v.width, v.depth, v.points, wallH, FLOOR_Y - wallH, 0, 0, 32);
  const bg = activeWallColor.value;

  return baseSegs.map((seg) => ({
    ...seg,
    style: isSeated360.value
      ? {
          ...seg.style,
          backgroundColor: bg,
          backgroundImage: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.34) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.16)'
        }
      : seg.style
  }));
});

const venueFloorStyle = computed(() => {
  const v = props.venueConfig;
  if (v.shape === 'polygon') {
    return {
      width: `${POLY_CANVAS_SIZE}px`,
      height: `${POLY_CANVAS_SIZE}px`,
      left: `${-POLY_CANVAS_SIZE / 2}px`,
      top: `${-POLY_CANVAS_SIZE / 2}px`,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      clipPath: getPolygonClipPath(v.points),
      transform: `translate3d(0px, ${FLOOR_Y}px, ${SCENE_Z_OFFSET}px) rotateX(90deg)`,
      backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.16) 1px, transparent 1px)',
      backgroundSize: '28px 28px'
    };
  }
  return {
    width: `${v.width}px`,
    height: `${v.depth}px`,
    left: `${-v.width / 2}px`,
    top: `${-v.depth / 2}px`,
    transform: `translate3d(0px, ${FLOOR_Y}px, ${SCENE_Z_OFFSET}px) rotateX(90deg)`,
    backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.16) 1px, transparent 1px)',
    backgroundSize: '28px 28px'
  };
});

const renderedPlatforms = computed(() => {
  return props.platforms.map((plat, pIndex) => {
    const theme = PLATFORM_THEMES[pIndex % PLATFORM_THEMES.length];
    const topY = FLOOR_Y - plat.baseElevation;

    const surfaceStyle =
      plat.shape === 'polygon'
        ? {
            width: `${POLY_CANVAS_SIZE}px`,
            height: `${POLY_CANVAS_SIZE}px`,
            left: `${-POLY_CANVAS_SIZE / 2}px`,
            top: `${-POLY_CANVAS_SIZE / 2}px`,
            backgroundColor: theme.bg,
            clipPath: getPolygonClipPath(plat.points),
            transform: `translate3d(${plat.x}px, ${topY}px, ${plat.z + SCENE_Z_OFFSET}px) rotateX(90deg)`
          }
        : {
            width: `${plat.width}px`,
            height: `${plat.depth}px`,
            left: `${-plat.width / 2}px`,
            top: `${-plat.depth / 2}px`,
            backgroundColor: theme.bg,
            transform: `translate3d(${plat.x}px, ${topY}px, ${plat.z + SCENE_Z_OFFSET}px) rotateX(90deg)`
          };

    const walls = buildPerimeterWalls(
      plat.shape,
      plat.width,
      plat.depth,
      plat.points,
      plat.baseElevation,
      topY,
      plat.x,
      plat.z,
      20
    );

    const handleStyle = {
      left: '-45px',
      top: '-12px',
      transform: `translate3d(${plat.x}px, ${topY - 16}px, ${plat.z + SCENE_Z_OFFSET}px) rotateX(35deg)`
    };

    const vertices =
      plat.shape === 'polygon'
        ? (plat.points || []).map((pt, vIdx) => ({
            vIdx,
            x: pt.x,
            z: pt.z,
            pinStyle: {
              transform: `translate3d(${plat.x + pt.x}px, ${topY - 24}px, ${plat.z + pt.z + SCENE_Z_OFFSET}px)`
            },
            dotStyle: {
              transform: `translate3d(${plat.x + pt.x}px, ${topY}px, ${plat.z + pt.z + SCENE_Z_OFFSET}px) rotateX(90deg)`
            },
            btnStyle: {
              transform: `translate3d(${plat.x + pt.x}px, ${topY - 24}px, ${plat.z + pt.z + SCENE_Z_OFFSET}px) rotateX(35deg)`
            }
          }))
        : [];

    return {
      raw: plat,
      theme,
      surfaceStyle,
      walls,
      handleStyle,
      vertices
    };
  });
});

watch(
  () => props.mode,
  (newMode) => {
    if (newMode === 'preview') {
      freeCameraEnabled.value = true;
    }
  }
);

watch(
  () => props.selectedSeat?.id,
  (newId) => {
    if (!newId || props.mode !== 'preview' || !props.selectedSeat) return;
    const eyeX = props.selectedSeat.x;
    const eyeY = getSeatWorldY(props.selectedSeat) - 42;
    const eyeZ = props.selectedSeat.z;

    const dx = props.focalPoint.x - eyeX;
    const dy = (FLOOR_Y - 75) - eyeY;
    const dz = props.focalPoint.z - eyeZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const yawToFocal = Math.round(Math.atan2(dx, -dz) * (180 / Math.PI));
    baseSeatYaw.value = yawToFocal;
    headYaw.value = yawToFocal;
    headPitch.value = Math.round(Math.min(35, Math.max(-35, Math.atan2(-dy, dist) * (180 / Math.PI))));
  }
);

function screenToWorldPlane(clientX, clientY, targetY = FLOOR_Y) {
  if (!stageRef.value) return { x: 0, z: 0 };
  const rect = stageRef.value.getBoundingClientRect();
  const sx = clientX - (rect.left + rect.width / 2);
  const sy = clientY - (rect.top + rect.height / 2);

  const yawRad = (orbitYaw.value * Math.PI) / 180;
  const pitchRad = (orbitPitch.value * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  const y0 = targetY - AERIAL_TARGET_Y;
  const u = sx / PERSPECTIVE;
  const v = sy / PERSPECTIVE;
  const K = v * cosP - sinP;

  const a1 = cosY - u * sinY * cosP;
  const b1 = sinY + u * cosY * cosP;
  const c1 = sx - u * orbitZoom.value - u * y0 * sinP;

  const a2 = -K * sinY;
  const b2 = K * cosY;
  const c2 = sy - v * orbitZoom.value - y0 * (cosP + v * sinP);

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-5) {
    return { x: 0, z: 0 };
  }

  return {
    x: (c1 * b2 - c2 * b1) / det,
    z: (a1 * c2 - a2 * c1) / det
  };
}

const canPlaceFreeSeats = computed(
  () => props.mode === 'build' && props.builderStep === 2 && props.builderType === 'free'
);

// --- MANEJO DE ARRASTRE ---
function handleVenueVertexPointerDown(e, vertexIndex) {
  if (props.mode !== 'build' || props.builderStep !== 1 || props.step1SubTab !== 'venue') return;
  e.stopPropagation();

  const startWorld = screenToWorldPlane(e.clientX, e.clientY, FLOOR_Y);
  const pt = props.venueConfig.points[vertexIndex];

  dragSession.value = {
    type: 'venue-vertex',
    vertexIndex,
    planeY: FLOOR_Y,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startWorldX: startWorld.x,
    startWorldZ: startWorld.z,
    initialPtX: pt.x,
    initialPtZ: pt.z,
    moved: true
  };

  stageRef.value?.setPointerCapture(e.pointerId);
}

function handlePlatformVertexPointerDown(e, plat, vertexIndex) {
  if (
    props.mode !== 'build' ||
    props.builderStep !== 1 ||
    props.step1SubTab !== 'platforms' ||
    plat.id !== props.activePlatformId
  ) {
    return;
  }
  e.stopPropagation();

  const topY = FLOOR_Y - plat.baseElevation;
  const startWorld = screenToWorldPlane(e.clientX, e.clientY, topY);
  const pt = plat.points[vertexIndex];

  dragSession.value = {
    type: 'platform-vertex',
    platformId: plat.id,
    vertexIndex,
    planeY: topY,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startWorldX: startWorld.x,
    startWorldZ: startWorld.z,
    initialPtX: pt.x,
    initialPtZ: pt.z,
    moved: true
  };

  stageRef.value?.setPointerCapture(e.pointerId);
}

function handlePlatformHandlePointerDown(e, plat) {
  if (props.mode !== 'build' || props.builderStep !== 1) return;
  e.stopPropagation();
  emit('select-platform', plat.id);

  const topY = FLOOR_Y - plat.baseElevation;
  const startWorld = screenToWorldPlane(e.clientX, e.clientY, topY);

  dragSession.value = {
    type: 'platform',
    platformId: plat.id,
    planeY: topY,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startWorldX: startWorld.x,
    startWorldZ: startWorld.z,
    initialPlatX: plat.x,
    initialPlatZ: plat.z,
    moved: false
  };

  stageRef.value?.setPointerCapture(e.pointerId);
}

function handleSeatPointerDown(e, seat) {
  if (!canPlaceFreeSeats.value) return;
  e.stopPropagation();

  const seatPlaneY = getSeatWorldY(seat);
  const startWorld = screenToWorldPlane(e.clientX, e.clientY, seatPlaneY);

  dragSession.value = {
    type: 'seat',
    seatId: seat.id,
    platformId: seat.platformId,
    planeY: seatPlaneY,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startWorldX: startWorld.x,
    startWorldZ: startWorld.z,
    initialSeatX: seat.x,
    initialSeatZ: seat.z,
    moved: false
  };

  stageRef.value?.setPointerCapture(e.pointerId);
}

function handleStagePointerDown(e) {
  if (e.target.closest('[data-hud="true"]')) return;

  // Si hay un editor rápido de nombre abierto y se hace clic fuera, cerrarlo
  if (props.editingSeatId) {
    emit('finish-seat-rename');
  }

  const isFirstPerson = props.mode === 'preview' && Boolean(props.selectedSeat);

  if (!isFirstPerson && !freeCameraEnabled.value) {
    dragSession.value = {
      type: 'click-only',
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false
    };
    return;
  }

  dragSession.value = {
    type: isFirstPerson ? 'look360' : 'orbit',
    startClientX: e.clientX,
    startClientY: e.clientY,
    initialYaw: isFirstPerson ? headYaw.value : orbitYaw.value,
    initialPitch: isFirstPerson ? headPitch.value : orbitPitch.value,
    moved: false
  };

  stageRef.value?.setPointerCapture(e.pointerId);
}

function handleStagePointerMove(e) {
  if (!dragSession.value) return;
  pendingPointerEvent = { clientX: e.clientX, clientY: e.clientY };

  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (!dragSession.value || !pendingPointerEvent) return;
    processDragMove(pendingPointerEvent.clientX, pendingPointerEvent.clientY);
  });
}

function processDragMove(clientX, clientY) {
  const session = dragSession.value;
  if (!session) return;

  const dx = clientX - session.startClientX;
  const dy = clientY - session.startClientY;

  // Umbral de 6px para diferenciar un clic rápido de un arrastre
  if (!session.moved && Math.hypot(dx, dy) > 6) {
    session.moved = true;
    if (props.editingSeatId) {
      emit('finish-seat-rename');
    }
  }
  if (!session.moved) return;

  if (session.type === 'venue-vertex') {
    const curr = screenToWorldPlane(clientX, clientY, session.planeY);
    let nx = session.initialPtX + (curr.x - session.startWorldX);
    let nz = session.initialPtZ + (curr.z - session.startWorldZ);
    if (props.snapToGrid) {
      nx = Math.round(nx / 20) * 20;
      nz = Math.round(nz / 20) * 20;
    }
    emit('move-venue-vertex', {
      vertexIndex: session.vertexIndex,
      x: Math.round(Math.min(820, Math.max(-820, nx))),
      z: Math.round(Math.min(820, Math.max(-820, nz)))
    });
  } else if (session.type === 'platform-vertex') {
    const curr = screenToWorldPlane(clientX, clientY, session.planeY);
    let nx = session.initialPtX + (curr.x - session.startWorldX);
    let nz = session.initialPtZ + (curr.z - session.startWorldZ);
    if (props.snapToGrid) {
      nx = Math.round(nx / 20) * 20;
      nz = Math.round(nz / 20) * 20;
    }
    emit('move-polygon-vertex', {
      platformId: session.platformId,
      vertexIndex: session.vertexIndex,
      x: Math.round(Math.min(650, Math.max(-650, nx))),
      z: Math.round(Math.min(650, Math.max(-650, nz)))
    });
  } else if (session.type === 'platform') {
    const curr = screenToWorldPlane(clientX, clientY, session.planeY);
    let nx = session.initialPlatX + (curr.x - session.startWorldX);
    let nz = session.initialPlatZ + (curr.z - session.startWorldZ);
    if (props.snapToGrid) {
      nx = Math.round(nx / 20) * 20;
      nz = Math.round(nz / 20) * 20;
    }
    emit('move-platform', {
      id: session.platformId,
      x: Math.round(nx),
      z: Math.round(nz)
    });
  } else if (session.type === 'seat') {
    const curr = screenToWorldPlane(clientX, clientY, session.planeY);
    emit('move-free-seat', {
      id: session.seatId,
      x: Math.round(session.initialSeatX + (curr.x - session.startWorldX)),
      z: Math.round(session.initialSeatZ + (curr.z - session.startWorldZ))
    });
  } else if (session.type === 'orbit') {
    orbitYaw.value = Math.round((session.initialYaw + dx * 0.35) % 360);
    orbitPitch.value = Math.round(
      Math.min(-10, Math.max(-88, session.initialPitch - dy * 0.3))
    );
  } else if (session.type === 'look360') {
    let nextYaw = (session.initialYaw + dx * 0.38) % 360;
    if (nextYaw > 180) nextYaw -= 360;
    if (nextYaw < -180) nextYaw += 360;
    headYaw.value = Math.round(nextYaw);
    headPitch.value = Math.round(
      Math.min(55, Math.max(-45, session.initialPitch + dy * 0.3))
    );
  }
}

function handleStagePointerUp(e) {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!dragSession.value) return;
  const session = dragSession.value;

  if (stageRef.value?.hasPointerCapture(e.pointerId)) {
    stageRef.value.releasePointerCapture(e.pointerId);
  }

  if (!session.moved && (session.type === 'click-only' || session.type === 'orbit')) {
    const platEl = e.target.closest('[data-platform-id]');
    if (platEl) {
      const platId = platEl.dataset.platformId;
      emit('select-platform', platId);

      if (canPlaceFreeSeats.value) {
        const plat = getPlatformById(platId);
        const topY = FLOOR_Y - (plat?.baseElevation || 0);
        const pos = screenToWorldPlane(e.clientX, e.clientY, topY);
        emit('add-free-seat-at', {
          platformId: platId,
          x: Math.round(pos.x),
          z: Math.round(pos.z)
        });
      }
    }
  }

  setTimeout(() => {
    dragSession.value = null;
  }, 15);
}

function handleWheel(e) {
  if (!freeCameraEnabled.value || isSeated360.value) return;
  e.preventDefault();
  orbitZoom.value = Math.min(280, Math.max(-720, orbitZoom.value - e.deltaY * 0.45));
}

function handleSeatClick(e, seat) {
  e.stopPropagation();
  if (dragSession.value?.moved) return;

  if (props.mode === 'build') {
    if (props.builderStep !== 2) return;
    emit('select-platform', seat.platformId);
    if (props.builderType === 'grid') {
      emit('paint-grid-cell', seat);
    } else {
      emit('quick-click-seat', seat);
    }
    return;
  }

  if (seat.status === 'occupied') return;
  emit('select-seat', seat);
}

function setOrbitPreset(preset) {
  if (preset === 'top') {
    orbitYaw.value = 0;
    orbitPitch.value = -84;
    orbitZoom.value = -240;
  } else if (preset === 'aerial') {
    orbitYaw.value = 0;
    orbitPitch.value = -50;
    orbitZoom.value = -180;
  } else if (preset === 'left') {
    orbitYaw.value = -42;
    orbitPitch.value = -35;
    orbitZoom.value = -160;
  } else if (preset === 'right') {
    orbitYaw.value = 42;
    orbitPitch.value = -35;
    orbitZoom.value = -160;
  }
}

function setHeadDirection(dir) {
  if (dir === 'left') {
    headYaw.value = (baseSeatYaw.value + 90) % 360;
    headPitch.value = 0;
  } else if (dir === 'front') {
    headYaw.value = baseSeatYaw.value;
    headPitch.value = 4;
  } else if (dir === 'right') {
    headYaw.value = (baseSeatYaw.value - 90) % 360;
    headPitch.value = 0;
  } else if (dir === 'back') {
    headYaw.value = (baseSeatYaw.value + 180) % 360;
    headPitch.value = 0;
  }
}

const headDirectionLabel = computed(() => {
  let diff = (headYaw.value - baseSeatYaw.value) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  if (Math.abs(diff) <= 30) return 'Punto Focal';
  if (diff > 30 && diff <= 140) return 'Izquierda';
  if (diff < -30 && diff >= -140) return 'Derecha';
  return 'Atrás';
});

const cameraTransform = computed(() => {
  if (!isSeated360.value) {
    return `translate3d(0px, 0px, ${orbitZoom.value}px) rotateX(${orbitPitch.value}deg) rotateY(${orbitYaw.value}deg) translate3d(0px, ${-AERIAL_TARGET_Y}px, ${-SCENE_Z_OFFSET}px)`;
  }

  const eyeX = props.selectedSeat.x;
  const eyeY = getSeatWorldY(props.selectedSeat) - 42;
  const eyeZ = props.selectedSeat.z + SCENE_Z_OFFSET;

  return `translate3d(0px, 0px, ${PERSPECTIVE}px) rotateX(${headPitch.value}deg) rotateY(${headYaw.value}deg) translate3d(${-eyeX}px, ${-eyeY}px, ${-eyeZ}px)`;
});

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});
</script>

<template>
  <div
    ref="stageRef"
    @pointerdown="handleStagePointerDown"
    @pointermove="handleStagePointerMove"
    @pointerup="handleStagePointerUp"
    @wheel="handleWheel"
    :class="[
      'relative w-full h-[670px] flex items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-black select-none',
      dragSession?.moved
        ? 'cursor-grabbing'
        : isSeated360 || freeCameraEnabled
          ? 'cursor-grab'
          : 'cursor-default'
    ]"
    :style="{ perspective: `${PERSPECTIVE}px` }"
  >
    <!-- Indicador superior izquierdo + Aviso de colisiones -->
    <div data-hud="true" class="absolute top-4 left-4 z-20 flex flex-col gap-1.5 max-w-[65%]">
      <div class="flex items-center gap-2 bg-slate-900/85 border border-slate-700/75 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-xs text-slate-200 shadow-lg">
        <span
          :class="[
            'w-2 h-2 rounded-full shrink-0',
            isSeated360
              ? 'bg-emerald-400 animate-pulse'
              : mode === 'build'
                ? 'bg-cyan-400 animate-pulse'
                : 'bg-amber-400'
          ]"
        ></span>
        <span v-if="isSeated360" class="truncate">
          Vista 360° en <strong class="text-emerald-400">{{ selectedSeat.label }}</strong> • Arrastra para mirar alrededor
        </span>
        <span v-else-if="mode === 'build' && builderStep === 1 && step1SubTab === 'venue'" class="truncate">
          Escenario ({{ venueConfig.shape === 'oval' ? 'Ovalado / Estadio' : venueConfig.shape === 'polygon' ? 'Polígono' : 'Cuadrado' }})
        </span>
        <span v-else-if="mode === 'build' && builderStep === 1" class="truncate">
          Plataformas ({{ platforms.length }}/4) • Colisiones activas con estadio y módulos
        </span>
        <span v-else-if="mode === 'build' && builderStep === 2" class="truncate">
          Paso 2: {{ builderType === 'free' ? 'Clic rápido en una silla para editar su nombre o arrástrala' : 'Pinta la grilla del módulo activo' }}
        </span>
        <span v-else-if="mode === 'build' && builderStep === 3" class="truncate">
          Paso 3: Guarda este layout en LocalStorage
        </span>
        <span v-else class="truncate">
          Haz clic en cualquier butaca para entrar en vista 360° hacia "{{ focalPoint.label }}"
        </span>
      </div>

      <!-- Indicador dinámico de colisiones -->
      <div
        v-if="mode === 'build' && builderStep === 1 && (collisionFeedback.venue || collisionFeedback.platform || collisionFeedback.multilevel)"
        :class="[
          'px-3 py-1 rounded-lg border text-[11px] font-medium backdrop-blur-md shadow self-start',
          collisionFeedback.multilevel
            ? 'bg-emerald-950/90 border-emerald-400/70 text-emerald-200'
            : 'bg-amber-950/90 border-amber-400/75 text-amber-200'
        ]"
      >
        <span v-if="collisionFeedback.venue">🚧 Límite del escenario alcanzado</span>
        <span v-else-if="collisionFeedback.platform">⛔ Colisión entre plataformas (requiere Δ elevación ≥ 90 para superponer)</span>
        <span v-else-if="collisionFeedback.multilevel">🪜 Superposición multinivel permitida (Δ elevación ≥ 90)</span>
      </div>
    </div>

    <!-- ==================== EDITOR RÁPIDO FLOTANTE DE NOMBRE DE SILLA (2D NITIDO) ==================== -->
    <div
      v-if="editingSeatObj"
      data-hud="true"
      @pointerdown.stop
      :style="quickEditPopoverStyle"
      class="absolute z-40 -translate-x-1/2 -translate-y-full bg-slate-950/95 border-2 border-fuchsia-400 rounded-xl px-2.5 py-2 shadow-2xl flex items-center gap-1.5 backdrop-blur-md"
    >
      <span class="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
        Nombre:
      </span>
      <input
        ref="quickInputRef"
        v-model="editingSeatObj.label"
        type="text"
        maxlength="10"
        placeholder="Ej. A1"
        @keydown.enter.prevent="emit('finish-seat-rename')"
        @keydown.esc.prevent="emit('finish-seat-rename')"
        class="w-24 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-600 text-xs font-bold text-white focus:outline-none focus:border-fuchsia-400"
      />
      <button
        type="button"
        @click="emit('finish-seat-rename')"
        class="px-2 py-0.5 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold cursor-pointer"
        title="Confirmar nombre (Enter)"
      >
        ✓
      </button>
    </div>

    <!-- Barra inferior izquierda (Controles de cámara + Color de paredes en Vista 360°) -->
    <div
      data-hud="true"
      class="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-1.5 bg-slate-900/85 border border-slate-700/75 backdrop-blur-md p-1.5 rounded-xl text-[11px] text-slate-200 shadow-xl"
    >
      <template v-if="isSeated360">
        <span class="px-2 py-1 text-emerald-400 font-semibold border-r border-slate-700/80">
          🧭 {{ headDirectionLabel }}
        </span>
        <button
          type="button"
          @click="setHeadDirection('left')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          ← Izquierda
        </button>
        <button
          type="button"
          @click="setHeadDirection('front')"
          class="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium transition cursor-pointer"
        >
          Punto Focal
        </button>
        <button
          type="button"
          @click="setHeadDirection('right')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Derecha →
        </button>
        <button
          type="button"
          @click="setHeadDirection('back')"
          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
        >
          Atrás ↻
        </button>

        <!-- Selector rápido de color de paredes dentro de Vista 360° -->
        <div class="flex items-center gap-1 pl-2 ml-0.5 border-l border-slate-700/80">
          <span class="text-[10px] text-slate-400 mr-0.5">Paredes:</span>
          <button
            v-for="preset in wallPresets"
            :key="preset.value"
            type="button"
            @click="emit('update-wall-color', preset.value)"
            :title="preset.name"
            :class="[
              'w-4 h-4 rounded-full border transition cursor-pointer',
              activeWallColor.toLowerCase() === preset.value.toLowerCase()
                ? 'border-white scale-110 ring-2 ring-emerald-400/70'
                : 'border-slate-500/80 hover:border-white'
            ]"
            :style="{ backgroundColor: preset.value }"
          ></button>
          <label
            title="Elegir cualquier color para las paredes"
            class="w-5 h-5 rounded-full border border-slate-500 overflow-hidden cursor-pointer flex items-center justify-center bg-slate-800 ml-0.5"
          >
            <input
              type="color"
              :value="activeWallColor"
              @input="(e) => emit('update-wall-color', e.target.value)"
              class="w-7 h-7 -m-1 cursor-pointer bg-transparent border-0"
            />
          </label>
        </div>
      </template>

      <template v-else>
        <button
          type="button"
          @click="freeCameraEnabled = !freeCameraEnabled"
          :class="[
            'px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 border',
            freeCameraEnabled
              ? 'bg-sky-600 border-sky-400 text-white shadow'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          ]"
        >
          <span>🎥</span>
          <span>{{ freeCameraEnabled ? 'Vista libre: ON' : 'Mover vista libremente' }}</span>
        </button>

        <div class="flex items-center gap-1 pl-1 border-l border-slate-700/80">
          <button
            type="button"
            @click="setOrbitPreset('top')"
            class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Cenital
          </button>
          <button
            type="button"
            @click="setOrbitPreset('aerial')"
            class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Aérea
          </button>
          <button
            type="button"
            @click="setOrbitPreset('left')"
            class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Izq
          </button>
          <button
            type="button"
            @click="setOrbitPreset('right')"
            class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            Der
          </button>
        </div>

        <div class="flex items-center gap-1 pl-1 border-l border-slate-700/80">
          <button
            type="button"
            @click="orbitZoom = Math.min(280, orbitZoom + 55)"
            class="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer"
            title="Acercar"
          >+</button>
          <button
            type="button"
            @click="orbitZoom = Math.max(-720, orbitZoom - 55)"
            class="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer"
            title="Alejar"
          >-</button>
        </div>
      </template>
    </div>

    <!-- ESCENARIO 3D -->
    <div
      class="relative w-full h-full flex items-center justify-center will-change-transform"
      :class="dragSession?.moved ? 'transition-none' : 'transition-transform duration-300 ease-out'"
      :style="{
        transformStyle: 'preserve-3d',
        transform: cameraTransform
      }"
    >
      <div class="relative w-0 h-0" style="transform-style: preserve-3d">
        <!-- ==================== ESCENARIO / RECINTO PRINCIPAL ==================== -->
        <div
          :class="[
            'absolute pointer-events-none',
            venueConfig.shape !== 'polygon' ? 'border-2' : '',
            venueConfig.shape === 'oval' ? 'rounded-full' : venueConfig.shape === 'rect' ? 'rounded-3xl' : '',
            collisionFeedback.venue
              ? 'border-amber-400 bg-slate-900/95'
              : step1SubTab === 'venue' && builderStep === 1 && mode === 'build'
                ? 'border-emerald-400/80 bg-slate-900/95'
                : 'border-slate-700/85 bg-slate-950/95'
          ]"
          :style="venueFloorStyle"
        >
          <div
            v-if="venueConfig.shape === 'oval'"
            class="absolute inset-8 rounded-full border border-dashed border-emerald-500/25 pointer-events-none"
          ></div>
        </div>

        <!-- Muros Perimetrales del Escenario Principal (Color personalizable en Vista 360°) -->
        <div
          v-for="seg in venueWallSegments"
          :key="`venue-wall-${seg.key}`"
          :class="[
            'absolute border-x border-t pointer-events-none transition-colors duration-200',
            isSeated360
              ? ''
              : collisionFeedback.venue
                ? 'bg-amber-950/80 border-amber-400/75'
                : step1SubTab === 'venue' && builderStep === 1 && mode === 'build'
                  ? 'bg-emerald-950/75 border-emerald-400/50'
                  : 'bg-slate-900/80 border-slate-700/60'
          ]"
          :style="seg.style"
        ></div>

        <!-- Techo del recinto (visible en Vista 360°) -->
        <div
          v-if="isSeated360"
          class="absolute bg-slate-950/95 border border-slate-800/60 pointer-events-none"
          :style="{
            width: '1800px',
            height: '1800px',
            left: '-900px',
            top: '-900px',
            transform: `translate3d(0px, ${FLOOR_Y - ROOM_HEIGHT}px, ${SCENE_Z_OFFSET}px) rotateX(-90deg)`
          }"
        ></div>

        <!-- NODOS MOVIBLES DEL ESCENARIO PRINCIPAL -->
        <template
          v-if="mode === 'build' && builderStep === 1 && step1SubTab === 'venue' && venueConfig.shape === 'polygon'"
        >
          <div
            v-for="(pt, vIdx) in venueConfig.points"
            :key="`venue-v-${vIdx}`"
            class="absolute w-0 h-0"
            style="transform-style: preserve-3d"
          >
            <div
              class="absolute w-0.5 h-7 -ml-[1px] bg-emerald-400/80 pointer-events-none"
              :style="{ transform: `translate3d(${pt.x}px, ${FLOOR_Y - 28}px, ${pt.z + SCENE_Z_OFFSET}px)` }"
            ></div>
            <div
              class="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-emerald-400 pointer-events-none"
              :style="{ transform: `translate3d(${pt.x}px, ${FLOOR_Y}px, ${pt.z + SCENE_Z_OFFSET}px) rotateX(90deg)` }"
            ></div>

            <button
              type="button"
              @pointerdown="handleVenueVertexPointerDown($event, vIdx)"
              class="group absolute w-10 h-10 -ml-5 -mt-5 bg-transparent border-0 p-0 flex items-center justify-center cursor-grab active:cursor-grabbing focus:outline-none z-40"
              :style="{ transform: `translate3d(${pt.x}px, ${FLOOR_Y - 28}px, ${pt.z + SCENE_Z_OFFSET}px) rotateX(35deg)` }"
            >
              <span
                :class="[
                  'w-7 h-7 rounded-full border-2 text-[10px] font-extrabold flex items-center justify-center shadow-lg',
                  dragSession?.type === 'venue-vertex' && dragSession?.vertexIndex === vIdx
                    ? 'bg-white border-emerald-400 text-slate-950 ring-4 ring-emerald-400/60'
                    : 'bg-emerald-500 border-white text-slate-950 group-hover:bg-emerald-400 group-hover:ring-4 group-hover:ring-emerald-300/40'
                ]"
              >
                E{{ vIdx + 1 }}
              </span>

              <span
                v-if="dragSession?.type === 'venue-vertex' && dragSession?.vertexIndex === vIdx"
                class="absolute -top-7 px-2 py-0.5 rounded bg-slate-950/95 border border-emerald-400 text-[10px] font-mono text-emerald-300 whitespace-nowrap shadow-lg pointer-events-none"
              >
                {{ pt.x }}, {{ pt.z }}
              </span>
            </button>
          </div>
        </template>

        <!-- ==================== MÓDULOS / PLATAFORMAS (1 a 4) ==================== -->
        <div
          v-for="item in renderedPlatforms"
          :key="item.raw.id"
          class="absolute w-0 h-0"
          style="transform-style: preserve-3d"
        >
          <div
            :data-platform-id="item.raw.id"
            :class="[
              item.raw.shape !== 'polygon' ? 'border-2' : '',
              item.raw.shape === 'circle' ? 'rounded-full' : item.raw.shape === 'rect' ? 'rounded-2xl' : '',
              item.raw.id === activePlatformId && mode === 'build'
                ? item.theme.activeBorder
                : item.theme.border,
              canPlaceFreeSeats ? 'cursor-crosshair' : 'cursor-pointer'
            ]"
            class="absolute"
            :style="item.surfaceStyle"
          ></div>

          <div
            v-for="seg in item.walls"
            :key="seg.key"
            :class="['absolute border-x border-t pointer-events-none', item.theme.wall]"
            :style="seg.style"
          ></div>

          <button
            v-if="mode === 'build' && builderStep === 1 && step1SubTab === 'platforms'"
            type="button"
            @pointerdown="handlePlatformHandlePointerDown($event, item.raw)"
            @click.stop="emit('select-platform', item.raw.id)"
            :class="[
              'absolute px-2.5 py-1 rounded-lg border text-[10px] font-bold shadow-lg whitespace-nowrap cursor-grab active:cursor-grabbing flex items-center gap-1',
              item.theme.badge,
              item.raw.id === activePlatformId ? 'ring-2 ring-white/80' : 'opacity-80'
            ]"
            :style="item.handleStyle"
          >
            <span>✥ {{ item.raw.name }}</span>
            <span class="opacity-75">(+{{ item.raw.baseElevation }})</span>
          </button>

          <template
            v-if="
              mode === 'build' &&
              builderStep === 1 &&
              step1SubTab === 'platforms' &&
              item.raw.shape === 'polygon' &&
              item.raw.id === activePlatformId
            "
          >
            <div
              v-for="v in item.vertices"
              :key="`v-${item.raw.id}-${v.vIdx}`"
              class="absolute w-0 h-0"
              style="transform-style: preserve-3d"
            >
              <div
                class="absolute w-0.5 h-6 -ml-[1px] bg-amber-400/85 pointer-events-none"
                :style="v.pinStyle"
              ></div>
              <div
                class="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-amber-400 pointer-events-none"
                :style="v.dotStyle"
              ></div>

              <button
                type="button"
                @pointerdown="handlePlatformVertexPointerDown($event, item.raw, v.vIdx)"
                class="group absolute w-10 h-10 -ml-5 -mt-5 bg-transparent border-0 p-0 flex items-center justify-center cursor-grab active:cursor-grabbing focus:outline-none z-40"
                :style="v.btnStyle"
              >
                <span
                  :class="[
                    'w-7 h-7 rounded-full border-2 text-[10px] font-extrabold flex items-center justify-center shadow-lg',
                    dragSession?.type === 'platform-vertex' &&
                    dragSession?.platformId === item.raw.id &&
                    dragSession?.vertexIndex === v.vIdx
                      ? 'bg-white border-amber-400 text-slate-950 ring-4 ring-amber-400/70'
                      : 'bg-amber-400 border-white text-slate-950 group-hover:bg-amber-300 group-hover:ring-4 group-hover:ring-amber-300/45'
                  ]"
                >
                  P{{ v.vIdx + 1 }}
                </span>

                <span
                  v-if="
                    dragSession?.type === 'platform-vertex' &&
                    dragSession?.platformId === item.raw.id &&
                    dragSession?.vertexIndex === v.vIdx
                  "
                  class="absolute -top-7 px-2 py-0.5 rounded bg-slate-950/95 border border-amber-400 text-[10px] font-mono text-amber-300 whitespace-nowrap shadow-lg pointer-events-none"
                >
                  {{ v.x }}, {{ v.z }}
                </span>
              </button>
            </div>
          </template>
        </div>

        <!-- ==================== PUNTO FOCAL ==================== -->
        <div
          v-if="focalPoint.type === 'screen'"
          class="absolute flex flex-col items-center justify-center rounded-xl border-2 border-indigo-400/80 bg-gradient-to-tr from-indigo-950 via-sky-900 to-purple-900 shadow-[0_0_60px_rgba(99,102,241,0.45)] pointer-events-none"
          :style="{
            width: `${focalPoint.width}px`,
            height: '180px',
            left: `${-focalPoint.width / 2}px`,
            top: '-90px',
            transform: `translate3d(${focalPoint.x}px, ${FLOOR_Y - 115}px, ${focalPoint.z + SCENE_Z_OFFSET}px)`
          }"
        >
          <span class="text-[10px] uppercase tracking-[0.28em] text-indigo-200/80 mb-1.5">
            Punto Focal • Pantalla
          </span>
          <div class="w-3/4 h-20 rounded-lg bg-black/45 border border-white/15 flex items-center justify-center text-xs sm:text-sm font-semibold text-indigo-100 px-3 text-center">
            {{ focalPoint.label }}
          </div>
        </div>

        <div
          v-else-if="focalPoint.type === 'stage'"
          class="absolute w-0 h-0 pointer-events-none"
          style="transform-style: preserve-3d"
        >
          <div
            class="absolute rounded-2xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-900/70 to-stone-950 flex items-center justify-center"
            :style="{
              width: `${focalPoint.width}px`,
              height: '200px',
              left: `${-focalPoint.width / 2}px`,
              top: '-100px',
              transform: `translate3d(${focalPoint.x}px, ${FLOOR_Y - 22}px, ${focalPoint.z + SCENE_Z_OFFSET}px) rotateX(90deg)`
            }"
          >
            <span class="text-xs font-bold uppercase tracking-widest text-amber-200">
              🎤 {{ focalPoint.label }}
            </span>
          </div>
          <div
            class="absolute rounded-xl border border-amber-400/50 bg-amber-950/60 flex items-center justify-center text-xs font-bold text-amber-200"
            :style="{
              width: `${focalPoint.width}px`,
              height: '44px',
              left: `${-focalPoint.width / 2}px`,
              top: '-22px',
              transform: `translate3d(${focalPoint.x}px, ${FLOOR_Y - 145}px, ${focalPoint.z + SCENE_Z_OFFSET}px)`
            }"
          >
            {{ focalPoint.label }}
          </div>
        </div>

        <div
          v-else-if="focalPoint.type === 'ring'"
          class="absolute rounded-full border-4 border-emerald-400/80 bg-gradient-to-tr from-emerald-950/90 via-teal-900/70 to-emerald-950/90 flex items-center justify-center pointer-events-none"
          :style="{
            width: `${focalPoint.width}px`,
            height: `${focalPoint.width}px`,
            left: `${-focalPoint.width / 2}px`,
            top: `${-focalPoint.width / 2}px`,
            transform: `translate3d(${focalPoint.x}px, ${FLOOR_Y - 8}px, ${focalPoint.z + SCENE_Z_OFFSET}px) rotateX(90deg)`
          }"
        >
          <div class="w-1/2 h-1/2 rounded-full border-2 border-dashed border-emerald-300/60 flex items-center justify-center text-center px-2">
            <span class="text-xs font-extrabold uppercase tracking-wider text-emerald-200">
              🏟 {{ focalPoint.label }}
            </span>
          </div>
        </div>

        <div
          v-else
          class="absolute flex flex-col items-center justify-center rounded-xl border-2 border-sky-400/80 bg-gradient-to-b from-sky-900 to-slate-950 pointer-events-none"
          :style="{
            width: `${Math.min(340, focalPoint.width)}px`,
            height: '110px',
            left: `${-Math.min(340, focalPoint.width) / 2}px`,
            top: '-55px',
            transform: `translate3d(${focalPoint.x}px, ${FLOOR_Y - 65}px, ${focalPoint.z + SCENE_Z_OFFSET}px)`
          }"
        >
          <span class="text-[10px] uppercase tracking-widest text-sky-300/80">Podio / Conferencia</span>
          <span class="text-xs font-bold text-white mt-1">🎙 {{ focalPoint.label }}</span>
        </div>

        <!-- ESPACIOS VACÍOS DE CUADRÍCULA -->
        <template v-if="mode === 'build' && builderStep === 2 && builderType === 'grid'">
          <button
            v-for="emptyCell in gridPlaceholders"
            :key="emptyCell.id"
            type="button"
            @pointerdown.stop
            @click.stop="emit('paint-grid-cell', emptyCell)"
            class="absolute w-[64px] h-[50px] rounded-xl border border-dashed border-slate-600/80 bg-slate-900/40 text-slate-500 hover:border-indigo-400 hover:text-indigo-300 text-[10px] flex items-center justify-center cursor-pointer"
            :style="{
              left: '-32px',
              top: '-25px',
              transform: `translate3d(${emptyCell.x}px, ${getSeatWorldY(emptyCell)}px, ${emptyCell.z + SCENE_Z_OFFSET}px)`
            }"
          >
            + Espacio
          </button>
        </template>

        <!-- ==================== BUTACAS 3D OPTIMIZADAS ==================== -->
        <button
          v-for="seat in renderedSeats"
          :key="seat.id"
          v-memo="[
            seat.x,
            seat.z,
            seat.worldY,
            seat.facingYaw,
            seat.status,
            seat.label,
            seat.isSelected,
            seat.isEditing,
            isSeated360,
            dragSession?.seatId === seat.id
          ]"
          type="button"
          :disabled="mode === 'preview' && seat.status === 'occupied'"
          @pointerdown="handleSeatPointerDown($event, seat)"
          @click="handleSeatClick($event, seat)"
          :class="[
            'seat-3d-item group absolute w-[74px] h-[64px] bg-transparent border-0 p-0 focus:outline-none',
            dragSession?.seatId === seat.id ? 'z-50' : '',
            isSeated360 && seat.isSelected ? 'opacity-0 pointer-events-none' : 'opacity-100',
            canPlaceFreeSeats
              ? 'cursor-grab active:cursor-grabbing'
              : mode === 'build' && builderStep !== 2
                ? 'cursor-default'
                : seat.status === 'occupied' && mode === 'preview'
                  ? 'cursor-not-allowed'
                  : 'cursor-pointer'
          ]"
          :style="{
            left: '-37px',
            top: '-32px',
            transformStyle: 'preserve-3d',
            transform: seat.transform
          }"
        >
          <div
            class="absolute inset-x-1 top-3 h-12 rounded-xl bg-black/50 pointer-events-none"
            style="transform: translate3d(0px, 24px, -6px) rotateX(90deg)"
          ></div>

          <div
            class="absolute left-1/2 -ml-2.5 bottom-0 w-5 h-5 bg-zinc-800 border-x border-zinc-600/60 rounded-b-sm pointer-events-none"
            style="transform: translate3d(0px, 6px, -6px)"
          ></div>

          <div
            :class="[
              'absolute left-2 right-2 top-8 h-9 rounded-b-lg rounded-t-sm border-2 bg-gradient-to-b pointer-events-none',
              seat.theme.cushion
            ]"
            style="transform: translate3d(0px, 11px, -8px) rotateX(82deg)"
          ></div>

          <div
            :class="[
              'seat-backrest-ribs absolute left-2 right-2 top-1 h-12 rounded-t-2xl rounded-b-md border-2 bg-gradient-to-b flex flex-col items-center justify-between py-1 pointer-events-none',
              seat.theme.backrest
            ]"
            style="transform: translate3d(0px, -4px, 10px) rotateX(-8deg)"
          >
            <div
              :class="[
                'w-10 h-2.5 -mt-2 rounded-full border',
                seat.theme.headrest
              ]"
            ></div>

            <span class="text-[8px] font-semibold uppercase tracking-wider text-white/85">
              {{ seat.status === 'occupied' ? 'Ocupado' : 'Libre' }}
            </span>
          </div>

          <!-- Etiqueta (se resalta cuando está en edición rápida) -->
          <div
            :class="[
              'absolute left-1/2 -translate-x-1/2 -top-4 px-2 py-0.5 rounded-md border text-[10px] font-extrabold tracking-tight shadow whitespace-nowrap pointer-events-none',
              seat.isEditing
                ? 'bg-fuchsia-600 text-white border-white ring-2 ring-fuchsia-300'
                : seat.theme.badge
            ]"
            :style="{ transform: seat.badgeTransform }"
          >
            {{ seat.label }}
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seat-3d-item::before,
.seat-3d-item::after {
  content: '';
  position: absolute;
  top: 28px;
  width: 26px;
  height: 11px;
  border-radius: 9999px;
  background-color: #18181b;
  border: 1px solid #3f3f46;
  pointer-events: none;
}

.seat-3d-item::before {
  left: 0;
  transform: translate3d(-10px, 9px, -4px) rotateY(90deg);
}

.seat-3d-item::after {
  right: 0;
  transform: translate3d(10px, 9px, -4px) rotateY(90deg);
}

.seat-backrest-ribs {
  background-image: linear-gradient(
    to right,
    transparent 24%,
    rgba(0, 0, 0, 0.25) 25%,
    transparent 27%,
    transparent 49%,
    rgba(0, 0, 0, 0.25) 50%,
    transparent 52%,
    transparent 73%,
    rgba(0, 0, 0, 0.25) 74%,
    transparent 76%
  );
}
</style>