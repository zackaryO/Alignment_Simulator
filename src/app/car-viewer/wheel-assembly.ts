import * as THREE from 'three';

export class WheelAssembly {
  readonly assembly: THREE.Group;
  readonly turnPivot: THREE.Group;
  readonly alignmentPivot: THREE.Group;
  readonly wheelMesh: THREE.Object3D;
  readonly side: 'left' | 'right';

  private _camberDeg = 0;
  private _toeDeg = 0;
  private _casterDeg = 0;
  private _saiDeg = 0;
  private _turnDeg = 0;

  constructor(wheel: THREE.Object3D, carModel: THREE.Object3D, side: 'left' | 'right') {
    this.side = side;

    // Get wheel's world position for the pivot point
    wheel.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    wheel.getWorldPosition(worldPos);
    const localPos = carModel.worldToLocal(worldPos.clone());

    // Build pivot hierarchy and add to carModel FIRST
    this.assembly = new THREE.Group();
    this.assembly.name = `assembly_${side}`;
    this.assembly.position.copy(localPos);

    this.turnPivot = new THREE.Group();
    this.turnPivot.name = `turn_${side}`;

    this.alignmentPivot = new THREE.Group();
    this.alignmentPivot.name = `alignment_${side}`;

    this.assembly.add(this.turnPivot);
    this.turnPivot.add(this.alignmentPivot);
    carModel.add(this.assembly);

    // Update all world matrices so attach() can compute correct local transforms
    carModel.updateMatrixWorld(true);

    // Reparent wheel preserving its world transform
    this.alignmentPivot.attach(wheel);
    this.wheelMesh = wheel;

    // The wheel mesh now has a local rotation that includes:
    //   X rotation: the wheel's spin axis orientation — KEEP THIS
    //   Y rotation: residual toe from the model — REMOVE THIS
    //   Z rotation: residual camber from the model — REMOVE THIS
    // If Z rotation > 90°, the wheel is mirrored (negative X scale from the
    // GLTF parent chain was absorbed into rotation by attach()). Restore the
    // mirror as a negative X scale instead, which keeps the wheel facing
    // outward without polluting the rotation.
    const euler = new THREE.Euler().copy(wheel.rotation);

    if (Math.abs(euler.z) > Math.PI / 2) {
      // The ~180° Z rotation is the mathematical representation of the mirror.
      // Replace it: use negative X scale for the visual mirror, and strip the
      // Z rotation. We need to adjust X rotation too since the mirror changes
      // the effective spin axis direction.
      wheel.scale.x *= -1;
      // With the mirror on X, the effective X rotation inverts sign
      euler.x = Math.PI - euler.x;
    }

    // Strip residual toe (Y) and camber (Z), keep only spin axis (X)
    wheel.rotation.set(euler.x, 0, 0, euler.order);

    console.log(`[${side}] stripped Y=${THREE.MathUtils.radToDeg(euler.y).toFixed(1)}° Z=${THREE.MathUtils.radToDeg(euler.z).toFixed(1)}° — kept X=${THREE.MathUtils.radToDeg(euler.x).toFixed(1)}°`);
  }

  setCaster(degrees: number): void {
    this._casterDeg = degrees;
    this._updateTurn();
  }

  setSAI(degrees: number): void {
    this._saiDeg = degrees;
    this._updateTurn();
  }

  setTurnAngle(degrees: number): void {
    this._turnDeg = degrees;
    this._updateTurn();
  }

  setCamber(degrees: number): void {
    this._camberDeg = degrees;
    this._updateAlignment();
  }

  setToe(degrees: number): void {
    this._toeDeg = degrees;
    this._updateAlignment();
  }

  private _updateTurn(): void {
    if (this._turnDeg === 0) {
      this.turnPivot.quaternion.identity();
      return;
    }

    const casterRad = THREE.MathUtils.degToRad(this._casterDeg);
    const saiRad = THREE.MathUtils.degToRad(this._saiDeg);
    const saiSign = this.side === 'left' ? -1 : 1;

    const axis = new THREE.Vector3(
      Math.sin(saiRad) * saiSign,
      Math.cos(casterRad) * Math.cos(saiRad),
      -Math.sin(casterRad)
    ).normalize();

    const turnRad = THREE.MathUtils.degToRad(this._turnDeg);
    this.turnPivot.quaternion.setFromAxisAngle(axis, turnRad);
  }

  /**
   * Apply camber and toe directly to the alignment pivot.
   * No baseline subtraction needed — we already stripped the residual
   * from the wheel mesh itself in the constructor.
   */
  private _updateAlignment(): void {
    const camberSign = this.side === 'left' ? -1 : 1;
    const camberRad = camberSign * THREE.MathUtils.degToRad(this._camberDeg);

    const toeSign = this.side === 'left' ? -1 : 1;
    const toeRad = toeSign * THREE.MathUtils.degToRad(this._toeDeg);

    this.alignmentPivot.rotation.set(0, toeRad, camberRad);
  }

  getEffectiveCamber(): number {
    this.assembly.updateMatrixWorld(true);

    const assemblyWorldQuat = new THREE.Quaternion();
    this.assembly.getWorldQuaternion(assemblyWorldQuat);

    const alignWorldQuat = new THREE.Quaternion();
    this.alignmentPivot.getWorldQuaternion(alignWorldQuat);

    const relQuat = assemblyWorldQuat.clone().invert().multiply(alignWorldQuat);
    const euler = new THREE.Euler().setFromQuaternion(relQuat, 'XYZ');

    const camberSign = this.side === 'left' ? -1 : 1;
    return camberSign * THREE.MathUtils.radToDeg(euler.z);
  }

  getEffectiveToe(): number {
    this.assembly.updateMatrixWorld(true);

    const assemblyWorldQuat = new THREE.Quaternion();
    this.assembly.getWorldQuaternion(assemblyWorldQuat);

    const alignWorldQuat = new THREE.Quaternion();
    this.alignmentPivot.getWorldQuaternion(alignWorldQuat);

    const relQuat = assemblyWorldQuat.clone().invert().multiply(alignWorldQuat);
    const euler = new THREE.Euler().setFromQuaternion(relQuat, 'XYZ');

    const toeSign = this.side === 'left' ? -1 : 1;
    return toeSign * THREE.MathUtils.radToDeg(euler.y);
  }
}
