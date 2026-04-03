(function (g) {
  const LOCALE_IDS = ['en', 'zh_CN', 'ja', 'ru', 'id', 'ar', 'es', 'pt_BR', 'de', 'fr', 'ko'];
  const SET = new Set(LOCALE_IDS);
  const TO_BCP47 = {
    en: 'en',
    zh_CN: 'zh-CN',
    ja: 'ja',
    ru: 'ru',
    id: 'id',
    ar: 'ar',
    es: 'es',
    pt_BR: 'pt-BR',
    de: 'de',
    fr: 'fr',
    ko: 'ko'
  };

  function localeIdToBcp47(id) {
    return TO_BCP47[id] || 'en';
  }

  function isSupportedLocale(id) {
    return SET.has(id);
  }

  function resolveLocaleFromBrowser(browserLang, storedLocale) {
    if (storedLocale && SET.has(storedLocale)) return storedLocale;
    const lang = (browserLang || '').toLowerCase().replace(/_/g, '-');
    if (lang.startsWith('zh')) return 'zh_CN';
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('id')) return 'id';
    if (lang.startsWith('ar')) return 'ar';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('pt')) return 'pt_BR';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('fr')) return 'fr';
    if (lang.startsWith('ko')) return 'ko';
    return 'en';
  }

  g.StatsflowI18n = {
    LOCALE_IDS,
    isSupportedLocale,
    localeIdToBcp47,
    resolveLocaleFromBrowser
  };
})(typeof window !== 'undefined' ? window : self);
