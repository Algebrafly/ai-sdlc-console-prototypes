# impl-08 安全、脱敏与合规

> 版本：v1.0 ｜ 对应设计方案 v1.0（第 2.3 节安全红线、第 4.2 节技术选型）｜ 日期：2026-09-24

## 本篇范围

本篇定义平台**代码与数据安全**的完整实现：出网开关的端到端生效链路、脱敏规则引擎（SEC-MASK-2.1）、最小化上传边界、审计日志字段与留存策略、SSO/OAuth2 与 RBAC、私有化部署的网络拓扑与密钥管理，以及可逐条勾选的合规检查清单。

本篇**不**覆盖：

- 插件侧的采集与切片实现 → 见 `impl-06-ide-plugin.md`（本篇只定义「边界与校验点」）
- 状态机迁移守卫的业务阈值 → 见 `impl-03-state-machine.md`
- 表结构与分区 DDL 细节 → 见 `impl-04-data-model.md`（本篇只补充 `audit_log` 的写入方与留存口径）
- 外部系统同步的鉴权凭据轮转流程 → 见 `impl-05-integration.md`

## 关联文档

| 文档 | 与本篇的关系 |
|:---|:---|
| `docs/AI研发平台设计方案.md` | 红线来源：2.3 节「最小化上传 / 上下文脱敏 / 出网开关 / 全程审计」 |
| `impl-00-overview.md` | 私有化 VPC 与 SaaS 双形态的密钥/出网差异（5 节） |
| `impl-01-protocol.md` | `SDLC-SEC-403`、`SDLC-SEC-413`、`SDLC-AUTH-*`、`SDLC-AUDIT-403` 错误码；`/security`、`/rbac`、`/sso`、`/audit` 端点 |
| `impl-04-data-model.md` | `audit_log` 表结构与分区/归档策略（3.18、6 节） |
| `impl-06-ide-plugin.md` | 客户端预脱敏与切片上限（本篇为其权威边界） |
| `impl-09-roadmap.md` | 安全相关里程碑（P0 出网开关、P2 审计与合规） |

---

## 1. 安全红线与设计目标

设计方案的 4 条红线（2.3 节）在本篇逐条落为可实施机制：

| 红线 | 落地机制 | 权威校验点 | 违反时的可观测信号 |
|:---|:---|:---|:---|
| 最小化上传 | 方法级切片 + 总量上限 2 MB / 5,000 行 + 符号表只出名称 | `api-gateway` 入站校验（CP-2） | 拒绝计数 `sdlc_sec_reject_total{reason="slice_limit"}` |
| 上下文脱敏 | SEC-MASK-2.1 规则引擎（8 条字段级 + 1 条代码级） | `api-gateway` 脱敏中间件（CP-3） | 覆盖率告警：`redact_skipped_total` 上升 |
| 出网开关 | 三档策略 `ALLOW`/`MASK`/`DENY` + 强制内网模型 | `model-gateway` 路由前（CP-4/CP-5） | `sdlc_egress_block_total` 上升 |
| 全程审计 | 所有上传/AI 调用/状态迁移/配置变更/身份认证留痕，只追加 | `audit_log` 写入 + 分区只追加约束 | 审计断链检测告警（哈希链校验失败） |

附加设计目标：

| 目标 | 取值 | 说明 |
|:---|:---|:---|
| 审计留存 | 热 6 个月在线 + 温 12 个月 + 冷 3 年（对象存储） | 与 `impl-04 §6` 分区归档一致；满足 G6 门禁「日志留存 ≥ 180 天」 |
| 审计完整性 | 相邻记录哈希链（`prev_hash` → `record_hash`） | 防止 DBA 直接改行；每日凌晨校验一次 |
| 最小权限 | 默认拒绝（deny by default） | RBAC 任一维度未显式授权即为 `none` |
| 会话安全 | accessToken 900s / refreshToken 7 天单次轮换 / 空闲 480 min 失效 | 与 `impl-01 §5.1`、`ssoStatus` 一致 |
| 密钥 | 平台不落明文；私有化用客户 KMS/Vault，SaaS 用平台 KMS 信封加密 | 见 §7.2 |

---

## 2. 出网开关的端到端生效链路

### 2.1 三档策略定义（源：`data.ts` `egressPolicy`，逐字对齐）

