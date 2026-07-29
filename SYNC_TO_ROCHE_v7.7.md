# 记忆宫殿 v7.7.0 - 记忆同步到 Roche

## 🔥 新增功能：记忆权重同步

### 更新时间
2026-07-29

### 核心改进

**让 Roche AI 在对话时能感知记忆宫殿的权重数据！**

现在，记忆宫殿的元数据（重要性、房间分类、情绪标签、复习次数等）会自动同步到 Roche 的记忆系统，AI 在对话时能够利用这些数据做出更智能的回应。

---

## ✨ 实现的功能

### 1. 自动同步（混合模式）

**重要操作立即同步**：
- ✅ 点击记忆卡片复习 → 立即同步 `lastRecall` 和 `reviewCount`
- ✅ 在所有页面（房间详情、全部记忆、事件盒、搜索页）复习记忆时都会自动同步

**同步的数据字段**：
```javascript
{
  importance: 8,              // 重要性 (0-10)
  room: 'bedroom',            // 房间分类
  emotion: 'warmth',          // 情绪标签
  reviewCount: 5,             // 复习次数
  lastRecall: 1722240000000,  // 最后复习时间戳
  relations: ['mem-id-1']     // 关联记忆ID
}
```

### 2. 批量同步按钮

**位置**：记忆宫殿主页，功能按钮区

**样式**：渐变紫色按钮，带 🔄 图标

**功能**：
- 一键同步所有记忆的元数据到 Roche
- 同步前会弹出确认对话框
- 显示同步进度和结果统计

---

## 📊 同步逻辑

### API 调用
```javascript
await roche.memory.update(memoryId, {
  importance: memory.importance,
  room: memory.room,
  emotion: memory.emotion,
  reviewCount: memory.reviewCount,
  lastRecall: memory.lastRecall,
  relations: memory.relations
})
```

### 触发时机

| 操作 | 同步时机 | 同步内容 |
|------|---------|---------|
| 点击记忆卡片（复习） | 立即同步 | 所有元数据 |
| 批量同步按钮 | 用户手动触发 | 所有记忆 |

---

## 🎯 下一步计划

### 第二步：AI 对话集成（待实现）

通过 `chat.contextProvider` 让 AI 在对话时调用记忆宫殿的算法：

```javascript
chat: {
  async contextProvider(ctx) {
    // 1. 混合搜索（85% 向量 + 15% BM25）
    const searchResults = hybridSearch(ctx.latestUserMessage, memories);
    
    // 2. 扩散激活（根据性格类型）
    const activated = diffusionActivation(searchResults, charPersonality);
    
    // 3. 情绪启动（当前情绪 × 1.3）
    const emotionBoosted = emotionPriming(activated, currentEmotion);
    
    // 4. 反刍检查（6% 概率拉取阁楼记忆）
    const withRumination = ruminationCheck(emotionBoosted);
    
    return formatMemoriesForAI(withRumination);
  }
}
```

**预期效果**：
- AI 能"翻旧账"（情绪启动）
- AI 能根据房间分类优先调用特定记忆
- AI 能感知记忆的重要性和复习频率

---

## 🔧 技术细节

### 新增函数

**1. `syncMemoryToRoche(memory)`**
- 同步单条记忆到 Roche
- 错误处理和日志记录

**2. `syncAllMemoriesToRoche()`**
- 批量同步所有记忆
- 统计成功/失败数量
- Toast 提示

### 修改的位置

1. **房间详情页** (`line 1556-1570`)
   - 记忆卡片点击事件添加同步

2. **全部记忆页** (`line 1796-1808`)
   - 记忆卡片点击事件添加同步

3. **事件盒页** (`line 1920-1932`)
   - 事件卡片点击事件添加同步

4. **搜索页** (`line 2059-2071`)
   - 记忆卡片点击事件添加同步

5. **主页** (`line 1070-1085`)
   - 新增"同步到 Roche"按钮

6. **按钮事件** (`line 1327-1339`)
   - 添加批量同步功能

---

## 📝 用户体验优化

### Toast 提示
- ✨ 复习记忆：`"✨ 记忆已巩固！已同步到 Roche"`
- 🔄 批量同步：`"🔄 正在同步..."`
- ✅ 成功：`"✅ 成功同步 X 条记忆到 Roche"`
- ⚠️ 部分失败：`"⚠️ 同步完成：成功 X 条，失败 Y 条"`

### 确认对话框
批量同步前会询问用户：
```
标题：同步记忆到 Roche
内容：即将把 X 条记忆的元数据（重要性、房间、情绪、复习次数）
      同步到 Roche 系统，AI 对话时将能感知这些数据。确定继续？
```

---

## 🚀 如何使用

### 自动同步
1. 进入记忆宫殿
2. 点击任意记忆卡片进行复习
3. 系统自动同步该记忆的元数据到 Roche
4. 提示"✨ 记忆已巩固！已同步到 Roche"

### 批量同步
1. 进入记忆宫殿主页
2. 点击渐变紫色的"🔄 同步到 Roche"按钮
3. 确认同步操作
4. 等待同步完成，查看结果统计

---

## 📦 文件变更

- ✅ 备份文件：`plugin-v7.6-backup.js`
- ✅ 当前文件：`plugin.js` (v7.7.0)
- ✅ 配置文件：`manifest.json` (v7.7.0)
- 📄 本文档：`SYNC_TO_ROCHE_v7.7.md`

---

## 🎉 总结

**v7.7.0 实现了记忆同步的第一步**：
- ✅ 元数据同步到 Roche 记忆系统
- ✅ 复习时自动同步（混合模式）
- ✅ 批量同步按钮
- ⏳ AI 对话集成（下一步）

现在 Roche 系统能够看到记忆宫殿的增强数据了，为后续 AI 智能调用打下基础！

---

**开发者**: Kiro  
**版本**: v7.7.0  
**日期**: 2026-07-29
