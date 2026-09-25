# 忆伴项目 Git 提交记录说明

## 一、项目提交历史总览

- **总提交数：** 66 条
- **时间跨度：** 2026-09-22 至 2026-09-23
- **提交规范：** Conventional Commits

### 提交类型分布

| 类型 | 数量 | 占比 |
|---|---:|---:|
| feat | 41 | 62.1% |
| fix | 17 | 25.8% |
| chore | 5 | 7.6% |
| test | 2 | 3.0% |
| docs | 1 | 1.5% |
| **合计** | **66** | **100%** |

全部提交均具有明确的 Conventional Commits 前缀，提交信息能够反映对应的功能开发、缺陷修复、工程配置、测试或文档变更。

## 二、按阶段归纳的提交记录

### 阶段一：技术验证与核心逻辑跑通

**时间范围：** 2026-09-22

**关键提交：**

- `7afe6b1` docs: add AGENTS.md
- `6fb8e53` feat: add DeepSeek API test script
- `e2041d5` feat: add SiliconFlow embedding test script
- `f0b4c6d` feat: add Supabase RAG test script
- `9b92a96` feat: add complete RAG conversation script

**完成功能：**

通过独立脚本验证 DeepSeek 对话、SiliconFlow embedding 和 Supabase pgvector 检索，完成从用户输入到检索增强回复的核心链路。该阶段同时建立语气安全、禁止编造当前状态和多场景回复约束，解决早期 AI 回复不稳定、容易编造事实的问题。

### 阶段二：患者端页面与 Chat API

**时间范围：** 2026-09-22

**关键提交：**

- `bb73407` chore: initialize Next.js web app
- `4300678` feat: add patient chat page skeleton
- `ba50369` feat: add patient chat API route
- `6be60b7` feat: connect patient page to chat api
- `84a0fce` fix: filter memories and improve patient chat UX

**完成功能：**

初始化 Next.js 与 Tailwind，并完成患者端页面骨架、Chat API 和前后端调用闭环。该阶段完善了记忆检索过滤、自动滚动、输入焦点和对话体验，为后续完整患者端奠定基础。

### 阶段三：日期记忆、家属记忆与日报雏形

**时间范围：** 2026-09-22

**关键提交：**

- `42e2a1d` feat: handle date questions and store shared memories
- `fb5094a` feat: add family memory management page
- `b3fbeb0` feat: enrich family memories with metadata
- `adc75e1` feat: add family memory report
- `cb66f84` fix: make family report advice third-person

**完成功能：**

扩展日期类意图识别，并将患者分享的故事自动写入 memories。家属端开始具备记忆录入、情绪与实体展示和日报生成能力，同时修正日报建议的第二人称问题。

### 阶段四：登录鉴权与多患者绑定

**时间范围：** 2026-09-22

**关键提交：**

- `d464335` feat: add phone-based auth login page
- `4e67ffb` feat: add authenticated home routing
- `f98b5d8` feat: add family patient binding flow
- `afb3d12` feat: add multi-patient management
- `0947930` fix: add patient switching navigation

**完成功能：**

引入手机号虚拟邮箱登录、Supabase Auth 会话和登录后主页分流。家属端支持绑定及管理多个长辈，并通过 `current_patient_id` 切换当前长辈，患者端接入真实患者 ID。

### 阶段五：家属端运营能力与交互完善

**时间范围：** 2026-09-22

**关键提交：**

- `3718056` feat: add family bottom navigation
- `160ac69` feat: add family settings page
- `7915f2d` feat: cache daily report advice
- `4db4eeb` feat: add family analytics dashboard
- `9a22f26` feat: add patient voice input

**完成功能：**

家属端补齐底部导航、设置页、日报缓存和大屏统计，患者端加入浏览器语音输入。期间还完成记忆编辑删除、患者切换跳转和操作体验修复，使患者端与家属端功能趋于完整。

### 阶段六：记忆详情、导出与数据可视化

**时间范围：** 2026-09-22

**关键提交：**

- `3e2c6fb` feat: add memory detail API and page
- `5c30281` feat: add report history
- `c22f8fd` feat: add markdown patient data export
- `c86197f` feat: add patient today view
- `3bc7279` feat: expand family analytics dimensions

**完成功能：**

增加记忆详情、被问次数和最后提问时间，并完成日报历史、Markdown 导出和患者端“今天”视图。统计页进一步扩展到情绪趋势、记忆增长、高频话题和活跃时段。

### 阶段七：部署适配、缓存与记忆质量增强

**时间范围：** 2026-09-22 至 2026-09-23

**关键提交：**

- `96ce002` fix: use smart Supabase DNS client on server
- `9e4f978` fix: expose Supabase config to browser clients
- `fc4878b` feat: add memory extraction schema fields
- `8bca7a5` feat: strengthen memory extraction schema
- `bce9bd7` fix: keep legacy memories at similarity threshold

**完成功能：**

适配 EdgeOne 部署，解决 Supabase 域名解析与浏览器环境变量问题。记忆提取升级为严格 JSON Schema，新增 confidence、source_text、source_offset，并围绕低置信度过滤、旧数据兼容和高置信度排序持续优化检索质量。

### 阶段八：意图识别、主动关心与 Qwen 切换

**时间范围：** 2026-09-23

**关键提交：**

- `3485b2c` feat: add intent-aware memory entity filtering
- `7ff7f1a` feat: extend replies and allow active care
- `1b31495` test: add Qwen capability probe
- `940badd` feat: switch chat API to Qwen

**完成功能：**

增加 location、person 等意图分类和实体匹配，避免地点、人物问题错误套用泛化回忆。回复长度扩展至 100 字，并允许针对孤独、怀念、悲伤加入主动关心；最后通过能力测试验证千问 JSON 模式，并将 Chat API 切换到 Qwen。

## 三、提交规范说明

项目使用 Conventional Commits 规范，提交信息格式为：

```text
<type>: <description>
```

本项目实际使用的类型如下：

| 类型 | 含义 | 使用场景 |
|---|---|---|
| feat | 新功能 | 新增页面、API、核心能力或用户功能 |
| fix | 缺陷修复 | 修复逻辑错误、交互问题或数据过滤问题 |
| chore | 工程维护 | 初始化项目、忽略文件、文案清理等非业务变更 |
| docs | 文档 | 新增或更新项目说明文档 |
| test | 测试 | 新增测试脚本、能力验证或测试配置 |

规范的提交前缀有助于追踪功能演进、定位问题来源和生成阶段性开发记录。

## 四、开发过程简述

项目从独立 API 验证脚本起步，先跑通 DeepSeek、SiliconFlow 与 Supabase RAG 链路，再构建 Next.js 患者端与家属端。随后补齐登录、患者绑定、记忆管理、日报、统计、导出与语音能力，并通过缓存和意图识别持续优化体验。最终完成部署适配、严格记忆提取、实体过滤与千问模型切换，形成从技术验证到完整产品闭环的演进。

本提交记录说明由项目真实 Git 历史整理生成，未做任何删改。