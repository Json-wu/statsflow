function parseMessage(obj, args = []) {
  if (!obj?.message) return '';
  let str = obj.message;
  const replaceNum = (s) => s.replace(/\$(\d)(?!\d)/g, (_, n) => (args[Number(n) - 1] ?? ''));
  if (obj.placeholders) {
    for (const [name, ph] of Object.entries(obj.placeholders)) {
      const content = replaceNum(ph.content || '');
      str = str.replace(new RegExp('\\$' + name + '\\$', 'g'), content);
    }
  }
  return replaceNum(str);
}

function t(msgs, locale, key, ...args) {
  const obj = msgs[locale]?.[key] || msgs.en?.[key];
  return obj ? parseMessage(obj, args) : key;
}

(async function init() {
  const { LOCALE_IDS, resolveLocaleFromBrowser, localeIdToBcp47 } = window.StatsflowI18n;

  const msgs = {};
  try {
    await Promise.all(
      LOCALE_IDS.map(async (id) => {
        try {
          const res = await fetch(chrome.runtime.getURL(`_locales/${id}/messages.json`));
          msgs[id] = await res.json();
        } catch {
          msgs[id] = {};
        }
      })
    );
  } catch {
    LOCALE_IDS.forEach((id) => {
      msgs[id] = {};
    });
  }

  const { locale: stored } = await chrome.storage.local.get(['locale']);
  const browser = chrome.i18n.getUILanguage?.() || navigator.language || '';
  const loc = resolveLocaleFromBrowser(browser, stored);

  const tr = (key, ...a) => t(msgs, loc, key, ...a);

  const OPTIONS_FEATURE_KEYS = [
    'optionsFeatDomains',
    'optionsFeatStats',
    'optionsFeatSort',
    'optionsFeatFilter',
    'optionsFeatCalendar',
    'optionsFeatViews',
    'optionsFeatTrend',
    'optionsFeatHour',
    'optionsFeatCategory',
    'optionsFeatSearch',
    'optionsFeatExport',
    'optionsFeatPrivacy',
    'optionsFeatTheme',
    'optionsFeatFooter'
  ];

  document.documentElement.lang = localeIdToBcp47(loc);
  document.documentElement.dir = loc === 'ar' ? 'rtl' : 'ltr';
  document.title = tr('extName');

  document.getElementById('options-title').textContent = tr('optionsPageTitle');
  document.getElementById('options-desc').textContent = tr('extDescription');
  document.getElementById('options-version-label').textContent = tr('optionsVersionLabel') + ' ';
  document.getElementById('options-version').textContent = chrome.runtime.getManifest().version;
  document.getElementById('options-features-heading').textContent = tr('optionsFeaturesHeading');
  const featUl = document.getElementById('options-features-list');
  OPTIONS_FEATURE_KEYS.forEach((key) => {
    const li = document.createElement('li');
    li.textContent = tr(key);
    featUl.appendChild(li);
  });
  document.getElementById('options-links-heading').textContent = tr('optionsLinksHeading');
  document.getElementById('link-github').textContent = tr('openGitHub');
  document.getElementById('link-privacy').textContent = tr('optionsPrivacy');

  const { darkMode } = await chrome.storage.local.get(['darkMode']);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (darkMode === true || (darkMode === undefined && prefersDark)) {
    document.body.classList.add('dark');
  }
})();
