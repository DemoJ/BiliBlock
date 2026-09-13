// ==================== BiliBlock 内容脚本 ====================
// 屏蔽策略：用 CSS 隐藏（hidden-video 类）代替 remove()。
// B站是 Vue SPA，直接删除节点会破坏虚拟 DOM，导致详情页路由切换后
// 页面不更新、评论区无法渲染等问题；隐藏外层容器既不破坏页面，也不会留下空白。
// 注：热门页等两列列表的列间距由 nth-child(odd) 的 margin 撑出，隐藏卡片后
// 奇偶位会错位并留下空洞，styles.css 里改用 flex column-gap 兜住这一点。

const videoTidCache = new Map();
let tidMapConfig = null;
let tidMapLoading = null;

// 设置缓存：由 storage.onChanged 实时刷新，避免每次扫描都读 storage
let currentSettings = {
  titleKeywords: [],
  sectionKeywords: [],
  upKeywords: [],
  minDuration: 0,
  cleanMode: false,
};
let settingsReady = false;

function parseKeywords(str) {
  return str ? String(str).split(/[|｜]/).map((k) => k.trim().toLowerCase()).filter(Boolean) : [];
}

// 从本地/云端加载设置并写入缓存
async function loadSettingsIntoCache() {
  let data;
  try {
    if (typeof window !== 'undefined' && window.syncManager) {
      data = await window.syncManager.loadSettings();
    } else {
      data = await new Promise((resolve) => {
        chrome.storage.local.get(['titleKeywords', 'sectionKeywords', 'upKeywords', 'cleanMode', 'minDuration'], resolve);
      });
    }
  } catch (error) {
    console.error('加载设置失败，使用本地存储:', error);
    data = await new Promise((resolve) => {
      chrome.storage.local.get(['titleKeywords', 'sectionKeywords', 'upKeywords', 'cleanMode', 'minDuration'], resolve);
    });
  }

  currentSettings = {
    titleKeywords: parseKeywords(data.titleKeywords),
    sectionKeywords: parseKeywords(data.sectionKeywords),
    upKeywords: parseKeywords(data.upKeywords),
    minDuration: data.minDuration || 0,
    cleanMode: !!data.cleanMode,
  };
  settingsReady = true;
}

// ==================== 分区映射 ====================
async function loadTidMapConfig() {
  if (tidMapConfig) return;
  if (!tidMapLoading) {
    tidMapLoading = (async () => {
      try {
        const url = chrome.runtime.getURL('tidmap.json');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        tidMapConfig = await response.json();
      } catch (error) {
        console.error('加载分区映射配置失败:', error);
        tidMapConfig = {
          '1': '动画',
          '13': '番剧',
          '167': '国创',
          '3': '音乐',
          '4': '游戏',
        };
      }
    })();
  }
  await tidMapLoading;
}

async function getTidName(tid) {
  await loadTidMapConfig();
  return tidMapConfig[tid] || '未知分区';
}

async function getVideoTid(bvid) {
  if (videoTidCache.has(bvid)) {
    return videoTidCache.get(bvid);
  }
  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    const data = await response.json();
    if (data.code === 0) {
      // 缓存设置上限，避免长会话内存无限增长
      if (videoTidCache.size > 800) videoTidCache.clear();
      videoTidCache.set(bvid, data.data.tid);
      return data.data.tid;
    }
  } catch (error) {
    console.error('获取视频分区失败:', error);
  }
  return null;
}

// ==================== 工具函数 ====================
function convertDurationToMinutes(duration) {
  const parts = duration.split(':').map(Number);
  let minutes = 0;

  if (parts.length === 2) {
    // 格式为 "分:秒"
    const [min, sec] = parts;
    minutes = min + sec / 60;
  } else if (parts.length === 3) {
    // 格式为 "时:分:秒"
    const [hour, min, sec] = parts;
    minutes = hour * 60 + min + sec / 60;
  }

  return minutes;
}

// 隐藏卡片：优先隐藏最外层的已知容器，避免网格中留下空白占位。
// 不使用 remove()，保证 Vue 虚拟 DOM 与真实 DOM 一致。
function hideCardElement(element) {
  const target = element.closest('.bili-feed-card, .feed-card') || element;
  target.classList.add('hidden-video');
  target.dataset.biliblocked = 'true';
  element.dataset.biliblocked = 'true';
}

// 取消隐藏（卡片不再命中规则时调用）
function unhideCardElement(element) {
  const target = element.closest('.bili-feed-card, .feed-card') || element;
  target.classList.remove('hidden-video');
}

// ==================== 分区检查队列（带并发限制） ====================
const sectionQueue = [];
let sectionPumping = false;

function enqueueSectionChecks(items) {
  if (items.length === 0) return;
  sectionQueue.push(...items);
  pumpSectionQueue();
}

