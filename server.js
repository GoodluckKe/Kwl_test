import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

// 检查是否在 Vercel 环境中
const isVercel = process.env.VERCEL === '1';

// 在 Vercel 环境中不导入 sqlite3
let sqlite3 = null;
let open = null;

// 延迟导入 sqlite3，避免在 Vercel 环境中加载
async function loadSqlite() {
  if (!isVercel) {
    try {
      const sqlite3Module = await import("sqlite3");
      const sqliteModule = await import("sqlite");
      sqlite3 = sqlite3Module.default;
      open = sqliteModule.open;
    } catch (error) {
      console.error("加载 sqlite 模块失败:", error);
    }
  }
}

// 加载 sqlite 模块
loadSqlite();

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

const app = express();
const PORT = Number(process.env.PORT || 3010);
app.use(express.json());
app.use(express.static("public"));

const { SECONDME_CLIENT_ID, SECONDME_CLIENT_SECRET, SECONDME_REDIRECT_URI = "http://localhost:3010/api/auth/callback", SECONDME_OAUTH_URL = "https://go.second.me/oauth/", SECONDME_API_BASE_URL = "https://api.mindverse.com/gate/lab", UPSTASH_REDIS_REST_URL = "", UPSTASH_REDIS_REST_TOKEN = "", SESSION_SECRET = "", } = process.env;

import path from "path";

const sessions = new Map();
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
const redisEnabled = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
const SESSION_COOKIE_NAME = "session_data";

// 历史记录存储路径
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const BATTLE_HISTORY_DIR = path.join(__dirname, 'data', 'battle-history');

// 数据库文件路径
const DB_PATH = path.join(BATTLE_HISTORY_DIR, 'battle_history.db');

// 数据库连接
let db = null;

// 初始化数据库
async function initDatabase() {
  // 在 Vercel 环境中，跳过文件系统操作
  if (isVercel) {
    console.log("在 Vercel 环境中，跳过数据库初始化");
    return;
  }
  
  try {
    // 确保 sqlite 模块已加载
    if (!sqlite3 || !open) {
      await loadSqlite();
      // 再次检查
      if (!sqlite3 || !open) {
        console.error("sqlite 模块加载失败，无法初始化数据库");
        return;
      }
    }
    
    // 确保历史记录存储目录存在
    if (!fs.existsSync(BATTLE_HISTORY_DIR)) {
      fs.mkdirSync(BATTLE_HISTORY_DIR, { recursive: true });
    }
    
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // 创建历史记录表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS battle_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        result TEXT NOT NULL,
        player_name TEXT NOT NULL,
        player_hero TEXT NOT NULL,
        opponent_name TEXT NOT NULL,
        opponent_hero TEXT NOT NULL,
        mode TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_battle_history_user_id ON battle_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_battle_history_timestamp ON battle_history(timestamp);
    `);
    
    console.log("数据库初始化成功");
  } catch (error) {
    console.error("数据库初始化失败:", error);
  }
}

// 初始化数据库
initDatabase();
const RANK_STEP_EXP = 100;
const RANK_GAIN_WIN = 20;
const RANK_GAIN_LOSS = -10;
const RANK_INITIAL_EXP = 60;
const SECONDME_RANK_PROGRESS_KEY = "rank_progress";
const SUPPORTED_BATTLE_PLAYER_COUNTS = [5, 6, 7, 8];
const DEFAULT_BATTLE_PLAYER_COUNT = 7;
const SECONDME_MATCH_CHAT_KEY_PREFIX = "match_chat_";
const MATCH_CHAT_MAX_MESSAGES = 120;
const MATCH_CHAT_SYNC_INTERVAL_MS = 5000;
const MATCH_CHAT_RANDOM_SPEAK_INTERVAL_MS = 8000;
const LOL_RANK_DIVISIONS = ["IV", "III", "II", "I"];
const LOL_RANK_TIERS_WITH_DIVISIONS = [
  { name: "坚韧黑铁", title: "从基础开始，稳住每一回合节奏。" },
  { name: "英勇黄铜", title: "开始理解身份博弈与资源交换。" },
  { name: "不屈白银", title: "学会判断战场信息与回合价值。" },
  { name: "荣耀黄金", title: "进入熟练区间，攻防选择更关键。" },
  { name: "华贵铂金", title: "细节运营决定胜率，容错开始下降。" },
  { name: "流光翡翠", title: "协同与反制并重，局势转折更频繁。" },
  { name: "璀璨钻石", title: "高强度对局，任何失误都可能被放大。" },
];
const LOL_RANK_APEX_TIERS = [
  { name: "超凡大师", title: "突破钻石门槛，进入顶尖竞争。" },
  { name: "傲世宗师", title: "全服强者行列，博弈强度持续拉满。" },
  { name: "最强王者", title: "英雄联盟式巅峰段位，向更高积分冲刺。" },
];
const GUIDE_BEGINNER_HERO_IDS = ["华夏-大禹", "奥林匹斯-雅典娜", "凯美特-拉"];
const GUIDE_CARD_NAMES = ["神击", "神盾", "灵药", "天罚", "雷霆之怒", "神之恩典"];
const HERO_ART_META = {
  女娲: {
    culture: "上古华夏",
    lore: "常见形象为人首蛇身，与五色石补天、创造万物的母神叙事紧密相关。",
    posterLine: "五色补天 · 人首蛇身",
    sceneType: "rift-sky",
    propType: "stones",
    headType: "serpent-crown",
    bodyType: "serpent",
  },
  盘古: {
    culture: "上古华夏",
    lore: "创世巨神，经典意象是执巨斧开天辟地，分清浊、定乾坤。",
    posterLine: "开天巨斧 · 混沌初分",
    sceneType: "primordial-mountain",
    propType: "axe",
    headType: "wild-hair",
    bodyType: "giant",
  },
  伏羲: {
    culture: "上古华夏",
    lore: "人文始祖之一，常与八卦、河图洛书、教化文明等意象联系在一起。",
    posterLine: "八卦天机 · 文明初启",
    sceneType: "misty-altar",
    propType: "bagua",
    headType: "sage-crown",
    bodyType: "sage",
  },
  后羿: {
    culture: "上古华夏",
    lore: "射日英雄，最具代表性的形象是长弓挽月、九日坠空。",
    posterLine: "长弓射日 · 烈阳尽坠",
    sceneType: "sun-archery",
    propType: "bow",
    headType: "warrior-band",
    bodyType: "archer",
  },
  大禹: {
    culture: "上古华夏",
    lore: "治水圣王，形象核心在于导川分流、持圭定土、以秩序驯服洪流。",
    posterLine: "导川定土 · 镇洪安民",
    sceneType: "flood-river",
    propType: "water-scepter",
    headType: "jade-crown",
    bodyType: "king",
  },
  宙斯: {
    culture: "古希腊",
    lore: "奥林匹斯众神之王，常见图像为长袍、王冠与雷霆权能。",
    posterLine: "神王雷权 · 天穹审判",
    sceneType: "marble-storm",
    propType: "lightning",
    headType: "laurel-crown",
    bodyType: "king",
  },
  雅典娜: {
    culture: "古希腊",
    lore: "智慧与战争女神，经典意象包括科林斯头盔、长矛、埃癸斯盾与猫头鹰。",
    posterLine: "盾矛并立 · 智慧裁决",
    sceneType: "marble-storm",
    propType: "owl-spear",
    headType: "helmet",
    bodyType: "guardian",
  },
  赫拉克勒斯: {
    culture: "古希腊",
    lore: "完成十二伟绩的大力神，常见视觉符号是狮皮、木棒与极具力量感的体态。",
    posterLine: "狮皮伟绩 · 神力压阵",
    sceneType: "forge-fire",
    propType: "club",
    headType: "hero-band",
    bodyType: "giant",
  },
  普罗米修斯: {
    culture: "古希腊",
    lore: "盗火者，将火种带给人类，常与火炬、锁链和反抗精神联系在一起。",
    posterLine: "盗火之炬 · 反抗先驱",
    sceneType: "forge-fire",
    propType: "torch",
    headType: "sage-crown",
    bodyType: "sage",
  },
  波塞冬: {
    culture: "古希腊",
    lore: "海皇，标志性形象是三叉戟、浪涛与海上威权。",
    posterLine: "海皇怒潮 · 三叉镇洋",
    sceneType: "ocean-throne",
    propType: "trident",
    headType: "sea-crown",
    bodyType: "king",
  },
  梵天: {
    culture: "古印度",
    lore: "创造之神，常与莲花、经卷、宇宙创生等象征相连。",
    posterLine: "莲台创世 · 梵音初启",
    sceneType: "lotus-cosmos",
    propType: "lotus",
    headType: "multi-crown",
    bodyType: "sage",
  },
  毗湿奴: {
    culture: "古印度",
    lore: "维护之神，视觉原型常见法轮、海螺与庄严稳定的神王姿态。",
    posterLine: "法轮护世 · 化身万千",
    sceneType: "lotus-cosmos",
    propType: "chakra",
    headType: "gem-crown",
    bodyType: "guardian",
  },
  湿婆: {
    culture: "古印度",
    lore: "毁灭与再生之神，典型形象包括三叉戟、新月、火焰与舞蹈中的毁灭之力。",
    posterLine: "三叉焚世 · 毁灭新生",
    sceneType: "cosmic-fire",
    propType: "trishula",
    headType: "crescent",
    bodyType: "ascetic",
  },
  罗摩: {
    culture: "古印度",
    lore: "史诗中的理想君主，以王者弓术、正法与克己形象著称。",
    posterLine: "正法王弓 · 守序之刃",
    sceneType: "royal-court",
    propType: "prince-bow",
    headType: "royal-crown",
    bodyType: "archer",
  },
  克里希纳: {
    culture: "古印度",
    lore: "常见原型是持笛少年、孔雀羽饰与引导心灵的神圣歌声。",
    posterLine: "牧笛引魂 · 神曲迷局",
    sceneType: "lotus-cosmos",
    propType: "flute",
    headType: "peacock",
    bodyType: "sage",
  },
  拉: {
    culture: "古埃及",
    lore: "太阳神，最具代表性的图像是太阳圆盘、日舟与隼首神王威仪。",
    posterLine: "日轮巡天 · 神舟照世",
    sceneType: "sun-temple",
    propType: "sun-disk",
    headType: "solar-crown",
    bodyType: "falcon-royal",
  },
  奥西里斯: {
    culture: "古埃及",
    lore: "冥界与复生之主，传统形象多为木乃伊式躯体、王杖与连枷。",
    posterLine: "冥界王杖 · 不朽重生",
    sceneType: "underworld-desert",
    propType: "crook-flail",
    headType: "atef",
    bodyType: "mummy-king",
  },
  伊西斯: {
    culture: "古埃及",
    lore: "魔法与庇护女神，常与展开双翼、王座冠饰和疗愈仪式相连。",
    posterLine: "神翼庇护 · 魔法回收",
    sceneType: "sun-temple",
    propType: "wings",
    headType: "throne-crown",
    bodyType: "guardian",
  },
  荷鲁斯: {
    culture: "古埃及",
    lore: "复仇与王权的象征，隼首、长矛与太阳权柄是其标志形象。",
    posterLine: "隼目追猎 · 王权复仇",
    sceneType: "sun-temple",
    propType: "falcon-spear",
    headType: "falcon-crest",
    bodyType: "guardian",
  },
  阿努比斯: {
    culture: "古埃及",
    lore: "死者引导与审判者，经典视觉是胡狼首、权杖与灵魂衡量。",
    posterLine: "胡狼审判 · 冥途引魂",
    sceneType: "underworld-desert",
    propType: "scales-staff",
    headType: "jackal",
    bodyType: "guardian",
  },
  奥丁: {
    culture: "古北欧",
    lore: "众神之父，常与独眼、双鸦、长枪与求知的牺牲精神相连。",
    posterLine: "独眼神主 · 乌鸦长枪",
    sceneType: "rune-fjord",
    propType: "gungnir",
    headType: "hooded-crown",
    bodyType: "sage",
  },
  索尔: {
    culture: "古北欧",
    lore: "雷神，最鲜明的意象是雷锤、风暴与近身压制性的蛮勇。",
    posterLine: "雷锤裂空 · 风暴压阵",
    sceneType: "rune-fjord",
    propType: "hammer",
    headType: "warrior-band",
    bodyType: "giant",
  },
  洛基: {
    culture: "古北欧",
    lore: "诡计之神，视觉上更适合呈现阴影、蛇形纹饰与多重身份感。",
    posterLine: "诡计迷雾 · 伪形乱局",
    sceneType: "shadow-hall",
    propType: "dagger",
    headType: "horned",
    bodyType: "rogue",
  },
  弗雷: {
    culture: "古北欧",
    lore: "丰饶之神，通常与收获、金色阳光、神猪和安定繁盛的土地联系在一起。",
    posterLine: "丰饶金穗 · 回春赐福",
    sceneType: "harvest-meadow",
    propType: "harvest-blade",
    headType: "leaf-crown",
    bodyType: "guardian",
  },
  提尔: {
    culture: "古北欧",
    lore: "战争与誓约之神，常以断腕、持剑与刚正不退的战士形象出现。",
    posterLine: "断腕立誓 · 战神赴命",
    sceneType: "rune-fjord",
    propType: "sword",
    headType: "helmet",
    bodyType: "warrior",
  },
};

function createRankProgress(score = RANK_INITIAL_EXP) {
  return {
    score: Math.max(0, Number(score) || 0),
    updatedAt: Date.now(),
  };
}

function getRankMeta(scoreInput = 0) {
  const safeScore = Math.max(0, Math.floor(Number(scoreInput) || 0));
  const baseTierCount = LOL_RANK_TIERS_WITH_DIVISIONS.length;
  const baseStageCount = baseTierCount * LOL_RANK_DIVISIONS.length;
  const baseScoreCap = baseStageCount * RANK_STEP_EXP;
  const masterStartScore = baseScoreCap;
  const grandmasterStartScore = masterStartScore + RANK_STEP_EXP;
  const challengerStartScore = grandmasterStartScore + RANK_STEP_EXP;

  let tierIndex = 0;
  let phaseIndex = 0;
  let tierName = "";
  let tierTitle = "";
  let phaseLabel = "";
  let display = "";
  let shortDisplay = "";
  let progress = 0;
  let progressMax = RANK_STEP_EXP;
  let isMax = false;

  if (safeScore < baseScoreCap) {
    const stageIndex = Math.floor(safeScore / RANK_STEP_EXP);
    tierIndex = Math.min(baseTierCount - 1, Math.floor(stageIndex / LOL_RANK_DIVISIONS.length));
    phaseIndex = stageIndex % LOL_RANK_DIVISIONS.length;
    const tier = LOL_RANK_TIERS_WITH_DIVISIONS[tierIndex];
    phaseLabel = LOL_RANK_DIVISIONS[phaseIndex];
    tierName = tier.name;
    tierTitle = tier.title;
    progress = safeScore % RANK_STEP_EXP;
    display = `${tier.name} ${phaseLabel}`;
    shortDisplay = `${tier.name}${phaseLabel}`;
  } else if (safeScore < grandmasterStartScore) {
    const tier = LOL_RANK_APEX_TIERS[0];
    tierIndex = baseTierCount;
    phaseIndex = -1;
    tierName = tier.name;
    tierTitle = tier.title;
    progress = safeScore - masterStartScore;
    display = `${tier.name} ${progress} LP`;
    shortDisplay = tier.name;
  } else if (safeScore < challengerStartScore) {
    const tier = LOL_RANK_APEX_TIERS[1];
    tierIndex = baseTierCount + 1;
    phaseIndex = -1;
    tierName = tier.name;
    tierTitle = tier.title;
    progress = safeScore - grandmasterStartScore;
    display = `${tier.name} ${progress} LP`;
    shortDisplay = tier.name;
  } else {
    const tier = LOL_RANK_APEX_TIERS[2];
    tierIndex = baseTierCount + 2;
    phaseIndex = -1;
    tierName = tier.name;
    tierTitle = tier.title;
    phaseLabel = "巅峰";
    progress = safeScore - challengerStartScore;
    progressMax = Math.max(RANK_STEP_EXP, Math.ceil((progress + 1) / RANK_STEP_EXP) * RANK_STEP_EXP);
    display = `${tier.name} ${progress} LP`;
    shortDisplay = tier.name;
  }

  return {
    score: safeScore,
    tierIndex,
    phaseIndex,
    tierName,
    tierTitle,
    phaseLabel,
    display,
    shortDisplay,
    progress,
    progressMax,
    isMax,
    gainWin: RANK_GAIN_WIN,
    losePenalty: Math.abs(RANK_GAIN_LOSS),
  };
}

function ensureRankProgress(session) {
  if (!session.rankProgress) session.rankProgress = createRankProgress();
  return session.rankProgress;
}

function createAnonymousSession() {
  return {
    user: null,
    token: null,
    rankProgress: createRankProgress(),
    createdAt: Date.now(),
  };
}

const gameData = [
  {
    faction: "华夏",
    icon: "炎",
    color: "#d12a2a",
    trait: "天命",
    traitDesc: "当你成为同势力角色的目标时，你可以摸一张牌。",
    heroes: [
      { name: "女娲", hp: 3, title: "大地之母", skill: "补天", role: "强力辅助/回复" },
      { name: "盘古", hp: 4, title: "创世神", skill: "开天", role: "坦克/遗计流" },
      { name: "伏羲", hp: 3, title: "人文始祖", skill: "画卦", role: "爆发/赌狗流" },
      { name: "后羿", hp: 4, title: "射日神将", skill: "射日", role: "强命/输出核心" },
      { name: "大禹", hp: 4, title: "治水圣王", skill: "疏导", role: "防御/过牌流" },
    ],
  },
  {
    faction: "奥林匹斯",
    icon: "海",
    color: "#1f6eea",
    trait: "神性",
    traitDesc: "锁定技，你的手牌上限+1。",
    heroes: [
      { name: "宙斯", hp: 4, title: "众神之王", skill: "雷霆", role: "爆发/无视防具" },
      { name: "雅典娜", hp: 3, title: "智慧女神", skill: "智慧", role: "控顶/辅助" },
      { name: "赫拉克勒斯", hp: 4, title: "大力神", skill: "伟绩", role: "压制/高爆发" },
      { name: "普罗米修斯", hp: 3, title: "盗火者", skill: "盗火", role: "团队润滑剂" },
      { name: "波塞冬", hp: 4, title: "海皇", skill: "海啸", role: "反伤/威慑流" },
    ],
  },
  {
    faction: "吠陀",
    icon: "梵",
    color: "#7d3bd6",
    trait: "轮回",
    traitDesc: "当你死亡时，你可以展示牌堆顶的一张牌，若为红色，你将体力回复至1点。",
    heroes: [
      { name: "梵天", hp: 3, title: "创造之神", skill: "创世", role: "复活辅助/限定技" },
      { name: "毗湿奴", hp: 4, title: "维护之神", skill: "化身", role: "生存/随机应变" },
      { name: "湿婆", hp: 4, title: "毁灭之神", skill: "毁灭", role: "自残/AOE爆发" },
      { name: "罗摩", hp: 4, title: "完美君主", skill: "正法", role: "绝对防御/存牌流" },
      { name: "克里希纳", hp: 3, title: "神曲歌者", skill: "神曲", role: "控制/心理博弈" },
    ],
  },
  {
    faction: "凯美特",
    icon: "日",
    color: "#d4aa12",
    trait: "永生",
    traitDesc: "准备阶段，若你的体力值小于体力上限，你可以回复1点体力。",
    heroes: [
      { name: "拉", hp: 3, title: "太阳神", skill: "日升", role: "过牌/资源压制" },
      { name: "奥西里斯", hp: 4, title: "冥界之主", skill: "复活", role: "概率复活/坦克" },
      { name: "伊西斯", hp: 3, title: "魔法女神", skill: "魔法", role: "资源回收/控场" },
      { name: "荷鲁斯", hp: 4, title: "复仇之神", skill: "复仇", role: "追击/增伤流" },
      { name: "阿努比斯", hp: 4, title: "死神", skill: "审判", role: "死亡收益/干扰" },
    ],
  },
  {
    faction: "阿斯加德",
    icon: "霜",
    color: "#151515",
    trait: "狂战",
    traitDesc: "出牌阶段，你可以失去1点体力，本回合你的【杀】伤害+1。",
    heroes: [
      { name: "奥丁", hp: 4, title: "众神之父", skill: "智慧", role: "卖血/全图攻击" },
      { name: "索尔", hp: 4, title: "雷神", skill: "雷锤", role: "强命/压制防御" },
      { name: "洛基", hp: 3, title: "诡计之神", skill: "诡计", role: "转移伤害/混乱" },
      { name: "弗雷", hp: 4, title: "丰饶之神", skill: "丰饶", role: "资源转化/急救" },
      { name: "提尔", hp: 4, title: "战争之神", skill: "断腕", role: "卖血/过牌" },
    ],
  },
];

const cardData = [
  {
    category: "神迹牌",
    subType: "基础行动",
    originalName: "杀",
    newName: "神击",
    quantity: "12张",
    suit: "多种",
    effect: "出牌阶段，对攻击范围内一名其他角色使用，目标需打出【神盾】，否则受到1点伤害。",
    design: "代表一次主动攻击行为，无论是物理攻击还是神术打击。",
  },
  {
    category: "神迹牌",
    subType: "基础行动",
    originalName: "闪",
    newName: "神盾",
    quantity: "8张",
    suit: "多种",
    effect: "成为【神击】的目标时，可以打出，抵消此【神击】的效果。",
    design: "象征神话中的防御能力，可理解为盾牌、神障或闪避。",
  },
  {
    category: "神迹牌",
    subType: "基础行动",
    originalName: "桃",
    newName: "灵药",
    quantity: "3张",
    suit: "多种",
    effect: "出牌阶段，使用此牌回复1点体力；或于角色濒死时使用，令其回复至1点体力。",
    design: "对应神话中的神食、仙丹与治愈圣物。",
  },
  {
    category: "神迹牌",
    subType: "基础行动",
    originalName: "祭",
    newName: "神迹",
    quantity: "1张",
    suit: "黑桃/梅花",
    effect: "出牌阶段，弃置此牌并二选一：1. 摸两张牌；2. 令一名其他角色失去1点体力。",
    design: "代表向神明祈求奇迹带来的交换与代价。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "天火",
    newName: "天罚",
    quantity: "1张",
    suit: "黑桃A",
    effect: "对一名其他角色使用。其选择：1. 受到你造成的2点火焰伤害；2. 弃置所有手牌。",
    design: "来自上天的审判，极高压迫感。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "神谕",
    newName: "神谕",
    quantity: "2张",
    suit: "红桃K",
    effect: "对一名其他角色使用。观看其手牌，然后你可获得其中一张，或令其摸一张牌。",
    design: "神明启示与信息博弈并存。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "移形换影",
    newName: "混沌漩涡",
    quantity: "2张",
    suit: "方块Q",
    effect: "选择两名其他角色，交换他们区域内所有牌（手牌、装备区、判定区）。",
    design: "打乱秩序，形成高变数局面。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "诸神黄昏",
    newName: "诸神黄昏",
    quantity: "1张",
    suit: "黑桃K",
    effect: "对所有其他角色使用。你失去1点体力，然后所有其他角色各受到1点伤害。",
    design: "北欧终局灾变，群体压血利器。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "命运纺锤",
    newName: "命运纺锤",
    quantity: "2张",
    suit: "梅花J",
    effect: "对一名其他角色使用。其判定：红色则你获得其一张牌；黑色则其摸两张牌。",
    design: "命运三女神式的风险收益牌。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "智慧之泉",
    newName: "智慧之泉",
    quantity: "2张",
    suit: "梅花Q",
    effect: "对自己使用。你失去1点体力，然后摸三张牌。",
    design: "以生命换知识，典型卖血过牌。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "亡灵契约",
    newName: "冥河契约",
    quantity: "2张",
    suit: "黑桃Q",
    effect: "对自己使用。获得弃牌堆三张牌，然后将其中一张置于牌堆顶。",
    design: "资源回收与牌堆操控并重。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "雷霆一击",
    newName: "雷霆之怒",
    quantity: "2张",
    suit: "黑桃10",
    effect: "对一名其他角色使用。目标需连续打出两张【神盾】，否则受到1点雷电伤害。",
    design: "强制防御消耗，压缩对手资源。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "神圣庇护",
    newName: "神之恩典",
    quantity: "2张",
    suit: "红桃A",
    effect: "当一名角色成为【神击】或命运牌目标时使用，抵消该牌效果，然后其摸一张牌。",
    design: "神明护佑，兼具防守和节奏修复。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "丰饶之角",
    newName: "丰饶之角",
    quantity: "2张",
    suit: "方块A",
    effect: "对自己使用。回复1点体力，然后摸一张牌。",
    design: "简单稳定的续航牌。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "潘多拉魔盒",
    newName: "潘多拉魔盒",
    quantity: "2张",
    suit: "黑桃2",
    effect: "置于一名其他角色判定区。判定阶段，若结果不为红桃，该角色受到2点伤害。",
    design: "高伤害定时威胁。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "斯芬克斯之谜",
    newName: "斯芬克斯之谜",
    quantity: "2张",
    suit: "梅花2",
    effect: "置于一名其他角色判定区。判定阶段，若结果不为方块，该角色跳过出牌阶段。",
    design: "干扰回合节奏的经典控制牌。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "世界树的根须",
    newName: "世界树之缚",
    quantity: "2张",
    suit: "梅花3",
    effect: "置于一名其他角色判定区。判定阶段，若结果不为黑桃，该角色本回合【神击】无距离限制且伤害+1。",
    design: "束缚与狂化并存的双刃效果。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "雷神之锤",
    newName: "雷神之锤",
    quantity: "1件",
    suit: "装备",
    range: "2",
    effect: "锁定技，你使用的【神击】不可被【神盾】响应，除非目标角色弃置两张手牌。",
    design: "索尔标志性神兵，强拆防御。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "冈格尼尔",
    newName: "永恒之枪",
    quantity: "1件",
    suit: "装备",
    range: "3",
    effect: "锁定技，你使用的【神击】伤害+1；当你以【神击】造成伤害后，摸一张牌。",
    design: "高压输出与滚雪球并存。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "阿努比斯之刃",
    newName: "审判之刃",
    quantity: "1件",
    suit: "装备",
    range: "2",
    effect: "锁定技，你使用的【神击】对体力值不大于你的角色伤害+1。",
    design: "处决线武器，利于收割。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "埃吉斯之盾",
    newName: "神盾·埃吉斯",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，当你成为【神击】目标时，你摸一张牌。",
    design: "把防守转化为资源优势。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "冥河渡船",
    newName: "冥河渡船",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，其他角色计算与你的距离时，始终+1。",
    design: "增强生存与防贴身压制。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "世界树的枝干",
    newName: "世界树之佑",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，当你受到伤害时，可防止此伤害，然后失去1点体力。",
    design: "将爆发伤害平滑为可控血量损失。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "八足天马斯莱普尼尔",
    newName: "神驹·斯莱普尼尔",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技（+1马），其他角色计算与你的距离时，始终+1。",
    design: "强化防御距离。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "日车",
    newName: "神驹·日车",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技（-1马），你计算与其他角色的距离时，始终-1。",
    design: "提升进攻覆盖范围。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "芬里尔的獠牙",
    newName: "神驹·芬里尔",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技（-1马），你使用的【神击】无距离限制。",
    design: "极限追杀坐骑。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "智慧之泉",
    newName: "圣物·智慧之泉",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，回合开始阶段，你可观看牌堆顶三张牌，并将任意牌置于牌堆顶或底。",
    design: "顶牌操控核心。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "丰饶之角",
    newName: "圣物·丰饶之角",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，回合结束阶段，你摸一张牌。",
    design: "稳定资源补给。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "命运纺锤",
    newName: "圣物·命运纺锤",
    quantity: "1件",
    suit: "装备",
    effect: "锁定技，当你受到伤害时可判定，若结果为红色，防止此伤害。",
    design: "判定型防护圣物。",
  },
];

const heroArtSvgCache = new Map();
const cardArtSvgCache = new Map();
let heroListCache = null;
let cardListCache = null;

function findHeroById(heroId) {
  const [factionName, heroName] = String(heroId || "").split("-");
  if (!factionName || !heroName) return null;
  const faction = gameData.find((item) => item.faction === factionName);
  if (!faction) return null;
  const hero = faction.heroes.find((item) => item.name === heroName);
  if (!hero) return null;
  return { faction, hero };
}

function findCardById(cardId) {
  const [category, cardName] = String(cardId || "").split("-");
  if (!category || !cardName) return null;
  return cardData.find((item) => item.category === category && item.newName === cardName) || null;
}

function getHeroAvatarSvgById(heroId) {
  if (!heroId) return "";
  if (heroArtSvgCache.has(heroId)) return heroArtSvgCache.get(heroId);
  const found = findHeroById(heroId);
  if (!found) return "";
  const svg = buildHeroAvatarSvg(found.hero.name, found.faction.faction, found.hero.title, found.hero.skill);
  heroArtSvgCache.set(heroId, svg);
  return svg;
}

function getCardAvatarSvgById(cardId) {
  if (!cardId) return "";
  if (cardArtSvgCache.has(cardId)) return cardArtSvgCache.get(cardId);
  const card = findCardById(cardId);
  if (!card) return "";
  const svg = buildCardAvatarSvg(card.newName, card.category, card.subType, card.effect);
  cardArtSvgCache.set(cardId, svg);
  return svg;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const pairs = header
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function isSecureRequest(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0];
  return forwardedProto === "https" || Boolean(process.env.VERCEL);
}

function shouldUseCookieSession(req) {
  // 在本地开发环境中也使用 cookie 存储会话
  return !redisEnabled;
}

function sessionCipherKey() {
  return crypto.createHash("sha256").update(SESSION_SECRET || SECONDME_CLIENT_SECRET || "shenji-duel-session").digest();
}

function pickUserSnapshot(user) {
  if (!user || typeof user !== "object") return null;
  const keys = [
    "id",
    "uid",
    "userId",
    "oauthId",
    "nickname",
    "name",
    "displayName",
    "avatar",
    "avatarUrl",
    "headImg",
    "bio",
    "intro",
    "signature",
    "city",
    "country",
    "language",
  ];
  return Object.fromEntries(keys.map((key) => [key, user[key]]).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function pickSessionSnapshot(session) {
  return {
    user: pickUserSnapshot(session?.user),
    token: session?.token
      ? {
          accessToken: session.token.accessToken,
          refreshToken: session.token.refreshToken,
          tokenType: session.token.tokenType,
          expiresIn: session.token.expiresIn,
          scope: session.token.scope,
        }
      : null,
    rankProgress: ensureRankProgress(session || createAnonymousSession()),
    battleHistory: session?.battleHistory || [],
    createdAt: session?.createdAt || Date.now(),
  };
}

function sealSessionCookie(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(pickSessionSnapshot(session)), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function unsealSessionCookie(payload) {
  try {
    const buffer = Buffer.from(String(payload || ""), "base64url");
    if (buffer.length < 29) return null;
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", sessionCipherKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const session = JSON.parse(json);
    if (session) ensureRankProgress(session);
    return session;
  } catch {
    return null;
  }
}

function setCookie(res, key, value, maxAgeSec, options = {}) {
  const secure = options.secure ? "; Secure" : "";
  const nextValue = `${key}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", nextValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, nextValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing, nextValue]);
}

function clearCookie(res, key, options = {}) {
  const secure = options.secure ? "; Secure" : "";
  const nextValue = `${key}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", nextValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, nextValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing, nextValue]);
}

async function redisCommand(command) {
  if (!redisEnabled) return null;
  const resp = await fetch(UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json || json.error) {
    throw new Error(json?.error || `Redis command failed: ${command[0]}`);
  }
  return json.result;
}

async function getStoredSession(sid) {
  if (!sid) return null;
  if (!redisEnabled) {
    const session = sessions.get(sid) || null;
    if (session) ensureRankProgress(session);
    return session;
  }
  try {
    const raw = await redisCommand(["GET", `session:${sid}`]);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session) {
      if (!Array.isArray(session.friends)) session.friends = [];
      ensureRankProgress(session);
    }
    return session;
  } catch {
    return sessions.get(sid) || null;
  }
}

async function saveStoredSession(sid, session) {
  ensureRankProgress(session);
  sessions.set(sid, session);
  if (!redisEnabled) return;
  try {
    await redisCommand(["SET", `session:${sid}`, JSON.stringify(session), "EX", String(SESSION_TTL_SEC)]);
    const stableId = getStableUserId(session.user);
    if (stableId) {
      await redisCommand(["SET", `user-session:${stableId}`, sid, "EX", String(SESSION_TTL_SEC)]);
    }
  } catch {
    return;
  }
}

async function persistSession(req, res, sid, session) {
  ensureRankProgress(session);
  if (shouldUseCookieSession(req)) {
    setCookie(res, SESSION_COOKIE_NAME, sealSessionCookie(session), SESSION_TTL_SEC, { secure: isSecureRequest(req) });
    clearCookie(res, "sid", { secure: isSecureRequest(req) });
    return;
  }
  await saveStoredSession(sid, session);
  setCookie(res, "sid", sid, SESSION_TTL_SEC, { secure: isSecureRequest(req) });
}

async function deleteStoredSession(sid) {
  if (!sid) return;
  const existing = await getStoredSession(sid);
  sessions.delete(sid);
  if (!redisEnabled) return;
  try {
    await redisCommand(["DEL", `session:${sid}`]);
    const stableId = getStableUserId(existing?.user);
    if (stableId) {
      await redisCommand(["DEL", `user-session:${stableId}`]);
    }
  } catch {
    return;
  }
}

async function findStoredSessionByUser(user) {
  const stableId = getStableUserId(user);
  if (!stableId) return null;
  if (!redisEnabled) {
    for (const session of sessions.values()) {
      if (getStableUserId(session?.user) === stableId) return session;
    }
    return null;
  }
  try {
    const sid = await redisCommand(["GET", `user-session:${stableId}`]);
    if (!sid) return null;
    return await getStoredSession(String(sid));
  } catch {
    for (const session of sessions.values()) {
      if (getStableUserId(session?.user) === stableId) return session;
    }
    return null;
  }
}

async function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const sealedSession = cookies[SESSION_COOKIE_NAME] || "";
  if (sealedSession) {
    const session = unsealSessionCookie(sealedSession);
    if (session) {
      ensureRankProgress(session);
      return { cookies, sid: "", session };
    }
  }
  const sid = cookies.sid || "";
  const session = sid ? await getStoredSession(sid) : null;
  if (session) {
    ensureRankProgress(session);
  }
  return { cookies, sid, session };
}

async function getOrCreateSession(req, res) {
  const { cookies, sid, session } = await getSessionFromRequest(req);
  if (session) return { cookies, sid, session };
  const nextSid = crypto.randomBytes(24).toString("hex");
  const nextSession = createAnonymousSession();
  await persistSession(req, res, nextSid, nextSession);
  return { cookies, sid: nextSid, session: nextSession };
}

function requireConfig(res) {
  const missing = [];
  if (!SECONDME_CLIENT_ID) missing.push("SECONDME_CLIENT_ID");
  if (!SECONDME_CLIENT_SECRET) missing.push("SECONDME_CLIENT_SECRET");
  if (!SECONDME_REDIRECT_URI) missing.push("SECONDME_REDIRECT_URI");
  if (missing.length > 0) {
    res.status(500).send(`
      <h1>Missing env vars</h1>
      <p>Please configure: ${missing.join(", ")}</p>
      <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill values.</p>
    `);
    return false;
  }
  return true;
}

function getUserAvatarUrl(user) {
  if (user && typeof user === "object") {
    const candidate = user.avatar || user.avatarUrl || user.headImg || user.headimg || user.image;
    if (candidate) return candidate;
  }
  // 使用默认头像
  return "/assets/bg-myth-war.png";
}

function svgToDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getHeroArtMeta(heroName, factionName, title = "", skill = "") {
  return (
    HERO_ART_META[heroName] || {
      culture: factionName,
      lore: `${heroName}的神话形象以${title}与技能【${skill}】为主线。`,
      posterLine: `${title} · ${skill}`,
      sceneType: "misty-altar",
      propType: "default",
      headType: "sage-crown",
      bodyType: "guardian",
    }
  );
}

function getHeroIntro(heroName, factionName, title, skill, role) {
  const meta = getHeroArtMeta(heroName, factionName, title, skill);
  return `${heroName}，${title}。${meta.lore} 在本作中，这一文化原型被转化为${role}定位，并通过【${skill}】形成对应的战术表达。`;
}

function heroVisualTheme(factionName) {
  if (factionName === "华夏") return { c1: "#7f1d1d", c2: "#ef4444", c3: "#fecaca", icon: "炎" };
  if (factionName === "奥林匹斯") return { c1: "#1e3a8a", c2: "#3b82f6", c3: "#bfdbfe", icon: "海" };
  if (factionName === "吠陀") return { c1: "#4c1d95", c2: "#8b5cf6", c3: "#ddd6fe", icon: "梵" };
  if (factionName === "凯美特") return { c1: "#78350f", c2: "#f59e0b", c3: "#fde68a", icon: "日" };
  return { c1: "#111827", c2: "#4b5563", c3: "#e5e7eb", icon: "霜" };
}

function heroSceneArt(meta, t) {
  switch (meta.sceneType) {
    case "rift-sky":
      return `
        <path d="M0 426 C102 362 196 346 300 376 C398 404 508 390 640 338 L640 640 L0 640 Z" fill="rgba(16,8,10,.62)"/>
        <path d="M80 126 C134 84 178 104 206 152 C232 198 268 216 320 194 C374 172 408 122 458 104 C514 84 560 112 606 156" fill="none" stroke="${t.c3}" stroke-opacity="0.28" stroke-width="8"/>
        <path d="M312 48 L336 106 L312 178 L336 244" fill="none" stroke="${t.c3}" stroke-opacity="0.42" stroke-width="10" stroke-linecap="round"/>
      `;
    case "primordial-mountain":
      return `
        <path d="M0 448 C122 392 232 372 330 406 C424 438 522 424 640 374 L640 640 L0 640 Z" fill="rgba(12,9,8,.62)"/>
        <path d="M92 322 L196 138 L288 322 Z" fill="${t.c3}" fill-opacity="0.16"/>
        <path d="M344 316 L470 98 L592 316 Z" fill="${t.c3}" fill-opacity="0.12"/>
      `;
    case "misty-altar":
      return `
        <path d="M0 440 C122 388 224 382 318 410 C412 438 516 426 640 380 L640 640 L0 640 Z" fill="rgba(10,12,22,.62)"/>
        <circle cx="506" cy="138" r="84" fill="${t.c3}" fill-opacity="0.14"/>
        <circle cx="506" cy="138" r="126" fill="none" stroke="${t.c3}" stroke-opacity="0.18" stroke-width="5"/>
        <rect x="128" y="272" width="364" height="18" rx="9" fill="${t.c3}" fill-opacity="0.12"/>
      `;
    case "sun-archery":
      return `
        <path d="M0 434 C102 386 210 382 316 412 C422 442 520 432 640 390 L640 640 L0 640 Z" fill="rgba(18,9,6,.62)"/>
        <circle cx="480" cy="124" r="52" fill="${t.c3}" fill-opacity="0.22"/>
        <circle cx="556" cy="144" r="30" fill="${t.c3}" fill-opacity="0.16"/>
        <circle cx="406" cy="154" r="26" fill="${t.c3}" fill-opacity="0.16"/>
      `;
    case "flood-river":
      return `
        <path d="M0 434 C124 402 212 384 308 400 C412 418 524 410 640 376 L640 640 L0 640 Z" fill="rgba(5,9,18,.66)"/>
        <path d="M0 342 C84 318 144 324 218 346 C292 368 346 366 418 340 C492 314 562 316 640 344" fill="none" stroke="${t.c3}" stroke-opacity="0.24" stroke-width="12"/>
        <path d="M0 384 C90 356 154 360 236 386 C314 410 378 410 454 380 C530 350 592 350 640 364" fill="none" stroke="${t.c3}" stroke-opacity="0.18" stroke-width="9"/>
      `;
    case "marble-storm":
      return `
        <path d="M0 438 C126 394 212 392 304 422 C404 454 518 446 640 394 L640 640 L0 640 Z" fill="rgba(8,12,22,.64)"/>
        <rect x="82" y="140" width="26" height="198" rx="13" fill="${t.c3}" fill-opacity="0.18"/>
        <rect x="136" y="108" width="26" height="230" rx="13" fill="${t.c3}" fill-opacity="0.16"/>
        <rect x="486" y="122" width="26" height="218" rx="13" fill="${t.c3}" fill-opacity="0.16"/>
        <rect x="540" y="156" width="26" height="184" rx="13" fill="${t.c3}" fill-opacity="0.18"/>
      `;
    case "forge-fire":
      return `
        <path d="M0 446 C130 398 212 398 306 430 C410 464 512 454 640 392 L640 640 L0 640 Z" fill="rgba(20,11,7,.66)"/>
        <circle cx="146" cy="162" r="48" fill="${t.c3}" fill-opacity="0.16"/>
        <circle cx="486" cy="124" r="64" fill="${t.c3}" fill-opacity="0.16"/>
        <path d="M244 292 L308 178 L372 292" fill="${t.c3}" fill-opacity="0.12"/>
      `;
    case "ocean-throne":
      return `
        <path d="M0 434 C116 394 214 390 308 418 C408 446 520 438 640 384 L640 640 L0 640 Z" fill="rgba(6,10,24,.66)"/>
        <path d="M32 324 C110 286 198 288 278 322 C354 354 444 352 526 316 C566 298 600 292 640 300" fill="none" stroke="${t.c3}" stroke-opacity="0.22" stroke-width="11"/>
        <path d="M70 358 C150 326 234 326 316 360 C390 392 472 390 548 360" fill="none" stroke="${t.c3}" stroke-opacity="0.16" stroke-width="8"/>
      `;
    case "lotus-cosmos":
      return `
        <path d="M0 436 C120 390 212 378 318 404 C420 430 522 420 640 378 L640 640 L0 640 Z" fill="rgba(11,7,24,.66)"/>
        <circle cx="500" cy="128" r="66" fill="${t.c3}" fill-opacity="0.16"/>
        <circle cx="500" cy="128" r="108" fill="none" stroke="${t.c3}" stroke-opacity="0.2" stroke-width="5"/>
        <path d="M228 284 C264 238 300 238 338 284 C302 306 262 306 228 284 Z" fill="${t.c3}" fill-opacity="0.15"/>
      `;
    case "cosmic-fire":
      return `
        <path d="M0 438 C118 394 220 390 314 420 C410 450 518 438 640 388 L640 640 L0 640 Z" fill="rgba(16,6,14,.68)"/>
        <path d="M116 302 C144 252 176 234 190 192 C210 226 234 250 262 276 C230 284 196 298 168 326 Z" fill="${t.c3}" fill-opacity="0.18"/>
        <path d="M470 300 C502 242 526 232 544 184 C566 222 590 250 620 286 C586 290 546 304 514 332 Z" fill="${t.c3}" fill-opacity="0.2"/>
      `;
    case "royal-court":
      return `
        <path d="M0 438 C130 398 210 392 302 418 C400 446 518 440 640 390 L640 640 L0 640 Z" fill="rgba(18,11,10,.64)"/>
        <rect x="128" y="154" width="380" height="18" rx="9" fill="${t.c3}" fill-opacity="0.12"/>
        <rect x="160" y="172" width="24" height="154" rx="12" fill="${t.c3}" fill-opacity="0.16"/>
        <rect x="456" y="172" width="24" height="154" rx="12" fill="${t.c3}" fill-opacity="0.16"/>
      `;
    case "sun-temple":
      return `
        <path d="M0 446 C126 406 210 398 308 426 C406 454 514 446 640 392 L640 640 L0 640 Z" fill="rgba(18,14,7,.66)"/>
        <circle cx="492" cy="116" r="60" fill="${t.c3}" fill-opacity="0.18"/>
        <path d="M78 318 L146 176 L214 318 Z" fill="${t.c3}" fill-opacity="0.14"/>
        <path d="M442 328 L534 144 L610 328 Z" fill="${t.c3}" fill-opacity="0.16"/>
      `;
    case "underworld-desert":
      return `
        <path d="M0 446 C130 404 220 396 312 422 C410 450 520 442 640 392 L640 640 L0 640 Z" fill="rgba(18,13,7,.68)"/>
        <path d="M70 328 L148 174 L214 328 Z" fill="${t.c3}" fill-opacity="0.12"/>
        <path d="M440 328 L514 162 L586 328 Z" fill="${t.c3}" fill-opacity="0.14"/>
        <circle cx="482" cy="118" r="52" fill="${t.c3}" fill-opacity="0.14"/>
      `;
    case "rune-fjord":
      return `
        <path d="M0 440 C120 390 218 384 320 414 C422 444 526 434 640 386 L640 640 L0 640 Z" fill="rgba(8,10,16,.7)"/>
        <path d="M92 326 L170 170 L238 326 Z" fill="${t.c3}" fill-opacity="0.12"/>
        <path d="M416 324 L500 156 L590 324 Z" fill="${t.c3}" fill-opacity="0.14"/>
        <path d="M514 86 L526 104 L548 108 L534 126 L538 150 L514 140 L490 150 L494 126 L480 108 L502 104 Z" fill="${t.c3}" fill-opacity="0.16"/>
      `;
    case "shadow-hall":
      return `
        <path d="M0 440 C120 394 220 390 314 420 C414 452 522 438 640 388 L640 640 L0 640 Z" fill="rgba(7,9,18,.72)"/>
        <path d="M108 154 C146 126 184 134 220 172" fill="none" stroke="${t.c3}" stroke-opacity="0.14" stroke-width="6"/>
        <path d="M438 138 C480 116 518 126 560 170" fill="none" stroke="${t.c3}" stroke-opacity="0.16" stroke-width="6"/>
      `;
    case "harvest-meadow":
      return `
        <path d="M0 446 C120 404 224 396 322 424 C420 452 526 442 640 394 L640 640 L0 640 Z" fill="rgba(16,14,8,.66)"/>
        <path d="M130 354 C136 318 140 286 144 252 M160 356 C166 316 172 280 176 244 M190 356 C198 316 204 284 208 248" stroke="${t.c3}" stroke-opacity="0.24" stroke-width="6" stroke-linecap="round"/>
        <circle cx="486" cy="136" r="66" fill="${t.c3}" fill-opacity="0.14"/>
      `;
    default:
      return `
        <path d="M0 438 C126 390 212 384 318 414 C424 444 520 436 640 390 L640 640 L0 640 Z" fill="rgba(8,10,16,.66)"/>
        <circle cx="502" cy="132" r="58" fill="${t.c3}" fill-opacity="0.16"/>
      `;
  }
}

function heroHeadArt(meta, t) {
  switch (meta.headType) {
    case "serpent-crown":
      return `<path d="M272 176 C294 134 346 134 368 176 C354 170 340 166 320 166 C300 166 286 170 272 176 Z" fill="${t.c3}" fill-opacity="0.72"/>`;
    case "helmet":
      return `<path d="M254 230 C258 164 296 130 320 130 C344 130 382 164 386 230 C360 214 284 214 254 230 Z" fill="#d8dbe4" fill-opacity="0.55"/>`;
    case "solar-crown":
      return `<circle cx="320" cy="154" r="42" fill="${t.c3}" fill-opacity="0.34"/><circle cx="320" cy="154" r="66" fill="none" stroke="${t.c3}" stroke-opacity="0.5" stroke-width="6"/>`;
    case "jackal":
      return `<path d="M270 178 L286 134 L304 178 M336 178 L354 134 L370 178" stroke="${t.c3}" stroke-opacity="0.7" stroke-width="10" stroke-linecap="round"/>`;
    case "falcon-crest":
    case "falcon-royal":
      return `<path d="M274 188 C300 150 340 148 370 188 C346 178 328 174 320 174 C312 174 294 178 274 188 Z" fill="${t.c3}" fill-opacity="0.62"/>`;
    case "atef":
      return `<rect x="304" y="126" width="32" height="78" rx="14" fill="${t.c3}" fill-opacity="0.34"/><ellipse cx="286" cy="160" rx="20" ry="46" fill="none" stroke="${t.c3}" stroke-opacity="0.5" stroke-width="5"/><ellipse cx="354" cy="160" rx="20" ry="46" fill="none" stroke="${t.c3}" stroke-opacity="0.5" stroke-width="5"/>`;
    case "throne-crown":
      return `<path d="M284 140 H356 V182 H338 V164 H302 V182 H284 Z" fill="${t.c3}" fill-opacity="0.48"/>`;
    case "hooded-crown":
      return `<path d="M258 226 C270 156 300 124 320 124 C340 124 370 156 382 226 C352 210 286 210 258 226 Z" fill="#101827" fill-opacity="0.78"/>`;
    case "horned":
      return `<path d="M272 178 C244 154 244 118 264 100 C266 132 278 154 292 170 M368 178 C396 154 396 118 376 100 C374 132 362 154 348 170" fill="none" stroke="${t.c3}" stroke-opacity="0.56" stroke-width="8"/>`;
    case "peacock":
      return `<path d="M292 166 C304 132 336 128 350 164" fill="none" stroke="${t.c3}" stroke-opacity="0.54" stroke-width="8"/><circle cx="348" cy="148" r="10" fill="${t.c3}" fill-opacity="0.5"/>`;
    case "crescent":
      return `<path d="M288 154 C304 130 336 128 350 152 C338 144 326 142 316 144 C306 146 296 150 288 154 Z" fill="${t.c3}" fill-opacity="0.58"/>`;
    case "laurel-crown":
    case "sea-crown":
    case "gem-crown":
    case "royal-crown":
    case "jade-crown":
    case "leaf-crown":
    case "hero-band":
    case "warrior-band":
    case "sage-crown":
    case "multi-crown":
    default:
      return `<rect x="274" y="168" width="92" height="24" rx="12" fill="${t.c3}" fill-opacity="0.42"/>`;
  }
}

function heroBodyArt(meta, t) {
  const base = `
    <path d="M212 468 C230 338 274 270 320 270 C366 270 410 338 428 468 L394 496 C372 424 350 384 320 384 C290 384 268 424 246 496 Z" fill="url(#cloak)"/>
    <circle cx="320" cy="236" r="70" fill="url(#skin)"/>
    <path d="M252 226 C264 168 302 136 320 136 C338 136 376 168 388 226 C364 212 276 212 252 226 Z" fill="#0e1729" fill-opacity="0.52"/>
    <path d="M286 268 C304 282 336 282 354 268" fill="none" stroke="#fff2dd" stroke-opacity="0.9" stroke-width="5" stroke-linecap="round"/>
  `;
  if (meta.bodyType === "serpent") {
    return `
      <path d="M222 474 C256 384 238 338 280 308 C306 290 338 290 362 308 C406 340 392 390 420 474 C378 510 342 530 320 530 C296 530 258 510 222 474 Z" fill="url(#cloak)"/>
      <path d="M242 500 C274 470 306 462 336 470 C356 476 378 492 394 512" fill="none" stroke="${t.c3}" stroke-opacity="0.34" stroke-width="8" stroke-linecap="round"/>
      <circle cx="320" cy="228" r="72" fill="url(#skin)"/>
      <path d="M254 214 C272 168 298 140 320 140 C342 140 368 168 386 214 C364 204 276 204 254 214 Z" fill="#0f172a" fill-opacity="0.5"/>
      <path d="M286 262 C304 274 336 274 354 262" fill="none" stroke="#fff2dd" stroke-opacity="0.9" stroke-width="5" stroke-linecap="round"/>
    `;
  }
  if (meta.bodyType === "mummy-king") {
    return `
      <path d="M236 470 C252 338 284 270 320 270 C356 270 388 338 404 470 L370 502 H270 Z" fill="#f0dec1" fill-opacity="0.46"/>
      <path d="M252 328 L388 328 M246 370 L394 370 M242 410 L398 410 M246 450 L394 450" stroke="#f7ead4" stroke-opacity="0.5" stroke-width="8"/>
      <circle cx="320" cy="230" r="68" fill="url(#skin)"/>
      <path d="M254 216 C268 168 296 142 320 142 C344 142 372 168 386 216 C356 204 284 204 254 216 Z" fill="#0f172a" fill-opacity="0.46"/>
    `;
  }
  return base;
}

function heroPropArt(meta, t) {
  switch (meta.propType) {
    case "stones":
      return `<circle cx="232" cy="300" r="18" fill="${t.c3}" fill-opacity="0.42"/><circle cx="412" cy="288" r="16" fill="${t.c3}" fill-opacity="0.36"/><circle cx="448" cy="344" r="14" fill="${t.c3}" fill-opacity="0.3"/>`;
    case "axe":
      return `<rect x="300" y="178" width="24" height="252" rx="12" transform="rotate(-26 312 304)" fill="${t.c3}" fill-opacity="0.86"/><path d="M260 188 L360 188 L396 236 L234 236 Z" transform="rotate(-26 312 212)" fill="${t.c3}" fill-opacity="0.4"/>`;
    case "bagua":
      return `<circle cx="430" cy="246" r="66" fill="none" stroke="${t.c3}" stroke-opacity="0.46" stroke-width="8"/><path d="M394 222 H466 M394 246 H466 M394 270 H466 M430 182 V310" stroke="${t.c3}" stroke-opacity="0.52" stroke-width="6" stroke-linecap="round"/>`;
    case "bow":
    case "prince-bow":
      return `<path d="M232 332 C260 240 370 236 404 326" fill="none" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="10" stroke-linecap="round"/><path d="M396 326 L504 278" fill="none" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="8" stroke-linecap="round"/><circle cx="510" cy="276" r="8" fill="${t.c3}"/>`;
    case "water-scepter":
      return `<path d="M352 166 L370 374" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="10" stroke-linecap="round"/><path d="M320 186 C344 164 368 164 392 186 M306 216 C334 192 370 192 402 216 M296 246 C328 220 372 220 410 246" fill="none" stroke="${t.c3}" stroke-opacity="0.52" stroke-width="7"/>`;
    case "lightning":
      return `<path d="M356 150 L312 258 H366 L278 428 L312 316 H254 Z" fill="${t.c3}" fill-opacity="0.94"/>`;
    case "owl-spear":
      return `<path d="M362 154 L388 392" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8" stroke-linecap="round"/><path d="M376 146 L408 194 L344 194 Z" fill="${t.c3}" fill-opacity="0.46"/><circle cx="238" cy="258" r="30" fill="${t.c3}" fill-opacity="0.22"/><circle cx="228" cy="252" r="4" fill="${t.c3}"/><circle cx="248" cy="252" r="4" fill="${t.c3}"/>`;
    case "club":
      return `<path d="M354 176 L392 246 L332 394 L298 374 Z" fill="${t.c3}" fill-opacity="0.82"/><circle cx="384" cy="236" r="26" fill="${t.c3}" fill-opacity="0.36"/>`;
    case "torch":
      return `<path d="M352 184 L380 394" stroke="${t.c3}" stroke-opacity="0.82" stroke-width="10" stroke-linecap="round"/><path d="M364 144 C394 176 402 204 386 226 C370 250 340 250 326 222 C314 196 328 170 364 144 Z" fill="${t.c3}" fill-opacity="0.36"/>`;
    case "trident":
      return `<path d="M356 142 L356 406" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="8" stroke-linecap="round"/><path d="M328 176 C342 150 350 146 356 132 C362 146 370 150 384 176 M344 190 C350 170 352 162 356 150 C360 162 362 170 368 190" fill="none" stroke="${t.c3}" stroke-opacity="0.78" stroke-width="6" stroke-linecap="round"/>`;
    case "lotus":
      return `<path d="M320 314 C280 268 286 232 320 210 C354 232 360 268 320 314 Z" fill="${t.c3}" fill-opacity="0.28"/><path d="M260 302 C286 260 322 252 356 302 C322 328 294 328 260 302 Z" fill="${t.c3}" fill-opacity="0.22"/>`;
    case "chakra":
      return `<circle cx="428" cy="250" r="54" fill="none" stroke="${t.c3}" stroke-opacity="0.62" stroke-width="10"/><circle cx="428" cy="250" r="20" fill="none" stroke="${t.c3}" stroke-opacity="0.42" stroke-width="8"/><path d="M428 194 V306 M372 250 H484" stroke="${t.c3}" stroke-opacity="0.54" stroke-width="6"/>`;
    case "trishula":
      return `<path d="M356 144 L356 406" stroke="${t.c3}" stroke-opacity="0.92" stroke-width="8" stroke-linecap="round"/><path d="M332 186 C344 146 350 136 356 122 C362 136 368 146 380 186 M344 200 C352 176 354 166 356 152 C358 166 360 176 368 200" fill="none" stroke="${t.c3}" stroke-opacity="0.78" stroke-width="6"/>`;
    case "flute":
      return `<path d="M228 314 L438 276" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="10" stroke-linecap="round"/><circle cx="282" cy="304" r="4" fill="${t.c3}"/><circle cx="322" cy="296" r="4" fill="${t.c3}"/><circle cx="362" cy="288" r="4" fill="${t.c3}"/>`;
    case "sun-disk":
      return `<circle cx="438" cy="190" r="54" fill="${t.c3}" fill-opacity="0.32"/><circle cx="438" cy="190" r="84" fill="none" stroke="${t.c3}" stroke-opacity="0.42" stroke-width="8"/>`;
    case "crook-flail":
      return `<path d="M360 166 C396 180 406 212 382 232" fill="none" stroke="${t.c3}" stroke-opacity="0.84" stroke-width="8"/><path d="M326 166 L326 398" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8"/><path d="M372 174 L400 322 M392 196 L420 344" stroke="${t.c3}" stroke-opacity="0.52" stroke-width="6"/>`;
    case "wings":
      return `<path d="M188 286 C242 240 286 244 304 286 C274 310 234 324 188 322 Z" fill="${t.c3}" fill-opacity="0.2"/><path d="M452 286 C398 240 354 244 336 286 C366 310 406 324 452 322 Z" fill="${t.c3}" fill-opacity="0.2"/>`;
    case "falcon-spear":
      return `<path d="M362 148 L388 400" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8" stroke-linecap="round"/><path d="M378 144 L410 194 L346 194 Z" fill="${t.c3}" fill-opacity="0.44"/><path d="M244 220 C268 210 286 212 298 232 C284 244 264 248 244 244 Z" fill="${t.c3}" fill-opacity="0.22"/>`;
    case "scales-staff":
      return `<path d="M356 146 L356 396" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8"/><path d="M304 194 H408" stroke="${t.c3}" stroke-opacity="0.68" stroke-width="6"/><path d="M322 194 L302 248 M390 194 L410 248" stroke="${t.c3}" stroke-opacity="0.58" stroke-width="5"/><ellipse cx="296" cy="258" rx="22" ry="12" fill="none" stroke="${t.c3}" stroke-opacity="0.68" stroke-width="5"/><ellipse cx="416" cy="258" rx="22" ry="12" fill="none" stroke="${t.c3}" stroke-opacity="0.68" stroke-width="5"/>`;
    case "gungnir":
      return `<path d="M362 146 L392 404" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="8"/><path d="M376 140 L412 200 L344 200 Z" fill="${t.c3}" fill-opacity="0.44"/>`;
    case "hammer":
      return `<rect x="300" y="174" width="30" height="210" rx="12" transform="rotate(-18 315 279)" fill="${t.c3}" fill-opacity="0.88"/><rect x="266" y="170" width="118" height="58" rx="18" transform="rotate(-18 325 199)" fill="${t.c3}" fill-opacity="0.44"/>`;
    case "dagger":
      return `<path d="M378 166 L408 246 L358 292 L338 240 Z" fill="${t.c3}" fill-opacity="0.76"/><path d="M334 244 L286 308" stroke="${t.c3}" stroke-opacity="0.7" stroke-width="8" stroke-linecap="round"/>`;
    case "harvest-blade":
      return `<path d="M346 176 C408 192 426 256 384 298 C362 274 346 238 346 176 Z" fill="${t.c3}" fill-opacity="0.36"/><path d="M316 174 L352 396" stroke="${t.c3}" stroke-opacity="0.84" stroke-width="8"/>`;
    case "sword":
      return `<path d="M352 152 L378 390" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="8"/><path d="M326 210 H392" stroke="${t.c3}" stroke-opacity="0.64" stroke-width="8"/><path d="M366 142 L396 194 L338 194 Z" fill="${t.c3}" fill-opacity="0.42"/>`;
    default:
      return `<circle cx="420" cy="246" r="58" fill="${t.c3}" fill-opacity="0.18"/>`;
  }
}

