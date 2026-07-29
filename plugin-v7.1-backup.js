// Roche 记忆宫殿插件 v7.1.1
// 完整功能 + 混合搜索 + 扩散激活 + 情绪启动 + 记忆关联

(function() {
  'use strict';

  // ============ 七房间配置 ============

  const SEVEN_ROOMS = {
    livingRoom: {
      id: 'livingRoom',
      name: '客厅',
      icon: '🛋️',
      desc: '日常闲聊、近期互动',
      color: '#E8B4B8',
      capacity: 200,
      decayRate: 0.8,
      brainArea: '海马体'
    },
    bedroom: {
      id: 'bedroom',
      name: '卧室',
      icon: '🛏️',
      desc: '亲密情感、深层羁绊',
      color: '#B8A1C9',
      capacity: Infinity,
      decayRate: 0.1,
      brainArea: '新皮层'
    },
    study: {
      id: 'study',
      name: '书房',
      icon: '📚',
      desc: '工作学习、技能成长',
      color: '#9FB8AD',
      capacity: Infinity,
      decayRate: 0.3,
      brainArea: '前额叶'
    },
    userRoom: {
      id: 'userRoom',
      name: 'User的房间',
      icon: '👤',
      desc: '用户个人信息、习惯',
      color: '#C9B8A1',
      capacity: Infinity,
      decayRate: 0.2,
      brainArea: '颞顶联合区'
    },
    selfRoom: {
      id: 'selfRoom',
      name: '自我房间',
      icon: '🪞',
      desc: '角色自我认同、演变',
      color: '#A8B8C9',
      capacity: Infinity,
      decayRate: 0,
      brainArea: '默认模式网络'
    },
    attic: {
      id: 'attic',
      name: '阁楼',
      icon: '🏚️',
      desc: '未消化的困惑、潜意识',
      color: '#B8B5AD',
      capacity: Infinity,
      decayRate: 0,
      brainArea: '杏仁核-海马'
    },
    windowSill: {
      id: 'windowSill',
      name: '窗台',
      icon: '🪟',
      desc: '期盼、目标、憧憬',
      color: '#E8D4B8',
      capacity: Infinity,
      decayRate: 0.5,
      brainArea: '多巴胺奖赏系统'
    }
  };

  const EMOTION_TYPES = {
    joy: { name: '快乐', icon: '😊', color: '#FFD7A8' },
    sadness: { name: '悲伤', icon: '😢', color: '#B8C9E8' },
    anger: { name: '愤怒', icon: '😠', color: '#E8B4B8' },
    fear: { name: '恐惧', icon: '😰', color: '#C9B8E8' },
    hurt: { name: '委屈', icon: '🥺', color: '#E8C9D4' },
    anxiety: { name: '焦虑', icon: '😟', color: '#C9D4B8' },
    warmth: { name: '温暖', icon: '🥰', color: '#FFE8D4' },
    neutral: { name: '平静', icon: '😐', color: '#D4D4D4' }
  };

  // ============ 算法函数 ============

  function calculateRetention(memory) {
    const now = Date.now();
    const daysPassed = (now - memory.lastRecall) / (1000 * 60 * 60 * 24);
    const room = SEVEN_ROOMS[memory.room] || SEVEN_ROOMS.livingRoom;

    const baseStrength = 7;
    const importanceBonus = memory.importance * 2;
    const reviewBonus = (memory.reviewCount || 0) * 0.5;
    const S = baseStrength + importanceBonus + reviewBonus;

    const effectiveDecay = 1 + (room.decayRate * 2);
    const retention = Math.exp(-daysPassed / (S / effectiveDecay));

    return Math.max(retention, room.decayRate === 0 ? 0.7 : 0);
  }

  function reinforceMemory(memory) {
    memory.lastRecall = Date.now();
    memory.reviewCount = (memory.reviewCount || 0) + 1;
    return memory;
  }

  function classifyMemory(text) {
    if (/喜欢|爱|想念|温暖|抱|亲|感动/.test(text)) return 'bedroom';
    if (/学习|工作|技能|教|懂|理解|项目/.test(text)) return 'study';
    if (/习惯|总是|经常|喜欢吃|讨厌|偏好/.test(text)) return 'userRoom';
    if (/我是|我觉得自己|我想成为|自我/.test(text)) return 'selfRoom';
    if (/不确定|困惑|不知道|纠结|心结|矛盾/.test(text)) return 'attic';
    if (/想要|希望|期待|以后|未来|憧憬/.test(text)) return 'windowSill';
    return 'livingRoom';
  }

  function detectEmotion(text) {
    if (/委屈|不公平|凭什么/.test(text)) return 'hurt';
    if (/开心|高兴|哈哈|棒|兴奋/.test(text)) return 'joy';
    if (/难过|伤心|哭|失落/.test(text)) return 'sadness';
    if (/生气|愤怒|烦|讨厌/.test(text)) return 'anger';
    if (/害怕|担心|恐惧/.test(text)) return 'fear';
    if (/焦虑|紧张|不安/.test(text)) return 'anxiety';
    if (/温暖|感动|幸福|甜蜜/.test(text)) return 'warmth';
    return 'neutral';
  }

  function detectImportance(text) {
    if (/永远|刻骨铭心|难忘|一辈子/.test(text)) return 10;
    if (/重要|关键|必须|一定/.test(text)) return 8;
    if (/想|希望|可能/.test(text)) return 5;
    if (/随便|无所谓|算了/.test(text)) return 2;
    return 5;
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

  // ============ 向量相似度计算（简化版）============

  function calculateVectorSimilarity(text1, text2) {
    // 简化的余弦相似度计算
    const words1 = text1.toLowerCase().match(/[一-龥a-z]+/g) || [];
    const words2 = text2.toLowerCase().match(/[一-龥a-z]+/g) || [];

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    if (set1.size === 0 || set2.size === 0) return 0;
    return intersection.size / Math.sqrt(set1.size * set2.size);
  }

  // ============ BM25 关键词搜索 ============

  function calculateBM25(query, text) {
    const queryWords = query.toLowerCase().match(/[一-龥a-z]+/g) || [];
    const textWords = text.toLowerCase().match(/[一-龥a-z]+/g) || [];

    let score = 0;
    queryWords.forEach(qw => {
      const freq = textWords.filter(tw => tw === qw).length;
      if (freq > 0) {
        score += Math.log(1 + freq);
      }
    });

    return score;
  }

  // ============ 混合搜索（85%向量 + 15%关键词）============

  function hybridSearch(query, memories) {
    if (!query) return memories;

    const results = memories.map(mem => {
      const vectorScore = calculateVectorSimilarity(query, mem.text);
      const bm25Score = calculateBM25(query, mem.text);

      // 归一化 BM25
      const maxBM25 = Math.max(...memories.map(m => calculateBM25(query, m.text)), 1);
      const normalizedBM25 = bm25Score / maxBM25;

      // 混合得分：85% 向量 + 15% BM25
      const finalScore = vectorScore * 0.85 + normalizedBM25 * 0.15;

      return { memory: mem, score: finalScore };
    });

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.memory);
  }

  // ============ 记忆关联（扩散激活）============

  function findRelatedMemories(targetMemory, allMemories, personality = 'emotional') {
    const weights = {
      emotional: { emotion: 1.0, person: 0.6, time: 0.3 },
      narrative: { time: 1.0, person: 0.8, emotion: 0.5 },
      analytical: { cause: 1.0, time: 0.4, emotion: 0.3 }
    }[personality] || { emotion: 1.0, person: 0.6, time: 0.3 };

    const related = allMemories
      .filter(m => m.id !== targetMemory.id)
      .map(mem => {
        let score = 0;

        // 情绪关联
        if (mem.emotion === targetMemory.emotion) {
          score += weights.emotion || 0;
        }

        // 时间关联（7天内）
        const timeDiff = Math.abs(mem.timestamp - targetMemory.timestamp) / (1000 * 60 * 60 * 24);
        if (timeDiff < 7) {
          score += (weights.time || 0) * (1 - timeDiff / 7);
        }

        // 文本相似度
        const similarity = calculateVectorSimilarity(targetMemory.text, mem.text);
        score += similarity * 0.5;

        return { memory: mem, score };
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return related.map(r => r.memory);
  }

  // ============ 情绪启动（重排记忆）============

  function applyEmotionPriming(memories, currentEmotion) {
    if (currentEmotion === 'neutral') return memories;

    return memories.map(mem => {
      const boosted = mem.emotion === currentEmotion;
      return {
        ...mem,
        _emotionBoosted: boosted,
        _sortScore: boosted ? 1.3 : 1.0
      };
    }).sort((a, b) => {
      const scoreA = calculateRetention(a) * a._sortScore;
      const scoreB = calculateRetention(b) * b._sortScore;
      return scoreB - scoreA;
    });
  }

  // ============ 反刍检查 ============

  function checkRumination(memories, ruminationTendency = 0.3) {
    const atticMemories = memories.filter(m => m.room === 'attic');
    if (atticMemories.length === 0) return null;

    const probability = ruminationTendency * 0.2;
    if (Math.random() < probability) {
      return atticMemories[Math.floor(Math.random() * atticMemories.length)];
    }

    return null;
  }

  // ============ 自动遗忘（客厅满了后迁移）============

  function autoForget(memories) {
    const livingRoomMemories = memories.filter(m => m.room === 'livingRoom');

    if (livingRoomMemories.length > 200) {
      // 按重要性和保持率排序
      livingRoomMemories.sort((a, b) => {
        const scoreA = a.importance * calculateRetention(a);
        const scoreB = b.importance * calculateRetention(b);
        return scoreA - scoreB;
      });

      // 重要的晋升到卧室，不重要的沉入阁楼
      livingRoomMemories.slice(0, livingRoomMemories.length - 200).forEach(mem => {
        if (mem.importance >= 7) {
          mem.room = 'bedroom';
        } else {
          mem.room = 'attic';
        }
      });
    }

    return memories;
  }

  // ============ 主插件 ============

  window.RochePlugin.register({
    id: 'memory-palace',
    name: '记忆宫殿',
    version: '7.1.1',
    apps: [
      {
        id: 'memory-palace-home',
        name: '记忆宫殿',
        icon: 'psychology',
        async mount(container, roche) {
          let currentView = 'conversationSelect';
          let conversations = [];
          let selectedConvId = null;
          let memories = [];
          let selectedRoomId = null;
          let searchQuery = '';
          let saveTimer = null; // 延迟保存定时器

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
                relations: meta.relations || []
              };
            });

            // 应用自动遗忘（客厅水位线）
            memories = autoForget(memories);

            memories.sort((a, b) => b.timestamp - a.timestamp);

            // 自动保存更新后的数据
            scheduleSave();
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

          // 延迟保存（避免阻塞通知）
          function scheduleSave() {
            // 清除之前的定时器
            if (saveTimer) {
              clearTimeout(saveTimer);
            }

            // 2秒后保存（批量合并多次操作）
            saveTimer = setTimeout(() => {
              saveMemoryMeta().catch(err => {
                console.error('[记忆宫殿] 延迟保存失败:', err);
              });
            }, 2000);
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
              display: capacity === '∞' ? `${count}条` : `${count}/${capacity}`
            };
          }

          function searchMemories(query) {
            if (!query) return memories;
            // 使用混合搜索（85%向量 + 15%BM25）
            return hybridSearch(query, memories);
          }

// ============ 全局样式 ============

          const GLOBAL_STYLES = `
            <style>
              /* 全局重置 */
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }

              /* 主容器 */
              .mp-app {
                width: 100%;
                height: 100%;
                background: linear-gradient(180deg, #F5F0EB 0%, #E8DDD0 100%);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }

              /* 通用头部 */
              .mp-header {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-bottom: 1px solid rgba(184, 165, 161, 0.15);
                flex-shrink: 0;
              }

              /* 通用内容区 */
              .mp-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
              }

              /* 滚动条美化 */
              .mp-content::-webkit-scrollbar {
                width: 8px;
              }
              .mp-content::-webkit-scrollbar-track {
                background: rgba(184, 165, 161, 0.05);
              }
              .mp-content::-webkit-scrollbar-thumb {
                background: rgba(184, 161, 193, 0.2);
                border-radius: 4px;
              }
              .mp-content::-webkit-scrollbar-thumb:hover {
                background: rgba(184, 161, 193, 0.3);
              }

              /* 卡片通用样式 */
              .mp-card {
                background: white;
                border-radius: 20px;
                box-shadow: 0 2px 16px rgba(139, 126, 119, 0.08);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              }
              .mp-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 24px rgba(139, 126, 119, 0.12);
              }

              /* 按钮通用样式 */
              .mp-btn {
                padding: 12px 24px;
                border: none;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
              }
              .mp-btn-primary {
                background: linear-gradient(135deg, #E8B4B8, #B8A1C9);
                color: white;
              }
              .mp-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(232, 180, 184, 0.3);
              }

              /* 空状态 */
              .mp-empty {
                text-align: center;
                padding: 80px 20px;
                color: #A89A94;
              }
              .mp-empty-icon {
                font-size: 72px;
                margin-bottom: 20px;
                opacity: 0.5;
              }
              .mp-empty-text {
                font-size: 16px;
                line-height: 1.6;
              }

              /* 动画 */
              @keyframes fadeIn {
                from {
                  opacity: 0;
                  transform: translateY(20px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              .mp-fade-in {
                animation: fadeIn 0.4s ease-out;
              }
            </style>
          `;

          // ============ 渲染主函数 ============

          function render() {
            if (currentView === 'conversationSelect') {
              renderConversationSelect();
            } else if (currentView === 'memoryPalace') {
              renderMemoryPalace();
            } else if (currentView === 'roomDetail') {
              renderRoomDetail();
            } else if (currentView === 'allMemories') {
              renderAllMemories();
            } else if (currentView === 'eventBox') {
              renderEventBox();
            } else if (currentView === 'search') {
              renderSearch();
            } else if (currentView === 'forgettingCurve') {
              renderForgettingCurve();
            }
          }

          // ============ 1. 会话选择页 ============

          function renderConversationSelect() {
            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 24px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="exitBtn">← 退出</div>
                    <div style="font-size: 24px; color: #B8A1C9;">❋</div>
                  </div>
                  <div style="text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #8B7E77; letter-spacing: 3px; margin-bottom: 8px;">
                      MEMORY PALACE
                    </div>
                    <div style="font-size: 22px; font-weight: 600; color: #8B7E77; margin-bottom: 12px;">
                      记忆宫殿
                    </div>
                    <div style="font-size: 14px; color: #A89A94;">
                      选择一个角色·开启Ta的七房间思维空间
                    </div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 24px 20px;">
                  ${conversations.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">💭</div>
                      <div class="mp-empty-text">暂无会话<br/>开始对话后即可创建记忆宫殿</div>
                    </div>
                  ` : conversations.map((conv, idx) => `
                    <div class="mp-card mp-fade-in" style="
                      padding: 24px;
                      margin-bottom: 16px;
                      cursor: pointer;
                      animation-delay: ${idx * 0.1}s;
                    " data-conv-id="${conv.id}">
                      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                        <div style="font-size: 20px; font-weight: 600; color: #8B7E77;">
                          ${conv.name || conv.title || conv.handle || '未命名会话'}
                        </div>
                        <div style="
                          padding: 6px 14px;
                          background: linear-gradient(135deg, #E8F5E9, #C8E6C9);
                          color: #4CAF50;
                          border-radius: 16px;
                          font-size: 12px;
                          font-weight: 600;
                        ">
                          已就绪
                        </div>
                      </div>
                      <div style="font-size: 14px; color: #A89A94; margin-bottom: 8px;">
                        记忆宫殿
                      </div>
                      <div style="font-size: 13px; color: #B8A1C9; margin-bottom: 12px;">
                        七房间空间模型·向量检索
                      </div>
                      <div style="font-size: 14px; color: #A89A94; margin-bottom: 8px;">
                        全自动记忆
                      </div>
                      <div style="font-size: 13px; color: #9FB8AD;">
                        自动归档·推水位线·隐藏已总结
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;

            container.querySelector('#exitBtn').onclick = () => roche.ui.closeApp();
            container.querySelectorAll('[data-conv-id]').forEach(card => {
              card.onclick = async () => {
                selectedConvId = card.dataset.convId;
                await loadMemories();
                currentView = 'memoryPalace';
                render();
              };
            });
          }

          // ============ 2. 记忆宫殿主页（七房间概览）============

          function renderMemoryPalace() {
            const selectedConv = conversations.find(c => c.id === selectedConvId);
            const convName = selectedConv ? (selectedConv.name || selectedConv.title || selectedConv.handle) : '未命名';
            const totalMemories = memories.length;
            const wishCount = getMemoriesByRoom('windowSill').length;

            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <!-- 头部 -->
                <div class="mp-header" style="padding: 20px 24px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="backBtn">← 返回</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8B7E77; text-align: center; flex: 1;">
                      ${convName}的记忆宫殿
                    </div>
                    <div style="font-size: 20px; color: #8B7E77; width: 32px;"></div>
                  </div>
                  <div style="text-align: center; font-size: 13px; color: #A89A94;">
                    ${totalMemories}条记忆 · 0个事件盒 · ${wishCount}个期盼
                  </div>
                </div>

                <!-- 功能按钮区 -->
                <div style="
                  padding: 16px 24px;
                  background: white;
                  border-bottom: 1px solid rgba(184, 165, 161, 0.1);
                  flex-shrink: 0;
                ">
                  <div style="display: flex; gap: 12px; overflow-x: auto; margin-bottom: 16px;">
                    <div class="mp-btn" style="
                      background: rgba(232, 180, 184, 0.1);
                      color: #8B7E77;
                      border: 1px solid rgba(232, 180, 184, 0.3);
                      white-space: nowrap;
                    " id="viewAllBtn">
                      📋 查看全部记忆
                    </div>
                    <div class="mp-btn" style="
                      background: rgba(159, 184, 173, 0.1);
                      color: #8B7E77;
                      border: 1px solid rgba(159, 184, 173, 0.3);
                      white-space: nowrap;
                    " id="viewEventsBtn">
                      📦 查看事件盒
                    </div>
                  </div>

                  <!-- 搜索框 -->
                  <div style="position: relative;">
                    <input
                      type="text"
                      id="quickSearchInput"
                      placeholder="搜索记忆（关键词、标签、情绪...）"
                      style="
                        width: 100%;
                        padding: 12px 44px 12px 16px;
                        border: 2px solid rgba(184, 161, 193, 0.2);
                        border-radius: 12px;
                        font-size: 14px;
                        color: #8B7E77;
                        background: white;
                        outline: none;
                        transition: all 0.2s;
                      "
                    />
                    <div style="
                      position: absolute;
                      right: 14px;
                      top: 50%;
                      transform: translateY(-50%);
                      font-size: 18px;
                      color: #B8A1C9;
                      cursor: pointer;
                    " id="quickSearchIcon">🔍</div>
                  </div>
                </div>

                <!-- 七房间网格 -->
                <div class="mp-content" style="padding: 24px 16px;">
                  <div style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                    max-width: 1000px;
                    margin: 0 auto;
                  ">
                    ${Object.values(SEVEN_ROOMS).map((room, idx) => {
                      const stats = getRoomStats(room.id);
                      return `
                        <div class="mp-card mp-fade-in" style="
                          padding: 24px;
                          cursor: pointer;
                          border: 2px solid transparent;
                          animation-delay: ${idx * 0.08}s;
                        " data-room-id="${room.id}">
                          <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                            <div style="
                              width: 56px;
                              height: 56px;
                              background: ${room.color};
                              border-radius: 16px;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              font-size: 28px;
                              flex-shrink: 0;
                            ">
                              ${room.icon}
                            </div>
                            <div style="flex: 1; min-width: 0;">
                              <div style="font-size: 18px; font-weight: 600; color: #8B7E77; margin-bottom: 6px;">
                                ${room.name}
                              </div>
                              <div style="font-size: 13px; color: #A89A94; line-height: 1.5;">
                                ${room.desc}
                              </div>
                            </div>
                          </div>
                          <div style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 12px 16px;
                            background: rgba(245, 240, 235, 0.6);
                            border-radius: 12px;
                          ">
                            <div style="font-size: 12px; color: #A89A94;">
                              ${room.brainArea}
                            </div>
                            <div style="font-size: 15px; font-weight: 600; color: ${room.color};">
                              ${stats.display}
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}

                    <!-- 遗忘曲线卡片 -->
                    <div class="mp-card mp-fade-in" style="
                      padding: 24px;
                      cursor: pointer;
                      border: 2px solid #E8B4B8;
                      background: linear-gradient(135deg, rgba(232, 180, 184, 0.05), rgba(184, 161, 193, 0.05));
                      animation-delay: 0.56s;
                    " id="curveCard">
                      <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                        <div style="
                          width: 56px;
                          height: 56px;
                          background: linear-gradient(135deg, #E8B4B8, #B8A1C9);
                          border-radius: 16px;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          font-size: 28px;
                        ">
                          📉
                        </div>
                        <div style="flex: 1;">
                          <div style="font-size: 18px; font-weight: 600; color: #8B7E77; margin-bottom: 6px;">
                            遗忘曲线
                          </div>
                          <div style="font-size: 13px; color: #A89A94; line-height: 1.5;">
                            记忆强度追踪、衰减预测
                          </div>
                        </div>
                      </div>
                      <div style="
                        text-align: center;
                        padding: 12px;
                        background: linear-gradient(135deg, #E8B4B8, #B8A1C9);
                        color: white;
                        border-radius: 12px;
                        font-size: 14px;
                        font-weight: 600;
                      ">
                        查看详细分析 →
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;

            // 绑定事件
            container.querySelector('#backBtn').onclick = () => {
              currentView = 'conversationSelect';
              render();
            };

            container.querySelector('#viewAllBtn').onclick = () => {
              currentView = 'allMemories';
              render();
            };

            container.querySelector('#viewEventsBtn').onclick = () => {
              currentView = 'eventBox';
              render();
            };

            // 快速搜索功能
            const quickSearchInput = container.querySelector('#quickSearchInput');
            const quickSearchIcon = container.querySelector('#quickSearchIcon');

            quickSearchInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter' && quickSearchInput.value.trim()) {
                searchQuery = quickSearchInput.value.trim();
                currentView = 'search';
                render();
              }
            });

            quickSearchIcon.onclick = () => {
              if (quickSearchInput.value.trim()) {
                searchQuery = quickSearchInput.value.trim();
                currentView = 'search';
                render();
              } else {
                currentView = 'search';
                render();
              }
            };

            container.querySelector('#curveCard').onclick = () => {
              currentView = 'forgettingCurve';
              render();
            };

            container.querySelectorAll('[data-room-id]').forEach(card => {
              const roomId = card.dataset.roomId; // 在外层提前获取，避免闭包问题

              card.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Room clicked:', roomId); // 调试信息
                selectedRoomId = roomId;
                currentView = 'roomDetail';
                render();
              };

              // 悬停效果
              card.onmouseenter = () => {
                const room = SEVEN_ROOMS[roomId];
                card.style.borderColor = room.color;
              };
              card.onmouseleave = () => {
                card.style.borderColor = 'transparent';
              };
            });
          }

// ============ 3. 房间详情页 ============

          function renderRoomDetail() {
            // 添加安全检查
            if (!selectedRoomId || !SEVEN_ROOMS[selectedRoomId]) {
              console.error('Invalid room ID:', selectedRoomId);
              currentView = 'memoryPalace';
              render();
              return;
            }

            const room = SEVEN_ROOMS[selectedRoomId];
            const roomMemories = getMemoriesByRoom(selectedRoomId);

            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 20px 24px; background: ${room.color};">
                  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                    <div style="font-size: 20px; color: white; cursor: pointer;" id="backBtn">←</div>
                    <div style="
                      width: 48px;
                      height: 48px;
                      background: white;
                      border-radius: 14px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 26px;
                    ">
                      ${room.icon}
                    </div>
                    <div style="flex: 1;">
                      <div style="font-size: 22px; font-weight: 700; color: white; margin-bottom: 4px;">
                        ${room.name}
                      </div>
                      <div style="font-size: 13px; color: rgba(255, 255, 255, 0.9);">
                        ${room.desc}
                      </div>
                    </div>
                  </div>
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                  ">
                    <div style="font-size: 13px; color: white;">
                      ${room.brainArea}
                    </div>
                    <div style="font-size: 15px; font-weight: 600; color: white;">
                      ${roomMemories.length}条记忆
                    </div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 20px 16px;">
                  ${roomMemories.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">${room.icon}</div>
                      <div class="mp-empty-text">
                        这个房间还是空的<br/>
                        继续对话，记忆会自动归档到这里
                      </div>
                    </div>
                  ` : `
                    <div style="max-width: 800px; margin: 0 auto;">
                      ${roomMemories.map((mem, idx) => {
                        const retention = calculateRetention(mem);
                        const emotionInfo = EMOTION_TYPES[mem.emotion];
                        const timeAgo = getTimeAgo(mem.timestamp);
                        const retentionColor = retention > 0.7 ? '#4CAF50' : retention > 0.3 ? '#FF9800' : '#F44336';

                        return `
                          <div class="mp-card mp-fade-in" style="
                            padding: 20px;
                            margin-bottom: 16px;
                            cursor: pointer;
                            animation-delay: ${idx * 0.05}s;
                          " data-mem-id="${mem.id}">
                            <div style="display: flex; align-items: flex-start; gap: 16px;">
                              <div style="
                                width: 48px;
                                height: 48px;
                                background: ${emotionInfo.color};
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 24px;
                                flex-shrink: 0;
                              ">
                                ${emotionInfo.icon}
                              </div>
                              <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 12px; color: #B8A1C9; margin-bottom: 8px;">
                                  ${timeAgo}
                                </div>
                                <div style="font-size: 15px; color: #8B7E77; line-height: 1.6; margin-bottom: 12px;">
                                  ${mem.text}
                                </div>
                                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                                  <div style="display: flex; gap: 8px;">
                                    <span style="
                                      padding: 5px 12px;
                                      background: ${emotionInfo.color};
                                      color: white;
                                      border-radius: 8px;
                                      font-size: 12px;
                                      font-weight: 500;
                                    ">
                                      ${emotionInfo.name}
                                    </span>
                                    <span style="
                                      padding: 5px 12px;
                                      background: rgba(184, 161, 193, 0.15);
                                      color: #8B7E77;
                                      border-radius: 8px;
                                      font-size: 12px;
                                    ">
                                      重要性 ${mem.importance}
                                    </span>
                                  </div>
                                  <div style="
                                    padding: 5px 12px;
                                    background: ${retentionColor}22;
                                    color: ${retentionColor};
                                    border-radius: 8px;
                                    font-size: 12px;
                                    font-weight: 600;
                                  ">
                                    💪 ${(retention * 100).toFixed(0)}% · 复习${mem.reviewCount}次
                                  </div>
                                </div>

                                <!-- 关联记忆 -->
                                ${(() => {
                                  const relatedMems = findRelatedMemories(mem, memories);
                                  if (relatedMems.length === 0) return '';
                                  return `
                                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(184, 165, 161, 0.1);">
                                      <div style="font-size: 12px; color: #A89A94; margin-bottom: 10px;">
                                        🔗 相关记忆 (${relatedMems.length})
                                      </div>
                                      <div style="display: flex; flex-direction: column; gap: 8px;">
                                        ${relatedMems.slice(0, 3).map(rel => {
                                          const relRoom = SEVEN_ROOMS[rel.room];
                                          return `
                                            <div style="
                                              padding: 10px;
                                              background: rgba(245, 240, 235, 0.6);
                                              border-radius: 8px;
                                              font-size: 13px;
                                              color: #8B7E77;
                                              line-height: 1.4;
                                              cursor: pointer;
                                              transition: all 0.2s;
                                            " data-related-id="${rel.id}" class="related-memory">
                                              <span style="
                                                padding: 2px 6px;
                                                background: ${relRoom.color};
                                                color: white;
                                                border-radius: 4px;
                                                font-size: 10px;
                                                margin-right: 6px;
                                              ">${relRoom.icon}</span>
                                              ${rel.text.slice(0, 60)}${rel.text.length > 60 ? '...' : ''}
                                            </div>
                                          `;
                                        }).join('')}
                                      </div>
                                    </div>
                                  `;
                                })()}
                              </div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              </div>
            `;

            container.querySelector('#backBtn').onclick = () => {
              currentView = 'memoryPalace';
              render();
            };

            container.querySelectorAll('[data-mem-id]').forEach(card => {
              card.onclick = async (e) => {
                // 阻止事件冒泡，避免点击关联记忆时触发主卡片点击
                if (e.target.closest('.related-memory')) return;

                const memId = card.dataset.memId;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  scheduleSave();
                  roche.ui.toast('✨ 记忆已巩固！保持率提升');
                  render();
                }
              };
            });

            // 关联记忆点击事件
            container.querySelectorAll('.related-memory').forEach(relCard => {
              relCard.onclick = async (e) => {
                e.stopPropagation(); // 阻止冒泡
                const relId = relCard.dataset.relatedId;
                const relMem = memories.find(m => m.id === relId);
                if (relMem) {
                  // 跳转到相关记忆所在的房间
                  selectedRoomId = relMem.room;
                  currentView = 'roomDetail';
                  render();

                  // 等待渲染完成后滚动到目标记忆
                  setTimeout(() => {
                    const targetCard = container.querySelector(`[data-mem-id="${relId}"]`);
                    if (targetCard) {
                      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      targetCard.style.background = 'rgba(232, 180, 184, 0.1)';
                      setTimeout(() => {
                        targetCard.style.background = '';
                      }, 1500);
                    }
                  }, 100);
                }
              };

              // 悬停效果
              relCard.onmouseenter = () => {
                relCard.style.background = 'rgba(184, 161, 193, 0.15)';
                relCard.style.transform = 'translateX(4px)';
              };
              relCard.onmouseleave = () => {
                relCard.style.background = 'rgba(245, 240, 235, 0.6)';
                relCard.style.transform = 'translateX(0)';
              };
            });
          }

          // ============ 4. 全部记忆页 ============

          function renderAllMemories() {
            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 20px 24px;">
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="backBtn">←</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8B7E77;">
                      全部记忆 (${memories.length})
                    </div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 20px 16px;">
                  ${memories.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">📭</div>
                      <div class="mp-empty-text">暂无记忆</div>
                    </div>
                  ` : `
                    <div style="max-width: 800px; margin: 0 auto;">
                      ${memories.map((mem, idx) => {
                        const retention = calculateRetention(mem);
                        const emotionInfo = EMOTION_TYPES[mem.emotion];
                        const room = SEVEN_ROOMS[mem.room];
                        const timeAgo = getTimeAgo(mem.timestamp);
                        const retentionColor = retention > 0.7 ? '#4CAF50' : retention > 0.3 ? '#FF9800' : '#F44336';

                        return `
                          <div class="mp-card mp-fade-in" style="
                            padding: 20px;
                            margin-bottom: 16px;
                            cursor: pointer;
                            animation-delay: ${Math.min(idx * 0.03, 0.5)}s;
                          " data-mem-id="${mem.id}">
                            <div style="display: flex; gap: 12px; margin-bottom: 8px;">
                              <span style="
                                padding: 4px 10px;
                                background: ${room.color};
                                color: white;
                                border-radius: 6px;
                                font-size: 11px;
                                font-weight: 600;
                              ">
                                ${room.icon} ${room.name}
                              </span>
                              <span style="font-size: 12px; color: #B8A1C9;">
                                ${timeAgo}
                              </span>
                            </div>
                            <div style="font-size: 15px; color: #8B7E77; line-height: 1.6; margin-bottom: 12px;">
                              ${mem.text}
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                              <span style="
                                padding: 4px 10px;
                                background: ${emotionInfo.color};
                                color: white;
                                border-radius: 6px;
                                font-size: 11px;
                              ">
                                ${emotionInfo.icon} ${emotionInfo.name}
                              </span>
                              <span style="
                                font-size: 12px;
                                font-weight: 600;
                                color: ${retentionColor};
                              ">
                                💪 ${(retention * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              </div>
            `;

            container.querySelector('#backBtn').onclick = () => {
              currentView = 'memoryPalace';
              render();
            };

            container.querySelectorAll('[data-mem-id]').forEach(card => {
              card.onclick = async () => {
                const memId = card.dataset.memId;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  scheduleSave();
                  roche.ui.toast('✨ 记忆已巩固！');
                  render();
                }
              };
            });
          }

          // ============ 5. 事件盒页 ============

          function renderEventBox() {
            // 事件盒：按时间线组织的重要事件
            // 从记忆中提取重要事件（importance >= 7）
            const eventMemories = memories.filter(m => m.importance >= 7);

            // 按时间分组
            const eventsByDate = {};
            eventMemories.forEach(mem => {
              const date = new Date(mem.timestamp).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long'
              });
              if (!eventsByDate[date]) {
                eventsByDate[date] = [];
              }
              eventsByDate[date].push(mem);
            });

            const sortedDates = Object.keys(eventsByDate).sort((a, b) => {
              const dateA = eventsByDate[a][0].timestamp;
              const dateB = eventsByDate[b][0].timestamp;
              return dateB - dateA;
            });

            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 20px 24px;">
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="backBtn">←</div>
                    <div style="flex: 1;">
                      <div style="font-size: 18px; font-weight: 600; color: #8B7E77; margin-bottom: 4px;">
                        事件盒 (${eventMemories.length})
                      </div>
                      <div style="font-size: 13px; color: #A89A94;">
                        重要事件时间线
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 20px 16px;">
                  ${eventMemories.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">📦</div>
                      <div class="mp-empty-text">
                        暂无重要事件<br/>
                        重要性≥7的记忆会自动归档到这里
                      </div>
                    </div>
                  ` : `
                    <div style="max-width: 800px; margin: 0 auto;">
                      ${sortedDates.map((date, dateIdx) => {
                        const dateEvents = eventsByDate[date];
                        return `
                          <div class="mp-fade-in" style="
                            margin-bottom: 32px;
                            animation-delay: ${dateIdx * 0.1}s;
                          ">
                            <!-- 日期标题 -->
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 12px;
                              margin-bottom: 16px;
                            ">
                              <div style="
                                font-size: 16px;
                                font-weight: 600;
                                color: #8B7E77;
                                padding: 8px 16px;
                                background: white;
                                border-radius: 20px;
                                box-shadow: 0 2px 8px rgba(139, 126, 119, 0.08);
                              ">
                                📅 ${date}
                              </div>
                              <div style="
                                flex: 1;
                                height: 2px;
                                background: linear-gradient(90deg, rgba(184, 161, 193, 0.3), transparent);
                              "></div>
                            </div>

                            <!-- 事件列表 -->
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                              ${dateEvents.map((mem, idx) => {
                                const retention = calculateRetention(mem);
                                const emotionInfo = EMOTION_TYPES[mem.emotion];
                                const room = SEVEN_ROOMS[mem.room];
                                const timeAgo = getTimeAgo(mem.timestamp);
                                const retentionColor = retention > 0.7 ? '#4CAF50' : retention > 0.3 ? '#FF9800' : '#F44336';

                                return `
                                  <div class="mp-card" style="
                                    padding: 20px;
                                    cursor: pointer;
                                    border-left: 4px solid ${room.color};
                                  " data-event-id="${mem.id}">
                                    <div style="display: flex; gap: 16px;">
                                      <div style="
                                        width: 56px;
                                        height: 56px;
                                        background: ${emotionInfo.color};
                                        border-radius: 14px;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        font-size: 28px;
                                        flex-shrink: 0;
                                      ">
                                        ${emotionInfo.icon}
                                      </div>
                                      <div style="flex: 1; min-width: 0;">
                                        <div style="
                                          display: flex;
                                          align-items: center;
                                          gap: 8px;
                                          margin-bottom: 8px;
                                        ">
                                          <span style="
                                            padding: 4px 10px;
                                            background: ${room.color};
                                            color: white;
                                            border-radius: 8px;
                                            font-size: 11px;
                                            font-weight: 600;
                                          ">
                                            ${room.icon} ${room.name}
                                          </span>
                                          <span style="font-size: 12px; color: #B8A1C9;">
                                            ${timeAgo}
                                          </span>
                                          <span style="
                                            padding: 4px 10px;
                                            background: #FFD7A8;
                                            color: #FF9800;
                                            border-radius: 8px;
                                            font-size: 11px;
                                            font-weight: 600;
                                          ">
                                            ⭐ 重要性 ${mem.importance}
                                          </span>
                                        </div>
                                        <div style="
                                          font-size: 15px;
                                          color: #8B7E77;
                                          line-height: 1.6;
                                          margin-bottom: 12px;
                                        ">
                                          ${mem.text}
                                        </div>
                                        <div style="
                                          display: flex;
                                          align-items: center;
                                          justify-content: space-between;
                                        ">
                                          <span style="
                                            padding: 4px 10px;
                                            background: ${emotionInfo.color};
                                            color: white;
                                            border-radius: 6px;
                                            font-size: 11px;
                                          ">
                                            ${emotionInfo.icon} ${emotionInfo.name}
                                          </span>
                                          <span style="
                                            font-size: 12px;
                                            font-weight: 600;
                                            color: ${retentionColor};
                                          ">
                                            💪 ${(retention * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                `;
                              }).join('')}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              </div>
            `;

            container.querySelector('#backBtn').onclick = () => {
              currentView = 'memoryPalace';
              render();
            };

            container.querySelectorAll('[data-event-id]').forEach(card => {
              card.onclick = async () => {
                const eventId = card.dataset.eventId;
                const mem = memories.find(m => m.id === eventId);
                if (mem) {
                  reinforceMemory(mem);
                  scheduleSave();
                  roche.ui.toast('✨ 重要记忆已巩固！');
                  render();
                }
              };
            });
          }

          // ============ 6. 搜索页 ============

          function renderSearch() {
            const results = searchMemories(searchQuery);

            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 20px 24px;">
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="backBtn">←</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8B7E77;">搜索记忆</div>
                  </div>
                  <div style="position: relative;">
                    <input
                      type="text"
                      id="searchInput"
                      placeholder="输入关键词、标签、情绪..."
                      value="${searchQuery}"
                      style="
                        width: 100%;
                        padding: 14px 48px 14px 20px;
                        border: 2px solid rgba(184, 161, 193, 0.2);
                        border-radius: 16px;
                        font-size: 15px;
                        color: #8B7E77;
                        background: white;
                        outline: none;
                        transition: all 0.2s;
                      "
                    />
                    <div style="
                      position: absolute;
                      right: 16px;
                      top: 50%;
                      transform: translateY(-50%);
                      font-size: 20px;
                      color: #B8A1C9;
                    ">🔍</div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 20px 16px;">
                  ${results.length === 0 ? `
                    <div class="mp-empty">
                      <div class="mp-empty-icon">🔍</div>
                      <div class="mp-empty-text">
                        ${searchQuery ? '没有找到相关记忆' : '输入关键词开始搜索'}
                      </div>
                    </div>
                  ` : `
                    <div style="max-width: 800px; margin: 0 auto;">
                      <div style="font-size: 14px; color: #A89A94; margin-bottom: 16px; text-align: center;">
                        找到 ${results.length} 条相关记忆
                      </div>
                      ${results.map((mem, idx) => {
                        const retention = calculateRetention(mem);
                        const emotionInfo = EMOTION_TYPES[mem.emotion];
                        const room = SEVEN_ROOMS[mem.room];
                        const timeAgo = getTimeAgo(mem.timestamp);

                        return `
                          <div class="mp-card mp-fade-in" style="
                            padding: 18px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            animation-delay: ${Math.min(idx * 0.03, 0.5)}s;
                          " data-mem-id="${mem.id}">
                            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                              <span style="
                                padding: 3px 8px;
                                background: ${room.color};
                                color: white;
                                border-radius: 5px;
                                font-size: 10px;
                                font-weight: 600;
                              ">
                                ${room.icon} ${room.name}
                              </span>
                              <span style="font-size: 11px; color: #B8A1C9;">
                                ${timeAgo}
                              </span>
                            </div>
                            <div style="font-size: 14px; color: #8B7E77; line-height: 1.5; margin-bottom: 10px;">
                              ${mem.text}
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                              <span style="
                                padding: 3px 8px;
                                background: ${emotionInfo.color};
                                color: white;
                                border-radius: 5px;
                                font-size: 10px;
                              ">
                                ${emotionInfo.icon} ${emotionInfo.name}
                              </span>
                              <span style="font-size: 11px; font-weight: 600; color: #B8A1C9;">
                                💪 ${(retention * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              </div>
            `;

            container.querySelector('#backBtn').onclick = () => {
              searchQuery = '';
              currentView = 'memoryPalace';
              render();
            };

            const searchInput = container.querySelector('#searchInput');
            searchInput.focus();
            searchInput.oninput = (e) => {
              searchQuery = e.target.value;
              render();
            };

            container.querySelectorAll('[data-mem-id]').forEach(card => {
              card.onclick = async () => {
                const memId = card.dataset.memId;
                const mem = memories.find(m => m.id === memId);
                if (mem) {
                  reinforceMemory(mem);
                  scheduleSave();
                  roche.ui.toast('✨ 记忆已巩固！');
                  render();
                }
              };
            });
          }

          // ============ 7. 遗忘曲线页 ============

          function renderForgettingCurve() {
            const needReview = memories.filter(m => calculateRetention(m) < 0.3).length;
            const avgRetention = memories.length > 0 ?
              memories.reduce((sum, m) => sum + calculateRetention(m), 0) / memories.length : 0;

            container.innerHTML = GLOBAL_STYLES + `
              <div class="mp-app">
                <div class="mp-header" style="padding: 20px 24px;">
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 20px; color: #8B7E77; cursor: pointer;" id="backBtn">←</div>
                    <div style="font-size: 18px; font-weight: 600; color: #8B7E77;">
                      遗忘曲线分析
                    </div>
                  </div>
                </div>

                <div class="mp-content" style="padding: 20px 16px;">
                  <div style="max-width: 800px; margin: 0 auto;">
                    <!-- 统计卡片 -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                      <div class="mp-card" style="padding: 24px; text-align: center;">
                        <div style="font-size: 48px; font-weight: 700; color: #E8B4B8; margin-bottom: 8px;">
                          ${(avgRetention * 100).toFixed(0)}%
                        </div>
                        <div style="font-size: 14px; color: #A89A94;">平均保持率</div>
                      </div>
                      <div class="mp-card" style="padding: 24px; text-align: center;">
                        <div style="font-size: 48px; font-weight: 700; color: #B8A1C9; margin-bottom: 8px;">
                          ${needReview}
                        </div>
                        <div style="font-size: 14px; color: #A89A94;">需要复习</div>
                      </div>
                    </div>

                    <!-- 曲线图 -->
                    <div class="mp-card" style="padding: 28px; margin-bottom: 24px;">
                      <div style="font-size: 18px; font-weight: 600; color: #8B7E77; margin-bottom: 20px;">
                        📈 艾宾浩斯遗忘曲线
                      </div>
                      <div style="font-size: 13px; color: #A89A94; margin-bottom: 24px; line-height: 1.6;">
                        展示记忆随时间的自然衰减过程，基于重要性、情绪和复习次数计算
                      </div>
                      <svg viewBox="0 0 100 100" style="width: 100%; height: 240px;">
                        <defs>
                          <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style="stop-color:#E8B4B8;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#B8A1C9;stop-opacity:1" />
                          </linearGradient>
                        </defs>

                        <!-- 网格线 -->
                        ${[0, 25, 50, 75, 100].map(y => `
                          <line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#E8DDD0" stroke-width="0.4"/>
                        `).join('')}

                        <!-- 坐标轴 -->
                        <line x1="0" y1="100" x2="100" y2="100" stroke="#A89A94" stroke-width="0.5"/>
                        <line x1="0" y1="0" x2="0" y2="100" stroke="#A89A94" stroke-width="0.5"/>

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
                          stroke-width="2.5"
                        />
                      </svg>
                      <div style="
                        display: flex;
                        justify-content: space-between;
                        margin-top: 16px;
                        font-size: 12px;
                        color: #A89A94;
                      ">
                        <span>今天</span>
                        <span>7天</span>
                        <span>14天</span>
                        <span>21天</span>
                        <span>30天</span>
                      </div>
                    </div>

                    <!-- 房间分布 -->
                    <div class="mp-card" style="padding: 28px;">
                      <div style="font-size: 18px; font-weight: 600; color: #8B7E77; margin-bottom: 20px;">
                        🏠 房间记忆分布
                      </div>
                      ${Object.values(SEVEN_ROOMS).map(room => {
                        const count = getMemoriesByRoom(room.id).length;
                        const percent = memories.length > 0 ? (count / memories.length * 100).toFixed(1) : 0;
                        return `
                          <div style="margin-bottom: 20px;">
                            <div style="
                              display: flex;
                              align-items: center;
                              justify-content: space-between;
                              margin-bottom: 10px;
                            ">
                              <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 16px;">${room.icon}</span>
                                <span style="font-size: 14px; color: #8B7E77; font-weight: 500;">
                                  ${room.name}
                                </span>
                              </div>
                              <span style="font-size: 13px; color: #A89A94;">
                                ${count} (${percent}%)
                              </span>
                            </div>
                            <div style="
                              height: 10px;
                              background: rgba(184, 165, 161, 0.1);
                              border-radius: 5px;
                              overflow: hidden;
                            ">
                              <div style="
                                width: ${percent}%;
                                height: 100%;
                                background: ${room.color};
                                transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                              "></div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                </div>
              </div>
            `;

            container.querySelector('#backBtn').onclick = () => {
              currentView = 'memoryPalace';
              render();
            };
          }

          await loadConversations();
          render();
        },
        async unmount(container) {
          // 关闭窗口前保存所有记忆元数据
          scheduleSave();
          container.replaceChildren();
        }
      }
    ]
  });
})();
