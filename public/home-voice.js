// 为首页的英雄介绍和卡牌图鉴添加点击播放语音的功能

async function playHeroVoice(heroName) {
  try {
    const response = await fetch(`/hero-voices/${encodeURIComponent(heroName)}.json`);
    if (!response.ok) return;
    const voiceLines = await response.json();
    if (Array.isArray(voiceLines) && voiceLines.length > 0) {
      const randomLine = voiceLines[Math.floor(Math.random() * voiceLines.length)];
      const utterance = new SpeechSynthesisUtterance(randomLine);
      utterance.lang = 'zh-CN';
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  } catch (error) {
    console.error('播放英雄语音失败:', error);
  }
}

async function playCardVoice(cardName) {
  try {
    const response = await fetch(`/card-voices/${encodeURIComponent(cardName)}.json`);
    if (!response.ok) return;
    const voiceLines = await response.json();
    if (Array.isArray(voiceLines) && voiceLines.length > 0) {
      const randomLine = voiceLines[Math.floor(Math.random() * voiceLines.length)];
      const utterance = new SpeechSynthesisUtterance(randomLine);
      utterance.lang = 'zh-CN';
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  } catch (error) {
    console.error('播放卡牌语音失败:', error);
  }
}

// 为英雄卡片添加点击播放语音的功能
const voiceHeroCards = document.querySelectorAll('.hero-select');
voiceHeroCards.forEach((card) => {
  card.addEventListener('click', function() {
    const heroId = this.dataset.heroId;
    const heroName = this.querySelector('.hero-name').textContent;
    playHeroVoice(heroName);
  });
});

// 为卡牌卡片添加点击播放语音的功能
const voiceCardCards = document.querySelectorAll('.card-select');
voiceCardCards.forEach((card) => {
  card.addEventListener('click', function() {
    const cardId = this.dataset.cardId;
    const cardName = this.querySelector('.hero-name').textContent;
    playCardVoice(cardName);
  });
});
