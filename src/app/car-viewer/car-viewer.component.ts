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

  //// Caster ANGLE ////////
  casterAngle: number = 0 * Math.PI / 180; // 0 ==10 caster angle in degrees -25 is close to actual 0, but not exact
  //////////////////////////

  angleToCalibrateLines: number = 30;
  casterAngleCalibrated: number = this.casterAngle + this.angleToCalibrateLines; // calibrated to align with green axis line
  fROffsetTOE = 9;
  fROffsetCAMBER = 3.2;
  fROffsetXRotation = 25 + this.casterAngle; // add desired caster angle
  sAI = 10;
  fLOffsetTOE = -11;
  fLOffsetCAMBER = 0;
  lastCamberAngleD: number = 0;
  //rotate driverwheel to get axis at 0 degrees
  xAngleRotationD: number = 21.5; 
  xAngleRotationP: number = 25; 
  fLOffsetXRotation = -43 - this.casterAngle; // add desired caster angle IMPORTANT, if you change this value, you must compensate     camberLine.rotation.x = Math.PI / 2;  // Rotate to align vertically
  driverWheelOuterOff = 90;
  driverWheelOuterOffCam = -90;
  driverWheelOuterOffCast = -12;
  driverWheel = 'Wheel_FL_28';
  camberLines: THREE.Mesh[] = [];
  toeLines: THREE.Mesh[] = [];
  casterLines: THREE.Mesh[] = [];
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
  maxCamSpec = 2;  // Maximum camber specification
  minCamSpec = -2; // Minimum camber specification
  // driverWheelOuter = 'Sketchfab_model';
  //Wheel_F005_15 and Object_22 are the rotor
  //Torus002_14 and Object_20 are the tire
  //Circle012_13 and Object_18 are the caliper
  //sus_up004_6 is a pin? same with Bone003_7 and Object_9
  //Cylinder011_2 is the upper control arm X:-96`, Y:-83`, Z:-18
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
    const modelPath = '/Alignment_Simulator/assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
    const suspensionModelPath = '/Alignment_Simulator/assets/rigged_suspension/scene.gltf';
    // for local host
    // const modelPath = '../../assets/model/500_followers_milestone_-_mercedes-benz_glc_lp/scene.gltf';
    // const suspensionModelPath = '../../assets/rigged_suspension/scene.gltf';

    loader.load(modelPath, (gltf) => {
      const carModel = gltf.scene;
      this.scene.add(carModel);
      carModel.rotation.set(0, 0, 0); // Reset rotation or adjust to align correctly
      let foundWheels = 0;
      carModel.traverse((node) => {
        console.log("node", node.name);
        if (node.name === this.passengerWheel || node.name === this.driverWheel) {
        // if (node.name === this.driverWheel) {
          this.wheels.push(node);
          node.rotation.set(0, 0, 0); // Reset rotation or adjust to align correctly
          // Manually set the offset here
          if (node.name === this.passengerWheel) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.fROffsetTOE * Math.PI / 180; 
            node.rotation.y = this.fROffsetCAMBER * Math.PI / 180; 
            node.rotation.x = this.fROffsetXRotation * Math.PI / 180; 
          } else if (node.name === this.driverWheel) {
            // Adjust the Z-axis rotation to visually appear as zero
            node.rotation.z = this.fLOffsetTOE * Math.PI / 180; 
            node.rotation.y = this.fLOffsetCAMBER * Math.PI / 180; 
            node.rotation.x = (this.xAngleRotationD/180) + (this.fLOffsetXRotation - this.casterAngle) * Math.PI / 180; 
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

          // controls.addEventListener('objectChange', () => {
          //   this.updateLabel(node.userData['label'], node, node.name); // Update label on object change
              
          // });

          controls.addEventListener('mouseDown', () => {
            this.orbitControls.enabled = false;
          });
          // controls.addEventListener('mouseUp', () => {
          //   this.orbitControls.enabled = true;
          //   this.updateLabel(node.userData['label'], node, node.name); // Final update on mouse up
          // });

          // // Create labels
          // const labelPosition = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).add(new THREE.Vector3(0, 2, 0));
          // const label = this.createLabel(node.name, 'X: 0°, Y(camber): 0°, Z(toe): 0°', labelPosition);
          // node.userData['label'] = label;
          // this.scene.add(label);
        }
      });

      if (foundWheels === 2) {
        this.wheels.forEach((wheel, index) => {
        this.addAxisLines(wheel, index);
    });
        this.modelLoaded = true;
      } else {
        console.error('Failed to find both wheels');
      }

      carModel.scale.set(1.5, 1.5, 1.5);
      carModel.position.set(0, -0.9, -2.1);
      

    });

