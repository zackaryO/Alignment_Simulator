import * as THREE from 'three';
import { WheelAssembly } from './wheel-assembly';

export interface AxisLines {
  camberLine: THREE.Mesh;
  casterLine: THREE.Mesh;
  toeLine: THREE.Mesh;
}

/**
 * Creates color-coded axis visualization lines and parents them
 * to the correct pivot nodes in the WheelAssembly hierarchy.
 *
 * - Red (camber): vertical line on alignmentPivot — tilts with camber
 * - Green (caster): vertical line on steeringAxisPivot — shows steering axis tilt
 * - Blue (toe): longitudinal line on alignmentPivot — rotates with toe
 */
export function createAxisLines(assembly: WheelAssembly): AxisLines {
  const lineLength = 2;
  const radius = 0.02;
  const segments = 8;
  const geo = new THREE.CylinderGeometry(radius, radius, lineLength, segments);

  // Camber line (RED) — vertical in alignment pivot space
  const camberLine = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  camberLine.name = 'camberLine';
  assembly.alignmentPivot.add(camberLine);

  // Caster line (GREEN) — vertical in steering axis pivot space
  const casterLine = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({ color: 0x32a852 })
  );
  casterLine.name = 'casterLine';
  assembly.steeringAxisPivot.add(casterLine);

  // Toe line (BLUE) — along the longitudinal (Z) axis in alignment pivot space
  const toeLine = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({ color: 0x0000ff })
  );
  toeLine.name = 'toeLine';
  toeLine.rotation.x = Math.PI / 2; // Rotate cylinder to point along Z
  assembly.alignmentPivot.add(toeLine);

  return { camberLine, casterLine, toeLine };
}
