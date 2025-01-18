// 保存按钮点击事件处理
document.getElementById("save").addEventListener("click", () => {
  // 获取两种关键词
  const titleKeywords = document.getElementById("titleKeywords").value;
  const sectionKeywords = document.getElementById("sectionKeywords").value;
  const upKeywords = document.getElementById("upKeywords").value;
  const minDuration = document.getElementById("minDuration").value;

  // 将关键词保存到 Chrome 存储
  chrome.storage.local.set(
    { 
      titleKeywords: titleKeywords,
      sectionKeywords: sectionKeywords,
      upKeywords: upKeywords,
      minDuration: minDuration ? parseInt(minDuration) : 0
    }, 
    () => {
      // 显示保存成功的提示
      const status = document.getElementById("status");
      status.textContent = "已保存！";
      status.style.display = "block";

      // 2秒后隐藏提示
      setTimeout(() => {
        status.style.display = "none";
      }, 2000);
    }
  );
});

// 页面加载时初始化输入框内容
chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "minDuration"], (data) => {
  if (data.titleKeywords) {
    document.getElementById("titleKeywords").value = data.titleKeywords;
  }
  if (data.sectionKeywords) {
    document.getElementById("sectionKeywords").value = data.sectionKeywords;
  }
  if (data.upKeywords) {
    document.getElementById("upKeywords").value = data.upKeywords;
  }
  if (data.minDuration) {
    document.getElementById("minDuration").value = data.minDuration;
  }
});

// 保存开关状态
document.getElementById("cleanMode").addEventListener("change", (e) => {
  chrome.storage.local.set({ cleanMode: e.target.checked });
});

// 初始化开关状态
chrome.storage.local.get(["cleanMode"], (data) => {
  document.getElementById("cleanMode").checked = !!data.cleanMode;
});
  