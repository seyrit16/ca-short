import React, { useRef, useEffect, useState, useCallback } from 'react';

const WHEEL_SECTIONS = [
    { label: 'Атака прошла',        color: '#1a4a1a', text: '#7ae87a' },
    { label: 'Блок',                color: '#1a2a5a', text: '#7ab0ff' },
    { label: 'Контратака',          color: '#4a1a1a', text: '#ff9999' },
    { label: 'Крит. урон',          color: '#5a1a00', text: '#ffb050' },
    { label: 'Удар в уязвимую зону', color: '#3a0a3a', text: '#e090ff' },
];

interface BattleWheelProps {
    onSpinResult: (resultLabel: string, sectionIndex: number) => void;
}

export const BattleWheel: React.FC<BattleWheelProps> = ({ onSpinResult }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isSpinning, setIsSpinning] = useState(false);
    const [wheelAngle, setWheelAngle] = useState(0);
    const [currentResult, setCurrentResult] = useState<string>('Нажмите, чтобы испытать судьбу...');

    // Нормализация угла (точно как в твоём старом коде)
    const normalizeAngle = (a: number): number => {
        const twoPi = Math.PI * 2;
        return ((a % twoPi) + twoPi) % twoPi;
    };

    // Твоя оригинальная функция — перенесена почти без изменений
    const getWheelWinnerIndexFromAngle = (angle: number): number => {
        const n = WHEEL_SECTIONS.length;
        const slice = (Math.PI * 2) / n;
        let bestIdx = 0;
        let bestDiff = Number.POSITIVE_INFINITY;

        for (let i = 0; i < n; i++) {
            const center = normalizeAngle(angle + i * slice + slice / 2);
            const diff = Math.min(center, Math.PI * 2 - center);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const drawWheel = useCallback((angle: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cx = 130, cy = 130, r = 122;
        const n = WHEEL_SECTIONS.length;
        const sliceAngle = (2 * Math.PI) / n;

        ctx.clearRect(0, 0, 260, 260);

        // Внешнее кольцо
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(200,152,14,0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,152,14,0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();

        WHEEL_SECTIONS.forEach((sec, i) => {
            const start = angle + i * sliceAngle - Math.PI / 2;
            const end = start + sliceAngle;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = sec.color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(200,152,14,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Текст сектора
            const mid = start + sliceAngle / 2;
            const lx = cx + Math.cos(mid) * r * 0.62;
            const ly = cy + Math.sin(mid) * r * 0.62;

            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(mid + Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = sec.text;
            ctx.font = '600 11px "Cinzel", serif';

            const words = sec.label.split(' ');
            let line = '';
            let y = -8;

            words.forEach(word => {
                const testLine = line + (line ? ' ' : '') + word;
                if (ctx.measureText(testLine).width > 72 && line) {
                    ctx.fillText(line, 0, y);
                    line = word;
                    y += 14;
                } else {
                    line = testLine;
                }
            });
            ctx.fillText(line, 0, y);
            ctx.restore();
        });

        // Центр
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a0e05';
        ctx.fill();
        ctx.strokeStyle = 'var(--gold)';
        ctx.lineWidth = 3;
        ctx.stroke();
    }, []);

    useEffect(() => {
        drawWheel(wheelAngle);
    }, [wheelAngle, drawWheel]);

    const spinWheel = () => {
        if (isSpinning) return;

        setIsSpinning(true);
        setCurrentResult('Колесо крутится...');

        const n = WHEEL_SECTIONS.length;
        const winnerIndex = Math.floor(Math.random() * n);        // выбираем победителя
        const slice = (2 * Math.PI) / n;

        const startAngle = wheelAngle;
        const turns = 5 + Math.random() * 3;
        const targetBase = -(winnerIndex * slice + slice / 2);

        let delta = targetBase - normalizeAngle(startAngle);
        if (delta < 0) delta += Math.PI * 2;
        delta += turns * Math.PI * 2;

        const finalAngle = startAngle + delta;
        const duration = 4200;
        const startTime = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);

            const currentAngle = startAngle + (finalAngle - startAngle) * ease;
            setWheelAngle(currentAngle);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                // Анимация завершена
                setIsSpinning(false);
                const finalIndex = getWheelWinnerIndexFromAngle(currentAngle); // используем твою функцию
                const resultLabel = WHEEL_SECTIONS[finalIndex].label;

                setCurrentResult(resultLabel);
                onSpinResult(resultLabel, finalIndex);   // ← передаём результат и индекс
            }
        };

        requestAnimationFrame(animate);
    };

    return (
        <section className="util-card">
            <h3>Колесо битвы</h3>

            <div className="wheel-wrap">
                <div
                    className="wheel-container"
                    onClick={spinWheel}
                    style={{ cursor: isSpinning ? 'not-allowed' : 'pointer' }}
                >
                    <div className="wheel-ptr" />
                    <canvas
                        ref={canvasRef}
                        width="260"
                        height="260"
                    />
                </div>

                <button
                    className="wheel-spin-btn"
                    onClick={spinWheel}
                    disabled={isSpinning}
                >
                    ⚔ Крутить
                </button>

                <div className="wheel-result">
                    {currentResult}
                </div>
            </div>
        </section>
    );
};
