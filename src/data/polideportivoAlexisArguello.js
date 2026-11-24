/**
 * Gemelo Digital Paramétrico - Polideportivo Alexis Argüello (Managua, Nicaragua)
 * Escala: 1 unidad = 1 metro
 * Calibrado con convergencia natural de butacas y escalonado limpio sin obstrucciones.
 */

export const ARENA_DIMENSIONS = {
  outerWidth: 88,
  outerDepth: 78,
  wallHeight: 24.5,
  roofHeight: 23.2
};

export const EVENT_CONFIGS = {
  basketball: {
    id: 'basketball',
    name: 'Baloncesto FIBA / Selección Nacional',
    focalTitle: 'Duela FIBA • 28m × 15m',
    focalTarget: { x: 0, y: 1.35, z: 0 },
    wallColor: '#0c1526'
  },
  boxing: {
    id: 'boxing',
    name: 'Velada de Boxeo / MMA Internacional',
    focalTitle: 'Ring Central • Campeonatos Mundiales',
    focalTarget: { x: 0, y: 1.85, z: 0 },
    wallColor: '#140c1c'
  },
  concert: {
    id: 'concert',
    name: 'Concierto / Show Escenario Oeste',
    focalTitle: 'Escenario Principal • Producción 180°',
    focalTarget: { x: -15, y: 3.2, z: 0 },
    wallColor: '#090d16'
  }
};

