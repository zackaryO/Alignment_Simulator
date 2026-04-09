import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WheelAssembly } from './wheel-assembly';
import { createAxisLines } from './axis-lines';

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

  // Per-wheel alignment angles (degrees)
  leftCamber = 0;
  rightCamber = 0;
  leftToe = 0;
  rightToe = 0;

  // Shared geometry angles (degrees)
  casterAngle = 3;
  saiAngle = 13;
  turnAngle = 0;

  // Spec limits for status
  maxCamSpec = 2;
  minCamSpec = -2;

  modelLoaded = false;
  statusMessage = '';

  // Computed values
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
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xeeeeee);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
    this.setupLights();
    this.loadCarModel();
    this.animate();
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.updateStatus();
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
    const modelPath = '/Alignment_Simulator/assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';

    loader.load(modelPath, (gltf) => {
      const carModel = gltf.scene;
      this.scene.add(carModel);
      carModel.scale.set(1.5, 1.5, 1.5);
      carModel.position.set(0, -0.9, -2.1);

      // Force world matrix update before extracting wheels
      carModel.updateMatrixWorld(true);

      // Find wheel nodes
      let leftWheel: THREE.Object3D | null = null;
      let rightWheel: THREE.Object3D | null = null;
      carModel.traverse((node) => {
        if (node.name === 'Wheel_FL_28') leftWheel = node;
        if (node.name === 'Wheel_FR_32') rightWheel = node;
      });

      // Fallback: if Wheel_FR_32 not found, try Object_54's parent
      if (!rightWheel) {
        carModel.traverse((node) => {
          if (node.name === 'Object_54' && node.parent) {
            rightWheel = node.parent;
          }
        });
      }

      if (leftWheel && rightWheel) {
        // Create clean pivot hierarchies
        this.leftWheelAssembly = new WheelAssembly(leftWheel, carModel, 'left');
        this.rightWheelAssembly = new WheelAssembly(rightWheel, carModel, 'right');

        // Create visualization lines
        createAxisLines(this.leftWheelAssembly);
        createAxisLines(this.rightWheelAssembly);

        // Apply default geometry
        this.updateAllWheels();
        this.modelLoaded = true;
      } else {
        console.error('Failed to find wheel nodes in model');
      }
    });
  }

  updateAllWheels() {
    if (!this.leftWheelAssembly || !this.rightWheelAssembly) return;

    this.leftWheelAssembly.setCaster(this.casterAngle);
    this.leftWheelAssembly.setSAI(this.saiAngle);
    this.leftWheelAssembly.setTurnAngle(this.turnAngle);
    this.leftWheelAssembly.setCamber(this.leftCamber);
    this.leftWheelAssembly.setToe(this.leftToe);

    this.rightWheelAssembly.setCaster(this.casterAngle);
    this.rightWheelAssembly.setSAI(this.saiAngle);
    this.rightWheelAssembly.setTurnAngle(this.turnAngle);
    this.rightWheelAssembly.setCamber(this.rightCamber);
    this.rightWheelAssembly.setToe(this.rightToe);

    this.updateStatus();
  }

  onAngleChange() {
    this.updateAllWheels();
  }

  resetAngles() {
    this.leftCamber = 0;
    this.rightCamber = 0;
    this.leftToe = 0;
    this.rightToe = 0;
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

    // Toe status
    if (totalToe > 0.1) {
      toeStatus = '<span class="toe-in">Toe In</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
    } else if (totalToe < -0.1) {
      toeStatus = '<span class="toe-out">Toe Out</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
    } else {
      toeStatus = '<span class="neutral-toe">Neutral Toe</span>';
    }

    // Camber and pull
    const crossCamber = this.crossCamber;
    const maxCam = Math.max(Math.abs(this.leftCamber), Math.abs(this.rightCamber));

    if (crossCamber > 0.5) {
      pullDirectionStatus = '<span class="left-pull">Pulls Left</span>';
    } else if (crossCamber < -0.5) {
      pullDirectionStatus = '<span class="right-pull">Pulls Right</span>';
    } else {
      pullDirectionStatus = '<span class="no-pull">No Pull</span>';
    }

    // Tire wear
    if (maxCam > this.maxCamSpec) {
      tireWearStatus = '<span class="outer-wear">Outside Shoulder Wear</span>';
    } else if (maxCam < this.minCamSpec) {
      tireWearStatus = '<span class="inner-wear">Inside Shoulder Wear</span>';
    } else if (Math.abs(totalToe) <= 0.1) {
      tireWearStatus = '<span class="normal-wear">Normal Tire Wear</span>';
    }

    // Effective values from dynamic gain
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
    `;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  formatDegrees(value: number): string {
    const degrees = Math.floor(value);
    const minutes = Math.abs((value - degrees) * 60);
    return `${degrees}\u00B0 ${minutes.toFixed(0)}'`;
  }
}
