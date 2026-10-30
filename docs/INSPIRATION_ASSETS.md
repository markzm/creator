# LoreLab 灵感库与图片素材

## 当前交付状态

页面、12 份文字灵感、四张公共摄影及创作流程已接入。九张原创插画已于 2026-10-30 全部生成并逐张检查：首页主视觉一张、场景四张、角色四张。欢迎页使用屋顶创作室主视觉，灵感库的十二张卡片均有配图，原创新角色可选择将插画作为参考立绘。

素材来源于静态目录；筛选、搜索、随机轮换和详情不会请求数据库或远程图库。`web/public/inspiration/assets.json` 记录实际存在的 WebP、尺寸及体积。只有目录中存在对应资源时才启用图片。

## 公共摄影来源

于 2026-10-30 核对来源。下列作品采用各平台的标准免费许可，在作品详情保留作者与原始链接。仅用于带有原创故事问题与设定种子的创作体验，不提供图库原图批量下载。

| 本地资源 ID | 作者 | 原始作品与许可 |
| --- | --- | --- |
| `mist-forest` | Adam Porter | [Forest covered fog during daytime](https://unsplash.com/photos/forest-covered-fog-during-daytime-iIK81QhpntA) · [Unsplash License](https://unsplash.com/license) |
| `neon-street` | Allen Boguslavsky | [A city street at night with a neon sign](https://unsplash.com/photos/a-city-street-at-night-with-a-neon-sign-y93fRKcMIZk) · [Unsplash License](https://unsplash.com/license) |
| `coastal-light` | Brittany Anger | [Lighthouse on a rocky coast with waves crashing](https://unsplash.com/photos/lighthouse-on-a-rocky-coast-with-waves-crashing-YrfCloTrZlA) · [Unsplash License](https://unsplash.com/license) |
| `misty-station` | Edwin Flores | [Foggy train station platform on a misty morning](https://www.pexels.com/photo/foggy-train-station-platform-on-a-misty-morning-28888431/) · [Pexels License](https://www.pexels.com/license/) |

下载的摄影原件保存在本机 `outputs/stock/`，不加入 Git。线上只使用裁剪、压缩后的站内 WebP。图片中的地点与招牌是摄影对象，卡片中的故事为虚构创作引导。

## 原创图片制作

九份提示词保存在 `outputs/imagegen/prompts/`。使用已安装的 `generate-gpt-image-2` 技能安全启动器及配套 Image API CLI；每个独立任务显式传入 `--model gpt-image-2 --quality high`，不会换用其他模型，不覆写已有原件。凭据由启动器读取本机环境或 Codex auth.json，不写进项目，也不放进命令参数。若凭据只在某个终端中 export，生成命令也需在同一个终端运行。

| 图片 | 原件文件名 | 原件尺寸 |
| --- | --- | --- |
| 星空下的屋顶创作室 | `rooftop-studio.png` | 1536×1024 |
| 浮空群岛 | `sky-islands.png` | 1536×1024 |
| 古树图书馆 | `tree-library.png` | 1536×1024 |
| 环轨星港 | `orbital-port.png` | 1536×1024 |
| 夏夜天台 | `summer-rooftop.png` | 1536×1024 |
| 巡林信使 | `forest-courier.png` | 1024×1536 |
| 星舰修理师 | `starship-mechanic.png` | 1024×1536 |
| 仿生档案员 | `android-archivist.png` | 1024×1536 |
| 深夜电台主持 | `midnight-host.png` | 1024×1536 |

原件与提示词的 SHA-256、图片尺寸及生成参数记录在 `outputs/imagegen/provenance.json`。这九张图片在前端标为“AI 原创插画”，生成过程不使用平台用户公共 AI 配额。

先生成并检查三张样图：

```bash
python3 scripts/generate-inspiration-images.py --only rooftop-studio sky-islands forest-courier
```

检查画风、构图与人物后制作其余图片，再构建 WebP：

```bash
python3 scripts/generate-inspiration-images.py
python3 scripts/build-inspiration-assets.py
```

脚本需要 Python 3 与 Pillow，以及已安装的图像技能运行环境。九张已验证的原创 PNG 存放于 `outputs/imagegen/`，与提示词、校验清单、构建脚本和优化资源一同纳入 Git；额外生成的本地草图和图库摄影原件仍被忽略。先完成主视觉、浮空群岛与巡林信使三张样图并确认画风，再生成其余六张。

构建脚本会保留并验证已提交的 WebP 素材。即使新检出的仓库没有本机摄影原件，也可追加生成图片，不会丢失既有摄影条目。

卡片缩略图为 640×400，竖版角色优先保留头部；星舰修理师额外保留头顶留白。详情图最长边 1440。首页主视觉提供 720×480 与 1440×960 两个尺寸，通过 `srcset` 响应式选择。缩略图预算 95,000 字节，详情图预算 280,000 字节；`build-inspiration-assets.py` 会在超出预算时失败。

## 创作与兼容

`/inspiration` 为公开路由。登录后先修改独立创作种子，再确认创建；AI 扩写只作用于种子缓冲区，复用现有预览与配额。模型只接收作者可见的文字描述和问题。

角色、世界观和场景以可选 `inspirationId` 保留来源。旧数据无需迁移数据库，前端规范化、备份和三路合并均支持该字段。角色可勾选使用原创立绘；场景和世界观保留可点击的来源卡。

```bash
npm run test --prefix web
npm run typecheck --prefix web
npm run typecheck:worker
npm run test:worker
npm run test:e2e:worker
```

端到端测试覆盖图片传输预算、无额外数据库请求、游客登录衔接、取消不落库、重复点击防重、AI 草稿、三类创作、深色与移动布局、图片失败降级及原有大厅回归。截图保存在 `artifacts/e2e/`。本次不修改生产数据库、不发布站点。

## 本轮验证记录（2026-10-30）

- 前端 82 项单测、前端与 Worker 类型检查、生产构建通过。
- Worker/D1 29 项集成测试通过；后端业务逻辑在本轮未改动。
- 全部原创图片接入后，生产构建与 12 项本地 Worker 浏览器测试再次通过（45.7 秒）。覆盖三类创作、原创角色参考立绘、AI 草稿确认、取消不落库、重复点击、游客登录衔接、平板布局、嵌套弹窗键盘操作，以及大厅搜索分页、请求乱序与私有内容权限回归。
- 九张 PNG 原件通过 Pillow、`file` 和 `sips` 格式与尺寸检查，并逐张目视检查画风、构图、人物与文字。
- 26 个 WebP 文件的格式、尺寸、字节数与清单一致，总计 2,885,512 字节。缩略图为 16,662–71,216 字节，均低于 100 KB；首页主视觉详情图为 206,244 字节，全部详情图最大 264,104 字节。
- 欢迎页图片资源通过 600 KiB 上限断言；灵感筛选与详情操作无新增 API 请求。检查了欢迎页、灵感库、总览和大厅的桌面、手机与平板截图，以及灵感库深色模式；布局没有横向溢出，角色缩略图保留完整面部。
- 早期模拟只包含已提交 WebP、没有原始图片的干净检出，构建后既有摄影素材记录保持完整。
- 修复了嵌套登录 / AI 弹窗的层级与焦点恢复，以及动态内容移除焦点后的 Esc 关闭行为。

截图索引：

| 页面 | 文件 |
| --- | --- |
| 欢迎页 | `artifacts/e2e/welcome-desktop.png`、`welcome-mobile.png` |
| 灵感库 | `artifacts/e2e/inspiration-desktop.png`、`inspiration-tablet.png`、`inspiration-mobile.png`、`inspiration-dark.png` |
| 登录后总览 | `artifacts/e2e/dashboard-desktop.png`、`dashboard-tablet.png` |
| 大厅回归 | `artifacts/e2e/lobby-desktop.png`、`lobby-mobile.png` |

截图由本地 Worker 浏览器测试生成；生产发布另行执行。
