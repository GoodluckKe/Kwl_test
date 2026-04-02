(function () {
  const boot = window.BATTLE_BOOT || {};
  const ROLE_INFO = {
    lord: { label: "主神", win: "消灭所有逆神与堕神", className: "role-lord", short: "主" },
    loyalist: { label: "护法", win: "与主神共同胜利", className: "role-loyalist", short: "忠" },
    rebel: { label: "逆神", win: "主神阵亡即胜利", className: "role-rebel", short: "反" },
    spy: { label: "堕神", win: "清场后单挑击杀主神", className: "role-spy", short: "内" },
  };
  const PHASES = [
    { key: "prepare", label: "准备" },
    { key: "judge", label: "判定" },
    { key: "draw", label: "摸牌" },
    { key: "play", label: "出牌" },
    { key: "discard", label: "弃牌" },
    { key: "end", label: "结束" },
  ];
  const SEAT_POSITIONS = {
    0: { left: 50, top: 84 },
    1: { left: 25, top: 75 },
    2: { left: 9, top: 54 },
    3: { left: 24, top: 24 },
    4: { left: 50, top: 14 },
    5: { left: 76, top: 24 },
    6: { left: 91, top: 54 },
  };
  const ACTIONABLE_DELAYED = new Set(["潘多拉魔盒", "斯芬克斯之谜", "世界树之缚"]);
  const SINGLE_TARGET = new Set(["神击", "灵药", "天罚", "神谕", "命运纺锤", "雷霆之怒", "潘多拉魔盒", "斯芬克斯之谜", "世界树之缚"]);
  const REACTION_ONLY = new Set(["神盾", "神之恩典"]);
  const EQUIP_SLOT = {
    "雷神之锤": "weapon",
    "永恒之枪": "weapon",
    "审判之刃": "weapon",
    "神盾·埃吉斯": "armor",
    "冥河渡船": "armor",
    "世界树之佑": "armor",
    "神驹·斯莱普尼尔": "plusHorse",
    "神驹·日车": "minusHorse",
    "神驹·芬里尔": "minusHorse",
    "圣物·智慧之泉": "relic",
    "圣物·丰饶之角": "relic",
    "圣物·命运纺锤": "relic",
  };
  const modeConfig = {
    key: boot.mode === "slaughter" ? "slaughter" : boot.mode === "ranked" ? "ranked" : "quick",
    label: boot.modeLabel || (boot.mode === "slaughter" ? "杀戮模式" : boot.mode === "ranked" ? "排位赛" : "快速战斗"),
    drawPhaseCount: Number(boot.drawPhaseCount) > 0 ? Number(boot.drawPhaseCount) : 2,
    rankEnabled: Boolean(boot.rankEnabled),
    rankProgress: boot.rankProgress || null,
    selectedHeroId: boot.selectedHeroId || "",
  };

  const state = {
    players: [],
    drawPile: [],
    discardPile: [],
    currentPlayerId: null,
    currentPhase: "prepare",
    turn: 1,
    logs: [],
    banner: `${modeConfig.label}即将开始。`,
    selectedCardUid: null,
    waitingForHuman: false,
    gameOver: null,
    humanPlayerId: 0,
    humanTurnResolver: null,
    rankResultSubmitted: false,
    rankUpdate: null,
    turnTimer: null,
    timeLeft: 20,
  };

  const refs = {
    arena: document.getElementById("qbArena"),
    banner: document.getElementById("qbBanner"),
    phaseStrip: document.getElementById("qbPhaseStrip"),
    hint: document.getElementById("qbHint"),
    handList: document.getElementById("qbHandList"),
    handMeta: document.getElementById("qbHandMeta"),
    logList: document.getElementById("qbLogList"),
    graveSummary: document.getElementById("qbGraveSummary"),
    turnSummary: document.getElementById("qbTurnSummary"),
    actorSummary: document.getElementById("qbActorSummary"),
    endTurnBtn: document.getElementById("qbEndTurn"),
    cancelBtn: document.getElementById("qbCancelSelection"),
    autoBtn: document.getElementById("qbAutoRun"),
    refreshBtn: document.getElementById("qbRestart"),
    chatToggle: document.getElementById("qbChatToggle"),
    chatPanel: document.getElementById("qbChatPanel"),
    chatClose: document.getElementById("qbChatClose"),
    chatMessages: document.getElementById("qbChatMessages"),
    chatInput: document.getElementById("qbChatInput"),
    chatSend: document.getElementById("qbChatSend"),
    voiceToggle: document.getElementById("qbVoiceToggle"),
    voicePanel: document.getElementById("qbVoicePanel"),
    voiceClose: document.getElementById("qbVoiceClose"),
    voiceMessages: document.getElementById("qbVoiceMessages"),
    voiceInput: document.getElementById("qbVoiceInput"),
    voiceRecord: document.getElementById("qbVoiceRecord"),
    voiceSend: document.getElementById("qbVoiceSend"),
    resultOverlay: document.getElementById("qbResult"),
    resultTitle: document.getElementById("qbResultTitle"),
    resultCamp: document.getElementById("qbResultCamp"),
    resultText: document.getElementById("qbResultText"),
    resultKicker: document.getElementById("qbResultKicker"),
    resultRestartBtn: document.getElementById("qbResultRestart"),
  };

  function shuffle(list) {
    const array = [...list];
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function parseCount(text) {
    const match = String(text || "").match(/\d+/);
    return match ? Number(match[0]) : 1;
  }

  function randomSuit() {
    const pool = [
      { suit: "spade", label: "♠", color: "black" },
      { suit: "club", label: "♣", color: "black" },
      { suit: "heart", label: "♥", color: "red" },
      { suit: "diamond", label: "♦", color: "red" },
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function suitInfoFromText(text) {
    const input = String(text || "");
    const rankMatch = input.match(/(A|K|Q|J|10|[2-9])/);
    const rank = rankMatch ? rankMatch[1] : String(Math.floor(Math.random() * 13) + 1);
    if (input.includes("/")) {
      const options = [];
      if (input.includes("黑桃")) options.push({ suit: "spade", label: "♠", color: "black" });
      if (input.includes("梅花")) options.push({ suit: "club", label: "♣", color: "black" });
      if (input.includes("红桃")) options.push({ suit: "heart", label: "♥", color: "red" });
      if (input.includes("方块")) options.push({ suit: "diamond", label: "♦", color: "red" });
      const chosen = options[Math.floor(Math.random() * options.length)] || randomSuit();
      return { ...chosen, rank };
    }
    if (input.includes("黑桃")) return { suit: "spade", label: "♠", color: "black", rank };
    if (input.includes("梅花")) return { suit: "club", label: "♣", color: "black", rank };
    if (input.includes("红桃")) return { suit: "heart", label: "♥", color: "red", rank };
    if (input.includes("方块")) return { suit: "diamond", label: "♦", color: "red", rank };
    return { ...randomSuit(), rank };
  }

  function buildDeck(cardDefs) {
    const instances = [];
    cardDefs.forEach((def) => {
      const copies = parseCount(def.quantity);
      for (let i = 0; i < copies; i += 1) {
        const suitInfo = suitInfoFromText(def.suit);
        instances.push({
          uid: `${def.newName}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          name: def.newName,
          category: def.category,
          subType: def.subType,
          effect: def.effect,
          design: def.design,
          range: def.range || null,
          suit: suitInfo.suit,
          suitLabel: suitInfo.label,
          color: suitInfo.color,
          rank: suitInfo.rank,
        });
      }
    });
    return shuffle(instances);
  }

  function livePlayers() {
    return state.players.filter((player) => !player.dead);
  }

  function getPlayerById(id) {
    return state.players.find((player) => player.id === id);
  }

  function isSameCamp(a, b) {
    if (!a || !b) return false;
    if (a.role === "spy" || b.role === "spy") return a.id === b.id;
    if (a.role === "lord" || a.role === "loyalist") return b.role === "lord" || b.role === "loyalist";
    return a.role === "rebel" && b.role === "rebel";
  }

  function powerScore(player) {
    return player.hp + player.hand.length + Object.values(player.equip).filter(Boolean).length * 1.5;
  }

  function revealRole(player) {
    player.roleVisible = true;
  }

  function roleLabelForSeat(player) {
    const human = getPlayerById(state.humanPlayerId);
    if (player.role === "lord" || player.roleVisible || (human && player.id === human.id)) return ROLE_INFO[player.role].label;
    return "";
  }

  function buildPlayers() {
    const roles = shuffle(["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "spy"]);
    const allHeroes = Array.isArray(boot.heroes) ? boot.heroes : [];
    const selectedHero = allHeroes.find((hero) => hero.id === modeConfig.selectedHeroId) || shuffle(allHeroes)[0];
    const heroPool = shuffle(allHeroes.filter((hero) => hero.id !== selectedHero?.id)).slice(0, 6);
    const playerRole = roles.shift();
    const playerHero = selectedHero || heroPool.shift();
    
    // 如果有匹配的推荐用户信息，使用它
    if (boot.matchedPlayers && boot.matchedPlayers.length > 0) {
      const players = [];
      const matchedPlayers = boot.matchedPlayers;
      
      // 第一个玩家是人类玩家
      players.push(createPlayer(0, 0, playerRole, playerHero, true, boot.viewer?.name || '玩家'));
      
      const remainingSeats = [1, 2, 3, 4, 5, 6];
      const shuffledSeats = shuffle(remainingSeats);
      
      // 添加匹配的其他用户
      for (let i = 1; i < matchedPlayers.length && i < 7; i++) {
        const matchedPlayer = matchedPlayers[i];
        const hero = heroPool.length > 0 ? heroPool.shift() : shuffle(allHeroes)[0];
        const role = roles.length > 0 ? roles.shift() : 'rebel';
        const seat = shuffledSeats[i - 1] || i;
        
        players.push(createPlayer(i, seat, role, hero, matchedPlayer.isHuman || false, matchedPlayer.name || 'SecondMe用户'));
      }
      
      // 如果人数不足7人，生成AI玩家
      while (players.length < 7 && heroPool.length > 0) {
        const hero = heroPool.shift();
        const role = roles.length > 0 ? roles.shift() : 'rebel';
        const seatIdx = players.length - 1;
        const seat = shuffledSeats[seatIdx] || players.length;
        players.push(createPlayer(players.length, seat, role, hero, false, 'AI玩家'));
      }
      
      return players.sort((a, b) => a.seat - b.seat);
    }
    
    // 原来的逻辑：生成AI玩家
    const players = [
      createPlayer(0, 0, playerRole, playerHero, true, boot.viewer?.name || '玩家'),
    ];

    const remainingSeats = [1, 2, 3, 4, 5, 6];
    const remainingHeroes = [...heroPool];
    const remainingRoles = [...roles];

    if (playerRole !== "lord") {
      const lordIndex = remainingRoles.indexOf("lord");
      const lordRole = remainingRoles.splice(lordIndex, 1)[0];
      const lordHero = remainingHeroes.splice(0, 1)[0];
      players.push(createPlayer(1, 4, lordRole, lordHero, false, 'AI玩家'));
      const shuffledSeats = shuffle([1, 2, 3, 5, 6]);
      remainingRoles.forEach((role, idx) => {
        players.push(createPlayer(idx + 2, shuffledSeats[idx], role, remainingHeroes[idx], false, 'AI玩家'));
      });
    } else {
      const shuffledSeats = shuffle(remainingSeats);
      remainingRoles.forEach((role, idx) => {
        players.push(createPlayer(idx + 1, shuffledSeats[idx], role, remainingHeroes[idx], false, 'AI玩家'));
      });
    }

    return players.sort((a, b) => a.seat - b.seat);
  }

  function createPlayer(id, seat, role, hero, isHuman, name) {
    const maxHp = hero.hp + (role === "lord" ? 1 : 0);
    return {
      id,
      seat,
      role,
      roleVisible: role === "lord",
      isHuman,
      dead: false,
      name,
      hero,
      faction: hero.faction,
      maxHp,
      hp: maxHp,
      hand: [],
      equip: { weapon: null, armor: null, plusHorse: null, minusHorse: null, relic: null },
      judging: [],
      turnFlags: {
        skipPlay: false,
        attackBonus: 0,
        unlimitedRange: false,
        berserkUsed: false,
      },
      tendency: 0,
    };
  }

  function drawCards(player, count) {
    for (let i = 0; i < count; i += 1) {
      if (state.drawPile.length === 0) {
        state.drawPile = shuffle(state.discardPile);
        state.discardPile = [];
      }
      const card = state.drawPile.shift();
      if (card) player.hand.push(card);
    }
  }

  function addLog(text, accent) {
    state.logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      turn: state.turn,
      text,
      accent: accent || "neutral",
    });
    state.logs = state.logs.slice(0, 80);
    renderLog();
  }

  function setBanner(text) {
    state.banner = text;
    refs.banner.textContent = text;
  }

  function cardByUid(player, uid) {
    return player.hand.find((card) => card.uid === uid);
  }

  function removeHandCard(player, uid) {
    const index = player.hand.findIndex((card) => card.uid === uid);
    if (index === -1) return null;
    const [card] = player.hand.splice(index, 1);
    return card;
  }

  function pushDiscard(card) {
    if (card) state.discardPile.push(card);
  }

  function equipCard(player, card) {
    const slot = EQUIP_SLOT[card.name];
    if (!slot) return false;
    const old = player.equip[slot];
    if (old) pushDiscard(old);
    player.equip[slot] = card;
    addLog(`${player.hero.name} 装备了【${card.name}】。`);
    setBanner(`${player.hero.name} 装备 ${card.name}`);
    return true;
  }

  function attackRange(player) {
    if (player.turnFlags.unlimitedRange) return 99;
    if (player.equip.minusHorse && player.equip.minusHorse.name === "神驹·芬里尔") return 99;
    let range = 1;
    if (player.equip.weapon && player.equip.weapon.name === "永恒之枪") range = 3;
    if (player.equip.weapon && (player.equip.weapon.name === "雷神之锤" || player.equip.weapon.name === "审判之刃")) range = 2;
    if (player.equip.minusHorse && player.equip.minusHorse.name === "神驹·日车") range += 1;
    return range;
  }

  function seatDistance(a, b) {
    const raw = Math.abs(a.seat - b.seat);
    let distance = Math.min(raw, 7 - raw);
    if (b.equip.plusHorse && b.equip.plusHorse.name === "神驹·斯莱普尼尔") distance += 1;
    if (b.equip.armor && b.equip.armor.name === "冥河渡船") distance += 1;
    if (a.equip.minusHorse && a.equip.minusHorse.name === "神驹·日车") distance -= 1;
    return Math.max(1, distance);
  }

  function inAttackRange(actor, target) {
    return attackRange(actor) >= seatDistance(actor, target);
  }

  function validTargetsForCard(actor, card) {
    const others = livePlayers().filter((player) => player.id !== actor.id);
    if (card.name === "神击" || card.name === "雷霆之怒") {
      return others.filter((target) => inAttackRange(actor, target)).map((p) => p.id);
    }
    if (card.name === "灵药") {
      return livePlayers().filter((target) => target.hp < target.maxHp).map((p) => p.id);
    }
    if (SINGLE_TARGET.has(card.name)) {
      return others.map((p) => p.id);
    }
    return [];
  }

  function nextLivingSeat(fromSeat) {
    for (let i = 1; i <= 7; i += 1) {
      const seat = (fromSeat + i) % 7;
      const target = state.players.find((player) => player.seat === seat);
      if (target && !target.dead) return target;
    }
    return null;
  }

  function revealJudgmentCard() {
    if (state.drawPile.length === 0) {
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
    }
    const card = state.drawPile.shift();
    if (card) pushDiscard(card);
    return card;
  }

  function cardSummary(card) {
    return `${card.suitLabel}${card.rank} ${card.name}`;
  }

  function tendencyHint(player) {
    const human = getPlayerById(state.humanPlayerId);
    if (player.roleVisible || (human && player.id === human.id)) return "身份明确";
    if (player.tendency <= -3) return "反贼倾向";
    if (player.tendency >= 3) return "忠臣倾向";
    return "倾向?";
  }

  function updateTendency(actor, action, target) {
    if (!actor || !target) return;
    if (action === "attack" && target.role === "lord") actor.tendency -= 2;
    if (action === "protect" && target.role === "lord") actor.tendency += 2;
    if (action === "heal" && target.role === "lord") actor.tendency += 2;
    if (action === "attack" && target.role === "rebel") actor.tendency += 1;
  }

  function drawByTianming(actor, target) {
    if (actor.faction === target.faction && actor.id !== target.id) {
      drawCards(target, 1);
      addLog(`${target.hero.name} 触发【天命】，摸了 1 张牌。`, "sky");
    }
  }

  function maybeUseGrace(target, attacker) {
    const helpers = livePlayers().filter((player) => player.hand.some((card) => card.name === "神之恩典"));
    const candidate = helpers.find((player) => player.id === target.id)
      || helpers.find((player) => isSameCamp(player, target))
      || null;
    if (!candidate) return false;
    const grace = candidate.hand.find((card) => card.name === "神之恩典");
    removeHandCard(candidate, grace.uid);
    pushDiscard(grace);
    drawCards(target, 1);
    addLog(`${candidate.hero.name} 对 ${target.hero.name} 使用【神之恩典】，抵消了本次效果。`, "bless");
    updateTendency(candidate, "protect", target);
    return true;
  }

  function maybeRespondShield(target, requiredCount, attacker, unstoppable) {
    if (unstoppable) {
      if (target.hand.length >= 2) {
        const lost = target.hand.splice(0, 2);
        lost.forEach(pushDiscard);
        addLog(`${target.hero.name} 因【雷神之锤】弃置 2 张手牌，化解了攻击。`, "defense");
        return true;
      }
      return false;
    }
    const shields = target.hand.filter((card) => card.name === "神盾").slice(0, requiredCount);
    if (shields.length === requiredCount) {
      shields.forEach((card) => {
        removeHandCard(target, card.uid);
        pushDiscard(card);
      });
      addLog(`${target.hero.name} 打出了 ${requiredCount} 张【神盾】。`, "defense");
      return true;
    }
    return false;
  }

  function tryFateSpindle(target) {
    if (!target.equip.relic || target.equip.relic.name !== "圣物·命运纺锤") return false;
    const judgeCard = revealJudgmentCard();
    if (!judgeCard) return false;
    addLog(`${target.hero.name} 触发【圣物·命运纺锤】判定：${cardSummary(judgeCard)}。`);
    if (judgeCard.color === "red") {
      addLog(`${target.hero.name} 成功防止了这次伤害。`, "bless");
      return true;
    }
    return false;
  }

  function applyHpLoss(target, value, label) {
    target.hp -= value;
    addLog(`${target.hero.name} ${label} ${value} 点体力。`, "hurt");
    if (target.hp <= 0) {
      handleDying(target, null);
    }
  }

  function tryRescue(victim) {
    const selfPotion = victim.hand.find((card) => card.name === "灵药");
    if (selfPotion) {
      removeHandCard(victim, selfPotion.uid);
      pushDiscard(selfPotion);
      victim.hp = 1;
      addLog(`${victim.hero.name} 使用【灵药】脱离濒死。`, "heal");
      return true;
    }
    const saviors = livePlayers().filter((player) => player.id !== victim.id && player.hand.some((card) => card.name === "灵药"));
    const savior = saviors.find((player) => victim.role === "lord" && (player.role === "lord" || player.role === "loyalist"));
    if (savior) {
      const potion = savior.hand.find((card) => card.name === "灵药");
      removeHandCard(savior, potion.uid);
      pushDiscard(potion);
      victim.hp = 1;
      addLog(`${savior.hero.name} 用【灵药】救下了 ${victim.hero.name}。`, "heal");
      updateTendency(savior, "heal", victim);
      return true;
    }
    if (victim.faction === "吠陀") {
      const judgeCard = revealJudgmentCard();
      if (judgeCard) {
        addLog(`${victim.hero.name} 触发【轮回】判定：${cardSummary(judgeCard)}。`, "fate");
        if (judgeCard.color === "red") {
          victim.hp = 1;
          addLog(`${victim.hero.name} 轮回成功，回复至 1 点体力。`, "heal");
          return true;
        }
      }
    }
    return false;
  }

  function clearPlayerAssets(player) {
    while (player.hand.length) pushDiscard(player.hand.pop());
    Object.keys(player.equip).forEach((key) => {
      if (player.equip[key]) {
        pushDiscard(player.equip[key]);
        player.equip[key] = null;
      }
    });
    while (player.judging.length) pushDiscard(player.judging.pop());
  }

  function checkVictory() {
    const lord = state.players.find((player) => player.role === "lord");
    const alive = livePlayers();
    const aliveRebels = alive.filter((player) => player.role === "rebel");
    const aliveSpy = alive.find((player) => player.role === "spy");
    if (!lord || lord.dead) {
      if (alive.length === 1 && alive[0].role === "spy") {
        state.gameOver = { camp: "堕神", text: "堕神完成清场并弑主，独自取胜。" };
      } else {
        state.gameOver = { camp: "逆神", text: "主神陨落，逆神阵营胜利。" };
      }
      return true;
    }
    if (aliveRebels.length === 0 && !aliveSpy) {
      state.gameOver = { camp: "主神 / 护法", text: "所有逆神与堕神已被肃清，主神阵营胜利。" };
      return true;
    }
    return false;
  }

  function handleDeath(victim, killer) {
    victim.dead = true;
    revealRole(victim);
    clearPlayerAssets(victim);
    addLog(`${victim.hero.name} 陨落，身份公开为【${ROLE_INFO[victim.role].label}】。`, "death");
    if (killer) {
      if (victim.role === "rebel") {
        drawCards(killer, 3);
        addLog(`${killer.hero.name} 击杀逆神，按规则摸了 3 张牌。`, "reward");
      }
      if (killer.role === "lord" && victim.role === "loyalist") {
        clearPlayerAssets(killer);
        addLog(`${killer.hero.name} 误杀护法，按规则弃置所有手牌与装备。`, "punish");
      }
    }
    checkVictory();
  }

  function handleDying(victim, killer) {
    if (victim.dead) return;
    if (tryRescue(victim)) return;
    handleDeath(victim, killer);
  }

  function applyDamage(actor, target, baseDamage, cardName) {
    if (tryFateSpindle(target)) return;
    if (target.equip.armor && target.equip.armor.name === "世界树之佑") {
      addLog(`${target.hero.name} 触发【世界树之佑】，将伤害改为失去 1 点体力。`, "fate");
      applyHpLoss(target, 1, "失去");
      return;
    }

    let damage = baseDamage + actor.turnFlags.attackBonus;
    if (actor.equip.weapon && actor.equip.weapon.name === "永恒之枪" && cardName === "神击") damage += 1;
    if (actor.equip.weapon && actor.equip.weapon.name === "审判之刃" && target.hp <= actor.hp && cardName === "神击") damage += 1;
    target.hp -= damage;
    addLog(`${actor.hero.name} 对 ${target.hero.name} 造成 ${damage} 点伤害。`, "hurt");
    if (actor.equip.weapon && actor.equip.weapon.name === "永恒之枪" && cardName === "神击") {
      drawCards(actor, 1);
      addLog(`${actor.hero.name} 触发【永恒之枪】摸了 1 张牌。`, "reward");
    }
    if (target.hp <= 0) {
      handleDying(target, actor);
    }
  }

  function triggerTargetEffects(actor, target, cardName) {
    drawByTianming(actor, target);
    if (target.equip.armor && target.equip.armor.name === "神盾·埃吉斯" && cardName === "神击") {
      drawCards(target, 1);
      addLog(`${target.hero.name} 触发【神盾·埃吉斯】，摸了 1 张牌。`, "defense");
    }
  }

  function resolveAttack(actor, target, options) {
    const requiredShields = options.requiredShields || 1;
    const unstoppable = options.unstoppable || false;
    triggerTargetEffects(actor, target, options.cardName);
    if (maybeUseGrace(target, actor)) return;
    const defended = maybeRespondShield(target, requiredShields, actor, unstoppable);
    if (defended) return;
    applyDamage(actor, target, options.damage || 1, options.cardName);
  }

  async function playCardVoice(cardName) {
    try {
      const response = await fetch(`/card-voices/${encodeURIComponent(cardName)}.json`);
      if (!response.ok) return;
      const voiceLines = await response.json();
      if (Array.isArray(voiceLines) && voiceLines.length > 0) {
        const randomLine = voiceLines[Math.floor(Math.random() * voiceLines.length)];
        // 创建语音合成
        const utterance = new SpeechSynthesisUtterance(randomLine);
        utterance.lang = 'zh-CN';
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('播放卡牌语音失败:', error);
    }
  }

  function useCard(actor, card, targetIds) {
    const consume = removeHandCard(actor, card.uid);
    if (!consume) return false;

    // 播放卡牌出场语音
    playCardVoice(card.name);

    // 刷新出牌时间限制
    if (actor.isHuman) {
      refreshTurnTimer();
    }

    const target = targetIds && targetIds.length ? getPlayerById(targetIds[0]) : null;
    const allTargets = (targetIds || []).map((id) => getPlayerById(id)).filter(Boolean);
    let toDiscard = true;

    switch (card.name) {
      case "神击": {
        if (!target) return false;
        addLog(`${actor.hero.name} 对 ${target.hero.name} 使用【神击】。`, "attack");
        setBanner(`${actor.hero.name} 发动 神击`);
        updateTendency(actor, "attack", target);
        const unstoppable = actor.equip.weapon && actor.equip.weapon.name === "雷神之锤";
        resolveAttack(actor, target, { cardName: "神击", unstoppable });
        break;
      }
      case "灵药": {
        const healTarget = target || actor;
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + 1);
        addLog(`${actor.hero.name} 对 ${healTarget.hero.name} 使用【灵药】。`, "heal");
        if (healTarget.role === "lord") updateTendency(actor, "heal", healTarget);
        break;
      }
      case "神迹": {
        if (target) {
          addLog(`${actor.hero.name} 以【神迹】令 ${target.hero.name} 失去 1 点体力。`, "fate");
          applyHpLoss(target, 1, "失去");
          updateTendency(actor, "attack", target);
        } else {
          drawCards(actor, 2);
          addLog(`${actor.hero.name} 使用【神迹】摸了 2 张牌。`, "fate");
        }
        break;
      }
      case "天罚": {
        if (!target) return false;
        const shouldDiscard = target.hand.length > 3 && target.hp > 2;
        addLog(`${actor.hero.name} 对 ${target.hero.name} 施放【天罚】。`, "attack");
        updateTendency(actor, "attack", target);
        if (shouldDiscard) {
          while (target.hand.length) pushDiscard(target.hand.pop());
          addLog(`${target.hero.name} 选择弃置所有手牌以躲避天罚。`, "fate");
        } else {
          applyDamage(actor, target, 2, "天罚");
        }
        break;
      }
      case "神谕": {
        if (!target) return false;
        if (target.hand.length) {
          const stolen = target.hand.shift();
          actor.hand.push(stolen);
          addLog(`${actor.hero.name} 通过【神谕】获得了 ${target.hero.name} 的一张手牌。`, "fate");
        } else {
          drawCards(target, 1);
          addLog(`${actor.hero.name} 通过【神谕】令 ${target.hero.name} 摸了 1 张牌。`, "fate");
        }
        break;
      }
      case "混沌漩涡": {
        const candidates = livePlayers().filter((player) => player.id !== actor.id).sort((a, b) => b.hand.length - a.hand.length).slice(0, 2);
        if (candidates.length === 2) {
          const [a, b] = candidates;
          const tempHand = a.hand;
          const tempEquip = a.equip;
          const tempJudging = a.judging;
          a.hand = b.hand;
          a.equip = b.equip;
          a.judging = b.judging;
          b.hand = tempHand;
          b.equip = tempEquip;
          b.judging = tempJudging;
          addLog(`${actor.hero.name} 使用【混沌漩涡】，交换了 ${a.hero.name} 与 ${b.hero.name} 的区域。`, "fate");
        }
        break;
      }
      case "诸神黄昏": {
        actor.hp -= 1;
        addLog(`${actor.hero.name} 发动【诸神黄昏】，先失去 1 点体力。`, "fate");
        if (actor.hp <= 0) handleDying(actor, null);
        livePlayers().filter((player) => player.id !== actor.id).forEach((enemy) => applyDamage(actor, enemy, 1, "诸神黄昏"));
        break;
      }
      case "命运纺锤": {
        if (!target) return false;
        const judge = revealJudgmentCard();
        if (judge) {
          addLog(`${target.hero.name} 受到【命运纺锤】判定：${cardSummary(judge)}。`, "fate");
          if (judge.color === "red" && target.hand.length) {
            actor.hand.push(target.hand.shift());
            addLog(`${actor.hero.name} 获得了 ${target.hero.name} 的一张牌。`, "reward");
          } else {
            drawCards(target, 2);
            addLog(`${target.hero.name} 摸了 2 张牌。`, "reward");
          }
        }
        break;
      }
      case "智慧之泉": {
        actor.hp -= 1;
        drawCards(actor, 3);
        addLog(`${actor.hero.name} 以 1 点体力换取【智慧之泉】的 3 张牌。`, "fate");
        if (actor.hp <= 0) handleDying(actor, null);
        break;
      }
      case "冥河契约": {
        const reclaimed = state.discardPile.splice(0, 3);
        actor.hand.push(...reclaimed);
        addLog(`${actor.hero.name} 通过【冥河契约】从弃牌堆回收了 ${reclaimed.length} 张牌。`, "fate");
        break;
      }
      case "雷霆之怒": {
        if (!target) return false;
        addLog(`${actor.hero.name} 对 ${target.hero.name} 使用【雷霆之怒】。`, "attack");
        updateTendency(actor, "attack", target);
        resolveAttack(actor, target, { cardName: "雷霆之怒", requiredShields: 2, damage: 1 });
        break;
      }
      case "丰饶之角": {
        actor.hp = Math.min(actor.maxHp, actor.hp + 1);
        drawCards(actor, 1);
        addLog(`${actor.hero.name} 使用【丰饶之角】恢复 1 点体力并摸 1 张牌。`, "heal");
        break;
      }
      case "潘多拉魔盒":
      case "斯芬克斯之谜":
      case "世界树之缚": {
        if (!target) return false;
        target.judging.push(consume);
        addLog(`${actor.hero.name} 将【${card.name}】置入 ${target.hero.name} 的判定区。`, "fate");
        toDiscard = false;
        break;
      }
      default: {
        if (EQUIP_SLOT[card.name]) {
          equipCard(actor, consume);
          toDiscard = false;
        }
      }
    }

    if (toDiscard) pushDiscard(consume);
    renderAll();
    return true;
  }

  function choosePriorityTarget(actor) {
    const others = livePlayers().filter((player) => player.id !== actor.id);
    if (!others.length) return null;
    if (actor.role === "rebel") {
      return others
        .sort((a, b) => {
          const aScore = (a.role === "lord" ? -100 : 0) + (a.role === "loyalist" ? -50 : 0) + seatDistance(actor, a);
          const bScore = (b.role === "lord" ? -100 : 0) + (b.role === "loyalist" ? -50 : 0) + seatDistance(actor, b);
          return aScore - bScore;
        })[0];
    }
    if (actor.role === "spy") {
      if (others.length === 1 && others[0].role === "lord") return others[0];
      return others
        .filter((player) => player.role !== "spy" && player.role !== "lord")
        .sort((a, b) => powerScore(b) - powerScore(a))[0]
        || others.filter((player) => player.role === "lord")[0]
        || others[0];
    }
    return others
      .sort((a, b) => {
        const aScore = (a.tendency <= -2 ? -100 : 0) + (a.role === "rebel" ? -90 : 0) + (a.role === "spy" ? -60 : 0) + seatDistance(actor, a);
        const bScore = (b.tendency <= -2 ? -100 : 0) + (b.role === "rebel" ? -90 : 0) + (b.role === "spy" ? -60 : 0) + seatDistance(actor, b);
        return aScore - bScore;
      })[0];
  }

  function tryEquipFromHand(actor) {
    const card = actor.hand.find((item) => EQUIP_SLOT[item.name] && !actor.equip[EQUIP_SLOT[item.name]]);
    if (!card) return false;
    useCard(actor, card, []);
    return true;
  }

  function tryHealFromHand(actor) {
    const card = actor.hand.find((item) => item.name === "灵药");
    if (!card || actor.hp >= actor.maxHp) return false;
    useCard(actor, card, [actor.id]);
    return true;
  }

  function tryDelayedFromHand(actor, target) {
    const card = actor.hand.find((item) => ACTIONABLE_DELAYED.has(item.name));
    if (!card || !target) return false;
    useCard(actor, card, [target.id]);
    return true;
  }

  function tryTrickFromHand(actor, target) {
    const order = ["天罚", "雷霆之怒", "命运纺锤", "神谕", "神迹", "智慧之泉", "冥河契约", "丰饶之角", "诸神黄昏", "混沌漩涡"];
    const card = order.map((name) => actor.hand.find((item) => item.name === name)).find(Boolean);
    if (!card) return false;
    if (card.name === "神迹") {
      return useCard(actor, card, target ? [target.id] : []);
    }
    if (SINGLE_TARGET.has(card.name)) {
      if (!target) return false;
      return useCard(actor, card, [target.id]);
    }
    return useCard(actor, card, []);
  }

  function tryAttackFromHand(actor, target) {
    const card = actor.hand.find((item) => item.name === "神击");
    if (!card || !target || !inAttackRange(actor, target)) return false;
    return useCard(actor, card, [target.id]);
  }

  async function runAiPlayPhase(actor) {
    if (actor.faction === "阿斯加德" && !actor.turnFlags.berserkUsed && actor.hp > 1 && actor.hand.some((card) => card.name === "神击")) {
      actor.hp -= 1;
      actor.turnFlags.attackBonus += 1;
      actor.turnFlags.berserkUsed = true;
      addLog(`${actor.hero.name} 发动【狂战】，本回合【神击】伤害 +1。`, "fate");
      renderAll();
      await wait(1000);
    }

    const maxLoops = 5;
    let loops = 0;

    while (!state.gameOver && loops < maxLoops) {
      loops += 1;
      
      if (actor.hand.length === 0) {
        addLog(`${actor.hero.name} 没有手牌，跳过出牌。`, "think");
        break;
      }

      setBanner(`${actor.hero.name} 正在思考第 ${loops} 步...`);
      addLog(`${actor.hero.name} 正在思考出牌策略...`, "think");

      try {
        const gameStateNow = buildGameStateForAI(actor);
        const resp = await fetch("/api/secondme/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameState: gameStateNow,
            action: "play",
            actorId: actor.id,
            actorName: actor.hero.name,
            handCards: actor.hand.map(c => c.name),
          }),
        });
        const json = await resp.json();
        
        let played = false;
        
        if (json.ok && json.decision) {
          const decision = json.decision;
          addLog(`SecondMe 思考：${decision.thinking || '无'}`, "think");
          addLog(`SecondMe 决策：${decision.action} - ${decision.cardName || '无'} ${decision.targetId ? '目标:'+decision.targetId : ''} 原因：${decision.reason || '无'}`, "think");
          
          if (decision.action === "pass" || !decision.cardName) {
            addLog(`${actor.hero.name} 决定不出牌。`, "think");
            break;
          }
          
          played = await executeSecondMeDecision(actor, decision);
        } else if (json.ok && json.think) {
          addLog(`SecondMe 思考结果：${json.think}`, "think");
          const target = choosePriorityTarget(actor);
          played = tryHealFromHand(actor) || tryEquipFromHand(actor) || tryDelayedFromHand(actor, target) || tryTrickFromHand(actor, target) || tryAttackFromHand(actor, target);
        }
        
        await wait(1500);
        
        if (!played) {
          const target = choosePriorityTarget(actor);
          played = tryHealFromHand(actor) || tryEquipFromHand(actor) || tryDelayedFromHand(actor, target) || tryTrickFromHand(actor, target) || tryAttackFromHand(actor, target);
        }
        
        if (!played) {
          addLog(`${actor.hero.name} 没有可出的牌。`, "think");
          break;
        }

        // AI聊天功能
        if (Math.random() < 0.3) { // 30%的概率发送聊天消息
          await sendAIChatMessage(actor);
        }

        renderAll();
        await wait(1200);
      } catch (error) {
        console.error("SecondMe 思考失败，使用备用逻辑:", error);
        const target = choosePriorityTarget(actor);
        const played = tryHealFromHand(actor) || tryEquipFromHand(actor) || tryDelayedFromHand(actor, target) || tryTrickFromHand(actor, target) || tryAttackFromHand(actor, target);
        if (!played) break;
        renderAll();
        await wait(1200);
      }
    }
  }

  async function executeSecondMeDecision(actor, decision) {
    if (!decision.cardName) return false;
    
    const card = actor.hand.find(c => c.name === decision.cardName);
    if (!card) {
      addLog(`${actor.hero.name} 手牌中没有 ${decision.cardName}，无法执行决策。`, "think");
      return false;
    }
    
    let target = null;
    if (decision.targetId) {
      target = getPlayerById(decision.targetId);
      if (!target) {
        addLog(`${actor.hero.name} 找不到目标玩家 ${decision.targetId}，无法执行决策。`, "think");
        return false;
      }
    }
    
    const SINGLE_TARGET_CARDS = new Set(["神击", "灵药", "天罚", "神谕", "命运纺锤", "雷霆之怒", "潘多拉魔盒", "斯芬克斯之谜", "世界树之缚"]);
    const EQUIP_CARDS = Object.keys(EQUIP_SLOT);
    
    if (SINGLE_TARGET_CARDS.has(card.name) && target) {
      const result = useCard(actor, card, [target.id]);
      if (result) {
        addLog(`${actor.hero.name} 使用【${card.name}】对 ${target.hero.name}，原因：${decision.reason || ''}`, "think");
      }
      return result;
    } else if (EQUIP_CARDS.includes(card.name)) {
      const result = useCard(actor, card, []);
      if (result) {
        addLog(`${actor.hero.name} 使用【${card.name}】装备，原因：${decision.reason || ''}`, "think");
      }
      return result;
    } else {
      const result = useCard(actor, card, target ? [target.id] : []);
      if (result) {
        addLog(`${actor.hero.name} 使用【${card.name}】，原因：${decision.reason || ''}`, "think");
      }
      return result;
    }
  }

  function buildGameStateForAI(actor) {
    return {
      turn: state.turn,
      phase: state.currentPhase,
      actor: {
        id: actor.id,
        name: actor.hero.name,
        faction: actor.faction,
        hp: actor.hp,
        maxHp: actor.maxHp,
        hand: actor.hand.map(c => ({
          name: c.name,
          type: c.type,
          suit: c.suit,
          description: c.description,
        })),
        equip: {
          weapon: actor.equip.weapon?.name || null,
          armor: actor.equip.armor?.name || null,
          plusHorse: actor.equip.plusHorse?.name || null,
          minusHorse: actor.equip.minusHorse?.name || null,
          relic: actor.equip.relic?.name || null,
        },
        judging: actor.judging.map(c => c.name),
        turnFlags: actor.turnFlags,
      },
      players: state.players.filter(p => !p.dead).map(p => ({
        id: p.id,
        name: p.hero.name,
        faction: p.faction,
        hp: p.hp,
        maxHp: p.maxHp,
        isHuman: p.isHuman,
        role: p.role,
        distance: Math.abs(p.seat - actor.seat) <= 3 ? Math.abs(p.seat - actor.seat) : 6 - Math.abs(p.seat - actor.seat),
      })),
      drawPileCount: state.drawPile.length,
      discardPileCount: state.discardPile.length,
    };
  }

  function handLimit(player) {
    let limit = player.hp;
    if (player.faction === "奥林匹斯") limit += 1;
    return Math.max(limit, 0);
  }

  function discardExcess(player) {
    const limit = handLimit(player);
    if (player.hand.length <= limit) return;
    while (player.hand.length > limit) {
      pushDiscard(player.hand.pop());
    }
    addLog(`${player.hero.name} 在弃牌阶段弃至 ${limit} 张手牌。`, "fate");
  }

  function runPreparePhase(player) {
    player.turnFlags = {
      skipPlay: false,
      attackBonus: 0,
      unlimitedRange: false,
      berserkUsed: false,
    };
    if (player.faction === "凯美特" && player.hp < player.maxHp) {
      player.hp += 1;
      addLog(`${player.hero.name} 触发【永生】，回复 1 点体力。`, "heal");
    }
    if (player.equip.relic && player.equip.relic.name === "圣物·智慧之泉" && state.drawPile.length >= 3) {
      const preview = state.drawPile.slice(0, 3).sort((a, b) => {
        const weight = (card) => {
          if (card.name === "灵药") return 3;
          if (card.name === "神击") return 2;
          return 1;
        };
        return weight(b) - weight(a);
      });
      state.drawPile.splice(0, 3, ...preview);
      addLog(`${player.hero.name} 通过【圣物·智慧之泉】调整了牌堆顶顺序。`, "fate");
    }
  }

  function runJudgePhase(player) {
    const pending = [...player.judging];
    player.judging = [];
    pending.forEach((card) => {
      const judge = revealJudgmentCard();
      if (!judge) return;
      addLog(`${player.hero.name} 的【${card.name}】判定结果：${cardSummary(judge)}。`, "judge");
      if (card.name === "潘多拉魔盒" && judge.suit !== "heart") {
        applyDamage(player, player, 2, "潘多拉魔盒");
      }
      if (card.name === "斯芬克斯之谜" && judge.suit !== "diamond") {
        player.turnFlags.skipPlay = true;
        addLog(`${player.hero.name} 本回合跳过出牌阶段。`, "judge");
      }
      if (card.name === "世界树之缚" && judge.suit !== "spade") {
        player.turnFlags.unlimitedRange = true;
        player.turnFlags.attackBonus += 1;
        addLog(`${player.hero.name} 获得【世界树之缚】增幅：攻击无视距离且伤害 +1。`, "judge");
      }
      pushDiscard(card);
    });
  }

  function runDrawPhase(player) {
    drawCards(player, modeConfig.drawPhaseCount);
    addLog(`${player.hero.name} 在摸牌阶段摸了 ${modeConfig.drawPhaseCount} 张牌。`, "draw");
  }

  function runEndPhase(player) {
    if (player.equip.relic && player.equip.relic.name === "圣物·丰饶之角") {
      drawCards(player, 1);
      addLog(`${player.hero.name} 触发【圣物·丰饶之角】，摸了 1 张牌。`, "draw");
    }
  }

  async function executeTurn(player) {
    if (player.dead || state.gameOver) return;
    state.currentPlayerId = player.id;
    for (const phase of PHASES) {
      if (state.gameOver || player.dead) break;
      state.currentPhase = phase.key;
      renderAll();
      setBanner(`${player.hero.name} 的 ${phase.label}阶段`);
      await wait(player.isHuman ? 120 : 800);

      if (phase.key === "prepare") runPreparePhase(player);
      if (phase.key === "judge") runJudgePhase(player);
      if (phase.key === "draw") runDrawPhase(player);
      if (phase.key === "play") {
        if (player.turnFlags.skipPlay) {
          addLog(`${player.hero.name} 被效果限制，跳过出牌阶段。`, "judge");
        } else if (player.isHuman && !player.dead) {
          await enterHumanTurn(player);
        } else {
          // 增加AI思考时间，符合人类反应速度
          setBanner(`${player.hero.name} 正在思考...`);
          await wait(1200);
          await runAiPlayPhase(player);
        }
      }
      if (phase.key === "discard") discardExcess(player);
      if (phase.key === "end") runEndPhase(player);
      if (checkVictory()) break;
      renderAll();
    }
  }

  function describeCardUsage(card) {
    if (card.name === "神击") return "选择攻击范围内的一名目标。";
    if (card.name === "灵药") return "选择一名已受伤角色回复体力。";
    if (card.name === "神迹") return "点击敌人可令其失去体力，再点一次本牌可直接摸 2。";
    if (SINGLE_TARGET.has(card.name)) return "选择一名目标进行结算。";
    if (EQUIP_SLOT[card.name]) return "再次点击可直接装备。";
    if (REACTION_ONLY.has(card.name)) return "该牌会在响应时自动触发。";
    return "再次点击可立即使用。";
  }

  function refreshTurnTimer() {
    if (state.turnTimer) {
      clearInterval(state.turnTimer);
    }
    state.timeLeft = 20;
    refreshTurnTimerUI();
    
    state.turnTimer = setInterval(() => {
      state.timeLeft--;
      refreshTurnTimerUI();
      if (state.timeLeft < 0) {
        clearInterval(state.turnTimer);
        if (state.waitingForHuman) {
          addLog("出牌时间结束，自动结束回合。", "time");
          endHumanTurn();
        }
      }
    }, 1000);
  }

  function refreshTurnTimerUI() {
    const timerEl = document.getElementById("qbTurnTimer");
    if (timerEl && state.waitingForHuman && state.timeLeft > 0) {
      timerEl.textContent = state.timeLeft;
      timerEl.style.display = "block";
    } else if (timerEl) {
      timerEl.style.display = "none";
    }
  }

  function enterHumanTurn(player) {
    state.waitingForHuman = true;
    state.selectedCardUid = null;
    
    // 添加20秒出牌时间限制
    refreshTurnTimer();
    
    renderHand();
    return new Promise((resolve) => {
      state.humanTurnResolver = () => {
        if (state.turnTimer) {
          clearInterval(state.turnTimer);
        }
        resolve();
      };
    });
  }

  function endHumanTurn() {
    if (!state.waitingForHuman || !state.humanTurnResolver) return;
    state.waitingForHuman = false;
    state.selectedCardUid = null;
    const resolver = state.humanTurnResolver;
    state.humanTurnResolver = null;
    refs.hint.textContent = "结算中...";
    renderAll();
    resolver();
  }

  function selectedCard() {
    const player = getPlayerById(state.humanPlayerId);
    return player ? cardByUid(player, state.selectedCardUid) : null;
  }

  function handleHumanCardClick(uid) {
    const player = getPlayerById(state.humanPlayerId);
    const currentPlayerId = typeof state.currentPlayerId === 'string' ? parseInt(state.currentPlayerId) : state.currentPlayerId;
    const playerId = typeof player?.id === 'string' ? parseInt(player.id) : player?.id;
    console.log("点击卡牌:", uid, "waitingForHuman:", state.waitingForHuman, "currentPlayerId:", currentPlayerId, "player.id:", playerId, "currentPhase:", state.currentPhase);
    if (!state.waitingForHuman || !player || player.dead || currentPlayerId !== playerId || state.currentPhase !== "play") {
      console.log("卡牌点击被阻止: waitingForHuman=", state.waitingForHuman, "player=", !!player, "player.dead=", player?.dead, "currentPlayerId=", currentPlayerId, "player.id=", playerId, "currentPhase=", state.currentPhase);
      refs.hint.textContent = "非你的回合";
      return;
    }
    const card = cardByUid(player, uid);
    if (!card) return;
    if (REACTION_ONLY.has(card.name)) {
      refs.hint.textContent = `${card.name}响应`;
      return;
    }
    if (state.selectedCardUid === uid) {
      if (card.name === "神迹") {
        useCard(player, card, []);
        refs.hint.textContent = "摸2张牌";
        state.selectedCardUid = null;
        renderAll();
        return;
      }
      if (!SINGLE_TARGET.has(card.name) && !ACTIONABLE_DELAYED.has(card.name) && !EQUIP_SLOT[card.name]) {
        useCard(player, card, []);
        state.selectedCardUid = null;
        renderAll();
        return;
      }
    }
    state.selectedCardUid = uid;
    refs.hint.textContent = describeCardUsage(card);
    if (EQUIP_SLOT[card.name]) {
      useCard(player, card, []);
      state.selectedCardUid = null;
      renderAll();
      return;
    }
    if (!SINGLE_TARGET.has(card.name) && card.name !== "神迹") {
      useCard(player, card, []);
      state.selectedCardUid = null;
      renderAll();
      return;
    }
    renderAll();
  }

  function handleSeatClick(playerId) {
    const human = getPlayerById(state.humanPlayerId);
    if (!state.waitingForHuman || !human || human.dead) return;
    const card = selectedCard();
    if (!card) return;
    // 确保playerId类型与validTargets中的ID类型一致
    const normalizedPlayerId = typeof playerId === 'string' && !isNaN(playerId) ? Number(playerId) : playerId;
    const validTargets = validTargetsForCard(human, card);
    if (!validTargets.includes(normalizedPlayerId)) return;
    useCard(human, card, [normalizedPlayerId]);
    state.selectedCardUid = null;
    refs.hint.textContent = "请选择目标";
    renderAll();
  }

  function renderPhaseInfo() {
    const actor = getPlayerById(state.currentPlayerId);
    refs.turnSummary.textContent = `第 ${state.turn} 回合`;
    refs.actorSummary.textContent = actor ? `${actor.name || '玩家'}（${actor.hero.name}）` : "等待开局";
    refs.phaseStrip.innerHTML = PHASES.map((phase) => {
      const active = phase.key === state.currentPhase ? "active" : "";
      return `<div class="qb-phase-pill ${active}">${phase.label}</div>`;
    }).join("");
    refs.graveSummary.textContent = `牌堆 ${state.drawPile.length} · 弃牌 ${state.discardPile.length}`;
  }

  function renderArena() {
    const human = getPlayerById(state.humanPlayerId);
    const card = selectedCard();
    const validTargets = human && card ? validTargetsForCard(human, card) : [];
    refs.arena.innerHTML = state.players.map((player) => {
      const pos = SEAT_POSITIONS[player.seat];
      const classes = [
        "qb-seat",
        player.isHuman ? "self" : "",
        player.dead ? "dead" : "",
        player.id === state.currentPlayerId ? "current" : "",
        validTargets.includes(player.id) ? "targetable" : "",
        `faction-${player.faction}`,
      ].filter(Boolean).join(" ");
      const roleInfo = ROLE_INFO[player.role];
      return `
        <div class="${classes}" data-seat-id="${player.id}" style="left:${pos.left}%;top:${pos.top}%;">
          <div class="qb-seat-card">
            <div class="qb-seat-frame"></div>
            <div class="qb-seat-head">
              <img class="qb-seat-avatar" src="${player.hero.avatar}" alt="${player.hero.name}" loading="lazy" decoding="async" />
              <div>
                <div class="qb-seat-name">${player.name || '玩家'}（${player.hero.name}）</div>
                <div class="qb-seat-sub">${player.faction} · ${player.hero.title}</div>
                <div class="qb-seat-role ${player.roleVisible ? roleInfo.className : ""}">${roleLabelForSeat(player)}</div>
              </div>
            </div>
            <div class="qb-seat-stats">
              <div class="qb-seat-hp">体力 ${Math.max(player.hp, 0)}/${player.maxHp}</div>
              <div class="qb-seat-hand">手牌 ${player.hand.length}</div>
            </div>
            <div class="qb-seat-intent">${tendencyHint(player)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderHand() {
    const human = getPlayerById(state.humanPlayerId);
    if (!human || human.dead) {
      refs.handMeta.textContent = "你已阵亡，当前进入观战模式。";
      refs.handList.innerHTML = `<div class="qb-empty">观战中，等待本局结束。</div>`;
      return;
    }
    refs.handMeta.textContent = state.waitingForHuman ? "点击卡牌出牌" : "等待回合";
    refs.handList.innerHTML = human.hand.length
      ? human.hand.map((card) => {
        const selected = state.selectedCardUid === card.uid ? "selected" : "";
        const disabled = !state.waitingForHuman || REACTION_ONLY.has(card.name) ? (REACTION_ONLY.has(card.name) ? "" : "") : "";
        const suitClass = card.color === "red" ? "red" : "black";
        return `
          <div class="qb-hand-card ${selected} ${!state.waitingForHuman && !REACTION_ONLY.has(card.name) ? "disabled" : ""}" data-card-uid="${card.uid}">
            <div class="qb-card-top">
              <span class="qb-card-suit ${suitClass}">${card.suitLabel}${card.rank}</span>
              <span>${card.category}</span>
            </div>
            <div class="qb-card-name">${card.name}</div>
            <div class="qb-card-meta">${card.subType}${card.range ? ` / 范围 ${card.range}` : ""}</div>
            <div class="qb-card-meta">${card.effect}</div>
          </div>
        `;
      }).join("")
      : `<div class="qb-empty">当前没有手牌。</div>`;
  }

  function renderLog() {
    refs.logList.innerHTML = state.logs.length
      ? state.logs.map((item) => `<div class="qb-log-item"><strong>回合 ${item.turn}</strong><br/>${item.text}</div>`).join("")
      : `<div class="qb-empty">战报将在开局后出现。</div>`;
  }

  function didHumanWin() {
    const human = getPlayerById(state.humanPlayerId);
    if (!human || !state.gameOver) return false;
    if (state.gameOver.camp === "堕神") return human.role === "spy";
    if (state.gameOver.camp === "逆神") return human.role === "rebel";
    if (state.gameOver.camp === "主神 / 护法") return human.role === "lord" || human.role === "loyalist";
    return false;
  }

  function renderResultOverlay() {
    if (!refs.resultOverlay) return;
    if (!state.gameOver) {
      refs.resultOverlay.classList.remove("show");
      return;
    }
    const won = didHumanWin();
    refs.resultOverlay.classList.add("show");
    refs.resultOverlay.querySelector(".qb-result-card").classList.toggle("loss", !won);
    refs.resultKicker.textContent = "对局结束";
    refs.resultTitle.textContent = won ? "胜利" : "战败";
    refs.resultCamp.textContent = `${state.gameOver.camp}胜利`;
    if (modeConfig.rankEnabled && state.rankUpdate?.rank) {
      const sign = state.rankUpdate.delta > 0 ? "+" : "";
      refs.resultText.textContent = `${state.gameOver.text} 排位经验 ${sign}${state.rankUpdate.delta}，当前段位：${state.rankUpdate.rank.display}（${state.rankUpdate.rank.progress}/${state.rankUpdate.rank.progressMax}）。`;
    } else {
      refs.resultText.textContent = state.gameOver.text;
    }
  }

  async function submitRankedResult() {
    if (!modeConfig.rankEnabled || state.rankResultSubmitted || !state.gameOver) return;
    state.rankResultSubmitted = true;
    try {
      const response = await fetch("/api/ranked/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: didHumanWin() ? "win" : "loss" }),
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.ok) {
        state.rankUpdate = json;
      }
    } catch {
      state.rankUpdate = null;
    }
  }

  function renderAll() {
    if (state.gameOver) {
      setBanner(`对局结束：${state.gameOver.camp}胜利`);
      refs.hint.textContent = state.gameOver.text;
    }
    renderPhaseInfo();
    renderArena();
    renderHand();
    renderLog();
    renderResultOverlay();
  }

  async function saveBattleHistory() {
    if (!state.gameOver) return;
    if (state.battleHistorySaved) return;
    state.battleHistorySaved = true;
    try {
      const human = state.players.find(p => p.id === state.humanPlayerId);
      if (!human) return;
      
      const history = {
        result: didHumanWin() ? 'win' : 'lose',
        playerName: human.name || 'Player',
        playerHero: human.hero.name,
        opponentName: 'AI Opponent',
        opponentHero: 'AI Hero',
        mode: modeConfig.label,
        timestamp: Date.now()
      };
      
      const response = await fetch('/api/battle/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(history)
      });
      
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        console.error('保存战绩失败:', json?.error);
      }
    } catch (error) {
      console.error('保存战绩失败:', error);
    }
  }

  async function runBattleLoop() {
    const lord = state.players.find((player) => player.role === "lord");
    state.currentPlayerId = lord ? lord.id : 0;
    while (!state.gameOver) {
      const actor = getPlayerById(state.currentPlayerId);
      if (actor && !actor.dead) {
        await executeTurn(actor);
      }
      if (state.gameOver) break;
      const next = nextLivingSeat(actor ? actor.seat : 0);
      if (!next) break;
      if (actor && next.seat <= actor.seat) state.turn += 1;
      state.currentPlayerId = next.id;
    }
    await submitRankedResult();
    await saveBattleHistory();
    renderAll();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const cardEl = event.target.closest("[data-card-uid]");
      if (cardEl) {
        handleHumanCardClick(cardEl.dataset.cardUid);
        return;
      }
      const seatEl = event.target.closest("[data-seat-id]");
      if (seatEl) {
        handleSeatClick(seatEl.dataset.seatId);
        return;
      }
    });
    refs.endTurnBtn.addEventListener("click", () => endHumanTurn());
    refs.cancelBtn.addEventListener("click", () => {
      state.selectedCardUid = null;
      refs.hint.textContent = "已取消";
      renderAll();
    });
    refs.autoBtn.addEventListener("click", async () => {
      const human = getPlayerById(state.humanPlayerId);
      if (!human || !state.waitingForHuman || human.dead) return;
      
      // 使用 SecondMe 思考
      try {
        const gameState = {
          players: state.players.map(p => ({
            id: p.id,
            role: p.role,
            roleVisible: p.roleVisible,
            isHuman: p.isHuman,
            dead: p.dead,
            hero: p.hero,
            faction: p.faction,
            maxHp: p.maxHp,
            hp: p.hp,
            hand: p.hand.length,
            equip: Object.values(p.equip).filter(Boolean).length,
            turnFlags: p.turnFlags,
          })),
          currentPlayerId: state.currentPlayerId,
          currentPhase: state.currentPhase,
          turn: state.turn,
          humanPlayerId: state.humanPlayerId,
        };
        
        setBanner("SecondMe 正在思考...");
        const resp = await fetch("/api/secondme/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameState, action: "play" }),
        });
        const json = await resp.json();
        if (json.ok) {
          addLog(`SecondMe 思考结果：${json.think}`, "think");
        }
      } catch (error) {
        console.error("SecondMe 思考失败:", error);
      }
      
      // 执行 AI 出牌
      await runAiPlayPhase(human);
      endHumanTurn();
    });
    refs.refreshBtn.addEventListener("click", () => window.location.reload());
    
    // 聊天功能
    if (refs.chatToggle && refs.chatPanel) {
      const urlParams = new URLSearchParams(window.location.search);
      const matchId = urlParams.get('matchId');
      
      refs.chatToggle.addEventListener("click", () => {
        refs.chatPanel.style.display = refs.chatPanel.style.display === "none" ? "block" : "none";
        if (refs.chatPanel.style.display === "block") {
          loadChatMessages();
        }
      });
      
      if (refs.chatClose) {
        refs.chatClose.addEventListener("click", () => {
          refs.chatPanel.style.display = "none";
        });
      }
      
      if (refs.chatSend && refs.chatInput) {
        const sendMessage = async () => {
          const message = refs.chatInput.value.trim();
          if (!message || !matchId) return;
          
          try {
            const resp = await fetch(`/api/match/${matchId}/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message })
            });
            const json = await resp.json();
            if (json.ok) {
              refs.chatInput.value = "";
              loadChatMessages();
            }
          } catch (error) {
            console.error("发送消息失败:", error);
          }
        };
        
        refs.chatSend.addEventListener("click", sendMessage);
        refs.chatInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") sendMessage();
        });
      }
      
      async function loadChatMessages() {
        if (!matchId || !refs.chatMessages) return;
        
        try {
          const resp = await fetch(`/api/match/${matchId}/chat`);
          const json = await resp.json();
          
          if (json.ok && json.chats && json.chats.length > 0) {
            refs.chatMessages.innerHTML = json.chats.map(chat => {
              const time = new Date(chat.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              const isSelf = String(chat.playerId) === String(state.humanPlayerId);
              return '<div style="display: flex; flex-direction: column; ' + (isSelf ? 'align-items: flex-end;' : 'align-items: flex-start;') + ';"><span style="font-size: 11px; color: #64748b;">' + chat.playerName + ' ' + time + '</span><span style="max-width: 200px; padding: 6px 10px; border-radius: 8px; background: ' + (isSelf ? 'rgba(251, 191, 36, 0.2);' : 'rgba(59, 130, 246, 0.2);') + '; color: #eef6ff; font-size: 13px; word-break: break-all;">' + chat.message + '</span></div>';
            }).join('');
            refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
          }
        } catch (error) {
          console.error("加载聊天消息失败:", error);
        }
      }
      
      // 每2秒自动刷新聊天消息，确保实时通信
      if (matchId) {
        setInterval(() => {
          loadChatMessages();
        }, 2000);
      }
      
      // 页面加载时立即加载聊天消息
      loadChatMessages();
    }
    
    // AI聊天功能
    async function sendAIChatMessage(actor) {
      const urlParams = new URLSearchParams(window.location.search);
      const matchId = urlParams.get('matchId');
      if (!matchId) return;
      
      // AI聊天消息模板
      const chatMessages = [
        `哈哈，${actor.hero.name}的力量无人能敌！`,
        `你的策略太弱了，准备接受失败吧！`,
        `看我如何运用这张卡牌击败你！`,
        `我的阵营必将胜利！`,
        `你以为这样就能打败我吗？`,
        `小心了，我的回合才刚刚开始！`,
        `这张卡牌将改变战局！`,
        `你的防御不堪一击！`,
        `胜利属于我！`,
        `感受${actor.hero.name}的怒火吧！`
      ];
      
      // 随机选择一条消息
      const randomMessage = chatMessages[Math.floor(Math.random() * chatMessages.length)];
      
      try {
        // 发送消息到聊天
        const resp = await fetch(`/api/match/${matchId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: randomMessage, playerId: actor.id })
        });
        
        const json = await resp.json();
        if (json.ok) {
          // 消息发送成功，自动刷新聊天
          loadChatMessages();
        }
      } catch (error) {
        console.error("AI发送消息失败:", error);
      }
    }
    
    // 语音功能
    if (refs.voiceToggle && refs.voicePanel) {
      const urlParams = new URLSearchParams(window.location.search);
      const matchId = urlParams.get('matchId');
      
      // 语音消息存储
      const voiceMessagesData = {};
      let currentAudio = null;
      let currentAudioId = null;
      
      refs.voiceToggle.addEventListener("click", () => {
        refs.voicePanel.style.display = refs.voicePanel.style.display === "none" ? "block" : "none";
      });
      
      if (refs.voiceClose) {
        refs.voiceClose.addEventListener("click", () => {
          refs.voicePanel.style.display = "none";
        });
      }
      
      if (refs.voiceSend && refs.voiceInput) {
        const sendVoiceMessage = async () => {
          const text = refs.voiceInput.value.trim();
          if (!text || !matchId) return;
          
          try {
            // 文字转语音
            if ('speechSynthesis' in window) {
              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = 'zh-CN';
              utterance.volume = 0.8;
              speechSynthesis.speak(utterance);
            }
            
            // 发送文本消息到聊天
            const resp = await fetch(`/api/match/${matchId}/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: text })
            });
            const json = await resp.json();
            if (json.ok) {
              refs.voiceInput.value = "";
              // 生成唯一ID
              const messageId = 'voice_' + Date.now();
              // 显示语音消息
              if (refs.voiceMessages) {
                const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const human = getPlayerById(state.humanPlayerId);
                const playerName = human ? human.name : '玩家';
                
                const messageHTML = '<div class="voice-message" data-voice-id="' + messageId + '" style="display: flex; flex-direction: column; align-items: flex-end; cursor: pointer;"><span style="font-size: 11px; color: #64748b;">' + playerName + ' ' + time + '</span><span style="max-width: 200px; padding: 6px 10px; border-radius: 8px; background: rgba(251, 191, 36, 0.2); color: #eef6ff; font-size: 13px; word-break: break-all;">' + text + '</span><div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;"><span style="font-size: 10px; color: #fbbf24;">语音消息</span><span class="voice-duration" style="font-size: 10px; color: #fbbf24;">0:03</span></div></div>';
                
                if (refs.voiceMessages.innerHTML.includes('暂无语音消息')) {
                  refs.voiceMessages.innerHTML = messageHTML;
                } else {
                  refs.voiceMessages.innerHTML += messageHTML;
                }
                refs.voiceMessages.scrollTop = refs.voiceMessages.scrollHeight;
              }
              
              // 存储消息数据
              voiceMessagesData[messageId] = {
                text: text,
                timestamp: Date.now(),
                type: 'text-to-speech'
              };
            }
          } catch (error) {
            console.error("发送语音消息失败:", error);
          }
        };
        
        refs.voiceSend.addEventListener("click", sendVoiceMessage);
        refs.voiceInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") sendVoiceMessage();
        });
      }
      
      // 语音录制功能
      if (refs.voiceRecord) {
        let mediaRecorder = null;
        let audioChunks = [];
        let startTime = 0;
        
        refs.voiceRecord.addEventListener("mousedown", async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            startTime = Date.now();
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
              const duration = Math.round((Date.now() - startTime) / 1000);
              
              // 生成唯一ID
              const messageId = 'voice_' + Date.now();
              
              // 显示语音消息
              if (refs.voiceMessages) {
                const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const human = getPlayerById(state.humanPlayerId);
                const playerName = human ? human.name : '玩家';
                
                const messageHTML = '<div class="voice-message" data-voice-id="' + messageId + '" style="display: flex; flex-direction: column; align-items: flex-end; cursor: pointer;"><span style="font-size: 11px; color: #64748b;">' + playerName + ' ' + time + '</span><span style="max-width: 200px; padding: 6px 10px; border-radius: 8px; background: rgba(251, 191, 36, 0.2); color: #eef6ff; font-size: 13px; word-break: break-all;">语音消息</span><div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;"><span class="voice-status" style="font-size: 10px; color: #fbbf24;">▶</span><span style="font-size: 10px; color: #fbbf24;">语音消息</span><span class="voice-duration" style="font-size: 10px; color: #fbbf24;">0:' + (duration < 10 ? '0' + duration : duration) + '</span></div></div>';
                
                if (refs.voiceMessages.innerHTML.includes('暂无语音消息')) {
                  refs.voiceMessages.innerHTML = messageHTML;
                } else {
                  refs.voiceMessages.innerHTML += messageHTML;
                }
                refs.voiceMessages.scrollTop = refs.voiceMessages.scrollHeight;
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
            refs.voiceRecord.textContent = "录制中...";
            refs.voiceRecord.style.background = "rgba(248, 113, 113, 0.3)";
          } catch (error) {
            console.error("语音录制失败:", error);
          }
        });
        
        refs.voiceRecord.addEventListener("mouseup", () => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            // 停止所有音频轨道
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            refs.voiceRecord.textContent = "按住说话";
            refs.voiceRecord.style.background = "rgba(248, 113, 113, 0.2)";
          }
        });
        
        // 处理鼠标移出按钮的情况
        refs.voiceRecord.addEventListener("mouseleave", () => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            refs.voiceRecord.textContent = "按住说话";
            refs.voiceRecord.style.background = "rgba(248, 113, 113, 0.2)";
          }
        });
      }
      
      // 语音消息播放功能
      if (refs.voiceMessages) {
        refs.voiceMessages.addEventListener("click", function (event) {
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
    }
    
    if (refs.resultRestartBtn) {
      refs.resultRestartBtn.addEventListener("click", () => window.location.reload());
    }
  }

  async function playHeroVoice(heroName) {
    try {
      const response = await fetch(`/hero-voices/${encodeURIComponent(heroName)}.json`);
      if (!response.ok) return;
      const voiceLines = await response.json();
      if (Array.isArray(voiceLines) && voiceLines.length > 0) {
        const randomLine = voiceLines[Math.floor(Math.random() * voiceLines.length)];
        // 创建语音合成
        const utterance = new SpeechSynthesisUtterance(randomLine);
        utterance.lang = 'zh-CN';
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('播放语音失败:', error);
    }
  }

  async function initBattle() {
    state.players = buildPlayers();
    state.drawPile = buildDeck(boot.cards || []);
    state.discardPile = [];
    state.turn = 1;
    state.logs = [];
    state.banner = `${modeConfig.label}开启，主神先手。`;
    state.selectedCardUid = null;
    state.waitingForHuman = false;
    state.gameOver = null;
    state.rankResultSubmitted = false;
    state.rankUpdate = null;
    state.battleHistorySaved = false;

    state.players.forEach((player) => drawCards(player, 4));

    const human = state.players.find((player) => player.isHuman);
    state.humanPlayerId = human ? human.id : 0;
    const lord = state.players.find((player) => player.role === "lord");
    if (lord) addLog(`主神位已公开：${lord.hero.name}。`, "setup");
    if (modeConfig.rankEnabled) addLog("排位赛开启：本局结束后将结算段位经验。", "setup");
    if (modeConfig.key === "slaughter") addLog("杀戮模式生效：摸牌阶段改为 4 张。", "setup");
    addLog("战斗开始。", "setup");
    renderAll();

    // 播放人类玩家的英雄出场语音
    if (human) {
      await playHeroVoice(human.hero.name);
    }
  }

  bindEvents();
  initBattle().then(() => {
    runBattleLoop().catch((error) => {
      console.error(error);
      refs.hint.textContent = "战斗引擎发生异常，请刷新页面重试。";
    });
  });
})();
