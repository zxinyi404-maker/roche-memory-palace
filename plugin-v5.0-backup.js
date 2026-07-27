// Roche 记忆宫殿插件 v5.0.0
// 完全按照设计图布局

(function() {
  'use strict';

  // ============ 配置 ============

  const IMPORTANCE_LEVELS = {
    1: { name: '琐事', color: '#94a3b8', strength: 1, floor: 0, factor: 1.2 },
    2: { name: '一般', color: '#60a5fa', strength: 3, floor: 0.1, factor: 1.5 },
    3: { name: '重要', color: '#fbbf24', strength: 7, floor: 0.3, factor: 2.0 },
    4: { name: '关键', color: '#f87171', strength: 15, floor: 0.5, factor: 2.5 },
    5: { name: '刻骨铭心', color: '#c084fc', strength: 30, floor: 0.7, factor: 3.0 }
  };

  const MEMORY_TYPES = {
    fact: { name: '事实', icon: '📌', color: '#3b82f6', bg: '#dbeafe' },
    experience: { name: '经历', icon: '🎬', color: '#10b981', bg: '#d1fae5' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b', bg: '#fef3c7' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899', bg: '#fce7f3' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6', bg: '#ede9fe' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444', bg: '#fee2e2' }
  };

  // 算法函数（保持不变）
  function calculateRetention(memory) {
    const now = Date.now();
    const daysPassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24);
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emotionBonus = [0, 0.5, 1, 2, 4, 8][memory.emotion || 0] || 0;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;
    const S = imp.strength + emotionBonus + reviewBonus;
    const retention = Math.exp(-daysPassed / S);
    return Math.max(retention, imp.floor);
  }

  function reinforceMemory(memory) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    memory.strength = (memory.strength || imp.strength) * imp.factor;
    return memory;
  }

  function guessMemoryType(text) {
    const patterns = {
      fact: ['是', '叫', '住在', '来自'],
      experience: ['经历', '发生', '去了', '做了'],
      skill: ['会', '能', '擅长', '学会'],
      relationship: ['朋友', '认识', '喜欢'],
      knowledge: ['知道', '了解', '学习'],
      emotion: ['感觉', '开心', '难过']
    };
    for (const [type, kw] of Object.entries(patterns)) {
      if (kw.some(k => text.includes(k))) return type;
    }
    return 'fact';
  }

  function guessImportance(text) {
    if (/永远|刻骨铭心|难忘/.test(text)) return 5;
    if (/重要|关键|必须/.test(text)) return 4;
    if (/可能|也许/.test(text)) return 1;
    return 2;
  }

  function guessEmotion(text) {
    if (/极度|崩溃/.test(text)) return 5;
    if (/非常|强烈/.test(text)) return 4;
    if (/很|激动/.test(text)) return 3;
    if (/有点|开心/.test(text)) return 2;
    if (/平静/.test(text)) return 1;
    return 0;
  }

  function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
  }

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '5.0.0',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          let currentView = 'timeline';
          let memories = [];
          let conversations = [];
          let selectedConvId = null;

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
              const text = mem.summaryText || mem.action || mem.text || '';

              return {
                id: mem.id,
                text: text,
                timestamp: mem.timestamp || Date.now(),
                lastRecall: meta.lastRecall || mem.timestamp || Date.now(),
                reviewCount: meta.reviewCount || 0,
                importance: meta.importance || guessImportance(text),
                emotion: meta.emotion || guessEmotion(text),
                type: meta.type || guessMemoryType(text),
                pinned: meta.pinned || false
              };
            });

            memories.sort((a, b) => b.timestamp - a.timestamp);
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
                pinned: mem.pinned
              };
            });
            await roche.storage.set(`memoryMeta:${selectedConvId}`, meta);
          }

