# impl-01 通信协议与接口契约

> 版本：v1.0 ｜ 对应设计方案 v1.0（第 2.1、7 节）｜ 日期：2026-09-24

## 本篇范围

本篇定义本地 IDE 插件 ↔ 云端、浏览器控制台 ↔ 云端之间的**全部通信契约**：

1. 统一消息信封 `{ msgId, type, payload, traceId }` 的字段、约束与示例；
2. WSS 双向消息类型全集（客户端→服务端 / 服务端→客户端）；
3. REST 接口清单（按域分组，含方法、路径、请求体、响应体、错误码）；
4. JWT 鉴权与刷新流程；
5. 消息重放与幂等；
6. 断线重连与补偿。

本篇**不**覆盖：状态迁移的守卫条件与事件主题内部语义（见 `impl-03-state-machine.md`）、Agent 的输入输出 Schema 细节（见 `impl-02-agents.md`）。

## 关联文档

| 文档 | 关系 |
|:---|:---|
| `impl-00-overview.md` | 组件清单、端口、API 前缀来源 |
| `impl-02-agents.md` | `agent.*` 消息的 payload 与 Agent 契约一致 |
| `impl-03-state-machine.md` | `task.transition.request` 的守卫与错误码与状态机一致 |
| `.trae/specs/design-ai-sdlc-console/spec.md` | 13 个页面的实时订阅需求来源 |

---

## 1. 协议基线

| 规范项 | 取值 | 说明 |
|:---|:---|:---|
| 传输 | WSS（双向）+ HTTPS REST | WSS 承载命令与状态推送；REST 承载请求-响应与查询 |
| AI 流式 | SSE（`text/event-stream`）或 WSS `agent.stream.chunk` | 控制台对话流用 SSE；IDE 面板用 WSS |
| 编码 | JSON（UTF-8），`Content-Type: application/json` | 二进制（制品/图片）走对象存储预签名 URL |
| REST 前缀 | `/api/v1/` | 控制面 API；与 `data.ts` 中业务系统契约 `/api/v2/orders*` 无关 |
| 事件主题 | `sdlc.<domain>.<event>` | 如 `sdlc.task.state_changed` |
| 时间格式 | ISO 8601 带时区，如 `2026-03-19T18:10:00+08:00` | 存储统一 UTC，展示按租户时区 |
| ID | uuid v7（时间有序） | 表主键与 `msgId` 统一 |
| 命名 | 字段 camelCase；数据库表/列 snake_case | 序列化层做转换 |
| 版本协商 | 信封 `version` 与 `client.hello.protocolVersion` | 当前 `1.0` |
| 错误码 | `SDLC-<DOMAIN>-<NNN>` | 见 §4.10 汇总 |

---

## 2. 统一消息信封

### 2.1 字段定义

| 字段 | 类型 | 必填 | 约束 | 说明 |
|:---|:---|:---:|:---|:---|
| `msgId` | string | 是 | uuid v7，全局唯一 | 幂等键与链路去重依据；服务端按 `msgId` 去重（见 §6） |
| `type` | string | 是 | `^[a-z]+(\.[a-z_]+)+$`，见 §3 全集 | 消息类型；未知类型返回 `SDLC-PROTO-400` |
| `payload` | object | 是 | 按 `type` 定义；未知字段忽略（前向兼容） | 业务负载 |
| `traceId` | string | 是 | 32 位 hex（W3C Trace Context 兼容） | 全链路追踪，贯穿 IDE→网关→Agent→模型→状态迁移 |
| `version` | string | 否 | 默认 `"1.0"` | 信封协议版本（扩展字段） |
| `seq` | integer | 否 | 单调递增，仅服务端下行状态事件携带 | 增量补偿游标（见 §7） |
| `ts` | string | 否 | ISO 8601 | 发送时刻；缺省由服务端补 |

> **契约约束**：`msgId` / `type` / `payload` / `traceId` 为**不可省略的四元组**；`version`/`seq`/`ts` 为可选扩展，接收方缺省处理不得报错。

### 2.2 完整示例

