# 完整示例: 使用 QRSPI 实现用户认证功能

本示例演示如何使用 QRSPI Agent 工作流从零开始实现一个用户认证功能。

---

## 场景

你接到一个 feature ticket：

> **添加用户认证系统**
> - 支持邮箱 + 密码注册和登录
> - 支持 GitHub OAuth 登录
> - 需要 JWT token 管理
> - 密码需要加密存储

---

## Step 0: 初始化

```bash
cd my-project
qrspi init user-auth --root .
```

**输出目录结构:**
```
my-project/
├── src/                    # 你的项目代码
└── .qrspi/
    └── user-auth/
        ├── sessions/       # Session 历史
        ├── artifacts/      # 阶段产物
        ├── slices/         # 垂直切片
        └── state.json      # 当前状态
```

---

## Step 1: Q - Questions (提问)

### 获取 Prompt

```bash
qrspi prompt Q --render --input "添加用户认证系统，支持邮箱+密码和 GitHub OAuth，JWT token 管理"
```

### 渲染的 Prompt（直接发给 Claude Code）

```markdown
# 阶段: Q - Questions (提问)

## 角色
你是一个结构化编程 Agent，严格按照工作流阶段执行任务。

## 指令
1. 分析给定的 feature ticket 或需求描述
2. 识别实现该 feature 需要了解的所有技术信息
3. 产出 5-15 个具体的、可研究的技术问题
4. 每个问题必须指向代码库的某个具体方面（API、数据库、组件等）
5. 问题必须足够具体，能让 Agent 通过代码搜索找到答案
6. 不要包含任何实现建议或方案
7. 按依赖关系排序：基础架构问题在前，依赖问题在后

## 输出格式
```markdown
# 技术问题清单

## Feature 概述
[一句话描述这个 feature 的目标]

## 问题列表

### Q1: [问题标题]
- **目标**: [这个问题要解决什么]
- **搜索方向**: [应该在代码库的哪些地方找答案]
- **阻塞性**: [blocking/nice-to-have]

## 假设清单
[列出我们对当前系统的所有假设]

## 风险标记
[标记最高风险的不确定性]
```

## 验证标准
在提交输出前，检查以下内容:
1. 问题数量在 5-15 之间，少于 5 说明思考不够深入
2. 每个问题都有明确的搜索方向，不能是模糊提问
3. 没有任何实现建议混入
4. blocking 问题不超过 3 个

## 用户输入
添加用户认证系统，支持邮箱+密码和 GitHub OAuth，JWT token 管理

---
开始执行。严格按输出格式产出，不要添加格式外的内容。
```

### Agent 产出示例

```markdown
# 技术问题清单

## Feature 概述
为应用添加用户认证系统，支持邮箱+密码和 GitHub OAuth 两种登录方式。

## 问题列表

### Q1: 当前项目使用什么 Web 框架和路由系统？
- **目标**: 确定认证中间件的接入方式
- **搜索方向**: 查看 src/app.ts 或 main.ts，路由定义文件
- **阻塞性**: blocking

### Q2: 现有用户数据模型如何定义？
- **目标**: 确定是否需要迁移现有用户表
- **搜索方向**: 查看数据库模型文件，prisma schema 或 TypeORM 实体
- **阻塞性**: blocking

### Q3: 项目使用什么数据库和 ORM？
- **目标**: 确定密码存储和查询方式
- **搜索方向**: package.json 依赖，数据库配置文件
- **阻塞性**: blocking

### Q4: 现有的 session/token 管理机制是什么？
- **目标**: 确定 JWT 如何集成
- **搜索方向**: middleware 目录，auth 相关文件
- **阻塞性**: blocking

### Q5: 项目是否已有环境变量管理？
- **目标**: JWT secret 和 OAuth client ID 存储
- **搜索方向**: .env 文件，config 目录
- **阻塞性**: nice-to-have

### Q6: 前端登录 UI 的组件库和设计规范？
- **目标**: 登录表单的一致性
- **搜索方向**: components 目录，设计系统文件
- **阻塞性**: nice-to-have

## 假设清单
- 项目使用 Node.js/TypeScript
- 已有数据库连接配置
- 没有现有的认证系统
- 使用 bcrypt 进行密码哈希

## 风险标记
- ⚠️ 如果已有不兼容的用户系统，需要迁移策略
```

