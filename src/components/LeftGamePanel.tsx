import {useEffect, useMemo, useState} from 'react';
import type {ChangeEvent, DragEvent} from 'react';
import {API} from '../api/gameApi';
import type {Game, PlayerKey, Unit} from '../types';

interface LeftGamePanelProps {
    game: Game;
    currentPlayer: PlayerKey;
    activeStatsPlayer: PlayerKey;
    onStatsPlayerChange: (player: PlayerKey) => void;
    onUnitHpChange: (unitId: string, delta: number) => void;
    onUnitStatChange: (unitId: string, stat: 'attack' | 'defense' | 'capture' | 'maxHp', delta: number) => void;
    onUnitItemChange: (unitId: string, item: 'teleport' | 'camp' | 'returnStone', delta: number) => void;
    onUnitRename: (unitId: string, name: string) => void;
    onQueueReorder: (player: PlayerKey, fromIndex: number, toIndex: number) => void;
    onQueueFocus: (player: PlayerKey, unitId: string) => void;
    onUnitIconSet: (unitId: string, icon: string) => void;
    onUnitIconUpload: (unitId: string, file: File) => Promise<string | null>;
    onApplyDeckCardToUnit: (unitId: string) => void;
    onHealDropToUnit: (unitId: string, mode: 'full' | 'fixed', amount?: number) => void;
    onResourceChange: (
        player: PlayerKey,
        key: 'trees' | 'redJokers' | 'blackJokers' | 'heal' | 'buffDebuff' | 'provocation' | 'egoStrike',
        delta: number
    ) => void;
}

function playerUnits(game: Game, player: PlayerKey): Unit[] {
    return game.units.filter((unit) => unit.player === player);
}

function unitIcon(unit: Unit): string {
    if (unit.icon) return unit.icon;
    return unit.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png';
}

