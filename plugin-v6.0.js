// Roche 记忆宫殿插件 v6.0.0
// 完整的七房间记忆系统 + 混合搜索 + 情绪启动 + 扩散激活

(function() {
  'use strict';

  // ============ 七房间配置 ============

  const SEVEN_ROOMS = {
    livingRoom: {
      id: 'livingRoom',
      name: '客厅',
      icon: '🛋️',
      desc: '日常闲聊、近期互动',
      color: '#E8B4B8', // 莫兰迪粉
      capacity: 200,
      decayRate: 0.8, // 衰减最快
      brainArea: '海马体'
    },
    bedroom: {
      id: 'bedroom',
      name: '卧室',
      icon: '🛏️',
      desc: '亲密情感、深层羁绊',
      color: '#B8A1C9', // 莫兰迪紫
      capacity: Infinity,
      decayRate: 0.1, // 衰减很慢
      brainArea: '新皮层'
    },
    study: {
      id: 'study',
      name: '书房',
      icon: '📚',
      desc: '工作学习、技能成长',
      color: '#9FB8AD', // 莫兰迪绿
      capacity: Infinity,
      decayRate: 0.3,
      brainArea: '前额叶'
    },
    userRoom: {
      id: 'userRoom',
      name: 'User的房间',
      icon: '👤',
      desc: '用户个人信息、习惯',
      color: '#C9B8A1', // 莫兰迪棕
      capacity: Infinity,
      decayRate: 0.2,
      brainArea: '颞顶联合区'
    },
    selfRoom: {
      id: 'selfRoom',
      name: '自我房间',
      icon: '🪞',
      desc: '角色自我认同、演变',
      color: '#A8B8C9', // 莫兰迪蓝
      capacity: Infinity,
      decayRate: 0, // 永不衰减
      brainArea: '默认模式网络'
    },
    attic: {
      id: 'attic',
      name: '阁楼',
      icon: '🏚️',
      desc: '未消化的困惑、潜意识',
      color: '#B8B5AD', // 莫兰迪灰
      capacity: Infinity,
      decayRate: 0, // 永不衰减
      brainArea: '杏仁核-海马'
    },
    windowSill: {
      id: 'windowSill',
      name: '窗台',
      icon: '🪟',
      desc: '期盼、目标、憧憬',
      color: '#E8D4B8', // 莫兰迪黄
      capacity: Infinity,
      decayRate: 0.5,
      brainArea: '多巴胺奖赏系统'
    }
  };

  const EMOTION_TYPES = {
    joy: { name: '快乐', icon: '😊', value: 1 },
    sadness: { name: '悲伤', icon: '😢', value: 2 },
    anger: { name: '愤怒', icon: '😠', value: 3 },
    fear: { name: '恐惧', icon: '😰', value: 4 },
    hurt: { name: '委屈', icon: '🥺', value: 5 },
    anxiety: { name: '焦虑', icon: '😟', value: 6 },
    warmth: { name: '温暖', icon: '🥰', value: 7 },
    neutral: { name: '平静', icon: '😐', value: 0 }
  };

  const PERSONALITY_TYPES = {
    emotional: {
      name: '情感型',
      desc: '先想到感觉，再顺着感觉想到人',
      weights: { emotion: 1.0, person: 0.6, time: 0.3, cause: 0.4 },
      ruminationTendency: 0.3
    },
    narrative: {
      name: '叙事型',
      desc: '先想到时间线，再按人物线索展开',
      weights: { time: 1.0, person: 0.8, emotion: 0.5, cause: 0.6 },
      ruminationTendency: 0.15
    },
    imagery: {
      name: '意象型',
      desc: '先想到画面，再由画面触发联想',
      weights: { metaphor: 1.0, emotion: 0.5, person: 0.4, time: 0.3 },
      ruminationTendency: 0.2
    },
    analytical: {
      name: '分析型',
      desc: '先想到原因，再推导出结果',
      weights: { cause: 1.0, time: 0.4, person: 0.5, emotion: 0.3 },
      ruminationTendency: 0.1
    }
  };

  // ============ 记忆强度计算（艾宾浩斯） ============

  function calculateRetention(memory) {
    const now = Date.now();
    const daysPassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24);
    const room = SEVEN_ROOMS[memory.room] || SEVEN_ROOMS.livingRoom;

    // 基础强度
    const baseStrength = 7;
    const importanceBonus = memory.importance * 2;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;
    const S = baseStrength + importanceBonus + reviewBonus;

    // 考虑房间衰减率
    const effectiveDecay = 1 + (room.decayRate * 2);
    const retention = Math.exp(-daysPassed / (S / effectiveDecay));

    return Math.max(retention, room.decayRate === 0 ? 0.7 : 0);
  }

  function reinforceMemory(memory) {
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    return memory;
  }

  // ============ 智能分类（分配到房间） ============

  function classifyMemory(text) {
    // 简化版分类逻辑
    if (/喜欢|爱|想念|温暖|抱|亲/.test(text)) return 'bedroom';
    if (/学习|工作|技能|教|懂|理解/.test(text)) return 'study';
    if (/习惯|总是|经常|喜欢吃|讨厌/.test(text)) return 'userRoom';
    if (/我是|我觉得自己|我想成为/.test(text)) return 'selfRoom';
    if (/不确定|困惑|不知道|纠结|心结/.test(text)) return 'attic';
    if (/想要|希望|期待|以后|未来/.test(text)) return 'windowSill';
    return 'livingRoom';
  }

  function detectEmotion(text) {
    if (/委屈|不公平|凭什么/.test(text)) return 'hurt';
    if (/开心|高兴|哈哈|棒/.test(text)) return 'joy';
    if (/难过|伤心|哭/.test(text)) return 'sadness';
    if (/生气|愤怒|烦/.test(text)) return 'anger';
    if (/害怕|担心|恐惧/.test(text)) return 'fear';
    if (/焦虑|紧张|不安/.test(text)) return 'anxiety';
    if (/温暖|感动|幸福/.test(text)) return 'warmth';
    return 'neutral';
  }

  function detectImportance(text) {
    if (/永远|刻骨铭心|难忘|一辈子/.test(text)) return 10;
    if (/重要|关键|必须|一定/.test(text)) return 8;
    if (/想|希望|可能/.test(text)) return 5;
    if (/随便|无所谓|算了/.test(text)) return 2;
    return 5;
  }

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '6.0.0',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          let currentView = 'conversationSelect'; // conversationSelect | memoryPalace | forgettingCurve
          let conversations = [];
          let selectedConvId = null;
          let memories = [];
          let characterPersonality = 'emotional'; // 默认情感型
          let currentEmotion = 'neutral'; // 当前情绪

          async function loadConversations() {
            conversations = await roche.conversation.list();
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
                importance: meta.importance || detectImportance(text),
                emotion: meta.emotion || detectEmotion(text),
                room: meta.room || classifyMemory(text),
                relations: meta.relations || [] // 关联记忆
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
                room: mem.room,
                relations: mem.relations
              };
            });
            await roche.storage.set(`memoryMeta:${selectedConvId}`, meta);
          }

          function getMemoriesByRoom(roomId) {
            return memories.filter(m => m.room === roomId);
          }

          function getRoomStats(roomId) {
            const roomMemories = getMemoriesByRoom(roomId);
            const room = SEVEN_ROOMS[roomId];
            const count = roomMemories.length;
            const capacity = room.capacity === Infinity ? '∞' : room.capacity;
            return {
              count,
              capacity,
              display: capacity === '∞' ? `${count}条` : `${count}/${capacity}条`
            };
          }

