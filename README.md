# BiliBlock-通过关键词屏蔽B站视频

一个 Chrome 浏览器插件，用于屏蔽B站视频，只要标题中包含关键词的视频都会被屏蔽，目前支持了首页和热门页视频。  
已上架到浏览器插件商城：  
chrome应用商店地址：[BiliBlock-通过关键词屏蔽B站视频](https://chromewebstore.google.com/detail/biliblock-%E9%80%9A%E8%BF%87%E5%85%B3%E9%94%AE%E8%AF%8D%E5%B1%8F%E8%94%BDb%E7%AB%99%E8%A7%86%E9%A2%91/fhpfjgpkileoggjbochgnjcafenljcdg?utm_source=ext_app_menu)  
edge应用商店地址：[BiliBlock-通过关键词屏蔽B站视频](https://microsoftedge.microsoft.com/addons/detail/pikgbkepdblkkgdmebhckepfmpphbnim)  
火狐应用商店地址：[BiliBlock-通过关键词屏蔽B站视频](https://addons.mozilla.org/zh-CN/firefox/addon/biliblock-%E9%80%9A%E8%BF%87%E5%85%B3%E9%94%AE%E8%AF%8D%E5%B1%8F%E8%94%BDb%E7%AB%99%E8%A7%86%E9%A2%91)  

## 功能特性

- **关键词屏蔽**：根据用户输入的关键词，隐藏 B 站页面中包含指定关键词的视频。
- **自定义关键词**：通过插件弹窗设置关键词，实时保存并应用。
- **动态页面支持**：支持滚动加载的 B 站页面，保证新加载的视频也能被屏蔽。
- **域名限制**：插件仅在 `bilibili.com` 域名下运行，避免对其他网站的影响。

## 安装方法
1. 克隆项目到本地：
   ```
   git clone https://github.com/DemoJ/BiliBlock
   ```
2. 打开 Chrome 扩展程序页面：
3. 在浏览器地址栏输入 chrome://extensions/。
4. 开启 开发者模式。
5. 点击 加载已解压的扩展程序，选择项目所在的文件夹。
6. 安装完成后，点击浏览器右上角插件图标即可使用。

## 使用方法
1. 打开 Bilibili 网站。
2. 点击浏览器右上角插件图标，打开设置界面。
3. 在输入框中输入需要屏蔽的关键词，多个关键词用 | 分隔，例如：
    ```
    广告|推广|挑战
    ```
4. 点击保存按钮，返回 B 站页面，即可看到包含指定关键词的视频被隐藏。
