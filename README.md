# mcp-xmind-aidea

[中文](#中文) | [English](#english)

---

<a id="中文"></a>

## 中文

一个基于模型上下文协议（MCP）的 XMind 思维导图服务器，支持读取、创建和查询 XMind 文件。基于 [mcp-xmind](https://github.com/apeyroux/mcp-xmind) 改造，新增 **Rainbow 主题** 和 **完整的 XMind 格式兼容**。

### 功能特性

#### 读取能力
- 解析完整的思维导图结构（多画布）
- 智能模糊搜索
- 任务管理和追踪（待办 + 计划任务）
- 层级内容导航
- 链接和引用提取（外部 URL + 内部 xmind:# 链接）
- 多文件分析
- 标签、标注、边界、摘要支持
- 目录扫描

#### 创建能力
- 从结构化 JSON 创建 XMind 文件
- **Rainbow 主题**（深色海军蓝风格，与 XMind 桌面端默认主题一致）
- **节点类型**：`topic`（普通）、`importantTopic`（加粗深红色）、`minorTopic`（加粗棕色）
- **attributedTitle**（所有节点自动添加，完整格式兼容）
- **content.xml** 兼容文件（避免 XMind 桌面端打开警告）
- 嵌套主题，支持备注（纯文本 + HTML 格式）
- 标签、标记、标注、边界、摘要
- 主题间关联线（按标题）
- 跨画布内部链接（`linkToTopic`）
- 简单待办（复选框）
- 计划任务 / 甘特图支持（日期、进度、优先级、工期、依赖关系）
- 多种布局结构（顺时针、右向逻辑图、组织架构图、鱼骨图、时间线等）
- 覆盖保护

### 安装

```bash
# 通过 npx（推荐）
npx -y mcp-xmind-aidea /path/to/your/xmind/files

# 或全局安装
npm install -g mcp-xmind-aidea
mcp-server-xmind /path/to/your/xmind/files
```

### 配置方式

#### Claude Desktop

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "XMind": {
      "command": "npx",
      "args": ["-y", "mcp-xmind-aidea", "/path/to/your/xmind/files"]
    }
  }
}
```

#### Claude Code（命令行）

```bash
claude mcp add xmind -- npx -y mcp-xmind-aidea /path/to/your/xmind/files
```

#### 本地构建

```json
{
  "mcpServers": {
    "XMind": {
      "command": "node",
      "args": ["/path/to/mcp-xmind-aidea/dist/index.js", "/path/to/your/xmind/files"]
    }
  }
}
```

### 可用工具

| 工具 | 说明 |
|------|------|
| `read_xmind` | 解析完整的思维导图结构 |
| `list_xmind_directory` | 递归扫描目录中的 XMind 文件 |
| `read_multiple_xmind_files` | 同时处理多个文件 |
| `search_xmind_files` | 按文件名或内容搜索 |
| `extract_node` | 智能模糊路径匹配提取节点 |
| `extract_node_by_id` | 通过 ID 精确提取节点 |
| `search_nodes` | 多条件搜索（标题、备注、标签、标注、任务） |
| `create_xmind` | 从结构化数据创建 XMind 文件 |

### 示例：创建思维导图

```json
{
  "name": "create_xmind",
  "arguments": {
    "path": "/path/to/output.xmind",
    "sheets": [{
      "title": "项目计划",
      "theme": "rainbow",
      "rootTopic": {
        "title": "我的项目",
        "structureClass": "org.xmind.ui.logic.right",
        "children": [
          {
            "title": "重要功能",
            "topicClass": "importantTopic",
            "children": [
              { "title": "子任务 1" },
              { "title": "子任务 2" }
            ]
          },
          {
            "title": "次要备注",
            "topicClass": "minorTopic"
          }
        ]
      }
    }]
  }
}
```

### 开发

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript
npm test           # 运行测试
```

### 许可证

MIT

---

<a id="english"></a>

## English

A Model Context Protocol (MCP) server for reading, creating and querying XMind mind maps. Based on [mcp-xmind](https://github.com/apeyroux/mcp-xmind) by Alexandre Peyroux, customized with **Rainbow theme** and **full XMind format compatibility**.

### Features

#### Reading
- Parse complete mind map structure (multi-sheet)
- Smart fuzzy search across mind maps
- Task management and tracking (to-do + planned tasks)
- Hierarchical content navigation
- Link and reference extraction (external URLs + internal xmind:# links)
- Multi-file analysis
- Label, callout, boundary and summary support
- Directory scanning

#### Writing
- Create XMind files from structured JSON
- **Rainbow theme** (dark navy style, matching XMind desktop default)
- **Node class types**: `topic`, `importantTopic` (bold dark red), `minorTopic` (bold brown)
- **attributedTitle** on all nodes (full XMind format compatibility)
- **content.xml** compatibility file (prevents warnings in XMind desktop)
- Nested topics with notes (plain text + HTML formatting)
- Labels, markers, callouts, boundaries, summaries
- Relationships between topics (by title)
- Internal links between topics across sheets (`linkToTopic`)
- Simple to-do tasks (checkbox)
- Planned tasks with Gantt support (dates, progress, priority, duration, dependencies)
- Layout structures (clockwise, logic.right, org-chart, fishbone, timeline, etc.)
- Overwrite protection

### Installation

```bash
# Via npx (recommended)
npx -y mcp-xmind-aidea /path/to/your/xmind/files

# Or install globally
npm install -g mcp-xmind-aidea
mcp-server-xmind /path/to/your/xmind/files
```

### Configuration

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "XMind": {
      "command": "npx",
      "args": ["-y", "mcp-xmind-aidea", "/path/to/your/xmind/files"]
    }
  }
}
```

#### Claude Code (CLI)

```bash
claude mcp add xmind -- npx -y mcp-xmind-aidea /path/to/your/xmind/files
```

#### Local Build

```json
{
  "mcpServers": {
    "XMind": {
      "command": "node",
      "args": ["/path/to/mcp-xmind-aidea/dist/index.js", "/path/to/your/xmind/files"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `read_xmind` | Parse and extract complete mind map structure |
| `list_xmind_directory` | Recursively scan for XMind files |
| `read_multiple_xmind_files` | Process multiple files simultaneously |
| `search_xmind_files` | Search files by name or content |
| `extract_node` | Smart fuzzy path matching with ranked results |
| `extract_node_by_id` | Direct node access by ID |
| `search_nodes` | Multi-criteria search (title, notes, labels, callouts, tasks) |
| `create_xmind` | Create XMind files from structured data |

### Example: Create a Mind Map

```json
{
  "name": "create_xmind",
  "arguments": {
    "path": "/path/to/output.xmind",
    "sheets": [{
      "title": "Project Plan",
      "theme": "rainbow",
      "rootTopic": {
        "title": "My Project",
        "structureClass": "org.xmind.ui.logic.right",
        "children": [
          {
            "title": "Important Feature",
            "topicClass": "importantTopic",
            "children": [
              { "title": "Sub-task 1" },
              { "title": "Sub-task 2" }
            ]
          },
          {
            "title": "Minor Note",
            "topicClass": "minorTopic"
          }
        ]
      }
    }]
  }
}
```

### Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm test           # Run tests
```

### License

MIT