function buildHeroAvatarSvg(heroName, factionName, title = "", skill = "") {
  const t = heroVisualTheme(factionName);
  const meta = getHeroArtMeta(heroName, factionName, title, skill);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#050913"/>
        <stop offset="36%" stop-color="${t.c1}"/>
        <stop offset="78%" stop-color="${t.c2}"/>
        <stop offset="100%" stop-color="#060b16"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.52" cy="0.28" r="0.64">
        <stop offset="0%" stop-color="${t.c3}" stop-opacity="0.76"/>
        <stop offset="100%" stop-color="${t.c3}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${t.c3}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.12"/>
      </linearGradient>
      <linearGradient id="cloak" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${t.c2}" stop-opacity="0.98"/>
        <stop offset="100%" stop-color="#0b1020" stop-opacity="0.96"/>
      </linearGradient>
      <radialGradient id="skin" cx="0.45" cy="0.28" r="0.96">
        <stop offset="0%" stop-color="#fff6e6" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="#d7af84" stop-opacity="0.82"/>
      </radialGradient>
    </defs>
    <rect width="640" height="640" fill="url(#bg)"/>
    <rect width="640" height="640" fill="url(#glow)"/>
    ${heroSceneArt(meta, t)}
    <rect x="28" y="24" width="92" height="92" rx="22" fill="#081120" fill-opacity="0.34" stroke="${t.c3}" stroke-opacity="0.46"/>
    <text x="74" y="86" text-anchor="middle" font-size="54" fill="${t.c3}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${t.icon}</text>
    <ellipse cx="320" cy="302" rx="176" ry="172" fill="#020617" fill-opacity="0.16"/>
    ${heroPropArt(meta, t)}
    ${heroBodyArt(meta, t)}
    ${heroHeadArt(meta, t)}
    <rect x="52" y="468" width="536" height="114" rx="22" fill="#050b16" fill-opacity="0.5" stroke="url(#frame)" stroke-opacity="0.38"/>
    <text x="320" y="518" text-anchor="middle" font-size="68" font-weight="800" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${heroName}</text>
    <text x="320" y="552" text-anchor="middle" font-size="24" fill="${t.c3}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${factionName} · ${title} · 技能【${skill}】</text>
    <text x="320" y="580" text-anchor="middle" font-size="20" fill="#f8e5bc" fill-opacity="0.9" font-family="PingFang SC, Microsoft YaHei, sans-serif">${meta.posterLine}</text>
    <rect x="22" y="22" width="596" height="596" rx="28" fill="none" stroke="url(#frame)" stroke-width="4"/>
  </svg>`;
}

function getHeroAvatar(heroName, factionName, title, skill) {
  // 使用预生成的高质量PNG人物头像，添加时间戳避免缓存
  const timestamp = Date.now();
  return `/hero-images/${heroName}.png?ts=${timestamp}`;
}

function getCardTacticLabel(cardName, effect, category) {
  if (cardName.includes("神盾") || effect.includes("抵消") || effect.includes("防止")) return "防御";
  if (effect.includes("回复") || cardName.includes("灵药") || cardName.includes("丰饶")) return "续航";
  if (effect.includes("锁定技")) return "神器";
  if (effect.includes("判定") || category === "命运牌") return "命运";
  if (effect.includes("伤害") || cardName.includes("神击") || cardName.includes("雷")) return "进攻";
  return "战术";
}

function getCardArtMeta(cardName, category, subType = "", effect = "") {
  const badge = getCardTacticLabel(cardName, effect, category);
  const map = {
    神击: { sceneLine: "神兵破空", motif: "strike" },
    神盾: { sceneLine: "埃癸斯圣盾", motif: "shield" },
    灵药: { sceneLine: "神酿与仙丹", motif: "potion" },
    神迹: { sceneLine: "祭坛降临", motif: "miracle" },
    天罚: { sceneLine: "神火审判", motif: "heavenfire" },
    神谕: { sceneLine: "神殿启示", motif: "oracle" },
    混沌漩涡: { sceneLine: "秩序崩塌", motif: "vortex" },
    诸神黄昏: { sceneLine: "终局灾变", motif: "ragnarok" },
    命运纺锤: { sceneLine: "命丝流转", motif: "spindle" },
    智慧之泉: { sceneLine: "以血换知", motif: "fountain" },
    冥河契约: { sceneLine: "冥水誓约", motif: "styx" },
    雷霆之怒: { sceneLine: "连锁雷殛", motif: "storm" },
    神之恩典: { sceneLine: "神手庇护", motif: "grace" },
    丰饶之角: { sceneLine: "黄金丰收", motif: "cornucopia" },
    潘多拉魔盒: { sceneLine: "禁忌封印", motif: "box" },
    斯芬克斯之谜: { sceneLine: "谜语封锁", motif: "sphinx" },
    世界树之缚: { sceneLine: "根须宿命", motif: "yggdrasil" },
    雷神之锤: { sceneLine: "雷锤镇压", motif: "hammer" },
    永恒之枪: { sceneLine: "神枪贯阵", motif: "spear" },
    审判之刃: { sceneLine: "冥界裁断", motif: "blade" },
    "神盾·埃吉斯": { sceneLine: "圣盾回响", motif: "aegis" },
    冥河渡船: { sceneLine: "冥河渡引", motif: "boat" },
    世界树之佑: { sceneLine: "枝干守护", motif: "tree" },
    "神驹·斯莱普尼尔": { sceneLine: "八足神驹", motif: "horse" },
    "神驹·日车": { sceneLine: "日轮战车", motif: "sun-chariot" },
    "神驹·芬里尔": { sceneLine: "狼影追猎", motif: "wolf" },
    "圣物·智慧之泉": { sceneLine: "先知泉眼", motif: "fountain" },
    "圣物·丰饶之角": { sceneLine: "圣器丰盈", motif: "cornucopia" },
    "圣物·命运纺锤": { sceneLine: "纺锤改命", motif: "spindle" },
  };
  return {
    badge,
    sceneLine: map[cardName]?.sceneLine || `${category} · ${subType}`,
    motif: map[cardName]?.motif || "sigil",
  };
}

function cardVisualTheme(category, subType = "") {
  if (category === "神迹牌") return { c1: "#071524", c2: "#1d4ed8", c3: "#b6e5ff", icon: "神迹" };
  if (category === "命运牌") return { c1: "#221308", c2: "#b45309", c3: "#fde6a8", icon: subType === "延时" ? "延时" : "命运" };
  return { c1: "#250f1d", c2: "#9f1239", c3: "#ffd1da", icon: subType || "神器" };
}

function cardMotif(meta, t) {
  switch (meta.motif) {
    case "strike":
      return `<path d="M190 392 L306 174 L356 236 L468 102 L420 286 L474 286 L268 472 Z" fill="${t.c3}" fill-opacity="0.9"/>`;
    case "shield":
    case "aegis":
      return `<path d="M320 150 L436 194 V304 C436 382 390 444 320 484 C250 444 204 382 204 304 V194 Z" fill="${t.c3}" fill-opacity="0.22" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="10"/>`;
    case "potion":
      return `<path d="M272 162 H368 V214 C368 240 388 266 410 288 C450 326 456 388 420 430 C392 462 354 476 320 476 C286 476 248 462 220 430 C184 388 190 326 230 288 C252 266 272 240 272 214 Z" fill="${t.c3}" fill-opacity="0.24" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="8"/><circle cx="320" cy="328" r="52" fill="${t.c3}" fill-opacity="0.18"/>`;
    case "miracle":
      return `<path d="M320 148 C390 198 412 258 404 304 C394 362 358 404 320 442 C282 404 246 362 236 304 C228 258 250 198 320 148 Z" fill="${t.c3}" fill-opacity="0.2"/><path d="M320 126 L320 420" stroke="${t.c3}" stroke-opacity="0.72" stroke-width="10" stroke-linecap="round"/>`;
    case "heavenfire":
    case "storm":
      return `<path d="M356 140 L302 254 H364 L270 454 L306 322 H244 Z" fill="${t.c3}" fill-opacity="0.94"/>`;
    case "oracle":
      return `<rect x="236" y="188" width="168" height="216" rx="18" fill="${t.c3}" fill-opacity="0.16" stroke="${t.c3}" stroke-opacity="0.8" stroke-width="8"/><path d="M268 240 H372 M268 282 H372 M268 324 H344" stroke="${t.c3}" stroke-opacity="0.68" stroke-width="8" stroke-linecap="round"/>`;
    case "vortex":
      return `<path d="M320 150 C426 150 476 234 444 304 C418 362 354 388 300 370 C250 352 228 304 248 266 C266 232 310 214 346 228 C372 238 384 260 380 280" fill="none" stroke="${t.c3}" stroke-opacity="0.84" stroke-width="16" stroke-linecap="round"/>`;
    case "ragnarok":
      return `<circle cx="320" cy="230" r="74" fill="${t.c3}" fill-opacity="0.14"/><path d="M250 302 L390 160 M280 154 L422 296" stroke="${t.c3}" stroke-opacity="0.78" stroke-width="12" stroke-linecap="round"/><path d="M202 396 L438 396" stroke="${t.c3}" stroke-opacity="0.4" stroke-width="8"/>`;
    case "spindle":
      return `<path d="M320 150 L346 230 L320 320 L294 230 Z" fill="${t.c3}" fill-opacity="0.32"/><path d="M320 150 V420" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8"/><path d="M268 198 C316 172 356 176 402 212" fill="none" stroke="${t.c3}" stroke-opacity="0.54" stroke-width="6"/>`;
    case "fountain":
      return `<circle cx="320" cy="292" r="92" fill="none" stroke="${t.c3}" stroke-opacity="0.58" stroke-width="10"/><path d="M320 182 C350 218 350 256 320 284 C290 256 290 218 320 182 Z" fill="${t.c3}" fill-opacity="0.22"/>`;
    case "styx":
    case "boat":
      return `<path d="M202 354 H438 C414 392 378 418 320 418 C262 418 226 392 202 354 Z" fill="${t.c3}" fill-opacity="0.26" stroke="${t.c3}" stroke-opacity="0.8" stroke-width="8"/><path d="M206 326 C246 294 294 280 320 280 C346 280 394 294 434 326" fill="none" stroke="${t.c3}" stroke-opacity="0.56" stroke-width="8"/>`;
    case "grace":
      return `<path d="M320 156 C364 200 402 224 442 238 C424 314 378 382 320 434 C262 382 216 314 198 238 C238 224 276 200 320 156 Z" fill="${t.c3}" fill-opacity="0.18"/><path d="M320 186 V398" stroke="${t.c3}" stroke-opacity="0.72" stroke-width="8"/>`;
    case "cornucopia":
      return `<path d="M248 328 C248 242 318 190 394 212 C384 274 350 356 286 412 C264 390 248 364 248 328 Z" fill="${t.c3}" fill-opacity="0.26" stroke="${t.c3}" stroke-opacity="0.8" stroke-width="8"/><circle cx="392" cy="226" r="18" fill="${t.c3}" fill-opacity="0.26"/>`;
    case "box":
      return `<rect x="224" y="214" width="192" height="162" rx="20" fill="${t.c3}" fill-opacity="0.22" stroke="${t.c3}" stroke-opacity="0.86" stroke-width="8"/><path d="M236 214 C266 180 374 180 404 214" fill="none" stroke="${t.c3}" stroke-opacity="0.72" stroke-width="8"/>`;
    case "sphinx":
      return `<path d="M224 352 C256 282 310 236 374 236 C418 236 442 268 442 314 C442 356 418 384 374 384 H246 Z" fill="${t.c3}" fill-opacity="0.22"/><circle cx="380" cy="212" r="30" fill="${t.c3}" fill-opacity="0.22"/>`;
    case "yggdrasil":
    case "tree":
      return `<path d="M320 150 V412" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="12" stroke-linecap="round"/><path d="M320 212 C274 198 242 176 214 136 M320 252 C370 238 408 204 434 162 M320 306 C270 302 228 322 198 362 M320 332 C372 330 414 352 446 390" fill="none" stroke="${t.c3}" stroke-opacity="0.56" stroke-width="8" stroke-linecap="round"/>`;
    case "hammer":
      return `<rect x="302" y="170" width="30" height="214" rx="12" transform="rotate(-18 317 277)" fill="${t.c3}" fill-opacity="0.88"/><rect x="270" y="170" width="116" height="58" rx="18" transform="rotate(-18 328 199)" fill="${t.c3}" fill-opacity="0.42"/>`;
    case "spear":
      return `<path d="M320 150 L348 424" stroke="${t.c3}" stroke-opacity="0.9" stroke-width="9"/><path d="M334 140 L370 204 L298 204 Z" fill="${t.c3}" fill-opacity="0.42"/>`;
    case "blade":
      return `<path d="M322 154 L360 304 L322 448 L284 304 Z" fill="${t.c3}" fill-opacity="0.34"/><path d="M322 154 V448" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="8"/>`;
    case "horse":
      return `<path d="M234 366 C246 284 292 236 360 236 C404 236 438 262 438 314 C438 346 420 374 388 392 H268 Z" fill="${t.c3}" fill-opacity="0.22"/><path d="M286 394 L270 452 M334 394 L328 452 M382 394 L396 452" stroke="${t.c3}" stroke-opacity="0.72" stroke-width="8" stroke-linecap="round"/>`;
    case "sun-chariot":
      return `<circle cx="252" cy="356" r="42" fill="none" stroke="${t.c3}" stroke-opacity="0.76" stroke-width="8"/><circle cx="388" cy="356" r="42" fill="none" stroke="${t.c3}" stroke-opacity="0.76" stroke-width="8"/><path d="M220 316 H420" stroke="${t.c3}" stroke-opacity="0.72" stroke-width="10"/><circle cx="320" cy="214" r="56" fill="${t.c3}" fill-opacity="0.22"/>`;
    case "wolf":
      return `<path d="M236 372 C246 298 302 238 372 238 C418 238 444 266 444 314 C444 344 430 370 406 388 H276 Z" fill="${t.c3}" fill-opacity="0.22"/><path d="M268 240 L292 196 L316 242 M348 240 L372 196 L396 242" stroke="${t.c3}" stroke-opacity="0.7" stroke-width="8"/>`;
    case "sigil":
    default:
      return `<circle cx="320" cy="284" r="112" fill="${t.c3}" fill-opacity="0.18"/><circle cx="320" cy="284" r="72" fill="none" stroke="${t.c3}" stroke-opacity="0.88" stroke-width="10"/>`;
  }
}