| 策略 id | `code` | 名称 | `allowExternalModel` | `allowRawData` | `maxSecretLevel` | 绑定环境 | 语义 |
|:---|:---|:---|:---:|:---:|:---|:---|:---|
| `EGRESS-ALLOW` | `ALLOW` | 允许出域 | true | true | `L1` | `env-dev` | 允许调用外部公有云模型，仅限 L1 公开级数据与代码 |
| `EGRESS-MASK` | `MASK` | 脱敏后允许出域 | true | false | `L2` | `env-test` | 出域前强制脱敏（SEC-MASK-2.1），禁止原始 PII 与生产数据 |
| `EGRESS-DENY` | `DENY` | 禁止出域 | false | false | `L3` | `env-staging`、`env-prod` | 禁止任何数据出域，模型路由强制切换为内网私有化 `mdl-local` |

环境绑定关系以 `ENVIRONMENTS[].egressPolicyId` 为准：

| 环境 | `id` | 名称 | 出域策略 | 允许模型集 |
|:---|:---|:---|:---|:---|
| `env-dev` | DEV | 开发环境 | `EGRESS-ALLOW` | `mdl-claude`、`mdl-deepseek`、`mdl-qwen`、`mdl-gpt5`、`mdl-local` |
| `env-test` | TEST | 测试环境 | `EGRESS-MASK` | 同上（出域前脱敏） |
| `env-staging` | STAGING | 预发环境 | `EGRESS-DENY` | 仅 `mdl-local` |
| `env-prod` | PROD | 生产环境 | `EGRESS-DENY` | 仅 `mdl-local` |

### 2.2 生效链路（配置 → 校验）

```
[配置面]  PUT /api/v1/security/egress {mode, expectedVersion}
              │  写 platform_config(key='security.egress') + 广播 sdlc.security.egress_changed
              ▼
[环境面]  ENVIRONMENTS[].egressPolicyId  ──►  会话建立时随 client.hello.payload 携带 envId
              ▼
[内容面]  IDE / Web 采集 → 客户端预脱敏 → context.push / POST /tasks/{id}/context-slices
              ▼
[入站面]  api-gateway：CP-2 切片限额  →  CP-3 脱敏引擎（MASK 档强制）
              ▼
[路由面]  model-gateway：CP-4 出域策略判定  →  CP-5 白名单出口代理
              ▼
[留痕面]  CP-6 写 audit_log（category='上传上下文' / 'AI 调用'，含 traceId、命中规则、策略档位）
```

### 2.3 校验点清单

| 校验点 | 位置 | 判定 | 命中结果 | 错误码 |
|:---|:---|:---|:---|:---|
| CP-1 | IDE 插件（本地） | 出网开关关闭（`allowRawData=false` 且用户关闭「允许代码上传」） | 仅上传任务元数据与统计，**不产生** `slices` 字段 | 本地阻断，无报文 |
| CP-2 | `api-gateway` 入站 | 切片总量 > 2 MB 或 > 5,000 行 | 拒绝整批，返回已接受数 | `SDLC-SEC-413` |
| CP-2b | `api-gateway` 入站 | `egressPolicyId=DENY` 时请求体含非空 `slices[].content` | 丢弃内容仅留元数据，记 `result='denied'` | `SDLC-SEC-403` |
| CP-3 | `api-gateway` 脱敏中间件 | `mode=MASK` 且规则命中未能脱敏（正则异常/编码不可解析） | 拒绝转发该切片（fail-closed） | `SDLC-SEC-403`，`detail.reason='mask-failed'` |
| CP-4 | `model-gateway` 路由前 | `mode=DENY` 且目标模型 `egress='禁止出域'` 之外的外部模型 | 强制改路由 `mdl-local`；若 `mdl-local` 不可用则拒绝 | `SDLC-SEC-403` |
| CP-5 | `model-gateway` 出口代理 | 目标域名不在出口白名单 | 连接拒绝，不重试其他外部模型 | `SDLC-SEC-403` |
| CP-6 | `audit` 写入 | 任一出域行为发生 | 写 `audit_log`，`trace_id` 贯穿全链路 | — |
| CP-7 | `wss-hub` 下行 | `DENY` 环境订阅含切片历史的消息 | 服务端静默过滤 `payload.slices` | — |

> 关键决策：**fail-closed**。脱敏链路任何异常（规则加载失败、正则超时 > 50 ms、编码不可解析）一律**拒绝出域**而非放行，理由是「漏脱敏的成本远高于拒绝一次请求」；被否方案为 fail-open + 事后告警（监管场景不可接受）。

### 2.4 出网开关的操作与校验

