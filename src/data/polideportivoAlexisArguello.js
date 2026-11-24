/**
 * Gemelo Digital Paramétrico - Polideportivo Alexis Argüello (Managua, Nicaragua)
 * Escala: 1 unidad = 1 metro
 * Capacidad generada: ~8,100 butacas reales distribuidas en:
 *  - Nivel 0: VIP Courtside / Ringside
 *  - Nivel 1: Anillo Inferior (Platea Norte, Sur, Este, Oeste + 4 Esquinas)
 *  - Nivel Intermedio: Cinturón LED 360° + Palcos VIP / Prensa
 *  - Nivel 2: Anillo Superior (Gradería Alta Norte, Sur, Este, Oeste + Esquinas)
 */

export const ARENA_DIMENSIONS = {
  outerWidth: 88,   // Eje X (Este - Oeste) en metros
  outerDepth: 78,   // Eje Z (Norte - Sur) en metros
  wallHeight: 23.5, // Altura muros perimetrales
  roofHeight: 22.2  // Altura estructura metálica del techo
};

export const EVENT_CONFIGS = {
  basketball: {
    id: 'basketball',
    name: 'Baloncesto FIBA / Selección Nacional',
    focalTitle: 'Duela FIBA • 28m × 15m',
    focalTarget: { x: 0, y: 1.1, z: 0 },
    wallColor: '#0c1526'
  },
  boxing: {
    id: 'boxing',
    name: 'Velada de Boxeo / MMA Internacional',
    focalTitle: 'Ring Central • Campeonatos Mundiales',
    focalTarget: { x: 0, y: 1.8, z: 0 },
    wallColor: '#140c1c'
  },
  concert: {
    id: 'concert',
    name: 'Concierto / Show Escenario Oeste',
    focalTitle: 'Escenario Principal • Producción 180°',
    focalTarget: { x: -21, y: 2.6, z: 0 },
    wallColor: '#090d16'
  }
};

