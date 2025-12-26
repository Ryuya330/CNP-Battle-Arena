import { UIManager } from './uiManager.js';
import { AIAgent } from './aiAgent.js';
import { EffectRegistry } from './effectRegistry.js';
import { CONFIG, PHASES, CARD_TYPES } from './constants.js';

/**
 * ゲームの進行、状態、ルールを管理するコアクラス。
 */
export class GameEngine {
    constructor() {
        this.ui = new UIManager(this);
        this.ai = new AIAgent(this);
        this.effectRegistry = new EffectRegistry(this);
        this.state = null;
        this.isProcessing = true;
        this.actionPromise = null;
    }

    /**
     * ゲームの初期化と開始。
     */
    async start() {
        this.ui.showSplashScreen();
    }

    /**
     * ゲームセッションを初期化する。
     * @param {string} gameMode - 'PvE' または 'EvE'
     * @param {string[]} playerNames - プレイヤー名の配列
     */
    async initGame(gameMode, playerNames) {
        try {
            const allCards = await this.loadCardData();
            this.state = this.createInitialGameState(allCards, gameMode, playerNames);
            this.ui.hideSplashScreen();
            await this.delay(500);
            this.runGameLoop();
        } catch (error) {
            console.error("ゲームの初期化に失敗しました:", error);
        }
    }

    /**
     * APIから全ページのカードデータを再帰的に取得し、ローカルJSONとマージする。
     * @returns {Promise<Object[]>} マージ済みのカードデータの配列
     */
    async loadCardData() {
        try {
            console.log("カードデータの読み込みを開始します...");
            const apiCards = await this.fetchCardsFromConfiguredSources();
            console.log(`${apiCards.length}枚のカードを取得しました。`);

            const localDataResponse = await fetch('data/cards.json');
            if (!localDataResponse.ok) throw new Error('ローカルのスキル定義の読み込みに失敗しました。');
            const localData = await localDataResponse.json();
            const skillMap = new Map(localData.map(card => [card.name, card.skill]));

            const mergedCards = apiCards.map(apiCard => ({
                ...apiCard,
                skill: skillMap.get(apiCard.name) || null
            }));
            console.log("カードデータのマージが完了しました。");
            return mergedCards;

        } catch (error) {
            console.error(error);
            return new Promise((resolve, reject) => {
                 this.ui.showModal("APIエラー", "カードデータの取得に失敗しました。保存済みのデータで続行しますか？", [
                    { text: "はい", callback: async () => {
                        this.ui.hideModal();
                        try {
                            const localDataResponse = await fetch('data/cards.json');
                            const localData = await localDataResponse.json();
                            resolve(localData);
                        } catch (localError) {
                            reject(localError);
                        }
                    }},
                    { text: "リロード", callback: () => window.location.reload() }
                ]);
            });
        }
    }

    /**
     * data/card_sources.json に指定されたエンドポイントからカードを取得し、足りない場合は従来の再帰取得にフォールバックする。
     * @returns {Promise<Object[]>} 全カードデータ
     */
    async fetchCardsFromConfiguredSources() {
        try {
            const sourcesResponse = await fetch('data/card_sources.json');
            if (!sourcesResponse.ok) {
                console.warn('card_sources.json の読み込みに失敗したため、既存のAPI巡回にフォールバックします。');
                return this.fetchAllCardsFromApi();
            }
            const sources = await sourcesResponse.json();
            const endpoints = sources.apiEndpoints || [];
            if (!endpoints.length) {
                console.warn('card_sources.json にエンドポイントがありません。既存のAPI巡回を実行します。');
                return this.fetchAllCardsFromApi();
            }

            const pagePromises = endpoints.map(async (url) => {
                const apiResponse = await fetch(url, {
                    headers: { "accept": "application/json, text/plain, */*" },
                    method: "GET",
                    mode: "cors"
                });
                if (!apiResponse.ok) {
                    throw new Error(`カードデータ取得に失敗しました: ${url}`);
                }
                const apiData = await apiResponse.json();
                return apiData.cards || [];
            });

            const pages = await Promise.all(pagePromises);
            const deduped = [];
            const seen = new Set();
            pages.flat().forEach(card => {
                if (!seen.has(card.id)) {
                    seen.add(card.id);
                    deduped.push(card);
                }
            });
            return deduped;
        } catch (error) {
            console.warn('card_sources.json 経由の取得に失敗したため、既存のAPI巡回にフォールバックします。', error);
            return this.fetchAllCardsFromApi();
        }
    }

