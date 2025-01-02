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

// 修改隐藏视频的函数
async function hideVideos(titleKeywords, sectionKeywords) {
  const cardSelectors = [
    // 首页视频
    { 
      card: ".feed-card",
      title: ".bili-video-card__info--tit, .bili-video-card__info .bili-video-card__info--tit",
      bvid: "a[href*='/BV']",
      parent: ".feed-card"
    },
    // 热门页视频
    {
      card: ".bili-video-card",
      title: ".bili-video-card__info--tit",
      bvid: "a[href*='/BV']",
      parent: ".bili-video-card"
    },
    // 其他页面视频
    {
      card: ".video-card",
      title: ".video-name",
      bvid: "a[href*='/BV']",
      parent: ".video-card"
    }
  ];

  for (const { card, title, bvid, parent } of cardSelectors) {
    const videoCards = document.querySelectorAll(card);
    for (const cardElement of videoCards) {
      // 检查元素是否已经被处理过
      if (cardElement.dataset.processed === 'true') {
        continue;
      }

      const titleElement = cardElement.querySelector(title);
      const bvidElement = cardElement.querySelector(bvid);
      
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
  
  // 清理直播推荐区域
  const liveElements = document.querySelectorAll('.pop-live-small-mode');
  liveElements.forEach(element => {
    element.style.display = 'none';
  });
}

// 修改启动函数
async function startBlocking() {
  await loadTidMapConfig();
  
  chrome.storage.local.get(["titleKeywords", "sectionKeywords", "cleanMode"], (data) => {
    const titleKeywords = data.titleKeywords
      ? data.titleKeywords.split("|").map((k) => k.trim().toLowerCase())
      : [];
    const sectionKeywords = data.sectionKeywords
      ? data.sectionKeywords.split("|").map((k) => k.trim().toLowerCase())
      : [];
    
    // 执行视频屏蔽
    hideVideos(titleKeywords, sectionKeywords);
    
    // 执行页面清理
    cleanPage(data.cleanMode);

    // 使用防抖处理动态内容
    let timeoutId;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        hideVideos(titleKeywords, sectionKeywords);
        cleanPage(data.cleanMode);
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

// 执行屏蔽逻辑
startBlocking();
  