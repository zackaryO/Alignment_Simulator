/**
 * @file car-viewer.component.ts
 *
 * Top-level Angular component for the Wheel Alignment Simulator.
 *
 * Responsibilities:
 *   1. Bootstrap a Three.js scene (renderer, camera, lights, orbit controls).
 *   2. Load the GLTF car model and locate the front-left and front-right wheel
 *      meshes inside its scene graph.
 *   3. Build a {@link WheelAssembly} for each front wheel, plus all of the
 *      visualization aids (axis lines, deviation ribbons, jacking indicators,
 *      tracers, road plane).
 *   4. Drive the simulation from the UI controls — sliders for camber, caster,
 *      SAI, toe and steering angle, plus an "Errors" mode that loads canned
 *      mis-alignment scenarios from {@link ERROR_DEFINITIONS}.
 *   5. Compute Ackermann steering geometry so the inner and outer wheels
 *      turn through the correct, asymmetric angles.
 *   6. Optionally simulate body roll and lift caused by SAI/caster jacking,
 *      keeping the tires on the road plane while the car body moves.
 *
 * Coordinate system convention used throughout this file:
 *   +X = right side of the car (passenger side in LHD)
 *   +Y = up
 *   +Z = forward (toward the front of the car)
 *
 * Note: the LEFT wheel is at +X here because the GLTF model is authored
 * with the driver on the left of the screen when looking from behind. The
 * `side === 'left'` / `'right'` logic in {@link WheelAssembly} accounts for
 * this consistently.
 */

import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WheelAssembly } from './wheel-assembly';
import {
  createAxisLines, updateCasterLine, createReferenceArc, createSpindleReferenceArc,
  createRoadSurfacePlane, DeviationRibbon, SpindleDeviationRibbon,
  JackingIndicator, AxisLines, ToeTracer, ErrorIndicator,
  TOE_LINE_LENGTH, SPINDLE_LINE_LENGTH
} from './axis-lines';
import {
  AlignmentError, AngleCategory, getErrorsByAngle,
  SuspensionType, TriState, lookupDiagnostic
} from './alignment-errors';

/** High-level UI mode: free-play geometry adjustment vs. canned error scenarios. */
type AppMode = 'geometry' | 'error';

/**
 * Visual rendering mode.
 *  - `conceptual`: the car body stays still, only the wheels reorient — best
 *    for understanding the angles in isolation.
 *  - `actual`:     the body lifts and rolls in response to SAI/caster jacking
 *    while the wheels stay glued to the road plane — best for understanding
 *    the real-world ride-height effects of steering geometry.
 */
type VisualMode = 'conceptual' | 'actual';

@Component({
  selector: 'app-car-viewer',
  templateUrl: './car-viewer.component.html',
  styleUrls: ['./car-viewer.component.css']
})
export class CarViewerComponent implements OnInit {
  /** DOM container that will host the WebGL canvas. */
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef<HTMLDivElement>;

  // -------------------------------------------------------------------------
  // Three.js core objects
  // -------------------------------------------------------------------------
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  orbitControls!: OrbitControls;

  // -------------------------------------------------------------------------
  // Wheel + visualization objects (populated once the GLTF finishes loading)
  // -------------------------------------------------------------------------
  /** Front-left wheel pivot hierarchy. */
  leftWheelAssembly: WheelAssembly | null = null;
  /** Front-right wheel pivot hierarchy. */
  rightWheelAssembly: WheelAssembly | null = null;
  /** Camber/caster/toe/spindle reference cylinders attached to the left wheel. */
  leftAxisLines: AxisLines | null = null;
  /** Camber/caster/toe/spindle reference cylinders attached to the right wheel. */
  rightAxisLines: AxisLines | null = null;
  /** Animated trail of dots showing where the left toe-tip has travelled. */
  leftTracer: ToeTracer | null = null;
  /** Animated trail of dots showing where the right toe-tip has travelled. */
  rightTracer: ToeTracer | null = null;
  /** Animated trail of dots showing where the left spindle tip has travelled. */
  leftSpindleTracer: ToeTracer | null = null;
  /** Animated trail of dots showing where the right spindle tip has travelled. */
  rightSpindleTracer: ToeTracer | null = null;
  /** Translucent fan visualizing toe-tip deviation between zero geometry and current geometry (left). */
  leftRibbon: DeviationRibbon | null = null;
  /** Translucent fan visualizing toe-tip deviation between zero geometry and current geometry (right). */
  rightRibbon: DeviationRibbon | null = null;
  /** Translucent fan visualizing spindle-tip deviation (left). */
  leftSpindleRibbon: SpindleDeviationRibbon | null = null;
  /** Translucent fan visualizing spindle-tip deviation (right). */
  rightSpindleRibbon: SpindleDeviationRibbon | null = null;
  /** Vertical bar that grows up/down to show body lift at the left corner. */
  leftJacking: JackingIndicator | null = null;
  /** Vertical bar that grows up/down to show body lift at the right corner. */
  rightJacking: JackingIndicator | null = null;
  /** Per-error ghost lines + deviation wedges (left wheel). */
  leftErrorIndicator: ErrorIndicator | null = null;
  /** Per-error ghost lines + deviation wedges (right wheel). */
  rightErrorIndicator: ErrorIndicator | null = null;
  /** Dashed reference arc for the left toe tip — toggled per error category. */
  leftReferenceArc: THREE.Line | null = null;
  /** Dashed reference arc for the right toe tip — toggled per error category. */
  rightReferenceArc: THREE.Line | null = null;
  /** Dashed reference arc for the left spindle tip — toggled per error category. */
  leftSpindleReferenceArc: THREE.Line | null = null;
  /** Dashed reference arc for the right spindle tip — toggled per error category. */
  rightSpindleReferenceArc: THREE.Line | null = null;