    /**
     * APIから全ページのカードを再帰的に取得するヘルパー関数。
     * @param {number} limit - 1リクエストあたりの取得数
     * @param {number} offset - 取得開始位置
     * @param {Object[]} accumulatedCards - これまでに取得したカードの配列
     * @returns {Promise<Object[]>} 全てのカードデータ
     */
    async fetchAllCardsFromApi(limit = 100, offset = 0, accumulatedCards = []) {
        const apiUrl = `https://app.cnptcg.monolithos.co.jp/api/cards?limit=${limit}&offset=${offset}&sort=newest`;
        const apiResponse = await fetch(apiUrl, {
            headers: { "accept": "application/json, text/plain, */*" },
            method: "GET",
            mode: "cors"
        });

        if (!apiResponse.ok) {
            throw new Error(`APIからのデータ取得に失敗しました (offset: ${offset}): ${apiResponse.statusText}`);
        }

        const apiData = await apiResponse.json();
        const newCards = apiData.cards;
        const allCards = [...accumulatedCards, ...newCards];

        // 取得したカード数がlimitと同じ場合、次のページが存在する可能性がある
        if (newCards.length === limit) {
            return this.fetchAllCardsFromApi(limit, offset + limit, allCards);
        } else {
            // 次のページがない場合、全カードを返す
            return allCards;
        }
    }

    /**
     * カードデータにユニークIDや画像URLなどの追加情報を付与する。
     * @param {Object} card - 元のカードデータ
     * @returns {Object} 処理後のカードデータ
     */
    processCardData(card) {
        const rarityBP = { C: 1000, R: 1500, RR: 2000, RRR: 2500, SR: 3000, SEC: 3500, 'P-RR': 1800, 'P-RRR': 3800, 'SP-RRR': 4000, 'P': 500 };
        const rarityCost = { C: 1, R: 2, RR: 2, RRR: 3, SR: 3, SEC: 4, 'P-RR': 2, 'P-RRR': 3, 'SP-RRR': 4, 'P': 1 };
        
        let type = CARD_TYPES.UNIT;
        if (card.skill && (card.name.includes("奥義") || card.name.includes("プランニング") || card.name.includes("不屈"))) type = CARD_TYPES.EVENT;
        else if (card.name.includes("協力者")) type = CARD_TYPES.SUPPORT;
        else if (card.name.startsWith('レイキ')) type = CARD_TYPES.REIKI;
        
        const cardImageUrl = card.imageUrl || card.thumbnailUrl || `https://cnptcg.s3.ap-northeast-1.amazonaws.com/images/cards/${encodeURIComponent(card.name)}_${encodeURIComponent(card.rarity)}.png`;

        return { 
            ...card, 
            uuid: self.crypto.randomUUID(), 
            bp: rarityBP[card.rarity] || 1000, 
            cost: rarityCost[card.rarity] || 1, 
            type, 
            rested: false, 
            imageUrl: cardImageUrl,
            originalBp: rarityBP[card.rarity] || 1000,
        };
    }
    
