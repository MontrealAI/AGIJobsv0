'use client';

import { useMemo, useState } from 'react';
import { parseUnits } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { getJobRegistryContract } from '../lib/contracts';
import { computeSpecHash } from '../lib/crypto';

export interface JobDraft {
  title: string;
  description: string;
  reward: string;
  deadline: string;
  ttl: string;
  skills: string;
  uri: string;
  requiresSla: boolean;
  slaUri: string;
  agentTypes: string;
}

export interface CreateJobResult {
  txHash?: string;
  jobId?: bigint;
  specHash: string;
}

export interface JobCreationState {
  creating: boolean;
  error?: string;
  submit: () => Promise<CreateJobResult>;
  resetError: () => void;
}

export const defaultJobDraft: JobDraft = {
  title: '',
  description: '',
  reward: '',
  deadline: '',
  ttl: '72',
  skills: '',
  uri: '',
  requiresSla: false,
  slaUri: '',
  agentTypes: '3'
};

export const useJobCreation = (draft: JobDraft): JobCreationState & { specHash: string } => {
  const { signer, address, hasAcknowledged } = useWeb3();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  const rewardInWei = useMemo(() => {
    if (!draft.reward) return 0n;
    try {
      return parseUnits(draft.reward, 18);
    } catch (err) {
      return 0n;
    }
  }, [draft.reward]);

  const specPayload = useMemo(() => {
    const skills = draft.skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);

    return {
      title: draft.title,
      description: draft.description,
      requiredSkills: skills,
      ttlHours: Number(draft.ttl) || 0,
      metadataURI: draft.uri,
      sla: draft.requiresSla
        ? {
            uri: draft.slaUri,
            requiresSignature: true
          }
        : undefined
    };
  }, [draft]);

  const specHash = useMemo(() => computeSpecHash(specPayload), [specPayload]);

  const submit = async (): Promise<CreateJobResult> => {
    if (!signer || !address) {
      const message = 'Connect a verified wallet before submitting a job.';
      setError(message);
      throw new Error(message);
    }

    setCreating(true);
    setError(undefined);

    try {
      const contract = getJobRegistryContract(signer);
      const now = Math.floor(Date.now() / 1000);
      const ttlSeconds = Number(draft.ttl) * 3600;
      const deadlineSeconds = draft.deadline
        ? Math.floor(new Date(draft.deadline).getTime() / 1000)
        : now + ttlSeconds;
      const uri = draft.uri || `ipfs://job-spec/${specHash}`;
      const agentTypes = Number(draft.agentTypes);
      const method = hasAcknowledged ? 'createJobWithAgentTypes' : 'acknowledgeAndCreateJobWithAgentTypes';
      const registryAddress = await contract.getAddress();
      const tx = await contract[method](rewardInWei, BigInt(deadlineSeconds), agentTypes, specHash, uri);
      const receipt = await tx.wait?.();

      let jobId: bigint | undefined;
      if (receipt?.logs) {
        const jobLog = receipt.logs.find(
          (log: any) => typeof log.address === 'string' && log.address.toLowerCase() === registryAddress.toLowerCase()
        );
        if (jobLog) {
          try {
            const parsed = contract.interface.parseLog(jobLog);
            if (parsed?.name === 'JobCreated' && parsed.args?.jobId) {
              jobId = BigInt(parsed.args.jobId);
            }
          } catch (parseError) {
            console.error('Failed to parse JobCreated log', parseError);
          }
        }
      }

      return { txHash: tx.hash, jobId, specHash };
    } catch (err) {
      const message = (err as Error).message ?? 'Failed to create job';
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  };

  return {
    creating,
    error,
    submit,
    resetError: () => setError(undefined),
    specHash
  };
};
