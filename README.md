# Three.js 射箭对抗游戏 MVP

一个基于 `Three.js + TypeScript + Vite + Rapier` 的网页端第三人称战术射箭原型。核心玩法是掩体对抗、弓箭抛物线射击、蹲下与探头博弈，以及与多名 Bot 的小地图战斗。

## 在线试玩

在线地址：<https://ji-yuhang.github.io/shooting-game/>

如果页面还没有出现，先确认仓库的 GitHub Pages 已启用 `GitHub Actions` 发布，并等待最新一次工作流执行完成。

## 当前玩法

- 你将以第三人称视角进入一张小型静态地图。
- 地图中有墙体、石头、树木等障碍物，可以用来遮挡箭矢和视线。
- 你的主要目标是利用掩体、瞄准、蓄力和走位，击败场上的 Bot。
- Bot 会主动进攻、换位、压制、救援倒地队友，并在部分场景下使用烟雾弹。
- 敌人被打空血量后不会立刻消失，而是先进入倒地状态；若继续受到伤害，会彻底死亡并在原地留下箱子。

## 操作说明

- `W / A / S / D`：移动
- `鼠标`：调整视野
- `右键`：进入瞄准
- `左键按住`：蓄力
- `左键松开`：发射箭矢
- `C` 或 `Ctrl`：蹲下
- `Q / E`：左右探头
- `G`：投掷烟雾弹
- `Alt`：自由观察
- `R`：重开
- `Esc`：暂停或释放鼠标锁定

## 战斗提示

- 近距离不需要长时间蓄力，可以快速出箭。
- 中远距离更依赖蓄力和抛物线预判。
- `mid` 高度的掩体不一定能完全挡住站立状态的头部，必要时请配合蹲下。
- 进入烟雾区域后视野会明显受阻，最好尽快转移到烟雾边缘重新观察。
- 小地图在右下角，可以用来确认自己的位置、敌人方向和敌方死亡点。

## 本地运行

先安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

构建生产版本：

```bash
npm run build
```

## 发布到 GitHub Pages

本仓库已经包含 GitHub Pages 自动部署工作流：

- 工作流文件：[`/.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)
- Vite Pages 路径配置：[`/vite.config.ts`](./vite.config.ts)

发布步骤：

1. 将代码推送到 `main` 分支。
2. 打开 GitHub 仓库的 `Settings`。
3. 进入 `Pages`。
4. 在 `Build and deployment` 中将 `Source` 设为 `GitHub Actions`。
5. 等待 Actions 完成部署。

部署完成后，默认访问地址为：

<https://ji-yuhang.github.io/shooting-game/>

## 技术栈

- `Three.js`
- `TypeScript`
- `Vite`
- `@dimforge/rapier3d-compat`
- 原生 HTML/CSS HUD

## 当前状态

这是一个可玩的 MVP，不是完整正式版。当前重点是验证以下体验是否成立：

- 第三人称移动与视野控制
- 掩体战与遮挡判定
- 弓箭蓄力、抛射与命中反馈
- Bot 的进攻、倒地、救援和烟雾协同

后续可以继续扩展更完整的角色动画、更强的 AI、更复杂地图，以及多人对战能力。