    /**
     * ゲームの初期状態を生成する。
     * @param {Object[]} allCardsData - 全カードのデータ
     * @param {string} gameMode - ゲームモード
     * @param {string[]} playerNames - プレイヤー名
     * @returns {Object} ゲームの初期状態
     */
    createInitialGameState(allCardsData, gameMode, playerNames) {
        const allCards = allCardsData.map(c => this.processCardData(c));

        const createPlayerState = () => {
            const mainDeckRaw = allCards.filter(c => c.type !== CARD_TYPES.REIKI && !c.rarity.startsWith('SP') && !c.rarity.startsWith('P-'));
            const mainDeck = [...mainDeckRaw].sort(() => 0.5 - Math.random());
            
            const reikiDeck = allCards.filter(c => c.type === CARD_TYPES.REIKI).sort(() => 0.5 - Math.random());
            const hand = mainDeck.splice(0, CONFIG.INITIAL_HAND_SIZE);
            const bases = Array(CONFIG.NUM_BASES).fill(0).map(() => ({ gauges: mainDeck.splice(0, CONFIG.GAUGE_PER_BASE), owner: null }));
            
            return { 
                mainDeck, reikiDeck, hand, bases, 
                reiki: 0, maxReiki: 0, trash: [], 
                field: { vanguard1: null, vanguard2: null, rearguard1: null, rearguard2: null, support: null }, 
            };
        };

        return { 
            players: [createPlayerState(), createPlayerState()], 
            turn: 1, 
            activePlayerIndex: 0, 
            phase: PHASES.START, 
            winner: null, 
            gameMode, 
            playerNames 
        };
    }

    /**
     * メインのゲームループ。勝者が決まるか最大ターンに達するまでターンを繰り返す。
     */
    async runGameLoop() {
        while (this.state.winner === null && this.state.turn <= CONFIG.MAX_TURNS) {
            await this.executeTurn();
        }
        
        if (this.state.winner !== null) {
            const winnerName = this.getPlayerName(this.state.winner);
            this.ui.showModal(`${winnerName}の勝利！`, "素晴らしい戦いでした。", [{ text: "もう一度プレイ", callback: () => window.location.reload() }]);
        } else {
            this.ui.showModal(`引き分け`, `規定ターン数(${CONFIG.MAX_TURNS})に達しました。`, [{ text: "もう一度プレイ", callback: () => window.location.reload() }]);
        }
    }

    /**
     * 1ターン分の処理を実行する。
     */
    async executeTurn() {
        const playerIndex = this.state.activePlayerIndex;
        this.state.phase = PHASES.START;
        this.ui.update(this.state);
        this.ui.addLog(`ターン ${this.state.turn} - ${this.getPlayerName(playerIndex)} のターン`);
        
        await this.delay();
        this.activePhase(playerIndex);
        this.reikiChargePhase(playerIndex);
        this.drawPhase(playerIndex);

        this.state.phase = PHASES.MAIN;
        this.ui.update(this.state);
        await this.mainPhase();
        if (this.state.winner) return;

        this.state.phase = PHASES.BATTLE;
        this.ui.update(this.state);
        await this.battlePhase();
        if (this.state.winner) return;

        this.state.phase = PHASES.END;
        this.ui.update(this.state);
        this.endTurnCleanup(playerIndex);
        this.checkWinner();

        this.state.activePlayerIndex = (playerIndex + 1) % 2;
        if (this.state.activePlayerIndex === 0) {
            this.state.turn++;
        }
    }

    activePhase(playerIndex) {
        const player = this.state.players[playerIndex];
        Object.values(player.field).forEach(card => { if (card) card.rested = false; });
        this.ui.addLog("アクティブフェイズ");
        this.ui.update(this.state);
    }

    reikiChargePhase(playerIndex) {
        const player = this.state.players[playerIndex];
        if (player.maxReiki < CONFIG.MAX_REIKI) player.maxReiki++;
        player.reiki = player.maxReiki;
        this.ui.addLog("レイキチャージフェイズ");
        this.ui.update(this.state);
    }

    drawPhase(playerIndex) {
        if(this.state.turn === 1 && playerIndex === 0) {
            this.ui.addLog("先攻のためドローなし");
            return;
        }
        this.drawCards(playerIndex, 1);
    }

    async mainPhase() {
        if (this.isHumanTurn()) {
            await this.waitForPlayerAction();
        } else {
            await this.ai.executeMainPhase();
        }
    }

    async battlePhase() {
        if (this.isHumanTurn()) {
            await this.waitForPlayerAction();
        } else {
            await this.ai.executeBattlePhase();
        }
    }