  /** Loaded GLTF root node. */
  carModel: THREE.Object3D | null = null;
  /** Original Y position of the car body so we can restore/offset it for "actual" mode. */
  carModelRestY = 0;
  /** World-space rest position of the left wheel assembly (used to keep it on the road). */
  leftAssemblyRestPos = new THREE.Vector3();
  /** World-space rest position of the right wheel assembly. */
  rightAssemblyRestPos = new THREE.Vector3();
  /** Distance between the front wheels in world units, derived from the loaded model. */
  trackWidthWorld = 1;

  // -------------------------------------------------------------------------
  // UI mode state
  // -------------------------------------------------------------------------
  /** Geometry-playground vs. canned-error mode. */
  mode: AppMode = 'geometry';
  /** Conceptual (body fixed) vs. actual (body lifts/rolls) rendering mode. */
  visualMode: VisualMode = 'conceptual';
  /** Mobile: legend overlay is hidden by default and toggled with a button. */
  showLegend = false;
  /** Whether the SAI diagnostic-chart modal is currently open. */
  showDiagnostic = false;

  // -------------------------------------------------------------------------
  // Geometry-mode slider state — these are the values the user is editing
  // and they feed straight into the WheelAssembly setters on every change.
  // All angles are in degrees.
  // -------------------------------------------------------------------------
  /** Camber on the left wheel (degrees, positive = top tilts outward). */
  leftCamber = 0;
  /** Camber on the right wheel (degrees). */
  rightCamber = 0;
  /** Total toe in degrees, split symmetrically between the two wheels. */
  totalToeSlider = 0;
  /** Per-wheel toe applied to the left wheel — half of the total slider value. */
  get leftToe(): number { return this.totalToeSlider / 2; }
  /** Per-wheel toe applied to the right wheel — half of the total slider value. */
  get rightToe(): number { return this.totalToeSlider / 2; }
  /** Caster angle in degrees, applied symmetrically to both wheels. Default ≈ 3°. */
  casterAngle = 3;
  /** Steering Axis Inclination (a.k.a. KPI) in degrees, applied symmetrically. Default ≈ 13°. */
  saiAngle = 13;
  /** Average steering wheel input in degrees. Used to compute Ackermann split below. */
  turnAngle = 0;

  // -------------------------------------------------------------------------
  // Vehicle dimensions used for the Ackermann calculation. Tuned to match the
  // GLTF Mercedes-Benz GLC model loaded by loadCarModel().
  // -------------------------------------------------------------------------
  /** Vehicle wheelbase in metres (front axle to rear axle). */
  wheelbase = 2.87;
  /** Vehicle track width in metres (centerline-to-centerline of the front tires). */
  trackWidth = 1.63;
  /** Computed steered angle of the left wheel after Ackermann split (degrees). */
  leftTurnAngle = 0;
  /** Computed steered angle of the right wheel after Ackermann split (degrees). */
  rightTurnAngle = 0;

  // -------------------------------------------------------------------------
  // Error-mode state
  // -------------------------------------------------------------------------
  /** Pre-computed grouping of error definitions by angle category for the UI grid. */
  errorsByAngle = getErrorsByAngle();
  /** Order in which error categories are listed in the UI. */
  angleCategories: AngleCategory[] = ['Camber', 'Caster', 'Toe', 'SAI', 'ScrubRadius'];
  /** Currently displayed error scenario, or null when no error is selected. */
  selectedError: AlignmentError | null = null;

  // -------------------------------------------------------------------------
  // Diagnostic chart state — these mirror the dropdowns in the modal and feed
  // lookupDiagnostic() in alignment-errors.ts.
  // -------------------------------------------------------------------------
  diagSuspension: SuspensionType = 'SLA';
  diagSAI: TriState = 'OK';
  diagCamber: TriState = 'OK';
  diagIA: TriState = 'OK';
  /** Human-readable diagnosis text shown after the user picks the three TriState values. */
  diagResult: string = '';

  /** Manufacturer-spec maximum camber used for the wear classification in {@link updateStatus}. */
  maxCamSpec = 2;
  /** Manufacturer-spec minimum camber used for the wear classification in {@link updateStatus}. */
  minCamSpec = -2;

