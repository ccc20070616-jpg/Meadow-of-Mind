import { VisualizerConfig } from './types';

export const CONFIG: VisualizerConfig = {
  particleCount: 80000, // Increased for a larger world density
  sphereRadius: 80,
  particleRadius: 3.0,
  
  // Nature / Healing Colors
  happyColor: 0xD4DE8D, // Spring: Yellow-green, lower saturation (was 0xB0D66B)
  calmColor: 0xE6C229,  // Autumn: Golden Hour / Warm Wheat
  sadColor: 0xBBDDFF,   // Winter: Brighter, Icy Blue/White (was 0x4A6B8A)

  happySpeed: 0.02,
  sadSpeed: 0.05,
  happyMusicRate: 1.15,
  sadMusicRate: 0.85,
  mouthThreshold: 0.3,
  musicUrl: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/858/outfoxing.mp3'
};