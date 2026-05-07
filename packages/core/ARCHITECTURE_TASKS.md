# Core 架构优化任务清单

本文档用于跟踪 `packages/core` 的架构优化执行项。任务按优先级组织，并按 PR 粒度拆分，便于并行开发、独立评审和快速回滚。

## 使用约定

- 状态：`TODO` / `DOING` / `DONE` / `BLOCKED`
- 优先级：`P0`（立即）/ `P1`（次阶段）/ `P2`（优化）
- 每个任务建议单独 PR，避免跨越多个高风险改动
- 合并前必须满足“验收标准 + 测试点”

---

## 里程碑计划（90天）

### M1（0-30天）：性能止损 + 可观测
- 目标：减少 render loop 全量开销，建立可量化指标
- 任务：T001, T002, T003

### M2（31-60天）：结构收敛
- 目标：降低 `ThreeEditor` 复杂度，统一默认值来源
- 任务：T004, T005, T006, T007

### M3（61-90天）：类型与平台化
- 目标：减少 `any` 渗透，提升可维护性和扩展能力
- 任务：T008, T009, T010

---

## P0 任务

## T001 - 渲染脏标记基础设施
- 状态：DONE
- 优先级：P0
- 目标：为“按需渲染更新”提供统一标记机制（不改行为）
- 涉及文件：
  - `packages/core/src/editor/ThreeEditor.ts`
  - `packages/core/src/settings/sceneSettingsDiff.ts`
- 改造内容：
  - 引入内部 dirty flags：`rendererDirty`、`shadowDirty`、`sceneDirty`
  - 在配置变更路径只打标记，不直接引入行为变化
  - 添加可开关的调试计数器（记录每帧 dirty 命中）
- 验收标准：
  - 对外 API 与现有行为保持一致
  - 无新增 TypeScript/lint 错误
  - 能通过日志确认 dirty 标记命中链路
- 风险：
  - 误打标或漏打标导致后续 PR 行为偏差
- 回滚方案：
  - 保留原逻辑路径，dirty 仅作为旁路数据
- 测试点：
  - 修改 renderer/light/object transform 后标记是否正确
  - 不发生变更时标记是否维持清洁状态

## T002 - 阴影更新从每帧全量改为事件驱动
- 状态：DONE
- 优先级：P0
- 目标：降低大场景每帧 traversal 与 shadowMap 更新开销
- 涉及文件：
  - `packages/core/src/editor/ThreeEditor.ts`
  - `packages/core/src/editor/controllers/*`（灯光与对象变更入口）
- 改造内容：
  - `syncShadowCastingLights()` 仅在相关变更事件后执行
  - 移除 render loop 中重复 `shadowMap.needsUpdate = true`
  - 将“阴影重算触发条件”集中定义，避免分散判断
- 验收标准：
  - 光照/阴影视觉结果与当前基线一致
  - 复杂场景 CPU 占用与帧耗时明显下降或更稳定
- 风险：
  - 漏触发导致阴影不更新
- 回滚方案：
  - 增加临时开关恢复“每帧兜底”模式
- 测试点：
  - 改变灯光类型、强度、位置、阴影开关后的效果正确
  - 对象移动/删除/新增后阴影行为正确

## T003 - Renderer 设置改为配置变更触发
- 状态：DONE
- 优先级：P0
- 目标：移除 `applyRendererSettings()` 的每帧调用
- 涉及文件：
  - `packages/core/src/editor/ThreeEditor.ts`
  - `packages/core/src/settings/sceneSettings.ts`
- 改造内容：
  - 在 renderer 设置变更时触发 apply
  - 渲染循环仅负责渲染，不做配置同步
  - 保留开发期兜底开关，便于回归排查
- 验收标准：
  - 配置修改后即时生效
  - render loop 逻辑更纯粹，减少重复工作
- 风险：
  - 特殊路径漏触发导致配置未生效
- 回滚方案：
  - 临时恢复每帧 apply 并保留变更触发逻辑
- 测试点：
  - 色调映射、像素比、曝光等参数实时生效
  - 多次快速切换配置无异常

## T004 - 统一默认值注册表（Registry）
- 状态：DONE
- 优先级：P0
- 目标：收敛默认值来源，防止 scene/object 默认参数漂移
- 涉及文件：
  - `packages/core/src/defaults/registry.ts`（新增）
  - `packages/core/src/defaults/defaultModels.ts`
  - `packages/core/src/defaults/defaultCameras.ts`
  - `packages/core/src/defaults/defaultLights.ts`
  - `packages/core/src/settings/sceneSettings.ts`
- 改造内容：
  - 建立 scene/object/render 默认值 registry
  - 旧工厂与设置接口保持兼容，内部改为读取 registry
  - 明确默认值层级：基础默认 -> 类型默认 -> 用户覆盖
- 验收标准：
  - 新建场景与插入对象默认行为一致
  - 对外 API 无 breaking change
- 风险：
  - 迁移中可能出现默认值行为细微变化
- 回滚方案：
  - 保留旧默认工厂，按开关切回旧路径
- 测试点：
  - 核心类型（camera/light/model）默认参数一致性
  - 场景初始化与对象新增的默认值快照比对

