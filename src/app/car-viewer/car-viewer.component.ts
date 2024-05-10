import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

@Component({
  selector: 'app-car-viewer',
  templateUrl: './car-viewer.component.html',
  styleUrls: ['./car-viewer.component.css']
})
export class CarViewerComponent implements OnInit {
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef<HTMLDivElement>;

  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  frontCamera!: THREE.PerspectiveCamera;
  currentCamera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  // wheels: THREE.Mesh[] = [];
  wheels: THREE.Object3D[] = [];
  camberLines: THREE.Line[] = [];
  toeLines: THREE.Line[] = [];
  camberAngle: number = 0;
  toeAngle: number = 0;
  turnAngle: number = 0;
  driverCamberAngle: number = 0;
  driverToeAngle: number = 0;
  lastDriverToeAngle: number = 0;
  lastTurnAngle: number = 0;
  lastToeAngle: number = 0;
  statusMessage: string = '';
  orbitControls!: OrbitControls;
  modelLoaded: boolean = false;
  fROffsetTOE = 11;
  fROffsetCAMBER = -2;
  fROffsetXRotation = 15;
  fLOffsetTOE = -11;
  fLOffsetCAMBER = -5;
  fLOffsetXRotation = -21;
  driverWheelOuterOff = 90;
  driverWheelOuterOffCam = -90;
  driverWheelOuterOffCast = -12;
  driverWheel = 'Wheel_FL_28';
  maxCamSpec = 2;  // Maximum camber specification
  minCamSpec = -2; // Minimum camber specification
  // driverWheelOuter = 'Sketchfab_model';
  //Wheel_F005_15 and Object_22 are the rotor
  //Torus002_14 and Object_20 are the tire
  //Circle012_13 and Object_18 are the caliper
  //sus_up004_6 is a pin? same with Bone003_7 and Object_9
  //Cylinder011_2 is the upper control arm X:-96`, Y:-83`, Z:-18`
  // Object_6 is a better upper control arm
  driverWheelOuter = 'wheelhub_17';//outer wheel for toe
  driverWheelOuterCAM = 'Armature005_26';//outer wheel for cam
  passengerWheel = 'Object_54';

  constructor() { }

