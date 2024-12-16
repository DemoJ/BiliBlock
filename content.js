// 定义隐藏视频的函数
function hideVideos(keywords) {
    // 定义所有可能的视频卡片选择器和标题选择器
    const cardSelectors = [
      { card: ".video-card", title: ".video-name" },
      { card: ".bili-video-card__wrap", title: ".bili-video-card__info--tit" },
    ];
  
    // 遍历每种视频卡片类型
    cardSelectors.forEach(({ card, title }) => {
      const videoCards = document.querySelectorAll(card);
      videoCards.forEach((cardElement) => {
        const titleElement = cardElement.querySelector(title);
        if (titleElement) {
          const titleText = titleElement.textContent.toLowerCase();
          if (keywords.some((keyword) => titleText.includes(keyword))) {
            cardElement.style.display = "none";
          }
        }
      });
    });
  }
  
  // 动态加载内容处理
  function startBlocking() {
    chrome.storage.local.get("blockKeywords", (data) => {
      const keywords = data.blockKeywords
        ? data.blockKeywords.split("|").map((k) => k.trim().toLowerCase())
        : [];
      hideVideos(keywords);
  
      // 监听页面动态内容加载
      const observer = new MutationObserver(() => hideVideos(keywords));
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }
  
  // 执行屏蔽逻辑
  startBlocking();
  