// Bundle the exact original offline receipt reviewer; never instantiate an EVM provider.
import reviewer from '../review.cjs';
export const review = reviewer.review;
export const validateEvidence = reviewer.validateEvidence;
