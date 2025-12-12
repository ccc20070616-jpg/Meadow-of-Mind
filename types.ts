export enum Emotion {
  HAPPY = 'HAPPY',
  CALM = 'CALM',
  SAD = 'SAD'
}

export interface SystemState {
  emotion: Emotion;
  mouthOpenness: number;
  mouthCurvature: number; // New metric: >0 Smile, <0 Frown
  soundAmplitude: number;
  soundFrequency: number;
  handPosition: { x: number, y: number };
  handSize: number; // New metric for depth control
  isFist: boolean;
}

export interface VisualizerConfig {
  particleCount: number;
  sphereRadius: number;
  particleRadius: number;
  happyColor: number;
  calmColor: number;
  sadColor: number;
  happySpeed: number;
  sadSpeed: number;
  happyMusicRate: number;
  sadMusicRate: number;
  mouthThreshold: number;
  musicUrl: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  READY = 'READY',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  ERROR = 'ERROR'
}

export type ItemType = 'skin' | 'companion';

export interface StoreItem {
  id: string;
  name: string;
  type: ItemType;
  cost: number;
  unlocked: boolean;
  active: boolean;
  description: string;
}