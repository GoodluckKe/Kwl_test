import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// 卡牌数据
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

// 为卡牌生成出场语音
function generateCardVoiceLines(cardName, cardData) {
  const voiceLines = {
    "神击": ["神罚降临！", "吃我一击！", "雷霆万钧！"],
    "神盾": ["坚不可摧！", "神盾护体！", "休想伤我！"],
    "灵药": ["恢复元气！", "药到病除！", "神药在此！"],
    "神迹": ["奇迹显现！", "神的恩赐！", "命运的抉择！"],
    "天罚": ["天谴！", "神火审判！", "尔等受死！"],
    "神谕": ["神的启示！", "真相大白！", "洞察一切！"],
    "混沌漩涡": ["秩序崩塌！", "混乱之力！", "乾坤倒转！"],
    "诸神黄昏": ["末日降临！", "诸神的终章！", "审判之日！"],
    "命运纺锤": ["命运的丝线！", "生死由命！", "听天由命！"],
    "智慧之泉": ["知识的力量！", "以命换智！", "智慧之光！"],
    "冥河契约": ["与死神的交易！", "亡灵的低语！", "从冥界归来！"],
    "雷霆之怒": ["雷神之怒！", "电闪雷鸣！", "轰雷掣电！"],
    "神之恩典": ["神的庇护！", "天佑吾身！", "神圣的祝福！"],
    "丰饶之角": ["丰收的喜悦！", "源源不断！", "富饶之力！"],
    "潘多拉魔盒": ["灾祸之源！", "打开魔盒！", "灾难降临！"],
    "斯芬克斯之谜": ["智慧的考验！", "谜题难解！", "猜不透的真相！"],
    "世界树之缚": ["树藤缠绕！", "世界树的力量！", "束缚之力！"],
    "雷神之锤": ["索尔之锤！", "雷霆万钧！", "粉碎一切！"],
    "永恒之枪": ["冈格尼尔！", "穿刺一切！", "永恒的长枪！"],
    "审判之刃": ["审判之剑！", "处决时刻！", "正义的裁决！"],
    "神盾·埃吉斯": ["雅典娜之盾！", "坚不可摧！", "神圣守护！"],
    "冥河渡船": ["跨越冥河！", "死亡的摆渡！", "彼岸之旅！"],
    "世界树之佑": ["世界树的祝福！", "生命的守护！", "自然之力！"],
    "神驹·斯莱普尼尔": ["八足神驹！", "风驰电掣！", "奥丁的坐骑！"],
    "神驹·日车": ["太阳的战车！", "光的速度！", "日行千里！"],
    "神驹·芬里尔": ["狼神之力！", "追猎时刻！", "芬里尔的獠牙！"],
    "圣物·智慧之泉": ["智慧的源泉！", "知识的海洋！", "启迪心智！"],
    "圣物·丰饶之角": ["丰饶的象征！", "源源不断的恩惠！", "丰收之角！"],
    "圣物·命运纺锤": ["命运的纺织！", "生死的掌控！", "命运的齿轮！"],
  };

  return voiceLines[cardName] || ["卡牌生效！", "技能发动！", "效果触发！"];
}

// 使用Trae API生成卡牌头像
async function generateCardImage(cardName, cardData) {
  const prompt = `A detailed illustration of ${cardName}, ${cardData.category} from mythology, ${cardData.effect}, ${cardData.design}, epic fantasy style, high quality, detailed, 4k`;
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=square`;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.buffer();
    return buffer;
  } catch (error) {
    console.error(`生成${cardName}头像失败:`, error);
    return null;
  }
}

// 保存卡牌头像
function saveCardImage(cardName, imageBuffer) {
  const cardImagesDir = path.join(process.cwd(), 'public', 'card-images');
  if (!fs.existsSync(cardImagesDir)) {
    fs.mkdirSync(cardImagesDir, { recursive: true });
  }
  const imagePath = path.join(cardImagesDir, `${cardName}.png`);
  fs.writeFileSync(imagePath, imageBuffer);
  console.log(`保存${cardName}头像到 ${imagePath}`);
}

// 保存卡牌语音
function saveCardVoiceLines(cardName, voiceLines) {
  const cardVoiceDir = path.join(process.cwd(), 'public', 'card-voices');
  if (!fs.existsSync(cardVoiceDir)) {
    fs.mkdirSync(cardVoiceDir, { recursive: true });
  }
  const voicePath = path.join(cardVoiceDir, `${cardName}.json`);
  fs.writeFileSync(voicePath, JSON.stringify(voiceLines, null, 2));
  console.log(`保存${cardName}语音到 ${voicePath}`);
}

// 主函数
async function main() {
  console.log('开始为卡牌生成头像和出场语音...');
  
  for (const card of cardData) {
    console.log(`\n处理卡牌: ${card.newName}`);
    
    // 生成头像
    console.log('生成头像...');
    const imageBuffer = await generateCardImage(card.newName, card);
    if (imageBuffer) {
      saveCardImage(card.newName, imageBuffer);
    }
    
    // 生成出场语音
    console.log('生成出场语音...');
    const voiceLines = generateCardVoiceLines(card.newName, card);
    saveCardVoiceLines(card.newName, voiceLines);
  }
  
  console.log('\n所有卡牌的头像和出场语音生成完成！');
}

// 运行主函数
main().catch(console.error);
