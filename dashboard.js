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

function getRootDomain(url) {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.hostname.split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return urlObj.hostname;
  } catch {
    return '';
  }
}

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

(async function init() {
  const {
    LOCALE_IDS,
    resolveLocaleFromBrowser,
    localeIdToBcp47,
    isSupportedLocale,
    getLocaleMenuOrder,
    LOCALE_LABEL_KEYS
  } = window.StatsflowI18n;

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

  let loc = 'en';
  async function syncLocFromStorage() {
    const { locale: stored } = await chrome.storage.local.get(['locale']);
    const browser = chrome.i18n.getUILanguage?.() || navigator.language || '';
    loc = resolveLocaleFromBrowser(browser, stored);
  }
  await syncLocFromStorage();

  const tr = (key, ...a) => t(msgs, loc, key, ...a);

  function syncDashSidebarCollapseUi() {
    const app = document.getElementById('dash-app');
    const btn = document.getElementById('dash-sidebar-collapse');
    if (!btn) return;
    const collapsed = app?.classList.contains('dash-sidebar-collapsed') ?? false;
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const label = collapsed ? tr('dashSidebarExpand') : tr('dashSidebarCollapse');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function syncDashThemeLabels() {
    const isDark = document.body.classList.contains('dark');
    const msg = tr(isDark ? 'toggleLightMode' : 'toggleDarkMode');
    const lab = document.getElementById('dash-theme-label');
    const btn = document.getElementById('dash-theme-btn');
    if (lab) lab.textContent = msg;
    if (btn) {
      btn.title = msg;
      btn.setAttribute('aria-label', msg);
    }
  }

  let workspaceApi = { refreshLocale() {}, async load() {} };
  if (typeof StatsflowDashboardWorkspace !== 'undefined') {
    workspaceApi = StatsflowDashboardWorkspace.init({ tr }) || workspaceApi;
  }

  let dashboardI18nInitialized = false;
  function applyI18n() {
    document.documentElement.lang = localeIdToBcp47(loc);
    document.documentElement.dir = loc === 'ar' ? 'rtl' : 'ltr';
    document.title = tr('extName');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = tr(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = tr(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = tr(key);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', tr(key));
    });
    document.getElementById('dash-ext-name').textContent = tr('dashSidebarBrandName');
    document.getElementById('dash-about-desc').textContent = tr('extDescription');
    document.getElementById('dash-version').textContent = chrome.runtime.getManifest().version;
    document.getElementById('dash-link-github').textContent = tr('openGitHub');
    document.getElementById('dash-link-privacy').textContent = tr('optionsPrivacy');

    if (dashboardI18nInitialized) workspaceApi.refreshLocale();
    dashboardI18nInitialized = true;

    const featAbout = document.getElementById('dash-about-features');
    if (featAbout) {
      featAbout.innerHTML = '';
      OPTIONS_FEATURE_KEYS.forEach((key) => {
        const li = document.createElement('li');
        li.textContent = tr(key);
        featAbout.appendChild(li);
      });
    }

    const langSelect = document.getElementById('dash-lang');
    if (langSelect) {
      const order = getLocaleMenuOrder();
      if (langSelect.options.length !== order.length) {
        langSelect.innerHTML = '';
        order.forEach((id) => {
          const opt = document.createElement('option');
          opt.value = id;
          langSelect.appendChild(opt);
        });
      }
      order.forEach((id, i) => {
        const key = LOCALE_LABEL_KEYS[id];
        if (langSelect.options[i]) langSelect.options[i].textContent = tr(key);
      });
      langSelect.value = loc;
    }
    syncDashSidebarCollapseUi();
    syncDashThemeLabels();
  }

  const { darkMode, dashSidebarCollapsed: storedSidebarCollapsed } = await chrome.storage.local.get([
    'darkMode',
    'dashSidebarCollapsed'
  ]);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (darkMode === true || (darkMode === undefined && prefersDark)) {
    document.body.classList.add('dark');
  }

  const dashApp = document.getElementById('dash-app');
  if (dashApp && window.matchMedia('(min-width: 769px)').matches) {
    dashApp.classList.toggle('dash-sidebar-collapsed', !!storedSidebarCollapsed);
  }

  applyI18n();
  workspaceApi.load?.();

  const moon = document.querySelector('.dash-icon-moon');
  const sun = document.querySelector('.dash-icon-sun');

  function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark');
    moon?.classList.toggle('hidden', isDark);
    sun?.classList.toggle('hidden', !isDark);
    syncDashThemeLabels();
  }

  updateThemeIcon();

  document.getElementById('dash-theme-btn')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    updateThemeIcon();
    chrome.storage.local.set({ darkMode: isDark });
  });

  function showPanel(name) {
    document.querySelectorAll('.dash-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
    document.querySelectorAll('.dash-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-panel') === name);
    });
    const topTitle = document.querySelector('.dash-main-topbar-title');
    if (topTitle) {
      if (name === 'home') topTitle.textContent = tr('dashNavHome');
      else if (name === 'blacklist') topTitle.textContent = tr('dashNavBlacklist');
      else if (name === 'about') topTitle.textContent = tr('dashNavAbout');
    }
    if (history.replaceState) {
      history.replaceState(null, '', name === 'home' ? 'dashboard.html' : `dashboard.html#${name}`);
    }
  }

  const sidebarToggle = document.getElementById('dash-sidebar-toggle');
  const sidebarBackdrop = document.getElementById('dash-sidebar-backdrop');

  document.getElementById('dash-sidebar-collapse')?.addEventListener('click', async () => {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    dashApp?.classList.toggle('dash-sidebar-collapsed');
    const collapsed = dashApp?.classList.contains('dash-sidebar-collapsed');
    await chrome.storage.local.set({ dashSidebarCollapsed: !!collapsed });
    syncDashSidebarCollapseUi();
  });

  function setDashSidebarOpen(open) {
    dashApp?.classList.toggle('is-sidebar-open', open);
    sidebarToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeDashSidebarIfMobile() {
    if (window.matchMedia('(max-width: 768px)').matches) setDashSidebarOpen(false);
  }

  sidebarToggle?.addEventListener('click', () => {
    setDashSidebarOpen(!dashApp?.classList.contains('is-sidebar-open'));
  });
  sidebarBackdrop?.addEventListener('click', () => setDashSidebarOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dashApp?.classList.contains('is-sidebar-open')) setDashSidebarOpen(false);
  });
  window.matchMedia('(min-width: 769px)').addEventListener('change', async (e) => {
    if (e.matches) {
      setDashSidebarOpen(false);
      const { dashSidebarCollapsed: c } = await chrome.storage.local.get(['dashSidebarCollapsed']);
      dashApp?.classList.toggle('dash-sidebar-collapsed', !!c);
    } else {
      dashApp?.classList.remove('dash-sidebar-collapsed');
    }
    syncDashSidebarCollapseUi();
  });

  document.querySelectorAll('.dash-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.getAttribute('data-panel');
      if (panel) showPanel(panel);
      closeDashSidebarIfMobile();
    });
  });

  const hash = (location.hash || '').replace(/^#/, '');
  if (hash === 'blacklist' || hash === 'about') showPanel(hash);
  else showPanel('home');

  /* ——— Blacklist ——— */
  const blInput = document.getElementById('dash-blacklist-input');
  const blSuggestions = document.getElementById('dash-blacklist-suggestions');
  const blList = document.getElementById('dash-blacklist-list');
  let blSuggestTimer = null;

  const escapeAttrDom = (s) =>
    String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function hideBlSuggestions() {
    blSuggestions?.classList.add('hidden');
    if (blSuggestions) blSuggestions.innerHTML = '';
  }

  async function fetchDomainSuggestions(query, blSet) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const items = await new Promise((resolve) => {
      chrome.history.search({ text: '', maxResults: 4000, startTime: 0 }, resolve);
    });
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
      const rd = getRootDomain(item.url || '').toLowerCase();
      if (!rd || blSet.has(rd) || !rd.includes(q)) continue;
      if (seen.has(rd)) continue;
      seen.add(rd);
      out.push(rd);
      if (out.length >= 20) break;
    }
    return out;
  }

  async function updateBlSuggestions() {
    if (!blInput || !blSuggestions) return;
    const q = blInput.value.trim().toLowerCase();
    if (!q) {
      hideBlSuggestions();
      return;
    }
    const { blacklist = [] } = await chrome.storage.local.get(['blacklist']);
    const blSet = new Set((blacklist || []).map((d) => String(d).toLowerCase().trim()));
    const matches = await fetchDomainSuggestions(q, blSet);
    if (matches.length === 0) {
      hideBlSuggestions();
      return;
    }
    blSuggestions.innerHTML = matches
      .map(
        (rd) =>
          `<button type="button" class="dash-suggestion-item" data-domain="${escapeAttrDom(rd)}">${escapeAttrDom(rd)}</button>`
      )
      .join('');
    blSuggestions.classList.remove('hidden');
  }

  blInput?.addEventListener('input', () => {
    clearTimeout(blSuggestTimer);
    blSuggestTimer = setTimeout(updateBlSuggestions, 120);
  });

  blSuggestions?.addEventListener('mousedown', (e) => {
    if (e.target.closest('.dash-suggestion-item')) e.preventDefault();
  });

  blSuggestions?.addEventListener('click', (e) => {
    const btn = e.target.closest('.dash-suggestion-item');
    if (!btn) return;
    blInput.value = (btn.dataset.domain || '').toLowerCase();
    hideBlSuggestions();
    blInput.focus();
  });

  async function renderBlacklist() {
    const trLocal = (k, ...a) => t(msgs, loc, k, ...a);
    const { blacklist } = await chrome.storage.local.get(['blacklist']);
    const list = blacklist || [];
    blList.innerHTML = list
      .map(
        (d, i) =>
          `<li><span>${String(d || '').replace(/</g, '&lt;')}</span><button type="button" data-index="${i}">${trLocal('remove')}</button></li>`
      )
      .join('');
    blList.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { blacklist: bl } = await chrome.storage.local.get(['blacklist']);
        const arr = bl || [];
        arr.splice(Number(btn.dataset.index), 1);
        await chrome.storage.local.set({ blacklist: arr });
        renderBlacklist();
      });
    });
  }

  document.getElementById('dash-blacklist-add')?.addEventListener('click', async () => {
    const domain = blInput.value.trim().toLowerCase();
    if (!domain) return;
    const { blacklist } = await chrome.storage.local.get(['blacklist']);
    const arr = blacklist || [];
    if (!arr.includes(domain)) {
      arr.push(domain);
      await chrome.storage.local.set({ blacklist: arr });
      blInput.value = '';
      hideBlSuggestions();
      renderBlacklist();
    }
  });

  async function applyDashboardLocale(v) {
    if (!isSupportedLocale(v)) return;
    loc = v;
    await chrome.storage.local.set({ locale: loc });
    applyI18n();
    await renderBlacklist();
  }

  document.getElementById('dash-lang')?.addEventListener('change', async (e) => {
    await applyDashboardLocale(e.target.value);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.darkMode) {
      const d = changes.darkMode.newValue;
      if (d === true) document.body.classList.add('dark');
      else if (d === false) document.body.classList.remove('dark');
      else document.body.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
      updateThemeIcon();
    }
    if (changes.locale) {
      const v = changes.locale.newValue;
      if (isSupportedLocale(v)) {
        loc = v;
        applyI18n();
        void renderBlacklist();
      }
    }
    if (changes.blacklist) {
      void renderBlacklist();
    }
  });

  await renderBlacklist();
})();
