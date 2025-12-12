import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../constants';
import { SystemState, Emotion } from '../types';

interface VisualizerCanvasProps {
  systemStateRef: React.MutableRefObject<SystemState>;
  isPaused: boolean;
  onCollectShard: () => void;
  activeSkin: string;
  activeCompanion: string;
  onGameOver: () => void;
}

// --- Constants for Optimization ---
const GAME_OVER_RADIUS = 8000; 
const WORLD_EXTENT = 60000; 
const CHUNK_SIZE = 2000; 
const TOTAL_CHUNKS_SIDE = (WORLD_EXTENT * 2) / CHUNK_SIZE; 
const INSTANCES_PER_CHUNK = 5000; 

// --- Shaders ---

const GRASS_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPlayerPosition;
  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  
  float noise(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  float smoothNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = noise(i);
      float b = noise(i + vec2(1.0, 0.0));
      float c = noise(i + vec2(0.0, 1.0));
      float d = noise(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    // instanceMatrix is handled automatically by three.js for InstancedMesh
    vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
    
    // Calculate height percentage (0.0 bottom to 1.0 top)
    // Blade height is approx 4.5
    float heightPercent = pos.y / 4.5; 
    
    // --- Wind Animation ---
    float windWave = smoothNoise(worldPos.xz * 0.05 + uTime * 0.5);
    float windJitter = smoothNoise(worldPos.xz * 0.2 + uTime * 2.0);
    float totalWind = (windWave * 0.7 + windJitter * 0.3) * uWindStrength * heightPercent; 
    
    worldPos.x += totalWind * 2.0;
    worldPos.z += totalWind * 1.0;
    
    // --- Interactive Push ---
    float dist = distance(worldPos.xz, uPlayerPosition.xz);
    float interactRadius = 35.0; 
    if (dist < interactRadius) {
        float pushFactor = (1.0 - dist / interactRadius);
        pushFactor = pow(pushFactor, 2.0) * 12.0 * heightPercent; 
        
        vec3 pushDir = normalize(worldPos.xyz - uPlayerPosition);
        worldPos.x += pushDir.x * pushFactor;
        worldPos.z += pushDir.z * pushFactor;
        worldPos.y -= pushFactor * 0.5; 
    }

    vWorldPosition = worldPos.xyz;
    
    // --- Coloring ---
    float variation = smoothNoise(worldPos.xz * 0.1);
    vec3 mixedBase = mix(uBaseColor, uBaseColor * 0.8, variation);
    vec3 mixedTip = mix(uTipColor, uTipColor * 1.2, variation);
    vColor = mix(mixedBase, mixedTip, heightPercent);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const GRASS_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  
  uniform vec3 uSunPosition;

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    vec3 lightDir = normalize(uSunPosition - vWorldPosition);
    
    float diff = max(dot(normal, lightDir), 0.0);
    // Simple ambient + diffuse
    vec3 light = vColor * (diff * 0.6 + 0.4);
    
    gl_FragColor = vec4(light, 1.0);
    
    // Distance fog (Matches scene fog)
    float dist = length(vWorldPosition.xz - cameraPosition.xz);
    float fogFactor = smoothstep(500.0, 25000.0, dist); 
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05, 0.05, 0.08), fogFactor);
  }
`;

// --- Weather Shaders ---

const WEATHER_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSway;
  uniform float uSize;
  
  attribute float aRandom;
  
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    
    // 1. Falling Logic (Y axis)
    float fallOffset = uTime * uSpeed * (0.8 + 0.4 * aRandom); 
    float height = 200.0;
    pos.y = 100.0 - mod((100.0 - pos.y) + fallOffset, height);
    
    // 2. Sway Logic (X/Z axis)
    float swayVal = sin(uTime * uSway + aRandom * 10.0);
    pos.x += swayVal * 5.0 * (0.5 + aRandom);
    pos.z += cos(uTime * uSway * 0.8 + aRandom * 12.0) * 5.0 * (0.5 + aRandom);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Size attenuation
    gl_PointSize = uSize * (0.8 + 0.4 * aRandom) * (300.0 / -mvPosition.z);
    
    gl_Position = projectionMatrix * mvPosition;
    
    // Fade out at top/bottom of box
    float normY = (pos.y + 100.0) / 200.0;
    vAlpha = smoothstep(0.0, 0.15, normY) * smoothstep(1.0, 0.85, normY);
  }
`;