  ngOnInit() {
    this.initThree();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.setupCameras();
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

  loadCarModel() {
    const loader = new GLTFLoader();
    const modelPath = '../Alignment_Simulator/assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
    const suspensionModelPath = '../Alignment_Simulator/assets/rigged_suspension/scene.gltf';
    loader.load(modelPath, (gltf) => {
      const carModel = gltf.scene;
      this.scene.add(carModel);
      carModel.rotation.set(0, 0, 0); // Reset rotation or adjust to align correctly
      let foundWheels = 0;
      carModel.traverse((node) => {
        console.log("node", node.name);
        if (node.name === this.passengerWheel || node.name === this.driverWheel) {
          this.wheels.push(node);
          node.rotation.set(0, 0, 0); // Reset rotation or adjust to align correctly
          // Manually set the offset here
          if (node.name === this.passengerWheel) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.fROffsetTOE * Math.PI / 180; // Example adjustment
            node.rotation.y = this.fROffsetCAMBER * Math.PI / 180; // Example adjustment
            node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
          } else if (node.name === this.driverWheel) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.fLOffsetTOE * Math.PI / 180; // Example adjustment
            node.rotation.y = this.fLOffsetCAMBER * Math.PI / 180; // Example adjustment
            node.rotation.x = this.fLOffsetXRotation * Math.PI / 180; // Example adjustment
          }
          foundWheels++;

          const controls = new TransformControls(this.camera, this.renderer.domElement);
          controls.attach(node);
          controls.space = 'local';  // Use local space for transformations
          this.scene.add(controls);
          controls.setMode('rotate');
          controls.showX = false;
          controls.showY = false;
          controls.showZ = false;

          controls.addEventListener('objectChange', () => {
            this.updateLabel(node.userData['label'], node, node.name); // Update label on object change
          });

          controls.addEventListener('mouseDown', () => {
            this.orbitControls.enabled = false;
          });
          controls.addEventListener('mouseUp', () => {
            this.orbitControls.enabled = true;
            this.updateLabel(node.userData['label'], node, node.name); // Final update on mouse up
          });

          // Create labels
          // const labelPosition = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).add(new THREE.Vector3(0, 2, 0));
          // const label = this.createLabel(node.name, 'X: 0°, Y(camber): 0°, Z(toe): 0°', labelPosition);
          // node.userData['label'] = label;
          // this.scene.add(label);
        }
      });

      if (foundWheels === 2) {
        this.modelLoaded = true;
      } else {
        console.error('Failed to find both wheels');
      }

      carModel.scale.set(1, 1, 1);
      carModel.position.set(0, 0, 0);

    });

// outside wheel
    loader.load(suspensionModelPath, (gltf) => {
      // Original suspension model
      const originalModel = gltf.scene;
      originalModel.traverse((node) => {
        console.log("wheel", node.name);

        originalModel.scale.set(.3, .3, .3);
        originalModel.position.set(1.5, -0.5, 2); // Position to the left of the original model

        if (node.name === this.driverWheelOuter 
          || node.name === this.driverWheelOuterCAM
        ) {
          // Adjust the Z-axis rotation to visually appear as zero
          this.wheels.push(node);
          node.rotation.set(0, 0, 90); // Reset rotation or adjust to align correctly
          // Manually set the offset here
          if (node.name === this.driverWheelOuter) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.driverWheelOuterOff * Math.PI / 180; // Example adjustment
            // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
          }
          if (node.name === this.driverWheelOuterCAM) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.driverWheelOuterOffCam * Math.PI / 180; // Example adjustment
            // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
          }

          if (node.name === this.driverWheelOuterCAM) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.x = this.driverWheelOuterOffCast * Math.PI / 180; // Example adjustment
            // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
          }

           if (node.name === this.driverWheelOuter){
          const controls = new TransformControls(this.camera, this.renderer.domElement);
          controls.attach(node);
          controls.space = 'local';  // Use local space for transformations
          this.scene.add(controls);
          controls.setMode('rotate');
          controls.showX = false;
          controls.showY = false;
          controls.showZ = false;
          controls.addEventListener('objectChange', () => {
            this.updateLabel(node.userData['label'], node, node.name); // Update label on object change
          });

          controls.addEventListener('mouseDown', () => {
            this.orbitControls.enabled = false;
          });
          controls.addEventListener('mouseUp', () => {
            this.orbitControls.enabled = true;
            this.updateLabel(node.userData['label'], node, node.name); // Final update on mouse up
          });

          // Create labels
          // const labelPosition = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).add(new THREE.Vector3(2, 2, 0));
          // const label = this.createLabel(node.name, 'X: 0°, Y: 0°, Z: 0°', labelPosition);
          // node.userData['label'] = label;
          // this.scene.add(label);
        }
        }

        this.scene.add(originalModel);
      });
    });
  }

  resetAngles() {
    this.camberAngle = 0;
    this.toeAngle = 0;
    this.turnAngle = 0;
    this.driverCamberAngle = 0;
    this.driverToeAngle = 0;


    // Update the range inputs if needed
    const camberInput = document.getElementById('camber') as HTMLInputElement;
    const toeInput = document.getElementById('toe') as HTMLInputElement;
    if (camberInput) camberInput.value = '0';
    if (toeInput) toeInput.value = '0';

    // Update wheel rotation and labels
    this.updateWheelRotation();
       this.changeDriver();
    this.updateStatus();
  }

  addAxisLines(wheel: THREE.Object3D, index: number) {
    const materialCamber = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const materialToe = new THREE.LineBasicMaterial({ color: 0x0000ff });

    const pointsCamber = [
      new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z),
      new THREE.Vector3(wheel.position.x, wheel.position.y + 1, wheel.position.z)
    ];
    const pointsToe = [
      new THREE.Vector3(wheel.position.x - 0.5, wheel.position.y, wheel.position.z),
      new THREE.Vector3(wheel.position.x + 0.5, wheel.position.y, wheel.position.z)
    ];

    const camberLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pointsCamber), materialCamber);
    const toeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pointsToe), materialToe);

    this.scene.add(camberLine);
    this.scene.add(toeLine);
    this.camberLines[index] = camberLine;
    this.toeLines[index] = toeLine;
  }

  onCamberChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.camberAngle = angle;
    this.updateWheelRotation();
    this.changeDriver();
    this.updateStatus();
  }

  onToeChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.toeAngle = angle;
    this.updateWheelRotation();
    this.changeDriver();
    this.updateStatus();
  }

  onDriverToeChange(event: any) {
    const value = parseFloat(event.target.value);
    this.driverToeAngle = value;
    this.changeDriver();
    this.updateStatus();
    // this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }
  
  onTurnAngleChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.turnAngle = angle;
    this.changeDriver();
    this.updateTurnAngle();
  }

    onDriverCamberChange(event: any) {
    const value = parseFloat(event.target.value);
    this.camberAngle = value;
    this.changeDriver();
    this.updateStatus();
    // this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }

 
  changeDriver() {
      let manualOffsetZ = 0;
      let manualOffsetY = 0;
      let toeAngle = 0;
    // Check if each specific angle has been updated
    if (this.driverToeAngle !== this.lastDriverToeAngle) {
      toeAngle = this.driverToeAngle;
      this.lastDriverToeAngle = this.driverToeAngle; // Update last known value
    } else if (this.turnAngle !== this.lastTurnAngle) {
      toeAngle = this.turnAngle;
      this.lastTurnAngle = this.turnAngle; // Update last known value
    } else if (this.toeAngle !== this.lastToeAngle) {
      toeAngle = this.toeAngle;
      this.lastToeAngle = this.toeAngle; // Update last known value
    }
    this.wheels.forEach((wheel, index) => {
      if (wheel.name === this.driverWheel) {
        manualOffsetZ = this.fLOffsetTOE * Math.PI / 180; // Example adjustment
        manualOffsetY = this.fLOffsetCAMBER * Math.PI / 180; // Example adjustment
        wheel.rotation.y = (this.camberAngle + Math.abs((-this.toeAngle*0.6))) * Math.PI / 180 + manualOffsetY; // Adjusting for camber and manual offset

      }
      wheel.rotation.z = toeAngle * Math.PI / 180 + manualOffsetZ;   // Adjusting for toe and manual offset

      if (wheel.name === this.driverWheelOuter) {
        manualOffsetZ = this.driverWheelOuterOff * Math.PI / 180; 
        wheel.rotation.x = -toeAngle * Math.PI / 180; 
        wheel.rotation.z =  -Math.abs((-toeAngle*0.4)) * Math.PI / 180 + manualOffsetZ;
      }

      if (wheel.name === this.driverWheelOuterCAM) {
        manualOffsetZ = this.driverWheelOuterOffCam * Math.PI / 180; // Example adjustment
        wheel.rotation.z = -this.camberAngle * Math.PI / 180 + manualOffsetZ;
      }

    });
    this.updateStatus();
    this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }

  // Total Toe and Cross Camber
  updateWheelRotation() {
    this.wheels.forEach((wheel, index) => {
      // Preserve the manually set offset
      let manualOffsetZ = 0;
      let manualOffsetY = 0;
      if (wheel.name === this.passengerWheel) {
        manualOffsetZ = this.fROffsetTOE * Math.PI / 180; // Example adjustment
        manualOffsetY = this.fROffsetCAMBER * Math.PI / 180; // Example adjustment
        wheel.rotation.y = (-this.camberAngle + -Math.abs((-this.toeAngle*0.6))) * Math.PI / 180 + manualOffsetY; // Inverse camber angle for passenger wheel
        wheel.rotation.z = this.toeAngle * Math.PI / 180 + manualOffsetZ;   // Adjusting for toe and manual offset
      } 
    });

    this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }

  // Total Toe and Cross Camber
  updateTurnAngle() {
    this.wheels.forEach((wheel, index) => {
      // Preserve the manually set offset
      let manualOffsetZ = 0;
      let manualOffsetY = 0;
      if (wheel.name === this.passengerWheel) {
        manualOffsetZ = this.fROffsetTOE * Math.PI / 180; // Example adjustment
        manualOffsetY = this.fROffsetCAMBER * Math.PI / 180; // Example adjustment
        wheel.rotation.y = (-this.camberAngle + -Math.abs((-this.turnAngle*0.6))) * Math.PI / 180 + manualOffsetY; // Inverse camber angle for passenger wheel
        wheel.rotation.z = -this.turnAngle * Math.PI / 180 + manualOffsetZ;
      } 

      // if (wheel.name === this.driverWheelOuterCAM) {
      //   manualOffsetZ = this.driverWheelOuterOffCam * Math.PI / 180; // Example adjustment
      //   wheel.rotation.z = -this.camberAngle * Math.PI / 180 + manualOffsetZ;
      // }

      // Label update section
      // const label = wheel.userData['label'] as THREE.Sprite;
      // if (label) {
      //   this.updateLabel(label, wheel, wheel.name); // Include wheel.name
      // } else {
      //   // Create label if it does not exist
      //   const labelPosition = new THREE.Vector3().setFromMatrixPosition(wheel.matrixWorld).add(new THREE.Vector3(0, 2, 0));
      //   const initialText = `X: 0°, Y: 0°, Z: 0°`;
      //   wheel.userData['label'] = this.createLabel(wheel.name, initialText, labelPosition); // Include wheel.name
      // }
    });

    this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }

updateStatus() {
    let toeStatus = '';
    let tireWearStatus = '';
    let pullDirectionStatus = '';
    
    // Toe status
    //need to give toe a range
    if ((this.toeAngle > 0) || (this.driverToeAngle > 0)) {
      toeStatus = '<span class="toe-out">Toe Out</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
      pullDirectionStatus = '<span class="no pull">No pull</span>';
    } else if ((this.toeAngle < 0) || (this.driverToeAngle < 0)) {
      toeStatus = '<span class="toe-in">Toe In</span>';
      tireWearStatus = '<span class="feathered">Feathered</span>';
      pullDirectionStatus = '<span class="no pull">No pull</span>';
    } else {
      toeStatus = '<span class="neutral-toe">Neutral Toe</span>';
      
    }

    // Camber and pull direction status
    if ((this.driverCamberAngle > this.maxCamSpec) || (this.camberAngle > this.maxCamSpec)) {
      tireWearStatus = '<span class="outer-wear">Outside shoulder wear</span>';
      pullDirectionStatus = '<span class="left-pull">Pulls to the left</span>';
    } else if ((this.driverCamberAngle < this.minCamSpec)|| (this.camberAngle < this.minCamSpec)) {
      tireWearStatus = '<span class="inner-wear">Inside shoulder wear</span>';
      pullDirectionStatus = '<span class="right-pull">Pulls to the right</span>';
    }

    //need to give toe a range
if ((this.driverCamberAngle <= this.maxCamSpec) && (this.driverCamberAngle >= this.minCamSpec) && (this.toeAngle === 0)
  && (this.driverToeAngle === 0) && (this.camberAngle <= this.maxCamSpec) && (this.camberAngle >= this.minCamSpec)){
    tireWearStatus = '<span class="normal-wear">Normal tire wear</span>';
}

//need to give toe a range
if ((this.toeAngle === 0) && (this.driverCamberAngle <= this.maxCamSpec) && (this.driverCamberAngle >= this.minCamSpec) && (this.toeAngle === 0) 
  && (this.driverToeAngle === 0)) {
    // tireWearStatus = '<span class="normal-wear">Normal tire wear</span>';
    pullDirectionStatus = '<span class="no pull">No pull</span>';
}

    this.statusMessage = `
      <h1>Toe</h1>${toeStatus}
      <h1>Tire Wear</h1>${tireWearStatus}
      <h1>Pull Direction</h1>${pullDirectionStatus}
    `;
  }

  updateLabel(label: THREE.Sprite, wheel: THREE.Object3D, nodeName: string) {
    if (!label || !label.material || !label.material.map || !(label.material.map.image instanceof HTMLCanvasElement)) {
      console.error('Label or texture is missing or not properly configured');
      return;
    }
    const canvas = label.material.map.image;
    const context = canvas.getContext('2d');
    if (!context) {
      console.error('Failed to get canvas context');
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillText(nodeName, 128, 64);  // Redraw the node name at the top
    context.fillText(`X: ${THREE.MathUtils.radToDeg(wheel.rotation.x).toFixed(0)}°, Y: ${THREE.MathUtils.radToDeg(wheel.rotation.y).toFixed(0)}°, Z: ${THREE.MathUtils.radToDeg(wheel.rotation.z).toFixed(0)}°`, 128, 128);
    label.material.map.needsUpdate = true;  // Important: update the texture map
  }

  createLabel(nodeName: string, text: string, position: THREE.Vector3): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Failed to get canvas context");

    context.fillStyle = '#000000';  // Set text color
    context.textAlign = 'center';
    context.font = '18px Arial';
    context.fillText(nodeName, 128, 64);  // Place the node name at the top
    context.fillText(text, 128, 128);  // Initial angles at the center

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    sprite.scale.set(2, 2, 2);  // Adjust the scale as needed
    sprite.position.copy(position);
    this.scene.add(sprite);

    return sprite;
  }

  updateLineGeometry(line: THREE.Line, wheel: THREE.Object3D, type: 'camber' | 'toe') {
    let start = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z);
    let end = start.clone();
    if (type === 'camber') {
      // Extending the line vertically for camber visualization
      end.y += 1; // Adjust length as needed
    } else if (type === 'toe') {
      // Extending the line horizontally for toe visualization
      end.x += (wheel.rotation.y > 0 ? -0.5 : 0.5); // Adjust direction based on toe angle
    }
    line.geometry.setFromPoints([start, end]);
    line.geometry.attributes['position'].needsUpdate = true; // Ensure the geometry updates
  }

  // Corrected Camera Setup
  setupCameras() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 5); // Side view
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.frontCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.frontCamera.position.set(5, 5, 5); // Front view
    this.frontCamera.lookAt(new THREE.Vector3(0, 0, 0)); // Corrected method call

    this.currentCamera = this.camera;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 9);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.currentCamera);
  }

  toggleView() {
    this.currentCamera = this.currentCamera === this.camera ? this.frontCamera : this.camera;
  }

  formatDegrees(value: number): string {
    const degrees = Math.floor(value);
    const minutes = Math.abs((value - degrees) * 60);
    return `${degrees}° ${minutes.toFixed(0)}'`;
  }
}



