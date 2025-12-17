import * as THREE from 'three';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- RENDERER, SCENE, CAMERA ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

// --- POST-PROCESSING (BLOOM) ---
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 1.2; //intensity of glow
bloomPass.radius = 0.5;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// --- CONTROLS ---
const clock = new THREE.Clock();
const flyControls = new FlyControls(camera, renderer.domElement);
flyControls.movementSpeed = 15;
flyControls.domElement = renderer.domElement;
flyControls.rollSpeed = 0; // Disable roll on A/D keys
flyControls.autoForward = false;
flyControls.dragToLook = false; // We are using mouse position to steer instead

// Variables for smoothing keyboard turning
let keyboardTargetYaw = 0;
const yawSpeed = 1.5; // Maximum radians per second for keyboard
const yawLerpFactor = 0.05;

// Variables for mouse steering
const mousePosition = new THREE.Vector2();
let targetYaw = 0;
let targetPitch = 0;
let currentYaw = 0;
let currentPitch = 0;
const pitchSpeed = 1.0;
const pitchLerpFactor = 0.05;


window.addEventListener('keydown', (event) => {
    switch (event.key.toLowerCase()) {
        case 'a':
            keyboardTargetYaw = yawSpeed;
            break;
        case 'd':
            keyboardTargetYaw = -yawSpeed;
            break;
        case ' ': // Spacebar
            event.preventDefault();
            flyControls.moveState.up = 1;
            break;
        case 'alt':
            event.preventDefault();
            flyControls.moveState.down = 1;
            break;
    }
});

window.addEventListener('keyup', (event) => {
    switch (event.key.toLowerCase()) {
        case 'a':
            if (keyboardTargetYaw > 0) keyboardTargetYaw = 0;
            break;
        case 'd':
            if (keyboardTargetYaw < 0) keyboardTargetYaw = 0;
            break;
        case ' ': // Spacebar
            flyControls.moveState.up = 0;
            break;
        case 'alt':
            flyControls.moveState.down = 0;
            break;
    }
});

window.addEventListener('mousemove', (event) => {
    // Normalize mouse position from -1 to 1
    mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Fade out controls info after 10 seconds
const controlsInfoDiv = document.getElementById('controls-info');
setTimeout(() => {
    controlsInfoDiv.classList.add('faded');
}, 10000); // 10 seconds

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
camera.add(pointLight);
scene.add(camera);

// --- GRADIENT BACKGROUND ---
scene.background = null; // We're using a skybox mesh instead of a scene background
const skyboxGeo = new THREE.BoxGeometry(1000, 1000, 1000);

const vertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec3 topColor = vec3(0.165, 0.0, 0.29); // Dark Purple: #2a004a
    vec3 bottomColor = vec3(0.0, 0.0, 0.0); // Black
    float h = normalize(vWorldPosition).y;
    // Smooth the gradient transition
    float gradientFactor = smoothstep(-0.5, 0.5, h);
    gl_FragColor = vec4(mix(bottomColor, topColor, gradientFactor), 1.0);
  }
`;

const skyboxMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.BackSide,
});

const skybox = new THREE.Mesh(skyboxGeo, skyboxMaterial);
scene.add(skybox);


const infoDiv = document.getElementById('info');
infoDiv.textContent = 'Scan the coal to find the lost present!';

// --- MAGIC METER ---
const magicMeterBar = document.getElementById('magic-meter-bar');
const maxMagic = 100;
let currentMagic = maxMagic;
const magicConsumptionRate = 2.5; // points per second
const scanMagicCost = 10;

function updateMagicUi() {
    const magicPercent = (currentMagic / maxMagic) * 100;
    magicMeterBar.style.width = `${magicPercent}%`;

    if (currentMagic <= 0) {
        infoDiv.textContent = 'Out of magic! Find stardust to replenish!';
    } else if (infoDiv.textContent === 'Out of magic! Find stardust to replenish!') {
        // Restore original text if we have magic again
        infoDiv.textContent = 'Scan the coal to find the lost present!';
    }
}
updateMagicUi(); // Initial UI update


// --- OBJECTS (COAL & PRESENT) ---

// --- Coal ---
const coalInstanceData = [];
const coalCount = 400;
const spawnRadius = 150;

// 1. Define the material for the instanced coal
const coalMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    vertexColors: true // Crucial for allowing per-instance colors
});

// 2. Define the single geometry for all coal instances
const coalGeo = new THREE.IcosahedronGeometry(1, 1);
const pos = coalGeo.attributes.position;
const vec = new THREE.Vector3();
for (let j = 0; j < pos.count; j++){
    vec.fromBufferAttribute(pos, j);
    vec.setLength(vec.length() + (Math.random() - 0.5) * 0.4);
    pos.setXYZ(j, vec.x, vec.y, vec.z);
}
coalGeo.computeVertexNormals(); 

// 3. Create the InstancedMesh
const instancedCoals = new THREE.InstancedMesh(coalGeo, coalMaterial, coalCount);
instancedCoals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(instancedCoals);

// 4. Set the position, scale, rotation, and COLOR for each instance
const dummy = new THREE.Object3D();
const color = new THREE.Color();
for (let i = 0; i < coalCount; i++) {
    dummy.position.copy(
        new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(Math.random() * spawnRadius + 20)
    );
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const scale = Math.random() * 2 + 0.5;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    instancedCoals.setMatrixAt(i, dummy.matrix);

    // DEBUG: Set a random bright color for each instance
    color.setHSL(Math.random(), 0.8, 0.5);
    instancedCoals.setColorAt(i, color);

    // Store metadata
    const randomId = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 99)}`;
    coalInstanceData.push({ id: randomId, originalColor: color.clone() });
}
instancedCoals.instanceMatrix.needsUpdate = true;
instancedCoals.instanceColor.needsUpdate = true; // This is essential!