function UnitCard({
                      unit,
                      availableIcons,
                      isIconMenuOpen,
                      onToggleIconMenu,
                      onUnitIconSet,
                      onUploadIcon,
                      onUnitHpChange,
                      onUnitStatChange,
    onUnitItemChange,
    onUnitRename,
    onDropDeckCard,
    onHealDropToUnit,
                  }: {
    unit: Unit;
    availableIcons: string[];
    isIconMenuOpen: boolean;
    onToggleIconMenu: (unitId: string) => void;
    onUnitIconSet: (unitId: string, icon: string) => void;
    onUploadIcon: (unitId: string, event: ChangeEvent<HTMLInputElement>) => void;
    onUnitHpChange: (id: string, delta: number) => void;
    onUnitStatChange: (id: string, stat: 'attack' | 'defense' | 'capture' | 'maxHp', delta: number) => void;
    onUnitItemChange: (id: string, item: 'teleport' | 'camp' | 'returnStone', delta: number) => void;
    onUnitRename: (id: string, name: string) => void;
    onDropDeckCard: (unitId: string) => void;
    onHealDropToUnit: (unitId: string, mode: 'full' | 'fixed', amount?: number) => void;
}) {
    const [draftName, setDraftName] = useState(unit.name);

    useEffect(() => {
        setDraftName(unit.name);
    }, [unit.name]);

    function commitName(): void {
        const nextName = draftName.trim();
        if (!nextName) {
            setDraftName(unit.name);
            return;
        }
        if (nextName !== unit.name) {
            onUnitRename(unit.id, nextName);
        }
    }

    const hpPct = unit.maxHp > 0 ? Math.round((unit.hp / unit.maxHp) * 100) : 0;
    const hpClass = hpPct > 60 ? 'high' : hpPct > 30 ? 'mid' : 'low';

    return (
        <article
            className={`char-card ${!unit.alive ? 'char-dead' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.getData('application/x-ca-card') === 'current') {
                    onDropDeckCard(unit.id);
                    return;
                }
                const secretItemPayload = event.dataTransfer.getData('application/x-ca-secret-item');
                if (secretItemPayload) {
                    try {
                        const parsed = JSON.parse(secretItemPayload) as { item?: 'teleport' | 'camp' };
                        if (parsed.item === 'teleport' || parsed.item === 'camp') {
                            onUnitItemChange(unit.id, parsed.item, 1);
                            return;
                        }
                    } catch {
                        // no-op
                    }
                }
                const healPayload = event.dataTransfer.getData('application/x-ca-heal');
                if (!healPayload) return;
                try {
                    const parsed = JSON.parse(healPayload) as { mode?: 'full' | 'fixed'; amount?: number };
                    if (parsed.mode === 'full') {
                        onHealDropToUnit(unit.id, 'full');
                        return;
                    }
                    if (parsed.mode === 'fixed') {
                        onHealDropToUnit(unit.id, 'fixed', Number(parsed.amount) || 0);
                    }
                } catch {
                    // no-op
                }
            }}
            title="Перетащите карту из колоды на персонажа"
        >
            <div className="char-top">
                <div className="char-icon-wrap">
                    <button
                        type="button"
                        className="char-icon-btn"
                        onClick={() => onToggleIconMenu(unit.id)}
                        title="Выбрать иконку"
                    >
                        <img src={unitIcon(unit)} alt={unit.name} className="char-icon"/>
                    </button>

                    {isIconMenuOpen ? (
                        <div className="char-icon-dropdown" onClick={(event) => event.stopPropagation()}>
                            <div className="char-icon-grid">
                                {availableIcons.map((icon) => (
                                    <button
                                        key={icon}
                                        type="button"
                                        className="icon-choice"
                                        onClick={() => onUnitIconSet(unit.id, icon)}
                                        title="Выбрать иконку"
                                    >
                                        <img src={icon} alt="icon" className="queue-icon-img"/>
                                    </button>
                                ))}
                            </div>
                            <label className="icon-upload-btn">
                                Загрузить PNG
                                <input type="file" accept="image/png"
                                       onChange={(event) => onUploadIcon(unit.id, event)}/>
                            </label>
                        </div>
                    ) : null}
                </div>
                <input
                    className="char-name-input"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                    maxLength={40}
                    title="Переименовать персонажа"
                />
            </div>

            <div className="hp-bar-wrap">
                <div className="hp-bar-track">
                    <div className={`hp-bar-fill ${hpClass}`} style={{width: `${hpPct}%`}}/>
                </div>
                <div className="hp-text">
                    {unit.hp} / {unit.maxHp}
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-box">
                    <span className="stat-sym" style={{color: "red"}}>♥</span>
                    <span className="stat-lbl">Здоровье</span>
                    <div className="stat-row">
                        <button className="sbtn" onClick={() => onUnitHpChange(unit.id, -1)}>-</button>
                        <span className="sval">{unit.hp}</span>
                        <button className="sbtn" onClick={() => onUnitHpChange(unit.id, 1)}>+</button>
                    </div>
                </div>

                <div className="stat-box">
                    <span className="stat-sym" style={{color: "red"}}>♥</span>
                    <span className="stat-lbl">Макс HP</span>
                    <div className="stat-row">
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'maxHp', -1)}>-</button>
                        <span className="sval">{unit.maxHp}</span>
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'maxHp', 1)}>+</button>
                    </div>
                </div>

                <div className="stat-box">
                    <span className="stat-sym" style={{color: "green"}}>♣</span>
                    <span className="stat-lbl">Атака</span>
                    <div className="stat-row">
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'attack', -1)}>-</button>
                        <span className="sval">{unit.attack}</span>
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'attack', 1)}>+</button>
                    </div>
                </div>

                <div className="stat-box">
                    <span className="stat-sym" style={{color: "purple"}}>♠</span>
                    <span className="stat-lbl">Защита</span>
                    <div className="stat-row">
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'defense', -1)}>-</button>
                        <span className="sval">{unit.defense}</span>
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'defense', 1)}>+</button>
                    </div>
                </div>

                <div className="stat-box">
                    <span className="stat-sym" style={{color: "orange"}}>♦</span>
                    <span className="stat-lbl">Захват</span>
                    <div className="stat-row">
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'capture', -1)}>-</button>
                        <span className="sval">{unit.capture}</span>
                        <button className="sbtn" onClick={() => onUnitStatChange(unit.id, 'capture', 1)}>+</button>
                    </div>
                </div>
            </div>

            <div className="items-row">
                <div className="item-box">
                    <span>🌀</span>
                    <span>{unit.items?.teleport ?? 0}</span>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'teleport', 1)}>+</button>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'teleport', -1)}>-</button>
                </div>
                <div className="item-box">
                    <span>🏕️</span>
                    <span>{unit.items?.camp ?? 0}</span>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'camp', 1)}>+</button>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'camp', -1)}>-</button>
                </div>
                <div className="item-box">
                    <span>🪨</span>
                    <span>{unit.items?.returnStone ?? 0}</span>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'returnStone', 1)}>+</button>
                    <button className="sbtn" onClick={() => onUnitItemChange(unit.id, 'returnStone', -1)}>-</button>
                </div>
            </div>
        </article>
    );
}

export function LeftGamePanel(props: LeftGamePanelProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [iconPickerUnitId, setIconPickerUnitId] = useState<string | null>(null);
    const [folderIcons, setFolderIcons] = useState<string[]>([]);

    useEffect(() => {
        void (async () => {
            try {
                const icons = await API.getCharacterIcons();
                setFolderIcons(icons);
            } catch {
                setFolderIcons([]);
            }
        })();
    }, []);

    function onUploadIcon(unitId: string, event: ChangeEvent<HTMLInputElement>): void {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'image/png') {
            event.target.value = '';
            return;
        }

        void (async () => {
            const iconPath = await props.onUnitIconUpload(unitId, file);
            if (iconPath) {
                setFolderIcons((prev) => (prev.includes(iconPath) ? prev : [...prev, iconPath]));
            }
            setIconPickerUnitId(null);
        })();

        event.target.value = '';
    }

    const extras = props.game.extras;
    const statsPlayer = props.activeStatsPlayer;
    const units = playerUnits(props.game, statsPlayer);
    const queue = useMemo(() => {
        const queueByPlayer = extras?.queueByPlayer?.[statsPlayer] ?? [];
        return queueByPlayer
            .map((unitId) => props.game.units.find((unit) => unit.id === unitId && unit.player === statsPlayer))
            .filter((unit): unit is Unit => Boolean(unit));
    }, [extras?.queueByPlayer, props.game.units, statsPlayer]);

    const usedIconsFromGame = props.game.units
        .map((unit) => unit.icon)
        .filter((icon): icon is string => Boolean(icon && icon.startsWith('/assets/characters/')));
    const availableIcons = Array.from(new Set([...folderIcons, ...usedIconsFromGame]));

    const handleDragStart = (event: DragEvent, index: number) => {
        setDraggedIndex(index);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (event: DragEvent, targetIndex: number) => {
        event.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        props.onQueueReorder(statsPlayer, draggedIndex, targetIndex);
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const player1Name = props.game.player1.name;
    const player2Name = props.game.player2?.name ?? 'Игрок 2';
    const activePlayerName = props.currentPlayer === 'player1' ? player1Name : player2Name;
    const statsPlayerName = statsPlayer === 'player1' ? player1Name : player2Name;

    return (
        <aside className="panel game-left">
            <div className="player-tabs">
                <button
                    className={`player-tab ${statsPlayer === 'player1' ? 'active' : ''}`}
                    onClick={() => props.onStatsPlayerChange('player1')}
                >
          <span className="player-tab-main">
            <span className="player-tab-dot" style={{backgroundColor: props.game.player1.color}}/>
            {player1Name}
          </span>
                    <span className="player-tab-count">{props.game.player1.territory}</span>
                </button>
                <button
                    className={`player-tab ${statsPlayer === 'player2' ? 'active' : ''}`}
                    onClick={() => props.onStatsPlayerChange('player2')}
                >
          <span className="player-tab-main">
            <span className="player-tab-dot" style={{backgroundColor: props.game.player2?.color ?? '#2980b9'}}/>
            {player2Name}
          </span>
                    <span className="player-tab-count">{props.game.player2?.territory ?? 0}</span>
                </button>
            </div>
            <h2>Очередь персонажей</h2>
            <div className="queue-strip">
                {queue.map((unit, index) => (
                    <button
                        key={unit.id}
                        className="queue-icon"
                        draggable
                        onClick={() => props.onQueueFocus(statsPlayer, unit.id)}
                        onDragStart={(event) => handleDragStart(event, index)}
                        onDragOver={handleDragOver}
                        onDrop={(event) => handleDrop(event, index)}
                        onDragEnd={handleDragEnd}
                        title="ЛКМ: сортировка по расстоянию"
                        type="button"
                    >
                        <img src={unitIcon(unit)} alt={unit.name} className="queue-icon-img"/>
                    </button>
                ))}
            </div>
            <p className="muted">ЛКМ по иконке в очереди: сортировка.</p>

            {/*<h2>Захваченная территория</h2>*/}
            {/*<div className="resource-grid territory-grid">*/}
            {/*    <div className="resource-col">*/}
            {/*        <div className="resource-title">Игрок 1</div>*/}
            {/*        <div className="resource-row territory-row">*/}
            {/*            <span className="territory-dot" style={{backgroundColor: props.game.player1.color}}/>*/}
            {/*            <strong>{props.game.player1.territory}</strong>*/}
            {/*        </div>*/}
            {/*    </div>*/}
            {/*    <div className="resource-col">*/}
            {/*        <div className="resource-title">Игрок 2</div>*/}
            {/*        <div className="resource-row territory-row">*/}
            {/*            <span className="territory-dot"*/}
            {/*                  style={{backgroundColor: props.game.player2?.color ?? '#2980b9'}}/>*/}
            {/*            <strong>{props.game.player2?.territory ?? 0}</strong>*/}
            {/*        </div>*/}
            {/*    </div>*/}
            {/*</div>*/}

            <h2>Персонажи</h2>
            <div className="chars-list">
                {units.map((unit) => (
                    <UnitCard
                        key={unit.id}
                        unit={unit}
                        availableIcons={availableIcons}
                        isIconMenuOpen={iconPickerUnitId === unit.id}
                        onToggleIconMenu={(unitId) => setIconPickerUnitId((prev) => (prev === unitId ? null : unitId))}
                        onUnitIconSet={(unitId, icon) => {
                            props.onUnitIconSet(unitId, icon);
                            setIconPickerUnitId(null);
                        }}
                        onUploadIcon={onUploadIcon}
                        onUnitHpChange={props.onUnitHpChange}
                        onUnitStatChange={props.onUnitStatChange}
                        onUnitItemChange={props.onUnitItemChange}
                        onUnitRename={props.onUnitRename}
                        onDropDeckCard={props.onApplyDeckCardToUnit}
                        onHealDropToUnit={props.onHealDropToUnit}
                    />
                ))}
            </div>

            <h2>Склад</h2>
            <div className="resource-grid">
                <div className="resource-col">
                    <div className="resource-title">{statsPlayerName}</div>

                    <div className="resource-row">
                        <span>🌲</span>
                        <strong>{extras?.resources?.[statsPlayer]?.trees ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'trees', 1)}>+
                        </button>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'trees', -1)}>-
                        </button>
                    </div>

                    <div className="resource-row">
                        <span>🃏R</span>
                        <strong>{extras?.resources?.[statsPlayer]?.redJokers ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'redJokers', 1)}>+
                        </button>
                        <button className="sbtn"
                                onClick={() => props.onResourceChange(statsPlayer, 'redJokers', -1)}>-
                        </button>
                    </div>

                    <div className="resource-row">
                        <span>🃏B</span>
                        <strong>{extras?.resources?.[statsPlayer]?.blackJokers ?? 0}</strong>
                        <button className="sbtn"
                                onClick={() => props.onResourceChange(statsPlayer, 'blackJokers', 1)}>+
                        </button>
                        <button className="sbtn"
                                onClick={() => props.onResourceChange(statsPlayer, 'blackJokers', -1)}>-
                        </button>
                    </div>

                    <div className="resource-row">
                        <span>❤️</span>
                        <strong>{extras?.resources?.[statsPlayer]?.heal ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'heal', 1)}>+</button>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'heal', -1)}>-</button>
                    </div>

                    <div className="resource-row">
                        <span>🔃</span>
                        <strong>{extras?.resources?.[statsPlayer]?.buffDebuff ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'buffDebuff', 1)}>+</button>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'buffDebuff', -1)}>-</button>
                    </div>

                    <div className="resource-row">
                        <span>🎭</span>
                        <strong>{extras?.resources?.[statsPlayer]?.provocation ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'provocation', 1)}>+</button>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'provocation', -1)}>-</button>
                    </div>

                    <div className="resource-row">
                        <span>🗡️</span>
                        <strong>{extras?.resources?.[statsPlayer]?.egoStrike ?? 0}</strong>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'egoStrike', 1)}>+</button>
                        <button className="sbtn" onClick={() => props.onResourceChange(statsPlayer, 'egoStrike', -1)}>-</button>
                    </div>
                </div>
            </div>

            <p className="muted">Активный игрок: {activePlayerName}</p>
        </aside>
    );
}
