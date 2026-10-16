# 记忆伙伴 (Memory Pal)

一个基于 Next.js + Supabase 的记忆助手项目。

## 环境要求

在开始之前，请确保你的电脑上已安装以下工具：

| 工具 | 版本要求 | 说明 |
|---|---|---|
| **Docker Desktop** | 最新版 | 必须处于运行状态，Supabase 本地环境依赖它 |
| **Node.js** | 20 或更高 | 用于运行前端和 Supabase CLI |
| **Git** | 最新版 | 用于克隆仓库 |

### 验证是否安装成功

```bash
docker --version      # 应输出版本号
docker info           # 应显示 Server 部分正常输出（不是连接失败）
node --version        # 应为 v20.x 或更高
git --version