function summarizeCardEffect(effect = "") {
  const text = String(effect || "").replace(/\s+/g, " ").trim();
  if (!text) return "战术效果";
  const first = text.split("；")[0].split("。")[0].split("，").slice(0, 2).join("，");
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

function buildCardAvatarSvg(cardName, category, subType = "", effect = "") {
  const t = cardVisualTheme(category, subType);
  const meta = getCardArtMeta(cardName, category, subType, effect);
  const effectSummary = summarizeCardEffect(effect);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#050913"/>
        <stop offset="34%" stop-color="${t.c1}"/>
        <stop offset="100%" stop-color="${t.c2}"/>
      </linearGradient>
      <radialGradient id="flare" cx="0.5" cy="0.32" r="0.62">
        <stop offset="0%" stop-color="${t.c3}" stop-opacity="0.36"/>
        <stop offset="100%" stop-color="${t.c3}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="640" height="640" fill="url(#bg)"/>
    <rect width="640" height="640" fill="url(#flare)"/>
    <rect x="24" y="24" width="592" height="592" rx="30" fill="none" stroke="${t.c3}" stroke-opacity="0.62" stroke-width="5"/>
    <rect x="54" y="54" width="532" height="72" rx="16" fill="#050b16" fill-opacity="0.44"/>
    <text x="320" y="100" text-anchor="middle" font-size="32" fill="${t.c3}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${category} · ${subType}</text>
    <rect x="88" y="148" width="464" height="300" rx="30" fill="#020617" fill-opacity="0.18" stroke="${t.c3}" stroke-opacity="0.18"/>
    ${cardMotif(meta, t)}
    <rect x="96" y="468" width="448" height="120" rx="22" fill="#050b16" fill-opacity="0.52" stroke="${t.c3}" stroke-opacity="0.26"/>
    <text x="320" y="518" text-anchor="middle" font-size="68" font-weight="800" fill="#fff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${cardName}</text>
    <text x="320" y="548" text-anchor="middle" font-size="24" fill="${t.c3}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${meta.sceneLine}</text>
    <text x="320" y="572" text-anchor="middle" font-size="18" fill="#fef6e4" fill-opacity="0.94" font-family="PingFang SC, Microsoft YaHei, sans-serif">${effectSummary}</text>
    <rect x="252" y="580" width="136" height="34" rx="17" fill="${t.c3}" fill-opacity="0.22" stroke="${t.c3}" stroke-opacity="0.78"/>
    <text x="320" y="603" text-anchor="middle" font-size="20" fill="#fff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${meta.badge}</text>
  </svg>`;
}

function getCardAvatar(cardName, category, subType, effect) {
  // 与对战页统一：优先使用本地卡牌图片资源
  return `/card-images/${encodeURIComponent(cardName)}.png`;
}

function battleSceneArt(meta, t) {
  switch (meta.sceneType) {
    case "rift-sky":
      return `
        <path d="M0 642 C220 540 442 520 648 562 C866 606 1082 588 1600 492 L1600 900 L0 900 Z" fill="rgba(16,8,10,.64)"/>
        <path d="M188 164 C324 78 440 102 520 180 C584 242 666 270 798 224 C934 176 1032 110 1158 90 C1296 68 1414 130 1522 208" fill="none" stroke="${t.c3}" stroke-opacity="0.24" stroke-width="14"/>
        <path d="M800 40 L854 136 L810 248 L844 348" fill="none" stroke="${t.c3}" stroke-opacity="0.34" stroke-width="14" stroke-linecap="round"/>
      `;
    case "marble-storm":
      return `
        <path d="M0 648 C244 560 436 550 636 590 C854 634 1082 622 1600 516 L1600 900 L0 900 Z" fill="rgba(8,12,22,.68)"/>
        <rect x="202" y="170" width="42" height="312" rx="18" fill="${t.c3}" fill-opacity="0.16"/>
        <rect x="294" y="118" width="42" height="364" rx="18" fill="${t.c3}" fill-opacity="0.14"/>
        <rect x="1228" y="132" width="42" height="354" rx="18" fill="${t.c3}" fill-opacity="0.14"/>
        <rect x="1320" y="180" width="42" height="306" rx="18" fill="${t.c3}" fill-opacity="0.16"/>
      `;
    case "lotus-cosmos":
    case "cosmic-fire":
      return `
        <path d="M0 648 C240 556 440 542 652 586 C864 630 1086 620 1600 514 L1600 900 L0 900 Z" fill="rgba(10,7,22,.7)"/>
        <circle cx="1220" cy="132" r="118" fill="${t.c3}" fill-opacity="0.14"/>
        <circle cx="1220" cy="132" r="188" fill="none" stroke="${t.c3}" stroke-opacity="0.16" stroke-width="6"/>
        <path d="M564 496 C626 418 690 416 754 496 C698 540 622 540 564 496 Z" fill="${t.c3}" fill-opacity="0.14"/>
      `;
    case "sun-temple":
    case "underworld-desert":
      return `
        <path d="M0 654 C246 574 446 562 646 594 C852 626 1086 620 1600 520 L1600 900 L0 900 Z" fill="rgba(22,16,8,.68)"/>
        <circle cx="1220" cy="112" r="108" fill="${t.c3}" fill-opacity="0.16"/>
        <path d="M164 488 L312 182 L456 488 Z" fill="${t.c3}" fill-opacity="0.11"/>
        <path d="M1084 494 L1258 144 L1410 494 Z" fill="${t.c3}" fill-opacity="0.13"/>
      `;
    case "rune-fjord":
    case "shadow-hall":
      return `
        <path d="M0 646 C236 558 434 548 648 590 C870 634 1090 622 1600 516 L1600 900 L0 900 Z" fill="rgba(8,10,16,.72)"/>
        <path d="M220 488 L360 208 L486 488 Z" fill="${t.c3}" fill-opacity="0.1"/>
        <path d="M1102 494 L1264 168 L1424 494 Z" fill="${t.c3}" fill-opacity="0.12"/>
        <path d="M1234 94 L1260 126 L1298 132 L1272 162 L1280 204 L1234 186 L1188 204 L1196 162 L1170 132 L1208 126 Z" fill="${t.c3}" fill-opacity="0.14"/>
      `;
    case "flood-river":
    case "ocean-throne":
      return `
        <path d="M0 650 C238 590 430 578 640 606 C860 634 1084 620 1600 520 L1600 900 L0 900 Z" fill="rgba(6,10,24,.68)"/>
        <path d="M44 490 C220 412 410 414 590 484 C764 550 954 548 1136 482 C1250 440 1362 432 1600 458" fill="none" stroke="${t.c3}" stroke-opacity="0.2" stroke-width="16"/>
        <path d="M78 560 C260 494 432 496 612 566 C776 628 958 626 1128 566 C1244 526 1354 522 1530 542" fill="none" stroke="${t.c3}" stroke-opacity="0.12" stroke-width="10"/>
      `;
    default:
      return `
        <path d="M0 646 C240 564 446 550 648 590 C860 632 1084 620 1600 516 L1600 900 L0 900 Z" fill="rgba(10,12,18,.68)"/>
        <circle cx="1220" cy="132" r="110" fill="${t.c3}" fill-opacity="0.14"/>
      `;
  }
}

function getBattleBackground(modeKey, hero) {
  const factionName = hero?.faction || "奥林匹斯";
  const heroName = hero?.name || "雅典娜";
  const t = heroVisualTheme(factionName);
  const meta = getHeroArtMeta(heroName, factionName, hero?.title || "", hero?.skill || "");
  const title = modeKey === "slaughter" ? "杀戮模式" : modeKey === "ranked" ? "排位赛" : "快速战斗";
  const overlay = modeKey === "slaughter"
    ? { c4: "#991b1b", c5: "#fb923c", opacity: 0.34 }
    : modeKey === "ranked"
      ? { c4: "#6d28d9", c5: "#fbbf24", opacity: 0.26 }
      : { c4: "#1d4ed8", c5: "#f8d06c", opacity: 0.2 };
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#040812"/>
        <stop offset="42%" stop-color="${t.c1}"/>
        <stop offset="100%" stop-color="#02050b"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.52" cy="0.28" r="0.56">
        <stop offset="0%" stop-color="${t.c3}" stop-opacity="${overlay.opacity}"/>
        <stop offset="100%" stop-color="${t.c3}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="storm" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${overlay.c4}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${overlay.c5}" stop-opacity="0.22"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#sky)"/>
    <rect width="1600" height="900" fill="url(#glow)"/>
    <rect width="1600" height="900" fill="url(#storm)"/>
    ${battleSceneArt(meta, t)}
    <path d="M0 708 C194 620 368 594 556 646 C754 700 962 698 1188 644 C1324 612 1460 608 1600 638 L1600 900 L0 900 Z" fill="#05080f" fill-opacity="0.86"/>
    <path d="M0 616 C214 554 408 544 608 582 C804 620 1004 614 1214 570 C1340 544 1468 542 1600 578" fill="none" stroke="${t.c3}" stroke-opacity="0.12" stroke-width="8"/>
    <circle cx="800" cy="468" r="178" fill="#020617" fill-opacity="0.24" stroke="${t.c3}" stroke-opacity="0.16" stroke-width="4"/>
    <circle cx="800" cy="468" r="252" fill="none" stroke="${t.c3}" stroke-opacity="0.12" stroke-width="3" stroke-dasharray="10 16"/>
    <text x="800" y="122" text-anchor="middle" font-size="52" fill="#fff5d4" fill-opacity="0.24" font-family="PingFang SC, Microsoft YaHei, sans-serif">${title}</text>
    <text x="800" y="170" text-anchor="middle" font-size="26" fill="${t.c3}" fill-opacity="0.38" font-family="PingFang SC, Microsoft YaHei, sans-serif">${heroName} · ${meta.posterLine}</text>
  </svg>`;
  return svgToDataUri(svg);
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function translateFieldLabel(key) {
  const map = {
    id: "用户 ID",
    uid: "用户 ID",
    userId: "用户 ID",
    oauthId: "授权 ID",
    name: "昵称",
    nickname: "昵称",
    displayName: "显示名称",
    username: "用户名",
    avatar: "头像",
    avatarUrl: "头像",
    headImg: "头像",
    bio: "个人简介",
    intro: "个人简介",
    signature: "个性签名",
    email: "邮箱",
    phone: "手机号",
    country: "国家",
    city: "城市",
    language: "语言",
    locale: "地区",
    gender: "性别",
    age: "年龄",
    createdAt: "注册时间",
    updatedAt: "更新时间",
  };
  return map[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function prettyValue(value) {
  if (value === null || value === undefined || value === "") return "未提供";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("、");
  return JSON.stringify(value);
}

function renderUserInfoPanel(user) {
  if (!user || typeof user !== "object") {
    return `<div class="profile-empty">登录后可查看个人资料</div>`;
  }

  const avatar = escapeHtml(getUserAvatarUrl(user));
  const name = escapeHtml(String(user.nickname || user.name || user.displayName || "SecondMe 用户"));
  const subtitle = escapeHtml(String(user.signature || user.bio || "欢迎来到神迹对决"));

  const primaryKeys = ["nickname", "name", "displayName", "id", "userId", "oauthId", "city", "country", "language"];
  const rendered = new Set();
  const primaryRows = primaryKeys
    .filter((k) => user[k] !== undefined && user[k] !== null && user[k] !== "")
    .map((k) => {
      rendered.add(k);
      return `<div class="profile-row"><span>${escapeHtml(translateFieldLabel(k))}</span><strong>${escapeHtml(prettyValue(user[k]))}</strong></div>`;
    })
    .join("");

  const extraRows = Object.entries(user)
    .filter(([k]) => !rendered.has(k))
    .filter(([k, v]) => !["avatar", "avatarUrl", "headImg", "image"].includes(k) && v !== undefined && v !== null && v !== "")
    .slice(0, 8)
    .map(([k, v]) => {
      return `<div class="profile-row"><span>${escapeHtml(translateFieldLabel(k))}</span><strong>${escapeHtml(prettyValue(v))}</strong></div>`;
    })
    .join("");

  return `
    <div class="profile-card">
      <div class="profile-top">
        <img src="${avatar}" alt="${name}" />
        <div>
          <h4>${name}</h4>
          <p>${subtitle}</p>
        </div>
      </div>
      <div class="profile-section">
        <h5>基础信息</h5>
        ${primaryRows || `<div class="profile-empty">暂无基础信息</div>`}
      </div>
      <div class="profile-section">
        <h5>更多资料</h5>
        ${extraRows || `<div class="profile-empty">暂无更多资料</div>`}
      </div>
    </div>
  `;
}





async function fetchSecondMeUser(accessToken) {
  if (!accessToken) return null;
  try {
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 0 || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

function rankProgressFromStoredValue(value) {
  if (value === null || value === undefined) return null;
  let parsed = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) return null;
      parsed = { score: numeric };
    }
  }
  if (typeof parsed === "number") parsed = { score: parsed };
  if (!parsed || typeof parsed !== "object") return null;
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) return null;
  const rankProgress = createRankProgress(score);
  const updatedAt = Number(parsed.updatedAt);
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    rankProgress.updatedAt = updatedAt;
  }
  return rankProgress;
}

async function loadRankProgressFromSecondMe(accessToken) {
  if (!accessToken) return null;
  try {
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 0 || !Array.isArray(json.data)) {
      return null;
    }
    const rankEntry = json.data.find(
      (item) => item?.key === SECONDME_RANK_PROGRESS_KEY || item?.key === "rankProgress"
    );
    if (!rankEntry) return null;
    return rankProgressFromStoredValue(rankEntry.value);
  } catch (error) {
    console.error("从 SecondMe Key Memory 加载段位出错:", error);
    return null;
  }
}

async function saveRankProgressToSecondMe(accessToken, rankProgress) {
  if (!accessToken || !rankProgress) return false;
  try {
    const payload = {
      score: Math.max(0, Number(rankProgress.score) || 0),
      updatedAt: Number(rankProgress.updatedAt) || Date.now(),
    };
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: SECONDME_RANK_PROGRESS_KEY,
        value: payload,
        timestamp: Date.now(),
      }),
    });
    const json = await resp.json().catch(() => null);
    if (resp.ok && json && json.code === 0) return true;
    console.error("保存段位到 SecondMe Key Memory 失败:", json || resp.statusText);
    return false;
  } catch (error) {
    console.error("保存段位到 SecondMe Key Memory 出错:", error);
    return false;
  }
}

function getBearerToken(req) {
  const raw = String(req.headers.authorization || "");
  if (!raw.startsWith("Bearer ")) return "";
  return raw.slice(7).trim();
}

function getStableUserId(user) {
  return String(user?.id || user?.userId || user?.uid || user?.oauthId || "");
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  if (String(value).startsWith("http://") || String(value).startsWith("https://")) return String(value).replace(/\/+$/, "");
  return `https://${String(value).replace(/\/+$/, "")}`;
}

function getAppBaseUrl(req) {
  const explicit = normalizeBaseUrl(process.env.APP_BASE_URL);
  if (explicit) return explicit;
  const prod = normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (prod) return prod;
  const preview = normalizeBaseUrl(process.env.VERCEL_URL);
  if (preview) return preview;
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0];
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0];
  if (forwardedHost) return `${forwardedProto || "http"}://${forwardedHost}`;
  return `http://localhost:${PORT}`;
}

