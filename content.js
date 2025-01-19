// 添加缓存对象
const videoTidCache = new Map();
let tidMapConfig = null;

// 加载分区映射配置
async function loadTidMapConfig() {
  try {
    // 使用 chrome.runtime.getURL 获取文件的实际URL
    const url = chrome.runtime.getURL('tidmap.json');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    tidMapConfig = await response.json();
  } catch (error) {
    console.error('加载分区映射配置失败:', error);
    // 使用默认配置作为备份
    tidMapConfig = {
      "1": "动画",
      "13": "番剧",
      "167": "国创",
      "3": "音乐",
      "4": "游戏"
    };
  }
}

// 获取分区名称的函数
async function getTidName(tid) {
  if (!tidMapConfig) {
    await loadTidMapConfig();
  }
  return tidMapConfig[tid] || "未知分区";
}

// 修改获取视频分区的函数，添加缓存
async function getVideoTid(bvid) {
  // 检查缓存
  if (videoTidCache.has(bvid)) {
    return videoTidCache.get(bvid);
  }

  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    const data = await response.json();
    if (data.code === 0) {
      const tid = data.data.tid;
      // 存入缓存
      videoTidCache.set(bvid, tid);
      return tid;
    }
  } catch (error) {
    console.error('获取视频分区失败:', error);
  }
  return null;
}

// 修改时长转换函数
function convertDurationToMinutes(duration) {
  const parts = duration.split(':').map(Number);
  let minutes = 0;
  
  if (parts.length === 2) {
    // 格式为 "分:秒" (如 "08:59" 或 "03:59")
    const [min, sec] = parts;
    minutes = min + (sec / 60);
    console.log(`视频时长 ${duration} 转换为 ${minutes.toFixed(2)} 分钟`);
  } else if (parts.length === 3) {
    // 格式为 "时:分:秒" (如 "1:08:59")
    const [hour, min, sec] = parts;
    minutes = (hour * 60) + min + (sec / 60);
    console.log(`视频时长 ${duration} 转换为 ${minutes.toFixed(2)} 分钟`);
  }
  
  return minutes;
}