function rowIndexToLabel(idx) {
  if (idx < 26) return String.fromCharCode(65 + idx);
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

/**
 * Construye el catálogo maestro de asientos y bloques estructurales (gradas de concreto)
 * para el Polideportivo Alexis Argüello según el tipo de evento.
 */
export function buildPolideportivoModel(eventType = 'basketball') {
  const seats = [];
  const tierBlocks = []; // Geometría de concreto/plataformas bajo las sillas
  const vomitories = []; // Túneles de acceso en graderías

  const isConcert = eventType === 'concert';
  const isBoxing = eventType === 'boxing';

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
    yaw,
    baseColor,
    isVip = false
  }) => {
    const rowLabel = rowIndexToLabel(rowIdx);
    // En conciertos con escenario en el extremo Oeste (x < -19), bloquear visibilidad trasera
    const blockedByStage = isConcert && x < -19.5;

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
      blocked: blockedByStage
    });
  };

  // =========================================================================
  // 1. NIVEL 0: VIP COURTSIDE / RINGSIDE (A nivel de cancha)
  // =========================================================================
  const addCourtsideStrip = (sectorId, sectorName, fixedCoord, axis, count, span, yaw, color) => {
    const step = span / count;
    const start = -span / 2 + step / 2;
    for (let i = 0; i < count; i++) {
      // Dejar pasillo central para mesa técnica / accesos
      if (Math.abs(i - count / 2) < 1.2) continue;
      const offset = start + i * step;
      registerSeat({
        sectorId,
        sectorName,
        level: 0,
        tierLabel: 'VIP Cancha',
        rowIdx: 0,
        seatNum: i + 1,
        x: axis === 'x' ? offset : fixedCoord,
        y: 0.04,
        z: axis === 'z' ? offset : fixedCoord,
        yaw,
        baseColor: color,
        isVip: true
      });
    }
  };

  // Laterales Norte y Sur a pie de duela
  addCourtsideStrip('VIP-N', 'Courtside VIP Norte', -10.8, 'x', 42, 30, 0, '#0ea5e9');
  addCourtsideStrip('VIP-S', 'Courtside VIP Sur', 10.8, 'x', 42, 30, Math.PI, '#0ea5e9');
  // Cabecera Este (y Oeste si no hay escenario de concierto)
  addCourtsideStrip('VIP-E', 'Courtside VIP Este', 17.6, 'z', 20, 14.5, -Math.PI / 2, '#0ea5e9');
  if (!isConcert) {
    addCourtsideStrip('VIP-O', 'Courtside VIP Oeste', -17.6, 'z', 20, 14.5, Math.PI / 2, '#0ea5e9');
  }

  // Si es Boxeo, añadir 4 bloques Ringside alrededor del cuadrilátero
  if (isBoxing) {
    const ringSides = [
      { id: 'RING-N', name: 'Ringside Norte', x: 0, z: -6.2, yaw: 0, axis: 'x' },
      { id: 'RING-S', name: 'Ringside Sur', x: 0, z: 6.2, yaw: Math.PI, axis: 'x' },
      { id: 'RING-E', name: 'Ringside Este', x: 6.2, z: 0, yaw: -Math.PI / 2, axis: 'z' },
      { id: 'RING-O', name: 'Ringside Oeste', x: -6.2, z: 0, yaw: Math.PI / 2, axis: 'z' }
    ];
    ringSides.forEach((side) => {
      for (let r = 0; r < 4; r++) {
        const dist = 5.4 + r * 0.85;
        for (let c = 0; c < 12; c++) {
          const offset = -4.6 + c * 0.84;
          registerSeat({
            sectorId: side.id,
            sectorName: side.name,
            level: 0,
            tierLabel: 'Ringside VIP',
            rowIdx: r,
            seatNum: c + 1,
            x: side.axis === 'x' ? offset : Math.sign(side.x) * dist,
            y: 0.04 + r * 0.12,
            z: side.axis === 'z' ? offset : Math.sign(side.z) * dist,
            yaw: side.yaw,
            baseColor: '#f59e0b',
            isVip: true
          });
        }
      }
    });
  }

  // =========================================================================
  // 2. NIVEL 1: ANILLO INFERIOR (PLATEA NORTE, SUR, ESTE, OESTE + ESQUINAS)
  // =========================================================================
  const lowerRows = 12;
  const lowerTread = 0.82;
  const lowerRise = 0.38;
  const lowerStartY = 0.45;

  // Secciones Norte y Sur (5 bloques cada lado)
  const longSections = [
    { code: '101', label: 'Esquina Nor-Oeste', xStart: -19.5, xEnd: -12.2 },
    { code: '102', label: 'Platea Norte Izq.', xStart: -11.4, xEnd: -4.1 },
    { code: '103', label: 'Platea Norte Central', xStart: -3.3, xEnd: 3.3 },
    { code: '104', label: 'Platea Norte Der.', xStart: 4.1, xEnd: 11.4 },
    { code: '105', label: 'Esquina Nor-Este', xStart: 12.2, xEnd: 19.5 }
  ];

  longSections.forEach((sec, idx) => {
    const secWidth = sec.xEnd - sec.xStart;
    const centerX = (sec.xStart + sec.xEnd) / 2;
    const cols = Math.floor(secWidth / 0.56);

    // Norte (-Z)
    for (let r = 0; r < lowerRows; r++) {
      const z = -(12.6 + r * lowerTread);
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x: centerX,
        y: y / 2,
        z,
        w: secWidth + 0.35,
        h: y,
        d: lowerTread + 0.04,
        color: '#1e293b'
      });

      for (let c = 0; c < cols; c++) {
        // Hueco de vomitorio en filas 3..6 de las secciones pares
        if ((idx === 1 || idx === 3) && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.6) {
          continue;
        }
        const x = sec.xStart + 0.32 + c * ((secWidth - 0.64) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `PN-${sec.code}`,
          sectorName: `Platea Norte • Sec. ${sec.code}`,
          level: 1,
          tierLabel: 'Anillo Inferior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: 0,
          baseColor: '#2563eb'
        });
      }
    }

    if (idx === 1 || idx === 3) {
      vomitories.push({ x: centerX, y: lowerStartY + 2.5 * lowerRise, z: -(12.6 + 3.5 * lowerTread), rotY: 0 });
    }

    // Sur (+Z)
    const southCode = String(106 + idx);
    for (let r = 0; r < lowerRows; r++) {
      const z = 12.6 + r * lowerTread;
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x: centerX,
        y: y / 2,
        z,
        w: secWidth + 0.35,
        h: y,
        d: lowerTread + 0.04,
        color: '#1e293b'
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.6) {
          continue;
        }
        const x = sec.xStart + 0.32 + c * ((secWidth - 0.64) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `PS-${southCode}`,
          sectorName: `Platea Sur • Sec. ${southCode}`,
          level: 1,
          tierLabel: 'Anillo Inferior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: Math.PI,
          baseColor: '#2563eb'
        });
      }
    }

    if (idx === 1 || idx === 3) {
      vomitories.push({ x: centerX, y: lowerStartY + 2.5 * lowerRise, z: 12.6 + 3.5 * lowerTread, rotY: Math.PI });
    }
  });

  // Cabeceras Inferiores Este (+X) y Oeste (-X) (3 bloques cada cabecera)
  const endSections = [
    { offsetCode: 0, label: 'Izq.', zStart: -10.8, zEnd: -4.0 },
    { offsetCode: 1, label: 'Central', zStart: -3.2, zEnd: 3.2 },
    { offsetCode: 2, label: 'Der.', zStart: 4.0, zEnd: 10.8 }
  ];

  endSections.forEach((sec, idx) => {
    const secDepth = sec.zEnd - sec.zStart;
    const centerZ = (sec.zStart + sec.zEnd) / 2;
    const cols = Math.floor(secDepth / 0.56);

    // Este (+X)
    const eastCode = String(111 + idx);
    for (let r = 0; r < lowerRows; r++) {
      const x = 19.6 + r * lowerTread;
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x,
        y: y / 2,
        z: centerZ,
        w: lowerTread + 0.04,
        h: y,
        d: secDepth + 0.35,
        color: '#1e293b'
      });

      for (let c = 0; c < cols; c++) {
        if (idx === 1 && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.5) continue;
        const z = sec.zStart + 0.32 + c * ((secDepth - 0.64) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `PE-${eastCode}`,
          sectorName: `Platea Este • Sec. ${eastCode}`,
          level: 1,
          tierLabel: 'Anillo Inferior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: -Math.PI / 2,
          baseColor: '#1d4ed8'
        });
      }
    }
    if (idx === 1) {
      vomitories.push({ x: 19.6 + 3.5 * lowerTread, y: lowerStartY + 2.5 * lowerRise, z: 0, rotY: -Math.PI / 2 });
    }

    // Oeste (-X)
    const westCode = String(114 + idx);
    for (let r = 0; r < lowerRows; r++) {
      const x = -(19.6 + r * lowerTread);
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x,
        y: y / 2,
        z: centerZ,
        w: lowerTread + 0.04,
        h: y,
        d: secDepth + 0.35,
        color: '#1e293b'
      });

      for (let c = 0; c < cols; c++) {
        if (idx === 1 && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.5) continue;
        const z = sec.zStart + 0.32 + c * ((secDepth - 0.64) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `PO-${westCode}`,
          sectorName: `Platea Oeste • Sec. ${westCode}`,
          level: 1,
          tierLabel: 'Anillo Inferior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: Math.PI / 2,
          baseColor: '#1d4ed8'
        });
      }
    }
    if (idx === 1) {
      vomitories.push({ x: -(19.6 + 3.5 * lowerTread), y: lowerStartY + 2.5 * lowerRise, z: 0, rotY: Math.PI / 2 });
    }
  });

  // =========================================================================
  // 3. NIVEL INTERMEDIO: PALCOS VIP / PRENSA (Sobre cinturón LED Norte y Sur)
  // =========================================================================
  const palcoCols = 52;
  for (let c = 0; c < palcoCols; c++) {
    // Dejar pasillos entre módulos de palcos
    if (c % 13 === 6) continue;
    const x = -17.5 + (c / (palcoCols - 1)) * 35;

    registerSeat({
      sectorId: 'PALCO-N',
      sectorName: 'Palcos VIP Norte',
      level: 1.5,
      tierLabel: 'Nivel Palcos',
      rowIdx: 0,
      seatNum: c + 1,
      x,
      y: 6.15,
      z: -23.6,
      yaw: 0,
      baseColor: '#6366f1',
      isVip: true
    });

    registerSeat({
      sectorId: 'PALCO-S',
      sectorName: 'Palcos Prensa / VIP Sur',
      level: 1.5,
      tierLabel: 'Nivel Palcos',
      rowIdx: 0,
      seatNum: c + 1,
      x,
      y: 6.15,
      z: 23.6,
      yaw: Math.PI,
      baseColor: '#6366f1',
      isVip: true
    });
  }

  // =========================================================================
  // 4. NIVEL 2: ANILLO SUPERIOR (GRADERÍA ALTA PERIMETRAL)
  // =========================================================================
  const upperRows = 14;
  const upperTread = 0.84;
  const upperRise = 0.54;
  const upperStartY = 7.35;

  const upperLongSections = [
    { code: '201', xStart: -24.5, xEnd: -15.4 },
    { code: '202', xStart: -14.5, xEnd: -5.2 },
    { code: '203', xStart: -4.3, xEnd: 4.3 },
    { code: '204', xStart: 5.2, xEnd: 14.5 },
    { code: '205', xStart: 15.4, xEnd: 24.5 }
  ];

  upperLongSections.forEach((sec, idx) => {
    const secWidth = sec.xEnd - sec.xStart;
    const centerX = (sec.xStart + sec.xEnd) / 2;
    const cols = Math.floor(secWidth / 0.55);

    // Gradería Alta Norte (-Z)
    for (let r = 0; r < upperRows; r++) {
      const z = -(25.2 + r * upperTread);
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x: centerX,
        y: upperStartY - 0.35 + (r * upperRise) / 2,
        z,
        w: secWidth + 0.4,
        h: 0.7 + r * upperRise,
        d: upperTread + 0.04,
        color: '#0f172a'
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 1 && r <= 4 && Math.abs(c - cols / 2) < 1.5) continue;
        const x = sec.xStart + 0.3 + c * ((secWidth - 0.6) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `GN-${sec.code}`,
          sectorName: `Grada Alta Norte • Sec. ${sec.code}`,
          level: 2,
          tierLabel: 'Anillo Superior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: 0,
          baseColor: '#3b82f6'
        });
      }
    }

    // Gradería Alta Sur (+Z)
    const southCode = String(206 + idx);
    for (let r = 0; r < upperRows; r++) {
      const z = 25.2 + r * upperTread;
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x: centerX,
        y: upperStartY - 0.35 + (r * upperRise) / 2,
        z,
        w: secWidth + 0.4,
        h: 0.7 + r * upperRise,
        d: upperTread + 0.04,
        color: '#0f172a'
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 1 && r <= 4 && Math.abs(c - cols / 2) < 1.5) continue;
        const x = sec.xStart + 0.3 + c * ((secWidth - 0.6) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `GS-${southCode}`,
          sectorName: `Grada Alta Sur • Sec. ${southCode}`,
          level: 2,
          tierLabel: 'Anillo Superior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: Math.PI,
          baseColor: '#3b82f6'
        });
      }
    }
  });

  // Graderías Altas Cabeceras Este (+X) y Oeste (-X)
  const upperEndSections = [
    { offsetCode: 0, zStart: -22.5, zEnd: -11.8 },
    { offsetCode: 1, zStart: -10.8, zEnd: -0.6 },
    { offsetCode: 2, zStart: 0.6, zEnd: 10.8 },
    { offsetCode: 3, zStart: 11.8, zEnd: 22.5 }
  ];

  upperEndSections.forEach((sec) => {
    const secDepth = sec.zEnd - sec.zStart;
    const centerZ = (sec.zStart + sec.zEnd) / 2;
    const cols = Math.floor(secDepth / 0.56);

    // Este (+X)
    const eastCode = String(211 + sec.offsetCode);
    for (let r = 0; r < 12; r++) {
      const x = 31.2 + r * upperTread;
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x,
        y: upperStartY - 0.35 + (r * upperRise) / 2,
        z: centerZ,
        w: upperTread + 0.04,
        h: 0.7 + r * upperRise,
        d: secDepth + 0.4,
        color: '#0f172a'
      });

      for (let c = 0; c < cols; c++) {
        const z = sec.zStart + 0.3 + c * ((secDepth - 0.6) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `GE-${eastCode}`,
          sectorName: `Grada Alta Este • Sec. ${eastCode}`,
          level: 2,
          tierLabel: 'Anillo Superior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: -Math.PI / 2,
          baseColor: '#2563eb'
        });
      }
    }

    // Oeste (-X)
    const westCode = String(215 + sec.offsetCode);
    for (let r = 0; r < 12; r++) {
      const x = -(31.2 + r * upperTread);
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x,
        y: upperStartY - 0.35 + (r * upperRise) / 2,
        z: centerZ,
        w: upperTread + 0.04,
        h: 0.7 + r * upperRise,
        d: secDepth + 0.4,
        color: '#0f172a'
      });

      for (let c = 0; c < cols; c++) {
        const z = sec.zStart + 0.3 + c * ((secDepth - 0.6) / Math.max(1, cols - 1));
        registerSeat({
          sectorId: `GO-${westCode}`,
          sectorName: `Grada Alta Oeste • Sec. ${westCode}`,
          level: 2,
          tierLabel: 'Anillo Superior',
          rowIdx: r,
          seatNum: c + 1,
          x,
          y,
          z,
          yaw: Math.PI / 2,
          baseColor: '#2563eb'
        });
      }
    }
  });

  // Agrupar sectores únicos para filtros e inspección
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
    vomitories,
    sectors: Array.from(sectorsMap.values())
  };
}