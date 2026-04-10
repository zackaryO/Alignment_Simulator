import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WheelAssembly } from './wheel-assembly';
import {
  createAxisLines, updateCasterLine, createReferenceArc, createSpindleReferenceArc,
  createRoadSurfacePlane, DeviationRibbon, SpindleDeviationRibbon,
  JackingIndicator, AxisLines, ToeTracer, TOE_LINE_LENGTH, SPINDLE_LINE_LENGTH
} from './axis-lines';
import {
  AlignmentError, AngleCategory, getErrorsByAngle,
  SuspensionType, TriState, lookupDiagnostic
} from './alignment-errors';

type AppMode = 'geometry' | 'error';
type VisualMode = 'conceptual' | 'actual';

@Component({
  selector: 'app-car-viewer',
  templateUrl: './car-viewer.component.html',
  styleUrls: ['./car-viewer.component.css']
})
export class CarViewerComponent implements OnInit {
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef<HTMLDivElement>;

  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  orbitControls!: OrbitControls;

  leftWheelAssembly: WheelAssembly | null = null;
  rightWheelAssembly: WheelAssembly | null = null;
  leftAxisLines: AxisLines | null = null;
  rightAxisLines: AxisLines | null = null;
  leftTracer: ToeTracer | null = null;
  rightTracer: ToeTracer | null = null;
  leftSpindleTracer: ToeTracer | null = null;
  rightSpindleTracer: ToeTracer | null = null;
  leftRibbon: DeviationRibbon | null = null;
  rightRibbon: DeviationRibbon | null = null;
  leftSpindleRibbon: SpindleDeviationRibbon | null = null;
  rightSpindleRibbon: SpindleDeviationRibbon | null = null;
  leftJacking: JackingIndicator | null = null;
  rightJacking: JackingIndicator | null = null;
  carModel: THREE.Object3D | null = null;
  carModelRestY = 0;
  leftAssemblyRestPos = new THREE.Vector3();
  rightAssemblyRestPos = new THREE.Vector3();
  trackWidthWorld = 1;

  // ===== Mode state =====
  mode: AppMode = 'geometry';
  visualMode: VisualMode = 'conceptual';
  showLegend = false;       // Mobile: hide by default, toggle button
  showDiagnostic = false;   // Diagnostic chart modal visibility

  // ===== Geometry mode controls =====
  leftCamber = 0;
  rightCamber = 0;
  totalToeSlider = 0;
  get leftToe(): number { return this.totalToeSlider / 2; }
  get rightToe(): number { return this.totalToeSlider / 2; }
  casterAngle = 3;
  saiAngle = 13;
  turnAngle = 0;

  // ===== Vehicle dimensions =====
  wheelbase = 2.87;
  trackWidth = 1.63;
  leftTurnAngle = 0;
  rightTurnAngle = 0;

  // ===== Error mode state =====
  errorsByAngle = getErrorsByAngle();
  angleCategories: AngleCategory[] = ['Camber', 'Caster', 'Toe', 'SAI', 'ScrubRadius'];
  selectedError: AlignmentError | null = null;

  // ===== Diagnostic chart state =====
  diagSuspension: SuspensionType = 'SLA';
  diagSAI: TriState = 'OK';
  diagCamber: TriState = 'OK';
  diagIA: TriState = 'OK';
  diagResult: string = '';

  maxCamSpec = 2;
  minCamSpec = -2;

  modelLoaded = false;
  statusMessage = '';

  get crossCamber(): number { return this.leftCamber - this.rightCamber; }
  get totalToe(): number { return this.leftToe + this.rightToe; }

  constructor() {}

  ngOnInit() {
    this.initThree();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.setupCamera();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0xeeeeee);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.setupLights();
    this.loadCarModel();
    this.animate();
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.updateStatus();
  }

  onResize() {
    const el = this.rendererContainer.nativeElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 5);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 9);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

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
        createReferenceArc(this.leftWheelAssembly, TOE_LINE_LENGTH, this.scene);
        createReferenceArc(this.rightWheelAssembly, TOE_LINE_LENGTH, this.scene);

        // Spindle reference arcs
        createSpindleReferenceArc(this.leftWheelAssembly, SPINDLE_LINE_LENGTH);
        createSpindleReferenceArc(this.rightWheelAssembly, SPINDLE_LINE_LENGTH);

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

  computeAckermann(avgTurnDeg: number): { leftDeg: number; rightDeg: number } {
    if (Math.abs(avgTurnDeg) < 0.01) return { leftDeg: 0, rightDeg: 0 };
    const avgRad = THREE.MathUtils.degToRad(avgTurnDeg);
    const L = this.wheelbase;
    const W = this.trackWidth;
    const R = L / Math.tan(Math.abs(avgRad));
    const innerAngle = Math.atan(L / (R - W / 2));
    const outerAngle = Math.atan(L / (R + W / 2));
    if (avgTurnDeg > 0) {
      return {
        leftDeg: THREE.MathUtils.radToDeg(innerAngle),
        rightDeg: THREE.MathUtils.radToDeg(outerAngle)
      };
    } else {
      return {
        leftDeg: -THREE.MathUtils.radToDeg(outerAngle),
        rightDeg: -THREE.MathUtils.radToDeg(innerAngle)
      };
    }
  }

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

  updateTracerColors() {
    if (!this.leftTracer || !this.rightTracer) return;
    const def = 0x4488ff;
    const inside = 0xff8800;
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

  onAngleChange() { this.updateAllWheels(); }

  resetAngles() {
    this.leftCamber = 0;
    this.rightCamber = 0;
    this.totalToeSlider = 0;
    this.casterAngle = 3;
    this.saiAngle = 13;
    this.turnAngle = 0;
    this.updateAllWheels();
  }

  // ===== Mode toggles =====
  setMode(m: AppMode) {
    this.mode = m;
    if (m === 'geometry') {
      this.selectedError = null;
      this.resetAngles();
    } else {
      // Reset to baseline before applying error
      this.resetAngles();
    }
  }

  setVisualMode(v: VisualMode) {
    this.visualMode = v;
    this.updateAllWheels();
  }

  toggleLegend() { this.showLegend = !this.showLegend; }

  errorsForCategory(cat: AngleCategory): AlignmentError[] {
    return this.errorsByAngle.get(cat) ?? [];
  }

  // ===== Error mode handlers =====
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
  }

  clearError() {
    this.selectedError = null;
    this.resetAngles();
  }

  // ===== Diagnostic chart =====
  openDiagnostic() {
    this.showDiagnostic = true;
    this.diagResult = '';
  }
  closeDiagnostic() { this.showDiagnostic = false; }

  runDiagnostic() {
    this.diagResult = lookupDiagnostic(this.diagSuspension, this.diagSAI, this.diagCamber, this.diagIA);
  }

  resetDiagnostic() {
    this.diagSAI = 'OK';
    this.diagCamber = 'OK';
    this.diagIA = 'OK';
    this.diagResult = '';
  }

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

  animate() {
    requestAnimationFrame(() => this.animate());
    this.leftTracer?.update();
    this.rightTracer?.update();
    this.leftSpindleTracer?.update();
    this.rightSpindleTracer?.update();
    this.renderer.render(this.scene, this.camera);
  }

  formatDegrees(value: number): string {
    const degrees = Math.floor(value);
    const minutes = Math.abs((value - degrees) * 60);
    return `${degrees}\u00B0 ${minutes.toFixed(0)}'`;
  }
}