```json
{
  "msgId": "0192f3a1-8c4d-7b21-9e10-3f5a7c2d1b04",
  "type": "task.transition.request",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e70",
  "version": "1.0",
  "ts": "2026-03-19T18:10:00+08:00",
  "payload": {
    "taskId": "0192f3a1-1111-7000-8000-000000002401",
    "taskCode": "PC-ORD-2401",
    "from": "dev",
    "to": "testGreen",
    "actor": { "type": "agent", "id": "ag-code", "name": "编码实现 Agent" },
    "reason": "本地单测全绿：jest 248 passed / 0 failed，coverage 88.0%",
    "evidence": {
      "command": "mvn -q test",
      "exitCode": 0,
      "durationMs": 84200,
      "passed": 248,
      "failed": 0,
      "coverage": 88.0
    },
    "expectedVersion": 12,
    "idempotencyKey": "0192f3a1-8c4d-7b21-9e10-3f5a7c2d1b04"
  }
}
```

服务端成功应答（下行）：

```json
{
  "msgId": "0192f3a1-8c4d-7b21-9e10-3f5a7c2d1b05",
  "type": "task.state_changed",
  "traceId": "9f2c1a7e4b8d4c6a9e0f3b2d1a5c8e70",
  "seq": 1048576,
  "payload": {
    "taskId": "0192f3a1-1111-7000-8000-000000002401",
    "from": "dev",
    "to": "testGreen",
    "actor": { "type": "agent", "id": "ag-code" },
    "at": "2026-03-19T18:10:01+08:00",
    "pingcodeSynced": false
  }
}
```

---

## 3. WSS 双向消息类型全集

### 3.1 客户端 → 服务端

| `type` | 触发时机 | payload Schema（字段:类型） | 服务端应答 |
|:---|:---|:---|:---|
| `client.hello` | 连接建立后 3s 内必发 | `clientId:string, clientType:'vscode'\|'jetbrains'\|'web', protocolVersion:string, token:string, resumeFromSeq?:number, lastMsgId?:string` | `server.welcome` |
| `client.ping` | 每 25s 心跳 | `sentAt:string` | `server.pong` |
| `client.subscribe` | 进入页面/任务卡 | `topics:string[], filters?:object` | `server.subscribe.ack` |
| `client.unsubscribe` | 离开页面 | `topics:string[]` | `server.subscribe.ack` |
| `task.transition.request` | 用户/Agent 推进状态 | 见 §2.2 payload | `task.state_changed` 或 `error` |
| `agent.invoke` | 触发 Agent 执行 | `agentId:string, targetType:'task'\|'bug'\|'requirement'\|'release'\|'pipeline', targetId:string, intent:string, params?:object` | `agent.stream.chunk`* → `agent.result` |
| `agent.cancel` | 取消执行 | `runId:string, reason?:string` | `agent.result(status='cancelled')` |
| `context.push` | IDE 上传上下文切片 | `sessionId:string, slices:[{path:string, range:[number,number], symbol?:string, hash:string, redacted:boolean}]` | `server.ack` |
| `test.report` | 本地构建/测试完成 | `taskId:string, command:string, exitCode:number, durationMs:number, passed:number, failed:number, coverage:number, logRef:string` | `task.state_changed`（可能） |
| `coding.diff.decision` | 用户在 Diff 面板操作 | `sessionId:string, blockId:string, decision:'accept'\|'reject', scope:'all'\|'block'` | `server.ack` |
| `chat.message` | 对话输入 | `sessionId:string, content:string, attachments?:string[]` | `agent.stream.chunk`* |
| `approval.decide` | 审批/门禁放行 | `objectType:'gate'\|'release'\|'prd', objectId:string, decision:'approve'\|'reject', comment?:string` | `server.ack` |

### 3.2 服务端 → 客户端

