// 获取站点域名
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// 域名到网站类别的映射（用于统计图表，category 为 i18n key）
const DOMAIN_CATEGORY_MAP = [
  { pattern: /google|bing|baidu|sogou|duckduckgo|yahoo|yandex/i, category: 'category_search' },
  { pattern: /weibo|twitter|\bx\.com\b|zhihu|douban|reddit|facebook|instagram|linkedin|tiktok/i, category: 'category_social' },
  { pattern: /youtube|bilibili|douyin|netflix|iqiyi|youku|twitch|vimeo/i, category: 'category_video' },
  { pattern: /taobao|jd\.com|amazon|tmall|pinduoduo|1688|aliexpress|ebay/i, category: 'category_shopping' },
  { pattern: /github|stackoverflow|npmjs|mdn|w3schools|juejin|cnblogs|csdn|segmentfault|leetcode|codeforces/i, category: 'category_dev' },
  { pattern: /notion|docs\.google|confluence|jira|飞书|feishu|语雀|yuque|石墨|shimo/i, category: 'category_office' },
  { pattern: /news|sina|sohu|163\.com|qq\.com|toutiao|36kr|infoq|oschina/i, category: 'category_news' },
  { pattern: /wikipedia|wikimedia|zh\.wikipedia/i, category: 'category_wiki' }
];

function getSiteCategory(rootDomain) {
  const domain = (rootDomain || '').toLowerCase();
  for (const { pattern, category } of DOMAIN_CATEGORY_MAP) {
    if (pattern.test(domain)) return category;
  }
  return 'category_other';
}

// 自定义 i18n：支持运行时切换语言
let I18N_MESSAGES = { en: {}, zh_CN: {} };
let CURRENT_LOCALE = 'en';

function parseChromeMessage(obj, args = []) {
  if (!obj || !obj.message) return '';
  let str = obj.message;
  const replaceNum = (s) => s.replace(/\$(\d)(?!\d)/g, (_, n) => (args[Number(n) - 1] ?? ''));
  if (obj.placeholders) {
    for (const [name, ph] of Object.entries(obj.placeholders)) {
      const content = replaceNum(ph.content || '');
      str = str.replace(new RegExp('\\$' + name + '\\$', 'g'), content);
    }
  }
  str = replaceNum(str);
  return str;
}

function t(key, ...args) {
  const msgs = I18N_MESSAGES[CURRENT_LOCALE] || I18N_MESSAGES.en;
  const obj = msgs[key];
  if (obj) return parseChromeMessage(obj, args);
  const fallback = I18N_MESSAGES.en?.[key];
  if (fallback) return parseChromeMessage(fallback, args);
  return key;
}

async function loadI18nMessages() {
  try {
    const [enRes, zhRes] = await Promise.all([
      fetch(chrome.runtime.getURL('_locales/en/messages.json')),
      fetch(chrome.runtime.getURL('_locales/zh_CN/messages.json'))
    ]);
    I18N_MESSAGES.en = await enRes.json();
    I18N_MESSAGES.zh_CN = await zhRes.json();
  } catch (e) {
    I18N_MESSAGES.en = {};
    I18N_MESSAGES.zh_CN = {};
  }
}

function getLocaleForDates() {
  return CURRENT_LOCALE === 'zh_CN' ? 'zh-CN' : 'en';
}

