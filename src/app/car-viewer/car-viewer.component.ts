import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WheelAssembly } from './wheel-assembly';
import {
  createAxisLines, updateCasterLine, createReferenceArc,
  DeviationRibbon, AxisLines, ToeTracer, TOE_LINE_LENGTH
} from './axis-lines';

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
  leftRibbon: DeviationRibbon | null = null;
  rightRibbon: DeviationRibbon | null = null;

  // Per-wheel alignment angles (degrees)
  leftCamber = 0;
  rightCamber = 0;

  // Total toe (degrees): + = toe-in, - = toe-out. Split equally to each wheel.
  totalToeSlider = 0;
  get leftToe(): number { return this.totalToeSlider / 2; }
  get rightToe(): number { return this.totalToeSlider / 2; }

  // Shared geometry angles (degrees)
  casterAngle = 3;
  saiAngle = 13;
  turnAngle = 0;

  // Vehicle dimensions for Ackermann (meters, approximate for GLC)
  wheelbase = 2.87;
  trackWidth = 1.63;

  // Computed Ackermann angles
  leftTurnAngle = 0;
  rightTurnAngle = 0;

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
      this.scene.add(carModel);
      carModel.scale.set(1.5, 1.5, 1.5);
      carModel.position.set(0, -0.9, -2.1);
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

        // Reference arcs (grey dashed)
        createReferenceArc(this.leftWheelAssembly, TOE_LINE_LENGTH, this.scene);
        createReferenceArc(this.rightWheelAssembly, TOE_LINE_LENGTH, this.scene);

        // Deviation ribbons (shaded area between reference arc and actual path)
        this.leftRibbon = new DeviationRibbon(
          this.leftWheelAssembly, this.leftAxisLines.toeTipFront, TOE_LINE_LENGTH
        );
        this.rightRibbon = new DeviationRibbon(
          this.rightWheelAssembly, this.rightAxisLines.toeTipFront, TOE_LINE_LENGTH
        );

        // Tracers
        this.leftTracer = new ToeTracer(this.scene, this.leftAxisLines.toeTipFront);
        this.rightTracer = new ToeTracer(this.scene, this.rightAxisLines.toeTipFront);

        this.updateAllWheels();
        this.modelLoaded = true;
      } else {
        console.error('Failed to find wheel nodes in model');
      }
    });
  }

  computeAckermann(avgTurnDeg: number): { leftDeg: number; rightDeg: number } {
    if (Math.abs(avgTurnDeg) < 0.01) {
      return { leftDeg: 0, rightDeg: 0 };
    }

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

    if (this.leftAxisLines) {
      updateCasterLine(this.leftAxisLines.casterLine, this.casterAngle, this.saiAngle, 'left');
    }
    if (this.rightAxisLines) {
      updateCasterLine(this.rightAxisLines.casterLine, this.casterAngle, this.saiAngle, 'right');
    }

    // Update deviation ribbons to show caster/SAI effect
    this.leftRibbon?.update(this.casterAngle, this.saiAngle, 'left');
    this.rightRibbon?.update(this.casterAngle, this.saiAngle, 'right');

    this.updateTracerColors();
    this.updateStatus();
  }

  updateTracerColors() {
    if (!this.leftTracer || !this.rightTracer) return;

    const defaultColor = 0x4488ff;
    const insideColor = 0xff8800;

    if (this.turnAngle > 0.5) {
      this.leftTracer.color = (Math.abs(this.leftTurnAngle) > Math.abs(this.rightTurnAngle))
        ? insideColor : defaultColor;
      this.rightTracer.color = defaultColor;
    } else if (this.turnAngle < -0.5) {
      this.rightTracer.color = (Math.abs(this.rightTurnAngle) > Math.abs(this.leftTurnAngle))
        ? insideColor : defaultColor;
      this.leftTracer.color = defaultColor;
    } else {
      this.leftTracer.color = defaultColor;
      this.rightTracer.color = defaultColor;
    }
  }

  onAngleChange() {
    this.updateAllWheels();
  }

  resetAngles() {
    this.leftCamber = 0;
    this.rightCamber = 0;
    this.totalToeSlider = 0;
    this.casterAngle = 3;
    this.saiAngle = 13;
    this.turnAngle = 0;
    this.updateAllWheels();
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

    if (crossCamber > 0.5) {
      pullDirectionStatus = '<span class="left-pull">Pulls Left</span>';
    } else if (crossCamber < -0.5) {
      pullDirectionStatus = '<span class="right-pull">Pulls Right</span>';
    } else {
      pullDirectionStatus = '<span class="no-pull">No Pull</span>';
    }

    if (maxCam > this.maxCamSpec) {
      tireWearStatus = '<span class="outer-wear">Outside Shoulder Wear</span>';
    } else if (maxCam < this.minCamSpec) {
      tireWearStatus = '<span class="inner-wear">Inside Shoulder Wear</span>';
    } else if (Math.abs(totalToe) <= 0.1) {
      tireWearStatus = '<span class="normal-wear">Normal Tire Wear</span>';
    }

    const leftEffCamber = this.leftWheelAssembly?.getEffectiveCamber() ?? this.leftCamber;
    const rightEffCamber = this.rightWheelAssembly?.getEffectiveCamber() ?? this.rightCamber;

    this.statusMessage = `
      <div class="status-item">
        <h3>Caster</h3><span>${this.casterAngle.toFixed(1)}&deg;</span>
      </div>
      <div class="status-item">
        <h3>SAI/KPI</h3><span>${this.saiAngle.toFixed(1)}&deg;</span>
      </div>
      <div class="status-item">
        <h3>Toe</h3><span>${toeStatus}</span>
      </div>
      <div class="status-item">
        <h3>Tire Wear</h3><span>${tireWearStatus}</span>
      </div>
      <div class="status-item">
        <h3>Pull</h3><span>${pullDirectionStatus}</span>
      </div>
      <div class="status-item">
        <h3>Eff. Camber L/R</h3><span>${leftEffCamber.toFixed(1)}&deg; / ${rightEffCamber.toFixed(1)}&deg;</span>
      </div>
      <div class="status-item">
        <h3>Turn L/R</h3><span>${this.leftTurnAngle.toFixed(1)}&deg; / ${this.rightTurnAngle.toFixed(1)}&deg;</span>
      </div>
    `;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.leftTracer?.update();
    this.rightTracer?.update();
    this.renderer.render(this.scene, this.camera);
  }

  formatDegrees(value: number): string {
    const degrees = Math.floor(value);
    const minutes = Math.abs((value - degrees) * 60);
    return `${degrees}\u00B0 ${minutes.toFixed(0)}'`;
  }
}