// --- Present ---
const presentColors = [
    { name: 'green', hex: 0x00ff00 },
];
const chosenPresentColor = presentColors[0];
const presentMaterial = new THREE.MeshStandardMaterial({
    color: chosenPresentColor.hex,
    emissive: chosenPresentColor.hex,
    emissiveIntensity: 0.5,
    roughness: 0.8
});

const presentShapes = [
    { name: 'box', geo: new THREE.BoxGeometry(2.5, 2.5, 2.5) },
    { name: 'ball', geo: new THREE.SphereGeometry(1.5, 32, 16) },
    { name: 'pyramid', geo: new THREE.ConeGeometry(2, 3, 4) },
];
const chosenPresentShape = presentShapes[Math.floor(Math.random() * presentShapes.length)];
const present = new THREE.Mesh(chosenPresentShape.geo, presentMaterial);

const presentScale = Math.random() * 1.5 + 1.5;
present.scale.set(presentScale, presentScale, presentScale);
let presentSizeName;
if (presentScale < 2.0) presentSizeName = 'small';
else if (presentScale < 2.5) presentSizeName = 'medium';
else presentSizeName = 'large';

present.position.copy(
    new THREE.Vector3()
    .randomDirection()
    .multiplyScalar(Math.random() * spawnRadius * 0.5 + 20)
);
present.userData = {
    id: 'The Lost Present',
    isTarget: true,
    colorName: chosenPresentColor.name,
    sizeName: presentSizeName,
    shapeName: chosenPresentShape.name,
};
scene.add(present);

// --- CLUE GENERATION ---
function generateClue(presentData) {
    return `Find the ${presentData.sizeName} ${presentData.colorName} ${presentData.shapeName}!`;
}
infoDiv.textContent = generateClue(present.userData);


// --- INTERACTION ---
const raycaster = new THREE.Raycaster();
const targetLabelDiv = document.getElementById('target-label');
let foundTargetObject = null; 

const successMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 2
});
const scanFlashColor = new THREE.Color(0xff0000);