## T005 - 默认值一致性测试
- 状态：DONE
- 优先级：P0
- 目标：用测试锁定默认值契约，避免后续漂移
- 涉及文件：
  - `packages/core/src/defaults/__tests__/defaults-consistency.test.ts`（新增）
- 改造内容：
  - 覆盖 `createDefaultSceneSettings`、`createDefault*` 工厂、编辑器初始态
  - 关键字段做契约断言（light/camera/renderer）
- 验收标准：
  - 测试稳定通过，能够在默认值偏移时准确失败
- 风险：
  - 测试过度依赖实现细节，导致脆弱
- 回滚方案：
  - 先保留核心契约断言，逐步补充细节断言
- 测试点：
  - 各默认工厂输出与场景默认配置契约一致

## T006 - 拆分 RenderPipelineService
- 状态：DONE
- 优先级：P0
- 目标：从 `ThreeEditor` 中抽离渲染管线职责
- 涉及文件：
  - `packages/core/src/editor/services/RenderPipelineService.ts`（新增）
  - `packages/core/src/editor/ThreeEditor.ts`
- 改造内容：
  - 迁移渲染循环、effects 管理与 renderer 触发逻辑
  - `ThreeEditor` 保留 façade API，通过委托调用 service
- 验收标准：
  - 对外方法签名与行为保持一致
  - `ThreeEditor` 文件复杂度明显下降
- 风险：
  - 生命周期顺序变化导致回归
- 回滚方案：
  - 通过门面层开关回退到旧实现
- 测试点：
  - 初始化、渲染、暂停/恢复、销毁流程一致

## T007 - 拆分 SceneGraphService
- 状态：DONE
- 优先级：P0
- 目标：分离场景图与节点管理职责
- 涉及文件：
  - `packages/core/src/editor/services/SceneGraphService.ts`（新增）
  - `packages/core/src/editor/ThreeEditor.ts`
- 改造内容：
  - 迁移对象增删改查、场景树同步、部分选择协作逻辑
  - 统一 scene tree 更新入口，减少分散调用
- 验收标准：
  - 添加/删除/重命名/层级操作行为一致
  - scene tree 状态同步稳定
- 风险：
  - 同步时序变化导致 UI 状态短暂不一致
- 回滚方案：
  - 保留旧同步路径作为短期 fallback
- 测试点：
  - 典型编辑链路（新增-选择-删除）结果一致

---

## P1 任务

## T008 - `defaultLights` helper 逻辑去重
- 状态：TODO
- 优先级：P1
- 目标：降低重复代码，减少维护成本
- 涉及文件：
  - `packages/core/src/defaults/defaultLights.ts`
- 改造内容：
  - 抽公共 helper 构建函数（directional/point/spot）
  - 统一 helper 显隐与 shadow camera helper 管理逻辑
- 验收标准：
  - 行为一致，代码重复显著减少
- 风险：
  - helper 绑定关系迁移后可能出现遗漏
- 回滚方案：
  - 拆分为小步提交，逐类灯光回滚
- 测试点：
  - 三类灯光 helper 创建、更新、销毁行为一致

## T009 - 配置比较替换 `JSON.stringify`
- 状态：TODO
- 优先级：P1
- 目标：提高配置变更检测的语义与性能稳定性
- 涉及文件：
  - `packages/core/src/editor/ThreeEditor.ts`
  - `packages/core/src/settings/sceneSettingsDiff.ts`
- 改造内容：
  - 扩展结构化 diff，替代 stringify 全量比较
  - 明确哪些字段影响渲染、哪些仅影响 UI
- 验收标准：
  - 配置变更触发准确，无多余更新
- 风险：
  - diff 规则不完整导致漏更新
- 回滚方案：
  - 关键路径保留旧比较作为兜底
- 测试点：
  - 常见配置修改操作触发行为覆盖

## T010 - `userData` 强类型化第一批
- 状态：TODO
- 优先级：P1
- 目标：降低 `as any` 使用，增强可维护性
- 涉及文件：
  - `packages/core/src/infra/utils/keys.ts`
  - `packages/core/src/defaults/defaultLights.ts`
  - `packages/core/src/editor/ThreeEditor.ts`
- 改造内容：
  - 定义 `VizonUserData` 与常用对象泛型约束
  - 优先替换 helper/default/conduit 高风险路径
- 验收标准：
  - 关键路径 `any` 数量明显下降
  - 不引入额外类型断言噪音
- 风险：
  - Three.js 原生类型扩展兼容问题
- 回滚方案：
  - 分层引入类型，局部保留过渡断言
- 测试点：
  - 编译通过，关键编辑链路可用

---

## 执行记录模板

每次任务推进请追加记录：

- 任务编号：
- PR 链接：
- 执行人：
- 完成时间：
- 结果：DONE / BLOCKED
- 变更摘要：
- 验收结果：
- 遗留问题：

---

## 当前执行顺序建议

1. T001 -> T002 -> T003（先做性能止损）
2. T004 -> T005（锁定默认值体系）
3. T006 -> T007（结构拆分）
4. T008/T009/T010（并行推进）
