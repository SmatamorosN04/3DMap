<script setup>
import { ref, computed, watch, shallowRef, markRaw, onMounted, onBeforeUnmount } from 'vue';
import PolideportivoThreeViewer from './components/PolideportivoThreeViewer.vue';
import EstadioSoberaniaThreeViewer from './components/EstadioSoberaniaThreeViewer.vue';
import { EVENT_CONFIGS, buildPolideportivoModel } from './data/polideportivoAlexisArguello.js';
import * as soberaniaModule from './data/estadioSoberania.js';

// Resuelve dinámicamente el constructor y eventos de estadioSoberania.js
const SOBERANIA_EVENTS = soberaniaModule.SOBERANIA_EVENTS || {};
const buildSoberaniaFn =
  soberaniaModule.buildEstadioSoberaniaModel ||
  soberaniaModule.buildSoberaniaModel ||
  Object.values(soberaniaModule).find((fn) => typeof fn === 'function');

// ============================================================================
// ESTADO DE CARTOGRAFÍA Y RECINTOS (Con markRaw para máximo rendimiento 3D)
// ============================================================================
const activeVenue = ref('soberania'); // 'soberania' | 'polideportivo'
const soberaniaEventType = ref('baseball');
const poliEventType = ref('basketball');

const soberaniaModel = shallowRef(
  markRaw(buildSoberaniaFn ? buildSoberaniaFn(soberaniaEventType.value) : { seats: [], tierBlocks: [], sectors: [] })
);
const poliModel = shallowRef(markRaw(buildPolideportivoModel(poliEventType.value)));

const selectedSeat = ref(null);
const highlightedSectorId = ref('');

// Capas arquitectónicas por recinto
const showGrandstandRoof = ref(true);
const showExteriorEnvironment = ref(true);
const showRoofTrusses = ref(true);
const stadiumLightsOn = ref(true);
const poliWallColor = ref('#0c1526');

const wallSwatches = [
  { label: 'Obsidiana Azul', value: '#0c1526' },
  { label: 'Carbón Grafito', value: '#121318' },
  { label: 'Bronce Nocturno', value: '#1a1610' }
];

const currentVenueMeta = computed(() => {
  if (activeVenue.value === 'soberania') {
    return {
      id: 'soberania',
      code: 'EST-SOB // 01',
      name: 'Estadio Nacional Soberanía',
      coords: '12.1389° N, 86.2694° O',
      capacityText: `${soberaniaModel.value.seats.length.toLocaleString()} localidades cartografiadas`,
      events: Object.values(SOBERANIA_EVENTS),
      activeEvent: soberaniaEventType.value,
      sectors: soberaniaModel.value.sectors || []
    };
  }
  return {
    id: 'polideportivo',
    code: 'POL-AA // 02',
    name: 'Polideportivo Alexis Argüello',
    coords: '12.1331° N, 86.2508° O',
    capacityText: `${poliModel.value.seats.length.toLocaleString()} localidades cartografiadas`,
    events: Object.values(EVENT_CONFIGS),
    activeEvent: poliEventType.value,
    sectors: poliModel.value.sectors || []
  };
});

const hasActiveSelection = computed(() => Boolean(selectedSeat.value || highlightedSectorId.value));

function switchVenue(venueId) {
  if (activeVenue.value === venueId) return;
  selectedSeat.value = null;
  highlightedSectorId.value = '';
  activeVenue.value = venueId;
}

function selectEvent(eventId) {
  selectedSeat.value = null;
  if (activeVenue.value === 'soberania') {
    soberaniaEventType.value = eventId;
    if (buildSoberaniaFn) {
      soberaniaModel.value = markRaw(buildSoberaniaFn(eventId));
    }
  } else {
    poliEventType.value = eventId;
    poliModel.value = markRaw(buildPolideportivoModel(eventId));
  }
}

function handleSelectSeat(seat) {
  selectedSeat.value = seat;
}

function handleExitSeatView() {
  selectedSeat.value = null;
}

function clearAllSelections() {
  if (!hasActiveSelection.value) return;
  selectedSeat.value = null;
  highlightedSectorId.value = '';
}

