import React, { useState, useRef, useEffect } from 'react';
import '../styles/coinFlip.css';

// ─── SVG иконки ──────────────────────────────────────────────────────────────

const EagleSVG = () => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="coin-icon">
        {/* Тело орла */}
        <ellipse cx="40" cy="46" rx="14" ry="18" fill="#c8960a" opacity="0.9"/>
        {/* Голова */}
        <circle cx="40" cy="24" r="10" fill="#c8960a" opacity="0.9"/>
        {/* Клюв */}
        <path d="M49 25 L56 29 L49 30 Z" fill="#e8a800"/>
        {/* Глаз */}
        <circle cx="46" cy="22" r="2.5" fill="#1a0e05"/>
        <circle cx="47" cy="21" r="0.8" fill="#fff" opacity="0.7"/>
        {/* Левое крыло */}
        <path d="M26 42 C14 34 8 24 12 18 C16 28 22 34 26 42Z" fill="#a07008" opacity="0.85"/>
        <path d="M26 48 C12 42 6 30 10 22 C15 34 20 42 26 48Z" fill="#c8960a" opacity="0.7"/>
        {/* Правое крыло */}
        <path d="M54 42 C66 34 72 24 68 18 C64 28 58 34 54 42Z" fill="#a07008" opacity="0.85"/>
        <path d="M54 48 C68 42 74 30 70 22 C65 34 60 42 54 48Z" fill="#c8960a" opacity="0.7"/>
        {/* Хвост */}
        <path d="M32 62 L36 68 L40 63 L44 68 L48 62 L40 58Z" fill="#a07008"/>
        {/* Лапы */}
        <path d="M35 64 L31 70 M35 64 L33 71 M35 64 L29 68" stroke="#e8a800" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M45 64 L49 70 M45 64 L47 71 M45 64 L51 68" stroke="#e8a800" strokeWidth="1.5" strokeLinecap="round"/>
        {/* Грудь — перья */}
        <path d="M33 38 Q40 35 47 38 Q40 42 33 38Z" fill="#e8b820" opacity="0.5"/>
        <path d="M34 45 Q40 42 46 45 Q40 49 34 45Z" fill="#e8b820" opacity="0.4"/>
    </svg>
);

const ShieldSVG = () => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="coin-icon">
        {/* Щит */}
        <path
            d="M40 10 L62 20 L62 42 C62 56 40 70 40 70 C40 70 18 56 18 42 L18 20 Z"
            fill="#c8960a" opacity="0.85"
            stroke="#e8b820" strokeWidth="1.5"
        />
        {/* Внутренний щит */}
        <path
            d="M40 17 L56 25 L56 42 C56 53 40 64 40 64 C40 64 24 53 24 42 L24 25 Z"
            fill="#1a1000" opacity="0.5"
        />
        {/* Вертикальная полоса */}
        <line x1="40" y1="20" x2="40" y2="62" stroke="#e8b820" strokeWidth="1.5" opacity="0.6"/>
        {/* Горизонтальная полоса */}
        <line x1="24" y1="38" x2="56" y2="38" stroke="#e8b820" strokeWidth="1.5" opacity="0.6"/>
        {/* Центральная звезда */}
        <path
            d="M40 28 L42 34 L48 34 L43 38 L45 44 L40 40 L35 44 L37 38 L32 34 L38 34 Z"
            fill="#e8b820" opacity="0.9"
        />
    </svg>
);

// ─── Типы ─────────────────────────────────────────────────────────────────────

type CoinSide = 'heads' | 'tails';

interface CoinFlipProps {
    /** Значение, показываемое после выпадения орла (текст или число) */
    headsValue?: string | number;
    /** Значение, показываемое после выпадения решки (текст или число) */
    tailsValue?: string | number;
    /** Callback — вызывается с результатом после анимации */
    onResult?: (side: CoinSide, value?: string | number) => void;
    autoFlipToken?: number;
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export const CoinFlip: React.FC<CoinFlipProps> = ({
                                                      headsValue,
                                                      tailsValue,
                                                      onResult,
                                                      autoFlipToken = 0,
                                                  }) => {
    const [phase, setPhase] = useState<'idle' | 'spinning' | 'landed' | 'revealed'>('idle');
    const [result, setResult] = useState<CoinSide | null>(null);
    const [showValue, setShowValue] = useState(false);
    const coinRef = useRef<HTMLDivElement>(null);
    const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const clearTimeouts = () => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
    };