```bash
# 1) 读取当前档位（任一角色可读）
curl -s -H "Authorization: Bearer $TOKEN" https://console.artisan.internal/api/v1/security/egress
# → { "mode": "MASK", "allowExternalModel": true, "allowRawData": false,
#     "maxSecretLevel": "L2", "envIds": ["env-test"] }

# 2) 切到禁止出域（需 admin 权限 + 乐观锁）
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mode":"DENY","expectedVersion":3}' \
  https://console.artisan.internal/api/v1/security/egress
# → { "ok": true }

# 3) 变更必须落审计
curl -s -H "Authorization: Bearer $TOKEN" \
  'https://console.artisan.internal/api/v1/audit/logs?action=安全配置&to=2026-03-19T23:59:59%2B08:00' \
  | jq '.items[0] | {actorName, action, category, detail}'
```

未授权调用返回 `SDLC-SEC-403`；`expectedVersion` 不匹配返回 `SDLC-SEC-409`（防并发覆盖档位）。

---

## 3. 脱敏规则引擎（SEC-MASK-2.1）

### 3.1 引擎架构

| 组件 | 实现 | 说明 |
|:---|:---|:---|
| 规则表 | `platform_config`（`key='security.redact_rules'`，`value jsonb`） | 与 `audit_log` 同库；变更走 `/api/v1/security/redact-rules/{id}`，每次变更落审计 |
| 规则加载 | 进程启动加载 + `sdlc.security.rules_changed` 事件增量刷新 | 本地缓存 60s TTL，避免每请求读库 |
| 执行入口 | `api-gateway` 中间件（`ContentRedactor`） | 对 `payload.slices[].content`、`payload.logs`、通知模板变量统一处理 |
| 执行顺序 | ① 结构化字段精确匹配（`field`）→ ② 正则模式匹配（`pattern`）→ ③ 兜底高熵串检测 | 精确匹配优先，避免正则误伤结构化值 |
| 幂等性 | 已脱敏内容二次执行结果不变（掩码后不再匹配原模式） | 用固定占位符 `*` 与 `{{INTERNAL_ADDR}}`，不使用随机替换 |
| 性能护栏 | 单切片正则执行预算 50 ms；超时即 fail-closed | 防 ReDoS；正则均限制量词嵌套深度 ≤ 2 |

### 3.2 8 条字段级规则（源：`data.ts` `redactRules`，逐字对齐）

| 规则 | 名称 | `field` | `category` | `strategy` | 样例（前 → 后） | `scope` |
|:---|:---|:---|:---|:---|:---|:---|
| `rd-01` | 手机号掩码 | `receiverPhone` | 个人隐私 PII | 中间四位掩码 | `13815626621` → `138****6621` | 订单 / 客户 |
| `rd-02` | 身份证号掩码 | `buyerIdCard` | 个人隐私 PII | 保留前 6 后 4 | `330106199203124521` → `330106********4521` | 实名客户 |
| `rd-03` | 收货地址脱敏 | `receiverAddress` | 个人隐私 PII | 保留省市区，详细地址掩码 | `浙江省杭州市西湖区文三路 90 号 3 幢 501 室` → `浙江省杭州市西湖区****` | 订单 / 物流 |
| `rd-04` | 银行卡号掩码 | `payCardNo` | 金融信息 | 保留后四位 | `6222020200112233445` → `***************3445` | 支付 / 退款 |
| `rd-05` | 邮箱用户名掩码 | `buyerEmail` | 个人隐私 PII | 用户名部分掩码，保留域名 | `linshuyuan@example.com` → `lin***@example.com` | 通知 / 会员 |
| `rd-06` | 收货人姓名掩码 | `receiverName` | 个人隐私 PII | 保留姓氏 | `林书言` → `林**` | 订单 / 物流 |
| `rd-07` | 订单金额区间模糊 | `orderAmount` | 经营敏感 | 非授权角色按区间模糊 | `¥3,286.50` → `¥1,000~5,000` | 订单 / 报表 |
| `rd-08` | 访问令牌全量替换 | `apiToken` | 密钥凭证 | 全量替换仅留后缀 | `pc_live_8f3a9c2e7b14d05a6c88` → `pc_live_****c88` | 集成配置 / 日志 |

### 3.3 代码场景扩展规则（本篇新增 `rd-09`，供 `impl-06` 引用）

| 规则 | 名称 | `field`/`pattern` | `category` | `strategy` | 样例 |
|:---|:---|:---|:---|:---|:---|
| `rd-09` | 内网地址与连接串替换 | `(?i)(\d{1,3}\.){3}\d{1,3}(:\d+)?`、`(jdbc\|redis\|mongodb\|amqp)://[^\s"']+` | 密钥凭证 | 整体替换为占位符 | `redis://10.24.3.9:6379` → `redis://{{INTERNAL_ADDR}}` |