// ============ 渲染系统 ============

          function render() {
            if (currentView === 'conversationSelect') {
              renderConversationSelect();
            } else if (currentView === 'memoryPalace') {
              renderMemoryPalace();
            } else if (currentView === 'forgettingCurve') {
              renderForgettingCurve();
            }
          }

          // 渲染会话选择页面（参考 2.png）
          function renderConversationSelect() {
            container.innerHTML = `
              <div class="mp-app">
                <style>
                  /* 全局样式 - 莫兰迪色系 */
                  .mp-app {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(180deg, #F5F0EB 0%, #E8DDD0 100%);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
                    display: flex;
                    flex-direction: column;
                  }

                  /* 顶部导航 */
                  .mp-header {
                    padding: 20px 24px;
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(184, 165, 161, 0.2);
                  }
                  .mp-header-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                  }
                  .mp-back {
                    font-size: 24px;
                    color: #8B7E77;
                    cursor: pointer;
                    transition: color 0.2s;
                  }
                  .mp-back:hover {
                    color: #B8A1C9;
                  }
                  .mp-logo {
                    font-size: 20px;
                    color: #8B7E77;
                  }
                  .mp-title {
                    text-align: center;
                    margin-top: 12px;
                  }
                  .mp-title-main {
                    font-size: 24px;
                    font-weight: 700;
                    color: #8B7E77;
                    margin-bottom: 8px;
                    letter-spacing: 2px;
                  }
                  .mp-title-sub {
                    font-size: 13px;
                    color: #A89A94;
                  }

                  /* 会话卡片列表 */
                  .mp-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 16px;
                  }
                  .mp-conv-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 16px;
                    box-shadow: 0 2px 12px rgba(139, 126, 119, 0.1);
                    cursor: pointer;
                    transition: all 0.3s;
                    border: 2px solid transparent;
                  }
                  .mp-conv-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 6px 24px rgba(139, 126, 119, 0.15);
                    border-color: #B8A1C9;
                  }
                  .mp-conv-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                  }
                  .mp-conv-name {
                    font-size: 18px;
                    font-weight: 600;
                    color: #8B7E77;
                  }
                  .mp-conv-status {
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 500;
                  }
                  .mp-conv-status.ready {
                    background: #E8F5E9;
                    color: #4CAF50;
                  }
                  .mp-conv-status.disabled {
                    background: #F5F5F5;
                    color: #9E9E9E;
                  }
                  .mp-conv-desc {
                    font-size: 13px;
                    color: #A89A94;
                    margin-bottom: 8px;
                  }
                  .mp-conv-features {
                    font-size: 12px;
                    color: #B8A1C9;
                  }

                  /* 空状态 */
                  .mp-empty {
                    text-align: center;
                    padding: 80px 20px;
                    color: #A89A94;
                  }
                  .mp-empty-icon {
                    font-size: 64px;
                    margin-bottom: 16px;
                    opacity: 0.6;
                  }

                  /* 滚动条 */
                  .mp-content::-webkit-scrollbar {
                    width: 6px;
                  }
                  .mp-content::-webkit-scrollbar-track {
                    background: rgba(184, 165, 161, 0.1);
                  }
                  .mp-content::-webkit-scrollbar-thumb {
                    background: rgba(184, 161, 193, 0.3);
                    border-radius: 3px;
                  }
                </style>

                <!-- 头部 -->
                <div class="mp-header">
                  <div class="mp-header-top">
                    <div class="mp-back" id="backBtn">← 退出</div>
                    <div class="mp-logo">❋</div>
                  </div>
                  <div class="mp-title">
                    <div class="mp-title-main">MEMORY PALACE</div>
                    <div class="mp-title-main" style="font-size: 20px;">记忆宫殿</div>
                    <div class="mp-title-sub">选择一个角色·开启Ta的七房间思维空间</div>
                  </div>
                </div>

                <!-- 会话列表 -->
                <div class="mp-content">
                  ${conversations.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">💭</div>
                      <div>暂无会话</div>
                    </div>
                  ` : conversations.map(conv => `
                    <div class="mp-conv-card" data-id="${conv.id}">
                      <div class="mp-conv-header">
                        <div class="mp-conv-name">${conv.name || conv.title || conv.handle || '未命名会话'}</div>
                        <div class="mp-conv-status ready">已就绪</div>
                      </div>
                      <div class="mp-conv-desc">记忆宫殿</div>
                      <div class="mp-conv-features">七房间空间模型·向量检索</div>
                      <div class="mp-conv-desc" style="margin-top: 8px;">全自动记忆</div>
                      <div class="mp-conv-features">自动归档·推水位线·隐藏已总结</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;

            // 绑定事件
            container.querySelector('#backBtn').onclick = () => roche.ui.closeApp();
            container.querySelectorAll('.mp-conv-card').forEach(card => {
              card.onclick = async () => {
                selectedConvId = card.dataset.id;
                await loadMemories();
                currentView = 'memoryPalace';
                render();
              };
            });
          }

          // 渲染记忆宫殿主页（参考 1.png）
          function renderMemoryPalace() {
            const selectedConv = conversations.find(c => c.id === selectedConvId);
            const convName = selectedConv ? (selectedConv.name || selectedConv.title || selectedConv.handle) : '未命名';

            const totalMemories = memories.length;
            const eventBoxCount = 0; // 暂时未实现
            const wishCount = getMemoriesByRoom('windowSill').length;

            container.innerHTML = `
              <div class="mp-palace">
                <style>
                  .mp-palace {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(180deg, #F5F0EB 0%, #E8DDD0 100%);
                    display: flex;
                    flex-direction: column;
                  }

                  /* 顶部导航 */
                  .palace-header {
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(184, 165, 161, 0.2);
                  }
                  .palace-nav {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                  }
                  .palace-back {
                    font-size: 20px;
                    color: #8B7E77;
                    cursor: pointer;
                  }
                  .palace-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #8B7E77;
                  }
                  .palace-menu {
                    font-size: 20px;
                    color: #8B7E77;
                    cursor: pointer;
                  }
                  .palace-stats {
                    font-size: 12px;
                    color: #A89A94;
                    text-align: center;
                  }

                  /* 功能按钮 */
                  .palace-actions {
                    padding: 16px 20px;
                    background: white;
                    display: flex;
                    gap: 12px;
                    overflow-x: auto;
                  }
                  .palace-action-btn {
                    padding: 10px 16px;
                    background: rgba(184, 161, 193, 0.1);
                    border: 1px solid rgba(184, 161, 193, 0.3);
                    border-radius: 20px;
                    font-size: 13px;
                    color: #8B7E77;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: all 0.2s;
                  }
                  .palace-action-btn:hover {
                    background: rgba(184, 161, 193, 0.2);
                    border-color: #B8A1C9;
                  }

                  /* 内容区 */
                  .palace-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 16px;
                  }

                  /* 房间卡片 */
                  .room-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
                  }
                  .room-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                  }
                  .room-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                  }
                  .room-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                  }
                  .room-text {
                    flex: 1;
                  }
                  .room-name {
                    font-size: 16px;
                    font-weight: 600;
                    color: #8B7E77;
                    margin-bottom: 4px;
                  }
                  .room-desc {
                    font-size: 12px;
                    color: #A89A94;
                  }
                  .room-count {
                    font-size: 14px;
                    color: #A89A94;
                  }

                  /* 记忆列表 */
                  .memory-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                  }
                  .memory-item {
                    padding: 12px;
                    background: rgba(245, 240, 235, 0.5);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                  }
                  .memory-item:hover {
                    background: rgba(184, 161, 193, 0.1);
                  }
                  .memory-time {
                    font-size: 11px;
                    color: #B8A1C9;
                    margin-bottom: 6px;
                  }
                  .memory-text {
                    font-size: 14px;
                    color: #8B7E77;
                    line-height: 1.5;
                    margin-bottom: 8px;
                  }
                  .memory-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                  }
                  .memory-tags {
                    display: flex;
                    gap: 6px;
                  }
                  .memory-tag {
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                  }
                  .memory-retention {
                    font-size: 11px;
                    font-weight: 600;
                    color: #B8A1C9;
                  }
                </style>

                <!-- 头部 -->
                <div class="palace-header">
                  <div class="palace-nav">
                    <div class="palace-back" id="palaceBack">← 返回</div>
                    <div class="palace-title">${convName}的记忆宫殿</div>
                    <div class="palace-menu">⋮</div>
                  </div>
                  <div class="palace-stats">${totalMemories}条记忆·${eventBoxCount}个事件盒·${wishCount}个期盼</div>
                </div>

                <!-- 功能按钮 -->
                <div class="palace-actions">
                  <div class="palace-action-btn" id="viewAllBtn">查看全部记忆</div>
                  <div class="palace-action-btn" id="viewEventsBtn">查看事件盒</div>
                  <div class="palace-action-btn" id="searchBtn">搜索记忆（关键词、标签、情绪...）</div>
                </div>

                <!-- 七个房间 -->
                <div class="palace-content">
                  ${Object.values(SEVEN_ROOMS).map(room => {
                    const roomMemories = getMemoriesByRoom(room.id);
                    const stats = getRoomStats(room.id);

                    return `
                      <div class="room-card">
                        <div class="room-header">
                          <div class="room-info">
                            <div class="room-icon" style="background: ${room.color};">
                              ${room.icon}
                            </div>
                            <div class="room-text">
                              <div class="room-name">${room.name}</div>
                              <div class="room-desc">${room.desc}</div>
                            </div>
                          </div>
                          <div class="room-count">${stats.display}</div>
                        </div>

                        ${roomMemories.length > 0 ? `
                          <div class="memory-list">
                            ${roomMemories.slice(0, 3).map(mem => {
                              const retention = calculateRetention(mem);
                              const emotionInfo = EMOTION_TYPES[mem.emotion] || EMOTION_TYPES.neutral;
                              const timeAgo = getTimeAgo(mem.timestamp);

                              return `
                                <div class="memory-item" data-id="${mem.id}">
                                  <div class="memory-time">${timeAgo}</div>
                                  <div class="memory-text">${mem.text}</div>
                                  <div class="memory-footer">
                                    <div class="memory-tags">
                                      <span class="memory-tag" style="background: ${room.color}; color: white;">
                                        ${emotionInfo.icon}
                                      </span>
                                      <span class="memory-tag" style="background: rgba(184, 161, 193, 0.2); color: #8B7E77;">
                                        重要性${mem.importance}
                                      </span>
                                    </div>
                                    <div class="memory-retention">💪 ${(retention * 100).toFixed(0)}%</div>
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}

                  <!-- 遗忘曲线房间 -->
                  <div class="room-card" style="border: 2px solid #E8B4B8;">
                    <div class="room-header">
                      <div class="room-info">
                        <div class="room-icon" style="background: #E8B4B8;">
                          📉
                        </div>
                        <div class="room-text">
                          <div class="room-name">遗忘曲线</div>
                          <div class="room-desc">记忆强度追踪、衰减预测</div>
                        </div>
                      </div>
                    </div>
                    <div style="text-align: center; padding: 20px 0;">
                      <button id="viewCurveBtn" style="
                        padding: 12px 32px;
                        background: linear-gradient(135deg, #E8B4B8, #B8A1C9);
                        color: white;
                        border: none;
                        border-radius: 24px;
                        font-size: 14px;
                        cursor: pointer;
                        box-shadow: 0 4px 12px rgba(232, 180, 184, 0.3);
                      ">
                        查看遗忘曲线分析
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;

            // 绑定事件
            container.querySelector('#palaceBack').onclick = () => {
              currentView = 'conversationSelect';
              render();
            };

            container.querySelector('#viewCurveBtn').onclick = () => {
              currentView = 'forgettingCurve';
              render();
            };

            container.querySelectorAll('.memory-item').forEach(item => {
              item.onclick = async () => {
                const memId = item.dataset.id;
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

          // 渲染遗忘曲线页面
          function renderForgettingCurve() {
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).length;
            const avgRetention = memories.length > 0 ?
              memories.reduce((sum, m) => sum + calculateRetention(m), 0) / memories.length : 0;

            container.innerHTML = `
              <div class="mp-curve">
                <style>
                  .mp-curve {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(180deg, #F5F0EB 0%, #E8DDD0 100%);
                    display: flex;
                    flex-direction: column;
                  }
                  .curve-header {
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.9);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                  }
                  .curve-back {
                    font-size: 20px;
                    color: #8B7E77;
                    cursor: pointer;
                  }
                  .curve-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #8B7E77;
                  }
                  .curve-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 16px;
                  }
                  .curve-card {
                    background: white;
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
                  }
                  .curve-card-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #8B7E77;
                    margin-bottom: 16px;
                  }
                  .curve-stats {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                  }
                  .curve-stat {
                    text-align: center;
                    padding: 16px;
                    background: rgba(232, 180, 184, 0.1);
                    border-radius: 12px;
                  }
                  .curve-stat-value {
                    font-size: 32px;
                    font-weight: 700;
                    color: #E8B4B8;
                    margin-bottom: 6px;
                  }
                  .curve-stat-label {
                    font-size: 12px;
                    color: #A89A94;
                  }
                </style>

                <div class="curve-header">
                  <div class="curve-back" id="curveBack">←</div>
                  <div class="curve-title">遗忘曲线分析</div>
                </div>

                <div class="curve-content">
                  <div class="curve-card">
                    <div class="curve-card-title">📊 记忆健康度</div>
                    <div class="curve-stats">
                      <div class="curve-stat">
                        <div class="curve-stat-value">${(avgRetention * 100).toFixed(0)}%</div>
                        <div class="curve-stat-label">平均保持率</div>
                      </div>
                      <div class="curve-stat">
                        <div class="curve-stat-value">${needReview}</div>
                        <div class="curve-stat-label">需要复习</div>
                      </div>
                    </div>
                  </div>

                  <div class="curve-card">
                    <div class="curve-card-title">📈 艾宾浩斯遗忘曲线</div>
                    <svg viewBox="0 0 100 100" style="width: 100%; height: 200px;">
                      <defs>
                        <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" style="stop-color:#E8B4B8;stop-opacity:1" />
                          <stop offset="100%" style="stop-color:#B8A1C9;stop-opacity:1" />
                        </linearGradient>
                      </defs>

                      <!-- 网格 -->
                      ${[0, 25, 50, 75, 100].map(y => `
                        <line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#E8DDD0" stroke-width="0.3"/>
                      `).join('')}

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
                    <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; color: #A89A94;">
                      <span>今天</span>
                      <span>7天</span>
                      <span>14天</span>
                      <span>21天</span>
                      <span>30天</span>
                    </div>
                  </div>

                  <div class="curve-card">
                    <div class="curve-card-title">🏠 房间记忆分布</div>
                    ${Object.values(SEVEN_ROOMS).map(room => {
                      const count = getMemoriesByRoom(room.id).length;
                      const percent = memories.length > 0 ? (count / memories.length * 100).toFixed(1) : 0;
                      return `
                        <div style="margin-bottom: 16px;">
                          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #8B7E77;">${room.icon} ${room.name}</span>
                            <span style="font-size: 13px; color: #A89A94;">${count} (${percent}%)</span>
                          </div>
                          <div style="height: 8px; background: rgba(184, 165, 161, 0.1); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: ${room.color}; transition: width 0.5s;"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            `;

            container.querySelector('#curveBack').onclick = () => {
              currentView = 'memoryPalace';
              render();
            };
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

          await loadConversations();
          render();
        },
        async unmount(container) {
          container.replaceChildren();
        }
      }
    ]
  });
})();