function rowIndexToLabel(idx) {
  if (idx < 26) return String.fromCharCode(65 + idx);
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

function blendAngles(targetAngle, sectionNormalAngle, targetWeight = 0.65) {
  const normalWeight = 1 - targetWeight;
  const x = Math.cos(targetAngle) * targetWeight + Math.cos(sectionNormalAngle) * normalWeight;
  const y = Math.sin(targetAngle) * targetWeight + Math.sin(sectionNormalAngle) * normalWeight;
  return Math.atan2(y, x);
}

export function buildPolideportivoModel(eventType = 'basketball') {
  const seats = [];
  const tierBlocks = [];
  const vomitories = [];

  const isConcert = eventType === 'concert';
  const isBoxing = eventType === 'boxing';
  const focal = EVENT_CONFIGS[eventType]?.focalTarget || { x: 0, y: 1.35, z: 0 };

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
    sectionYaw,
    baseColor,
    isVip = false
  }) => {
    const rowLabel = rowIndexToLabel(rowIdx);
    const blockedByStage = isConcert && x < -19.5;
    const toTargetYaw = Math.atan2(focal.x - x, focal.z - z);
    const yaw = blendAngles(toTargetYaw, sectionYaw, 0.65);

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

  // 1. NIVEL 0: VIP COURTSIDE / RINGSIDE
  const addCourtsideStrip = (sectorId, sectorName, fixedCoord, axis, count, span, sectionYaw, color) => {
    const step = span / count;
    const start = -span / 2 + step / 2;
    for (let i = 0; i < count; i++) {
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
        sectionYaw,
        baseColor: color,
        isVip: true
      });
    }
  };

  addCourtsideStrip('VIP-N', 'Courtside VIP Norte', -10.8, 'x', 42, 30, 0, '#0ea5e9');
  addCourtsideStrip('VIP-S', 'Courtside VIP Sur', 10.8, 'x', 42, 30, Math.PI, '#0ea5e9');
  addCourtsideStrip('VIP-E', 'Courtside VIP Este', 17.6, 'z', 20, 14.5, -Math.PI / 2, '#0ea5e9');
  if (!isConcert) {
    addCourtsideStrip('VIP-O', 'Courtside VIP Oeste', -17.6, 'z', 20, 14.5, Math.PI / 2, '#0ea5e9');
  }

  if (isBoxing) {
    const ringSides = [
      { id: 'RING-N', name: 'Ringside Norte', x: 0, z: -6.2, yaw: 0, axis: 'x' },
      { id: 'RING-S', name: 'Ringside Sur', x: 0, z: 6.2, yaw: Math.PI, axis: 'x' },
      { id: 'RING-E', name: 'Ringside Este', x: 6.2, z: 0, yaw: -Math.PI / 2, axis: 'z' },
      { id: 'RING-O', name: 'Ringside Oeste', x: -6.2, z: 0, yaw: Math.PI / 2, axis: 'z' }
    ];
    ringSides.forEach((side) => {
      for (let r = 0; r < 4; r++) {
        const dist = 5.4 + r * 0.88;
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
            y: 0.04 + r * 0.24,
            z: side.axis === 'z' ? offset : Math.sign(side.z) * dist,
            sectionYaw: side.yaw,
            baseColor: '#f59e0b',
            isVip: true
          });
        }
      }
    });
  }

  // 2. NIVEL 1: ANILLO INFERIOR (Platea Norte, Sur, Este y Oeste)
  const lowerRows = 12;
  const lowerTread = 0.85;
  const lowerRise = 0.45;
  const lowerStartY = 0.55;

  const longSections = [
    { code: '101', xStart: -19.5, xEnd: -12.2 },
    { code: '102', xStart: -11.4, xEnd: -4.1 },
    { code: '103', xStart: -3.3, xEnd: 3.3 },
    { code: '104', xStart: 4.1, xEnd: 11.4 },
    { code: '105', xStart: 12.2, xEnd: 19.5 }
  ];

  longSections.forEach((sec, idx) => {
    const secWidth = sec.xEnd - sec.xStart;
    const centerX = (sec.xStart + sec.xEnd) / 2;
    const cols = Math.floor(secWidth / 0.58);

    // Norte (-Z)
    for (let r = 0; r < lowerRows; r++) {
      const z = -(12.6 + r * lowerTread);
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x: centerX,
        y: Math.max(0.18, y - 0.22),
        z,
        w: secWidth + 0.35,
        h: 0.4,
        d: lowerTread + 0.04
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.6) continue;
        const x = sec.xStart + 0.34 + c * ((secWidth - 0.68) / Math.max(1, cols - 1));
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
          sectionYaw: 0,
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
        y: Math.max(0.18, y - 0.22),
        z,
        w: secWidth + 0.35,
        h: 0.4,
        d: lowerTread + 0.04
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.6) continue;
        const x = sec.xStart + 0.34 + c * ((secWidth - 0.68) / Math.max(1, cols - 1));
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
          sectionYaw: Math.PI,
          baseColor: '#2563eb'
        });
      }
    }

    if (idx === 1 || idx === 3) {
      vomitories.push({ x: centerX, y: lowerStartY + 2.5 * lowerRise, z: 12.6 + 3.5 * lowerTread, rotY: Math.PI });
    }
  });

  // Cabeceras Inferiores Este (+X) y Oeste (-X)
  const endSections = [
    { offsetCode: 0, zStart: -10.8, zEnd: -4.0 },
    { offsetCode: 1, zStart: -3.2, zEnd: 3.2 },
    { offsetCode: 2, zStart: 4.0, zEnd: 10.8 }
  ];

  endSections.forEach((sec, idx) => {
    const secDepth = sec.zEnd - sec.zStart;
    const centerZ = (sec.zStart + sec.zEnd) / 2;
    const cols = Math.floor(secDepth / 0.58);

    const eastCode = String(111 + idx);
    for (let r = 0; r < lowerRows; r++) {
      const x = 19.6 + r * lowerTread;
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x,
        y: Math.max(0.18, y - 0.22),
        z: centerZ,
        w: lowerTread + 0.04,
        h: 0.4,
        d: secDepth + 0.35
      });

      for (let c = 0; c < cols; c++) {
        if (idx === 1 && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.5) continue;
        const z = sec.zStart + 0.34 + c * ((secDepth - 0.68) / Math.max(1, cols - 1));
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
          sectionYaw: -Math.PI / 2,
          baseColor: '#1d4ed8'
        });
      }
    }
    if (idx === 1) {
      vomitories.push({ x: 19.6 + 3.5 * lowerTread, y: lowerStartY + 2.5 * lowerRise, z: 0, rotY: -Math.PI / 2 });
    }

    const westCode = String(114 + idx);
    for (let r = 0; r < lowerRows; r++) {
      const x = -(19.6 + r * lowerTread);
      const y = lowerStartY + r * lowerRise;
      tierBlocks.push({
        x,
        y: Math.max(0.18, y - 0.22),
        z: centerZ,
        w: lowerTread + 0.04,
        h: 0.4,
        d: secDepth + 0.35
      });

      for (let c = 0; c < cols; c++) {
        if (idx === 1 && r >= 2 && r <= 5 && Math.abs(c - cols / 2) < 1.5) continue;
        const z = sec.zStart + 0.34 + c * ((secDepth - 0.68) / Math.max(1, cols - 1));
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
          sectionYaw: Math.PI / 2,
          baseColor: '#1d4ed8'
        });
      }
    }
    if (idx === 1) {
      vomitories.push({ x: -(19.6 + 3.5 * lowerTread), y: lowerStartY + 2.5 * lowerRise, z: 0, rotY: Math.PI / 2 });
    }
  });

  // 3. NIVEL INTERMEDIO: PALCOS VIP / PRENSA (Con losa de balcón propia)
  tierBlocks.push(
    { x: 0, y: 6.72, z: -23.6, w: 38, h: 0.36, d: 2.1 },
    { x: 0, y: 6.72, z: 23.6, w: 38, h: 0.36, d: 2.1 }
  );

  const palcoCols = 52;
  for (let c = 0; c < palcoCols; c++) {
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
      y: 6.92,
      z: -23.6,
      sectionYaw: 0,
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
      y: 6.92,
      z: 23.6,
      sectionYaw: Math.PI,
      baseColor: '#6366f1',
      isVip: true
    });
  }

  // 4. NIVEL 2: ANILLO SUPERIOR (GRADERÍA ALTA PERIMETRAL)
  const upperRows = 14;
  const upperTread = 0.86;
  const upperRise = 0.58;
  const upperStartY = 8.45;

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
    const cols = Math.floor(secWidth / 0.57);

    // Norte (-Z)
    for (let r = 0; r < upperRows; r++) {
      const z = -(25.6 + r * upperTread);
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x: centerX,
        y: y - 0.22,
        z,
        w: secWidth + 0.4,
        h: 0.4,
        d: upperTread + 0.04
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 1 && r <= 4 && Math.abs(c - cols / 2) < 1.5) continue;
        const x = sec.xStart + 0.32 + c * ((secWidth - 0.64) / Math.max(1, cols - 1));
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
          sectionYaw: 0,
          baseColor: '#3b82f6'
        });
      }
    }

    // Sur (+Z)
    const southCode = String(206 + idx);
    for (let r = 0; r < upperRows; r++) {
      const z = 25.6 + r * upperTread;
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x: centerX,
        y: y - 0.22,
        z,
        w: secWidth + 0.4,
        h: 0.4,
        d: upperTread + 0.04
      });

      for (let c = 0; c < cols; c++) {
        if ((idx === 1 || idx === 3) && r >= 1 && r <= 4 && Math.abs(c - cols / 2) < 1.5) continue;
        const x = sec.xStart + 0.32 + c * ((secWidth - 0.64) / Math.max(1, cols - 1));
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
          sectionYaw: Math.PI,
          baseColor: '#3b82f6'
        });
      }
    }
  });

  // Cabeceras Altas Este (+X) y Oeste (-X)
  const upperEndSections = [
    { offsetCode: 0, zStart: -22.5, zEnd: -11.8 },
    { offsetCode: 1, zStart: -10.8, zEnd: -0.6 },
    { offsetCode: 2, zStart: 0.6, zEnd: 10.8 },
    { offsetCode: 3, zStart: 11.8, zEnd: 22.5 }
  ];

  upperEndSections.forEach((sec) => {
    const secDepth = sec.zEnd - sec.zStart;
    const centerZ = (sec.zStart + sec.zEnd) / 2;
    const cols = Math.floor(secDepth / 0.58);

    const eastCode = String(211 + sec.offsetCode);
    for (let r = 0; r < 12; r++) {
      const x = 31.6 + r * upperTread;
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x,
        y: y - 0.22,
        z: centerZ,
        w: upperTread + 0.04,
        h: 0.4,
        d: secDepth + 0.4
      });

      for (let c = 0; c < cols; c++) {
        const z = sec.zStart + 0.32 + c * ((secDepth - 0.64) / Math.max(1, cols - 1));
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
          sectionYaw: -Math.PI / 2,
          baseColor: '#2563eb'
        });
      }
    }

    const westCode = String(215 + sec.offsetCode);
    for (let r = 0; r < 12; r++) {
      const x = -(31.6 + r * upperTread);
      const y = upperStartY + r * upperRise;
      tierBlocks.push({
        x,
        y: y - 0.22,
        z: centerZ,
        w: upperTread + 0.04,
        h: 0.4,
        d: secDepth + 0.4
      });

      for (let c = 0; c < cols; c++) {
        const z = sec.zStart + 0.32 + c * ((secDepth - 0.64) / Math.max(1, cols - 1));
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
          sectionYaw: Math.PI / 2,
          baseColor: '#2563eb'
        });
      }
    }
  });

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