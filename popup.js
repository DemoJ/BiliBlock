// 保存按钮点击事件处理
document.getElementById("save").addEventListener("click", async () => {
  try {
    // 获取所有设置
    const titleKeywords = document.getElementById("titleKeywords").value;
    const sectionKeywords = document.getElementById("sectionKeywords").value;
    const upKeywords = document.getElementById("upKeywords").value;
    const minDuration = document.getElementById("minDuration").value;
    const cleanMode = document.getElementById("cleanMode").checked;

    const settings = { 
      titleKeywords: titleKeywords,
      sectionKeywords: sectionKeywords,
      upKeywords: upKeywords,
      minDuration: minDuration ? parseInt(minDuration) : 0,
      cleanMode: cleanMode
    };

    // 使用同步管理器保存设置
    await window.syncManager.saveSettings(settings);

    // 显示保存成功的提示
    const status = document.getElementById("status");
    status.textContent = "设置已保存并同步！";
    status.classList.add("show");

    // 2秒后隐藏提示
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);

    // 更新同步状态显示
    updateSyncStatus();
  } catch (error) {
    console.error('保存设置失败:', error);
    const status = document.getElementById("status");
    status.textContent = "保存失败，请重试";
    status.classList.add("show");
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);
  }
});

// 页面加载时初始化
async function initializePopup() {
  try {
    // 初始化同步管理器
    await window.syncManager.getSyncEnabled();
    
    // 加载设置（会自动处理云端同步）
    const data = await window.syncManager.loadSettings();
    
    // 填充表单
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
    document.getElementById("cleanMode").checked = !!data.cleanMode;
    
    // 更新同步状态显示
    updateSyncStatus();
  } catch (error) {
    console.error('初始化失败:', error);
    // 如果同步失败，回退到原来的本地加载方式
    chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "minDuration", "cleanMode"], (data) => {
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
      document.getElementById("cleanMode").checked = !!data.cleanMode;
    });
  }
}

// 保存开关状态
document.getElementById("cleanMode").addEventListener("change", async (e) => {
  try {
    const currentSettings = await window.syncManager.loadLocalSettings();
    currentSettings.cleanMode = e.target.checked;
    await window.syncManager.saveSettings(currentSettings);
  } catch (error) {
    console.error('保存开关状态失败:', error);
    // 回退到本地保存
    chrome.storage.local.set({ cleanMode: e.target.checked });
  }
});

// 更新同步状态显示
async function updateSyncStatus() {
  try {
    const status = await window.syncManager.getSyncStatus();
    const syncStatusElement = document.getElementById("syncStatus");
    if (syncStatusElement) {
      if (status.syncEnabled) {
        const lastSync = status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : '从未同步';
        syncStatusElement.innerHTML = `
          <div class="sync-info">
            <div>云端同步: <span class="sync-enabled">已启用</span><button type="button" id="manualSync" class="sync-link">手动同步</button></div>
            <div>本地版本: ${status.localVersion}</div>
            <div>云端版本: ${status.cloudVersion}</div>
            <div>最后同步: ${lastSync}</div>
          </div>
        `;
      } else {
        syncStatusElement.innerHTML = `
          <div class="sync-info">
            <div>云端同步: <span class="sync-disabled">已禁用</span></div>
          </div>
        `;
      }
      
      // 重新绑定手动同步按钮事件
      const manualSyncBtn = document.getElementById("manualSync");
      if (manualSyncBtn) {
        manualSyncBtn.addEventListener("click", handleManualSync);
      }
    }
  } catch (error) {
    console.error('更新同步状态失败:', error);
  }
}

// 同步开关事件处理
document.getElementById("syncEnabled").addEventListener("change", async (e) => {
  try {
    await window.syncManager.setSyncEnabled(e.target.checked);
    updateSyncStatus();
    
    const status = document.getElementById("status");
    status.textContent = e.target.checked ? "云端同步已启用" : "云端同步已禁用";
    status.classList.add("show");
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);
  } catch (error) {
    console.error('切换同步状态失败:', error);
  }
});

// 手动同步事件处理函数
async function handleManualSync() {
  const button = document.getElementById("manualSync");
  if (!button) return;
  
  const originalText = button.textContent;
  
  try {
    button.disabled = true;
    button.textContent = "同步中...";
    
    await window.syncManager.manualSync();
    
    // 重新加载设置到表单
    const data = await window.syncManager.loadLocalSettings();
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
    document.getElementById("cleanMode").checked = !!data.cleanMode;
    
    updateSyncStatus();
    
    const status = document.getElementById("status");
    status.textContent = "同步完成！";
    status.classList.add("show");
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);
  } catch (error) {
    console.error('手动同步失败:', error);
    const status = document.getElementById("status");
    status.textContent = "同步失败，请重试";
    status.classList.add("show");
    setTimeout(() => {
      status.classList.remove("show");
    }, 2000);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  
  // 初始化同步开关状态
  const syncEnabled = await window.syncManager.getSyncEnabled();
  document.getElementById("syncEnabled").checked = syncEnabled;
});
  