`rd-09` 的**权威判定在服务端**；`impl-06 §5.2` 中的客户端预脱敏仅为成本优化，两侧命中数不一致时产生 `SEC-WARN-1` 告警。

### 3.4 规则 DSL

```json
{
  "id": "rd-09",
  "name": "内网地址与连接串替换",
  "field": "content",
  "category": "密钥凭证",
  "strategy": "placeholder",
  "placeholder": "{{INTERNAL_ADDR}}",
  "pattern": "(?i)(jdbc|redis|mongodb|amqp)://[^\\s\"']+",
  "flags": "g",
  "maxNestingDepth": 2,
  "enabled": true,
  "note": "连接串整体替换，避免泄露拓扑；命中不保留后缀"
}
```

```typescript
// ContentRedactor 执行骨架（NestJS 中间件）
async function redact(content: string, ctx: { mode: EgressMode; roleId: string }): Promise<RedactResult> {
  if (ctx.mode === 'ALLOW') return { content, hits: [], redacted: false };
  let out = content, hits: string[] = [];
  for (const rule of loadedRules.filter(r => r.enabled)) {          // ① 精确字段 ② 正则 ③ 高熵兜底
    if (rule.strategy === 'range-fuzzy' && hasAmountPermission(ctx.roleId)) continue; // rd-07 例外
    const next = applyRule(rule, out, { budgetMs: 50 });            // 预算超时 → throw
    if (next.hit) { hits.push(rule.id); out = next.value; }
  }
  return { content: out, hits, redacted: hits.length > 0 };
}
```

### 3.5 命中统计与告警

| 指标 | 来源 | 告警规则 |
|:---|:---|:---|
| `redact_hits_total{rule_id}` | 引擎计数（对应 `redactRules[].hits`，如 `rd-01=8642`） | 单规则命中 24h 环比 +200% → 提示规则可能过宽 |
| `redact_skipped_total` | 脱敏被跳过（fail-closed 拒绝前的尝试） | 任意非零 → P2 告警（可能存在未覆盖字段） |
| `redact_revert_check_total` | 抽样 1% 出域内容反查原始模式 | 命中即 P1 告警（脱敏失效） |
| `SEC-WARN-1` | 服务端命中数 > 客户端 `redacted` 数 | 每次发生写入审计 `detail` |

---

## 4. 最小化上传边界

### 4.1 内容边界（允许 / 禁止出域）

| 数据类别 | `ALLOW` | `MASK` | `DENY` | 说明 |
|:---|:---:|:---:|:---:|:---|
| 任务元数据（id/标题/状态/负责人） | ✅ | ✅ | ✅ | 不含代码，任何档位可出域 |
| 代码切片（脱敏后） | ✅ | ✅ | ❌ | `DENY` 档仅保留切片元数据（路径哈希、行范围、`hash`） |
| 符号表（名称 + 签名） | ✅ | ✅ | ❌ | 只出名称与签名，不出实现体 |
| Git diff（脱敏后） | ✅ | ✅ | ❌ | `DENY` 档不出域 |
| 构建/测试日志 | ✅ | ✅（脱敏后） | ⚠️ 仅结构化结果 | `DENY` 档允许出域 `passed/failed/coverage`，不出原始日志 |
| 覆盖率报告 | ✅ | ✅ | ✅ | 仅百分比与类名统计 |
| 生产数据（DB 样例行） | ❌ | ❌ | ❌ | 任何档位禁止；需脱敏后的构造样本才可用于 RAG |
| 密钥 / 令牌 / 连接串 | ❌ | ❌ | ❌ | 命中 `rd-08`/`rd-09`，`ALLOW` 档同样拦截 |
| 完整仓库快照 | ❌ | ❌ | ❌ | 结构上不提供该接口 |

### 4.2 体积与结构边界

| 边界项 | 上限 | 校验点 | 超限行为 |
|:---|:---|:---|:---|
| 单任务切片总量 | 2 MB / 5,000 行 | CP-2 | `SDLC-SEC-413`，返回已接受数 |
| 单切片行数 | 200 行 | 客户端 `slice.ts` | 客户端自动裁剪（不出错） |
| 单次 `context.push` | 512 KB（gzip 前），≤ 200 切片 | 客户端 | 客户端分片 |
| 单日志制品 | 20 MB（gzip 后） | CP-2b | 头部截断至最后 8,000 行 |
| 文件路径出域 | 仓库相对路径 | 客户端 | 绝对路径含用户名时替换为 `{{HOME}}` |

---

## 5. 审计日志

