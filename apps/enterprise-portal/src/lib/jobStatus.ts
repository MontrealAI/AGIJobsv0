import type { JobPhase } from '../types';

export const jobStateToPhase = (state: number): JobPhase => {
  switch (state) {
    case 1:
      return 'Created';
    case 2:
      return 'Assigned';
    case 3:
      return 'Submitted';
    case 4:
      return 'InValidation';
    case 5:
      return 'Disputed';
    case 6:
      return 'Finalized';
    case 7:
      return 'Cancelled';
    default:
      return 'Created';
  }
};

export const phaseToTagColor = (phase: JobPhase): string => {
  switch (phase) {
    case 'Created':
      return 'purple';
    case 'Assigned':
      return 'orange';
    case 'Submitted':
      return 'purple';
    case 'InValidation':
      return 'orange';
    case 'Finalized':
      return 'green';
    case 'Disputed':
      return 'red';
    case 'Expired':
      return 'red';
    case 'Cancelled':
      return 'red';
    default:
      return 'purple';
  }
};