    endTurnCleanup(playerIndex) {
        const player = this.state.players[playerIndex];
        Object.values(player.field).forEach(card => {
            if (card) {
                card.bp = card.originalBp;
            }
        });
        const opponent = this.state.players[(playerIndex + 1) % 2];
        Object.values(opponent.field).forEach(card => {
            if (card) {
                card.bp = card.originalBp;
            }
        });
    }

    async waitForPlayerAction() {
        this.isProcessing = false;
        this.ui.update(this.state);
        await new Promise(resolve => { this.actionPromise = { resolve }; });
        this.isProcessing = true;
    }

    handlePlayerAction(data) {
        if (!this.isHumanTurn() || this.isProcessing) return;
        const { type, cardUUID, slot, owner, baseIndex } = data;
        
        if (this.state.phase === PHASES.MAIN) {
            if (type === 'hand') {
                const card = this.state.players[0].hand.find(c => c.uuid === cardUUID);
                this.ui.selectCard(card, 'hand', null);
            } else if (type === 'field' && this.ui.selectedCard && this.ui.selectedCardType === 'hand') {
                this.playCard(0, this.ui.selectedCard.uuid, slot);
            }
        } else if (this.state.phase === PHASES.BATTLE) {
            const player = this.state.players[0];
            const cardOnField = player.field[slot];
            if (type === 'field' && owner === 'player' && cardOnField && !cardOnField.rested) {
                 this.ui.selectCard(cardOnField, 'field', slot);
            } else if (this.ui.selectedCard && this.ui.selectedCardType === 'field') {
                 if (type === 'field' && owner === 'opponent') {
                    this.initiateAttack(0, this.ui.selectedCardSlot, slot);
                } else if (type === 'base' && owner === 'opponent') {
                    this.initiateAttack(0, this.ui.selectedCardSlot, `base${baseIndex}`);
                }
            }
        }
    }
    
    playCard(playerIndex, cardUUID, targetSlot) {
        const player = this.state.players[playerIndex];
        const cardIndex = player.hand.findIndex(c => c.uuid === cardUUID);
        if (cardIndex === -1) return;
        const card = player.hand[cardIndex];

        if (player.reiki < card.cost) {
            if (this.isHumanTurn()) this.ui.addLog("コスト不足です", "error");
            return;
        }

        if (card.type === CARD_TYPES.EVENT) {
            player.reiki -= card.cost;
            const playedCard = player.hand.splice(cardIndex, 1)[0];
            this.ui.addLog(`${this.getPlayerName(playerIndex)}がイベント「${playedCard.name}」を使用`);
            this.triggerEffect(playerIndex, playedCard, null);
            player.trash.push(playedCard);
            this.ui.unselectCard();
            this.ui.update(this.state);
            return;
        }

        if (!targetSlot) {
            if (this.isHumanTurn()) this.ui.addLog("配置する場所を選択してください", "error");
            return;
        }
        if (player.field[targetSlot]) {
            if (this.isHumanTurn()) this.ui.addLog("その場所はすでに埋まっています", "error");
            return;
        }

        player.reiki -= card.cost;
        const playedCard = player.hand.splice(cardIndex, 1)[0];
        player.field[targetSlot] = playedCard;
        this.ui.addLog(`${this.getPlayerName(playerIndex)}が${playedCard.name}を${targetSlot}に召喚`);
        
        this.triggerEffect(playerIndex, playedCard, targetSlot);

        this.ui.unselectCard();
        this.ui.update(this.state);
    }
    
