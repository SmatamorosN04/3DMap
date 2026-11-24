/**
 * Gemelo Digital 1:1 - Estadio Nacional Soberanía (Managua, Nicaragua)
 * Escala: 1 unidad = 1 metro
 * Pendientes y alturas calibradas para vista libre hacia Home Plate y el Diamante
 * desde cualquier butaca de Nivel Inferior, Palcos y Gradería Alta.
 */

export const SOBERANIA_DIMENSIONS = {
  homeZ: 42,
  moundZ: 23.56,
  secondBaseZ: 3.2,
  fenceCenterRadius: 122,
  foulPoleDist: 100.5
};

export const SOBERANIA_EVENTS = {
  baseball: {
    id: 'baseball',
    name: 'Béisbol Profesional / Selección Nacional',
    focalTitle: 'Diamante Reglamentario • Home Plate & Montículo',
    focalTarget: { x: 0, y: 0.8, z: 18 },
    skyColor: '#070b14'
  },
  derby: {
    id: 'derby',
    name: 'Juego de Estrellas & Home Run Derby',
    focalTitle: 'Zona de Bateo & Jardines Iluminados',
    focalTarget: { x: 0, y: 1.5, z: 26 },
    skyColor: '#0a0818'
  },
  concert: {
    id: 'concert',
    name: 'Concierto Masivo • Tarima Jardín Central',
    focalTitle: 'Escenario Principal • Jardín Central',
    focalTarget: { x: 0, y: 4.0, z: -48 },
    skyColor: '#050508'
  }
};

