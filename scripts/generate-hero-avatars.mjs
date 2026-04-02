import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const heroData = [
  { name: "女娲", faction: "华夏", color: "#d12a2a", icon: " goddess, long flowing hair, elegant" },
  { name: "盘古", faction: "华夏", color: "#d12a2a", icon: "muscular giant, holding axe, powerful" },
  { name: "伏羲", faction: "华夏", color: "#d12a2a", icon: "wise sage, holding scroll, cosmic" },
  { name: "后羿", faction: "华夏", color: "#d12a2a", icon: "warrior archer, bow, heroic" },
  { name: "大禹", faction: "华夏", color: "#d12a2a", icon: "king with staff, wise ruler" },
  { name: "宙斯", faction: "奥林匹斯", color: "#1f6eea", icon: "king with crown, lightning, beard" },
  { name: "雅典娜", faction: "奥林匹斯", color: "#1f6eea", icon: "goddess with helmet, shield, wise" },
  { name: "赫拉克勒斯", faction: "奥林匹斯", color: "#1f6eea", icon: "muscular warrior, lion skin, strong" },
  { name: "普罗米修斯", faction: "奥林匹斯", color: "#1f6eea", icon: "titan with torch, chained" },
  { name: "波塞冬", faction: "奥林匹斯", color: "#1f6eea", icon: "god with trident, sea creatures" },
  { name: "梵天", faction: "吠陀", color: "#7d3bd6", icon: "god with four heads, multiple arms" },
  { name: "毗湿奴", faction: "吠陀", color: "#7d3bd6", icon: "blue-skinned god, cosmic serpent" },
  { name: "湿婆", faction: "吠陀", color: "#7d3bd6", icon: "god in meditation, third eye" },
  { name: "罗摩", faction: "吠陀", color: "#7d3bd6", icon: "king with bow, righteous" },
  { name: "克里希纳", faction: "吠陀", color: "#7d3bd6", icon: "blue god playing flute" },
  { name: "拉", faction: "凯美特", color: "#d4aa12", icon: "falcon god, sun disk, golden" },
  { name: "奥西里斯", faction: "凯美特", color: "#d4aa12", icon: "green-skinned god, crown" },
  { name: "伊西斯", faction: "凯美特", color: "#d4aa12", icon: "goddess with throne crown" },
  { name: "荷鲁斯", faction: "凯美特", color: "#d4aa12", icon: "falcon god, eye symbol" },
  { name: "阿努比斯", faction: "凯美特", color: "#d4aa12", icon: "jackal-headed god, black" },
  { name: "奥丁", faction: "阿斯加德", color: "#151515", icon: "one-eyed god, ravens, spear" },
  { name: "索尔", faction: "阿斯加德", color: "#151515", icon: "god with hammer, lightning" },
  { name: "洛基", faction: "阿斯加德", color: "#151515", icon: "trickster god, sly smile" },
  { name: "弗雷", faction: "阿斯加德", color: "#151515", icon: "god with sword, golden hair" },
  { name: "提尔", faction: "阿斯加德", color: "#151515", icon: "one-handed god, warrior" },
];

const outputDir = join(__dirname, '..', 'public', 'hero-avatars');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const factionEmojis = {
  "华夏": "炎",
  "奥林匹斯": "海",
  "吠陀": "梵",
  "凯美特": "日",
  "阿斯加德": "霜"
};

async function generateHeroAvatar(hero) {
  const width = 512;
  const height = 512;
  const color = hero.color || "#333333";
  const emoji = factionEmojis[hero.faction] || "⚔️";
  
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="60%" style="stop-color:#1a1a2e;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0d0d1a;stop-opacity:1" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.15" />
          <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
        </radialGradient>
        <linearGradient id="silhouette" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:#cccccc;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#glow)"/>
      
      <!-- Decorative circles -->
      <circle cx="${width/2}" cy="${height/2 - 30}" r="160" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      <circle cx="${width/2}" cy="${height/2 - 30}" r="140" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
      
      <!-- Hero icon/avatar area -->
      <circle cx="${width/2}" cy="${height/2 - 30}" r="100" fill="url(#silhouette)" fill-opacity="0.2"/>
      <text x="${width/2}" y="${height/2 + 10}" text-anchor="middle" font-size="100" fill="#ffffff" font-family="Arial">${emoji}</text>
      
      <!-- Faction badge -->
      <rect x="30" y="30" width="60" height="60" rx="15" fill="#ffffff" fill-opacity="0.1"/>
      <text x="60" y="72" text-anchor="middle" font-size="28" fill="#ffffff" font-family="Arial">${emoji}</text>
      
      <!-- Hero name -->
      <rect x="100" y="${height - 130}" width="${width - 200}" height="80" rx="20" fill="#000000" fill-opacity="0.4"/>
      <text x="${width/2}" y="${height - 95}" text-anchor="middle" font-size="42" fill="#ffffff" font-family="Microsoft YaHei, Arial" font-weight="bold">${hero.name}</text>
      <text x="${width/2}" y="${height - 55}" text-anchor="middle" font-size="18" fill="#aaaaaa" font-family="Microsoft YaHei, Arial">${hero.faction} · ${hero.icon}</text>
      
      <!-- Corner decorations -->
      <path d="M0,0 L80,0 L0,80 Z" fill="#ffffff" fill-opacity="0.05"/>
      <path d="M${width},0 L${width-80},0 L${width},80 Z" fill="#ffffff" fill-opacity="0.05"/>
      <path d="M0,${height} L80,${height} L0,${height-80} Z" fill="#ffffff" fill-opacity="0.05"/>
      <path d="M${width},${height} L${width-80},${height} L${width},${height-80} Z" fill="#ffffff" fill-opacity="0.05"/>
    </svg>
  `;
  
  const filename = `${hero.name}.png`;
  const outputPath = join(outputDir, filename);
  
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
  
  console.log(`Generated: ${filename}`);
}

async function main() {
  console.log('Generating hero avatars...\n');
  
  for (const hero of heroData) {
    await generateHeroAvatar(hero);
  }
  
  console.log(`\nDone! Generated ${heroData.length} hero avatars`);
}

main().catch(console.error);
