# 接口契约

这一组文档不追求把所有 TypeScript 细节抄一遍。

它们只说明 Athlete 内核最关键的抽象边界：

- provider adapter
- runtime loop
- session store
- tool registry
- interaction shell

## 使用规则

1. 接口文档写稳定边界，不写瞬时实现细节。
2. 新能力优先问“该落在哪个接口”，再问“该落在哪个文件”。
3. 如果某个改动让接口职责明显变混，优先拆接口。
