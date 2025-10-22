import { clamp } from './utils.js';
import type { DifficultySnapshot } from './types.js';

export interface DifficultyControllerOptions {
  targetSeconds: number;
  kp?: number;
  ki?: number;
  kd?: number;
  minDifficulty?: number;
  maxDifficulty?: number;
}

export class DifficultyController {
  private readonly _targetSeconds: number;
  private readonly kp: number;
  private readonly ki: number;
  private readonly kd: number;
  private readonly minDifficulty: number;
  private readonly maxDifficulty: number;
  private integral = 0;
  private previousError = 0;
  private difficulty = 1;
  private readonly history: DifficultySnapshot[] = [];

  constructor(options: DifficultyControllerOptions) {
    this._targetSeconds = options.targetSeconds;
    this.kp = options.kp ?? 0.4;
    this.ki = options.ki ?? 0.05;
    this.kd = options.kd ?? 0.1;
    this.minDifficulty = options.minDifficulty ?? 0.25;
    this.maxDifficulty = options.maxDifficulty ?? 4;
  }

  get currentDifficulty(): number {
    return this.difficulty;
  }

  get targetSeconds(): number {
    return this._targetSeconds;
  }

  get snapshots(): DifficultySnapshot[] {
    return [...this.history];
  }

  update(actualSeconds: number): number {
    const error = this._targetSeconds - actualSeconds;
    this.integral += error;
    const derivative = error - this.previousError;
    this.previousError = error;

    const adjustment = this.kp * error + this.ki * this.integral + this.kd * derivative;
    const nextDifficulty = clamp(this.difficulty + adjustment / this._targetSeconds, this.minDifficulty, this.maxDifficulty);
    this.difficulty = Number(nextDifficulty.toFixed(4));
    this.history.push({ timestamp: new Date(), error, newScore: this.difficulty });
    if (this.history.length > 20) {
      this.history.shift();
    }
    return this.difficulty;
  }
}