function resolveInitialLocale(browserLang, storedLocale) {
  if (storedLocale === 'zh_CN' || storedLocale === 'en') return storedLocale;
  const lang = (browserLang || '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh_CN';
  return 'en';
}

// 获取站点根域名（用于合并）
function getRootDomain(url) {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// 获取站点图标（使用 Chrome 内置 Favicon API，从浏览器缓存获取，比直接请求 /favicon.ico 更可靠）
function getFaviconUrl(url) {
  try {
    const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', url);
    faviconUrl.searchParams.set('size', '32');
    return faviconUrl.toString();
  } catch {
    return '';
  }
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const locale = getLocaleForDates();

  if (diff < 60000) return t('timeJustNow');
  if (diff < 3600000) return t('timeMinutesAgo', Math.floor(diff / 60000));
  if (diff < 86400000) return t('timeHoursAgo', Math.floor(diff / 3600000));
  if (diff < 604800000) return t('timeDaysAgo', Math.floor(diff / 86400000));

  return date.toLocaleDateString(locale);
}

// 格式化完整日期
function formatFullDate(timestamp) {
  const locale = getLocaleForDates();
  return new Date(timestamp).toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// 获取时间范围
function getTimeRange(filter, selectedDate = null) {
  const now = Date.now();
  const day = 86400000;
  
  // 选中日期优先：仅该日 00:00:00 至 23:59:59.999
  if (selectedDate) {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    const startTime = d.getTime();
    const endTime = startTime + day; // Chrome API endTime 为「早于」该时刻，故用次日 00:00
    return { startTime, endTime };
  }
  
  switch (filter) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { startTime: today.getTime() };
    case 'week':
      return { startTime: now - 7 * day };
    case 'month':
      return { startTime: now - 30 * day };
    case 'all':
      return { startTime: 0 };
    default:
      return { startTime: 0 };
  }
}

// 判断时间戳是否在选中日期当天
function isInSelectedDay(timestamp, selectedDate) {
  const d = new Date(selectedDate);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  const end = start + 86400000;
  return timestamp >= start && timestamp < end;
}

// 正则匹配（安全封装）
function matchRegex(text, pattern) {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(text || '');
  } catch {
    return false;
  }
}

// 获取并处理历史记录
async function getHistoryStats(filter = 'all', searchTerm = '', selectedDate = null, useRegex = false, blacklist = []) {
  const timeRange = getTimeRange(filter, selectedDate);
  const apiSearchText = useRegex ? '' : searchTerm;
  
  return new Promise((resolve) => {
    chrome.history.search({
      text: apiSearchText,
      maxResults: 10000,
      ...timeRange
    }, (items) => {
      items = items || [];
      // 选中日期时：客户端二次过滤
      let filteredItems = items;
      if (selectedDate) {
        filteredItems = items.filter(item => isInSelectedDay(item.lastVisitTime, selectedDate));
      }
      // 正则模式：客户端过滤
      if (useRegex && searchTerm) {
        filteredItems = filteredItems.filter(item =>
          matchRegex(item.title, searchTerm) || matchRegex(item.url, searchTerm) || matchRegex(getDomain(item.url), searchTerm)
        );
      }
      // 黑名单过滤
      if (blacklist.length > 0) {
        const blSet = new Set(blacklist.map(d => d.toLowerCase().trim()));
        filteredItems = filteredItems.filter(item => !blSet.has(getRootDomain(item.url).toLowerCase()));
      }
      
      // 按根域名合并统计，保留每个 URL 的详情
      const siteMap = new Map();
      
      filteredItems.forEach(item => {
        const rootDomain = getRootDomain(item.url);
        const domain = getDomain(item.url);
        
        if (siteMap.has(rootDomain)) {
          const site = siteMap.get(rootDomain);
          site.visitCount += item.visitCount || 1;
          site.urlList.push({
            url: item.url,
            title: item.title || domain,
            visitCount: item.visitCount || 1,
            lastVisitTime: item.lastVisitTime
          });
          if (item.lastVisitTime > site.lastVisitTime) {
            site.lastVisitTime = item.lastVisitTime;
            site.title = item.title || domain;
            site.url = item.url;
          }
        } else {
          siteMap.set(rootDomain, {
            domain: domain,
            rootDomain: rootDomain,
            title: item.title || domain,
            url: item.url,
            visitCount: item.visitCount || 1,
            lastVisitTime: item.lastVisitTime || Date.now(),
            favicon: getFaviconUrl(item.url),
            urlList: [{
              url: item.url,
              title: item.title || domain,
              visitCount: item.visitCount || 1,
              lastVisitTime: item.lastVisitTime
            }]
          });
        }
      });
      
      // 转换为数组，添加 pageCount
      const sites = Array.from(siteMap.values()).map(site => ({
        ...site,
        pageCount: site.urlList.length
      }));
      
      // 访问时段分布、访问趋势：使用 sites.urlList（与历史列表同一数据源）
      const hourDistribution = new Array(24).fill(0);
      const day = 86400000;
      const now = Date.now();
      const dailyTrend = new Array(7).fill(0).map((_, i) => ({ label: '', count: 0 }));
      const weeklyTrend = new Array(4).fill(0).map((_, i) => ({ label: '', count: 0 }));
      
      sites.forEach(site => {
        (site.urlList || []).forEach(p => {
          const hour = new Date(p.lastVisitTime).getHours();
          hourDistribution[hour] += p.visitCount || 1;
          const t = p.lastVisitTime;
          const cnt = p.visitCount || 1;
          const daysAgo = Math.floor((now - t) / day);
          if (daysAgo >= 0 && daysAgo < 7) {
            dailyTrend[6 - daysAgo].count += cnt;
          }
          const weeksAgo = Math.floor((now - t) / (7 * day));
          if (weeksAgo >= 0 && weeksAgo < 4) {
            weeklyTrend[3 - weeksAgo].count += cnt;
          }
        });
      });
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(now - (6 - i) * day);
        dailyTrend[i].label = `${d.getMonth() + 1}/${d.getDate()}`;
      }
      for (let i = 0; i < 4; i++) {
        const end = new Date(now - (3 - i) * 7 * day);
        const start = new Date(end - 6 * day);
        weeklyTrend[i].label = `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
      }

      // 网站类别访问量统计
      const categoryDistribution = {};
      sites.forEach(site => {
        const cat = getSiteCategory(site.rootDomain);
        categoryDistribution[cat] = (categoryDistribution[cat] || 0) + site.visitCount;
      });
      const categoryData = Object.entries(categoryDistribution)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      resolve({ sites, hourDistribution, dailyTrend, weeklyTrend, categoryData });
    });
  });
}

// 获取某月有访问记录的日期集合
async function getDatesWithVisits(year, month) {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  return new Promise((resolve) => {
    chrome.history.search({ text: '', maxResults: 10000, startTime: start, endTime: end }, (items) => {
      const dates = new Set();
      items.forEach(item => {
        const d = new Date(item.lastVisitTime);
        dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      });
      resolve(dates);
    });
  });
}

// 渲染日历
function renderCalendar(year, month, datesWithVisits) {
  const titleEl = document.getElementById('calendar-month-title');
  const locale = getLocaleForDates();
  const d = new Date(year, month, 1);
  titleEl.textContent = d.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  
  const container = document.getElementById('calendar-days');
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();
  
  let html = '';
  // 上月末尾
  for (let i = startPad - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const ts = new Date(prevYear, prevMonth, d).getTime();
    html += `<div class="calendar-day other-month" data-date="${prevYear}-${prevMonth}-${d}" data-ts="${ts}">${d}</div>`;
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month}-${d}`;
    const hasVisits = datesWithVisits.has(dateStr);
    const isToday = dateStr === todayStr;
    const ts = new Date(year, month, d).getTime();
    const cls = ['calendar-day'];
    if (hasVisits) cls.push('has-visits');
    if (isToday) cls.push('today');
    html += `<div class="calendar-day ${cls.join(' ')}" data-date="${dateStr}" data-ts="${ts}">${d}</div>`;
  }
  // 下月开头
  const totalCells = startPad + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  for (let d = 1; d <= remaining; d++) {
    const ts = new Date(nextYear, nextMonth, d).getTime();
    html += `<div class="calendar-day other-month" data-date="${nextYear}-${nextMonth}-${d}" data-ts="${ts}">${d}</div>`;
  }
  
  container.innerHTML = html;
}

// 按排序方式排序站点
function sortSites(sites, sortBy) {
  const sorted = [...sites];
  if (sortBy === 'visits') {
    sorted.sort((a, b) => b.visitCount - a.visitCount);
  } else {
    sorted.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  }
  return sorted;
}

// 渲染访问趋势图
function renderTrendChart(dailyTrend, weeklyTrend, trendMode = 'day') {
  const container = document.getElementById('trend-chart');
  const barsEl = document.getElementById('trend-chart-bars');
  if (!container || !barsEl) return;
  const data = trendMode === 'week' ? weeklyTrend : dailyTrend;
  const total = data.reduce((a, b) => a + b.count, 0);
  const max = Math.max(...data.map(d => d.count), 1);
  
  if (total === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('trendChartEmpty')}</small></div>`;
  } else {
    const barHeightPx = 80;
    barsEl.innerHTML = data.map(d => {
      const h = Math.max(2, (d.count / max) * barHeightPx);
      return `<div class="trend-bar-wrap" title="${d.label}: ${t('visitsCount', d.count)}">
        <div class="trend-bar" style="height: ${h}px"></div>
        <span class="trend-label">${d.label}</span>
      </div>`;
    }).join('');
  }
  container.classList.remove('hidden');
}

// 渲染访问时段分布
function renderHourChart(hourDistribution) {
  const container = document.getElementById('hour-chart');
  const barsEl = document.getElementById('hour-chart-bars');
  if (!container || !barsEl) return;
  const total = hourDistribution.reduce((a, b) => a + b, 0);
  const max = Math.max(...hourDistribution, 1);
  
  if (total === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('hourChartEmpty')}</small></div>`;
  } else {
    const barHeightPx = 80;
    barsEl.innerHTML = hourDistribution.map((count, hour) => {
      const h = Math.max(2, (count / max) * barHeightPx);
      return `<div class="hour-bar-wrap" title="${hour}: ${t('visitsCount', count)}">
        <div class="hour-bar" style="height: ${h}px"></div>
        <span class="hour-label">${hour}</span>
      </div>`;
    }).join('');
  }
  container.classList.remove('hidden');
}

// 渲染网站类别访问量图表
function renderCategoryChart(categoryData) {
  const container = document.getElementById('category-chart');
  const barsEl = document.getElementById('category-chart-bars');
  if (!container || !barsEl) return;
  const data = Array.isArray(categoryData) ? categoryData : [];
  const total = data.reduce((a, b) => a + b.count, 0);
  const max = Math.max(...data.map(d => d.count), 1);

  if (total === 0 || data.length === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('categoryChartEmpty')}</small></div>`;
  } else {
    barsEl.innerHTML = data.map(d => {
      const percent = total > 0 ? Math.round((d.count / total) * 100) : 0;
      const barWidth = Math.max(4, (d.count / max) * 100);
      const name = t(d.name);
      return `<div class="category-bar-row" title="${name}: ${t('visitsCount', d.count)} (${percent}%)">
        <span class="category-name">${name}</span>
        <div class="category-bar-wrap">
          <div class="category-bar" style="width: ${barWidth}%"></div>
        </div>
        <span class="category-count">${d.count}</span>
      </div>`;
    }).join('');
  }
  container.classList.remove('hidden');
}

// 渲染历史列表（仅在历史视图显示，不渲染图表）
function renderHistory(sites, sortBy = 'time', hourDistribution = null, dailyTrend = null, weeklyTrend = null, trendMode = 'day', renderCharts = false, categoryData = null) {
  const container = document.getElementById('history-list');
  const sortedSites = sortSites(sites, sortBy);
  if (renderCharts && hourDistribution) renderHourChart(hourDistribution);
  if (renderCharts && dailyTrend && weeklyTrend) renderTrendChart(dailyTrend, weeklyTrend, trendMode);
  if (renderCharts && categoryData) renderCategoryChart(categoryData);
  
  if (sortedSites.length === 0) {
    container.innerHTML = `<div class="no-results">${t('noData')}</div>`;
    document.getElementById('total-sites').textContent = `${t('siteCount')}: 0`;
    document.getElementById('total-visits').textContent = `${t('visitCount')}: 0`;
    return;
  }
  
  const totalVisits = sortedSites.reduce((sum, site) => sum + site.visitCount, 0);
  
  container.innerHTML = sortedSites.map((site) => {
    const percent = totalVisits > 0 ? Math.round((site.visitCount / totalVisits) * 100) : 0;
    const hasPages = site.urlList && site.urlList.length > 0;
    return `
    <div class="history-item ${hasPages ? 'expandable' : ''}" data-url="${site.url}" data-root-domain="${site.rootDomain}">
      <div class="history-item-header">
        <div class="site-icon">
          ${site.favicon ? 
            `<img src="${site.favicon}" width="20" height="20" onerror="this.style.display='none';this.parentNode.innerHTML='🌐'">` : 
            '🌐'}
        </div>
        <div class="site-info">
          <div class="site-title">${site.title}</div>
          <div class="site-domain">${site.domain} · ${t('pages', site.pageCount || 1)}</div>
          <div class="visit-bar" title="${t('percent', percent)}">
            <div class="visit-bar-fill" style="width: ${percent}%"></div>
          </div>
        </div>
        <div class="site-stats">
          <div class="visit-count">${t('visitsCount', site.visitCount)}</div>
          <div class="last-visit">${formatTime(site.lastVisitTime)}</div>
        </div>
        ${hasPages ? '<span class="expand-icon">▾</span>' : ''}
        <button type="button" class="delete-site-btn" data-root-domain="${(site.rootDomain || '').replace(/"/g, '&quot;')}" title="${t('deleteSiteHistory')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  }).join('');
  
  // 更新统计
  document.getElementById('total-sites').textContent = `${t('siteCount')}: ${sortedSites.length}`;
  document.getElementById('total-visits').textContent = `${t('visitCount')}: ${totalVisits}`;
  
  // 构建站点 urlList 映射（用于展开）
  const siteUrlMap = new Map();
  sortedSites.forEach(s => {
    if (s.urlList && s.urlList.length > 0) {
      siteUrlMap.set(s.rootDomain, s.urlList);
    }
  });
  
  // 删除按钮
  container.querySelectorAll('.delete-site-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const rootDomain = btn.dataset.rootDomain;
      const urlList = siteUrlMap.get(rootDomain);
      if (!urlList || !confirm(t('deleteSiteConfirm', rootDomain))) return;
      for (const p of urlList) {
        try {
          await chrome.history.deleteUrl({ url: p.url });
        } catch (_) {}
      }
      if (typeof window.loadHistory === 'function') window.loadHistory();
    });
  });
  
  // 点击：可展开项切换展开，不可展开项直接打开
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.page-item') || e.target.closest('.delete-site-btn')) return;
      const rootDomain = item.dataset.rootDomain;
      const urlList = siteUrlMap.get(rootDomain);
      if (urlList && urlList.length > 0) {
        item.classList.toggle('expanded');
        const expandIcon = item.querySelector('.expand-icon');
        if (expandIcon) expandIcon.textContent = item.classList.contains('expanded') ? '▴' : '▾';
        let panel = item.querySelector('.page-list');
        if (!panel) {
          panel = document.createElement('div');
          panel.className = 'page-list';
          const sortedPages = [...urlList].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
          const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          panel.innerHTML = sortedPages.map(p => {
            const title = (p.title || p.url).substring(0, 45) + ((p.title || p.url).length > 45 ? '...' : '');
            return `<div class="page-item" data-url="${esc(p.url)}">
              <span class="page-title" title="${esc(p.url)}">${esc(title)}</span>
              <span class="page-meta">${t('visitsCount', p.visitCount)} · ${formatTime(p.lastVisitTime)}</span>
            </div>`;
          }).join('');
          item.appendChild(panel);
          panel.querySelectorAll('.page-item').forEach(pEl => {
            pEl.addEventListener('click', (e) => {
              e.stopPropagation();
              chrome.tabs.create({ url: pEl.dataset.url });
            });
          });
        }
        if (expandIcon) expandIcon.textContent = item.classList.contains('expanded') ? '▴' : '▾';
      } else {
        chrome.tabs.create({ url: item.dataset.url });
      }
    });
  });
}

