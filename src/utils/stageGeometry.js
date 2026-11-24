export const ELEVATION_OVERLAP_THRESHOLD = 90; // Diferencia mínima de altura para permitir superposición multinivel
const VENUE_INNER_MARGIN = 10;
const PLATFORM_GAP = 10;

export function isPointInPolygon(px, pz, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const zi = pts[i].z;
    const xj = pts[j].x;
    const zj = pts[j].z;
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return { x: ax, z: az };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return { x: ax + t * dx, z: az + t * dz };
}

/**
 * Genera el polígono mundial (vértices + puntos medios de arista) de cualquier forma
 */
export function getShapeWorldPerimeter(shape, cx, cz, width, depth, localPoints, samples = 16) {
  if (shape === 'rect') {
    const hw = width / 2;
    const hd = depth / 2;
    return [
      { x: cx - hw, z: cz - hd },
      { x: cx, z: cz - hd },
      { x: cx + hw, z: cz - hd },
      { x: cx + hw, z: cz },
      { x: cx + hw, z: cz + hd },
      { x: cx, z: cz + hd },
      { x: cx - hw, z: cz + hd },
      { x: cx - hw, z: cz }
    ];
  }

  if (shape === 'circle' || shape === 'oval') {
    const rx = width / 2;
    const rz = depth / 2;
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      pts.push({
        x: cx + Math.cos(a) * rx,
        z: cz + Math.sin(a) * rz
      });
    }
    return pts;
  }

  const src = localPoints || [];
  const pts = [];
  for (let i = 0; i < src.length; i++) {
    const p1 = src[i];
    const p2 = src[(i + 1) % src.length];
    pts.push({ x: cx + p1.x, z: cz + p1.z });
    pts.push({
      x: cx + (p1.x + p2.x) * 0.5,
      z: cz + (p1.z + p2.z) * 0.5
    });
  }
  return pts;
}

/**
 * Evalúa si un punto mundial (wx, wz) está dentro del recinto principal y devuelve el punto más cercano dentro si se salió
 */
export function clampWorldPointToVenue(wx, wz, venue, margin = VENUE_INNER_MARGIN) {
  if (venue.shape === 'rect') {
    const maxX = Math.max(40, venue.width / 2 - margin);
    const maxZ = Math.max(40, venue.depth / 2 - margin);
    const clampedX = Math.min(maxX, Math.max(-maxX, wx));
    const clampedZ = Math.min(maxZ, Math.max(-maxZ, wz));
    return {
      x: clampedX,
      z: clampedZ,
      outside: clampedX !== wx || clampedZ !== wz
    };
  }

  if (venue.shape === 'oval') {
    const rx = Math.max(50, venue.width / 2 - margin);
    const rz = Math.max(50, venue.depth / 2 - margin);
    const norm = (wx * wx) / (rx * rx) + (wz * wz) / (rz * rz);
    if (norm <= 1) {
      return { x: wx, z: wz, outside: false };
    }
    const scale = 1 / Math.sqrt(norm);
    return {
      x: wx * scale,
      z: wz * scale,
      outside: true
    };
  }

  // Polígono
  const pts = venue.points || [];
  if (pts.length < 3) return { x: wx, z: wz, outside: false };

  let bestEdgePt = { x: 0, z: 0 };
  let minEdgeDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const cand = closestPointOnSegment(wx, wz, p1.x, p1.z, p2.x, p2.z);
    const d = Math.hypot(wx - cand.x, wz - cand.z);
    if (d < minEdgeDist) {
      minEdgeDist = d;
      bestEdgePt = cand;
    }
  }

  const inside = isPointInPolygon(wx, wz, pts);
  if (inside && minEdgeDist >= margin) {
    return { x: wx, z: wz, outside: false };
  }

  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const vx = cx - bestEdgePt.x;
  const vz = cz - bestEdgePt.z;
  const vLen = Math.hypot(vx, vz) || 1;

  return {
    x: bestEdgePt.x + (vx / vLen) * margin,
    z: bestEdgePt.z + (vz / vLen) * margin,
    outside: true
  };
}

/**
 * Mantiene toda la huella de una plataforma dentro de los límites del escenario principal
 */
export function constrainPlatformToVenue(plat, venue) {
  let x = plat.x;
  let z = plat.z;
  let collided = false;

  for (let pass = 0; pass < 4; pass++) {
    const perimeter = getShapeWorldPerimeter(
      plat.shape,
      x,
      z,
      plat.width,
      plat.depth,
      plat.points,
      16
    );
    let pushX = 0;
    let pushZ = 0;

    for (let i = 0; i < perimeter.length; i++) {
      const pt = perimeter[i];
      const res = clampWorldPointToVenue(pt.x, pt.z, venue, VENUE_INNER_MARGIN);
      if (res.outside) {
        const dx = res.x - pt.x;
        const dz = res.z - pt.z;
        if (Math.abs(dx) > Math.abs(pushX)) pushX = dx;
        if (Math.abs(dz) > Math.abs(pushZ)) pushZ = dz;
        collided = true;
      }
    }

    if (pushX === 0 && pushZ === 0) break;
    x += pushX;
    z += pushZ;
  }

  return { x, z, collided };
}

