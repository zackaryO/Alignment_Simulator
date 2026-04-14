/**
 * @file wheel-assembly.ts
 *
 * Pivot hierarchy that wraps a single front wheel mesh and exposes the five
 * alignment angles as setters. The class hides all of the awkward GLTF
 * surgery that's required to take a wheel mesh out of its original parent
 * chain and graft it under our own pivots without disturbing its world
 * orientation.
 *
 * The pivot tree per wheel looks like this:
 *
 *     carModel
 *      └── assembly        (THREE.Group, positioned at the wheel center)
 *           └── turnPivot     (rotates around the inclined steering axis)
 *                └── alignmentPivot  (applies camber and toe)
 *                     └── wheelMesh  (the actual GLTF wheel, keeps its
 *                                      spin-axis X rotation, Y/Z stripped)
 *
 * Why three nested pivots instead of one?
 *   - `assembly` defines the origin and lets us translate the wheel
 *     vertically to simulate jacking without disturbing rotations.
 *   - `turnPivot` applies steering rotation around the inclined steering
 *     axis (the SAI/caster axis). This is the only place where the
 *     non-vertical axis matters, so we keep it isolated.
 *   - `alignmentPivot` applies the static alignment angles (camber, toe).
 *     Putting them inside `turnPivot` means they automatically follow the
 *     wheel through a turn, which is what real linkages do.
 */

import * as THREE from 'three';

export class WheelAssembly {
  /** Outer group; positioned at the wheel center in carModel-local space. */
  readonly assembly: THREE.Group;
  /** Rotates around the inclined steering axis when the wheels are steered. */
  readonly turnPivot: THREE.Group;
  /** Applies static camber and toe to the wheel beneath the steering pivot. */
  readonly alignmentPivot: THREE.Group;
  /** The actual GLTF wheel mesh, reparented under {@link alignmentPivot}. */
  readonly wheelMesh: THREE.Object3D;
  /** Which side of the car this wheel sits on. */
  readonly side: 'left' | 'right';

  /** Y position of the assembly at construction time, restore baseline for jacking. */
  private _restY = 0;
  /** Current camber in degrees (raw input from the UI, not yet sign-corrected). */
  private _camberDeg = 0;
  /** Current toe in degrees. */
  private _toeDeg = 0;
  /** Current caster in degrees. */
  private _casterDeg = 0;
  /** Current SAI in degrees. */
  private _saiDeg = 0;
  /** Current steered angle in degrees (positive = turn left). */
  private _turnDeg = 0;

  /**
   * Build the pivot hierarchy and reparent the supplied wheel mesh into it.
   *
   * The constructor performs three non-trivial pieces of work:
   *
   *   1. Compute the wheel's world position and convert it into carModel-local
   *      space so the new pivot stack lives at the same place the original
   *      wheel did. We must do this BEFORE adding the wheel to the new tree.
   *
   *   2. Use {@link THREE.Object3D.attach}, not {@link THREE.Object3D.add},
   *      to reparent the mesh. `attach()` recomputes the wheel's local
   *      transform so its world transform is preserved through the move.
   *
   *   3. Strip the residual Y/Z rotations the GLTF artist baked into the
   *      wheel mesh, those would otherwise stack on top of every alignment
   *      angle we apply later. The X rotation (spin axis) is kept. If the
   *      mesh comes through with a >90° Z rotation, that's the
   *      mathematically-equivalent representation of a mirror, we replace
   *      it with a negative scale so the visual mirroring is preserved
   *      without polluting the rotation channels.
   */
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
    this._restY = this.assembly.position.y;

    // Update all world matrices so attach() can compute correct local transforms
    carModel.updateMatrixWorld(true);

    // Reparent wheel preserving its world transform
    this.alignmentPivot.attach(wheel);
    this.wheelMesh = wheel;

    // The wheel mesh now has a local rotation that includes:
    //   X rotation: the wheel's spin axis orientation, KEEP THIS
    //   Y rotation: residual toe from the model, REMOVE THIS
    //   Z rotation: residual camber from the model, REMOVE THIS
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

    // Cache the wheel mesh's natural lateral position after reparenting so
    // that setWheelOffset can apply lateral shifts *relative* to the
    // factory spot rather than overwriting it. Without this, a call like
    // setWheelOffset(0) would teleport the wheel to x=0 in pivot-local
    // space, which is not generally the same as its factory position.
    this._wheelMeshBaseX = wheel.position.x;

