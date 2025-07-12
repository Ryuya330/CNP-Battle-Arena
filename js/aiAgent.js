import { CARD_TYPES } from './constants.js';

/**
 * AIの思考と行動を決定するクラス。
 */
export class AIAgent {
    constructor(engine) {
        this.engine = engine;
    }

    /**
     * AIのメインフェイズの行動を実行する。
     */
    async executeMainPhase() {
        await this.engine.delay();
        const playerIndex = this.engine.state.activePlayerIndex;
        
        let playedSomething;
        do {
            playedSomething = false;
            const player = this.engine.state.players[playerIndex];

            // プレイ可能なカードを評価
            const playableCards = player.hand.filter(c => c.cost <= player.reiki);
            if (playableCards.length === 0) break;

            // カードを評価して最適な一枚を選ぶ（簡易版）
            const bestCardToPlay = this.evaluateCards(playableCards)[0];
            if (!bestCardToPlay) break;

            const card = bestCardToPlay.card;
            
            if (card.type === CARD_TYPES.UNIT || card.type === CARD_TYPES.SUPPORT) {
                const targetSlot = this.findBestSlotFor(player, card);
                if (targetSlot) {
                    this.engine.playCard(playerIndex, card.uuid, targetSlot);
                    playedSomething = true;
                }
            } else if (card.type === CARD_TYPES.EVENT) {
                this.engine.playCard(playerIndex, card.uuid, null);
                playedSomething = true;
            }

            if (playedSomething) {
                await this.engine.delay();
            }

        } while (playedSomething);
    }

    /**
     * AIのバトルフェイズの行動を実行する。
     */
    async executeBattlePhase() {
        await this.engine.delay();
        const playerIndex = this.engine.state.activePlayerIndex;
        const player = this.engine.state.players[playerIndex];
        const opponent = this.engine.state.players[(playerIndex + 1) % 2];

        const attackers = Object.entries(player.field)
            .filter(([s, c]) => c && !c.rested && (s.includes('vanguard') || s.includes('rearguard')))
            .sort(([, a], [, b]) => b.bp - a.bp);

        for (const [attackerSlot, attackerCard] of attackers) {
            const target = this.findBestAttackTarget(attackerCard, opponent);
            
            if (target) {
                this.engine.initiateAttack(playerIndex, attackerSlot, target);
            }
            await this.engine.delay();
            if (this.engine.state.winner !== null) return;
        }
    }

    /**
     * 手札のカードを評価し、スコア順にソートする。
     * @param {Object[]} cards - 評価するカードの配列
     * @returns {Object[]} 評価スコアとカードのオブジェクトの配列
     */
    evaluateCards(cards) {
        const evaluated = cards.map(card => {
            let score = 0;
            if (card.type === CARD_TYPES.UNIT) score += card.bp;
            if (card.skill) {
                // スキルの種類によってスコアを加算（例）
                if (card.skill.action === 'draw') score += 1500 * card.skill.value;
                if (card.skill.action === 'destroyWeakestOpponentUnit') score += 2000;
                if (card.skill.action === 'buffAllAllyUnits') score += 500 * card.skill.value;
            }
            return { card, score };
        });
        return evaluated.sort((a, b) => b.score - a.score);
    }

    /**
     * カードを配置するのに最適なスロットを見つける。
     * @param {Object} player - プレイヤーの状態
     * @param {Object} card - 配置するカード
     * @returns {string|null} 最適なスロット名
     */
    findBestSlotFor(player, card) {
        let emptySlots = [];
        if (card.type === CARD_TYPES.UNIT) {
            emptySlots = Object.entries(player.field)
                .filter(([key, c]) => !c && (key.includes('vanguard') || key.includes('rearguard')))
                .map(([slot]) => slot);
        } else if (card.type === CARD_TYPES.SUPPORT) {
            if (!player.field.support) emptySlots.push('support');
        }
        return emptySlots.length > 0 ? emptySlots[0] : null; // シンプルに最初の空きスロット
    }

    /**
     * 最適な攻撃対象を見つける。
     * @param {Object} attackerCard - 攻撃するカード
     * @param {Object} opponent - 相手プレイヤーの状態
     * @returns {string|null} ターゲットのスロットまたは拠点ID
     */
    findBestAttackTarget(attackerCard, opponent) {
        const opponentCards = Object.entries(opponent.field)
            .filter(([,c]) => c)
            .sort(([,a],[,b]) => a.bp - b.bp);

        // 倒せるカードの中で最もBPが高いものを狙う
        let bestTargetSlot = null;
        let maxBpDefeatable = -1;
        for (const [slot, card] of opponentCards) {
            if (attackerCard.bp > card.bp && card.bp > maxBpDefeatable) {
                bestTargetSlot = slot;
                maxBpDefeatable = card.bp;
            }
        }
        if (bestTargetSlot) return bestTargetSlot;

        // 倒せるカードがない場合、相打ちできる最もBPが高いカードを狙う
        for (const [slot, card] of opponentCards.reverse()) { // BP高い順
            if (attackerCard.bp === card.bp) {
                return slot;
            }
        }
        
        // 攻撃できるユニットがいない場合、拠点を攻撃
        const baseToAttack = opponent.bases.findIndex(b => b.owner !== this.engine.state.activePlayerIndex);
        if (baseToAttack !== -1) {
            return `base${baseToAttack}`;
        }

        // それでもない場合（ありえないが）、最も弱いユニットを攻撃
        if (opponentCards.length > 0) {
            return opponentCards[0][0];
        }

        return null; // 攻撃対象なし
    }
}
