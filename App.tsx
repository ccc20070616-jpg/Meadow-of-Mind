import React, { useState, useEffect, useRef } from 'react';
import Overlay from './components/Overlay';
import VisualizerCanvas from './components/VisualizerCanvas';
import { AppStatus, SystemState, Emotion, StoreItem } from './types';
import { CONFIG } from './constants';

// Initial Store Data
const INITIAL_STORE_ITEMS: StoreItem[] = [
  // Skins
  { id: 'skin_default', name: '光之球', type: 'skin', cost: 0, unlocked: true, active: true, description: '最纯粹的光芒形态。' },
  { id: 'skin_cube', name: '量子立方', type: 'skin', cost: 50, unlocked: false, active: false, description: '来自数字维度的几何体。' },
  { id: 'skin_tetra', name: '以太棱镜', type: 'skin', cost: 120, unlocked: false, active: false, description: '能够折射情绪的古代遗物。' },
  
  // Companions
  { id: 'comp_butterfly', name: '蓝闪蝶', type: 'companion', cost: 0, unlocked: true, active: true, description: '象征希望的忠实伙伴。' },
  { id: 'comp_firefly', name: '余烬萤火', type: 'companion', cost: 80, unlocked: false, active: false, description: '曾在风暴中幸存的微光。' },
  { id: 'comp_spirit', name: '森林之灵', type: 'companion', cost: 200, unlocked: false, active: false, description: '古老草甸的守护者。' },
];

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string>('');
  const [gameKey, setGameKey] = useState(0); // Used to reset canvas on restart
  
  // Game State
  const [xp, setXp] = useState<number>(0);
  const [storeItems, setStoreItems] = useState<StoreItem[]>(INITIAL_STORE_ITEMS);
  const [isShopOpen, setIsShopOpen] = useState(false);

  // Refs for mutable data
  const systemStateRef = useRef<SystemState>({
    emotion: Emotion.CALM,
    mouthOpenness: 0,
    mouthCurvature: 0,
    soundAmplitude: 0,
    soundFrequency: 0,
    handPosition: { x: 0, y: 0 },
    handSize: 0.1, // Default neutral size
    isFist: false,
  });

  const statusRef = useRef<AppStatus>(AppStatus.IDLE);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const videoRef = useRef<HTMLVideoElement>(null);
  
  // --- Generative Audio Engine Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const windFilterRef = useRef<BiquadFilterNode | null>(null);
  const windGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // AI Model Refs
  const handsRef = useRef<any>(null); 
  const faceMeshRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // --- Logic: Initialize Tracking (Hands + Face) ---
  const initTracking = async () => {
    try {
      // 1. Hands Setup
      const HandsClass = (window as any).Hands || (window as any).mediapipe?.hands?.Hands;
      const FaceMeshClass = (window as any).FaceMesh || (window as any).mediapipe?.face_mesh?.FaceMesh;

      if (!HandsClass || !FaceMeshClass) {
        throw new Error("AI libraries not loaded. Please check your connection.");
      }

      // --- Hands Config ---
      const hands = new HandsClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // Lite model for performance since we are running two models
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults((results: any) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];
          // Safety check: Ensure we have enough landmarks
          if (!landmarks || landmarks.length < 21) return;

          const palmCenter = landmarks[9]; 
          const wrist = landmarks[0];

          // Strict null check for landmarks
          if (!palmCenter || !wrist) return;

          // Normalized position (Mirror X)
          const x = (1 - palmCenter.x) * 2 - 1; 
          const y = -(palmCenter.y) * 2 + 1;
          
          // Hand Size (Depth estimation)
          // Distance between Wrist (0) and Middle Finger MCP (9)
          const handSize = Math.hypot(palmCenter.x - wrist.x, palmCenter.y - wrist.y);

          // Fist Detection
          // Check tip distance to MCP (Index 9)
          let tipToMcpDist = 0;
          [8, 12, 16, 20].forEach(idx => {
             const tip = landmarks[idx];
             if (tip) {
                tipToMcpDist += Math.hypot(tip.x - palmCenter.x, tip.y - palmCenter.y);
             }
          });
          const isFist = tipToMcpDist < 0.35; 

          systemStateRef.current.handPosition = { x, y };
          systemStateRef.current.handSize = handSize;
          systemStateRef.current.isFist = isFist;
        } else {
            // Reset to neutral if no hand detected
            systemStateRef.current.handPosition = { x: 0, y: 0 };
            systemStateRef.current.handSize = 0.12; // Neutral
            systemStateRef.current.isFist = false;
        }
      });
      handsRef.current = hands;

      // --- FaceMesh Config ---
      const faceMesh = new FaceMeshClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      faceMesh.onResults((results: any) => {
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
          const landmarks = results.multiFaceLandmarks[0];
          if (!landmarks) return;

          // Indices:
          // 61: Left Mouth Corner
          // 291: Right Mouth Corner
          // 13: Upper Lip Center
          // 14: Lower Lip Center
          const leftCorner = landmarks[61];
          const rightCorner = landmarks[291];
          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];

          // Strict check to prevent undefined errors
          if (!leftCorner || !rightCorner || !upperLip || !lowerLip) return;

          // 1. Calculate Mouth Width (for Normalization)
          const width = Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y);

          // 2. Calculate Curvature
          // Y increases downwards.
          // Smile: Corners (small Y) are higher than Center (large Y).
          // Metric = CenterY - CornerY. Positive = Smile.
          const cornersY = (leftCorner.y + rightCorner.y) / 2;
          const centerY = (upperLip.y + lowerLip.y) / 2;
          
          let rawCurvature = (centerY - cornersY) / width;

          // 3. Smoothing (Exponential Moving Average)
          const prevCurvature = systemStateRef.current.mouthCurvature;
          // Apply gentle smoothing
          const curvature = prevCurvature * 0.9 + rawCurvature * 0.1;
          systemStateRef.current.mouthCurvature = curvature;

          // 4. Determine Emotion State
          // Thresholds need to be tuned for normalized values
          // > 0.05 is usually a smile
          // < -0.02 is usually a frown/sadness
          if (curvature > 0.04) {
            systemStateRef.current.emotion = Emotion.HAPPY;
          } else if (curvature < -0.03) {
            systemStateRef.current.emotion = Emotion.SAD;
          } else {
            systemStateRef.current.emotion = Emotion.CALM;
          }
        }
      });
      faceMeshRef.current = faceMesh;

    } catch (err) {
      console.error("AI Init Error:", err);
      throw new Error("Failed to initialize tracking.");
    }
  };

  // --- Logic: Wind Audio Engine ---
  const initAudio = async () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGainRef.current = masterGain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      masterGain.connect(analyser);
      analyser.connect(ctx.destination);

      // --- Wind Synthesis (Pink Noise) ---
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      
      // Generate Pink Noise
      let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; 
        b6 = white * 0.115926;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;
      noiseNode.start();

      // Wind Filter (Bandpass/Lowpass dynamic)
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 400; // Start low
      windFilter.Q.value = 1;
      windFilterRef.current = windFilter;

      const windGain = ctx.createGain();
      windGain.gain.value = 0.8; // Restored to 0.8 as BGM is removed
      windGainRef.current = windGain;

      noiseNode.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(masterGain);

      return ctx;
    } catch (err) {
      console.error("Audio Engine Init Error:", err);
      throw new Error("Failed to initialize audio engine.");
    }
  };

  // --- Logic: Generative Update Loop ---
  useEffect(() => {
    if (status !== AppStatus.RUNNING) return;

    let time = 0;
    const interval = setInterval(() => {
      const ctx = audioContextRef.current;
      if (!ctx || !analyserRef.current) return;
      time += 0.05;

      const state = systemStateRef.current;
      
      // 1. Analyze for Visuals
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const amplitude = sum / (bufferLength * 255);
      
      systemStateRef.current.soundAmplitude = systemStateRef.current.soundAmplitude * 0.9 + amplitude * 0.1;

      // 2. Wind Modulation Logic
      if (windFilterRef.current && windGainRef.current) {
        // Base wind variation
        const baseVariation = Math.sin(time * 0.5) * 200 + Math.cos(time * 1.3) * 100;
        
        let targetFreq = 400 + baseVariation;
        let targetGain = 0.5;

        // Interaction: Fist creates "Gusts" (Volume/Intensity) but Face controls Atmosphere
        if (state.isFist) {
           // Gusty mode
           targetFreq = 800 + Math.random() * 600;
           targetGain = 0.8 + Math.random() * 0.3;
        } else {
           // Gentle mode 
           targetFreq = 400 + baseVariation;
           targetGain = 0.4 + Math.sin(time * 0.2) * 0.1;
        }

        const now = ctx.currentTime;
        windFilterRef.current.frequency.setTargetAtTime(targetFreq, now, 0.2);
        windGainRef.current.gain.setTargetAtTime(targetGain, now, 0.2);
      }

    }, 50);

    return () => clearInterval(interval);
  }, [status]);

  // --- Logic: Start Sequence ---
  const handleStart = async () => {
    // If we are restarting from GAME_OVER, reset the game
    if (status === AppStatus.GAME_OVER) {
       setGameKey(k => k + 1); // Force canvas remount
    }

    setStatus(AppStatus.LOADING);
    setError('');

    try {
      // Only init audio/tracking if not already done
      if (!audioContextRef.current) await initAudio(); 
      else if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      if (!handsRef.current) await initTracking();

      if (videoRef.current && handsRef.current && faceMeshRef.current && !cameraRef.current) {
        const CameraClass = (window as any).Camera || (window as any).mediapipe?.camera_utils?.Camera;
        const camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            if (statusRef.current !== AppStatus.RUNNING) return;
            // Send to both models. 
            // NOTE: This is heavy. In a production app, we might alternate frames or use a web worker.
            if (videoRef.current) {
               await handsRef.current.send({ image: videoRef.current });
               await faceMeshRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        cameraRef.current = camera;
        await camera.start();
      }

      setStatus(AppStatus.RUNNING);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Initialization failed");
      setStatus(AppStatus.ERROR);
    }
  };
  
  const handleGameOver = () => {
      setStatus(AppStatus.GAME_OVER);
      if (audioContextRef.current) {
          audioContextRef.current.suspend();
      }
  };

  const togglePause = async () => {
    if (status === AppStatus.RUNNING) {
      if (audioContextRef.current) await audioContextRef.current.suspend();
      setStatus(AppStatus.PAUSED);
    } else if (status === AppStatus.PAUSED) {
      if (audioContextRef.current) await audioContextRef.current.resume();
      setStatus(AppStatus.RUNNING);
    }
  };

  // --- XP & Shop Logic ---
  const handleCollectShard = () => {
    setXp(prev => prev + 50);

    // Play Sound FX (Sparkle/Ding)
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'running') {
        const t = ctx.currentTime;
        
        // Main tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        // Connect to master gain if available, otherwise destination
        gain.connect(masterGainRef.current || ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1); // Jump up octave
        
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        
        osc.start(t);
        osc.stop(t + 0.4);

        // Secondary harmonic (sparkle)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(masterGainRef.current || ctx.destination);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(2200, t);
        osc2.frequency.linearRampToValueAtTime(4000, t + 0.1);
        
        gain2.gain.setValueAtTime(0.1, t);
        gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        
        osc2.start(t);
        osc2.stop(t + 0.2);
    }
  };

  const handlePurchase = (item: StoreItem) => {
    if (xp >= item.cost && !item.unlocked) {
      setXp(prev => prev - item.cost);
      setStoreItems(prev => prev.map(i => i.id === item.id ? { ...i, unlocked: true } : i));

      // Play Purchase Sound (Success Chord)
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'running') {
          const t = ctx.currentTime;
          const destination = masterGainRef.current || ctx.destination;

          // Major Triad Arpeggio (C6, E6, G6)
          [1046.50, 1318.51, 1567.98].forEach((freq, index) => {
             const osc = ctx.createOscillator();
             const gain = ctx.createGain();
             
             osc.type = 'sine';
             osc.frequency.value = freq;
             
             osc.connect(gain);
             gain.connect(destination);
             
             const startTime = t + index * 0.06; // Staggered start
             const duration = 0.3;
             
             gain.gain.setValueAtTime(0, startTime);
             gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
             gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
             
             osc.start(startTime);
             osc.stop(startTime + duration);
          });
      }
    }
  };

  const handleEquip = (item: StoreItem) => {
    if (!item.unlocked) return;
    setStoreItems(prev => prev.map(i => {
      // If equipping a skin, unequip other skins
      if (item.type === 'skin' && i.type === 'skin') {
        return { ...i, active: i.id === item.id };
      }
      // If equipping a companion, unequip other companions
      if (item.type === 'companion' && i.type === 'companion') {
        return { ...i, active: i.id === item.id };
      }
      return i;
    }));
  };

  const activeSkin = storeItems.find(i => i.type === 'skin' && i.active)?.id || 'skin_default';
  const activeCompanion = storeItems.find(i => i.type === 'companion' && i.active)?.id || 'comp_butterfly';

  const [uiState, setUiState] = useState<SystemState>(systemStateRef.current);
  useEffect(() => {
    if (status !== AppStatus.RUNNING) return;
    const uiInterval = setInterval(() => setUiState({ ...systemStateRef.current }), 200);
    return () => clearInterval(uiInterval);
  }, [status]);


  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-serif">
      <video
        ref={videoRef}
        className={`absolute bottom-6 right-6 w-48 sm:w-64 aspect-video object-cover rounded-xl border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.6)] z-30 transition-all duration-700 ${
            status === AppStatus.RUNNING || status === AppStatus.PAUSED ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
        }`}
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />
      
      <VisualizerCanvas 
        key={gameKey} // Force reset on restart
        systemStateRef={systemStateRef} 
        isPaused={status === AppStatus.PAUSED}
        onCollectShard={handleCollectShard}
        activeSkin={activeSkin}
        activeCompanion={activeCompanion}
        onGameOver={handleGameOver}
      />
      
      <Overlay 
        status={status} 
        onStart={handleStart} 
        onTogglePause={togglePause}
        error={error}
        systemState={uiState}
        xp={xp}
        storeItems={storeItems}
        isShopOpen={isShopOpen}
        onOpenShop={() => setIsShopOpen(true)}
        onCloseShop={() => setIsShopOpen(false)}
        onPurchase={handlePurchase}
        onEquip={handleEquip}
      />
    </div>
  );
};

export default App;