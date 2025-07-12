import { GameEngine } from './gameEngine.js';

/**
 * DOMが読み込まれたらゲームを開始するエントリーポイント
 */
document.addEventListener('DOMContentLoaded', () => {
    // GameEngineのインスタンスを作成してゲームを開始
    const game = new GameEngine();
    game.start();
});