function scrollToMapper() {
  const el = document.getElementById('spatial-mapper-stage');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================================================
// ANIMACIÓN DE LÍNEAS CONECTÁNDOSE EN EL HERO (Con auto-pausa fuera de pantalla)
// ============================================================================
const heroSectionRef = ref(null);
const heroCanvasRef = ref(null);
let networkRafId = null;
let heroObserver = null;
let isHeroVisible = true;

function initHeroNetworkCanvas() {
  const canvas = heroCanvasRef.value;
  const section = heroSectionRef.value;
  if (!canvas || !section) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let nodes = [];
  const pointer = { x: -9999, y: -9999, active: false };

  const resizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = section.clientWidth;
    height = section.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nodeCount = Math.min(68, Math.max(32, Math.floor((width * height) / 19000)));
    nodes = Array.from({ length: nodeCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.42,
      vy: (Math.random() - 0.5) * 0.42,
      radius: idx % 5 === 0 ? 2.4 : 1.4,
      isGold: idx % 3 === 0
    }));
  };

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const onMouseMove = (e) => {
    const rect = section.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = true;
  };
  const onMouseLeave = () => {
    pointer.active = false;
  };

  section.addEventListener('mousemove', onMouseMove);
  section.addEventListener('mouseleave', onMouseLeave);

  const renderLoop = () => {
    networkRafId = requestAnimationFrame(renderLoop);
    if (!isHeroVisible) return;

    ctx.clearRect(0, 0, width, height);

    // Retícula topográfica sutil de fondo
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.045)';
    ctx.lineWidth = 1;
    const gridStep = 90;
    for (let gx = 0; gx < width; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }

    // Actualizar posiciones
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;

      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }

    // Dibujar conexiones entre nodos cercanos
    const maxDist = 155;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);

        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.28;
          ctx.strokeStyle =
            a.isGold || b.isGold
              ? `rgba(212, 175, 55, ${alpha.toFixed(3)})`
              : `rgba(243, 239, 230, ${(alpha * 0.45).toFixed(3)})`;
          ctx.lineWidth = a.isGold && b.isGold ? 1.1 : 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Conexión interactiva con el puntero
      if (pointer.active) {
        const pdx = a.x - pointer.x;
        const pdy = a.y - pointer.y;
        const pDist = Math.hypot(pdx, pdy);
        if (pDist < 190) {
          const pAlpha = (1 - pDist / 190) * 0.55;
          ctx.strokeStyle = `rgba(232, 204, 117, ${pAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      // Nodo
      ctx.fillStyle = a.isGold ? 'rgba(232, 204, 117, 0.85)' : 'rgba(243, 239, 230, 0.45)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  renderLoop();

  heroObserver = new IntersectionObserver(
    (entries) => {
      isHeroVisible = entries[0]?.isIntersecting ?? true;
    },
    { threshold: 0.05 }
  );
  heroObserver.observe(section);

  return () => {
    window.removeEventListener('resize', resizeCanvas);
    section.removeEventListener('mousemove', onMouseMove);
    section.removeEventListener('mouseleave', onMouseLeave);
  };
}

let cleanupHeroCanvas = null;

onMounted(() => {
  cleanupHeroCanvas = initHeroNetworkCanvas();
});

onBeforeUnmount(() => {
  if (cleanupHeroCanvas) cleanupHeroCanvas();
  if (heroObserver) heroObserver.disconnect();
  if (networkRafId) cancelAnimationFrame(networkRafId);
});

watch(activeVenue, () => {
  selectedSeat.value = null;
});
</script>

<template>
  <div class="min-h-screen bg-obsidian text-alabaster font-sans selection:bg-gold/30 selection:text-gold-bright">
    <!-- ===================================================================== -->
    <!-- HEADER SOBREPUESTO CON SOMBRA DORADA Y ENFOQUE EN MAPEO ESPACIAL       -->
    <!-- ===================================================================== -->
    <header class="fixed top-4 inset-x-0 z-50 px-4 sm:px-8 pointer-events-none">
      <nav
        class="pointer-events-auto mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4 px-5 py-3 rounded-2xl bg-obsidian-glass backdrop-blur-xl border border-gold/35 shadow-gold-ambient"
      >
        <!-- Identidad de Mapeo -->
        <div class="flex items-center gap-3.5">
          <div class="relative w-10 h-10 rounded-xl bg-carbon border border-gold/45 flex items-center justify-center shadow-inner">
            <!-- Retícula arquitectónica SVG -->
            <svg class="w-5 h-5 text-gold-bright" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2" />
              <circle cx="12" cy="12" r="3.5" />
              <line x1="12" y1="1.5" x2="12" y2="5.5" />
              <line x1="12" y1="18.5" x2="12" y2="22.5" />
              <line x1="1.5" y1="12" x2="5.5" y2="12" />
              <line x1="18.5" y1="12" x2="22.5" y2="12" />
            </svg>
            <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-bright animate-ping opacity-75"></span>
            <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-bright"></span>
          </div>

          <div>
            <div class="flex items-center gap-2">
              <span class="font-display font-bold tracking-wider text-sm sm:text-base text-alabaster uppercase">
                Esquizo<span class="text-gold-bright">MAP</span> 3D
              </span>
              <span class="hidden sm:inline-block font-mono text-[10px] tracking-widest px-2 py-0.5 rounded bg-gold/10 text-gold-bright border border-gold/25">
                CARTOGRAFÍA ESPACIAL
              </span>
            </div>
            
          </div>
        </div>

        <!-- Selector Central de Recintos -->
        <div class="flex items-center gap-2 bg-obsidian/80 p-1.5 rounded-xl border border-alabaster/10">
          <button
            type="button"
            @click="switchVenue('soberania')"
            :class="[
              'btn-vanguard px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide',
              activeVenue === 'soberania' ? 'btn-state-active' : 'btn-state-idle'
            ]"
          >
            Estadio Soberanía
          </button>
          <button
            type="button"
            @click="switchVenue('polideportivo')"
            :class="[
              'btn-vanguard px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide',
              activeVenue === 'polideportivo' ? 'btn-state-active' : 'btn-state-idle'
            ]"
          >
            Polideportivo A. Argüello
          </button>
        </div>

        <!-- Acciones Rápidas de Telemetría (Demuestra estados Activo / Hover / Inactivo) -->
        <div class="hidden md:flex items-center gap-2.5">
          <button
            type="button"
            :disabled="!hasActiveSelection"
            @click="clearAllSelections"
            :class="[
              'btn-vanguard px-3.5 py-2 rounded-xl text-xs font-mono tracking-wide',
              hasActiveSelection ? 'btn-state-idle' : 'btn-state-disabled'
            ]"
          >
            LIMPIAR SELECCIÓN
          </button>
          <button
            type="button"
            @click="scrollToMapper"
            class="btn-vanguard btn-state-active px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase"
          >
            Explorar Mapa 3D ↓
          </button>
        </div>
      </nav>
    </header>

    <!-- ===================================================================== -->
    <!-- HERO VANGUARDISTA CON ANIMACIÓN DE LÍNEAS CONECTADAS (SIN CARDS)      -->
    <!-- ===================================================================== -->
    <section
      ref="heroSectionRef"
      class="relative min-h-[78vh] flex items-center justify-center overflow-hidden pt-32 pb-20 px-6 border-b border-gold/15"
    >
      <!-- Canvas de nodos y líneas conectándose -->
      <canvas ref="heroCanvasRef" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>

      <!-- Viñeta radial sutil obsidiana + halo dorado superior -->
      <div class="hero-vignette absolute inset-0 pointer-events-none"></div>

      <!-- Contenido Editorial Puro (Solo Textos y Acciones) -->
      <div class="relative z-10 max-w-5xl mx-auto text-center">
        <p class="font-mono text-xs sm:text-sm tracking-[0.28em] uppercase text-gold-bright mb-6">
          GEMELO DIGITAL DE PRECISIÓN 
        </p>

        <h1 class="font-display font-extrabold text-4xl sm:text-6xl lg:text-7xl tracking-tight leading-[1.06] text-alabaster uppercase">
          CADA BUTACA,
          <span class="block  bg-clip-text bg-linear-to-r from-alabaster via-gold-bright to-gold">
            SU PROPIO HORIZONTE.
          </span>
        </h1>

        <p class="mt-7 max-w-2xl mx-auto text-base sm:text-lg text-sand-muted leading-relaxed font-normal">
          Audita ángulos de visión reales, elevación exacta y líneas de despeje en los recintos emblemáticos de Managua antes de reservar o configurar tu evento.
        </p>

        <!-- Especificaciones en texto limpio separado por líneas doradas (sin cards) -->
        <div class="mt-9 flex flex-wrap items-center justify-center gap-y-3 text-xs sm:text-sm font-mono tracking-wider text-alabaster/90">
          <span class="px-4">ESCALA ARQUITECTÓNICA 1:1</span>
          <span class="h-4 w-px bg-gold/40"></span>
          <span class="px-4 text-gold-bright">{{ currentVenueMeta.capacityText.toUpperCase() }}</span>
          <span class="h-4 w-px bg-gold/40"></span>
          <span class="px-4">ROTACIÓN LIBRE 360°</span>
        </div>

        <!-- Botones Principales del Hero -->
        <div class="mt-11 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            @click="scrollToMapper"
            class="btn-vanguard btn-state-active px-7 py-3.5 rounded-xl text-xs sm:text-sm font-bold tracking-widest uppercase"
          >
            Iniciar Mapeo Interactivo
          </button>

          <button
            type="button"
            @click="switchVenue(activeVenue === 'soberania' ? 'polideportivo' : 'soberania')"
            class="btn-vanguard btn-state-idle px-6 py-3.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wider uppercase"
          >
            Cambiar a {{ activeVenue === 'soberania' ? 'Polideportivo' : 'Estadio Soberanía' }}
          </button>
        </div>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- ESPACIO DE TRABAJO DEL SIMULADOR 3D                                   -->
    <!-- ===================================================================== -->
    <main id="spatial-mapper-stage" class="mx-auto max-w-7xl px-4 sm:px-8 pt-10 pb-20 space-y-6">
      <!-- Barra Superior de Control Cartográfico -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-alabaster/10">
        <div>
          <div class="flex items-center gap-2.5">
            <span class="font-mono text-xs text-gold-bright tracking-widest">{{ currentVenueMeta.code }}</span>
            <span class="w-1.5 h-1.5 rounded-full bg-gold"></span>
            <span class="font-mono text-xs text-sand-muted">{{ currentVenueMeta.capacityText }}</span>
          </div>
          <h2 class="font-display text-2xl sm:text-3xl font-bold text-alabaster mt-1">
            {{ currentVenueMeta.name }}
          </h2>
        </div>

        <!-- Selector de Configuración de Evento -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-[11px] uppercase tracking-widest text-sand-muted mr-1">
            Escenario:
          </span>
          <button
            v-for="ev in currentVenueMeta.events"
            :key="ev.id"
            type="button"
            @click="selectEvent(ev.id)"
            :class="[
              'btn-vanguard px-3.5 py-2 rounded-xl text-xs font-semibold',
              currentVenueMeta.activeEvent === ev.id ? 'btn-state-active' : 'btn-state-idle'
            ]"
          >
            {{ ev.name }}
          </button>
        </div>
      </div>

      <!-- Controles de Sector, Capas y Telemetría de Asiento -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-carbon/90 px-4 py-3.5 rounded-2xl border border-gold/20">
        <!-- Filtro de Sector -->
        <div class="flex flex-wrap items-center gap-3">
          <label for="sector-filter" class="font-mono text-xs uppercase tracking-wider text-gold-bright">
            Sector:
          </label>
          <select
            id="sector-filter"
            v-model="highlightedSectorId"
            class="bg-obsidian text-alabaster text-xs font-medium px-3.5 py-2 rounded-xl border border-alabaster/15 focus:border-gold focus:outline-none cursor-pointer"
          >
            <option value="">Todos los sectores visibles</option>
            <option v-for="sec in currentVenueMeta.sectors" :key="sec.id" :value="sec.id">
              {{ sec.name }} ({{ sec.activeSeats }} disp.)
            </option>
          </select>

          <button
            type="button"
            :disabled="!highlightedSectorId"
            @click="highlightedSectorId = ''"
            :class="[
              'btn-vanguard px-3 py-2 rounded-xl text-xs font-mono',
              highlightedSectorId ? 'btn-state-idle' : 'btn-state-disabled'
            ]"
          >
            Quitar Filtro
          </button>
        </div>

        <!-- Toggles de Capas Arquitectónicas -->
        <div class="flex flex-wrap items-center gap-2.5">
          <template v-if="activeVenue === 'soberania'">
            <button
              type="button"
              @click="showGrandstandRoof = !showGrandstandRoof"
              :class="[
                'btn-vanguard px-3 py-1.5 rounded-lg text-xs font-medium',
                showGrandstandRoof ? 'btn-state-active' : 'btn-state-idle'
              ]"
            >
              Cubierta Voladiza
            </button>
            <button
              type="button"
              @click="showExteriorEnvironment = !showExteriorEnvironment"
              :class="[
                'btn-vanguard px-3 py-1.5 rounded-lg text-xs font-medium',
                showExteriorEnvironment ? 'btn-state-active' : 'btn-state-idle'
              ]"
            >
              Entorno Exterior
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              @click="showRoofTrusses = !showRoofTrusses"
              :class="[
                'btn-vanguard px-3 py-1.5 rounded-lg text-xs font-medium',
                showRoofTrusses ? 'btn-state-active' : 'btn-state-idle'
              ]"
            >
              Cerchas de Techo
            </button>
            <div class="flex items-center gap-1.5 pl-2 border-l border-alabaster/10">
              <button
                v-for="sw in wallSwatches"
                :key="sw.value"
                type="button"
                :title="sw.label"
                @click="poliWallColor = sw.value"
                :class="[
                  'w-6 h-6 rounded-full border transition-transform cursor-pointer',
                  poliWallColor === sw.value
                    ? 'border-gold-bright scale-110 ring-2 ring-gold/40'
                    : 'border-alabaster/25 opacity-70 hover:opacity-100'
                ]"
                :style="{ backgroundColor: sw.value }"
              ></button>
            </div>
          </template>

          <button
            type="button"
            @click="stadiumLightsOn = !stadiumLightsOn"
            :class="[
              'btn-vanguard px-3 py-1.5 rounded-lg text-xs font-medium',
              stadiumLightsOn ? 'btn-state-active' : 'btn-state-idle'
            ]"
          >
            Luminarias {{ stadiumLightsOn ? 'ON' : 'OFF' }}
          </button>
        </div>
      </div>

      <!-- Banda de Telemetría cuando hay una butaca seleccionada -->
      <div
        v-if="selectedSeat"
        class="flex flex-wrap items-center justify-between gap-4 px-5 py-3 rounded-2xl bg-gradient-to-r from-gold/15 via-carbon to-carbon border border-gold/45"
      >
        <div class="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
          <span class="font-mono text-xs uppercase tracking-widest text-gold-bright font-bold">
            ● POSICIÓN ACTIVA
          </span>
          <span class="text-alabaster font-semibold">{{ selectedSeat.sectorName }}</span>
          <span class="font-mono text-sand-muted">
            FILA <strong class="text-alabaster">{{ selectedSeat.row }}</strong> • ASIENTO
            <strong class="text-alabaster">#{{ selectedSeat.number }}</strong> • ELEVACIÓN
            <strong class="text-gold-bright">{{ selectedSeat.y }}m</strong>
          </span>
        </div>

        <button
          type="button"
          @click="handleExitSeatView"
          class="btn-vanguard btn-state-active px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider"
        >
          Salir de Vista 360°
        </button>
      </div>

      <!-- Contenedor del Visor 3D -->
      <div class="relative rounded-2xl p-[1px] bg-gradient-to-b from-gold/45 via-gold/15 to-alabaster/10 shadow-gold-frame">
        <EstadioSoberaniaThreeViewer
          v-if="activeVenue === 'soberania'"
          :seats="soberaniaModel.seats"
          :tier-blocks="soberaniaModel.tierBlocks"
          :event-type="soberaniaEventType"
          :selected-seat="selectedSeat"
          :highlighted-sector-id="highlightedSectorId"
          :show-grandstand-roof="showGrandstandRoof"
          :show-exterior-environment="showExteriorEnvironment"
          :stadium-lights-on="stadiumLightsOn"
          @select-seat="handleSelectSeat"
          @exit-seat-view="handleExitSeatView"
        />

        <PolideportivoThreeViewer
          v-else
          :seats="poliModel.seats"
          :tier-blocks="poliModel.tierBlocks"
          :vomitories="poliModel.vomitories || []"
          :event-type="poliEventType"
          :selected-seat="selectedSeat"
          :highlighted-sector-id="highlightedSectorId"
          :show-roof-trusses="showRoofTrusses"
          :stadium-lights-on="stadiumLightsOn"
          :wall-color="poliWallColor"
          @select-seat="handleSelectSeat"
          @exit-seat-view="handleExitSeatView"
        />
      </div>
    </main>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

:root {
  /* Derivados de Negro (Obsidiana, Carbón, Grafito) */
  --bg-obsidian: #090a0d;
  --bg-carbon: #101218;
  --bg-graphite: #171a23;

  /* Derivados de Blanco (Alabastro cálido, Arena suave) */
  --text-alabaster: #f3efe6;
  --text-sand: #a8a295;

  /* Oro Champán y Seda Dorada */
  --gold-primary: #d4af37;
  --gold-bright: #e8cc75;
  --gold-deep: #8c6d1f;
}

.font-display {
  font-family: 'Syne', sans-serif;
}
.font-sans {
  font-family: 'Plus Jakarta Sans', sans-serif;
}
.font-mono {
  font-family: 'JetBrains Mono', monospace;
}

.bg-obsidian {
  background-color: var(--bg-obsidian);
}
.bg-carbon {
  background-color: var(--bg-carbon);
}
.bg-obsidian-glass {
  background-color: rgba(12, 14, 19, 0.78);
}

.text-alabaster {
  color: var(--text-alabaster);
}
.text-sand-muted {
  color: var(--text-sand);
}
.text-gold {
  color: var(--gold-primary);
}
.text-gold-bright {
  color: var(--gold-bright);
}

.border-gold\/15 {
  border-color: rgba(212, 175, 55, 0.15);
}
.border-gold\/20 {
  border-color: rgba(212, 175, 55, 0.2);
}
.border-gold\/25 {
  border-color: rgba(212, 175, 55, 0.25);
}
.border-gold\/35 {
  border-color: rgba(212, 175, 55, 0.35);
}
.border-gold\/45 {
  border-color: rgba(212, 175, 55, 0.45);
}

/* Sombra dorada del header flotante */
.shadow-gold-ambient {
  box-shadow:
    0 16px 42px -12px rgba(212, 175, 55, 0.32),
    0 4px 18px -4px rgba(9, 10, 13, 0.85),
    inset 0 1px 0 0 rgba(232, 204, 117, 0.22);
}

.shadow-gold-frame {
  box-shadow: 0 24px 60px -20px rgba(212, 175, 55, 0.18);
}

.hero-vignette {
  background:
    radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.14) 0%, transparent 55%),
    radial-gradient(circle at 50% 50%, transparent 35%, var(--bg-obsidian) 95%);
}

/* ============================================================================
   SISTEMA DE BOTONES VANGUARDISTAS (ACTIVO / HOVER / INACTIVO)
   ============================================================================ */
.btn-vanguard {
  position: relative;
  overflow: hidden;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s ease,
    border-color 0.22s ease,
    background-color 0.22s ease,
    color 0.22s ease;
}

/* Destello diagonal sutil en hover para botones habilitados */
.btn-vanguard:not(:disabled)::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 25%, rgba(232, 204, 117, 0.22) 50%, transparent 75%);
  transform: translateX(-120%);
  transition: transform 0.55s ease;
  pointer-events: none;
}

.btn-vanguard:not(:disabled):hover::after {
  transform: translateX(120%);
}

/* 1. Estado ACTIVO */
.btn-state-active {
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.26) 0%, rgba(140, 109, 31, 0.18) 100%);
  border: 1px solid rgba(232, 204, 117, 0.72);
  color: var(--gold-bright);
  box-shadow:
    0 0 20px rgba(212, 175, 55, 0.22),
    inset 0 1px 0 rgba(243, 239, 230, 0.2);
  cursor: pointer;
}

.btn-state-active:hover {
  transform: translateY(-1.5px);
  border-color: var(--gold-bright);
  box-shadow:
    0 8px 26px -4px rgba(212, 175, 55, 0.4),
    inset 0 1px 0 rgba(243, 239, 230, 0.35);
}

/* 2. Estado DISPONIBLE / IDLE (con hover interactivo) */
.btn-state-idle {
  background-color: rgba(23, 26, 35, 0.75);
  border: 1px solid rgba(243, 239, 230, 0.14);
  color: var(--text-sand);
  cursor: pointer;
}

.btn-state-idle:hover {
  transform: translateY(-1.5px);
  background-color: rgba(28, 32, 43, 0.95);
  border-color: rgba(212, 175, 55, 0.55);
  color: var(--text-alabaster);
  box-shadow: 0 6px 20px -6px rgba(212, 175, 55, 0.28);
}

/* 3. Estado INACTIVO / DESHABILITADO */
.btn-state-disabled,
.btn-vanguard:disabled {
  background-color: rgba(16, 18, 24, 0.45);
  border: 1px solid rgba(243, 239, 230, 0.06);
  color: rgba(168, 162, 149, 0.35);
  box-shadow: none;
  transform: none;
  cursor: not-allowed;
}
</style>