// import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
// import * as THREE from 'three';
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// import { nodeArray } from 'three/examples/jsm/nodes/shadernode/ShaderNode';



// @Component({
//   selector: 'app-car-viewer',
//   templateUrl: './car-viewer.component.html',
//   styleUrls: ['./car-viewer.component.css']
// })
// export class CarViewerComponent implements OnInit {
//   @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef<HTMLDivElement>;

//   scene!: THREE.Scene;
//   camera!: THREE.PerspectiveCamera;
//   frontCamera!: THREE.PerspectiveCamera;
//   currentCamera!: THREE.PerspectiveCamera;
//   renderer!: THREE.WebGLRenderer;
//   wheels: THREE.Mesh[] = [];
//   camberLines: THREE.Line[] = [];
//   toeLines: THREE.Line[] = [];
//   camberAngle: number = 0;
//   toeAngle: number = 0;
//   orbitControls!: OrbitControls;
//   modelLoaded: boolean = false;

//   constructor() { }

//   ngOnInit() {
//     this.initThree();

//   }

//   initThree() {
//     // Initial setup for the scene, camera, and renderer
//     this.scene = new THREE.Scene();
//     this.setupCameras();
//     this.renderer = new THREE.WebGLRenderer({ antialias: true });
//     this.renderer.setSize(window.innerWidth, window.innerHeight);
//     this.renderer.setClearColor(0xeeeeee);
//     this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
//     this.setupLights();
//     this.loadCarModel();
//     this.animate();
//     // this.setupWheels();

