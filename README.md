# Roche 记忆宫殿

Roche 的只读记忆分析插件。它读取 Roche 已有的长期记忆，在插件自己的存储空间里计算保持率、重要性和软遗忘状态，并提供一个可视化的七房间面板。

## 当前版本的边界

- Roche 原有的自动记忆写入继续工作。
- Roche 原有的向量记忆召回和排序完全不改动。
- 插件只调用 `memory.getLongTerm`、`memory.getShortTerm`、会话读取和 `storage`。
- 插件不会调用 `memory.write`、`memory.update`、`memory.delete`。
- 插件没有 `chat.contextProvider`，不会把结果注入主对话，也不会调用 AI。
- “自动遗忘”是插件内的软遗忘：只改变插件自己的房间、保持率和状态元数据，不删除 Roche 主记忆。

## 功能

### 艾宾浩斯保持率

插件使用 `R = e^(-t/S)` 计算本地保持率。重要性、情绪、复习次数和房间衰减率会影响分数：重要、情绪强烈、被复习过的记忆更不容易淡化。

保持率状态：

- `active`：保持率不低于 30%。
- `fading`：保持率低于 30%，显示为低保持率（软遗忘）。
- `faded`：保持率低于 10%，仅标记为已淡忘，不自动删除。

### 插件内软遗忘

客厅超过 200 条时，插件按“重要性 × 保持率”从低到高排序，把超出的记忆迁移到插件自己的房间元数据：重要记忆进入卧室，琐碎记忆进入阁楼。这个迁移不会改变 Roche 中的原始记忆记录。

点击记忆卡片只会增加插件自己的复习次数、更新时间和保持率；这些字段保存到 `roche.storage` 的 `memoryMeta:{conversationId}` 中。

### 本地搜索和排序

面板中的搜索是插件本地的词项相似度和关键词频次排序。它不是 Roche 的向量搜索，也不会覆盖 Roche 的向量分数。

## 安装

在 Roche 插件管理页面安装：

```text
https://raw.githubusercontent.com/zxinyi404-maker/roche-memory-palace/main/manifest.json
```

当前 manifest 权限：`persona:read`、`character:read`、`conversation:read`、`memory:read`、`storage`、`ui`。

## 数据存储

插件只在 Roche storage 保存自己的增强元数据：

```text
memoryMeta:{conversationId}
```

卸载插件或清理这组 storage 元数据不会删除 Roche 主记忆。当前版本也没有自动删除主记忆的功能；如需清理，应由用户在 Roche 原生记忆界面手动确认。

## 开发和检查

```bash
node --check plugin.js
```

文件结构：

```text
manifest.json   插件元信息和只读权限
plugin.js       插件入口
README.md       当前行为说明
```

## 版本

当前版本：`8.0.4`

MIT License
