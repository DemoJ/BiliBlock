// 关键词状态：每类关键词保存为数组，展示为可删除的标签
const keywordState = {
  titleKeywords: [],
  sectionKeywords: [],
  upKeywords: [],
};

// 与 content.js 的解析规则一致：按中英文竖线拆分
function parseKeywordString(str) {
  if (!str) return [];
  // 兼容历史数据（| 分隔字符串）和可能的数组格式
  if (Array.isArray(str)) str = str.join("|");
  return String(str)
    .split(/[|｜]/)
    .map((k) => k.trim())
    .filter(Boolean)
    // 去重，避免旧数据里的重复词渲染出多个相同标签
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function joinKeywords(list) {
  return list.join("|");
}

// ==================== 标签渲染 ====================
function renderTags(key) {
  const container = document.getElementById(`${key}Tags`);
  container.innerHTML = "";
  if (keywordState[key].length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "暂无关键词";
    container.appendChild(empty);
    return;
  }
  for (const word of keywordState[key]) {
    const tag = document.createElement("span");
    tag.className = "kw-tag";

    const text = document.createElement("span");
    text.textContent = word;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "kw-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "删除该关键词";
    removeBtn.addEventListener("click", () => {
      keywordState[key] = keywordState[key].filter((k) => k !== word);
      renderTags(key);
    });

    tag.appendChild(text);
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  }
}

function setKeywords(key, value) {
  keywordState[key] = parseKeywordString(value);
  renderTags(key);
}

// ==================== 添加关键词 ====================
function initKeywordInputs() {
  for (const key of Object.keys(keywordState)) {
    const input = document.getElementById(`${key}Input`);
    const addBtn = document.querySelector(`.kw-add[data-target="${key}"]`);

    const add = () => {
      const word = input.value.trim();
      if (!word) return;
      if (!keywordState[key].includes(word)) {
        keywordState[key].push(word);
        renderTags(key);
      }
      input.value = "";
      input.focus();
    };

    addBtn.addEventListener("click", add);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
      }
    });
  }
}

// ==================== 保存与加载 ====================
function collectSettings() {
  return {
    titleKeywords: joinKeywords(keywordState.titleKeywords),
    sectionKeywords: joinKeywords(keywordState.sectionKeywords),
    upKeywords: joinKeywords(keywordState.upKeywords),
    minDuration: document.getElementById("minDuration").value
      ? parseInt(document.getElementById("minDuration").value)
      : 0,
    cleanMode: document.getElementById("cleanMode").checked,
    paused: document.getElementById("paused").checked,
  };
}

function fillForm(data) {
  setKeywords("titleKeywords", data.titleKeywords);
  setKeywords("sectionKeywords", data.sectionKeywords);
  setKeywords("upKeywords", data.upKeywords);
  document.getElementById("minDuration").value = data.minDuration || "";
  document.getElementById("cleanMode").checked = !!data.cleanMode;
  setPaused(data.paused === true);
}

function setPaused(paused) {
  document.getElementById("paused").checked = paused;
}

function showStatus(text) {
  const status = document.getElementById("status");
  status.textContent = text;
  status.classList.add("show");
  setTimeout(() => status.classList.remove("show"), 2000);
}

// 保存按钮点击事件处理
document.getElementById("save").addEventListener("click", async () => {
  try {
    await window.syncManager.saveSettings(collectSettings());
    showStatus("设置已保存并同步！");
    updateSyncStatus();
  } catch (error) {
    console.error("保存设置失败:", error);
    showStatus("保存失败，请重试");
  }
});

// 暂停屏蔽开关：保存整个设置（含暂停状态），content.js 通过 storage.onChanged 实时响应
document.getElementById("paused").addEventListener("change", async (e) => {
  setPaused(e.target.checked);
  try {
    await window.syncManager.saveSettings(collectSettings());
    showStatus(e.target.checked ? "已暂停屏蔽" : "已恢复屏蔽");
  } catch (error) {
    console.error("保存暂停状态失败:", error);
    chrome.storage.local.set({ paused: e.target.checked });
  }
});

// 网页净化开关
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

// 页面加载时初始化
async function initializePopup() {
  try {
    // 初始化同步管理器
    await window.syncManager.getSyncEnabled();

    // 加载设置（会自动处理云端同步）
    const data = await window.syncManager.loadSettings();
    fillForm(data);
    updateSyncStatus();
  } catch (error) {
    console.error('初始化失败:', error);
    // 如果同步失败，回退到原来的本地加载方式
    chrome.storage.local.get(["titleKeywords", "sectionKeywords", "upKeywords", "minDuration", "cleanMode", "paused"], (data) => {
      fillForm(data);
    });
  }
}

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
    showStatus(e.target.checked ? "云端同步已启用" : "云端同步已禁用");
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
    fillForm(data);

    updateSyncStatus();
    showStatus("同步完成！");
  } catch (error) {
    console.error('手动同步失败:', error);
    showStatus("同步失败，请重试");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  initKeywordInputs();
  await initializePopup();

  // 初始化同步开关状态
  const syncEnabled = await window.syncManager.getSyncEnabled();
  document.getElementById("syncEnabled").checked = syncEnabled;
});
