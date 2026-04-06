# Athlete SPEC

`spec/` 是 Athlete 当前唯一的规范与维护文档源。

这里描述的是：

- 项目现在已经做到什么
- 当前架构如何组织
- 关键规则和边界是什么
- 维护时应该改哪一层

这里不负责：

- 历史演进叙事
- 营销式介绍
- 运行产物归档

## 单一真相源规则

从现在开始：

- 规范、原则、模块边界、维护说明统一写在 `spec/`
- 根目录 `README.md` 只保留用户入口和高层说明
- 根目录 `validation/` 只保留验证产物，不再承担规范文档职责

## 阅读顺序

1. `principles/README.md`
2. `overview/产品定义.md`
3. `overview/v0范围.md`
4. `architecture/总体架构.md`
5. `architecture/状态与真相源.md`
6. `architecture/运行时循环.md`
7. `modules/`
8. `interfaces/`
9. `implementation/`
10. `testing/`
11. `adr/`

## 目录说明

- `principles/`: 架构宪法与工程铁律
- `overview/`: 产品定义、范围、边界
- `architecture/`: 总体架构、真相源、主循环
- `modules/`: 模块职责与约束
- `interfaces/`: 核心接口契约
- `repo/`: 仓库级规则与流程
- `implementation/`: 当前目录与代码映射
- `testing/`: 测试策略与 fail-first 列表
- `adr/`: 关键架构决策记录

## 文档要求

1. 只写现状，不写过时历史说明。
2. 如果文档与 `src/` 当前实现冲突，以当前实现为准，并及时改文档。
3. 同类说明只保留一份，不并行维护 `docs/` 和 `spec/` 两套说法。