//     this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
//   }


//   // loadCarModel() {
//   //   const loader = new GLTFLoader();
//   //   const modelPath = '../../assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
//   //   loader.load(modelPath, (gltf) => {
//   //     const carModel = gltf.scene;
//   //     console.log('Car model loaded:', carModel);

//   //     // Traverse the model to log all nodes
//   //     carModel.traverse((node) => {
//   //       console.log('Node found:', node.name, node.type);  // Log the name and type of each node
//   //       if (node instanceof THREE.Mesh && /wheel/i.test(node.name)) {
//   //         this.wheels.push(node);  // Add the wheel to the wheels array only if it's a Mesh
//   //       }
//   //     });

//   //     carModel.scale.set(1.5, 1.5, 1.5);
//   //     carModel.position.set(0, 0, 0);
//   //     this.scene.add(carModel);
//   //   }, (xhr) => {
//   //     console.log(`Model ${modelPath} loading progress: ${xhr.loaded / xhr.total * 100}%`);
//   //   }, (error) => {
//   //     console.error(`An error happened while loading the model at ${modelPath}:`, error);
//   //   });
//   // }

// loadCarModel() {
//   const loader = new GLTFLoader();
//   const modelPath = '../../assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
//   loader.load(modelPath, (gltf) => {
//     const carModel = gltf.scene;
//     this.scene.add(carModel);
//     carModel.traverse((node) => {
//       if (node.name === 'Wheel_FL_28' || node.name === 'Wheel_FR_32') {
//         const controls = new TransformControls(this.camera, this.renderer.domElement);
//         controls.attach(node);
//         this.scene.add(controls);