function rowIndexToLabel(idx) {
  if (idx < 26) return String.fromCharCode(65 + idx);
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

export function buildEstadioSoberaniaModel(eventType = 'baseball') {
  const seats = [];
  const tierBlocks = [];
  const isConcert = eventType === 'concert';

  const lookTarget = isConcert
    ? { x: 0, z: -48 }
    : { x: 0, z: SOBERANIA_DIMENSIONS.moundZ };

  const registerSeat = ({
    sectorId,
    sectorName,
    level,
    tierLabel,
    rowIdx,
    seatNum,
    x,
    y,
    z,
    baseColor,
    isVip = false,
    blocked = false
  }) => {
    const rowLabel = rowIndexToLabel(rowIdx);
    const yaw = Math.atan2(lookTarget.x - x, lookTarget.z - z);

    seats.push({
      id: `${sectorId}-${rowLabel}-${seatNum}`,
      code: `${sectorId}-${rowLabel}${seatNum}`,
      sectorId,
      sectorName,
      level,
      tierLabel,
      row: rowLabel,
      rowNumber: rowIdx + 1,
      number: seatNum,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(z.toFixed(3)),
      yaw: Number(yaw.toFixed(4)),
      baseColor,
      isVip,
      blocked
    });
  };

  /**
   * Herradura detrás de Home Plate con escalones segmentados siguiendo la curvatura
   * para evitar cualquier corte recto que invada la vista de las sillas.
   */
  const buildRearHorseshoeSection = ({
    sectorId,
    sectorName,
    level,
    tierLabel,
    thetaStart,
    thetaEnd,
    radiusStart,
    rows,
    rowTread,
    yStart,
    rowRise,
    baseColor,
    isVip = false
  }) => {
    const homeZ = SOBERANIA_DIMENSIONS.homeZ;
    const arcSpan = Math.abs(thetaEnd - thetaStart);

    for (let r = 0; r < rows; r++) {
      const radius = radiusStart + r * rowTread;
      const y = yStart + r * rowRise;
      const arcLength = radius * arcSpan;
      const cols = Math.max(4, Math.floor(arcLength / 0.58));

      // Subdividir el escalón curvo en 3 tramos cortos para seguir fielmente el arco
      const arcSubSegs = 3;
      for (let seg = 0; seg < arcSubSegs; seg++) {
        const sTheta0 = thetaStart + (seg / arcSubSegs) * (thetaEnd - thetaStart);
        const sTheta1 = thetaStart + ((seg + 1) / arcSubSegs) * (thetaEnd - thetaStart);
        const midTheta = (sTheta0 + sTheta1) / 2;
        const subWidth = (arcLength / arcSubSegs) + 0.15;

        tierBlocks.push({
          x: Math.sin(midTheta) * radius,
          y: Math.max(0.18, y - 0.22),
          z: homeZ + Math.cos(midTheta) * radius,
          w: subWidth,
          h: 0.4,
          d: rowTread + 0.04,
          rotY: midTheta
        });
      }

      for (let c = 0; c < cols; c++) {
        const t = cols === 1 ? 0.5 : c / (cols - 1);
        const theta = thetaStart + t * (thetaEnd - thetaStart);
        const x = Math.sin(theta) * radius;
        const z = homeZ + Math.cos(theta) * radius;

        registerSeat({
          sectorId,
          sectorName,
          level,
          tierLabel,
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          baseColor,
          isVip
        });
      }
    }
  };

  /**
   * Alas laterales rectas a lo largo de 1ra Base (+1) y 3ra Base (-1)
   */
  const buildFoulLineGrandstand = ({
    sectorId,
    sectorName,
    level,
    tierLabel,
    sideSign,
    alongStart,
    alongEnd,
    lateralStart,
    rows,
    rowTread,
    yStart,
    rowRise,
    baseColor
  }) => {
    const homeZ = SOBERANIA_DIMENSIONS.homeZ;
    const span = alongEnd - alongStart;
    const cols = Math.max(6, Math.floor(span / 0.6));

    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    for (let r = 0; r < rows; r++) {
      const lat = lateralStart + r * rowTread;
      const y = yStart + r * rowRise;

      const midAlong = (alongStart + alongEnd) / 2;
      const bx = dirAlongX * midAlong + dirOutX * lat;
      const bz = homeZ + dirAlongZ * midAlong + dirOutZ * lat;
      tierBlocks.push({
        x: bx,
        y: Math.max(0.18, y - 0.22),
        z: bz,
        w: span + 0.45,
        h: 0.4,
        d: rowTread + 0.04,
        rotY: sideSign * (Math.PI / 4)
      });

      for (let c = 0; c < cols; c++) {
        const t = cols === 1 ? 0.5 : c / (cols - 1);
        const along = alongStart + t * span;
        const x = dirAlongX * along + dirOutX * lat;
        const z = homeZ + dirAlongZ * along + dirOutZ * lat;

        registerSeat({
          sectorId,
          sectorName,
          level,
          tierLabel,
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          baseColor
        });
      }
    }
  };

  // 1. NIVEL 0: ANILLO INFERIOR (Pendiente 0.44m por fila para visión limpia sobre filas delanteras)
  const lowerCurvedSectors = [
    { id: '3B-101', name: 'Terreno Dugout 3ra Base', t0: -0.76, t1: -0.46, vip: true, color: '#1d4ed8' },
    { id: '3B-102', name: 'Preferencial Baja 3ra Base', t0: -0.43, t1: -0.19, vip: true, color: '#1e40af' },
    { id: 'HP-103', name: 'VIP Home Plate Central', t0: -0.16, t1: 0.16, vip: true, color: '#d97706' },
    { id: '1B-104', name: 'Preferencial Baja 1ra Base', t0: 0.19, t1: 0.43, vip: true, color: '#1e40af' },
    { id: '1B-105', name: 'Terreno Dugout 1ra Base', t0: 0.46, t1: 0.76, vip: true, color: '#1d4ed8' }
  ];

  lowerCurvedSectors.forEach((sec) => {
    buildRearHorseshoeSection({
      sectorId: sec.id,
      sectorName: sec.name,
      level: 0,
      tierLabel: 'Anillo Inferior',
      thetaStart: sec.t0,
      thetaEnd: sec.t1,
      radiusStart: 13.8,
      rows: 16,
      rowTread: 0.85,
      yStart: 0.65,
      rowRise: 0.44,
      baseColor: sec.color,
      isVip: sec.vip
    });
  });

  buildFoulLineGrandstand({
    sectorId: 'LF-106',
    sectorName: 'Lateral Baja Jardín Izquierdo (3B)',
    level: 0,
    tierLabel: 'Anillo Inferior',
    sideSign: -1,
    alongStart: 21,
    alongEnd: 68,
    lateralStart: 13.8,
    rows: 15,
    rowTread: 0.85,
    yStart: 0.65,
    rowRise: 0.44,
    baseColor: '#2563eb'
  });

  buildFoulLineGrandstand({
    sectorId: 'RF-107',
    sectorName: 'Lateral Baja Jardín Derecho (1B)',
    level: 0,
    tierLabel: 'Anillo Inferior',
    sideSign: 1,
    alongStart: 21,
    alongEnd: 66,
    lateralStart: 13.8,
    rows: 15,
    rowTread: 0.85,
    yStart: 0.65,
    rowRise: 0.44,
    baseColor: '#2563eb'
  });

  // 2. NIVEL 1.5: MEZZANINE / PALCOS VIP (Elevados a y = 8.8m, 100% libres sobre el anillo inferior)
  const palcoSectors = [
    { id: 'PALCO-3B', name: 'Palcos VIP 3ra Base', t0: -0.72, t1: -0.22 },
    { id: 'PALCO-HP', name: 'Palcos Presidenciales Home Plate', t0: -0.19, t1: 0.19 },
    { id: 'PALCO-1B', name: 'Palcos VIP 1ra Base', t0: 0.22, t1: 0.72 }
  ];

  palcoSectors.forEach((sec) => {
    buildRearHorseshoeSection({
      sectorId: sec.id,
      sectorName: sec.name,
      level: 1.5,
      tierLabel: 'Palcos & Mezzanine',
      thetaStart: sec.t0,
      thetaEnd: sec.t1,
      radiusStart: 28.8,
      rows: 3,
      rowTread: 0.88,
      yStart: 8.85,
      rowRise: 0.48,
      baseColor: '#6366f1',
      isVip: true
    });
  });

  // 3. NIVEL 2: GRADERÍA PREFERENCIAL ALTA (Inicia en y = 11.4m para vista panorámica total)
  const upperCurvedSectors = [
    { id: 'SUP-201', name: 'Grada Alta 3ra Base', t0: -0.76, t1: -0.44 },
    { id: 'SUP-202', name: 'Grada Alta Home Izquierda', t0: -0.41, t1: -0.16 },
    { id: 'SUP-203', name: 'Grada Alta Home Plate Central', t0: -0.13, t1: 0.13 },
    { id: 'SUP-204', name: 'Grada Alta Home Derecha', t0: 0.16, t1: 0.41 },
    { id: 'SUP-205', name: 'Grada Alta 1ra Base', t0: 0.44, t1: 0.76 }
  ];

  upperCurvedSectors.forEach((sec) => {
    buildRearHorseshoeSection({
      sectorId: sec.id,
      sectorName: sec.name,
      level: 2,
      tierLabel: 'Gradería Alta',
      thetaStart: sec.t0,
      thetaEnd: sec.t1,
      radiusStart: 32.4,
      rows: 16,
      rowTread: 0.86,
      yStart: 11.4,
      rowRise: 0.58,
      baseColor: '#3b82f6'
    });
  });

  buildFoulLineGrandstand({
    sectorId: 'SUP-LF-206',
    sectorName: 'Grada Alta Jardín Izquierdo (Escalonada)',
    level: 2,
    tierLabel: 'Gradería Alta',
    sideSign: -1,
    alongStart: 22,
    alongEnd: 74,
    lateralStart: 28.4,
    rows: 15,
    rowTread: 0.86,
    yStart: 9.8,
    rowRise: 0.56,
    baseColor: '#60a5fa'
  });

  buildFoulLineGrandstand({
    sectorId: 'SUP-RF-207',
    sectorName: 'Grada Alta Jardín Derecho',
    level: 2,
    tierLabel: 'Gradería Alta',
    sideSign: 1,
    alongStart: 22,
    alongEnd: 65,
    lateralStart: 28.4,
    rows: 15,
    rowTread: 0.86,
    yStart: 9.8,
    rowRise: 0.56,
    baseColor: '#60a5fa'
  });

  // 4. MODO CONCIERTO: ZONA GRAMA VIP
  if (isConcert) {
    for (let r = 0; r < 16; r++) {
      const z = -30 + r * 1.15;
      for (let c = 0; c < 38; c++) {
        const x = -15 + c * 0.8;
        registerSeat({
          sectorId: 'GRAMA-VIP',
          sectorName: 'Zona Grama VIP • Frente a Tarima',
          level: 0,
          tierLabel: 'Grama Concierto',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y: 0.08,
          z,
          baseColor: '#eab308',
          isVip: true
        });
      }
    }
  }

  const sectorsMap = new Map();
  for (const s of seats) {
    if (!sectorsMap.has(s.sectorId)) {
      sectorsMap.set(s.sectorId, {
        id: s.sectorId,
        name: s.sectorName,
        level: s.level,
        tierLabel: s.tierLabel,
        totalSeats: 0,
        activeSeats: 0
      });
    }
    const entry = sectorsMap.get(s.sectorId);
    entry.totalSeats++;
    if (!s.blocked) entry.activeSeats++;
  }

  return {
    seats,
    tierBlocks,
    sectors: Array.from(sectorsMap.values())
  };
}