| `type` | 触发时机 | payload Schema | 订阅主题 |
|:---|:---|:---|:---|
| `server.welcome` | 握手成功 | `serverTime:string, currentSeq:number, heartbeatSec:number, features:string[]` | — |
| `server.pong` | 收到 `client.ping` | `sentAt:string, serverTime:string` | — |
| `server.ack` | 幂等确认 | `ackMsgId:string, status:'ok'\|'duplicate'` | — |
| `server.subscribe.ack` | 订阅确认 | `topics:string[], snapshotSeq:number` | — |
| `task.state_changed` | 状态机迁移成功 | `taskId, from, to, actor, at, pingcodeSynced:boolean, seq` | `sdlc.task.*` |
| `agent.stream.chunk` | 流式产出 | `runId, delta:string, done:boolean, tokenOut:number` | `sdlc.agent.<runId>` |
| `agent.tool_call` | 工具调用 | `runId, tool:string, args:object, status:'start'\|'end', latencyMs?:number` | 同上 |
| `agent.result` | 执行结束 | `runId, agentId, status:'succeeded'\|'failed'\|'cancelled', output:object, tokenIn, tokenOut, latencyMs, degraded:boolean` | 同上 |
| `pipeline.stage_updated` | 流水线阶段变化 | `pipelineId, stageId, status, durationMs, logRef` | `sdlc.pipeline.*` |
| `gate.result` | 门禁判定 | `gateId, status:'passed'\|'failed'\|'pending'\|'waived', passRate, blocking, evidence:string[]` | `sdlc.gate.*` |
| `bug.created` | 缺陷建单 | `bugId, code, title, severity, priority, source, assigneeId` | `sdlc.bug.*` |
| `notify.push` | 通知下发 | `channel:'lark-card'\|'lark-group'\|'email'\|'webhook'\|'sms'\|'phone', receivers:string[], template:string, summary:string` | `sdlc.notify.*` |
| `sync.status` | 同步队列变化 | `counts:{pending,running,succeeded,failed}, item:{refId,status,attempts,message}` | `sdlc.sync.*` |
| `error` | 任何失败 | `code:string, message:string, retryable:boolean, detail?:object` | — |

> 主题通配：`sdlc.task.*` 指 `sdlc.task.state_changed` / `sdlc.task.assigned` / `sdlc.task.blocked`。

---

## 4. REST 接口契约清单

通用约定：请求头 `Authorization: Bearer <accessToken>`、`X-Trace-Id: <32hex>`（缺省服务端生成）；响应统一包 `{ "code": 0, "data": {...}, "traceId": "..." }`，失败 `code != 0` 且 `data.error = { code, message, retryable }`。

### 4.1 认证域 `/api/v1/auth`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| POST | `/auth/login` | `{ provider:'feishu'\|'ldap', code?:string, username?, password? }` | `{ accessToken, refreshToken, expiresIn:900, user:{id,name,roles[]} }` | `SDLC-AUTH-401`、`SDLC-AUTH-403` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken, expiresIn:900 }` | `SDLC-AUTH-401`、`SDLC-AUTH-409`（重放） |
| POST | `/auth/logout` | `{ refreshToken }` | `{ ok:true }` | `SDLC-AUTH-401` |
| GET | `/auth/me` | — | `{ id, name, roles[], permissions:{view,edit,approve,admin} }` | `SDLC-AUTH-401` |

### 4.2 需求域 `/api/v1/requirements`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/requirements?state=&ownerId=&sprintId=&q=&page=&size=` | — | `{ items:[Requirement], total, page }` | `SDLC-REQ-400` |
| POST | `/requirements` | `{ title, type:'功能需求'\|'非功能需求'\|'技术债'\|'合规需求', desc, priority, storyIds?[] }` | `{ id, code, state:'backlog' }` | `SDLC-REQ-422`、`SDLC-SYNC-409` |
| GET | `/requirements/{id}` | — | `Requirement` 全字段 | `SDLC-REQ-404` |
| PUT | `/requirements/{id}` | `{ title?, desc?, priority?, expectedVersion:number }` | `Requirement` | `SDLC-REQ-409`（版本冲突） |
| POST | `/requirements/{id}/decompose` | `{ targetProvider:'pingcode', storyIds?:string[] }` | `{ jobId, queued:number }` | `SDLC-REQ-409`、`SDLC-AGENT-503` |
| GET | `/prd-versions?requirementId=` | — | `{ items:[{version, author, status:'草稿'\|'评审中'\|'已确认'\|'已归档', at, diffSummary}] }` | `SDLC-REQ-404` |
| POST | `/prd-versions/{id}/reviews` | `{ reviewerId, comment, storyRef? }` | `{ reviewId, status:'待处理' }` | `SDLC-REQ-422` |
| POST | `/brainstorm/sessions` | `{ requirementId?, seed:string }` | `{ sessionId, streamUrl:'/api/v1/brainstorm/sessions/{id}/stream' }` | `SDLC-AGENT-503` |