//         // Set mode to 'rotate' for general rotation
//         controls.setMode('rotate');
//         controls.showX = false; // Enable rotation handle for X-axis (pitch)
//         controls.showY = true; // Enable rotation handle for Y-axis (TOE)
//         controls.showZ = true; // enable rotation handle for Z-axis (CAMBER)

//         controls.addEventListener('mouseDown', () => {
//           this.orbitControls.enabled = false;  // Disable orbit controls when using transform controls
//         });
//         controls.addEventListener('mouseUp', () => {
//           this.orbitControls.enabled = true;  // Re-enable orbit controls after using transform controls
//         });
//       }
//     });

//     carModel.scale.set(1.5, 1.5, 1.5);
//     carModel.position.set(0, 0, 0);
//   }, (xhr) => {
//     console.log(`Model ${modelPath} loading progress: ${xhr.loaded / xhr.total * 100}%`);
//   }, (error) => {
//     console.error(`An error happened while loading the model at ${modelPath}:`, error);
//   });
// }

//   // loadCarModel() {
//   //   const loader = new GLTFLoader();
//   //   const modelPath = '../../assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
//   //   loader.load(modelPath, (gltf) => {
//   //     const carModel = gltf.scene;
//   //     this.scene.add(carModel);

//   //     let wheelFLFound = false;
//   //     let wheelFRFound = false;

