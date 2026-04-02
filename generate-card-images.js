import fs from 'fs';
import path from 'path';
import https from 'https';

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
    originalName: "冥河契约",
    newName: "冥河契约",
    quantity: "2张",
    suit: "黑桃Q",
    effect: "出牌阶段，对自己使用。从弃牌堆中随机获得3张牌。",
    design: "与冥界交易，回收资源。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "雷霆之怒",
    newName: "雷霆之怒",
    quantity: "2张",
    suit: "黑桃J",
    effect: "对一名其他角色使用。目标需打出2张【神盾】，否则受到1点伤害。",
    design: "来自天空的愤怒，需要多重防御才能抵挡。",
  },
  {
    category: "命运牌",
    subType: "非延时",
    originalName: "丰饶之角",
    newName: "丰饶之角",
    quantity: "2张",
    suit: "红桃J",
    effect: "对自己使用。回复1点体力，然后摸1张牌。",
    design: "象征丰收与祝福的圣物。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "潘多拉魔盒",
    newName: "潘多拉魔盒",
    quantity: "2张",
    suit: "黑桃10",
    effect: "对一名其他角色使用，将此牌置于其判定区。其判定阶段进行判定：若结果不为红桃，则受到2点伤害。",
    design: "打开灾难的盒子，带来不可预测的后果。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "斯芬克斯之谜",
    newName: "斯芬克斯之谜",
    quantity: "2张",
    suit: "方块10",
    effect: "对一名其他角色使用，将此牌置于其判定区。其判定阶段进行判定：若结果不为方块，则跳过其出牌阶段。",
    design: "无解的谜题，困住对手的行动。",
  },
  {
    category: "命运牌",
    subType: "延时",
    originalName: "世界树之缚",
    newName: "世界树之缚",
    quantity: "2张",
    suit: "梅花10",
    effect: "对一名其他角色使用，将此牌置于其判定区。其判定阶段进行判定：若结果不为黑桃，则其本回合攻击无视距离且伤害+1。",
    design: "来自世界树的束缚，限制对手的行动。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "雷神之锤",
    newName: "雷神之锤",
    quantity: "1张",
    suit: "黑桃A",
    effect: "攻击范围2。你使用【神击】时，目标不能使用【神盾】，而是需弃置2张手牌。",
    design: "雷神索尔的标志性武器，具有不可阻挡的力量。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "永恒之枪",
    newName: "永恒之枪",
    quantity: "1张",
    suit: "红桃A",
    effect: "攻击范围3。你使用【神击】对目标造成伤害后，摸1张牌。",
    design: "奥丁的长矛，命中后带来额外的收获。",
  },
  {
    category: "神器牌",
    subType: "武器",
    originalName: "审判之刃",
    newName: "审判之刃",
    quantity: "1张",
    suit: "方块A",
    effect: "攻击范围2。若目标当前体力值小于或等于你的体力值，你使用【神击】对其造成的伤害+1。",
    design: "正义的裁决之剑，对弱者造成更大的伤害。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "神盾·埃吉斯",
    newName: "神盾·埃吉斯",
    quantity: "1张",
    suit: "红桃Q",
    effect: "当你成为【神击】的目标时，若你使用【神盾】，则摸1张牌。",
    design: "雅典娜的盾牌，提供额外的防御奖励。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "冥河渡船",
    newName: "冥河渡船",
    quantity: "1张",
    suit: "黑桃Q",
    effect: "其他角色计算与你的距离时，始终+1。",
    design: "来自冥界的渡船，增加与对手的距离。",
  },
  {
    category: "神器牌",
    subType: "防具",
    originalName: "世界树之佑",
    newName: "世界树之佑",
    quantity: "1张",
    suit: "梅花Q",
    effect: "当你受到伤害时，若来源是一名角色，则防止此伤害，改为失去1点体力。",
    design: "世界树的保护，将伤害转化为体力损失。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "神驹·斯莱普尼尔",
    newName: "神驹·斯莱普尼尔",
    quantity: "1张",
    suit: "方块Q",
    effect: "其他角色计算与你的距离时，始终+1。",
    design: "奥丁的八足神马，增加与对手的距离。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "神驹·日车",
    newName: "神驹·日车",
    quantity: "1张",
    suit: "红桃K",
    effect: "你计算与其他角色的距离时，始终-1。",
    design: "太阳神的战车，缩短与对手的距离。",
  },
  {
    category: "神器牌",
    subType: "坐骑",
    originalName: "神驹·芬里尔",
    newName: "神驹·芬里尔",
    quantity: "1张",
    suit: "黑桃K",
    effect: "你使用【神击】时，攻击范围无限。",
    design: "巨狼芬里尔，提供无限的攻击范围。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "圣物·智慧之泉",
    newName: "圣物·智慧之泉",
    quantity: "1张",
    suit: "梅花K",
    effect: "你的摸牌阶段开始时，你可以观看牌堆顶的3张牌，然后将它们以任意顺序放回牌堆顶。",
    design: "智慧女神的圣泉，提供对牌堆的控制。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "圣物·丰饶之角",
    newName: "圣物·丰饶之角",
    quantity: "1张",
    suit: "红桃Q",
    effect: "你的结束阶段开始时，摸1张牌。",
    design: "丰收女神的号角，提供额外的牌源。",
  },
  {
    category: "神器牌",
    subType: "圣物",
    originalName: "圣物·命运纺锤",
    newName: "圣物·命运纺锤",
    quantity: "1张",
    suit: "方块K",
    effect: "当你受到伤害时，你可以进行一次判定：若结果为红色，则防止此伤害。",
    design: "命运女神的纺锤，提供额外的防御机会。",
  },
];

// 生成卡牌图像
async function generateCardImages() {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const outputDir = path.join(__dirname, 'public', 'card-images');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const card of cardData) {
    console.log(`正在生成 ${card.newName} 的图像...`);
    
    // 生成提示词
    const prompt = `神话卡牌 ${card.newName}，${card.category}，${card.subType}，${card.effect}，${card.design}，史诗风格，4K，高质量，动漫风格，卡牌设计`;
    
    // 生成图像 URL
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=square`;
    
    // 下载图像
    try {
      await downloadImage(imageUrl, path.join(outputDir, `${card.newName}.png`));
      console.log(`成功生成 ${card.newName} 的图像`);
    } catch (error) {
      console.error(`生成 ${card.newName} 的图像失败:`, error);
    }
    
    // 等待 1 秒，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 下载图像
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`HTTP 错误! 状态码: ${redirectResponse.statusCode}`));
              return;
            }
            
            const writeStream = fs.createWriteStream(filepath);
            redirectResponse.pipe(writeStream);
            
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          }).on('error', reject);
        } else {
          reject(new Error('重定向但没有提供位置'));
        }
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP 错误! 状态码: ${response.statusCode}`));
        return;
      }
      
      const writeStream = fs.createWriteStream(filepath);
      response.pipe(writeStream);
      
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    }).on('error', reject);
  });
}

// 运行生成
generateCardImages().then(() => {
  console.log('所有卡牌图像生成完成!');
}).catch(error => {
  console.error('生成卡牌图像时发生错误:', error);
});
