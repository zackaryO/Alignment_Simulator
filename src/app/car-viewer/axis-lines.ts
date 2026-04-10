import * as THREE from 'three';
import { WheelAssembly } from './wheel-assembly';

export const TOE_LINE_LENGTH = 4;
export const SPINDLE_LINE_LENGTH = 2;

export interface AxisLines {
  camberLine: THREE.Mesh;
  casterLine: THREE.Mesh;
  toeLine: THREE.Mesh;
  toeTipFront: THREE.Mesh;
  spindleLine: THREE.Mesh;
  spindleTip: THREE.Mesh;
}

export function createAxisLines(assembly: WheelAssembly): AxisLines {
  const camberLength = 2;
  const radius = 0.02;
  const segments = 8;

  // Camber line (RED) — vertical in alignment pivot space
  const camberGeo = new THREE.CylinderGeometry(radius, radius, camberLength, segments);
  const camberLine = new THREE.Mesh(camberGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  camberLine.name = 'camberLine';
  assembly.alignmentPivot.add(camberLine);

  // Caster / steering axis line (GREEN) — on the assembly
  const casterGeo = new THREE.CylinderGeometry(radius, radius, camberLength, segments);
  const casterLine = new THREE.Mesh(casterGeo, new THREE.MeshBasicMaterial({ color: 0x32a852 }));
  casterLine.name = 'casterLine';
  assembly.assembly.add(casterLine);

  // Toe line (BLUE) — along Z in alignment pivot space
  const toeGeo = new THREE.CylinderGeometry(radius, radius, TOE_LINE_LENGTH, segments);
  const toeLine = new THREE.Mesh(toeGeo, new THREE.MeshBasicMaterial({ color: 0x0000ff }));
  toeLine.name = 'toeLine';
  toeLine.rotation.x = Math.PI / 2;
  assembly.alignmentPivot.add(toeLine);

  // Toe tip sphere
  const toeTipGeo = new THREE.SphereGeometry(0.07, 12, 12);
  const toeTipFront = new THREE.Mesh(toeTipGeo, new THREE.MeshBasicMaterial({ color: 0x4488ff }));
  toeTipFront.name = 'toeTipFront';
  toeTipFront.position.set(0, 0, TOE_LINE_LENGTH / 2);
  assembly.alignmentPivot.add(toeTipFront);

  // Spindle line (YELLOW) — along X in alignment pivot space (lateral, the wheel's spin axis)
  const spindleGeo = new THREE.CylinderGeometry(radius, radius, SPINDLE_LINE_LENGTH, segments);
  const spindleLine = new THREE.Mesh(spindleGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  spindleLine.name = 'spindleLine';
  spindleLine.rotation.z = Math.PI / 2; // Rotate cylinder to point along X
  assembly.alignmentPivot.add(spindleLine);

  // Spindle tip sphere — at the OUTBOARD (external) end
  const spindleTipGeo = new THREE.SphereGeometry(0.07, 12, 12);
  const spindleTip = new THREE.Mesh(spindleTipGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  spindleTip.name = 'spindleTip';
  // Outboard direction: for left wheel (+X), outboard is +X. For right wheel (-X), outboard is -X.
  const outboardSign = assembly.side === 'left' ? 1 : -1;
  spindleTip.position.set(outboardSign * SPINDLE_LINE_LENGTH / 2, 0, 0);
  assembly.alignmentPivot.add(spindleTip);

  return { camberLine, casterLine, toeLine, toeTipFront, spindleLine, spindleTip };
}

export function updateCasterLine(
  casterLine: THREE.Mesh, casterDeg: number, saiDeg: number, side: 'left' | 'right'
): void {
  const casterRad = THREE.MathUtils.degToRad(casterDeg);
  const saiRad = THREE.MathUtils.degToRad(saiDeg);
  const saiSign = side === 'left' ? -1 : 1;

  const axis = new THREE.Vector3(
    Math.sin(saiRad) * saiSign,
    Math.cos(casterRad) * Math.cos(saiRad),
    -Math.sin(casterRad)
  ).normalize();

  const up = new THREE.Vector3(0, 1, 0);
  casterLine.quaternion.setFromUnitVectors(up, axis);
}

// --- Reference arcs (grey dashed) showing zero-geometry paths ---

/** Toe-tip reference arc (in front of wheel, longitudinal/lateral plane) */
export function createReferenceArc(
  assembly: WheelAssembly,
  toeLength: number,
  _scene?: THREE.Object3D
): THREE.Line {
  const arcRadius = toeLength / 2;
  const arcPoints: THREE.Vector3[] = [];
  // -50° to +50° to cover Ackermann inner-wheel angle at 40° avg turn
  for (let i = 0; i < 101; i++) {
    const angle = THREE.MathUtils.degToRad(-50 + i);
    arcPoints.push(new THREE.Vector3(
      Math.sin(angle) * arcRadius, 0, Math.cos(angle) * arcRadius
    ));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcMat = new THREE.LineDashedMaterial({
    color: 0x888888, dashSize: 0.05, gapSize: 0.03, transparent: true, opacity: 0.6
  });
  const arc = new THREE.Line(arcGeo, arcMat);
  arc.computeLineDistances();
  arc.name = 'referenceArc';
  assembly.assembly.add(arc);
  return arc;
}

/** Spindle reference arc (lateral arc at zero geometry) */
export function createSpindleReferenceArc(
  assembly: WheelAssembly,
  spindleLength: number
): THREE.Line {
  const arcRadius = spindleLength / 2;
  const outboardSign = assembly.side === 'left' ? 1 : -1;
  const arcPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 101; i++) {
    const angle = THREE.MathUtils.degToRad(-50 + i);
    // Spindle tip at zero turn is at (outboardSign * arcRadius, 0, 0)
    // As wheel turns around vertical Y axis, it traces an arc in XZ plane
    arcPoints.push(new THREE.Vector3(
      outboardSign * arcRadius * Math.cos(angle),
      0,
      -outboardSign * arcRadius * Math.sin(angle)
    ));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcMat = new THREE.LineDashedMaterial({
    color: 0x888888, dashSize: 0.05, gapSize: 0.03, transparent: true, opacity: 0.6
  });
  const arc = new THREE.Line(arcGeo, arcMat);
  arc.computeLineDistances();
  arc.name = 'spindleReferenceArc';
  assembly.assembly.add(arc);
  return arc;
}

/**
 * Road surface plane — a 3D grid in the XZ plane that correctly represents
 * the ground from any camera angle. The Y position is computed from the
 * actual wheel positions so it always aligns with the tire bottoms.
 *
 * Pass the WheelAssemblies after construction so the ground Y can be
 * derived from the wheel mesh world bounding boxes.
 */
export function createRoadSurfacePlane(
  scene: THREE.Scene,
  leftAssembly: WheelAssembly,
  rightAssembly: WheelAssembly,
  tireRadiusOverride?: number
): THREE.GridHelper {
  // Force world matrices to be current
  leftAssembly.assembly.parent?.updateMatrixWorld(true);

  // Wheel center world Y comes from the assembly's world position
  // (assembly is positioned at the wheel center).
  const leftCenter = new THREE.Vector3();
  leftAssembly.assembly.getWorldPosition(leftCenter);
  const rightCenter = new THREE.Vector3();
  rightAssembly.assembly.getWorldPosition(rightCenter);
  const wheelCenterY = (leftCenter.y + rightCenter.y) / 2;

  // Tire radius in world units. The carModel has scale 1.5; a typical car
  // tire is ~0.35m radius, so 0.35 * 1.5 = 0.525. Allow override for tuning.
  const tireRadius = tireRadiusOverride ?? 0.525;

  const groundY = wheelCenterY - tireRadius;

  const size = 18;       // grid extent (world units)
  const divisions = 18;  // number of grid cells

  const grid = new THREE.GridHelper(size, divisions, 0x333333, 0x666666);
  grid.position.y = groundY;
  grid.name = 'roadSurfaceGrid';

  // Make the grid materials translucent so it doesn't dominate the view
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const m of mats) {
    (m as THREE.Material).transparent = true;
    (m as THREE.Material).opacity = 0.55;
  }

  scene.add(grid);
  return grid;
}

// --- Deviation ribbons (orange shaded) ---

/** Toe-tip deviation ribbon (blue) */
export class DeviationRibbon {
  private mesh: THREE.Mesh;
  private toeLength: number;
  private maxPoints = 101; // -50° to +50°

  constructor(assembly: WheelAssembly, _tipFront: THREE.Object3D, toeLength: number) {
    this.toeLength = toeLength;
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'deviationRibbon';
    this.mesh.renderOrder = 998;
    assembly.assembly.add(this.mesh);
  }

  update(casterDeg: number, saiDeg: number, side: 'left' | 'right'): void {
    const arcRadius = this.toeLength / 2;
    const casterRad = THREE.MathUtils.degToRad(casterDeg);
    const saiRad = THREE.MathUtils.degToRad(saiDeg);
    const saiSign = side === 'left' ? -1 : 1;

    const steerAxis = new THREE.Vector3(
      Math.sin(saiRad) * saiSign,
      Math.cos(casterRad) * Math.cos(saiRad),
      -Math.sin(casterRad)
    ).normalize();

    const tipZero = new THREE.Vector3(0, 0, arcRadius);
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < this.maxPoints; i++) {
      const turnRad = THREE.MathUtils.degToRad(-50 + i);
      const refX = Math.sin(turnRad) * arcRadius;
      const refZ = Math.cos(turnRad) * arcRadius;
      const actualPos = tipZero.clone().applyAxisAngle(steerAxis, turnRad);

      const vi = i * 2;
      vertices.push(refX, 0, refZ);
      vertices.push(actualPos.x, actualPos.y, actualPos.z);

      if (i < this.maxPoints - 1) {
        const ni = (i + 1) * 2;
        indices.push(vi, vi + 1, ni);
        indices.push(ni, vi + 1, ni + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}

/** Spindle deviation ribbon (yellow) — shows spindle tip path deviation from zero geometry */
export class SpindleDeviationRibbon {
  private mesh: THREE.Mesh;
  private spindleLength: number;
  private maxPoints = 101; // -50° to +50°

  constructor(assembly: WheelAssembly, spindleLength: number) {
    this.spindleLength = spindleLength;
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc00, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'spindleDeviationRibbon';
    this.mesh.renderOrder = 998;
    assembly.assembly.add(this.mesh);
  }

  update(casterDeg: number, saiDeg: number, side: 'left' | 'right'): void {
    const arcRadius = this.spindleLength / 2;
    const casterRad = THREE.MathUtils.degToRad(casterDeg);
    const saiRad = THREE.MathUtils.degToRad(saiDeg);
    const saiSign = side === 'left' ? -1 : 1;
    const outboardSign = side === 'left' ? 1 : -1;

    const steerAxis = new THREE.Vector3(
      Math.sin(saiRad) * saiSign,
      Math.cos(casterRad) * Math.cos(saiRad),
      -Math.sin(casterRad)
    ).normalize();

    const spindleZero = new THREE.Vector3(outboardSign * arcRadius, 0, 0);
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < this.maxPoints; i++) {
      const turnRad = THREE.MathUtils.degToRad(-50 + i);
      const refX = outboardSign * arcRadius * Math.cos(turnRad);
      const refZ = -outboardSign * arcRadius * Math.sin(turnRad);
      const actualPos = spindleZero.clone().applyAxisAngle(steerAxis, turnRad);

      const vi = i * 2;
      vertices.push(refX, 0, refZ);
      vertices.push(actualPos.x, actualPos.y, actualPos.z);

      if (i < this.maxPoints - 1) {
        const ni = (i + 1) * 2;
        indices.push(vi, vi + 1, ni);
        indices.push(ni, vi + 1, ni + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}

/**
 * Body roll / jacking indicator — a translucent vertical "column" at each
 * wheel that shows how much that corner has lifted (or dropped) from its
 * rest position. The column grows upward when the wheel jacks up.
 *
 * Color codes:
 *   GREEN = wheel lifted up (suspension compressed, body rises)
 *   RED   = wheel dropped down (suspension extended)
 */
export class JackingIndicator {
  private mesh: THREE.Mesh;
  private side: 'left' | 'right';

  constructor(assembly: WheelAssembly) {
    this.side = assembly.side;
    // A thin translucent box that we resize each frame
    const geo = new THREE.BoxGeometry(0.18, 1, 0.18);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22cc44, transparent: true, opacity: 0.45, depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = `jackingIndicator_${this.side}`;
    this.mesh.renderOrder = 997;
    this.mesh.visible = false;
    // Position outboard of the wheel center so it doesn't overlap the wheel
    const outboardSign = this.side === 'left' ? 1 : -1;
    this.mesh.position.x = outboardSign * 0.6;
    assembly.assembly.add(this.mesh);
  }

  /** Pass the current jacking height (positive = lifted, negative = dropped). */
  update(jackingHeight: number): void {
    const absHeight = Math.abs(jackingHeight);
    if (absHeight < 0.01) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    // Scale the box height to the jacking amount; box origin is its center,
    // so offset Y so the bar grows from the rest position upward/downward.
    this.mesh.scale.y = absHeight;
    this.mesh.position.y = jackingHeight / 2; // center between 0 and jackingHeight
    // Color: green for up, red for down
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(jackingHeight > 0 ? 0x22cc44 : 0xcc2244);
  }
}

// --- Tracer with color change support ---

interface TracerDot {
  mesh: THREE.Mesh;
  createdAt: number;
}

export class ToeTracer {
  private dots: TracerDot[] = [];
  private scene: THREE.Scene;
  private tip: THREE.Object3D;
  private lifetime: number;
  private interval: number;
  private lastDotTime = 0;
  private dotGeo: THREE.SphereGeometry;
  private _color: number;

  constructor(scene: THREE.Scene, tipFront: THREE.Object3D, lifetimeMs = 5000, intervalMs = 50) {
    this.scene = scene;
    this.tip = tipFront;
    this.lifetime = lifetimeMs;
    this.interval = intervalMs;
    this.dotGeo = new THREE.SphereGeometry(0.03, 6, 6);
    this._color = 0x4488ff;
  }

  set color(c: number) { this._color = c; }

  update(): void {
    const now = performance.now();

    if (now - this.lastDotTime >= this.interval) {
      this.lastDotTime = now;
      const worldPos = new THREE.Vector3();
      this.tip.getWorldPosition(worldPos);
      const mat = new THREE.MeshBasicMaterial({
        color: this._color, transparent: true, opacity: 1, depthTest: false
      });
      const mesh = new THREE.Mesh(this.dotGeo, mat);
      mesh.position.copy(worldPos);
      mesh.renderOrder = 999;
      this.scene.add(mesh);
      this.dots.push({ mesh, createdAt: now });
    }

    for (let i = this.dots.length - 1; i >= 0; i--) {
      const dot = this.dots[i];
      const age = now - dot.createdAt;
      if (age >= this.lifetime) {
        this.scene.remove(dot.mesh);
        (dot.mesh.material as THREE.Material).dispose();
        this.dots.splice(i, 1);
      } else {
        (dot.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - age / this.lifetime;
      }
    }
  }
}