// ============ 渲染界面（完全按照设计图）============

          function render() {
            container.innerHTML = `
              <div class="memory-timeline-app">
                <style>
                  /* 全局样式 */
                  * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                  }

                  .memory-timeline-app {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                    display: flex;
                    flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                  }

                  /* 顶部导航栏 */
                  .app-header {
                    background: rgba(26, 26, 46, 0.95);
                    backdrop-filter: blur(10px);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                  }
                  .header-back {
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .header-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: white;
                    flex: 1;
                    text-align: center;
                  }
                  .header-menu {
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }

                  /* 内容滚动区 */
                  .app-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px 16px;
                  }

                  /* 记忆卡片 */
                  .memory-card {
                    background: white;
                    border-radius: 16px;
                    padding: 16px;
                    margin-bottom: 12px;
                    display: flex;
                    gap: 12px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                    overflow: hidden;
                  }
                  .memory-card::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 4px;
                    background: currentColor;
                  }
                  .memory-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
                  }

                  /* 左侧图标 */
                  .memory-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    flex-shrink: 0;
                  }

                  /* 右侧内容 */
                  .memory-content {
                    flex: 1;
                    min-width: 0;
                  }
                  .memory-time {
                    font-size: 12px;
                    color: #9ca3af;
                    margin-bottom: 6px;
                  }
                  .memory-text {
                    font-size: 15px;
                    line-height: 1.5;
                    color: #1f2937;
                    margin-bottom: 10px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                  }
                  .memory-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 8px;
                  }
                  .memory-tags {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                  }
                  .memory-tag {
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                  }
                  .memory-retention {
                    font-size: 12px;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                  }

                  /* 底部统计栏 */
                  .app-footer {
                    background: rgba(26, 26, 46, 0.95);
                    backdrop-filter: blur(10px);
                    padding: 16px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    gap: 16px;
                  }
                  .footer-stat {
                    flex: 1;
                    text-align: center;
                  }
                  .footer-stat-value {
                    font-size: 20px;
                    font-weight: 700;
                    color: white;
                    margin-bottom: 4px;
                  }
                  .footer-stat-label {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.6);
                  }

                  /* 空状态 */
                  .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    color: rgba(255, 255, 255, 0.6);
                  }
                  .empty-icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                  }
                  .empty-text {
                    font-size: 16px;
                  }

                  /* 滚动条样式 */
                  .app-content::-webkit-scrollbar {
                    width: 6px;
                  }
                  .app-content::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                  }
                  .app-content::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                  }
                  .app-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                  }

                  /* 加载动画 */
                  @keyframes fadeInUp {
                    from {
                      opacity: 0;
                      transform: translateY(20px);
                    }
                    to {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }
                  .memory-card {
                    animation: fadeInUp 0.3s ease-out;
                  }
                </style>

                <!-- 顶部导航 -->
                <div class="app-header">
                  <div class="header-back" id="closeBtn">←</div>
                  <div class="header-title">记忆时光机</div>
                  <div class="header-menu">⋮</div>
                </div>

                <!-- 内容区 -->
                <div class="app-content" id="appContent">
                  ${renderMemoryList()}
                </div>

                <!-- 底部统计 -->
                <div class="app-footer">
                  <div class="footer-stat">
                    <div class="footer-stat-value">${memories.length}</div>
                    <div class="footer-stat-label">总记忆</div>
                  </div>
                  <div class="footer-stat">
                    <div class="footer-stat-value">${memories.filter(m => {
                      const daysSince = (Date.now() - m.timestamp) / (1000 * 60 * 60 * 24);
                      return daysSince < 1;
                    }).length}</div>
                    <div class="footer-stat-label">今日新增</div>
                  </div>
                  <div class="footer-stat">
                    <div class="footer-stat-value">${memories.length > 0 ?
                      (memories.reduce((sum, m) => sum + calculateRetention(m), 0) / memories.length * 100).toFixed(0) : 0}%</div>
                    <div class="footer-stat-label">平均保持率</div>
                  </div>
                  <div class="footer-stat">
                    <div class="footer-stat-value">${memories.filter(m => calculateRetention(m) < 0.3).length}</div>
                    <div class="footer-stat-label">待复习</div>
                  </div>
                </div>
              </div>
            `;

            // 事件绑定
            container.querySelector('#closeBtn').onclick = () => roche.ui.closeApp();
            bindCardClicks();
          }

          function renderMemoryList() {
            if (memories.length === 0) {
              return `
                <div class="empty-state">
                  <div class="empty-icon">💭</div>
                  <div class="empty-text">暂无记忆</div>
                  <div style="margin-top: 8px; font-size: 14px;">开始对话，创建第一条记忆</div>
                </div>
              `;
            }

            return memories.map(mem => renderMemoryCard(mem)).join('');
          }

          function renderMemoryCard(mem) {
            const typeInfo = MEMORY_TYPES[mem.type] || MEMORY_TYPES.fact;
            const impInfo = IMPORTANCE_LEVELS[mem.importance] || IMPORTANCE_LEVELS[2];
            const retention = calculateRetention(mem);
            const retentionColor = retention > 0.7 ? '#10b981' : retention > 0.3 ? '#f59e0b' : '#ef4444';
            const timeAgo = getTimeAgo(mem.timestamp);

            return `
              <div class="memory-card" data-id="${mem.id}" style="color: ${typeInfo.color};">
                <div class="memory-icon" style="background: ${typeInfo.bg};">
                  ${typeInfo.icon}
                </div>
                <div class="memory-content">
                  <div class="memory-time">${timeAgo}</div>
                  <div class="memory-text">${mem.text}</div>
                  <div class="memory-footer">
                    <div class="memory-tags">
                      <span class="memory-tag" style="background: ${typeInfo.bg}; color: ${typeInfo.color};">
                        ${typeInfo.name}
                      </span>
                      <span class="memory-tag" style="background: ${impInfo.color}22; color: ${impInfo.color};">
                        ${impInfo.name}
                      </span>
                    </div>
                    <div class="memory-retention" style="background: ${retentionColor}22; color: ${retentionColor};">
                      <span>💪</span>
                      <span>${(retention * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }

          function bindCardClicks() {
            container.querySelectorAll('.memory-card').forEach(el => {
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
