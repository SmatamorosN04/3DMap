<script setup>
import { ref, computed } from 'vue';
import PolideportivoThreeViewer from '../components/PolideportivoThreeViewer.vue';
import { EVENT_CONFIGS, buildPolideportivoModel } from '../data/polideportivoAlexisArguello.js';

const eventType = ref('basketball');
const selectedLevelFilter = ref('all'); // 'all' | 0 | 1 | 1.5 | 2
const selectedSectorId = ref('');
const selectedRowFilter = ref('');
const selectedSeat = ref(null);

const showRoofTrusses = ref(true);
const stadiumLightsOn = ref(true);
const wallColor = ref('#0c1526');

const WALL_PRESETS = [
  { name: 'Azul Polideportivo', value: '#0c1526' },
  { name: 'Obsidiana', value: '#090d16' },
  { name: 'Arena / Concreto', value: '#27272a' },
  { name: 'Púrpura Gala', value: '#190d26' }
];

// Modelo 3D generado dinámicamente según montaje (Baloncesto / Boxeo / Concierto)
const arenaModel = computed(() => buildPolideportivoModel(eventType.value));

const filteredSectors = computed(() => {
  if (selectedLevelFilter.value === 'all') return arenaModel.value.sectors;
  return arenaModel.value.sectors.filter((s) => s.level === Number(selectedLevelFilter.value));
});

const sectorSeats = computed(() => {
  if (!selectedSectorId.value) return [];
  return arenaModel.value.seats.filter((s) => s.sectorId === selectedSectorId.value);
});

const availableRowsInSector = computed(() => {
  const rows = new Set(sectorSeats.value.map((s) => s.row));
  return Array.from(rows);
});

const visibleSeatsInList = computed(() => {
  if (!selectedSectorId.value) return [];
  return sectorSeats.value.filter((s) =>
    selectedRowFilter.value ? s.row === selectedRowFilter.value : true
  );
});

const activeSeatsCount = computed(() =>
  arenaModel.value.seats.filter((s) => !s.blocked).length
);

const seatTelemetry = computed(() => {
  if (!selectedSeat.value) return null;
  const s = selectedSeat.value;
  const target = EVENT_CONFIGS[eventType.value].focalTarget;
  const distanceMeters = Math.hypot(s.x - target.x, s.y - target.y, s.z - target.z);

  return {
    seat_id: s.id,
    codigo_ticket: s.code,
    sector: s.sectorName,
    anillo: s.tierLabel,
    fila: s.row,
    asiento: s.number,
    coordenadas_3d: { x: s.x, y: s.y, z: s.z },
    elevacion_metros: `${s.y.toFixed(2)} m`,
    distancia_foco: `${distanceMeters.toFixed(1)} m`
  };
});

function changeEventSetup(nextType) {
  eventType.value = nextType;
  wallColor.value = EVENT_CONFIGS[nextType].wallColor;
  selectedSeat.value = null;
}

