'use client';

import {
  languageDisplayNames,
  supportedLocales,
  type SupportedLocale,
} from '../lib/i18n';
import { useTranslation } from '../context/LanguageContext';

export const LanguageSelector = () => {
  const { locale, setLocale, t } = useTranslation();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as SupportedLocale;
    setLocale(value);
  };

  return (
    <label className="language-selector">
      <span className="language-selector__label">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={locale}
        onChange={handleChange}
        className="language-selector__select"
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code}>
            {languageDisplayNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
};