// 应用 i18n 到静态 HTML 元素
function applyI18n() {
  const locale = CURRENT_LOCALE === 'zh_CN' ? 'zh-CN' : 'en';
  document.documentElement.lang = locale;
  document.title = t('extName');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  const totalSites = document.getElementById('total-sites');
  const totalVisits = document.getElementById('total-visits');
  if (totalSites) totalSites.textContent = `${t('siteCount')}: 0`;
  if (totalVisits) totalVisits.textContent = `${t('visitCount')}: 0`;
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadI18nMessages();
  const { locale: storedLocale } = await new Promise(r => chrome.storage.local.get(['locale'], x => r(x)));
  const browserLang = chrome.i18n.getUILanguage?.() || navigator.language || '';
  CURRENT_LOCALE = resolveInitialLocale(browserLang, storedLocale);
  if (!storedLocale) {
    chrome.storage.local.set({ locale: CURRENT_LOCALE });
  }

  applyI18n();
  let currentView = 'history'; // 'history' | 'stats'
  let currentFilter = 'all';
  let currentSearch = '';
  let currentSort = 'time';
  let trendMode = 'day';
  let selectedDate = null;
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth();
  let cachedSites = [];
  let hourlyData = [];
  let cachedDailyTrend = [];
  let cachedWeeklyTrend = [];
  let cachedCategoryData = [];
  
  const historyView = document.getElementById('history-view');
  const statsView = document.getElementById('stats-view');
  const viewSwitchBtn = document.getElementById('view-switch-btn');
  const iconChart = viewSwitchBtn?.querySelector('.icon-chart');
  const iconHistory = viewSwitchBtn?.querySelector('.icon-history');
  
  const syncStatsFilterActive = () => {
    document.querySelectorAll('#stats-view .filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
  };
  const syncHistoryFilterActive = () => {
    document.querySelectorAll('#history-view .filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
  };
  
  // 加载数据
  const load = async () => {
    document.getElementById('history-list').innerHTML = `<div class="loading">${t('loading')}</div>`;
    if (currentView === 'stats') {
      const loadingHtml = `<div class="chart-empty">${t('loading')}</div>`;
      document.getElementById('trend-chart-bars').innerHTML = loadingHtml;
      document.getElementById('hour-chart-bars').innerHTML = loadingHtml;
      const catEl = document.getElementById('category-chart-bars');
      if (catEl) catEl.innerHTML = loadingHtml;
    }
    const blacklist = await new Promise(r => chrome.storage.local.get(['blacklist'], x => r(x.blacklist || [])));
    const { sites, hourDistribution, dailyTrend, weeklyTrend, categoryData } = await getHistoryStats(
      currentFilter, currentSearch, selectedDate, false, blacklist
    );
    cachedSites = sites;
    hourlyData = hourDistribution;
    cachedDailyTrend = dailyTrend;
    cachedWeeklyTrend = weeklyTrend;
    cachedCategoryData = categoryData || [];
    const renderCharts = currentView === 'stats';
    renderHistory(cachedSites, currentSort, hourDistribution, dailyTrend, weeklyTrend, trendMode, renderCharts, categoryData);
    if (currentView === 'stats') {
      syncStatsFilterActive();
      renderTrendChart(cachedDailyTrend, cachedWeeklyTrend, trendMode);
      renderHourChart(hourlyData);
    }
    updateDateBadge();
  };
  window.loadHistory = load;
  
  // 更新日期筛选角标
  function updateDateBadge() {
    const badge = document.getElementById('date-badge');
    if (selectedDate) {
      const d = new Date(selectedDate);
      badge.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      badge.classList.remove('hidden');
      badge.title = t('clearDateFilter');
    } else {
      badge.classList.add('hidden');
    }
  }
  
  await load();
  
  // 视图切换
  const scrollContainer = document.querySelector('.container');
  viewSwitchBtn?.addEventListener('click', async () => {
    currentView = currentView === 'history' ? 'stats' : 'history';
    historyView.classList.toggle('hidden', currentView !== 'history');
    statsView.classList.toggle('hidden', currentView !== 'stats');
    if (iconChart && iconHistory) {
      iconChart.classList.toggle('hidden', currentView !== 'history');
      iconHistory.classList.toggle('hidden', currentView !== 'stats');
    }
    viewSwitchBtn.title = currentView === 'history' ? t('switchToStats') : t('switchToHistory');
    scrollContainer?.scrollTo(0, 0);
    if (currentView === 'stats') {
      await load();
    } else {
      syncHistoryFilterActive();
    }
  });
  
  // 历史视图筛选按钮
  document.querySelectorAll('#history-view .filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#history-view .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      selectedDate = null;
      await load();
    });
  });
  
  // 统计视图筛选按钮
  document.querySelectorAll('#stats-view .filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#stats-view .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      selectedDate = null;
      await load();
    });
  });
  
  // 搜索框
  const searchInput = document.getElementById('search-input');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      currentSearch = e.target.value;
      await load();
    }, 300);
  });
  
  // 排序选项卡
  document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSort = tab.dataset.sort;
      renderHistory(cachedSites, currentSort, hourlyData, cachedDailyTrend, cachedWeeklyTrend, trendMode);
    });
  });
  
  // 趋势图切换
  document.querySelectorAll('.trend-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.trend-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      trendMode = tab.dataset.trend;
      renderTrendChart(cachedDailyTrend, cachedWeeklyTrend, trendMode);
    });
  });
  
  // 日期角标点击清除
  document.getElementById('date-badge').addEventListener('click', async () => {
    if (selectedDate) {
      selectedDate = null;
      currentFilter = 'all';
      document.querySelectorAll('#history-view .filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#history-view .filter-btn[data-filter="all"]').classList.add('active');
      await load();
    }
  });
  
  // 日历按钮
  const calendarBtn = document.getElementById('calendar-btn');
  const calendarOverlay = document.getElementById('calendar-overlay');
  
  calendarBtn.addEventListener('click', async () => {
    // 若已选日期，则定位到该日期所在月份
    if (selectedDate) {
      const d = new Date(selectedDate);
      calendarYear = d.getFullYear();
      calendarMonth = d.getMonth();
    } else {
      calendarYear = new Date().getFullYear();
      calendarMonth = new Date().getMonth();
    }
    const datesWithVisits = await getDatesWithVisits(calendarYear, calendarMonth);
    renderCalendar(calendarYear, calendarMonth, datesWithVisits);
    // 定位：日历左上角与图标右下角对齐（日历在图标右下方），若超出则左对齐
    const rect = calendarBtn.getBoundingClientRect();
    const popup = calendarOverlay.querySelector('.calendar-popup');
    const popupWidth = 280;
    let left = rect.right;
    if (left + popupWidth > document.documentElement.clientWidth) {
      left = Math.max(8, rect.left);
    }
    popup.style.left = left + 'px';
    popup.style.top = (rect.bottom + 6) + 'px';
    calendarOverlay.classList.remove('hidden');
  });
  
  // 日历关闭（点击遮罩）
  calendarOverlay.addEventListener('click', (e) => {
    if (e.target === calendarOverlay) calendarOverlay.classList.add('hidden');
  });
  
  // 日历上月/下月
  document.getElementById('calendar-prev').addEventListener('click', async (e) => {
    e.stopPropagation();
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    const datesWithVisits = await getDatesWithVisits(calendarYear, calendarMonth);
    renderCalendar(calendarYear, calendarMonth, datesWithVisits);
  });
  
  document.getElementById('calendar-next').addEventListener('click', async (e) => {
    e.stopPropagation();
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    const datesWithVisits = await getDatesWithVisits(calendarYear, calendarMonth);
    renderCalendar(calendarYear, calendarMonth, datesWithVisits);
  });
  
  // 设置/黑名单
  const settingsBtn = document.getElementById('settings-btn');
  const settingsOverlay = document.getElementById('settings-overlay');
  const blacklistInput = document.getElementById('blacklist-input');
  const blacklistAdd = document.getElementById('blacklist-add');
  const blacklistList = document.getElementById('blacklist-list');
  
  const renderBlacklist = async () => {
    const { blacklist } = await new Promise(r => chrome.storage.local.get(['blacklist'], x => r(x)));
    const list = blacklist || [];
    blacklistList.innerHTML = list.map((d, i) =>
      `<li><span>${(d || '').replace(/</g, '&lt;')}</span><button type="button" data-index="${i}">${t('remove')}</button></li>`
    ).join('');
    blacklistList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { blacklist: bl } = await new Promise(r => chrome.storage.local.get(['blacklist'], x => r(x)));
        bl.splice(Number(btn.dataset.index), 1);
        await new Promise(r => chrome.storage.local.set({ blacklist: bl }, r));
        renderBlacklist();
        load();
      });
    });
  };
  
  settingsBtn.addEventListener('click', async () => {
    await renderBlacklist();
    settingsOverlay.classList.remove('hidden');
  });
  
  document.getElementById('settings-close').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });
  
  blacklistAdd.addEventListener('click', async () => {
    const domain = blacklistInput.value.trim().toLowerCase();
    if (!domain) return;
    const { blacklist } = await new Promise(r => chrome.storage.local.get(['blacklist'], x => r(x)));
    const list = blacklist || [];
    if (!list.includes(domain)) {
      list.push(domain);
      await new Promise(r => chrome.storage.local.set({ blacklist: list }, r));
      blacklistInput.value = '';
      renderBlacklist();
      load();
    }
  });
  
  // CSV 导出
  document.getElementById('export-btn').addEventListener('click', () => {
    if (cachedSites.length === 0) return;
    const headers = t('csvHeaders').split(',');
    const rows = cachedSites.map(s => [
      s.title,
      s.domain,
      s.visitCount,
      s.pageCount || 1,
      formatFullDate(s.lastVisitTime),
      s.urlList?.length ? formatFullDate(Math.min(...s.urlList.map(p => p.lastVisitTime))) : formatFullDate(s.lastVisitTime)
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `${t('csvFilename')}_${new Date().toISOString().slice(0, 10)}.csv`;
    chrome.downloads.download({ url, filename, saveAs: true });
    URL.revokeObjectURL(url);
  });
  
  // 暗色模式（SVG 图标切换）
  const themeBtn = document.getElementById('theme-btn');
  const iconMoon = themeBtn?.querySelector('.icon-moon');
  const iconSun = themeBtn?.querySelector('.icon-sun');
  const updateThemeIcon = () => {
    const isDark = document.body.classList.contains('dark');
    if (iconMoon) iconMoon.classList.toggle('hidden', isDark);
    if (iconSun) iconSun.classList.toggle('hidden', !isDark);
  };
  chrome.storage.local.get(['darkMode'], (r) => {
    if (r.darkMode !== undefined) {
      if (r.darkMode) document.body.classList.add('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) document.body.classList.add('dark');
    }
    updateThemeIcon();
  });
  themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    updateThemeIcon();
    chrome.storage.local.set({ darkMode: isDark });
  });

  // 语言切换
  const langBtn = document.getElementById('lang-btn');
  langBtn?.addEventListener('click', async () => {
    CURRENT_LOCALE = CURRENT_LOCALE === 'zh_CN' ? 'en' : 'zh_CN';
    await new Promise(r => chrome.storage.local.set({ locale: CURRENT_LOCALE }, r));
    applyI18n();
    viewSwitchBtn.title = currentView === 'history' ? t('switchToStats') : t('switchToHistory');
    if (langBtn) langBtn.title = t('switchLanguage');
    updateDateBadge();
    renderHistory(cachedSites, currentSort, hourlyData, cachedDailyTrend, cachedWeeklyTrend, trendMode, currentView === 'stats', cachedCategoryData);
    if (currentView === 'stats') {
      renderTrendChart(cachedDailyTrend, cachedWeeklyTrend, trendMode);
      renderHourChart(hourlyData);
      renderCategoryChart(cachedCategoryData);
    }
    if (calendarYear !== undefined && calendarMonth !== undefined) {
      const datesWithVisits = await getDatesWithVisits(calendarYear, calendarMonth);
      renderCalendar(calendarYear, calendarMonth, datesWithVisits);
    }
  });

  // 回到顶部（container 滚动区域）：顶部时隐藏，向下滚动后显示
  const backToTopBtn = document.getElementById('back-to-top-btn');
  const SCROLL_THRESHOLD = 50;
  const updateBackToTopVisibility = () => {
    if (!backToTopBtn || !scrollContainer) return;
    const show = scrollContainer.scrollTop > SCROLL_THRESHOLD;
    backToTopBtn.classList.toggle('hidden', !show);
  };
  scrollContainer?.addEventListener('scroll', updateBackToTopVisibility);
  backToTopBtn?.addEventListener('click', () => {
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  // 日历日期点击
  document.getElementById('calendar-days').addEventListener('click', async (e) => {
    const day = e.target.closest('.calendar-day');
    if (!day || !day.dataset.ts) return;
    selectedDate = Number(day.dataset.ts);
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    calendarOverlay.classList.add('hidden');
    await load();
  });
});