### 4.3 任务域 `/api/v1/tasks`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/tasks?state=&ownerId=&sprintId=&priority=&q=&mine=&page=&size=` | — | `{ items:[Task], total, columns:{state:count} }` | `SDLC-TASK-400` |
| GET | `/tasks/{id}` | — | `Task` + `{ history:[], commits:[], sessions:[] }` | `SDLC-TASK-404` |
| POST | `/tasks` | `{ title, reqId, stageId, type, priority, ownerId, points, estimateHours, componentIds?[], apiIds?[] }` | `{ id, code, state:'taskCreated' }` | `SDLC-TASK-422`、`SDLC-SYNC-409` |
| PUT | `/tasks/{id}` | `{ ownerId?, priority?, estimateHours?, progress?, expectedVersion:number }` | `Task` | `SDLC-TASK-409` |
| POST | `/tasks/{id}/transitions` | `{ to, reason?, evidence?, expectedVersion }` | `{ from, to, at, historyId }` | `SDLC-STATE-409`（非法迁移）、`SDLC-STATE-422`（守卫失败） |
| GET | `/tasks/{id}/history?page=&size=` | — | `{ items:[{from,to,actorType,actorId,reason,at,traceId}] }` | `SDLC-TASK-404` |
| POST | `/tasks/{id}/context-slices` | `{ sessionId, slices:[...] }` | `{ accepted:number, redacted:number }` | `SDLC-SEC-413`（超切片上限） |
| GET | `/tasks/{id}/coding-session` | — | `{ sessionId, turns:[], diff:{files,additions,deletions,blocks[]} }` | `SDLC-TASK-404` |

### 4.4 流水线域 `/api/v1/pipelines`、`/releases`、`/environments`、`/gates`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/pipelines?taskId=&status=` | — | `{ items:[PipelineRun] }` | `SDLC-PIPE-400` |
| GET | `/pipelines/{id}` | — | `{ stages:[{id,name,status,durationMs,logRef}], gates:string[] }` | `SDLC-PIPE-404` |
| POST | `/pipelines/{id}/stages/{stageId}/retry` | `{ reason? }` | `{ accepted:true, attempt:number }` | `SDLC-PIPE-409`、`SDLC-PIPE-503` |
| GET | `/gates?stageId=` | — | `{ items:[Gate] }`（criteria/actual/status/blocking） | `SDLC-PIPE-404` |
| POST | `/gates/{gateId}/waive` | `{ approverId, reason, expectedVersion }` | `{ status:'waived' }` | `SDLC-PIPE-403`（无审批权）、`SDLC-PIPE-409` |
| GET | `/environments` | — | `{ items:[Env{code,name,version,health,qps,p95Ms,instances[]}] }` | `SDLC-PIPE-404` |
| GET | `/releases?status=` | — | `{ items:[ReleaseOrder{batches[],gateIds[],gateBlockedIds[]}] }` | `SDLC-PIPE-400` |
| POST | `/releases/{id}/execute` | `{ batch:number, operatorId }` | `{ accepted:true, batchStatus:'running' }` | `SDLC-PIPE-422`（门禁未过）、`SDLC-PIPE-403` |
| POST | `/releases/{id}/rollback` | `{ operatorId, reason }` | `{ accepted:true, rtoMin:number }` | `SDLC-PIPE-409` |

### 4.5 测试域 `/api/v1/test-cases`、`/test-plans`、`/test-reports`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/test-cases?moduleId=&priority=&source=&q=` | — | `{ tree:[Module], items:[TestCase] }` | `SDLC-TEST-400` |
| POST | `/test-cases/import` | `{ format:'xmind'\|'excel', fileRef:string, fieldMapping:object }` | `{ jobId, parsed:number, warnings:[] }` | `SDLC-TEST-422` |
| GET | `/test-cases/export?moduleId=&format=` | — | `{ fileRef, rows:number }` | `SDLC-TEST-404` |
| GET | `/test-plans?range=` | — | `{ items:[TestPlan{total,passed,failed,blocked,skipped,passRate}] }` | `SDLC-TEST-400` |
| POST | `/test-plans/{id}/execute` | `{ envId, trigger:'pipeline'\|'manual', caseIds?[] }` | `{ executionId, status:'running' }` | `SDLC-TEST-409` |
| GET | `/test-reports/{id}` | — | `{ conclusion:'通过'\|'不通过', gateVerdict, failures:[], defectDistribution[] }` | `SDLC-TEST-404` |

