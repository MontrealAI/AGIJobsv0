import core from '../disruption/core.cjs';
import engine from '../../asi-takeoff/scripts/plan.cjs';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
export const desk = core.createDesk({
  analyze: engine.analyze,
  sha256: (bytes) => bytesToHex(sha256(bytes)),
});
