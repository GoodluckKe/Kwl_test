import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// 英雄数据
const heroes = [
  { name: '盘古', faction: '上古华夏', color: '#c2410c' },
  { name: '女娲', faction: '上古华夏', color: '#9333ea' },
  { name: '伏羲', faction: '上古华夏', color: '#1e40af' },
  { name: '后羿', faction: '上古华夏', color: '#0284c7' },
  { name: '大禹', faction: '上古华夏', color: '#059669' },
  { name: '宙斯', faction: '古希腊', color: '#1e40af' },
  { name: '雅典娜', faction: '古希腊', color: '#0284c7' },
  { name: '赫拉克勒斯', faction: '古希腊', color: '#c2410c' },
  { name: '普罗米修斯', faction: '古希腊', color: '#9333ea' },
  { name: '波塞冬', faction: '古希腊', color: '#0ea5e9' },
  { name: '梵天', faction: '古印度', color: '#9333ea' },
  { name: '毗湿奴', faction: '古印度', color: '#1e40af' },
  { name: '湿婆', faction: '古印度', color: '#c2410c' },
  { name: '罗摩', faction: '古印度', color: '#059669' },
  { name: '克里希纳', faction: '古印度', color: '#f59e0b' },
  { name: '拉', faction: '古埃及', color: '#f59e0b' },
  { name: '奥西里斯', faction: '古埃及', color: '#059669' },
  { name: '伊西斯', faction: '古埃及', color: '#9333ea' },
  { name: '荷鲁斯', faction: '古埃及', color: '#1e40af' },
  { name: '阿努比斯', faction: '古埃及', color: '#6b7280' },
  { name: '奥丁', faction: '古北欧', color: '#1e293b' },
  { name: '索尔', faction: '古北欧', color: '#f59e0b' },
  { name: '洛基', faction: '古北欧', color: '#9333ea' },
  { name: '弗雷', faction: '古北欧', color: '#059669' },
  { name: '提尔', faction: '古北欧', color: '#c2410c' }
];

// 输出目录
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const outputDir = path.join(__dirname, 'public', 'hero-images');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 生成简易英雄头像
async function generateSimpleHeroAvatars() {
  console.log('开始生成简易英雄头像...');
  
  for (const hero of heroes) {
    try {
      // 创建一个512x512的纯色背景
      const image = sharp(Buffer.from(`
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <!-- 背景 -->
          <rect width="512" height="512" fill="${hero.color}" />
          
          <!-- 英雄名字 -->
          <text x="256" y="240" font-family="Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="middle" fill="white">${hero.name}</text>
          
          <!-- 阵营 -->
          <text x="256" y="300" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="white">${hero.faction}</text>
        </svg>
      `));
      
      // 输出为PNG文件
      const outputPath = path.join(outputDir, `${hero.name}.png`);
      await image.png().toFile(outputPath);
      
      console.log(`生成成功: ${hero.name}.png`);
    } catch (error) {
      console.error(`生成失败: ${hero.name}`, error);
    }
  }
  
  console.log('简易英雄头像生成完成！');
}

// 执行生成
if (import.meta.url === `file://${process.argv[1]}`) {
  generateSimpleHeroAvatars();
}

export default generateSimpleHeroAvatars;