function handleSelectSector(sectorId) {
  selectedSectorId.value = sectorId;
  selectedRowFilter.value = '';
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
    <!-- Encabezado -->
    <div class="max-w-[1600px] mx-auto mb-4 flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl px-5 py-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-400/30">
            GEMELO DIGITAL 3D • THREE.JS
          </span>
          <span class="text-xs text-slate-400">Managua, Nicaragua</span>
        </div>
        <h1 class="text-lg md:text-xl font-bold text-white mt-1">
          Polideportivo Alexis Argüello — Mapeo Espacial 1:1
        </h1>
      </div>

      <!-- Métricas del Recinto -->
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Butacas Mapeadas</span>
          <strong class="text-sm text-sky-300">{{ arenaModel.seats.length.toLocaleString() }}</strong>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Habilitadas Evento</span>
          <strong class="text-sm text-emerald-400">{{ activeSeatsCount.toLocaleString() }}</strong>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Sectores</span>
          <strong class="text-sm text-white">{{ arenaModel.sectors.length }}</strong>
        </div>
      </div>
    </div>

    <!-- Layout Principal: Visor 3D + Inspector de Sectores y Butacas -->
    <div class="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-4">
      <!-- Visor Three.js (9 columnas) -->
      <div class="xl:col-span-9">
        <PolideportivoThreeViewer
          :seats="arenaModel.seats"
          :tier-blocks="arenaModel.tierBlocks"
          :vomitories="arenaModel.vomitories"
          :event-type="eventType"
          :selected-seat="selectedSeat"
          :highlighted-sector-id="selectedSectorId"
          :show-roof-trusses="showRoofTrusses"
          :stadium-lights-on="stadiumLightsOn"
          :wall-color="wallColor"
          @select-seat="(seat) => (selectedSeat = seat)"
          @exit-seat-view="selectedSeat = null"
        />
      </div>

      <!-- Panel Lateral de Exploración y Metadatos (3 columnas) -->
      <aside class="xl:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 max-h-[700px] overflow-y-auto">
        <!-- 1. Tipo de Montaje del Polideportivo -->
        <div class="space-y-2">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            1. Configuración del Recinto
          </span>
          <div class="grid grid-cols-1 gap-1.5 text-xs">
            <button
              v-for="cfg in Object.values(EVENT_CONFIGS)"
              :key="cfg.id"
              type="button"
              @click="changeEventSetup(cfg.id)"
              :class="[
                'text-left px-3 py-2 rounded-xl border transition cursor-pointer',
                eventType === cfg.id
                  ? 'bg-sky-600/25 border-sky-400 text-white font-semibold'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              ]"
            >
              <div>{{ cfg.name }}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">{{ cfg.focalTitle }}</div>
            </button>
          </div>
        </div>

        <!-- 2. Entorno Arquitectónico -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            2. Entorno e Iluminación
          </span>

          <label class="flex items-center justify-between cursor-pointer text-slate-300">
            <span>Reflectores principales</span>
            <input v-model="stadiumLightsOn" type="checkbox" class="accent-sky-400 cursor-pointer" />
          </label>

          <label class="flex items-center justify-between cursor-pointer text-slate-300">
            <span>Cerchas metálicas de techo</span>
            <input v-model="showRoofTrusses" type="checkbox" class="accent-sky-400 cursor-pointer" />
          </label>

          <div class="pt-1 border-t border-slate-800/80 flex items-center justify-between">
            <span class="text-slate-400 text-[11px]">Muros recinto:</span>
            <div class="flex items-center gap-1.5">
              <button
                v-for="p in WALL_PRESETS"
                :key="p.value"
                type="button"
                @click="wallColor = p.value"
                :title="p.name"
                :class="[
                  'w-4 h-4 rounded-full border cursor-pointer',
                  wallColor === p.value ? 'border-white scale-110' : 'border-slate-600'
                ]"
                :style="{ backgroundColor: p.value }"
              ></button>
            </div>
          </div>
        </div>

        <!-- 3. Explorador por Anillo / Sector / Fila -->
        <div class="space-y-2 text-xs">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            3. Localizar Sector y Butaca
          </span>

          <div class="grid grid-cols-4 gap-1 text-[11px]">
            <button
              type="button"
              @click="selectedLevelFilter = 'all'; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 'all'
                  ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Todos
            </button>
            <button
              type="button"
              @click="selectedLevelFilter = 0; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 0
                  ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              VIP
            </button>
            <button
              type="button"
              @click="selectedLevelFilter = 1; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 1
                  ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Platea
            </button>
            <button
              type="button"
              @click="selectedLevelFilter = 2; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 2
                  ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Alta
            </button>
          </div>

          <select
            :value="selectedSectorId"
            @change="(e) => handleSelectSector(e.target.value)"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            <option value="">-- Seleccionar Sector ({{ filteredSectors.length }}) --</option>
            <option v-for="sec in filteredSectors" :key="sec.id" :value="sec.id">
              {{ sec.name }} ({{ sec.activeSeats }} sillas)
            </option>
          </select>

          <select
            v-if="selectedSectorId"
            v-model="selectedRowFilter"
            class="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            <option value="">Todas las filas ({{ availableRowsInSector.length }})</option>
            <option v-for="r in availableRowsInSector" :key="r" :value="r">
              Fila {{ r }}
            </option>
          </select>

          <!-- Lista de butacas del sector filtrado -->
          <div
            v-if="selectedSectorId"
            class="max-h-36 overflow-y-auto grid grid-cols-4 gap-1 p-1.5 rounded-xl bg-slate-950 border border-slate-800"
          >
            <button
              v-for="seat in visibleSeatsInList"
              :key="seat.id"
              type="button"
              :disabled="seat.blocked"
              @click="selectedSeat = seat"
              :class="[
                'py-1 px-1.5 rounded text-[10px] font-bold border transition truncate',
                seat.blocked
                  ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                  : selectedSeat?.id === seat.id
                    ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-sky-400 cursor-pointer'
              ]"
            >
              {{ seat.row }}-{{ seat.number }}
            </button>
          </div>
        </div>

        <!-- 4. Ficha Técnica de la Butaca (Base para el futuro sistema de Tickets) -->
        <div
          v-if="seatTelemetry"
          class="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 space-y-1.5 text-xs"
        >
          <div class="flex items-center justify-between">
            <span class="font-bold text-emerald-300">Ficha Espacial de Butaca</span>
            <span class="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
              {{ seatTelemetry.codigo_ticket }}
            </span>
          </div>
          <div class="text-[11px] text-slate-300 space-y-0.5">
            <div><span class="text-slate-400">Sector:</span> {{ seatTelemetry.sector }}</div>
            <div><span class="text-slate-400">Ubicación:</span> Fila {{ seatTelemetry.fila }} • Silla #{{ seatTelemetry.asiento }}</div>
            <div><span class="text-slate-400">Elevación real:</span> {{ seatTelemetry.elevacion_metros }}</div>
            <div><span class="text-slate-400">Distancia al centro:</span> {{ seatTelemetry.distancia_foco }}</div>
          </div>
          <button
            type="button"
            @click="selectedSeat = null"
            class="w-full mt-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer"
          >
            Volver a vista panorámica
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>