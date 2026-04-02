import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const heroData = [
  { name: "女娲", prompt: "Chinese goddess, Nüwa, creating humans, ancient Chinese mythology, beautiful goddess with flowing robes, celestial" },
  { name: "盘古", prompt: "Chinese god Pangu, cracking open egg of chaos, giant muscular deity holding sky and earth, ancient Chinese mythology" },
  { name: "伏羲", prompt: "Chinese sage Fuxi, eight trigrams, ancient Chinese mythology, wise scholar" },
  { name: "后羿", prompt: "Chinese warrior Hou Yi, shooting suns, heroic archer with bow and arrow, ancient Chinese mythology" },
  { name: "大禹", prompt: "Chinese king Yu the Great, controlling floods, wise ruler, ancient China" },
  { name: "宙斯", prompt: "Greek god Zeus, king of gods, lightning bolt, white robes, beard, majestic" },
  { name: "雅典娜", prompt: "Greek goddess Athena, owl, spear and shield, armor, wise warrior" },
  { name: "赫拉克勒斯", prompt: "Greek hero Hercules, lion skin, muscular warrior, club, twelve labors" },
  { name: "普罗米修斯", prompt: "Greek titan Prometheus, stealing fire, chained to rock with torch" },
  { name: "波塞冬", prompt: "Greek god Poseidon, trident, blue robes, king of oceans" },
  { name: "梵天", prompt: "Hindu god Brahma, four heads, four arms, creating universe" },
  { name: "毗湿奴", prompt: "Hindu god Vishnu, blue-skinned, cosmic serpent, multiple arms" },
  { name: "湿婆", prompt: "Hindu god Shiva, meditation, third eye, blue throat" },
  { name: "罗摩", prompt: "Hindu hero Rama, righteous king, warrior prince with bow" },
  { name: "克里希纳", prompt: "Hindu god Krishna, playing flute, blue-skinned" },
  { name: "拉", prompt: "Egyptian god Ra, falcon-headed sun god, solar disk, golden" },
  { name: "奥西里斯", prompt: "Egyptian god Osiris, green-skinned, mummified, crook and flail" },
  { name: "伊西斯", prompt: "Egyptian goddess Isis, throne headdress, powerful magic" },
  { name: "荷鲁斯", prompt: "Egyptian god Horus, falcon, eye of Horus, golden" },
  { name: "阿努比斯", prompt: "Egyptian god Anubis, jackal-headed, black robes, death god" },
  { name: "奥丁", prompt: "Norse god Odin, one-eyed with ravens, spear, wise king" },
  { name: "索尔", prompt: "Norse god Thor, red beard, Mjolnir hammer, lightning" },
  { name: "洛基", prompt: "Norse god Loki, trickster, green robes, sly smile" },
  { name: "弗雷", prompt: "Norse god Freyr, golden hair, sword, fertility god" },
  { name: "提尔", prompt: "Norse god Tyr, one-handed, wolf chains, war god" },
];

const outputDir = join(__dirname, '..', 'public', 'hero-avatars');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        file.close();
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function generateHeroImage(hero) {
  const filename = `${hero.name}.png`;
  const outputPath = join(outputDir, filename);
  
  console.log(`Generating ${hero.name}...`);
  
  const seed = Date.now() + Math.random() * 10000;
  const promptEncoded = encodeURIComponent(hero.prompt + ", portrait, detailed face, illustration style");
  const imageUrl = `https://image.pollinations.ai/prompt/${promptEncoded}?width=512&height=512&nologo=true&seed=${seed}`;
  
  try {
    await downloadImage(imageUrl, outputPath);
    const stats = fs.statSync(outputPath);
    if (stats.size < 1000) {
      console.log(`Failed for ${hero.name}, retrying...`);
      fs.unlinkSync(outputPath);
      await generateHeroImage(hero);
    } else {
      console.log(`Generated: ${filename} (${stats.size} bytes)`);
    }
  } catch (error) {
    console.error(`Error generating ${hero.name}:`, error.message);
  }
}

async function main() {
  console.log('Generating hero portraits with AI...\n');
  
  for (const hero of heroData) {
    const outputPath = join(outputDir, `${hero.name}.png`);
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 1000) {
        console.log(`Skipping ${hero.name}, already exists`);
        continue;
      }
    }
    await generateHeroImage(hero);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