  /** Becomes true once the GLTF has finished loading and all visual aids are wired up. */
  modelLoaded = false;
  /** HTML status string rendered into the bottom strip — built by {@link updateStatus}. */
  statusMessage = '';

  /** Side-to-side camber difference. Positive = pulls left, negative = pulls right. */
  get crossCamber(): number { return this.leftCamber - this.rightCamber; }
  /** Sum of left and right toe — used by the wear-pattern logic. */
  get totalToe(): number { return this.leftToe + this.rightToe; }

  constructor() {}

  /** Angular lifecycle hook — kick off the Three.js bootstrap once the view exists. */
  ngOnInit() {
    this.initThree();
  }

  /**
   * Bootstrap the entire Three.js side of the component:
   *   - create scene, camera, renderer, lights
   *   - hook up orbit controls and resize observers
   *   - kick off async GLTF model loading
   *   - start the requestAnimationFrame loop
   */
  initThree() {
    this.scene = new THREE.Scene();
    this.setupCamera();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0xeeeeee);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    // Reflow the renderer whenever its container size changes. A plain
    // window resize listener is not enough because the container can change
    // size when the user toggles modes or when the error description panel
    // shows/hides at the top of the layout.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.onResize());
      ro.observe(this.rendererContainer.nativeElement);
    }
    this.setupLights();
    this.loadCarModel();
    this.animate();
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.updateStatus();
  }

  /**
   * Resize the renderer and camera to match the current container size.
   * Bails out if the container has zero area (e.g. while it is hidden behind
   * an `*ngIf`) so we don't poison the camera's aspect ratio with NaN.
   */
  onResize() {
    const el = this.rendererContainer.nativeElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Build the perspective camera and place it slightly above and behind the car. */
  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 5);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  /**
   * Add lighting to the scene. We deliberately use a very bright ambient
   * light because the visualization is technical/diagrammatic — we want the
   * car's painted surfaces clearly visible from any orbit angle, not
   * cinematically lit.
   */
  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 9);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  /**
   * Asynchronously load the GLTF Mercedes-Benz GLC model, locate its front
   * wheel meshes, build a {@link WheelAssembly} for each one, and instantiate
   * every overlay (axis lines, ribbons, tracers, jacking bars, road plane).
   *
   * Once everything is wired up, {@link modelLoaded} flips to `true`, which
   * enables all of the previously-disabled UI sliders.
   */
  loadCarModel() {
    const loader = new GLTFLoader();
    const base = document.baseURI;
    const modelPath = new URL('assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf', base).href;

    loader.load(modelPath, (gltf) => {
      const carModel = gltf.scene;
      this.carModel = carModel;
      this.scene.add(carModel);
      carModel.scale.set(1.5, 1.5, 1.5);
      carModel.position.set(0, -0.9, -2.1);
      this.carModelRestY = carModel.position.y;
      carModel.updateMatrixWorld(true);

      // The two front wheels are named in the GLTF source. We try the canonical
      // names first; some exports of this model lose the FR wheel's container
      // and only the inner mesh "Object_54" survives, so we fall back to its
      // parent in that case.
      let leftWheel: THREE.Object3D | null = null;
      let rightWheel: THREE.Object3D | null = null;
      carModel.traverse((node) => {
        if (node.name === 'Wheel_FL_28') leftWheel = node;
        if (node.name === 'Wheel_FR_32') rightWheel = node;
      });
      if (!rightWheel) {
        carModel.traverse((node) => {
          if (node.name === 'Object_54' && node.parent) rightWheel = node.parent;
        });
      }

      if (leftWheel && rightWheel) {
        this.leftWheelAssembly = new WheelAssembly(leftWheel, carModel, 'left');
        this.rightWheelAssembly = new WheelAssembly(rightWheel, carModel, 'right');

        this.leftAxisLines = createAxisLines(this.leftWheelAssembly);
        this.rightAxisLines = createAxisLines(this.rightWheelAssembly);

        // Reference arcs (toe tip path)
        this.leftReferenceArc = createReferenceArc(this.leftWheelAssembly, TOE_LINE_LENGTH, this.scene);
        this.rightReferenceArc = createReferenceArc(this.rightWheelAssembly, TOE_LINE_LENGTH, this.scene);

        // Spindle reference arcs
        this.leftSpindleReferenceArc = createSpindleReferenceArc(this.leftWheelAssembly, SPINDLE_LINE_LENGTH);
        this.rightSpindleReferenceArc = createSpindleReferenceArc(this.rightWheelAssembly, SPINDLE_LINE_LENGTH);

        // Road surface plane (3D grid at the actual wheel-bottom Y)
        createRoadSurfacePlane(this.scene, this.leftWheelAssembly, this.rightWheelAssembly);

        // Toe deviation ribbons (blue)
        this.leftRibbon = new DeviationRibbon(
          this.leftWheelAssembly, this.leftAxisLines.toeTipFront, TOE_LINE_LENGTH
        );
        this.rightRibbon = new DeviationRibbon(
          this.rightWheelAssembly, this.rightAxisLines.toeTipFront, TOE_LINE_LENGTH
        );

        // Spindle deviation ribbons (yellow)
        this.leftSpindleRibbon = new SpindleDeviationRibbon(this.leftWheelAssembly, SPINDLE_LINE_LENGTH);
        this.rightSpindleRibbon = new SpindleDeviationRibbon(this.rightWheelAssembly, SPINDLE_LINE_LENGTH);

        // Jacking indicators (body roll bars)
        this.leftJacking = new JackingIndicator(this.leftWheelAssembly);
        this.rightJacking = new JackingIndicator(this.rightWheelAssembly);

        // Per-error ghost lines + deviation wedges (hidden until an error is selected)
        this.leftErrorIndicator = new ErrorIndicator(this.leftWheelAssembly);
        this.rightErrorIndicator = new ErrorIndicator(this.rightWheelAssembly);

        // Capture wheel assembly REST positions in world space.
        // When carModel rolls/lifts, we'll counter-translate the assemblies
        // in carModel local space so the wheels stay at these positions.
        carModel.updateMatrixWorld(true);
        this.leftWheelAssembly.assembly.getWorldPosition(this.leftAssemblyRestPos);
        this.rightWheelAssembly.assembly.getWorldPosition(this.rightAssemblyRestPos);
        this.trackWidthWorld = Math.abs(this.leftAssemblyRestPos.x - this.rightAssemblyRestPos.x);

        // Tracers (toe tip + spindle tip)
        this.leftTracer = new ToeTracer(this.scene, this.leftAxisLines.toeTipFront);
        this.rightTracer = new ToeTracer(this.scene, this.rightAxisLines.toeTipFront);
        this.leftSpindleTracer = new ToeTracer(this.scene, this.leftAxisLines.spindleTip);
        this.rightSpindleTracer = new ToeTracer(this.scene, this.rightAxisLines.spindleTip);
        this.leftSpindleTracer.color = 0xffcc00;
        this.rightSpindleTracer.color = 0xffcc00;

        this.updateAllWheels();
        this.modelLoaded = true;
      } else {
        console.error('Failed to find wheel nodes in model');
      }
    });
  }

  /**
   * Compute the per-wheel steered angles from a single average input angle,
   * using ideal Ackermann steering geometry.
   *
   * In a real car, when you turn the steering wheel each front wheel turns
   * by a slightly different amount: the *inner* wheel (the one closer to the
   * turn centre) turns more than the outer wheel, so that both wheels trace
   * concentric circles around a common centre instead of scrubbing.
   *
   * Derivation:
   *   Let L = wheelbase, W = track width, δ = average steered angle.
   *   The turn centre lies on the rear axle line at distance R = L / tan(δ)
   *   from the centerline. The inner wheel pivots around a circle of radius
   *   (R − W/2) and the outer wheel around (R + W/2). The corresponding
   *   per-wheel angles are atan(L / (R ∓ W/2)).
   *
   * @param avgTurnDeg Average front-wheel steered angle (positive = turn left).
   * @returns The two per-wheel steered angles, signed the same way as the input.
   */
  computeAckermann(avgTurnDeg: number): { leftDeg: number; rightDeg: number } {
    if (Math.abs(avgTurnDeg) < 0.01) return { leftDeg: 0, rightDeg: 0 };
    const avgRad = THREE.MathUtils.degToRad(avgTurnDeg);
    const L = this.wheelbase;
    const W = this.trackWidth;
    const R = L / Math.tan(Math.abs(avgRad));
    const innerAngle = Math.atan(L / (R - W / 2));
    const outerAngle = Math.atan(L / (R + W / 2));
    if (avgTurnDeg > 0) {
      // Turning LEFT — left wheel is the inner wheel.
      return {
        leftDeg: THREE.MathUtils.radToDeg(innerAngle),
        rightDeg: THREE.MathUtils.radToDeg(outerAngle)
      };
    } else {
      // Turning RIGHT — right wheel is the inner wheel.
      return {
        leftDeg: -THREE.MathUtils.radToDeg(outerAngle),
        rightDeg: -THREE.MathUtils.radToDeg(innerAngle)
      };
    }
  }

  /**
   * Push the current slider state into both wheel assemblies and refresh
   * every dependent visualization (axis lines, ribbons, jacking bars,
   * tracers, status strip).
   *
   * Called whenever any control changes — the cost of touching every wheel
   * setter unconditionally is negligible compared to the WebGL render, so we
   * keep the data flow uniform and side-effect-free instead of trying to
   * surgically update only what changed.
   */
  updateAllWheels() {
    if (!this.leftWheelAssembly || !this.rightWheelAssembly) return;

    const ackermann = this.computeAckermann(this.turnAngle);
    this.leftTurnAngle = ackermann.leftDeg;
    this.rightTurnAngle = ackermann.rightDeg;

    this.leftWheelAssembly.setCaster(this.casterAngle);
    this.leftWheelAssembly.setSAI(this.saiAngle);
    this.leftWheelAssembly.setTurnAngle(this.leftTurnAngle);
    this.leftWheelAssembly.setCamber(this.leftCamber);
    this.leftWheelAssembly.setToe(this.leftToe);

    this.rightWheelAssembly.setCaster(this.casterAngle);
    this.rightWheelAssembly.setSAI(this.saiAngle);
    this.rightWheelAssembly.setTurnAngle(this.rightTurnAngle);
    this.rightWheelAssembly.setCamber(this.rightCamber);
    this.rightWheelAssembly.setToe(this.rightToe);

    // Body deltas for each corner (signed).
    // Positive = suspension extends, body corner rises.
    // Negative = suspension compresses, body corner drops.
    // BOTH wheels remain in contact with the road plane; only the body moves.
    const leftJack = this.leftWheelAssembly.computeJackingHeight();
    const rightJack = this.rightWheelAssembly.computeJackingHeight();

    // In 'actual' mode: lift + roll the entire carModel, then counter-translate
    // the wheel assemblies in carModel local space so the wheels stay on the ground.
    if (this.carModel) {
      if (this.visualMode === 'actual') {
        const avgLift = (leftJack + rightJack) / 2;
        // Positive Z rotation lifts the +X side. Left wheel is at +X, so when
        // leftJack > rightJack, the body rotates counterclockwise (positive Z).
        const rollRad = Math.atan2(leftJack - rightJack, this.trackWidthWorld);

        // Lift + roll the whole car
        this.carModel.position.y = this.carModelRestY + avgLift;
        this.carModel.rotation.z = rollRad;
        this.carModel.updateMatrixWorld(true);

        // For each wheel, compute where it ended up in world space, and apply
        // a counter-offset in carModel local space to put it back on the ground.
        this._counterTranslate(this.leftWheelAssembly, this.leftAssemblyRestPos);
        this._counterTranslate(this.rightWheelAssembly, this.rightAssemblyRestPos);
      } else {
        this.carModel.position.y = this.carModelRestY;
        this.carModel.rotation.z = 0;
        // Reset wheel assembly positions to their original carModel-local positions
        this._resetAssemblyPosition(this.leftWheelAssembly, this.leftAssemblyRestPos);
        this._resetAssemblyPosition(this.rightWheelAssembly, this.rightAssemblyRestPos);
      }
    }
    this.leftWheelAssembly.setVerticalLift(0);
    this.rightWheelAssembly.setVerticalLift(0);

    // Update jacking indicator bars (always show, even in conceptual mode)
    this.leftJacking?.update(leftJack);
    this.rightJacking?.update(rightJack);

    if (this.leftAxisLines) {
      updateCasterLine(this.leftAxisLines.casterLine, this.casterAngle, this.saiAngle, 'left');
    }
    if (this.rightAxisLines) {
      updateCasterLine(this.rightAxisLines.casterLine, this.casterAngle, this.saiAngle, 'right');
    }

    this.leftRibbon?.update(this.casterAngle, this.saiAngle, 'left');
    this.rightRibbon?.update(this.casterAngle, this.saiAngle, 'right');
    this.leftSpindleRibbon?.update(this.casterAngle, this.saiAngle, 'left');
    this.rightSpindleRibbon?.update(this.casterAngle, this.saiAngle, 'right');

    this.updateTracerColors();
    this.updateStatus();
  }

  /**
   * After carModel has been moved/rolled, compute where the assembly ended up
   * in world space and apply a delta in carModel local space to bring it back
   * to its rest world position. This keeps the wheel on the ground while the
   * rest of the model rolls/lifts.
   */
  private _counterTranslate(assembly: WheelAssembly, restWorldPos: THREE.Vector3) {
    if (!this.carModel) return;
    const currentWorld = new THREE.Vector3();
    assembly.assembly.getWorldPosition(currentWorld);
    const worldDelta = restWorldPos.clone().sub(currentWorld);
    // Convert world delta to carModel local space (carModel scale 1.5, possibly rotated)
    // For correct conversion through rotation, transform delta by inverse of carModel quaternion
    const inverseQuat = this.carModel.quaternion.clone().invert();
    worldDelta.applyQuaternion(inverseQuat);
    // Then divide by scale
    const scale = this.carModel.scale;
    worldDelta.x /= scale.x;
    worldDelta.y /= scale.y;
    worldDelta.z /= scale.z;
    assembly.assembly.position.add(worldDelta);
  }

  /** Reset assembly local position so its world position equals restWorldPos */
  private _resetAssemblyPosition(assembly: WheelAssembly, restWorldPos: THREE.Vector3) {
    if (!this.carModel) return;
    // Convert restWorldPos to carModel local space
    const local = restWorldPos.clone();
    this.carModel.worldToLocal(local);
    assembly.assembly.position.copy(local);
  }

  /**
   * Recolour the toe tracers so the *inner* wheel of the current turn is
   * highlighted in orange. This makes the Ackermann split visible at a
   * glance: the inner wheel sweeps a tighter arc than the outer wheel and
   * the colour swap reinforces which one is which.
   */
  updateTracerColors() {
    if (!this.leftTracer || !this.rightTracer) return;
    const def = 0x4488ff;     // default toe-tracer blue
    const inside = 0xff8800;  // highlight colour for the inside wheel
    if (this.turnAngle > 0.5) {
      this.leftTracer.color = (Math.abs(this.leftTurnAngle) > Math.abs(this.rightTurnAngle)) ? inside : def;
      this.rightTracer.color = def;
    } else if (this.turnAngle < -0.5) {
      this.rightTracer.color = (Math.abs(this.rightTurnAngle) > Math.abs(this.leftTurnAngle)) ? inside : def;
      this.leftTracer.color = def;
    } else {
      this.leftTracer.color = def;
      this.rightTracer.color = def;
    }
  }

  /** Bound to every slider's `(input)` event — just routes to {@link updateAllWheels}. */
  onAngleChange() { this.updateAllWheels(); }

  /** Restore every geometry slider to its factory-default value. */
  resetAngles() {
    this.leftCamber = 0;
    this.rightCamber = 0;
    this.totalToeSlider = 0;
    this.casterAngle = 3;
    this.saiAngle = 13;
    this.turnAngle = 0;
    this.updateAllWheels();
  }

  // -------------------------------------------------------------------------
  // Mode toggles
  // -------------------------------------------------------------------------

  /** Switch between Geometry-playground mode and Error-scenario mode. */
  setMode(m: AppMode) {
    this.mode = m;
    if (m === 'geometry') {
      this.selectedError = null;
      this.resetAngles();
    } else {
      // Always reset to a clean baseline before the user picks an error so
      // residual values from a previous session don't bleed into the new
      // scenario.
      this.resetAngles();
    }
    this.applyErrorVisuals();
  }

  /** Switch between conceptual (body fixed) and actual (body lifts/rolls) rendering. */
  setVisualMode(v: VisualMode) {
    this.visualMode = v;
    this.updateAllWheels();
  }

  /** Show/hide the floating legend overlay (used by the mobile layout). */
  toggleLegend() { this.showLegend = !this.showLegend; }

  /** Lookup helper used by the error-mode template to populate each row. */
  errorsForCategory(cat: AngleCategory): AlignmentError[] {
    return this.errorsByAngle.get(cat) ?? [];
  }

  // -------------------------------------------------------------------------
  // Error-mode handlers
  // -------------------------------------------------------------------------

  /**
   * Apply a canned alignment-error scenario to the simulation. We always
   * snap back to factory defaults first so an error scenario describes
   * exactly the offsets it specifies, with no leftover state from prior
   * selections.
   */
  selectError(err: AlignmentError) {
    this.selectedError = err;
    // Reset all to baseline first
    this.leftCamber = 0;
    this.rightCamber = 0;
    this.totalToeSlider = 0;
    this.casterAngle = 3;
    this.saiAngle = 13;
    this.turnAngle = 0;
    // Apply error state on top
    const s = err.state;
    if (s.leftCamber !== undefined) this.leftCamber = s.leftCamber;
    if (s.rightCamber !== undefined) this.rightCamber = s.rightCamber;
    if (s.totalToe !== undefined) this.totalToeSlider = s.totalToe;
    if (s.caster !== undefined) this.casterAngle = s.caster;
    if (s.sai !== undefined) this.saiAngle = s.sai;
    this.updateAllWheels();
    this.applyErrorVisuals();
  }

  /** Drop the selected error and return everything to factory defaults. */
  clearError() {
    this.selectedError = null;
    this.resetAngles();
    this.applyErrorVisuals();
  }

  // -------------------------------------------------------------------------
  // Error-mode visibility & ghost/wedge indicator logic
  // -------------------------------------------------------------------------

  /** Factory-default value used as the "ideal" reference for each angle. */
  private static readonly IDEAL_CAMBER = 0;
  private static readonly IDEAL_TOE = 0;
  private static readonly IDEAL_CASTER = 3;
  private static readonly IDEAL_SAI = 13;

  /**
   * Drive per-error visibility on the visualization.
   *
   * Geometry mode: every axis line, ribbon and reference arc is shown,
   * and all error-indicator ghosts/wedges are hidden.
   *
   * Error mode with no selection: same as geometry mode — the user can
   * still see the full visualization while they choose a scenario.
   *
   * Error mode with a selection: only the axis line(s) and supporting
   * geometry that are physically affected by the chosen error remain
   * visible. The matching ghost line + deviation wedge are activated to
   * make the change unmistakable, and any non-relevant deviation ribbons
   * / reference arcs are hidden so they don't compete for attention.
   */
  private applyErrorVisuals(): void {
    if (!this.leftAxisLines || !this.rightAxisLines) return;

    // Reset everything to fully visible, then narrow it down below.
    this._setAllAxisLineVisibility(true);
    this.leftErrorIndicator?.hideAll();
    this.rightErrorIndicator?.hideAll();

    if (this.mode !== 'error' || !this.selectedError) return;

    const err = this.selectedError;

    // Determine which sides of the car the error physically touches.
    let leftAffected = false;
    let rightAffected = false;
    if (err.angle === 'Camber') {
      leftAffected = (err.state.leftCamber ?? 0) !== 0;
      rightAffected = (err.state.rightCamber ?? 0) !== 0;
      // Cross-camber sets both — handle the rare "neither set" case by
      // falling back to whichever side actually differs from spec.
      if (!leftAffected && !rightAffected) {
        leftAffected = this.leftCamber !== CarViewerComponent.IDEAL_CAMBER;
        rightAffected = this.rightCamber !== CarViewerComponent.IDEAL_CAMBER;
      }
    } else {
      // All other categories are symmetric in the error data.
      leftAffected = true;
      rightAffected = true;
    }

    // Hide everything first; we'll re-enable only the relevant parts.
    this._setAllAxisLineVisibility(false);

    switch (err.angle) {
      case 'Camber': {
        if (leftAffected) {
          this.leftAxisLines.camberLine.visible = true;
          this.leftErrorIndicator?.showCamber(this.leftCamber, CarViewerComponent.IDEAL_CAMBER);
        }
        if (rightAffected) {
          this.rightAxisLines.camberLine.visible = true;
          this.rightErrorIndicator?.showCamber(this.rightCamber, CarViewerComponent.IDEAL_CAMBER);
        }
        break;
      }
      case 'Toe': {
        this.leftAxisLines.toeLine.visible = true;
        this.leftAxisLines.toeTipFront.visible = true;
        this.rightAxisLines.toeLine.visible = true;
        this.rightAxisLines.toeTipFront.visible = true;
        this.leftErrorIndicator?.showToe(this.leftToe, CarViewerComponent.IDEAL_TOE);
        this.rightErrorIndicator?.showToe(this.rightToe, CarViewerComponent.IDEAL_TOE);
        break;
      }
      case 'Caster': {
        this.leftAxisLines.casterLine.visible = true;
        this.rightAxisLines.casterLine.visible = true;
        // Spindle deviation ribbons help visualize how caster changes the
        // spindle path during steering — keep them on for caster errors.
        this.leftSpindleRibbon?.setVisible(true);
        this.rightSpindleRibbon?.setVisible(true);
        if (this.leftSpindleReferenceArc) this.leftSpindleReferenceArc.visible = true;
        if (this.rightSpindleReferenceArc) this.rightSpindleReferenceArc.visible = true;
        this.leftErrorIndicator?.showSteeringAxis(
          this.casterAngle, this.saiAngle,
          CarViewerComponent.IDEAL_CASTER, this.saiAngle
        );
        this.rightErrorIndicator?.showSteeringAxis(
          this.casterAngle, this.saiAngle,
          CarViewerComponent.IDEAL_CASTER, this.saiAngle
        );
        break;
      }
      case 'SAI': {
        this.leftAxisLines.casterLine.visible = true;
        this.rightAxisLines.casterLine.visible = true;
        this.leftSpindleRibbon?.setVisible(true);
        this.rightSpindleRibbon?.setVisible(true);
        if (this.leftSpindleReferenceArc) this.leftSpindleReferenceArc.visible = true;
        if (this.rightSpindleReferenceArc) this.rightSpindleReferenceArc.visible = true;
        this.leftErrorIndicator?.showSteeringAxis(
          this.casterAngle, this.saiAngle,
          this.casterAngle, CarViewerComponent.IDEAL_SAI
        );
        this.rightErrorIndicator?.showSteeringAxis(
          this.casterAngle, this.saiAngle,
          this.casterAngle, CarViewerComponent.IDEAL_SAI
        );
        break;
      }
      case 'ScrubRadius': {
        // Scrub-radius scenarios don't change any slider in the data, so
        // there is no deviation to draw — just leave the steering axis
        // and spindle line visible so the user can see where it meets the
        // road plane.
        this.leftAxisLines.casterLine.visible = true;
        this.rightAxisLines.casterLine.visible = true;
        this.leftAxisLines.spindleLine.visible = true;
        this.leftAxisLines.spindleTip.visible = true;
        this.rightAxisLines.spindleLine.visible = true;
        this.rightAxisLines.spindleTip.visible = true;
        break;
      }
    }
  }

  /**
   * Bulk show/hide every axis line, deviation ribbon, reference arc and
   * tip sphere across both wheels. Used by {@link applyErrorVisuals} as a
   * starting point before re-enabling the items relevant to the active
   * error category.
   */
  private _setAllAxisLineVisibility(visible: boolean): void {
    const sides: (AxisLines | null)[] = [this.leftAxisLines, this.rightAxisLines];
    for (const ax of sides) {
      if (!ax) continue;
      ax.camberLine.visible = visible;
      ax.casterLine.visible = visible;
      ax.toeLine.visible = visible;
      ax.toeTipFront.visible = visible;
      ax.spindleLine.visible = visible;
      ax.spindleTip.visible = visible;
    }
    this.leftRibbon?.setVisible(visible);
    this.rightRibbon?.setVisible(visible);
    this.leftSpindleRibbon?.setVisible(visible);
    this.rightSpindleRibbon?.setVisible(visible);
    if (this.leftReferenceArc) this.leftReferenceArc.visible = visible;
    if (this.rightReferenceArc) this.rightReferenceArc.visible = visible;
    if (this.leftSpindleReferenceArc) this.leftSpindleReferenceArc.visible = visible;
    if (this.rightSpindleReferenceArc) this.rightSpindleReferenceArc.visible = visible;
  }

  // -------------------------------------------------------------------------
  // SAI diagnostic chart (Mercedes DRIVE EKP 10.21)
  // -------------------------------------------------------------------------

  /** Open the diagnostic-chart modal in a clean state. */
  openDiagnostic() {
    this.showDiagnostic = true;
    this.diagResult = '';
  }

  /** Close the diagnostic-chart modal. */
  closeDiagnostic() { this.showDiagnostic = false; }

  /** Run the lookup against the chosen suspension type and SAI/Camber/IA values. */
  runDiagnostic() {
    this.diagResult = lookupDiagnostic(this.diagSuspension, this.diagSAI, this.diagCamber, this.diagIA);
  }

  /** Reset the three TriState toggles to OK and clear the diagnosis text. */
  resetDiagnostic() {
    this.diagSAI = 'OK';
    this.diagCamber = 'OK';
    this.diagIA = 'OK';
    this.diagResult = '';
  }

  /**
   * Build the rich-HTML status strip shown along the bottom of the viewer.
   * The classification rules are pulled from the same Mercedes-Benz EKP 10.21
   * source as the alignment-error definitions: cross-camber pulls are flagged
   * over 0.5°, toe wear is "feathered" outside ±0.1°, and per-wheel camber
   * outside [minCamSpec, maxCamSpec] produces shoulder wear.
   */
  updateStatus() {
    let toeStatus = '';
    let tireWearStatus = '';
    let pullDirectionStatus = '';
    const totalToe = this.totalToe;

    if (totalToe > 0.1) {
      toeStatus = '<span class="toe-in">Toe In</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
    } else if (totalToe < -0.1) {
      toeStatus = '<span class="toe-out">Toe Out</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
    } else {
      toeStatus = '<span class="neutral-toe">Neutral Toe</span>';
    }

    const crossCamber = this.crossCamber;
    const maxCam = Math.max(Math.abs(this.leftCamber), Math.abs(this.rightCamber));

    if (crossCamber > 0.5) pullDirectionStatus = '<span class="left-pull">Pulls Left</span>';
    else if (crossCamber < -0.5) pullDirectionStatus = '<span class="right-pull">Pulls Right</span>';
    else pullDirectionStatus = '<span class="no-pull">No Pull</span>';

    if (maxCam > this.maxCamSpec) tireWearStatus = '<span class="outer-wear">Outside Shoulder Wear</span>';
    else if (maxCam < this.minCamSpec) tireWearStatus = '<span class="inner-wear">Inside Shoulder Wear</span>';
    else if (Math.abs(totalToe) <= 0.1) tireWearStatus = '<span class="normal-wear">Normal Tire Wear</span>';

    this.statusMessage = `
      <div class="status-item"><h3>Caster</h3><span>${this.casterAngle.toFixed(1)}&deg;</span></div>
      <div class="status-item"><h3>SAI</h3><span>${this.saiAngle.toFixed(1)}&deg;</span></div>
      <div class="status-item"><h3>Toe</h3><span>${toeStatus}</span></div>
      <div class="status-item"><h3>Wear</h3><span>${tireWearStatus}</span></div>
      <div class="status-item"><h3>Pull</h3><span>${pullDirectionStatus}</span></div>
    `;
  }

  /**
   * Per-frame update loop. Drives the tracer animations and renders the
   * scene. Three.js doesn't run on its own — every visible change has to be
   * sent through `renderer.render` from inside requestAnimationFrame.
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.leftTracer?.update();
    this.rightTracer?.update();
    this.leftSpindleTracer?.update();
    this.rightSpindleTracer?.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Pretty-print a decimal angle as degrees + arcminutes — the format that
   * alignment racks display, e.g. `3.5` becomes `3° 30'`.
   */
  formatDegrees(value: number): string {
    const degrees = Math.floor(value);
    const minutes = Math.abs((value - degrees) * 60);
    return `${degrees}\u00B0 ${minutes.toFixed(0)}'`;
  }
}
