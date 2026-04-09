import * as THREE from 'three';

export class WheelAssembly {
  readonly assembly: THREE.Group;
  readonly steeringAxisPivot: THREE.Group;
  readonly steeringPivot: THREE.Group;
  readonly alignmentPivot: THREE.Group;
  readonly wheelMesh: THREE.Object3D;
  readonly side: 'left' | 'right';

  constructor(wheel: THREE.Object3D, carModel: THREE.Object3D, side: 'left' | 'right') {
    this.side = side;

    // Capture the wheel's world transform before detaching
    wheel.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    wheel.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    // Convert world position to carModel's local space
    const localPos = carModel.worldToLocal(worldPos.clone());

    // Detach wheel from its parent
    wheel.parent?.remove(wheel);

    // Build pivot hierarchy
    this.assembly = new THREE.Group();
    this.assembly.name = `assembly_${side}`;
    this.assembly.position.copy(localPos);

    this.steeringAxisPivot = new THREE.Group();
    this.steeringAxisPivot.name = `steeringAxis_${side}`;

    this.steeringPivot = new THREE.Group();
    this.steeringPivot.name = `steering_${side}`;

    this.alignmentPivot = new THREE.Group();
    this.alignmentPivot.name = `alignment_${side}`;

    // Nest: assembly → steeringAxisPivot → steeringPivot → alignmentPivot → wheel
    this.assembly.add(this.steeringAxisPivot);
    this.steeringAxisPivot.add(this.steeringPivot);
    this.steeringPivot.add(this.alignmentPivot);

    // Counter-rotate wheel mesh to cancel accumulated parent transforms.
    // The assembly is at the wheel's world position with identity rotation,
    // so we need the inverse of the world quaternion to restore visual orientation.
    const inverseWorldQuat = worldQuat.clone().invert();

    // Also need to account for carModel's world rotation
    const carWorldQuat = new THREE.Quaternion();
    carModel.getWorldQuaternion(carWorldQuat);
    const carInverseQuat = carWorldQuat.clone().invert();

    // The wheel's local quaternion should cancel: carModel rotation + original world rotation
    // Since assembly is child of carModel, effective world = carModel * assembly * ... * wheel
    // We want wheel to appear at original worldQuat, so:
    // carWorldQuat * wheelLocalQuat = worldQuat
    // wheelLocalQuat = carInverseQuat * worldQuat
    // But we want identity appearance, so we need inverse of accumulated parent chain
    wheel.quaternion.copy(carInverseQuat.multiply(worldQuat).invert());

    // Reset position to center of pivot and preserve scale
    wheel.position.set(0, 0, 0);
    wheel.scale.copy(worldScale);

    this.alignmentPivot.add(wheel);
    this.wheelMesh = wheel;

    // Add assembly to carModel
    carModel.add(this.assembly);
  }

  setCaster(degrees: number): void {
    this.steeringAxisPivot.rotation.x = THREE.MathUtils.degToRad(degrees);
  }

  setSAI(degrees: number): void {
    // SAI tilts the steering axis inward — opposite sign for each side
    const sign = this.side === 'left' ? 1 : -1;
    this.steeringAxisPivot.rotation.z = sign * THREE.MathUtils.degToRad(degrees);
  }

  setTurnAngle(degrees: number): void {
    this.steeringPivot.rotation.y = THREE.MathUtils.degToRad(degrees);
  }

  setCamber(degrees: number): void {
    // Positive camber = top of wheel tilts outward
    const sign = this.side === 'left' ? -1 : 1;
    this.alignmentPivot.rotation.z = sign * THREE.MathUtils.degToRad(degrees);
  }

  setToe(degrees: number): void {
    // Positive toe value = toe-in (front of wheel points toward centerline)
    const sign = this.side === 'left' ? 1 : -1;
    this.alignmentPivot.rotation.y = sign * THREE.MathUtils.degToRad(degrees);
  }

  /**
   * Get the effective camber angle in degrees, including dynamic gain
   * from caster/SAI when the wheel is turned.
   */
  getEffectiveCamber(): number {
    // Extract the effective Z-rotation from the combined world matrix
    // of all pivots from steeringAxisPivot down to alignmentPivot
    this.alignmentPivot.updateWorldMatrix(true, false);
    this.assembly.updateWorldMatrix(true, false);

    // Get the world quaternion of the alignment pivot relative to the assembly
    const alignWorldQuat = new THREE.Quaternion();
    this.alignmentPivot.getWorldQuaternion(alignWorldQuat);

    const assemblyWorldQuat = new THREE.Quaternion();
    this.assembly.getWorldQuaternion(assemblyWorldQuat);

    // Relative rotation = inverse(assembly) * alignmentWorld
    const relativeQuat = assemblyWorldQuat.invert().multiply(alignWorldQuat);
    const euler = new THREE.Euler().setFromQuaternion(relativeQuat, 'YXZ');

    const sign = this.side === 'left' ? -1 : 1;
    return sign * THREE.MathUtils.radToDeg(euler.z);
  }

  /**
   * Get the effective toe angle in degrees, including dynamic changes
   * from caster/SAI when the wheel is turned.
   */
  getEffectiveToe(): number {
    this.alignmentPivot.updateWorldMatrix(true, false);
    this.assembly.updateWorldMatrix(true, false);

    const alignWorldQuat = new THREE.Quaternion();
    this.alignmentPivot.getWorldQuaternion(alignWorldQuat);

    const assemblyWorldQuat = new THREE.Quaternion();
    this.assembly.getWorldQuaternion(assemblyWorldQuat);

    const relativeQuat = assemblyWorldQuat.invert().multiply(alignWorldQuat);
    const euler = new THREE.Euler().setFromQuaternion(relativeQuat, 'YXZ');

    const sign = this.side === 'left' ? 1 : -1;
    return sign * THREE.MathUtils.radToDeg(euler.y);
  }
}