### 保存产物

将上述内容保存到 `.qrspi/user-auth/artifacts/Q_2026-04-22.md`

### 推进

```bash
qrspi advance
```

---

## Step 2: R - Research (研究)

### 获取 Prompt

```bash
qrspi prompt R --render
```

**注意:** R 阶段的 prompt 会自动加载 Q 阶段的产物作为上下文，但不会加载原始的 feature ticket —— 这是关键设计。

### Agent 执行

Claude Code 执行 `/research` 命令，逐一回答每个技术问题。

### 产出示例

```markdown
# 技术地图

## Q1: 当前项目使用什么 Web 框架和路由系统？
### 发现
- **相关文件**: `src/app.ts`, `src/routes/index.ts`
- **关键代码**: 使用 Express.js，路由通过 `Router` 模块化定义
- **数据流**: 请求 → app.ts → route handler → controller

### 验证
- **假设验证**: Node.js/TypeScript 确认 ✓
- **依赖项**: Express 4.18.x

## Q2: 现有用户数据模型如何定义？
### 发现
- **相关文件**: `src/models/User.ts`
- **关键代码**: 使用 Prisma ORM，User 模型已有 id, email, name 字段
- **数据流**: Prisma Client → PostgreSQL

### 验证
- **假设验证**: 已有 User 模型，但无 password 字段

## Q3: 项目使用什么数据库和 ORM？
### 发现
- **相关文件**: `prisma/schema.prisma`
- **关键代码**: PostgreSQL + Prisma ORM

### 验证
- **假设验证**: 确认 ✓

## 未解决问题
- Q6 需要前端代码进一步分析

## 意外发现
- User 模型已有 `createdAt` 和 `updatedAt` 字段
- 项目中没有现有的认证中间件
```

### 保存并推进

```bash
qrspi advance
```

---

## Step 3: D - Design Discussion (设计讨论）

**这是杠杆最高的阶段。**

### 获取 Prompt

```bash
qrspi prompt D --render
```

### 产出示例 (~200 行)

```markdown
# 设计讨论文档

## 1. 当前状态
系统使用 Express.js + Prisma + PostgreSQL。User 模型已有基本字段，
但没有认证相关字段。没有现有的认证中间件。

## 2. 期望最终状态
- 支持邮箱+密码注册/登录
- 支持 GitHub OAuth 登录
- JWT token 管理（access + refresh）
- 密码使用 bcrypt 加密

## 3. 设计决策

### 决策 1: 密码哈希策略
- **问题**: 如何安全存储密码
- **推荐方案**: bcrypt (cost factor 12)
- **备选方案 A**: Argon2 - 优点: 内存困难，更安全 缺点: 需要额外依赖
- **备选方案 B**: PBKDF2 - 优点: 广泛支持 缺点: 计算困难度不够
- **需要确认**: 是否接受 bcryptjs 作为依赖

### 决策 2: JWT 存储策略
- **问题**: token 存在哪
- **推荐方案**: HttpOnly cookie (access) + 数据库 (refresh)
- **备选方案 A**: localStorage - 优点: 简单 缺点: XSS 风险
- **备选方案 B**: 纯内存 - 优点: 最安全 缺点: 刷新丢失
- **需要确认**: 是否需要支持移动端（无 cookie）

### 决策 3: OAuth 流程
- **问题**: 如何处理 GitHub OAuth 回调
- **推荐方案**: 后端处理回调，统一返回 JWT
- **备选方案 A**: 前端处理 - 优点: 少一次跳转 缺点: secret 暴露风险
- **需要确认**: 是否已有前端路由处理回调 URL

## 4. 架构约束
- 必须兼容现有 User 模型
- 不能破坏现有 API
- 密码字段必须可空（OAuth 用户无密码）

## 5. 风险与缓解
- **风险**: 数据库迁移失败 → 缓解: 先备份，使用事务
- **风险**: JWT secret 泄露 → 缓解: 环境变量管理，定期轮换
```