    const schedule = (fn: () => void, delay: number) => {
        const id = setTimeout(fn, delay);
        timeoutsRef.current.push(id);
    };

    const flip = () => {
        if (phase === 'spinning') return;

        clearTimeouts();
        setShowValue(false);
        setResult(null);

        const winner: CoinSide = Math.random() < 0.99 ? 'heads' : 'tails';

        setPhase('spinning');

        // Запускаем CSS-анимацию подброса
        const coin = coinRef.current;
        if (coin) {
            coin.style.setProperty('--flip-end-rotation', winner === 'heads' ? '0deg' : '180deg');
            coin.classList.remove('coin--landed', 'coin--revealed');
            // форс-рефлоу чтобы перезапустить анимацию
            void coin.offsetWidth;
            coin.classList.add('coin--spinning');
        }

        // После анимации подброса — монета "упала"
        schedule(() => {
            setResult(winner);
            setPhase('landed');
            coin?.classList.remove('coin--spinning');
            coin?.classList.add('coin--landed');
        }, 2200);

        // Затем фейд результата
        schedule(() => {
            setShowValue(true);
            setPhase('revealed');
            coin?.classList.add('coin--revealed');
            const val = winner === 'heads' ? headsValue : tailsValue;
            onResult?.(winner, val);
        }, 2700);
    };

    useEffect(() => {
        if (autoFlipToken <= 0) return;
        const id = setTimeout(() => {
            flip();
        }, 150);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFlipToken]);

    //const resultValue = result === 'heads' ? headsValue : tailsValue;
    //const hasValue = resultValue !== undefined && resultValue !== null && resultValue !== '';

    return (
        <div className="cf-wrapper">
            <h3 className="cf-title">Подброс монеты</h3>

            {/* Монета */}
            <div className="cf-stage" onClick={phase !== 'spinning' ? flip : undefined}>
                <div className="cf-coin" ref={coinRef}>
                    {/* Лицевая сторона — орёл */}
                    <div className="cf-face cf-face--front">
                        <div className="cf-face-inner">
                            {showValue && headsValue !== undefined
                                ? <span className="cf-face-value">{headsValue}</span>
                                : <>
                                    <img
                                        src="/assets/eagle.svg"
                                        alt="Орёл"
                                        className="coin-icon"
                                        style={{ filter: 'invert(60%) sepia(80%) saturate(500%) hue-rotate(5deg) brightness(1.1)' }}
                                    />
                                    {/*<EagleSVG />*/}
                                    <span className="cf-face-label">Орёл</span>
                                </>
                            }
                        </div>
                    </div>
                    {/* Обратная сторона — решка */}
                    <div className="cf-face cf-face--back">
                        <div className="cf-face-inner">
                            {showValue && tailsValue !== undefined
                                ? <span className="cf-face-value">{tailsValue}</span>
                                : <>
                                    <ShieldSVG />
                                    <span className="cf-face-label">Решка</span>
                                </>
                            }
                        </div>
                    </div>
                </div>

                {/* Тень под монетой */}
                <div className={`cf-shadow ${phase === 'spinning' ? 'cf-shadow--spinning' : ''}`} />
            </div>

            {/* Статус */}
            <div className="cf-status">
                {phase === 'idle' && (
                    <span className="cf-hint">Нажмите на монету, чтобы подбросить</span>
                )}
                {phase === 'spinning' && (
                    <span className="cf-spinning-text">Монета в воздухе...</span>
                )}
                {(phase === 'landed' || phase === 'revealed') && result && (
                    <div className="cf-result-wrap">
                        <span className="cf-result-label">
                            {result === 'heads' ? '🦅 Орёл!' : '🛡 Решка!'}
                        </span>
                    </div>
                )}
            </div>

            {/* Кнопка */}
            {/*<button*/}
            {/*    className="cf-btn"*/}
            {/*    onClick={flip}*/}
            {/*    disabled={phase === 'spinning'}*/}
            {/*>*/}
            {/*    {phase === 'spinning' ? '...' : phase === 'idle' ? '⚔ Подбросить' : '↺ Ещё раз'}*/}
            {/*</button>*/}
        </div>
    );
};
