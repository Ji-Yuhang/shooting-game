import * as THREE from "three";
import type { ActorState } from "../types";

type ImpactKind = "actor" | "surface";

const RIGHT_VECTOR = new THREE.Vector3();
const UP_VECTOR = new THREE.Vector3(0, 1, 0);

export class AudioSystem {
  private context: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listenerPosition = new THREE.Vector3();
  private listenerForward = new THREE.Vector3(0, 0, -1);
  private enemyFootstepTimer = 0;

  constructor() {
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return;
    }
    this.context = new Context();
    const gain = this.context.createGain();
    gain.gain.value = 0.35;
    gain.connect(this.context.destination);
    this.masterGainNode = gain;
    this.ensureNoiseBuffer();
  }

  unlock(): void {
    if (!this.context) {
      return;
    }
    if (this.context.state !== "running") {
      this.context.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    if (!this.context) {
      return;
    }
    this.context.close().catch(() => undefined);
    this.context = null;
  }

  setListener(position: THREE.Vector3, forward: THREE.Vector3): void {
    this.listenerPosition.copy(position);
    if (forward.lengthSq() > 0.0001) {
      this.listenerForward.copy(forward).normalize();
    }
  }

  playBowDraw(position: THREE.Vector3): void {
    this.playOscBurst({
      position,
      type: "sawtooth",
      startHz: 220,
      endHz: 310,
      duration: 0.12,
      gain: 0.1
    });
  }

  playArrowRelease(position: THREE.Vector3): void {
    this.playOscBurst({
      position,
      type: "triangle",
      startHz: 820,
      endHz: 560,
      duration: 0.08,
      gain: 0.16
    });
  }

  playArrowImpact(position: THREE.Vector3, kind: ImpactKind): void {
    if (kind === "actor") {
      this.playNoiseBurst(position, 0.08, 0.17, 620);
      return;
    }
    this.playNoiseBurst(position, 0.06, 0.12, 900);
  }

  playSmokeThrow(position: THREE.Vector3): void {
    this.playOscBurst({
      position,
      type: "sine",
      startHz: 180,
      endHz: 110,
      duration: 0.14,
      gain: 0.12
    });
  }

  updateEnemyFootsteps(deltaSeconds: number, enemies: ActorState[]): void {
    const active = enemies
      .filter((enemy) => enemy.lifeState === "alive" && enemy.velocity.lengthSq() > 0.45)
      .map((enemy) => ({
        enemy,
        distance: enemy.position.distanceTo(this.listenerPosition)
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!active || active.distance > 34) {
      this.enemyFootstepTimer = 0;
      return;
    }

    const speed = Math.sqrt(active.enemy.velocity.lengthSq());
    const nearFactor = THREE.MathUtils.clamp(1 - active.distance / 34, 0, 1);
    const speedFactor = THREE.MathUtils.clamp(speed / 5.5, 0, 1);
    const interval = THREE.MathUtils.lerp(0.85, 0.26, nearFactor) * THREE.MathUtils.lerp(1.1, 0.75, speedFactor);

    this.enemyFootstepTimer += deltaSeconds;
    if (this.enemyFootstepTimer < interval) {
      return;
    }
    this.enemyFootstepTimer = 0;
    this.playNoiseBurst(
      active.enemy.position,
      0.05,
      THREE.MathUtils.lerp(0.04, 0.16, nearFactor),
      THREE.MathUtils.lerp(220, 160, nearFactor)
    );
  }

  private playOscBurst(options: {
    position: THREE.Vector3;
    type: OscillatorType;
    startHz: number;
    endHz: number;
    duration: number;
    gain: number;
  }): void {
    if (!this.context || !this.masterGainNode || this.context.state !== "running") {
      return;
    }
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const attenuation = this.getAttenuation(options.position);
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, options.endHz), now + options.duration);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain * attenuation), now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    panner.pan.setValueAtTime(this.computePan(options.position), now);

    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGainNode);
    oscillator.start(now);
    oscillator.stop(now + options.duration + 0.02);
  }

  private playNoiseBurst(
    position: THREE.Vector3,
    duration: number,
    gain: number,
    lowpassHz: number
  ): void {
    if (!this.context || !this.masterGainNode || !this.noiseBuffer || this.context.state !== "running") {
      return;
    }
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lowpassHz, now);
    const gainNode = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const attenuation = this.getAttenuation(position);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * attenuation), now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.setValueAtTime(this.computePan(position), now);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGainNode);
    source.start(now);
    source.stop(now + duration + 0.03);
  }

  private computePan(position: THREE.Vector3): number {
    const toSound = position.clone().sub(this.listenerPosition);
    if (toSound.lengthSq() < 0.0001) {
      return 0;
    }
    RIGHT_VECTOR.crossVectors(this.listenerForward, UP_VECTOR).normalize();
    return THREE.MathUtils.clamp(toSound.normalize().dot(RIGHT_VECTOR), -0.85, 0.85);
  }

  private getAttenuation(position: THREE.Vector3): number {
    const distance = position.distanceTo(this.listenerPosition);
    return 1 / (1 + distance * 0.14);
  }

  private ensureNoiseBuffer(): void {
    if (!this.context || this.noiseBuffer) {
      return;
    }
    const length = Math.floor(this.context.sampleRate * 0.5);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.8;
    }
    this.noiseBuffer = buffer;
  }
}