### 4.6 缺陷域 `/api/v1/bugs`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/bugs?severity=&status=&assigneeId=&q=` | — | `{ items:[Bug], stats:{bySeverity,byStatus} }` | `SDLC-BUG-400` |
| POST | `/bugs` | `{ title, severity, priority, source:'自动化测试'\|'人工', foundVersion, reqId?, caseIds?[] }` | `{ id, code, status:'新建' }` | `SDLC-BUG-422`、`SDLC-SYNC-409` |
| GET | `/bugs/{id}` | — | `Bug` + `{ timeline:[], notify:[] }` | `SDLC-BUG-404` |
| POST | `/bugs/{id}/analysis` | `{ agentId:'ag-review'\|'ag-ba'\|'ag-code' }` | `{ analysisId, rootCause, suspects:[{path,line,snippet}], suggestedAssignee:{userId,reason}, status:'analyzing' }` | `SDLC-AGENT-503` |
| POST | `/bugs/{id}/transitions` | `{ to, actor, comment?, expectedVersion }` | `{ from, to, at }` | `SDLC-BUG-409`（缺陷非法迁移 / 守卫失败，见 impl-03 §5.2）、`SDLC-TASK-409`（版本冲突） |
| POST | `/bugs/{id}/notify` | `{ channel, receivers:[], template }` | `{ notifyId, status:'queued' }` | `SDLC-NOTIFY-503` |

### 4.7 集成域 `/api/v1/integrations`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/integrations/providers` | — | `{ items:[{id,name,kind,endpoint,authType,connected,lastSyncAt}] }` | — |
| GET | `/integrations/pingcode/config` | — | `{ tenant,apiBase,projectId,authType,tokenMasked,syncMode,syncIntervalMin,twoWayState }` | `SDLC-INTG-404` |
| PUT | `/integrations/pingcode/config` | `{ apiBase?, token?, syncIntervalMin?, twoWayState?, writebackEnabled? }` | `{ ok:true, connectivity:'ok' }` | `SDLC-INTG-422`、`SDLC-INTG-502` |
| GET | `/integrations/pingcode/state-mappings` | — | `{ items:[{stateId,stateCode,stateName,pingcodeName,direction,syncMode,note}] }` | — |
| GET | `/integrations/id-mappings?entityType=&q=` | — | `{ items:[{platformId,platformTitle,pingcodeCode,syncStatus,syncedAt}] }` | — |
| GET | `/integrations/sync-queue` | — | `{ counts, throughputPerHour, avgLatencyMs, successRate, retrying:[], deadLetters:[], lastReconcile, writebacks:[] }` | — |
| POST | `/integrations/sync-queue/dead-letters/{id}/replay` | `{ operatorId }` | `{ accepted:true, itemId }` | `SDLC-INTG-409` |
| POST | `/integrations/reconcile` | `{ scope?:'task'\|'requirement'\|'bug'\|'sprint' }` | `{ jobId, checkedAt }` | `SDLC-INTG-503` |

### 4.8 AI 观测域 `/api/v1/ai`、`/metrics`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/ai/models` | — | `{ items:[{id,name,vendor,version,contextWindow,costPer1kTokens,deployment,egress,enabled,roles[]}] }` | — |
| GET | `/ai/routing-rules` | — | `{ items:[{id,name,scene,matchExpr,modelId,modelName,priority,fallbackModelId,enabled}] }` | — |
| GET | `/ai/model-stats?range=7d` | — | `{ range,totalCalls,totalTokensK,totalCost,avgLatencyMs,overallAcceptRate,byModel:[],trend:[] }` | `SDLC-AI-400` |
| GET | `/ai/agents` | — | `{ items:[{id,name,stageId,modelId,status,skills[],tools[],taskCount,successRate,acceptRate,avgDurationMin}] }` | — |
| GET | `/ai/traces?agentId=&targetType=&targetId=` | — | `{ items:[{id,agentId,modelId,targetType,targetId,steps[],tokenIn,tokenOut,latencyMs,result}] }` | — |
| GET | `/ai/rag/entries?category=&q=` | — | `{ items:[{id,kbId,title,category,source,chunks,tokensK,embedModel,hitCount,status}] }` | — |
| GET | `/metrics/overview` | — | `{ deliveredThisWeek, aiAcceptRate, buildPassRate, releaseSuccessRate, openDefects, tokenCost }` | — |
| GET | `/metrics/efficiency?range=7d\|30d\|quarter&dim=project\|team\|person` | — | `{ metrics:[], ranks:{deliveryTop5,defectDensityTop5}, trend:[] }` | `SDLC-AI-400` |