/**
 * Calcula el vector mínimo de separación (MTV) mediante Separating Axis Theorem (SAT)
 */
function getPolygonSATSeparation(polyA, polyB, gap = PLATFORM_GAP) {
  let minOverlap = Infinity;
  let smallestAxis = null;

  const polygons = [polyA, polyB];
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    const poly = polygons[pIdx];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edgeX = p2.x - p1.x;
      const edgeZ = p2.z - p1.z;
      const len = Math.hypot(edgeX, edgeZ);
      if (len < 1e-5) continue;

      const axisX = -edgeZ / len;
      const axisZ = edgeX / len;

      let minA = Infinity;
      let maxA = -Infinity;
      for (let k = 0; k < polyA.length; k++) {
        const proj = polyA[k].x * axisX + polyA[k].z * axisZ;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity;
      let maxB = -Infinity;
      for (let k = 0; k < polyB.length; k++) {
        const proj = polyB[k].x * axisX + polyB[k].z * axisZ;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      const overlap = Math.min(maxA + gap, maxB) - Math.max(minA - gap, minB);
      if (overlap <= 0) {
        return null; // Eje separador encontrado: no hay colisión
      }
      if (overlap < minOverlap) {
        minOverlap = overlap;
        smallestAxis = { x: axisX, z: axisZ };
      }
    }
  }

  if (!smallestAxis) return null;

  const centerA = polyA.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
  centerA.x /= polyA.length;
  centerA.z /= polyA.length;

  const centerB = polyB.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
  centerB.x /= polyB.length;
  centerB.z /= polyB.length;

  const dirX = centerA.x - centerB.x;
  const dirZ = centerA.z - centerB.z;
  if (dirX * smallestAxis.x + dirZ * smallestAxis.z < 0) {
    smallestAxis.x = -smallestAxis.x;
    smallestAxis.z = -smallestAxis.z;
  }

  return {
    x: smallestAxis.x * minOverlap,
    z: smallestAxis.z * minOverlap
  };
}

/**
 * Resuelve colisiones de una plataforma contra el escenario y contra las demás plataformas.
 * Permite superposición únicamente cuando |elevA - elevB| >= ELEVATION_OVERLAP_THRESHOLD.
 */
export function resolvePlatformPlacement(targetPlat, proposedX, proposedZ, allPlatforms, venue) {
  let x = proposedX;
  let z = proposedZ;
  let collidedWithVenue = false;
  let collidedWithPlatform = false;
  let multilevelOverlap = false;

  for (let iter = 0; iter < 5; iter++) {
    // 1. Mantener dentro del recinto principal
    const venueCheck = constrainPlatformToVenue({ ...targetPlat, x, z }, venue);
    if (venueCheck.collided) {
      x = venueCheck.x;
      z = venueCheck.z;
      collidedWithVenue = true;
    }

    // 2. Comprobar colisión contra cada otra plataforma
    const polyA = getShapeWorldPerimeter(
      targetPlat.shape,
      x,
      z,
      targetPlat.width,
      targetPlat.depth,
      targetPlat.points,
      12
    );

    let movedInIter = false;
    for (let i = 0; i < allPlatforms.length; i++) {
      const other = allPlatforms[i];
      if (other.id === targetPlat.id) continue;

      const polyB = getShapeWorldPerimeter(
        other.shape,
        other.x,
        other.z,
        other.width,
        other.depth,
        other.points,
        12
      );

      const mtv = getPolygonSATSeparation(polyA, polyB, PLATFORM_GAP);
      if (!mtv) continue;

      const elevDiff = Math.abs((targetPlat.baseElevation || 0) - (other.baseElevation || 0));
      if (elevDiff >= ELEVATION_OVERLAP_THRESHOLD) {
        // Elevaciones extremadamente diferentes: superposición permitida (ej. palco sobre platea)
        multilevelOverlap = true;
        continue;
      }

      // Elevaciones cercanas: bloquear superposición empujando fuera
      x += mtv.x;
      z += mtv.z;
      collidedWithPlatform = true;
      movedInIter = true;
    }

    if (!movedInIter) break;
  }

  // Asegurar que tras el empuje entre plataformas siga dentro del escenario
  const finalVenue = constrainPlatformToVenue({ ...targetPlat, x, z }, venue);
  if (finalVenue.collided) {
    x = finalVenue.x;
    z = finalVenue.z;
    collidedWithVenue = true;
  }

  return {
    x: Math.round(x),
    z: Math.round(z),
    collidedWithVenue,
    collidedWithPlatform,
    multilevelOverlap
  };
}