// Roche 记忆宫殿插件 v3.0.0
// 真正的记忆宫殿 - 房间布局 + 遗忘曲线可视化

(function() {
  'use strict';

  // ============ 配置常量 ============

  const IMPORTANCE_LEVELS = {
    1: { name: '琐事', color: '#9ca3af', size: 60, strength: 1, floor: 0, factor: 1.2 },
    2: { name: '一般', color: '#60a5fa', size: 80, strength: 3, floor: 0.1, factor: 1.5 },
    3: { name: '重要', color: '#fbbf24', size: 100, strength: 7, floor: 0.3, factor: 2.0 },
    4: { name: '关键', color: '#f87171', size: 120, strength: 15, floor: 0.5, factor: 2.5 },
    5: { name: '刻骨铭心', color: '#c084fc', size: 140, strength: 30, floor: 0.7, factor: 3.0 }
  };

  const EMOTION_BONUS = {
    0: 0, 1: 0.5, 2: 1, 3: 2, 4: 4, 5: 8
  };

  const MEMORY_TYPES = {
    fact: { name: '事实', icon: '📌', color: '#3b82f6' },
    experience: { name: '经历', icon: '🎬', color: '#10b981' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444' }
  };

  // ============ 艾宾浩斯遗忘曲线 ============

  function calculateRetention(memory) {
    const now = Date.now();
    const daysPassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24);
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emoBonus = EMOTION_BONUS[memory.emotion || 0] || 0;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;

    const S = imp.strength + emoBonus + reviewBonus;
    const retention = Math.exp(-daysPassed / S);

    return Math.max(retention, imp.floor);
  }

  function predictRetention(memory, futureDays) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emoBonus = EMOTION_BONUS[memory.emotion || 0] || 0;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;
    const S = imp.strength + emoBonus + reviewBonus;

    const retention = Math.exp(-futureDays / S);
    return Math.max(retention, imp.floor);
  }

  function reinforceMemory(memory) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    memory.strength = (memory.strength || imp.strength) * imp.factor;
    return memory;
  }

  function getNextReviewTime(memory) {
    const imp = IMPORTANCE_LEVELS[memory.importance] || IMPORTANCE_LEVELS[2];
    const emoBonus = EMOTION_BONUS[memory.emotion || 0] || 0;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;
    const S = imp.strength + emoBonus + reviewBonus;

    // 当保持率降到30%时需要复习
    const daysUntil = -S * Math.log(0.3);
    const reviewTime = memory.lastRecall + (daysUntil * 24 * 60 * 60 * 1000);

    return reviewTime;
  }

  // ============ 智能分类 ============

  function guessMemoryType(text) {
    const patterns = {
      fact: ['是', '叫', '住在', '来自', '出生', '职业'],
      experience: ['经历', '发生', '去了', '做了', '看到', '遇到'],
      skill: ['会', '能', '擅长', '学会', '掌握'],
      relationship: ['朋友', '认识', '关系', '喜欢', '讨厌'],
      knowledge: ['知道', '了解', '学习', '原理', '概念'],
      emotion: ['感觉', '情绪', '开心', '难过', '愤怒']
    };
    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(kw => text.includes(kw))) return type;
    }
    return 'fact';
  }

  function guessImportance(text) {
    if (/永远|刻骨铭心|难忘|生死/.test(text)) return 5;
    if (/一定|必须|重要|关键/.test(text)) return 4;
    if (/可能|也许|好像/.test(text)) return 1;
    return 2;
  }

  function guessEmotion(text) {
    if (/极度|彻底|无比|崩溃/.test(text)) return 5;
    if (/非常|特别|超级|强烈/.test(text)) return 4;
    if (/很|激动|兴奋|愤怒/.test(text)) return 3;
    if (/有点|开心|难过/.test(text)) return 2;
    if (/平静|淡定/.test(text)) return 1;
    return 0;
  }

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '3.0.0',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          let currentView = 'palace';
          let memories = [];
          let conversations = [];
          let selectedConvId = null;
          let selectedMemory = null;

          // 加载会话
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
                relatedMemories: meta.relatedMemories || [],
                pinned: meta.pinned || false,
                tags: meta.tags || [],
                notes: meta.notes || ''
              };
            });

            memories.sort((a, b) => b.importance - a.importance);
          }

          // 保存元数据
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