### 4.9 审计与安全域 `/api/v1/audit`、`/security`、`/rbac`、`/sso`

| 方法 | 路径 | 请求体 | 响应体 | 错误码 |
|:---|:---|:---|:---|:---|
| GET | `/audit/logs?from=&to=&action=&traceId=&page=` | — | `{ items:[{time,actorName,roleName,action,category,targetType,targetId,traceId,result}] }` | `SDLC-AUDIT-403` |
| GET | `/security/egress` | — | `{ mode:'ALLOW'\|'MASK'\|'DENY', allowExternalModel, allowRawData, maxSecretLevel, envIds[] }` | — |
| PUT | `/security/egress` | `{ mode, expectedVersion }` | `{ ok:true }` | `SDLC-SEC-403`、`SDLC-SEC-409` |
| GET | `/security/redact-rules` | — | `{ items:[{id,name,field,category,strategy,hits,enabled,note}] }` | — |
| PUT | `/security/redact-rules/{id}` | `{ enabled?, strategy?, expectedVersion }` | `{ ok:true }` | `SDLC-SEC-403` |
| GET | `/rbac/matrix` | — | `{ permissions:[], currentRoleId, rows:[{roleId,roleName,cells}] }` | — |
| GET | `/sso/status` | — | `{ enabled, primaryProvider, protocol, issuer, mfaRequired, sessionTimeoutMin, boundUserRate, providers:[] }` | — |

### 4.10 错误码汇总

| 错误码 | HTTP | 含义 | 可重试 |
|:---|:---:|:---|:---:|
| `SDLC-AUTH-401` | 401 | accessToken 过期或无效 | 是（先 refresh） |
| `SDLC-AUTH-403` | 403 | 角色无该操作权限（RBAC） | 否 |
| `SDLC-AUTH-409` | 409 | refreshToken 重放（已被轮换使用） | 否（强制重新登录） |
| `SDLC-PROTO-400` | 400 | 未知 `type` 或信封缺字段 | 否 |
| `SDLC-TASK-404` / `SDLC-REQ-404` / `SDLC-BUG-404` | 404 | 对象不存在 | 否 |
| `SDLC-TASK-409` / `SDLC-REQ-409` | 409 | 乐观锁版本冲突（`expectedVersion` 不匹配） | 是（重新拉取） |
| `SDLC-STATE-409` | 409 | 非法状态迁移，`detail.allowedNext` 返回允许集合 | 否 |
| `SDLC-STATE-422` | 422 | 守卫条件未满足（如覆盖率 < 85%） | 否 |
| `SDLC-SEC-413` | 413 | 上下文切片超上限（默认单任务 2 MB / 5,000 行） | 否 |
| `SDLC-SEC-403` | 403 | 出域策略禁止（`EGRESS-DENY` 下调用外部模型） | 否 |
| `SDLC-AGENT-503` | 503 | Agent 不可用（暂停或队列满） | 是 |
| `SDLC-AI-400` | 400 | 查询参数非法（range/dim 枚举外） | 否 |
| `SDLC-INTG-409` | 409 | 同步对象冲突（外部已归档 / 状态冲突） | 否 |
| `SDLC-INTG-502` | 502 | 外部 Provider 不可达 | 是 |
| `SDLC-PIPE-422` | 422 | 门禁未通过阻止发布 | 否 |
| `SDLC-NOTIFY-503` | 503 | 通知渠道不可用 | 是 |
| `SDLC-AUDIT-403` | 403 | 无审计查看权限（需 `二次授权`） | 否 |

