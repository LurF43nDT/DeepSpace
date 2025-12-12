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
flyControls.dragToLook = true; // Keep mouse drag-to-look as an option

// Custom key handling for turning
let moveLeft = false;
let moveRight = false;
const turnSpeed = 1.5; // Radians per second

window.addEventListener('keydown', (event) => {
    switch (event.key.toLowerCase()) {
        case 'a': moveLeft = true; break;
        case 'd': moveRight = true; break;
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
        case 'a': moveLeft = false; break;
        case 'd': moveRight = false; break;
        case ' ': // Spacebar
            flyControls.moveState.up = 0;
            break;
        case 'alt':
            flyControls.moveState.down = 0;
            break;
    }
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

// --- STARS ---
const starVertices = [];
for (let i = 0; i < 10000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starVertices.push(x, y, z);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);


// --- OBJECTS (ASTEROIDS) ---
const asteroids = new THREE.Group();
const asteroidCount = 400;
const spawnRadius = 150;

const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
const targetMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, emissive: 0x007bff, emissiveIntensity: 0.3, roughness: 0.8 });

for (let i = 0; i < asteroidCount; i++) {
    const geo = new THREE.IcosahedronGeometry(Math.random() * 2 + 0.5, 1);
    const pos = geo.attributes.position;
    const vec = new THREE.Vector3();
    for (let j = 0; j < pos.count; j++){
        vec.fromBufferAttribute(pos, j);
        vec.setLength(vec.length() + (Math.random() - 0.5) * 0.4);
        pos.setXYZ(j, vec.x, vec.y, vec.z);
    }
    
    const isTarget = i === Math.floor(asteroidCount / 2);
    const material = isTarget ? targetMaterial : baseMaterial;
    const asteroid = new THREE.Mesh(geo, material.clone());

    const position = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(Math.random() * spawnRadius + 20);
    
    asteroid.position.copy(position);
    asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    if (isTarget) {
        asteroid.userData = { id: 'F2', isTarget: true };
    } else {
        const randomId = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 99)}`;
        asteroid.userData = { id: randomId, isTarget: false };
    }

    asteroids.add(asteroid);
}
scene.add(asteroids);

// --- INTERACTION ---
const raycaster = new THREE.Raycaster();
const infoDiv = document.getElementById('info');
const targetLabelDiv = document.getElementById('target-label');
let foundTargetObject = null;

const successMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 2
});

function onScan() {
    // Dont scan if target is already found
    if (foundTargetObject) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(asteroids.children);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData.isTarget) {
            obj.material = successMaterial;
            infoDiv.textContent = `Success! Target 'F2' acquired.`;
            flyControls.enabled = false;
            foundTargetObject = obj;
            targetLabelDiv.classList.add('visible');
        } else {
            infoDiv.textContent = `Scan complete. Asteroid ID: ${obj.userData.id}.`;
            const originalMaterial = obj.material.clone();
            obj.material.color.setHex(0xff0000);
            obj.material.emissive.setHex(0xff0000);
            obj.material.emissiveIntensity = 0.5;
            setTimeout(() => {
                if (!obj.userData.isTarget) {
                     obj.material = originalMaterial;
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

// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    flyControls.update(delta);

    if (moveLeft) camera.rotateY(turnSpeed * delta);
    if (moveRight) camera.rotateY(-turnSpeed * delta);

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
