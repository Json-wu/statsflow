/**
 * 看板首页：左侧域名列表（分页）+ 右侧图表同屏展示；逻辑独立，不依赖 popup 页面。
 */
(function () {
  'use strict';

  const ALLOWED_PAGE_SIZES = [10, 20, 50, 100];

  function buildPageList(totalPages, current) {
    if (totalPages <= 1) return totalPages === 1 ? [1] : [];
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set([1, totalPages, current, current - 1, current + 1, current - 2, current + 2]);
    const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) out.push('…');
      out.push(p);
      prev = p;
    }
    return out;
  }

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

  const CATEGORY_PIE_COLORS = [
    '#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#ff6d00', '#9334e6',
    '#00acc1', '#7cb342', '#e91e63', '#5c6bc0', '#ef6c00', '#9c27b0'
  ];

  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function getRootDomain(url) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.hostname.split('.');
      if (parts.length >= 2) return parts.slice(-2).join('.');
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  function getSiteCategory(rootDomain) {
    const domain = (rootDomain || '').toLowerCase();
    for (const { pattern, category } of DOMAIN_CATEGORY_MAP) {
      if (pattern.test(domain)) return category;
    }
    return 'category_other';
  }

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

  const MS_HOUR = 3600000;
  const MS_DAY = 86400000;
  const MS_FIVE_MIN = 5 * 60 * 1000;

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

  function dayKeyFromTime(t) {
    const x = new Date(t);
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
      const ts = windowStart + i * MS_FIVE_MIN;
      const label = new Date(ts).toLocaleTimeString(localeTag || 'en', {
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

  function isInSelectedDay(timestamp, selectedDate) {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 86400000;
    return timestamp >= start && timestamp < end;
  }

  function matchRegex(text, pattern) {
    try {
      return new RegExp(pattern, 'i').test(text || '');
    } catch {
      return false;
    }
  }

  async function getHistoryStats(filter, searchTerm, selectedDate, useRegex, blacklist, localeTag) {
    const timeRange = getTimeRange(filter, selectedDate);
    const apiSearchText = useRegex ? '' : searchTerm;
    const tag = localeTag || 'en';
    return new Promise((resolve) => {
      chrome.history.search({ text: apiSearchText, maxResults: 10000, ...timeRange }, (items) => {
        items = items || [];
        let filteredItems = items;
        if (selectedDate) {
          filteredItems = items.filter((item) => isInSelectedDay(item.lastVisitTime, selectedDate));
        }
        if (useRegex && searchTerm) {
          filteredItems = filteredItems.filter(
            (item) =>
              matchRegex(item.title, searchTerm) ||
              matchRegex(item.url, searchTerm) ||
              matchRegex(getDomain(item.url), searchTerm)
          );
        }
        if (blacklist.length > 0) {
          const blSet = new Set(blacklist.map((d) => d.toLowerCase().trim()));
          filteredItems = filteredItems.filter((item) => !blSet.has(getRootDomain(item.url).toLowerCase()));
        }

        const siteMap = new Map();
        filteredItems.forEach((item) => {
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
              domain,
              rootDomain,
              title: item.title || domain,
              url: item.url,
              visitCount: item.visitCount || 1,
              lastVisitTime: item.lastVisitTime || Date.now(),
              favicon: getFaviconUrl(item.url),
              urlList: [
                {
                  url: item.url,
                  title: item.title || domain,
                  visitCount: item.visitCount || 1,
                  lastVisitTime: item.lastVisitTime
                }
              ]
            });
          }
        });

        const sites = Array.from(siteMap.values()).map((site) => ({
          ...site,
          pageCount: site.urlList.length
        }));

        const nowMs = Date.now();
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

        const categoryDistribution = {};
        sites.forEach((site) => {
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

  async function getDatesWithVisits(year, month) {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    return new Promise((resolve) => {
      chrome.history.search({ text: '', maxResults: 10000, startTime: start, endTime: end }, (items) => {
        const dates = new Set();
        (items || []).forEach((item) => {
          const d = new Date(item.lastVisitTime);
          dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        });
        resolve(dates);
      });
    });
  }

  function sortSites(sites, sortBy) {
    const sorted = [...sites];
    if (sortBy === 'visits') sorted.sort((a, b) => b.visitCount - a.visitCount);
    else sorted.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    return sorted;
  }

  function smoothLinePathThroughPoints(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
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

  function bindCategoryPieHover(wrap) {
    if (!wrap) return;
    const segs = () => wrap.querySelectorAll('.dash-ws-pie-seg');
    const legs = () => wrap.querySelectorAll('.dash-ws-pie-legend-item');
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
      const seg = e.target.closest('.dash-ws-pie-seg');
      const leg = e.target.closest('.dash-ws-pie-legend-item');
      const node = seg || leg;
      if (node && wrap.contains(node)) apply(Number(node.getAttribute('data-pie-index')));
    });
    wrap.addEventListener('mouseleave', clear);
  }

  function chartExportFileDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadImageDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('chart image load failed'));
      img.src = dataUrl;
    });
  }

  function downloadPngBlob(blob, filename) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename, saveAs: false }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          URL.revokeObjectURL(url);
          reject(err);
          return;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        resolve();
      });
    });
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  /** 趋势图为整块 sheet section；分栏内图表为单个 .dash-ws-split-cell */
  function getChartExportSection(chartHostEl) {
    if (!chartHostEl) return null;
    return chartHostEl.closest('.dash-ws-split-cell') || chartHostEl.closest('.dash-ws-block.dash-ws-sheet');
  }

  function drawExportedChartTitle(ctx, headEl, sr) {
    if (!headEl || !sr) return;
    const text = headEl.textContent?.trim();
    if (!text) return;
    const hr = headEl.getBoundingClientRect();
    const cs = getComputedStyle(headEl);
    ctx.save();
    ctx.fillStyle = cs.color;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tx = hr.left - sr.left;
    const ty = hr.top - sr.top + hr.height / 2;
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  function inlineSvgComputedStyles(origSvg, cloneSvg) {
    const origList = [origSvg, ...origSvg.querySelectorAll('*')];
    const cloneList = [cloneSvg, ...cloneSvg.querySelectorAll('*')];
    for (let i = 0; i < cloneList.length; i++) {
      const c = cloneList[i];
      const o = origList[i];
      if (!o || !(o instanceof Element)) continue;
      const tag = c.tagName.toLowerCase();
      const cs = getComputedStyle(o);
      if (tag === 'stop') {
        c.setAttribute('stop-color', cs.stopColor);
        const so = cs.stopOpacity;
        c.setAttribute('stop-opacity', so === '' || so == null ? '1' : String(so));
        c.removeAttribute('class');
      } else if (tag === 'path' || tag === 'circle') {
        const fill = cs.fill;
        if (fill && fill !== 'none' && !fill.startsWith('url(')) c.setAttribute('fill', fill);
        const stroke = cs.stroke;
        if (stroke && stroke !== 'none') {
          c.setAttribute('stroke', stroke);
          const sw = cs.strokeWidth;
          if (sw) c.setAttribute('stroke-width', sw);
        }
        c.removeAttribute('class');
      } else if (tag === 'text') {
        c.setAttribute('fill', cs.fill);
        c.removeAttribute('class');
      }
    }
    cloneSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  async function rasterizeSvgToCanvas(svgEl) {
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('.dash-ws-hour-hit').forEach((r) => {
      r.setAttribute('fill', 'none');
      r.removeAttribute('class');
    });
    inlineSvgComputedStyles(svgEl, clone);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const svgText = new XMLSerializer().serializeToString(clone);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const img = await loadImageDataUrl(dataUrl);
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  async function exportTrendBarsPng(barsEl) {
    const wraps = [...barsEl.querySelectorAll('.dash-ws-trend-bar-wrap')];
    if (!wraps.length) return;
    const section = getChartExportSection(barsEl);
    if (!section) return;
    const sr = section.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(sr.width));
    const h = Math.max(1, Math.ceil(sr.height));
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = getComputedStyle(section).backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    drawExportedChartTitle(ctx, section.querySelector('.dash-ws-chart-head'), sr);

    const bar0 = wraps[0].querySelector('.dash-ws-trend-bar');
    const bi = bar0 ? getComputedStyle(bar0).backgroundImage : '';
    let g0 = '#1a73e8';
    let g1 = '#ea4335';
    const gm = bi.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/gi);
    if (gm && gm.length >= 2) {
      g0 = gm[0];
      g1 = gm[gm.length - 1];
    }

    const radius = 8;
    wraps.forEach((wrap) => {
      const br = wrap.querySelector('.dash-ws-trend-bar');
      const lb = wrap.querySelector('.dash-ws-trend-label');
      if (!br) return;
      const brR = br.getBoundingClientRect();
      const bx = brR.left - sr.left;
      const by = brR.top - sr.top;
      const bw = brR.width;
      const bheight = brR.height;
      const grad = ctx.createLinearGradient(bx, by, bx, by + bheight);
      grad.addColorStop(0, g0);
      grad.addColorStop(1, g1);
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bx, by, bw, bheight, [radius, radius, 0, 0]);
      } else {
        ctx.rect(bx, by, bw, bheight);
      }
      ctx.fill();
      if (lb) {
        const lbR = lb.getBoundingClientRect();
        ctx.save();
        ctx.fillStyle = getComputedStyle(lb).color;
        const fs = getComputedStyle(lb).fontSize;
        const ff = getComputedStyle(lb).fontFamily;
        ctx.font = `${fs} ${ff}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = lbR.left - sr.left + lbR.width / 2;
        const ty = lbR.top - sr.top + lbR.height / 2;
        ctx.fillText(lb.textContent?.trim() || '', tx, ty);
        ctx.restore();
      }
    });

    const blob = await canvasToPngBlob(canvas);
    if (blob) await downloadPngBlob(blob, `statsflow-trend-${chartExportFileDate()}.png`);
  }

  async function exportHourChartPng(svgEl, barsHost) {
    const section = getChartExportSection(barsHost);
    if (!section || !svgEl) return;
    const sr = section.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(sr.width));
    const h = Math.max(1, Math.ceil(sr.height));
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = getComputedStyle(section).backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    drawExportedChartTitle(ctx, section.querySelector('.dash-ws-chart-head'), sr);

    const svgCanvas = await rasterizeSvgToCanvas(svgEl);
    const svgR = svgEl.getBoundingClientRect();
    ctx.drawImage(svgCanvas, 0, 0, svgCanvas.width, svgCanvas.height, svgR.left - sr.left, svgR.top - sr.top, svgR.width, svgR.height);

    const blob = await canvasToPngBlob(canvas);
    if (blob) await downloadPngBlob(blob, `statsflow-hour-${chartExportFileDate()}.png`);
  }

  async function exportCategoryPng(barsEl) {
    const wrap = barsEl.querySelector('.dash-ws-pie-wrap');
    const svg = barsEl.querySelector('.dash-ws-pie-svg');
    if (!wrap || !svg) return;
    const section = getChartExportSection(barsEl);
    if (!section) return;
    const sr = section.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(sr.width));
    const h = Math.max(1, Math.ceil(sr.height));
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = getComputedStyle(section).backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    drawExportedChartTitle(ctx, section.querySelector('.dash-ws-chart-head'), sr);

    const pieClone = svg.cloneNode(true);
    pieClone.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'));
    pieClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const srect = svg.getBoundingClientRect();
    const sw = Math.max(1, Math.ceil(srect.width));
    const sh = Math.max(1, Math.ceil(srect.height));
    pieClone.setAttribute('width', String(sw));
    pieClone.setAttribute('height', String(sh));
    const svgText = new XMLSerializer().serializeToString(pieClone);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const pieImg = await loadImageDataUrl(dataUrl);
    const sx = srect.left - sr.left;
    const sy = srect.top - sr.top;
    ctx.drawImage(pieImg, sx, sy, sw, sh);

    const legend = wrap.querySelector('.dash-ws-pie-legend');
    if (legend) {
      legend.querySelectorAll('li').forEach((li) => {
        const lr = li.getBoundingClientRect();
        const swEl = li.querySelector('.dash-ws-pie-swatch');
        const lx = lr.left - sr.left;
        const ly = lr.top - sr.top;
        if (swEl) {
          ctx.fillStyle = getComputedStyle(swEl).backgroundColor;
          const swR = swEl.getBoundingClientRect();
          ctx.fillRect(swR.left - sr.left, swR.top - sr.top, swR.width, swR.height);
        }
        const spans = [...li.querySelectorAll('span')].filter((s) => !s.classList.contains('dash-ws-pie-swatch'));
        const text = spans.map((s) => s.textContent.trim()).filter(Boolean).join(' ');
        if (text) {
          ctx.fillStyle = getComputedStyle(li).color;
          const fs = getComputedStyle(li).fontSize;
          const ff = getComputedStyle(li).fontFamily;
          ctx.font = `${fs} ${ff}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const textX = lx + (swEl ? 18 : 0);
          const textY = ly + lr.height / 2;
          ctx.fillText(text, textX, textY);
        }
      });
    }

    const blob = await canvasToPngBlob(canvas);
    if (blob) await downloadPngBlob(blob, `statsflow-category-${chartExportFileDate()}.png`);
  }

  function isChartExportableHost(barsEl) {
    return barsEl && !barsEl.querySelector('.dash-ws-chart-empty');
  }

  window.StatsflowDashboardWorkspace = {
    init(ctx) {
      const tr = ctx.tr;
      const root = document.getElementById('panel-home');
      if (!root || !document.getElementById('dash-ws-list')) {
        return { refreshLocale() {}, async load() {} };
      }

      const localeForDates = () => document.documentElement.lang || 'en';

      function formatTime(timestamp) {
        const d = new Date(timestamp);
        const mo = d.getMonth() + 1;
        const day = d.getDate();
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${mo}/${day} ${h}:${min}`;
      }

      function formatFullDate(timestamp) {
        return new Date(timestamp).toLocaleDateString(localeForDates(), {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }

      let currentFilter = 'today';
      let currentSearch = '';
      let currentSort = 'time';
      let selectedDate = null;
      let calendarYear = new Date().getFullYear();
      let calendarMonth = new Date().getMonth();
      let cachedSites = [];
      /** 无搜索词，供概览数字与三块图表使用 */
      let cachedOverviewSites = [];
      let hourlyData = [];
      let cachedTrendSeries = [];
      let cachedCategoryData = [];
      let currentPage = 1;
      let pageSize = 20;

      const el = (id) => document.getElementById(id);

      let storageReadyResolve;
      const storageReady = new Promise((res) => {
        storageReadyResolve = res;
      });
      void (async () => {
        try {
          const r = await chrome.storage.local.get(['dashListPageSize']);
          const n = Number(r.dashListPageSize);
          if (ALLOWED_PAGE_SIZES.includes(n)) {
            pageSize = n;
            const sel = el('dash-ws-page-size');
            if (sel) sel.value = String(pageSize);
          }
        } finally {
          storageReadyResolve();
        }
      })();

      function renderCalendar(year, month, datesWithVisits) {
        const titleEl = el('dash-ws-cal-title');
        const d0 = new Date(year, month, 1);
        titleEl.textContent = d0.toLocaleDateString(localeForDates(), { year: 'numeric', month: 'long' });
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPad = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        const container = el('dash-ws-cal-days');
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();
        let html = '';
        for (let i = startPad - 1; i >= 0; i--) {
          const d = prevMonthDays - i;
          const ts = new Date(prevYear, prevMonth, d).getTime();
          html += `<div class="dash-ws-cal-day other-month" data-ts="${ts}">${d}</div>`;
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${month}-${d}`;
          const hasVisits = datesWithVisits.has(dateStr);
          const isToday = dateStr === todayStr;
          const ts = new Date(year, month, d).getTime();
          const cls = ['dash-ws-cal-day'];
          if (hasVisits) cls.push('has-visits');
          if (isToday) cls.push('today');
          html += `<div class="${cls.join(' ')}" data-ts="${ts}">${d}</div>`;
        }
        const totalCells = startPad + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        const nextYear = month === 11 ? year + 1 : year;
        const nextMonth = month === 11 ? 0 : month + 1;
        for (let d = 1; d <= remaining; d++) {
          const ts = new Date(nextYear, nextMonth, d).getTime();
          html += `<div class="dash-ws-cal-day other-month" data-ts="${ts}">${d}</div>`;
        }
        container.innerHTML = html;
      }

      function syncFilterButtons() {
        document.querySelectorAll('#dash-ws-overview-filters .dash-ws-filter-btn').forEach((b) => {
          b.classList.toggle('active', !selectedDate && b.dataset.filter === currentFilter);
        });
      }

      function updateDateBadge() {
        const badge = el('dash-ws-date-badge');
        if (selectedDate) {
          const d = new Date(selectedDate);
          badge.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
          badge.classList.remove('hidden');
          badge.title = tr('clearDateFilter');
        } else {
          badge.classList.add('hidden');
        }
      }

      function updateChartTitles() {
        const trendEl = el('dash-ws-trend-heading');
        const hourEl = el('dash-ws-hour-heading');
        if (selectedDate) {
          if (trendEl) trendEl.textContent = tr('dashTrendTitlePickDay');
          if (hourEl) hourEl.textContent = tr('hourChartTitle');
          return;
        }
        const trendByFilter = {
          all: 'dashTrendTitleAll',
          hour: 'dashTrendTitleHour',
          today: 'dashTrendTitleToday',
          week: 'dashTrendTitleWeek',
          month: 'dashTrendTitleMonth'
        };
        if (trendEl) trendEl.textContent = tr(trendByFilter[currentFilter] || 'dashTrendTitleToday');
        if (hourEl) {
          hourEl.textContent = tr(currentFilter === 'hour' ? 'dashTrendTitleHour' : 'hourChartTitle');
        }
      }

      function renderTrendChart() {
        const barsEl = el('dash-ws-trend-bars');
        const data = cachedTrendSeries;
        const escAttr = (s) =>
          String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
        const total = data.reduce((a, b) => a + b.count, 0);
        const max = Math.max(...data.map((d) => d.count), 1);
        if (total === 0 || data.length === 0) {
          barsEl.innerHTML = `<div class="dash-ws-chart-empty">${tr('noData')}<br><small>${tr('trendChartEmpty')}</small></div>`;
        } else {
          const barHeightPx = 60;
          barsEl.innerHTML = data
            .map((d) => {
              const h = Math.max(2, (d.count / max) * barHeightPx);
              const tip = `${d.label}: ${tr('visitsCount', d.count)}`;
              return `<div class="dash-ws-trend-bar-wrap" title="${escAttr(tip)}">
              <div class="dash-ws-trend-bar" style="height:${h}px"></div>
              <span class="dash-ws-trend-label">${escAttr(d.label)}</span>
            </div>`;
            })
            .join('');
        }
      }

      function renderHourChart() {
        const barsEl = el('dash-ws-hour-bars');
        const n = hourlyData.length;
        if (n === 0) {
          barsEl.innerHTML = `<div class="dash-ws-chart-empty">${tr('noData')}<br><small>${tr('hourChartEmpty')}</small></div>`;
          return;
        }
        const total = hourlyData.reduce((a, b) => a + b, 0);
        const max = Math.max(...hourlyData, 1);
        if (total === 0) {
          barsEl.innerHTML = `<div class="dash-ws-chart-empty">${tr('noData')}<br><small>${tr('hourChartEmpty')}</small></div>`;
          return;
        }
        const W = 420;
        const H = 108;
        const padL = 8;
        const padR = 8;
        const padT = 8;
        const padB = 20;
        const innerW = W - padL - padR;
        const innerH = H - padT - padB;
        const baseline = padT + innerH;
        const denom = Math.max(1, n - 1);
        const pts = hourlyData.map((count, i) => ({
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
        const hits = hourlyData
          .map((count, i) => {
            const left = i === 0 ? padL : (xAt(i - 1) + xAt(i)) / 2;
            const right = i === n - 1 ? padL + innerW : (xAt(i) + xAt(i + 1)) / 2;
            const w = Math.max(1, right - left);
            let tip;
            if (n === 12) {
              const timeLbl = trendLabels ? trendLabels[i] : tr('dashFiveMinSegment', i + 1);
              tip = `${timeLbl} — ${tr('visitsCount', count)}`;
            } else if (n === 24) tip = `${i}:00 — ${tr('visitsCount', count)}`;
            else tip = tr('visitsCount', count);
            return `<rect class="dash-ws-hour-hit" x="${left}" y="0" width="${w}" height="${H}" fill="transparent"><title>${escAttr(tip)}</title></rect>`;
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
            return `<text class="dash-ws-hour-axis" x="${x}" y="${H - 3}" text-anchor="middle">${escAttr(lbl)}</text>`;
          })
          .join('');
        barsEl.innerHTML = `
            <svg class="dash-ws-hour-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="dashWsHourFill" x1="0" y1="0" x2="0" y2="1">
                  <stop class="dash-ws-hour-g0" offset="0%"/>
                  <stop class="dash-ws-hour-g1" offset="100%"/>
                </linearGradient>
              </defs>
              <path class="dash-ws-hour-area" d="${areaD}" fill="url(#dashWsHourFill)"/>
              <path class="dash-ws-hour-line" d="${lineD}" fill="none" stroke-width="2"/>
              ${hits}${labels}
            </svg>`;
      }

      function renderCategoryChart() {
        const barsEl = el('dash-ws-category-bars');
        const data = Array.isArray(cachedCategoryData) ? cachedCategoryData : [];
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
        const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const formatPct = (f) => (f * 100).toFixed(1);

        if (total === 0 || data.length === 0) {
          barsEl.innerHTML = `<div class="dash-ws-chart-empty">${tr('noData')}<br><small>${tr('categoryChartEmpty')}</small></div>`;
        } else if (data.length === 1) {
          const d = data[0];
          const name = tr(d.name);
          const pct = formatPct(1);
          const color = CATEGORY_PIE_COLORS[0];
          const title = `${name}: ${tr('visitsCount', d.count)} (${pct}%)`;
          barsEl.innerHTML = `
            <div class="dash-ws-pie-wrap">
              <svg class="dash-ws-pie-svg" viewBox="0 0 100 100">
                <g class="dash-ws-pie-seg" data-pie-index="0"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/></g>
              </svg>
              <ul class="dash-ws-pie-legend">
                <li class="dash-ws-pie-legend-item" data-pie-index="0" title="${escAttr(title)}">
                  <span class="dash-ws-pie-swatch" style="background:${color}"></span>
                  <span>${escHtml(name)}</span>
                  <span>${pct}%</span>
                  <span>${d.count}</span>
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
            const name = tr(d.name);
            const pct = formatPct(frac);
            const color = CATEGORY_PIE_COLORS[i % CATEGORY_PIE_COLORS.length];
            const title = `${name}: ${tr('visitsCount', d.count)} (${pct}%)`;
            if (slice >= 2 * Math.PI - 1e-6) {
              paths.push(`<g class="dash-ws-pie-seg" data-pie-index="${i}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/></g>`);
            } else {
              const start = acc;
              const end = acc + slice;
              const [x1, y1] = polar(start);
              const [x2, y2] = polar(end);
              const large = slice > Math.PI ? 1 : 0;
              paths.push(
                `<g class="dash-ws-pie-seg" data-pie-index="${i}"><path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}"/></g>`
              );
              acc = end;
            }
            legendItems.push(
              `<li class="dash-ws-pie-legend-item" data-pie-index="${i}" title="${escAttr(title)}">
                <span class="dash-ws-pie-swatch" style="background:${color}"></span>
                <span>${escHtml(name)}</span>
                <span>${pct}%</span>
                <span>${d.count}</span>
              </li>`
            );
          });
          barsEl.innerHTML = `
            <div class="dash-ws-pie-wrap">
              <svg class="dash-ws-pie-svg" viewBox="0 0 100 100">${paths.join('')}</svg>
              <ul class="dash-ws-pie-legend">${legendItems.join('')}</ul>
            </div>`;
          const wrap = barsEl.querySelector('.dash-ws-pie-wrap');
          if (wrap) bindCategoryPieHover(wrap);
        }
      }

      function renderCharts() {
        renderTrendChart();
        renderHourChart();
        renderCategoryChart();
      }

      function updateSummary() {
        const sorted = sortSites(cachedOverviewSites, currentSort);
        const totalVisits = sorted.reduce((sum, s) => sum + s.visitCount, 0);
        const sitesNum = el('dash-ws-stat-sites-num');
        const visitsNum = el('dash-ws-stat-visits-num');
        if (sitesNum) sitesNum.textContent = String(sorted.length);
        if (visitsNum) visitsNum.textContent = String(totalVisits);
      }

      function updatePaginationUi(totalItems) {
        const size = pageSize;
        const totalPages = Math.max(1, Math.ceil(totalItems / size));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        el('dash-ws-page-info').textContent = tr('dashPageStatus', currentPage, totalPages, totalItems);
        el('dash-ws-page-prev').disabled = currentPage <= 1 || totalItems === 0;
        el('dash-ws-page-next').disabled = currentPage >= totalPages || totalItems === 0;

        const numsEl = el('dash-ws-page-nums');
        if (!numsEl) return;
        if (totalItems === 0 || totalPages <= 1) {
          numsEl.innerHTML = '';
          return;
        }
        const pages = buildPageList(totalPages, currentPage);
        numsEl.innerHTML = pages
          .map((p) =>
            p === '…'
              ? '<span class="dash-ws-page-ellipsis" aria-hidden="true">…</span>'
              : `<button type="button" class="dash-ws-page-num${p === currentPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`
          )
          .join('');
        numsEl.querySelectorAll('.dash-ws-page-num').forEach((btn) => {
          btn.addEventListener('click', () => {
            currentPage = Number(btn.dataset.page);
            renderListPage();
          });
        });
      }

      function renderListPage() {
        const container = el('dash-ws-list');
        const sorted = sortSites(cachedSites, currentSort);
        const totalItems = sorted.length;
        updatePaginationUi(totalItems);
        updateSummary();

        if (totalItems === 0) {
          container.innerHTML = `<div class="dash-ws-empty">${tr('noData')}</div>`;
          return;
        }

        const totalVisits = sorted.reduce((sum, site) => sum + site.visitCount, 0);
        const start = (currentPage - 1) * pageSize;
        const pageSites = sorted.slice(start, start + pageSize);

        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        container.innerHTML = pageSites
          .map((site) => {
            const percent = totalVisits > 0 ? Math.round((site.visitCount / totalVisits) * 100) : 0;
            const hasPages = site.urlList && site.urlList.length > 0;
            const rdAttr = (site.rootDomain || '').replace(/"/g, '&quot;');
            return `
          <div class="dash-ws-item ${hasPages ? 'expandable' : ''}" data-url="${esc(site.url)}" data-root-domain="${esc(site.rootDomain)}">
            <div class="dash-ws-item-head">
              <div class="dash-ws-fav">${site.favicon ? `<img src="${esc(site.favicon)}" width="20" height="20" alt="">` : '🌐'}</div>
              <div class="dash-ws-item-main">
                <div class="dash-ws-item-title">${esc(site.title)}</div>
                <div class="dash-ws-item-sub">
                  <span class="dash-ws-item-sub-host" title="${esc(site.domain)}">${esc(site.domain)}</span>
                  <span class="dash-ws-item-sub-meta">${tr('pages', site.pageCount || 1)}</span>
                </div>
                <div class="dash-ws-bar" title="${esc(tr('percent', percent))}"><div class="dash-ws-bar-fill" style="width:${percent}%"></div></div>
              </div>
              <div class="dash-ws-item-meta">
                <span>${tr('visitsCount', site.visitCount)}</span>
                <span>${formatTime(site.lastVisitTime)}</span>
              </div>
              ${hasPages ? '<span class="dash-ws-expand-icon">▾</span>' : ''}
              <button type="button" class="dash-ws-del" data-root-domain="${rdAttr}" title="${esc(tr('deleteSiteHistory'))}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            </div>
          </div>`;
          })
          .join('');

        const siteUrlMap = new Map();
        pageSites.forEach((s) => {
          if (s.urlList?.length) siteUrlMap.set(s.rootDomain, s.urlList);
        });

        container.querySelectorAll('.dash-ws-del').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const rootDomain = btn.getAttribute('data-root-domain');
            const site = cachedSites.find((s) => s.rootDomain === rootDomain);
            const urlList = site?.urlList;
            if (!urlList) return;
            for (const p of urlList) {
              try {
                await chrome.history.deleteUrl({ url: p.url });
              } catch (_) {}
            }
            await loadData();
          });
        });

        container.querySelectorAll('.dash-ws-item').forEach((item) => {
          item.addEventListener('click', (e) => {
            if (e.target.closest('.page-item') || e.target.closest('.dash-ws-del')) return;
            const rootDomain = item.dataset.rootDomain;
            const urlList = siteUrlMap.get(rootDomain);
            if (urlList && urlList.length > 0) {
              const wasExpanded = item.classList.contains('expanded');
              if (!wasExpanded) {
                container.querySelectorAll('.dash-ws-item.expanded').forEach((other) => {
                  if (other === item) return;
                  other.classList.remove('expanded');
                  const ic = other.querySelector('.dash-ws-expand-icon');
                  if (ic) ic.textContent = '▾';
                });
              }
              item.classList.toggle('expanded');
              const icon = item.querySelector('.dash-ws-expand-icon');
              if (icon) icon.textContent = item.classList.contains('expanded') ? '▴' : '▾';
              let panel = item.querySelector('.dash-ws-pages');
              if (!panel) {
                panel = document.createElement('div');
                panel.className = 'dash-ws-pages';
                const sortedPages = [...urlList].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
                panel.innerHTML = sortedPages
                  .map((p) => {
                    const label = p.title || p.url;
                    return `<div class="page-item" data-url="${esc(p.url)}">
                    <span class="page-title" title="${esc(label)}">${esc(label)}</span>
                    <span class="page-meta">${tr('visitsCount', p.visitCount)} · ${formatTime(p.lastVisitTime)}</span>
                  </div>`;
                  })
                  .join('');
                item.appendChild(panel);
                panel.querySelectorAll('.page-item').forEach((pEl) => {
                  pEl.addEventListener('click', (ev) => {
                    ev.stopPropagation();
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

      async function reloadBrowseListOnly() {
        const { blacklist = [] } = await chrome.storage.local.get(['blacklist']);
        const { sites } = await getHistoryStats(
          currentFilter,
          currentSearch.trim(),
          selectedDate,
          false,
          blacklist,
          localeForDates()
        );
        cachedSites = sites;
        renderListPage();
      }

      async function loadData() {
        const listEl = el('dash-ws-list');
        listEl.innerHTML = `<div class="dash-ws-loading">${tr('loading')}</div>`;
        el('dash-ws-trend-bars').innerHTML = `<div class="dash-ws-chart-empty">${tr('loading')}</div>`;
        el('dash-ws-hour-bars').innerHTML = `<div class="dash-ws-chart-empty">${tr('loading')}</div>`;
        el('dash-ws-category-bars').innerHTML = `<div class="dash-ws-chart-empty">${tr('loading')}</div>`;

        const { blacklist = [] } = await chrome.storage.local.get(['blacklist']);
        const locale = localeForDates();
        const q = currentSearch.trim();
        const baseP = getHistoryStats(currentFilter, '', selectedDate, false, blacklist, locale);
        const listP = q ? getHistoryStats(currentFilter, q, selectedDate, false, blacklist, locale) : baseP;
        const [base, list] = await Promise.all([baseP, listP]);

        cachedOverviewSites = base.sites;
        hourlyData = base.hourDistribution;
        cachedTrendSeries = base.trendSeries;
        cachedCategoryData = base.categoryData || [];
        cachedSites = list.sites;

        updateChartTitles();
        renderCharts();
        renderListPage();
        syncFilterButtons();
        updateDateBadge();
      }

      function refreshLocale() {
        updateChartTitles();
        renderCharts();
        renderListPage();
        updateDateBadge();
        syncSortTabs();
        const overlay = el('dash-ws-cal-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
          void getDatesWithVisits(calendarYear, calendarMonth).then((dates) =>
            renderCalendar(calendarYear, calendarMonth, dates)
          );
        }
      }

      function syncSortTabs() {
        document.querySelectorAll('.dash-ws-sort-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.sort === currentSort);
        });
      }

      async function openCalendar() {
        const overlay = el('dash-ws-cal-overlay');
        overlay.classList.remove('hidden');
        const dates = await getDatesWithVisits(calendarYear, calendarMonth);
        renderCalendar(calendarYear, calendarMonth, dates);
      }

      function bindChartDownloadButtons() {
        el('dash-ws-trend-dl')?.addEventListener('click', () => {
          const n = el('dash-ws-trend-bars');
          if (!isChartExportableHost(n)) return;
          void exportTrendBarsPng(n).catch((e) => console.error(e));
        });
        el('dash-ws-hour-dl')?.addEventListener('click', () => {
          const n = el('dash-ws-hour-bars');
          if (!isChartExportableHost(n)) return;
          const svg = n.querySelector('.dash-ws-hour-svg');
          if (!svg) return;
          void exportHourChartPng(svg, n).catch((e) => console.error(e));
        });
        el('dash-ws-category-dl')?.addEventListener('click', () => {
          const n = el('dash-ws-category-bars');
          if (!isChartExportableHost(n)) return;
          void exportCategoryPng(n).catch((e) => console.error(e));
        });
      }

      bindChartDownloadButtons();

      /* ——— 事件 ——— */
      let searchTimer = null;
      el('dash-ws-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          currentSearch = el('dash-ws-search').value;
          currentPage = 1;
          await reloadBrowseListOnly();
        }, 320);
      });

      document.querySelectorAll('#dash-ws-overview-filters .dash-ws-filter-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          selectedDate = null;
          currentFilter = btn.dataset.filter || 'today';
          currentPage = 1;
          await loadData();
        });
      });

      el('dash-ws-date-badge').addEventListener('click', async (e) => {
        e.stopPropagation();
        selectedDate = null;
        currentPage = 1;
        await loadData();
      });

      el('dash-ws-export').addEventListener('click', () => {
        const sorted = sortSites(cachedSites, currentSort);
        if (sorted.length === 0) return;
        const headers = tr('csvHeaders').split(',');
        const rows = sorted.map((s) => [
          s.title,
          s.domain,
          s.visitCount,
          s.pageCount || 1,
          formatFullDate(s.lastVisitTime),
          s.urlList?.length ? formatFullDate(Math.min(...s.urlList.map((p) => p.lastVisitTime))) : formatFullDate(s.lastVisitTime)
        ]);
        const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const filename = `${tr('csvFilename')}_${new Date().toISOString().slice(0, 10)}.csv`;
        chrome.downloads.download({ url, filename, saveAs: false });
        URL.revokeObjectURL(url);
      });

      el('dash-ws-cal-btn').addEventListener('click', () => void openCalendar());
      el('dash-ws-cal-close').addEventListener('click', () => el('dash-ws-cal-overlay').classList.add('hidden'));
      el('dash-ws-cal-overlay').addEventListener('click', (e) => {
        if (e.target === el('dash-ws-cal-overlay')) el('dash-ws-cal-overlay').classList.add('hidden');
      });
      el('dash-ws-cal-prev').addEventListener('click', async () => {
        calendarMonth--;
        if (calendarMonth < 0) {
          calendarMonth = 11;
          calendarYear--;
        }
        const dates = await getDatesWithVisits(calendarYear, calendarMonth);
        renderCalendar(calendarYear, calendarMonth, dates);
      });
      el('dash-ws-cal-next').addEventListener('click', async () => {
        calendarMonth++;
        if (calendarMonth > 11) {
          calendarMonth = 0;
          calendarYear++;
        }
        const dates = await getDatesWithVisits(calendarYear, calendarMonth);
        renderCalendar(calendarYear, calendarMonth, dates);
      });
      el('dash-ws-cal-days').addEventListener('click', async (e) => {
        const day = e.target.closest('.dash-ws-cal-day');
        if (!day || !day.dataset.ts) return;
        selectedDate = Number(day.dataset.ts);
        document.querySelectorAll('#dash-ws-overview-filters .dash-ws-filter-btn').forEach((b) => b.classList.remove('active'));
        el('dash-ws-cal-overlay').classList.add('hidden');
        currentPage = 1;
        await loadData();
      });

      document.querySelectorAll('.dash-ws-sort-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentSort = btn.dataset.sort;
          syncSortTabs();
          currentPage = 1;
          renderListPage();
        });
      });

      el('dash-ws-page-prev').addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderListPage();
        }
      });
      el('dash-ws-page-next').addEventListener('click', () => {
        const sorted = sortSites(cachedSites, currentSort);
        const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
        if (currentPage < totalPages) {
          currentPage++;
          renderListPage();
        }
      });

      el('dash-ws-page-size')?.addEventListener('change', async () => {
        const v = Number(el('dash-ws-page-size').value);
        if (!ALLOWED_PAGE_SIZES.includes(v)) return;
        pageSize = v;
        currentPage = 1;
        await chrome.storage.local.set({ dashListPageSize: pageSize });
        renderListPage();
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.blacklist) void loadData();
      });

      syncSortTabs();

      return {
        refreshLocale,
        async load() {
          await storageReady;
          return loadData();
        }
      };
    }
  };
})();

