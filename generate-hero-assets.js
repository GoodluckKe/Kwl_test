import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// 英雄数据
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

// 为英雄生成出场语音
function generateHeroVoiceLines(heroName, heroData) {
  const voiceLines = {
    女娲: ["五色石补天，万物生息。", "母神护佑，众生安宁。", "天地混沌，我来开辟。"],
    盘古: ["开天辟地，分清浊。", "混沌初开，乾坤已定。", "巨斧一挥，天地始分。"],
    伏羲: ["八卦推演，天机尽在掌握。", "文明初启，教化万民。", "河图洛书，智慧之源。"],
    后羿: ["九日当空，我来射落。", "长弓在手，百发百中。", "烈阳坠地，天下清凉。"],
    大禹: ["导川分流，洪水归海。", "持圭定土，秩序井然。", "三过家门而不入，治水安民。"],
    宙斯: ["雷霆震怒，天穹审判。", "众神之王，号令天下。", "奥林匹斯的意志，不可违抗。"],
    雅典娜: ["智慧之光，照亮战场。", "盾矛在手，守护正义。", "猫头鹰为我指引，胜利在握。"],
    赫拉克勒斯: ["十二伟绩，力压群雄。", "狮皮加身，力大无穷。", "大力神在此，谁敢争锋？"],
    普罗米修斯: ["火种已得，人类有救。", "反抗宙斯，为了人类。", "即使被锁链束缚，我也绝不屈服。"],
    波塞冬: ["海皇震怒，波浪滔天。", "三叉戟指，四海臣服。", "海洋的力量，无穷无尽。"],
    梵天: ["莲花盛开，宇宙创生。", "梵音缭绕，万物归一。", "创造之力，源源不绝。"],
    毗湿奴: ["法轮转动，维护秩序。", "化身万千，护佑众生。", "宇宙的守护者，永不疲倦。"],
    湿婆: ["毁灭即是新生。", "舞蹈中蕴含毁灭之力。", "三叉戟下，万物归一。"],
    罗摩: ["正法在手，王者无敌。", "弓术精湛，百发百中。", "理想君主，万民敬仰。"],
    克里希纳: ["牧笛声声，引魂入道。", "神曲缭绕，心灵净化。", "孔雀羽饰，神圣庄严。"],
    拉: ["日轮巡天，光芒万丈。", "太阳神在此，黑暗退散。", "日舟划过，昼夜交替。"],
    奥西里斯: ["冥界之王，掌管生死。", "木乃伊的身躯，不朽的灵魂。", "死亡不是终结，而是新生的开始。"],
    伊西斯: ["神翼展开，庇护众生。", "魔法之力，治愈伤痛。", "女神的祝福，永远陪伴。"],
    荷鲁斯: ["隼目如炬，复仇在即。", "王权在握，正义伸张。", "太阳的力量，助我胜利。"],
    阿努比斯: ["胡狼之眼，审判灵魂。", "冥途引魂，善恶有报。", "天平称量，公正无私。"],
    奥丁: ["独眼观古今，智慧无穷。", "双鸦报信，洞察一切。", "长枪在手，所向披靡。"],
    索尔: ["雷锤裂空，风暴来袭。", "雷神之威，不可阻挡。", "近身搏斗，无人能敌。"],
    洛基: ["诡计多端，变化莫测。", "阴影中的舞者，玩弄人心。", "多重身份，谁能识破？"],
    弗雷: ["丰饶之神，赐予收获。", "金色阳光，温暖大地。", "神猪为伴，守护和平。"],
    提尔: ["断腕立誓，忠诚不渝。", "剑指前方，勇者无畏。", "战争之神，所向披靡。"],
  };

  return voiceLines[heroName] || ["战斗开始！", "准备迎战！", "胜利属于我！"];
}

// 使用Trae API生成英雄头像
async function generateHeroImage(heroName, heroData) {
  // 简化提示词，减少细节描述，加快生成速度
  const prompt = `Portrait of ${heroName}, ${heroData.culture} deity, ${heroData.posterLine}, fantasy style`;
  const encodedPrompt = encodeURIComponent(prompt);
  // 使用较小的图片尺寸，加快生成速度
  const imageUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=square`;

  try {
    console.log(`生成${heroName}头像，提示词: ${prompt}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.buffer();
    console.log(`生成${heroName}头像成功，大小: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error(`生成${heroName}头像失败:`, error);
    return null;
  }
}

// 保存英雄头像
function saveHeroImage(heroName, imageBuffer) {
  const heroImagesDir = path.join(process.cwd(), 'public', 'hero-images');
  if (!fs.existsSync(heroImagesDir)) {
    fs.mkdirSync(heroImagesDir, { recursive: true });
  }
  const imagePath = path.join(heroImagesDir, `${heroName}.png`);
  fs.writeFileSync(imagePath, imageBuffer);
  console.log(`保存${heroName}头像到 ${imagePath}`);
}

// 保存英雄语音
function saveHeroVoiceLines(heroName, voiceLines) {
  const heroVoiceDir = path.join(process.cwd(), 'public', 'hero-voices');
  if (!fs.existsSync(heroVoiceDir)) {
    fs.mkdirSync(heroVoiceDir, { recursive: true });
  }
  const voicePath = path.join(heroVoiceDir, `${heroName}.json`);
  fs.writeFileSync(voicePath, JSON.stringify(voiceLines, null, 2));
  console.log(`保存${heroName}语音到 ${voicePath}`);
}

// 主函数
async function main() {
  console.log('开始为英雄生成头像和出场语音...');
  
  for (const [heroName, heroData] of Object.entries(HERO_ART_META)) {
    console.log(`\n处理英雄: ${heroName}`);
    
    // 生成头像
    console.log('生成头像...');
    const imageBuffer = await generateHeroImage(heroName, heroData);
    if (imageBuffer) {
      saveHeroImage(heroName, imageBuffer);
    }
    
    // 生成出场语音
    console.log('生成出场语音...');
    const voiceLines = generateHeroVoiceLines(heroName, heroData);
    saveHeroVoiceLines(heroName, voiceLines);
  }
  
  console.log('\n所有英雄的头像和出场语音生成完成！');
}

// 运行主函数
main().catch(console.error);
