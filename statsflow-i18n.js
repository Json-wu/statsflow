(function (g) {
  const LOCALE_IDS = ['en', 'zh_CN', 'zh_TW', 'ja', 'ru', 'id', 'ar', 'es', 'pt_BR', 'de', 'fr', 'ko'];
  const SET = new Set(LOCALE_IDS);
  const TO_BCP47 = {
    en: 'en',
    zh_CN: 'zh-CN',
    zh_TW: 'zh-TW',
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

  /** data-i18n key for each locale row in language menus (sorted separately). */
  const LOCALE_LABEL_KEYS = Object.freeze({
    ar: 'langArabic',
    zh_CN: 'langChinese',
    zh_TW: 'langChineseTraditional',
    de: 'langGerman',
    en: 'langEnglish',
    es: 'langSpanish',
    fr: 'langFrench',
    id: 'langIndonesian',
    ja: 'langJapanese',
    ko: 'langKorean',
    pt_BR: 'langPortugueseBrazil',
    ru: 'langRussian'
  });

  /**
   * Locales in language dropdowns: sorted by English name of the language (A–Z).
   */
  const LOCALE_MENU_ORDER = Object.freeze([
    'ar',
    'zh_CN',
    'zh_TW',
    'de',
    'en',
    'es',
    'fr',
    'id',
    'ja',
    'ko',
    'pt_BR',
    'ru'
  ]);

  function localeIdToBcp47(id) {
    return TO_BCP47[id] || 'en';
  }

  function isSupportedLocale(id) {
    return SET.has(id);
  }

  function getLocaleMenuOrder() {
    return LOCALE_MENU_ORDER.filter((id) => SET.has(id));
  }

  function resolveLocaleFromBrowser(browserLang, storedLocale) {
    if (storedLocale && SET.has(storedLocale)) return storedLocale;
    const lang = (browserLang || '').toLowerCase().replace(/_/g, '-');
    if (lang.startsWith('zh')) {
      if (
        lang.includes('-tw') ||
        lang.includes('-hk') ||
        lang.includes('-mo') ||
        lang === 'zh-hant' ||
        lang.endsWith('-hant')
      ) {
        return 'zh_TW';
      }
      return 'zh_CN';
    }
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
    LOCALE_LABEL_KEYS,
    isSupportedLocale,
    localeIdToBcp47,
    resolveLocaleFromBrowser,
    getLocaleMenuOrder
  };
})(typeof window !== 'undefined' ? window : self);
