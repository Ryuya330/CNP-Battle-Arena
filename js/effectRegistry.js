import { CARD_TYPES } from './constants.js';

/**
 * カードのスキル効果を定義し、管理するクラス。
 */
export class EffectRegistry {
    constructor(engine) {
        this.engine = engine;
        this.effects = {
            /**
             * 指定枚数カードを引く。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            draw: (playerIndex, card) => {
                this.engine.drawCards(playerIndex, card.skill.value || 1);
            },

            /**
             * 指定量レイキを獲得する。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            gainReiki: (playerIndex, card) => {
                const player = this.engine.state.players[playerIndex];
                player.reiki = Math.min(player.maxReiki, player.reiki + (card.skill.value || 1));
            },

            /**
             * 相手の最もBPが低いユニットを破壊する。
             * @param {number} playerIndex - 実行するプレイヤー
             */
            destroyWeakestOpponentUnit: (playerIndex) => {
                const opponentIndex = (playerIndex + 1) % 2;
                const opponent = this.engine.state.players[opponentIndex];
                const units = Object.entries(opponent.field).filter(([,c]) => c && c.type === CARD_TYPES.UNIT);
                if (units.length > 0) {
                    units.sort(([, a], [, b]) => a.bp - b.bp);
                    const targetSlot = units[0][0];
                    this.engine.sendToTrash(opponentIndex, targetSlot);
                }
            },

            /**
             * 味方の全ユニットのBPを強化する。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            buffAllAllyUnits: (playerIndex, card) => {
                const player = this.engine.state.players[playerIndex];
                Object.values(player.field).forEach(unit => {
                    if (unit && unit.type === CARD_TYPES.UNIT) {
                        unit.bp += card.skill.value || 300;
                    }
                });
            },

            /**
             * スキル使用者のBPを強化する。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             * @param {string} sourceSlot - スキル使用者がいるスロット
             */
            buffSelf: (playerIndex, card, sourceSlot) => {
                const player = this.engine.state.players[playerIndex];
                const selfCard = player.field[sourceSlot];
                if (selfCard) {
                    selfCard.bp += card.skill.value || 500;
                }
            },

            /**
             * 相手ユニットをレスト（行動済み）状態にする。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            restOpponentUnit: (playerIndex, card) => {
                const opponentIndex = (playerIndex + 1) % 2;
                const opponent = this.engine.state.players[opponentIndex];
                const targetType = card.skill.options?.target || 'strongest';
                const units = Object.entries(opponent.field).filter(([,c]) => c && c.type === CARD_TYPES.UNIT && !c.rested);
                if (units.length > 0) {
                    if (targetType === 'strongest') {
                        units.sort(([, a], [, b]) => b.bp - a.bp);
                    } else { // weakest
                        units.sort(([, a], [, b]) => a.bp - b.bp);
                    }
                    const targetCard = units[0][1];
                    targetCard.rested = true;
                }
            },

            /**
             * 相手ユニットを手札に戻す。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            returnUnitToHand: (playerIndex, card) => {
                const opponentIndex = (playerIndex + 1) % 2;
                const opponent = this.engine.state.players[opponentIndex];
                const targetType = card.skill.options?.target || 'strongest';
                const units = Object.entries(opponent.field).filter(([,c]) => c && c.type === CARD_TYPES.UNIT);
                if (units.length > 0) {
                     if (targetType === 'strongest') {
                        units.sort(([, a], [, b]) => b.bp - a.bp);
                    } else {
                        units.sort(([, a], [, b]) => a.bp - b.bp);
                    }
                    const [targetSlot, targetCard] = units[0];
                    opponent.field[targetSlot] = null;
                    opponent.hand.push(targetCard);
                }
            },
            
            /**
             * デッキから特定のカードを探して場に出す。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            searchAndPlay: (playerIndex, card) => {
                const player = this.engine.state.players[playerIndex];
                const cardNameToFind = card.skill.options?.cardName;
                if (!cardNameToFind) return;
                const cardIndex = player.mainDeck.findIndex(c => c.name === cardNameToFind);
                if (cardIndex !== -1) {
                    const foundCard = player.mainDeck.splice(cardIndex, 1)[0];
                    const emptySlot = Object.keys(player.field).find(slot => !player.field[slot] && slot.includes('rearguard'));
                    if (emptySlot) {
                        player.field[emptySlot] = foundCard;
                    } else {
                        player.hand.push(foundCard); // 空きがなければ手札へ
                    }
                }
            },

            /**
             * トラッシュから条件に合うカードを場に戻す。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            reviveFromTrash: (playerIndex, card) => {
                const player = this.engine.state.players[playerIndex];
                if (player.trash.length === 0) return;
                
                const options = card.skill.options || {};
                let candidates = player.trash.filter(c => c.type === CARD_TYPES.UNIT);

                if (options.maxCost) {
                    candidates = candidates.filter(c => c.cost <= options.maxCost);
                }
                if (options.tribe) {
                    candidates = candidates.filter(c => c.tribe === options.tribe);
                }

                if (candidates.length > 0) {
                    if (options.target === 'strongest') {
                        candidates.sort((a, b) => b.bp - a.bp);
                    } else { // デフォルトは最も強いもの
                         candidates.sort((a, b) => b.bp - a.bp);
                    }
                    const cardToRevive = candidates[0];
                    player.trash = player.trash.filter(c => c.uuid !== cardToRevive.uuid);
                    const emptySlot = Object.keys(player.field).find(slot => !player.field[slot] && (slot.includes('vanguard') || slot.includes('rearguard')));
                    if (emptySlot) {
                        player.field[emptySlot] = cardToRevive;
                    } else {
                        player.hand.push(cardToRevive); // 空きがなければ手札へ
                    }
                }
            },

            /**
             * 手札を捨ててカードを引く。
             * @param {number} playerIndex - 実行するプレイヤー
             * @param {Object} card - スキルを持つカード
             */
            discardAndDraw: (playerIndex, card) => {
                const player = this.engine.state.players[playerIndex];
                const discardCount = Math.min(player.hand.length, card.skill.value || 1);
                
                // AIは単純に弱いカードから捨てる
                if (!this.engine.isHumanTurn()) {
                    player.hand.sort((a, b) => a.bp - b.bp);
                }
                
                for (let i = 0; i < discardCount; i++) {
                    const discardedCard = player.hand.shift(); // 最も弱いカード
                    player.trash.push(discardedCard);
                }
                this.engine.drawCards(playerIndex, discardCount);
            }
        };
    }

    /**
     * 指定されたアクション名の効果関数を取得する。
     * @param {string} actionName - スキルアクション名
     * @returns {Function|null} 効果を実装した関数
     */
    getEffect(actionName) {
        return this.effects[actionName] || null;
    }
}
