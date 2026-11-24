/**
 * Gemelo Digital 1:1 - Estadio Nacional Soberanía (Managua, Nicaragua)
 * Escala: 1 unidad = 1 metro
 * Orientación real:
 *  - Home Plate: (0, 0, 42)
 *  - Montículo Pitcher: (0, 0.28, 23.56)
 *  - 1ra Base (Derecha): (+19.4, 0, 22.6)
 *  - 3ra Base (Izquierda): (-19.4, 0, 22.6)
 *  - Jardín Central (-Z): (0, 0, -80) -> Distancia Home-Center = 122m (400 ft)
 *  - Gradería Principal (+Z): detrás de Home Plate hacia Z = +85m
 */

export const SOBERANIA_DIMENSIONS = {
  homeZ: 42,
  moundZ: 23.56,
  secondBaseZ: 3.2,
  fenceCenterRadius: 122,
  foulPoleDist: 100.5 // ~330 pies por las rayas de foul
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
    // Cada butaca apunta directamente hacia el montículo/diamante (o tarima en concierto)
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
   * Herradura real detrás de Home Plate:
   * theta = 0 -> directamente detrás de Home Plate (+Z)
   * theta < 0 -> gira hacia 3ra Base (-X)
   * theta > 0 -> gira hacia 1ra Base (+X)
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

      // Escalón de concreto bajo la fila
      const midTheta = (thetaStart + thetaEnd) / 2;
      const bx = Math.sin(midTheta) * radius;
      const bz = homeZ + Math.cos(midTheta) * radius;
      tierBlocks.push({
        x: bx,
        y: Math.max(0.2, y - 0.18),
        z: bz,
        w: arcLength + 0.55,
        h: 0.42,
        d: rowTread + 0.08,
        rotY: midTheta,
        color: level === 2 ? '#0f172a' : '#1e293b'
      });

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
   * Alas laterales rectas a lo largo de las líneas de foul de 1ra Base (+1) y 3ra Base (-1)
   * Avanzan hacia el jardín (-Z) manteniendo distancia paralela a la raya de 45°
   */
  const buildFoulLineGrandstand = ({
    sectorId,
    sectorName,
    level,
    tierLabel,
    sideSign, // -1 = 3ra Base (Izquierda), +1 = 1ra Base (Derecha)
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

    // Vector unitario a lo largo de la línea de foul (45° hacia el jardín)
    const dirAlongX = sideSign * Math.SQRT1_2;
    const dirAlongZ = -Math.SQRT1_2;

    // Vector unitario perpendicular hacia afuera del terreno (hacia las gradas)
    const dirOutX = sideSign * Math.SQRT1_2;
    const dirOutZ = Math.SQRT1_2;

    for (let r = 0; r < rows; r++) {
      const lat = lateralStart + r * rowTread;
      const y = yStart + r * rowRise;

      // Bloque de concreto del ala
      const midAlong = (alongStart + alongEnd) / 2;
      const bx = dirAlongX * midAlong + dirOutX * lat;
      const bz = homeZ + dirAlongZ * midAlong + dirOutZ * lat;
      tierBlocks.push({
        x: bx,
        y: Math.max(0.2, y - 0.18),
        z: bz,
        w: span + 0.5,
        h: 0.42,
        d: rowTread + 0.08,
        rotY: sideSign * (Math.PI / 4),
        color: level === 2 ? '#0f172a' : '#1e293b'
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

  // =========================================================================
  // 1. NIVEL 0: ANILLO INFERIOR (HOME PLATE VIP + 1RA BASE + 3RA BASE)
  // =========================================================================
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
      rows: 17,
      rowTread: 0.85,
      yStart: 0.55,
      rowRise: 0.34,
      baseColor: sec.color,
      isVip: sec.vip
    });
  });

  // Alas laterales bajas hasta los postes de foul (3B y 1B)
  buildFoulLineGrandstand({
    sectorId: 'LF-106',
    sectorName: 'Lateral Baja Jardín Izquierdo (3B)',
    level: 0,
    tierLabel: 'Anillo Inferior',
    sideSign: -1,
    alongStart: 21,
    alongEnd: 68,
    lateralStart: 13.8,
    rows: 16,
    rowTread: 0.85,
    yStart: 0.55,
    rowRise: 0.34,
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
    rows: 16,
    rowTread: 0.85,
    yStart: 0.55,
    rowRise: 0.34,
    baseColor: '#2563eb'
  });

  // =========================================================================
  // 2. NIVEL 1.5: MEZZANINE / PALCOS VIP & CABINA DE PRENSA
  // =========================================================================
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
      radiusStart: 29.2,
      rows: 3,
      rowTread: 0.88,
      yStart: 7.2,
      rowRise: 0.42,
      baseColor: '#6366f1',
      isVip: true
    });
  });

  // =========================================================================
  // 3. NIVEL 2: GRADERÍA PREFERENCIAL ALTA (HERRADURA + ALAS LATERALES)
  // =========================================================================
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
      radiusStart: 32.5,
      rows: 17,
      rowTread: 0.85,
      yStart: 9.5,
      rowRise: 0.56,
      baseColor: '#3b82f6'
    });
  });

  // Ala Alta Jardín Izquierdo (en la foto aérea es más extensa y escalonada hacia LF)
  buildFoulLineGrandstand({
    sectorId: 'SUP-LF-206',
    sectorName: 'Grada Alta Jardín Izquierdo (Escalonada)',
    level: 2,
    tierLabel: 'Gradería Alta',
    sideSign: -1,
    alongStart: 22,
    alongEnd: 74,
    lateralStart: 28.5,
    rows: 15,
    rowTread: 0.85,
    yStart: 8.6,
    rowRise: 0.54,
    baseColor: '#60a5fa'
  });

  // Ala Alta Jardín Derecho (llega hasta el poste de foul de RF)
  buildFoulLineGrandstand({
    sectorId: 'SUP-RF-207',
    sectorName: 'Grada Alta Jardín Derecho',
    level: 2,
    tierLabel: 'Gradería Alta',
    sideSign: 1,
    alongStart: 22,
    alongEnd: 65,
    lateralStart: 28.5,
    rows: 15,
    rowTread: 0.85,
    yStart: 8.6,
    rowRise: 0.54,
    baseColor: '#60a5fa'
  });

  // =========================================================================
  // 4. MODO CONCIERTO: ZONA GRAMA VIP FRENTE A TARIMA EN JARDÍN CENTRAL
  // =========================================================================
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

  // Agrupar sectores únicos
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