### 5.1 字段定义（与 `impl-04 §3.18` 一致，此处补充写入方与取值域）

| 字段 | 类型 | 取值域 / 来源 | 写入方 |
|:---|:---|:---|:---|
| `id` | `uuid` | `gen_random_uuid()` | 全体服务 |
| `time` | `timestamptz` | 事件时刻（分区键，UTC 存储） | 全体服务 |
| `actor_id` | `uuid` | `app_user.id`；系统账号（如 `u-ai-copilot`）为非 SSO 账号 | 由 JWT `sub` 解析 |
| `actor_name` | `varchar(64)` | 冗余快照 | 同上 |
| `role_name` | `varchar(32)` | 命中角色，见 §6.2 | 同上 |
| `action` | `varchar(128)` | 人类可读动作，如「执行 G3 编码门禁判定」 | 各域 |
| `category` | `varchar(24)` | 10 类规范值（见 §5.2） | 各域 |
| `target_type` / `target_id` | `varchar(24)` | 如 `任务`/`TASK-2410`、`门禁`/`G5`、`发布单`/`REL-2403` | 各域 |
| `ip` | `inet` | 内网段 `10.24.x.x`；IDE 侧取隧道出口 IP | 网关填充 |
| `result` | `varchar(16)` | `success` / `denied` / `failed` | 各域 |
| `trace_id` | `varchar(64)` | 信封 `traceId`，与 `task_state_history` / `model_call_log` 同源 | 信封透传 |
| `detail` | `text` | 关键上下文（阈值、命中规则、失败原因） | 各域 |
| `prev_hash` / `record_hash` | `char(64)` | SHA-256 哈希链（本节扩展列） | 写入器统一计算 |

### 5.2 `category` 规范值（10 类）与 `data.ts` 原始取值映射

| 规范值 | 覆盖 `data.ts` 中观察到的原始 category | 典型 `action` |
|:---|:---|:---|
| `身份认证` | 身份认证 | 角色切换、MFA 校验、SSO 登录/登出 |
| `配置变更` | 安全配置、计划管理 | 出网档位切换、脱敏规则启停、RBAC 调整 |
| `上传上下文` | —（新增类别，用于 `context.push`） | 上传切片 N 片 / M 行、命中规则集合 |
| `AI 调用` | —（新增类别，用于 `model_call_log` 对应事件） | 模型调用 `mdl-claude`、Token 量、是否脱敏 |
| `状态迁移` | 任务流转、阻塞管理 | `dev` → `testGreen` |
| `外部同步` | 集成同步 | task #2401 回写 PingCode |
| `质量门禁` | 质量门禁 | 执行 G3 编码门禁判定（失败） |
| `发布审批` | 发布审批 | 判定 REL-2403 保持阻塞 |
| `代码变更` | 代码变更、数据导出 | 提交 MR-2410；导出审计流水 CSV |
| `需求评审` | 需求评审、架构评审、缺陷管理 | PRD 评审通过；BUG-1043 复现验证 |

> 映射规则：`data.ts` 的 22 个原始 category 收敛为 10 类，避免索引膨胀；**原始值保留在 `detail.rawCategory`**，控制台筛选以规范值为准。

### 5.3 留存与不可篡改

| 阶段 | 介质 | 时长 | 访问方式 |
|:---|:---|:---|:---|
| 热 | PG 在线分区（按月，`audit_log_YYYY_MM`） | 6 个月 | 控制台 + `GET /api/v1/audit/logs` |
| 温 | PG 低配实例 / 独立表空间 | 6 ~ 18 个月 | 仅 `admin` 角色 + 二次授权 |
| 冷 | 对象存储 Parquet（S3 兼容），按天分桶 | 至 3 年 | 工单申请 + 解密凭据，导出留痕 |

| 不可篡改措施 | 实现 |
|:---|:---|
| 只追加 | `audit_log` 不提供 `UPDATE`/`DELETE` 权限给应用账号；仅 `INSERT` |
| 哈希链 | `record_hash = sha256(prev_hash ‖ 规范化字段串)`；每分区首行 `prev_hash = sha256(上一分区末行 record_hash)` |
| 校验 | `pg_cron` 每日 01:30 全量校验当月分区，断链即 P0 告警并冻结归档作业 |
| 权限 | 查看审计需 `view` 且非 `own` 范围（`tester`/`product`/`architect`/`manager`/`ops`/`pmo` 为 `full`，`developer` 为 `own` 且不含审计域）；越权返回 `SDLC-AUDIT-403` |

### 5.4 必留痕事件清单

