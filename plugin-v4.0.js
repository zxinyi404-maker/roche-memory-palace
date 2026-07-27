// Roche 记忆宫殿插件 v4.0.0
// 精致版 - 对话式时间轴 + 丰富数据可视化 + 智能分析

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
    fact: { name: '事实', icon: '📌', color: '#3b82f6' },
    experience: { name: '经历', icon: '🎬', color: '#10b981' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444' }
  };

  // ============ 艾宾浩斯算法 ============

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

  // ============ 统计分析 ============

  function analyzeMemories(memories) {
    const now = Date.now();
    const analysis = {
      total: memories.length,
      today: 0,
      thisWeek: 0,
      avgRetention: 0,
      needReview: 0,
      strong: 0,
      byType: {},
      byImportance: {},
      trend: [] // 过去7天的新增趋势
    };

    // 计算7天趋势
    for (let i = 6; i >= 0; i--) {
      const dayStart = now - i * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const count = memories.filter(m => m.timestamp >= dayStart && m.timestamp < dayEnd).length;
      analysis.trend.push({ day: i === 0 ? '今天' : `${i}天前`, count });
    }

    let totalRetention = 0;

    memories.forEach(mem => {
      const daysSince = (now - mem.timestamp) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) analysis.today++;
      if (daysSince < 7) analysis.thisWeek++;

      analysis.byType[mem.type] = (analysis.byType[mem.type] || 0) + 1;
      analysis.byImportance[mem.importance] = (analysis.byImportance[mem.importance] || 0) + 1;

      const retention = calculateRetention(mem);
      totalRetention += retention;

      if (retention < 0.3) analysis.needReview++;
      if (retention > 0.7) analysis.strong++;
    });

    analysis.avgRetention = memories.length > 0 ? totalRetention / memories.length : 0;

    return analysis;
  }

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '4.0.0',
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
          let analysis = null;

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
                summaryText: text,
                timestamp: mem.timestamp || Date.now(),
                lastRecall: meta.lastRecall || mem.timestamp || Date.now(),
                reviewCount: meta.reviewCount || 0,
                importance: meta.importance || guessImportance(text),
                emotion: meta.emotion || guessEmotion(text),
                type: meta.type || guessMemoryType(text),
                sender: meta.sender || 'AI', // AI 或 User
                avatar: meta.avatar || '🤖',
                pinned: meta.pinned || false,
                tags: meta.tags || []
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
                sender: mem.sender,
                avatar: mem.avatar,
                pinned: mem.pinned,
                tags: mem.tags
              };
            });
            await roche.storage.set(`memoryMeta:${selectedConvId}`, meta);
          }