async function pumpSectionQueue() {
  if (sectionPumping) return;
  sectionPumping = true;
  const sectionKeywords = currentSettings.sectionKeywords;
  try {
    const concurrency = Math.min(4, sectionQueue.length);
    let index = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (index < sectionQueue.length) {
        const { cardElement, bvid } = sectionQueue[index++];
        // 卡片可能已被后续逻辑移出 DOM（路由切换、被隐藏等），跳过
        if (!cardElement.isConnected) continue;
        try {
          const tid = await getVideoTid(bvid);
          if (!cardElement.isConnected) continue;
          if (tid) {
            const tidName = (await getTidName(tid)).toLowerCase();
            if (sectionKeywords.some((keyword) => tidName.includes(keyword))) {
              hideCardElement(cardElement);
              continue;
            }
          }
          // 未命中（含查询失败）：取消残留的隐藏，避免误遮挡复用节点上的新视频
          unhideCardElement(cardElement);
        } catch (error) {
          console.error('处理视频分区失败:', error);
        }
      }
    });
    await Promise.all(workers);
  } finally {
    sectionPumping = false;
    sectionQueue.length = 0;
  }
}

// ==================== 视频屏蔽 ====================
const cardSelectors = [
  // 首页视频
  {
    card: '.feed-card, .bili-feed-card',
    title: '.bili-video-card__info--tit, .bili-video-card__info .bili-video-card__info--tit',
    bvid: "a[href*='/BV']",
    up: '.up-name__text, .bili-video-card__info--author',
    duration: '.bili-video-card__stats__duration, .bpx-player-homepage-time-label-total-time',
  },
  // 热门页视频
  {
    card: '.bili-video-card',
    title: '.bili-video-card__info--tit',
    bvid: "a[href*='/BV']",
    up: '.up-name__text, .bili-video-card__info--author',
    duration: '.bili-video-card__stats__duration',
  },
  // 其他页面视频
  {
    card: '.video-card',
    title: '.video-name',
    bvid: "a[href*='/BV']",
    up: '.up-name__text, .bili-video-card__info--author',
    duration: '.bili-video-card__stats__duration',
  },
  // 详情页侧边栏推荐视频卡片
  {
    card: '.video-page-card-small',
    title: '.title',
    bvid: "a[href*='/BV']",
    up: '.upname .name',
    duration: '.duration',
  },
];

async function hideVideos(settings) {
  const { titleKeywords, sectionKeywords, upKeywords, minDuration } = settings;
  if (titleKeywords.length === 0 && sectionKeywords.length === 0 && upKeywords.length === 0 && minDuration <= 0) {
    return;
  }

  const sectionCheckQueue = [];

  for (const { card, title, bvid, up, duration } of cardSelectors) {
    const videoCards = document.querySelectorAll(`${card}:not([data-biliblocked])`);
    if (videoCards.length === 0) continue;

    for (const cardElement of videoCards) {
      cardElement.dataset.biliblocked = 'true';

      const titleElement = cardElement.querySelector(title);
      const bvidElement = cardElement.querySelector(bvid);
      const upElement = cardElement.querySelector(up);
      const durationElement = cardElement.querySelector(duration);

      if (!titleElement || !bvidElement) continue;

      const titleText = titleElement.textContent.toLowerCase();

      if (titleKeywords.length > 0 && titleKeywords.some((keyword) => titleText.includes(keyword))) {
        hideCardElement(cardElement);
        continue;
      }

      if (upElement && upKeywords.length > 0) {
        const upName = upElement.textContent.toLowerCase();
        if (upKeywords.some((keyword) => upName.includes(keyword))) {
          hideCardElement(cardElement);
          continue;
        }
      }

      if (minDuration > 0 && durationElement) {
        const durationMinutes = convertDurationToMinutes(durationElement.textContent.trim());
        if (durationMinutes < minDuration) {
          hideCardElement(cardElement);
          continue;
        }
      }

      // 分区需要异步查询 API，先入队统一限流处理
      if (sectionKeywords.length > 0) {
        const bvidMatch = bvidElement.href.match(/\/BV[\w]+/);
        if (bvidMatch) {
          sectionCheckQueue.push({ cardElement, bvid: bvidMatch[0].replace('/', '') });
          continue;
        }
      }

      // 未命中任何规则：清除可能残留的隐藏（SPA 路由切换后节点可能被复用渲染新视频）
      unhideCardElement(cardElement);
    }
  }

  enqueueSectionChecks(sectionCheckQueue);
}

// ==================== 页面净化 ====================
const adSelectors = ['.feed-card', '.bili-video-card', '.video-page-card-small'];
const liveSelectors = ['.pop-live-small-mode', '.floor-single-card', '.bili-live-card'];

