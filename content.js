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
  // 如果没有任何关键词和时长限制，直接返回，避免不必要的处理
  if (titleKeywords.length === 0 && sectionKeywords.length === 0 && upKeywords.length === 0 && minDuration <= 0) {
    return;
  }

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
    },
    // 详情页侧边栏推荐视频卡片
    {
      card: ".video-page-card-small",
      title: ".title",
      bvid: "a[href*='/BV']",
      parent: ".video-page-card-small",
      up: ".upname .name",
      duration: ".duration"
    }
  ];

  // 创建一个队列来处理需要检查分区的视频
  const sectionCheckQueue = [];

  for (const { card, title, bvid, parent, up, duration } of cardSelectors) {
    // 使用更高效的选择器，只选择未处理过的卡片
    const videoCards = document.querySelectorAll(`${card}:not([data-biliblocked])`);
    if (videoCards.length === 0) continue; // 如果没有未处理的卡片，跳过这个选择器
    
    for (const cardElement of videoCards) {
      // 标记元素已处理，避免重复处理
      cardElement.dataset.biliblocked = 'true';
      
      const titleElement = cardElement.querySelector(title);
      const bvidElement = cardElement.querySelector(bvid);
      const upElement = cardElement.querySelector(up);
      const durationElement = cardElement.querySelector(duration);
      
      if (!titleElement || !bvidElement) continue; // 如果缺少必要元素，跳过
      
      const titleText = titleElement.textContent.toLowerCase();
      
      // 检查标题关键词
      if (titleKeywords.length > 0 && titleKeywords.some((keyword) => titleText.includes(keyword))) {
        cardElement.remove();
        continue;
      }

      // 检查UP主关键词
      if (upElement && upKeywords.length > 0) {
        const upName = upElement.textContent.toLowerCase();
        if (upKeywords.some((keyword) => upName.includes(keyword))) {
          cardElement.remove();
          continue;
        }
      }

      // 检查视频时长
      if (minDuration > 0 && durationElement) {
        const durationText = durationElement.textContent.trim();
        const durationMinutes = convertDurationToMinutes(durationText);
        
        if (durationMinutes < minDuration) {
          cardElement.remove();
          continue;
        }
      }

      // 如果需要检查分区，将视频添加到队列中，而不是立即检查
      if (sectionKeywords.length > 0) {
        try {
          const bvidMatch = bvidElement.href.match(/\/BV[\w]+/);
          if (bvidMatch) {
            const bvid = bvidMatch[0].replace('/', '');
            sectionCheckQueue.push({ cardElement, bvid });
          }
        } catch (error) {
          console.error('处理视频分区失败:', error);
        }
      }
    }
  }

  // 批量处理分区检查队列，减少API调用次数
  if (sectionCheckQueue.length > 0 && sectionKeywords.length > 0) {
    // 每次最多处理10个视频，避免一次性发送太多请求
    const batchSize = 10;
    for (let i = 0; i < sectionCheckQueue.length; i += batchSize) {
      const batch = sectionCheckQueue.slice(i, i + batchSize);
      await Promise.all(batch.map(async ({ cardElement, bvid }) => {
        try {
          const tid = await getVideoTid(bvid);
          if (tid) {
            const tidName = await getTidName(tid);
            if (sectionKeywords.some((keyword) => {
              const lowercaseKeyword = keyword.toLowerCase();
              const lowercaseTidName = tidName.toLowerCase();
              return lowercaseTidName.includes(lowercaseKeyword);
            })) {
              cardElement.remove();
            }
          }
        } catch (error) {
          console.error('处理视频分区失败:', error);
        }
      }));
      
      // 添加短暂延迟，避免API请求过于频繁
      if (i + batchSize < sectionCheckQueue.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

// 添加清理页面函数
function cleanPage() {
  try {
    // 获取净化模式状态
    chrome.storage.local.get(["cleanMode"], (data) => {
      if (chrome.runtime.lastError) {
        console.log('Extension context invalidated');
        return;
      }

      if (data.cleanMode) {
        // 添加广告检测和屏蔽逻辑
        const adSelectors = [
          '.feed-card',
          '.bili-video-card',
          '.video-page-card-small' // 添加详情页侧边栏推荐视频卡片
        ];
        
        adSelectors.forEach(selector => {
          // 只选择未处理过的元素
          const elements = document.querySelectorAll(`${selector}:not([data-biliblocked])`);
          elements.forEach(element => {
            const adIcon = element.querySelector('.bili-video-card__info--creative-ad');
            const adInfo = element.querySelector('.bili-video-card__info--ad');
            
            if (adIcon || adInfo) {
              element.style.setProperty('display', 'none', 'important');
              element.dataset.biliblocked = 'true';
            }
          });
        });
        
        // 原有的其他净化逻辑保持不变
        const liveSelectors = [
          '.pop-live-small-mode',
          '.floor-single-card',
          '.bili-live-card'
        ];
        
        const cleanLiveElements = () => {
          let removedCount = 0;
          liveSelectors.forEach(selector => {
            // 只选择未处理过的元素
            const elements = document.querySelectorAll(`${selector}:not([data-biliblocked])`);
            elements.forEach(element => {
              element.style.setProperty('display', 'none', 'important');
              element.dataset.biliblocked = 'true';
              removedCount++;
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

        // 使用轮询持续检查几秒钟，但减少检查次数
        let checkCount = 0;
        const interval = setInterval(() => {
          const count = cleanLiveElements();
          checkCount++;
          
          // 如果连续2次没有新元素被处理，或者已检查5次，则停止轮询
          if ((count === 0 && checkCount > 2) || checkCount > 5) {
            clearInterval(interval);
          }
        }, 800); // 增加间隔时间，减少检查频率
      }
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      // 扩展被重新加载或禁用，停止观察
      if (window.biliBlockObserver) {
        window.biliBlockObserver.disconnect();
      }
      console.log('Extension reloaded or disabled');
    }
  }
}

// 保存 observer 的引用以便能够停止它
window.biliBlockObserver = new MutationObserver((mutations) => {
  try {
    // 检查是否有相关元素被添加，避免不必要的处理
    const hasRelevantChanges = mutations.some(mutation => {
      return Array.from(mutation.addedNodes).some(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return node.querySelector('.feed-card, .bili-video-card, .video-card, .video-page-card-small, .pop-live-small-mode, .floor-single-card, .bili-live-card') ||
                 node.classList.contains('feed-card') ||
                 node.classList.contains('bili-video-card') ||
                 node.classList.contains('video-card') ||
                 node.classList.contains('video-page-card-small') ||
                 node.classList.contains('pop-live-small-mode') ||
                 node.classList.contains('floor-single-card') ||
                 node.classList.contains('bili-live-card');
        }
        return false;
      });
    });
    
    if (!hasRelevantChanges) return;
    
    // 使用防抖处理，避免频繁执行
    if (window.biliBlockDebounceTimer) {
      clearTimeout(window.biliBlockDebounceTimer);
    }
    
    window.biliBlockDebounceTimer = setTimeout(() => {
      cleanPage();
    }, 300);
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      window.biliBlockObserver.disconnect();
      console.log('Extension reloaded or disabled');
    }
  }
});

// 开始观察页面变化
try {
  window.biliBlockObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初始执行一次清理
  cleanPage();
} catch (error) {
  console.log('Failed to start observer:', error);
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleCleanMode") {
    cleanPage();
  }
});

// 修改启动函数
function startBlocking() {
  // 确保DOM已经加载
  const init = async () => {
    await loadTidMapConfig();
    
    // 尝试使用同步管理器加载设置，如果失败则回退到本地存储
    let data;
    try {
      // 检查是否有同步管理器
      if (typeof window !== 'undefined' && window.syncManager) {
        data = await window.syncManager.loadSettings();
      } else {
        // 回退到本地存储
        data = await new Promise((resolve) => {
          chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "cleanMode", "minDuration"], resolve);
        });
      }
    } catch (error) {
      console.error('加载设置失败，使用本地存储:', error);
      data = await new Promise((resolve) => {
        chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "cleanMode", "minDuration"], resolve);
      });
    }
    
    // 处理设置数据
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
    cleanPage();
    hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration);

    // 使用防抖处理动态内容
    let timeoutId;
    const observer = new MutationObserver((mutations) => {
      // 检查是否有相关元素被添加，避免不必要的处理
      const hasRelevantChanges = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return node.querySelector('.feed-card, .bili-video-card, .video-card, .video-page-card-small') ||
                   node.classList.contains('feed-card') ||
                   node.classList.contains('bili-video-card') ||
                   node.classList.contains('video-card') ||
                   node.classList.contains('video-page-card-small');
          }
          return false;
        });
      });
      
      if (!hasRelevantChanges) return;
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration);
        // 只在必要时执行cleanPage
        if (data.cleanMode) {
          cleanPage();
        }
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    
    // 特别处理详情页侧边栏推荐视频
    // 由于详情页的推荐视频可能是动态加载的，我们需要定期检查，但要限制检查次数
    if (window.location.href.includes('/video/')) {
      const checkDetailPageRecommendations = () => {
        const recommendCards = document.querySelectorAll('.video-page-card-small:not([data-biliblocked])');
        if (recommendCards.length > 0) {
          // 只处理未处理过的卡片
          hideVideos(titleKeywords, sectionKeywords, upKeywords, minDuration);
          return true; // 返回true表示找到了需要处理的卡片
        }
        return false; // 返回false表示没有找到需要处理的卡片
      };
      
      // 立即检查一次
      checkDetailPageRecommendations();
      
      // 然后每秒检查一次，但如果连续3次没有找到新卡片就停止
      let checkCount = 0;
      let emptyCheckCount = 0;
      const interval = setInterval(() => {
        const foundCards = checkDetailPageRecommendations();
        checkCount++;
        
        if (!foundCards) {
          emptyCheckCount++;
        } else {
          emptyCheckCount = 0; // 重置空检查计数
        }
        
        // 如果连续3次没有找到新卡片或者总共检查了5次，就停止检查
        if (emptyCheckCount >= 3 || checkCount >= 5) {
          clearInterval(interval);
        }
      }, 1000);
    }
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