    // Also cache the tire centerline X in assembly-local from the wheel's
    // actual world bounding box. This is the value the scrub-radius
    // indicator will lock its dashed centerline to.
    this._updateTireCenterlineCache();

    console.log(`[${side}] stripped Y=${THREE.MathUtils.radToDeg(euler.y).toFixed(1)}° Z=${THREE.MathUtils.radToDeg(euler.z).toFixed(1)}°, kept X=${THREE.MathUtils.radToDeg(euler.x).toFixed(1)}°, baseX=${this._wheelMeshBaseX.toFixed(3)}, tireCenterlineX=${this._tireCenterlineXLocal.toFixed(3)}`);
  }

  /** Factory lateral position of the wheel mesh inside alignmentPivot. */
  private _wheelMeshBaseX = 0;

  /** Set caster angle (degrees). Recomputes the steering-axis quaternion. */
  setCaster(degrees: number): void {
    this._casterDeg = degrees;
    this._updateTurn();
  }

  /** Set Steering Axis Inclination / KPI (degrees). Recomputes the steering-axis quaternion. */
  setSAI(degrees: number): void {
    this._saiDeg = degrees;
    this._updateTurn();
  }

  /** Set the steered angle (degrees, positive = turn left). */
  setTurnAngle(degrees: number): void {
    this._turnDeg = degrees;
    this._updateTurn();
  }

  /** Set camber (degrees). Sign convention: positive = top of wheel tilts outboard. */
  setCamber(degrees: number): void {
    this._camberDeg = degrees;
    this._updateAlignment();
  }

  /** Set toe (degrees). Sign convention: positive = front of wheel toes inward. */
  setToe(degrees: number): void {
    this._toeDeg = degrees;
    this._updateAlignment();
  }

  /**
   * Apply vertical jacking displacement (in world units) to the assembly.
   * Used for the SAI jacking effect, when the steering axis is inclined,
   * turning the wheel causes the wheel center to want to move vertically.
   * Positive lift = the assembly moves up (vehicle rises).
   */
  setVerticalLift(lift: number): void {
    this.assembly.position.y = this._restY + lift;
  }

  /** Lateral offset of the wheel mesh from its stock hub position, in
   *  assembly-local units. Positive values push the tire outboard. */
  private _wheelOffsetLocal = 0;

  /**
   * Simulate an aftermarket wheel with a different offset (ET) than the
   * stock wheel by translating the wheel mesh laterally within the
   * alignment pivot. The suspension hard points, ball joints and thus
   * the SAI line all stay in their factory positions; only the tire
   * centerline shifts. This is how scrub radius actually changes on a
   * real vehicle: the owner installs a wheel with a different centerline
   * and the distance between the steering axis at the road and the tire
   * centerline grows or shrinks.
   *
   * @param outboardOffsetLocal Positive values move the tire outboard,
   *   negative values pull it inboard. Units are assembly-local (the
   *   carModel has scale 1.5, so 0.1 here is roughly 15 cm at world
   *   scale). Pass 0 to restore the stock position.
   */
  setWheelOffset(outboardOffsetLocal: number): void {
    this._wheelOffsetLocal = outboardOffsetLocal;
    const outboardSign = this.side === 'left' ? 1 : -1;
    this.wheelMesh.position.x = this._wheelMeshBaseX + outboardOffsetLocal * outboardSign;
    this._updateTireCenterlineCache();
  }

  /** Current wheel-mesh lateral offset, as last set via setWheelOffset. */
  getWheelOffset(): number {
    return this._wheelOffsetLocal;
  }

  /**
   * True visual centerline X of the wheel in assembly-local space,
   * derived from the wheel mesh's world bounding box each time the
   * wheel is moved. Using the bbox center (rather than
   * wheelMesh.position.x) is essential because the GLTF wheel mesh
   * carries its own local pivot offset, scale flips applied during
   * reparenting, and nested child transforms. Directly reading
   * wheelMesh.position.x does not generally land on the tire's visual
   * centerline. The scrub-radius indicator reads this value so the
   * dashed tire centerline overlay always passes exactly through the
   * middle of the visible tire.
   */
  getTireCenterlineX(): number {
    return this._tireCenterlineXLocal;
  }

  /** Cached tire-centerline X in assembly-local, updated on every
   *  setWheelOffset call (and once in the constructor). */
  private _tireCenterlineXLocal = 0;

  private _updateTireCenterlineCache(): void {
    // Make sure world matrices are current so Box3.setFromObject reads
    // correct positions. The scrub-radius indicator only uses this when
    // the scrub fault is active, so paying for a world-matrix update
    // here is acceptable.
    this.assembly.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(this.wheelMesh);
    const worldCenter = new THREE.Vector3();
    bbox.getCenter(worldCenter);
    // Convert world center to assembly-local. worldToLocal mutates in
    // place, so clone first.
    const local = this.assembly.worldToLocal(worldCenter.clone());
    this._tireCenterlineXLocal = local.x;
  }

  /**
   * Compute the body delta at this corner due to SAI/caster geometry.
   *
   * Physical model:
   *   - The spindle axis (reference line) traces an arc around the inclined
   *     steering axis as the wheel turns.
   *   - When the spindle "presses down" (geometric Y negative), the suspension
   *     EXTENDS on that side, the body corner RISES.
   *   - When the spindle "lifts up" (geometric Y positive), the suspension
   *     COMPRESSES, the body corner DROPS.
   *   - BOTH wheels remain in contact with the road; only the body moves.
   *   - The springs absorb part of the geometric motion, so only a fraction
   *     becomes visible body movement.
   *
   * Returns: signed body delta. Positive = corner rises (suspension extends),
   *          Negative = corner drops (suspension compresses).
   */
  computeJackingHeight(): number {
    if (this._turnDeg === 0) return 0;

    const casterRad = THREE.MathUtils.degToRad(this._casterDeg);
    const saiRad = THREE.MathUtils.degToRad(this._saiDeg);
    const saiSign = this.side === 'left' ? -1 : 1;
    const outboardSign = this.side === 'left' ? 1 : -1;

    const axis = new THREE.Vector3(
      Math.sin(saiRad) * saiSign,
      Math.cos(casterRad) * Math.cos(saiRad),
      -Math.sin(casterRad)
    ).normalize();

    const spindleRadius = 1;
    const spindleZero = new THREE.Vector3(outboardSign * spindleRadius, 0, 0);
    const turnRad = THREE.MathUtils.degToRad(this._turnDeg);
    const rotated = spindleZero.clone().applyAxisAngle(axis, turnRad);

    // Suspension absorption: real springs eat ~60% of the geometric jacking,
    // so only ~40% becomes visible body movement.
    const ABSORPTION = 0.4;

    // Negate so that "spindle pressing into road" → body rises (extends).
    return -rotated.y * ABSORPTION;
  }

  /**
   * Build the inclined steering-axis vector from the current caster and SAI
   * angles, then rotate {@link turnPivot} around it by the current steered
   * angle. This is the heart of the simulation: caster and SAI tilt the
   * pivot axis away from vertical, and that tilt is what produces the
   * jacking, camber-change-with-turn and self-centering effects you see
   * in the visualization.
   *
   * Axis components (assembly-local space):
   *   X = sin(SAI)·side   , lean of the axis toward/away from the car
   *   Y = cos(caster)·cos(SAI)
   *   Z = -sin(caster)    , caster tilts the top of the axis rearward
   *
   * The `saiSign` flips the X component for the left wheel so SAI always
   * leans the *top* of the steering axis toward the car centerline,
   * regardless of which side we're on.
   */
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
   *
   * No baseline subtraction is needed because the constructor already
   * stripped the residual Y/Z rotation from the wheel mesh, at this point
   * the alignment pivot has a clean identity orientation that represents
   * "wheel pointing dead ahead with zero camber".
   *
   * Both signs are flipped on the left wheel so positive UI values always
   * mean the same physical thing on both sides (positive camber = top
   * outboard, positive toe = front inboard).
   */
  private _updateAlignment(): void {
    const camberSign = this.side === 'left' ? -1 : 1;
    const camberRad = camberSign * THREE.MathUtils.degToRad(this._camberDeg);

    const toeSign = this.side === 'left' ? -1 : 1;
    const toeRad = toeSign * THREE.MathUtils.degToRad(this._toeDeg);

    this.alignmentPivot.rotation.set(0, toeRad, camberRad);
  }

  /**
   * Read the wheel's *effective* camber after steering has rotated it
   * around the inclined axis. Useful for telemetry / status read-outs that
   * want to show how camber changes through a turn.
   *
   * Computed as the relative rotation between the assembly and the
   * alignment pivot, then read out as the Z component of an XYZ Euler.
   */
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

  /**
   * Read the wheel's *effective* toe after steering. Same approach as
   * {@link getEffectiveCamber}, relative quaternion between assembly and
   * alignment pivot, decomposed to XYZ Euler, but reads the Y component.
   */
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