function getIntegrationTools(baseUrl) {
  return [
    {
      name: "get_player_profile",
      description: "读取当前 SecondMe 用户在神迹对决中的基础资料、头像、排位信息与好友数量。",
      authRequired: true,
      route: `${baseUrl}/api/mcp`,
      inputSchema: {
        type: "object",
        properties: {
          includeFriends: { type: "boolean", description: "是否同时拉取好友数量。" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_game_heroes",
      description: "列出神迹对决全部英雄，支持按阵营筛选，返回英雄技能、定位与文化原型信息。",
      authRequired: true,
      route: `${baseUrl}/api/mcp`,
      inputSchema: {
        type: "object",
        properties: {
          faction: { type: "string", description: "可选，华夏/奥林匹斯/吠陀/凯美特/阿斯加德。" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_game_cards",
      description: "列出神迹对决卡牌图鉴，支持按神迹牌、命运牌、神器牌筛选。",
      authRequired: true,
      route: `${baseUrl}/api/mcp`,
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "可选，神迹牌/命运牌/神器牌。" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "create_battle_entry",
      description: "为指定英雄生成快速战斗、排位赛或杀戮模式的深链入口。",
      authRequired: true,
      route: `${baseUrl}/api/mcp`,
      inputSchema: {
        type: "object",
        required: ["heroId"],
        properties: {
          heroId: { type: "string", description: "英雄 ID，例如 奥林匹斯-雅典娜。" },
          mode: { type: "string", description: "quick / ranked / slaughter，默认 quick。" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "emotional_support_chat",
      description: "提供情绪倾诉、安抚与可执行的心理支持建议。",
      authRequired: true,
      route: `${baseUrl}/api/mcp`,
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "用户当前想表达的情绪或困扰内容。" },
          mood: { type: "string", description: "可选，情绪标签（如 焦虑/难过/愤怒/疲惫）。" },
          intensity: { type: "number", description: "可选，情绪强度 0-10。" },
        },
        additionalProperties: false,
      },
    },
  ];
}

function getIntegrationManifest(baseUrl) {
  return {
    app: {
      key: "shenji-duel",
      displayName: "神迹对决",
      description: "基于 SecondMe OAuth 的神话阵营策略卡牌对战应用，提供英雄图鉴、卡牌图鉴、快速战斗、排位赛与杀戮模式。",
      authMode: "bearer_token",
    },
    endpoints: {
      mcp: `${baseUrl}/api/mcp`,
      manifest: `${baseUrl}/api/integration/manifest`,
      tools: `${baseUrl}/api/integration/tools`,
      call: `${baseUrl}/api/integration/call`,
      health: `${baseUrl}/api/healthz`,
    },
    tools: getIntegrationTools(baseUrl),
  };
}

function toMcpToolDefinitions(baseUrl) {
  return getIntegrationTools(baseUrl).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

async function runIntegrationTool(req, tool, input) {
  const normalizedTool = String(tool || "").trim();
  const normalizedInput = input && typeof input === "object" ? input : {};
  if (!normalizedTool) {
    return { status: 400, body: { ok: false, error: "missing_tool" } };
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return { status: 401, body: { ok: false, error: "missing_bearer_token" } };
  }

  const upstreamUser = await fetchSecondMeUser(accessToken);
  if (!upstreamUser) {
    return { status: 401, body: { ok: false, error: "invalid_bearer_token" } };
  }

  const linkedSession = await findStoredSessionByUser(upstreamUser);
  let rankProgress = linkedSession?.rankProgress || createRankProgress();
  if (!linkedSession) {
    const remoteRankProgress = await loadRankProgressFromSecondMe(accessToken);
    if (remoteRankProgress) rankProgress = remoteRankProgress;
  }
  const baseUrl = getAppBaseUrl(req);

  if (normalizedTool === "get_player_profile") {
    const includeFriends = Boolean(normalizedInput.includeFriends);
    const friends = includeFriends ? await fetchSecondMeFriends(accessToken) : [];
    return {
      status: 200,
      body: {
        ok: true,
        tool: normalizedTool,
        data: {
          viewer: {
            id: getStableUserId(upstreamUser),
            name: upstreamUser.nickname || upstreamUser.name || upstreamUser.displayName || "SecondMe 玩家",
            avatar: getUserAvatarUrl(upstreamUser),
            bio: upstreamUser.bio || upstreamUser.signature || upstreamUser.intro || "",
          },
          rank: getRankMeta(rankProgress.score),
          friendCount: friends.length,
        },
      },
    };
  }

  if (normalizedTool === "list_game_heroes") {
    const faction = typeof normalizedInput.faction === "string" ? normalizedInput.faction.trim() : "";
    const heroes = flattenHeroes()
      .filter((hero) => !faction || hero.faction === faction)
      .map((hero) => ({
        id: hero.id,
        name: hero.name,
        faction: hero.faction,
        culture: hero.culture,
        hp: hero.hp,
        title: hero.title,
        skill: hero.skill,
        role: hero.role,
        posterLine: hero.posterLine,
        intro: hero.intro,
      }));
    return { status: 200, body: { ok: true, tool: normalizedTool, data: { count: heroes.length, heroes } } };
  }

  if (normalizedTool === "list_game_cards") {
    const category = typeof normalizedInput.category === "string" ? normalizedInput.category.trim() : "";
    const cards = flattenCards()
      .filter((card) => !category || card.category === category)
      .map((card) => ({
        id: card.id,
        name: card.newName,
        category: card.category,
        subType: card.subType,
        quantity: card.quantity,
        suit: card.suit,
        badge: card.badge,
        sceneLine: card.sceneLine,
        effect: card.effect,
      }));
    return { status: 200, body: { ok: true, tool: normalizedTool, data: { count: cards.length, cards } } };
  }

  if (normalizedTool === "create_battle_entry") {
    const heroId = typeof normalizedInput.heroId === "string" ? normalizedInput.heroId.trim() : "";
    const mode = ["quick", "ranked", "slaughter"].includes(String(normalizedInput.mode || "")) ? String(normalizedInput.mode) : "quick";
    const hero = flattenHeroes().find((item) => item.id === heroId);
    if (!hero) {
      return { status: 404, body: { ok: false, error: "hero_not_found" } };
    }
    const modeMeta = getBattleModeMeta(mode);
    const url = `${baseUrl}/battle/${mode}?hero=${encodeURIComponent(hero.id)}`;
    return {
      status: 200,
      body: {
        ok: true,
        tool: normalizedTool,
        data: {
          mode: modeMeta.key,
          modeLabel: modeMeta.label,
          hero: {
            id: hero.id,
            name: hero.name,
            faction: hero.faction,
            title: hero.title,
          },
          url,
        },
      },
    };
  }

  if (normalizedTool === "emotional_support_chat") {
    const message = typeof normalizedInput.message === "string" ? normalizedInput.message.trim() : "";
    const mood = typeof normalizedInput.mood === "string" ? normalizedInput.mood.trim() : "";
    const intensityRaw = Number(normalizedInput.intensity);
    const intensity = Number.isFinite(intensityRaw) ? Math.min(10, Math.max(0, intensityRaw)) : null;
    const text = `${message} ${mood}`.toLowerCase();
    const highRiskKeywords = ["自杀", "轻生", "结束生命", "伤害自己", "不想活", "suicide", "kill myself", "self-harm"];
    const highRisk = highRiskKeywords.some((word) => text.includes(word));
    const userName = upstreamUser.nickname || upstreamUser.name || upstreamUser.displayName || "你";

    const opening = highRisk
      ? `${userName}，我听到了你现在非常痛苦，这份感受很重要，你并不需要独自扛着。`
      : `${userName}，谢谢你愿意把这些说出来，我在认真听。`;

    const reflection = message
      ? `你刚刚提到：“${message.slice(0, 220)}${message.length > 220 ? "..." : ""}”。`
      : `如果你愿意，可以再多说一点你最难受的具体场景，我会陪你一起梳理。`;

    const steps = highRisk
      ? [
          "先把自己带到更安全、有人在的环境，避免独处和可能伤害自己的物品。",
          "立刻联系你信任的人，请对方陪在你身边。",
          "若你有紧急风险，请立即联系当地紧急求助电话或危机干预热线。",
        ]
      : [
          "先做 60 秒缓慢呼吸：吸气 4 秒，呼气 6 秒，连续 6 轮。",
          "把最困扰你的问题写成一句话，再写下一步可执行的小动作（5 分钟内可做）。",
          "今晚给自己留一个“恢复窗口”：喝水、简单进食、减少信息刺激、尽量提前休息。",
        ];

    return {
      status: 200,
      body: {
        ok: true,
        tool: normalizedTool,
        data: {
          reply: `${opening}${reflection}我们可以先从一件最小、最可控的事开始。`,
          mood: mood || null,
          intensity,
          riskLevel: highRisk ? "high" : "normal",
          steps,
          disclaimer: highRisk
            ? "当前内容涉及高风险信号，建议优先寻求线下即时帮助。"
            : "以上建议用于情绪支持，不替代专业医疗诊断与治疗。",
        },
      },
    };
  }

  return { status: 404, body: { ok: false, error: "unknown_tool" } };
}

function sendMcpResult(res, id, result) {
  res.json({ jsonrpc: "2.0", id, result });
}

function sendMcpError(res, id, code, message, data) {
  res.status(200).json({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

function toMcpToolResult(payload, fallbackText) {
  const structured = payload?.data ?? {};
  return {
    content: [
      {
        type: "text",
        text: fallbackText || JSON.stringify(structured, null, 2),
      },
    ],
    structuredContent: structured,
    isError: false,
  };
}

function flattenHeroes() {
  if (heroListCache) return heroListCache;
  heroListCache = gameData.flatMap((faction) =>
    faction.heroes.map((hero) => {
      const artMeta = getHeroArtMeta(hero.name, faction.faction, hero.title, hero.skill);
      return {
        id: `${faction.faction}-${hero.name}`,
        faction: faction.faction,
        factionTrait: faction.trait,
        factionTraitDesc: faction.traitDesc,
        name: hero.name,
        hp: hero.hp,
        title: hero.title,
        skill: hero.skill,
        role: hero.role,
        culture: artMeta.culture,
        posterLine: artMeta.posterLine,
        intro: getHeroIntro(hero.name, faction.faction, hero.title, hero.skill, hero.role),
        avatar: getHeroAvatar(hero.name, faction.faction, hero.title, hero.skill),
      };
    })
  );
  return heroListCache;
}

function flattenCards() {
  if (cardListCache) return cardListCache;
  cardListCache = cardData.map((card) => {
    const artMeta = getCardArtMeta(card.newName, card.category, card.subType, card.effect);
    return {
      ...card,
      id: `${card.category}-${card.newName}`,
      badge: artMeta.badge,
      sceneLine: artMeta.sceneLine,
      avatar: getCardAvatar(card.newName, card.category, card.subType, card.effect),
    };
  });
  return cardListCache;
}

function getBattleModeMeta(mode) {
  if (mode === "slaughter") {
    return {
      key: "slaughter",
      label: "杀戮模式",
      drawPhaseCount: 4,
      intro: "",
      rankEnabled: false,
    };
  }
  if (mode === "ranked") {
    return {
      key: "ranked",
      label: "排位赛",
      drawPhaseCount: 2,
      intro: "在排位赛中累积 LP，按 LoL 段位体系持续晋升。",
      rankEnabled: true,
    };
  }
  return {
    key: "quick",
    label: "快速战斗",
    drawPhaseCount: 2,
    intro: "支持 5/6/7/8 人场，身份规则不变，可按节奏偏好开局。",
    rankEnabled: false,
  };
}

function renderPage({ isLoggedIn, user, rankProgress }) {
  const allHeroes = flattenHeroes();
  const allCards = flattenCards();
  const rankMeta = getRankMeta(rankProgress?.score || 0);
  const heroDataJson = JSON.stringify(allHeroes).replaceAll("<", "\\u003c");
  const cardDataJson = JSON.stringify(allCards).replaceAll("<", "\\u003c");
  const rankMetaJson = JSON.stringify(rankMeta).replaceAll("<", "\\u003c");
  const filters = ["全部", ...gameData.map((f) => f.faction)]
    .map(
      (label) => `<button class="filter-btn ${label === "全部" ? "active" : ""}" data-faction="${label}">${label}</button>`
    )
    .join("");
  const cardFilters = ["全部", "神迹牌", "命运牌", "神器牌"]
    .map(
      (label) => `<button class="card-filter-btn ${label === "全部" ? "active" : ""}" data-category="${label}">${label}</button>`
    )
    .join("");

  const heroCards = allHeroes
    .map(
      (hero) => `
      <button class="hero-card hero-select" data-faction="${hero.faction}" data-hero-id="${hero.id}">
        <img class="hero-avatar" src="${hero.avatar}" alt="${hero.name}" loading="lazy" decoding="async" />
        <div class="atlas-chip-row">
          <span class="atlas-chip faction">${hero.faction}</span>
          <span class="atlas-chip">${hero.culture}</span>
        </div>
        <div class="hero-name">${hero.name}</div>
        <div class="hero-line">${hero.title} · ${hero.posterLine}</div>
        <div class="hero-line">体力：${hero.hp} | 技能：${hero.skill} | 定位：${hero.role}</div>
      </button>
    `
    )
    .join("");
  const cardCards = allCards
    .map(
      (card) => `
      <button class="card-tile card-select" data-category="${card.category}" data-card-id="${card.id}">
        <img class="card-avatar" src="${card.avatar}" alt="${card.newName}" loading="lazy" decoding="async" />
        <div class="atlas-chip-row">
          <span class="atlas-chip card">${card.category}</span>
          <span class="atlas-chip">${card.badge}</span>
        </div>
        <div class="hero-name">${card.newName}</div>
        <div class="hero-line">${card.sceneLine}</div>
        <div class="hero-line">数量：${card.quantity} | 花色：${card.suit} | ${card.subType}</div>
      </button>
    `
    )
    .join("");
  const avatar = isLoggedIn ? getUserAvatarUrl(user) : "";
  const userInfoPanel = isLoggedIn ? renderUserInfoPanel(user) : renderUserInfoPanel(null);

  const leftArea = isLoggedIn
    ? `
      <button class="avatar-btn" id="avatarBtn" title="查看个人信息">
        <img src="${avatar}" alt="avatar" decoding="async" />
      </button>
    `
    : `<div></div>`;
  const rightArea = isLoggedIn
    ? `<a class="ghost-btn" href="/logout">退出</a>`
    : `<a class="login-btn" id="loginBtn" href="/login">SecondMe 登录</a>`;

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>神迹对决</title>
      <style>
        :root{
          --card:rgba(11,18,31,.78);
          --line:rgba(147,197,253,.2);
          --text:#ecf4ff;
          --muted:#aac3e8;
          --left-col-width:124px;
          --left-gap:14px;
          --left-btn-height:84px;
        }
        *{box-sizing:border-box}
        body{
          margin:0;
          color:var(--text);
          font-family:"Trebuchet MS","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
          background:url("/assets/myth-gods-battle-animated.svg") center/cover fixed no-repeat;
          min-height:100vh;
          position:relative;
        }
        body::before{
          content:"";
          position:fixed;inset:0;pointer-events:none;z-index:0;
          background:linear-gradient(180deg, rgba(5,9,16,.45), rgba(7,10,16,.58));
        }
        body::after{
          content:"";
          position:fixed;inset:0;pointer-events:none;z-index:0;
          background:rgba(6,10,18,.16);
        }
        .side-menu{
          position:fixed;left:18px;top:136px;z-index:12;
          display:flex;flex-direction:column;gap:10px;
          width:var(--left-col-width);
          gap:var(--left-gap);
        }
        .menu-btn{
          border:1px solid rgba(125,211,252,.5);background:rgba(6,19,37,.86);color:#e2f2ff;
          border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer;
          box-shadow:0 8px 20px rgba(2,8,20,.5);
          width:100%;
          min-height:var(--left-btn-height);
          font-size:16px;
        }
        .shell{
          max-width:none;
          margin:0 auto;
          padding:20px calc(var(--left-col-width) + 36px) 52px calc(var(--left-col-width) + 36px);
        }
        .topbar{
          display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:110px;
          position:relative;z-index:2;
        }
        .brand{
          font-size:64px;font-weight:900;letter-spacing:4px;line-height:1;
          background:linear-gradient(180deg,#fff6cc 0%,#ffd777 32%,#f4b627 52%,#ffe59c 78%,#7a4e00 100%);
          -webkit-background-clip:text;background-clip:text;color:transparent;
          text-shadow:
            0 2px 0 rgba(70,45,0,.55),
            0 0 18px rgba(255,210,96,.55),
            0 0 38px rgba(246,173,0,.45);
        }
        .left-top{justify-self:start;display:flex;align-items:center}
        .right-top{
          justify-self:end;
          align-self:start;
          display:flex;align-items:center;
          margin-top:6px;
        }
        .login-state{
          margin:8px auto 0;
          width:min(1320px,calc(100vw - 36px));
          padding:10px 14px;border-radius:12px;
          border:1px solid rgba(34,197,94,.45);
          background:rgba(10,35,18,.6);
          color:#bbf7d0;font-weight:700;
          position:relative;z-index:2;
          text-align:center;
          transition:opacity .45s ease, transform .45s ease, max-height .45s ease, margin .45s ease, padding .45s ease;
          opacity:1;
          max-height:80px;
          overflow:hidden;
        }
        .login-state.hide{
          opacity:0;
          transform:translateY(-8px);
          max-height:0;
          margin:0 auto;
          padding-top:0;
          padding-bottom:0;
          border-width:0;
        }
        .mode-row{
          display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;
          width:min(620px,100%);
          margin:68px auto 24px;
          position:relative;z-index:2;
        }
        .mode-btn{
          border:1px solid rgba(251,191,36,.35);
          border-radius:16px;padding:18px 12px;
          background:linear-gradient(145deg, rgba(33,17,10,.72), rgba(18,20,34,.72));
          color:#fef3c7;font-weight:900;letter-spacing:.8px;cursor:pointer;
          font-size:24px;
          min-height:108px;
          transition:all .16s ease;
        }
        .mode-btn:hover{
          transform:translateY(-1px);
          border-color:#f59e0b;
        }
        .mode-btn.active{
          background:linear-gradient(145deg, rgba(245,158,11,.78), rgba(180,83,9,.78));
          color:#1f1302;
          box-shadow:0 8px 18px rgba(217,119,6,.35);
        }
        .mode-btn-label{display:block;font-size:24px;line-height:1.1}
        .mode-btn-sub{
          display:block;
          margin-top:8px;
          font-size:12px;
          font-weight:600;
          letter-spacing:.2px;
          color:rgba(255,244,214,.78);
        }
        .mode-btn.active .mode-btn-sub{color:rgba(49,28,4,.82)}
        .left-controls{display:flex;align-items:center;gap:12px}
        .avatar-btn{
          width:56px;height:56px;border-radius:16px;border:2px solid rgba(125,211,252,.7);
          padding:0;background:#081324;cursor:pointer;overflow:hidden;
          box-shadow:0 0 20px rgba(125,211,252,.35);
        }
        .avatar-btn img{width:100%;height:100%;display:block;object-fit:cover}
        .avatar-btn img,
        .friend-avatar-btn img,
        .hero-avatar,
        .card-avatar,
        .battle-pick img,
        .battle-preview img,
        .hero-modal-top img,
        .friend-modal-top img{
          image-rendering:-webkit-optimize-contrast;
          transform:translateZ(0);
          filter:saturate(1.06) contrast(1.04);
        }
        .ghost-btn,.login-btn{
          display:inline-flex;align-items:center;justify-content:center;
          height:40px;padding:0 14px;border-radius:10px;text-decoration:none;font-weight:700;cursor:pointer;
        }
        .ghost-btn{
          color:#d5e8ff;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);
        }
        .login-btn{
          color:#05243a;background:linear-gradient(90deg,#7dd3fc,#bae6fd);
          height:34px;
          padding:0 12px;
          font-size:13px;
          font-weight:700;
        }
        .hero-drawer{
          position:fixed;left:12px;top:150px;z-index:15;
          width:calc(100vw - 24px);max-height:88vh;overflow:auto;
          border:1px solid rgba(125,211,252,.5);border-radius:18px;padding:18px;
          background:rgba(7,14,26,.93);backdrop-filter: blur(6px);display:none;
        }
        .hero-drawer.show{display:block}
        .card-drawer{
          position:fixed;left:12px;top:150px;z-index:1000;
          width:calc(100vw - 24px);max-height:88vh;overflow:auto;
          border:1px solid rgba(251,191,36,.45);border-radius:18px;padding:18px;
          background:rgba(28,18,8,.94);backdrop-filter: blur(6px);display:none;
        }
        .card-drawer.show{display:block}
        .drawer-head{
          display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;
          position:sticky;top:-18px;z-index:2;
          padding:18px 0 10px;
          background:inherit;
        }
        .drawer-title{font-size:22px;font-weight:900}
        .close-btn{
          border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#e7f3ff;
          border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;
        }
        .filter-row{
          display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;
          position:sticky;top:58px;z-index:2;padding:8px 0 10px;background:inherit;
        }
        .filter-btn{
          border:1px solid rgba(186,230,253,.35);background:#0e1b32;color:#d5e9ff;border-radius:999px;
          padding:6px 10px;cursor:pointer;font-weight:700;
        }
        .filter-btn.active{
          color:#0b2234;background:linear-gradient(90deg,#7dd3fc,#bae6fd);border-color:transparent;
        }
        .card-filter-btn{
          border:1px solid rgba(254,215,170,.35);background:#30210f;color:#ffe9c4;border-radius:999px;
          padding:6px 10px;cursor:pointer;font-weight:700;
        }
        .card-filter-btn.active{
          color:#3a2105;background:linear-gradient(90deg,#fbbf24,#fde68a);border-color:transparent;
        }
        .hero-grid{
          display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;
        }
        .card-grid{
          display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;
        }
        .hero-card{
          border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:10px;
          background:rgba(10,16,29,.72);text-align:left;color:var(--text);
        }
        .hero-select{
          cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
        }
        .hero-select:hover{
          transform:translateY(-2px);border-color:#7dd3fc;box-shadow:0 8px 20px rgba(22,163,255,.22);
        }
        .card-tile{
          border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px;
          background:linear-gradient(135deg, rgba(58,35,8,.68), rgba(20,14,7,.72));
          text-align:left;color:#fff0d9;cursor:pointer;transition:transform .18s ease,border-color .18s ease;
        }
        .card-tile:hover{
          transform:translateY(-2px);border-color:#fbbf24;
        }
        .hero-avatar{
          width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;
          border:1px solid rgba(255,255,255,.2);margin-bottom:8px;background:#0d1a2d;
        }
        .card-avatar{
          width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;
          border:1px solid rgba(255,255,255,.18);margin-bottom:8px;background:#2a1f0f;
        }
        .hero-name{font-size:19px;font-weight:800;margin-bottom:4px}
        .hero-line{font-size:13px;color:#bfd9fb;line-height:1.55}
        .atlas-chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
        .atlas-chip{
          display:inline-flex;align-items:center;justify-content:center;
          min-height:24px;padding:0 8px;border-radius:999px;
          border:1px solid rgba(186,230,253,.24);background:rgba(10,18,30,.52);
          font-size:11px;font-weight:800;color:#e6f3ff;
        }
        .atlas-chip.faction{border-color:rgba(251,191,36,.32);color:#ffe6a8}
        .atlas-chip.card{border-color:rgba(253,224,71,.3);color:#fde68a}
        .friends-panel{
          position:fixed;left:18px;
          top:calc(136px + var(--left-btn-height) * 2 + var(--left-gap) + var(--left-gap));
          z-index:12;
          width:var(--left-col-width);
          max-height:76vh;
          min-height:calc(var(--left-btn-height) * 2);
          overflow:auto;
          border:1px solid rgba(125,211,252,.32);border-radius:16px;padding:12px;
          background:rgba(8,14,26,.78);backdrop-filter: blur(5px);
        }
        .friends-head{
          display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
        }
        .friends-head h4{margin:0;font-size:18px}
        .friends-count{font-size:12px;color:#9dc0ea}
        .friend-item{
          display:grid;grid-template-columns:auto 1fr auto;align-items:center;
          gap:10px;padding:8px;border-radius:10px;
          border:1px solid rgba(125,211,252,.12);background:rgba(11,22,40,.55);
          margin-bottom:8px;
        }
        .friend-avatar-btn{
          width:46px;height:46px;border-radius:12px;padding:0;border:1px solid rgba(125,211,252,.35);
          overflow:hidden;cursor:pointer;background:#091525;
        }
        .friend-avatar-btn img{width:100%;height:100%;object-fit:cover}
        .friend-meta{min-width:0}
        .friend-name{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .friend-status{font-size:12px;color:#86efac}
        .invite-btn{
          border:1px solid rgba(74,222,128,.4);color:#dcfce7;background:rgba(21,128,61,.3);
          border-radius:999px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700;
        }
        .friend-empty{font-size:12px;color:#9db4d5;padding:8px}
        .history-list{display:flex;flex-direction:column;gap:12px}
        .history-item{border:1px solid rgba(251,191,36,.35);border-radius:14px;padding:12px;background:rgba(31,24,10,.62);color:#eef6ff}
        .history-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .history-date{font-size:12px;color:#9dc0ea}
        .history-result{font-size:14px;font-weight:800;padding:4px 10px;border-radius:999px}
        .history-result.win{background:rgba(74,222,128,.2);color:#4ade80;border:1px solid rgba(74,222,128,.4)}
        .history-result.lose{background:rgba(248,113,113,.2);color:#f87171;border:1px solid rgba(248,113,113,.4)}
        .history-details{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        .history-player{display:flex;flex-direction:column;gap:4px}
        .history-player-name{font-size:14px;font-weight:700}
        .history-player-hero{font-size:12px;color:#9dc0ea}
        .history-empty{font-size:14px;color:#9db4d5;padding:20px;text-align:center}
        .panel{
          position:fixed;left:16px;top:84px;width:min(420px, calc(100% - 32px));
          max-height:70vh;overflow:auto;padding:12px;border-radius:12px;
          border:1px solid rgba(125,211,252,.45);background:rgba(5,14,27,.92);
          display:none;z-index:10;
        }
        .panel h3{margin:0 0 10px 0}
        .profile-card{display:grid;gap:12px}
        .profile-top{display:flex;gap:12px;align-items:center}
        .profile-top img{
          width:64px;height:64px;border-radius:14px;object-fit:cover;border:1px solid rgba(125,211,252,.48);
          background:#0a1628;
        }
        .profile-top h4{margin:0;font-size:18px}
        .profile-top p{margin:4px 0 0;color:#9ec0e7;font-size:13px}
        .profile-section{
          border:1px solid rgba(125,211,252,.22);
          border-radius:10px;padding:10px;background:rgba(9,18,33,.55);
        }
        .profile-section h5{margin:0 0 8px;font-size:13px;color:#b9d7ff}
        .profile-row{
          display:flex;align-items:center;justify-content:space-between;gap:12px;
          padding:6px 0;border-bottom:1px dashed rgba(125,211,252,.14);
        }
        .profile-row:last-child{border-bottom:none}
        .profile-row span{font-size:12px;color:#9ec0e7}
        .profile-row strong{font-size:13px;color:#f0f6ff;text-align:right;word-break:break-all}
        .profile-empty{font-size:12px;color:#94a9c6}
        .panel.show{display:block}
        .hero-modal{
          position:fixed;inset:0;background:rgba(2,8,17,.74);display:none;
          align-items:center;justify-content:center;z-index:20;padding:14px;
        }
        .hero-modal.show{display:flex}
        .card-modal{
          position:fixed;inset:0;background:rgba(20,10,2,.74);display:none;
          align-items:center;justify-content:center;z-index:21;padding:14px;
        }
        .card-modal.show{display:flex}
        .friend-modal{
          position:fixed;inset:0;background:rgba(4,10,18,.72);display:none;
          align-items:center;justify-content:center;z-index:22;padding:14px;
        }
        .friend-modal.show{display:flex}
        .battle-modal{
          position:fixed;inset:0;background:rgba(3,8,18,.82);display:none;
          align-items:center;justify-content:center;z-index:24;padding:18px;
          backdrop-filter:blur(4px);
        }
        .battle-modal.show{display:flex}
        .friend-modal-box{
          width:min(520px,100%);border-radius:16px;padding:16px;
          border:1px solid rgba(125,211,252,.45);background:rgba(8,16,30,.95);
        }
        .battle-modal-box{
          width:min(1120px,100%);max-height:88vh;overflow:auto;border-radius:18px;padding:18px;
          border:1px solid rgba(251,191,36,.45);background:rgba(8,14,24,.96);
          box-shadow:0 28px 80px rgba(0,0,0,.4);
          display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:14px;
          position:relative;
        }
        .battle-mode-tag{
          display:inline-flex;align-items:center;justify-content:center;
          height:30px;padding:0 12px;border-radius:999px;
          border:1px solid rgba(251,191,36,.35);background:rgba(245,158,11,.12);
          color:#fde68a;font-weight:800;font-size:12px;letter-spacing:.8px;
        }
        .battle-modal-copy{position:relative;padding-right:0}
        .battle-modal-box.ranked-active .battle-modal-copy{padding-right:min(36vw,360px)}
        .battle-modal-copy h3{margin:10px 0 6px;font-size:32px}
        .battle-modal-copy p{margin:0;color:#b7cdee;line-height:1.6}
        .battle-player-count{
          margin-top:12px;padding:10px 12px;border-radius:12px;
          border:1px solid rgba(125,211,252,.24);background:rgba(8,18,31,.62);
        }
        .battle-player-count[hidden]{display:none !important}
        .battle-player-count-label{
          display:block;font-size:12px;color:#9ec3ea;margin-bottom:8px;letter-spacing:.4px;
        }
        .battle-player-count-list{
          display:flex;flex-wrap:wrap;gap:8px;
        }
        .battle-count-btn{
          height:32px;padding:0 14px;border-radius:999px;border:1px solid rgba(186,230,253,.22);
          background:rgba(10,18,31,.72);color:#dbeafe;cursor:pointer;font-size:12px;font-weight:700;
          transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease;
        }
        .battle-count-btn:hover{
          transform:translateY(-1px);border-color:rgba(125,211,252,.56);box-shadow:0 8px 18px rgba(14,165,233,.16);
        }
        .battle-count-btn.active{
          border-color:#fbbf24;background:rgba(83,45,7,.68);color:#fde68a;box-shadow:0 0 0 1px rgba(251,191,36,.28);
        }
        .battle-player-count-tip{
          margin:8px 0 0;font-size:12px;color:#adc7e9;line-height:1.6;
        }
        .battle-rank-panel{
          display:none;
          position:absolute;
          top:84px;
          right:18px;
          width:min(340px,calc(100% - 36px));
          z-index:1;
        }
        .battle-rank-panel.show{display:block}
        .battle-rank-card{
          border:1px solid rgba(125,211,252,.28);
          border-radius:14px;
          padding:12px 14px;
          background:linear-gradient(135deg, rgba(10,18,31,.92), rgba(22,32,49,.9));
          box-shadow:0 16px 36px rgba(2,8,18,.45), 0 0 0 1px rgba(186,230,253,.08) inset;
        }
        .battle-rank-card span{display:block;font-size:11px;color:#9ec0e7;margin-bottom:6px}
        .battle-rank-card strong{display:block;font-size:22px;color:#fff}
        .battle-rank-card em{display:block;margin-top:8px;font-size:12px;color:#dbeafe;font-style:normal;line-height:1.55}
        .battle-selection-layout{
          min-height:0;
          display:grid;grid-template-columns:minmax(0,1.35fr) 320px;gap:14px;
          overflow:hidden;
        }
        .battle-hero-list{
          min-height:0;overflow:auto;padding-right:6px;
          display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;
        }
        .battle-pick{
          border:1px solid rgba(186,230,253,.16);border-radius:14px;padding:10px;
          background:rgba(10,18,31,.76);cursor:pointer;color:#eef6ff;text-align:left;
          transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;
        }
        .battle-pick:hover{
          transform:translateY(-2px);border-color:rgba(125,211,252,.55);box-shadow:0 12px 26px rgba(22,163,255,.16);
        }
        .battle-pick.active{
          border-color:#fbbf24;box-shadow:0 0 0 2px rgba(245,158,11,.22),0 16px 30px rgba(245,158,11,.14);
          background:linear-gradient(180deg, rgba(58,35,8,.72), rgba(14,20,32,.86));
        }
        .battle-pick img{
          width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.12);
          margin-bottom:8px;background:#0c172a;
        }
        .battle-pick-name{font-size:18px;font-weight:800;margin-bottom:4px}
        .battle-pick-line{font-size:12px;color:#b5ceec;line-height:1.55}
        .battle-preview{
          border:1px solid rgba(251,191,36,.18);border-radius:16px;padding:14px;
          background:linear-gradient(180deg, rgba(31,24,10,.62), rgba(10,14,24,.9));
          display:grid;align-content:start;gap:12px;
          min-height:0;max-height:100%;overflow:auto;
        }
        .battle-preview img{
          width:100%;max-height:clamp(150px,30vh,260px);height:auto;aspect-ratio:auto;object-fit:cover;border-radius:14px;border:1px solid rgba(251,191,36,.18);
          background:#0d1729;
        }
        .battle-preview h4{margin:0;font-size:26px}
        .battle-preview p{margin:0;color:#dbe7f8;line-height:1.65;font-size:13px}
        .battle-preview-empty{
          min-height:100%;display:flex;align-items:center;justify-content:center;text-align:center;
          color:#a8bfdc;font-size:14px;line-height:1.7;padding:22px;
        }
        .battle-modal-actions{
          display:flex;align-items:center;justify-content:space-between;gap:12px;
        }
        .battle-start-btn{
          border:none;border-radius:14px;height:48px;padding:0 22px;cursor:pointer;
          background:linear-gradient(135deg,#f6d16c,#d0840d);color:#291700;font-size:15px;font-weight:900;
          box-shadow:0 16px 30px rgba(217,119,6,.24);
        }
        .battle-start-btn:disabled{
          cursor:not-allowed;opacity:.5;box-shadow:none;
        }
        .friend-modal-top{display:flex;gap:12px;align-items:center}
        .friend-modal-top img{
          width:84px;height:84px;border-radius:14px;border:1px solid rgba(125,211,252,.4);object-fit:cover;
        }
        .friend-modal-top h3{margin:0}
        .friend-modal-top p{margin:4px 0 0;color:#9bbce3;font-size:13px}
        .friend-modal-body{
          margin-top:12px;border:1px solid rgba(125,211,252,.22);border-radius:10px;padding:10px;background:rgba(12,22,40,.5);
          font-size:13px;color:#dbeafe;line-height:1.65;
        }
        .hero-modal-box{
          width:min(720px,100%);max-height:85vh;overflow:auto;border-radius:16px;padding:16px;
          border:1px solid rgba(147,197,253,.55);background:rgba(8,16,30,.95);
          transition:all 0.3s ease;
        }
        .card-modal-box{
          width:min(760px,100%);max-height:85vh;overflow:auto;border-radius:16px;padding:16px;
          border:1px solid rgba(251,191,36,.55);background:rgba(30,20,8,.96);
          transition:all 0.3s ease;
        }
        .hero-modal-top{display:flex;gap:12px;align-items:flex-start;transition:all 0.3s ease}
        .hero-modal-top img{
          width:120px;height:120px;border-radius:14px;border:1px solid rgba(186,230,253,.45);background:#08192d;
          transition:all 0.3s ease;
        }
        .hero-modal h3{margin:0 0 6px 0;font-size:28px;transition:all 0.3s ease}
        .hero-modal p{margin:8px 0;color:#d4e9ff;line-height:1.62;transition:all 0.3s ease}
        
        /* 桌面端响应式调整 */
        @media (max-width: 1200px) {
          .hero-modal-box{
            width:min(640px,100%);
            padding:14px;
          }
          .hero-modal-top img{
            width:100px;
            height:100px;
          }
          .hero-modal h3{
            font-size:24px;
          }
        }
        
        @media (max-width: 1024px) {
          .hero-modal-box{
            width:min(560px,100%);
            padding:12px;
          }
          .hero-modal-top img{
            width:90px;
            height:90px;
          }
          .hero-modal h3{
            font-size:22px;
          }
          .hero-modal p{
            font-size:14px;
          }
        }
        
        /* 平板设备响应式调整 */
        @media (max-width: 768px) {
          .hero-modal-box{
            width:min(90vw,500px);
            max-height:90vh;
            padding:12px;
          }
          .hero-modal-top{
            flex-direction:column;
            align-items:center;
            text-align:center;
          }
          .hero-modal-top img{
            width:min(200px,50vw);
            height:auto;
            aspect-ratio:1/1;
          }
          .hero-modal h3{
            font-size:20px;
            margin-top:12px;
          }
          .hero-modal p{
            font-size:13px;
          }
        }
        
        /* 卡片模态框响应式调整 */
        @media (max-width: 1200px) {
          .card-modal-box{
            width:min(680px,100%);
            padding:14px;
          }
        }
        
        @media (max-width: 1024px) {
          .card-modal-box{
            width:min(600px,100%);
            padding:12px;
          }
        }
        
        @media (max-width: 768px) {
          .card-modal-box{
            width:min(90vw,540px);
            max-height:90vh;
            padding:12px;
          }
        }
        
        @media (max-width: 760px){
          body{overflow-y:auto}
          .side-menu{
            position:static;
            width:calc(100% - 24px);
            margin:10px 12px 0;
            flex-direction:row;
            flex-wrap:wrap;
            gap:10px;
          }
          .menu-btn{
            flex:1 1 160px;
            min-height:60px;
            font-size:14px;
          }
          .friends-panel{
            position:static;
            width:calc(100% - 24px);
            margin:10px 12px 0;
            max-height:none;
            min-height:0;
          }
          .hero-drawer{left:8px;top:92px;width:calc(100vw - 16px);max-height:calc(100svh - 100px)}
          .card-drawer{left:8px;top:92px;width:calc(100vw - 16px);max-height:calc(100svh - 100px)}
          .voice-drawer{left:8px;top:92px;width:calc(100vw - 16px);max-height:calc(100svh - 100px)}
          .panel{top:74px;max-height:calc(100svh - 90px)}
          .brand{font-size:36px;letter-spacing:1.5px;justify-self:center}
          .topbar{grid-template-columns:1fr;gap:12px;align-items:center;min-height:0}
          .left-top,.right-top{justify-self:center}
          .shell{padding:16px 12px 44px 12px}
          .mode-row{grid-template-columns:1fr;width:100%;margin:22px auto 20px}
          .mode-btn{font-size:18px;min-height:82px}
          .hero-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
          .card-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
          .hero-modal-top{flex-direction:column}
          .hero-modal-top img{width:min(200px,100%);height:auto;aspect-ratio:1/1}
          .battle-modal-box{max-height:92vh;grid-template-rows:auto auto minmax(0,1fr) auto}
          .battle-modal-box.ranked-active .battle-modal-copy{padding-right:0}
          .battle-rank-panel{position:static;width:100%}
          .battle-rank-panel.show{display:block}
          .battle-selection-layout{grid-template-columns:1fr}
          .battle-preview{order:-1;max-height:38vh;overflow:auto}
          .battle-modal-actions{flex-direction:column;align-items:stretch}
        }
        
        /* 手机竖屏响应式调整 */
        @media (max-width: 480px) {
          .hero-modal{
            padding:10px;
          }
          .hero-modal-box{
            width:100%;
            max-height:92vh;
            padding:10px;
            border-radius:12px;
          }
          .hero-modal-top img{
            width:min(160px,50vw);
          }
          .hero-modal h3{
            font-size:18px;
          }
          .hero-modal p{
            font-size:12px;
            line-height:1.5;
          }
          .card-modal-box{
            width:100%;
            max-height:92vh;
            padding:10px;
            border-radius:12px;
          }
        }
        
        /* 手机横屏响应式调整 */
        @media (orientation: landscape) and (max-height: 480px) {
          .hero-modal{
            padding:8px;
          }
          .hero-modal-box{
            width:min(90vw,600px);
            max-height:90vh;
            padding:10px;
          }
          .hero-modal-top{
            flex-direction:row;
            align-items:flex-start;
            text-align:left;
          }
          .hero-modal-top img{
            width:80px;
            height:80px;
          }
          .hero-modal h3{
            font-size:16px;
            margin-top:0;
          }
          .hero-modal p{
            font-size:12px;
            line-height:1.4;
          }
          .card-modal-box{
            width:min(90vw,640px);
            max-height:90vh;
            padding:10px;
          }
        }
        
        /* 小屏幕横屏响应式调整 */
        @media (orientation: landscape) and (max-height: 320px) {
          .hero-modal-box{
            width:min(95vw,700px);
            max-height:95vh;
            padding:8px;
          }
          .hero-modal-top img{
            width:60px;
            height:60px;
          }
          .hero-modal h3{
            font-size:14px;
          }
          .hero-modal p{
            font-size:11px;
          }
          .card-modal-box{
            width:min(95vw,740px);
            max-height:95vh;
            padding:8px;
          }
        }
        @media (orientation: landscape) and (max-height: 560px){
          body{overflow-y:auto}
          .side-menu{
            position:static;
            width:calc(100% - 24px);
            margin:8px 12px 0;
            flex-direction:row;
            gap:10px;
          }
          .menu-btn{
            flex:1 1 160px;
            min-height:50px;
            font-size:13px;
            padding:8px 10px;
          }
          .friends-panel{
            position:static;
            width:calc(100% - 24px);
            margin:8px 12px 0;
            max-height:200px;
            min-height:0;
          }
          .voice-drawer{top:74px;max-height:calc(100svh - 84px)}
          .shell{padding:10px 12px 28px}
          .topbar{min-height:0;gap:8px}
          .brand{font-size:30px;letter-spacing:1px}
          .login-state{margin:6px auto 0;padding:8px 10px}
          .mode-row{margin:14px auto 16px;gap:10px;grid-template-columns:1fr}
          .mode-btn{font-size:16px;min-height:66px;padding:12px 10px}
          .mode-btn-label{font-size:19px}
          .mode-btn-sub{margin-top:6px;font-size:11px}
          .hero-drawer{top:74px;max-height:calc(100svh - 84px)}
          .card-drawer{top:74px;max-height:calc(100svh - 84px)}
          .filter-row{top:50px}
          .battle-modal{padding:10px}
          .battle-modal-box{max-height:96svh;padding:12px;gap:10px}
          .battle-modal-copy h3{font-size:24px}
        }
      </style>
    </head>
    <body>
      <div class="side-menu">
        <button class="menu-btn" id="heroMenuBtn">英雄介绍</button>
        <button class="menu-btn" id="cardMenuBtn">卡牌图鉴</button>
        <button class="menu-btn" id="historyMenuBtn">历史战绩</button>
        <button class="menu-btn" id="voiceMenuBtn">语音聊天</button>
      </div>


      <section class="hero-drawer" id="heroDrawer">
        <div class="drawer-head">
          <div class="drawer-title">英雄图鉴</div>
          <button class="close-btn" id="heroDrawerClose">关闭</button>
        </div>
        <div class="filter-row">${filters}</div>
        <div class="hero-grid">${heroCards}</div>
      </section>

      <section class="card-drawer" id="cardDrawer">
        <div class="drawer-head">
          <div class="drawer-title">卡牌图鉴</div>
          <button class="close-btn" id="cardDrawerClose">关闭</button>
        </div>
        <div class="filter-row">${cardFilters}</div>
        <div class="card-grid">${cardCards}</div>
      </section>

      <section class="card-drawer" id="historyDrawer">
        <div class="drawer-head">
          <div class="drawer-title">历史战绩</div>
          <button class="close-btn" id="historyDrawerClose">关闭</button>
        </div>
        <div class="history-list" id="historyList">
          <div class="history-empty">暂无历史战绩</div>
        </div>
      </section>

      <section class="card-drawer" id="voiceDrawer">
        <div class="drawer-head">
          <div class="drawer-title">语音聊天</div>
          <button class="close-btn" id="voiceDrawerClose">关闭</button>
        </div>
        <div id="voiceMessages" style="height: 300px; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="text-align: center; color: #64748b; font-size: 12px;">暂无语音消息</div>
        </div>
        <div style="padding: 12px; border-top: 1px solid rgba(125,211,252,.22); display: flex; flex-direction: column; gap: 8px;">
          <input type="text" id="voiceInput" placeholder="输入文字转语音..." style="flex: 1; padding: 8px; border: 1px solid rgba(125,211,252,.35); border-radius: 999px; background: #0e1b32; color: #d5e9ff; font-size: 14px;">
          <div style="display: flex; gap: 8px;">
            <button id="voiceRecord" style="flex: 1; padding: 8px 16px; background: rgba(248, 113, 113, 0.2); border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 999px; color: #f87171; cursor: pointer; font-weight: 700;">按住说话</button>
            <button id="voiceSend" style="padding: 8px 16px; background: rgba(74,222,128,.2); border: 1px solid rgba(74,222,128,.4); border-radius: 999px; color: #4ade80; cursor: pointer; font-weight: 700;">发送</button>
          </div>
        </div>
      </section>

      <div class="shell">
        <div class="topbar">
          <div class="left-top">${leftArea}</div>
          <div class="brand">神迹对决</div>
          <div class="right-top">${rightArea}</div>
        </div>
        ${isLoggedIn ? `<div class="login-state" id="loginState">SecondMe 登录成功</div>` : ""}
        <div class="mode-row">
          <button class="mode-btn active" data-mode="quick"><span class="mode-btn-label">快速战斗</span><span class="mode-btn-sub">支持 5/6/7/8 人场，身份规则不变</span></button>
          <button class="mode-btn" data-mode="ranked"><span class="mode-btn-label">排位赛</span><span class="mode-btn-sub">LoL 段位体系，支持 5/6/7/8 人场</span></button>
          <button class="mode-btn" data-mode="slaughter"><span class="mode-btn-label">杀戮模式</span><span class="mode-btn-sub">高资源高爆发，适合爽局与压制</span></button>
          <button class="mode-btn" data-mode="tutorial"><span class="mode-btn-label">新手教学</span><span class="mode-btn-sub">从身份、卡牌到实战决策一步看懂</span></button>
        </div>
      </div>

      <div class="panel" id="userPanel">
        <h3>SecondMe 用户信息</h3>
        ${userInfoPanel}
      </div>

      <section class="hero-modal" id="heroModal">
        <div class="hero-modal-box">
          <div class="drawer-head">
            <div class="drawer-title">英雄详情</div>
            <button class="close-btn" id="heroModalClose">关闭</button>
          </div>
          <div class="hero-modal-top">
            <img id="modalAvatar" src="" alt="hero" decoding="async" />
            <div>
              <h3 id="modalName"></h3>
              <p id="modalBase"></p>
              <p id="modalSkill"></p>
            </div>
          </div>
          <p id="modalIntro"></p>
          <p id="modalTrait"></p>
        </div>
      </section>

      <section class="card-modal" id="cardModal">
        <div class="card-modal-box">
          <div class="drawer-head">
            <div class="drawer-title">卡牌详情</div>
            <button class="close-btn" id="cardModalClose">关闭</button>
          </div>
          <div class="hero-modal-top">
            <img id="cardModalAvatar" src="" alt="card" decoding="async" />
            <div>
              <h3 id="cardModalName"></h3>
              <p id="cardModalBase"></p>
              <p id="cardModalMeta"></p>
            </div>
          </div>
          <p id="cardModalEffect"></p>
          <p id="cardModalDesign"></p>
        </div>
      </section>


      <section class="battle-modal" id="battleModal">
        <div class="battle-modal-box">
          <div class="drawer-head">
            <div class="drawer-title">开始对局</div>
            <button class="close-btn" id="battleModalClose">关闭</button>
          </div>
          <div class="battle-modal-copy">
            <div class="battle-mode-tag" id="battleModeTag">快速战斗</div>
            <h3>选择你的英雄</h3>
            <p id="battleModeIntro">先选择人数，再锁定一位神明进入战场。</p>
            <div class="battle-player-count" id="battlePlayerCountWrap" hidden>
              <span class="battle-player-count-label">对局人数</span>
              <div class="battle-player-count-list" id="battlePlayerCountList">
                <button class="battle-count-btn" type="button" data-battle-count="5">5人场</button>
                <button class="battle-count-btn" type="button" data-battle-count="6">6人场</button>
                <button class="battle-count-btn active" type="button" data-battle-count="7">7人场</button>
                <button class="battle-count-btn" type="button" data-battle-count="8">8人场</button>
              </div>
              <p class="battle-player-count-tip" id="battlePlayerCountTip">5人：主神1 护法1 逆神2 堕神1</p>
            </div>
          </div>
          <div class="battle-rank-panel" id="battleRankPanel"></div>
          <div class="battle-selection-layout">
            <div class="battle-hero-list" id="battleHeroList"></div>
            <div class="battle-preview" id="battlePreview">
              <div class="battle-preview-empty">请选择一位英雄进入对局。</div>
            </div>
          </div>
          <div class="battle-modal-actions">
            <button class="close-btn" id="battleOpenAtlas" type="button">查看英雄图鉴</button>
            <button class="battle-start-btn" id="battleStartBtn" type="button" disabled>开始游戏</button>
          </div>
        </div>
      </section>

      <script id="heroData" type="application/json">${heroDataJson}</script>
      <script id="cardData" type="application/json">${cardDataJson}</script>

      <script id="rankData" type="application/json">${rankMetaJson}</script>

      <script src="/home-voice.js"></script>

      <script>
        const heroMenuBtn = document.getElementById("heroMenuBtn");
        const heroDrawer = document.getElementById("heroDrawer");
        const heroDrawerClose = document.getElementById("heroDrawerClose");
        const cardMenuBtn = document.getElementById("cardMenuBtn");
        const cardDrawer = document.getElementById("cardDrawer");
        const cardDrawerClose = document.getElementById("cardDrawerClose");
        const historyMenuBtn = document.getElementById("historyMenuBtn");
        const historyDrawer = document.getElementById("historyDrawer");
        const historyDrawerClose = document.getElementById("historyDrawerClose");
        const historyList = document.getElementById("historyList");
        const loginBtn = document.getElementById("loginBtn");
        const avatarBtn = document.getElementById("avatarBtn");
        const panel = document.getElementById("userPanel");
        const heroModal = document.getElementById("heroModal");
        const heroModalClose = document.getElementById("heroModalClose");
        const cardModal = document.getElementById("cardModal");
        const cardModalClose = document.getElementById("cardModalClose");

        const battleModal = document.getElementById("battleModal");
        const battleModalBox = battleModal ? battleModal.querySelector(".battle-modal-box") : null;
        const battleModalClose = document.getElementById("battleModalClose");
        const battleModeTag = document.getElementById("battleModeTag");
        const battleModeIntro = document.getElementById("battleModeIntro");
        const battleRankPanel = document.getElementById("battleRankPanel");
        const battleHeroList = document.getElementById("battleHeroList");
        const battlePreview = document.getElementById("battlePreview");
        const battleStartBtn = document.getElementById("battleStartBtn");
        const battleOpenAtlas = document.getElementById("battleOpenAtlas");
        const battlePlayerCountWrap = document.getElementById("battlePlayerCountWrap");
        const battlePlayerCountList = document.getElementById("battlePlayerCountList");
        const battlePlayerCountTip = document.getElementById("battlePlayerCountTip");
        const filters = Array.from(document.querySelectorAll(".filter-btn"));
        const cardFilters = Array.from(document.querySelectorAll(".card-filter-btn"));
        const heroCards = Array.from(document.querySelectorAll(".hero-select"));
        const cardCards = Array.from(document.querySelectorAll(".card-select"));
        const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

        const heroData = JSON.parse(document.getElementById("heroData").textContent || "[]");
        const cardData = JSON.parse(document.getElementById("cardData").textContent || "[]");

        const rankData = JSON.parse(document.getElementById("rankData").textContent || "{}");
        const heroMap = new Map(heroData.map((h) => [h.id, h]));
        const cardMap = new Map(cardData.map((c) => [c.id, c]));

        const loginState = document.getElementById("loginState");
        const QUICK_BATTLE_COUNT_DISTRIBUTION = {
          5: "5人：主神1 护法1 逆神2 堕神1",
          6: "6人：主神1 护法1 逆神3 堕神1",
          7: "7人：主神1 护法2 逆神3 堕神1",
          8: "8人：主神1 护法2 逆神4 堕神1",
        };
        const QUICK_BATTLE_COUNT_INTRO = {
          5: "五人局更快进攻，博弈集中在主神与逆神互拆节奏。",
          6: "六人局强调阵营协作与资源取舍，容错与爆发更均衡。",
          7: "标准七人局，身份对抗最经典，节奏与信息量最稳定。",
          8: "八人局战线更长，运营与拉扯空间更大，后期更刺激。",
        };
        const RANKED_BATTLE_COUNT_INTRO = {
          5: "5 人排位节奏极快，容错更低，适合冲分提速。",
          6: "6 人排位更平衡，协作与拆解同时重要。",
          7: "7 人排位信息量最完整，适合稳定上分。",
          8: "8 人排位运营更长线，后期博弈更考验决策。",
        };
        function normalizeBattleCount(count) {
          const n = Number(count);
          return [5, 6, 7, 8].includes(n) ? n : 7;
        }
        const battleModes = {
          quick: {
            label: "快速战斗",
            intro: "先选择 5/6/7/8 人场，再锁定一位神明进入战场。",
            path: "/battle/quick",
            ranked: false
          },
          ranked: {
            label: "排位赛",
            intro: "先选择 5/6/7/8 人场，再锁定英雄进入排位对局。",
            path: "/battle/ranked",
            ranked: true
          },
          slaughter: {
            label: "杀戮模式",
            intro: "更强调资源堆叠与连续压制，适合想体验高爆发神战节奏的玩家。",
            path: "/battle/slaughter",
            ranked: false
          },
          manual: {
            label: "手动匹配",
            intro: "输入其他SecondMe用户ID进行匹配。",
            ranked: false
          }
        };
        let pendingBattleMode = "quick";
        let selectedBattleHeroId = "";
        let selectedBattlePlayerCount = 7;

        if (loginBtn) {
          loginBtn.addEventListener("click", function () {
            window.location.href = "/login";
          });
        }
        if (loginState) {
          window.setTimeout(function () {
            loginState.classList.add("hide");
          }, 1800);
        }
        function renderRankPanel(mode) {
          if (!battleRankPanel) return;
          const meta = battleModes[mode] || battleModes.quick;
          if (battleModalBox) {
            battleModalBox.classList.toggle("ranked-active", Boolean(meta.ranked));
          }
          if (!meta.ranked) {
            battleRankPanel.classList.remove("show");
            battleRankPanel.innerHTML = "";
            return;
          }
          battleRankPanel.classList.add("show");
          battleRankPanel.innerHTML =
            '<div class="battle-rank-card"><span>当前段位</span><strong>' + (rankData.display || "坚韧黑铁 IV") + '</strong><em>' +
            '当前积分：' + ((rankData.progress || 0) + " / " + (rankData.progressMax || 100)) + '（LP）<br/>' +
            '结算规则：胜利 +20 / 失败 -10' +
            '</em></div>';
        }
        function renderQuickBattleCountPicker(mode) {
          const supportsCount = mode === "quick" || mode === "ranked";
          if (battlePlayerCountWrap) {
            battlePlayerCountWrap.hidden = !supportsCount;
          }
          if (!supportsCount) return;
          selectedBattlePlayerCount = normalizeBattleCount(selectedBattlePlayerCount);
          if (battlePlayerCountList) {
            const countButtons = Array.from(battlePlayerCountList.querySelectorAll("[data-battle-count]"));
            countButtons.forEach((btn) => {
              const active = Number(btn.dataset.battleCount || 0) === selectedBattlePlayerCount;
              btn.classList.toggle("active", active);
            });
          }
          if (battlePlayerCountTip) {
            battlePlayerCountTip.textContent = QUICK_BATTLE_COUNT_DISTRIBUTION[selectedBattlePlayerCount] || "";
          }
        }
        function renderBattleModeCopy(mode) {
          const meta = battleModes[mode] || battleModes.quick;
          if (battleModeTag) battleModeTag.textContent = meta.label;
          if (battleModeIntro) {
            if (mode === "quick" || mode === "ranked") {
              const introMap = mode === "ranked" ? RANKED_BATTLE_COUNT_INTRO : QUICK_BATTLE_COUNT_INTRO;
              const intro = introMap[selectedBattlePlayerCount] || meta.intro;
              battleModeIntro.textContent = intro;
            } else {
              battleModeIntro.textContent = meta.intro;
            }
          }
          renderQuickBattleCountPicker(mode);
        }
        function renderBattleHeroOptions() {
          if (!battleHeroList) return;
          battleHeroList.innerHTML = heroData.map((hero) => {
            const active = hero.id === selectedBattleHeroId ? "active" : "";
            return '<button class="battle-pick ' + active + '" type="button" data-battle-hero="' + hero.id + '">' +
              '<img src="' + hero.avatar + '" alt="' + hero.name + '" loading="lazy" decoding="async" />' +
              '<div class="battle-pick-name">' + hero.name + '</div>' +
              '<div class="battle-pick-line">' + hero.faction + ' · ' + hero.title + '</div>' +
              '<div class="battle-pick-line">体力 ' + hero.hp + ' · 技能【' + hero.skill + '】</div>' +
              '</button>';
          }).join("");
        }
        function renderBattlePreview() {
          if (!battlePreview || !battleStartBtn) return;
          const hero = heroMap.get(selectedBattleHeroId);
          battleStartBtn.disabled = !hero;
          if (!hero) {
            battlePreview.innerHTML = '<div class="battle-preview-empty">请选择一位英雄进入对局。</div>';
            return;
          }
          battlePreview.innerHTML =
            '<img src="' + hero.avatar + '" alt="' + hero.name + '" decoding="async" />' +
            '<h4>' + hero.name + '</h4>' +
            '<p>' + hero.faction + ' · ' + hero.culture + ' · 体力 ' + hero.hp + '</p>' +
            '<p>技能【' + hero.skill + '】 · 定位：' + hero.role + '</p>' +
            '<p>' + hero.posterLine + '</p>' +
            '<p>阵营特性【' + hero.factionTrait + '】：' + hero.factionTraitDesc + '</p>' +
            '<p>' + hero.intro + '</p>';
        }
        function openBattleModal(mode) {
          const meta = battleModes[mode] || battleModes.quick;
          pendingBattleMode = mode;
          selectedBattleHeroId = "";
          if (mode === "quick" || mode === "ranked") {
            selectedBattlePlayerCount = 7;
          }
          renderBattleModeCopy(mode);
          renderRankPanel(mode);
          renderBattleHeroOptions();
          renderBattlePreview();
          if (battleModal) battleModal.classList.add("show");
        }
        function closeBattleModal() {
          if (battleModal) battleModal.classList.remove("show");
        }
        modeButtons.forEach((btn) => {
          btn.addEventListener("click", function () {
            if (btn.dataset.mode === "quick" || btn.dataset.mode === "slaughter" || btn.dataset.mode === "ranked") {
              modeButtons.forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              openBattleModal(btn.dataset.mode);
              return;
            }
            if (btn.dataset.mode === "tutorial") {
              window.location.href = "/tutorial";
              return;
            }
            modeButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
          });
        });
        if (battlePlayerCountList) {
          battlePlayerCountList.addEventListener("click", function (event) {
            const target = event.target.closest("[data-battle-count]");
            if (!target) return;
            selectedBattlePlayerCount = normalizeBattleCount(target.dataset.battleCount);
            renderBattleModeCopy(pendingBattleMode);
          });
        }
        if (battleHeroList) {
          battleHeroList.addEventListener("click", function (event) {
            const pick = event.target.closest("[data-battle-hero]");
            if (!pick) return;
            selectedBattleHeroId = pick.dataset.battleHero || "";
            renderBattleHeroOptions();
            renderBattlePreview();
          });
        }
        if (battleStartBtn) {
          battleStartBtn.addEventListener("click", function () {
            const meta = battleModes[pendingBattleMode] || battleModes.quick;
            if (!selectedBattleHeroId) return;
            let nextUrl = meta.path + "?hero=" + encodeURIComponent(selectedBattleHeroId);
            if (pendingBattleMode === "quick" || pendingBattleMode === "ranked") {
              nextUrl += "&players=" + encodeURIComponent(String(normalizeBattleCount(selectedBattlePlayerCount)));
            }
            window.location.href = nextUrl;
          });
        }
        if (battleModalClose) {
          battleModalClose.addEventListener("click", closeBattleModal);
        }
        if (battleModal) {
          battleModal.addEventListener("click", function (event) {
            if (event.target === battleModal) closeBattleModal();
          });
        }
        
        let isFromBattleModal = false;
        if (battleOpenAtlas) {
          battleOpenAtlas.addEventListener("click", function () {
            closeBattleModal();
            if (cardDrawer) cardDrawer.classList.remove("show");
            if (heroDrawer) heroDrawer.classList.add("show");
            isFromBattleModal = true;
          });
        }

        if (heroMenuBtn && heroDrawer) {
          heroMenuBtn.addEventListener("click", function () {
            if (cardDrawer) cardDrawer.classList.remove("show");
            heroDrawer.classList.toggle("show");
          });
        }
        if (heroDrawerClose && heroDrawer) {
          heroDrawerClose.addEventListener("click", function () {
            heroDrawer.classList.remove("show");
          });
        }
        if (cardMenuBtn && cardDrawer) {
          cardMenuBtn.addEventListener("click", function () {
            if (heroDrawer) heroDrawer.classList.remove("show");
            if (historyDrawer) historyDrawer.classList.remove("show");
            cardDrawer.classList.toggle("show");
          });
        }
        if (cardDrawerClose && cardDrawer) {
          cardDrawerClose.addEventListener("click", function () {
            cardDrawer.classList.remove("show");
          });
        }

        if (historyMenuBtn && historyDrawer) {
          historyMenuBtn.addEventListener("click", function () {
            if (heroDrawer) heroDrawer.classList.remove("show");
            if (cardDrawer) cardDrawer.classList.remove("show");
            if (voiceDrawer) voiceDrawer.classList.remove("show");
            loadHistory();
            historyDrawer.classList.toggle("show");
          });
        }
        if (historyDrawerClose && historyDrawer) {
          historyDrawerClose.addEventListener("click", function () {
            historyDrawer.classList.remove("show");
          });
        }

        const voiceMenuBtn = document.getElementById("voiceMenuBtn");
        const voiceDrawer = document.getElementById("voiceDrawer");
        const voiceDrawerClose = document.getElementById("voiceDrawerClose");
        const voiceMessages = document.getElementById("voiceMessages");
        const voiceInput = document.getElementById("voiceInput");
        const voiceRecord = document.getElementById("voiceRecord");
        const voiceSend = document.getElementById("voiceSend");

        if (voiceMenuBtn && voiceDrawer) {
          voiceMenuBtn.addEventListener("click", function () {
            if (heroDrawer) heroDrawer.classList.remove("show");
            if (cardDrawer) cardDrawer.classList.remove("show");
            if (historyDrawer) historyDrawer.classList.remove("show");
            voiceDrawer.classList.toggle("show");
          });
        }
        if (voiceDrawerClose && voiceDrawer) {
          voiceDrawerClose.addEventListener("click", function () {
            voiceDrawer.classList.remove("show");
          });
        }

        // 语音消息存储
        const voiceMessagesData = {};
        let currentAudio = null;
        let currentAudioId = null;

        if (voiceSend && voiceInput) {
          voiceSend.addEventListener("click", function () {
            const text = voiceInput.value.trim();
            if (!text) return;
            
            // 文字转语音
            if ('speechSynthesis' in window) {
              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = 'zh-CN';
              utterance.volume = 0.8;
              speechSynthesis.speak(utterance);
            }
            
            // 生成唯一ID
            const messageId = 'voice_' + Date.now();
            
            // 显示语音消息
            if (voiceMessages) {
              const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              const messageHTML = '<div class="voice-message" data-voice-id="' + messageId + '" style="display: flex; flex-direction: column; align-items: flex-end; cursor: pointer;"><span style="font-size: 11px; color: #64748b;">我 ' + time + '</span><span style="max-width: 200px; padding: 6px 10px; border-radius: 8px; background: rgba(74,222,128,.2); color: #4ade80; font-size: 13px; word-break: break-all;">' + text + '</span><div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;"><span style="font-size: 10px; color: #4ade80;">语音消息</span><span class="voice-duration" style="font-size: 10px; color: #4ade80;">0:03</span></div></div>';
              
              if (voiceMessages.innerHTML.includes('暂无语音消息')) {
                voiceMessages.innerHTML = messageHTML;
              } else {
                voiceMessages.innerHTML += messageHTML;
              }
              voiceMessages.scrollTop = voiceMessages.scrollHeight;
            }
            
            // 存储消息数据
            voiceMessagesData[messageId] = {
              text: text,
              timestamp: Date.now(),
              type: 'text-to-speech'
            };
            
            voiceInput.value = "";
          });
          
          voiceInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
              voiceSend.click();
            }
          });
        }

        // 语音录制功能
        if (voiceRecord) {
          let mediaRecorder = null;
          let audioChunks = [];
          let startTime = 0;
          
          voiceRecord.addEventListener("mousedown", async function () {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaRecorder = new MediaRecorder(stream);
              audioChunks = [];
              startTime = Date.now();
              
              mediaRecorder.ondataavailable = function (event) {
                if (event.data.size > 0) {
                  audioChunks.push(event.data);
                }
              };
              
              mediaRecorder.onstop = function () {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const duration = Math.round((Date.now() - startTime) / 1000);
                
                // 生成唯一ID
                const messageId = 'voice_' + Date.now();
                
                // 显示语音消息
                if (voiceMessages) {
                  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                  const messageHTML = '<div class="voice-message" data-voice-id="' + messageId + '" style="display: flex; flex-direction: column; align-items: flex-end; cursor: pointer;"><span style="font-size: 11px; color: #64748b;">我 ' + time + '</span><span style="max-width: 200px; padding: 6px 10px; border-radius: 8px; background: rgba(74,222,128,.2); color: #4ade80; font-size: 13px; word-break: break-all;">语音消息</span><div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;"><span class="voice-status" style="font-size: 10px; color: #4ade80;">▶</span><span style="font-size: 10px; color: #4ade80;">语音消息</span><span class="voice-duration" style="font-size: 10px; color: #4ade80;">0:' + (duration < 10 ? '0' + duration : duration) + '</span></div></div>';
                  
                  if (voiceMessages.innerHTML.includes('暂无语音消息')) {
                    voiceMessages.innerHTML = messageHTML;
                  } else {
                    voiceMessages.innerHTML += messageHTML;
                  }
                  voiceMessages.scrollTop = voiceMessages.scrollHeight;
                }
                
                // 存储消息数据
                voiceMessagesData[messageId] = {
                  blob: audioBlob,
                  duration: duration,
                  timestamp: Date.now(),
                  type: 'recorded'
                };
                
                console.log('语音录制完成', audioBlob);
              };
              
              mediaRecorder.start();
              voiceRecord.textContent = "录制中...";
              voiceRecord.style.background = "rgba(248, 113, 113, 0.3)";
            } catch (error) {
              console.error("语音录制失败:", error);
            }
          });
          
          voiceRecord.addEventListener("mouseup", function () {
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
              // 停止所有音频轨道
              mediaRecorder.stream.getTracks().forEach(track => track.stop());
              voiceRecord.textContent = "按住说话";
              voiceRecord.style.background = "rgba(248, 113, 113, 0.2)";
            }
          });
          
          // 处理鼠标移出按钮的情况
          voiceRecord.addEventListener("mouseleave", function () {
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
              mediaRecorder.stream.getTracks().forEach(track => track.stop());
              voiceRecord.textContent = "按住说话";
              voiceRecord.style.background = "rgba(248, 113, 113, 0.2)";
            }
          });
        }

        // 语音消息播放功能
        if (voiceMessages) {
          voiceMessages.addEventListener("click", function (event) {
            const voiceMessage = event.target.closest('.voice-message');
            if (!voiceMessage) return;
            
            const messageId = voiceMessage.dataset.voiceId;
            const messageData = voiceMessagesData[messageId];
            if (!messageData) return;
            
            // 停止当前播放的音频
            if (currentAudio) {
              currentAudio.pause();
              currentAudio.currentTime = 0;
              if (currentAudioId) {
                const currentMessage = document.querySelector('[data-voice-id="' + currentAudioId + '"]');
                if (currentMessage) {
                  const statusElement = currentMessage.querySelector('.voice-status');
                  if (statusElement) {
                    statusElement.textContent = '▶';
                  }
                }
              }
            }
            
            // 如果点击的是当前正在播放的音频，则停止
            if (currentAudioId === messageId) {
              currentAudio = null;
              currentAudioId = null;
              return;
            }
            
            // 播放新的音频
            if (messageData.type === 'recorded' && messageData.blob) {
              currentAudio = new Audio(URL.createObjectURL(messageData.blob));
            } else if (messageData.type === 'text-to-speech' && messageData.text) {
              currentAudio = new SpeechSynthesisUtterance(messageData.text);
              currentAudio.lang = 'zh-CN';
              currentAudio.volume = 0.8;
            }
            
            if (currentAudio) {
              currentAudioId = messageId;
              
              // 更新播放状态
              const statusElement = voiceMessage.querySelector('.voice-status');
              if (statusElement) {
                statusElement.textContent = '⏸';
              }
              
              // 播放完成处理
              if (currentAudio instanceof Audio) {
                currentAudio.onended = function () {
                  if (currentAudioId === messageId) {
                    const statusElement = voiceMessage.querySelector('.voice-status');
                    if (statusElement) {
                      statusElement.textContent = '▶';
                    }
                    currentAudio = null;
                    currentAudioId = null;
                  }
                };
                currentAudio.play();
              } else if (currentAudio instanceof SpeechSynthesisUtterance) {
                currentAudio.onend = function () {
                  if (currentAudioId === messageId) {
                    const statusElement = voiceMessage.querySelector('.voice-status');
                    if (statusElement) {
                      statusElement.textContent = '▶';
                    }
                    currentAudio = null;
                    currentAudioId = null;
                  }
                };
                speechSynthesis.speak(currentAudio);
              }
            }
          });
        }

        filters.forEach((btn) => {
          btn.addEventListener("click", function () {
            const targetFaction = btn.dataset.faction;
            filters.forEach((item) => item.classList.remove("active"));
            btn.classList.add("active");
            heroCards.forEach((card) => {
              card.style.display = targetFaction === "全部" || card.dataset.faction === targetFaction ? "" : "none";
            });
          });
        });
        cardFilters.forEach((btn) => {
          btn.addEventListener("click", function () {
            const targetCategory = btn.dataset.category;
            cardFilters.forEach((item) => item.classList.remove("active"));
            btn.classList.add("active");
            cardCards.forEach((card) => {
              card.style.display = targetCategory === "全部" || card.dataset.category === targetCategory ? "" : "none";
            });
          });
        });

        heroCards.forEach((card) => {
          card.addEventListener("click", function () {
            const heroId = card.dataset.heroId;
            const hero = heroMap.get(heroId);
            if (!hero) return;
            // 检查是否从战斗模态框打开的英雄图鉴
            if (isFromBattleModal) {
              // 如果是从战斗模态框打开的英雄图鉴，选择英雄并返回战斗模态框
              selectedBattleHeroId = heroId;
              if (heroDrawer) heroDrawer.classList.remove("show");
              openBattleModal(pendingBattleMode);
              isFromBattleModal = false;
            } else if (heroModal) {
              document.getElementById("modalAvatar").src = hero.avatar;
              document.getElementById("modalName").textContent = hero.name;
              document.getElementById("modalBase").textContent = hero.faction + " | " + hero.culture + " | " + hero.title + " | 体力 " + hero.hp;
              document.getElementById("modalSkill").textContent = "技能【" + hero.skill + "】 | 定位：" + hero.role;
              document.getElementById("modalIntro").textContent = "人物介绍：" + hero.intro;
              document.getElementById("modalTrait").textContent =
                "阵营特性【" + hero.factionTrait + "】：" + hero.factionTraitDesc + " | 视觉原型：" + hero.posterLine;
              heroModal.classList.add("show");
            }
          });
        });
        cardCards.forEach((item) => {
          item.addEventListener("click", function () {
            const card = cardMap.get(item.dataset.cardId);
            if (!card || !cardModal) return;
            document.getElementById("cardModalAvatar").src = card.avatar;
            document.getElementById("cardModalName").textContent = card.newName;
            document.getElementById("cardModalBase").textContent =
              card.category + " | " + card.subType + " | 原名：" + card.originalName;
            document.getElementById("cardModalMeta").textContent =
              "数量：" + card.quantity + " | 花色：" + card.suit + (card.range ? " | 攻击范围：" + card.range : "") + " | 定位：" + card.badge;
            document.getElementById("cardModalEffect").textContent = "牌面效果：" + card.effect;
            document.getElementById("cardModalDesign").textContent = "设计思路：" + card.design + " | 画面主题：" + card.sceneLine;
            cardModal.classList.add("show");
          });
        });
        if (heroModalClose && heroModal) {
          heroModalClose.addEventListener("click", function () {
            heroModal.classList.remove("show");
          });
          heroModal.addEventListener("click", function (event) {
            if (event.target === heroModal) heroModal.classList.remove("show");
          });
        }
        if (cardModalClose && cardModal) {
          cardModalClose.addEventListener("click", function () {
            cardModal.classList.remove("show");
          });
          cardModal.addEventListener("click", function (event) {
            if (event.target === cardModal) cardModal.classList.remove("show");
          });
        }




        if (avatarBtn && panel) {
          avatarBtn.addEventListener("click", function () {
            panel.classList.toggle("show");
          });
          document.addEventListener("click", function (e) {
            if (!panel.classList.contains("show")) return;
            if (panel.contains(e.target) || avatarBtn.contains(e.target)) return;
            panel.classList.remove("show");
          });
        }

        async function loadHistory() {
          if (!historyList) return;
          try {
            const resp = await fetch("/api/battle/history");
            const json = await resp.json();
            if (json.ok && Array.isArray(json.data)) {
              if (json.data.length === 0) {
                historyList.innerHTML = '<div class="history-empty">暂无历史战绩</div>';
                return;
              }
              historyList.innerHTML = json.data.map(item => '<div class="history-item">' +
                '<div class="history-header">' +
                  '<span class="history-date">' + new Date(item.timestamp).toLocaleString() + '</span>' +
                  '<span class="history-result ' + (item.result === 'win' ? 'win' : 'lose') + '">' + (item.result === 'win' ? '胜利' : '失败') + '</span>' +
                '</div>' +
                '<div class="history-details">' +
                  '<div class="history-player">' +
                    '<span class="history-player-name">' + item.playerName + '</span>' +
                    '<span class="history-player-hero">英雄：' + item.playerHero + '</span>' +
                  '</div>' +
                  '<div class="history-player">' +
                    '<span class="history-player-name">' + item.opponentName + '</span>' +
                    '<span class="history-player-hero">英雄：' + item.opponentHero + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>').join('');
            } else {
              historyList.innerHTML = '<div class="history-empty">加载战绩失败</div>';
            }
          } catch (error) {
            console.error("加载战绩失败:", error);
            historyList.innerHTML = '<div class="history-empty">加载战绩失败</div>';
          }
        }
      </script>
    </body>
  </html>`;
}

function renderTutorialPage({ user, rankProgress }) {
  const allHeroes = flattenHeroes();
  const allCards = flattenCards();
  const rankMeta = getRankMeta(rankProgress?.score || RANK_INITIAL_EXP);
  const featuredHeroes = GUIDE_BEGINNER_HERO_IDS.map((id) => allHeroes.find((hero) => hero.id === id)).filter(Boolean);
  const featuredCards = GUIDE_CARD_NAMES.map((name) => allCards.find((card) => card.newName === name)).filter(Boolean);
  const heroRail = featuredHeroes
    .map(
      (hero) => `
        <article class="guide-hero-card">
          <img src="${hero.avatar}" alt="${escapeHtml(hero.name)}" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(hero.name)}</h3>
            <p>${escapeHtml(hero.faction)} · ${escapeHtml(hero.title)}</p>
            <strong>适合新手的原因：${escapeHtml(hero.role)}</strong>
          </div>
        </article>
      `
    )
    .join("");
  const cardRail = featuredCards
    .map(
      (card) => `
        <article class="guide-card-card">
          <img src="${card.avatar}" alt="${escapeHtml(card.newName)}" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(card.newName)}</h3>
            <p>${escapeHtml(card.category)} · ${escapeHtml(card.subType)}</p>
            <strong>${escapeHtml(card.effect)}</strong>
          </div>
        </article>
      `
    )
    .join("");
  const loginAction = user
    ? `<a class="guide-link ghost" href="/logout">退出 SecondMe</a>`
    : `<a class="guide-link primary" href="/login">SecondMe 登录</a>`;
  const heroBackdrop = getBattleBackground("ranked", featuredHeroes[1] || allHeroes[0] || null);

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>神迹对决 - 新手教学</title>
      <link rel="stylesheet" href="/tutorial.css" />
    </head>
    <body style="--guide-bg:url('${heroBackdrop}')">
      <div class="guide-shell">
        <header class="guide-topbar">
          <a class="guide-link ghost" href="/game">返回大厅</a>
          <div class="guide-brand">新手教学</div>
          <div class="guide-actions">${loginAction}</div>
        </header>

        <section class="guide-hero">
          <div class="guide-hero-copy">
            <div class="guide-kicker">神话七人局实战教学</div>
            <h1>先理解目标，再学会节奏，最后再追求高胜率。</h1>
            <p>这份教学围绕你当前项目里的真实玩法来写：七人身份局、三种战斗模式、五大神话阵营、核心卡牌与排位经验。读完后，你就能直接进入一局，不会被规则压住，也不会看不懂战场信息。</p>
            <div class="guide-stat-row">
              <div class="guide-stat">
                <span>推荐起手</span>
                <strong>先打快速战斗</strong>
              </div>
              <div class="guide-stat">
                <span>排位初始</span>
                <strong>${escapeHtml(rankMeta.display)} ${rankMeta.progress}/${rankMeta.progressMax}</strong>
              </div>
              <div class="guide-stat">
                <span>最重要习惯</span>
                <strong>先保命，再判断身份</strong>
              </div>
            </div>
          </div>
        </section>

        <nav class="guide-nav">
          <a href="#overview">总览</a>
          <a href="#identity">身份规则</a>
          <a href="#phases">回合节奏</a>
          <a href="#cards">关键卡牌</a>
          <a href="#factions">阵营理解</a>
          <a href="#modes">模式区别</a>
          <a href="#battleplan">实战决策</a>
          <a href="#advanced">进阶建议</a>
        </nav>

        <main class="guide-main">
          <section class="guide-section" id="overview">
            <div class="guide-section-head">
              <span>Overview</span>
              <h2>先记住这三件事</h2>
            </div>
            <div class="guide-grid three">
              <article class="guide-panel">
                <h3>一局的核心不是输出，而是站位与身份判断</h3>
                <p>这是典型的七人身份局。你不能只看谁血少就打谁，而要结合战报、救人、弃牌、是否保护主神来推断身份。打错对象，经常比少打一张牌更致命。</p>
              </article>
              <article class="guide-panel">
                <h3>你的第一目标是活到中盘</h3>
                <p>前几轮优先保留【神盾】和【灵药】，除非你已经能明确收益，否则不要为了一次 1 点伤害把防御全部打空。新手最容易输在前期资源透支。</p>
              </article>
              <article class="guide-panel">
                <h3>看懂模式，比背规则更重要</h3>
                <p>快速战斗适合熟悉节奏；排位赛和快速战斗规则一致，但会结算段位经验；杀戮模式只改摸牌阶段，从 2 张变成 4 张，其余逻辑不变。</p>
              </article>
            </div>
          </section>

          <section class="guide-section" id="identity">
            <div class="guide-section-head">
              <span>Identity</span>
              <h2>七人身份局怎么赢</h2>
            </div>
            <div class="guide-grid four">
              <article class="guide-panel">
                <h3>主神</h3>
                <p>身份公开，体力上限 +1，先手。你的目标是清掉所有逆神与堕神。前期重点是保命与观察，别急着无脑压人。</p>
              </article>
              <article class="guide-panel">
                <h3>护法</h3>
                <p>你和主神同胜。核心职责不是抢输出，而是补位：保主神血线、挡关键牌、稳定清理已经暴露的逆神。</p>
              </article>
              <article class="guide-panel">
                <h3>逆神</h3>
                <p>主神阵亡即胜利。你要做的是逼主神掉资源，不一定每轮都硬打伤害，拆掉防御和压缩其队友更重要。</p>
              </article>
              <article class="guide-panel">
                <h3>堕神</h3>
                <p>目标是先清场，再单挑主神。你的前期打法通常最克制，谁强打谁，尽量别过早暴露立场。</p>
              </article>
            </div>
          </section>

          <section class="guide-section" id="phases">
            <div class="guide-section-head">
              <span>Flow</span>
              <h2>一回合的 6 个阶段</h2>
            </div>
            <div class="guide-timeline">
              <article><strong>准备</strong><p>结算阵营或圣物的准备阶段收益，例如凯美特的【永生】。</p></article>
              <article><strong>判定</strong><p>结算【潘多拉魔盒】、【斯芬克斯之谜】、【世界树之缚】这类延时命运牌。</p></article>
              <article><strong>摸牌</strong><p>快速战斗与排位赛摸 2；杀戮模式摸 4。这里决定你这一轮能不能拉开资源差。</p></article>
              <article><strong>出牌</strong><p>这是最容易犯错的阶段。先看谁可能是敌人，再决定是打伤害、补资源还是留防御。</p></article>
              <article><strong>弃牌</strong><p>超出手牌上限就要弃牌。奥林匹斯阵营在这一步更舒服，因为手牌上限 +1。</p></article>
              <article><strong>结束</strong><p>结算回合末收益，例如【圣物·丰饶之角】。</p></article>
            </div>
          </section>

          <section class="guide-section" id="cards">
            <div class="guide-section-head">
              <span>Cards</span>
              <h2>先学这 6 张牌，就能打完第一局</h2>
            </div>
            <div class="guide-card-rail">
              ${cardRail}
            </div>
          </section>

          <section class="guide-section" id="factions">
            <div class="guide-section-head">
              <span>Factions</span>
              <h2>五大阵营怎么理解</h2>
            </div>
            <div class="guide-grid five">
              <article class="guide-panel">
                <h3>华夏</h3>
                <p>稳健，偏续航与配合。你很少因为一回合爆发赢，但很容易靠资源和容错拖死对手。</p>
              </article>
              <article class="guide-panel">
                <h3>奥林匹斯</h3>
                <p>最均衡，牌型效率高。新手用起来舒服，因为很少有“抽到牌也不会打”的尴尬局面。</p>
              </article>
              <article class="guide-panel">
                <h3>吠陀</h3>
                <p>高波动，高上限。适合已经能判断局势的人，新手容易因为判定型收益而误以为自己很稳。</p>
              </article>
              <article class="guide-panel">
                <h3>凯美特</h3>
                <p>续航强，适合学习站场与节奏控制。你不会打得特别花，但很适合建立“先活下来”的好习惯。</p>
              </article>
              <article class="guide-panel">
                <h3>阿斯加德</h3>
                <p>爆发高，代价也大。最怕新手“以为自己很猛”，结果先把自己打进斩杀线。</p>
              </article>
            </div>
          </section>

          <section class="guide-section" id="modes">
            <div class="guide-section-head">
              <span>Modes</span>
              <h2>三种模式怎么选</h2>
            </div>
            <div class="guide-grid three">
              <article class="guide-panel">
                <h3>快速战斗</h3>
                <p>标准七人局。推荐第一次接触这套游戏时先打这个模式，熟悉身份局的判断逻辑。</p>
              </article>
              <article class="guide-panel accent">
                <h3>排位赛</h3>
                <p>规则与快速战斗一致，但只有这里会结算段位经验。你当前默认从 <strong>${escapeHtml(rankMeta.display)}</strong> 起步。</p>
                <p>每赢一局 +20，输一局 -10。每个小阶段固定需要 100 经验。</p>
              </article>
              <article class="guide-panel">
                <h3>杀戮模式</h3>
                <p>只改变摸牌阶段：每回合摸 4 张。资源更爆炸，节奏更快，更容易出现连续压制和高伤害回合。</p>
              </article>
            </div>
          </section>

          <section class="guide-section" id="battleplan">
            <div class="guide-section-head">
              <span>Decision</span>
              <h2>把一局拆成 4 个决策阶段</h2>
            </div>
            <div class="guide-grid four">
              <article class="guide-panel">
                <h3>开局两回合</h3>
                <p>默认策略是藏信息、留防御、观察谁在保护主神。除非你已经非常确定身份关系，否则不要为了 1 点伤害过早暴露自己。</p>
              </article>
              <article class="guide-panel">
                <h3>中盘成型</h3>
                <p>这时开始看资源差。谁手牌多、谁装备完整、谁血线安全，谁就更值得你优先处理。新手不要只盯血量，手牌常常比血更重要。</p>
              </article>
              <article class="guide-panel">
                <h3>残局判断</h3>
                <p>当场上只剩三四人时，身份价值会急剧上升。护法的任务是保主神，逆神的任务是切主神，堕神则要拖到最适合单挑的时机再翻脸。</p>
              </article>
              <article class="guide-panel accent">
                <h3>排位思维</h3>
                <p>排位不是拼谁更敢打，而是拼谁更少犯错。赢一局只加 20，输一局会扣 10，所以稳定判断和稳健资源管理，比偶尔高光更重要。</p>
              </article>
            </div>
          </section>

          <section class="guide-section" id="advanced">
            <div class="guide-section-head">
              <span>Advanced</span>
              <h2>推荐的入门英雄与进阶建议</h2>
            </div>
            <div class="guide-hero-rail">
              ${heroRail}
            </div>
            <div class="guide-grid two">
              <article class="guide-panel">
                <h3>新手推荐英雄</h3>
                <p>大禹、雅典娜、拉。这三位的共同点是：操作节奏清晰、收益稳定、出错成本不高。先用他们打出“知道自己这回合该做什么”的感觉。</p>
              </article>
              <article class="guide-panel">
                <h3>进阶观察点</h3>
                <p>1. 谁在无条件保护主神。2. 谁一直在压主神资源。3. 谁看似中立却在收残局。4. 谁在出牌阶段过于激进却没有留盾。这四点基本就是身份局阅读的核心。</p>
              </article>
            </div>
          </section>

          <section class="guide-section guide-final">
            <div class="guide-section-head">
              <span>Next</span>
              <h2>现在直接去打第一局</h2>
            </div>
            <div class="guide-grid two">
              <article class="guide-panel">
                <h3>第一次实战建议</h3>
                <p>先选快速战斗，优先拿大禹或雅典娜。前两回合保留【神盾】和【灵药】，不要因为能打出一点伤害就把手牌全部扔出去。</p>
              </article>
              <article class="guide-panel">
                <h3>什么时候打排位</h3>
                <p>当你已经能看懂“谁像护法、谁像逆神、谁像堕神”时再进排位。排位不要求你更激进，而要求你更稳。</p>
              </article>
            </div>
            <div class="guide-cta">
              <a class="guide-link primary" href="/game">返回大厅开始实战</a>
            </div>
          </section>
        </main>
      </div>
    </body>
  </html>`;
}

function renderEmotionArkPage({ user }) {
  const isLoggedIn = Boolean(user);
  const viewerName = user ? user.nickname || user.name || user.displayName || "SecondMe 用户" : "访客";
  const authAction = isLoggedIn
    ? `<a class="ark-link" href="/logout">退出登录</a>`
    : `<a class="ark-link primary" href="/login">SecondMe 登录</a>`;
  const bootJson = JSON.stringify({
    loggedIn: isLoggedIn,
    viewerName,
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>情感方舟</title>
      <style>
        :root {
          --ark-bg: #f6f8f4;
          --ark-card: #ffffff;
          --ark-text: #1f2c24;
          --ark-muted: #66776d;
          --ark-primary: #1f8f6a;
          --ark-primary-strong: #166f52;
          --ark-line: #dbe5dd;
          --ark-soft: #ecf5ef;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          color: var(--ark-text);
          background:
            radial-gradient(1200px 500px at 90% -10%, #d9f0e4 0%, transparent 65%),
            radial-gradient(900px 400px at -10% 10%, #e6efe7 0%, transparent 60%),
            var(--ark-bg);
          min-height: 100vh;
        }
        .ark-wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 20px;
        }
        .ark-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .ark-brand {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .ark-links {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ark-link {
          text-decoration: none;
          color: var(--ark-text);
          border: 1px solid var(--ark-line);
          background: #fff;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
        }
        .ark-link.primary {
          border-color: var(--ark-primary);
          background: var(--ark-primary);
          color: #fff;
        }
        .ark-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr 1.35fr;
        }
        .ark-card {
          background: var(--ark-card);
          border: 1px solid var(--ark-line);
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 14px 36px rgba(31, 44, 36, 0.08);
        }
        .ark-title {
          margin: 0;
          font-size: 30px;
          line-height: 1.2;
        }
        .ark-subtitle {
          margin: 10px 0 0;
          color: var(--ark-muted);
          line-height: 1.7;
        }
        .ark-pill {
          display: inline-flex;
          margin-top: 14px;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: var(--ark-soft);
          color: var(--ark-primary-strong);
        }
        .ark-log {
          background: #fcfefd;
          border: 1px solid var(--ark-line);
          border-radius: 14px;
          padding: 14px;
          min-height: 360px;
          max-height: 56vh;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ark-msg {
          max-width: 92%;
          padding: 10px 12px;
          border-radius: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 14px;
        }
        .ark-msg.user {
          align-self: flex-end;
          background: #e6f6ef;
          border: 1px solid #c7e9db;
        }
        .ark-msg.assistant {
          align-self: flex-start;
          background: #f5f8f6;
          border: 1px solid #dfe9e2;
        }
        .ark-composer {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }
        .ark-row {
          display: grid;
          grid-template-columns: 1fr 130px 120px;
          gap: 10px;
        }
        .ark-input, .ark-select, .ark-number {
          border: 1px solid var(--ark-line);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          background: #fff;
        }
        .ark-input:focus, .ark-select:focus, .ark-number:focus {
          outline: none;
          border-color: #96cbb6;
          box-shadow: 0 0 0 3px rgba(31, 143, 106, 0.13);
        }
        .ark-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .ark-btn {
          border: none;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          background: var(--ark-primary);
          color: #fff;
        }
        .ark-btn[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ark-tip {
          margin-top: 8px;
          color: var(--ark-muted);
          font-size: 12px;
          line-height: 1.6;
        }
        @media (max-width: 980px) {
          .ark-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .ark-wrap { padding: 14px; }
          .ark-row { grid-template-columns: 1fr; }
          .ark-title { font-size: 24px; }
          .ark-topbar { align-items: flex-start; flex-direction: column; }
        }
      </style>
    </head>
    <body>
      <div class="ark-wrap">
        <header class="ark-topbar">
          <div class="ark-brand">情感方舟</div>
          <div class="ark-links">
            <a class="ark-link" href="/game">神迹对决</a>
            <a class="ark-link" href="/tutorial">新手教学</a>
            ${authAction}
          </div>
        </header>
        <main class="ark-grid">
          <section class="ark-card">
            <h1 class="ark-title">把情绪先说出来，剩下的我们一起拆解。</h1>
            <p class="ark-subtitle">这里不是评判场，也不要求你立刻“变好”。你可以从一句最真实的话开始，我会先共情，再给可执行的小步骤。支持焦虑、难过、愤怒、失眠、人际压力等场景。</p>
            <div class="ark-pill">当前身份：${escapeHtml(viewerName)}</div>
            <p class="ark-tip">说明：该页面调用本地 <code>emotional_support_chat</code> 工具；如涉及紧急风险，请优先联系身边可信任的人和当地紧急援助渠道。</p>
          </section>
          <section class="ark-card">
            <div class="ark-log" id="arkLog"></div>
            <form class="ark-composer" id="arkForm">
              <div class="ark-row">
                <input id="arkMessage" class="ark-input" placeholder="比如：最近一直睡不着，白天上班很焦虑..." maxlength="2000" required />
                <select id="arkMood" class="ark-select">
                  <option value="">情绪标签（可选）</option>
                  <option value="焦虑">焦虑</option>
                  <option value="难过">难过</option>
                  <option value="愤怒">愤怒</option>
                  <option value="疲惫">疲惫</option>
                  <option value="迷茫">迷茫</option>
                </select>
                <input id="arkIntensity" class="ark-number" type="number" min="0" max="10" step="1" placeholder="强度 0-10" />
              </div>
              <div class="ark-actions">
                <button id="arkSend" type="submit" class="ark-btn">发送</button>
              </div>
            </form>
          </section>
        </main>
      </div>
      <script>
        window.EMOTION_BOOT = ${bootJson};
        (function () {
          const boot = window.EMOTION_BOOT || {};
          const form = document.getElementById("arkForm");
          const log = document.getElementById("arkLog");
          const messageInput = document.getElementById("arkMessage");
          const moodInput = document.getElementById("arkMood");
          const intensityInput = document.getElementById("arkIntensity");
          const sendBtn = document.getElementById("arkSend");

          function append(role, text) {
            const node = document.createElement("article");
            node.className = "ark-msg " + role;
            node.textContent = text;
            log.appendChild(node);
            log.scrollTop = log.scrollHeight;
          }

          append("assistant", "你好，我是情感方舟。你可以先说一句你现在最难受的地方。");
          if (!boot.loggedIn) {
            append("assistant", "你还未登录 SecondMe，先点右上角“SecondMe 登录”，登录后我就能结合你的身份继续支持你。");
          } else {
            append("assistant", "欢迎回来，" + (boot.viewerName || "你") + "。我们从当下这一个困扰开始。");
          }

          form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const text = String(messageInput.value || "").trim();
            if (!text) return;

            append("user", text);
            messageInput.value = "";
            sendBtn.disabled = true;
            sendBtn.textContent = "处理中...";

            try {
              const payload = { message: text };
              const mood = String(moodInput.value || "").trim();
              const intensity = Number(intensityInput.value);
              if (mood) payload.mood = mood;
              if (Number.isFinite(intensity)) payload.intensity = intensity;

              const response = await fetch("/api/emotion/support", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const json = await response.json().catch(function () { return {}; });
              if (!response.ok || !json.ok) {
                const err = json.error || "请求失败，请先确认登录状态。";
                append("assistant", "暂时无法处理： " + err);
                return;
              }

              const data = json.data || {};
              let answer = String(data.reply || "我在这里听你说。");
              if (Array.isArray(data.steps) && data.steps.length) {
                answer += "\\n\\n你现在可以先做：\\n" + data.steps.map(function (item, index) {
                  return (index + 1) + ". " + item;
                }).join("\\n");
              }
              if (data.disclaimer) {
                answer += "\\n\\n提示：" + data.disclaimer;
              }
              append("assistant", answer);
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              append("assistant", "网络异常：" + msg);
            } finally {
              sendBtn.disabled = false;
              sendBtn.textContent = "发送";
            }
          });
        })();
      </script>
    </body>
  </html>`;
}

function renderQuickBattlePage(user, options = {}) {
  const battleHeroes = flattenHeroes();
  const modeMeta = getBattleModeMeta(options.mode);
  const selectedHeroId = typeof options.selectedHeroId === "string" ? options.selectedHeroId : "";
  const preferredPlayerCount = normalizeBattlePlayerCount(options.playerCount);
  const selectedHero = battleHeroes.find((hero) => hero.id === selectedHeroId) || battleHeroes[0] || null;
  const battleBackground = getBattleBackground(modeMeta.key, selectedHero);
  const rankMeta = getRankMeta(options.rankProgress?.score || 0);
  const battleCards = flattenCards().map((card) => ({
    id: card.id,
    category: card.category,
    subType: card.subType,
    originalName: card.originalName,
    newName: card.newName,
    quantity: card.quantity,
    suit: card.suit,
    effect: card.effect,
    design: card.design,
    range: card.range || null,
  }));
  
  // 获取匹配中的玩家信息
  let matchedPlayers = [];
  if (options.matchId) {
    const match = activeMatches.get(options.matchId);
    if (match && match.players) {
      matchedPlayers = match.players;
    }
  }
  const resolvedPlayerCount = normalizeBattlePlayerCount(matchedPlayers.length || preferredPlayerCount);
  
  const battleBoot = {
    viewer: user
      ? {
          id: String(user.id || user.userId || user.uid || ""),
          name: user.nickname || user.name || user.displayName || "SecondMe 玩家",
        }
      : {
          id: "",
          name: "访客玩家",
        },
    mode: modeMeta.key,
    modeLabel: modeMeta.label,
    drawPhaseCount: modeMeta.drawPhaseCount,
    rankEnabled: Boolean(modeMeta.rankEnabled),
    rankProgress: rankMeta,
    selectedHeroId,
    heroes: battleHeroes,
    cards: battleCards,
    matchedPlayers: matchedPlayers,
    playerCount: resolvedPlayerCount,
  };
  const bootJson = JSON.stringify(battleBoot).replaceAll("<", "\\u003c");

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>神迹对决 - ${modeMeta.label}</title>
      <link rel="stylesheet" href="/quick-battle.css" />
    </head>
    <body style="--qb-battle-bg:url('${battleBackground}')">
      <div class="qb-page">
        <header class="qb-header">
          <a class="qb-back" href="/game">返回大厅</a>
          <div class="qb-title">
            <div id="qbTurnTimer" class="qb-turn-timer">20</div>
          </div>
          <div class="qb-footer-actions">
            <button class="qb-ghost" id="qbRestart" type="button">重新开局</button>
            <button class="qb-ghost" id="qbChatToggle" type="button">聊天</button>
            <button class="qb-ghost" id="qbVoiceToggle" type="button">语音</button>
          </div>
        </header>

        <div class="qb-chat-panel" id="qbChatPanel" style="display: none; position: fixed; bottom: 80px; right: 20px; width: 300px; max-height: 400px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 12px; z-index: 1000; overflow: hidden;">
          <div style="padding: 12px; border-bottom: 1px solid rgba(251, 191, 36, 0.2); display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fbbf24; font-weight: bold;">游戏聊天</span>
            <button id="qbChatClose" style="background: none; border: none; color: #9dc0ea; cursor: pointer; font-size: 18px;">×</button>
          </div>
          <div id="qbChatMessages" style="height: 280px; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="text-align: center; color: #64748b; font-size: 12px;">暂无消息</div>
          </div>
          <div style="padding: 12px; border-top: 1px solid rgba(251, 191, 36, 0.2); display: flex; gap: 8px;">
            <input type="text" id="qbChatInput" placeholder="发送消息..." style="flex: 1; padding: 8px; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 6px; background: rgba(31, 24, 10, 0.62); color: #eef6ff; font-size: 14px;">
            <button id="qbChatSend" style="padding: 8px 16px; background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 6px; color: #fbbf24; cursor: pointer;">发送</button>
          </div>
        </div>

        <div class="qb-voice-panel" id="qbVoicePanel" style="display: none; position: fixed; bottom: 80px; right: 20px; width: 300px; max-height: 400px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 12px; z-index: 1000; overflow: hidden;">
          <div style="padding: 12px; border-bottom: 1px solid rgba(251, 191, 36, 0.2); display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fbbf24; font-weight: bold;">语音聊天</span>
            <button id="qbVoiceClose" style="background: none; border: none; color: #9dc0ea; cursor: pointer; font-size: 18px;">×</button>
          </div>
          <div id="qbVoiceMessages" style="height: 280px; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="text-align: center; color: #64748b; font-size: 12px;">暂无语音消息</div>
          </div>
          <div style="padding: 12px; border-top: 1px solid rgba(251, 191, 36, 0.2); display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="qbVoiceInput" placeholder="输入文字转语音..." style="flex: 1; padding: 8px; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 6px; background: rgba(31, 24, 10, 0.62); color: #eef6ff; font-size: 14px;">
            <div style="display: flex; gap: 8px;">
              <button id="qbVoiceRecord" style="flex: 1; padding: 8px 16px; background: rgba(248, 113, 113, 0.2); border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 6px; color: #f87171; cursor: pointer;">按住说话</button>
              <button id="qbVoiceSend" style="padding: 8px 16px; background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 6px; color: #fbbf24; cursor: pointer;">发送</button>
            </div>
          </div>
        </div>

        <div class="qb-layout">
          <aside class="qb-panel qb-hud-panel">
            <div class="qb-hud-primary">
              <div class="qb-hud-chip">
                <span>模式</span>
                <strong>${modeMeta.label}</strong>
              </div>
              <div class="qb-hud-chip">
                <span>回合</span>
                <strong id="qbTurnSummary"></strong>
              </div>
              <div class="qb-hud-chip">
                <span>行动角色</span>
                <strong id="qbActorSummary"></strong>
              </div>
              <div class="qb-hud-chip">
                <span>牌堆</span>
                <strong id="qbGraveSummary"></strong>
              </div>
            </div>
            <div class="qb-phase-strip" id="qbPhaseStrip"></div>
          </aside>

          <section class="qb-mainstage">
            <section class="qb-panel qb-arena-panel">
              <div class="qb-arena" id="qbArena">
                <div class="qb-banner" id="qbBanner">诸神集结中...</div>
              </div>

              <div class="qb-control-panel">
                <div class="qb-hint" id="qbHint">战局加载中。</div>
                <div class="qb-hand-wrap">
                  <div class="qb-hand-title">
                    <span>你的手牌</span>
                    <span id="qbHandMeta"></span>
                  </div>
                  <div class="qb-hand-list" id="qbHandList"></div>
                </div>
                <div class="qb-actions">
                  <button class="qb-primary" id="qbEndTurn" type="button">结束出牌</button>
                  <button class="qb-ghost" id="qbCancelSelection" type="button">取消选牌</button>
                  <button class="qb-ghost" id="qbAutoRun" type="button">本回合托管</button>
                </div>
              </div>
            </section>
          </section>

          <aside class="qb-sidebar">
            <section class="qb-panel qb-log-panel">
              <h3>战报</h3>
              <div class="qb-log-list" id="qbLogList"></div>
            </section>
          </aside>
        </div>

        <section class="qb-result" id="qbResult">
          <div class="qb-result-card">
            <div class="qb-result-kicker" id="qbResultKicker">对局结束</div>
            <h2 id="qbResultTitle">胜利</h2>
            <div class="qb-result-camp" id="qbResultCamp"></div>
            <p id="qbResultText"></p>
            <div class="qb-result-actions">
              <button class="qb-primary" id="qbResultRestart" type="button">再来一局</button>
              <a class="qb-ghost" href="/game">返回大厅</a>
            </div>
          </div>
        </section>
      </div>

      <script>window.BATTLE_BOOT = ${bootJson};</script>
      <script src="/quick-battle.js"></script>
    </body>
  </html>`;
}

app.get("/api/art/hero/:heroId.svg", (req, res) => {
  const heroId = String(req.params.heroId || "");
  const svg = getHeroAvatarSvgById(heroId);
  if (!svg) {
    res.status(404).json({ ok: false, error: "hero_art_not_found" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(svg);
});

app.get("/api/art/card/:cardId.svg", (req, res) => {
  const cardId = String(req.params.cardId || "");
  const svg = getCardAvatarSvgById(cardId);
  if (!svg) {
    res.status(404).json({ ok: false, error: "card_art_not_found" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(svg);
});

app.get("/login", (req, res) => {
  if (!requireConfig(res)) return;
  const state = crypto.randomBytes(16).toString("hex");
  setCookie(res, "oauth_state", state, 600, { secure: isSecureRequest(req) });
  const params = new URLSearchParams({
    client_id: SECONDME_CLIENT_ID,
    redirect_uri: SECONDME_REDIRECT_URI,
    response_type: "code",
    state,
    prompt: "consent",
    scope: "user:info",
  });
  res.redirect(`${SECONDME_OAUTH_URL}?${params.toString()}`);
});

app.get("/api/auth/login", (req, res) => {
  res.redirect(302, "/login");
});

app.get("/logout", async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) await deleteStoredSession(cookies.sid);
  clearCookie(res, "sid", { secure: isSecureRequest(req) });
  clearCookie(res, SESSION_COOKIE_NAME, { secure: isSecureRequest(req) });
  clearCookie(res, "oauth_state", { secure: isSecureRequest(req) });
  res.redirect("/");
});

// 匹配相关的 API 端点
const matchQueue = new Set();
const activeMatches = new Map();
const matchChats = new Map();
const userMatchTimers = new Map();
const matchQueuePlayerCounts = new Map();
const matchQueueModes = new Map();
const matchChatLastSyncedAt = new Map();
const matchChatLastAmbientAt = new Map();
const SUPPORTED_MATCH_MODES = new Set(["quick", "ranked", "slaughter", "manual"]);

function normalizeBattlePlayerCount(value) {
  const numeric = Number(value);
  if (SUPPORTED_BATTLE_PLAYER_COUNTS.includes(numeric)) return numeric;
  return DEFAULT_BATTLE_PLAYER_COUNT;
}

function normalizeMatchMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (SUPPORTED_MATCH_MODES.has(normalized)) return normalized;
  return "quick";
}

function clearMatchState(matchId) {
  activeMatches.delete(matchId);
  matchChats.delete(matchId);
  matchChatLastSyncedAt.delete(matchId);
  matchChatLastAmbientAt.delete(matchId);
}

const MATCH_CHAT_REPLY_TEMPLATES = [
  "收到，我这边马上配合。",
  "这波可以，继续压制。",
  "我在看你这边的节奏，稳住就能赢。",
  "这个点打得不错，我来跟上。",
  "注意资源，我这边先保留关键牌。",
  "你这句提醒很及时，谢了。",
];

const MATCH_VOICE_REPLY_TEMPLATES = [
  "我听到了，马上行动。",
  "语音收到，这回合我来补位。",
  "战术清楚了，我们继续推进。",
  "好，按你说的节奏来。",
  "明白，我这边准备接应。",
];

const MATCH_CHAT_AMBIENT_TEMPLATES = [
  "我这回合手牌一般，先观望。",
  "注意一下场上血线，别被反打。",
  "我感觉下一轮可以冲一波。",
  "对面这张牌有点危险，别大意。",
  "我这边准备了一张关键牌。",
  "节奏在我们这边，继续保持。",
];

const MATCH_VOICE_AMBIENT_TEMPLATES = [
  "语音提醒：先保命再输出。",
  "语音提醒：我下一手会补控制。",
  "语音提醒：别急着交全部资源。",
  "语音提醒：先把残血目标收掉。",
  "语音提醒：我这边可以先扛伤害。",
];

function randomItem(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[Math.floor(Math.random() * list.length)] || "";
}

function normalizeMatchMessageType(type) {
  return String(type || "").toLowerCase() === "voice" ? "voice" : "chat";
}

function createMatchChatMessage(player, text, type = "chat", extra = {}) {
  const message = String(text || "").trim().slice(0, 200);
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerId: String(player?.id || ""),
    playerName: String(player?.name || "玩家"),
    message,
    type: normalizeMatchMessageType(type),
    timestamp: Date.now(),
    origin: String(extra.origin || "player"),
  };
}

function normalizeStoredMatchChat(item) {
  if (!item || typeof item !== "object") return null;
  const message = String(item.message || item.content || "").trim().slice(0, 200);
  if (!message) return null;
  const timestamp = Number(item.timestamp);
  return {
    id: String(item.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    playerId: String(item.playerId || item.userId || ""),
    playerName: String(item.playerName || item.name || "玩家"),
    message,
    type: normalizeMatchMessageType(item.type || item.messageType),
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    origin: String(item.origin || "player"),
  };
}

function parseMatchChatValue(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return [];
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
  }
  let rows = [];
  if (Array.isArray(parsed)) rows = parsed;
  if (!rows.length && parsed && typeof parsed === "object" && Array.isArray(parsed.messages)) {
    rows = parsed.messages;
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => normalizeStoredMatchChat(item))
    .filter(Boolean)
    .slice(-MATCH_CHAT_MAX_MESSAGES);
}

function buildMatchChatKey(matchId) {
  return `${SECONDME_MATCH_CHAT_KEY_PREFIX}${String(matchId || "").slice(0, 96)}`;
}

async function loadMatchChatsFromSecondMe(accessToken, matchId) {
  if (!accessToken || !matchId) return null;
  try {
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 0 || !Array.isArray(json.data)) return null;
    const chatEntry = json.data.find((item) => item?.key === buildMatchChatKey(matchId));
    if (!chatEntry) return [];
    return parseMatchChatValue(chatEntry.value);
  } catch (error) {
    console.error("加载对战聊天记录失败:", error);
    return null;
  }
}

async function saveMatchChatsToSecondMe(accessToken, matchId, chats) {
  if (!accessToken || !matchId) return false;
  try {
    const payload = parseMatchChatValue(chats);
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: buildMatchChatKey(matchId),
        value: payload,
        timestamp: Date.now(),
      }),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 0) {
      console.error("保存对战聊天记录失败:", json || resp.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.error("保存对战聊天记录出错:", error);
    return false;
  }
}

async function getMatchChats(matchId, accessToken, options = {}) {
  if (!matchChats.has(matchId)) matchChats.set(matchId, []);
  const localChats = matchChats.get(matchId) || [];
  const lastSync = Number(matchChatLastSyncedAt.get(matchId) || 0);
  const shouldSync =
    Boolean(accessToken) &&
    (options.forceSync || localChats.length === 0 || Date.now() - lastSync >= MATCH_CHAT_SYNC_INTERVAL_MS);

  if (shouldSync) {
    const remoteChats = await loadMatchChatsFromSecondMe(accessToken, matchId);
    if (remoteChats !== null) {
      matchChats.set(matchId, remoteChats);
      matchChatLastSyncedAt.set(matchId, Date.now());
    }
  }
  return matchChats.get(matchId) || [];
}

async function appendMatchChats(matchId, accessToken, newMessages) {
  const base = await getMatchChats(matchId, accessToken);
  const normalized = (Array.isArray(newMessages) ? newMessages : [])
    .map((item) => normalizeStoredMatchChat(item))
    .filter(Boolean);
  if (normalized.length === 0) return base;
  const merged = base.concat(normalized).slice(-MATCH_CHAT_MAX_MESSAGES);
  matchChats.set(matchId, merged);
  matchChatLastSyncedAt.set(matchId, Date.now());
  await saveMatchChatsToSecondMe(accessToken, matchId, merged);
  return merged;
}

function parseSecondMeReplyArray(content) {
  if (!content || typeof content !== "string") return [];
  const candidates = [];
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1]);
  candidates.push(content);
  for (const raw of candidates) {
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    const attempt = arrayMatch ? arrayMatch[0] : raw;
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return [];
}

async function generateSecondMeReplies(accessToken, match, sender, message, messageType) {
  const others = (match?.players || []).filter((p) => String(p.id) !== String(sender?.id));
  if (!accessToken || others.length === 0) return [];
  const otherPlayersText = others.map((p) => `- id=${p.id}, name=${p.name || "玩家"}`).join("\n");
  const prompt = `你在神话卡牌对战里扮演多个玩家，帮我生成简短回复。
当前说话者：${sender?.name || "玩家"}（id=${sender?.id || ""}）
消息类型：${normalizeMatchMessageType(messageType) === "voice" ? "语音" : "聊天"}
内容：${String(message || "").slice(0, 120)}

其他可回复玩家（只能从这些玩家里选）：
${otherPlayersText}

请输出 1 到 2 条回复，格式必须是 JSON 数组，数组元素格式：
{"playerId":"玩家id","type":"chat或voice","message":"回复内容"}
要求：回复口吻像在线对战队友，20字以内，不要解释，不要额外文本。`;

  try {
    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/agent/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "你是神话卡牌对战中的多玩家聊天助手，只输出 JSON 数组。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 0 || !json.data?.content) return [];
    const rows = parseSecondMeReplyArray(json.data.content);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const allowed = new Set(others.map((p) => String(p.id)));
    const mapped = rows
      .map((item) => {
        const playerId = String(item?.playerId || "");
        if (!allowed.has(playerId)) return null;
        const player = others.find((p) => String(p.id) === playerId);
        const text = String(item?.message || "").trim().slice(0, 200);
        if (!text) return null;
        return createMatchChatMessage(player, text, item?.type || "chat", { origin: "secondme_reply" });
      })
      .filter(Boolean)
      .slice(0, 2);
    return mapped;
  } catch (error) {
    console.error("SecondMe 自动回复生成失败:", error);
    return [];
  }
}

function buildFallbackReplies(match, sender, sourceMessage, sourceType) {
  const others = (match?.players || []).filter((p) => String(p.id) !== String(sender?.id));
  if (others.length === 0) return [];
  const count = Math.min(others.length, 1 + Math.floor(Math.random() * 2));
  const selected = [...others].sort(() => Math.random() - 0.5).slice(0, count);
  const quote = String(sourceMessage || "").trim().slice(0, 10);
  return selected.map((player, idx) => {
    const isVoice = Math.random() < (normalizeMatchMessageType(sourceType) === "voice" ? 0.6 : 0.35);
    const baseText = randomItem(isVoice ? MATCH_VOICE_REPLY_TEMPLATES : MATCH_CHAT_REPLY_TEMPLATES);
    const replyText = idx === 0 && quote ? `${baseText}（${quote}）` : baseText;
    return createMatchChatMessage(player, replyText, isVoice ? "voice" : "chat", { origin: "fallback_reply" });
  });
}

function maybeBuildAmbientMessage(match, viewerId, matchId) {
  const players = (match?.players || []).filter((p) => String(p.id) !== String(viewerId || ""));
  if (players.length === 0) return null;
  const now = Date.now();
  const lastAt = Number(matchChatLastAmbientAt.get(matchId) || 0);
  if (now - lastAt < MATCH_CHAT_RANDOM_SPEAK_INTERVAL_MS) return null;
  if (Math.random() > 0.2) return null;
  const speaker = randomItem(players);
  const isVoice = Math.random() < 0.35;
  const content = randomItem(isVoice ? MATCH_VOICE_AMBIENT_TEMPLATES : MATCH_CHAT_AMBIENT_TEMPLATES);
  if (!content) return null;
  matchChatLastAmbientAt.set(matchId, now);
  return createMatchChatMessage(speaker, content, isVoice ? "voice" : "chat", { origin: "ambient" });
}

// 生成AI玩家
function generateAIPlayers(count, userId, userName) {
  const aiPlayers = [];
  const aiNames = [
    "宙斯的化身", "雅典娜的使者", "湿婆的信徒", "奥丁的战士", "拉的祭司", "女娲的传人"
  ];
  
  for (let i = 0; i < count; i++) {
    aiPlayers.push({
      id: `ai-${Date.now()}-${i}`,
      name: aiNames[i % aiNames.length],
      avatar: "/assets/bg-myth-war.png", // 使用默认头像
      isAI: true,
      masterId: userId, // 标记AI由哪个用户控制
    });
  }
  
  return aiPlayers;
}

function generateBattleSummary(history) {
  const { result, playerName, playerHero, opponentName, opponentHero, mode, timestamp } = history;
  const date = new Date(timestamp).toLocaleString();
  
  let summary = `【神迹对决】战绩分享\n\n`;
  summary += `📅 时间：${date}\n`;
  summary += `🎮 模式：${mode === 'ranked' ? '排位赛' : mode === 'quick' ? '快速战斗' : '休闲模式'}\n\n`;
  summary += `👑 玩家：${playerName}（${playerHero}）\n`;
  summary += `🤖 对手：${opponentName}（${opponentHero}）\n\n`;
  summary += `🏆 结果：${result === 'win' ? '胜利' : '失败'}\n\n`;
  
  if (result === 'win') {
    summary += `🎉 恭喜！你在这场激烈的神话对决中取得了胜利！\n`;
    summary += `你的英雄 ${playerHero} 展现了强大的实力，成功击败了对手 ${opponentHero}。\n`;
  } else {
    summary += `💪 虽然这次失败了，但不要气馁！\n`;
    summary += `你的英雄 ${playerHero} 在战斗中表现出色，下次一定能够取得胜利！\n`;
  }
  
  summary += `\n#神迹对决 #游戏战绩 #神话对战`;
  
  return summary;
}

app.post("/api/match/join", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const userId = session.user.id;
  const userName = session.user.name;
  const userAvatar = session.user.avatar;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const mode = normalizeMatchMode(body.mode);
  const targetPlayerCount = normalizeBattlePlayerCount(body.playerCount);
  const selectedHeroId = String(body.hero || "");
  
  // 检查是否已经在队列中
  if (matchQueue.has(userId)) {
    const queuedMode = normalizeMatchMode(matchQueueModes.get(userId));
    const queuedCount = normalizeBattlePlayerCount(matchQueuePlayerCounts.get(userId));
    if (queuedMode !== mode || queuedCount !== targetPlayerCount) {
      matchQueueModes.set(userId, mode);
      matchQueuePlayerCounts.set(userId, targetPlayerCount);
    }
    res.json({ ok: true, status: "waiting", mode, playerCount: targetPlayerCount });
    return;
  }
  
  // 检查是否已经在匹配中
  for (const [matchId, match] of activeMatches.entries()) {
    if (match.players.some((p) => String(p.id) === String(userId))) {
      const existingCount = normalizeBattlePlayerCount(match.playerCount || match.players.length);
      const existingMode = normalizeMatchMode(match.mode);
      if (existingMode === mode && existingCount === targetPlayerCount) {
        res.json({ ok: true, status: "matched", matchId, mode, playerCount: existingCount });
        return;
      }
      // 模式或人数变化时，不复用旧对局，直接丢弃并创建新对局
      clearMatchState(matchId);
      break;
    }
  }
  
  // 尝试使用 Plaza API 获取活跃用户
  let recommendedUsers = [];
  try {
    const accessToken = session.token.accessToken;
    console.log("开始获取推荐用户（通过Plaza）");
    
    const plazaPaths = [
      "/api/secondme/plaza/posts?limit=20",
      "/api/secondme/plaza/feed?limit=20",
      "/api/plaza/posts?limit=20"
    ];
    
    for (const plazaPath of plazaPaths) {
      try {
        const resp = await fetch(`${SECONDME_API_BASE_URL}${plazaPath}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        console.log(`Plaza API 路径 ${plazaPath} 响应状态:`, resp.status);
        
        if (resp.ok) {
          const json = await resp.json().catch(() => null);
          console.log(`Plaza API 路径 ${plazaPath} 响应:`, JSON.stringify(json).slice(0, 300));
          
          if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
            const userIds = new Set();
            json.data.forEach(post => {
              if (post.author && post.author.id && String(post.author.id) !== String(userId)) {
                userIds.add(post.author.id);
              }
            });
            
            if (userIds.size > 0) {
              recommendedUsers = Array.from(userIds).slice(0, Math.max(1, targetPlayerCount - 1)).map(id => ({
                id: id,
                name: `用户${id}`,
                avatar: "/assets/bg-myth-war.png"
              }));
              console.log("从 Plaza 获取到的推荐用户:", recommendedUsers);
              break;
            }
          }
        }
      } catch (e) {
        console.error(`Plaza API 路径 ${plazaPath} 出错:`, e.message);
      }
    }
  } catch (e) {
    console.error("获取推荐用户出错:", e);
  }
  
  // 如果从 Plaza 获取失败，使用预定义的推荐用户列表
  if (recommendedUsers.length === 0) {
    console.log("Plaza API 获取失败，使用预定义推荐用户列表");
    const defaultUserIds = ["2292998", "2158643", "2279094", "2285987", "2234123", "2312342"];
    recommendedUsers = defaultUserIds
      .filter((id) => String(id) !== String(userId))
      .slice(0, Math.max(1, targetPlayerCount - 1))
      .map(id => ({
        id: id,
        name: `用户${id}`,
        avatar: "/assets/bg-myth-war.png"
      }));
  }
  
  console.log("推荐用户获取完成，共获取到", recommendedUsers.length, "个推荐用户");

  // 如果获取到推荐用户，直接创建包含这些用户的游戏
  if (recommendedUsers.length > 0) {
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const players = [
      {
        id: userId,
        name: userName,
        avatar: userAvatar,
        hero: selectedHeroId,
        isHuman: true,
      },
    ];
    
    // 添加推荐用户
    for (let i = 0; i < Math.min(recommendedUsers.length, Math.max(1, targetPlayerCount - 1)); i++) {
      const user = recommendedUsers[i];
      players.push({
        id: user.id,
        name: user.name || `SecondMe用户${user.id.slice(-4)}`,
        avatar: user.avatar || "/assets/bg-myth-war.png",
        hero: "",
        isHuman: false,
      });
    }
    
    // 如果人数不足目标人数，生成AI玩家
    if (players.length < targetPlayerCount) {
      const aiPlayers = generateAIPlayers(targetPlayerCount - players.length, userId, userName);
      players.push(...aiPlayers);
    }
    
    const match = {
      id: matchId,
      players: players,
      status: "ready",
      createdAt: Date.now(),
      isAI: false,
      playerCount: targetPlayerCount,
      mode,
    };
    
    activeMatches.set(matchId, match);
    
    // 5分钟后自动清理匹配
    setTimeout(() => {
      clearMatchState(matchId);
    }, 5 * 60 * 1000);
    
    console.log("创建匹配成功，使用Discover推荐用户，匹配ID:", matchId);
    res.json({ ok: true, status: "matched", matchId, mode, players: players, playerCount: targetPlayerCount });
    return;
  }
  
  // 清除之前的定时器
  if (userMatchTimers.has(userId)) {
    clearTimeout(userMatchTimers.get(userId));
    userMatchTimers.delete(userId);
  }
  
  // 加入匹配队列
  matchQueue.add(userId);
  matchQueuePlayerCounts.set(userId, targetPlayerCount);
  matchQueueModes.set(userId, mode);
  
  // 设置10秒匹配时间
  const timer = setTimeout(async () => {
    // 检查用户是否还在队列中
    if (matchQueue.has(userId)) {
      // 匹配超时，生成AI玩家
      matchQueue.delete(userId);
      const queuedPlayerCount = normalizeBattlePlayerCount(matchQueuePlayerCounts.get(userId));
      const queuedMode = normalizeMatchMode(matchQueueModes.get(userId));
      matchQueuePlayerCounts.delete(userId);
      matchQueueModes.delete(userId);
      
      // 创建匹配，包含用户和AI玩家
      const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const aiPlayers = generateAIPlayers(Math.max(0, queuedPlayerCount - 1), userId, userName);
      const match = {
        id: matchId,
        players: [
          {
            id: userId,
            name: userName,
            avatar: userAvatar,
            hero: selectedHeroId,
            isHuman: true,
          },
          ...aiPlayers
        ],
        status: "ready",
        createdAt: Date.now(),
        isAI: true, // 标记为AI匹配
        playerCount: queuedPlayerCount,
        mode: queuedMode,
      };
      
      activeMatches.set(matchId, match);
      
      // 5分钟后自动清理匹配
      setTimeout(() => {
        clearMatchState(matchId);
      }, 5 * 60 * 1000);
      
      // 通知用户匹配成功（AI）
      // 这里可以通过WebSocket或其他方式通知，但由于我们使用轮询，用户会在下次检查状态时发现
    }
  }, 10000); // 10秒匹配时间
  
  userMatchTimers.set(userId, timer);
  
  // 尝试立即匹配
  const sameCountQueuedUsers = [];
  for (const id of matchQueue) {
    const queueCount = normalizeBattlePlayerCount(matchQueuePlayerCounts.get(id));
    const queueMode = normalizeMatchMode(matchQueueModes.get(id));
    if (queueCount === targetPlayerCount && queueMode === mode) {
      sameCountQueuedUsers.push(id);
      if (sameCountQueuedUsers.length === 2) break;
    }
  }

  if (sameCountQueuedUsers.length >= 2) {
    const matchedUserIds = sameCountQueuedUsers.slice(0, 2);
    
    // 从队列中移除这些玩家
    for (const id of matchedUserIds) {
      matchQueue.delete(id);
      // 清除定时器
      if (userMatchTimers.has(id)) {
        clearTimeout(userMatchTimers.get(id));
        userMatchTimers.delete(id);
      }
      matchQueuePlayerCounts.delete(id);
      matchQueueModes.delete(id);
    }
    
    // 创建匹配
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const players = matchedUserIds.map((id) => ({
      id,
      name: String(id) === String(userId) ? userName : `SecondMe玩家${String(id).slice(-4)}`,
      avatar: String(id) === String(userId) ? userAvatar : "/assets/bg-myth-war.png",
      hero: String(id) === String(userId) ? selectedHeroId : "",
      isHuman: String(id) === String(userId),
    }));
    if (players.length < targetPlayerCount) {
      players.push(...generateAIPlayers(targetPlayerCount - players.length, userId, userName));
    }
    const match = {
      id: matchId,
      players,
      status: "ready",
      createdAt: Date.now(),
      isAI: false, // 标记为真实玩家匹配
      playerCount: targetPlayerCount,
      mode,
    };
    
    activeMatches.set(matchId, match);
    
    // 5分钟后自动清理匹配
    setTimeout(() => {
      clearMatchState(matchId);
    }, 5 * 60 * 1000);
    
    res.json({ ok: true, status: "matched", matchId, mode, playerCount: targetPlayerCount });
  } else {
    res.json({ ok: true, status: "waiting", mode, playerCount: targetPlayerCount });
  }
});

// 手动匹配其他SecondMe用户
app.post("/api/match/manual", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const userId = session.user.id;
  const userName = session.user.name;
  const userAvatar = session.user.avatar;
  const { playerIds } = req.body;
  const mode = normalizeMatchMode(req.body?.mode || "manual");
  const targetPlayerCount = normalizeBattlePlayerCount(req.body?.playerCount);
  
  if (!Array.isArray(playerIds)) {
    res.status(400).json({ ok: false, error: "invalid_player_ids" });
    return;
  }
  
  // 过滤掉自己
  const otherPlayerIds = playerIds.filter((id) => String(id) !== String(userId));
  
  // 创建匹配
  const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const players = [
    {
      id: userId,
      name: userName,
      avatar: userAvatar,
      hero: req.body.hero || "",
      isHuman: true,
    },
  ];
  
  // 添加其他玩家
  for (const playerId of otherPlayerIds) {
    players.push({
      id: playerId,
      name: `SecondMe玩家${playerId.slice(-4)}`, // 临时名称，实际应该从SecondMe API获取
      avatar: "/assets/bg-myth-war.png", // 临时头像
      hero: "", // 临时英雄，实际应该由玩家选择
      isHuman: false,
    });
  }
  
  // 生成AI玩家以达到目标人数
  if (players.length < targetPlayerCount) {
    const aiPlayers = generateAIPlayers(targetPlayerCount - players.length, userId, userName);
    players.push(...aiPlayers);
  }
  
  const match = {
    id: matchId,
    players,
    status: "ready",
    createdAt: Date.now(),
    isAI: false, // 标记为真实玩家匹配
    playerCount: targetPlayerCount,
    mode,
  };
  
  activeMatches.set(matchId, match);
  
  // 5分钟后自动清理匹配
  setTimeout(() => {
    clearMatchState(matchId);
  }, 5 * 60 * 1000);
  
  res.json({ ok: true, status: "matched", matchId, mode, playerCount: targetPlayerCount });
});

app.post("/api/match/leave", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const userId = session.user.id;
  matchQueue.delete(userId);
  matchQueuePlayerCounts.delete(userId);
  matchQueueModes.delete(userId);
  
  // 清除定时器
  if (userMatchTimers.has(userId)) {
    clearTimeout(userMatchTimers.get(userId));
    userMatchTimers.delete(userId);
  }
  
  // 从活跃匹配中移除
  for (const [matchId, match] of activeMatches.entries()) {
    if (match.players.some((p) => String(p.id) === String(userId))) {
      clearMatchState(matchId);
      break;
    }
  }
  
  res.json({ ok: true });
});

app.get("/api/match/status", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const userId = session.user.id;
  const mode = normalizeMatchMode(req.query.mode);
  const targetPlayerCount = normalizeBattlePlayerCount(req.query.players);
  
  // 检查是否在队列中
  if (matchQueue.has(userId)) {
    const queuedMode = normalizeMatchMode(matchQueueModes.get(userId));
    const queuedCount = normalizeBattlePlayerCount(matchQueuePlayerCounts.get(userId));
    if (queuedMode === mode && queuedCount === targetPlayerCount) {
      res.json({ ok: true, status: "waiting", mode, playerCount: queuedCount });
      return;
    }
  }
  
  // 检查是否在活跃匹配中
  for (const [matchId, match] of activeMatches.entries()) {
    if (match.players.some((p) => String(p.id) === String(userId))) {
      const existingMode = normalizeMatchMode(match.mode);
      const existingCount = normalizeBattlePlayerCount(match.playerCount || match.players.length);
      if (existingMode === mode && existingCount === targetPlayerCount) {
        res.json({ ok: true, status: "matched", matchId, match, mode, playerCount: existingCount });
        return;
      }
    }
  }
  
  res.json({ ok: true, status: "none", mode, playerCount: targetPlayerCount });
});

// 获取匹配中的玩家信息
app.get("/api/match/:matchId/players", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const matchId = req.params.matchId;
  const match = activeMatches.get(matchId);
  
  if (!match) {
    res.status(404).json({ ok: false, error: "match_not_found" });
    return;
  }
  
  res.json({ ok: true, players: match.players });
});

// 发送聊天消息
app.post("/api/match/:matchId/chat", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const matchId = req.params.matchId;
  const { message, playerId: requestPlayerId, messageType, skipAutoReply } = req.body || {};
  
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ ok: false, error: "invalid_message" });
    return;
  }
  
  const match = activeMatches.get(matchId);
  if (!match) {
    res.status(404).json({ ok: false, error: "match_not_found" });
    return;
  }
  
  // 确定发送消息的玩家
  let player;
  if (requestPlayerId) {
    // 允许其他玩家或AI通过SecondMe发送消息
    player = match.players.find(p => String(p.id) === String(requestPlayerId));
  } else {
    // 默认使用当前会话用户
    player = match.players.find(p => String(p.id) === String(session.user.id));
  }
  
  if (!player) {
    res.status(403).json({ ok: false, error: "not_in_match" });
    return;
  }
  
  const accessToken = session.token.accessToken;
  const incomingMessage = createMatchChatMessage(player, message, messageType || "chat", {
    origin: requestPlayerId ? "actor_message" : "player_message",
  });

  await getMatchChats(matchId, accessToken, { forceSync: true });

  const shouldReply = !Boolean(skipAutoReply);
  let autoReplies = [];
  if (shouldReply) {
    autoReplies = await generateSecondMeReplies(
      accessToken,
      match,
      player,
      incomingMessage.message,
      incomingMessage.type
    );
    if (autoReplies.length === 0) {
      autoReplies = buildFallbackReplies(match, player, incomingMessage.message, incomingMessage.type);
    }
  }

  const mergedChats = await appendMatchChats(matchId, accessToken, [incomingMessage, ...autoReplies]);
  res.json({ ok: true, message: incomingMessage, replies: autoReplies, chats: mergedChats.slice(-50) });
});

// 获取聊天消息
app.get("/api/match/:matchId/chat", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const matchId = req.params.matchId;
  const match = activeMatches.get(matchId);
  
  if (!match) {
    res.status(404).json({ ok: false, error: "match_not_found" });
    return;
  }
  
  const accessToken = session.token.accessToken;
  await getMatchChats(matchId, accessToken, { forceSync: true });
  const ambientMessage = maybeBuildAmbientMessage(match, session.user.id, matchId);
  let chats = matchChats.get(matchId) || [];
  if (ambientMessage) {
    chats = await appendMatchChats(matchId, accessToken, [ambientMessage]);
  }
  res.json({ ok: true, chats: chats.slice(-50) });
});

app.get("/api/match/recommend", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const userId = session.user.id;
  
  // 使用预定义的推荐用户列表
  const defaultUserIds = ["2292998", "2158643", "2279094", "2285987", "2234123", "2312342"];
  const recommendedUsers = defaultUserIds
    .filter((id) => String(id) !== String(userId))
    .slice(0, 6)
    .map(id => ({
      id: id,
      name: `用户${id}`,
      avatar: "/assets/bg-myth-war.png"
    }));
  
  res.json({ ok: true, users: recommendedUsers });
});

// SecondMe 思考 API 端点
app.post("/api/secondme/think", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken || !session?.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  
  const { gameState, action, actorId, actorName, handCards } = req.body;
  if (!gameState || typeof gameState !== "object") {
    res.status(400).json({ ok: false, error: "invalid_game_state" });
    return;
  }
  
  try {
    const accessToken = session.token.accessToken;
    
    const cardList = handCards?.join("、") || "无";
    const playerInfo = gameState.actor ? 
      `${gameState.actor.name}(${gameState.actor.faction}) 当前体力:${gameState.actor.hp}/${gameState.actor.maxHp}，手牌:[${cardList}]` :
      `当前玩家体力:${gameState.hp}/${gameState.maxHp}，手牌:[${cardList}]`;
    
    const otherPlayers = gameState.players?.map(p => 
      `${p.name}(${p.faction}) 体力:${p.hp}/${p.maxHp} 距离:${p.distance}${p.isHuman ? '(人类)' : ''}${p.role ? ' 身份:'+p.role : ''}`
    ).join("；") || "无";
    
    const prompt = `你是一个卡牌游戏"神迹对决"的AI玩家。请根据以下游戏状态，给出具体的出牌决策。

当前玩家信息：${playerInfo}
其他玩家信息：${otherPlayers}
当前回合：${gameState.turn}，阶段：${gameState.phase}
牌堆：摸牌堆${gameState.drawPileCount || 0}张，弃牌堆${gameState.discardPileCount || 0}张

请按以下JSON格式返回你的决策（只需要返回JSON，不要其他内容）：
{
  "thinking": "你的思考过程",
  "action": "pass" 或 "play" 或 "attack" 或 "heal" 或 "equip"，
  "cardName": "要使用的卡牌名称，如果不使用任何卡牌则为空",
  "targetId": "目标玩家ID，如果不指定目标则为空",
  "reason": "你做出这个决策的原因"
}`;

    const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/agent/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "你是一个卡牌游戏专家，擅长分析游戏状态并做出最佳决策。请严格按照JSON格式返回决策结果。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });
    
    const json = await resp.json().catch(() => null);
    if (resp.ok && json && json.code === 0 && json.data?.content) {
      const content = json.data.content;
      
      let structuredDecision = null;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredDecision = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log("解析SecondMe返回的JSON失败:", e);
      }
      
      res.json({ 
        ok: true, 
        think: content,
        decision: structuredDecision
      });
    } else {
      res.status(500).json({ ok: false, error: "secondme_think_failed" });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: "secondme_think_failed" });
  }
});

app.post("/api/battle/history", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  const history = req.body;
  if (!history || typeof history !== "object") {
    res.status(400).json({ ok: false, error: "invalid_history_data" });
    return;
  }
  try {
    // 添加新的历史记录
    const newHistory = {
      ...history,
      timestamp: Date.now(),
    };
    
    // 尝试使用 SecondMe Key Memory 存储战绩
    if (session?.token?.accessToken) {
      const accessToken = session.token.accessToken;
      // 先获取现有的 Key Memory
      let existingHistory = [];
      try {
        const getResp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        console.log("SecondMe Key Memory 获取响应状态:", getResp.status);
        const getJson = await getResp.json().catch(() => null);
        console.log("SecondMe Key Memory 获取响应数据:", getJson);
        if (getResp.ok && getJson && getJson.code === 0 && Array.isArray(getJson.data)) {
          // 查找历史记录数据
          const historyData = getJson.data.find(item => item.key === "battle_history");
          if (historyData && historyData.value) {
            existingHistory = Array.isArray(historyData.value) ? historyData.value : [];
          }
        }
      } catch (e) {
        console.error("获取 SecondMe Key Memory 出错:", e);
      }
      
      // 添加新的历史记录
      existingHistory.unshift(newHistory);
      // 只保留最近 50 条战绩
      if (existingHistory.length > 50) {
        existingHistory = existingHistory.slice(0, 50);
      }
      
      // 保存到 SecondMe Key Memory
      try {
        const setResp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: "battle_history",
            value: existingHistory,
            timestamp: Date.now(),
          }),
        });
        console.log("SecondMe Key Memory 保存响应状态:", setResp.status);
        const setJson = await setResp.json().catch(() => null);
        console.log("SecondMe Key Memory 保存响应数据:", setJson);
        if (setResp.ok && setJson && setJson.code === 0) {
          console.log("保存战绩到 SecondMe Key Memory 成功");
        } else {
          console.log("保存战绩到 SecondMe Key Memory 失败");
        }
      } catch (e) {
        console.error("保存战绩到 SecondMe Key Memory 出错:", e);
      }
    }
    
    // 保存历史记录到数据库（作为 fallback）
    const userId = session?.user?.id || 'anonymous';
    try {
      if (db) {
        // 插入新的历史记录
        await db.run(
          `INSERT INTO battle_history (user_id, result, player_name, player_hero, opponent_name, opponent_hero, mode, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, newHistory.result, newHistory.playerName, newHistory.playerHero, newHistory.opponentName, newHistory.opponentHero, newHistory.mode, newHistory.timestamp]
        );
        
        // 只保留最近 50 条战绩
        await db.run(
          `DELETE FROM battle_history WHERE user_id = ? AND id NOT IN (
            SELECT id FROM battle_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50
          )`,
          [userId, userId]
        );
        
        console.log("保存战绩到数据库成功");
      } else {
        console.log("数据库未初始化，跳过保存到数据库");
      }
    } catch (e) {
      console.error("保存战绩到数据库出错:", e);
    }
    
    // 发布帖子到 Plaza
    if (session?.token?.accessToken) {
      try {
        const accessToken = session.token.accessToken;
        
        // 生成战绩总结
        const battleSummary = generateBattleSummary(newHistory);
        
        // 发布帖子到 Plaza
        const postResp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/plaza/post`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: battleSummary,
            isPublic: true,
            tags: ["游戏", "神迹对决", "战绩"],
            timestamp: Date.now(),
          }),
        });
        
        console.log("Plaza 帖子发布响应状态:", postResp.status);
        const postJson = await postResp.json().catch(() => null);
        console.log("Plaza 帖子发布响应数据:", postJson);
        
        if (postResp.ok && postJson && postJson.code === 0) {
          console.log("发布战绩到 Plaza 成功");
        } else {
          console.log("发布战绩到 Plaza 失败");
        }
      } catch (e) {
        console.error("发布战绩到 Plaza 出错:", e);
      }
    }
    
    // 同时保存到会话存储，以便下次访问时更快加载
    if (!session.battleHistory) session.battleHistory = [];
    session.battleHistory.unshift(newHistory);
    // 只保留最近 50 条战绩
    if (session.battleHistory.length > 50) {
      session.battleHistory = session.battleHistory.slice(0, 50);
    }
    await persistSession(req, res, "", session);
    
    res.json({ ok: true });
  } catch (error) {
    console.error("保存战绩出错:", error);
    // 出错时回退到会话存储
    try {
      if (!session.battleHistory) session.battleHistory = [];
      session.battleHistory.unshift({
        ...history,
        timestamp: Date.now(),
      });
      if (session.battleHistory.length > 50) {
        session.battleHistory = session.battleHistory.slice(0, 50);
      }
      await persistSession(req, res, "", session);
      res.json({ ok: true, warning: "Error saving to storage, using session storage" });
    } catch (e) {
      res.json({ ok: true, warning: "Error saving history, but game ended successfully" });
    }
  }
});

app.get("/api/battle/history", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  try {
    let history = [];
    
    // 尝试从 SecondMe Key Memory 加载战绩
    if (session?.token?.accessToken) {
      const accessToken = session.token.accessToken;
      console.log("尝试从 SecondMe Key Memory 加载战绩");
      try {
        const resp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/key-memory`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        console.log("SecondMe Key Memory 响应状态:", resp.status);
        const json = await resp.json().catch(() => null);
        console.log("SecondMe Key Memory 响应数据:", json);
        if (resp.ok && json && json.code === 0 && Array.isArray(json.data)) {
          // 查找历史记录数据
          const historyData = json.data.find(item => item.key === "battle_history");
          if (historyData && historyData.value) {
            history = Array.isArray(historyData.value) ? historyData.value : [];
            console.log("从 SecondMe Key Memory 加载到的战绩:", history);
          }
        }
      } catch (e) {
        console.error("从 SecondMe Key Memory 加载战绩出错:", e);
      }
    }
    
    // 如果从 SecondMe Key Memory 加载失败，尝试从数据库加载
    if (history.length === 0) {
      const userId = session?.user?.id || 'anonymous';
      try {
        if (db) {
          // 从数据库加载历史记录
          const rows = await db.all(
            `SELECT result, player_name as playerName, player_hero as playerHero, opponent_name as opponentName, opponent_hero as opponentHero, mode, timestamp
             FROM battle_history
             WHERE user_id = ?
             ORDER BY timestamp DESC
             LIMIT 50`,
            [userId]
          );
          
          history = rows;
          console.log("从数据库加载到的战绩:", history);
        } else {
          console.log("数据库未初始化，跳过从数据库加载");
        }
      } catch (e) {
        console.error("从数据库加载战绩出错:", e);
        history = [];
      }
    }
    
    // 保存到会话存储，以便下次访问时更快加载
    if (history.length > 0) {
      session.battleHistory = history;
      await persistSession(req, res, "", session);
    }
    
    res.json({ ok: true, data: history });
  } catch (error) {
    console.error("加载战绩出错:", error);
    // 出错时回退到会话存储
    try {
      const history = Array.isArray(session?.battleHistory) ? session.battleHistory : [];
      console.log("出错时从会话存储加载到的战绩:", history);
      res.json({ ok: true, data: history, warning: "Error loading from storage, using session storage" });
    } catch (e) {
      res.json({ ok: true, data: [], warning: "Error loading history, returning empty array" });
    }
  }
});

app.get("/api/auth/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  const code = req.query.code;
  const error = req.query.error;
  const state = req.query.state;
  const { cookies, sid: existingSid, session: existingSession } = await getSessionFromRequest(req);

  if (error) {
    res.status(400).send(`<pre>OAuth Error: ${String(error)}</pre><p><a href="/">返回首页</a></p>`);
    return;
  }
  if (!code || typeof code !== "string") {
    res.status(400).send(`<pre>Missing authorization code</pre><p><a href="/">返回首页</a></p>`);
    return;
  }
  if (!state || state !== cookies.oauth_state) {
    res.status(400).send(`<pre>Invalid OAuth state</pre><p><a href="/">返回首页</a></p>`);
    return;
  }

  try {
    const tokenResp = await fetch(`${SECONDME_API_BASE_URL}/api/oauth/token/code`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SECONDME_REDIRECT_URI,
        client_id: SECONDME_CLIENT_ID,
        client_secret: SECONDME_CLIENT_SECRET,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || tokenJson.code !== 0 || !tokenJson.data?.accessToken) {
      res.status(400).send(`<pre>${JSON.stringify(tokenJson, null, 2)}</pre><p><a href="/">返回首页</a></p>`);
      return;
    }

    const accessToken = tokenJson.data.accessToken;
    const userResp = await fetch(`${SECONDME_API_BASE_URL}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userJson = await userResp.json();
    if (!userResp.ok || userJson.code !== 0) {
      res.status(400).send(`<pre>${JSON.stringify(userJson, null, 2)}</pre><p><a href="/">返回首页</a></p>`);
      return;
    }
    const remoteRankProgress = await loadRankProgressFromSecondMe(accessToken);
    const localScore = Math.max(0, Number(existingSession?.rankProgress?.score) || RANK_INITIAL_EXP);
    const mergedScore = remoteRankProgress ? Math.max(remoteRankProgress.score, localScore) : localScore;
    const mergedRankProgress = createRankProgress(mergedScore);
    if (!remoteRankProgress || remoteRankProgress.score !== mergedScore) {
      await saveRankProgressToSecondMe(accessToken, mergedRankProgress);
    }
    const sid = existingSid || crypto.randomBytes(24).toString("hex");
    const nextSession = {
      user: userJson.data,
      token: tokenJson.data,
      rankProgress: mergedRankProgress,
      createdAt: existingSession?.createdAt || Date.now(),
    };
    await persistSession(req, res, sid, nextSession);
    clearCookie(res, "oauth_state", { secure: isSecureRequest(req) });
    res.redirect("/");
  } catch (e) {
    res.status(500).send(`<pre>${e instanceof Error ? e.message : String(e)}</pre><p><a href="/">返回首页</a></p>`);
  }
});

// 匹配页面
app.get("/match", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.redirect("/login");
    return;
  }
  const rawMode = normalizeMatchMode(req.query.mode);
  const mode = rawMode === "ranked" || rawMode === "slaughter" ? rawMode : "quick";
  const hero = req.query.hero || "";
  const playerCount = normalizeBattlePlayerCount(req.query.players);
  const matchSubtitle = mode === "slaughter" ? "正在寻找对手..." : `正在寻找 ${playerCount} 人场对手...`;
  res.send(`<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>神迹对决 - 匹配中</title>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: linear-gradient(135deg, rgba(26, 26, 46, 0.8) 0%, rgba(22, 33, 62, 0.8) 100%), url('/assets/myth-gods-battle-animated.svg?v=${Date.now()}');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          color: #eef6ff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          animation: backgroundShift 30s ease-in-out infinite;
        }
        @keyframes backgroundShift {
          0%, 100% { background-position: center center; }
          50% { background-position: center 5% center; }
        }
        .match-container {
          text-align: center;
          padding: 40px;
          border-radius: 14px;
          background: rgba(31, 24, 10, 0.62);
          border: 1px solid rgba(251, 191, 36, 0.35);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }
        .match-logo {
          width: 120px;
          height: 120px;
          margin-bottom: 24px;
        }
        .match-title {
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 16px;
          color: #fbbf24;
        }
        .match-subtitle {
          font-size: 16px;
          color: #9dc0ea;
          margin-bottom: 32px;
        }
        .match-status {
          font-size: 18px;
          margin-bottom: 24px;
        }
        .match-spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(251, 191, 36, 0.3);
          border-top: 4px solid #fbbf24;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 24px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .match-cancel-btn {
          background: rgba(248, 113, 113, 0.2);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.4);
          border-radius: 999px;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .match-cancel-btn:hover {
          background: rgba(248, 113, 113, 0.3);
        }
        .match-timer {
          font-size: 36px;
          font-weight: 800;
          color: #fbbf24;
          margin: 16px 0;
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      </style>
    </head>
    <body>
      <div class="match-container">
        <img class="match-logo" src="/assets/bg-myth-war.png" alt="神迹对决" />
        <h1 class="match-title">神迹对决</h1>
        <p class="match-subtitle">${matchSubtitle}</p>
        <div class="match-spinner"></div>
        <div class="match-status" id="matchStatus">匹配中，请稍候...</div>
        <div class="match-timer" id="matchTimer">10</div>
        <button class="match-cancel-btn" id="cancelMatch">取消匹配</button>
      </div>
      <script>
        const mode = ${JSON.stringify(String(mode || "quick"))};
        const hero = ${JSON.stringify(String(hero || ""))};
        const playerCount = ${playerCount};
        
        // 加入匹配队列
        async function joinMatch() {
          try {
            const resp = await fetch("/api/match/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode, hero, playerCount }),
            });
            const json = await resp.json();
            if (json.ok) {
              checkMatchStatus();
            } else {
              document.getElementById("matchStatus").textContent = "匹配失败，请重试";
            }
          } catch (error) {
            console.error("加入匹配队列失败:", error);
            document.getElementById("matchStatus").textContent = "匹配失败，请重试";
          }
        }
        
        // 检查匹配状态
        async function checkMatchStatus() {
          try {
            const statusUrl =
              "/api/match/status?mode=" +
              encodeURIComponent(mode) +
              "&players=" +
              encodeURIComponent(String(playerCount));
            const resp = await fetch(statusUrl);
            const json = await resp.json();
            if (json.ok) {
              if (json.status === "matched") {
                // 匹配成功，跳转到游戏页面
                window.location.href = "/battle/" + mode + "?hero=" + encodeURIComponent(hero) + "&matchId=" + json.matchId + "&players=" + playerCount;
              } else if (json.status === "waiting") {
                // 继续等待
                document.getElementById("matchStatus").textContent = "匹配中，请稍候...（" + playerCount + "人场）";
                setTimeout(checkMatchStatus, 2000);
              } else {
                // 不在队列中，重新加入
                joinMatch();
              }
            } else {
              document.getElementById("matchStatus").textContent = "匹配失败，请重试";
            }
          } catch (error) {
            console.error("检查匹配状态失败:", error);
            setTimeout(checkMatchStatus, 2000);
          }
        }
        
        // 取消匹配
        document.getElementById("cancelMatch").addEventListener("click", async function() {
          try {
            const resp = await fetch("/api/match/leave", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
            const json = await resp.json();
            if (json.ok) {
              window.location.href = "/game";
            }
          } catch (error) {
            console.error("取消匹配失败:", error);
          }
        });
        
        // 10秒倒计时
        let countdown = 10;
        const timerElement = document.getElementById("matchTimer");
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (countdown >= 0) {
            timerElement.textContent = countdown;
          } else {
            clearInterval(countdownInterval);
          }
        }, 1000);
        
        // 开始匹配
        joinMatch();
        
        // 取消匹配时清除倒计时
        document.getElementById("cancelMatch").addEventListener("click", function() {
          clearInterval(countdownInterval);
        });
      </script>
    </body>
  </html>`);
});

app.get("/battle/quick", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.redirect("/login");
    return;
  }
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  const matchId = req.query.matchId || "";
  const playerCount = normalizeBattlePlayerCount(req.query.players);
  
  // 如果没有 matchId，重定向到匹配页面
  if (!matchId) {
    res.redirect(`/match?mode=quick&hero=${encodeURIComponent(hero)}&players=${playerCount}`);
    return;
  }
  
  res.send(renderQuickBattlePage(session?.user || null, { mode: "quick", selectedHeroId: hero, rankProgress: session.rankProgress, matchId: matchId, playerCount }));
});

app.get("/battle/slaughter", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.redirect("/login");
    return;
  }
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  const matchId = req.query.matchId || "";
  
  // 如果没有 matchId，重定向到匹配页面
  if (!matchId) {
    res.redirect(`/match?mode=slaughter&hero=${encodeURIComponent(hero)}`);
    return;
  }
  
  res.send(renderQuickBattlePage(session?.user || null, { mode: "slaughter", selectedHeroId: hero, rankProgress: session.rankProgress, matchId: matchId }));
});

app.get("/battle/ranked", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.redirect("/login");
    return;
  }
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  const matchId = req.query.matchId || "";
  const playerCount = normalizeBattlePlayerCount(req.query.players);
  
  // 如果没有 matchId，重定向到匹配页面
  if (!matchId) {
    res.redirect(`/match?mode=ranked&hero=${encodeURIComponent(hero)}&players=${playerCount}`);
    return;
  }
  
  res.send(
    renderQuickBattlePage(session?.user || null, {
      mode: "ranked",
      selectedHeroId: hero,
      rankProgress: session.rankProgress,
      matchId: matchId,
      playerCount,
    })
  );
});

app.get("/tutorial", async (req, res) => {
  if (!requireConfig(res)) return;
  const { session } = await getOrCreateSession(req, res);
  res.send(
    renderTutorialPage({
      user: session?.user || null,
      rankProgress: session?.rankProgress || createRankProgress(),
    })
  );
});

app.get("/game", async (req, res) => {
  if (!requireConfig(res)) return;
  const { sid, session } = await getOrCreateSession(req, res);
  const html = renderPage({
    isLoggedIn: Boolean(session?.user),
    user: session?.user || null,
    friends: session?.friends || [],
    rankProgress: session?.rankProgress || createRankProgress(),
  });
  res.send(html);
});

function renderLoginPage() {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>登录 - 神迹对决</title>
      <style>
        :root {
          --bg: #0a1120;
          --card: rgba(11, 18, 31, 0.85);
          --line: rgba(147, 197, 253, 0.2);
          --text: #ecf4ff;
          --muted: #aac3e8;
          --primary: #3b82f6;
          --primary-strong: #1d4ed8;
          --gold: #f59e0b;
          --purple: #8b5cf6;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          color: var(--text);
          background: var(--bg);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        /* 视频背景 */
        .video-background {
          position: fixed;
          inset: 0;
          z-index: -2;
          object-fit: cover;
          width: 100%;
          height: 100%;
          opacity: 0.7;
        }
        /* 渐变遮罩 */
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(
            180deg, 
            rgba(5, 9, 16, 0.7) 0%, 
            rgba(7, 10, 16, 0.85) 50%, 
            rgba(10, 15, 25, 0.9) 100%
          );
          z-index: -1;
        }
        /* 光效效果 */
        .light-effects {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
        }
        .light-effect {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          animation: lightPulse 8s ease-in-out infinite;
        }
        .light-effect:nth-child(1) {
          top: 20%;
          left: 20%;
          width: 300px;
          height: 300px;
          background: rgba(59, 130, 246, 0.2);
          animation-delay: 0s;
        }
        .light-effect:nth-child(2) {
          top: 60%;
          right: 20%;
          width: 250px;
          height: 250px;
          background: rgba(139, 92, 246, 0.2);
          animation-delay: 2s;
        }
        .light-effect:nth-child(3) {
          bottom: 20%;
          left: 40%;
          width: 200px;
          height: 200px;
          background: rgba(245, 158, 11, 0.2);
          animation-delay: 4s;
        }
        /* 粒子效果容器 */
        .particles {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
        }
        .particle {
          position: absolute;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          animation: particleFloat 10s linear infinite;
        }
        /* 动画定义 */
        @keyframes lightPulse {
          0%, 100% { 
            opacity: 0.3;
            transform: scale(1);
          }
          50% { 
            opacity: 0.6;
            transform: scale(1.2);
          }
        }
        @keyframes particleFloat {
          0% { 
            transform: translateY(100vh) translateX(0);
            opacity: 0;
          }
          10% { 
            opacity: 1;
          }
          90% { 
            opacity: 1;
          }
          100% { 
            transform: translateY(-100px) translateX(100px);
            opacity: 0;
          }
        }
        .login-wrap {
          max-width: 480px;
          width: 100%;
          padding: 24px;
          position: relative;
          z-index: 2;
        }
        .login-card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 32px;
          text-align: center;
          backdrop-filter: blur(10px);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .login-card::before {
          content: "";
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            45deg,
            transparent,
            rgba(255, 255, 255, 0.05),
            transparent
          );
          transform: rotate(45deg);
          animation: shine 6s linear infinite;
          pointer-events: none;
        }
        @keyframes shine {
          0% { 
            transform: translateX(-100%) rotate(45deg); 
          }
          100% { 
            transform: translateX(100%) rotate(45deg); 
          }
        }
        .login-card:hover {
          box-shadow: 
            0 12px 40px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
        }
        .login-title {
          margin: 0 0 8px;
          font-size: 36px;
          font-weight: 800;
          background: linear-gradient(135deg, #fff, #a78bfa, #f59e0b);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 
            0 2px 4px rgba(0, 0, 0, 0.3),
            0 0 10px rgba(167, 139, 250, 0.3);
          animation: titleGlow 3s ease-in-out infinite;
        }
        @keyframes titleGlow {
          0%, 100% { 
            text-shadow: 
              0 2px 4px rgba(0, 0, 0, 0.3),
              0 0 10px rgba(167, 139, 250, 0.3);
          }
          50% { 
            text-shadow: 
              0 2px 4px rgba(0, 0, 0, 0.3),
              0 0 20px rgba(167, 139, 250, 0.5),
              0 0 30px rgba(245, 158, 11, 0.3);
          }
        }
        .login-subtitle {
          margin: 0 0 32px;
          color: var(--muted);
          font-size: 16px;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }
        .login-logo {
          width: 100px;
          height: 100px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, var(--primary), var(--primary-strong), var(--purple));
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          font-weight: 700;
          box-shadow: 
            0 4px 16px rgba(59, 130, 246, 0.4),
            0 0 30px rgba(139, 92, 246, 0.3);
          animation: logoPulse 2s ease-in-out infinite;
          position: relative;
          overflow: hidden;
        }
        .login-logo::before {
          content: "";
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            45deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transform: rotate(45deg);
          animation: logoShine 3s linear infinite;
        }
        @keyframes logoShine {
          0% { 
            transform: translateX(-100%) rotate(45deg); 
          }
          100% { 
            transform: translateX(100%) rotate(45deg); 
          }
        }
        @keyframes logoPulse {
          0% { 
            box-shadow: 
              0 4px 16px rgba(59, 130, 246, 0.4),
              0 0 30px rgba(139, 92, 246, 0.3);
          }
          50% { 
            box-shadow: 
              0 6px 24px rgba(59, 130, 246, 0.6),
              0 0 40px rgba(139, 92, 246, 0.5);
          }
          100% { 
            box-shadow: 
              0 4px 16px rgba(59, 130, 246, 0.4),
              0 0 30px rgba(139, 92, 246, 0.3);
          }
        }
        .login-btn {
          display: inline-block;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, var(--primary), var(--primary-strong), var(--purple));
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s ease;
          box-shadow: 
            0 4px 12px rgba(59, 130, 246, 0.3),
            0 0 20px rgba(139, 92, 246, 0.2);
          position: relative;
          overflow: hidden;
        }
        .login-btn::before {
          content: "";
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            45deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transform: rotate(45deg);
          animation: btnShine 3s linear infinite;
        }
        @keyframes btnShine {
          0% { 
            transform: translateX(-100%) rotate(45deg); 
          }
          100% { 
            transform: translateX(100%) rotate(45deg); 
          }
        }
        .login-btn:hover {
          background: linear-gradient(135deg, var(--purple), var(--primary-strong), var(--primary));
          transform: translateY(-2px);
          box-shadow: 
            0 6px 16px rgba(59, 130, 246, 0.4),
            0 0 30px rgba(139, 92, 246, 0.3);
        }
        .login-btn:active {
          transform: translateY(0);
        }
        .login-footer {
          margin-top: 24px;
          color: var(--muted);
          font-size: 14px;
          text-align: center;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }
        /* 背景故事文本 */
        .background-story {
          position: fixed;
          bottom: 20px;
          left: 0;
          right: 0;
          text-align: center;
          padding: 0 20px;
          z-index: 1;
          max-width: 800px;
          margin: 0 auto;
        }
        .background-story p {
          margin: 5px 0;
          font-size: 14px;
          color: var(--muted);
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          line-height: 1.5;
        }
        /* 音频控制 */
        .audio-control {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10;
          background: rgba(11, 18, 31, 0.8);
          border: 1px solid var(--line);
          border-radius: 50%;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }
        .audio-control:hover {
          background: rgba(11, 18, 31, 0.9);
          transform: scale(1.1);
        }
        .audio-control::before {
          content: "🔊";
          font-size: 20px;
        }
        .audio-control.muted::before {
          content: "🔇";
        }
        /* 响应式设计 */
        @media (max-width: 768px) {
          .login-wrap {
            padding: 16px;
          }
          .login-card {
            padding: 24px;
          }
          .login-title {
            font-size: 28px;
          }
          .login-subtitle {
            font-size: 14px;
          }
          .login-logo {
            width: 80px;
            height: 80px;
            font-size: 32px;
          }
          .background-story {
            bottom: 10px;
            padding: 0 10px;
          }
          .background-story p {
            font-size: 12px;
          }
          .audio-control {
            top: 10px;
            right: 10px;
            width: 40px;
            height: 40px;
          }
          .audio-control::before {
            font-size: 16px;
          }
        }
        @media (max-width: 480px) {
          .login-card {
            padding: 20px;
          }
          .login-title {
            font-size: 24px;
          }
          .login-subtitle {
            font-size: 13px;
          }
          .login-logo {
            width: 60px;
            height: 60px;
            font-size: 24px;
          }
          .background-story p {
            font-size: 11px;
          }
        }
      </style>
    </head>
    <body>
      <!-- 视频背景 -->
      <video class="video-background" autoplay muted loop playsinline>
        <source src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mythological%20gods%20battle%20scene%20with%20divine%20beings%20fighting%2C%20epic%20visuals%2C%20fantasy%20style%2C%204k%20resolution&image_size=landscape_16_9" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      
      <!-- 光效效果 -->
      <div class="light-effects">
        <div class="light-effect"></div>
        <div class="light-effect"></div>
        <div class="light-effect"></div>
      </div>
      
      <!-- 粒子效果 -->
      <div class="particles" id="particles"></div>
      
      <!-- 音频控制 -->
      <div class="audio-control" id="audioControl"></div>
      
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-logo">神</div>
          <h1 class="login-title">神迹对决</h1>
          <p class="login-subtitle">登录后开始你的神话之旅</p>
          <a class="login-btn" href="/login">SecondMe 登录</a>
        </div>
        <div class="login-footer">
          <p>© 2026 神迹对决. 保留所有权利.</p>
        </div>
      </div>
      
      <!-- 背景故事文本 -->
      <div class="background-story">
        <p>在诸神的黄昏中，不同神话体系的神灵们为了争夺宇宙的控制权而展开了一场史诗般的对决。</p>
        <p>你将扮演其中一位神灵，与其他神话体系的英雄们一决高下，证明你所在体系的至高无上。</p>
        <p>选择你的英雄，运用策略和智慧，成为最终的胜利者！</p>
      </div>
      
      <!-- 音频元素 -->
      <audio id="backgroundAudio" loop>
        <source src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAD" type="audio/wav">
      </audio>
      
      <script>
        // 生成粒子效果
        function createParticles() {
          const particlesContainer = document.getElementById('particles');
          const particleCount = 50;
          
          for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // 随机位置
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 10 + 's';
            particle.style.animationDuration = (Math.random() * 5 + 5) + 's';
            
            particlesContainer.appendChild(particle);
          }
        }
        
        // 音频控制
        function initAudio() {
          const audioControl = document.getElementById('audioControl');
          const backgroundAudio = document.getElementById('backgroundAudio');
          
          // 创建语音旁白
          if ('speechSynthesis' in window) {
            const shamanVoice = new SpeechSynthesisUtterance();
            shamanVoice.text = '欢迎来到神迹对决，勇士。在这里，不同神话体系的神灵们将展开一场史诗般的对决。选择你的英雄，运用策略和智慧，成为最终的胜利者！';
            shamanVoice.lang = 'zh-CN';
            shamanVoice.volume = 0.7;
            shamanVoice.rate = 0.9;
            shamanVoice.pitch = 0.8;
            
            // 播放语音旁白
            setTimeout(() => {
              speechSynthesis.speak(shamanVoice);
            }, 1000);
          }
          
          // 音频控制
          audioControl.addEventListener('click', function() {
            if ('speechSynthesis' in window) {
              if (speechSynthesis.speaking) {
                speechSynthesis.pause();
                audioControl.classList.add('muted');
              } else {
                speechSynthesis.resume();
                audioControl.classList.remove('muted');
              }
            }
          });
        }
        
        // 页面加载完成后初始化
        window.addEventListener('load', function() {
          createParticles();
          initAudio();
        });
      </script>
    </body>
  </html>
  `;
}

app.get("/", async (req, res) => {
  if (!requireConfig(res)) return;
  const { session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.send(renderLoginPage());
    return;
  }
  res.send(renderPage({ isLoggedIn: true, user: session.user, rankProgress: session.rankProgress }));
});



app.post("/api/ranked/result", async (req, res) => {
  const { sid, session } = await getSessionFromRequest(req);
  if (!session?.user || !session?.token?.accessToken) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const outcome = String(req.body?.outcome || "");
  if (outcome !== "win" && outcome !== "loss") {
    res.status(400).json({ ok: false, error: "invalid_outcome" });
    return;
  }
  const rankProgress = ensureRankProgress(session);
  const delta = outcome === "win" ? RANK_GAIN_WIN : RANK_GAIN_LOSS;
  rankProgress.score = Math.max(0, rankProgress.score + delta);
  rankProgress.updatedAt = Date.now();
  const synced = await saveRankProgressToSecondMe(session.token.accessToken, rankProgress);
  await persistSession(req, res, sid || crypto.randomBytes(24).toString("hex"), session);
  res.json({
    ok: true,
    delta,
    outcome,
    rank: getRankMeta(rankProgress.score),
    synced,
    ...(synced ? {} : { warning: "rank_sync_failed" }),
  });
});



app.get("/api/healthz", (req, res) => {
  res.json({
    ok: true,
    app: "shenji-duel",
    timestamp: new Date().toISOString(),
    baseUrl: getAppBaseUrl(req),
    modes: ["quick", "ranked", "slaughter", "tutorial"],
  });
});

app.get("/api/integration/manifest", (req, res) => {
  res.json(getIntegrationManifest(getAppBaseUrl(req)));
});

app.get("/api/integration/tools", (req, res) => {
  res.json({
    ok: true,
    tools: getIntegrationTools(getAppBaseUrl(req)),
  });
});

app.get("/api/mcp", (req, res) => {
  const baseUrl = getAppBaseUrl(req);
  res.json({
    ok: true,
    endpoint: `${baseUrl}/api/mcp`,
    transport: "JSON-RPC over HTTP",
    message: "MCP endpoint is alive. Use POST /api/mcp with a JSON-RPC body.",
    supportedMethods: ["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"],
  });
});

app.post("/api/mcp", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  const method = String(body.method || "").trim();
  const params = body.params && typeof body.params === "object" ? body.params : {};
  const baseUrl = getAppBaseUrl(req);

  if (!method) {
    sendMcpError(res, id, -32600, "Invalid Request", { reason: "missing_method" });
    return;
  }

  if (method === "initialize") {
    sendMcpResult(res, id, {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "shenji-duel",
        version: "1.0.0",
      },
      instructions: "Use bearer-token authenticated tool calls to read player profile, browse heroes/cards, or create battle entry links.",
    });
    return;
  }

  if (method === "notifications/initialized") {
    res.status(202).end();
    return;
  }

  if (method === "ping") {
    sendMcpResult(res, id, {});
    return;
  }

  if (method === "tools/list") {
    sendMcpResult(res, id, {
      tools: toMcpToolDefinitions(baseUrl),
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = String(params.name || "").trim();
    const toolArgs = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    const result = await runIntegrationTool(req, toolName, toolArgs);
    if (!result.body?.ok) {
      res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: result.body?.error || "tool_call_failed",
            },
          ],
          structuredContent: result.body || {},
          isError: true,
        },
      });
      return;
    }

    const summary =
      toolName === "get_player_profile"
        ? `已返回玩家资料与排位信息。`
        : toolName === "list_game_heroes"
          ? `已返回英雄图鉴结果。`
          : toolName === "list_game_cards"
            ? `已返回卡牌图鉴结果。`
            : `已生成对战入口。`;

    sendMcpResult(res, id, toMcpToolResult(result.body, summary));
    return;
  }

  sendMcpError(res, id, -32601, "Method not found", { method });
});

app.post("/api/integration/call", async (req, res) => {
  const tool = String(req.body?.tool || req.body?.name || "").trim();
  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  const result = await runIntegrationTool(req, tool, input);
  res.status(result.status).json(result.body);
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Shenji Duel running on http://localhost:${PORT}`);
  });
}