const WEATHER_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    
    // Sharper circle for ice crystals
    float glow = 1.0 - smoothstep(0.4, 0.5, r);
    gl_FragColor = vec4(uColor, vAlpha * glow * 0.8);
  }
`;

// --- Sun Halo Shader ---
const SUN_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT_SHADER = `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    
    // Soft glow gradient
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    glow = pow(glow, 2.0); // Make it softer
    
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

// --- Boundary Ring Shader ---
const BOUNDARY_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BOUNDARY_FRAGMENT_SHADER = `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    // Ring effect
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    float ring = smoothstep(0.48, 0.5, dist) * smoothstep(0.52, 0.5, dist);
    
    float glow = sin(uTime * 2.0) * 0.5 + 0.5;
    gl_FragColor = vec4(1.0, 0.2, 0.2, ring * glow * 0.5);
  }
`;

const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({ 
  systemStateRef, 
  isPaused,
  onCollectShard,
  activeSkin,
  activeCompanion,
  onGameOver
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const weatherMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);
  const weatherSystemRef = useRef<THREE.Points | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  
  const sunHaloMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const companionGroupRef = useRef<THREE.Group | null>(null);
  
  const shardsRef = useRef<THREE.Mesh[]>([]);
  const shardGroupRef = useRef<THREE.Group | null>(null);
  
  const chunksRef = useRef<THREE.LOD[]>([]);
  const boundaryRingRef = useRef<THREE.Mesh | null>(null);
  
  const lodsRef = useRef<THREE.LOD[]>([]);
  
  const frameIdRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isPausedRef = useRef(isPaused);
  
  const activeSkinRef = useRef(activeSkin);
  const activeCompanionRef = useRef(activeCompanion);
  
  // Physics State
  const playerVelocity = useRef(new THREE.Vector2(0, 0));
  const playerPosition = useRef(new THREE.Vector3(0, 6, 0)); 

  // Weather State
  const currentWeather = useRef({
    color: new THREE.Color(0xffffff),
    speed: 10,
    sway: 1,
    size: 4
  });

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  
  useEffect(() => {
    activeSkinRef.current = activeSkin;
    activeCompanionRef.current = activeCompanion;
    if (sceneRef.current && playerRef.current) updatePlayerMesh();
    if (sceneRef.current && companionGroupRef.current) updateCompanionMesh();
  }, [activeSkin, activeCompanion]);

  const updatePlayerMesh = () => {
     if (!playerRef.current) return;
     const oldMesh = playerRef.current.children.find(c => c instanceof THREE.Mesh);
     if (oldMesh) playerRef.current.remove(oldMesh);
     
     let geometry: THREE.BufferGeometry;
     let material: THREE.Material;
     
     switch(activeSkinRef.current) {
         case 'skin_cube':
             geometry = new THREE.BoxGeometry(4, 4, 4);
             material = new THREE.MeshStandardMaterial({ 
                 color: 0x00ffff, 
                 emissive: 0x0088aa, 
                 roughness: 0.2,
                 metalness: 0.8
             });
             break;
         case 'skin_tetra':
             geometry = new THREE.TetrahedronGeometry(3.5);
             material = new THREE.MeshPhysicalMaterial({ 
                 color: 0xffccff, 
                 transmission: 0.5,
                 opacity: 0.8,
                 transparent: true,
                 roughness: 0,
                 ior: 1.5,
                 thickness: 2.0
             });
             break;
         case 'skin_default':
         default:
             geometry = new THREE.SphereGeometry(2.5, 32, 32);
             material = new THREE.MeshBasicMaterial({ color: 0xffffee });
             break;
     }
     
     const mesh = new THREE.Mesh(geometry, material);
     playerRef.current.add(mesh);
  };
  
  const updateCompanionMesh = () => {
      if (!companionGroupRef.current) return;
      while(companionGroupRef.current.children.length > 0){ 
          companionGroupRef.current.remove(companionGroupRef.current.children[0]); 
      }
      const type = activeCompanionRef.current;
      if (type === 'comp_firefly') {
          const geometry = new THREE.SphereGeometry(0.5, 8, 8);
          const material = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
          const mesh = new THREE.Mesh(geometry, material);
          const light = new THREE.PointLight(0xffaa00, 1.5, 30);
          companionGroupRef.current.add(mesh);
          companionGroupRef.current.add(light);
      } else if (type === 'comp_spirit') {
          const geometry = new THREE.DodecahedronGeometry(1.2, 0);
          const material = new THREE.MeshBasicMaterial({ 
              color: 0xccffff, 
              transparent: true, 
              opacity: 0.6,
              blending: THREE.AdditiveBlending 
          });
          const mesh = new THREE.Mesh(geometry, material);
          const light = new THREE.PointLight(0xccffff, 1.0, 40);
          companionGroupRef.current.add(mesh);
          companionGroupRef.current.add(light);
      } else {
          const wingGeo = new THREE.CircleGeometry(0.8, 8, 0, Math.PI);
          const wingMat = new THREE.MeshBasicMaterial({ 
            color: 0x88CCFF, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
          });
          const lWing = new THREE.Mesh(wingGeo, wingMat);
          lWing.rotation.z = Math.PI / 2; lWing.rotation.x = Math.PI / 2;
          lWing.position.set(-0.1, 0, 0); lWing.geometry.translate(0, 0.4, 0); 
          const rWing = new THREE.Mesh(wingGeo, wingMat);
          rWing.rotation.z = -Math.PI / 2; rWing.rotation.x = Math.PI / 2;
          rWing.position.set(0.1, 0, 0); rWing.geometry.translate(0, 0.4, 0);
          companionGroupRef.current.add(lWing);
          companionGroupRef.current.add(rWing);
          const butterflyLight = new THREE.PointLight(0x0088ff, 0.8, 20);
          companionGroupRef.current.add(butterflyLight);
      }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Init Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.Fog(0x050508, 1000, 25000); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 30000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const sunPos = new THREE.Vector3(100, 300, -100);
    const sunLight = new THREE.DirectionalLight(0xffaa33, 1.2); 
    sunLight.position.copy(sunPos);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 4000;
    sunLight.shadow.camera.left = -3000;
    sunLight.shadow.camera.right = 3000;
    sunLight.shadow.camera.top = 3000;
    sunLight.shadow.camera.bottom = -3000;
    scene.add(sunLight);

    const sunHaloGeo = new THREE.PlaneGeometry(300, 300);
    const sunHaloMat = new THREE.ShaderMaterial({
      vertexShader: SUN_VERTEX_SHADER,
      fragmentShader: SUN_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Color(0xffaa33) },
        uOpacity: { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    sunHaloMatRef.current = sunHaloMat;
    const sunHalo = new THREE.Mesh(sunHaloGeo, sunHaloMat);
    sunHalo.position.copy(sunPos);
    sunHalo.lookAt(camera.position); 
    scene.add(sunHalo);

    const compGroup = new THREE.Group();
    scene.add(compGroup);
    companionGroupRef.current = compGroup;
    updateCompanionMesh(); 

    const groundGeo = new THREE.PlaneGeometry(120000, 120000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0c1e0c, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    // --- Boundary Ring ---
    const boundaryGeo = new THREE.PlaneGeometry(GAME_OVER_RADIUS * 2, GAME_OVER_RADIUS * 2);
    const boundaryMat = new THREE.ShaderMaterial({
        vertexShader: BOUNDARY_VERTEX_SHADER,
        fragmentShader: BOUNDARY_FRAGMENT_SHADER,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 5;
    scene.add(boundary);
    boundaryRingRef.current = boundary;

    // --- Grass Setup (Infinite Pool System) ---
    const bladeWidth = 0.7;
    const bladeHeight = 4.5;
    
    const grassGeoHigh = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 3);
    grassGeoHigh.translate(0, bladeHeight / 2, 0); 
    const grassGeoLow = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 1);
    grassGeoLow.translate(0, bladeHeight / 2, 0);

    const grassMat = new THREE.ShaderMaterial({
      vertexShader: GRASS_VERTEX_SHADER,
      fragmentShader: GRASS_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uWindStrength: { value: 1.0 },
        uPlayerPosition: { value: new THREE.Vector3(0, 0, 0) },
        uBaseColor: { value: new THREE.Color(0x0a3a0a) }, 
        uTipColor: { value: new THREE.Color(0xB0D66B) }, 
        uSunPosition: { value: sunLight.position },
      },
      side: THREE.DoubleSide,
    });
    materialRef.current = grassMat;

    // --- Chunk Generation (Pool) ---
    const chunks: THREE.LOD[] = [];
    const dummy = new THREE.Object3D();

    const halfGrid = TOTAL_CHUNKS_SIDE / 2;
    for (let x = -halfGrid; x < halfGrid; x++) {
      for (let z = -halfGrid; z < halfGrid; z++) {
        const lod = new THREE.LOD();
        
        const centerX = x * CHUNK_SIZE + CHUNK_SIZE / 2;
        const centerZ = z * CHUNK_SIZE + CHUNK_SIZE / 2;
        
        lod.position.set(centerX, 0, centerZ);

        const meshHigh = new THREE.InstancedMesh(grassGeoHigh, grassMat, INSTANCES_PER_CHUNK);
        meshHigh.castShadow = true;
        meshHigh.receiveShadow = true;

        const meshLow = new THREE.InstancedMesh(grassGeoLow, grassMat, INSTANCES_PER_CHUNK);
        meshLow.castShadow = false; 
        meshLow.receiveShadow = true;

        for (let j = 0; j < INSTANCES_PER_CHUNK; j++) {
          const px = (Math.random() - 0.5) * CHUNK_SIZE;
          const pz = (Math.random() - 0.5) * CHUNK_SIZE;
          dummy.position.set(px, 0, pz);
          dummy.rotation.y = Math.random() * Math.PI;
          const scale = 0.8 + Math.random() * 0.7;
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          meshHigh.setMatrixAt(j, dummy.matrix);
          meshLow.setMatrixAt(j, dummy.matrix);
        }
        meshHigh.instanceMatrix.needsUpdate = true;
        meshLow.instanceMatrix.needsUpdate = true;
        lod.addLevel(meshHigh, 0);
        lod.addLevel(meshLow, 2000); 
        lod.autoUpdate = false; 
        scene.add(lod);
        chunks.push(lod);
      }
    }
    chunksRef.current = chunks;
    lodsRef.current = chunks;

    const weatherCount = 2000;
    const weatherGeo = new THREE.BufferGeometry();
    const weatherPos = [];
    const weatherRandom = [];
    
    for(let i=0; i<weatherCount; i++) {
        weatherPos.push(
            (Math.random() - 0.5) * 400,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 400
        );
        weatherRandom.push(Math.random());
    }
    weatherGeo.setAttribute('position', new THREE.Float32BufferAttribute(weatherPos, 3));
    weatherGeo.setAttribute('aRandom', new THREE.Float32BufferAttribute(weatherRandom, 1));
    
    const weatherMat = new THREE.ShaderMaterial({
        vertexShader: WEATHER_VERTEX_SHADER,
        fragmentShader: WEATHER_FRAGMENT_SHADER,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0xffffff) },
            uSpeed: { value: 10.0 },
            uSway: { value: 1.0 },
            uSize: { value: 4.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    weatherMatRef.current = weatherMat;
    
    const weatherSystem = new THREE.Points(weatherGeo, weatherMat);
    scene.add(weatherSystem);
    weatherSystemRef.current = weatherSystem;

    const playerGroup = new THREE.Group();
    scene.add(playerGroup);
    playerRef.current = playerGroup;
    const playerLight = new THREE.PointLight(0xffaa00, 2, 60);
    playerGroup.add(playerLight);
    updatePlayerMesh();

    const shardGeo = new THREE.OctahedronGeometry(2, 0);
    const shardMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.8,
        wireframe: true 
    });
    const shardGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    
    const shardGroup = new THREE.Group();
    const shards: THREE.Mesh[] = [];
    
    for(let i=0; i<150; i++) {
        const mesh = new THREE.Mesh(shardGeo, shardMat);
        const glow = new THREE.Mesh(shardGeo, shardGlowMat);
        glow.scale.set(1.5, 1.5, 1.5);
        mesh.add(glow);
        mesh.position.set(
            (Math.random() - 0.5) * 6000,
            5 + Math.random() * 5,
            (Math.random() - 0.5) * 6000
        );
        shardGroup.add(mesh);
        shards.push(mesh);
    }
    scene.add(shardGroup);
    shardGroupRef.current = shardGroup;
    shardsRef.current = shards;

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Animation Loop ---
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      if (isPausedRef.current) return;

      const state = systemStateRef.current;
      timeRef.current += 0.01;

      // 1. GAME OVER CHECK
      const distFromCenter = Math.sqrt(playerPosition.current.x**2 + playerPosition.current.z**2);
      if (distFromCenter > GAME_OVER_RADIUS) {
          onGameOver();
          return; 
      }

      if (boundaryRingRef.current) {
          (boundaryRingRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = timeRef.current;
      }

      // 2. MOVEMENT LOGIC
      // Turn Logic (X position)
      const joyX = state.handPosition.x;
      const turn = joyX * 2.5;
      
      // Depth Logic (Hand Size)
      const NEUTRAL_SIZE = 0.12; 
      const SIZE_DEADZONE = 0.02;
      
      let speedZ = 0;
      const sizeDiff = state.handSize - NEUTRAL_SIZE;
      
      // If hand is significantly different from neutral size, move
      if (Math.abs(sizeDiff) > SIZE_DEADZONE) {
          // If diff > 0 (Large/Close) -> Move Forward (Negative Z)
          // If diff < 0 (Small/Far) -> Move Backward (Positive Z)
          speedZ = -(sizeDiff * 25.0); 
      }

      playerVelocity.current.x = playerVelocity.current.x * 0.9 + turn * 0.1;
      playerVelocity.current.y = playerVelocity.current.y * 0.9 + speedZ * 0.1; 

      const moveSpeed = 0.6; 
      playerPosition.current.x += playerVelocity.current.x * moveSpeed;
      playerPosition.current.z += playerVelocity.current.y * moveSpeed;

      const bobHeight = 6 + Math.sin(timeRef.current * 1.5) * 1.0;
      
      if (playerRef.current) {
        playerRef.current.position.set(playerPosition.current.x, bobHeight, playerPosition.current.z);
        
        if (weatherSystemRef.current) {
            weatherSystemRef.current.position.x = playerPosition.current.x;
            weatherSystemRef.current.position.z = playerPosition.current.z;
            weatherSystemRef.current.position.y = 50; 
        }

        if (groundRef.current) {
            groundRef.current.position.set(playerPosition.current.x, 0, playerPosition.current.z);
        }

        const offsetZ = 60;
        const offsetY = 30;
        const targetCamPos = new THREE.Vector3(
            playerPosition.current.x,
            offsetY,
            playerPosition.current.z + offsetZ 
        );

        if (cameraRef.current) {
            cameraRef.current.position.lerp(targetCamPos, 0.05);
            cameraRef.current.lookAt(
                playerPosition.current.x, 
                bobHeight, 
                playerPosition.current.z - 20 
            );
            
            if (lodsRef.current) lodsRef.current.forEach(lod => lod.update(cameraRef.current!));
            
            sunHalo.lookAt(cameraRef.current.position);
        }
        
        if (companionGroupRef.current) {
           const bf = companionGroupRef.current;
           const type = activeCompanionRef.current;
           let hoverX, hoverY, hoverZ;
           
           if (type === 'comp_firefly') {
               hoverX = Math.sin(timeRef.current * 5.0) * 8.0;
               hoverY = Math.cos(timeRef.current * 4.0) * 4.0 + 8.0;
               hoverZ = Math.cos(timeRef.current * 6.0) * 8.0;
           } else if (type === 'comp_spirit') {
               hoverX = Math.sin(timeRef.current * 0.5) * 6.0;
               hoverY = Math.cos(timeRef.current * 0.8) * 2.0 + 6.0;
               hoverZ = Math.cos(timeRef.current * 0.4) * 6.0;
           } else {
               hoverX = Math.sin(timeRef.current * 1.2) * 5.0;
               hoverY = Math.cos(timeRef.current * 2.3) * 3.0 + 5.0;
               hoverZ = Math.cos(timeRef.current * 0.8) * 5.0;
               
               if (bf.children.length > 2) { 
                   const flapSpeed = 15.0 + Math.sin(timeRef.current) * 5.0; 
                   const flapAmp = 0.8;
                   bf.children[0].rotation.y = Math.sin(timeRef.current * flapSpeed) * flapAmp;
                   bf.children[1].rotation.y = -Math.sin(timeRef.current * flapSpeed) * flapAmp;
               }
           }
           
           const targetPos = new THREE.Vector3(
             playerPosition.current.x + hoverX + 8, 
             bobHeight + hoverY,
             playerPosition.current.z + hoverZ
           );
           
           bf.position.lerp(targetPos, 0.05);
           const lookTarget = targetPos.clone().add(new THREE.Vector3(hoverX, 0, hoverZ));
           bf.lookAt(lookTarget);
        }
      }

      if (shardsRef.current.length > 0) {
          for (let i = shardsRef.current.length - 1; i >= 0; i--) {
              const shard = shardsRef.current[i];
              shard.rotation.y += 0.02;
              shard.rotation.x += 0.01;
              shard.position.y = 5 + Math.sin(timeRef.current * 2 + i) * 1.5;
              
              const dx = shard.position.x - playerPosition.current.x;
              const dz = shard.position.z - playerPosition.current.z;
              const dist = Math.sqrt(dx*dx + dz*dz);
              
              if (dist < 10) { 
                  shard.visible = false; 
                  shard.position.set(
                      playerPosition.current.x + (Math.random() - 0.5) * 2000,
                      5,
                      playerPosition.current.z + (Math.random() - 0.5) * 2000
                  );
                  shard.visible = true; 
                  onCollectShard();
              } else if (dist > 8000) { 
                  shard.position.set(
                      playerPosition.current.x + (Math.random() - 0.5) * 4000,
                      5,
                      playerPosition.current.z + (Math.random() - 0.5) * 4000
                  );
              }
          }
      }

      let targetBase = new THREE.Color(0x0a3a0a);
      let targetTip = new THREE.Color(0x88cc44);
      let sunColor = new THREE.Color(0xffaa33);
      
      let targetWeatherColor = new THREE.Color(0xffffff);
      let targetWeatherSpeed = 10;
      let targetWeatherSway = 1;
      let targetWeatherSize = 3;
      
      let targetHaloOpacity = 0.0;
      let targetHaloColor = new THREE.Color(0xffaa33);

      if (state.emotion === Emotion.CALM) {
        targetBase.setHex(0x1a2a0a);
        targetTip.setHex(CONFIG.calmColor);
        sunColor.setHex(0xffaa33);
        targetWeatherColor.setHex(0xE6C229);
        targetWeatherSpeed = 6.0;
        targetWeatherSway = 2.0;
        targetWeatherSize = 5.0;
        targetHaloOpacity = 0.4;
        targetHaloColor.setHex(0xffaa00);
      } else if (state.emotion === Emotion.HAPPY) {
        targetBase.setHex(0x1a2010); 
        targetTip.setHex(CONFIG.happyColor);
        sunColor.setHex(0xffffdd);
        targetWeatherColor.setHex(0xFFFFCC); 
        targetWeatherSpeed = 8.0;
        targetWeatherSway = 1.5;
        targetWeatherSize = 4.0;
        targetHaloOpacity = 0.6;
        targetHaloColor.setHex(0xfffee0);
      } else if (state.emotion === Emotion.SAD) {
        targetBase.setHex(0x223344); 
        targetTip.setHex(CONFIG.sadColor);
        sunColor.setHex(0xFFEECC); 
        targetWeatherColor.setHex(0xFFFFFF); 
        targetWeatherSpeed = 20.0;
        targetWeatherSway = 0.8;
        targetWeatherSize = 2.5; 
        targetHaloOpacity = 0.5;
        targetHaloColor.setHex(0xFFDD88);
      }

      if (materialRef.current) {
        const windStrength = 0.5 + (state.soundAmplitude * 5.0);
        materialRef.current.uniforms.uTime.value = timeRef.current;
        materialRef.current.uniforms.uWindStrength.value = windStrength;
        if (playerRef.current) {
          materialRef.current.uniforms.uPlayerPosition.value.copy(playerRef.current.position);
        }
        materialRef.current.uniforms.uBaseColor.value.lerp(targetBase, 0.05);
        materialRef.current.uniforms.uTipColor.value.lerp(targetTip, 0.05);
      }
      sunLight.color.lerp(sunColor, 0.05);
      
      if (weatherMatRef.current) {
          currentWeather.current.color.lerp(targetWeatherColor, 0.05);
          currentWeather.current.speed += (targetWeatherSpeed - currentWeather.current.speed) * 0.05;
          currentWeather.current.sway += (targetWeatherSway - currentWeather.current.sway) * 0.05;
          currentWeather.current.size += (targetWeatherSize - currentWeather.current.size) * 0.05;

          weatherMatRef.current.uniforms.uTime.value = timeRef.current;
          weatherMatRef.current.uniforms.uColor.value.copy(currentWeather.current.color);
          weatherMatRef.current.uniforms.uSpeed.value = currentWeather.current.speed;
          weatherMatRef.current.uniforms.uSway.value = currentWeather.current.sway;
          weatherMatRef.current.uniforms.uSize.value = currentWeather.current.size;
      }
      
      if (sunHaloMatRef.current) {
          sunHaloMatRef.current.uniforms.uColor.value.lerp(targetHaloColor, 0.05);
          const curOp = sunHaloMatRef.current.uniforms.uOpacity.value;
          sunHaloMatRef.current.uniforms.uOpacity.value = curOp + (targetHaloOpacity - curOp) * 0.02;
      }

      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      grassGeoHigh.dispose();
      grassGeoLow.dispose();
      grassMat.dispose();
      weatherGeo.dispose();
      weatherMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      sunHaloGeo.dispose();
      sunHaloMat.dispose();
      boundaryGeo.dispose();
      boundaryMat.dispose();
      shardGeo.dispose();
      shardMat.dispose();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
};

export default VisualizerCanvas;