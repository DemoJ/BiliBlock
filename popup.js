// 保存按钮点击事件处理
document.getElementById("save").addEventListener("click", () => {
    // 获取输入框中的关键词
    const keywords = document.getElementById("keywords").value;
  
    // 将关键词保存到 Chrome 存储
    chrome.storage.local.set({ blockKeywords: keywords }, () => {
      // 显示保存成功的提示
      const status = document.getElementById("status");
      status.textContent = "已保存！";
      status.style.display = "block";
  
      // 2秒后隐藏提示
      setTimeout(() => {
        status.style.display = "none";
      }, 2000);
    });
  });
  
  // 页面加载时初始化输入框内容
  chrome.storage.local.get("blockKeywords", (data) => {
    if (data.blockKeywords) {
      // 如果存储中已有关键词，将其显示在输入框中
      document.getElementById("keywords").value = data.blockKeywords;
    }
  });
  