| 事件 | 触发方 | 必填字段 |
|:---|:---|:---|
| 出网档位变更 | `admin` | `before`/`after` mode、`expectedVersion`、`ip` |
| 脱敏规则启停/改策略 | `admin` | `ruleId`、`before`/`after` |
| 上下文切片上传 | IDE 插件 | `sessionId`、`slices` 数、行数、命中规则、`result` |
| 模型出域调用 | `model-gateway` | `modelId`、`tokenIn`/`tokenOut`、脱敏命中、`traceId` |
| 出域被拒 | `api-gateway`/`model-gateway` | 校验点编号（CP-2~CP-5）、`reason` |
| RBAC 矩阵变更 | `admin` | `roleId`、`permission`、`before`/`after` level |
| 审计流水导出 | 具备 `admin` | 时间范围、行数、导出格式、接收人 |
| 门禁豁免（waive） | 具备 `approve` | `gateId`、`reason`、`approverId` |

---

## 6. 身份认证与权限

### 6.1 SSO / OIDC（源：`data.ts` `ssoStatus`）

| 项 | 取值 |
|:---|:---|
| 启用 | `enabled=true` |
| 主渠道 | `飞书 SSO`（`sso-feishu`），协议 `OIDC` |
| Issuer | `https://open.feishu.cn/oidc/artisan` |
| 登录入口 | `https://console.artisan.internal/sso/feishu` |
| 备用渠道 | `企业 LDAP`（`sso-ldap`），协议 `LDAP v3`，状态「待命（备用）」，`enabled=false` |
| MFA | `mfaRequired=true`（**全部角色**强制，由 IdP 承担） |
| 强校验角色 | `enforcedRoles=['manager','ops','pmo']` |
| 会话超时 | `sessionTimeoutMin=480` |
| 绑定率 | `boundUserRate=90%`（9/10）；系统账号 `u-ai-copilot` 不参与 SSO 与 MFA |
| 目录对账 | 每 6 小时与平台用户目录全量对账 |

认证流程与令牌参数见 `impl-01 §5`（RS256、accessToken 900s、refreshToken 7 天单次轮换、grace 60s）。补充约束：

| 场景 | 处理 |
|:---|:---|
| IdP 断连 | LDAP 备用渠道接管登录（需 `admin` 手动开启），期间**禁止** `admin` 类配置变更 |
| 用户离职 | SCIM/事件回调 → 吊销全部令牌 + 断开 WSS + 其 `assignee_id` 置空（`ON DELETE SET NULL`） |
| 系统账号 | `u-ai-copilot` 使用 mTLS 客户端证书 + 固定 `service` 角色，仅可写 `audit_log`/`model_call_log` |

### 6.2 RBAC 矩阵（源：`data.ts` `rbacMatrix`，7 角色 × 4 权限）

授权级别：`full` 全部 ｜ `own` 本域 ｜ `readonly` 只读 ｜ `none` 无

| 角色 | `view` 数据查看 | `edit` 数据编辑 | `approve` 审批决策 | `admin` 平台管理 |
|:---|:---|:---|:---|:---|
| `manager` 研发管理者 | 全部 | 本域 | 全部 | 本域 |
| `product` 产品经理 | 全部 | 本域 | 需求验收 | 无 |
| `architect` 架构师 | 全部 | 本域 | 架构门禁 | 无 |
| `developer` 研发工程师 | 本域 | 本域 | 无 | 无 |
| `tester` 测试工程师 | 全部 | 本域 | 测试报告 | 无 |
| `ops` 运维工程师 | 全部 | 本域 | 发布审批 | 本域 |
| `pmo` 项目经理PMO | 全部 | 只读 | 无 | 本域 |

### 6.3 授权级别判定与 API 映射

| 级别 | 判定规则（以 `view` 为例） | 作用域口径 |
|:---|:---|:---|
| `full` | 放行，不附加 `WHERE` 条件 | 全租户 |
| `own` | 附加 `WHERE (assignee_id = :uid OR owner_id = :uid OR member_ids @> :uid)` | 本人负责/参与的对象 |
| `readonly` | 方法限制为 `GET`；`PUT/POST/DELETE` 返回 `SDLC-AUTH-403` | 同上 |
| `none` | 路由层直接拒绝 | — |

