(function () {
  "use strict";

  const PLUGIN_ID = "memory-palace";
  const PLUGIN_VERSION = "9.1.1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const AUTO_SAVE_KEY = "memoryPalaceMeta:";
  const STATE_KEY = "memoryPalaceState:";
  const EMBEDDING_KEY = "memoryPalaceEmbeddingConfig";
  const CHAT_MEMORY_KEY = "memoryPalaceChatEnabled";
  const HOST_OVERLAP_LIMIT = 8;
  const CHAT_CONTEXT_LIMIT = 8;
  const CHAT_MEMORY_READ_LIMIT = 400;
  const CHAT_CONTEXT_TIMEOUT_MS = 900;
  const CHAT_CONTEXT_CHAR_BUDGET = 1800;
  const CHAT_INDEX_TIMEOUT_MS = 3000;
  const CHAT_BUNDLE_TTL_MS = 45 * 1000;
  const CHAT_EMPTY_BUNDLE_TTL_MS = 5 * 1000;
  const CHAT_SETTING_TTL_MS = 15 * 1000;
  const EMBEDDING_TIMEOUT_MS = 2500;
  const DELETE_RETENTION_THRESHOLD = 0.1;
  const DELETE_IMPORTANCE_THRESHOLD = 3;
  const ROOM_ORDER = [
    "livingRoom",
    "bedroom",
    "study",
    "userRoom",
    "selfRoom",
    "attic",
    "windowSill"
  ];

  let activeRocheApi = null;
  let activeMountCleanup = null;
  const embeddingCache = new Map();
  const embeddingRequests = new Map();
  const chatBundleCache = new Map();
  const chatBundleRequests = new Map();
  const chatWarmupRequests = new Map();
  const chatSettingCache = new Map();
  const automaticRecallQueue = new Map();
  const automaticRecallTimers = new Map();

  const ROOM_RULES = Object.freeze({
    livingRoom: {
      name: "客厅",
      subtitle: "日常闲聊、近期互动",
      brain: "海马体",
      icon: "chat",
      accent: "#9B8EAA",
      soft: "#E9E3ED",
      baseStability: 2.5,
      capacity: 200,
      decay: true,
      permanent: false
    },
    bedroom: {
      name: "卧室",
      subtitle: "亲密情感、深层羁绊",
      brain: "新皮层",
      icon: "heart",
      accent: "#B68591",
      soft: "#F1E2E4",
      baseStability: 24,
      capacity: 5000,
      decay: true,
      permanent: false
    },
    study: {
      name: "书房",
      subtitle: "工作学习、技能成长",
      brain: "前额叶",
      icon: "book",
      accent: "#7C9AA5",
      soft: "#DDE9EB",
      baseStability: 14,
      capacity: 5000,
      decay: true,
      permanent: false
    },
    userRoom: {
      name: "User 的房间",
      subtitle: "用户个人信息、习惯",
      brain: "颞顶联合区",
      icon: "user",
      accent: "#A18F77",
      soft: "#EEE8DD",
      baseStability: 45,
      capacity: 5000,
      decay: true,
      permanent: false
    },
    selfRoom: {
      name: "自我房间",
      subtitle: "角色自我认同、演变",
      brain: "默认模式网络",
      icon: "spark",
      accent: "#8D8FA8",
      soft: "#E5E5EF",
      baseStability: Infinity,
      capacity: 5000,
      decay: false,
      permanent: true
    },
    attic: {
      name: "阁楼",
      subtitle: "未消化的困惑、潜意识",
      brain: "杏仁核 · 海马",
      icon: "moon",
      accent: "#8D827D",
      soft: "#E9E4E1",
      baseStability: Infinity,
      capacity: 5000,
      decay: false,
      permanent: true
    },
    windowSill: {
      name: "窗台",
      subtitle: "期盼、目标、未来憧憬",
      brain: "多巴胺奖赏系统",
      icon: "star",
      accent: "#B59A69",
      soft: "#F1E9D7",
      baseStability: 18,
      capacity: 5000,
      decay: true,
      permanent: false
    }
  });

  const EMOTION_RULES = [
    { label: "委屈", cues: ["委屈", "不公平", "被忽视", "嫌我烦", "难受"] },
    { label: "难过", cues: ["难过", "伤心", "哭", "失落", "想哭"] },
    { label: "焦虑", cues: ["焦虑", "担心", "害怕", "压力", "紧张", "睡不着"] },
    { label: "生气", cues: ["生气", "气死", "愤怒", "讨厌", "烦死"] },
    { label: "开心", cues: ["开心", "高兴", "快乐", "哈哈", "喜欢", "期待"] },
    { label: "疲惫", cues: ["累", "疲惫", "加班", "困", "不想动", "睡觉"] },
    { label: "平静", cues: ["平静", "还好", "没事", "日常"] }
  ];

  const PERSONALITY_PROFILES = Object.freeze({
    emotional: {
      name: "情感型",
      weights: { emotion: 1, person: 0.6, time: 0.35, cause: 0.45, image: 0.9 },
      cues: ["感性", "情感", "敏感", "温柔", "共情", "emotional", "feeling"]
    },
    narrative: {
      name: "叙事型",
      weights: { emotion: 0.5, person: 0.8, time: 1, cause: 0.65, image: 0.45 },
      cues: ["叙事", "故事", "时间线", "经历", "narrative", "story"]
    },
    imagistic: {
      name: "意象型",
      weights: { emotion: 0.8, person: 0.55, time: 0.4, cause: 0.45, image: 1 },
      cues: ["意象", "画面", "诗意", "浪漫", "imagistic", "visual", "image"]
    },
    analytical: {
      name: "分析型",
      weights: { emotion: 0.3, person: 0.55, time: 0.4, cause: 1, image: 0.35 },
      cues: ["理性", "分析", "逻辑", "因果", "严谨", "analytical", "logic"]
    }
  });

  const ICONS = {
    arrow: '<path d="M19 12H5m7 7-7-7 7-7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/>',
    chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.8 4v-4.2a2.5 2.5 0 0 1-2.2-2.5v-6.8Z"/><path d="M8 8h8M8 11h5"/>',
    heart: '<path d="M20.8 8.8c0 5.2-8.8 10-8.8 10S3.2 14 3.2 8.8A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.4Z"/>',
    book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19M9 6h6M9 9h6"/>',
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
    spark: '<path d="m12 2 1.3 6.7L20 10l-6.7 1.3L12 18l-1.3-6.7L4 10l6.7-1.3L12 2ZM19 17l.6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z"/>',
    moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
    star: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3Z"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4M17 3v4M3.5 9h17M8 13h3M13 13h3M8 17h3"/>',
    curve: '<path d="M3 18c3-7 5-8 8-8 3.3 0 3.7 5 7 5 1.2 0 2.3-.8 3-2.2"/><path d="M3 21h18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4L4 9"/><path d="M4 4v5h5M4 13a8 8 0 0 0 14.6 4L20 15"/><path d="M20 20v-5h-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/>'
  };

  function getSvgIcon(name, size) {
    const icon = ICONS[name] || ICONS.spark;
    const px = size || 18;
    return '<svg class="mp-icon" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + "</svg>";
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(max, Math.max(min, number));
  }

  function toArray(value) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }

  function unique(values) {
    return Array.from(new Set(values.filter(function (value) {
      return value !== undefined && value !== null && value !== "";
    })));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function truncate(value, length) {
    const text = String(value == null ? "" : value);
    return text.length > length ? text.slice(0, length) + "…" : text;
  }

  function formatDate(value, withTime) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) {
      return "未知时间";
    }
    const options = withTime
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" };
    return new Intl.DateTimeFormat("zh-CN", options).format(date);
  }

  function normalizeTimestamp(value, fallback) {
    if (typeof value === "number") {
      return value < 100000000000 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback || Date.now();
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function makeId(prefix, seed) {
    const suffix = seed ? hashString(seed) : Math.random().toString(36).slice(2, 10);
    return prefix + "_" + suffix + "_" + Date.now().toString(36);
  }

  function getHostApi() {
    if (activeRocheApi) {
      return activeRocheApi;
    }
    if (typeof window !== "undefined" && window.Roche) {
      return window.Roche;
    }
    return null;
  }

  function settleWithTimeout(promise, timeoutMs, fallback) {
    const duration = Math.max(0, Number(timeoutMs) || 0);
    if (!duration) {
      return Promise.resolve(promise).catch(function () {
        return fallback;
      });
    }
    return new Promise(function (resolve) {
      let settled = false;
      let timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve(fallback);
        }
      }, duration);
      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
      Promise.resolve(promise).then(finish, function () {
        finish(fallback);
      });
    });
  }

  async function storageGet(api, key, fallback) {
    try {
      if (!api || !api.storage || typeof api.storage.get !== "function") {
        return fallback;
      }
      const value = await api.storage.get(key);
      return value === undefined || value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  async function storageSet(api, key, value) {
    if (!api || !api.storage || typeof api.storage.set !== "function") {
      return false;
    }
    try {
      await api.storage.set(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalizeRoomId(room) {
    if (ROOM_RULES[room]) {
      return room;
    }
    const aliases = {
      living: "livingRoom",
      livingroom: "livingRoom",
      bedroom: "bedroom",
      study: "study",
      user: "userRoom",
      userroom: "userRoom",
      self: "selfRoom",
      attic: "attic",
      windowsill: "windowSill",
      window: "windowSill"
    };
    return aliases[String(room || "").replace(/\s+/g, "").toLowerCase()] || null;
  }

  function extractText(record) {
    if (record == null) {
      return "";
    }
    if (typeof record === "string") {
      return record.trim();
    }
    const candidates = [
      record.summaryText,
      record.summary,
      record.action,
      record.text,
      record.content,
      record.description,
      record.value,
      record.title
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      if (typeof candidates[index] === "string" && candidates[index].trim()) {
        return candidates[index].trim();
      }
    }
    return "";
  }

  function extractEmbedding(record) {
    if (!record || typeof record !== "object") {
      return null;
    }
    const candidates = [
      record.embedding,
      record.vector,
      record.values,
      record.embeddingVector,
      record.metadata && record.metadata.embedding
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      if (Array.isArray(candidates[index]) && candidates[index].length > 4) {
        const values = candidates[index].map(Number);
        if (values.every(function (value) { return Number.isFinite(value); })) {
          return values;
        }
      }
    }
    return null;
  }

  function tokenize(text) {
    const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ");
    const tokens = [];
    const latin = normalized.match(/[a-z0-9_]+/g) || [];
    latin.forEach(function (token) {
      tokens.push(token);
    });
    const han = normalized.match(/[\u4e00-\u9fff]/g) || [];
    han.forEach(function (char) {
      tokens.push(char);
    });
    for (let index = 0; index < han.length - 1; index += 1) {
      tokens.push(han[index] + han[index + 1]);
    }
    for (let index = 0; index < han.length - 2; index += 1) {
      tokens.push(han[index] + han[index + 1] + han[index + 2]);
    }
    return unique(tokens);
  }

  function tokenSet(text) {
    return new Set(tokenize(text));
  }

  function jaccardSimilarity(first, second) {
    const a = first instanceof Set ? first : tokenSet(first);
    const b = second instanceof Set ? second : tokenSet(second);
    if (!a.size || !b.size) {
      return 0;
    }
    let intersection = 0;
    a.forEach(function (token) {
      if (b.has(token)) {
        intersection += 1;
      }
    });
    return intersection / (a.size + b.size - intersection);
  }

  function hashedEmbedding(text, dimensions) {
    const size = dimensions || 96;
    const vector = new Array(size).fill(0);
    tokenize(text).forEach(function (token) {
      const hash = parseInt(hashString(token), 36) || 0;
      const index = hash % size;
      vector[index] += 1;
      vector[(index * 13 + 7) % size] += token.length > 1 ? 0.45 : 0.18;
    });
    let norm = 0;
    vector.forEach(function (value) {
      norm += value * value;
    });
    norm = Math.sqrt(norm);
    return norm ? vector.map(function (value) { return value / norm; }) : vector;
  }

  function cosineSimilarity(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length || !first.length) {
      return 0;
    }
    let dot = 0;
    let firstNorm = 0;
    let secondNorm = 0;
    for (let index = 0; index < first.length; index += 1) {
      const a = Number(first[index]) || 0;
      const b = Number(second[index]) || 0;
      dot += a * b;
      firstNorm += a * a;
      secondNorm += b * b;
    }
    if (!firstNorm || !secondNorm) {
      return 0;
    }
    return clamp(dot / Math.sqrt(firstNorm * secondNorm), -1, 1);
  }

  function detectEmotion(text) {
    const source = String(text || "");
    let best = { label: "平静", intensity: 0.15, hits: [] };
    EMOTION_RULES.forEach(function (rule) {
      const hits = rule.cues.filter(function (cue) {
        return source.toLowerCase().indexOf(cue.toLowerCase()) >= 0;
      });
      if (hits.length > best.hits.length) {
        best = {
          label: rule.label,
          intensity: clamp(0.35 + hits.length * 0.18 + (source.length > 35 ? 0.08 : 0), 0.1, 1),
          hits: hits
        };
      }
    });
    return best;
  }

  function normalizeEmotion(value) {
    const aliases = {
      hurt: "委屈",
      joy: "开心",
      sadness: "难过",
      anger: "生气",
      fear: "焦虑",
      anxiety: "焦虑",
      warmth: "温暖",
      neutral: "平静"
    };
    return aliases[String(value || "").toLowerCase()] || String(value || "平静");
  }

  function inferPersonality(persona) {
    const text = String(persona || "").toLowerCase();
    let best = "emotional";
    let bestScore = 0;
    Object.keys(PERSONALITY_PROFILES).forEach(function (key) {
      const score = PERSONALITY_PROFILES[key].cues.reduce(function (total, cue) {
        return total + (text.indexOf(cue.toLowerCase()) >= 0 ? 1 : 0);
      }, 0);
      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    });
    return {
      key: best,
      name: PERSONALITY_PROFILES[best].name,
      weights: PERSONALITY_PROFILES[best].weights,
      confidence: bestScore
    };
  }

  function classifyRoom(text, kind) {
    if (kind === "core") {
      return "selfRoom";
    }
    const source = String(text || "");
    const rules = [
      ["windowSill", ["希望", "想要", "下次", "以后", "梦想", "目标", "一起去", "期待", "计划"]],
      ["userRoom", ["我喜欢", "我不喜欢", "习惯", "偏好", "生日", "雷点", "用户", "我的名字", "我的工作"]],
      ["selfRoom", ["我是", "我是谁", "身份", "原则", "性格", "成长", "决定成为", "自我"]],
      ["attic", ["困惑", "不确定", "心结", "创伤", "害怕失去", "后悔", "没想通", "介意"]],
      ["study", ["学习", "教你", "概念", "代码", "知识", "工作", "项目", "技能", "方法", "解释"]],
      ["bedroom", ["爱", "喜欢你", "想你", "抱", "亲密", "陪着", "依赖", "关系", "心动", "哭"]],
      ["livingRoom", ["今天", "刚刚", "聊天", "吃饭", "晚上", "早上", "加班", "日常"]]
    ];
    for (let index = 0; index < rules.length; index += 1) {
      if (rules[index][1].some(function (cue) { return source.indexOf(cue) >= 0; })) {
        return rules[index][0];
      }
    }
    return "livingRoom";
  }

  function estimateImportance(text, kind) {
    if (kind === "core") {
      return 10;
    }
    const source = String(text || "");
    let score = 3;
    if (source.length > 60) {
      score += 1;
    }
    if (/[爱想念承诺重要第一次永远不能忘记]/.test(source)) {
      score += 2;
    }
    if (/[困惑创伤后悔害怕失去]/.test(source)) {
      score += 2;
    }
    if (/[我的名字生日工作习惯喜欢不喜欢]/.test(source)) {
      score += 2;
    }
    if (kind === "vector") {
      score += 0.5;
    }
    return clamp(score, 1, 10);
  }

  function roomBaseline(roomId) {
    return ROOM_RULES[roomId] ? ROOM_RULES[roomId].baseStability : ROOM_RULES.livingRoom.baseStability;
  }

  function memoryStability(memory) {
    const room = normalizeRoomId(memory && memory.room) || "livingRoom";
    const rule = ROOM_RULES[room];
    if (!rule || !rule.decay || rule.permanent) {
      return Infinity;
    }
    const importance = clamp(memory && memory.importance, 1, 10);
    const intensity = clamp(memory && memory.emotionIntensity, 0, 1);
    const reviews = clamp(memory && memory.reviewCount, 0, 100);
    const stored = Number(memory && memory.stability);
    const derived = roomBaseline(room) + importance * 1.35 + intensity * 8 + reviews * 1.8;
    return Math.max(1, Number.isFinite(stored) && stored > 0 ? stored : derived);
  }

  function retentionAt(memory, futureDays) {
    const room = normalizeRoomId(memory && memory.room) || "livingRoom";
    const rule = ROOM_RULES[room];
    if (!rule || rule.permanent || !rule.decay) {
      return 1;
    }
    const anchor = normalizeTimestamp(memory && (memory.lastRecall || memory.timestamp), Date.now());
    const elapsed = Math.max(0, (Date.now() + (futureDays || 0) * DAY_MS - anchor) / DAY_MS);
    return clamp(Math.exp(-elapsed / memoryStability(memory)), 0, 1);
  }

  function nextReviewAt(memory) {
    const room = normalizeRoomId(memory && memory.room) || "livingRoom";
    if (!ROOM_RULES[room].decay || ROOM_RULES[room].permanent) {
      return null;
    }
    const stability = memoryStability(memory);
    const interval = Math.max(1, -stability * Math.log(0.38));
    const anchor = normalizeTimestamp(memory && (memory.lastRecall || memory.timestamp), Date.now());
    return anchor + interval * DAY_MS;
  }

  function isDue(memory) {
    const next = memory && memory.nextReviewAt ? Number(memory.nextReviewAt) : nextReviewAt(memory);
    return Boolean(next && next <= Date.now());
  }

  function isDeleteEligible(memory) {
    const room = ROOM_RULES[normalizeRoomId(memory && memory.room) || "livingRoom"];
    return Boolean(
      memory &&
      !memory.synthetic &&
      room &&
      room.decay &&
      !memory.anchor &&
      retentionAt(memory, 0) <= DELETE_RETENTION_THRESHOLD &&
      Number(memory.importance) <= DELETE_IMPORTANCE_THRESHOLD
    );
  }

  function reinforceMemory(memory, quality) {
    if (!memory || memory.synthetic) {
      return memory;
    }
    const multiplier = {
      again: 0.65,
      hard: 1.15,
      good: 1.8,
      easy: 2.45
    }[quality || "good"] || 1.8;
    memory.lastRecall = Date.now();
    memory.reviewCount = clamp((Number(memory.reviewCount) || 0) + 1, 0, 999);
    memory.accessCount = clamp((Number(memory.accessCount) || 0) + 1, 0, 9999);
    const current = memoryStability(memory);
    memory.stability = clamp(current * multiplier, 1, 3650);
    memory.nextReviewAt = nextReviewAt(memory);
    memory.retention = retentionAt(memory, 0);
    return memory;
  }

  function calculateRetention(memory) {
    return retentionAt(memory, 0);
  }

  function relationObjects(memory) {
    return toArray(memory && memory.relations).map(function (relation) {
      if (typeof relation === "string") {
        return { id: relation, weight: 0.35, kind: "semantic" };
      }
      return {
        id: relation && relation.id,
        weight: clamp(relation && relation.weight, 0, 1) || 0.35,
        kind: relation && relation.kind || "semantic"
      };
    }).filter(function (relation) { return relation.id; });
  }

  function relationKind(first, second) {
    if (first.emotion && first.emotion === second.emotion) {
      return "emotion";
    }
    if (Math.abs(first.timestamp - second.timestamp) <= 3 * DAY_MS) {
      return "temporal";
    }
    if (first.room === second.room) {
      return "room";
    }
    if (/[因为所以后来结果答应决定]/.test(first.text + second.text)) {
      return "cause";
    }
    return "semantic";
  }

  function relationScore(first, second) {
    const textScore = jaccardSimilarity(first.tokens, second.tokens);
    const vectorScore = cosineSimilarity(first.localVector, second.localVector);
    const semantic = clamp(vectorScore * 0.55 + textScore * 0.45, 0, 1);
    const emotion = first.emotion && first.emotion === second.emotion ? 1 : 0;
    const room = first.room === second.room ? 1 : 0;
    const days = Math.abs(first.timestamp - second.timestamp) / DAY_MS;
    const temporal = Math.exp(-days / 30);
    return clamp(semantic * 0.55 + emotion * 0.15 + room * 0.1 + temporal * 0.2, 0, 1);
  }

  function buildRelationGraph(memories) {
    const graph = {};
    const index = new Map();
    const emotionIndex = new Map();
    const byId = new Map();
    memories.forEach(function (memory) {
      graph[memory.id] = relationObjects(memory).slice(0, 6);
      byId.set(memory.id, memory);
      memory.tokens = memory.tokens || tokenize(memory.text);
      memory.localVector = memory.localVector || hashedEmbedding(memory.text);
      if (memory.emotion) {
        if (!emotionIndex.has(memory.emotion)) {
          emotionIndex.set(memory.emotion, []);
        }
        emotionIndex.get(memory.emotion).push(memory);
      }
      memory.tokens.forEach(function (token) {
        if (!index.has(token)) {
          index.set(token, new Set());
        }
        index.get(token).add(memory.id);
      });
    });
    memories.forEach(function (memory) {
      const candidates = new Set();
      memory.tokens.forEach(function (token) {
        const ids = index.get(token);
        if (ids) {
          ids.forEach(function (id) {
            if (id !== memory.id) {
              candidates.add(id);
            }
          });
        }
      });
      (emotionIndex.get(memory.emotion) || []).forEach(function (other) {
        if (other.id !== memory.id && Math.abs(other.timestamp - memory.timestamp) < 60 * DAY_MS) {
          candidates.add(other.id);
        }
      });
      const candidatesWithScores = Array.from(candidates).map(function (id) {
        const other = byId.get(id);
        return {
          id: id,
          weight: relationScore(memory, other),
          kind: relationKind(memory, other)
        };
      }).filter(function (relation) {
        return relation.weight >= 0.18;
      }).sort(function (a, b) {
        return b.weight - a.weight;
      }).slice(0, 6);
      const existing = new Map(graph[memory.id].map(function (relation) {
        return [relation.id, relation];
      }));
      candidatesWithScores.forEach(function (relation) {
        const old = existing.get(relation.id);
        if (!old || relation.weight > old.weight) {
          existing.set(relation.id, relation);
        }
      });
      graph[memory.id] = Array.from(existing.values()).sort(function (a, b) {
        return b.weight - a.weight;
      }).slice(0, 6);
    });
    Object.keys(graph).forEach(function (id) {
      graph[id].forEach(function (relation) {
        if (!graph[relation.id]) {
          graph[relation.id] = [];
        }
        const reverse = graph[relation.id].find(function (item) { return item.id === id; });
        if (!reverse) {
          graph[relation.id].push({ id: id, weight: relation.weight * 0.92, kind: relation.kind });
          graph[relation.id] = graph[relation.id].sort(function (a, b) {
            return b.weight - a.weight;
          }).slice(0, 6);
        }
      });
    });
    return graph;
  }

  function findRelatedMemories(memory, memories, limit) {
    const byId = new Map(memories.map(function (item) { return [item.id, item]; }));
    const max = limit || 4;
    const relations = relationObjects(memory).map(function (relation) {
      return {
        memory: byId.get(relation.id),
        weight: relation.weight,
        kind: relation.kind
      };
    }).filter(function (item) {
      return item.memory;
    });
    if (relations.length >= max) {
      return relations.slice(0, max);
    }
    const existing = new Set(relations.map(function (item) { return item.memory.id; }));
    memories.filter(function (item) {
      return item.id !== memory.id && !existing.has(item.id);
    }).map(function (item) {
      return { memory: item, weight: relationScore(memory, item), kind: relationKind(memory, item) };
    }).filter(function (item) {
      return item.weight >= 0.2;
    }).sort(function (a, b) {
      return b.weight - a.weight;
    }).slice(0, Math.max(0, max - relations.length)).forEach(function (item) {
      relations.push(item);
    });
    return relations.slice(0, max);
  }

  function diffusionActivate(seeds, memories, personality) {
    const byId = new Map(memories.map(function (memory) { return [memory.id, memory]; }));
    const profile = PERSONALITY_PROFILES[personality && personality.key || "emotional"];
    const result = new Map();
    const frontier = [];
    seeds.forEach(function (entry) {
      if (!entry || !entry.memory) {
        return;
      }
      const score = Number(entry.score) || 0;
      result.set(entry.memory.id, Object.assign({}, entry, { score: score, hop: 0 }));
      frontier.push({ id: entry.memory.id, score: score, hop: 0 });
    });
    for (let hop = 1; hop <= 2; hop += 1) {
      const current = frontier.filter(function (item) { return item.hop === hop - 1; });
      current.forEach(function (parent) {
        const source = byId.get(parent.id);
        if (!source) {
          return;
        }
        findRelatedMemories(source, memories, 6).forEach(function (relation) {
          let preference = 0.55;
          if (relation.kind === "emotion") {
            preference += profile.weights.emotion * 0.22;
          } else if (relation.kind === "temporal") {
            preference += profile.weights.time * 0.18;
          } else if (relation.kind === "cause") {
            preference += profile.weights.cause * 0.2;
          } else {
            preference += profile.weights.image * 0.12;
          }
          const score = parent.score * relation.weight * preference * 0.7;
          const old = result.get(relation.memory.id);
          if (!old || score > old.score) {
            const entry = {
              memory: relation.memory,
              score: score,
              hop: hop,
              via: parent.id,
              diffusionKind: relation.kind
            };
            result.set(relation.memory.id, entry);
            frontier.push({ id: relation.memory.id, score: score, hop: hop });
          }
        });
      });
    }
    return Array.from(result.values()).sort(function (a, b) {
      return b.score - a.score;
    });
  }

  function applyEmotionPriming(entries, emotion) {
    const current = emotion && emotion.label;
    return entries.map(function (entry) {
      const memoryEmotion = entry.memory && entry.memory.emotion;
      let multiplier = 1;
      if (current && current !== "平静" && memoryEmotion === current) {
        multiplier = 1.3;
      } else if (current && current !== "平静" && memoryEmotion && memoryEmotion !== "平静") {
        multiplier = 1.03;
      }
      return Object.assign({}, entry, {
        score: clamp(entry.score * multiplier, 0, 1.5),
        emotionPrimed: multiplier > 1.1
      });
    }).sort(function (a, b) {
      return b.score - a.score;
    });
  }

  function checkRumination(entries, memories, options) {
    const settings = options || {};
    const random = typeof settings.random === "function" ? settings.random : Math.random;
    const tendency = clamp(settings.tendency === undefined ? 0.3 : settings.tendency, 0, 1);
    const probability = tendency * 0.2;
    if (random() >= probability) {
      return entries;
    }
    const selected = new Set(entries.map(function (entry) { return entry.memory.id; }));
    const attic = memories.filter(function (memory) {
      return memory.room === "attic" && !selected.has(memory.id);
    }).sort(function (a, b) {
      return b.importance - a.importance;
    });
    if (!attic.length) {
      return entries;
    }
    return entries.concat([{
      memory: attic[0],
      score: 0.28,
      hop: 0,
      intrusive: true,
      diffusionKind: "rumination"
    }]);
  }

  function calculateBm25Scores(query, memories) {
    const queryTokens = tokenize(query);
    const scores = new Map();
    if (!queryTokens.length || !memories.length) {
      return scores;
    }
    const documents = memories.map(function (memory) {
      return memory.tokens || tokenize(memory.text);
    });
    const documentFrequency = new Map();
    documents.forEach(function (tokens) {
      new Set(tokens).forEach(function (token) {
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      });
    });
    const averageLength = documents.reduce(function (total, tokens) {
      return total + tokens.length;
    }, 0) / Math.max(1, documents.length);
    const k1 = 1.2;
    const b = 0.75;
    memories.forEach(function (memory, documentIndex) {
      const tokens = documents[documentIndex];
      const frequencies = new Map();
      tokens.forEach(function (token) {
        frequencies.set(token, (frequencies.get(token) || 0) + 1);
      });
      let score = 0;
      queryTokens.forEach(function (token) {
        const frequency = frequencies.get(token) || 0;
        if (!frequency) {
          return;
        }
        const df = documentFrequency.get(token) || 0;
        const idf = Math.log(1 + (memories.length - df + 0.5) / (df + 0.5));
        score += idf * (frequency * (k1 + 1)) / (
          frequency + k1 * (1 - b + b * tokens.length / Math.max(1, averageLength))
        );
      });
      scores.set(memory.id, score);
    });
    const max = Math.max.apply(null, Array.from(scores.values()).concat([0]));
    scores.forEach(function (value, key) {
      scores.set(key, max ? clamp(value / max, 0, 1) : 0);
    });
    return scores;
  }

  function rankMemories(query, memories, options) {
    const settings = options || {};
    const source = String(query || "").trim();
    if (!source || !memories.length) {
      return [];
    }
    const queryVector = settings.queryVector || hashedEmbedding(source);
    const localQueryVector = hashedEmbedding(source);
    const bm25Scores = calculateBm25Scores(source, memories);
    const hostScores = settings.hostScores || new Map();
    const ranked = memories.map(function (memory) {
      const hasExternalPair = Boolean(settings.queryVector && memory.embedding && memory.embedding.length === queryVector.length);
      const semanticVector = hasExternalPair
        ? cosineSimilarity(queryVector, memory.embedding)
        : cosineSimilarity(localQueryVector, memory.localVector || hashedEmbedding(memory.text));
      const semantic = clamp(semanticVector, 0, 1);
      const lexical = Math.max(bm25Scores.get(memory.id) || 0, hostScores.get(memory.id) || 0);
      const score = semantic * 0.85 + lexical * 0.15;
      return {
        memory: memory,
        score: score,
        semanticScore: semantic,
        bm25Score: lexical,
        retrievalMode: hasExternalPair ? "vector" : "local-semantic"
      };
    }).filter(function (entry) {
      return entry.semanticScore > 0.22 || entry.bm25Score > 0;
    }).sort(function (a, b) {
      return b.score - a.score;
    });
    return ranked;
  }

  function hostResultText(result) {
    if (!result) {
      return "";
    }
    return extractText(result.item || result.memory || result);
  }

  function hostResultRecord(result) {
    return result && (result.item || result.memory || result);
  }

  function normalizeHostResults(results, conversationId, metadata) {
    const longTerm = {
      core: [],
      facts: [],
      vectors: []
    };
    toArray(results).forEach(function (result) {
      const raw = hostResultRecord(result);
      if (!raw || !extractText(raw)) {
        return;
      }
      const kind = hostResultKind(result);
      if (kind !== "core" && kind !== "fact" && kind !== "facts" && kind !== "vector") {
        return;
      }
      let record = raw;
      const id = hostResultId(result);
      const vector = extractEmbedding(raw) || extractEmbedding(result);
      if (record && typeof record === "object" && id && !record.id) {
        record = Object.assign({}, record, { id: id });
      }
      if (record && typeof record === "object" && vector && !extractEmbedding(record)) {
        record = Object.assign({}, record, { embedding: vector });
      }
      if (kind === "core") {
        longTerm.core.push(record);
      } else if (kind === "fact" || kind === "facts") {
        longTerm.facts.push(record);
      } else {
        longTerm.vectors.push(record);
      }
    });
    return normalizeMemories(longTerm, metadata || {}, conversationId);
  }

  function mergeMemoryLists(primary, additions) {
    const merged = toArray(primary).slice();
    const byId = new Map();
    const bySignature = new Map();
    merged.forEach(function (memory) {
      byId.set(String(memory.id), memory);
      const signature = memoryTextSignature(memory.text);
      if (signature) {
        bySignature.set(signature, memory);
      }
    });
    toArray(additions).forEach(function (memory) {
      if (!memory) {
        return;
      }
      const existing = byId.get(String(memory.id)) || bySignature.get(memoryTextSignature(memory.text));
      if (existing) {
        if (!existing.embedding && memory.embedding) {
          existing.embedding = memory.embedding;
        }
        return;
      }
      merged.push(memory);
      byId.set(String(memory.id), memory);
      const signature = memoryTextSignature(memory.text);
      if (signature) {
        bySignature.set(signature, memory);
      }
    });
    return merged.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
  }

  function memoryTextSignature(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, "").replace(/[^\w\u4e00-\u9fff]/g, "");
  }

  function dedupeEntries(entries, excludedIds, excludedSignatures) {
    const blockedIds = new Set(toArray(excludedIds).map(function (id) { return String(id); }));
    const blockedSignatures = new Set(toArray(excludedSignatures).filter(Boolean));
    const seenIds = new Set();
    const seenSignatures = new Set();
    const uniqueEntries = [];
    toArray(entries).forEach(function (entry) {
      const memory = entry && entry.memory;
      if (!memory) {
        return;
      }
      const id = String(memory.id || "");
      const signature = memoryTextSignature(memory.text);
      if ((id && blockedIds.has(id)) || (signature && blockedSignatures.has(signature))) {
        return;
      }
      if ((id && seenIds.has(id)) || (signature && seenSignatures.has(signature))) {
        return;
      }
      if (id) {
        seenIds.add(id);
      }
      if (signature) {
        seenSignatures.add(signature);
      }
      uniqueEntries.push(entry);
    });
    return uniqueEntries;
  }

  function hostResultId(result) {
    const item = result && (result.item || result.memory || result);
    return item && item.id ? String(item.id) : result && result.id ? String(result.id) : "";
  }

  function hostResultKind(result) {
    const item = result && (result.item || result.memory || result);
    return String(result && (result.kind || result.type) || item && (item.kind || item.type) || "").toLowerCase();
  }

  async function callHostSearch(api, conversationId, query, limit, timeoutMs) {
    if (!api || !api.memory || typeof api.memory.search !== "function" || !query) {
      return [];
    }
    try {
      const request = api.memory.search({
        conversationId: conversationId,
        query: query,
        limit: limit || 80
      });
      const response = await settleWithTimeout(request, timeoutMs || 2500, []);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      return [];
    }
  }

  async function requestEmbedding(text, config) {
    if (!config || !config.enabled || !config.endpoint || typeof fetch !== "function" || !text) {
      return null;
    }
    const cacheKey = config.endpoint + "|" + (config.model || "") + "|" + text;
    if (embeddingCache.has(cacheKey)) {
      return embeddingCache.get(cacheKey);
    }
    if (embeddingRequests.has(cacheKey)) {
      return embeddingRequests.get(cacheKey);
    }
    const request = (async function () {
      let controller = null;
      let timer = null;
      try {
        const headers = { "Content-Type": "application/json" };
        if (config.apiKey) {
          headers.Authorization = "Bearer " + config.apiKey;
        }
        if (typeof AbortController === "function") {
          controller = new AbortController();
          timer = setTimeout(function () {
            controller.abort();
          }, EMBEDDING_TIMEOUT_MS);
        }
        const requestOptions = {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: config.model || "text-embedding-3-small",
            input: text
          })
        };
        if (controller) {
          requestOptions.signal = controller.signal;
        }
        const response = await fetch(config.endpoint, requestOptions);
        if (!response.ok) {
          return null;
        }
        const payload = await response.json();
        const vector = payload && payload.data && payload.data[0] && payload.data[0].embedding
          || payload && payload.embedding
          || payload && payload.vector;
        if (!Array.isArray(vector) || vector.length < 8) {
          return null;
        }
        const normalized = vector.map(Number);
        if (normalized.some(function (value) { return !Number.isFinite(value); })) {
          return null;
        }
        if (embeddingCache.size > 64) {
          embeddingCache.delete(embeddingCache.keys().next().value);
        }
        embeddingCache.set(cacheKey, normalized);
        return normalized;
      } catch (error) {
        return null;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    })();
    embeddingRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (embeddingRequests.get(cacheKey) === request) {
        embeddingRequests.delete(cacheKey);
      }
    }
  }

  function resolveEmbeddingModelsEndpoint(endpoint, modelsEndpoint) {
    const source = String(endpoint || "").trim();
    const explicit = String(modelsEndpoint || "").trim();
    if (!source && !explicit) {
      return "";
    }
    try {
      if (explicit) {
        const base = source || (typeof window !== "undefined" && window.location && window.location.href) || "http://localhost/";
        return new URL(explicit, base).toString();
      }
      const url = new URL(source);
      const pathname = url.pathname.replace(/\/+$/, "");
      if (/\/api\/embeddings$/i.test(pathname)) {
        url.pathname = pathname.replace(/\/embeddings$/i, "/tags");
      } else if (/\/(embeddings|embed)$/i.test(pathname)) {
        url.pathname = pathname.replace(/\/(embeddings|embed)$/i, "/models");
      } else if (!/\/models$/i.test(pathname)) {
        url.pathname = pathname + "/models";
      }
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function modelIdFromRecord(record) {
    if (typeof record === "string") {
      return record.trim();
    }
    if (!record || typeof record !== "object") {
      return "";
    }
    const candidates = [record.id, record.name, record.model, record.modelName];
    for (let index = 0; index < candidates.length; index += 1) {
      if (typeof candidates[index] === "string" && candidates[index].trim()) {
        return candidates[index].trim();
      }
    }
    return "";
  }

  function extractEmbeddingModels(payload) {
    const records = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.data)
        ? payload.data
        : payload && Array.isArray(payload.models)
          ? payload.models
          : payload && Array.isArray(payload.items)
            ? payload.items
            : [];
    return unique(records.map(modelIdFromRecord).filter(Boolean)).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  async function requestEmbeddingModels(endpoint, apiKey, modelsEndpoint) {
    const url = resolveEmbeddingModelsEndpoint(endpoint, modelsEndpoint);
    if (!url) {
      return { ok: false, models: [], message: "请先填写有效的 embedding 接口地址或模型列表地址" };
    }
    if (typeof fetch !== "function") {
      return { ok: false, models: [], message: "当前环境不支持网络请求" };
    }
    try {
      const headers = {};
      if (apiKey) {
        headers.Authorization = "Bearer " + apiKey;
      }
      const response = await fetch(url, {
        method: "GET",
        headers: headers
      });
      if (!response.ok) {
        return { ok: false, models: [], url: url, message: "模型接口返回 HTTP " + response.status };
      }
      const payload = await response.json();
      const models = extractEmbeddingModels(payload);
      if (!models.length) {
        return { ok: false, models: [], url: url, message: "接口响应中没有找到模型列表" };
      }
      return { ok: true, models: models, url: url, message: "已拉取 " + models.length + " 个模型" };
    } catch (error) {
      return { ok: false, models: [], url: url, message: "模型接口请求失败，请检查地址、Key 或跨域设置" };
    }
  }

  async function rankMemoriesWithHost(api, conversationId, query, memories, options) {
    const settings = options || {};
    const hostRequest = Array.isArray(settings.hostResults)
      ? Promise.resolve(settings.hostResults)
      : callHostSearch(api, conversationId, query, settings.limit || 80, settings.timeoutMs || 2500);
    let queryVectorRequest = Promise.resolve(null);
    if (settings.useExternalEmbedding !== false) {
      const configRequest = settings.embeddingConfig !== undefined
        ? Promise.resolve(settings.embeddingConfig)
        : storageGet(api, EMBEDDING_KEY, {});
      queryVectorRequest = configRequest.then(function (config) {
        return requestEmbedding(query, config);
      });
    }
    const parallel = await Promise.all([hostRequest, queryVectorRequest]);
    const hostResults = Array.isArray(parallel[0]) ? parallel[0] : [];
    const queryVector = parallel[1];
    const byId = new Map(memories.map(function (memory) { return [String(memory.id), memory]; }));
    const bySignature = new Map(memories.map(function (memory) {
      return [memoryTextSignature(memory.text), memory];
    }));
    const hostScores = new Map();
    const hostOverlapIds = new Set();
    const hostOverlapSignatures = new Set();
    hostResults.forEach(function (result, index) {
      const id = hostResultId(result);
      const text = hostResultText(result);
      const memory = byId.get(id) || bySignature.get(memoryTextSignature(text));
      if (memory) {
        hostScores.set(memory.id, Math.max(hostScores.get(memory.id) || 0, 1 - index / Math.max(1, hostResults.length)));
      }
    });
    if (settings.excludeHostOverlap !== false) {
      const vectorResults = hostResults.filter(function (result) {
        return hostResultKind(result) === "vector";
      });
      // Roche does not expose its native vector top 8, so this is a best-effort overlap set.
      const overlapResults = (vectorResults.length ? vectorResults : hostResults).slice(0, HOST_OVERLAP_LIMIT);
      overlapResults.forEach(function (result) {
        const id = hostResultId(result);
        const text = hostResultText(result);
        const memory = byId.get(id) || bySignature.get(memoryTextSignature(text));
        if (!memory) {
          return;
        }
        hostOverlapIds.add(String(memory.id));
        const signature = memoryTextSignature(memory.text);
        if (signature) {
          hostOverlapSignatures.add(signature);
        }
      });
    }
    const ranked = rankMemories(query, memories, {
      hostScores: hostScores,
      queryVector: queryVector || undefined
    });
    return {
      entries: ranked,
      semanticMode: queryVector ? "向量嵌入" : settings.semanticMode || "本地语义近似",
      hostCount: hostResults.length,
      hostOverlapIds: Array.from(hostOverlapIds),
      hostOverlapSignatures: Array.from(hostOverlapSignatures)
    };
  }

  function metadataForMemory(memory) {
    return {
      room: normalizeRoomId(memory.room) || "livingRoom",
      importance: clamp(memory.importance, 1, 10),
      emotion: memory.emotion || "平静",
      emotionIntensity: clamp(memory.emotionIntensity, 0, 1),
      lastRecall: normalizeTimestamp(memory.lastRecall, memory.timestamp),
      reviewCount: clamp(memory.reviewCount, 0, 999),
      stability: Number.isFinite(Number(memory.stability)) ? Number(memory.stability) : null,
      nextReviewAt: memory.nextReviewAt || nextReviewAt(memory),
      accessCount: clamp(memory.accessCount, 0, 9999),
      lastActivatedAt: memory.lastActivatedAt || null,
      tags: unique(toArray(memory.tags).map(String)).slice(0, 20),
      notes: truncate(memory.notes || "", 1000),
      relations: relationObjects(memory).slice(0, 8),
      eventId: memory.eventId || null,
      anchor: Boolean(memory.anchor),
      faded: Boolean(memory.faded),
      migratedFrom: memory.migratedFrom || null,
      pendingDelete: Boolean(memory.pendingDelete),
      deleteDismissed: Boolean(memory.deleteDismissed),
      updatedAt: Date.now()
    };
  }

  function normalizeCoreEntries(core) {
    if (core == null) {
      return [];
    }
    if (Array.isArray(core)) {
      return core;
    }
    if (core.entries && Array.isArray(core.entries)) {
      return core.entries;
    }
    return [core];
  }

  function normalizeMemories(longTerm, metadata, conversationId) {
    const source = longTerm || {};
    const records = [];
    normalizeCoreEntries(source.core).forEach(function (record) {
      records.push({ record: record, kind: "core" });
    });
    toArray(source.facts).forEach(function (record) {
      records.push({ record: record, kind: "fact" });
    });
    toArray(source.vectors).forEach(function (record) {
      records.push({ record: record, kind: "vector" });
    });
    const byId = new Map();
    const bySignature = new Map();
    records.forEach(function (entry) {
      const text = extractText(entry.record);
      if (!text && entry.kind !== "core") {
        return;
      }
      const rawId = entry.record && typeof entry.record === "object" ? entry.record.id : "";
      const timestamp = normalizeTimestamp(
        entry.record && typeof entry.record === "object" && (
          entry.record.timestamp || entry.record.createdAt || entry.record.updatedAt || entry.record.when
        ),
        Date.now()
      );
      const stableId = hashString(conversationId + "|" + entry.kind + "|" + text);
      const id = String(rawId || "memory_" + stableId);
      const meta = metadata[id] || {};
      const signature = memoryTextSignature(text);
      const existing = byId.get(id) || bySignature.get(signature);
      if (existing) {
        if (entry.kind === "core" || existing.kind !== "core") {
          existing.raw = entry.record;
          existing.kind = entry.kind;
        }
        existing.text = existing.text || text;
        if (!existing.embedding) {
          existing.embedding = extractEmbedding(entry.record);
        }
        return;
      }
      const emotion = normalizeEmotion(meta.emotion || (entry.record && entry.record.emotion) || detectEmotion(text).label);
      const room = normalizeRoomId(meta.room)
        || normalizeRoomId(entry.record && entry.record.room)
        || classifyRoom(text, entry.kind);
      const emotionData = detectEmotion(text);
      const memory = {
        id: id,
        text: text || "角色核心设定",
        kind: entry.kind,
        raw: entry.record,
        synthetic: !rawId && entry.kind === "core",
        timestamp: timestamp,
        room: room,
        importance: clamp(meta.importance || entry.record && entry.record.importance || estimateImportance(text, entry.kind), 1, 10),
        emotion: emotion,
        emotionIntensity: clamp(meta.emotionIntensity || (entry.record && entry.record.emotionIntensity) || emotionData.intensity, 0, 1),
        lastRecall: normalizeTimestamp(meta.lastRecall || (entry.record && entry.record.lastRecall), timestamp),
        reviewCount: clamp(meta.reviewCount || (entry.record && entry.record.reviewCount) || 0, 0, 999),
        stability: Number(meta.stability) > 0 ? Number(meta.stability) : null,
        nextReviewAt: meta.nextReviewAt || null,
        accessCount: clamp(meta.accessCount || 0, 0, 9999),
        lastActivatedAt: meta.lastActivatedAt || null,
        tags: unique(toArray(meta.tags || entry.record && entry.record.tags).map(String)).slice(0, 20),
        notes: meta.notes || "",
        relations: meta.relations || entry.record && entry.record.relations || [],
        eventId: meta.eventId || entry.record && entry.record.eventId || null,
        anchor: Boolean(meta.anchor || entry.record && entry.record.anchor),
        faded: Boolean(meta.faded),
        migratedFrom: meta.migratedFrom || null,
        pendingDelete: Boolean(meta.pendingDelete),
        deleteDismissed: Boolean(meta.deleteDismissed),
        embedding: extractEmbedding(entry.record)
      };
      memory.tokens = tokenize(memory.text);
      memory.localVector = hashedEmbedding(memory.text);
      memory.nextReviewAt = memory.nextReviewAt || nextReviewAt(memory);
      memory.retention = retentionAt(memory, 0);
      byId.set(id, memory);
      bySignature.set(signature, memory);
    });
    return Array.from(byId.values()).sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
  }

  function applyMemoryMaintenance(memories) {
    let changed = false;
    const now = Date.now();
    const living = memories.filter(function (memory) { return memory.room === "livingRoom"; });
    if (living.length > ROOM_RULES.livingRoom.capacity) {
      const overflow = living.slice().sort(function (a, b) {
        const scoreA = a.importance * 0.7 + retentionAt(a, 0) * 3 + a.reviewCount * 0.05;
        const scoreB = b.importance * 0.7 + retentionAt(b, 0) * 3 + b.reviewCount * 0.05;
        return scoreA - scoreB;
      }).slice(0, living.length - ROOM_RULES.livingRoom.capacity);
      overflow.forEach(function (memory) {
        const oldRoom = memory.room;
        if (memory.importance >= 6 || memory.reviewCount >= 2) {
          memory.room = "bedroom";
        } else {
          memory.room = "attic";
        }
        memory.migratedFrom = oldRoom;
        memory.faded = false;
        changed = true;
      });
    }
    memories.forEach(function (memory) {
      const age = Math.max(0, (now - memory.timestamp) / DAY_MS);
      if (memory.room === "windowSill" && age >= 7 && !memory.anchor) {
        memory.anchor = true;
        changed = true;
      }
      if (ROOM_RULES[memory.room] && ROOM_RULES[memory.room].decay) {
        const retention = retentionAt(memory, 0);
        const faded = retention < 0.12;
        if (memory.faded !== faded) {
          memory.faded = faded;
          changed = true;
        }
      }
      if (memory.pendingDelete && !memory.deleteDismissed && !isDeleteEligible(memory)) {
        memory.pendingDelete = false;
        changed = true;
      } else if (!memory.pendingDelete && !memory.deleteDismissed && isDeleteEligible(memory)) {
        memory.pendingDelete = true;
        changed = true;
      }
      const text = memory.text;
      if (memory.room === "attic" && /释然|想通了|已经解决|放下了/.test(text)) {
        memory.room = "bedroom";
        memory.migratedFrom = "attic";
        memory.faded = false;
        changed = true;
      } else if (memory.room === "windowSill" && /实现了|完成了|达成了|做到了/.test(text)) {
        memory.room = "bedroom";
        memory.migratedFrom = "windowSill";
        memory.anchor = false;
        changed = true;
      } else if (memory.room === "windowSill" && /落空|失败了|没实现|取消了/.test(text)) {
        memory.room = "attic";
        memory.migratedFrom = "windowSill";
        memory.anchor = false;
        changed = true;
      } else if (memory.room === "study" && /学会了|掌握了|理解了|已经会了/.test(text) && memory.importance >= 7) {
        memory.room = "selfRoom";
        memory.migratedFrom = "study";
        changed = true;
      }
      memory.retention = retentionAt(memory, 0);
      memory.nextReviewAt = nextReviewAt(memory);
    });
    return changed;
  }

  function eventTitle(text) {
    const clean = String(text || "").replace(/[。！？!?]+$/g, "").trim();
    return truncate(clean || "未命名事件", 26);
  }

  function buildEventGroups(memories, storedEvents) {
    const groups = [];
    const byId = new Map();
    const explicit = storedEvents || {};
    memories.filter(function (memory) {
      return memory.importance >= 6 || memory.eventId;
    }).sort(function (a, b) {
      return a.timestamp - b.timestamp;
    }).forEach(function (memory) {
      let group = null;
      if (memory.eventId) {
        group = groups.find(function (item) { return item.id === memory.eventId; }) || null;
      }
      if (!group) {
        group = groups.find(function (item) {
          const close = Math.abs(item.endAt - memory.timestamp) <= 3 * DAY_MS;
          const related = item.memories.some(function (itemMemory) {
            return jaccardSimilarity(itemMemory.tokens, memory.tokens) >= 0.18;
          });
          return close && related;
        }) || null;
      }
      if (!group) {
        group = {
          id: memory.eventId || makeId("event", memory.id),
          title: eventTitle(memory.text),
          startAt: memory.timestamp,
          endAt: memory.timestamp,
          importance: memory.importance,
          memories: []
        };
        groups.push(group);
      }
      group.memories.push(memory);
      group.startAt = Math.min(group.startAt, memory.timestamp);
      group.endAt = Math.max(group.endAt, memory.timestamp);
      group.importance = Math.max(group.importance, memory.importance);
      if (!memory.eventId) {
        memory.eventId = group.id;
      }
      byId.set(group.id, group);
    });
    groups.forEach(function (group) {
      const old = explicit[group.id];
      if (old && old.title) {
        group.title = old.title;
      }
      group.roomIds = unique(group.memories.map(function (memory) { return memory.room; }));
      group.anchorMemoryId = group.memories.slice().sort(function (a, b) {
        return b.importance - a.importance;
      })[0] && group.memories.slice().sort(function (a, b) {
        return b.importance - a.importance;
      })[0].id;
    });
    return groups.sort(function (a, b) {
      return b.endAt - a.endAt;
    });
  }

  function makeEventState(groups) {
    const state = {};
    groups.forEach(function (group) {
      state[group.id] = {
        title: group.title,
        startAt: group.startAt,
        endAt: group.endAt,
        importance: group.importance,
        memoryIds: group.memories.map(function (memory) { return memory.id; }),
        roomIds: group.roomIds
      };
    });
    return state;
  }

  async function loadMemoryBundle(api, conversationId) {
    if (!api || !api.memory || typeof api.memory.getLongTerm !== "function" || !conversationId) {
      return {
        memories: [],
        state: {},
        events: [],
        changed: false
      };
    }
    let longTerm = {};
    try {
      longTerm = await api.memory.getLongTerm({ conversationId: conversationId, limit: 2000 }) || {};
    } catch (error) {
      longTerm = {};
    }
    const metadata = await storageGet(api, AUTO_SAVE_KEY + conversationId, {});
    const savedState = await storageGet(api, STATE_KEY + conversationId, {});
    const memories = normalizeMemories(longTerm, metadata || {}, conversationId);
    const graph = buildRelationGraph(memories);
    let changed = false;
    memories.forEach(function (memory) {
      const nextRelations = graph[memory.id] || [];
      const previous = JSON.stringify(relationObjects(memory).slice(0, 6));
      memory.relations = nextRelations;
      if (previous !== JSON.stringify(nextRelations)) {
        changed = true;
      }
    });
    if (applyMemoryMaintenance(memories)) {
      changed = true;
    }
    const events = buildEventGroups(memories, savedState && savedState.events);
    const state = {
      version: 2,
      events: makeEventState(events),
      lastMaintenanceAt: Date.now(),
      embeddingMode: "85% semantic + 15% BM25"
    };
    if (changed) {
      await persistMemoryBundle(api, conversationId, memories, state);
    }
    return {
      memories: memories,
      state: state,
      events: events,
      changed: changed
    };
  }

  function cacheChatBundle(conversationId, bundle) {
    if (!conversationId || !bundle) {
      return;
    }
    chatBundleCache.set(String(conversationId), {
      expiresAt: Date.now() + (bundle.memories && bundle.memories.length ? CHAT_BUNDLE_TTL_MS : CHAT_EMPTY_BUNDLE_TTL_MS),
      bundle: bundle
    });
  }

  function invalidateChatBundleCache(conversationId) {
    if (conversationId) {
      chatBundleCache.delete(String(conversationId));
      return;
    }
    chatBundleCache.clear();
  }

  function cachedChatBundle(conversationId) {
    const cached = chatBundleCache.get(String(conversationId || ""));
    if (!cached || cached.expiresAt <= Date.now()) {
      if (cached) {
        chatBundleCache.delete(String(conversationId || ""));
      }
      return null;
    }
    if (cached.bundle && cached.bundle.chatReady === false) {
      return null;
    }
    return cached.bundle;
  }

  async function loadChatMemoryBundle(api, conversationId) {
    if (!api || !api.memory || typeof api.memory.getLongTerm !== "function" || !conversationId) {
      return null;
    }
    const key = String(conversationId);
    const cached = cachedChatBundle(key);
    if (cached) {
      return cached;
    }
    if (chatBundleRequests.has(key)) {
      return chatBundleRequests.get(key);
    }
    const request = (async function () {
      let longTermRequest;
      try {
        longTermRequest = api.memory.getLongTerm({
          conversationId: conversationId,
          limit: CHAT_MEMORY_READ_LIMIT
        });
      } catch (error) {
        longTermRequest = Promise.resolve({});
      }
      const parallel = await Promise.all([
        settleWithTimeout(longTermRequest, CHAT_INDEX_TIMEOUT_MS, {}),
        settleWithTimeout(storageGet(api, AUTO_SAVE_KEY + conversationId, {}), CHAT_INDEX_TIMEOUT_MS, {})
      ]);
      const memories = normalizeMemories(parallel[0] || {}, parallel[1] || {}, conversationId);
      const bundle = {
        memories: memories,
        state: {},
        events: [],
        changed: false,
        chatFastPath: true,
        chatReady: false
      };
      cacheChatBundle(key, bundle);
      return bundle;
    })();
    chatBundleRequests.set(key, request);
    try {
      return await request;
    } finally {
      if (chatBundleRequests.get(key) === request) {
        chatBundleRequests.delete(key);
      }
    }
  }

  function scheduleChatWarmup(api, conversationId) {
    const key = String(conversationId || "");
    if (!key || chatWarmupRequests.has(key)) {
      return;
    }
    const task = new Promise(function (resolve, reject) {
      setTimeout(function () {
        (async function () {
          if (!(await isChatMemoryEnabled(api, key))) {
            return;
          }
          const bundle = await settleWithTimeout(loadChatMemoryBundle(api, key), CHAT_INDEX_TIMEOUT_MS, null);
          if (bundle) {
            bundle.chatReady = true;
            cacheChatBundle(key, bundle);
          }
        })().then(resolve, reject);
      }, 0);
    });
    chatWarmupRequests.set(key, task);
    task.then(function () {
      if (chatWarmupRequests.get(key) === task) {
        chatWarmupRequests.delete(key);
      }
    }, function () {
      if (chatWarmupRequests.get(key) === task) {
        chatWarmupRequests.delete(key);
      }
    });
  }

  async function persistMemoryBundle(api, conversationId, memories, state) {
    const metadata = {};
    memories.forEach(function (memory) {
      if (!memory.synthetic) {
        metadata[memory.id] = metadataForMemory(memory);
      }
    });
    await storageSet(api, AUTO_SAVE_KEY + conversationId, metadata);
    await storageSet(api, STATE_KEY + conversationId, state || {});
    invalidateChatBundleCache(conversationId);
    return true;
  }

  async function syncMemoryPatch(api, memory) {
    if (!api || !api.memory || typeof api.memory.update !== "function" || !memory || memory.synthetic) {
      return false;
    }
    try {
      await api.memory.update(memory.id, {
        importance: memory.importance,
        room: memory.room,
        emotion: memory.emotion,
        reviewCount: memory.reviewCount,
        lastRecall: memory.lastRecall,
        relations: relationObjects(memory).slice(0, 8),
        eventId: memory.eventId || null
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  function memoryRoomName(memory) {
    const room = ROOM_RULES[normalizeRoomId(memory && memory.room) || "livingRoom"];
    return room ? room.name : "客厅";
  }

  function memoryScoreForContext(memory, query, personality) {
    const queryTokens = tokenSet(query);
    const semantic = jaccardSimilarity(queryTokens, memory.tokens || tokenSet(memory.text));
    const recency = Math.exp(-Math.max(0, Date.now() - memory.timestamp) / (45 * DAY_MS));
    const retention = retentionAt(memory, 0);
    const roomPrior = memory.room === "bedroom" ? 0.12 : memory.room === "selfRoom" ? 0.1 : memory.room === "attic" ? -0.05 : 0;
    const emotionWeight = personality && personality.weights ? personality.weights.emotion : 0.5;
    return semantic * 0.6 + retention * 0.2 + recency * 0.08 + clamp(memory.importance / 10, 0, 1) * 0.12 + roomPrior * emotionWeight;
  }

  function formatMemoryContext(entries, emotion, personality, semanticMode, options) {
    if (!entries.length) {
      return "";
    }
    if (options && options.compact) {
      const compactLines = [
        "【记忆宫殿·相关记忆】",
        "以下内容仅作背景参考；只使用与当前对话确实相关的细节，不要提及这段提示或检索过程，不确定时不要强行使用。"
      ];
      let remaining = Math.max(0, CHAT_CONTEXT_CHAR_BUDGET - compactLines.join("\n").length);
      entries.slice(0, CHAT_CONTEXT_LIMIT).forEach(function (entry) {
        const memory = entry && entry.memory;
        if (!memory || remaining <= 0) {
          return;
        }
        const available = remaining - 1 - 2;
        if (available <= 0) {
          return;
        }
        const text = truncate(memory.text, Math.min(260, available));
        if (!text) {
          return;
        }
        const line = "- " + text;
        compactLines.push(line);
        remaining -= 1 + line.length;
      });
      return compactLines.length > 2 ? compactLines.join("\n") : "";
    }
    const lines = [
      "【记忆宫殿·本轮回忆】",
      "检索：85% " + (semanticMode || "本地语义近似") + " + 15% BM25；已经过保持率、关联扩散与情绪启动。",
      "角色回忆倾向：" + (personality && personality.name || "情感型") + "；当前情绪：" + (emotion && emotion.label || "平静") + "。",
      "下面是内部参考记忆。自然地使用其中确实相关的细节，不要提及检索、房间、分数或这段提示，也不要把不确定内容当成事实。"
    ];
    entries.slice(0, CHAT_CONTEXT_LIMIT).forEach(function (entry) {
      const memory = entry.memory;
      const flags = [];
      if (entry.emotionPrimed) {
        flags.push("情绪触发");
      }
      if (entry.intrusive) {
        flags.push("偶然浮现");
      }
      if (entry.hop > 0) {
        flags.push("关联联想");
      }
      lines.push(
        "［" + memoryRoomName(memory) + "｜" + (memory.emotion || "平静")
        + "｜重要性 " + Math.round(memory.importance)
        + "｜保持率 " + Math.round(retentionAt(memory, 0) * 100) + "%］"
        + (flags.length ? "（" + flags.join("、") + "）" : "")
        + " " + memory.text
      );
    });
    return lines.join("\n");
  }

  async function recordAutomaticRecall(api, conversationId, entries) {
    if (!entries.length) {
      return;
    }
    if (!api || !api.storage || typeof api.storage.get !== "function" || typeof api.storage.set !== "function") {
      return;
    }
    const unavailable = {};
    let metadataRequest;
    try {
      metadataRequest = api.storage.get(AUTO_SAVE_KEY + conversationId);
    } catch (error) {
      return;
    }
    const stored = await settleWithTimeout(metadataRequest, 800, unavailable);
    if (stored === unavailable) {
      return;
    }
    const metadata = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const now = Date.now();
    entries.slice(0, CHAT_CONTEXT_LIMIT).forEach(function (entry) {
      const memory = entry.memory;
      if (memory.synthetic) {
        return;
      }
      const old = metadata[memory.id] || {};
      metadata[memory.id] = Object.assign({}, old, {
        accessCount: clamp((Number(old.accessCount) || 0) + 1, 0, 9999),
        lastActivatedAt: now,
        updatedAt: now
      });
    });
    await settleWithTimeout(storageSet(api, AUTO_SAVE_KEY + conversationId, metadata), 800, false);
  }

  function scheduleAutomaticRecall(api, conversationId, entries) {
    const snapshot = toArray(entries).slice(0, CHAT_CONTEXT_LIMIT).filter(function (entry) {
      return entry && entry.memory && !entry.memory.synthetic;
    });
    if (!snapshot.length || !conversationId) {
      return;
    }
    const key = String(conversationId);
    if (automaticRecallTimers.has(key) || automaticRecallQueue.has(key)) {
      return;
    }
    const timer = setTimeout(function () {
      automaticRecallTimers.delete(key);
      const previous = automaticRecallQueue.get(key) || Promise.resolve();
      const task = previous.catch(function () {}).then(function () {
        return recordAutomaticRecall(api, conversationId, snapshot);
      });
      automaticRecallQueue.set(key, task);
      task.then(function () {
        if (automaticRecallQueue.get(key) === task) {
          automaticRecallQueue.delete(key);
        }
      }, function () {
        if (automaticRecallQueue.get(key) === task) {
          automaticRecallQueue.delete(key);
        }
      });
    }, 0);
    automaticRecallTimers.set(key, timer);
  }

  function conversationIdFromContext(ctx) {
    return ctx && (ctx.conversationId || ctx.conversation && (ctx.conversation.id || ctx.conversation.conversationId));
  }

  function latestTextFromContext(ctx) {
    if (ctx && typeof ctx.latestUserMessage === "string") {
      return ctx.latestUserMessage.trim();
    }
    if (ctx && ctx.latestUserMessage && typeof ctx.latestUserMessage.text === "string") {
      return ctx.latestUserMessage.text.trim();
    }
    return "";
  }

  const STYLES = [
    ".mp-root{--ink:#403b3c;--muted:#817879;--line:#e5dedb;--paper:#fffdfb;--canvas:#f5f1ee;--rose:#b68591;--blue:#7c9aa5;--olive:#9b927c;box-sizing:border-box;min-height:100%;height:100%;max-height:100vh;min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scrollbar-gutter:stable;touch-action:pan-y;-webkit-overflow-scrolling:touch;background:var(--canvas);color:var(--ink);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:0;}",
    ".mp-root::-webkit-scrollbar{width:8px;}",
    ".mp-root::-webkit-scrollbar-track{background:transparent;}",
    ".mp-root::-webkit-scrollbar-thumb{background:#d2c6c1;border-radius:4px;}",
    ".mp-root *{box-sizing:border-box;}",
    ".mp-shell{max-width:1160px;margin:0 auto;padding:28px 30px 54px;}",
    ".mp-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:28px;}",
    ".mp-back{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--muted);font-size:13px;padding:6px 0;cursor:pointer;}",
    ".mp-back:hover{color:var(--ink);}",
    ".mp-brand{display:flex;align-items:center;gap:12px;min-width:0;}",
    ".mp-brand-mark{display:grid;place-items:center;width:38px;height:38px;border:1px solid #d8ceca;border-radius:12px;background:#eee7e3;color:var(--rose);}",
    ".mp-brand-title{font-family:Georgia,'Songti SC',serif;font-size:18px;letter-spacing:1px;}",
    ".mp-brand-subtitle{margin-top:2px;color:var(--muted);font-size:12px;}",
    ".mp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}",
    ".mp-icon-button,.mp-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #d9cfcb;background:var(--paper);color:var(--ink);min-height:36px;padding:0 13px;border-radius:9px;font-size:12px;cursor:pointer;transition:background .16s,border-color .16s,transform .16s;}",
    ".mp-icon-button{width:36px;padding:0;}",
    ".mp-icon-button:hover,.mp-button:hover{background:#f1e9e6;border-color:#c5b6b1;transform:translateY(-1px);}",
    ".mp-button.primary{background:#9b8eaa;border-color:#9b8eaa;color:#fff;}",
    ".mp-button.primary:hover{background:#887b98;border-color:#887b98;}",
    ".mp-button.quiet{background:transparent;border-color:transparent;}",
    ".mp-button.danger{color:#9d686d;}",
    ".mp-icon{display:block;flex:0 0 auto;}",
    ".mp-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;margin-bottom:26px;}",
    ".mp-kicker{font-size:11px;letter-spacing:2px;color:var(--rose);text-transform:uppercase;margin-bottom:9px;}",
    ".mp-h1{margin:0;font-family:Georgia,'Songti SC',serif;font-size:clamp(27px,3vw,40px);font-weight:400;line-height:1.2;}",
    ".mp-lede{margin:9px 0 0;max-width:650px;color:var(--muted);font-size:13px;line-height:1.7;}",
    ".mp-stats{display:flex;align-items:flex-end;gap:22px;flex-wrap:wrap;}",
    ".mp-stat{min-width:70px;}",
    ".mp-stat-value{font-family:Georgia,'Songti SC',serif;font-size:27px;line-height:1;color:var(--ink);}",
    ".mp-stat-label{margin-top:6px;color:var(--muted);font-size:11px;white-space:nowrap;}",
    ".mp-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:18px;}",
    ".mp-search{display:flex;align-items:center;gap:9px;flex:1 1 280px;min-width:210px;height:42px;padding:0 13px;border:1px solid #ded5d1;border-radius:9px;background:#fff;color:var(--muted);}",
    ".mp-search input{width:100%;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;}",
    ".mp-search input::placeholder{color:#aaa09e;}",
    ".mp-segment{display:flex;align-items:center;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--paper);}",
    ".mp-segment button{border:0;border-right:1px solid var(--line);background:transparent;color:var(--muted);min-height:40px;padding:0 12px;font-size:12px;cursor:pointer;}",
    ".mp-segment button:last-child{border-right:0;}",
    ".mp-segment button.active{background:#ebe3e0;color:var(--ink);}",
    ".mp-room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;}",
    ".mp-room-card{position:relative;display:flex;align-items:stretch;min-height:154px;border:1px solid var(--line);border-radius:12px;background:var(--paper);overflow:hidden;cursor:pointer;transition:transform .18s,box-shadow .18s,border-color .18s;}",
    ".mp-room-card:hover{transform:translateY(-2px);border-color:#c8b9b5;box-shadow:0 8px 22px rgba(89,72,68,.08);}",
    ".mp-room-strip{width:7px;flex:0 0 7px;}",
    ".mp-room-body{display:flex;flex:1;flex-direction:column;justify-content:space-between;padding:18px 19px;min-width:0;}",
    ".mp-room-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;}",
    ".mp-room-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;margin-bottom:13px;}",
    ".mp-room-name{font-family:Georgia,'Songti SC',serif;font-size:20px;font-weight:400;line-height:1.25;}",
    ".mp-room-subtitle{margin-top:5px;color:var(--muted);font-size:12px;line-height:1.5;}",
    ".mp-room-count{text-align:right;white-space:nowrap;}",
    ".mp-room-count strong{display:block;font-family:Georgia,'Songti SC',serif;font-size:25px;font-weight:400;line-height:1;}",
    ".mp-room-count span{display:block;margin-top:5px;color:var(--muted);font-size:10px;}",
    ".mp-room-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;}",
    ".mp-due{color:#a36f72;}",
    ".mp-capacity{height:3px;margin-top:12px;background:#eee8e5;border-radius:2px;overflow:hidden;}",
    ".mp-capacity i{display:block;height:100%;border-radius:2px;}",
    ".mp-section{margin-top:28px;}",
    ".mp-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px;}",
    ".mp-section-title{margin:0;font-family:Georgia,'Songti SC',serif;font-size:20px;font-weight:400;}",
    ".mp-section-note{color:var(--muted);font-size:11px;line-height:1.5;}",
    ".mp-panel{border:1px solid var(--line);border-radius:12px;background:var(--paper);}",
    ".mp-insight{display:grid;grid-template-columns:1.2fr .8fr;gap:0;overflow:hidden;}",
    ".mp-insight-copy{padding:22px 24px;border-right:1px solid var(--line);}",
    ".mp-insight-copy h3{margin:0 0 9px;font-family:Georgia,'Songti SC',serif;font-size:19px;font-weight:400;}",
    ".mp-insight-copy p{margin:0;color:var(--muted);font-size:12px;line-height:1.8;}",
    ".mp-insight-metrics{display:grid;grid-template-columns:repeat(2,1fr);padding:18px;gap:12px;align-content:center;}",
    ".mp-metric{padding:11px 12px;border-left:3px solid #d6c9c4;background:#faf7f5;}",
    ".mp-metric strong{display:block;font-family:Georgia,'Songti SC',serif;font-size:20px;font-weight:400;}",
    ".mp-metric span{display:block;margin-top:5px;color:var(--muted);font-size:10px;}",
    ".mp-empty{padding:48px 24px;text-align:center;color:var(--muted);font-size:13px;}",
    ".mp-empty strong{display:block;margin-bottom:8px;color:var(--ink);font-family:Georgia,'Songti SC',serif;font-size:18px;font-weight:400;}",
    ".mp-list{display:grid;gap:10px;}",
    ".mp-memory-card{border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:16px 17px;cursor:pointer;transition:border-color .16s,box-shadow .16s;}",
    ".mp-memory-card:hover{border-color:#c7b8b4;box-shadow:0 5px 16px rgba(89,72,68,.06);}",
    ".mp-memory-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}",
    ".mp-memory-meta{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap;}",
    ".mp-pill{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:5px;background:#f0e9e6;color:#776c6b;font-size:10px;white-space:nowrap;}",
    ".mp-pill.room{color:var(--ink);}",
    ".mp-pill.due{background:#f3e2e1;color:#9d686d;}",
    ".mp-pill.anchor{background:#f2ead7;color:#8b7547;}",
    ".mp-pill.delete{background:#f4dfdf;color:#9b5f63;}",
    ".mp-memory-date{color:#9a9190;font-size:10px;white-space:nowrap;}",
    ".mp-memory-text{margin:0;color:#4a4445;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;}",
    ".mp-memory-bottom{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:13px;color:var(--muted);font-size:10px;}",
    ".mp-retention{display:flex;align-items:center;gap:7px;min-width:145px;}",
    ".mp-retention-bar{width:82px;height:4px;border-radius:3px;background:#eee8e5;overflow:hidden;}",
    ".mp-retention-bar i{display:block;height:100%;background:#9b8eaa;border-radius:3px;}",
    ".mp-relation-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid #f0ebe9;}",
    ".mp-relation-label{color:#9a9190;font-size:10px;display:inline-flex;align-items:center;gap:3px;}",
    ".mp-relation-link{border:0;background:transparent;color:#7c9aa5;padding:0;font-size:10px;cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".mp-event-list{display:grid;gap:14px;}",
    ".mp-event{border:1px solid var(--line);border-radius:10px;background:var(--paper);overflow:hidden;}",
    ".mp-event-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid var(--line);}",
    ".mp-event-title{margin:0;font-family:Georgia,'Songti SC',serif;font-size:17px;font-weight:400;line-height:1.4;}",
    ".mp-event-date{margin-top:5px;color:var(--muted);font-size:10px;}",
    ".mp-event-count{color:var(--muted);font-size:11px;white-space:nowrap;}",
    ".mp-event-memories{display:grid;gap:0;}",
    ".mp-event-memory{display:flex;gap:12px;padding:13px 18px;border-bottom:1px solid #f0ebe9;cursor:pointer;}",
    ".mp-event-memory:last-child{border-bottom:0;}",
    ".mp-event-memory:hover{background:#fcfaf9;}",
    ".mp-event-dot{width:7px;height:7px;margin-top:7px;border-radius:50%;background:#b68591;flex:0 0 7px;}",
    ".mp-event-memory p{margin:0;font-size:12px;line-height:1.7;}",
    ".mp-event-memory small{display:block;margin-top:4px;color:var(--muted);font-size:10px;}",
    ".mp-curve-wrap{padding:20px 22px;}",
    ".mp-curve-svg{display:block;width:100%;height:220px;overflow:visible;}",
    ".mp-curve-grid{stroke:#eee7e4;stroke-width:1;}",
    ".mp-curve-line{fill:none;stroke:#9b8eaa;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;}",
    ".mp-curve-area{fill:#e7dfeb;opacity:.65;}",
    ".mp-curve-label{fill:#9a9190;font-size:10px;}",
    ".mp-due-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px;}",
    ".mp-due-item{padding:12px;border-left:3px solid #b68591;background:#faf7f5;}",
    ".mp-due-item strong{display:block;font-size:12px;font-weight:500;line-height:1.45;}",
    ".mp-due-item span{display:block;margin-top:5px;color:var(--muted);font-size:10px;}",
    ".mp-detail{max-width:820px;}",
    ".mp-detail-panel{padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--paper);}",
    ".mp-detail-text{margin:0;font-size:15px;line-height:1.9;white-space:pre-wrap;word-break:break-word;}",
    ".mp-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:22px 0;}",
    ".mp-detail-field{padding:11px 12px;background:#faf7f5;border:1px solid #eee7e4;border-radius:8px;}",
    ".mp-detail-field span{display:block;color:var(--muted);font-size:10px;}",
    ".mp-detail-field strong{display:block;margin-top:5px;font-size:13px;font-weight:500;}",
    ".mp-form{display:grid;gap:14px;max-width:720px;}",
    ".mp-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}",
    ".mp-field{display:grid;gap:6px;}",
    ".mp-field label{color:var(--muted);font-size:11px;}",
    ".mp-field input,.mp-field select,.mp-field textarea{width:100%;border:1px solid #dcd2cf;border-radius:8px;background:#fff;color:var(--ink);padding:10px 11px;font:inherit;font-size:12px;outline:0;}",
    ".mp-input-action{display:flex;align-items:center;gap:8px;min-width:0;}",
    ".mp-input-action input{min-width:0;flex:1 1 auto;}",
    ".mp-input-action .mp-button{flex:0 0 auto;white-space:nowrap;}",
    ".mp-model-picker{color:var(--muted);}",
    ".mp-field-note{color:#aaa09e;font-size:10px;line-height:1.5;}",
    ".mp-field textarea{min-height:110px;resize:vertical;line-height:1.6;}",
    ".mp-field input:focus,.mp-field select:focus,.mp-field textarea:focus{border-color:#9b8eaa;box-shadow:0 0 0 3px #eee8f0;}",
    ".mp-help{padding:13px 15px;border-left:3px solid #9b8eaa;background:#f1ebf2;color:#706671;font-size:11px;line-height:1.7;}",
    ".mp-toggle{display:flex;align-items:center;gap:9px;color:var(--ink);font-size:12px;cursor:pointer;}",
    ".mp-toggle input{accent-color:#9b8eaa;}",
    ".mp-forget-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px;}",
    ".mp-forget-stat{padding:14px;border:1px solid var(--line);border-radius:9px;background:var(--paper);}",
    ".mp-forget-stat strong{display:block;font-family:Georgia,'Songti SC',serif;font-size:24px;font-weight:400;}",
    ".mp-forget-stat span{display:block;margin-top:5px;color:var(--muted);font-size:10px;}",
    ".mp-forget-list{display:grid;gap:10px;}",
    ".mp-forget-item{padding:16px 17px;border:1px solid var(--line);border-radius:10px;background:var(--paper);}",
    ".mp-forget-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;}",
    ".mp-forget-item-text{margin:10px 0 0;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;}",
    ".mp-forget-item-meta{margin-top:10px;color:var(--muted);font-size:10px;}",
    ".mp-forget-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}",
    "@media (max-width:760px){.mp-forget-grid{grid-template-columns:1fr;}}",
    ".mp-loading{padding:60px;text-align:center;color:var(--muted);font-size:13px;}",
    ".mp-toast{position:fixed;right:22px;bottom:22px;z-index:20;max-width:320px;padding:12px 15px;border:1px solid #d5c6c1;border-radius:8px;background:#fffdfb;color:var(--ink);box-shadow:0 8px 26px rgba(71,57,53,.14);font-size:12px;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s;}",
    ".mp-toast.show{opacity:1;transform:translateY(0);}",
    ".mp-select-shell{max-width:900px;}",
    ".mp-select-top{display:flex;justify-content:flex-start;margin-bottom:52px;}",
    ".mp-select-hero{max-width:650px;margin-bottom:28px;}",
    ".mp-character-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}",
    ".mp-character-card{display:flex;align-items:center;gap:14px;min-height:92px;padding:16px;border:1px solid var(--line);border-radius:11px;background:var(--paper);text-align:left;color:var(--ink);cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s;}",
    ".mp-character-card:hover{transform:translateY(-2px);border-color:#c7b8b4;box-shadow:0 7px 20px rgba(89,72,68,.07);}",
    ".mp-avatar{display:grid;place-items:center;width:48px;height:48px;flex:0 0 48px;overflow:hidden;border-radius:50%;background:#e9e1e0;color:#9b8eaa;font-family:Georgia,'Songti SC',serif;font-size:20px;}",
    ".mp-avatar img{width:100%;height:100%;object-fit:cover;}",
    ".mp-character-copy{display:grid;min-width:0;gap:3px;}",
    ".mp-character-copy strong{font-family:Georgia,'Songti SC',serif;font-size:16px;font-weight:400;}",
    ".mp-character-copy span{color:var(--muted);font-size:11px;}",
    ".mp-character-copy small{margin-top:4px;color:#aaa09e;font-size:10px;}",
    ".mp-character-arrow{margin-left:auto;color:#a79c99;}",
    ".mp-select-foot{margin-top:36px;color:#aaa09e;font-size:11px;line-height:1.7;}",
    ".mp-select-config{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px;padding:12px 14px;border:1px solid var(--line);border-radius:9px;background:#fbf8f6;color:var(--muted);font-size:11px;}",
    ".mp-select-config strong{color:var(--ink);font-weight:500;}",
    ".mp-select-config-row{display:flex;align-items:center;justify-content:space-between;gap:14px;}",
    ".mp-select-config-row+.mp-select-config-row{margin-top:13px;padding-top:13px;border-top:1px solid #eee7e4;}",
    ".mp-select-config-copy{display:grid;gap:4px;min-width:0;}",
    ".mp-select-config-copy div{color:var(--muted);font-size:10px;line-height:1.5;}",
    ".mp-setting-line{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-bottom:15px;border-bottom:1px solid #eee7e4;}",
    ".mp-setting-copy{display:grid;gap:4px;}",
    ".mp-setting-copy strong{font-size:12px;font-weight:500;}",
    ".mp-setting-copy span{color:var(--muted);font-size:11px;line-height:1.6;}",
    ".mp-switch{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;cursor:pointer;}",
    ".mp-switch input{position:absolute;width:1px;height:1px;opacity:0;}",
    ".mp-switch span{position:relative;display:block;width:42px;height:24px;border-radius:12px;background:#d6ceca;transition:background .16s;}",
    ".mp-switch span::after{content:\"\";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(71,57,53,.18);transition:transform .16s;}",
    ".mp-switch input:checked+span{background:#9b8eaa;}",
    ".mp-switch input:checked+span::after{transform:translateX(18px);}",
    ".mp-switch input:focus-visible+span{box-shadow:0 0 0 3px #eee8f0;}",
    "mark{padding:0 2px;border-radius:2px;background:#f0dfc2;color:inherit;}",
    "@media (max-width:760px){.mp-shell{padding:20px 15px 38px}.mp-topbar{margin-bottom:22px}.mp-hero{display:block}.mp-stats{margin-top:20px;gap:18px}.mp-room-grid,.mp-character-grid{grid-template-columns:1fr}.mp-insight{grid-template-columns:1fr}.mp-insight-copy{border-right:0;border-bottom:1px solid var(--line)}.mp-due-list{grid-template-columns:1fr}.mp-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-form-row{grid-template-columns:1fr}.mp-memory-bottom{align-items:flex-start;flex-direction:column;gap:8px}.mp-actions{gap:5px}.mp-button{padding:0 10px}.mp-input-action{align-items:stretch;flex-wrap:wrap}.mp-input-action input{flex-basis:100%}.mp-input-action .mp-button{width:100%}}"
  ].join("");

  function renderRoomIcon(roomId) {
    const rule = ROOM_RULES[roomId] || ROOM_RULES.livingRoom;
    return '<span class="mp-room-icon" style="background:' + rule.soft + ";color:" + rule.accent + '">' + getSvgIcon(rule.icon, 20) + "</span>";
  }

  function sortedMemories(memories, sortBy, descending) {
    const list = memories.slice();
    list.sort(function (a, b) {
      let difference = 0;
      if (sortBy === "importance") {
        difference = a.importance - b.importance;
      } else if (sortBy === "retention") {
        difference = retentionAt(a, 0) - retentionAt(b, 0);
      } else if (sortBy === "due") {
        difference = (a.nextReviewAt || Infinity) - (b.nextReviewAt || Infinity);
      } else {
        difference = a.timestamp - b.timestamp;
      }
      return descending ? -difference : difference;
    });
    return list;
  }

  function buildCurvePath(memories, width, height, days) {
    if (!memories.length) {
      return "";
    }
    const points = [];
    const count = 31;
    for (let index = 0; index < count; index += 1) {
      const day = days * index / (count - 1);
      const average = memories.reduce(function (total, memory) {
        return total + retentionAt(memory, day);
      }, 0) / memories.length;
      const x = 18 + (width - 36) * index / (count - 1);
      const y = 14 + (height - 32) * (1 - average);
      points.push({ x: x, y: y });
    }
    return points.map(function (point, index) {
      return (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1);
    }).join(" ");
  }

  function renderCurveSvg(memories) {
    const width = 760;
    const height = 220;
    const path = buildCurvePath(memories, width, height, 30);
    const area = path ? path + " L742 202 L18 202 Z" : "";
    return '<svg class="mp-curve-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="30天平均记忆保持率曲线">' +
      '<line class="mp-curve-grid" x1="18" y1="14" x2="742" y2="14"/>' +
      '<line class="mp-curve-grid" x1="18" y1="108" x2="742" y2="108"/>' +
      '<line class="mp-curve-grid" x1="18" y1="202" x2="742" y2="202"/>' +
      (area ? '<path class="mp-curve-area" d="' + area + '"/><path class="mp-curve-line" d="' + path + '"/>' : "") +
      '<text class="mp-curve-label" x="18" y="217">今天</text><text class="mp-curve-label" x="700" y="217">30天后</text>' +
      '<text class="mp-curve-label" x="730" y="18">100%</text><text class="mp-curve-label" x="730" y="112">50%</text><text class="mp-curve-label" x="730" y="206">0%</text>' +
      "</svg>";
  }

  function renderSearchInput(value, placeholder) {
    return '<label class="mp-search">' + getSvgIcon("search", 17) + '<input id="mp-search-input" type="search" value="' + escapeAttr(value || "") + '" placeholder="' + escapeAttr(placeholder || "搜索记忆、标签、情绪...") + '"></label>';
  }

  function renderMemoryCard(memory, memories, options) {
    const settings = options || {};
    const room = ROOM_RULES[memory.room] || ROOM_RULES.livingRoom;
    const retention = retentionAt(memory, 0);
    const related = settings.showRelations === false ? [] : findRelatedMemories(memory, memories, 3);
    const tags = toArray(memory.tags).slice(0, 3);
    return '<article class="mp-memory-card" data-open-memory="' + escapeAttr(memory.id) + '">' +
      '<div class="mp-memory-top"><div class="mp-memory-meta">' +
      '<span class="mp-pill room" style="background:' + room.soft + ";color:" + room.accent + '">' + escapeHtml(room.name) + "</span>" +
      '<span class="mp-pill">' + escapeHtml(memory.emotion || "平静") + "</span>" +
      (isDue(memory) ? '<span class="mp-pill due">待复习</span>' : "") +
      (memory.anchor ? '<span class="mp-pill anchor">心理锚点</span>' : "") +
      (memory.pendingDelete ? '<span class="mp-pill delete">待确认删除</span>' : "") +
      tags.map(function (tag) { return '<span class="mp-pill">#' + escapeHtml(tag) + "</span>"; }).join("") +
      '</div><span class="mp-memory-date">' + escapeHtml(formatDate(memory.timestamp, true)) + "</span></div>" +
      '<p class="mp-memory-text">' + (settings.highlight ? highlightText(memory.text, settings.highlight) : escapeHtml(settings.full ? memory.text : truncate(memory.text, 260))) + "</p>" +
      '<div class="mp-memory-bottom"><span class="mp-retention">' + getSvgIcon("clock", 13) + "保持 " + Math.round(retention * 100) + '%<span class="mp-retention-bar"><i style="width:' + Math.round(retention * 100) + '%;background:' + room.accent + '"></i></span></span><span>重要性 ' + Math.round(memory.importance) + " · 复习 " + Math.round(memory.reviewCount || 0) + " 次</span></div>" +
      (related.length ? '<div class="mp-relation-row"><span class="mp-relation-label">' + getSvgIcon("link", 12) + "关联</span>" + related.map(function (item) {
        return '<button class="mp-relation-link" data-open-memory="' + escapeAttr(item.memory.id) + '" title="' + escapeAttr(item.memory.text) + '">' + escapeHtml(truncate(item.memory.text, 25)) + "</button>";
      }).join("") + "</div>" : "") +
      "</article>";
  }

  function highlightText(text, query) {
    const source = escapeHtml(text);
    const words = tokenize(query).filter(function (word) { return word.length > 1; }).slice(0, 10);
    if (!words.length) {
      return source;
    }
    const pattern = new RegExp("(" + words.map(function (word) {
      return word.replace(/[^a-z0-9_\u4e00-\u9fff]/gi, "");
    }).join("|") + ")", "gi");
    return source.replace(pattern, "<mark>$1</mark>");
  }

  function mount(container, roche) {
    const api = roche || getHostApi();
    activeRocheApi = api;
    let view = "select";
    let conversations = [];
    let selectedConversationId = null;
    let selectedCharacter = null;
    let memories = [];
    let events = [];
    let searchQuery = "";
    let searchRanked = null;
    let searchRankedKey = "";
    let searchRankedReady = false;
    let searchRankRequestId = 0;
    let searchRankPending = false;
    let roomFilter = null;
    let sortBy = "time";
    let descending = true;
    let selectedMemoryId = null;
    let embeddingConfig = {};
    let embeddingModels = [];
    let embeddingModelsMessage = "";
    let chatMemoryEnabled = true;
    let refreshTimer = null;
    let saveTimer = null;
    let toastTimer = null;
    let destroyed = false;

    const style = document.createElement("style");
    style.textContent = STYLES;
    const root = document.createElement("div");
    root.className = "mp-root";
    container.replaceChildren(style, root);

    function notify(message) {
      if (api && api.ui && typeof api.ui.toast === "function") {
        try {
          api.ui.toast(message);
          return;
        } catch (error) {
          // Fall through to the local toast when the host UI is unavailable.
        }
      }
      let toast = root.querySelector(".mp-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.className = "mp-toast";
        root.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toast.classList.remove("show");
      }, 2600);
    }

    function normalizeList(value) {
      if (Array.isArray(value)) {
        return value;
      }
      if (value && Array.isArray(value.items)) {
        return value.items;
      }
      if (value && Array.isArray(value.conversations)) {
        return value.conversations;
      }
      if (value && Array.isArray(value.characters)) {
        return value.characters;
      }
      return [];
    }

    async function loadConversations() {
      embeddingConfig = await storageGet(api, EMBEDDING_KEY, {});
      chatMemoryEnabled = (await storageGet(api, CHAT_MEMORY_KEY, true)) !== false;
      let rawConversations = [];
      let characters = [];
      try {
        if (api && api.conversation && typeof api.conversation.list === "function") {
          rawConversations = normalizeList(await api.conversation.list());
        }
      } catch (error) {
        rawConversations = [];
      }
      try {
        if (api && api.character && typeof api.character.list === "function") {
          characters = normalizeList(await api.character.list());
        }
      } catch (error) {
        characters = [];
      }
      const characterByConversation = new Map();
      characters.forEach(function (character) {
        const id = character && (character.conversationId || character.id);
        if (id) {
          characterByConversation.set(String(id), character);
        }
      });
      conversations = rawConversations.map(function (conversation, index) {
        const id = String(conversation.id || conversation.conversationId || conversation.characterId || "conversation-" + index);
        const character = characterByConversation.get(id) || {};
        return {
          id: id,
          name: character.displayName || character.name || conversation.displayName || conversation.name || "未命名角色",
          handle: character.handle || conversation.handle || "",
          avatar: character.avatar || conversation.avatar || "",
          persona: character.persona || character.bio || character.description || conversation.persona || "",
          character: character
        };
      });
      if (!conversations.length && characters.length) {
        conversations = characters.map(function (character, index) {
          return {
            id: String(character.conversationId || character.id || "character-" + index),
            name: character.displayName || character.name || "未命名角色",
            handle: character.handle || "",
            avatar: character.avatar || "",
            persona: character.persona || character.bio || character.description || "",
            character: character
          };
        });
      }
    }

    async function loadSelectedConversation() {
      if (!selectedConversationId) {
        memories = [];
        events = [];
        return;
      }
      const bundle = await loadMemoryBundle(api, selectedConversationId);
      memories = bundle.memories;
      events = bundle.events;
      resetSearchRanking();
      embeddingConfig = await storageGet(api, EMBEDDING_KEY, {});
      chatMemoryEnabled = (await storageGet(api, CHAT_MEMORY_KEY, true)) !== false;
      chatSettingCache.set(String(selectedConversationId), {
        value: chatMemoryEnabled,
        expiresAt: Date.now() + CHAT_SETTING_TTL_MS
      });
      cacheChatBundle(String(selectedConversationId), {
        memories: memories.slice(),
        state: {},
        events: [],
        changed: false,
        chatFastPath: true,
        chatReady: true
      });
      if (bundle.changed) {
        schedulePersist();
      }
    }

    async function persistNow(syncHost) {
      if (!selectedConversationId) {
        return;
      }
      clearTimeout(saveTimer);
      saveTimer = null;
      const state = {
        version: 2,
        events: makeEventState(events),
        lastMaintenanceAt: Date.now(),
        embeddingMode: embeddingConfig && embeddingConfig.enabled ? "85% 真实向量 + 15% BM25" : "85% 本地语义近似 + 15% BM25"
      };
      await persistMemoryBundle(api, selectedConversationId, memories, state);
      if (syncHost) {
        const writable = memories.filter(function (memory) { return !memory.synthetic; });
        let success = 0;
        for (let index = 0; index < writable.length; index += 1) {
          if (await syncMemoryPatch(api, writable[index])) {
            success += 1;
          }
        }
        notify("已尝试写回 Roche：" + success + "/" + writable.length + " 条");
      }
    }

    function schedulePersist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        persistNow(false).catch(function () {});
      }, 800);
    }

    function startRefresh() {
      clearInterval(refreshTimer);
      refreshTimer = setInterval(function () {
        if (!destroyed && selectedConversationId) {
          loadSelectedConversation().then(function () {
            if (!destroyed && view !== "select") {
              render();
            }
          }).catch(function () {});
        }
      }, 120000);
    }

    function currentConversation() {
      return conversations.find(function (item) { return item.id === selectedConversationId; }) || selectedCharacter || {
        id: selectedConversationId,
        name: "角色",
        persona: ""
      };
    }

    function roomMemories(roomId) {
      return memories.filter(function (memory) {
        return memory.room === roomId;
      });
    }

    function dueMemories() {
      return memories.filter(isDue);
    }

    function renderHeader(options) {
      const settings = options || {};
      const character = currentConversation();
      const backAction = settings.backAction || "back-select";
      return '<header class="mp-topbar">' +
        '<button class="mp-back" data-action="' + backAction + '">' + getSvgIcon("arrow", 16) + escapeHtml(settings.backLabel || "退出") + "</button>" +
        '<div class="mp-brand"><span class="mp-brand-mark">' + getSvgIcon("spark", 19) + '</span><div><div class="mp-brand-title">MEMORY PALACE</div><div class="mp-brand-subtitle">' + escapeHtml(character.name || "记忆宫殿") + "</div></div></div>" +
        '<div class="mp-actions">' + (settings.actions || "") + "</div>" +
        "</header>";
    }

    function actionButton(action, label, icon, className, title) {
      return '<button class="mp-button ' + (className || "") + '" data-action="' + escapeAttr(action) + '"' + (title ? ' title="' + escapeAttr(title) + '"' : "") + ">" + (icon ? getSvgIcon(icon, 15) : "") + escapeHtml(label) + "</button>";
    }

    function iconButton(action, icon, title) {
      return '<button class="mp-icon-button" data-action="' + escapeAttr(action) + '" title="' + escapeAttr(title) + '">' + getSvgIcon(icon, 17) + "</button>";
    }

    function renderEmbeddingModelOptions(currentModel) {
      const selected = String(currentModel || "");
      const options = ['<option value="">选择已拉取模型</option>'];
      embeddingModels.forEach(function (model) {
        options.push('<option value="' + escapeAttr(model) + '"' + (model === selected ? " selected" : "") + ">" + escapeHtml(model) + "</option>");
      });
      return options.join("");
    }

    function updateEmbeddingModelPicker(currentModel) {
      const picker = root.querySelector("#mp-embedding-model-picker");
      if (!picker) {
        return;
      }
      picker.innerHTML = renderEmbeddingModelOptions(currentModel);
      picker.disabled = !embeddingModels.length;
      if (currentModel && embeddingModels.indexOf(currentModel) >= 0) {
        picker.value = currentModel;
      }
    }

    async function loadEmbeddingModels() {
      const endpointInput = root.querySelector("#mp-embedding-endpoint");
      const modelsEndpointInput = root.querySelector("#mp-embedding-models-endpoint");
      const keyInput = root.querySelector("#mp-embedding-key");
      const status = root.querySelector("#mp-embedding-model-status");
      const button = root.querySelector('[data-action="fetch-embedding-models"]');
      const endpoint = String(endpointInput && endpointInput.value || "").trim();
      const modelsEndpoint = String(modelsEndpointInput && modelsEndpointInput.value || "").trim();
      const apiKey = String(keyInput && keyInput.value || "").trim();
      if (button) {
        button.disabled = true;
      }
      if (status) {
        status.textContent = "正在拉取模型列表…";
      }
      const result = await requestEmbeddingModels(endpoint, apiKey, modelsEndpoint);
      if (result.ok) {
        embeddingModels = result.models;
        embeddingModelsMessage = result.message;
        const modelInput = root.querySelector("#mp-embedding-model");
        updateEmbeddingModelPicker(String(modelInput && modelInput.value || "").trim());
        notify(result.message);
      } else {
        embeddingModelsMessage = result.message;
        if (status) {
          status.textContent = result.message;
        }
        notify(result.message);
      }
      if (button) {
        button.disabled = false;
      }
      if (status && result.ok) {
        status.textContent = result.message;
      }
    }

    function renderSelectPage() {
      const cards = conversations.map(function (conversation) {
        const initial = (conversation.name || "角").slice(0, 1);
        return '<button class="mp-character-card" data-select-conversation="' + escapeAttr(conversation.id) + '">' +
          '<div class="mp-avatar">' + (conversation.avatar ? '<img src="' + escapeAttr(conversation.avatar) + '" alt="">' : escapeHtml(initial)) + "</div>" +
          '<div class="mp-character-copy"><strong>' + escapeHtml(conversation.name) + '</strong><span>' + (conversation.handle ? "@" + escapeHtml(conversation.handle) : "记忆宫殿已就绪") + "</span><small>七房间空间模型 · 自动维护</small></div>" +
          '<span class="mp-character-arrow">' + getSvgIcon("chevron", 18) + "</span></button>";
      }).join("");
      return '<div class="mp-shell mp-select-shell">' +
        '<div class="mp-select-top"><div>' + iconButton("back-host", "arrow", "退出记忆宫殿") + '</div><div class="mp-actions">' + iconButton("open-settings", "settings", "通用检索设置") + "</div></div>" +
        '<section class="mp-select-hero"><div class="mp-kicker">MEMORY PALACE</div><h1 class="mp-h1">选择一个角色</h1><p class="mp-lede">进入 Ta 的七个房间，查看关系留下的痕迹、正在衰减的片段，以及会在聊天中被重新唤起的记忆。</p></section>' +
        '<div class="mp-character-grid">' + (cards || '<div class="mp-panel mp-empty"><strong>还没有可用角色</strong>请先在 Roche 中创建角色或打开一段对话。</div>') + "</div>" +
        '<div class="mp-select-config"><div class="mp-select-config-row"><div class="mp-select-config-copy"><strong>通用语义检索</strong><div>' + (embeddingConfig && embeddingConfig.enabled ? "已启用真实嵌入，所有角色共用此配置" : "当前使用本地语义近似，所有角色共用此配置") + '</div></div><button class="mp-button" data-action="open-settings">配置 embedding</button></div><div class="mp-select-config-row"><div class="mp-select-config-copy"><strong>参与聊天记忆</strong><div>' + (chatMemoryEnabled ? "已开启，相关记忆会参与 AI 回复" : "已关闭，仅保留记忆宫殿管理功能") + '</div></div><label class="mp-switch" title="切换是否参与聊天回复"><input id="mp-chat-memory-enabled" aria-label="参与聊天记忆" type="checkbox"' + (chatMemoryEnabled ? " checked" : "") + '><span aria-hidden="true"></span></label></div></div>' +
        '<div class="mp-select-foot">向量检索、关联扩散、情绪启动与自动遗忘均按角色独立运行；聊天自动注入最多 8 条记忆。</div></div>';
    }

    function renderPalacePage() {
      const character = currentConversation();
      const total = memories.length;
      const wishes = roomMemories("windowSill").length;
      const due = dueMemories().length;
      const bedroom = roomMemories("bedroom").length;
      const attic = roomMemories("attic").length;
      const averageRetention = total ? Math.round(memories.reduce(function (sum, memory) {
        return sum + retentionAt(memory, 0);
      }, 0) / total * 100) : 0;
      const roomCards = ROOM_ORDER.map(function (roomId) {
        const rule = ROOM_RULES[roomId];
        const items = roomMemories(roomId);
        const dueInRoom = items.filter(isDue).length;
        const capacity = rule.capacity === Infinity ? 0 : Math.min(100, items.length / rule.capacity * 100);
        return '<article class="mp-room-card" data-open-room="' + roomId + '">' +
          '<span class="mp-room-strip" style="background:' + rule.accent + '"></span><div class="mp-room-body">' +
          '<div class="mp-room-head"><div>' + renderRoomIcon(roomId) + '<div class="mp-room-name">' + escapeHtml(rule.name) + "</div><div class=\"mp-room-subtitle\">" + escapeHtml(rule.subtitle) + "</div></div>" +
          '<div class="mp-room-count"><strong>' + items.length + '</strong><span>条记忆</span></div></div>' +
          '<div><div class="mp-room-foot"><span>' + escapeHtml(rule.brain) + "</span>" + (dueInRoom ? '<span class="mp-due">待复习 ' + dueInRoom + "</span>" : '<span>保持率 ' + (items.length ? Math.round(items.reduce(function (sum, item) { return sum + retentionAt(item, 0); }, 0) / items.length * 100) : 0) + "%</span>") + '</div><div class="mp-capacity"><i style="width:' + capacity + '%;background:' + rule.accent + '"></i></div></div>' +
          "</div></article>";
      }).join("");
      return '<div class="mp-shell">' +
        renderHeader({
          backLabel: "选择角色",
          actions: iconButton("open-settings", "settings", "检索设置") + iconButton("refresh", "refresh", "刷新记忆")
        }) +
        '<section class="mp-hero"><div><div class="mp-kicker">七房间关系空间</div><h1 class="mp-h1">' + escapeHtml(character.name || "角色") + ' 的记忆宫殿</h1><p class="mp-lede">每条记忆都有自己的房间、保持率和关联路径。重要的片段会被留下，日常片段会自然褪色，但不会从你的查看入口消失。</p></div>' +
        '<div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + total + '</div><div class="mp-stat-label">全部记忆</div></div><div class="mp-stat"><div class="mp-stat-value">' + events.length + '</div><div class="mp-stat-label">事件盒</div></div><div class="mp-stat"><div class="mp-stat-value">' + wishes + '</div><div class="mp-stat-label">窗台期盼</div></div><div class="mp-stat"><div class="mp-stat-value">' + due + '</div><div class="mp-stat-label">待复习</div></div></div></section>' +
        '<div class="mp-toolbar">' + actionButton("view-all", "查看全部记忆", "grid", "primary") + actionButton("view-events", "查看事件盒", "calendar") + actionButton("view-curve", "遗忘曲线", "curve") + actionButton("view-forgetting", "遗忘中心", "moon") + "</div>" +
        '<div class="mp-toolbar">' + renderSearchInput("", "搜索记忆、标签、情绪...") + "</div>" +
        '<section class="mp-section"><div class="mp-section-head"><div><h2 class="mp-section-title">七个房间</h2><div class="mp-section-note">记忆按关系功能归位，点击房间查看完整内容。</div></div><span class="mp-section-note">自动维护已开启</span></div><div class="mp-room-grid">' + roomCards + "</div></section>" +
        '<section class="mp-section"><div class="mp-insight mp-panel"><div class="mp-insight-copy"><h3>今天的宫殿状态</h3><p>系统会在聊天时运行混合搜索，再沿着关联边扩散。当前角色的记忆不会只按关键词排列，而会受保持率、情绪和角色性格共同影响。</p></div><div class="mp-insight-metrics"><div class="mp-metric"><strong>' + averageRetention + '%</strong><span>平均保持率</span></div><div class="mp-metric"><strong>' + bedroom + '</strong><span>长期羁绊</span></div><div class="mp-metric"><strong>' + attic + '</strong><span>未消化片段</span></div><div class="mp-metric"><strong>' + (embeddingConfig && embeddingConfig.enabled ? "真实" : "本地") + '</strong><span>语义检索</span></div></div></div></section>' +
        "</div>";
    }

    function renderMemoryList(items, options) {
      const settings = options || {};
      if (!items.length) {
        return '<div class="mp-panel mp-empty"><strong>' + escapeHtml(settings.emptyTitle || "这里还没有记忆") + "</strong>" + escapeHtml(settings.emptyText || "新的对话会在 Roche 记忆产生后出现在这里。") + "</div>";
      }
      return '<div class="mp-list">' + items.map(function (memory) {
        return renderMemoryCard(memory, memories, settings);
      }).join("") + "</div>";
    }

    function renderListToolbar(options) {
      const settings = options || {};
      return '<div class="mp-toolbar">' +
        (settings.showSearch !== false ? renderSearchInput(searchQuery, settings.placeholder || "搜索记忆、标签、情绪...") : "") +
        '<div class="mp-segment"><button data-sort="time" class="' + (sortBy === "time" ? "active" : "") + '">时间</button><button data-sort="importance" class="' + (sortBy === "importance" ? "active" : "") + '">重要性</button><button data-sort="retention" class="' + (sortBy === "retention" ? "active" : "") + '">保持率</button></div>' +
        iconButton("toggle-order", descending ? "arrow" : "chevron", descending ? "从新到旧" : "从旧到新") +
        "</div>";
    }

    function renderRoomPage() {
      const roomId = roomFilter || "livingRoom";
      const rule = ROOM_RULES[roomId];
      const items = sortedMemories(roomMemories(roomId), sortBy, descending);
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新记忆") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">ROOM ' + String(ROOM_ORDER.indexOf(roomId) + 1).padStart(2, "0") + '</div><h1 class="mp-h1">' + renderRoomIcon(roomId) + escapeHtml(rule.name) + '</h1><p class="mp-lede">' + escapeHtml(rule.subtitle) + " · " + escapeHtml(rule.brain) + " · " + items.length + " 条</p></div><div class=\"mp-stats\"><div class=\"mp-stat\"><div class=\"mp-stat-value\">" + items.length + '</div><div class="mp-stat-label">房间记忆</div></div><div class="mp-stat"><div class="mp-stat-value">' + items.filter(isDue).length + '</div><div class="mp-stat-label">待复习</div></div></div></section>' +
        renderListToolbar({ showSearch: false }) +
        renderMemoryList(items, { full: false, emptyTitle: "房间还很安静", emptyText: "符合这个分区的记忆会自动归位。" }) +
        "</div>";
    }

    function renderAllPage() {
      const filtered = searchQuery.trim() ? rankMemories(searchQuery, memories).map(function (entry) { return entry.memory; }) : memories.slice();
      const items = sortedMemories(filtered, sortBy, descending);
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新记忆") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">ALL MEMORIES</div><h1 class="mp-h1">全部记忆</h1><p class="mp-lede">完整查看入口不会隐藏已褪色或已迁移的片段。</p></div><div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + filtered.length + '</div><div class="mp-stat-label">' + (searchQuery.trim() ? "匹配结果" : "总条数") + "</div></div></div></section>" +
        '<div class="mp-toolbar">' + actionButton("view-events", "查看事件盒", "calendar") + actionButton("view-curve", "遗忘曲线", "curve") + actionButton("view-forgetting", "遗忘中心", "moon") + "</div>" +
        renderListToolbar({ placeholder: "在全部记忆中搜索..." }) +
        renderMemoryList(items, { highlight: searchQuery, full: false, emptyTitle: searchQuery ? "没有匹配的记忆" : "还没有记忆", emptyText: searchQuery ? "换一个关键词或情绪标签试试。" : "Roche 的长期记忆会在这里汇总。" }) +
        "</div>";
    }

    function searchRankingKey(query) {
      return String(selectedConversationId || "") + "|" + String(query || "").trim();
    }

    function resetSearchRanking() {
      searchRankRequestId += 1;
      searchRanked = null;
      searchRankedKey = "";
      searchRankedReady = false;
      searchRankPending = false;
    }

    function scheduleSearchRanking(query) {
      const source = String(query || "").trim();
      const key = searchRankingKey(source);
      if (!source || !memories.length || !(embeddingConfig && embeddingConfig.enabled) || searchRankedKey === key || searchRankPending) {
        return;
      }
      const requestId = ++searchRankRequestId;
      searchRankPending = true;
      rankMemoriesWithHost(api, selectedConversationId, source, memories, {
        hostResults: [],
        useExternalEmbedding: true,
        embeddingConfig: embeddingConfig,
        excludeHostOverlap: false,
        semanticMode: "本地语义近似"
      }).then(function (result) {
        if (destroyed || requestId !== searchRankRequestId || key !== searchRankingKey(searchQuery)) {
          return;
        }
        searchRanked = result && Array.isArray(result.entries) ? result.entries : [];
        searchRankedKey = key;
        searchRankedReady = true;
      }).catch(function () {
        if (!destroyed && requestId === searchRankRequestId && key === searchRankingKey(searchQuery)) {
          searchRanked = null;
          searchRankedKey = key;
          searchRankedReady = false;
        }
      }).finally(function () {
        if (requestId !== searchRankRequestId) {
          return;
        }
        searchRankPending = false;
        if (!destroyed && view === "search" && key === searchRankingKey(searchQuery)) {
          render();
        }
      });
    }

    function renderSearchPage() {
      const localRanked = rankMemories(searchQuery, memories);
      const key = searchRankingKey(searchQuery);
      const hasExternalRanking = embeddingConfig && embeddingConfig.enabled && searchRankedKey === key && searchRankedReady && Array.isArray(searchRanked);
      if (embeddingConfig && embeddingConfig.enabled && searchQuery.trim() && !hasExternalRanking && searchRankedKey !== key) {
        scheduleSearchRanking(searchQuery);
      }
      const ranked = hasExternalRanking ? searchRanked : localRanked;
      const items = ranked.map(function (entry) { return entry.memory; });
      const scoreById = new Map(ranked.map(function (entry) { return [entry.memory.id, entry]; }));
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新记忆") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">HYBRID RECALL</div><h1 class="mp-h1">搜索记忆</h1><p class="mp-lede">“' + escapeHtml(searchQuery) + '” 的混合检索结果。</p></div><div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + items.length + '</div><div class="mp-stat-label">召回片段</div></div><div class="mp-stat"><div class="mp-stat-value">85/15</div><div class="mp-stat-label">语义 / BM25</div></div></div></section>' +
        '<div class="mp-toolbar">' + renderSearchInput(searchQuery, "继续搜索...") + actionButton("view-all", "查看全部记忆", "grid") + "</div>" +
        '<div class="mp-help">当前模式：' + (hasExternalRanking ? "真实嵌入 + BM25" : embeddingConfig && embeddingConfig.enabled ? (searchRankPending ? "先显示本地结果，正在补充真实嵌入" : "本地语义近似") : "本地语义近似") + "。聊天默认使用受限的 Roche 记忆候选和本地排序，不调用额外聊天模型；外部 embedding 不进入聊天热路径。</div>" +
        '<div style="height:14px"></div>' +
        (items.length ? '<div class="mp-list">' + items.map(function (memory) {
          const entry = scoreById.get(memory.id);
          return renderMemoryCard(memory, memories, { highlight: searchQuery }) + '<div style="margin-top:-7px;padding-left:17px;color:#9a9190;font-size:10px">语义 ' + Math.round(entry.semanticScore * 100) + " · BM25 " + Math.round(entry.bm25Score * 100) + " · 最终 " + Math.round(entry.score * 100) + "</div>";
        }).join("") + "</div>" : '<div class="mp-panel mp-empty"><strong>没有召回结果</strong>可以尝试角色名、事件词、情绪或标签。</div>') +
        "</div>";
    }

    function renderEventsPage() {
      const eventMarkup = events.map(function (event) {
        return '<article class="mp-event"><div class="mp-event-head"><div><h2 class="mp-event-title">' + escapeHtml(event.title) + '</h2><div class="mp-event-date">' + escapeHtml(formatDate(event.startAt)) + (event.endAt !== event.startAt ? " - " + escapeHtml(formatDate(event.endAt)) : "") + "</div></div><span class=\"mp-event-count\">" + event.memories.length + " 条记忆 · 重要性 " + Math.round(event.importance) + "</span></div><div class=\"mp-event-memories\">" +
          event.memories.slice().sort(function (a, b) { return a.timestamp - b.timestamp; }).map(function (memory) {
            return '<div class="mp-event-memory" data-open-memory="' + escapeAttr(memory.id) + '"><span class="mp-event-dot"></span><div><p>' + escapeHtml(truncate(memory.text, 260)) + '</p><small>' + escapeHtml(memoryRoomName(memory)) + " · " + escapeHtml(formatDate(memory.timestamp, true)) + "</small></div></div>";
          }).join("") + "</div></article>";
      }).join("");
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新记忆") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">EVENT BOXES</div><h1 class="mp-h1">事件盒</h1><p class="mp-lede">重要记忆会按时间、语义和关联边聚合成一段可回看的经历。</p></div><div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + events.length + '</div><div class="mp-stat-label">事件盒</div></div></div></section>' +
        (eventMarkup ? '<div class="mp-event-list">' + eventMarkup + "</div>" : '<div class="mp-panel mp-empty"><strong>还没有事件盒</strong>重要性较高的记忆会自动形成事件。</div>') +
        "</div>";
    }

    function renderCurvePage() {
      const due = dueMemories().sort(function (a, b) {
        return (a.nextReviewAt || 0) - (b.nextReviewAt || 0);
      });
      const decaying = memories.filter(function (memory) {
        return ROOM_RULES[memory.room] && ROOM_RULES[memory.room].decay;
      });
      const average = decaying.length ? Math.round(decaying.reduce(function (sum, memory) {
        return sum + retentionAt(memory, 0);
      }, 0) / decaying.length * 100) : 100;
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新保持率") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">EBBINGHAUS MAINTENANCE</div><h1 class="mp-h1">自动遗忘曲线</h1><p class="mp-lede">保持率按每条记忆的房间、重要性、复习次数和上次唤回时间计算。自动遗忘只让片段褪色或迁移，不删除完整查看入口。</p></div><div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + average + '%</div><div class="mp-stat-label">当前平均保持率</div></div><div class="mp-stat"><div class="mp-stat-value">' + due.length + '</div><div class="mp-stat-label">需要复习</div></div></div></section>' +
        '<div class="mp-panel mp-curve-wrap">' + renderCurveSvg(decaying) + '<div class="mp-section-note">曲线为当前衰减房间的平均预测；自我房间与阁楼按长期保留处理。</div>' +
        (due.length ? '<div class="mp-due-list">' + due.slice(0, 9).map(function (memory) {
          return '<div class="mp-due-item" data-open-memory="' + escapeAttr(memory.id) + '"><strong>' + escapeHtml(truncate(memory.text, 45)) + "</strong><span>" + escapeHtml(memoryRoomName(memory)) + " · " + escapeHtml(memory.nextReviewAt ? formatDate(memory.nextReviewAt, true) : "现在") + "</span></div>";
        }).join("") + "</div>" : '<div class="mp-empty"><strong>暂时没有待复习记忆</strong>保持率会随时间自动更新。</div>') +
        "</div></div>";
    }

    function renderForgettingPage() {
      const fading = memories.filter(function (memory) {
        return !memory.pendingDelete && retentionAt(memory, 0) < 0.3 && retentionAt(memory, 0) > 0.1;
      });
      const faded = memories.filter(function (memory) {
        return retentionAt(memory, 0) <= 0.1;
      });
      const pending = memories.filter(function (memory) {
        return memory.pendingDelete;
      });
      const candidates = memories.filter(function (memory) {
        return !memory.synthetic && (retentionAt(memory, 0) < 0.3 || memory.pendingDelete);
      }).sort(function (a, b) {
        return retentionAt(a, 0) - retentionAt(b, 0);
      });
      const list = candidates.map(function (memory) {
        const room = ROOM_RULES[memory.room] || ROOM_RULES.livingRoom;
        const pendingLabel = memory.pendingDelete ? '<span class="mp-pill delete">待确认删除</span>' : retentionAt(memory, 0) <= 0.1 ? '<span class="mp-pill due">已淡忘</span>' : '<span class="mp-pill">正在淡化</span>';
        const actions = memory.pendingDelete
          ? '<button class="mp-button danger" data-confirm-delete="' + escapeAttr(memory.id) + '">' + getSvgIcon("close", 14) + "确认删除</button><button class=\"mp-button\" data-keep-memory=\"" + escapeAttr(memory.id) + '">保留</button>'
          : retentionAt(memory, 0) <= 0.1
            ? '<button class="mp-button primary" data-restore-memory="' + escapeAttr(memory.id) + '">' + getSvgIcon("check", 14) + "复习并恢复</button>"
            : '<button class="mp-button" data-open-memory="' + escapeAttr(memory.id) + '">' + getSvgIcon("chevron", 14) + "查看详情</button>";
        return '<article class="mp-forget-item"><div class="mp-forget-item-head"><div class="mp-memory-meta"><span class="mp-pill room" style="background:' + room.soft + ";color:" + room.accent + '">' + escapeHtml(room.name) + "</span>" + pendingLabel + '</div><span class="mp-memory-date">保持率 ' + Math.round(retentionAt(memory, 0) * 100) + "%</span></div><p class=\"mp-forget-item-text\">" + escapeHtml(truncate(memory.text, 360)) + '</p><div class="mp-forget-item-meta">' + escapeHtml(formatDate(memory.timestamp, true)) + " · 重要性 " + Math.round(memory.importance) + " · 复习 " + Math.round(memory.reviewCount || 0) + " 次</div><div class=\"mp-forget-actions\">" + actions + "</div></article>";
      }).join("");
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-palace", backLabel: "回到宫殿", actions: iconButton("refresh", "refresh", "刷新遗忘状态") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">MEMORY MAINTENANCE</div><h1 class="mp-h1">遗忘中心</h1><p class="mp-lede">自动遗忘只负责计算保持率、标记褪色和提出迁移建议。永久删除始终需要你在这里二次确认。</p></div><div class="mp-stats"><div class="mp-stat"><div class="mp-stat-value">' + pending.length + '</div><div class="mp-stat-label">待确认删除</div></div></div></section>' +
        '<div class="mp-forget-grid"><div class="mp-forget-stat"><strong>' + fading.length + '</strong><span>正在淡化</span></div><div class="mp-forget-stat"><strong>' + faded.length + '</strong><span>已淡忘</span></div><div class="mp-forget-stat"><strong>' + pending.length + '</strong><span>待确认删除</span></div></div>' +
        '<div class="mp-help">阁楼、自我房间和带有心理锚点的窗台记忆不会进入删除候选。点击“保留”后，这条记忆不会重复进入待确认列表。</div><div style="height:14px"></div>' +
        (list ? '<div class="mp-forget-list">' + list + "</div>" : '<div class="mp-panel mp-empty"><strong>暂时没有需要处理的记忆</strong>保持率会随时间自动更新。</div>') +
        "</div>";
    }

    function renderDetailPage() {
      const memory = memories.find(function (item) { return item.id === selectedMemoryId; });
      if (!memory) {
        view = "all";
        return renderAllPage();
      }
      const related = findRelatedMemories(memory, memories, 8);
      const roomOptions = ROOM_ORDER.map(function (roomId) {
        return '<option value="' + roomId + '"' + (memory.room === roomId ? " selected" : "") + ">" + escapeHtml(ROOM_RULES[roomId].name) + "</option>";
      }).join("");
      return '<div class="mp-shell">' +
        renderHeader({ backAction: "back-list", backLabel: "返回列表", actions: actionButton("review-memory", "复习并强化", "check", "primary") }) +
        '<section class="mp-hero"><div><div class="mp-kicker">MEMORY DETAIL</div><h1 class="mp-h1">' + escapeHtml(memoryRoomName(memory)) + '</h1><p class="mp-lede">' + escapeHtml(formatDate(memory.timestamp, true)) + " · " + escapeHtml(memory.kind === "vector" ? "向量记忆" : memory.kind === "core" ? "角色核心" : "事实记忆") + "</p></div></section>" +
        '<div class="mp-detail"><div class="mp-detail-panel"><p class="mp-detail-text">' + escapeHtml(memory.text) + "</p>" +
        '<div class="mp-detail-grid"><div class="mp-detail-field"><span>重要性</span><strong>' + Math.round(memory.importance) + "</strong></div><div class=\"mp-detail-field\"><span>情绪</span><strong>" + escapeHtml(memory.emotion || "平静") + "</strong></div><div class=\"mp-detail-field\"><span>保持率</span><strong>" + Math.round(retentionAt(memory, 0) * 100) + "%</strong></div><div class=\"mp-detail-field\"><span>复习次数</span><strong>" + Math.round(memory.reviewCount || 0) + "</strong></div></div>" +
        '<div class="mp-form"><div class="mp-form-row"><div class="mp-field"><label for="mp-detail-room">所属房间</label><select id="mp-detail-room">' + roomOptions + '</select></div><div class="mp-field"><label for="mp-detail-importance">重要性（1-10）</label><input id="mp-detail-importance" type="number" min="1" max="10" step="1" value="' + Math.round(memory.importance) + '"></div></div><div class="mp-form-row"><div class="mp-field"><label for="mp-detail-emotion">情绪标签</label><input id="mp-detail-emotion" value="' + escapeAttr(memory.emotion || "平静") + '"></div><div class="mp-field"><label for="mp-detail-tags">标签</label><input id="mp-detail-tags" value="' + escapeAttr(toArray(memory.tags).join(", ")) + '"></div></div><div class="mp-field"><label for="mp-detail-notes">备注</label><textarea id="mp-detail-notes">' + escapeHtml(memory.notes || "") + "</textarea></div><div>" + actionButton("save-memory-detail", "保存记忆属性", "check", "primary") + "</div></div>" +
        (related.length ? '<div class="mp-section"><div class="mp-section-head"><div><h2 class="mp-section-title">关联记忆</h2><div class="mp-section-note">这条记忆通过语义、情绪、时间或因果边连接到以下片段。</div></div><span class="mp-section-note">' + related.length + " 条</span></div><div class=\"mp-list\">" + related.map(function (item) {
          return renderMemoryCard(item.memory, memories, { showRelations: false });
        }).join("") + "</div></div>" : "") +
        "</div></div></div>";
    }

    function renderSettingsPage() {
      const config = embeddingConfig || {};
      const modelStatus = embeddingModelsMessage || (embeddingModels.length ? "已准备 " + embeddingModels.length + " 个模型" : "点击“拉取模型”获取可选列表，也可以直接手动输入");
      return '<div class="mp-shell">' +
        renderHeader({ backAction: selectedConversationId ? "back-palace" : "back-select", backLabel: selectedConversationId ? "回到宫殿" : "选择角色", actions: "" }) +
        '<section class="mp-hero"><div><div class="mp-kicker">GLOBAL RETRIEVAL SETTINGS</div><h1 class="mp-h1">通用检索设置</h1><p class="mp-lede">这里的 embedding 配置和聊天参与开关对所有角色和所有记忆宫殿生效，不需要逐个角色重复设置。</p></div></section>' +
        '<div class="mp-detail"><div class="mp-detail-panel"><div class="mp-form">' +
         '<div class="mp-setting-line"><div class="mp-setting-copy"><strong>参与聊天记忆</strong><span>关闭后仍可管理、搜索和维护记忆，但不会把记忆注入聊天。</span></div><label class="mp-switch" title="切换是否参与聊天回复"><input id="mp-chat-memory-enabled" aria-label="参与聊天记忆" type="checkbox"' + (chatMemoryEnabled ? " checked" : "") + '><span aria-hidden="true"></span></label></div>' +
        '<label class="mp-toggle"><input id="mp-embedding-enabled" type="checkbox"' + (config.enabled ? " checked" : "") + ">启用外部嵌入</label>" +
        '<div class="mp-field"><label for="mp-embedding-endpoint">嵌入接口地址</label><input id="mp-embedding-endpoint" value="' + escapeAttr(config.endpoint || "") + '" placeholder="https://.../embeddings"></div>' +
        '<div class="mp-field"><label for="mp-embedding-models-endpoint">模型列表接口地址（可选）</label><input id="mp-embedding-models-endpoint" value="' + escapeAttr(config.modelsEndpoint || "") + '" placeholder="留空自动推断 /models；Ollama 可填 /api/tags"></div>' +
        '<div class="mp-form-row"><div class="mp-field"><label for="mp-embedding-model">模型</label><div class="mp-input-action"><input id="mp-embedding-model" value="' + escapeAttr(config.model || "text-embedding-3-small") + '">' + actionButton("fetch-embedding-models", "拉取模型", "refresh", "", "从模型列表接口获取可选模型") + "</div><select id=\"mp-embedding-model-picker\" class=\"mp-model-picker\"" + (embeddingModels.length ? "" : " disabled") + ">" + renderEmbeddingModelOptions(config.model || "text-embedding-3-small") + '</select><span id="mp-embedding-model-status" class="mp-field-note">' + escapeHtml(modelStatus) + "</span></div><div class=\"mp-field\"><label for=\"mp-embedding-key\">API Key</label><input id=\"mp-embedding-key\" type=\"password\" value=\"" + escapeAttr(config.apiKey || "") + '"></div></div>' +
        '<div class="mp-help">外部嵌入会把每次检索问题发送到你填写的 embedding 服务，由它转换成向量；只有与已有记忆向量维度匹配时才参与语义排序。关闭或没有接口地址时，不发送外部请求，改用本地语义近似。API Key 只保存在插件隔离存储中，但检索文字仍会发送给该服务。</div>' +
        '<div>' + actionButton("save-settings", "保存检索设置", "check", "primary") + "</div></div></div></div></div>";
    }

    function renderLoading() {
      return '<div class="mp-shell"><div class="mp-loading">' + getSvgIcon("refresh", 18) + " 正在整理记忆宫殿…</div></div>";
    }

    function render() {
      if (destroyed) {
        return;
      }
      let markup = "";
      if (view === "select") {
        markup = renderSelectPage();
      } else if (view === "palace") {
        markup = renderPalacePage();
      } else if (view === "room") {
        markup = renderRoomPage();
      } else if (view === "all") {
        markup = renderAllPage();
      } else if (view === "search") {
        markup = renderSearchPage();
      } else if (view === "events") {
        markup = renderEventsPage();
      } else if (view === "curve") {
        markup = renderCurvePage();
      } else if (view === "forgetting") {
        markup = renderForgettingPage();
      } else if (view === "detail") {
        markup = renderDetailPage();
      } else if (view === "settings") {
        markup = renderSettingsPage();
      } else {
        markup = renderPalacePage();
      }
      root.innerHTML = markup;
      bindEvents();
    }

    async function openConversation(conversationId) {
      selectedConversationId = String(conversationId);
      selectedCharacter = conversations.find(function (item) { return item.id === selectedConversationId; }) || null;
      view = "palace";
      roomFilter = null;
      searchQuery = "";
      resetSearchRanking();
      root.innerHTML = renderLoading();
      try {
        await loadSelectedConversation();
        startRefresh();
        render();
      } catch (error) {
        memories = [];
        events = [];
        render();
        notify("读取 Roche 记忆失败");
      }
    }

    function goBack(action) {
      if (action === "back-host") {
        if (api && api.ui && typeof api.ui.closeApp === "function") {
          try {
            api.ui.closeApp();
          } catch (error) {
            // The host may close the app outside this plugin.
          }
        }
        return;
      }
      if (action === "back-select") {
        view = "select";
        selectedConversationId = null;
        selectedCharacter = null;
        memories = [];
        events = [];
        resetSearchRanking();
        clearInterval(refreshTimer);
      } else if (action === "back-palace") {
        view = "palace";
        roomFilter = null;
      } else if (action === "back-list") {
        view = roomFilter ? "room" : "all";
      } else {
        view = "palace";
      }
      render();
    }

    async function refresh() {
      if (!selectedConversationId) {
        await loadConversations();
        render();
        return;
      }
      root.innerHTML = renderLoading();
      await loadSelectedConversation();
      render();
    }

    async function reviewSelected(quality) {
      const memory = memories.find(function (item) { return item.id === selectedMemoryId; });
      if (!memory) {
        return;
      }
      reinforceMemory(memory, quality || "good");
      await persistNow(false);
      await syncMemoryPatch(api, memory);
      notify("记忆已强化，下一次复习：" + (memory.nextReviewAt ? formatDate(memory.nextReviewAt, true) : "长期保留"));
      render();
    }

    async function saveDetail() {
      const memory = memories.find(function (item) { return item.id === selectedMemoryId; });
      if (!memory) {
        return;
      }
      const roomInput = root.querySelector("#mp-detail-room");
      const importanceInput = root.querySelector("#mp-detail-importance");
      const emotionInput = root.querySelector("#mp-detail-emotion");
      const tagsInput = root.querySelector("#mp-detail-tags");
      const notesInput = root.querySelector("#mp-detail-notes");
      memory.room = normalizeRoomId(roomInput && roomInput.value) || memory.room;
      memory.importance = clamp(importanceInput && importanceInput.value, 1, 10);
      memory.emotion = String(emotionInput && emotionInput.value || "平静").trim() || "平静";
      memory.tags = unique(String(tagsInput && tagsInput.value || "").split(",").map(function (tag) {
        return tag.trim();
      })).slice(0, 20);
      memory.notes = String(notesInput && notesInput.value || "").trim();
      const graph = buildRelationGraph(memories);
      memories.forEach(function (item) {
        item.relations = graph[item.id] || [];
      });
      events = buildEventGroups(memories, {});
      await persistNow(false);
      await syncMemoryPatch(api, memory);
      notify("记忆属性已保存");
      render();
    }

    async function saveChatMemorySetting(enabled) {
      chatMemoryEnabled = Boolean(enabled);
      chatSettingCache.clear();
      const saved = await storageSet(api, CHAT_MEMORY_KEY, chatMemoryEnabled);
      notify(saved
        ? (chatMemoryEnabled ? "记忆宫殿已参与聊天回复" : "已关闭，记忆宫殿不再参与聊天回复")
        : "当前会话已切换，但全局开关保存失败");
      render();
    }

    async function saveEmbeddingSettings() {
      const enabled = Boolean(root.querySelector("#mp-embedding-enabled") && root.querySelector("#mp-embedding-enabled").checked);
      const endpoint = String(root.querySelector("#mp-embedding-endpoint") && root.querySelector("#mp-embedding-endpoint").value || "").trim();
      const modelsEndpoint = String(root.querySelector("#mp-embedding-models-endpoint") && root.querySelector("#mp-embedding-models-endpoint").value || "").trim();
      const model = String(root.querySelector("#mp-embedding-model") && root.querySelector("#mp-embedding-model").value || "").trim();
      const apiKey = String(root.querySelector("#mp-embedding-key") && root.querySelector("#mp-embedding-key").value || "").trim();
      embeddingConfig = {
        enabled: enabled && Boolean(endpoint),
        endpoint: endpoint,
        modelsEndpoint: modelsEndpoint,
        model: model || "text-embedding-3-small",
        apiKey: apiKey
      };
      embeddingCache.clear();
      resetSearchRanking();
      await storageSet(api, EMBEDDING_KEY, embeddingConfig);
      notify(embeddingConfig.enabled ? "真实嵌入已启用" : "已保存，本地语义近似仍会工作");
      view = selectedConversationId ? "palace" : "select";
      render();
    }

    async function confirmDelete(memoryId) {
      const memory = memories.find(function (item) { return item.id === memoryId; });
      if (!memory || !isDeleteEligible(memory)) {
        notify("这条记忆当前不满足删除条件");
        return;
      }
      if (!api || !api.memory || typeof api.memory.delete !== "function") {
        notify("当前 Roche 版本没有开放 memory.delete");
        return;
      }
      if (!api.ui || typeof api.ui.confirm !== "function") {
        notify("当前 Roche 版本没有确认弹窗，已停止删除");
        return;
      }
      let confirmed = false;
      try {
        confirmed = await api.ui.confirm({
          title: "永久删除 Roche 记忆",
          message: "这会从 Roche 主记忆中删除该条记录，通常不可恢复。确认继续吗？"
        });
      } catch (error) {
        confirmed = false;
      }
      if (!confirmed) {
        return;
      }
      try {
        await api.memory.delete(memory.id);
        memories = memories.filter(function (item) { return item.id !== memory.id; });
        events = buildEventGroups(memories, {});
        await persistNow(false);
        notify("已从 Roche 主记忆删除");
        view = "forgetting";
        render();
      } catch (error) {
        notify("删除失败，Roche 主记忆未改变");
      }
    }

    async function keepMemory(memoryId) {
      const memory = memories.find(function (item) { return item.id === memoryId; });
      if (!memory) {
        return;
      }
      memory.pendingDelete = false;
      memory.deleteDismissed = true;
      await persistNow(false);
      notify("已保留，之后不会重复进入待确认列表");
      render();
    }

    async function restoreMemory(memoryId) {
      const memory = memories.find(function (item) { return item.id === memoryId; });
      if (!memory) {
        return;
      }
      memory.pendingDelete = false;
      memory.deleteDismissed = false;
      reinforceMemory(memory, "good");
      await persistNow(false);
      await syncMemoryPatch(api, memory);
      notify("记忆已复习并恢复");
      render();
    }

    function handleClick(event) {
      const conversationTarget = event.target.closest("[data-select-conversation]");
      if (conversationTarget) {
        openConversation(conversationTarget.getAttribute("data-select-conversation"));
        return;
      }
      const roomTarget = event.target.closest("[data-open-room]");
      if (roomTarget) {
        roomFilter = roomTarget.getAttribute("data-open-room");
        view = "room";
        render();
        return;
      }
      const memoryTarget = event.target.closest("[data-open-memory]");
      if (memoryTarget) {
        selectedMemoryId = memoryTarget.getAttribute("data-open-memory");
        view = "detail";
        render();
        return;
      }
      const deleteTarget = event.target.closest("[data-confirm-delete]");
      if (deleteTarget) {
        confirmDelete(deleteTarget.getAttribute("data-confirm-delete")).catch(function () {
          notify("删除失败");
        });
        return;
      }
      const keepTarget = event.target.closest("[data-keep-memory]");
      if (keepTarget) {
        keepMemory(keepTarget.getAttribute("data-keep-memory")).catch(function () {
          notify("保留操作失败");
        });
        return;
      }
      const restoreTarget = event.target.closest("[data-restore-memory]");
      if (restoreTarget) {
        restoreMemory(restoreTarget.getAttribute("data-restore-memory")).catch(function () {
          notify("恢复失败");
        });
        return;
      }
      const sortTarget = event.target.closest("[data-sort]");
      if (sortTarget) {
        const nextSort = sortTarget.getAttribute("data-sort");
        if (sortBy === nextSort) {
          descending = !descending;
        } else {
          sortBy = nextSort;
          descending = true;
        }
        render();
        return;
      }
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) {
        return;
      }
      const action = actionTarget.getAttribute("data-action");
      if (action.indexOf("back-") === 0) {
        goBack(action);
      } else if (action === "view-all") {
        view = "all";
        searchQuery = "";
        resetSearchRanking();
        render();
      } else if (action === "view-events") {
        view = "events";
        render();
      } else if (action === "view-curve") {
        view = "curve";
        render();
      } else if (action === "view-forgetting") {
        view = "forgetting";
        render();
      } else if (action === "open-settings") {
        view = "settings";
        render();
      } else if (action === "refresh") {
        refresh().catch(function () { notify("刷新失败"); });
      } else if (action === "toggle-order") {
        descending = !descending;
        render();
      } else if (action === "review-memory") {
        reviewSelected("good").catch(function () { notify("强化失败"); });
      } else if (action === "save-memory-detail") {
        saveDetail().catch(function () { notify("保存失败"); });
      } else if (action === "fetch-embedding-models") {
        loadEmbeddingModels().catch(function () { notify("拉取模型失败"); });
      } else if (action === "save-settings") {
        saveEmbeddingSettings().catch(function () { notify("设置保存失败"); });
      }
    }

    function handleKeydown(event) {
      const input = event.target.closest("#mp-search-input");
      if (input && event.key === "Enter") {
        event.preventDefault();
        const nextQuery = input.value.trim();
        if (nextQuery !== searchQuery) {
          resetSearchRanking();
        }
        searchQuery = nextQuery;
        view = searchQuery ? "search" : "all";
        render();
      }
    }

    function handleChange(event) {
      if (event.target && event.target.id === "mp-embedding-model-picker") {
        const modelInput = root.querySelector("#mp-embedding-model");
        if (modelInput && event.target.value) {
          modelInput.value = event.target.value;
        }
        return;
      }
      if (event.target && event.target.id === "mp-chat-memory-enabled") {
        saveChatMemorySetting(event.target.checked).catch(function () { notify("聊天记忆开关保存失败"); });
        return;
      }
      if (event.target && event.target.id === "mp-search-input") {
        const nextQuery = String(event.target.value || "").trim();
        if (nextQuery !== searchQuery) {
          resetSearchRanking();
        }
        searchQuery = nextQuery;
        if (searchQuery) {
          view = "search";
        } else if (view === "search") {
          view = "all";
        }
        render();
      }
    }

    let eventsBound = false;
    function bindEvents() {
      if (eventsBound) {
        return;
      }
      eventsBound = true;
      root.addEventListener("click", handleClick);
      root.addEventListener("keydown", handleKeydown);
      root.addEventListener("change", handleChange);
    }

    activeMountCleanup = async function () {
      destroyed = true;
      clearInterval(refreshTimer);
      clearTimeout(saveTimer);
      clearTimeout(toastTimer);
      await persistNow(false);
      if (activeRocheApi === api) {
        activeRocheApi = null;
      }
      if (container) {
        container.replaceChildren();
      }
      activeMountCleanup = null;
    };

    root.innerHTML = renderLoading();
    loadConversations().then(function () {
      if (!destroyed) {
        render();
      }
    }).catch(function () {
      if (!destroyed) {
        conversations = [];
        render();
      }
    });
  }

  function contextPersonaText(ctx) {
    const contact = ctx && ctx.contact || {};
    const conversation = ctx && ctx.conversation || {};
    const character = conversation.character || conversation.contact || {};
    const persona = ctx && ctx.userPersona || {};
    return [
      contact.persona,
      contact.bio,
      contact.description,
      character.persona,
      character.bio,
      character.description,
      persona.persona,
      persona.description
    ].filter(function (value) {
      return typeof value === "string";
    }).join("\n");
  }

  function ruminationTendency(personaText) {
    const source = String(personaText || "");
    if (/反刍|容易想太多|敏感|记仇|不安|创伤/.test(source)) {
      return 0.55;
    }
    if (/洒脱|乐观|理性|冷静/.test(source)) {
      return 0.18;
    }
    return 0.3;
  }

  async function getContextQuery(api, ctx) {
    const latest = latestTextFromContext(ctx);
    if (latest) {
      return latest;
    }
    const conversationId = conversationIdFromContext(ctx);
    if (!conversationId || !api || !api.memory || typeof api.memory.getShortTerm !== "function") {
      return "";
    }
    try {
      const recent = await settleWithTimeout(api.memory.getShortTerm({
        conversationId: conversationId,
        limit: 6
      }), 350, []);
      const records = Array.isArray(recent)
        ? recent
        : recent && Array.isArray(recent.items)
          ? recent.items
          : recent && Array.isArray(recent.messages)
            ? recent.messages
            : [];
      return records.map(extractText).filter(Boolean).slice(-4).join("\n");
    } catch (error) {
      return "";
    }
  }

  async function isChatMemoryEnabled(api, conversationId) {
    if (!api || !conversationId) {
      return false;
    }
    const key = String(conversationId);
    const cached = chatSettingCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const values = await Promise.all([
      settleWithTimeout(storageGet(api, CHAT_MEMORY_KEY, true), CHAT_CONTEXT_TIMEOUT_MS, true),
      settleWithTimeout(storageGet(api, "memoryPalaceEnabled:" + conversationId, true), CHAT_CONTEXT_TIMEOUT_MS, true)
    ]);
    const enabled = values[0] !== false && values[1] !== false;
    chatSettingCache.set(key, {
      value: enabled,
      expiresAt: Date.now() + CHAT_SETTING_TTL_MS
    });
    return enabled;
  }

  function fallbackRecentEntries(memories, query, personality) {
    return memories.slice().sort(function (a, b) {
      return memoryScoreForContext(b, query, personality) - memoryScoreForContext(a, query, personality);
    }).slice(0, 6).map(function (memory) {
      return {
        memory: memory,
        score: memoryScoreForContext(memory, query, personality),
        semanticScore: 0,
        bm25Score: 0,
        hop: 0
      };
    });
  }

  function buildChatContext(ctx) {
    const api = getHostApi();
    const conversationId = conversationIdFromContext(ctx);
    if (!api || !conversationId || !api.memory || typeof api.memory.getLongTerm !== "function") {
      return null;
    }
    const setting = chatSettingCache.get(String(conversationId));
    if (!setting || setting.expiresAt <= Date.now()) {
      scheduleChatWarmup(api, conversationId);
      return null;
    }
    if (!setting.value) {
      return null;
    }
    const query = latestTextFromContext(ctx);
    if (!query) {
      return null;
    }
    const cachedBundle = cachedChatBundle(conversationId);
    if (!cachedBundle) {
      scheduleChatWarmup(api, conversationId);
      return null;
    }
    // The provider is deliberately synchronous: only the warm in-memory index can enter the chat request.
    const bundle = cachedBundle;
    const memories = bundle && Array.isArray(bundle.memories) ? bundle.memories.slice() : [];
    if (!memories.length) {
      return null;
    }
    const personaText = contextPersonaText(ctx);
    const personality = inferPersonality(personaText);
    const emotion = detectEmotion(query);
    const ranked = rankMemories(query, memories);
    let entries = ranked.length
      ? dedupeEntries(ranked).slice(0, CHAT_CONTEXT_LIMIT)
      : dedupeEntries(fallbackRecentEntries(memories, query, personality)).slice(0, CHAT_CONTEXT_LIMIT);
    entries = diffusionActivate(entries, memories, personality);
    entries = dedupeEntries(entries);
    entries = applyEmotionPriming(entries, emotion);
    entries = entries.map(function (entry) {
      const contextScore = memoryScoreForContext(entry.memory, query, personality);
      return Object.assign({}, entry, {
        score: entry.score * 0.72 + contextScore * 0.28
      });
    }).sort(function (a, b) {
      return b.score - a.score;
    });
    entries = checkRumination(entries, memories, {
      tendency: ruminationTendency(personaText)
    });
    entries = dedupeEntries(entries).slice(0, CHAT_CONTEXT_LIMIT);
    scheduleAutomaticRecall(api, conversationId, entries);
    return formatMemoryContext(entries, emotion, personality, "本地语义近似", { compact: true });
  }

  function exposeTestSurface() {
    if (typeof window === "undefined" || !window.__MEMORY_PALACE_TEST__) {
      return;
    }
    window.__MEMORY_PALACE_TEST__.runtime = {
      rooms: ROOM_RULES,
      detectEmotion: detectEmotion,
      inferPersonality: inferPersonality,
      normalizeMemories: normalizeMemories,
      rankMemories: rankMemories,
      rankMemoriesWithHost: rankMemoriesWithHost,
      requestEmbedding: requestEmbedding,
      applyEmotionPriming: applyEmotionPriming,
      diffusionActivate: diffusionActivate,
      checkRumination: checkRumination,
      retentionAt: retentionAt,
      nextReviewAt: nextReviewAt,
      isDeleteEligible: isDeleteEligible,
      buildRelationGraph: buildRelationGraph,
      buildEventGroups: buildEventGroups,
      applyMemoryMaintenance: applyMemoryMaintenance,
      buildChatContext: buildChatContext,
      memoryTextSignature: memoryTextSignature,
      dedupeEntries: dedupeEntries,
      resolveEmbeddingModelsEndpoint: resolveEmbeddingModelsEndpoint,
      extractEmbeddingModels: extractEmbeddingModels,
      requestEmbeddingModels: requestEmbeddingModels
    };
  }

  function registerPlugin() {
    if (typeof window === "undefined" || !window.RochePlugin || typeof window.RochePlugin.register !== "function") {
      return;
    }
    window.RochePlugin.register({
      id: PLUGIN_ID,
      name: "记忆宫殿",
      version: PLUGIN_VERSION,
      description: "七房间记忆运行时：真实嵌入可选、85/15 混合检索、关联扩散、情绪启动、反刍检查与自动遗忘。",
      icon: "❋",
      apps: [
        {
          id: PLUGIN_ID,
          name: "记忆宫殿",
          icon: "❋",
          description: "查看角色的七房间记忆空间",
          mount: mount,
          unmount: async function (container) {
            if (activeMountCleanup) {
              await activeMountCleanup();
            } else if (container) {
              container.replaceChildren();
            }
          }
        }
      ],
      chat: {
        // 只提供注入上下文，不声明工具，保持 Roche 原生的单次流式请求路径。
        contextProvider: buildChatContext
      }
    });
  }

  exposeTestSurface();
  registerPlugin();
})();