---

## 5. JWT 鉴权与刷新流程

### 5.1 令牌参数

| 参数 | 取值 | 说明 |
|:---|:---|:---|
| 算法 | RS256 | 公钥由 `GET /api/v1/auth/.well-known/jwks.json` 暴露 |
| accessToken 有效期 | 900s（15 min） | 无状态校验，不落库 |
| refreshToken 有效期 | 7 天 | 落库 `auth_refresh_token`，**单次使用 + 轮换** |
| refresh 轮换窗口 | 旧令牌保留 60s（grace） | 容忍并发刷新的网络重放 |
| Claims | `sub, tid, roles[], scope[], jti, iat, exp, iss` | `tid` = 租户 id；`roles` 见 `rbacMatrix` 7 角色 |
| 时钟偏移容忍 | ±60s | `nbf`/`exp` 校验 |
| MFA | 由 IdP（飞书 SSO / OIDC）承担 | `ssoStatus.mfaRequired=true`，强校验角色 `manager/ops/pmo` |
| 会话超时 | 480 min | `ssoStatus.sessionTimeoutMin` |

### 5.2 刷新时序

```
IDE/浏览器                api-gateway                 Redis/PostgreSQL
   │  REST + accessToken(expired)  │
   │──────────────────────────────>│
   │  401 SDLC-AUTH-401            │
   │<──────────────────────────────│
   │  POST /auth/refresh {refreshToken}
   │──────────────────────────────>│
   │                               │  校验 jti 是否已使用 / 是否在 grace 窗口
   │                               │──────────────────────>│
   │                               │  吊销旧 jti，签发新对（access+refresh）
   │                               │<──────────────────────│
   │  200 {accessToken, refreshToken}
   │<──────────────────────────────│
   │  重放原请求（带新 accessToken）│
   │──────────────────────────────>│
```

### 5.3 失败处理

| 场景 | 处理 |
|:---|:---|
| refreshToken 已使用且超出 grace 窗口 | 返回 `SDLC-AUTH-409`，**吊销该用户全部 refreshToken**，前端跳转 SSO 重新登录 |
| refreshToken 过期 | `SDLC-AUTH-401`，重新登录 |
| WSS 连接中 accessToken 过期 | 服务端在 `exp` 前 60s 下发 `error{code:'SDLC-AUTH-401', retryable:true}`；客户端**在连接内**发 `client.hello` 携带新 token 完成续期（不重建连接） |
| 权限不足 | `SDLC-AUTH-403`，前端隐藏入口（不依赖前端拦截，服务端为准） |
| SSO 强制下线 | IdP 经 SCIM/事件回调 → 服务端吊销 `sub` 全部令牌 + 主动断开其 WSS |

---

## 6. 消息重放与幂等

| 机制 | 规则 |
|:---|:---|
| 幂等键 | 客户端→服务端的**写类消息**必须带 `idempotencyKey`（缺省取 `msgId`）；服务端按 `(clientId, idempotencyKey)` 去重 |
| 去重存储 | Redis `SET idem:{clientId}:{key} 1 NX EX 86400`；命中则回 `server.ack{status:'duplicate'}` 并返回首次结果 |
| 去重窗口 | **24 h**（与 `API-01` 幂等窗口一致） |
| 消息重放 | 服务端可对任意 `sdlc.*` 主题事件按 `seq` 区间重放（`GET /internal/v1/events/replay?topic=&fromSeq=&toSeq=`）；重放事件 `payload.replayed=true`，消费方须幂等 |
| 乱序处理 | 状态事件以 `seq` 为序；若收到 `seq` 小于本地水位，丢弃并记 `SDLC-PROTO-409`（乱序告警）；跨主题不保证全序 |
| 顺序水位 | 客户端按主题维护 `lastSeq`，服务端 `server.welcome.currentSeq` 为初始水位 |
| 重复投递 | Redis Streams `at-least-once`，消费方按 `msgId` 幂等；状态迁移以 `(taskId, expectedVersion)` 乐观锁二次兜底 |
| 冲突写 | 两个并发 `task.transition.request` 只有 `expectedVersion` 匹配者成功，另一返回 `SDLC-TASK-409` |

---