//   //     carModel.traverse((node) => {
//   //       // Ensure the node is both a mesh and one of the wheels we're interested in before assigning
//   //       if (node instanceof THREE.Mesh) {
//   //         if (node.name === 'Wheel_FL_28') {
//   //           this.wheels[0] = node;  // Correct indexing with type assurance
//   //           wheelFLFound = true;
//   //         } else if (node.name === 'Wheel_FR_32') {
//   //           this.wheels[1] = node;
//   //           wheelFRFound = true;
//   //         }
//   //       }
//   //     });

//   //     if (wheelFLFound && wheelFRFound) {
//   //       this.modelLoaded = true;  // Set the model loaded flag to true only if both wheels are found
//   //     } else {
//   //       console.error('Expected wheel nodes not found!');
//   //     }

//   //     carModel.scale.set(1.5, 1.5, 1.5);
//   //     carModel.position.set(0, 0, 0);
//   //   }, (xhr) => {
//   //     console.log(`Model ${modelPath} loading progress: ${xhr.loaded / xhr.total * 100}%`);
//   //   }, (error) => {
//   //     console.error(`An error happened while loading the model at ${modelPath}:`, error);
//   //   });
//   // }


//   // addStaticLine(wheel: THREE.Object3D, color: number): THREE.Line {
//   //   const material = new THREE.LineBasicMaterial({ color: color });
//   //   const points = [
//   //     new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z),
//   //     new THREE.Vector3(wheel.position.x, wheel.position.y + 1, wheel.position.z)
//   //   ];
//   //   const geometry = new THREE.BufferGeometry().setFromPoints(points);
//   //   const line = new THREE.Line(geometry, material);
//   //   this.scene.add(line);
//   //   return line;
//   // }

