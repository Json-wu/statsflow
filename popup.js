/**
 * 开发模式：本地「加载已解压的扩展程序」通常无 update_url；线上商店版带更新地址。
 * 也可在 manifest 中设置 `"_statsflow_dev": true` 强制视为开发环境。
 */
function isStatsflowDevMode() {
  try {
    const m = chrome.runtime.getManifest();
    if (m._statsflow_dev === true) return true;
    return !m.update_url;
  } catch {
    return false;
  }
}

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
let I18N_MESSAGES = {};
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
  const { LOCALE_IDS } = window.StatsflowI18n;
  I18N_MESSAGES = {};
  try {
    await Promise.all(
      LOCALE_IDS.map(async (id) => {
        try {
          const res = await fetch(chrome.runtime.getURL(`_locales/${id}/messages.json`));
          I18N_MESSAGES[id] = await res.json();
        } catch {
          I18N_MESSAGES[id] = {};
        }
      })
    );
  } catch {
    LOCALE_IDS.forEach((id) => {
      I18N_MESSAGES[id] = {};
    });
  }
}

function getLocaleForDates() {
  return window.StatsflowI18n.localeIdToBcp47(CURRENT_LOCALE);
}

function resolveInitialLocale(browserLang, storedLocale) {
  return window.StatsflowI18n.resolveLocaleFromBrowser(browserLang || '', storedLocale);
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

// 格式化时间（浏览历史列表：月/日 时:分，无年、秒）
function formatTime(timestamp) {
  const d = new Date(timestamp);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${day} ${h}:${min}`;
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

const MS_HOUR = 3600000;
const MS_DAY = 86400000;
const MS_FIVE_MIN = 5 * 60 * 1000;

// 获取时间范围（与网页看板 dashboard-workspace 一致）
function getTimeRange(filter, selectedDate = null) {
  const now = Date.now();
  if (selectedDate) {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    const startTime = d.getTime();
    const endTime = startTime + MS_DAY;
    return { startTime, endTime };
  }
  switch (filter) {
    case 'hour':
      return { startTime: now - MS_HOUR };
    case 'today': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { startTime: today.getTime() };
    }
    case 'week':
      return { startTime: now - 7 * MS_DAY };
    case 'month':
      return { startTime: now - 30 * MS_DAY };
    case 'all':
    default:
      return { startTime: 0 };
  }
}

function dayKeyFromTime(ts) {
  const x = new Date(ts);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

function buildTrendHourlyDay(items, dayStart, dayEnd) {
  const buckets = new Array(24).fill(0);
  items.forEach((item) => {
    const t = item.lastVisitTime;
    if (t < dayStart || t >= dayEnd) return;
    buckets[new Date(t).getHours()] += item.visitCount || 1;
  });
  return buckets.map((count, h) => ({ label: String(h), count }));
}

function buildTrendFiveMin(items, nowMs, localeTag) {
  const windowStart = nowMs - MS_HOUR;
  const buckets = new Array(12).fill(0);
  items.forEach((item) => {
    const t = item.lastVisitTime;
    if (t < windowStart || t > nowMs) return;
    let idx = Math.floor((t - windowStart) / MS_FIVE_MIN);
    if (idx > 11) idx = 11;
    if (idx < 0) return;
    buckets[idx] += item.visitCount || 1;
  });
  return buckets.map((count, i) => {
    const segStart = windowStart + i * MS_FIVE_MIN;
    const label = new Date(segStart).toLocaleTimeString(localeTag || 'en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return { label, count };
  });
}

function buildTrendLastNDays(items, nowMs, nDays) {
  const buckets = new Array(nDays).fill(0).map(() => ({ label: '', count: 0 }));
  items.forEach((item) => {
    const daysAgo = Math.floor((nowMs - item.lastVisitTime) / MS_DAY);
    if (daysAgo >= 0 && daysAgo < nDays) buckets[nDays - 1 - daysAgo].count += item.visitCount || 1;
  });
  for (let i = 0; i < nDays; i++) {
    const d = new Date(nowMs - (nDays - 1 - i) * MS_DAY);
    buckets[i].label = `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return buckets;
}

function buildTrendAllDays(items) {
  const dayMap = new Map();
  items.forEach((item) => {
    const dk = dayKeyFromTime(item.lastVisitTime);
    dayMap.set(dk, (dayMap.get(dk) || 0) + (item.visitCount || 1));
  });
  const keys = [...dayMap.keys()].sort((a, b) => {
    const pa = a.split('-').map(Number);
    const pb = b.split('-').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
  });
  return keys.map((k) => {
    const parts = k.split('-').map(Number);
    return { label: `${parts[1] + 1}/${parts[2]}`, count: dayMap.get(k) };
  });
}

function buildHourOfDayAggregate(items) {
  const h = new Array(24).fill(0);
  items.forEach((item) => {
    h[new Date(item.lastVisitTime).getHours()] += item.visitCount || 1;
  });
  return h;
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

      const nowMs = Date.now();
      const tag = getLocaleForDates();
      let trendSeries;
      let hourDistribution;

      if (selectedDate) {
        const d0 = new Date(selectedDate);
        d0.setHours(0, 0, 0, 0);
        const ds = d0.getTime();
        const de = ds + MS_DAY;
        trendSeries = buildTrendHourlyDay(filteredItems, ds, de);
        hourDistribution = trendSeries.map((x) => x.count);
      } else {
        switch (filter) {
          case 'hour':
            trendSeries = buildTrendFiveMin(filteredItems, nowMs, tag);
            hourDistribution = trendSeries.map((x) => x.count);
            break;
          case 'today': {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const ds = today.getTime();
            const de = ds + MS_DAY;
            trendSeries = buildTrendHourlyDay(filteredItems, ds, de);
            hourDistribution = trendSeries.map((x) => x.count);
            break;
          }
          case 'week':
            trendSeries = buildTrendLastNDays(filteredItems, nowMs, 7);
            hourDistribution = buildHourOfDayAggregate(filteredItems);
            break;
          case 'month':
            trendSeries = buildTrendLastNDays(filteredItems, nowMs, 30);
            hourDistribution = buildHourOfDayAggregate(filteredItems);
            break;
          case 'all':
          default:
            trendSeries = buildTrendAllDays(filteredItems);
            hourDistribution = buildHourOfDayAggregate(filteredItems);
            break;
        }
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

      resolve({ sites, hourDistribution, trendSeries, categoryData });
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

// 渲染访问趋势图（与网页看板 dash-ws 一致：单一序列，随筛选变化）
function renderTrendChart(trendSeries) {
  const container = document.getElementById('trend-chart');
  const barsEl = document.getElementById('trend-chart-bars');
  if (!container || !barsEl) return;
  const data = Array.isArray(trendSeries) ? trendSeries : [];
  const escAttr = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  const total = data.reduce((a, b) => a + b.count, 0);
  const max = Math.max(...data.map((d) => d.count), 1);

  if (total === 0 || data.length === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('trendChartEmpty')}</small></div>`;
  } else {
    const barHeightPx = 60;
    barsEl.innerHTML = data
      .map((d) => {
        const h = Math.max(2, (d.count / max) * barHeightPx);
        const tip = `${d.label}: ${t('visitsCount', d.count)}`;
        return `<div class="trend-bar-wrap" title="${escAttr(tip)}">
        <div class="trend-bar" style="height: ${h}px"></div>
        <span class="trend-label">${escAttr(d.label)}</span>
      </div>`;
      })
      .join('');
  }
  container.classList.remove('hidden');
}

/** 将多点转为平滑三次贝塞尔路径（Cardinal / Catmull-Rom 近似） */
function smoothLinePathThroughPoints(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i > 0 ? i - 1 : i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// 渲染访问时段分布（与网页看板一致：与 trend 维度对齐，支持 12/24 等点数）
function renderHourChart(hourDistribution, cachedTrendSeries) {
  const container = document.getElementById('hour-chart');
  const barsEl = document.getElementById('hour-chart-bars');
  if (!container || !barsEl) return;
  const n = hourDistribution.length;
  if (n === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('hourChartEmpty')}</small></div>`;
    container.classList.remove('hidden');
    return;
  }
  const total = hourDistribution.reduce((a, b) => a + b, 0);
  const max = Math.max(...hourDistribution, 1);

  if (total === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('hourChartEmpty')}</small></div>`;
  } else {
    const W = 480;
    const H = 112;
    const padL = 10;
    const padR = 10;
    const padT = 8;
    const padB = 22;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const baseline = padT + innerH;
    const denom = Math.max(1, n - 1);
    const pts = hourDistribution.map((count, i) => ({
      x: padL + (i / denom) * innerW,
      y: padT + innerH * (1 - count / max)
    }));
    const lineD = smoothLinePathThroughPoints(pts);
    const areaD =
      n === 1
        ? `M ${pts[0].x} ${baseline} L ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${baseline} Z`
        : `${lineD} L ${pts[n - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
    const escAttr = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    const xAt = (i) => padL + (i / denom) * innerW;
    const trendLabels =
      Array.isArray(cachedTrendSeries) && cachedTrendSeries.length === n
        ? cachedTrendSeries.map((d) => d.label)
        : null;
    const hits = hourDistribution
      .map((count, i) => {
        const left = i === 0 ? padL : (xAt(i - 1) + xAt(i)) / 2;
        const right = i === n - 1 ? padL + innerW : (xAt(i) + xAt(i + 1)) / 2;
        const w = Math.max(1, right - left);
        let tip;
        if (n === 12) {
          const timeLbl = trendLabels ? trendLabels[i] : t('dashFiveMinSegment', i + 1);
          tip = `${timeLbl} — ${t('visitsCount', count)}`;
        } else if (n === 24) tip = `${i}:00 — ${t('visitsCount', count)}`;
        else tip = t('visitsCount', count);
        return `<rect class="hour-hit-rect" x="${left}" y="0" width="${w}" height="${H}" fill="transparent"><title>${escAttr(tip)}</title></rect>`;
      })
      .join('');
    let tickIdx;
    if (n === 24) tickIdx = [0, 4, 8, 12, 16, 20, 23];
    else if (n === 12) tickIdx = [0, 3, 6, 9, 11];
    else tickIdx = [0, Math.floor(denom / 2), n - 1];
    const labels = tickIdx
      .filter((i) => i >= 0 && i < n)
      .map((i) => {
        const x = xAt(i);
        let lbl;
        if (n === 12 && trendLabels) lbl = trendLabels[i];
        else if (n === 12) lbl = String(i + 1);
        else lbl = String(i);
        return `<text class="hour-axis-label" x="${x}" y="${H - 4}" text-anchor="middle">${escAttr(lbl)}</text>`;
      })
      .join('');
    barsEl.innerHTML = `
      <svg class="hour-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="hourChartAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop class="hour-chart-grad-stop0" offset="0%"/>
            <stop class="hour-chart-grad-stop1" offset="100%"/>
          </linearGradient>
        </defs>
        <path class="hour-area-path" d="${areaD}" fill="url(#hourChartAreaFill)"/>
        <path class="hour-line-path" d="${lineD}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${hits}
        ${labels}
      </svg>`;
  }
  container.classList.remove('hidden');
}

const CATEGORY_PIE_COLORS = [
  '#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#ff6d00', '#9334e6',
  '#00acc1', '#7cb342', '#e91e63', '#5c6bc0', '#ef6c00', '#9c27b0'
];

function bindCategoryPieHover(wrap) {
  if (!wrap) return;
  const segs = () => wrap.querySelectorAll('.category-pie-seg');
  const legs = () => wrap.querySelectorAll('.category-pie-legend-item');
  const apply = (idx) => {
    segs().forEach((el) => {
      const i = Number(el.getAttribute('data-pie-index'));
      el.classList.toggle('is-pie-active', i === idx);
    });
    legs().forEach((el) => {
      const i = Number(el.getAttribute('data-pie-index'));
      el.classList.toggle('is-pie-active', i === idx);
    });
  };
  const clear = () => {
    segs().forEach((el) => el.classList.remove('is-pie-active'));
    legs().forEach((el) => el.classList.remove('is-pie-active'));
  };
  wrap.addEventListener('mouseover', (e) => {
    const seg = e.target.closest('.category-pie-seg');
    const leg = e.target.closest('.category-pie-legend-item');
    const node = seg || leg;
    if (node && wrap.contains(node)) {
      apply(Number(node.getAttribute('data-pie-index')));
    }
  });
  wrap.addEventListener('mouseleave', () => {
    clear();
  });
}

function renderCategoryChart(categoryData) {
  const container = document.getElementById('category-chart');
  const barsEl = document.getElementById('category-chart-bars');
  if (!container || !barsEl) return;
  const data = Array.isArray(categoryData) ? categoryData : [];
  const total = data.reduce((a, b) => a + b.count, 0);
  const cx = 50;
  const cy = 50;
  const r = 40;

  const polar = (rad) => [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  const escAttr = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  const escHtml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const formatPct = (f) => (f * 100).toFixed(1);

  if (total === 0 || data.length === 0) {
    barsEl.innerHTML = `<div class="chart-empty">${t('noData')}<br><small>${t('categoryChartEmpty')}</small></div>`;
  } else if (data.length === 1) {
    const d = data[0];
    const name = t(d.name);
    const pct = formatPct(1);
    const color = CATEGORY_PIE_COLORS[0];
    const title = `${name}: ${t('visitsCount', d.count)} (${pct}%)`;
    barsEl.innerHTML = `
      <div class="category-pie-wrap">
        <svg class="category-pie-svg" viewBox="0 0 100 100" aria-hidden="true">
          <g class="category-pie-seg" data-pie-index="0">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>
          </g>
        </svg>
        <ul class="category-pie-legend">
          <li class="category-pie-legend-item" data-pie-index="0" title="${escAttr(title)}">
            <span class="category-pie-legend-swatch" style="background:${color}"></span>
            <span class="category-pie-legend-name">${escHtml(name)}</span>
            <span class="category-pie-legend-pct">${pct}%</span>
            <span class="category-pie-legend-count">${d.count}</span>
          </li>
        </ul>
      </div>`;
  } else {
    let acc = -Math.PI / 2;
    const paths = [];
    const legendItems = [];
    data.forEach((d, i) => {
      const frac = d.count / total;
      const slice = frac * 2 * Math.PI;
      const name = t(d.name);
      const pct = formatPct(frac);
      const color = CATEGORY_PIE_COLORS[i % CATEGORY_PIE_COLORS.length];
      const title = `${name}: ${t('visitsCount', d.count)} (${pct}%)`;
      if (slice >= 2 * Math.PI - 1e-6) {
        paths.push(
          `<g class="category-pie-seg" data-pie-index="${i}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/></g>`
        );
      } else {
        const start = acc;
        const end = acc + slice;
        const [x1, y1] = polar(start);
        const [x2, y2] = polar(end);
        const large = slice > Math.PI ? 1 : 0;
        paths.push(
          `<g class="category-pie-seg" data-pie-index="${i}"><path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}"/></g>`
        );
        acc = end;
      }
      legendItems.push(
        `<li class="category-pie-legend-item" data-pie-index="${i}" title="${escAttr(title)}">
          <span class="category-pie-legend-swatch" style="background:${color}"></span>
          <span class="category-pie-legend-name">${escHtml(name)}</span>
          <span class="category-pie-legend-pct">${pct}%</span>
          <span class="category-pie-legend-count">${d.count}</span>
        </li>`
      );
    });
    barsEl.innerHTML = `
      <div class="category-pie-wrap">
        <svg class="category-pie-svg" viewBox="0 0 100 100" aria-label="${escAttr(t('categoryChartTitle'))}">
          ${paths.join('')}
        </svg>
        <ul class="category-pie-legend">${legendItems.join('')}</ul>
      </div>`;
  }
  if (total > 0 && data.length > 0) {
    const wrap = barsEl.querySelector('.category-pie-wrap');
    if (wrap) bindCategoryPieHover(wrap);
  }
  container.classList.remove('hidden');
}

// 渲染历史列表（仅在历史视图显示，不渲染图表）
function renderHistory(sites, sortBy = 'time', hourDistribution = null, trendSeries = null, renderCharts = false, categoryData = null) {
  const container = document.getElementById('history-list');
  const sortedSites = sortSites(sites, sortBy);
  if (renderCharts && Array.isArray(hourDistribution)) {
    renderHourChart(hourDistribution, Array.isArray(trendSeries) ? trendSeries : []);
  }
  if (renderCharts && Array.isArray(trendSeries)) renderTrendChart(trendSeries);
  if (renderCharts && categoryData) renderCategoryChart(categoryData);
  
  if (sortedSites.length === 0) {
    container.innerHTML = `<div class="no-results">${t('noData')}</div>`;
    document.getElementById('total-sites').textContent = `${t('siteCount')}: 0`;
    document.getElementById('total-visits').textContent = `${t('visitCount')}: 0`;
    return;
  }
  
  const totalVisits = sortedSites.reduce((sum, site) => sum + site.visitCount, 0);
  const escH = (s) =>
    String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escA = (s) =>
    String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

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
          <div class="site-domain">
            <span class="site-domain-host" title="${escA(site.domain)}">${escH(site.domain)}</span>
            <span class="site-domain-meta"> · ${t('pages', site.pageCount || 1)}</span>
          </div>
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
      if (!urlList) return;
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
        const wasExpanded = item.classList.contains('expanded');
        item.classList.toggle('expanded');
        const nowExpanded = item.classList.contains('expanded');
        if (nowExpanded && !wasExpanded) {
          container.querySelectorAll('.history-item.expanded').forEach((other) => {
            if (other === item) return;
            other.classList.remove('expanded');
            const oIcon = other.querySelector('.expand-icon');
            if (oIcon) oIcon.textContent = '▾';
          });
        }
        const expandIcon = item.querySelector('.expand-icon');
        if (expandIcon) expandIcon.textContent = nowExpanded ? '▴' : '▾';
        let panel = item.querySelector('.page-list');
        if (!panel) {
          panel = document.createElement('div');
          panel.className = 'page-list';
          const sortedPages = [...urlList].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
          const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          panel.innerHTML = sortedPages.map(p => {
            const label = p.title || p.url;
            return `<div class="page-item" data-url="${esc(p.url)}">
              <span class="page-title" title="${esc(label)}">${esc(label)}</span>
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
      } else {
        chrome.tabs.create({ url: item.dataset.url });
      }
    });
  });
}

// 主题按钮提示：随当前主题切换为「去暗色」/「去浅色」文案
function syncThemeToggleI18n() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const isDark = document.body.classList.contains('dark');
  const msg = t(isDark ? 'toggleLightMode' : 'toggleDarkMode');
  btn.title = msg;
  btn.setAttribute('aria-label', msg);
}

// 应用 i18n 到静态 HTML 元素
function applyI18n() {
  document.documentElement.lang = window.StatsflowI18n.localeIdToBcp47(CURRENT_LOCALE);
  document.documentElement.dir = CURRENT_LOCALE === 'ar' ? 'rtl' : 'ltr';
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
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));
  });
  const totalSites = document.getElementById('total-sites');
  const totalVisits = document.getElementById('total-visits');
  if (totalSites) totalSites.textContent = `${t('siteCount')}: 0`;
  if (totalVisits) totalVisits.textContent = `${t('visitCount')}: 0`;
  syncThemeToggleI18n();
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  const statsflowPopupEmbed = new URLSearchParams(location.search).get('embed') === '1';
  if (statsflowPopupEmbed) {
    document.documentElement.classList.add('statsflow-popup-embed');
    document.body.classList.add('statsflow-popup-embed');
  }

  await loadI18nMessages();
  const { locale: storedLocale } = await new Promise(r => chrome.storage.local.get(['locale'], x => r(x)));
  const browserLang = chrome.i18n.getUILanguage?.() || navigator.language || '';
  CURRENT_LOCALE = resolveInitialLocale(browserLang, storedLocale);
  if (!storedLocale) {
    chrome.storage.local.set({ locale: CURRENT_LOCALE });
  }

  applyI18n();

  const statsflowDevMode = isStatsflowDevMode();
  document.querySelector('.lang-menu-wrap')?.classList.toggle('hidden', !statsflowDevMode && !statsflowPopupEmbed);

  let currentView = 'history'; // 'history' | 'stats'
  let currentFilter = 'today';
  let currentSearch = '';
  let currentSort = 'time';
  let selectedDate = null;
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth();
  let cachedSites = [];
  let hourlyData = [];
  let cachedTrendSeries = [];
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

  const syncLangMenuActive = () => {
    const menu = document.getElementById('lang-menu');
    if (!menu) return;
    menu.querySelectorAll('.lang-menu-item').forEach((btn) => {
      btn.classList.toggle('is-current', btn.getAttribute('data-locale') === CURRENT_LOCALE);
    });
  };

  const closeLangMenu = () => {
    const lm = document.getElementById('lang-menu');
    const lb = document.getElementById('lang-btn');
    lm?.classList.add('hidden');
    lb?.setAttribute('aria-expanded', 'false');
  };

  function updateStatsChartTitles() {
    const trendEl = document.getElementById('stats-trend-title');
    const hourEl = document.getElementById('stats-hour-title');
    if (selectedDate) {
      if (trendEl) trendEl.textContent = t('dashTrendTitlePickDay');
      if (hourEl) hourEl.textContent = t('hourChartTitle');
      return;
    }
    const trendByFilter = {
      all: 'dashTrendTitleAll',
      hour: 'dashTrendTitleHour',
      today: 'dashTrendTitleToday',
      week: 'dashTrendTitleWeek',
      month: 'dashTrendTitleMonth'
    };
    if (trendEl) trendEl.textContent = t(trendByFilter[currentFilter] || 'dashTrendTitleToday');
    if (hourEl) {
      hourEl.textContent = t(currentFilter === 'hour' ? 'dashTrendTitleHour' : 'hourChartTitle');
    }
  }

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
    const { sites, hourDistribution, trendSeries, categoryData } = await getHistoryStats(
      currentFilter, currentSearch, selectedDate, false, blacklist
    );
    cachedSites = sites;
    hourlyData = hourDistribution;
    cachedTrendSeries = trendSeries || [];
    cachedCategoryData = categoryData || [];
    const renderCharts = currentView === 'stats';
    renderHistory(cachedSites, currentSort, hourDistribution, cachedTrendSeries, renderCharts, categoryData);
    if (currentView === 'stats') {
      if (!selectedDate) syncStatsFilterActive();
      updateStatsChartTitles();
    }
    updateDateBadge();
    if (!selectedDate) syncHistoryFilterActive();
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
  syncLangMenuActive();

  async function applyLocaleChange(newLocale) {
    closeLangMenu();
    if (!window.StatsflowI18n.isSupportedLocale(newLocale)) return;
    if (newLocale === CURRENT_LOCALE) return;
    CURRENT_LOCALE = newLocale;
    await new Promise((r) => chrome.storage.local.set({ locale: CURRENT_LOCALE }, r));
    applyI18n();
    syncLangMenuActive();
    viewSwitchBtn.title = currentView === 'history' ? t('switchToStats') : t('switchToHistory');
    await load();
    if (calendarYear !== undefined && calendarMonth !== undefined) {
      const datesWithVisits = await getDatesWithVisits(calendarYear, calendarMonth);
      renderCalendar(calendarYear, calendarMonth, datesWithVisits);
    }
  }
  
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
      renderHistory(cachedSites, currentSort, hourlyData, cachedTrendSeries, false, cachedCategoryData);
    });
  });
  
  // 日期角标点击清除
  document.getElementById('date-badge').addEventListener('click', async () => {
    if (selectedDate) {
      selectedDate = null;
      currentFilter = 'today';
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
  const blacklistSuggestionsEl = document.getElementById('blacklist-suggestions');
  let blacklistSuggestionsTimer = null;

  const escapeAttrDom = (s) =>
    String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const hideBlacklistSuggestions = () => {
    if (!blacklistSuggestionsEl) return;
    blacklistSuggestionsEl.classList.add('hidden');
    blacklistSuggestionsEl.innerHTML = '';
  };

  const updateBlacklistSuggestions = () => {
    if (!blacklistSuggestionsEl || !blacklistInput) return;
    const q = blacklistInput.value.trim().toLowerCase();
    if (!q) {
      hideBlacklistSuggestions();
      return;
    }
    const matches = [];
    const seen = new Set();
    for (const s of cachedSites) {
      const rd = (s.rootDomain || '').toLowerCase();
      const dom = (s.domain || '').toLowerCase();
      if (!rd) continue;
      if (rd.includes(q) || dom.includes(q)) {
        if (!seen.has(rd)) {
          seen.add(rd);
          matches.push(rd);
          if (matches.length >= 20) break;
        }
      }
    }
    if (matches.length === 0) {
      hideBlacklistSuggestions();
      return;
    }
    blacklistSuggestionsEl.innerHTML = matches
      .map(
        (rd) =>
          `<button type="button" class="blacklist-suggestion-item" data-domain="${escapeAttrDom(rd)}">${escapeAttrDom(rd)}</button>`
      )
      .join('');
    blacklistSuggestionsEl.classList.remove('hidden');
  };

  blacklistInput.addEventListener('input', () => {
    clearTimeout(blacklistSuggestionsTimer);
    blacklistSuggestionsTimer = setTimeout(updateBlacklistSuggestions, 120);
  });

  blacklistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideBlacklistSuggestions();
  });

  if (blacklistSuggestionsEl) {
    blacklistSuggestionsEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.blacklist-suggestion-item')) e.preventDefault();
    });
    blacklistSuggestionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.blacklist-suggestion-item');
      if (!btn) return;
      blacklistInput.value = (btn.dataset.domain || '').toLowerCase();
      hideBlacklistSuggestions();
      blacklistInput.focus();
    });
  }

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
    hideBlacklistSuggestions();
    settingsOverlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => blacklistInput.focus());
    });
  });

  document.getElementById('settings-close').addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
    hideBlacklistSuggestions();
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
      settingsOverlay.classList.add('hidden');
      hideBlacklistSuggestions();
    }
  });
  
  blacklistAdd.addEventListener('click', async () => {
    const domain = blacklistInput.value.trim().toLowerCase();
    if (!domain) return;
    const { blacklist } = await new Promise(r => chrome.storage.local.get(['blacklist'], x => r(x)));
    const list = blacklist || [];
    if (!list.includes(domain)) {
      list.push(domain);
      await new Promise(r => chrome.storage.local.set({ blacklist: list }, r));
      blacklistInput.value = '';
      hideBlacklistSuggestions();
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
    chrome.downloads.download({ url, filename, saveAs: false });
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
    syncThemeToggleI18n();
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

  // 语言菜单（仅开发模式）、GitHub、扩展说明页
  if (statsflowDevMode) {
    const langBtn = document.getElementById('lang-btn');
    const langMenu = document.getElementById('lang-menu');
    langBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = langMenu?.classList.toggle('hidden') === false;
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', () => {
      closeLangMenu();
    });
    langMenu?.querySelectorAll('.lang-menu-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const loc = btn.getAttribute('data-locale');
        if (loc) applyLocaleChange(loc);
      });
    });
  }
  document.getElementById('github-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/Json-wu/statsflow' });
  });
  document.getElementById('extension-page-btn')?.addEventListener('click', () => {
    if (statsflowPopupEmbed) return;
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.locale) {
      const v = changes.locale.newValue;
      if (window.StatsflowI18n.isSupportedLocale(v) && v !== CURRENT_LOCALE) {
        void applyLocaleChange(v);
      }
    }
    if (changes.darkMode) {
      const d = changes.darkMode.newValue;
      if (d === true) document.body.classList.add('dark');
      else if (d === false) document.body.classList.remove('dark');
      else {
        document.body.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
      updateThemeIcon();
    }
    if (changes.blacklist) {
      void load();
      void renderBlacklist();
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
