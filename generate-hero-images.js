import fs from 'fs';
import path from 'path';
import https from 'https';

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

// 生成英雄图像
async function generateHeroImages() {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const outputDir = path.join(__dirname, 'public', 'hero-images');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const [heroName, heroData] of Object.entries(HERO_ART_META)) {
    console.log(`正在生成 ${heroName} 的图像...`);
    
    // 生成提示词
    const prompt = `神话英雄 ${heroName}，${heroData.culture}，${heroData.lore}，${heroData.posterLine}，史诗风格，4K，高质量，动漫风格`;
    
    // 生成图像 URL
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=square`;
    
    // 下载图像
    try {
      await downloadImage(imageUrl, path.join(outputDir, `${heroName}.png`));
      console.log(`成功生成 ${heroName} 的图像`);
    } catch (error) {
      console.error(`生成 ${heroName} 的图像失败:`, error);
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
          console.log(`重定向到: ${redirectUrl}`);
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
generateHeroImages().then(() => {
  console.log('所有英雄图像生成完成!');
}).catch(error => {
  console.error('生成英雄图像时发生错误:', error);
});
