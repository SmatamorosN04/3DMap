import * as THREE from 'three';

const textureCache = new Map();

/**
 * Fusiona geometrías indexadas simples en un solo BufferGeometry con BoundingSphere válido.
 */
export function mergeSimpleGeometries(geometries) {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const g of geometries) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const IndexArray = totalVerts > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(totalIndices);

  let vertOffset = 0;
  let idxOffset = 0;

  for (const g of geometries) {
    const pos = g.attributes.position.array;
    const norm = g.attributes.normal.array;
    positions.set(pos, vertOffset * 3);
    normals.set(norm, vertOffset * 3);

    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        indices[idxOffset + i] = idx[i] + vertOffset;
      }
      idxOffset += idx.length;
    } else {
      const count = g.attributes.position.count;
      for (let i = 0; i < count; i++) {
        indices[idxOffset + i] = i + vertOffset;
      }
      idxOffset += count;
    }

    vertOffset += g.attributes.position.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Carcasa coloreable unificada (Respaldo curvo + Asiento anatómico) -> Solo 60 triángulos.
 */
export function createOptimizedSeatShellGeometry() {
  // Cojín ligeramente inclinado hacia atrás
  const cushion = new THREE.BoxGeometry(0.42, 0.055, 0.38);
  cushion.rotateX(-0.06);
  cushion.translate(0, 0.35, 0.11);

  // Respaldo ergonómico en 3 paneles angulados (efecto envolvente sin ExtrudeGeometry)
  const backCenter = new THREE.BoxGeometry(0.22, 0.42, 0.045);
  backCenter.rotateX(-0.14);
  backCenter.translate(0, 0.59, -0.09);

  const backLeft = new THREE.BoxGeometry(0.11, 0.42, 0.045);
  backLeft.rotateY(0.24);
  backLeft.rotateX(-0.14);
  backLeft.translate(-0.155, 0.59, -0.075);

  const backRight = new THREE.BoxGeometry(0.11, 0.42, 0.045);
  backRight.rotateY(-0.24);
  backRight.rotateX(-0.14);
  backRight.translate(0.155, 0.59, -0.075);

  return mergeSimpleGeometries([cushion, backCenter, backLeft, backRight]);
}

/**
 * Estructura oscura unificada (Pedestal + 2 descansabrazos) -> Solo 36 triángulos.
 */
export function createOptimizedSeatFrameGeometry() {
  const pedestal = new THREE.BoxGeometry(0.38, 0.33, 0.08);
  pedestal.translate(0, 0.165, 0);

  const leftArm = new THREE.BoxGeometry(0.05, 0.04, 0.30);
  leftArm.translate(-0.235, 0.52, 0.05);

  const rightArm = new THREE.BoxGeometry(0.05, 0.04, 0.30);
  rightArm.translate(0.235, 0.52, 0.05);

  return mergeSimpleGeometries([pedestal, leftArm, rightArm]);
}

/**
 * Caché de texturas procedurales para evitar regenerar Canvas en cada cambio de vista.
 */
export function getCachedTexture(key, generatorFn) {
  if (textureCache.has(key)) {
    return textureCache.get(key);
  }
  const tex = generatorFn();
  textureCache.set(key, tex);
  return tex;
}

/**
 * Calcula dimensiones seguras del contenedor evitando aspect = NaN.
 */
export function getSafeContainerSize(el) {
  const width = Math.max(1, el?.clientWidth || 0);
  const height = Math.max(1, el?.clientHeight || 0);
  return { width, height, aspect: width / height };
}