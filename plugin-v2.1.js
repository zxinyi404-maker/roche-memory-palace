// Roche 记忆宫殿插件 v2.1.0
// 深度记忆管理系统 - 功能增强版

(function() {
  'use strict';

  // ============ 配置常量 ============

  const IMPORTANCE_LEVELS = {
    1: { name: '琐事', color: '#64748b', baseStrength: 1, floor: 0, reinforceFactor: 1.2 },
    2: { name: '一般', color: '#3b82f6', baseStrength: 3, floor: 0.1, reinforceFactor: 1.5 },
    3: { name: '重要', color: '#f59e0b', baseStrength: 7, floor: 0.3, reinforceFactor: 2.0 },
    4: { name: '关键', color: '#ef4444', baseStrength: 15, floor: 0.5, reinforceFactor: 2.5 },
    5: { name: '刻骨铭心', color: '#a855f7', baseStrength: 30, floor: 0.7, reinforceFactor: 3.0 }
  };

  const EMOTION_LEVELS = {
    0: { name: '中性', strengthBonus: 0 },
    1: { name: '平静', strengthBonus: 0.5 },
    2: { name: '愉悦', strengthBonus: 1 },
    3: { name: '激动', strengthBonus: 2 },
    4: { name: '强烈', strengthBonus: 4 },
    5: { name: '极致', strengthBonus: 8 }
  };

  const MEMORY_TYPES = {
    fact: { name: '事实', icon: '📌', color: '#3b82f6' },
    experience: { name: '经历', icon: '🎬', color: '#10b981' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444' }
  };

  // ============ 核心算法 ============

  function calculateRetention(memory) {
    const now = Date.now();
    const timePassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24);
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emo = EMOTION_LEVELS[memory.emotion || 0] || EMOTION_LEVELS[0];
    const strength = imp.baseStrength + emo.strengthBonus + (memory.reviewCount || 0) * 0.5;
    const retention = Math.exp(-timePassed / strength);
    return Math.max(retention, imp.floor);
  }

  function reinforceMemory(memory) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    memory.strength = (memory.strength || imp.baseStrength) * imp.reinforceFactor;
    return memory;
  }

  // ============ 智能分析 ============

  function guessMemoryType(text) {
    const patterns = {
      fact: ['是', '叫', '住在', '来自', '出生于', '职业', '名字'],
      experience: ['经历', '发生', '去了', '做了', '看到', '遇到', '参加'],
      skill: ['会', '能', '擅长', '学会', '掌握', '熟练'],
      relationship: ['朋友', '认识', '关系', '喜欢', '讨厌', '爱'],
      knowledge: ['知道', '了解', '学习', '原理', '概念', '理论'],
      emotion: ['感觉', '情绪', '开心', '难过', '愤怒', '害怕', '激动']
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(kw => text.includes(kw))) return type;
    }
    return 'fact';
  }

  function guessImportance(text) {
    const critical = ['永远', '刻骨铭心', '难忘', '生死', '最重要'];
    const important = ['一定', '必须', '重要', '关键', '务必'];
    const trivial = ['可能', '也许', '好像', '随便'];

    if (critical.some(kw => text.includes(kw))) return 5;
    if (important.some(kw => text.includes(kw))) return 4;
    if (trivial.some(kw => text.includes(kw))) return 1;
    return 2;
  }

  function guessEmotion(text) {
    const levels = {
      5: ['极度', '彻底', '无比', '太过', '崩溃', '疯狂'],
      4: ['非常', '特别', '超级', '巨大', '强烈'],
      3: ['很', '激动', '兴奋', '愤怒', '悲伤'],
      2: ['有点', '开心', '难过', '愉快', '高兴'],
      1: ['平静', '淡定', '稳定', '冷静']
    };

    for (let level = 5; level >= 0; level--) {
      if (levels[level] && levels[level].some(kw => text.includes(kw))) return level;
    }
    return 0;
  }

  // ============ 记忆关联分析 ============

  function findRelatedMemories(targetMemory, allMemories, limit = 5) {
    const related = [];
    const targetText = (targetMemory.summaryText || targetMemory.text || '').toLowerCase();
    const targetWords = new Set(targetText.split(/\s+/).filter(w => w.length > 1));

    for (const mem of allMemories) {
      if (mem.id === targetMemory.id) continue;

      const memText = (mem.summaryText || mem.text || '').toLowerCase();
      const memWords = new Set(memText.split(/\s+/).filter(w => w.length > 1));

      // 计算词汇重叠度
      const intersection = new Set([...targetWords].filter(w => memWords.has(w)));
      const similarity = intersection.size / Math.max(targetWords.size, memWords.size, 1);

      // 同类型记忆加权
      const typeBonus = mem.type === targetMemory.type ? 0.2 : 0;

      // 时间接近度
      const timeDiff = Math.abs(mem.timestamp - targetMemory.timestamp) / (1000 * 60 * 60 * 24);
      const timeBonus = timeDiff < 7 ? 0.1 : 0;

      const score = similarity + typeBonus + timeBonus;

      if (score > 0.1) {
        related.push({ memory: mem, score });
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.memory);
  }

  // ============ 记忆统计分析 ============

  function analyzeMemories(memories) {
    const analysis = {
      total: memories.length,
      byType: {},
      byImportance: {},
      avgRetention: 0,
      needReview: 0,
      strong: 0,
      weak: 0,
      retentionDistribution: {
        veryStrong: 0,  // >80%
        strong: 0,      // 60-80%
        medium: 0,      // 30-60%
        weak: 0,        // 10-30%
        veryWeak: 0     // <10%
      },
      timeDistribution: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        older: 0
      }
    };

    const now = Date.now();
    let totalRetention = 0;

    memories.forEach(mem => {
      // 类型统计
      analysis.byType[mem.type] = (analysis.byType[mem.type] || 0) + 1;

      // 重要性统计
      analysis.byImportance[mem.importance] = (analysis.byImportance[mem.importance] || 0) + 1;

      // 保持率统计
      const retention = calculateRetention(mem);
      totalRetention += retention;

      if (retention > 0.8) analysis.retentionDistribution.veryStrong++;
      else if (retention > 0.6) analysis.retentionDistribution.strong++;
      else if (retention > 0.3) analysis.retentionDistribution.medium++;
      else if (retention > 0.1) analysis.retentionDistribution.weak++;
      else analysis.retentionDistribution.veryWeak++;

      if (retention < 0.3) analysis.needReview++;
      if (retention > 0.7) analysis.strong++;
      if (retention < 0.3) analysis.weak++;

      // 时间分布
      const daysSince = (now - mem.timestamp) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) analysis.timeDistribution.today++;
      else if (daysSince < 7) analysis.timeDistribution.thisWeek++;
      else if (daysSince < 30) analysis.timeDistribution.thisMonth++;
      else analysis.timeDistribution.older++;
    });

    analysis.avgRetention = memories.length > 0 ? totalRetention / memories.length : 0;

    return analysis;
  }

  // ============ 导出功能 ============

  function exportMemoriesJSON(memories) {
    const data = {
      version: '2.1.0',
      exportTime: new Date().toISOString(),
      totalMemories: memories.length,
      memories: memories.map(mem => ({
        id: mem.id,
        text: mem.summaryText || mem.text,
        type: mem.type,
        importance: mem.importance,
        emotion: mem.emotion,
        timestamp: mem.timestamp,
        lastRecall: mem.lastRecall,
        reviewCount: mem.reviewCount,
        retention: calculateRetention(mem),
        tags: mem.tags || [],
        notes: mem.notes || '',
        relatedMemories: mem.relatedMemories || []
      }))
    };

    return JSON.stringify(data, null, 2);
  }

  function exportMemoriesMarkdown(memories, analysis) {
    let md = `# 记忆宫殿导出\n\n`;
    md += `**导出时间**: ${new Date().toISOString()}\n`;
    md += `**记忆总数**: ${memories.length}\n`;
    md += `**平均保持率**: ${(analysis.avgRetention * 100).toFixed(1)}%\n\n`;

    md += `## 统计概览\n\n`;
    md += `- 需要复习: ${analysis.needReview}\n`;
    md += `- 强记忆: ${analysis.strong}\n`;
    md += `- 弱记忆: ${analysis.weak}\n\n`;

    md += `## 按类型分类\n\n`;
    Object.entries(analysis.byType).forEach(([type, count]) => {
      const typeInfo = MEMORY_TYPES[type];
      md += `- ${typeInfo.icon} ${typeInfo.name}: ${count}\n`;
    });

    md += `\n## 记忆列表\n\n`;

    memories.forEach((mem, idx) => {
      const retention = calculateRetention(mem);
      const typeInfo = MEMORY_TYPES[mem.type];
      const impInfo = IMPORTANCE_LEVELS[mem.importance];

      md += `### ${idx + 1}. ${typeInfo.icon} ${mem.summaryText || mem.text}\n\n`;
      md += `- **类型**: ${typeInfo.name}\n`;
      md += `- **重要性**: ${impInfo.name}\n`;
      md += `- **保持率**: ${(retention * 100).toFixed(1)}%\n`;
      md += `- **创建时间**: ${new Date(mem.timestamp).toLocaleString()}\n`;
      md += `- **复习次数**: ${mem.reviewCount || 0}\n`;

      if (mem.tags && mem.tags.length > 0) {
        md += `- **标签**: ${mem.tags.join(', ')}\n`;
      }

      if (mem.notes) {
        md += `- **备注**: ${mem.notes}\n`;
      }

      md += `\n`;
    });

    return md;
  }

  // ============ AI 记忆提取 ============

  async function extractMemoriesFromConversation(roche, conversationId) {
    try {
      const messages = await roche.memory.getShortTerm({ conversationId, limit: 50 });

      if (!messages || messages.length === 0) {
        return [];
      }

      // 构建提示词
      const prompt = `分析以下对话，提取出重要的记忆点。对每个记忆点，判断其类型、重要性和情绪强度。

对话内容：
${messages.map(m => `${m.senderName || m.senderHandle}: ${m.text}`).join('\n')}

请提取 5-10 个重要记忆点，以 JSON 格式返回：
[
  {
    "text": "记忆内容",
    "type": "fact|experience|skill|relationship|knowledge|emotion",
    "importance": 1-5,
    "emotion": 0-5
  }
]`;

      const result = await roche.ai.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      // 尝试解析 JSON
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];
    } catch (error) {
      console.error('AI 提取记忆失败:', error);
      return [];
    }
  }

  // ============ 主插件注册 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '2.1.0',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          // 插件状态
          let currentView = 'dashboard';
          let memories = [];
          let conversations = [];
          let selectedConvId = null;
          let selectedMemory = null;
          let analysis = null;
          let searchQuery = '';