function cleanPage() {
  if (!currentSettings.cleanMode) return;

  // 广告卡片：新版广告角标渲染在 stats 文本位置（文本恰为"广告"），
  // 旧版角标类名保留兜底；svg 统计图标是所有卡片的通用类名，不能用作判断
  for (const selector of adSelectors) {
    const elements = document.querySelectorAll(`${selector}:not([data-biliblocked])`);
    for (const element of elements) {
      const isAd =
        element.querySelector('.bili-video-card__info--creative-ad') ||
        element.querySelector('.bili-video-card__info--ad') ||
        Array.from(element.querySelectorAll('.bili-video-card__stats--text'))
          .some((el) => el.textContent.trim() === '广告');
      if (isAd) hideCardElement(element);
    }
  }

  // 直播/活动卡片
  for (const selector of liveSelectors) {
    const elements = document.querySelectorAll(`${selector}:not([data-biliblocked])`);
    for (const element of elements) {
      hideCardElement(element);
    }
  }
}

// ==================== 扫描调度 ====================
// 单个 MutationObserver + 防抖（带最长等待），替代原来的双 observer 与逐节点过滤
let scanTimer = null;
let scanQueuedAt = 0;

function scheduleScan(delay = 300) {
  if (scanTimer) {
    // 已有排队的扫描；等待超过 1.2s 则立即执行，避免持续变化导致扫描被无限推迟
    if (Date.now() - scanQueuedAt < 1200) return;
    clearTimeout(scanTimer);
    scanTimer = null;
    runScan();
    return;
  }
  scanQueuedAt = Date.now();
  scanTimer = setTimeout(() => {
    scanTimer = null;
    runScan();
  }, delay);
}

function isContextInvalidated(error) {
  return error && error.message && error.message.includes('Extension context invalidated');
}

async function runScan() {
  try {
    if (!settingsReady) return;
    cleanPage();
    await hideVideos(currentSettings);
  } catch (error) {
    if (isContextInvalidated(error)) {
      if (window.biliBlockObserver) window.biliBlockObserver.disconnect();
      console.log('Extension reloaded or disabled');
    } else {
      console.error('扫描页面失败:', error);
    }
  }
}

// ==================== SPA 路由变化处理 ====================
// 详情页是 SPA：点击推荐视频只改 URL 不刷新页面，Vue 会复用旧节点渲染新视频，
// 因此路由变化后必须清除处理标记并重扫，否则已隐藏的节点会错误地遮挡新内容。
// 注：内容脚本与页面处于不同 JS 世界，包装 history.pushState 拦不到页面的路由调用，
// 这里用 popstate/hashchange + 低频 pathname 轮询，兼容 Chrome 与 Firefox。
let lastPathname = location.pathname;

function resetBlockedMarks() {
  const marked = document.querySelectorAll('[data-biliblocked]');
  for (const el of marked) {
    el.removeAttribute('data-biliblocked');
  }
  scheduleScan(150);
}

function checkRouteChange() {
  if (location.pathname === lastPathname) return;
  lastPathname = location.pathname;
  resetBlockedMarks();
}

window.addEventListener('popstate', checkRouteChange);
window.addEventListener('hashchange', checkRouteChange);
setInterval(checkRouteChange, 400);

// ==================== 设置实时生效 ====================
// popup 保存后立即应用到当前页面（含撤销已不匹配的隐藏）
let settingsRefreshTimer = null;

function scheduleSettingsRefresh() {
  if (settingsRefreshTimer) return;
  settingsRefreshTimer = setTimeout(async () => {
    settingsRefreshTimer = null;
    try {
      // 重置所有标记并取消全部隐藏，由重扫按新规则重新决定
      document.querySelectorAll('[data-biliblocked]').forEach((el) => el.removeAttribute('data-biliblocked'));
      document.querySelectorAll('.hidden-video').forEach((el) => el.classList.remove('hidden-video'));
      await loadSettingsIntoCache();
      scheduleScan(100);
    } catch (error) {
      if (isContextInvalidated(error)) {
        if (window.biliBlockObserver) window.biliBlockObserver.disconnect();
      }
    }
  }, 200);
}

// ==================== 启动 ====================
function startBlocking() {
  const init = async () => {
    try {
      window.biliBlockObserver = new MutationObserver(() => scheduleScan(300));
      window.biliBlockObserver.observe(document.body, { childList: true, subtree: true });

      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          const keys = Object.keys(changes);
          const relevant = ['titleKeywords', 'sectionKeywords', 'upKeywords', 'minDuration', 'cleanMode', 'version'];
          if (keys.some((k) => relevant.includes(k))) {
            scheduleSettingsRefresh();
          }
        });
      }

      await loadSettingsIntoCache();
      scheduleScan(0);
    } catch (error) {
      console.log('Failed to start observer:', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

startBlocking();