## 7. 断线重连与补偿

### 7.1 重连退避

| 尝试 | 间隔 | 抖动 |
|:---:|:---|:---|
| 1 | 1 s | ±20% |
| 2 | 2 s | ±20% |
| 3 | 4 s | ±20% |
| 4 | 8 s | ±20% |
| 5 | 16 s | ±20% |
| 6+ | 30 s（封顶） | ±20% |

连续失败 10 次后进入「离线模式」：IDE 侧本地任务卡只读，队列化写操作（最多 200 条），恢复后按序补发。

### 7.2 增量拉取与快照重建

```typescript
// 客户端重连逻辑（伪代码，IDE 插件与 web-console 共用）
async function reconnect() {
  const lastSeq = store.get('lastSeq'); // 上次处理到的事件水位
  const ws = await openSocket();
  ws.send(envelope({
    type: 'client.hello',
    payload: {
      clientId: store.get('clientId'),
      clientType: 'web',
      protocolVersion: '1.0',
      token: await auth.getFreshAccessToken(),
      resumeFromSeq: lastSeq,
    },
  }));
  // 服务端判定：
  //   gap = currentSeq - resumeFromSeq
  //   gap <= REPLAY_WINDOW(默认 5000 条 / 5 分钟) → 增量重放 [resumeFromSeq+1, currentSeq]
  //   gap >  REPLAY_WINDOW → 下发 snapshot 指令，客户端全量重建
}

async function onServerMessage(msg: Envelope) {
  if (msg.type === 'server.welcome') {
    if (msg.payload.mode === 'snapshot') {
      await rebuildFromSnapshot(msg.payload.snapshotUrl); // 拉取当前页面所需 REST 快照
    }
    store.set('lastSeq', msg.payload.currentSeq);
    return;
  }
  if (typeof msg.seq === 'number' && msg.seq <= store.get('lastSeq')) return; // 去重
  apply(msg);
  store.set('lastSeq', msg.seq);
}
```

| 补偿场景 | 策略 |
|:---|:---|
| 断线 < 5 min 且 gap ≤ 5,000 | Redis Streams 增量重放，客户端按 `seq` 去重 |
| 断线 > 5 min 或 gap > 5,000 | 服务端下发 `snapshot`，客户端按当前页面调用对应 REST 全量重建（如任务看板调 `GET /tasks`，流水线调 `GET /pipelines/{id}`） |
| IDE 本地队列补发 | 恢复后按 `seq` 升序补发；写类消息带原 `idempotencyKey`，服务端去重 |
| Agent 长任务中断 | `runId` 检查点存 Redis；重连后 `agent.invoke` 带 `resumeRunId` 续跑，或 `GET /api/v1/ai/traces/{runId}` 取已完成部分 |
| 心跳超时 | 客户端 25s 发 `client.ping`，服务端 3 次（75s）未收到则判定断线并释放订阅 |

---

## 8. 可验收标准

- [ ] 信封四元组 `msgId/type/payload/traceId` 在每个消息示例中均存在；`version/seq/ts` 标注为可选且接收方缺省不报错。
- [ ] §3.1 / §3.2 两张表覆盖 IDE 与控制台的全部交互，`type` 命名符合 `^[a-z]+(\.[a-z_]+)+$`，无重复项。
- [ ] §4 每个域的表均含「方法 / 路径 / 请求体 / 响应体 / 错误码」五列，且路径前缀为 `/api/v1/`。
- [ ] §4.10 错误码全表可被 `grep -c 'SDLC-'` 计数且与正文引用一一对应，无悬空引用。
- [ ] `task.transition.request` 示例的 `from/to` 取自 10 状态集合（`dev`→`testGreen` 属合法迁移），`expectedVersion` 与乐观锁字段名一致。
- [ ] accessToken=900s、refreshToken=7 天、grace=60s、去重窗口=24h 四处数值在正文与代码块中一致。
- [ ] §7.1 退避序列 1/2/4/8/16/30 s 与 §7.2 代码中的 `REPLAY_WINDOW=5000` 明确可配置且给出默认值。
- [ ] 状态事件主题命名为 `sdlc.task.state_changed`（与 `impl-03` 完全一致）。
- [ ] 全文无「待补充/TBD/略」。