//   addStaticLine(wheel: THREE.Mesh, color: number, isToe: boolean): THREE.Line {
//     const material = new THREE.LineBasicMaterial({ color: color });
//     let points;
//     if (isToe) {
//       // Make the toe lines parallel to the front wheels by extending along the Z-axis
//       points = [
//         new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z - 1),
//         new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z + 1)
//       ];
//     } else {
//       // Camber lines remain as is, vertical in the Y-direction
//       points = [
//         new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z),
//         new THREE.Vector3(wheel.position.x, wheel.position.y + 1, wheel.position.z)
//       ];
//     }
//     const geometry = new THREE.BufferGeometry().setFromPoints(points);
//     const line = new THREE.Line(geometry, material);
//     this.scene.add(line);
//     return line;
//   }





//   updateCamberLines(index: number) {
//     const wheel = this.wheels[index];
//     const angle = this.camberAngle * Math.PI / 180; // Convert to radians

//     const yOffset = Math.sin(angle); // Adjust Y based on angle, simulating camber tilt

//     const startPoint = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z);
//     const endPoint = new THREE.Vector3(wheel.position.x, wheel.position.y + 4, wheel.position.z + yOffset);

//     this.camberLines[index].geometry.setFromPoints([startPoint, endPoint]);
//     this.camberLines[index].geometry.computeBoundingSphere();
//   }

//   updateToeLines(index: number) {
//     const wheel = this.wheels[index];
//     const angle = this.toeAngle * Math.PI / 180; // Convert to radians

//     const zOffset = Math.sin(angle); // Adjust Z based on toe angle

//     const startPoint = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z);
//     const endPoint = new THREE.Vector3(wheel.position.x + zOffset, wheel.position.y, wheel.position.z + 4);

//     this.toeLines[index].geometry.setFromPoints([startPoint, endPoint]);
//     this.toeLines[index].geometry.computeBoundingSphere();
//   }


//   setupCameras() {
//     this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
//     this.camera.position.set(0, 5, 5); // Side view
//     this.camera.lookAt(new THREE.Vector3(0, 0, 0));

//     this.frontCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
//     this.frontCamera.position.set(5, 5, 5); // Front view
//     this.frontCamera.lookAt(new THREE.Vector3(0, 0, 0));

//     this.currentCamera = this.camera;
//   }

//   setupLights() {
//     const ambientLight = new THREE.AmbientLight(0xffffff, 5);
//     this.scene.add(ambientLight);
//     const directionalLight = new THREE.DirectionalLight(0xffffff, 9);
//     directionalLight.position.set(1, 1, 1);
//     this.scene.add(directionalLight);
//   }


//   setupWheels() {
//     // const carMaterial = new THREE.MeshStandardMaterial({ color: 0x778899 });
//     // const carGeometry = new THREE.BoxGeometry(3, 1, 2);
//     // const car = new THREE.Mesh(carGeometry, carMaterial);
//     // car.position.set(0, 0.5, 0);
//     // this.scene.add(car);

//     const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
//     const wheelGeometry = new THREE.CylinderGeometry(0.64, 0.64, 0.6, 32);
//     const positions = [
//       { x: -1.2, y: 0.4, z: 2 },  // Front left
//       { x: 1.2, y: 0.4, z: 2 },   // Front right
//       { x: -1.5, y: 0.2, z: -1 }, // Rear left
//       { x: 1.5, y: 0.2, z: -1 }   // Rear right
//     ];
//     positions.forEach(pos => {
//       const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
//       wheel.rotation.z = Math.PI / 2; // Correct orientation for the wheels
//       wheel.position.set(pos.x, pos.y, pos.z);
//       this.scene.add(wheel);
//       this.wheels.push(wheel);
//     });
//     // Static axis lines for each wheel
//     this.wheels.forEach((wheel, index) => {
//       this.camberLines.push(this.addStaticLine(wheel, 0xff0000, false)); // Red for camber
//       this.toeLines.push(this.addStaticLine(wheel, 0x0000ff, true)); // Blue for toe
//     });
//   }



