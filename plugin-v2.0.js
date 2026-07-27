// Roche 记忆宫殿插件 v2.0.0
// 3D 可视化记忆管理系统

(function() {
  'use strict';

  // ============ 核心算法：艾宾浩斯遗忘曲线 ============

  const IMPORTANCE_LEVELS = {
    1: { name: '琐事', color: '#64748b', baseStrength: 1, floor: 0, reinforceFactor: 1.2, glow: '#94a3b8' },
    2: { name: '一般', color: '#3b82f6', baseStrength: 3, floor: 0.1, reinforceFactor: 1.5, glow: '#60a5fa' },
    3: { name: '重要', color: '#f59e0b', baseStrength: 7, floor: 0.3, reinforceFactor: 2.0, glow: '#fbbf24' },
    4: { name: '关键', color: '#ef4444', baseStrength: 15, floor: 0.5, reinforceFactor: 2.5, glow: '#f87171' },
    5: { name: '刻骨铭心', color: '#a855f7', baseStrength: 30, floor: 0.7, reinforceFactor: 3.0, glow: '#c084fc' }
  };

  const EMOTION_LEVELS = {
    0: { name: '中性', color: '#6b7280', strengthBonus: 0 },
    1: { name: '平静', color: '#3b82f6', strengthBonus: 0.5 },
    2: { name: '愉悦', color: '#10b981', strengthBonus: 1 },
    3: { name: '激动', color: '#f59e0b', strengthBonus: 2 },
    4: { name: '强烈', color: '#ef4444', strengthBonus: 4 },
    5: { name: '极致', color: '#dc2626', strengthBonus: 8 }
  };

  const MEMORY_TYPES = {
    fact: { name: '事实', icon: '📌', color: '#3b82f6', glow: '#60a5fa' },
    experience: { name: '经历', icon: '🎬', color: '#10b981', glow: '#34d399' },
    skill: { name: '技能', icon: '⚡', color: '#f59e0b', glow: '#fbbf24' },
    relationship: { name: '关系', icon: '💫', color: '#ec4899', glow: '#f472b6' },
    knowledge: { name: '知识', icon: '📚', color: '#8b5cf6', glow: '#a78bfa' },
    emotion: { name: '情感', icon: '❤️', color: '#ef4444', glow: '#f87171' }
  };

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
    return 'fact';
  }

  function guessImportance(text) {
    const trivialKeywords = ['可能', '也许', '好像'];
    const importantKeywords = ['一定', '必须', '重要', '关键'];
    const criticalKeywords = ['永远', '刻骨铭心', '难忘', '生死'];
    if (criticalKeywords.some(kw => text.includes(kw))) return 5;
    if (importantKeywords.some(kw => text.includes(kw))) return 4;
    if (trivialKeywords.some(kw => text.includes(kw))) return 1;
    return 2;
  }

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

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '2.0.0',
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
            const longTerm = await roche.memory.getLongTerm({ conversationId: selectedConvId, limit: 500 });
            const rawMemories = [...(longTerm.facts || []), ...(longTerm.vectors || [])];
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

function render() {
            container.innerHTML = `
              <div class="memory-palace-app">
                <style>
                  /* 全局样式 */
                  .memory-palace-app {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: #0a0e27;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    position: relative;
                    overflow: hidden;
                  }

                  /* 星空背景 */
                  .mp-stars {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                  }
                  .mp-star {
                    position: absolute;
                    width: 2px;
                    height: 2px;
                    background: white;
                    border-radius: 50%;
                    animation: twinkle 3s infinite;
                  }
                  @keyframes twinkle {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                  }

                  /* 玻璃态头部 */
                  .mp-header {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 20px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    z-index: 10;
                  }
                  .mp-title {
                    font-size: 28px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                  }
                  .mp-title-icon {
                    font-size: 32px;
                    filter: drop-shadow(0 0 10px rgba(102, 126, 234, 0.5));
                  }

                  /* 会话选择器 */
                  .mp-conv-selector {
                    padding: 10px 16px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    color: white;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s;
                  }
                  .mp-conv-selector:hover {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: rgba(102, 126, 234, 0.5);
                  }

                  /* 导航栏 */
                  .mp-nav {
                    display: flex;
                    gap: 12px;
                    padding: 16px 24px;
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    z-index: 9;
                  }
                  .mp-nav-btn {
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.7);
                    cursor: pointer;
                    transition: all 0.3s;
                    font-size: 14px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }
                  .mp-nav-btn:hover {
                    background: rgba(102, 126, 234, 0.2);
                    border-color: rgba(102, 126, 234, 0.5);
                    color: white;
                    transform: translateY(-2px);
                  }
                  .mp-nav-btn.active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-color: transparent;
                    color: white;
                    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                  }

                  /* 内容区 */
                  .mp-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    position: relative;
                  }

                  /* 3D 宫殿视图 */
                  .mp-palace-view {
                    perspective: 1000px;
                    position: relative;
                    min-height: 600px;
                  }
                  .mp-palace-scene {
                    position: relative;
                    transform-style: preserve-3d;
                    animation: float 6s ease-in-out infinite;
                  }
                  @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                  }

                  /* 记忆节点（粒子效果）*/
                  .mp-memory-orb {
                    position: absolute;
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent);
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    animation: pulse 2s ease-in-out infinite;
                  }
                  .mp-memory-orb:hover {
                    transform: scale(1.2);
                    z-index: 100;
                  }
                  @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 20px currentColor; }
                    50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; }
                  }

                  /* 玻璃态卡片 */
                  .mp-glass-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 20px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s;
                  }
                  .mp-glass-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
                    border-color: rgba(102, 126, 234, 0.3);
                  }

                  /* 统计卡片网格 */
                  .mp-stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 24px;
                  }
                  .mp-stat-card {
                    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 16px;
                    padding: 24px;
                    text-align: center;
                    transition: all 0.3s;
                  }
                  .mp-stat-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.3);
                  }
                  .mp-stat-value {
                    font-size: 48px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea 0%, #f093fb 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 8px;
                  }
                  .mp-stat-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                  }

                  /* 记忆列表项 */
                  .mp-memory-item {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border-left: 4px solid;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 16px;
                    cursor: pointer;
                    transition: all 0.3s;
                    position: relative;
                    overflow: hidden;
                  }
                  .mp-memory-item::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
                    transform: translateX(-100%);
                    transition: transform 0.6s;
                  }
                  .mp-memory-item:hover::before {
                    transform: translateX(100%);
                  }
                  .mp-memory-item:hover {
                    transform: translateX(8px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    background: rgba(255, 255, 255, 0.08);
                  }

                  .mp-memory-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                  }
                  .mp-memory-icon {
                    font-size: 24px;
                    filter: drop-shadow(0 0 8px currentColor);
                  }
                  .mp-memory-badge {
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 500;
                    backdrop-filter: blur(10px);
                  }
                  .mp-memory-text {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 15px;
                    line-height: 1.6;
                    margin-bottom: 12px;
                  }
                  .mp-memory-meta {
                    display: flex;
                    gap: 16px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    flex-wrap: wrap;
                  }

                  /* 保持率进度条 */
                  .mp-retention-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-top: 12px;
                  }
                  .mp-retention-fill {
                    height: 100%;
                    transition: width 0.6s ease-out;
                    background: linear-gradient(90deg, currentColor, transparent);
                  }

                  /* 空状态 */
                  .mp-empty {
                    text-align: center;
                    padding: 80px 20px;
                    color: rgba(255, 255, 255, 0.5);
                  }
                  .mp-empty-icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                    filter: drop-shadow(0 0 20px rgba(102, 126, 234, 0.3));
                  }

                  /* 按钮 */
                  .mp-btn {
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.3s;
                  }
                  .mp-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
                  }

                  /* 关闭按钮 */
                  .mp-close-btn {
                    width: 36px;
                    height: 36px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .mp-close-btn:hover {
                    background: rgba(239, 68, 68, 0.3);
                    border-color: #ef4444;
                  }
                </style>

                <!-- 星空背景 -->
                <div class="mp-stars" id="stars"></div>

                <!-- 头部 -->
                <div class="mp-header">
                  <div class="mp-title">
                    <span class="mp-title-icon">🧠</span>
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
                    🏛️ 宫殿
                  </button>
                  <button class="mp-nav-btn ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                    📊 仪表盘
                  </button>
                  <button class="mp-nav-btn ${currentView === 'timeline' ? 'active' : ''}" data-view="timeline">
                    📅 时间轴
                  </button>
                  <button class="mp-nav-btn ${currentView === 'review' ? 'active' : ''}" data-view="review">
                    🔄 复习
                  </button>
                </div>

                <!-- 内容区 -->
                <div class="mp-content" id="mpContent"></div>
              </div>
            `;

            // 生成星空
            const starsEl = container.querySelector('#stars');
            for (let i = 0; i < 100; i++) {
              const star = document.createElement('div');
              star.className = 'mp-star';
              star.style.left = Math.random() * 100 + '%';
              star.style.top = Math.random() * 100 + '%';
              star.style.animationDelay = Math.random() * 3 + 's';
              starsEl.appendChild(star);
            }

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
                  <div style="font-size: 18px;">暂无记忆数据</div>
                  <div style="margin-top: 12px; font-size: 14px;">开始对话后，AI 会自动创建记忆</div>
                </div>
              `;
              return;
            }

            if (currentView === 'palace') renderPalace(contentEl);
            else if (currentView === 'dashboard') renderDashboard(contentEl);
            else if (currentView === 'timeline') renderTimeline(contentEl);
            else if (currentView === 'review') renderReview(contentEl);
          }

          function renderPalace(contentEl) {
            contentEl.innerHTML = `
              <div class="mp-palace-view">
                <div class="mp-palace-scene" id="palaceScene">
                  <div style="color: rgba(255,255,255,0.7); text-align: center; padding: 60px 20px;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🏛️</div>
                    <div style="font-size: 24px; margin-bottom: 12px;">3D 记忆宫殿</div>
                    <div style="font-size: 14px; opacity: 0.7;">即将上线：沉浸式 3D 可视化体验</div>
                    <div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">记忆将以粒子形式漂浮在虚拟空间中</div>
                  </div>
                </div>
              </div>
            `;
          }

          function renderDashboard(contentEl) {
            const totalMemories = memories.length;
            const avgRetention = memories.reduce((sum, m) => sum + calculateRetention(m), 0) / totalMemories;
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).length;
            const byType = {};
            memories.forEach(m => { byType[m.type] = (byType[m.type] || 0) + 1; });

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

              <div class="mp-glass-card">
                <h3 style="color: white; margin: 0 0 20px 0;">📈 记忆分布</h3>
                ${Object.keys(byType).map(type => {
                  const typeInfo = MEMORY_TYPES[type] || MEMORY_TYPES.fact;
                  const count = byType[type];
                  const percent = (count / totalMemories * 100).toFixed(1);
                  return `
                    <div style="margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: rgba(255,255,255,0.9);">
                        <span>${typeInfo.icon} ${typeInfo.name}</span>
                        <span>${count} (${percent}%)</span>
                      </div>
                      <div style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, ${typeInfo.color}, ${typeInfo.glow}); box-shadow: 0 0 10px ${typeInfo.glow};"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="mp-glass-card">
                <h3 style="color: white; margin: 0 0 20px 0;">🔥 最近记忆</h3>
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
                  <span class="mp-memory-icon" style="color: ${typeInfo.color};">${typeInfo.icon}</span>
                  <span class="mp-memory-badge" style="background: ${typeInfo.color}33; color: ${typeInfo.color}; border: 1px solid ${typeInfo.color}66;">
                    ${typeInfo.name}
                  </span>
                  <span class="mp-memory-badge" style="background: ${impInfo.color}33; color: ${impInfo.color}; border: 1px solid ${impInfo.color}66;">
                    ${impInfo.name}
                  </span>
                </div>
                <div class="mp-memory-text">${mem.summaryText || mem.text}</div>
                <div class="mp-memory-meta">
                  <span>📅 ${new Date(mem.timestamp).toLocaleDateString()}</span>
                  <span>🔄 复习 ${mem.reviewCount || 0} 次</span>
                  <span>💪 保持率 ${(retention * 100).toFixed(0)}%</span>
                </div>
                <div class="mp-retention-bar">
                  <div class="mp-retention-fill" style="width: ${retention * 100}%; color: ${retentionColor};"></div>
                </div>
              </div>
            `;
          }

          function renderTimeline(contentEl) {
            const sortedMemories = [...memories].sort((a, b) => b.timestamp - a.timestamp);
            contentEl.innerHTML = `
              <div class="mp-glass-card">
                <h2 style="color: white; margin: 0 0 24px 0;">📅 记忆时间轴</h2>
                ${sortedMemories.map(mem => renderMemoryItem(mem)).join('')}
              </div>
            `;
            bindMemoryClicks(contentEl);
          }

          function renderReview(contentEl) {
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).sort((a, b) => calculateRetention(a) - calculateRetention(b));
            contentEl.innerHTML = `
              <div class="mp-glass-card">
                <h2 style="color: white; margin: 0 0 12px 0;">🔄 需要复习的记忆</h2>
                <p style="color: rgba(255,255,255,0.6); margin-bottom: 24px;">
                  找到 ${needReview.length} 条记忆需要复习（保持率 < 30%）
                </p>
                ${needReview.length === 0 ?
                  '<div class="mp-empty"><div class="mp-empty-icon">✨</div><div>所有记忆都很牢固！</div></div>' :
                  needReview.map(mem => renderMemoryItem(mem)).join('')
                }
              </div>
            `;
            bindMemoryClicks(contentEl, true);
          }

          function bindMemoryClicks(parentEl, isReview = false) {
            parentEl.querySelectorAll('.mp-memory-item').forEach(el => {
              el.onclick = async () => {
                const memId = el.dataset.id;
                const mem = memories.find(m => m.id === memId);
                if (mem && isReview) {
                  reinforceMemory(mem);
                  await saveMemoryMeta();
                  roche.ui.toast('✅ 记忆已巩固');
                  render();
                } else if (mem) {
                  roche.ui.toast(`💡 ${mem.summaryText || mem.text}`);
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
