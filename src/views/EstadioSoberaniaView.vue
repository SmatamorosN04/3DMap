<script setup>
import { ref, computed } from 'vue';
import EstadioSoberaniaThreeViewer from '../components/EstadioSoberaniaThreeViewer.vue';
import {
  SOBERANIA_DIMENSIONS,
  SOBERANIA_EVENTS,
  buildEstadioSoberaniaModel
} from '../data/estadioSoberania.js';

const eventType = ref('baseball');
const selectedLevelFilter = ref('all'); // 'all' | 0 | 1.5 | 2
const selectedSectorId = ref('');
const selectedRowFilter = ref('');
const selectedSeat = ref(null);

const showGrandstandRoof = ref(true);
const showExteriorEnvironment = ref(true);
const stadiumLightsOn = ref(true);

const stadiumModel = computed(() => buildEstadioSoberaniaModel(eventType.value));

const filteredSectors = computed(() => {
  if (selectedLevelFilter.value === 'all') return stadiumModel.value.sectors;
  return stadiumModel.value.sectors.filter((s) => s.level === Number(selectedLevelFilter.value));
});

const sectorSeats = computed(() => {
  if (!selectedSectorId.value) return [];
  return stadiumModel.value.seats.filter((s) => s.sectorId === selectedSectorId.value);
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
  stadiumModel.value.seats.filter((s) => !s.blocked).length
);

const seatTelemetry = computed(() => {
  if (!selectedSeat.value) return null;
  const s = selectedSeat.value;
  const distToHome = Math.hypot(s.x, s.y, s.z - SOBERANIA_DIMENSIONS.homeZ);
  const distToMound = Math.hypot(s.x, s.y, s.z - SOBERANIA_DIMENSIONS.moundZ);

  return {
    seat_id: s.id,
    codigo_ticket: s.code,
    sector: s.sectorName,
    anillo: s.tierLabel,
    fila: s.row,
    asiento: s.number,
    elevacion_metros: `${s.y.toFixed(2)} m`,
    distancia_home: `${distToHome.toFixed(1)} m`,
    distancia_monticulo: `${distToMound.toFixed(1)} m`
  };
});

function changeEventSetup(nextType) {
  eventType.value = nextType;
  selectedSeat.value = null;
}

function handleSelectSector(sectorId) {
  selectedSectorId.value = sectorId;
  selectedRowFilter.value = '';
}
</script>

<template>
  <div class="min-h-screen bg-[#09090B] text-slate-100 p-4 md:p-6">
    <!-- Encabezado -->
    <div class="max-w-[1600px] mx-auto mb-4 flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-[#D4AF37]/30 rounded-2xl px-5 py-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#D4AF37]/15 text-[#E6C55A] border border-[#D4AF37]/40">
            GEMELO DIGITAL 1:1 • INTERIOR Y EXTERIOR
          </span>
          <span class="text-xs text-slate-400">Managua, Nicaragua</span>
        </div>
        <h1 class="text-lg md:text-xl font-bold text-white mt-1">
          Estadio Nacional Soberanía — Mapeo Arquitectónico Completo
        </h1>
      </div>

      <!-- Métricas del Estadio -->
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Butacas Mapeadas</span>
          <strong class="text-sm text-[#D4AF37]">{{ stadiumModel.seats.length.toLocaleString() }}</strong>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Habilitadas Evento</span>
          <strong class="text-sm text-emerald-400">{{ activeSeatsCount.toLocaleString() }}</strong>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2">
          <span class="block text-[10px] text-slate-400 uppercase">Sectores</span>
          <strong class="text-sm text-white">{{ stadiumModel.sectors.length }}</strong>
        </div>
      </div>
    </div>

    <!-- Layout Principal: Visor Three.js + Panel Lateral -->
    <div class="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-4">
      <!-- Visor Three.js (9 columnas) -->
      <div class="xl:col-span-9">
        <EstadioSoberaniaThreeViewer
          :seats="stadiumModel.seats"
          :tier-blocks="stadiumModel.tierBlocks"
          :event-type="eventType"
          :selected-seat="selectedSeat"
          :highlighted-sector-id="selectedSectorId"
          :show-grandstand-roof="showGrandstandRoof"
          :show-exterior-environment="showExteriorEnvironment"
          :stadium-lights-on="stadiumLightsOn"
          @select-seat="(seat) => (selectedSeat = seat)"
          @exit-seat-view="selectedSeat = null"
        />
      </div>

      <!-- Panel Lateral de Exploración (3 columnas) -->
      <aside class="xl:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 max-h-[700px] overflow-y-auto">
        <!-- 1. Montaje del Estadio -->
        <div class="space-y-2">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            1. Configuración del Estadio
          </span>
          <div class="grid grid-cols-1 gap-1.5 text-xs">
            <button
              v-for="cfg in Object.values(SOBERANIA_EVENTS)"
              :key="cfg.id"
              type="button"
              @click="changeEventSetup(cfg.id)"
              :class="[
                'text-left px-3 py-2 rounded-xl border transition cursor-pointer',
                eventType === cfg.id
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white font-semibold'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              ]"
            >
              <div>{{ cfg.name }}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">{{ cfg.focalTitle }}</div>
            </button>
          </div>
        </div>

        <!-- 2. Arquitectura Exterior, Techo e Iluminación -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            2. Arquitectura e Iluminación
          </span>

          <label class="flex items-center justify-between cursor-pointer text-slate-300">
            <span>Fachada exterior y entorno</span>
            <input v-model="showExteriorEnvironment" type="checkbox" class="accent-[#D4AF37] cursor-pointer" />
          </label>

          <label class="flex items-center justify-between cursor-pointer text-slate-300">
            <span>Techos voladizos segmentados</span>
            <input v-model="showGrandstandRoof" type="checkbox" class="accent-[#D4AF37] cursor-pointer" />
          </label>

          <label class="flex items-center justify-between cursor-pointer text-slate-300">
            <span>6 Torres de luz nocturna</span>
            <input v-model="stadiumLightsOn" type="checkbox" class="accent-[#D4AF37] cursor-pointer" />
          </label>
        </div>

        <!-- 3. Localizador por Nivel / Sector / Fila -->
        <div class="space-y-2 text-xs">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            3. Localizar Sector y Butaca
          </span>

          <div class="grid grid-cols-4 gap-1 text-[10px]">
            <button
              type="button"
              @click="selectedLevelFilter = 'all'; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 'all'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-bold'
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
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Inferior
            </button>
            <button
              type="button"
              @click="selectedLevelFilter = 1.5; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 1.5
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Palcos
            </button>
            <button
              type="button"
              @click="selectedLevelFilter = 2; selectedSectorId = ''"
              :class="[
                'py-1 rounded-lg border cursor-pointer',
                selectedLevelFilter === 2
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-black font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              ]"
            >
              Alta
            </button>
          </div>

          <select
            :value="selectedSectorId"
            @change="(e) => handleSelectSector(e.target.value)"
            class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
          >
            <option value="">-- Seleccionar Sector ({{ filteredSectors.length }}) --</option>
            <option v-for="sec in filteredSectors" :key="sec.id" :value="sec.id">
              {{ sec.name }} ({{ sec.activeSeats }} sillas)
            </option>
          </select>

          <select
            v-if="selectedSectorId"
            v-model="selectedRowFilter"
            class="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
          >
            <option value="">Todas las filas ({{ availableRowsInSector.length }})</option>
            <option v-for="r in availableRowsInSector" :key="r" :value="r">
              Fila {{ r }}
            </option>
          </select>

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
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-[#D4AF37] cursor-pointer'
              ]"
            >
              {{ seat.row }}-{{ seat.number }}
            </button>
          </div>
        </div>

        <!-- 4. Ficha Espacial de Butaca -->
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
            <div><span class="text-slate-400">Distancia a Home:</span> {{ seatTelemetry.distancia_home }}</div>
            <div><span class="text-slate-400">Distancia a Montículo:</span> {{ seatTelemetry.distancia_monticulo }}</div>
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