//   animate() {
//     requestAnimationFrame(() => this.animate());
//     this.renderer.render(this.scene, this.currentCamera);
//   }

//   toggleView() {
//     this.currentCamera = this.currentCamera === this.camera ? this.frontCamera : this.camera;
//   }

//   formatDegrees(value: number): string {
//     const degrees = Math.floor(value);
//     const minutes = Math.abs((value - degrees) * 60);
//     return `${degrees}° ${minutes.toFixed(0)}'`;
//   }

//   onCamberChange(event: any) {
//     const angle = parseFloat(event.target.value);
//     this.camberAngle = angle;
//     this.wheels.forEach(wheel => {
//       if (wheel instanceof THREE.Mesh) { // Safeguard to ensure correct type
//         wheel.rotation.z = angle * Math.PI / 180; // Example rotation adjustment
//       }
//     });
//   }

//   onToeChange(event: any) {
//     const angle = parseFloat(event.target.value);
//     this.toeAngle = angle;
//     // this.wheels.forEach(wheel => {
//     //   if (wheel instanceof THREE.Mesh) { // Ensure it's a Mesh
//     //     wheel.rotation.y = angle * Math.PI / 180; // Adjust rotation
//     //   }
//     // });
//     for (let i = 0; i < 2; i++) {
//       console.log("toe is being adjusted");
//       console.log("node", event.target.value);
//       this.wheels[0].rotation.y = angle * Math.PI / 180; // Adjust front wheels only
//       this.wheels[1].rotation.y = -angle * Math.PI / 180;
//       this.updateToeLines(i);
//     }
//   }

//   // updateCamberLines(index: number) {
//   //   const wheel = this.wheels[index];
//   //   const angle = wheel.rotation.z; // The current camber rotation of the wheel

//   //   // Starting point at the center of the wheel
//   //   const startPoint = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z);

//   //   // Calculating the end point for the camber line
//   //   // Differentiating between left (index 0) and right (index 1) wheels
//   //   let xOffset = Math.cos(angle) * 1; // Basic cosine adjustment
//   //   if (index === 1) { // If it's the right wheel, mirror the direction
//   //     xOffset = -xOffset; // Reverse the direction for the right wheel
//   //   }

//   //   const endPoint = new THREE.Vector3(
//   //     startPoint.x + xOffset, // Adjust x based on camber angle and wheel side
//   //     wheel.position.y + 4,   // Slightly above the wheel
//   //     wheel.position.z        // No z-axis change
//   //   );

//   //   // Update the line geometry
//   //   this.camberLines[index].geometry.setFromPoints([startPoint, endPoint]);
//   //   this.camberLines[index].geometry.computeBoundingSphere();
//   // }





//   // updateToeLines(index: number) {
//   //   const wheel = this.wheels[index];
//   //   const angle = wheel.rotation.y;  // This is the toe angle adjustment

//   //   // Calculate endpoints based on the angle
//   //   // This keeps the line length constant while changing the angle
//   //   const startPoint = new THREE.Vector3(wheel.position.x, wheel.position.y, wheel.position.z);
//   //   const endPoint = new THREE.Vector3(
//   //     wheel.position.x + 4 * Math.sin(angle), // Adjust x-coordinate based on the sine of the angle
//   //     wheel.position.y,
//   //     wheel.position.z + 4 * Math.cos(angle)  // Adjust z-coordinate based on the cosine of the angle
//   //   );

//   //   // Update the line geometry to reflect this new position
//   //   this.toeLines[index].geometry.setFromPoints([startPoint, endPoint]);
//   //   this.toeLines[index].geometry.computeBoundingSphere();
//   // }


//   // Handlers for camber and toe adjustments, update functions for dynamic lines
//   // Ensure these are implemented similarly to how they were when the setup was working

// }

