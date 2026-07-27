// Roche 记忆宫殿插件 v1.0.0
// 基于艾宾浩斯遗忘曲线的深度记忆管理系统

(function() {
  'use strict';

  // ============ 核心算法：艾宾浩斯遗忘曲线 ============

  // 重要性等级 1-5
  const IMPORTANCE_LEVELS = {
    1: { name: '琐事', color: '#94a3b8', baseStrength: 1, floor: 0, reinforceFactor: 1.2 },
    2: { name: '一般', color: '#60a5fa', baseStrength: 3, floor: 0.1, reinforceFactor: 1.5 },
    3: { name: '重要', color: '#f59e0b', baseStrength: 7, floor: 0.3, reinforceFactor: 2.0 },
    4: { name: '关键', color: '#ef4444', baseStrength: 15, floor: 0.5, reinforceFactor: 2.5 },
    5: { name: '刻骨铭心', color: '#a855f7', baseStrength: 30, floor: 0.7, reinforceFactor: 3.0 }
  };

  // 情绪等级 0-5
  const EMOTION_LEVELS = {
    0: { name: '中性', color: '#6b7280', strengthBonus: 0 },
    1: { name: '平静', color: '#3b82f6', strengthBonus: 0.5 },
    2: { name: '愉悦', color: '#10b981', strengthBonus: 1 },
    3: { name: '激动', color: '#f59e0b', strengthBonus: 2 },
    4: { name: '强烈', color: '#ef4444', strengthBonus: 4 },
    5: { name: '极致', color: '#dc2626', strengthBonus: 8 }
  };

  // 记忆类型
  const MEMORY_TYPES = {
    fact: { name: '事实', icon: '📌', color: '#3b82f6' },
    experience: { name: '经历', icon: '🎬', color: '#10b981' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444' }
  };

  // 计算记忆强度 R = e^(-t/S)
  function calculateRetention(memory) {
    const now = Date.now();
    const timePassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24); // 天
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emo = EMOTION_LEVELS[memory.emotion || 0] || EMOTION_LEVELS[0];

    const strength = imp.baseStrength + emo.strengthBonus + (memory.reviewCount || 0) * 0.5;
    const retention = Math.exp(-timePassed / strength);

    return Math.max(retention, imp.floor);
  }

  // 巩固记忆（复习）
  function reinforceMemory(memory) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    memory.strength = (memory.strength || imp.baseStrength) * imp.reinforceFactor;
    return memory;
  }

  // 智能分类：根据关键词猜测记忆类型
  function guessMemoryType(text) {
    const factKeywords = ['是', '叫', '住在', '来自', '出生于', '职业'];
    const experienceKeywords = ['经历', '发生', '去了', '做了', '看到', '遇到'];
    const skillKeywords = ['会', '能', '擅长', '学会', '掌握'];
    const relationshipKeywords = ['朋友', '认识', '关系', '喜欢', '讨厌'];
    const knowledgeKeywords = ['知道', '了解', '学习', '原理', '概念'];
    const emotionKeywords = ['感觉', '情绪', '开心', '难过', '愤怒', '害怕'];

    if (factKeywords.some(kw => text.includes(kw))) return 'fact';
    if (experienceKeywords.some(kw => text.includes(kw))) return 'experience';
    if (skillKeywords.some(kw => text.includes(kw))) return 'skill';
    if (relationshipKeywords.some(kw => text.includes(kw))) return 'relationship';
    if (knowledgeKeywords.some(kw => text.includes(kw))) return 'knowledge';
    if (emotionKeywords.some(kw => text.includes(kw))) return 'emotion';

    return 'fact'; // 默认
  }

  // 猜测重要性
  function guessImportance(text) {
    const trivialKeywords = ['可能', '也许', '好像'];
    const importantKeywords = ['一定', '必须', '重要', '关键'];
    const criticalKeywords = ['永远', '刻骨铭心', '难忘', '生死'];

    if (criticalKeywords.some(kw => text.includes(kw))) return 5;
    if (importantKeywords.some(kw => text.includes(kw))) return 4;
    if (trivialKeywords.some(kw => text.includes(kw))) return 1;

    return 2; // 默认一般
  }

  // 猜测情绪强度
  function guessEmotion(text) {
    const emotionWords = {
      5: ['极度', '彻底', '无比', '太过', '崩溃'],
      4: ['非常', '特别', '超级', '巨大', '强烈'],
      3: ['很', '激动', '兴奋', '愤怒', '悲伤'],
      2: ['有点', '开心', '难过', '愉快'],
      1: ['平静', '淡定', '稳定'],
      0: []
    };

    for (let level = 5; level >= 0; level--) {
      if (emotionWords[level].some(kw => text.includes(kw))) return level;
    }

    return 0;
  }

  // ============ 向量检索（使用 Roche 原生向量记忆）============

  async function searchSimilarMemories(roche, conversationId, queryText, limit = 10) {
    // 使用 Roche 的向量搜索
    const results = await roche.memory.search({
      conversationId,
      query: queryText,
      limit
    });

    return results.filter(r => r.kind === 'vector' || r.kind === 'fact');
  }

  // ============ 记忆关联网络 ============

  function buildMemoryGraph(memories) {
    const graph = { nodes: [], links: [] };

    memories.forEach((mem, idx) => {
      graph.nodes.push({
        id: mem.id,
        label: mem.summaryText || mem.text,
        type: mem.type || 'fact',
        importance: mem.importance || 2,
        retention: calculateRetention(mem),
        relatedIds: mem.relatedMemories || []
      });
    });

    // 构建边
    memories.forEach(mem => {
      if (mem.relatedMemories && mem.relatedMemories.length > 0) {
        mem.relatedMemories.forEach(targetId => {
          if (graph.nodes.some(n => n.id === targetId)) {
            graph.links.push({
              source: mem.id,
              target: targetId
            });
          }
        });
      }
    });

    return graph;
  }

  // ============ 主插件逻辑 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '1.0.0',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          let currentView = 'dashboard'; // dashboard | timeline | graph | review
          let memories = [];
          let conversations = [];
          let selectedConvId = null;

          // 加载会话列表
          async function loadConversations() {
            conversations = await roche.conversation.list();
            const saved = await roche.storage.get('selectedConversation');
            if (saved && conversations.some(c => c.id === saved)) {
              selectedConvId = saved;
            } else if (conversations.length > 0) {
              selectedConvId = conversations[0].id;
            }
          }

          // 加载记忆
          async function loadMemories() {
            if (!selectedConvId) return;

            const longTerm = await roche.memory.getLongTerm({
              conversationId: selectedConvId,
              limit: 500
            });

            const rawMemories = [
              ...(longTerm.facts || []),
              ...(longTerm.vectors || [])
            ];

            // 增强记忆元数据
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
          }

          // 保存增强元数据
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

          // 渲染函数（分块）
          function render() {
            container.innerHTML = `
              <div class="memory-palace-app">
                <style>
                  .memory-palace-app {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                  }
                  .mp-header {
                    background: rgba(255,255,255,0.95);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  }
                  .mp-title {
                    font-size: 24px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                  }
                  .mp-conv-selector {
                    padding: 8px 12px;
                    border: 2px solid #667eea;
                    border-radius: 8px;
                    font-size: 14px;
                    background: white;
                    cursor: pointer;
                  }
                  .mp-nav {
                    display: flex;
                    gap: 10px;
                    background: rgba(255,255,255,0.9);
                    padding: 10px 20px;
                  }
                  .mp-nav-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: rgba(102,126,234,0.1);
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 14px;
                    font-weight: 500;
                  }
                  .mp-nav-btn.active {
                    background: #667eea;
                    color: white;
                  }
                  .mp-nav-btn:hover {
                    background: #667eea;
                    color: white;
                  }
                  .mp-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                  }
                  .mp-card {
                    background: rgba(255,255,255,0.95);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 16px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                  }
                  .mp-stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 20px;
                  }
                  .mp-stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 12px;
                    text-align: center;
                  }
                  .mp-stat-value {
                    font-size: 36px;
                    font-weight: 700;
                    margin-bottom: 8px;
                  }
                  .mp-stat-label {
                    font-size: 14px;
                    opacity: 0.9;
                  }
                  .mp-memory-item {
                    background: white;
                    border-left: 4px solid #667eea;
                    padding: 16px;
                    margin-bottom: 12px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    cursor: pointer;
                    transition: all 0.2s;
                  }
                  .mp-memory-item:hover {
                    transform: translateX(4px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                  }
                  .mp-memory-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                  }
                  .mp-memory-icon {
                    font-size: 20px;
                  }
                  .mp-memory-type {
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    background: #f3f4f6;
                    color: #374151;
                  }
                  .mp-memory-text {
                    font-size: 14px;
                    line-height: 1.6;
                    color: #1f2937;
                    margin-bottom: 8px;
                  }
                  .mp-memory-meta {
                    display: flex;
                    gap: 12px;
                    font-size: 12px;
                    color: #6b7280;
                  }
                  .mp-retention-bar {
                    height: 6px;
                    background: #e5e7eb;
                    border-radius: 3px;
                    overflow: hidden;
                    margin-top: 8px;
                  }
                  .mp-retention-fill {
                    height: 100%;
                    transition: width 0.3s;
                  }
                  .mp-btn-primary {
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                  }
                  .mp-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102,126,234,0.4);
                  }
                  .mp-empty {
                    text-align: center;
                    padding: 60px 20px;
                    color: rgba(255,255,255,0.8);
                  }
                  .mp-empty-icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                  }
                </style>

                <div class="mp-header">
                  <div class="mp-title">🧠 记忆宫殿</div>
                  <select class="mp-conv-selector" id="convSelector">
                    ${conversations.map(c => `
                      <option value="${c.id}" ${c.id === selectedConvId ? 'selected' : ''}>
                        ${c.name || c.title || c.handle || '未命名会话'}
                      </option>
                    `).join('')}
                  </select>
                  <button class="mp-nav-btn" id="closeBtn">×</button>
                </div>

                <div class="mp-nav">
                  <button class="mp-nav-btn ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">📊 仪表盘</button>
                  <button class="mp-nav-btn ${currentView === 'timeline' ? 'active' : ''}" data-view="timeline">📅 时间轴</button>
                  <button class="mp-nav-btn ${currentView === 'graph' ? 'active' : ''}" data-view="graph">🕸️ 关联图</button>
                  <button class="mp-nav-btn ${currentView === 'review' ? 'active' : ''}" data-view="review">🔄 复习</button>
                </div>

                <div class="mp-content" id="mpContent"></div>
              </div>
            `;

            // 事件绑定
            container.querySelector('#closeBtn').onclick = () => roche.ui.closeApp();

            container.querySelector('#convSelector').onchange = async (e) => {
              selectedConvId = e.target.value;
              await roche.storage.set('selectedConversation', selectedConvId);
              await loadMemories();
              render();
            };

            container.querySelectorAll('[data-view]').forEach(btn => {
              btn.onclick = () => {
                currentView = btn.dataset.view;
                render();
              };
            });

            renderContent();
          }

          function renderContent() {
            const contentEl = container.querySelector('#mpContent');

            if (!selectedConvId || memories.length === 0) {
              contentEl.innerHTML = `
                <div class="mp-empty">
                  <div class="mp-empty-icon">💭</div>
                  <div>暂无记忆数据</div>
                </div>
              `;
              return;
            }

            if (currentView === 'dashboard') {
              renderDashboard(contentEl);
            } else if (currentView === 'timeline') {
              renderTimeline(contentEl);
            } else if (currentView === 'graph') {
              renderGraph(contentEl);
            } else if (currentView === 'review') {
              renderReview(contentEl);
            }
          }

          function renderDashboard(contentEl) {
            const totalMemories = memories.length;
            const avgRetention = memories.reduce((sum, m) => sum + calculateRetention(m), 0) / totalMemories;
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).length;
            const byType = {};
            memories.forEach(m => {
              byType[m.type] = (byType[m.type] || 0) + 1;
            });

            contentEl.innerHTML = `
              <div class="mp-stat-grid">
                <div class="mp-stat-card">
                  <div class="mp-stat-value">${totalMemories}</div>
                  <div class="mp-stat-label">总记忆数</div>
                </div>
                <div class="mp-stat-card">
                  <div class="mp-stat-value">${(avgRetention * 100).toFixed(0)}%</div>
                  <div class="mp-stat-label">平均保持率</div>
                </div>
                <div class="mp-stat-card">
                  <div class="mp-stat-value">${needReview}</div>
                  <div class="mp-stat-label">需要复习</div>
                </div>
              </div>

              <div class="mp-card">
                <h3 style="margin-top:0;">📈 记忆分布</h3>
                ${Object.keys(byType).map(type => {
                  const typeInfo = MEMORY_TYPES[type] || MEMORY_TYPES.fact;
                  const count = byType[type];
                  const percent = (count / totalMemories * 100).toFixed(1);
                  return `
                    <div style="margin-bottom: 12px;">
                      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>${typeInfo.icon} ${typeInfo.name}</span>
                        <span>${count} (${percent}%)</span>
                      </div>
                      <div style="height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden;">
                        <div style="width:${percent}%; height:100%; background:${typeInfo.color};"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="mp-card">
                <h3 style="margin-top:0;">🔥 最近记忆</h3>
                ${memories.slice(0, 10).map(mem => renderMemoryItem(mem)).join('')}
              </div>
            `;
          }

          function renderMemoryItem(mem) {
            const retention = calculateRetention(mem);
            const typeInfo = MEMORY_TYPES[mem.type] || MEMORY_TYPES.fact;
            const impInfo = IMPORTANCE_LEVELS[mem.importance] || IMPORTANCE_LEVELS[2];
            const retentionColor = retention > 0.7 ? '#10b981' : retention > 0.3 ? '#f59e0b' : '#ef4444';

            return `
              <div class="mp-memory-item" data-id="${mem.id}" style="border-left-color: ${typeInfo.color};">
                <div class="mp-memory-header">
                  <span class="mp-memory-icon">${typeInfo.icon}</span>
                  <span class="mp-memory-type">${typeInfo.name}</span>
                  <span class="mp-memory-type" style="background:${impInfo.color}; color:white;">${impInfo.name}</span>
                </div>
                <div class="mp-memory-text">${mem.summaryText || mem.text}</div>
                <div class="mp-memory-meta">
                  <span>📅 ${new Date(mem.timestamp).toLocaleDateString()}</span>
                  <span>🔄 复习 ${mem.reviewCount || 0} 次</span>
                  <span>💪 保持率 ${(retention * 100).toFixed(0)}%</span>
                </div>
                <div class="mp-retention-bar">
                  <div class="mp-retention-fill" style="width: ${retention * 100}%; background: ${retentionColor};"></div>
                </div>
              </div>
            `;
          }

          function renderTimeline(contentEl) {
            const sortedMemories = [...memories].sort((a, b) => b.timestamp - a.timestamp);

            contentEl.innerHTML = `
              <div class="mp-card">
                <h2 style="margin-top:0;">📅 记忆时间轴</h2>
                ${sortedMemories.map(mem => renderMemoryItem(mem)).join('')}
              </div>
            `;

            // 绑定点击事件
            contentEl.querySelectorAll('.mp-memory-item').forEach(el => {
              el.onclick = () => showMemoryDetail(el.dataset.id);
            });
          }

          function renderGraph(contentEl) {
            contentEl.innerHTML = `
              <div class="mp-card">
                <h2 style="margin-top:0;">🕸️ 记忆关联网络</h2>
                <p style="color:#6b7280;">关联网络可视化功能开发中...</p>
                <p style="color:#6b7280;">将展示记忆之间的连接关系，形成知识图谱</p>
              </div>
            `;
          }

          function renderReview(contentEl) {
            const needReview = memories
              .filter(m => calculateRetention(m) < 0.3)
              .sort((a, b) => calculateRetention(a) - calculateRetention(b));

            contentEl.innerHTML = `
              <div class="mp-card">
                <h2 style="margin-top:0;">🔄 需要复习的记忆</h2>
                <p style="color:#6b7280; margin-bottom:20px;">
                  找到 ${needReview.length} 条记忆需要复习（保持率 < 30%）
                </p>
                ${needReview.length === 0 ?
                  '<div class="mp-empty"><div class="mp-empty-icon">✨</div><div>所有记忆都很牢固！</div></div>' :
                  needReview.map(mem => renderMemoryItem(mem)).join('')
                }
              </div>
            `;

            // 绑定复习按钮
            contentEl.querySelectorAll('.mp-memory-item').forEach(el => {
              el.onclick = async () => {
                const memId = el.dataset.id;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  await saveMemoryMeta();
                  roche.ui.toast('✅ 记忆已巩固');
                  render();
                }
              };
            });
          }

          async function showMemoryDetail(memId) {
            const mem = memories.find(m => m.id === memId);
            if (!mem) return;

            // TODO: 显示记忆详情弹窗
            roche.ui.toast(`记忆详情：${mem.summaryText || mem.text}`);
          }

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