// outside wheel
    // loader.load(suspensionModelPath, (gltf) => {
    //   // Original suspension model
    //   const originalModel = gltf.scene;
    //   originalModel.traverse((node) => {
    //     console.log("wheel", node.name);

    //     originalModel.scale.set(.3, .3, .3);
    //     originalModel.position.set(1.5, -0.5, 2); // Position to the left of the original model

    //     if (node.name === this.driverWheelOuter 
    //       || node.name === this.driverWheelOuterCAM
    //     ) {
    //       // Adjust the Z-axis rotation to visually appear as zero
    //       this.wheels.push(node);
    //       node.rotation.set(0, 0, 90); // Reset rotation or adjust to align correctly
    //       // Manually set the offset here
    //       if (node.name === this.driverWheelOuter) {
    //         // Adjust the Z-axis rotation to visually appear as zero
    //         node.rotation.z = this.driverWheelOuterOff * Math.PI / 180; // Example adjustment
    //         // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
    //       }
    //       if (node.name === this.driverWheelOuterCAM) {
    //         // Adjust the Z-axis rotation to visually appear as zero
    //         node.rotation.z = this.driverWheelOuterOffCam * Math.PI / 180; // Example adjustment
    //         // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
    //       }

    //       if (node.name === this.driverWheelOuterCAM) {
    //         // Adjust the Z-axis rotation to visually appear as zero
    //         node.rotation.x = this.driverWheelOuterOffCast * Math.PI / 180; // Example adjustment
    //         // node.rotation.x = this.fROffsetXRotation * Math.PI / 180; // Example adjustment
    //       }

    //        if (node.name === this.driverWheelOuter){
    //       const controls = new TransformControls(this.camera, this.renderer.domElement);
    //       controls.attach(node);
    //       controls.space = 'local';  // Use local space for transformations
    //       this.scene.add(controls);
    //       controls.setMode('rotate');
    //       controls.showX = false;
    //       controls.showY = false;
    //       controls.showZ = false;
    //       controls.addEventListener('objectChange', () => {
    //         this.updateLabel(node.userData['label'], node, node.name); // Update label on object change
    //       });

    //       controls.addEventListener('mouseDown', () => {
    //         this.orbitControls.enabled = false;
    //       });
    //       controls.addEventListener('mouseUp', () => {
    //         this.orbitControls.enabled = true;
    //         this.updateLabel(node.userData['label'], node, node.name); // Final update on mouse up
    //       });

    //       // Create labels
    //       // const labelPosition = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).add(new THREE.Vector3(2, 2, 0));
    //       // const label = this.createLabel(node.name, 'X: 0°, Y: 0°, Z: 0°', labelPosition);
    //       // node.userData['label'] = label;
    //       // this.scene.add(label);
    //     }
    //     }

    //     this.scene.add(originalModel);
    //   });
    // });
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
    const lineLength = 2;  // Adequate length to be visible
    const radius = 0.02;   // Visible thickness
    const radialSegments = 8;  // Smoothness of the line

    // CAMBER Line (angles 10 degrees Vertical)
    const camberLineMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const camberLineGeometry = new THREE.CylinderGeometry(radius, radius, lineLength, radialSegments);
    const camberLine = new THREE.Mesh(camberLineGeometry, camberLineMaterial);
    if(wheel.name === this.passengerWheel){
    camberLine.rotation.x = Math.PI / 2.22 ;  // Rotate to align vertically
    }
    else{
      camberLine.rotation.x = (Math.PI / -2.22 + (this.casterAngle) - (this.angleToCalibrateLines / 180) - this.casterAngle);  // Rotate to align vertically
    }
    camberLine.position.y += lineLength / -120;  
    wheel.add(camberLine);  // Parent to the wheel for correct relative position

  // CASTER Line (Vertical)
  if (wheel.name === this.passengerWheel) {
        const casterLineMaterial = new THREE.MeshBasicMaterial({ color: 0x32a852 });
    const casterLineGeometry = new THREE.CylinderGeometry(radius, radius, lineLength, radialSegments);
    const casterLine = new THREE.Mesh(casterLineGeometry, casterLineMaterial);
    casterLine.rotation.x = Math.PI / 2;  // Rotate to align vertically
    casterLine.position.y += lineLength / -120;
    wheel.add(casterLine);  // Parent to the wheel for correct relative position
    this.scene.add(casterLine);
    casterLine.rotation.x = ((this.fLOffsetXRotation + 30) * Math.PI / 180) + this.casterAngle;
    casterLine.rotation.z = -10 * Math.PI / 180;
    casterLine.position.set(- 1.12, -0.3, 0.08); // Position onto the wheel (lateral position fron vehicle center line, height, position longitudinal)
    casterLine.scale.set(1.5, 1.5, 1.5);
    // casterLine.rotation.y = -10;
    wheel.position.set(0, 0, 0);
  }
  else { // driver side
    const casterLineMaterial = new THREE.MeshBasicMaterial({ color: 0x32a852 });
    const casterLineGeometry = new THREE.CylinderGeometry(radius, radius, lineLength, radialSegments);
    const casterLine = new THREE.Mesh(casterLineGeometry, casterLineMaterial);
    casterLine.rotation.x = Math.PI / 2;  // Rotate to align vertically
    casterLine.position.y += lineLength / -120;
    wheel.add(casterLine);  // Parent to the wheel for correct relative position
    this.scene.add(casterLine);
    casterLine.rotation.x = ((this.fLOffsetXRotation + 30) * Math.PI / 180) - this.casterAngle/2; 
    casterLine.rotation.z = 10 * Math.PI / 180;
    casterLine.position.set(1.10, -0.3, 0); // Position onto the wheel (lateral position fron vehicle center line, height, position longitudinal)
    casterLine.scale.set(1.5, 1.5, 1.5);
    // casterLine.rotation.y = -90;

  }
  // Toe Line (Horizontal)
  if (wheel.name === this.passengerWheel) {
    const toeLineMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const toeLineGeometry = new THREE.CylinderGeometry(radius, radius, lineLength, radialSegments);
    const toeLine = new THREE.Mesh(toeLineGeometry, toeLineMaterial);
    toeLine.rotation.x = -8 * Math.PI / 180;  // Rotate to align horizontally
    toeLine.position.y += lineLength / -3;  // Position halfway along the z-axis
    toeLine.position.z = 0.08;
    wheel.add(toeLine);  // Parent to the wheel for correct relative position
  }
  else {
    const toeLineMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const toeLineGeometry = new THREE.CylinderGeometry(radius, radius, lineLength, radialSegments);
    const toeLine = new THREE.Mesh(toeLineGeometry, toeLineMaterial);
    toeLine.rotation.y = Math.PI / 2 + this.casterAngle;  // Rotate to align horizontally
    toeLine.position.y += lineLength / -3;  // Position halfway along the z-axis
    wheel.add(toeLine);  // Parent to the wheel for correct relative position
  }
    // this.camberLines[index] = camberLine;
    // this.toeLines[index] = toeLine;
    // this.casterLines[index] = casterLine;
}



  updateLabelVals(wheel: THREE.Object3D) {
      const label = wheel.userData['label'] as THREE.Sprite;
      if (label) {
        this.updateLabel(label, wheel, wheel.name); // Include wheel.name
      } else {
        // Create label if it does not exist
        const labelPosition = new THREE.Vector3().setFromMatrixPosition(wheel.matrixWorld).add(new THREE.Vector3(0, 2, 0));
        const initialText = `X: 0°, Y: 0°, Z: 0°`;

        wheel.userData['label'] = this.createLabel(wheel.name, initialText, labelPosition); // Include wheel.name

      }
  }

  onCamberChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.camberAngle = angle;
    this.driverCamberAngle = angle;
    this.updateWheelRotation();
    this.changeDriver();
    // this.updateStatus();
  }

  onToeChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.toeAngle = angle;
    this.updateWheelRotation();
    this.changeDriver();
    // this.updateStatus();
  }

  onDriverToeChange(event: any) {
    const value = parseFloat(event.target.value);
    this.driverToeAngle = value;
    this.changeDriver();
    this.updateStatus();
  }

  onxAngleRotationChange(event: any) {
    // const value = parseFloat(event.target.value);
    // this.xAngleRotationD = value;
    // this.changeDriver();
    // this.updateStatus();
    // this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }
  
  onTurnAngleChange(event: Event) {
    const element = event.target as HTMLInputElement;
    const angle = parseFloat(element.value);
    this.turnAngle = angle;
    this.changeDriver();
    this.updateTurnAngle();
    // this.updateStatus();
  }

  onDriverCamberChange(event: any) {
    const value = parseFloat(event.target.value);
    this.driverCamberAngle = value;
    this.changeDriver();
    this.updateStatus();
    // this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
  }

 changeDriver() {
    let manualOffsetZ = 0;
    let manualOffsetY = 0;
    let toeAngleD = 0;

    // Check if each specific angle has been updated
    if (this.driverToeAngle !== this.lastDriverToeAngle) {
        toeAngleD = this.driverToeAngle;
        this.lastDriverToeAngle = this.driverToeAngle;
    } else if (this.turnAngle !== this.lastTurnAngle) {
        toeAngleD = this.turnAngle;
        this.lastTurnAngle = this.turnAngle;
    } else if (this.toeAngle !== this.lastToeAngle) {
        toeAngleD = this.toeAngle;
        this.lastToeAngle = this.toeAngle;
    }

    const radians = (degrees: number) => degrees * Math.PI / 180;

    let toeAngleR = radians(toeAngleD);
    let SAI = radians(this.sAI); // Steering Axis Inclination in degrees
    let caster = radians(this.fLOffsetXRotation);

    // Calculate camber gain from SAI and toe
    let camberGainFromSAI = Math.sin(SAI) * Math.tan(toeAngleR);
    let camberGainFromCaster = Math.sin(caster) * Math.sin(toeAngleR);
    // Adjust camber gain sign to match the toe direction
    let totalDynamicCamber = Math.abs(camberGainFromSAI + camberGainFromCaster) * Math.sign(toeAngleD);

    this.wheels.forEach((wheel, index) => {
        if (wheel.name === this.driverWheel) {
            let initialX = -36; // Initial X when Y (camber) is 0
            let initialZ = -11; // Initial Z when Y (camber) is 0

                // Calculate changes based on current camber angle
            let camberChangeY = this.driverCamberAngle;
  
            // play with values to get a more realistic effect, these are approx and in reality there shouldn't be a different rate of change based on if camber is going + or -
            // Positive Camber Changes
            // Wheel_FL_28 (Driver's Wheel)
            // X-axis: For every degree increase in Y, X changes by approximately +0.192 degrees.
            // Z-axis: For every degree increase in Y, Z changes by approximately -0.038 degrees.
            // Object_54 (Passenger's Wheel)
            // X-axis: For every degree increase in Y, X changes by approximately +0.154 degrees.
            // Z-axis: For every degree increase in Y, Z changes by approximately +0.038 degrees.
            // Negative Camber Changes
            // Wheel_FL_28 (Driver's Wheel)
            // X-axis: For every degree decrease in Y, X changes by approximately -0.211 degrees.
            // Z-axis: For every degree decrease in Y, Z changes by approximately -0.053 degrees.
            // Object_54 (Passenger's Wheel)
            // X-axis: For every degree decrease in Y, X changes by approximately -0.16 degrees.
            // Z-axis: For every degree decrease in Y, Z changes by approximately +0.04 degrees.
            console.log("lastCamberAngleD", this.lastCamberAngleD);
            console.log("this.camberAngle", this.driverCamberAngle);
            console.log("camberChangeY", camberChangeY);
            console.log("at adjust");
            let changeX = camberChangeY * 0.180; // Derived rate for X
            let changeZ = 0;
            if(camberChangeY > 0){
              changeZ = camberChangeY * -0.038; // Derived rate for Z if increasing Y, should be positive if moving in opposite direction
            }
            else{
              changeZ = camberChangeY * 0.038; // Derived rate for Z if increasing Y, should be positive if moving in opposite direction
            }
            console.log("after adjust");
            this.lastCamberAngleD = camberChangeY;
            console.log("lastCamberAngleD", this.lastCamberAngleD);
            manualOffsetZ = this.fLOffsetTOE * Math.PI / 180; // Zero-toe offset
            manualOffsetY = radians(this.fLOffsetCAMBER); // Base static camber offset


                // Adjust wheel rotations based on calculated changes
                wheel.rotation.x = radians(initialX + changeX);
                wheel.rotation.y = radians(this.driverCamberAngle) + totalDynamicCamber;
                wheel.rotation.z = radians(initialZ + changeZ) + toeAngleR;


            // Apply the calculated camber and toe angles
            // wheel.rotation.y = radians(this.camberAngle) + totalDynamicCamber + manualOffsetY;
            // wheel.rotation.z = toeAngleR + manualOffsetZ;
        }
        if (wheel.name === this.driverWheelOuter) {
        manualOffsetZ = this.driverWheelOuterOff * Math.PI / 180;
        wheel.rotation.x = -toeAngleR;
        if(toeAngleD > 0){
          wheel.rotation.z = -Math.abs((toeAngleD * 0.4)) * Math.PI / 180 + manualOffsetZ;
        }
        else{
        wheel.rotation.z = Math.abs((toeAngleD * 0.4)) * Math.PI / 180 + manualOffsetZ;
        }

      }

      if (wheel.name === this.driverWheelOuterCAM) {
        manualOffsetZ = this.driverWheelOuterOffCam * Math.PI / 180;
        wheel.rotation.z = radians(this.camberAngle) + manualOffsetZ;
      }
    });
    this.updateStatus();
    
    this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
}


// changeDriver() {
//         let manualOffsetZ = 0;
//         let manualOffsetY = 0;
//         let toeAngleD = 0;

//         const radians = (degrees: number) => degrees * Math.PI / 180;

//         if (this.driverToeAngle !== this.lastDriverToeAngle) {
//             toeAngleD = this.driverToeAngle;
//             this.lastDriverToeAngle = this.driverToeAngle;
//         } else if (this.turnAngle !== this.lastTurnAngle) {
//             toeAngleD = this.turnAngle;
//             this.lastTurnAngle = this.turnAngle;
//         } else if (this.toeAngle !== this.lastToeAngle) {
//             toeAngleD = this.toeAngle;
//             this.lastToeAngle = this.toeAngle;
//         }

//         let toeAngleR = radians(toeAngleD);
//         let SAI = radians(this.sAI);
//         let caster = radians(this.fLOffsetXRotation);

//         let camberGainFromSAI = Math.sin(SAI) * Math.tan(toeAngleR);
//         let camberGainFromCaster = Math.sin(caster) * Math.sin(toeAngleR);
//         let totalDynamicCamber = Math.abs(camberGainFromSAI + camberGainFromCaster) * Math.sign(toeAngleD);

//         this.wheels.forEach((wheel) => {
//             if (wheel.name === this.driverWheel) {
//                 let initialX = -36; // Initial X when Y (camber) is 0
//                 let initialZ = -11; // Initial Z when Y (camber) is 0

//                 // Calculate changes based on current camber angle
//                 let camberChangeY = this.camberAngle - this.lastCamberAngleD;
//                 let changeX = camberChangeY * 0.180; // Derived rate for X
//                 let changeZ = camberChangeY * -0.038; // Derived rate for Z if increasing Y

//                 // Adjust wheel rotations based on calculated changes
//                 wheel.rotation.x = radians(initialX + changeX);
//                 wheel.rotation.y = radians(this.camberAngle);
//                 wheel.rotation.z = radians(initialZ + changeZ);
//             }
//         });

//         this.updateStatus();
//         this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
//     }




  // deals with passenger side for total toe, the passenger side toe move opposite of the driver side toe
updateWheelRotation() {
  
  const radians = (degrees: number) => degrees * Math.PI / 180;
  let SAI = radians(this.sAI);  // Same Steering Axis Inclination for both sides
  let caster = radians(this.fROffsetXRotation);  // Different caster offset for passenger

  this.wheels.forEach((wheel, index) => {
    if (wheel.name === this.passengerWheel) {
      let manualOffsetZ = this.fROffsetTOE * Math.PI / 180; // Example adjustment
      let manualOffsetY = radians(this.fROffsetCAMBER); // Example adjustment
      
      let toeAngleR = -radians(this.toeAngle);  // Negative because toe moves oppositely
      // Calculate camber gain from SAI and toe, note the toe direction effect is reversed
      let camberGainFromSAI = Math.sin(SAI) * Math.tan(toeAngleR);
      let camberGainFromCaster = Math.sin(caster) * Math.sin(toeAngleR);
      let totalDynamicCamber = camberGainFromSAI + camberGainFromCaster;

      // Apply the calculated camber and toe angles
      wheel.rotation.y = radians(-this.camberAngle) + totalDynamicCamber + manualOffsetY; // Inverse camber angle for passenger wheel
      wheel.rotation.z = this.toeAngle * Math.PI / 180 + manualOffsetZ;   // Adjusting for toe and manual offset
    } 
    // this.updateLabelVals(wheel);
  });

  this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
}


  // deals with passenger side for total toe, the passenger side toe move WITH the driver side toe
updateTurnAngle() {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  let SAI = radians(this.sAI);  // Same Steering Axis Inclination for both sides
  let caster = radians(this.fROffsetXRotation);  // Different caster offset for passenger

  this.wheels.forEach((wheel, index) => {
    if (wheel.name === this.passengerWheel) {
      let manualOffsetZ = this.fROffsetTOE * Math.PI / 180; // Example adjustment
      let manualOffsetY = radians(this.fROffsetCAMBER); // Example adjustment
      let camberChangeY = this.camberAngle;
      //////////////////
      // let initialX = 24;
      let initialZ = -11; // Initial Z when Y (camber) is 0
      /////////////////
      let toeAngleR = radians(this.turnAngle);
      // Calculate camber gain from SAI and toe
      let camberGainFromSAI = Math.sin(SAI) * Math.tan(toeAngleR);
      let camberGainFromCaster = Math.sin(caster) * Math.sin(toeAngleR);
      let totalDynamicCamber = camberGainFromSAI + camberGainFromCaster;


      let changeX = camberChangeY * 0.192; // Derived rate for X
      let changeZ = 0;
      if(camberChangeY > 0){
        changeZ = camberChangeY * -0.04; // Derived rate for Z if increasing Y, should be positive if moving in opposite direction
      }
      else{
        changeZ = camberChangeY * 0.04; // Derived rate for Z if increasing Y, should be positive if moving in opposite direction
      }
      // Apply the calculated camber and toe angles
      wheel.rotation.x = radians(this.xAngleRotationP + changeX);
      wheel.rotation.y = radians(-camberChangeY) + totalDynamicCamber + manualOffsetY; // Inverse camber angle for passenger wheel
      // wheel.rotation.y = radians(-this.camberAngle) + totalDynamicCamber + manualOffsetY; // Inverse camber angle for passenger wheel
      wheel.rotation.z = (-this.turnAngle * Math.PI / 180 + manualOffsetZ) + radians(initialZ + changeZ) ;
    } 
    // this.updateLabelVals(wheel);
  });

  this.renderer.render(this.scene, this.currentCamera); // Re-render the scene
}


// place back inside updateTurnAngle
      // Label update section
      // this.updateLabelVals(wheel);
      // const label = wheel.userData['label'] as THREE.Sprite;
      // if (label) {
      //   this.updateLabel(label, wheel, wheel.name); // Include wheel.name
      // } else {
      //   // Create label if it does not exist
      //   const labelPosition = new THREE.Vector3().setFromMatrixPosition(wheel.matrixWorld).add(new THREE.Vector3(0, 2, 0));
      //   const initialText = `X: 0°, Y: 0°, Z: 0°`;
      //   wheel.userData['label'] = this.createLabel(wheel.name, initialText, labelPosition); // Include wheel.name
      // }


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
    && (this.driverToeAngle === 0)) 
    {
        // tireWearStatus = '<span class="normal-wear">Normal tire wear</span>';
        pullDirectionStatus = '<span class="no pull">No pull</span>';
    }

  this.statusMessage = `
    <div class="status-item">
        <h1>Caster</h1><span>15 degrees </span>
    </div>
    <div class="status-item">
        <h1>Toe</h1><span>${toeStatus}</span>
    </div>
    <div class="status-item">
        <h1>Tire Wear</h1><span>${tireWearStatus}</span>
    </div>
    <div class="status-item">
        <h1>Pull Direction</h1><span>${pullDirectionStatus}</span>
    </div>
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
    console.log(`changes in axis for camber adjustment ${nodeName}:`, `X: ${THREE.MathUtils.radToDeg(wheel.rotation.x).toFixed(0)}°, Y: ${THREE.MathUtils.radToDeg(wheel.rotation.y).toFixed(0)}°, Z: ${THREE.MathUtils.radToDeg(wheel.rotation.z).toFixed(0)}°`);
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
    this.camera.position.set(0, 5, 5); // Front view
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.frontCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.frontCamera.position.set(5, 5, 5); // Side view
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
    // any updates or checks here
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