// 修改隐藏视频的函数
async function hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration) {
  const cardSelectors = [
    // 首页视频
    { 
      card: ".feed-card",
      title: ".bili-video-card__info--tit, .bili-video-card__info .bili-video-card__info--tit",
      bvid: "a[href*='/BV']",
      parent: ".feed-card",
      up: ".up-name__text, .bili-video-card__info--author",
      duration: ".bili-video-card__stats__duration, .bpx-player-homepage-time-label-total-time"
    },
    // 热门页视频
    {
      card: ".bili-video-card",
      title: ".bili-video-card__info--tit",
      bvid: "a[href*='/BV']",
      parent: ".bili-video-card",
      up: ".up-name__text, .bili-video-card__info--author",
      duration: ".bili-video-card__stats__duration"
    },
    // 其他页面视频
    {
      card: ".video-card",
      title: ".video-name",
      bvid: "a[href*='/BV']",
      parent: ".video-card",
      up: ".up-name__text, .bili-video-card__info--author",
      duration: ".bili-video-card__stats__duration"
    }
  ];

  for (const { card, title, bvid, parent, up, duration } of cardSelectors) {
    const videoCards = document.querySelectorAll(card);
    for (const cardElement of videoCards) {
      // 检查元素是否已经被处理过
      if (cardElement.dataset.processed === 'true') {
        continue;
      }

      const titleElement = cardElement.querySelector(title);
      const bvidElement = cardElement.querySelector(bvid);
      const upElement = cardElement.querySelector(up);
      const durationElement = cardElement.querySelector(duration);
      
      if (titleElement && bvidElement) {
        const titleText = titleElement.textContent.toLowerCase();
        
        // 标记元素已处理
        cardElement.dataset.processed = 'true';
        
        // 检查标题关键词
        if (titleKeywords.length > 0 && titleKeywords.some((keyword) => titleText.includes(keyword))) {
          const parentElement = cardElement.closest(parent);
          if (parentElement) {
            parentElement.remove();
          }
          continue;
        }

        // 检查UP主关键词
        if (upElement && upKeywords.length > 0) {
          const upName = upElement.textContent.toLowerCase();
          if (upKeywords.some((keyword) => upName.includes(keyword))) {
            const parentElement = cardElement.closest(parent);
            if (parentElement) {
              parentElement.remove();
            }
            continue;
          }
        }

        // 检查视频时长
        if (minDuration > 0 && durationElement) {
          const durationText = durationElement.textContent.trim();
          const durationMinutes = convertDurationToMinutes(durationText);
          console.log(`检查视频 "${titleElement.textContent}" - 时长: ${durationText}, 转换后: ${durationMinutes.toFixed(2)}分钟, 最小要求: ${minDuration}分钟`);
          
          if (durationMinutes < minDuration) {
            const parentElement = cardElement.closest(parent);
            if (parentElement) {
              parentElement.remove(); // 直接移除，不再使用 display:none
              console.log(`已屏蔽视频: ${titleElement.textContent} (时长: ${durationText})`);
            }
            continue;
          }
        }

        // 检查分区关键词
        if (sectionKeywords.length > 0) {
          try {
            const bvidMatch = bvidElement.href.match(/\/BV[\w]+/);
            if (bvidMatch) {
              const bvid = bvidMatch[0].replace('/', '');
              const tid = await getVideoTid(bvid);
              if (tid) {
                const tidName = await getTidName(tid);
                if (sectionKeywords.some((keyword) => {
                  const lowercaseKeyword = keyword.toLowerCase();
                  const lowercaseTidName = tidName.toLowerCase();
                  return lowercaseTidName.includes(lowercaseKeyword);
                })) {
                  const parentElement = cardElement.closest(parent);
                  if (parentElement) {
                    parentElement.remove();
                  }
                }
              }
            }
          } catch (error) {
            console.error('处理视频分区失败:', error);
          }
        }
      }
    }
  }
}

// 添加清理页面函数
function cleanPage(enabled) {
  if (!enabled) return;
  
  const liveSelectors = [
    '.pop-live-small-mode',
    '.floor-single-card',
    '.bili-live-card is-rcmd'
  ];
  
  const cleanLiveElements = () => {
    let removedCount = 0;
    liveSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!element.dataset.biliblocked) {
          element.style.setProperty('display', 'none', 'important');
          element.dataset.biliblocked = 'true';
          removedCount++;
        }
      });
    });
    return removedCount;
  };

  // 立即执行一次
  cleanLiveElements();

  // 延迟执行确保动态加载的内容也被处理
  setTimeout(() => {
    cleanLiveElements();
  }, 1000);

  // 使用轮询持续检查几秒钟
  let checkCount = 0;
  const interval = setInterval(() => {
    const count = cleanLiveElements();
    checkCount++;
    
    // 如果连续3次没有新元素被处理，或者已检查10次，则停止轮询
    if ((count === 0 && checkCount > 3) || checkCount > 10) {
      clearInterval(interval);
    }
  }, 500);
}

// 修改启动函数
function startBlocking() {
  // 确保DOM已经加载
  const init = async () => {
    await loadTidMapConfig();
    
    chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "cleanMode", "minDuration"], (data) => {
      // 修改分隔逻辑,同时支持全角｜和半角|
      const titleKeywords = data.titleKeywords
        ? data.titleKeywords.split(/[|｜]/).map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];
      const sectionKeywords = data.sectionKeywords
        ? data.sectionKeywords.split(/[|｜]/).map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];
      const upKeywords = data.upKeywords
        ? data.upKeywords.split(/[|｜]/).map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];
      
      const minDuration = data.minDuration || 0;
      
      // 执行清理和屏蔽
      cleanPage(data.cleanMode);
      hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration);

      // 使用防抖处理动态内容
      let timeoutId;
      const observer = new MutationObserver(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration);
          cleanPage(data.cleanMode);
        }, 500);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  };

  // 确保在DOM加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// 执行屏蔽逻辑
startBlocking();
