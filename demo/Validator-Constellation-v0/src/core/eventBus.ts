import { EventEmitter } from 'events';
import {
  CommitMessage,
  EntropyWitness,
  PauseRecord,
  RevealMessage,
  SentinelAlert,
  SlashingEvent,
  ValidatorEventBus,
  ValidatorStatusEvent,
  ZkBatchProof,
} from './types';

export class ValidatorConstellationEventBus extends EventEmitter implements ValidatorEventBus {
  emit(event: 'StakeSlashed', payload: SlashingEvent): boolean;
  emit(event: 'SentinelAlert', payload: SentinelAlert): boolean;
  emit(event: 'DomainPaused', payload: PauseRecord): boolean;
  emit(event: 'DomainResumed', payload: PauseRecord): boolean;
  emit(event: 'CommitLogged', payload: CommitMessage): boolean;
  emit(event: 'RevealLogged', payload: RevealMessage): boolean;
  emit(event: 'ZkBatchFinalized', payload: ZkBatchProof): boolean;
  emit(event: 'VrfWitnessComputed', payload: EntropyWitness): boolean;
  emit(event: 'ValidatorStatusChanged', payload: ValidatorStatusEvent): boolean;
  emit(event: string, payload: unknown): boolean {
    return super.emit(event, payload);
  }
}

export const eventBus = new ValidatorConstellationEventBus();