function onScan() {
    if (foundTargetObject) return;

    // Check for magic
    if (currentMagic < scanMagicCost) {
        infoDiv.textContent = 'Not enough magic to scan!';
        setTimeout(() => { 
            if (infoDiv.textContent === 'Not enough magic to scan!') {
                updateMagicUi(); // Revert to 'Out of magic!' or default text
            }
        }, 2000);
        return;
    }
    
    currentMagic -= scanMagicCost;
    updateMagicUi();

    // Play scan sound
    if (scanSound.buffer && !scanSound.isPlaying) scanSound.play();

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    // Check for intersects against both the present and the instanced coal
    const intersects = raycaster.intersectObjects([present, instancedCoals]);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const obj = hit.object;

        // Check if the hit object is the present
        if (obj.userData.isTarget) {
            // Play success sound
            if (successSound.buffer && !successSound.isPlaying) successSound.play();
            if (sleighBells.isPlaying) sleighBells.stop();

            present.material = successMaterial;
            infoDiv.textContent = `Success! You found F2—the ${present.userData.sizeName} ${present.userData.colorName} ${present.userData.shapeName}!`;
            flyControls.enabled = false;
            foundTargetObject = present;
            targetLabelDiv.textContent = 'Present';
            targetLabelDiv.classList.add('visible');
            window.alert('Congratulations! You found "F2"!');
        } 
        // Otherwise, it must be a lump of coal
        else if (hit.instanceId !== undefined) {
            const instanceId = hit.instanceId;
            const data = coalInstanceData[instanceId];

            infoDiv.textContent = `Scan complete. Just a lump of coal with ID: ${data.id}.`;
            
            instancedCoals.setColorAt(instanceId, scanFlashColor);
            instancedCoals.instanceColor.needsUpdate = true;
            
            setTimeout(() => {
                // Check if we haven't found the target in the meantime
                if (!foundTargetObject) {
                     instancedCoals.setColorAt(instanceId, data.originalColor);
                     instancedCoals.instanceColor.needsUpdate = true;
                }
            }, 500);
        }
    }
}
window.addEventListener('click', onScan);


// --- RESIZE ---
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
});

// --- AUDIO ---
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

// Sleigh Bells (Movement)
const sleighBells = new THREE.Audio(listener);
audioLoader.load('https://www.orangefreesounds.com/wp-content/uploads/2014/12/Sleigh-bells-loop.mp3', function(buffer) {
    sleighBells.setBuffer(buffer);
    sleighBells.setLoop(true);
    sleighBells.setVolume(0.5);
});
let isMoving = false;

// Scan Sound
const scanSound = new THREE.Audio(listener);
// TODO: Replace with a real URL
// audioLoader.load('URL_TO_SCAN_SOUND.mp3', function(buffer) {
//     scanSound.setBuffer(buffer);
//     scanSound.setVolume(0.8);
// });

// Success Sound
const successSound = new THREE.Audio(listener);
// TODO: Replace with a real URL
// audioLoader.load('URL_TO_SUCCESS_SOUND.mp3', function(buffer) {
//     successSound.setBuffer(buffer);
//     successSound.setVolume(1.0);
// });

// Background Music
const backgroundMusic = new THREE.Audio(listener);
// TODO: Replace with a real URL
// audioLoader.load('URL_TO_MUSIC.mp3', function(buffer) {
//     backgroundMusic.setBuffer(buffer);
//     backgroundMusic.setLoop(true);
//     backgroundMusic.setVolume(0.3);
// });

// Audio in browsers requires a user gesture to start.
// This function will be called on the first click to unlock the audio context.
function unlockAudio() {
    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }
    // It will also try to start the background music if it's loaded.
    if (backgroundMusic.buffer && !backgroundMusic.isPlaying) {
        backgroundMusic.play();
    }
    window.removeEventListener('click', unlockAudio);
}
window.addEventListener('click', unlockAudio);

// --- STARDUST ---
const stardustData = [];
const stardustCount = 100;
const stardustGeo = new THREE.TetrahedronGeometry(0.8, 0);
const stardustMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffd700,
    emissiveIntensity: 2
});
const instancedStardust = new THREE.InstancedMesh(stardustGeo, stardustMaterial, stardustCount);
scene.add(instancedStardust);

const stardustDummy = new THREE.Object3D();
for (let i = 0; i < stardustCount; i++) {
    const position = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(Math.random() * spawnRadius + 20);
    
    stardustDummy.position.copy(position);
    stardustDummy.updateMatrix();
    instancedStardust.setMatrixAt(i, stardustDummy.matrix);

    stardustData.push({
        position: position,
        isActive: true,
    });
}
instancedStardust.instanceMatrix.needsUpdate = true;

