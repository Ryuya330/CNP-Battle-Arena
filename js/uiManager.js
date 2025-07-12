import { CONFIG, PHASES, CARD_TYPES } from './constants.js';

/**
 * DOM操作、UIの更新、ユーザーからの入力を担当するクラス。
 */
export class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.selectedCard = null;
        this.selectedCardType = null; 
        this.selectedCardSlot = null;
        this.init();
    }

    /**
     * イベントリスナーを初期化する。
     */
    init() {
        document.getElementById('start-pve-btn').onclick = () => this.engine.initGame('PvE', this.getPlayerNamesFromInput());
        document.getElementById('start-eve-btn').onclick = () => this.engine.initGame('EvE', this.getPlayerNamesFromInput());
        
        document.body.addEventListener('click', e => {
            if (this.engine.isProcessing) return;

            const cardEl = e.target.closest('.card');
            const slotEl = e.target.closest('.field-slot');
            const baseEl = e.target.closest('.base');

            if (cardEl && cardEl.dataset.uuid) {
                this.engine.handlePlayerAction({ type: cardEl.dataset.type, cardUUID: cardEl.dataset.uuid, owner: cardEl.dataset.owner, slot: cardEl.dataset.slot });
            } else if (slotEl && slotEl.dataset.slot) {
                this.engine.handlePlayerAction({ type: 'field', slot: slotEl.dataset.slot, owner: slotEl.dataset.owner });
            } else if (baseEl) {
                 this.engine.handlePlayerAction({ type: 'base', owner: baseEl.dataset.owner, baseIndex: baseEl.dataset.index });
            }
        });
    }

    getPlayerNamesFromInput() {
        const p1Name = document.getElementById('player1-name-input').value || 'りゅうや';
        const p2Name = document.getElementById('player2-name-input').value || '紫苑';
        return [p1Name, p2Name];
    }

    /**
     * ゲーム状態に基づいてUI全体を更新する。
     * @param {Object} state - 現在のゲーム状態
     */
    update(state) {
        this.updatePlayerUI(0, state.players[0], state);
        this.updatePlayerUI(1, state.players[1], state);
        this.updatePhaseDisplay(state);
    }

    /**
     * 特定のプレイヤーのUIを更新する。
     * @param {number} index - プレイヤーのインデックス
     * @param {Object} playerState - プレイヤーの状態
     * @param {Object} state - 全体のゲーム状態
     */
    updatePlayerUI(index, playerState, state) {
        const isPlayer = index === 0;
        const prefix = isPlayer ? 'player' : 'opponent';
        
        document.getElementById(`${prefix}-name`).textContent = state.playerNames[index];
        document.getElementById(`${prefix}-hand-count`).querySelector('span').textContent = playerState.hand.length;
        document.getElementById(`${prefix}-deck`).innerHTML = `Deck <span class="font-orbitron">${playerState.mainDeck.length}</span>`;
        document.getElementById(`${prefix}-trash`).innerHTML = `Trash <span class="font-orbitron">${playerState.trash.length}</span>`;
        document.getElementById(`${prefix}-reiki-count`).querySelector('span').textContent = `${playerState.reiki}/${playerState.maxReiki}`;
        
        if(isPlayer) {
            const handEl = document.getElementById('player-hand-cards');
            handEl.innerHTML = '';
            playerState.hand.forEach(card => handEl.appendChild(this.createCardEl(card, 'hand', 'player', null)));
        }

        for (const [slot, card] of Object.entries(playerState.field)) {
            const slotEl = document.getElementById(`${prefix}-field-${slot}`);
            slotEl.innerHTML = '';
            if (card) {
                const cardEl = this.createCardEl(card, 'field', prefix, slot);
                slotEl.appendChild(cardEl);
            }
        }
        
        const opponentOfCurrentPlayerIndex = (index + 1) % 2;
        const basesEl = document.getElementById(`${prefix}-bases`);
        basesEl.innerHTML = '';
        state.players[opponentOfCurrentPlayerIndex].bases.forEach((base, i) => {
            const baseEl = document.createElement('div');
            baseEl.className = 'base cursor-pointer';
            baseEl.dataset.owner = prefix;
            baseEl.dataset.index = i;
            if(base.owner !== null) {
                baseEl.classList.add(base.owner === 0 ? 'conquered-by-player' : 'conquered-by-opponent');
            }
            const gaugeBar = document.createElement('div');
            gaugeBar.className = 'gauge-bar';
            const gaugeInner = document.createElement('div');
            gaugeInner.className = 'gauge-bar-inner';
            gaugeInner.style.width = `${(base.gauges.length / CONFIG.GAUGE_PER_BASE) * 100}%`;
            gaugeBar.appendChild(gaugeInner);
            baseEl.appendChild(gaugeBar);
            basesEl.appendChild(baseEl);
        });
        this.updateHighlights(state);
    }

    /**
     * カードのDOM要素を生成する。
     * @param {Object} card - カードデータ
     * @param {string} type - 'hand' または 'field'
     * @param {string} owner - 'player' または 'opponent'
     * @param {string|null} slot - フィールドのスロット名
     * @returns {HTMLElement} カードのDOM要素
     */
    createCardEl(card, type, owner, slot) {
        const el = document.createElement('div');
        el.className = `card ${type === 'hand' ? 'in-hand' : ''}`;
        el.dataset.uuid = card.uuid;
        el.dataset.type = type;
        el.dataset.owner = owner;
        if(slot) el.dataset.slot = slot;
        if(card.rested) el.classList.add('rested');
        
        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.className = "card-inner";
        img.alt = card.name;
        img.draggable = false;
        img.onerror = (e) => { e.target.src = CONFIG.PLACEHOLDER_IMG; };

        el.innerHTML = `<div class="card-overlay-text text-white"><p class="font-bold truncate">${card.name}</p><p class="text-amber-300">BP: ${card.bp}</p></div>`;
        el.prepend(img);
        return el;
    }

    /**
     * フェーズ表示を更新する。
     * @param {Object} state - 現在のゲーム状態
     */
    updatePhaseDisplay(state) {
        const phaseEl = document.getElementById('phase-display');
        const phaseName = state.phase.toUpperCase();
        const canEndPhase = this.engine.isHumanTurn() && !this.engine.isProcessing && (state.phase === PHASES.MAIN || state.phase === PHASES.BATTLE);
        let buttonText = 'TURN END';
        if (state.phase === PHASES.MAIN) buttonText = 'BATTLE PHASE へ';
        if (state.phase === PHASES.BATTLE) buttonText = 'END PHASE へ';

        phaseEl.innerHTML = `<div class="text-left"><p class="font-orbitron text-lg text-gray-400">TURN ${state.turn}</p><p class="font-bold text-2xl sm:text-3xl text-amber-400">${phaseName} PHASE</p></div><button id="end-phase-button" class="action-button bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded" ${!canEndPhase ? 'disabled' : ''}>${buttonText}</button>`;
        document.getElementById('end-phase-button').onclick = () => this.engine.endPhaseForPlayer();
    }

    /**
     * プレイ可能なアクションをハイライトする。
     * @param {Object} state - 現在のゲーム状態
     */
    updateHighlights(state) {
        document.querySelectorAll('.card, .field-slot, .base').forEach(el => el.classList.remove('playable', 'can-attack', 'targetable', 'selected'));
        if (!this.engine.isHumanTurn() || this.engine.isProcessing) return;
        
        const player = state.players[0];
        const opponent = state.players[1];

        if (state.phase === PHASES.MAIN) {
            if(this.selectedCard && this.selectedCardType === 'hand') {
                document.querySelectorAll('[data-type="field"][data-owner="player"]').forEach(slotEl => {
                    const slot = slotEl.dataset.slot;
                    const cardType = this.selectedCard.type;
                    const canPlaceHere = 
                        (cardType === CARD_TYPES.UNIT && (slot.includes('vanguard') || slot.includes('rearguard'))) || 
                        (cardType === CARD_TYPES.SUPPORT && slot.includes('support'));
                    
                    if (!player.field[slot] && player.reiki >= this.selectedCard.cost && canPlaceHere) {
                        slotEl.classList.add('playable');
                    }
                });
            }
        } else if (state.phase === PHASES.BATTLE) {
            Object.entries(player.field).forEach(([slot, card]) => {
                if(card && !card.rested) document.querySelector(`[data-uuid="${card.uuid}"]`).classList.add('can-attack');
            });
            if(this.selectedCard && this.selectedCardType === 'field') {
                Object.values(opponent.field).forEach(card => {
                    if(card) document.querySelector(`[data-uuid="${card.uuid}"]`).classList.add('targetable');
                });
                document.querySelectorAll('#opponent-bases .base').forEach(baseEl => {
                    baseEl.classList.add('targetable');
                });
            }
        }

        if(this.selectedCard){
            const el = document.querySelector(`[data-uuid="${this.selectedCard.uuid}"]`);
            if(el) el.classList.add('selected');
        }
    }

    // ... その他のUIヘルパーメソッド ...
    selectCard(card, type, slot) {
        if(this.selectedCard?.uuid === card?.uuid) { this.unselectCard(); return; }
        this.unselectCard();
        this.selectedCard = card;
        this.selectedCardType = type;
        this.selectedCardSlot = slot;
        this.updateHighlights(this.engine.state);
    }
    unselectCard() {
        this.selectedCard = null;
        this.selectedCardType = null;
        this.selectedCardSlot = null;
        this.updateHighlights(this.engine.state);
    }
    addLog(message, type = 'info') {
        const logEl = document.getElementById('battle-log');
        const entry = document.createElement('p');
        const typeColor = {
            info: 'text-gray-300',
            error: 'text-red-400',
            skill: 'text-amber-400',
        };
        entry.className = `log-entry ${typeColor[type] || 'text-gray-300'}`;
        entry.textContent = message;
        logEl.prepend(entry);
        setTimeout(() => entry.classList.add('visible'), 10);
        if (logEl.children.length > 20) {
            logEl.lastChild.remove();
        }
    }
    showModal(title, text, buttons = []) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-text').textContent = text;
        const buttonsEl = document.getElementById('modal-buttons');
        buttonsEl.innerHTML = '';
        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.className = 'action-button bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg';
            button.textContent = btnInfo.text;
            button.onclick = btnInfo.callback;
            buttonsEl.appendChild(button);
        });
        document.getElementById('modal-overlay').classList.remove('hidden');
    }
    showSplashScreen() { document.getElementById('splash-screen').classList.remove('hidden'); }
    hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        splash.classList.add('opacity-0');
        document.getElementById('game-container').classList.remove('opacity-0');
        setTimeout(() => splash.classList.add('hidden'), 500);
    }
    showAttackEffect(attackerCard, target) {
        const effect = document.createElement('div');
        effect.className = 'attack-effect';
        document.getElementById('game-container').appendChild(effect);
        
        let targetEl;
        if (typeof target === 'string' && target.startsWith('base')) {
            const baseIndex = target.replace('base', '');
            targetEl = document.querySelector(`#opponent-bases [data-index="${baseIndex}"]`);
        } else if (target && target.uuid) {
            targetEl = document.querySelector(`[data-uuid="${target.uuid}"]`);
        }
        
        if(targetEl) {
            const rect = targetEl.getBoundingClientRect();
            effect.style.left = `${rect.left + rect.width / 2 - 50}px`;
            effect.style.top = `${rect.top + rect.height / 2 - 50}px`;
        }
        setTimeout(() => effect.remove(), 400);
    }
}