| 端点 | 最低要求 | 失败码 |
|:---|:---|:---|
| `GET /api/v1/tasks`、`/requirements`、`/bugs` | `view ∈ {full, own}` | `SDLC-AUTH-403` |
| `POST/PUT` 任务/需求/缺陷 | `edit ∈ {full, own}` | `SDLC-AUTH-403` |
| `POST /gates/{id}/waive`、`/releases/{id}/execute` | `approve ∈ {full, own}` | `SDLC-PIPE-403` |
| `PUT /security/egress`、`/security/redact-rules/{id}`、`/rbac/*` | `admin ∈ {full, own}` | `SDLC-SEC-403` |
| `GET /audit/logs` | `view=full` 或 `admin∈{full,own}` | `SDLC-AUDIT-403` |

> 决策：**权限判定只在 `api-gateway` 服务端执行**，前端隐藏入口仅为体验优化，不作为安全边界（被否方案：前端路由守卫 + 后端信任前端）。

---

## 7. 私有化部署网络拓扑与密钥管理

### 7.1 网络分区

```
┌─ DMZ（可对外）──────────────┐   ┌─ 应用区（仅内网）───────────────┐
│  Nginx / WAF  :443          │   │  web-console · api-gateway      │
│  SSO 回调端点               │◄─►│  wss-hub · state-machine        │
└─────────────────────────────┘   │  agent-orchestrator · rag-service│
                                   └───────────┬─────────────────────┘
┌─ 数据区（无出网）───────────┐               │
│  PostgreSQL 16(主备)        │◄──────────────┤
│  Redis 7(Sentinel)          │               │
│  MinIO(对象存储)            │               │
└─────────────────────────────┘               │
┌─ 模型区 ────────────────────┐               │
│  model-gateway :8083        │◄──────────────┘
│   ├─ mdl-local（内网推理集群）
│   └─ 出口代理（白名单）──► 外部模型端点（仅 ALLOW/MASK 档）
└─────────────────────────────┘
```

| 网络策略 | 规则 |
|:---|:---|
| 默认拒绝 | 应用区 → 外部：DENY；仅 `model-gateway` 可经出口代理访问白名单域名 |
| 数据区 | 无出网路由；仅应用区可访问 5432/6379/9000 |
| IDE 接入 | 经企业 VPN 或 WSS over TLS（`wss://`，强制 TLS 1.3）；不接受明文 `ws://` |
| 出口白名单 | 按模型厂商域名精确匹配（如 `api.anthropic.com`），不采用通配 `*` |
| 东西向 | K8s NetworkPolicy：仅允许声明的调用对（如 `agent-orchestrator → model-gateway:8083`） |

### 7.2 密钥分级与管理

| 密钥 | 存储 | 轮转周期 | 使用方 |
|:---|:---|:---|:---|
| 外部模型 API Key | 客户 KMS/Vault（私有化）/ 平台 KMS 信封加密（SaaS） | 90 天 | `model-gateway`（运行时解密，不落盘） |
| JWT 签名私钥（RS256） | KMS；公钥经 `/.well-known/jwks.json` 暴露 | 180 天（支持双 key 并行验签） | `api-gateway` |
| PingCode / GitLab / Jenkins 令牌 | Vault KV；`GET /integrations/pingcode/config` 仅返回 `tokenMasked` | 90 天 | `integration-adapter` |
| 数据库口令 | KMS 动态凭据（TTL 1 h） | 每小时 | 各服务 |
| 对象存储 | 预签名 URL（TTL ≤ 15 min），不发放长期 AK/SK | 每请求 | 制品上传/下载 |
| IDE 会话令牌 | 插件 `SecretStorage`/`PasswordSafe`；由 STS 换取，TTL ≤ 900s | 每会话 | `ide-plugin` |

### 7.3 IDE 侧短期凭据链路

```
IDE 插件（无模型密钥）
   │ ① 用户经 SSO 登录 → 获得 accessToken（900s）
   │ ② POST /api/v1/ai/sts  → { stsToken, expiresIn: 900, scope: ['model:invoke','context:push'] }
   │ ③ 调用 model-gateway：Authorization: Bearer <stsToken>
   ▼
model-gateway 校验 stsToken 的 scope 与 envId → 出域策略判定（CP-4/CP-5）→ 转发模型
```

| 约束 | 值 |
|:---|:---|
| `stsToken` TTL | ≤ 900 s（与 accessToken 同寿命，不签发长期凭据） |
| `scope` | 最小集合，按会话类型签发（只读会话不含 `context:push`） |
| 存储位置 | VS Code `SecretStorage` / JetBrains `PasswordSafe`；**禁止**写入工作区配置文件 |
| 泄露响应 | `admin` 可 `POST /api/v1/auth/revoke` 按 `jti` 即时吊销；吊销事件同步断开 WSS |

---

## 8. 合规检查清单