// ============ 渲染主界面 ============

          function render() {
            container.innerHTML = `
              <div class="mp-app-v4">
                <style>
                  /* 全局样式 - 紫粉渐变主题 */
                  .mp-app-v4 {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                  }

                  /* 头部 */
                  .mp-header {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    padding: 20px 24px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                  }
                  .mp-header-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                  }
                  .mp-title {
                    font-size: 28px;
                    font-weight: 800;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                  }
                  .mp-conv-selector {
                    padding: 10px 16px;
                    background: white;
                    border: 2px solid #667eea;
                    border-radius: 12px;
                    font-size: 14px;
                    color: #1f2937;
                    cursor: pointer;
                  }
                  .mp-close-btn {
                    width: 40px;
                    height: 40px;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 50%;
                    color: #6b7280;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                  }
                  .mp-close-btn:hover {
                    background: #fee;
                    border-color: #ef4444;
                    color: #ef4444;
                  }

                  /* 快捷统计卡片 */
                  .mp-quick-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 12px;
                  }
                  .mp-quick-card {
                    background: white;
                    border-radius: 12px;
                    padding: 16px;
                    text-align: center;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                  }
                  .mp-quick-value {
                    font-size: 32px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 4px;
                  }
                  .mp-quick-label {
                    font-size: 12px;
                    color: #6b7280;
                  }

                  /* 导航标签 */
                  .mp-tabs {
                    display: flex;
                    gap: 8px;
                    padding: 16px 24px;
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(10px);
                  }
                  .mp-tab {
                    padding: 10px 20px;
                    background: transparent;
                    border: none;
                    border-radius: 10px;
                    color: #6b7280;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                  }
                  .mp-tab:hover {
                    background: rgba(102, 126, 234, 0.1);
                    color: #667eea;
                  }
                  .mp-tab.active {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                  }

                  /* 内容区 */
                  .mp-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                  }

                  /* 时间轴样式 */
                  .mp-timeline {
                    max-width: 800px;
                    margin: 0 auto;
                  }
                  .mp-date-group {
                    margin-bottom: 32px;
                  }
                  .mp-date-header {
                    font-size: 14px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.9);
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                  }
                  .mp-date-header::after {
                    content: '';
                    flex: 1;
                    height: 2px;
                    background: rgba(255, 255, 255, 0.2);
                  }

                  /* 记忆气泡卡片 */
                  .mp-bubble {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;
                    animation: slideIn 0.3s ease-out;
                  }
                  @keyframes slideIn {
                    from {
                      opacity: 0;
                      transform: translateY(20px);
                    }
                    to {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }
                  .mp-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                  }
                  .mp-bubble-content {
                    flex: 1;
                    background: white;
                    border-radius: 16px;
                    padding: 16px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                  }
                  .mp-bubble-content:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                  }
                  .mp-bubble-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                  }
                  .mp-bubble-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: #1f2937;
                  }
                  .mp-bubble-time {
                    font-size: 12px;
                    color: #9ca3af;
                  }
                  .mp-bubble-text {
                    font-size: 15px;
                    line-height: 1.6;
                    color: #374151;
                    margin-bottom: 12px;
                  }
                  .mp-bubble-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 8px;
                  }
                  .mp-bubble-tags {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                  }
                  .mp-tag {
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                  }
                  .mp-retention-badge {
                    padding: 4px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                  }

                  /* 数据面板 */
                  .mp-dashboard {
                    max-width: 1200px;
                    margin: 0 auto;
                  }
                  .mp-card {
                    background: white;
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
                  }
                  .mp-card-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #1f2937;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }

                  /* 图表样式 */
                  .mp-chart {
                    width: 100%;
                    height: 200px;
                  }
                  .mp-bar-chart {
                    display: flex;
                    align-items: flex-end;
                    gap: 12px;
                    height: 200px;
                  }
                  .mp-bar {
                    flex: 1;
                    background: linear-gradient(180deg, #667eea, #764ba2);
                    border-radius: 8px 8px 0 0;
                    position: relative;
                    transition: all 0.3s;
                    cursor: pointer;
                  }
                  .mp-bar:hover {
                    opacity: 0.8;
                    transform: translateY(-4px);
                  }
                  .mp-bar-label {
                    position: absolute;
                    bottom: -24px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 11px;
                    color: #6b7280;
                    white-space: nowrap;
                  }
                  .mp-bar-value {
                    position: absolute;
                    top: -24px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 12px;
                    font-weight: 600;
                    color: #667eea;
                  }

                  /* 饼图 */
                  .mp-pie-chart {
                    display: flex;
                    align-items: center;
                    gap: 40px;
                  }
                  .mp-pie-legend {
                    flex: 1;
                  }
                  .mp-legend-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                  }
                  .mp-legend-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }
                  .mp-legend-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                  }
                  .mp-legend-percent {
                    font-weight: 600;
                    color: #667eea;
                  }

                  /* 空状态 */
                  .mp-empty {
                    text-align: center;
                    padding: 80px 20px;
                    color: rgba(255, 255, 255, 0.9);
                  }
                  .mp-empty-icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
                  }
                  .mp-empty-text {
                    font-size: 18px;
                    font-weight: 600;
                  }
                </style>

                <!-- 头部 -->
                <div class="mp-header">
                  <div class="mp-header-top">
                    <div class="mp-title">
                      <span>🧠</span>
                      <span>记忆宫殿</span>
                    </div>
                    <select class="mp-conv-selector" id="convSelector">
                      ${conversations.map(c => `
                        <option value="${c.id}" ${c.id === selectedConvId ? 'selected' : ''}>
                          ${c.name || c.title || c.handle || '未命名会话'}
                        </option>
                      `).join('')}
                    </select>
                    <div class="mp-close-btn" id="closeBtn">×</div>
                  </div>

                  ${analysis ? `
                    <div class="mp-quick-stats">
                      <div class="mp-quick-card">
                        <div class="mp-quick-value">${analysis.total}</div>
                        <div class="mp-quick-label">总记忆</div>
                      </div>
                      <div class="mp-quick-card">
                        <div class="mp-quick-value">${analysis.today}</div>
                        <div class="mp-quick-label">今日新增</div>
                      </div>
                      <div class="mp-quick-card">
                        <div class="mp-quick-value">${(analysis.avgRetention * 100).toFixed(0)}%</div>
                        <div class="mp-quick-label">平均保持率</div>
                      </div>
                      <div class="mp-quick-card">
                        <div class="mp-quick-value">${analysis.needReview}</div>
                        <div class="mp-quick-label">需要复习</div>
                      </div>
                    </div>
                  ` : ''}
                </div>

                <!-- 导航标签 -->
                <div class="mp-tabs">
                  <button class="mp-tab ${currentView === 'timeline' ? 'active' : ''}" data-view="timeline">
                    📅 时间轴
                  </button>
                  <button class="mp-tab ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                    📊 数据面板
                  </button>
                  <button class="mp-tab ${currentView === 'curve' ? 'active' : ''}" data-view="curve">
                    📈 遗忘曲线
                  </button>
                  <button class="mp-tab ${currentView === 'review' ? 'active' : ''}" data-view="review">
                    🔄 复习计划
                  </button>
                </div>

                <!-- 内容区 -->
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
                  <div class="mp-empty-text">暂无记忆数据</div>
                  <div style="margin-top: 12px; font-size: 14px; opacity: 0.8;">
                    开始对话后，AI 会自动创建记忆
                  </div>
                </div>
              `;
              return;
            }

            if (currentView === 'timeline') renderTimeline(contentEl);
            else if (currentView === 'dashboard') renderDashboard(contentEl);
            else if (currentView === 'curve') renderCurve(contentEl);
            else if (currentView === 'review') renderReview(contentEl);
          }

          // 渲染时间轴（对话式）
          function renderTimeline(contentEl) {
            // 按日期分组
            const groups = {};
            memories.forEach(mem => {
              const date = new Date(mem.timestamp);
              const dateKey = date.toLocaleDateString('zh-CN');
              if (!groups[dateKey]) groups[dateKey] = [];
              groups[dateKey].push(mem);
            });

            contentEl.innerHTML = `
              <div class="mp-timeline">
                ${Object.entries(groups).map(([date, mems]) => `
                  <div class="mp-date-group">
                    <div class="mp-date-header">${date}</div>
                    ${mems.map(mem => renderBubble(mem)).join('')}
                  </div>
                `).join('')}
              </div>
            `;

            bindBubbleClicks(contentEl);
          }

          // 渲染单个气泡
          function renderBubble(mem) {
            const retention = calculateRetention(mem);
            const typeInfo = MEMORY_TYPES[mem.type] || MEMORY_TYPES.fact;
            const impInfo = IMPORTANCE_LEVELS[mem.importance] || IMPORTANCE_LEVELS[2];
            const retentionColor = retention > 0.7 ? '#10b981' : retention > 0.3 ? '#f59e0b' : '#ef4444';
            const time = new Date(mem.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

            return `
              <div class="mp-bubble" data-id="${mem.id}">
                <div class="mp-avatar">${mem.avatar}</div>
                <div class="mp-bubble-content">
                  <div class="mp-bubble-header">
                    <div class="mp-bubble-name">${mem.sender === 'User' ? '你' : 'AI'}</div>
                    <div class="mp-bubble-time">${time}</div>
                  </div>
                  <div class="mp-bubble-text">${mem.text}</div>
                  <div class="mp-bubble-footer">
                    <div class="mp-bubble-tags">
                      <span class="mp-tag" style="background: ${typeInfo.color}22; color: ${typeInfo.color};">
                        ${typeInfo.icon} ${typeInfo.name}
                      </span>
                      <span class="mp-tag" style="background: ${impInfo.color}22; color: ${impInfo.color};">
                        ${impInfo.name}
                      </span>
                    </div>
                    <div class="mp-retention-badge" style="background: ${retentionColor}22; color: ${retentionColor};">
                      <span>💪</span>
                      <span>${(retention * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }

          function bindBubbleClicks(parentEl) {
            parentEl.querySelectorAll('.mp-bubble').forEach(el => {
              el.onclick = async () => {
                const memId = el.dataset.id;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  await saveMemoryMeta();
                  roche.ui.toast('✅ 记忆已巩固！');
                  render();
                }
              };
            });
          }

          // 渲染数据面板
          function renderDashboard(contentEl) {
            contentEl.innerHTML = `
              <div class="mp-dashboard">
                <!-- 趋势图 -->
                <div class="mp-card">
                  <div class="mp-card-title">📈 记忆增长趋势</div>
                  <div class="mp-bar-chart">
                    ${analysis.trend.map((item, idx) => {
                      const maxCount = Math.max(...analysis.trend.map(t => t.count), 1);
                      const height = (item.count / maxCount) * 100;
                      return `
                        <div class="mp-bar" style="height: ${height}%;">
                          <div class="mp-bar-value">${item.count}</div>
                          <div class="mp-bar-label">${item.day}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

                <!-- 类型分布 -->
                <div class="mp-card">
                  <div class="mp-card-title">🏷️ 记忆类型分布</div>
                  <div class="mp-pie-legend">
                    ${Object.entries(analysis.byType).map(([type, count]) => {
                      const typeInfo = MEMORY_TYPES[type] || MEMORY_TYPES.fact;
                      const percent = ((count / analysis.total) * 100).toFixed(1);
                      return `
                        <div class="mp-legend-item">
                          <div class="mp-legend-label">
                            <div class="mp-legend-dot" style="background: ${typeInfo.color};"></div>
                            <span>${typeInfo.icon} ${typeInfo.name}</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="color: #6b7280;">${count}</span>
                            <span class="mp-legend-percent">${percent}%</span>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

                <!-- 重要性分布 -->
                <div class="mp-card">
                  <div class="mp-card-title">⭐ 重要性分布</div>
                  <div class="mp-pie-legend">
                    ${[5, 4, 3, 2, 1].map(imp => {
                      const impInfo = IMPORTANCE_LEVELS[imp];
                      const count = analysis.byImportance[imp] || 0;
                      const percent = count > 0 ? ((count / analysis.total) * 100).toFixed(1) : 0;
                      return `
                        <div class="mp-legend-item">
                          <div class="mp-legend-label">
                            <div class="mp-legend-dot" style="background: ${impInfo.color};"></div>
                            <span>${impInfo.name}</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="color: #6b7280;">${count}</span>
                            <span class="mp-legend-percent">${percent}%</span>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            `;
          }

          // 渲染遗忘曲线
          function renderCurve(contentEl) {
            contentEl.innerHTML = `
              <div class="mp-dashboard">
                <div class="mp-card">
                  <div class="mp-card-title">📈 艾宾浩斯遗忘曲线</div>
                  <p style="color: #6b7280; margin-bottom: 20px;">
                    展示记忆随时间的自然衰减过程
                  </p>
                  <svg viewBox="0 0 100 100" style="width: 100%; height: 300px;">
                    <defs>
                      <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                      </linearGradient>
                    </defs>

                    <!-- 网格 -->
                    ${[0, 20, 40, 60, 80, 100].map(y => `
                      <line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#e5e7eb" stroke-width="0.2"/>
                    `).join('')}

                    <!-- 坐标轴 -->
                    <line x1="0" y1="100" x2="100" y2="100" stroke="#9ca3af" stroke-width="0.5"/>
                    <line x1="0" y1="0" x2="0" y2="100" stroke="#9ca3af" stroke-width="0.5"/>

                    <!-- 曲线 -->
                    <polyline
                      points="${Array.from({length: 31}, (_, d) => {
                        const x = (d / 30) * 100;
                        const retention = Math.exp(-d / 7) * 100;
                        const y = 100 - retention;
                        return `${x},${y}`;
                      }).join(' ')}"
                      fill="none"
                      stroke="url(#curveGradient)"
                      stroke-width="2"
                    />
                  </svg>
                  <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 12px; color: #6b7280;">
                    <span>今天</span>
                    <span>7天</span>
                    <span>14天</span>
                    <span>21天</span>
                    <span>30天</span>
                  </div>
                </div>
              </div>
            `;
          }

          // 渲染复习计划
          function renderReview(contentEl) {
            const needReview = memories
              .filter(m => calculateRetention(m) < 0.3)
              .sort((a, b) => calculateRetention(a) - calculateRetention(b));

            contentEl.innerHTML = `
              <div class="mp-timeline">
                <div class="mp-card" style="margin-bottom: 20px;">
                  <div class="mp-card-title">🔄 需要复习的记忆 (${needReview.length})</div>
                  <p style="color: #6b7280;">
                    以下记忆保持率低于30%，建议立即复习以巩固记忆
                  </p>
                </div>

                ${needReview.length === 0 ? `
                  <div class="mp-empty">
                    <div class="mp-empty-icon">✨</div>
                    <div class="mp-empty-text">所有记忆都很牢固！</div>
                    <div style="margin-top: 12px; font-size: 14px; opacity: 0.8;">
                      继续保持良好的复习习惯
                    </div>
                  </div>
                ` : needReview.map(mem => renderBubble(mem)).join('')}
              </div>
            `;

            bindBubbleClicks(contentEl);
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
