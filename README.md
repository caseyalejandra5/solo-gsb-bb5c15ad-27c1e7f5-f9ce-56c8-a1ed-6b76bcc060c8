# 事件序列修复台 · Event Sequence Repair Bench

离线运行的 NDJSON 事件序列修复工具（TypeScript + Vite + React）。
粘贴每行含 `stream` / `sequence` / `payload` 的事件流，系统按 **JSON 结构深比较** 折叠重复、标记冲突、定位缺口，并在浏览器本地完成裁决与导出。**不发送任何网络请求。**

## 功能

- **NDJSON 解析**：每行一条 `{"stream","sequence","payload"}`；非法行单独报告行号与原因，不影响其它行。
- **结构深比较**：对象 key 顺序不同视为相同（`{"a":1,"b":2}` 等于 `{"b":2,"a":1}`），值类型不同视为不同。
- **重复折叠**：同流、同序号、同 payload 的多条记录折叠为一条，保留出现次数与原始行号。
- **冲突标记**：同流同序号但 payload 不同 → 冲突槽位，列出全部候选版本（含规范化 JSON 预览、出现行号）。
- **缺口与阻断**：从每流起始序号起，缺号或**未裁决冲突**立即阻断；阻断点之后的事件挂起，不进入连续前缀。
- **人工裁决**：单选某个冲突版本，或撤销选择；每次操作后各流的前缀、缺口、阻断状态立即重算。
- **起始序号**：可为每条流单独设置期望的起始序号（默认取该流最小序号）。
- **导出**：仅导出各流**已确认连续前缀**内的事件，NDJSON 格式，排序为 `stream` 升序 → `sequence` 升序；支持下载文件或复制到剪贴板。

## 单条命令启动（Docker）

```bash
docker compose up --build -d
```

启动后在浏览器访问：

> **http://localhost:8080**

停止：

```bash
docker compose down
```

> 端口被占用时修改 `docker-compose.yml` 中的 `"8080:8080"`（左侧宿主机端口）即可。

## 本地开发（无需 Docker）

要求 Node.js 20+：

```bash
npm install
npm run dev
```

访问 Vite 输出的地址（默认 **http://localhost:5173**）。

其它命令：

```bash
npm test         # 核心逻辑单元测试（Vitest）
npm run build    # 类型检查 + 生产构建到 dist/
npm run preview  # 本地预览生产构建（http://localhost:8080）
```

## 使用步骤

1. 将 NDJSON 粘贴到左侧文本框（或点击「载入示例」），点击 **分析 / 重新计算**。
2. 在右侧查看每条流：
   - **缺口**区列出缺失序号，红色高亮的是当前阻断点；
   - **冲突候选**区选择一个版本即完成裁决，点击「撤销选择」可回退；
   - 顶部实时显示当前**连续前缀**区间与可导出条数。
3. 调整某流的「起始序号」可跳过更早的历史数据，前缀与缺口即时重算。
4. 左下方 **导出** 区预览结果，点击「下载 NDJSON」或「复制」。

## 数据规则说明

- `stream`：字符串（数字会容错转为字符串）；
- `sequence`：有限整数，可为 0 或负数；
- `payload`：任意合法 JSON（对象、数组、标量、null 均可）；
- 冲突裁决以 payload 的**规范化 JSON 指纹**存档；重新分析后若该版本已不存在，裁决自动失效并重新标记为未裁决。
- 导出行格式：`{"stream":"...","sequence":N,"payload":...}`（紧凑 JSON，一行一条）。

## 目录结构

```
src/
  core/            # 与 UI 无关的纯逻辑（可独立测试）
    types.ts       # 领域类型
    deep.ts        # JSON 结构深比较 / 规范化序列化
    ndjson.ts      # NDJSON 解析与导出
    model.ts       # 折叠建模、缺口/冲突阻断扫描、连续前缀、导出汇总
    model.test.ts  # Vitest 测试
  components/      # React 组件
  App.tsx          # 状态编排
Dockerfile         # 多阶段构建（node 构建 + nginx 静态托管）
docker-compose.yml # 一条命令启动
nginx.conf         # SPA 回退与缓存
```

## 隐私

所有解析、比较、裁决与导出均在当前浏览器进程内完成，静态页面本身不收集任何数据。