| 编号 | 检查项 | 判定证据 | 责任角色 |
|:---|:---|:---|:---|
| C-01 | 代码默认不出域 | `env-staging`/`env-prod` 下 `GET /security/egress` 返回 `DENY`，且外部模型调用返回 `SDLC-SEC-403` | `ops` + `admin` |
| C-02 | 出域内容可证明已脱敏 | 抽样 1% 出域内容的 `redact_revert_check` 全部无命中 | `admin` |
| C-03 | 审计留存 ≥ 180 天 | `audit_log` 分区存在且 `pg_cron` 归档日志连续，G6 门禁扫描通过 | `ops` |
| C-04 | 审计不可篡改 | 哈希链日校验报告连续 30 天无断链 | `ops` |
| C-05 | 最小权限 | `rbacMatrix` 与线上生效权限逐格比对一致；`developer` 无 `approve`/`admin` | `admin` |
| C-06 | 强身份认证 | SSO 绑定率 ≥ 90%，`enforcedRoles` 三角色 MFA 覆盖率 100% | `admin` |
| C-07 | 密钥无明文落盘 | 全量镜像扫描（`gitleaks`）无密钥；KMS 审计显示凭据轮转记录 | `ops` |
| C-08 | 出口白名单可审计 | 出口代理访问日志仅含白名单域名，无其他目标 | `ops` |
| C-09 | 会话安全 | accessToken ≤ 900 s、refresh 单次轮换、空闲 480 min 失效三项可在网关配置中读回 | `ops` |
| C-10 | 数据出境合规 | 使用外部模型的环境已签署数据处理协议（DPA），清单与 `egressPolicy` 绑定一致 | `manager` + 法务 |
| C-11 | 个人信息最小化 | `rd-01`~`rd-06` 六条 PII 规则 `enabled=true` 且命中计数非零（证明生效） | `admin` |
| C-12 | 渗透测试 | 上线前完成一轮外部渗透测试，高危项清零、中危项有整改计划与期限 | `ops` + 安全团队 |
| C-13 | 供应链 | 插件与后端依赖通过 SCA 扫描（无高危 CVE），镜像有签名并校验 | `ops` |
| C-14 | 门禁豁免可追溯 | 每次 `waive` 均有 `audit_log` 记录含审批人与理由 | `manager` |

---

## 9. 可验收标准

- [ ] §2.1 三档策略的 `code`/`allowExternalModel`/`allowRawData`/`maxSecretLevel`/`envIds` 与 `data.ts` `egressPolicy`、`ENVIRONMENTS[].egressPolicyId` 逐字一致。
- [ ] §2.3 校验点 CP-1~CP-7 均有「位置 / 判定 / 结果 / 错误码」，且使用的错误码全部已存在于 `impl-01 §4.10`（未新增未登记码）。
- [ ] fail-closed 决策在 §2.3 与 §3.1 两处一致声明，并给出被否方案（fail-open）。
- [ ] §3.2 八条规则与 `data.ts` `redactRules` 的 `id`/`name`/`field`/`category`/`strategy`/样例前后值完全一致。
- [ ] §3.3 的 `rd-09` 在 `impl-06 §5.2` 有对应引用，两处规则名与策略一致。
- [ ] §4.1 内容边界表 9 行均给出三档取值；「任何档位禁止」的行不少于 3 条（生产数据、密钥、全库快照）。
- [ ] §4.2 五个体积上限与 `impl-06 §5.3`、`impl-01`（`SDLC-SEC-413` 的 2 MB / 5,000 行）数值一致。
- [ ] §5.1 字段与 `impl-04 §3.18` 完全对齐，并新增 `prev_hash`/`record_hash` 两列的用途说明。
- [ ] §5.2 给出 22 个原始 category → 10 个规范值的可核对映射，映射后无遗漏项。
- [ ] §6.2 RBAC 矩阵 7×4 共 28 格与 `data.ts` `rbacMatrix` 逐格一致（含 `pmo.edit=readonly`、`ops.approve=本域`）。
- [ ] §6.1 的 8 个 SSO 取值（provider/protocol/issuer/mfaRequired/sessionTimeoutMin/boundUserRate/enforcedRoles/对账周期）与 `ssoStatus` 一致。
- [ ] §7.2 六类密钥均有「存储 / 轮转周期 / 使用方」；STS TTL ≤ 900 s 与 `impl-00 §5` 一致。
- [ ] §8 合规清单 14 项均给出**可采集的判定证据**（接口返回、扫描报告、审计查询），不存在无法验证的条目。
- [ ] 全文无「待补充 / TBD / 略」，所有策略数值均标注来源（`data.ts` 字段名或本文字段）。
