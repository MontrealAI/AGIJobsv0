'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobSpecificationMetadata, JobSlaReference } from '../types';
import { resolveResourceUri } from '../lib/uri';

const metadataCache = new Map<string, JobSpecificationMetadata>();

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (typeof entry === 'number' || typeof entry === 'bigint') return String(entry);
        return undefined;
      })
      .filter((entry): entry is string => Boolean(entry && entry.length > 0));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseSla = (value: unknown): JobSlaReference | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const uri = toStringOrUndefined(record.uri ?? record.url);
  const title = toStringOrUndefined(record.title ?? record.name);
  const summary = toStringOrUndefined(record.summary ?? record.description);
  const version = toStringOrUndefined(record.version ?? record.revision);
  const requiresSignature = Boolean(record.requiresSignature ?? record.signatureRequired ?? record.mustSign);
  const obligations = toStringArray(record.obligations ?? record.duties ?? record.requirements);
  const successCriteria = toStringArray(record.successCriteria ?? record.acceptanceCriteria ?? record.metrics);
  return {
    uri,
    title,
    summary,
    version,
    requiresSignature,
    obligations,
    successCriteria
  };
};

const parseMetadata = (payload: unknown): JobSpecificationMetadata => {
  if (!payload || typeof payload !== 'object') {
    return {
      requiredSkills: [],
      deliverables: [],
      attachments: [],
      raw: payload
    };
  }
  const record = payload as Record<string, unknown>;
  const title = toStringOrUndefined(record.title ?? record.name ?? record.jobTitle);
  const description = toStringOrUndefined(record.description ?? record.details ?? record.summary);
  const requiredSkills = toStringArray(record.requiredSkills ?? record.skills ?? record.capabilities);
  const deliverables = toStringArray(record.deliverables ?? record.outputs);
  const attachments = toStringArray(record.attachments ?? record.resources ?? record.references);
  const reward = toStringOrUndefined(record.reward ?? record.bounty ?? record.compensation);
  const ttlHours = toNumberOrUndefined(record.ttlHours ?? record.ttl ?? record.deadlineHours);
  const sla = parseSla(record.sla);
  return {
    title,
    description,
    requiredSkills,
    deliverables,
    attachments,
    reward,
    ttlHours,
    sla,
    raw: payload
  };
};

interface UseJobMetadataResult {
  metadata?: JobSpecificationMetadata;
  loading: boolean;
  error?: string;
  refresh: () => void;
  resolvedUri?: string;
}

export const useJobMetadata = (uri?: string): UseJobMetadataResult => {
  const resolvedUri = useMemo(() => (uri ? resolveResourceUri(uri) : undefined), [uri]);
  const [metadata, setMetadata] = useState<JobSpecificationMetadata | undefined>(() =>
    uri ? metadataCache.get(uri) : undefined
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!uri || !resolvedUri) {
      setMetadata(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }

    const cached = metadataCache.get(uri);
    if (cached && version === 0) {
      setMetadata(cached);
      setError(undefined);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);

    (async () => {
      try {
        const response = await fetch(resolvedUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch job metadata: ${response.status} ${response.statusText}`);
        }
        const json = await response.json();
        if (!active) return;
        const parsed = parseMetadata(json);
        metadataCache.set(uri, parsed);
        setMetadata(parsed);
      } catch (err) {
        if (!active) return;
        const message = (err as Error).message ?? 'Unable to load job metadata';
        setError(message);
        setMetadata(undefined);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })().catch((err) => console.error(err));

    return () => {
      active = false;
    };
  }, [resolvedUri, uri, version]);

  const refresh = useCallback(() => {
    if (!uri) return;
    metadataCache.delete(uri);
    setVersion((current) => current + 1);
  }, [uri]);

  return {
    metadata,
    loading,
    error,
    refresh,
    resolvedUri
  };
};
