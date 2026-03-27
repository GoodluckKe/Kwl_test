import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

const app = express();
const PORT = Number(process.env.PORT || 3010);
app.use(express.json());
app.use(express.static("public"));

const {
  SECONDME_CLIENT_ID,
  SECONDME_CLIENT_SECRET,
  SECONDME_REDIRECT_URI = "http://localhost:3010/api/auth/callback",
  SECONDME_OAUTH_URL = "https://go.second.me/oauth/",
  SECONDME_API_BASE_URL = "https://api.mindverse.com/gate/lab",
  UPSTASH_REDIS_REST_URL = "",
  UPSTASH_REDIS_REST_TOKEN = "",
} = process.env;

const sessions = new Map();
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
const redisEnabled = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
const RANK_PHASES = ["前期", "中期", "后期"];
const RANK_STEP_EXP = 100;
const RANK_GAIN_WIN = 20;
const RANK_GAIN_LOSS = -10;
const RANK_INITIAL_EXP = 60;
const RANK_TIERS = [
  { name: "凡尘行者", title: "初入神迹" },
  { name: "山海游侠", title: "行过四海" },
  { name: "昆仑修士", title: "问道神山" },
  { name: "蓬莱方士", title: "得见仙洲" },
  { name: "瑶池仙官", title: "侍立天阙" },
  { name: "龙宫战将", title: "镇守四渎" },
  { name: "扶桑神裔", title: "执光巡天" },
  { name: "玄都真君", title: "总摄仙班" },
  { name: "天门帝尊", title: "执掌神权" },
  { name: "凌霄神主", title: "问鼎诸天" },
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
  const totalStages = RANK_TIERS.length * RANK_PHASES.length;
  const maxScore = totalStages * RANK_STEP_EXP - 1;
  const safeScore = Math.max(0, Math.min(maxScore, Math.floor(Number(scoreInput) || 0)));
  const stageIndex = Math.floor(safeScore / RANK_STEP_EXP);
  const tierIndex = Math.min(RANK_TIERS.length - 1, Math.floor(stageIndex / RANK_PHASES.length));
  const phaseIndex = stageIndex % RANK_PHASES.length;
  const tier = RANK_TIERS[tierIndex];
  const progress = safeScore % RANK_STEP_EXP;
  const isMax = stageIndex >= totalStages - 1 && progress >= RANK_STEP_EXP - 1;
  return {
    score: safeScore,
    tierIndex,
    phaseIndex,
    tierName: tier.name,
    tierTitle: tier.title,
    phaseLabel: RANK_PHASES[phaseIndex],
    display: `${tier.name} · ${RANK_PHASES[phaseIndex]}`,
    shortDisplay: `${tier.name}${RANK_PHASES[phaseIndex]}`,
    progress,
    progressMax: RANK_STEP_EXP,
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
    friends: [],
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

function setCookie(res, key, value, maxAgeSec) {
  const nextValue = `${key}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
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

function clearCookie(res, key) {
  const nextValue = `${key}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
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
  const sid = cookies.sid || "";
  const session = sid ? await getStoredSession(sid) : null;
  if (session) {
    if (!Array.isArray(session.friends)) session.friends = [];
    ensureRankProgress(session);
  }
  return { cookies, sid, session };
}

async function getOrCreateSession(req, res) {
  const { cookies, sid, session } = await getSessionFromRequest(req);
  if (session) return { cookies, sid, session };
  const nextSid = crypto.randomBytes(24).toString("hex");
  const nextSession = createAnonymousSession();
  await saveStoredSession(nextSid, nextSession);
  setCookie(res, "sid", nextSid, SESSION_TTL_SEC);
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
  const seed = encodeURIComponent(String(user?.nickname || user?.name || user?.id || "secondme-player"));
  return `https://api.dicebear.com/9.x/fantasy/svg?seed=${seed}&backgroundType=gradientLinear`;
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

function getHeroAvatar(heroName, factionName, title = "", skill = "") {
  const t = heroVisualTheme(factionName);
  const meta = getHeroArtMeta(heroName, factionName, title, skill);
  const svg = `
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
  return svgToDataUri(svg);
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

function getCardAvatar(cardName, category, subType = "", effect = "") {
  const t = cardVisualTheme(category, subType);
  const meta = getCardArtMeta(cardName, category, subType, effect);
  const svg = `
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
    <rect x="96" y="472" width="448" height="104" rx="22" fill="#050b16" fill-opacity="0.44" stroke="${t.c3}" stroke-opacity="0.24"/>
    <text x="320" y="518" text-anchor="middle" font-size="68" font-weight="800" fill="#fff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${cardName}</text>
    <text x="320" y="548" text-anchor="middle" font-size="24" fill="${t.c3}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${meta.sceneLine}</text>
    <rect x="252" y="556" width="136" height="42" rx="21" fill="${t.c3}" fill-opacity="0.22" stroke="${t.c3}" stroke-opacity="0.78"/>
    <text x="320" y="584" text-anchor="middle" font-size="24" fill="#fff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${meta.badge}</text>
  </svg>`;
  return svgToDataUri(svg);
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

function normalizeFriendItem(item, index) {
  const id = String(item?.id || item?.userId || item?.uid || `friend-${index + 1}`);
  const name = String(item?.nickname || item?.name || item?.displayName || `好友${index + 1}`);
  const avatar = String(item?.avatar || item?.avatarUrl || item?.headImg || getUserAvatarUrl({ id, name }));
  const status = String(item?.status || item?.onlineStatus || "在线");
  const bio = String(item?.bio || item?.signature || item?.intro || "暂无签名");
  return { id, name, avatar, status, bio, raw: item || {} };
}

async function fetchSecondMeFriends(accessToken) {
  const candidates = [
    `${SECONDME_API_BASE_URL}/api/secondme/friend/list`,
    `${SECONDME_API_BASE_URL}/api/secondme/friends/list`,
    `${SECONDME_API_BASE_URL}/api/secondme/user/friends`,
  ];
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.code !== 0) continue;
      const list = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.data?.list)
          ? json.data.list
          : Array.isArray(json.data?.items)
            ? json.data.items
            : null;
      if (!list) continue;
      return list.map((item, index) => normalizeFriendItem(item, index));
    } catch {
      continue;
    }
  }
  return [];
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
      route: `${baseUrl}/api/integration/call`,
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
      route: `${baseUrl}/api/integration/call`,
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
      route: `${baseUrl}/api/integration/call`,
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
      route: `${baseUrl}/api/integration/call`,
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
      manifest: `${baseUrl}/api/integration/manifest`,
      tools: `${baseUrl}/api/integration/tools`,
      call: `${baseUrl}/api/integration/call`,
      health: `${baseUrl}/api/healthz`,
    },
    tools: getIntegrationTools(baseUrl),
  };
}

function flattenHeroes() {
  return gameData.flatMap((faction) =>
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
}

function flattenCards() {
  return cardData.map((card) => {
    const artMeta = getCardArtMeta(card.newName, card.category, card.subType, card.effect);
    return {
      ...card,
      id: `${card.category}-${card.newName}`,
      badge: artMeta.badge,
      sceneLine: artMeta.sceneLine,
      avatar: getCardAvatar(card.newName, card.category, card.subType, card.effect),
    };
  });
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
      intro: "在排位赛中累积神迹经验，推进你的中国神话段位。",
      rankEnabled: true,
    };
  }
  return {
    key: "quick",
    label: "快速战斗",
    drawPhaseCount: 2,
    intro: "标准七人局规则，节奏均衡，适合完整博弈。",
    rankEnabled: false,
  };
}

function renderPage({ isLoggedIn, user, friends, rankProgress }) {
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
        <img class="hero-avatar" src="${hero.avatar}" alt="${hero.name}" />
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
        <img class="card-avatar" src="${card.avatar}" alt="${card.newName}" />
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
  const friendList = Array.isArray(friends) && friends.length > 0 ? friends : [];
  const friendsJson = JSON.stringify(friendList).replaceAll("<", "\\u003c");
  const friendRows = friendList.length
    ? friendList
        .map(
          (f) => `
        <div class="friend-item" data-friend-id="${escapeHtml(f.id)}">
          <button class="friend-avatar-btn" data-friend-id="${escapeHtml(f.id)}">
            <img src="${escapeHtml(f.avatar)}" alt="${escapeHtml(f.name)}" />
          </button>
          <div class="friend-meta">
            <div class="friend-name">${escapeHtml(f.name)}</div>
            <div class="friend-status">${escapeHtml(f.status)}</div>
          </div>
          <button class="invite-btn" data-friend-id="${escapeHtml(f.id)}">邀请</button>
        </div>
      `
        )
        .join("")
    : `<div class="friend-empty">暂无好友数据（仅展示 SecondMe 实时拉取结果）</div>`;
  const leftArea = isLoggedIn
    ? `
      <button class="avatar-btn" id="avatarBtn" title="查看个人信息">
        <img src="${avatar}" alt="avatar" />
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
          position:fixed;left:12px;top:150px;z-index:15;
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
          width:min(1120px,100%);max-height:88vh;overflow:hidden;border-radius:18px;padding:18px;
          border:1px solid rgba(251,191,36,.45);background:rgba(8,14,24,.96);
          box-shadow:0 28px 80px rgba(0,0,0,.4);
          display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:14px;
        }
        .battle-mode-tag{
          display:inline-flex;align-items:center;justify-content:center;
          height:30px;padding:0 12px;border-radius:999px;
          border:1px solid rgba(251,191,36,.35);background:rgba(245,158,11,.12);
          color:#fde68a;font-weight:800;font-size:12px;letter-spacing:.8px;
        }
        .battle-modal-copy h3{margin:10px 0 6px;font-size:32px}
        .battle-modal-copy p{margin:0;color:#b7cdee;line-height:1.6}
        .battle-rank-panel{
          display:none;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:12px;
        }
        .battle-rank-panel.show{display:grid}
        .battle-rank-card{
          border:1px solid rgba(125,211,252,.18);
          border-radius:14px;padding:12px;background:rgba(10,18,31,.72);
        }
        .battle-rank-card span{display:block;font-size:11px;color:#9ec0e7;margin-bottom:6px}
        .battle-rank-card strong{display:block;font-size:16px;color:#fff}
        .battle-rank-card em{display:block;margin-top:6px;font-size:12px;color:#dbeafe;font-style:normal}
        .battle-selection-layout{
          min-height:0;
          display:grid;grid-template-columns:minmax(0,1.35fr) 320px;gap:14px;
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
        }
        .battle-preview img{
          width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:14px;border:1px solid rgba(251,191,36,.18);
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
        }
        .card-modal-box{
          width:min(760px,100%);max-height:85vh;overflow:auto;border-radius:16px;padding:16px;
          border:1px solid rgba(251,191,36,.55);background:rgba(30,20,8,.96);
        }
        .hero-modal-top{display:flex;gap:12px;align-items:flex-start}
        .hero-modal-top img{
          width:120px;height:120px;border-radius:14px;border:1px solid rgba(186,230,253,.45);background:#08192d;
        }
        .hero-modal h3{margin:0 0 6px 0;font-size:28px}
        .hero-modal p{margin:8px 0;color:#d4e9ff;line-height:1.62}
        @media (max-width: 760px){
          .side-menu{left:10px;top:92px;width:var(--left-col-width)}
          .hero-drawer{left:8px;top:132px;width:calc(100vw - 16px);max-height:82vh}
          .card-drawer{left:8px;top:132px;width:calc(100vw - 16px);max-height:82vh}
          .brand{font-size:42px;letter-spacing:2px}
          .topbar{align-items:flex-start;flex-direction:column;gap:12px}
          .topbar{grid-template-columns:1fr}
          .left-top,.right-top{justify-self:start}
          .shell{padding:16px 12px 44px 12px}
          .mode-row{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
          .mode-btn{font-size:18px;min-height:82px}
          .hero-grid{grid-template-columns:repeat(auto-fill,minmax(165px,1fr))}
          .card-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
          .friends-panel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:38vh;min-height:180px}
          .battle-modal-box{max-height:92vh;grid-template-rows:auto auto minmax(0,1fr) auto}
          .battle-rank-panel{grid-template-columns:1fr}
          .battle-selection-layout{grid-template-columns:1fr}
          .battle-preview{order:-1}
          .battle-modal-actions{flex-direction:column;align-items:stretch}
        }
      </style>
    </head>
    <body>
      <div class="side-menu">
        <button class="menu-btn" id="heroMenuBtn">英雄介绍</button>
        <button class="menu-btn" id="cardMenuBtn">卡牌图鉴</button>
      </div>
      <aside class="friends-panel">
        <div class="friends-head">
          <h4>好友列表</h4>
          <div class="friends-count">${friendList.length} 人</div>
        </div>
        ${friendRows}
      </aside>

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

      <div class="shell">
        <div class="topbar">
          <div class="left-top">${leftArea}</div>
          <div class="brand">神迹对决</div>
          <div class="right-top">${rightArea}</div>
        </div>
        ${isLoggedIn ? `<div class="login-state" id="loginState">SecondMe 登录成功</div>` : ""}
        <div class="mode-row">
          <button class="mode-btn active" data-mode="quick"><span class="mode-btn-label">快速战斗</span><span class="mode-btn-sub">标准七人局，适合熟悉身份与节奏</span></button>
          <button class="mode-btn" data-mode="ranked"><span class="mode-btn-label">排位赛</span><span class="mode-btn-sub">获取神话段位经验，稳定上分</span></button>
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
            <img id="modalAvatar" src="" alt="hero" />
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
            <img id="cardModalAvatar" src="" alt="card" />
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
      <section class="friend-modal" id="friendModal">
        <div class="friend-modal-box">
          <div class="drawer-head">
            <div class="drawer-title">好友信息</div>
            <button class="close-btn" id="friendModalClose">关闭</button>
          </div>
          <div class="friend-modal-top">
            <img id="friendAvatar" src="" alt="friend" />
            <div>
              <h3 id="friendName"></h3>
              <p id="friendStatus"></p>
            </div>
          </div>
          <div class="friend-modal-body" id="friendBio"></div>
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
            <p id="battleModeIntro">先锁定一位神明，再进入七人局战场。</p>
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
      <script id="friendsData" type="application/json">${friendsJson}</script>
      <script id="rankData" type="application/json">${rankMetaJson}</script>

      <script>
        const heroMenuBtn = document.getElementById("heroMenuBtn");
        const heroDrawer = document.getElementById("heroDrawer");
        const heroDrawerClose = document.getElementById("heroDrawerClose");
        const cardMenuBtn = document.getElementById("cardMenuBtn");
        const cardDrawer = document.getElementById("cardDrawer");
        const cardDrawerClose = document.getElementById("cardDrawerClose");
        const loginBtn = document.getElementById("loginBtn");
        const avatarBtn = document.getElementById("avatarBtn");
        const panel = document.getElementById("userPanel");
        const heroModal = document.getElementById("heroModal");
        const heroModalClose = document.getElementById("heroModalClose");
        const cardModal = document.getElementById("cardModal");
        const cardModalClose = document.getElementById("cardModalClose");
        const friendModal = document.getElementById("friendModal");
        const friendModalClose = document.getElementById("friendModalClose");
        const battleModal = document.getElementById("battleModal");
        const battleModalClose = document.getElementById("battleModalClose");
        const battleModeTag = document.getElementById("battleModeTag");
        const battleModeIntro = document.getElementById("battleModeIntro");
        const battleRankPanel = document.getElementById("battleRankPanel");
        const battleHeroList = document.getElementById("battleHeroList");
        const battlePreview = document.getElementById("battlePreview");
        const battleStartBtn = document.getElementById("battleStartBtn");
        const battleOpenAtlas = document.getElementById("battleOpenAtlas");
        const filters = Array.from(document.querySelectorAll(".filter-btn"));
        const cardFilters = Array.from(document.querySelectorAll(".card-filter-btn"));
        const heroCards = Array.from(document.querySelectorAll(".hero-select"));
        const cardCards = Array.from(document.querySelectorAll(".card-select"));
        const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
        const friendAvatarButtons = Array.from(document.querySelectorAll(".friend-avatar-btn"));
        const inviteButtons = Array.from(document.querySelectorAll(".invite-btn"));
        const heroData = JSON.parse(document.getElementById("heroData").textContent || "[]");
        const cardData = JSON.parse(document.getElementById("cardData").textContent || "[]");
        const friendsData = JSON.parse(document.getElementById("friendsData").textContent || "[]");
        const rankData = JSON.parse(document.getElementById("rankData").textContent || "{}");
        const heroMap = new Map(heroData.map((h) => [h.id, h]));
        const cardMap = new Map(cardData.map((c) => [c.id, c]));
        const friendMap = new Map(friendsData.map((f) => [f.id, f]));
        const loginState = document.getElementById("loginState");
        const battleModes = {
          quick: {
            label: "快速战斗",
            intro: "标准七人局，对局节奏更均衡，适合正常博弈与试英雄。",
            path: "/battle/quick",
            ranked: false
          },
          ranked: {
            label: "排位赛",
            intro: "先确认你的当前段位，再选择英雄进入排位对局。",
            path: "/battle/ranked",
            ranked: true
          },
          slaughter: {
            label: "杀戮模式",
            intro: "更强调资源堆叠与连续压制，适合想体验高爆发神战节奏的玩家。",
            path: "/battle/slaughter",
            ranked: false
          }
        };
        let pendingBattleMode = "quick";
        let selectedBattleHeroId = "";

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
          if (!meta.ranked) {
            battleRankPanel.classList.remove("show");
            battleRankPanel.innerHTML = "";
            return;
          }
          battleRankPanel.classList.add("show");
          battleRankPanel.innerHTML =
            '<div class="battle-rank-card"><span>当前段位</span><strong>' + (rankData.display || "凡尘行者 · 前期") + '</strong><em>' + (rankData.tierTitle || "初入神迹") + '</em></div>' +
            '<div class="battle-rank-card"><span>当前经验</span><strong>' + ((rankData.progress || 0) + " / " + (rankData.progressMax || 100)) + '</strong><em>每一级固定需要 100 经验</em></div>' +
            '<div class="battle-rank-card"><span>排位结算</span><strong>胜利 +20 / 失败 -10</strong><em>只有排位赛会结算经验</em></div>';
        }
        function renderBattleHeroOptions() {
          if (!battleHeroList) return;
          battleHeroList.innerHTML = heroData.map((hero) => {
            const active = hero.id === selectedBattleHeroId ? "active" : "";
            return '<button class="battle-pick ' + active + '" type="button" data-battle-hero="' + hero.id + '">' +
              '<img src="' + hero.avatar + '" alt="' + hero.name + '" />' +
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
            '<img src="' + hero.avatar + '" alt="' + hero.name + '" />' +
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
          if (battleModeTag) battleModeTag.textContent = meta.label;
          if (battleModeIntro) battleModeIntro.textContent = meta.intro;
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
            window.location.href = meta.path + "?hero=" + encodeURIComponent(selectedBattleHeroId);
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
        if (battleOpenAtlas) {
          battleOpenAtlas.addEventListener("click", function () {
            closeBattleModal();
            if (cardDrawer) cardDrawer.classList.remove("show");
            if (heroDrawer) heroDrawer.classList.add("show");
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
            cardDrawer.classList.toggle("show");
          });
        }
        if (cardDrawerClose && cardDrawer) {
          cardDrawerClose.addEventListener("click", function () {
            cardDrawer.classList.remove("show");
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
            const hero = heroMap.get(card.dataset.heroId);
            if (!hero || !heroModal) return;
            document.getElementById("modalAvatar").src = hero.avatar;
            document.getElementById("modalName").textContent = hero.name;
            document.getElementById("modalBase").textContent = hero.faction + " | " + hero.culture + " | " + hero.title + " | 体力 " + hero.hp;
            document.getElementById("modalSkill").textContent = "技能【" + hero.skill + "】 | 定位：" + hero.role;
            document.getElementById("modalIntro").textContent = "人物介绍：" + hero.intro;
            document.getElementById("modalTrait").textContent =
              "阵营特性【" + hero.factionTrait + "】：" + hero.factionTraitDesc + " | 视觉原型：" + hero.posterLine;
            heroModal.classList.add("show");
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

        friendAvatarButtons.forEach((btn) => {
          btn.addEventListener("click", function () {
            const friend = friendMap.get(btn.dataset.friendId);
            if (!friend || !friendModal) return;
            document.getElementById("friendAvatar").src = friend.avatar;
            document.getElementById("friendName").textContent = friend.name;
            document.getElementById("friendStatus").textContent = "状态：" + friend.status;
            document.getElementById("friendBio").textContent = friend.bio || "这位好友暂时没有填写简介。";
            friendModal.classList.add("show");
          });
        });
        if (friendModalClose && friendModal) {
          friendModalClose.addEventListener("click", function () {
            friendModal.classList.remove("show");
          });
          friendModal.addEventListener("click", function (event) {
            if (event.target === friendModal) friendModal.classList.remove("show");
          });
        }

        inviteButtons.forEach((btn) => {
          btn.addEventListener("click", async function () {
            const friendId = btn.dataset.friendId;
            const friend = friendMap.get(friendId);
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.textContent = "邀请中...";
            try {
              const resp = await fetch("/api/friends/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friendId }),
              });
              const json = await resp.json();
              if (resp.ok && json.ok) {
                btn.textContent = "已邀请";
                window.setTimeout(() => {
                  btn.textContent = originalText;
                  btn.disabled = false;
                }, 1200);
              } else {
                btn.textContent = "邀请失败";
                window.setTimeout(() => {
                  btn.textContent = originalText;
                  btn.disabled = false;
                }, 1200);
              }
            } catch {
              btn.textContent = "邀请失败";
              window.setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
              }, 1200);
            }
          });
        });

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
          <img src="${hero.avatar}" alt="${escapeHtml(hero.name)}" />
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
          <img src="${card.avatar}" alt="${escapeHtml(card.newName)}" />
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
          <a class="guide-link ghost" href="/">返回大厅</a>
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
              <a class="guide-link primary" href="/">返回大厅开始实战</a>
            </div>
          </section>
        </main>
      </div>
    </body>
  </html>`;
}

function renderQuickBattlePage(user, options = {}) {
  const battleHeroes = flattenHeroes();
  const modeMeta = getBattleModeMeta(options.mode);
  const selectedHeroId = typeof options.selectedHeroId === "string" ? options.selectedHeroId : "";
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
  const battleBoot = {
    viewer: user
      ? {
          name: user.nickname || user.name || user.displayName || "SecondMe 玩家",
        }
      : {
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
          <a class="qb-back" href="/">返回大厅</a>
          <div class="qb-title"></div>
          <div class="qb-footer-actions" style="justify-content:flex-end;">
            <button class="qb-ghost" id="qbRestart" type="button">重新开局</button>
          </div>
        </header>

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
              <a class="qb-ghost" href="/">返回大厅</a>
            </div>
          </div>
        </section>
      </div>

      <script>window.BATTLE_BOOT = ${bootJson};</script>
      <script src="/quick-battle.js"></script>
    </body>
  </html>`;
}

app.get("/login", (req, res) => {
  if (!requireConfig(res)) return;
  const state = crypto.randomBytes(16).toString("hex");
  setCookie(res, "oauth_state", state, 600);
  const params = new URLSearchParams({
    client_id: SECONDME_CLIENT_ID,
    redirect_uri: SECONDME_REDIRECT_URI,
    response_type: "code",
    state,
  });
  res.redirect(`${SECONDME_OAUTH_URL}?${params.toString()}`);
});

app.get("/logout", async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) await deleteStoredSession(cookies.sid);
  clearCookie(res, "sid");
  clearCookie(res, "oauth_state");
  res.redirect("/");
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
    const friends = await fetchSecondMeFriends(accessToken);

    const sid = existingSid || crypto.randomBytes(24).toString("hex");
    await saveStoredSession(sid, {
      user: userJson.data,
      token: tokenJson.data,
      friends,
      rankProgress: createRankProgress(existingSession?.rankProgress?.score || 0),
      createdAt: existingSession?.createdAt || Date.now(),
    });
    setCookie(res, "sid", sid, SESSION_TTL_SEC);
    clearCookie(res, "oauth_state");
    res.redirect("/");
  } catch (e) {
    res.status(500).send(`<pre>${e instanceof Error ? e.message : String(e)}</pre><p><a href="/">返回首页</a></p>`);
  }
});

app.get("/battle/quick", async (req, res) => {
  const { session } = await getOrCreateSession(req, res);
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  res.send(renderQuickBattlePage(session?.user || null, { mode: "quick", selectedHeroId: hero, rankProgress: session.rankProgress }));
});

app.get("/battle/slaughter", async (req, res) => {
  const { session } = await getOrCreateSession(req, res);
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  res.send(renderQuickBattlePage(session?.user || null, { mode: "slaughter", selectedHeroId: hero, rankProgress: session.rankProgress }));
});

app.get("/battle/ranked", async (req, res) => {
  const { session } = await getOrCreateSession(req, res);
  const hero = typeof req.query.hero === "string" ? req.query.hero : "";
  res.send(renderQuickBattlePage(session?.user || null, { mode: "ranked", selectedHeroId: hero, rankProgress: session.rankProgress }));
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

app.get("/", async (req, res) => {
  if (!requireConfig(res)) return;
  const { sid, session } = await getOrCreateSession(req, res);
  if (session?.token?.accessToken) {
    const latestFriends = await fetchSecondMeFriends(session.token.accessToken);
    session.friends = latestFriends;
    await saveStoredSession(sid, session);
  }
  const html = renderPage({
    isLoggedIn: Boolean(session?.user),
    user: session?.user || null,
    friends: session?.friends || [],
    rankProgress: session?.rankProgress || createRankProgress(),
  });
  res.send(html);
});

app.post("/api/friends/invite", async (req, res) => {
  const { session } = await getSessionFromRequest(req);
  if (!session?.token?.accessToken) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const friendId = String(req.body?.friendId || "");
  if (!friendId) {
    res.status(400).json({ ok: false, error: "missing_friend_id" });
    return;
  }

  const accessToken = session.token.accessToken;
  const candidates = [
    `${SECONDME_API_BASE_URL}/api/secondme/friend/invite`,
    `${SECONDME_API_BASE_URL}/api/secondme/friends/invite`,
  ];

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ friendId }),
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json && json.code === 0) {
        res.json({ ok: true });
        return;
      }
    } catch {
      continue;
    }
  }

  res.status(502).json({ ok: false, error: "invite_endpoint_unavailable" });
});

app.post("/api/ranked/result", async (req, res) => {
  const { sid, session } = await getOrCreateSession(req, res);
  const outcome = String(req.body?.outcome || "");
  if (outcome !== "win" && outcome !== "loss") {
    res.status(400).json({ ok: false, error: "invalid_outcome" });
    return;
  }
  const rankProgress = ensureRankProgress(session);
  const delta = outcome === "win" ? RANK_GAIN_WIN : RANK_GAIN_LOSS;
  rankProgress.score = Math.max(0, rankProgress.score + delta);
  rankProgress.updatedAt = Date.now();
  await saveStoredSession(sid, session);
  res.json({
    ok: true,
    delta,
    outcome,
    rank: getRankMeta(rankProgress.score),
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

app.post("/api/integration/call", async (req, res) => {
  const tool = String(req.body?.tool || req.body?.name || "").trim();
  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  if (!tool) {
    res.status(400).json({ ok: false, error: "missing_tool" });
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ ok: false, error: "missing_bearer_token" });
    return;
  }

  const upstreamUser = await fetchSecondMeUser(accessToken);
  if (!upstreamUser) {
    res.status(401).json({ ok: false, error: "invalid_bearer_token" });
    return;
  }

  const linkedSession = await findStoredSessionByUser(upstreamUser);
  const rankProgress = linkedSession?.rankProgress || createRankProgress();
  const baseUrl = getAppBaseUrl(req);

  if (tool === "get_player_profile") {
    const includeFriends = Boolean(input.includeFriends);
    const friends = includeFriends ? await fetchSecondMeFriends(accessToken) : [];
    res.json({
      ok: true,
      tool,
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
    });
    return;
  }

  if (tool === "list_game_heroes") {
    const faction = typeof input.faction === "string" ? input.faction.trim() : "";
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
    res.json({ ok: true, tool, data: { count: heroes.length, heroes } });
    return;
  }

  if (tool === "list_game_cards") {
    const category = typeof input.category === "string" ? input.category.trim() : "";
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
    res.json({ ok: true, tool, data: { count: cards.length, cards } });
    return;
  }

  if (tool === "create_battle_entry") {
    const heroId = typeof input.heroId === "string" ? input.heroId.trim() : "";
    const mode = ["quick", "ranked", "slaughter"].includes(String(input.mode || "")) ? String(input.mode) : "quick";
    const hero = flattenHeroes().find((item) => item.id === heroId);
    if (!hero) {
      res.status(404).json({ ok: false, error: "hero_not_found" });
      return;
    }
    const modeMeta = getBattleModeMeta(mode);
    const url = `${baseUrl}/battle/${mode}?hero=${encodeURIComponent(hero.id)}`;
    res.json({
      ok: true,
      tool,
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
    });
    return;
  }

  res.status(404).json({ ok: false, error: "unknown_tool" });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Shenji Duel running on http://localhost:${PORT}`);
  });
}
