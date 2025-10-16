import template from '../../config/market.spec.template.json';

type PlannedValidation = {
  jobId: number;
  approve: boolean;
  commitHash: string;
};

type ListedJob = {
  id: number;
  specUri: string;
  status: string;
};

export async function createJobFromTemplate(prompt: string) {
  return {
    ...template,
    question: prompt || template.question,
    generatedAt: new Date().toISOString()
  };
}

export async function listJobs(): Promise<ListedJob[]> {
  return [];
}

export async function planValidation(jobId: number, approve: boolean): Promise<PlannedValidation> {
  return {
    jobId,
    approve,
    commitHash: '0x' + crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')
  };
}