// ============ 渲染主界面 ============

          function render() {
            container.innerHTML = `
              <div class="memory-palace-v3">
                <style>
                  /* 全局样式 - 浅色温暖主题 */
                  .memory-palace-v3 {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 25%, #fcd34d 50%, #fbbf24 75%, #f59e0b 100%);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                  }

                  /* 头部 */
                  .mp-header {
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(10px);
                    padding: 20px 24px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                  }
                  .mp-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: #92400e;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                  }
                  .mp-conv-selector {
                    padding: 10px 16px;
                    background: white;
                    border: 2px solid #fbbf24;
                    border-radius: 8px;
                    color: #92400e;
                    font-size: 14px;
                    cursor: pointer;
                  }
                  .mp-close-btn {
                    width: 36px;
                    height: 36px;
                    background: white;
                    border: 2px solid #f59e0b;
                    border-radius: 8px;
                    color: #92400e;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }

                  /* 导航 */
                  .mp-nav {
                    display: flex;
                    gap: 12px;
                    padding: 16px 24px;
                    background: rgba(255, 255, 255, 0.8);
                  }
                  .mp-nav-btn {
                    padding: 12px 24px;
                    background: white;
                    border: 2px solid #fcd34d;
                    border-radius: 8px;
                    color: #92400e;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                  }
                  .mp-nav-btn:hover {
                    background: #fef3c7;
                    border-color: #f59e0b;
                    transform: translateY(-2px);
                  }
                  .mp-nav-btn.active {
                    background: #fbbf24;
                    color: white;
                    border-color: #f59e0b;
                  }

                  /* 内容区 */
                  .mp-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                  }

                  /* 宫殿房间网格 */
                  .mp-palace-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 20px;
                    padding: 20px;
                  }

                  /* 记忆房间 */
                  .mp-room {
                    background: white;
                    border: 3px solid;
                    border-radius: 12px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    position: relative;
                    overflow: hidden;
                  }
                  .mp-room::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: currentColor;
                  }
                  .mp-room:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                  }

                  .mp-room-icon {
                    font-size: 32px;
                    text-align: center;
                    margin-bottom: 12px;
                  }
                  .mp-room-text {
                    font-size: 14px;
                    color: #1f2937;
                    line-height: 1.5;
                    margin-bottom: 12px;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                  }
                  .mp-room-badges {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin-bottom: 12px;
                  }
                  .mp-room-badge {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                  }

                  /* 遗忘曲线进度 */
                  .mp-retention-circle {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 700;
                    margin: 12px auto 0;
                    border: 4px solid;
                  }

                  /* 统计卡片 */
                  .mp-stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                  }
                  .mp-stat-card {
                    background: white;
                    border: 3px solid #fbbf24;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                  }
                  .mp-stat-value {
                    font-size: 48px;
                    font-weight: 700;
                    color: #f59e0b;
                    margin-bottom: 8px;
                  }
                  .mp-stat-label {
                    font-size: 14px;
                    color: #92400e;
                  }

                  /* 遗忘曲线图表 */
                  .mp-curve-chart {
                    background: white;
                    border: 3px solid #fbbf24;
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 24px;
                  }
                  .mp-curve-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #92400e;
                    margin-bottom: 16px;
                  }
                  .mp-curve-canvas {
                    width: 100%;
                    height: 200px;
                    position: relative;
                  }
                  .mp-curve-line {
                    position: absolute;
                    left: 0;
                    width: 100%;
                    height: 100%;
                  }

                  /* 空状态 */
                  .mp-empty {
                    text-align: center;
                    padding: 60px 20px;
                    color: #92400e;
                  }
                  .mp-empty-icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                  }
                </style>

                <!-- 头部 -->
                <div class="mp-header">
                  <div class="mp-title">
                    <span>🏛️</span>
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

                <!-- 导航 -->
                <div class="mp-nav">
                  <button class="mp-nav-btn ${currentView === 'palace' ? 'active' : ''}" data-view="palace">
                    🏛️ 记忆宫殿
                  </button>
                  <button class="mp-nav-btn ${currentView === 'curve' ? 'active' : ''}" data-view="curve">
                    📈 遗忘曲线
                  </button>
                  <button class="mp-nav-btn ${currentView === 'stats' ? 'active' : ''}" data-view="stats">
                    📊 统计分析
                  </button>
                  <button class="mp-nav-btn ${currentView === 'review' ? 'active' : ''}" data-view="review">
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
                  <div style="font-size: 18px; font-weight: 600;">暂无记忆数据</div>
                  <div style="margin-top: 12px;">开始对话后，AI 会自动创建记忆</div>
                </div>
              `;
              return;
            }

            if (currentView === 'palace') renderPalace(contentEl);
            else if (currentView === 'curve') renderCurve(contentEl);
            else if (currentView === 'stats') renderStats(contentEl);
            else if (currentView === 'review') renderReview(contentEl);
          }

          // 渲染宫殿视图（房间布局）
          function renderPalace(contentEl) {
            contentEl.innerHTML = `
              <div class="mp-palace-grid">
                ${memories.map(mem => renderRoom(mem)).join('')}
              </div>
            `;

            // 绑定点击事件
            contentEl.querySelectorAll('.mp-room').forEach(el => {
              el.onclick = async () => {
                const memId = el.dataset.id;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  await saveMemoryMeta();
                  roche.ui.toast(`✅ 记忆已巩固！保持率提升`);
                  render();
                }
              };
            });
          }

          // 渲染单个记忆房间
          function renderRoom(mem) {
            const retention = calculateRetention(mem);
            const typeInfo = MEMORY_TYPES[mem.type] || MEMORY_TYPES.fact;
            const impInfo = IMPORTANCE_LEVELS[mem.importance] || IMPORTANCE_LEVELS[2];
            const retentionColor = retention > 0.7 ? '#10b981' : retention > 0.3 ? '#f59e0b' : '#ef4444';

            return `
              <div class="mp-room" data-id="${mem.id}" style="border-color: ${impInfo.color}; width: ${impInfo.size + 60}px;">
                <div class="mp-room-icon">${typeInfo.icon}</div>
                <div class="mp-room-text">${mem.summaryText || mem.text}</div>
                <div class="mp-room-badges">
                  <span class="mp-room-badge" style="background: ${typeInfo.color}33; color: ${typeInfo.color};">
                    ${typeInfo.name}
                  </span>
                  <span class="mp-room-badge" style="background: ${impInfo.color}33; color: ${impInfo.color};">
                    ${impInfo.name}
                  </span>
                </div>
                <div class="mp-retention-circle" style="border-color: ${retentionColor}; color: ${retentionColor};">
                  ${(retention * 100).toFixed(0)}%
                </div>
                <div style="text-align: center; font-size: 11px; color: #6b7280; margin-top: 8px;">
                  复习 ${mem.reviewCount || 0} 次
                </div>
              </div>
            `;
          }

          // 渲染遗忘曲线
          function renderCurve(contentEl) {
            const selectedMem = memories[0] || null;
            if (!selectedMem) return;

            // 生成曲线数据点
            const days = [];
            const retentions = [];
            for (let d = 0; d <= 30; d++) {
              days.push(d);
              retentions.push(predictRetention(selectedMem, d) * 100);
            }

            // 绘制SVG曲线
            const points = days.map((d, i) => {
              const x = (d / 30) * 100;
              const y = 100 - retentions[i];
              return `${x},${y}`;
            }).join(' ');

            contentEl.innerHTML = `
              <div class="mp-curve-chart">
                <div class="mp-curve-title">📈 艾宾浩斯遗忘曲线预测</div>
                <p style="color: #6b7280; margin-bottom: 20px;">
                  展示记忆随时间的自然衰减过程（基于重要性、情绪和复习次数）
                </p>
                <svg viewBox="0 0 100 100" style="width: 100%; height: 300px;">
                  <!-- 网格线 -->
                  <line x1="0" y1="20" x2="100" y2="20" stroke="#e5e7eb" stroke-width="0.2"/>
                  <line x1="0" y1="40" x2="100" y2="40" stroke="#e5e7eb" stroke-width="0.2"/>
                  <line x1="0" y1="60" x2="100" y2="60" stroke="#e5e7eb" stroke-width="0.2"/>
                  <line x1="0" y1="80" x2="100" y2="80" stroke="#e5e7eb" stroke-width="0.2"/>

                  <!-- 坐标轴 -->
                  <line x1="0" y1="100" x2="100" y2="100" stroke="#92400e" stroke-width="0.5"/>
                  <line x1="0" y1="0" x2="0" y2="100" stroke="#92400e" stroke-width="0.5"/>

                  <!-- 曲线 -->
                  <polyline points="${points}" fill="none" stroke="#f59e0b" stroke-width="1" />

                  <!-- 标注点 -->
                  ${days.filter((d, i) => i % 5 === 0).map((d, idx) => {
                    const x = (d / 30) * 100;
                    const y = 100 - retentions[days.indexOf(d)];
                    return `<circle cx="${x}" cy="${y}" r="1" fill="#f59e0b"/>`;
                  }).join('')}
                </svg>
                <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 12px; color: #6b7280;">
                  <span>今天</span>
                  <span>7天</span>
                  <span>14天</span>
                  <span>21天</span>
                  <span>30天</span>
                </div>
              </div>

              <div class="mp-stat-grid">
                ${memories.slice(0, 6).map(mem => {
                  const retention = calculateRetention(mem);
                  const nextReview = getNextReviewTime(mem);
                  const daysUntil = Math.ceil((nextReview - Date.now()) / (1000 * 60 * 60 * 24));

                  return `
                    <div class="mp-stat-card">
                      <div style="font-size: 24px; margin-bottom: 8px;">${MEMORY_TYPES[mem.type].icon}</div>
                      <div style="font-size: 14px; color: #1f2937; margin-bottom: 8px; height: 40px; overflow: hidden;">
                        ${mem.summaryText.substring(0, 30)}...
                      </div>
                      <div class="mp-stat-value" style="font-size: 32px;">${(retention * 100).toFixed(0)}%</div>
                      <div class="mp-stat-label">${daysUntil > 0 ? `${daysUntil}天后复习` : '需要复习'}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }

          // 渲染统计分析
          function renderStats(contentEl) {
            const totalMemories = memories.length;
            const avgRetention = memories.reduce((sum, m) => sum + calculateRetention(m), 0) / totalMemories;
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).length;
            const strongMemories = memories.filter(m => calculateRetention(m) > 0.7).length;

            const byType = {};
            const byImportance = {};
            memories.forEach(m => {
              byType[m.type] = (byType[m.type] || 0) + 1;
              byImportance[m.importance] = (byImportance[m.importance] || 0) + 1;
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
                  <div class="mp-stat-value">${strongMemories}</div>
                  <div class="mp-stat-label">强记忆</div>
                </div>
                <div class="mp-stat-card">
                  <div class="mp-stat-value">${needReview}</div>
                  <div class="mp-stat-label">需要复习</div>
                </div>
              </div>

              <div class="mp-curve-chart">
                <div class="mp-curve-title">📊 记忆类型分布</div>
                ${Object.keys(byType).map(type => {
                  const typeInfo = MEMORY_TYPES[type];
                  const count = byType[type];
                  const percent = (count / totalMemories * 100).toFixed(1);
                  return `
                    <div style="margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-weight: 600;">${typeInfo.icon} ${typeInfo.name}</span>
                        <span>${count} (${percent}%)</span>
                      </div>
                      <div style="height: 12px; background: #f3f4f6; border-radius: 6px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: ${typeInfo.color}; transition: width 0.5s;"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="mp-curve-chart">
                <div class="mp-curve-title">⭐ 重要性分布</div>
                ${[5, 4, 3, 2, 1].map(imp => {
                  const impInfo = IMPORTANCE_LEVELS[imp];
                  const count = byImportance[imp] || 0;
                  const percent = count > 0 ? (count / totalMemories * 100).toFixed(1) : 0;
                  return `
                    <div style="margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-weight: 600;">${impInfo.name}</span>
                        <span>${count} (${percent}%)</span>
                      </div>
                      <div style="height: 12px; background: #f3f4f6; border-radius: 6px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: ${impInfo.color}; transition: width 0.5s;"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }

          // 渲染复习计划
          function renderReview(contentEl) {
            const needReview = memories
              .filter(m => calculateRetention(m) < 0.3)
              .sort((a, b) => calculateRetention(a) - calculateRetention(b));

            contentEl.innerHTML = `
              <div class="mp-curve-chart">
                <div class="mp-curve-title">🔄 需要复习的记忆 (${needReview.length})</div>
                <p style="color: #6b7280; margin-bottom: 20px;">
                  以下记忆保持率低于30%，建议立即复习以巩固记忆
                </p>
              </div>

              ${needReview.length === 0 ? `
                <div class="mp-empty">
                  <div class="mp-empty-icon">✨</div>
                  <div style="font-size: 18px; font-weight: 600;">所有记忆都很牢固！</div>
                  <div style="margin-top: 12px;">继续保持良好的复习习惯</div>
                </div>
              ` : `
                <div class="mp-palace-grid">
                  ${needReview.map(mem => renderRoom(mem)).join('')}
                </div>
              `}
            `;

            // 绑定点击事件
            contentEl.querySelectorAll('.mp-room').forEach(el => {
              el.onclick = async () => {
                const memId = el.dataset.id;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  await saveMemoryMeta();
                  roche.ui.toast(`✅ 记忆已巩固！保持率提升`);
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
