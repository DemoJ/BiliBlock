// 云端同步管理器
class SyncManager {
  constructor() {
    this.syncEnabled = true;
    this.lastSyncTime = 0;
    this.syncInProgress = false;
  }

  // 生成设置数据的版本信息
  createVersionedData(data) {
    return {
      ...data,
      version: Date.now(),
      deviceId: this.getDeviceId()
    };
  }

  // 获取设备标识（基于浏览器指纹）
  getDeviceId() {
    let deviceId = localStorage.getItem('biliblock_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('biliblock_device_id', deviceId);
    }
    return deviceId;
  }

  // 保存设置到本地和云端
  async saveSettings(settings) {
    if (this.syncInProgress) {
      console.log('同步正在进行中，跳过本次保存');
      return;
    }

    try {
      const versionedData = this.createVersionedData(settings);
      
      // 先保存到本地
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(versionedData, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 如果启用了同步，则同步到云端
      if (this.syncEnabled) {
        await this.syncToCloud(versionedData);
      }

      console.log('设置保存成功');
    } catch (error) {
      console.error('保存设置失败:', error);
      throw error;
    }
  }

  // 同步到云端
  async syncToCloud(data) {
    try {
      // chrome.storage.sync 有大小限制，需要检查数据大小
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 8192) { // chrome.storage.sync 单个项目限制为8KB
        console.warn('数据过大，无法同步到云端');
        return;
      }

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ biliblock_settings: data }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      this.lastSyncTime = Date.now();
      console.log('云端同步成功');
    } catch (error) {
      console.error('云端同步失败:', error);
      // 云端同步失败不影响本地使用
    }
  }

  // 从云端和本地加载设置，选择最新的版本
  async loadSettings() {
    if (this.syncInProgress) {
      console.log('同步正在进行中，使用本地设置');
      return this.loadLocalSettings();
    }

    this.syncInProgress = true;

    try {
      // 并行获取本地和云端设置
      const [localData, cloudData] = await Promise.all([
        this.loadLocalSettings(),
        this.loadCloudSettings()
      ]);

      // 比较版本，选择最新的设置
      const finalSettings = this.mergeSettings(localData, cloudData);
      
      // 如果云端设置更新，更新本地设置
      if (cloudData && cloudData.version > (localData.version || 0)) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set(finalSettings, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        console.log('已从云端更新本地设置');
      }
      // 如果本地设置更新，更新云端设置
      else if (localData && localData.version > (cloudData?.version || 0)) {
        await this.syncToCloud(finalSettings);
        console.log('已将本地设置同步到云端');
      }

      return finalSettings;
    } catch (error) {
      console.error('加载设置失败:', error);
      // 如果同步失败，返回本地设置
      return this.loadLocalSettings();
    } finally {
      this.syncInProgress = false;
    }
  }

  // 加载本地设置
  async loadLocalSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        "titleKeywords", 
        "sectionKeywords", 
        "upKeywords", 
        "minDuration", 
        "cleanMode", 
        "version", 
        "deviceId"
      ], (data) => {
        resolve(data);
      });
    });
  }

  // 加载云端设置
  async loadCloudSettings() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.sync.get(["biliblock_settings"], (data) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data.biliblock_settings || null);
          }
        });
      });
    } catch (error) {
      console.error('加载云端设置失败:', error);
      return null;
    }
  }

  // 合并本地和云端设置，选择最新版本
  mergeSettings(localData, cloudData) {
    // 如果只有一个数据源，直接返回
    if (!localData && !cloudData) {
      return {};
    }
    if (!localData) return cloudData;
    if (!cloudData) return localData;

    // 比较版本号
    const localVersion = localData.version || 0;
    const cloudVersion = cloudData.version || 0;

    if (cloudVersion > localVersion) {
      console.log('使用云端设置 (版本:', cloudVersion, '> 本地版本:', localVersion, ')');
      return cloudData;
    } else {
      console.log('使用本地设置 (版本:', localVersion, '>= 云端版本:', cloudVersion, ')');
      return localData;
    }
  }

  // 启用/禁用同步
  setSyncEnabled(enabled) {
    this.syncEnabled = enabled;
    chrome.storage.local.set({ syncEnabled: enabled });
  }

  // 获取同步状态
  async getSyncEnabled() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["syncEnabled"], (data) => {
        this.syncEnabled = data.syncEnabled !== false; // 默认启用
        resolve(this.syncEnabled);
      });
    });
  }

  // 手动触发同步
  async manualSync() {
    if (this.syncInProgress) {
      console.log('同步已在进行中');
      return;
    }

    try {
      const settings = await this.loadSettings();
      console.log('手动同步完成');
      return settings;
    } catch (error) {
      console.error('手动同步失败:', error);
      throw error;
    }
  }

  // 清除云端数据
  async clearCloudData() {
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.remove(["biliblock_settings"], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log('云端数据已清除');
    } catch (error) {
      console.error('清除云端数据失败:', error);
      throw error;
    }
  }

  // 获取同步状态信息
  async getSyncStatus() {
    try {
      const [localData, cloudData] = await Promise.all([
        this.loadLocalSettings(),
        this.loadCloudSettings()
      ]);

      return {
        syncEnabled: this.syncEnabled,
        hasLocalData: !!localData && Object.keys(localData).length > 0,
        hasCloudData: !!cloudData && Object.keys(cloudData).length > 0,
        localVersion: localData?.version || 0,
        cloudVersion: cloudData?.version || 0,
        lastSyncTime: this.lastSyncTime,
        deviceId: this.getDeviceId()
      };
    } catch (error) {
      console.error('获取同步状态失败:', error);
      return {
        syncEnabled: false,
        hasLocalData: false,
        hasCloudData: false,
        localVersion: 0,
        cloudVersion: 0,
        lastSyncTime: 0,
        deviceId: this.getDeviceId()
      };
    }
  }
}

// 创建全局同步管理器实例
window.syncManager = new SyncManager(); 