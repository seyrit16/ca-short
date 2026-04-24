import React, {useRef, useEffect, useState, useCallback} from 'react';

const WHEEL_SECTIONS = [
    {label: 'Атака прошла', color: '#1a4a1a', text: '#7ae87a', weight: 30},
    {label: 'Блок', color: '#1a2a5a', text: '#7ab0ff', weight: 20},
    {label: 'Контратака', color: '#4a1a1a', text: '#ff9999', weight: 10},
    {label: 'Крит. урон', color: '#5a1a00', text: '#ffb050', weight: 10},
    {label: 'Удар в уязвимую зону', color: '#3a0a3a', text: '#e090ff', weight: 15},
    {label: 'Парирование', color: '#0a3a3a', text: '#60e0e0', weight: 15}
];

// Предвычисляем кумулятивные углы один раз
const TOTAL_WEIGHT = WHEEL_SECTIONS.reduce((s, sec) => s + sec.weight, 0);

// startAngle и endAngle каждой секции в радианах (0..2π)
const SECTION_ANGLES = (() => {
    let cursor = 0;
    return WHEEL_SECTIONS.map(sec => {
        const start = (cursor / TOTAL_WEIGHT) * 2 * Math.PI;
        cursor += sec.weight;
        const end = (cursor / TOTAL_WEIGHT) * 2 * Math.PI;
        return {start, end, span: end - start};
    });
})();

interface BattleWheelProps {
    onSpinResult: (resultLabel: string, sectionIndex: number) => void;
    isAutoBattle?: boolean;
}

export const BattleWheel: React.FC<BattleWheelProps> = ({onSpinResult, isAutoBattle}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isSpinning, setIsSpinning] = useState(false);
    const [wheelAngle, setWheelAngle] = useState(0);
    const [currentResult, setCurrentResult] = useState<string>('Нажмите, чтобы испытать судьбу...');

    useEffect(() => {
        if (isAutoBattle && !isSpinning) {
            const t = setTimeout(() => spinWheel(), 800);
            return () => clearTimeout(t);
        }
    }, [isAutoBattle]);

    /**
     * Указатель стоит сверху (−π/2 в canvas = угол 0 в нашей системе).
     * Нормализуем текущий угол колеса и смотрим, в какую секцию попадает точка 0.
     */
    const getWinnerIndex = (angle: number): number => {
        // Угол "под указателем" в системе координат колеса
        const TWO_PI = Math.PI * 2;
        const ptr = ((-angle % TWO_PI) + TWO_PI) % TWO_PI;   // точка 0 относительно колеса

        for (let i = 0; i < SECTION_ANGLES.length; i++) {
            const {start, end} = SECTION_ANGLES[i];
            if (ptr >= start && ptr < end) return i;
        }
        return 0; // fallback
    };

    const drawWheel = useCallback((angle: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cx = 130, cy = 130, r = 122;
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
            const {start, span} = SECTION_ANGLES[i];
            const startA = angle + start - Math.PI / 2;   // −π/2: начало сверху
            const endA = startA + span;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startA, endA);
            ctx.closePath();
            ctx.fillStyle = sec.color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(200,152,14,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Текст по середине секции
            const mid = startA + span / 2;
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

        // Взвешенный случайный выбор победителя
        const rand = Math.random() * TOTAL_WEIGHT;
        let cumulative = 0;
        let winnerIndex = 0;
        for (let i = 0; i < WHEEL_SECTIONS.length; i++) {
            cumulative += WHEEL_SECTIONS[i].weight;
            if (rand < cumulative) {
                winnerIndex = i;
                break;
            }
        }

        // Случайная точка внутри секции победителя (избегаем края)
        const {start, span} = SECTION_ANGLES[winnerIndex];
        const margin = span * 0.15;
        const targetInSection = start + margin + Math.random() * (span - margin * 2);

        // Угол, который нужно оказаться "под указателем" (ptr = targetInSection)
        // ptr = ((-finalAngle) mod 2π)  =>  finalAngle = -targetInSection + k*2π
        const TWO_PI = Math.PI * 2;
        const turns = 5 + Math.random() * 3;
        const base = -targetInSection;
        // Подбираем k так, чтобы finalAngle > wheelAngle и прокрутка ≥ turns оборотов
        const currentNorm = ((wheelAngle % TWO_PI) + TWO_PI) % TWO_PI;
        let delta = ((base % TWO_PI) + TWO_PI) % TWO_PI - currentNorm;
        if (delta <= 0) delta += TWO_PI;
        const finalAngle = wheelAngle + delta + turns * TWO_PI;

        const duration = 4200;
        const startTime = performance.now();
        const startAngle = wheelAngle;

        const animate = (now: number) => {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            const cur = startAngle + (finalAngle - startAngle) * ease;
            setWheelAngle(cur);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                setIsSpinning(false);
                const finalIndex = getWinnerIndex(cur);
                const resultLabel = WHEEL_SECTIONS[finalIndex].label;
                setCurrentResult(resultLabel);
                onSpinResult(resultLabel, finalIndex);
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
                    style={{cursor: isSpinning ? 'not-allowed' : 'pointer'}}
                >
                    <div className="wheel-ptr"/>
                    <canvas ref={canvasRef} width="260" height="260"/>
                </div>
                <button className="wheel-spin-btn" onClick={spinWheel} disabled={isSpinning}>
                    ⚔ Крутить
                </button>
                <div className="wheel-result">{currentResult}</div>
            </div>
        </section>
    );
};