import React, { createContext, useContext, useState, useCallback } from 'react';
import mr from './locales/mr.json';
import en from './locales/en.json';

const translations = { mr, en };

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('trackbus_lang');
    return stored === 'en' ? 'en' : 'mr'; // Default: Marathi
  });

  const toggleLanguage = useCallback(() => {
    setLang(prev => {
      const next = prev === 'mr' ? 'en' : 'mr';
      localStorage.setItem('trackbus_lang', next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key, fallback) => {
      return translations[lang]?.[key] ?? translations['en']?.[key] ?? fallback ?? key;
    },
    [lang]
  );

  // Use React.createElement to avoid JSX in a .js file (Vite requires .jsx for JSX)
  return React.createElement(
    LanguageContext.Provider,
    { value: { lang, t, toggleLanguage } },
    children
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be inside LanguageProvider');
  return ctx;
};
