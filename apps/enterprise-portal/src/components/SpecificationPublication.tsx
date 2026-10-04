'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { serializeSpecPayload } from '../lib/crypto';
import { verifyPublishedSpecification } from '../lib/jobSpecPublication';

export function SpecificationPublication({
  payload,
  uri,
  onUriChange,
  disabled = false,
  inputId,
}: {
  payload: unknown;
  uri: string;
  onUriChange: (uri: string) => void;
  disabled?: boolean;
  inputId?: string;
}) {
  const { t } = useTranslation();
  const generatedId = useId();
  const id = inputId || generatedId;
  const json = useMemo(() => serializeSpecPayload(payload), [payload]);
  const [download, setDownload] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    json: string;
    uri: string;
    error?: string;
  }>();
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' })
    );
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [json]);
  const currentResult =
    result?.json === json && result?.uri === uri ? result : undefined;
  const verify = async () => {
    setChecking(true);
    setResult(undefined);
    try {
      await verifyPublishedSpecification(payload, uri);
      setResult({ json, uri });
    } catch (error) {
      setResult({
        json,
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="specification-publication">
      <h3>{t('publication.title')}</h3>
      <p className="small" id={`${id}-help`}>
        {t('publication.instructions')}
      </p>
      <a
        className="chat-link"
        href={download}
        download="job-specification.json"
      >
        {t('publication.download')}
      </a>
      <label className="stat-label" htmlFor={id}>
        {t('publication.uri')}
      </label>
      <input
        id={id}
        value={uri}
        onChange={(event) => onUriChange(event.target.value)}
        placeholder="ipfs://… or https://…"
        disabled={disabled || checking}
        aria-describedby={`${id}-help`}
        required
      />
      <button
        type="button"
        className="secondary"
        onClick={verify}
        disabled={disabled || checking || !uri.trim()}
      >
        {checking ? t('publication.verifying') : t('publication.verify')}
      </button>
      {currentResult && (
        <p
          role="status"
          className={currentResult.error ? 'alert error' : 'alert success'}
        >
          {currentResult.error || t('publication.verified')}
        </p>
      )}
      <p className="small">{t('publication.attachments')}</p>
    </div>
  );
}
