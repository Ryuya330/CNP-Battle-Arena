/**
 * ゲーム全体で使用する定数を定義します。
 */
export const CONFIG = {
    // ゲーム設定
    NUM_BASES: 3,           // 拠点の数
    GAUGE_PER_BASE: 2,      // 拠点ごとのゲージの数
    INITIAL_HAND_SIZE: 5,   // 初期手札の枚数
    MAX_REIKI: 10,          // 最大レイキ
    MAX_TURNS: 50,          // 最大ターン数

    // AIの思考遅延（ミリ秒）
    AI_THINKING_TIME: 500,

    // 画像プレースホルダー
    PLACEHOLDER_IMG: "https://placehold.co/100x140/030712/f9fafb?text=CNP",
};

/**
 * ゲームのフェーズを定義します。
 */
export const PHASES = {
    START: 'start',
    MAIN: 'main',
    BATTLE: 'battle',
    END: 'end',
};

/**
 * カードの種類を定義します。
 */
export const CARD_TYPES = {
    UNIT: 'unit',
    EVENT: 'event',
    SUPPORT: 'support',
    REIKI: 'reiki',
};