### 人工 Review（脑外科手术）

工程师 review 后修改：
- 确认 bcrypt，但要求 cost factor 10（开发速度优先）
- 确认 HttpOnly cookie，暂不考虑移动端
- 要求 OAuth 回调使用 `/auth/github/callback`

### 保存修改后的产物并推进

```bash
qrspi advance
```

---

## Step 4: S - Structure Outline (结构大纲)

### 获取 Prompt

```bash
qrspi prompt S --render
```

### 产出示例

```markdown
# 结构大纲

## 类型定义
```typescript
interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  githubClientId: string;
  githubClientSecret: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface UserInput {
  email: string;
  password?: string;
  name?: string;
}
```

## 函数签名
```typescript
// 密码管理
function hashPassword(plain: string): Promise<string>;
function verifyPassword(plain: string, hash: string): Promise<boolean>;

// JWT 管理
function generateTokenPair(userId: string): Promise<TokenPair>;
function verifyAccessToken(token: string): Promise<JWTPayload>;
function refreshAccessToken(refreshToken: string): Promise<string>;

// 认证服务
function registerUser(input: UserInput): Promise<User>;
function loginUser(email: string, password: string): Promise<TokenPair>;
function githubOAuth(code: string): Promise<TokenPair>;

// 中间件
function authMiddleware(req: Request, res: Response, next: NextFunction): void;
```

## 垂直切片

### 切片 1: 数据库层 (Database)
- **目标**: 添加密码字段和 refresh token 表
- **入口**: Prisma schema 修改
- **出口**: 迁移完成，单元测试通过
- **函数**: hashPassword, verifyPassword
- **测试**: 密码哈希和验证

### 切片 2: API 层 (Mock API)
- **目标**: 实现认证端点（无 OAuth）
- **入口**: Express 路由定义
- **出口**: Postman 测试通过
- **函数**: registerUser, loginUser, generateTokenPair
- **测试**: 注册和登录流程

### 切片 3: OAuth 层 (OAuth)
- **目标**: 添加 GitHub OAuth
- **入口**: OAuth 回调路由
- **出口**: OAuth 登录流程完整
- **函数**: githubOAuth
- **测试**: OAuth 回调模拟

### 切片 4: 前端层 (Frontend)
- **目标**: 登录 UI 和 token 管理
- **入口**: 登录页面组件
- **出口**: 端到端测试通过
- **函数**: 前端 API 调用，token 刷新
- **测试**: 用户登录流程

## 依赖图
Database → Mock API → OAuth → Frontend
```

### 保存并推进

```bash
qrspi advance
```

---

## Step 5: P - Plan (计划)

### 获取 Prompt

```bash
qrspi prompt P --render
```

### 产出示例

```markdown
# 实施计划

## 切片 1: 数据库层
### 修改清单
| 文件 | 操作 | 内容 | 风险 |
|------|------|------|------|
| `prisma/schema.prisma` | modify | 添加 password 和 githubId 字段 | low |
| `prisma/schema.prisma` | modify | 添加 RefreshToken 模型 | low |
| `src/utils/password.ts` | add | bcrypt 封装函数 | low |

### 测试策略
- 运行 `npx jest src/utils/password.test.ts`
- 验证 bcrypt 哈希和比较

### 检查点
- [ ] 迁移成功执行
- [ ] 密码工具函数测试通过

## 切片 2: API 层
### 修改清单
| 文件 | 操作 | 内容 | 风险 |
|------|------|------|------|
| `src/config/auth.ts` | add | JWT 和 OAuth 配置 | medium |
| `src/services/auth.ts` | add | 认证业务逻辑 | medium |
| `src/routes/auth.ts` | add | 认证路由 | low |
| `src/middleware/auth.ts` | add | JWT 验证中间件 | high |

### 测试策略
- `curl -X POST http://localhost:3000/auth/register`
- `curl -X POST http://localhost:3000/auth/login`

### 检查点
- [ ] 注册流程端到端通过
- [ ] 登录返回 JWT token
- [ ] 受保护路由拒绝无 token 请求