    initiateAttack(attackerIndex, attackerSlot, targetIdentifier) {
        const attackerPlayer = this.state.players[attackerIndex];
        const defenderIndex = (attackerIndex + 1) % 2;
        const defenderPlayer = this.state.players[defenderIndex];
        const attackerCard = attackerPlayer.field[attackerSlot];
        
        if (!attackerCard || attackerCard.rested) return;

        this.triggerEffect(attackerIndex, attackerCard, attackerSlot, 'onAttack');

        let defenderCard = null;
        if(targetIdentifier && !targetIdentifier.startsWith('base')) {
            defenderCard = defenderPlayer.field[targetIdentifier];
        }

        this.ui.addLog(`${this.getPlayerName(attackerIndex)}の${attackerCard.name}が${defenderCard ? defenderCard.name : '拠点'}に攻撃`);
        this.ui.showAttackEffect(attackerCard, defenderCard || targetIdentifier);
        attackerCard.rested = true;
        
        const battleResult = this.resolveBattle(attackerCard, defenderCard);
        
        if (battleResult.winner === 'attacker') {
            if(defenderCard) {
                this.sendToTrash(defenderIndex, targetIdentifier);
                this.ui.addLog(`${defenderCard.name}は破壊された`);
            } else {
                const baseIndex = parseInt(targetIdentifier.replace('base', ''));
                const base = defenderPlayer.bases[baseIndex];
                if (base.gauges.length > 0) {
                    defenderPlayer.trash.push(base.gauges.pop());
                    this.ui.addLog(`拠点のゲージが1枚破壊された`);
                }
                if (base.gauges.length === 0 && base.owner !== attackerIndex) {
                    base.owner = attackerIndex;
                    this.ui.addLog(`拠点が制圧された！`);
                    this.checkWinner();
                }
            }
        } else if(battleResult.winner === 'defender') {
            this.sendToTrash(attackerIndex, attackerSlot);
            this.ui.addLog(`${attackerCard.name}は返り討ちにされた`);
        } else {
             this.ui.addLog(`相打ち！両者破壊`);
             this.sendToTrash(attackerIndex, attackerSlot);
             if(defenderCard) {
                this.sendToTrash(defenderIndex, targetIdentifier);
            }
        }

        this.ui.unselectCard();
        this.ui.update(this.state);
    }

    triggerEffect(playerIndex, card, sourceSlot, triggerType = 'onPlay') {
        if (card.skill && card.skill.trigger === triggerType) {
            const effect = this.effectRegistry.getEffect(card.skill.action);
            if (effect) {
                this.ui.addLog(`スキル発動！ ${card.name}: ${card.skill.action}`, 'skill');
                effect(playerIndex, card, sourceSlot);
                this.ui.update(this.state);
            }
        }
    }

    isHumanTurn() { return this.state.activePlayerIndex === 0 && this.state.gameMode === 'PvE'; }
    getPlayerName(index) { return this.state.playerNames[index]; }
    delay(ms) {
        const speed = this.state.gameMode === 'EvE' ? 0.2 : 1;
        return new Promise(res => setTimeout(res, (ms || CONFIG.AI_THINKING_TIME) * speed));
    }
    checkWinner() {
        this.state.players.forEach((_, index) => {
            const opponentIndex = (index + 1) % 2;
            const conqueredBases = this.state.players[opponentIndex].bases.filter(b => b.owner === index).length;
            if (conqueredBases >= 2) {
                this.state.winner = index;
            }
        });
    }
    drawCards(playerIndex, amount) {
        const player = this.state.players[playerIndex];
        for (let i = 0; i < amount; i++) {
            if (player.mainDeck.length > 0) {
                player.hand.push(player.mainDeck.pop());
            } else {
                this.ui.addLog("デッキ切れでドロー不可", "error");
                break;
            }
        }
        this.ui.addLog(`${this.getPlayerName(playerIndex)}がカードを${amount}枚引いた`);
        this.ui.update(this.state);
    }
    sendToTrash(playerIndex, slot) {
        const player = this.state.players[playerIndex];
        const card = player.field[slot];
        if (card) {
            player.trash.push(card);
            player.field[slot] = null;
        }
    }
    resolveBattle(attacker, defender) {
        if (!defender) return { winner: 'attacker' };
        if (attacker.bp > defender.bp) return { winner: 'attacker' };
        if (defender.bp > attacker.bp) return { winner: 'defender' };
        return { winner: 'draw' };
    }
    endPhaseForPlayer() {
        if (this.isHumanTurn() && !this.isProcessing && this.actionPromise) {
            this.actionPromise.resolve();
            this.actionPromise = null;
        }
    }
}