// ============ 数据加载 ============

          async function loadConversations() {
            conversations = await roche.conversation.list();
            const saved = await roche.storage.get('selectedConversation');
            if (saved && conversations.some(c => c.id === saved)) {
              selectedConvId = saved;
            } else if (conversations.length > 0) {
              selectedConvId = conversations[0].id;
            }
          }

          async function loadMemories() {
            if (!selectedConvId) return;

            const longTerm = await roche.memory.getLongTerm({
              conversationId: selectedConvId,
              limit: 1000
            });

            const rawMemories = [
              ...(longTerm.facts || []),
              ...(longTerm.vectors || [])
            ];

            const enhanced = await roche.storage.get(`memoryMeta:${selectedConvId}`) || {};

            memories = rawMemories.map(mem => {
              const meta = enhanced[mem.id] || {};
              return {
                id: mem.id,
                text: mem.summaryText || mem.action || mem.text || '',
                summaryText: mem.summaryText || mem.action || mem.text || '',
                timestamp: mem.timestamp || Date.now(),
                lastRecall: meta.lastRecall || mem.timestamp || Date.now(),
                reviewCount: meta.reviewCount || 0,
                importance: meta.importance || guessImportance(mem.summaryText || mem.text || ''),
                emotion: meta.emotion || guessEmotion(mem.summaryText || mem.text || ''),
                type: meta.type || guessMemoryType(mem.summaryText || mem.text || ''),
                relatedMemories: meta.relatedMemories || [],
                pinned: meta.pinned || false,
                tags: meta.tags || [],
                notes: meta.notes || ''
              };
            });

            memories.sort((a, b) => b.timestamp - a.timestamp);
            analysis = analyzeMemories(memories);
          }

          async function saveMemoryMeta() {
            if (!selectedConvId) return;
            const meta = {};
            memories.forEach(mem => {
              meta[mem.id] = {
                lastRecall: mem.lastRecall,
                reviewCount: mem.reviewCount,
                importance: mem.importance,
                emotion: mem.emotion,
                type: mem.type,
                relatedMemories: mem.relatedMemories,
                pinned: mem.pinned,
                tags: mem.tags,
                notes: mem.notes
              };
            });
            await roche.storage.set(`memoryMeta:${selectedConvId}`, meta);
          }

          // ============ 记忆操作 ============

          async function updateMemory(memId, updates) {
            const mem = memories.find(m => m.id === memId);
            if (!mem) return;

            Object.assign(mem, updates);
            await saveMemoryMeta();
            analysis = analyzeMemories(memories);
          }

          async function autoLinkRelated(memId) {
            const mem = memories.find(m => m.id === memId);
            if (!mem) return;

            const related = findRelatedMemories(mem, memories, 5);
            mem.relatedMemories = related.map(r => r.id);
            await saveMemoryMeta();
          }

          async function batchReview(memIds) {
            memIds.forEach(id => {
              const mem = memories.find(m => m.id === id);
              if (mem) reinforceMemory(mem);
            });
            await saveMemoryMeta();
            analysis = analyzeMemories(memories);
          }

          // ============ 搜索功能 ============

          function searchMemories(query) {
            if (!query) return memories;

            const lowerQuery = query.toLowerCase();
            return memories.filter(mem => {
              const text = (mem.summaryText || mem.text || '').toLowerCase();
              const tags = (mem.tags || []).join(' ').toLowerCase();
              const notes = (mem.notes || '').toLowerCase();

              return text.includes(lowerQuery) ||
                     tags.includes(lowerQuery) ||
                     notes.includes(lowerQuery);
            });
          }

          function filterMemories(filters) {
            let filtered = memories;

            if (filters.type) {
              filtered = filtered.filter(m => m.type === filters.type);
            }

            if (filters.importance) {
              filtered = filtered.filter(m => m.importance === filters.importance);
            }

            if (filters.minRetention !== undefined) {
              filtered = filtered.filter(m => calculateRetention(m) >= filters.minRetention);
            }

            if (filters.maxRetention !== undefined) {
              filtered = filtered.filter(m => calculateRetention(m) <= filters.maxRetention);
            }

            if (filters.pinned) {
              filtered = filtered.filter(m => m.pinned);
            }

            if (filters.tag) {
              filtered = filtered.filter(m => m.tags && m.tags.includes(filters.tag));
            }

            return filtered;
          }

          // ============ 导出功能 ============

          async function exportData(format) {
            let content, filename, mimeType;

            if (format === 'json') {
              content = exportMemoriesJSON(memories);
              filename = `memories-${selectedConvId}-${Date.now()}.json`;
              mimeType = 'application/json';
            } else if (format === 'markdown') {
              content = exportMemoriesMarkdown(memories, analysis);
              filename = `memories-${selectedConvId}-${Date.now()}.md`;
              mimeType = 'text/markdown';
            }

            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            roche.ui.toast('✅ 导出成功');
          }

          // ============ AI 功能 ============

          async function aiExtractMemories() {
            roche.ui.toast('🤖 AI 正在分析对话...');

            const extracted = await extractMemoriesFromConversation(roche, selectedConvId);

            if (extracted.length === 0) {
              roche.ui.toast('未找到新记忆');
              return;
            }

            // 显示提取结果让用户确认
            showExtractedMemoriesDialog(extracted);
          }

          async function aiSuggestLinks(memId) {
            const mem = memories.find(m => m.id === memId);
            if (!mem) return;

            const related = findRelatedMemories(mem, memories, 10);

            if (related.length === 0) {
              roche.ui.toast('未找到相关记忆');
              return;
            }

            showRelatedMemoriesDialog(mem, related);
          }

          // RENDER_FUNCTIONS_PLACEHOLDER

          // 初始化
          await loadConversations();
          await loadMemories();
          render();
        },
        async unmount(container) {
          container.replaceChildren();
        }
      }
    ]
  });
})();