## 回滚策略
如果迁移失败：
1. `npx prisma migrate resolve --rolled-back <migration>`
2. 恢复 schema 到上一版本
3. 重新部署

## 时间表估算
- 切片 1: 20 分钟
- 切片 2: 30 分钟
- 切片 3: 25 分钟
- 切片 4: 35 分钟
- 总计: ~2 小时
```

---

## Step 6: W - Work Tree (工作树)

### 创建切片

```bash
qrspi slice --add "database" --desc "添加密码字段和 refresh token 表" --order 1 --checkpoint "迁移成功，密码工具测试通过"
qrspi slice --add "mock-api" --desc "实现注册登录 API" --order 2 --checkpoint "curl 测试通过"
qrspi slice --add "oauth" --desc "GitHub OAuth 集成" --order 3 --checkpoint "OAuth 回调测试通过"
qrspi slice --add "frontend" --desc "登录 UI 和 token 管理" --order 4 --checkpoint "端到端测试通过"
```

---

## Step 7: I - Implement (实现)

### 关键原则：每个垂直切片独立 Session

**切片 1 - Database:**
```bash
# 新 Session，只加载 S 和 P 的产物
qrspi context  # 确认需要的 context
# 将切片 1 的 prompt 发给 Claude Code
# 完成后运行测试
npx jest src/utils/password.test.ts
# 保存产物
```

**检查点通过后:**
```bash
qrspi advance  # 或直接进入下一切片
```

**切片 2 - Mock API (新 Session):**
```bash
# 新 Session，加载 S, P 的产物 + 切片 1 的结果摘要
# 实现 API 层
# curl 测试
```

### Context 管理

```bash
# 监控 Context 使用情况
qrspi context

# 如果接近 40%，保存并切换 Session
```

---

## Step 8: PR - Pull Request

### 生成 PR 描述

```bash
qrspi prompt PR --render
```

### 产出示例

```markdown
# PR: 用户认证系统

## 变更摘要
添加完整的用户认证系统，支持邮箱+密码注册/登录和 GitHub OAuth。

## 修改清单
| 文件 | 变更 | 对应设计决策 |
|------|------|-------------|
| `prisma/schema.prisma` | modify | D-数据库设计 |
| `src/utils/password.ts` | add | D-密码哈希策略 |
| `src/config/auth.ts` | add | D-JWT 存储策略 |
| `src/services/auth.ts` | add | D-认证流程 |
| `src/routes/auth.ts` | add | S-API 设计 |
| `src/middleware/auth.ts` | add | D-JWT 验证 |

## 测试
- `npm test`
- 结果: pass
- 覆盖率: 87%

## Review 检查清单
- [ ] 函数签名与结构大纲一致
- [ ] 没有引入遗留模式
- [ ] 错误处理完整
- [ ] 性能影响评估通过

## 需要关注的代码
- `src/middleware/auth.ts:23` - JWT 验证逻辑
- `src/services/auth.ts:45` - OAuth 回调处理
```

### 人工 Review

工程师必须：
1. 阅读每个修改的文件
2. 确认设计决策的实现
3. 运行测试套件
4. 验证没有引入架构债务

---

## 完整时间线

| 阶段 | 时间 | 人工参与 |
|------|------|---------|
| Q - Questions | 10 min | 高（定义问题方向） |
| R - Research | 15 min | 中（review 发现） |
| D - Design | 25 min | **最高**（脑外科手术） |
| S - Structure | 15 min | 高（确认接口） |
| P - Plan | 10 min | 低（抽查） |
| W - Work Tree | 5 min | 低 |
| I - Implement | 40 min | 中（review 每切片） |
| PR | 15 min | **高**（拥有代码） |
| **总计** | **~2.5 小时** | **对齐占 60%** |

---

## 关键收获

1. **对齐占了 60% 的时间** — 但这是值得的，它防止了后期的返工
2. **实现只占了 25%** — AI 写得很快，但对齐确保写对
3. **每个垂直切片都是独立的** — 可以独立测试和回滚
4. **Context 从未超过 40%** — 通过频繁切换 Session 保持质量
