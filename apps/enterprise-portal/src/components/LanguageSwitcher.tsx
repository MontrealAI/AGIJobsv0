'use client';

import { ChangeEvent } from 'react';
import { SupportedLanguage, useLocalization } from '../context/LocalizationContext';

export const LanguageSwitcher = () => {
  const { language, setLanguage, availableLanguages, t } = useLocalization();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as SupportedLanguage);
  };

  return (
    <label className="language-switcher">
      <span className="sr-only">{t('language.label')}</span>
      <select aria-label={t('language.label')} value={language} onChange={handleChange}>
        {availableLanguages.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
};