// --- COLLISION ---
let timeSinceCollision = 0;
const collisionCooldown = 0.5; // seconds
const collisionThreshold = 3.5; // Approx radius of player + avg coal
const collisionMagicPenalty = 25;
const knockbackDistance = 5;


// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    timeSinceCollision += delta;

    const wasdMoving = flyControls.moveState.forward || flyControls.moveState.back || flyControls.moveState.up || flyControls.moveState.down;
    const isTurning = Math.abs(keyboardTargetYaw) > 0.01 || Math.abs(targetYaw) > 0.01 || Math.abs(targetPitch) > 0.01;
    const currentlyMoving = wasdMoving || isTurning;

    if (currentMagic > 0) {
        flyControls.movementSpeed = 15; // Ensure speed is normal
        if (currentlyMoving) {
            currentMagic -= magicConsumptionRate * delta;
            currentMagic = Math.max(0, currentMagic); // Clamp to 0
            updateMagicUi();
        }
    } else {
        flyControls.movementSpeed = 0; // Stop movement
    }


    flyControls.update(delta);

    // --- Calculate rotation from mouse and keyboard ---
    // Mouse steering
    targetYaw = -mousePosition.x * yawSpeed;
    targetPitch = mousePosition.y * pitchSpeed;

    // Keyboard overrides / adds to mouse steering
    if (keyboardTargetYaw !== 0) {
        targetYaw = keyboardTargetYaw;
    }

    // Smooth the rotation
    currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, yawLerpFactor);
    currentPitch = THREE.MathUtils.lerp(currentPitch, targetPitch, pitchLerpFactor);

    // Apply rotation only if there's magic
    if (currentMagic > 0) {
        camera.rotateY(currentYaw * delta);
        camera.rotateX(currentPitch * delta);
    }

    // --- Stardust Collision ---
    const collectionThreshold = 2.0;
    for (let i = 0; i < stardustData.length; i++) {
        const dust = stardustData[i];
        if (dust.isActive && camera.position.distanceTo(dust.position) < collectionThreshold) {
            dust.isActive = false;
            
            // Hide the collected dust by scaling its matrix to 0
            const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
            instancedStardust.setMatrixAt(i, hiddenMatrix);
            instancedStardust.instanceMatrix.needsUpdate = true;

            // Replenish magic
            currentMagic = Math.min(maxMagic, currentMagic + 15);
            updateMagicUi();
        }
    }

    // --- Coal Collision Detection ---
    if (currentlyMoving && timeSinceCollision > collisionCooldown) {
        const coalPos = new THREE.Vector3();
        const coalMatrix = new THREE.Matrix4();

        for (let i = 0; i < coalCount; i++) {
            instancedCoals.getMatrixAt(i, coalMatrix);
            coalPos.setFromMatrixPosition(coalMatrix);

            if (camera.position.distanceTo(coalPos) < collisionThreshold) {
                timeSinceCollision = 0;

                // Apply penalty and knockback
                currentMagic = Math.max(0, currentMagic - collisionMagicPenalty);
                updateMagicUi();
                camera.translateZ(knockbackDistance);

                // Visual flash effect
                const originalStrength = bloomPass.strength;
                bloomPass.strength = originalStrength * 5;
                setTimeout(() => {
                    bloomPass.strength = originalStrength;
                }, 100);

                break; // Only handle one collision per frame
            }
        }
    }


    // --- Audio control based on movement ---
    if (currentlyMoving && !isMoving) {
        if (sleighBells.buffer && !sleighBells.isPlaying) {
            sleighBells.play();
        }
        isMoving = true;
    } else if (!currentlyMoving && isMoving) {
        if (sleighBells.isPlaying) {
            sleighBells.stop();
        }
        isMoving = false;
    }


    // If target is found, update its label position
    if (foundTargetObject) {
        const vector = new THREE.Vector3();
        foundTargetObject.getWorldPosition(vector);
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

        targetLabelDiv.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }

    composer.render();
}

animate();
