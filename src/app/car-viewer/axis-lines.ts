import * as THREE from 'three';
import { WheelAssembly } from './wheel-assembly';

export const TOE_LINE_LENGTH = 4;

export interface AxisLines {
  camberLine: THREE.Mesh;
  casterLine: THREE.Mesh;
  toeLine: THREE.Mesh;
  toeTipFront: THREE.Mesh;
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

  // Toe line (BLUE) — along Z in alignment pivot space, extended for visibility
  const toeGeo = new THREE.CylinderGeometry(radius, radius, TOE_LINE_LENGTH, segments);
  const toeLine = new THREE.Mesh(toeGeo, new THREE.MeshBasicMaterial({ color: 0x0000ff }));
  toeLine.name = 'toeLine';
  toeLine.rotation.x = Math.PI / 2;
  assembly.alignmentPivot.add(toeLine);

  // Highlighted tip sphere — front end of toe line
  const tipGeo = new THREE.SphereGeometry(0.07, 12, 12);
  const toeTipFront = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0x4488ff }));
  toeTipFront.name = 'toeTipFront';
  toeTipFront.position.set(0, 0, TOE_LINE_LENGTH / 2);
  assembly.alignmentPivot.add(toeTipFront);

  return { camberLine, casterLine, toeLine, toeTipFront };
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

// --- Reference arc: grey dashed, shows zero-geometry turn path ---

export function createReferenceArc(
  assembly: WheelAssembly,
  toeLength: number,
  scene: THREE.Object3D
): THREE.Line {
  const arcRadius = toeLength / 2;
  const arcPoints: THREE.Vector3[] = [];
  const numPoints = 81; // -40° to +40°

  for (let i = 0; i < numPoints; i++) {
    const angle = THREE.MathUtils.degToRad(-40 + i);
    arcPoints.push(new THREE.Vector3(
      Math.sin(angle) * arcRadius,
      0,
      Math.cos(angle) * arcRadius
    ));
  }

  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcMat = new THREE.LineDashedMaterial({
    color: 0x888888,
    dashSize: 0.05,
    gapSize: 0.03,
    transparent: true,
    opacity: 0.6
  });

  const arc = new THREE.Line(arcGeo, arcMat);
  arc.computeLineDistances();
  arc.name = 'referenceArc';
  assembly.assembly.add(arc);

  return arc;
}

// --- Deviation ribbon: shaded area between reference arc and actual tip path ---

export class DeviationRibbon {
  private mesh: THREE.Mesh;
  private assembly: WheelAssembly;
  private tipFront: THREE.Object3D;
  private toeLength: number;
  private maxPoints = 81; // -40° to +40°

  constructor(assembly: WheelAssembly, tipFront: THREE.Object3D, toeLength: number) {
    this.assembly = assembly;
    this.tipFront = tipFront;
    this.toeLength = toeLength;

    // Create a triangle strip mesh with placeholder geometry
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8822,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'deviationRibbon';
    this.mesh.renderOrder = 998;
    assembly.assembly.add(this.mesh);
  }

  /**
   * Rebuild the ribbon geometry based on current caster/SAI/camber.
   * Computes the actual tip position at each turn angle and connects
   * it to the reference (zero-geometry) position with a filled strip.
   */
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
      const turnDeg = -40 + i;
      const turnRad = THREE.MathUtils.degToRad(turnDeg);

      // Reference position (zero geometry — pure Y rotation)
      const refX = Math.sin(turnRad) * arcRadius;
      const refY = 0;
      const refZ = Math.cos(turnRad) * arcRadius;

      // Actual position (rotation around tilted steering axis with exaggerated caster)
      const actualPos = tipZero.clone().applyAxisAngle(steerAxis, turnRad);

      // Two vertices per angle: reference point and actual point
      const vi = i * 2;
      vertices.push(refX, refY, refZ);         // reference
      vertices.push(actualPos.x, actualPos.y, actualPos.z); // actual

      // Create two triangles connecting this pair to the next
      if (i < this.maxPoints - 1) {
        const ni = (i + 1) * 2;
        indices.push(vi, vi + 1, ni);       // triangle 1
        indices.push(ni, vi + 1, ni + 1);   // triangle 2
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Replace old geometry
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
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
