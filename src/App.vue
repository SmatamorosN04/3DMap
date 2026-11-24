<script setup>
import { ref } from 'vue';
import SeatPreviewView from './views/SeatPreviewView.vue';
import EstadioSoberaniaView from './views/EstadioSoberaniaView.vue';
import PolideportivoThreeViewer from './views/PolideportivoThreeViewer.vue';
// 'landing' | 'soberania' | 'polideportivo' | 'creator'
const activeView = ref('landing');

function navigateTo(view) {
  activeView.value = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<template>
  <div class="min-h-screen bg-[#09090B] text-white selection:bg-[#D4AF37] selection:text-black">
    <!-- ==================== BARRA DE NAVEGACIÓN SUPERIOR ==================== -->
    <nav class="sticky top-0 z-50 border-b border-[#D4AF37]/25 bg-[#09090B]/95 backdrop-blur-md">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <!-- Marca -->
        <button
          type="button"
          @click="navigateTo('landing')"
          class="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
        >
          <span class="w-9 h-9 rounded-lg border border-[#D4AF37]/60 bg-black flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.2)] group-hover:border-[#D4AF37] transition">
            <span class="text-[#D4AF37] font-black text-sm tracking-tighter">3D</span>
          </span>
          <div>
            <span class="block text-sm font-extrabold tracking-wide text-white uppercase">
              Arena<span class="text-[#D4AF37]">360</span> Studio
            </span>
            <span class="block text-[10px] tracking-[0.2em] text-neutral-400 uppercase">
              Mapeo Espacial &amp; Ticketing
            </span>
          </div>
        </button>

        <!-- Selector Rápido de Vistas -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            @click="navigateTo('landing')"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border',
              activeView === 'landing'
                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                : 'bg-transparent text-neutral-300 border-white/15 hover:border-[#D4AF37]/60 hover:text-white'
            ]"
          >
            Inicio
          </button>

          <button
            type="button"
            @click="navigateTo('soberania')"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border',
              activeView === 'soberania'
                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                : 'bg-transparent text-neutral-300 border-white/15 hover:border-[#D4AF37]/60 hover:text-white'
            ]"
          >
            Estadio Soberanía 3D
          </button>

          <button
            type="button"
            @click="navigateTo('polideportivo')"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border',
              activeView === 'polideportivo'
                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                : 'bg-transparent text-neutral-300 border-white/15 hover:border-[#D4AF37]/60 hover:text-white'
            ]"
          >
            Polideportivo 3D
          </button>

          <button
            type="button"
            @click="navigateTo('creator')"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border',
              activeView === 'creator'
                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                : 'bg-transparent text-neutral-300 border-white/15 hover:border-[#D4AF37]/60 hover:text-white'
            ]"
          >
            Creador Multi-Plataforma
          </button>
        </div>
      </div>
    </nav>

    <!-- ==================== VISTA 1: LANDING PRINCIPAL (BLANCO, NEGRO Y DORADO) ==================== -->
    <template v-if="activeView === 'landing'">
      <!-- HEADER DE PRESENTACIÓN DEL PROYECTO -->
      <header class="relative overflow-hidden border-b border-[#D4AF37]/20 bg-gradient-to-b from-black via-[#09090B] to-[#111114]">
        <div
          class="absolute inset-0 opacity-20 pointer-events-none"
          style="
            background-image: radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.35), transparent 65%),
              linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
            background-size: 100% 100%, 48px 48px, 48px 48px;
          "
        ></div>

        <div class="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24 text-center">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#E6C55A] text-xs font-semibold tracking-widest uppercase mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>
            Arquitectura de Recintos &amp; Simulación 360°
          </div>

          <h1 class="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
            Mapeo Espacial en <span class="text-[#D4AF37]">3D Real</span> y
            <span class="text-white underline decoration-[#D4AF37] decoration-2 underline-offset-8">Vista 360°</span> por Butaca
          </h1>

          <p class="mt-6 text-base sm:text-lg text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Plataforma integral de gemelos digitales a escala 1:1 para los principales recintos deportivos de Nicaragua y diseñador paramétrico multi-nivel listo para sistemas de boletería.
          </p>

          <!-- Indicadores Clave -->
          <div class="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div class="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <span class="block text-2xl font-black text-[#D4AF37]">22,900+</span>
              <span class="block text-xs text-neutral-300 mt-1">Butacas 3D mapeadas entre ambos estadios</span>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <span class="block text-2xl font-black text-white">360°</span>
              <span class="block text-xs text-neutral-300 mt-1">Perspectiva exacta en primera persona por silla</span>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <span class="block text-2xl font-black text-[#D4AF37]">60 FPS</span>
              <span class="block text-xs text-neutral-300 mt-1">Renderizado WebGL instanciado en tiempo real</span>
            </div>
          </div>
        </div>
      </header>

      <!-- SECCIÓN DE CARDS CON MINIATURA Y DESCRIPCIÓN DE CADA VIEW -->
      <main class="bg-white text-black py-16 md:py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6">
          <div class="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4 border-b border-neutral-200 pb-6">
            <div>
              <span class="text-xs font-extrabold uppercase tracking-[0.22em] text-[#A88318]">
                Módulos Desarrollados
              </span>
              <h2 class="text-2xl sm:text-3xl font-black text-black mt-1">
                Explora los Entornos 3D Construidos
              </h2>
            </div>
            <p class="text-sm text-neutral-600 max-w-md">
              Accede a cualquiera de los gemelos digitales o al constructor de escenarios personalizados desde sus tarjetas dedicadas.
            </p>
          </div>

          <!-- GRID DE 3 CARDS PRINCIPALES -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-7">
            <!-- ==================== CARD 1: ESTADIO NACIONAL SOBERANÍA 3D ==================== -->
            <article class="group rounded-2xl border-2 border-black bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:shadow-[0_25px_60px_rgba(212,175,55,0.25)] hover:border-[#D4AF37] transition-all duration-300 flex flex-col">
              <!-- Miniatura Visual 3D Diamante de Béisbol -->
              <div class="relative h-56 bg-[#09090B] overflow-hidden border-b border-black/10 p-5 flex items-center justify-center">
                <div class="absolute top-3.5 left-3.5 z-10 flex items-center gap-1.5">
                  <span class="px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-black text-[10px] font-extrabold uppercase tracking-wider">
                    Three.js • WebGL
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-black/85 border border-white/20 text-white text-[10px] font-semibold">
                    ~14,800 Butacas
                  </span>
                </div>

                <!-- Ilustración Isométrica del Estadio Nacional Soberanía -->
                <svg
                  viewBox="0 0 360 200"
                  class="w-full h-full max-w-[320px] transform group-hover:scale-105 transition-transform duration-500"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <!-- Barda Exterior de Jardines -->
                  <path
                    d="M 55 82 Q 180 12 305 82 L 245 168 Q 180 190 115 168 Z"
                    fill="#121216"
                    stroke="#D4AF37"
                    stroke-width="2"
                  />
                  <!-- Herradura de Gradería Superior -->
                  <path
                    d="M 88 122 L 122 162 Q 180 184 238 162 L 272 122"
                    stroke="#FFFFFF"
                    stroke-width="2"
                    stroke-dasharray="4 3"
                  />
                  <!-- Herradura Terreno VIP -->
                  <path
                    d="M 108 116 L 136 148 Q 180 165 224 148 L 252 116"
                    stroke="#D4AF37"
                    stroke-width="1.8"
                  />
                  <!-- Diamante de Béisbol -->
                  <polygon
                    points="180,82 214,114 180,146 146,114"
                    fill="#D4AF37"
                    fill-opacity="0.22"
                    stroke="#FFFFFF"
                    stroke-width="1.6"
                  />
                  <!-- Montículo central -->
                  <circle cx="180" cy="114" r="5" fill="#D4AF37" />
                  <!-- Línea de visión 360° desde Home Plate -->
                  <polygon points="180,156 140,86 220,86" fill="#D4AF37" fill-opacity="0.18" />
                  <circle cx="180" cy="156" r="4.5" fill="#FFFFFF" stroke="#D4AF37" stroke-width="2" />
                </svg>

                <span class="absolute bottom-2.5 right-3.5 text-[10px] font-mono uppercase tracking-widest text-[#D4AF37]/85">
                  Béisbol • Managua
                </span>
              </div>

              <!-- Contenido -->
              <div class="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-widest text-[#A88318]">
                    Gemelo Digital • Béisbol
                  </span>
                  <h3 class="text-xl font-black text-black mt-1">
                    Estadio Nacional Soberanía 3D
                  </h3>
                  <p class="mt-2.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                    Mapeo 1:1 en Three.js con ~14,800 butacas instanciadas: Terreno VIP, Dugouts, Mezzanine/Palcos, Gradería Alta techada, Jardines, torres de luz y 3 montajes (<strong>Béisbol, Derby y Concierto</strong>).
                  </p>

                  <div class="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      Vista 360° al Diamante
                    </span>
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      4 Niveles + Jardines
                    </span>
                  </div>
                </div>

                <div class="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between gap-2">
                  <span class="text-[11px] font-mono text-neutral-500">EstadioSoberaniaView.vue</span>
                  <button
                    type="button"
                    @click="navigateTo('soberania')"
                    class="px-4 py-2 rounded-xl bg-black hover:bg-[#D4AF37] text-white hover:text-black font-bold text-[11px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <span>Explorar</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </article>

            <!-- ==================== CARD 2: POLIDEPORTIVO ALEXIS ARGÜELLO 3D ==================== -->
            <article class="group rounded-2xl border-2 border-black bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:shadow-[0_25px_60px_rgba(212,175,55,0.25)] hover:border-[#D4AF37] transition-all duration-300 flex flex-col">
              <!-- Miniatura Visual 3D -->
              <div class="relative h-56 bg-[#09090B] overflow-hidden border-b border-black/10 p-5 flex items-center justify-center">
                <div class="absolute top-3.5 left-3.5 z-10 flex items-center gap-1.5">
                  <span class="px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-black text-[10px] font-extrabold uppercase tracking-wider">
                    Three.js • WebGL
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-black/85 border border-white/20 text-white text-[10px] font-semibold">
                    ~8,100 Butacas
                  </span>
                </div>

                <!-- Ilustración Isométrica del Polideportivo -->
                <svg
                  viewBox="0 0 360 200"
                  class="w-full h-full max-w-[320px] transform group-hover:scale-105 transition-transform duration-500"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <polygon
                    points="180,18 334,100 180,182 26,100"
                    stroke="#D4AF37"
                    stroke-width="2"
                    fill="#121216"
                  />
                  <polygon
                    points="180,36 302,100 180,164 58,100"
                    stroke="#FFFFFF"
                    stroke-width="1.2"
                    stroke-dasharray="4 3"
                    fill="#18181D"
                  />
                  <polygon
                    points="180,54 270,100 180,146 90,100"
                    stroke="#D4AF37"
                    stroke-width="1.5"
                    fill="#09090B"
                  />
                  <polygon
                    points="180,74 234,100 180,126 126,100"
                    fill="#D4AF37"
                    fill-opacity="0.22"
                    stroke="#FFFFFF"
                    stroke-width="1.6"
                  />
                  <ellipse cx="180" cy="100" rx="12" ry="6" stroke="#D4AF37" stroke-width="1.5" fill="#09090B" />
                  <polygon points="252,72 180,100 212,115" fill="#D4AF37" fill-opacity="0.32" />
                  <circle cx="252" cy="72" r="4.5" fill="#FFFFFF" stroke="#D4AF37" stroke-width="2" />
                </svg>

                <span class="absolute bottom-2.5 right-3.5 text-[10px] font-mono uppercase tracking-widest text-[#D4AF37]/85">
                  Arena • Managua
                </span>
              </div>

              <!-- Contenido -->
              <div class="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-widest text-[#A88318]">
                    Gemelo Digital • Arena
                  </span>
                  <h3 class="text-xl font-black text-black mt-1">
                    Polideportivo Alexis Argüello 3D
                  </h3>
                  <p class="mt-2.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                    Mapeo espacial en Three.js con ~8,100 butacas: VIP Courtside, Anillo Inferior, Cinturón Perimetral LED, Palcos, Gradería Alta y 3 configuraciones (<strong>Baloncesto FIBA, Boxeo/MMA y Concierto</strong>).
                  </p>

                  <div class="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      Vista 360° Real
                    </span>
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      Duela / Ring / Tarima
                    </span>
                  </div>
                </div>

                <div class="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between gap-2">
                  <span class="text-[11px] font-mono text-neutral-500">PolideportivoView.vue</span>
                  <button
                    type="button"
                    @click="navigateTo('polideportivo')"
                    class="px-4 py-2 rounded-xl bg-black hover:bg-[#D4AF37] text-white hover:text-black font-bold text-[11px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <span>Explorar</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </article>

            <!-- ==================== CARD 3: CREADOR DE ESCENARIOS Y MULTI-PLATAFORMA 360° ==================== -->
            <article class="group rounded-2xl border-2 border-black bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:shadow-[0_25px_60px_rgba(212,175,55,0.25)] hover:border-[#D4AF37] transition-all duration-300 flex flex-col">
              <!-- Miniatura Visual 3D -->
              <div class="relative h-56 bg-[#09090B] overflow-hidden border-b border-black/10 p-5 flex items-center justify-center">
                <div class="absolute top-3.5 left-3.5 z-10 flex items-center gap-1.5">
                  <span class="px-2.5 py-0.5 rounded-full bg-white text-black text-[10px] font-extrabold uppercase tracking-wider">
                    Editor Paramétrico
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-black/85 border border-[#D4AF37]/50 text-[#D4AF37] text-[10px] font-semibold">
                    Hasta 4 Plataformas
                  </span>
                </div>

                <!-- Ilustración Isométrica del Creador Multi-Plataforma -->
                <svg
                  viewBox="0 0 360 200"
                  class="w-full h-full max-w-[320px] transform group-hover:scale-105 transition-transform duration-500"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="36"
                    y="22"
                    width="288"
                    height="156"
                    rx="16"
                    fill="#111115"
                    stroke="#FFFFFF"
                    stroke-opacity="0.25"
                    stroke-width="1.5"
                  />
                  <rect x="110" y="34" width="140" height="12" rx="4" fill="#D4AF37" />
                  <rect
                    x="92"
                    y="62"
                    width="176"
                    height="48"
                    rx="8"
                    fill="#19191F"
                    stroke="#D4AF37"
                    stroke-width="1.6"
                  />
                  <g fill="#FFFFFF">
                    <circle cx="116" cy="78" r="3.5" />
                    <circle cx="142" cy="78" r="3.5" />
                    <circle cx="168" cy="78" r="3.5" />
                    <circle cx="194" cy="78" r="3.5" />
                    <circle cx="220" cy="78" r="3.5" />
                    <circle cx="246" cy="78" r="3.5" />

                    <circle cx="128" cy="96" r="3.5" />
                    <circle cx="154" cy="96" r="3.5" />
                    <circle cx="180" cy="96" r="3.5" />
                    <circle cx="206" cy="96" r="3.5" />
                    <circle cx="232" cy="96" r="3.5" />
                  </g>
                  <polygon
                    points="106,126 254,126 268,152 180,164 92,152"
                    fill="#D4AF37"
                    fill-opacity="0.16"
                    stroke="#D4AF37"
                    stroke-width="1.8"
                  />
                  <circle cx="106" cy="126" r="4" fill="#D4AF37" stroke="#09090B" stroke-width="1.5" />
                  <circle cx="254" cy="126" r="4" fill="#D4AF37" stroke="#09090B" stroke-width="1.5" />
                  <circle cx="268" cy="152" r="4" fill="#D4AF37" stroke="#09090B" stroke-width="1.5" />
                  <circle cx="180" cy="164" r="4" fill="#D4AF37" stroke="#09090B" stroke-width="1.5" />
                  <circle cx="92" cy="152" r="4" fill="#D4AF37" stroke="#09090B" stroke-width="1.5" />
                </svg>

                <span class="absolute bottom-2.5 right-3.5 text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                  LocalStorage &amp; 360°
                </span>
              </div>

              <!-- Contenido -->
              <div class="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-widest text-[#A88318]">
                    Constructor Personalizado
                  </span>
                  <h3 class="text-xl font-black text-black mt-1">
                    Creador Multi-Plataforma &amp; 360°
                  </h3>
                  <p class="mt-2.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                    Herramienta en 3 pasos para diseñar auditorios o salas desde cero con <strong>escenarios cuadrados, ovalados o poligonales</strong>, hasta 4 plataformas elevadas, colisiones, edición rápida y color de paredes 360°.
                  </p>

                  <div class="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      Polígonos Arrastrables
                    </span>
                    <span class="px-2 py-0.5 rounded bg-neutral-100 text-black border border-neutral-300">
                      Diseño Libre &amp; Grilla
                    </span>
                  </div>
                </div>

                <div class="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between gap-2">
                  <span class="text-[11px] font-mono text-neutral-500">SeatPreviewView.vue</span>
                  <button
                    type="button"
                    @click="navigateTo('creator')"
                    class="px-4 py-2 rounded-xl bg-black hover:bg-[#D4AF37] text-white hover:text-black font-bold text-[11px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <span>Explorar</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      <!-- FOOTER -->
      <footer class="border-t border-[#D4AF37]/25 bg-black py-8 text-center text-xs text-neutral-400">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            <strong class="text-white">Arena<span class="text-[#D4AF37]">360</span> Studio</strong> • Plataforma de Mapeo Espacial en 3D
          </span>
          <span class="text-neutral-500">
            Estadio Soberanía • Polideportivo Alexis Argüello • Constructor Multi-Plataforma
          </span>
        </div>
      </footer>
    </template>

    <!-- ==================== VISTA 2: ESTADIO NACIONAL SOBERANÍA 3D ==================== -->
    <template v-else-if="activeView === 'soberania'">
      <EstadioSoberaniaView />
    </template>

    <!-- ==================== VISTA 3: POLIDEPORTIVO ALEXIS ARGÜELLO 3D ==================== -->
    <template v-else-if="activeView === 'polideportivo'">
      <PolideportivoThreeViewer />
    </template>

    <!-- ==================== VISTA 4: CREADOR DE ESCENARIOS Y MULTI-PLATAFORMA ==================== -->
    <template v-else>
      <div class="min-h-[calc(100vh-4rem)] bg-neutral-100 p-4 sm:p-6">
        <div class="max-w-7xl mx-auto">
          <SeatPreviewView />
        </div>
      </div>
    </template>
  </div>
</template>