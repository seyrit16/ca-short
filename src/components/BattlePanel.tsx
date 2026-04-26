import React, {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import type {Game, PlayerKey, Unit} from "../types";
import "../styles/battlePanel.css";
import {Dice3D} from "./Dice3D.tsx";
import {BattleWheel} from "./BattleWheel.tsx";
import {RandomDropPopup, type RandomDropPopupRef} from "./RandomDropPopup.tsx";
import {CoinFlip} from "./CoinFlip.tsx";

type BattleStage = 'choice' | 'battle' | 'finished';
type BattlePhase = 'selecting-attacker' | 'selecting-defender' | 'rolling-d6' | 'waiting-wheel' | 'executing-attack' | 'monster-coin' | 'finished';
type TurnOwner = 'player1' | 'player2';

interface BattlePanelProps {
    game: Game;
    onMonsterChange?: (field: 'hp' | 'attack' | 'defense', value: number) => void;
    onApplyCombatAttack?: (payload: {
        attackerId: string | 'monster';
        defenderId: string | 'monster';
        mode: 'normal' | 'crit' | 'vulnerable' | 'blocking';
        critPercent: number;
    }) => void;
    onToBoard?: () => void;
    runMonsterBattleTrack: () => void;
    runPlayerBattleTrack: () => void;
}

interface BattleStartSnapshot {
    side1Owner: PlayerKey;
    side2Owner: PlayerKey | 'monster';
    unitsById: Record<string, { name: string; hp: number; defense: number; player: PlayerKey; icon: string }>;
    monster?: { name: string; hp: number; defense: number; icon: string };
}

interface BattleResultStat {
    id: string;
    name: string;
    side: string;
    sideKey: 'left' | 'right';
    icon: string;
    hpLost: number;
    defenseLost: number;
    dead: boolean;
}

interface BattleResultSummary {
    winnerName: string;
    leftTeamName: string;
    rightTeamName: string;
    stats: BattleResultStat[];
}

function getMonsterDiceConfig(stage: number): Record<'hp' | 'attack' | 'defense', number[]> {
    if (stage === 1) return {hp: [100], attack: [6], defense: [10]};
    if (stage === 2) return {hp: [100, 20, 20], attack: [10], defense: [20, 10]};
    return {hp: [100, 100, 20], attack: [20], defense: [20,10]};
}

function dieColorClass(sides: number): string {
    return `die-color-${sides}`;
}

function unitIcon(unit: Unit): string {
    if (unit.icon) return unit.icon;
    return unit.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png';
}

// Calculate damage
function calculateDamage(
    attackerAttack: number,
    defenderDefense: number,
    defenderHp: number,
    mode: 'normal' | 'crit' | 'vulnerable' | 'blocking',
    critPercent: number
): { totalDamage: number; defenseLoss: number; hpLoss: number; nextDefense: number; nextHp: number } {
    const baseDamage = Math.max(0, attackerAttack);
    const totalDamage = mode === 'crit' ? Math.round(baseDamage * (1 + critPercent / 100)) : baseDamage;

    if (mode === 'vulnerable') {
        const hpLoss = Math.min(defenderHp, totalDamage);
        return {
            totalDamage,
            defenseLoss: 0,
            hpLoss,
            nextDefense: defenderDefense,
            nextHp: Math.max(0, defenderHp - hpLoss),
        };
    }
    if (mode === 'blocking') {

        let hpLoss = Math.min(defenderHp, totalDamage - defenderDefense/2);
        if((totalDamage - defenderDefense/2)<0)
        {
            hpLoss = 0;
        }
        return {
            totalDamage,
            defenseLoss: 0,
            hpLoss,
            nextDefense: defenderDefense,
            nextHp: Math.max(0, defenderHp - hpLoss),
        };
    }

    const defenseLoss = Math.min(defenderDefense, totalDamage);
    const hpLoss = Math.min(defenderHp, totalDamage - defenseLoss);
    return {
        totalDamage,
        defenseLoss,
        hpLoss,
        nextDefense: Math.max(0, defenderDefense - defenseLoss),
        nextHp: Math.max(0, defenderHp - hpLoss),
    };
}


export const BattlePanel: React.FC<BattlePanelProps> = (props: BattlePanelProps) => {

    const dropPopupRef = useRef<RandomDropPopupRef>(null);
    const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const schedulePhase = (fn: () => void, delay: number) => {
        if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = setTimeout(fn, delay);
    };

    const game = props.game;
    const extras = game.extras;
    const monster = extras?.monster ?? {name: 'Монстр', hp: 30, attack: 8, defense: 8};
    const player1Name = game.player1.name;
    const player2Name = game.player2?.name ?? 'Игрок 2';

    // Stage and phase management
    const [stage, setStage] = useState<BattleStage>('choice');
    const [phase, setPhase] = useState<BattlePhase>('selecting-attacker');
    const [turnOwner, setTurnOwner] = useState<TurnOwner>('player1');

    // Group selections
    const [group1Owner, setGroup1Owner] = useState<PlayerKey | ''>('');
    const [group2Owner, setGroup2Owner] = useState<PlayerKey | 'monster' | ''>('');
    const [isMonsterBattle, setIsMonsterBattle] = useState(false);

    // Monster stage and calc
    const [monsterStage, setMonsterStage] = useState(1);
    const [monsterCalcStep, setMonsterCalcStep] = useState<'hp' | 'attack' | 'defense' | null>(null);
    const [monsterCalcRolls, setMonsterCalcRolls] = useState<Array<{ sides: number; value: number }>>([]);
    const [monsterCalcLocked, setMonsterCalcLocked] = useState(false);
    const [monsterCalcRolling, setMonsterCalcRolling] = useState(false);
    const [monsterTarget, setMonsterTarget] = useState<{ unit: Unit; number: number } | null>(null);

    // Battle dice
    const [d6Results, setD6Results] = useState<number[]>([]);
    const [d100Result, setD100Result] = useState<number | null>(null);
    const [isRollingD6, setIsRollingD6] = useState(false);
    const [isRollingD100, setIsRollingD100] = useState(false);
    const [d6AttackerCandidates, setD6AttackerCandidates] = useState<Unit[]>([]);
    const [d6PreviewValue] = useState(() => Math.floor(Math.random() * 6) + 1);
    const [d100PreviewValue] = useState(() => Math.floor(Math.random() * 100) + 1);

    // Selected units for battle
    const [attackerUnitId, setAttackerUnitId] = useState<string | null>(null);
    const [defenderUnitId, setDefenderUnitId] = useState<string | null>(null);

    // Wheel result
    const [wheelResult, setWheelResult] = useState<string | null>(null);
    const [showAttackButton, setShowAttackButton] = useState(false);
    const [critPercent, setCritPercent] = useState(50);
    const [battleWheel, setBattleWheel] = useState(true);
    const [attackMode, setAttackMode] = useState<'normal' | 'crit' | 'vulnerable' | 'block'>('normal');
    const [damageCalc, setDamageCalc] = useState<{
        totalDamage: number;
        defenseLoss: number;
        hpLoss: number;
        nextDefense: number;
        nextHp: number;
    } | null>(null);
    const [battleStartSnapshot, setBattleStartSnapshot] = useState<BattleStartSnapshot | null>(null);
    const [battleResultSummary, setBattleResultSummary] = useState<BattleResultSummary | null>(null);

    // Autobattle
    const [isAutoBattle, setIsAutoBattle] = useState(false);
    const [startBattleWheel, setStartBattleWheel] = useState(false)
    const [monsterCoinAutoToken, setMonsterCoinAutoToken] = useState(0);
    const autoBattleRef = useRef(false);
    const autoBattleActionFiredRef = useRef(false);
    const [wheelResultForAutoBattle, setWheelResultForAutoBattle] = useState<'crit' | 'counter-a' | null>(null);


    // Get units by group owner from QUEUE (only alive)
    const getQueueForOwner = useCallback((owner: PlayerKey | 'monster'): Unit[] => {
        if (owner === 'monster') return [];
        const queueIds = extras?.queueByPlayer?.[owner] ?? [];
        return queueIds
            .map(id => game.units.find(u => u.id === id && u.alive))
            .filter((u): u is Unit => Boolean(u));
    }, [extras?.queueByPlayer, game.units]);

    const group1Queue = useMemo(() => {
        if (!group1Owner) return [];
        return getQueueForOwner(group1Owner);
    }, [group1Owner, getQueueForOwner]);

    const group2Queue = useMemo(() => {
        if (!group2Owner) return [];
        return getQueueForOwner(group2Owner as PlayerKey);
    }, [group2Owner, getQueueForOwner]);

    // Check if it's monster's turn
    const isMonsterTurn = useMemo(() => {
        return isMonsterBattle && group2Owner === 'monster' && turnOwner !== group1Owner;
    }, [isMonsterBattle, turnOwner, group1Owner, group2Owner]);

    // Get defender queue for selection
    const defenderQueue = useMemo(() => {
        if (isMonsterTurn) return group1Queue;
        return turnOwner === group1Owner ? group2Queue : group1Queue;
    }, [isMonsterTurn, turnOwner, group1Owner, group1Queue, group2Queue]);

    //#######################################
    // Автобой
    //#######################################
    useEffect(() => {
        autoBattleRef.current = isAutoBattle;
    }, [isAutoBattle]);

    useEffect(() => {
        if (phase === 'monster-coin') {
            autoBattleActionFiredRef.current = false;
        }
    }, [phase]);

    useEffect(() => {
        if (!isAutoBattle || stage !== 'battle') return;
        if (autoBattleActionFiredRef.current) return;
        // Задержка между шагами — чтобы игрок видел что происходит
        const DELAY = 1200;

        // [1] когда из колеса выпадает контратака(повторныйй запуск колеса)
        if (phase === 'waiting-wheel' && wheelResultForAutoBattle === 'counter-a') {
            autoBattleActionFiredRef.current = true;
            setWheelResultForAutoBattle(null);
            setStartBattleWheel(false);
            schedulePhase(() => {
                if (autoBattleRef.current) setStartBattleWheel(true);
                autoBattleActionFiredRef.current = false;
            }, DELAY);
            return;
        }

        // [2] кнопка, чтобы показать монету(нажатие на кнопку "бросить монету")
        if (phase === 'selecting-attacker' && isMonsterTurn){
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (autoBattleRef.current) startMonsterCoinFlip();
            }, DELAY);
            return;
        }

        // [3] бросок кубика d6 для выбора кто будет атаковать
        if (phase === 'selecting-attacker' && d6AttackerCandidates.length === 0) {
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (autoBattleRef.current) rollD6();
            }, DELAY);
            return
        }

        // [4] выбор кто будет атаковать, когда кубиков несколько
        if (phase === 'selecting-attacker' && d6AttackerCandidates.length > 0) {
            autoBattleActionFiredRef.current = true;
            // Автовыбор атакующего — с максимальной атакой
            schedulePhase(() => {
                if (!autoBattleRef.current) return;
                const pick = d6AttackerCandidates.reduce((best, current) => {
                    if (!best) return current;
                    if (current.attack > best.attack) return current;
                    if (current.attack === best.attack && current.hp > best.hp) return current;
                    return best;
                }, d6AttackerCandidates[0]);
                selectAttackerFromCandidates(pick.id);
            }, DELAY);
            return
        }

        // [5] выбор цели нападения
        if (phase === 'selecting-defender') {
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (!autoBattleRef.current) return;
                // Автовыбор защитника - минимальная защита, затем минимальный HP
                const target = defenderQueue.reduce((best, current) => {
                    if (!best) return current;
                    if (current.defense < best.defense) return current;
                    if (current.defense === best.defense && current.hp < best.hp) return current;
                    return best;
                }, defenderQueue[0]);
                if (target) selectDefender(target.id);
            }, DELAY);
            return
        }

        // [6] сам бросок монеты
        if (phase === 'monster-coin') {
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (!autoBattleRef.current) return;
                setMonsterCoinAutoToken(prev => prev + 1);
            }, DELAY);
            return;
        }

        // [7] нажатие на кнопку атаковать, когда не нужно или уже не нужно бросать d100 для крит. урона
        if (showAttackButton && (wheelResult !== 'Крит. урон' || d100Result !== null)){
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (!autoBattleRef.current) return;
                executeAttack();
            }, DELAY);
            return
        }

        // [8] Бросок d100 для крит урона
        if (phase === 'waiting-wheel' && wheelResultForAutoBattle === 'crit') {
            autoBattleActionFiredRef.current = true;
            schedulePhase(() => {
                if (autoBattleRef.current){
                    rollD100();
                    setWheelResultForAutoBattle(null);
                }

            }, DELAY);
            return
        }

        // [9] кручение колеса битвы
        if (phase === 'waiting-wheel') {
            // autoBattleActionFiredRef.current = true;
            setStartBattleWheel(true);
            return;
        }

        // [10] игнор фаз где нужно дождаться конца
        if (phase === 'rolling-d6' || phase === 'executing-attack') {
            // Эти фазы — анимация, ничего делать не нужно
            return;
        }

    }, [isAutoBattle, phase, stage, d6AttackerCandidates, defenderQueue, showAttackButton, wheelResultForAutoBattle, wheelResult, d100Result]);
    //#######################################
    // Автобой
    //#######################################

    // Чистим таймаут при размонтировании компонента
    React.useEffect(() => {
        return () => {
            if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
        };
    }, []);

    const getUnitById = useCallback((id: string) => {
        return game.units.find(u => u.id === id) ?? null;
    }, [game.units]);


    // Get FULL queue with fixed numbers 1-5 (including dead units)
    const getFullQueueWithNumbers = useCallback((owner: PlayerKey | 'monster'): Array<{ unit: Unit | null; number: number }> => {
        if (owner === 'monster') return [];
        const queueIds = extras?.queueByPlayer?.[owner] ?? [];
        return queueIds.map((id, index) => {
            const unit = game.units.find(u => u.id === id) ?? null;
            return { unit, number: index + 1 };
        });
    }, [extras?.queueByPlayer, game.units]);

    // Count dead units for a player
    const getDeadCount = useCallback((owner: PlayerKey): number => {
        const fullQueue = getFullQueueWithNumbers(owner);
        return fullQueue.filter(({ unit }) => unit !== null && !unit.alive).length;
    }, [getFullQueueWithNumbers]);

    const ownerDisplayName = useCallback((owner: PlayerKey | 'monster'): string => {
        if (owner === 'player1') return player1Name;
        if (owner === 'player2') return player2Name;
        return monster.name;
    }, [monster.name, player1Name, player2Name]);

    const allUnitsForOwner = useCallback((owner: PlayerKey): Unit[] => {
        return getFullQueueWithNumbers(owner)
            .map(({ unit }) => unit)
            .filter((u): u is Unit => Boolean(u));
    }, [getFullQueueWithNumbers]);

    useEffect(() => {
        if (stage !== 'battle' || !battleStartSnapshot) return;

        const side1AliveCount = getQueueForOwner(battleStartSnapshot.side1Owner).length;
        const side2AliveCount = battleStartSnapshot.side2Owner === 'monster'
            ? (monster.hp > 0 ? 1 : 0)
            : getQueueForOwner(battleStartSnapshot.side2Owner).length;

        if (side1AliveCount > 0 && side2AliveCount > 0) return;

        const winnerOwner: PlayerKey | 'monster' = side1AliveCount > 0
            ? battleStartSnapshot.side1Owner
            : battleStartSnapshot.side2Owner;

        const side1Label = ownerDisplayName(battleStartSnapshot.side1Owner);
        const side2Label = ownerDisplayName(battleStartSnapshot.side2Owner);
        const stats: BattleResultStat[] = [];

        Object.entries(battleStartSnapshot.unitsById).forEach(([id, start]) => {
            const current = game.units.find(u => u.id === id);
            const currentHp = current?.hp ?? 0;
            const currentDefense = current?.defense ?? 0;
            stats.push({
                id,
                name: start.name,
                side: start.player === battleStartSnapshot.side1Owner ? side1Label : side2Label,
                sideKey: start.player === battleStartSnapshot.side1Owner ? 'left' : 'right',
                icon: start.icon,
                hpLost: Math.max(0, start.hp - currentHp),
                defenseLost: Math.max(0, start.defense - currentDefense),
                dead: current ? !current.alive : true,
            });
        });

        if (battleStartSnapshot.side2Owner === 'monster' && battleStartSnapshot.monster) {
            stats.push({
                id: 'monster',
                name: battleStartSnapshot.monster.name,
                side: side2Label,
                sideKey: 'right',
                icon: battleStartSnapshot.monster.icon,
                hpLost: Math.max(0, battleStartSnapshot.monster.hp - monster.hp),
                defenseLost: Math.max(0, battleStartSnapshot.monster.defense - monster.defense),
                dead: monster.hp <= 0,
            });
        }

        setBattleResultSummary({
            winnerName: ownerDisplayName(winnerOwner),
            leftTeamName: side1Label,
            rightTeamName: side2Label,
            stats,
        });

        setIsAutoBattle(false);
        autoBattleActionFiredRef.current = false;
        setStartBattleWheel(false);
        setStage('finished');
        setPhase('finished');
    }, [battleStartSnapshot, game.units, getQueueForOwner, monster.defense, monster.hp, ownerDisplayName, stage]);

    // Monster calculation
    async function handleMonsterCalculate(): Promise<void> {
        if (!props.onMonsterChange) return;
        setMonsterCalcLocked(true);
        const config = getMonsterDiceConfig(monsterStage);

        for (const stat of ['hp', 'attack', 'defense'] as const) {
            const sides = config[stat];
            const rolled = sides.map(s => ({sides: s, value: Math.floor(Math.random() * s) + 1}));

            setMonsterCalcStep(stat);
            setMonsterCalcRolls(rolled);
            setMonsterCalcRolling(true);

            await new Promise(r => setTimeout(r, 2000));
            setMonsterCalcRolling(false);

            await new Promise(r => setTimeout(r, 3000));
            const total = rolled.reduce((sum, d) => sum + d.value, 0);

            props.onMonsterChange(stat, total);
        }

        setMonsterCalcStep(null);
        setMonsterCalcRolls([]);
        setMonsterCalcLocked(false);
    }

    // Handle group selections
    const handleGroup1Select = (playerKey: PlayerKey) => {
        setGroup1Owner(playerKey);
    };

    const handleGroup2Select = (playerKey: PlayerKey | 'monster') => {
        setGroup2Owner(playerKey);
        setIsMonsterBattle(playerKey === 'monster');
    };

    // Start battle
    const startBattle = () => {
        if (isMonsterBattle){
            props.runMonsterBattleTrack();
        }
        else{
            props.runPlayerBattleTrack();
        }

        if (!group1Owner || !group2Owner) return;

        const unitsById: BattleStartSnapshot['unitsById'] = {};
        allUnitsForOwner(group1Owner).forEach((u) => {
            unitsById[u.id] = {name: u.name, hp: u.hp, defense: u.defense, player: u.player, icon: unitIcon(u)};
        });
        if (group2Owner !== 'monster') {
            allUnitsForOwner(group2Owner).forEach((u) => {
                unitsById[u.id] = {name: u.name, hp: u.hp, defense: u.defense, player: u.player, icon: unitIcon(u)};
            });
        }

        setBattleStartSnapshot({
            side1Owner: group1Owner,
            side2Owner: group2Owner,
            unitsById,
            monster: group2Owner === 'monster'
                ? {name: monster.name, hp: monster.hp, defense: monster.defense, icon: '/assets/monster.png'}
                : undefined,
        });
        setBattleResultSummary(null);
        setStage('battle');
        setPhase('selecting-attacker');
        setTurnOwner(group1Owner as TurnOwner);
        setD6Results([]);
        setD100Result(null);
        setAttackerUnitId(null);
        setDefenderUnitId(null);
        setWheelResult(null);
        setShowAttackButton(false);
        setDamageCalc(null);
        setD6AttackerCandidates([]);
    };

    // Roll d6 for attacker selection (multiple dice based on dead count)
    const rollD6 = () => {
        setIsRollingD6(true);
        setD6Results([]);
        setD6AttackerCandidates([]);

        const currentPlayer = turnOwner;
        const deadCount = getDeadCount(currentPlayer);
        // 0-1 dead = 1 die, 2-3 dead = 2 dice, 4+ dead = 3 dice
        const diceCount = deadCount >= 4 ? 3 : deadCount >= 2 ? 2 : 1;

        // Roll all dice
        const results: number[] = [];
        for (let i = 0; i < diceCount; i++) {
            // eslint-disable-next-line react-hooks/purity
            results.push(Math.floor(Math.random() * 6) + 1);
        }

        setD6Results(results);

        schedulePhase(() => {
            setIsRollingD6(false);

            // Get full queue with fixed numbers
            const fullQueue = getFullQueueWithNumbers(currentPlayer);

            // Find living units matching any dice result
            const livingMatches: Unit[] = [];
            for (const roll of results) {
                if (roll >= 1 && roll <= 5) {
                    const slot = fullQueue.find(q => q.number === roll);
                    if (slot?.unit && slot.unit.alive) {
                        livingMatches.push(slot.unit);
                    }
                }
            }

            // Remove duplicates
            const uniqueMatches = livingMatches.filter((u, i, arr) =>
                arr.findIndex(t => t.id === u.id) === i
            );

            if (uniqueMatches.length === 0) {
                // No living characters match - turn passes to opponent
                schedulePhase(() => switchTurn(), 1500);
            } else if (uniqueMatches.length === 1) {
                //####### Autobattle
                autoBattleActionFiredRef.current =false;
                // #########

                // Exactly one match - auto-select
                setAttackerUnitId(uniqueMatches[0].id);
                if (isMonsterBattle && turnOwner !== group2Owner) {
                    setDefenderUnitId('monster');
                    setPhase('waiting-wheel');
                } else {
                    setPhase('selecting-defender');
                }
            } else {
                //####### Autobattle
                autoBattleActionFiredRef.current =false;
                // #########

                // Multiple matches - let player choose
                setD6AttackerCandidates(uniqueMatches);
            }
        }, 1500);
    };

    // Select attacker from multiple candidates
    const selectAttackerFromCandidates = (unitId: string) => {
        setAttackerUnitId(unitId);
        setD6AttackerCandidates([]);
        if (isMonsterBattle && turnOwner !== group2Owner) {
            setDefenderUnitId('monster');
            setPhase('waiting-wheel');
        } else {
            setPhase('selecting-defender');
        }

        autoBattleActionFiredRef.current = false;
    };

    // Select defender manually
    const selectDefender = (unitId: string) => {
        setDefenderUnitId(unitId);
        setPhase('waiting-wheel');

        autoBattleActionFiredRef.current = false;
    };

    const startMonsterCoinFlip = () => {
        const targetPlayer = turnOwner === group1Owner
            ? (group2Owner as PlayerKey)
            : (group1Owner as PlayerKey);
        const fullQueue = getFullQueueWithNumbers(targetPlayer);
        const alive = fullQueue.filter(q => q.unit?.alive);

        if (alive.length === 0) {
            switchTurn();
            return;
        }

        const picked = alive[Math.floor(Math.random() * alive.length)];
        setMonsterTarget(picked as { unit: Unit; number: number });
        autoBattleActionFiredRef.current = false;
        setPhase('monster-coin');
    };

    // Roll d100 for crit
    const rollD100 = () => {

        setIsRollingD100(true);
        setD100Result(null);
        const result = Math.floor(Math.random() * 100) + 1;
        setD100Result(result);

        setTimeout(() => {
            setIsRollingD100(false);
            setCritPercent(result);
            setShowAttackButton(true);
            autoBattleActionFiredRef.current = false;
        }, 1500);
    };

    // Execute attack
    const executeAttack = () => {
        if (!attackerUnitId && !isMonsterTurn) return;
        const effectiveAttackerId = isMonsterTurn ? 'monster' : attackerUnitId!;

        let attackerAttack = 0;
        let defenderDefense = 0;
        let defenderHp = 0;

        if (attackerUnitId === 'monster') {
            attackerAttack = monster.attack;
        } else {
            const attacker = game.units.find(u => u.id === attackerUnitId);
            if (attacker) attackerAttack = attacker.attack;
        }

        if (defenderUnitId === 'monster') {
            defenderDefense = monster.defense;
            defenderHp = monster.hp;
        } else if (defenderUnitId) {
            const defender = game.units.find(u => u.id === defenderUnitId);
            if (defender) {
                defenderDefense = defender.defense;
                defenderHp = defender.hp;
            }
        }

        const calc = calculateDamage(attackerAttack, defenderDefense, defenderHp, attackMode, critPercent);

        setPhase('executing-attack');
        setDamageCalc(calc);

        // Call parent handler if provided
        if (props.onApplyCombatAttack && defenderUnitId) {
            props.onApplyCombatAttack({
                attackerId: effectiveAttackerId,
                defenderId: defenderUnitId as string | 'monster',
                mode: attackMode,
                critPercent,
            });
        }

        switch (attackMode){
            case 'normal': {
                const damagePhrases = ["Точный выпад", "Энергия проникает в цель", "Нарушение целостности подтверждено", "Я чувствую, как слабеет твоя оболочка", "Твое сопротивление — лишь формальность", "Клинок находит путь", "Магия не знает преград", "Еще один шаг к твоему закату", "Ты открываешься для более глубоких ран", "Никакой лишней силы, только расчет", "Ткань реальности вокруг тебя дрожит", "Медленно, но верно", "Мои тени уже внутри тебя", "Сталь любит плоть", "Энтропия берет свое", "Ты замедляешься", "Это было неизбежно", "Сквозь доспех, сквозь волю", "Твой распад начался", "Я лишь коснулся тебя, а ты уже пошатнулся", "Гармония боя нарушена", "Пустота приветствует твой урон", "Тактика оправдала себя", "Ничего личного, только финал", "Твое присутствие в этом мире тускнеет", "Удар достиг цели", "Ты не настолько неуязвим, как думал", "Материя уступает силе", "Твой конец — это моя работа", "Эфир впитывает твою боль", "Я видел эту брешь с самого начала", "Слишком медленно для меня", "Твое поражение — лишь вопрос времени", "Кости хрустят под тяжестью реальности", "Я чувствую, как ты слабеешь", "Моя воля сильнее твоей", "Просто, изящно, эффективно", "Твоя кровь — это просто прах", "Смерть идет по пятам", "Мир начинает забывать тебя", "Ты едва осознал, что я ударил", "Рана открыта", "Это лишь малая часть моего гнева", "Твоя плоть — иллюзия", "Я вытягиваю из тебя жизнь", "Тихий удар — самый верный", "Сталь поет свою песню", "Твои силы истекают", "Еще одна царапина... на пути к вечности", "Ты угасаешь", "Логика боя на моей стороне", "Все в порядке вещей", "Ты проиграл этот размен", "Смерть шепчет тебе", "Продолжаем", "СДОХНИ!", "ПОЛУЧАЙ, ТВАРИНА!", "БУДЬ ТЫ ПРОКЛЯТ!", "РАЗРЫВАЙСЯ!", "ТЫ УПАДЕШЬ ПЕРЕДО МНОЙ!", "ИЗ ТЕБЯ ТЕЧЕТ ЖИЗНЬ, КАК ВОДА!", "МНЕ МАЛО ТВОИХ СТРАДАНИЙ!", "Я ИЗРЕЖУ ТЕБЯ В ЛОСКУТЫ!", "ГОРЕЦ! СГОРАЙ В АДУ!", "КРОВЬ! ДАЙТЕ МНЕ ЕЩЕ КРОВИ!", "ТЫ НИКТО!", "ЭТО ТЕБЕ ЗА ВСЕХ НАС!", "Я ВЫРВУ ТВОИ ГЛАЗА!", "ТЫ БУДЕШЬ МОЛИТЬ О СМЕРТИ!", "ВКУСИ МОЮ ЯРОСТЬ!", "РАЗМАЖУ ТЕБЯ ПО ЗЕМЛЕ!", "БОЛЬШЕ! БОЛЬШЕ УРОНА!", "Я СЛОМАЮ ТВОИ КОСТИ!", "ТВОЙ КРИК МУЗЫКА ДЛЯ МЕНЯ!", "ТЫ ПЫЛЬ!", "УМИРАЙ МЕДЛЕННО!", "ЭТО ТОЛЬКО НАЧАЛО!", "Я РАЗОРВУ ТЕБЯ НА КУСКИ!", "ПОЧУВСТВУЙ МОЮ НЕНАВИСТЬ!", "ТВОЯ ПЛОТЬ ПРИНАДЛЕЖИТ МНЕ!", "СДОХНИ, МРАЗЬ!", "Я ТЕБЯ НЕНАВИЖУ!", "НЕТ ТЕБЕ ПОЩАДЫ!", "ТЕПЕРЬ ТЫ МОЙ!", "РАЗНОШУ В ЩЕПКИ!", "ТВОЯ СМЕРТЬ БУДЕТ ГРОМКОЙ!", "Я ВЫПУЩУ ТВОИ КИШКИ!", "ПОЛУЧАЙ ЕЩЕ!", "ЭТО ДЛЯ ТВОЕГО КОНЦА!", "Я ТЕБЯ ПОРВУ!", "ТЫ НИЧТОЖЕСТВО!", "ТВОИ ВОПЛИ БЕСПОЛЕЗНЫ!", "БОЛЬШЕ ЯРОСТИ!", "Я ПОЖРУ ТЕБЯ!", "ТЫ БУДЕШЬ МОИМ ТРОФЕЕМ!", "КРОВЬ ЗА КРОВЬ!", "Я СТЕРУ ТЕБЯ В ПОРОШОК!", "УМИРАЙ В АГОНИИ!", "ТЫ НЕ ЗНАЕШЬ, С КЕМ СВЯЗАЛСЯ!", "ТВОЙ КОНЕЦ БЛИЗКО!", "Я СЛОМАЛ ТЕБЯ!", "НИКТО НЕ УЙДЕТ!", "ТВОЯ АГОНИЯ ПРЕКРАСНА!", "Я ВЫРВУ ТВОЕ СЕРДЦЕ!", "ТЫ НЕ ЖИЛЕЦ!", "СДОХНИ У МОИХ НОГ!", "Я РАЗОРВУ ЭТУ РЕАЛЬНОСТЬ!", "СЛАВА МОЕМУ КЛИНКУ!", "ТЫ ТРУП!", "А-А-А-А-А!"];

                const icon = isMonsterTurn ? 'assets/monster.png' : getUnitById(attackerUnitId)?.icon;
                dropPopupRef.current?.show({
                    imagePaths: [icon.toString()],
                    messages: damagePhrases
                })
                break;
            }
            case "crit":{
                const criticalDamagePhrases = ["Это финал", "Идеальное завершение", "Реальность трещит по швам", "Твое существование подходит к концу", "Удар абсолютной истины", "Тишина поглотит тебя", "Ты был ошибкой мироздания", "Смерть требует тишины", "Ты сломлен", "Моя воля — это твоя смерть", "Твой конец — это дар", "Никакой надежды больше", "Свет гаснет", "Ты больше не существуешь", "Энергия бездны поглощает тебя", "Бесповоротный финал", "Ты был достоин этого удара", "Смерть — это освобождение", "Твой дух распадается", "Я разрываю твою связь с миром", "Это был решающий аргумент", "Пустота ждет тебя", "Твое тело — лишь прах", "Ничего не останется", "Ты исчезнешь без следа", "Истина в этом ударе", "Ты проиграл всё", "Твой конец был написан", "Я — твой конец", "Жизнь покидает тебя", "Это удар самой судьбы", "Никакого возврата", "Твой распад неизбежен", "Забудь о боли, забудь обо всем", "Финал близок", "Я уничтожаю твою суть", "Мир освобожден от тебя", "Ты — история", "Смерть поет", "Твой дух сломан", "Это была твоя последняя битва", "Никакого спасения", "Я разбил твою волю", "Конец", "Ты падаешь", "Тьма забирает тебя", "Это триумф", "Твой прах разнесет ветер", "Никакого будущего", "Ты был ничем", "Смерть — твой единственный выход", "Удар, ломающий саму реальность", "Ты больше не ты", "Все кончено", "Прощай", "РАЗНОШУ В ПЫЛЬ!", "ТЫ УМРЕШЬ ЗДЕСЬ И СЕЙЧАС!", "НИКАКИХ ШАНСОВ!", "СДОХНИ В МУКАХ!", "Я ТЕБЯ УНИЧТОЖИЛ!", "ТЫ В ЩЕПКИ!", "ТВОЯ СМЕРТЬ БУДЕТ ГРОМКОЙ!", "Я ВЫБИЛ ИЗ ТЕБЯ ДУХ!", "СГОРЕЛА ТВОЯ ЖИЗНЬ!", "ЭТО КОНЕЦ, УРОД!", "Я ТЕБЯ ПЕРЕЕХАЛ!", "РАЗМОЗЖИЛ ТВОЙ ЧЕРЕП!", "ТЫ — НИЧТО!", "ТВОЙ КОНЕЦ ПРИШЕЛ!", "Я УБИЛ ТЕБЯ!", "НИКАКОЙ ПОЩАДЫ!", "В КАШУ! ТЫ В КАШУ!", "Я ТЕБЯ СТЕР!", "ТЫ БОЛЬШЕ НЕ ВСТАНЕШЬ!", "ТВОЯ СМЕРТЬ — МОЙ ТРИУМФ!", "Я ТЕБЯ РАЗОРВАЛА!", "БОЛЬШЕ НЕТ ТЕБЯ!", "Я УНИЧТОЖИЛ ВСЁ, ЧТО ТЫ ЕСТЬ!", "ТЫ ТРУП!", "ТВОИ КОСТИ — МОЯ ДОБЫЧА!", "СДОХНИ! СДОХНИ!", "Я ПОБЕДИТЕЛЬ!", "ТВОЯ ЖИЗНЬ ОКОНЧЕНА!", "РАЗРЫВАЮ НА КУСКИ!", "ТЫ БОЛЬШЕ НЕ ОПАСЕН!", "Я ТЕБЯ УНИЧТОЖИЛ!", "ЭТО БЫЛ ТВОЙ ПОСЛЕДНИЙ ВДОХ!", "Я РАЗМОЗЖИЛ ТВОЕ СЕРДЦЕ!", "ТЫ РАССЫПАЛСЯ!", "НИКОГДА НЕ ПЫТАЙСЯ СНОВА!", "Я ТЕБЯ УБИЛ!", "ТВОЯ СМЕРТЬ ТАК ПРЕКРАСНА!", "Я РАЗОРВАЛ ТЕБЯ!", "ВСЁ, ТЕБЯ БОЛЬШЕ НЕТ!", "ТЫ УПАЛ! УПАЛ НАВСЕГДА!", "Я ТЕБЯ РАЗМАЗАЛ!", "НИКОГО ТЕБЯ НЕ СПАСЕТ!", "ТЫ СДОХ!", "Я ТЕБЯ ПОЖРАЛ!", "ТВОЯ АГОНИЯ ЗАКОНЧИЛАСЬ!", "ТЫ В ПЫЛЬ!", "Я ТЕБЯ ПОРВАЛ!", "ТЫ НИКТО!", "СМЕРТЬ ТЕБЕ!", "ТВОЙ ПРАХ ВЕЗДЕ!", "Я ПОБЕДИЛ!", "ТЫ БОЛЬШЕ НЕ ДЫШИШЬ!", "ЭТО БЫЛО КРАСИВО!", "ТЫ ТРУП!", "А-А-А-А-А-А!"];

                const icon = isMonsterTurn ? 'assets/monster.png' : getUnitById(attackerUnitId).icon;
                dropPopupRef.current?.show({
                    imagePaths: [icon],
                    messages: criticalDamagePhrases,
                })
                break;
            }
            case "vulnerable":{
                const ignoreArmorPhrases = ["Броня здесь тонка", "Слабость обнажена", "Я вижу, где ты боишься смерти", "Твоя защита — лишь иллюзия", "Хирургическая точность", "Здесь ты не защищен", "Я найду любой изъян", "Идеально в цель", "Железо не спасет от моей воли", "Разделяю твою плоть", "Тут нет ничего, кроме слабости", "Слишком много открытых зон", "Брешь в твоем естестве", "Ты забыл прикрыть самое важное", "Энтропия проникает внутрь", "Твой доспех — просто мусор", "Я вижу, как ты дрожишь", "Смерть входит через эту дверь", "Никакой брони против правды", "Ты уязвим для меня", "Твой пульс выдает тебя", "Магия найдет путь", "Я изучал тебя, монстр", "Вот где кончается твоя сила", "Это больно, да?", "Только в незащищенное место", "Твоя шкура — не преграда", "О, как легко вошло", "Я чувствую твою незащищенность", "Твой щит не прикрыл бок", "Прекрасный разрез", "Сквозь слои, прямо в сердце", "Твое естество так хрупко", "Я нашел слабое звено", "Глубина удара достаточна", "Твоя кожа как масло", "Бесполезная попытка закрыться", "Я вижу каждое дыхание", "Смертельный укол", "Твой конец начинается здесь", "Ты открыт, как книга", "Мастерство против грубой защиты", "Никаких преград между мной и твоей болью", "Уязвимость — это твоя суть", "Я разрываю твою защиту", "Всегда есть щель", "Мой клинок голоден до такого", "Слишком очевидно, где ты слаб", "Твой щит тебя предал", "Я заберу твою силу через эту дыру", "Почувствуй холод внутри", "Ты не защищен от бездны", "Никаких секретов от моего клинка", "Смерть требует прямого пути", "Ты пуст внутри", "НАШЕЛ ТВОЮ ДЫРУ, ТВАРЬ!", "ТАК ТЕБЕ И НАДО, БЕЗЗАЩИТНЫЙ!", "ТВОЯ ШКУРА НИЧТО!", "Я РАЗОРВУ ТВОЮ ПЛОТЬ!", "СМЕРТЬ ТЕБЕ В ЭТУ ЩЕЛЬ!", "ТЫ ОТКРЫТ, КАК ЖИВОТНОЕ!", "ТВОЯ БРОНЯ — ЭТО МУСОР!", "В САМОЕ МЯСО!", "ДЫРА В ТЕБЕ — МОЯ ПОБЕДА!", "ПРОБИЛ! НАКОНЕЦ-ТО ПРОБИЛ!", "Я ВИЖУ ТВОЮ ТРУСОСТЬ!", "ТЫ ТАКОЙ МЯГКИЙ!", "ПОЧУВСТВУЙ ЖЕЛЕЗО ВНУТРИ!", "НИКАКОЙ ЗАЩИТЫ ОТ МЕНЯ!", "Я ВЫПУЩУ ТВОИ ВНУТРЕННОСТИ!", "СЛАБОЕ МЕСТО! ВОТ ОНО!", "Я ТЕБЯ ВСКРОЮ!", "ТЫ ТАКОЙ НИЧТОЖНЫЙ БЕЗ БРОНИ!", "ПЕРЕЛОМ! ЕСТЬ ПЕРЕЛОМ!", "Я ТЕБЯ РАЗДЕЛАЮ!", "ГОЛОЕ МЯСО! МОЕ ЛЮБИМОЕ!", "ТЫ УЯЗВИМ, КАК НИКОГДА!", "Я РАЗОРВУ ТЕБЯ ШИРЕ!", "СМЕРТЬ В ТВОЮ ДЫРУ!", "ТЫ НЕ СПРЯЧЕШЬСЯ!", "Я ВИЖУ ТВОЮ КРОВЬ!", "РАЗРЫВАЮ! РАЗРЫВАЮ!", "ТВОЯ БРОНЯ ЛОПНУЛА!", "Я ТЕБЯ ВЫПОТРОШУ!", "ТЫ НЕ УСПЕЛ ЗАКРЫТЬСЯ!", "БОЛЬНО?! ДА, ЭТО БОЛЬНО!", "ТЫ СТАЛ МОЕЙ ЖЕРТВОЙ!", "Я ЗАЙДУ В ЭТУ ДЫРУ!", "ТВОЯ ЗАЩИТА — НИЧТО!", "РАСПОРЮ ТЕБЯ НА КУСКИ!", "ЕЩЕ ГЛУБЖЕ!", "ТЫ ОТКРЫЛ СЕРДЦЕ!", "Я ТЕБЯ ИЗРЕЖУ!", "ПРОБИВАЮ НАВЫЛЕТ!", "ТВОЯ ШКУРА ТРЕЩИТ!", "Я НАШЕЛ ТВОЮ СМЕРТЬ!", "НЕ СМЕЙ ПРЯТАТЬСЯ!", "В САМУЮ СУТЬ!", "ТЫ ОТКРЫЛСЯ, ТВАРЬ!", "Я ВЫРЕЖУ ТВОЕ ИМЯ НА ТВОЕМ МЯСЕ!", "ТЫ БОЛЬШЕ НЕ ЗАКРОЕШЬСЯ!", "ТВОЯ ПЛОТЬ РВЕТСЯ!", "ЭТО ТВОЙ КОНЕЦ!", "Я ВНУТРИ ТЕБЯ!", "ТЫ ТАКОЙ ЖАЛКИЙ!", "ОТКРЫВАЙСЯ ЕЩЕ!", "БОЛЬШЕ! МНЕ НУЖНО БОЛЬШЕ ДЫР!", "ТЫ ТРУП!", "СДОХНИ С ОТКРЫТОЙ РАНЫ!", "А-А-А-А!"];

                const icon = isMonsterTurn ? 'assets/monster.png' : getUnitById(attackerUnitId).icon;
                dropPopupRef.current?.show({
                    imagePaths: [icon],
                    messages: ignoreArmorPhrases,
                })
                break;
            }
        }

        // Reset after showing result
        schedulePhase(() => {
            setDamageCalc(null);
            setShowAttackButton(false);
            setD100Result(null);
            if (wheelResult === 'Контратака' && defenderUnitId) {
                // Counter-attack: swap attacker and defender
                setAttackerUnitId(defenderUnitId);
                setDefenderUnitId(attackerUnitId);
                switchTurn();
            } else {
                switchTurn();
            }
        }, 4000);


        setBattleWheel(true)
    };

    // Switch turn
    const switchTurn = () => {
        autoBattleActionFiredRef.current = false;
        setTurnOwner(prev => prev === 'player1' ? 'player2' : 'player1');
        setPhase('selecting-attacker');
        setD6Results([]);
        setD100Result(null);
        setAttackerUnitId(null);
        setDefenderUnitId(null);
        setWheelResult(null);
        setShowAttackButton(false);
        setD6AttackerCandidates([]);
    };

    // Handle wheel result
    const handleWheelResult = (resultLabel: string) => {
        autoBattleActionFiredRef.current = false;
        setStartBattleWheel(false);
        setWheelResult(resultLabel);

        let mode: 'normal' | 'crit' | 'vulnerable' | 'blocking' = 'normal';
        let needsD100 = false;

        if (resultLabel === 'Атака прошла') {
            mode = 'normal';
        } else if (resultLabel === 'Крит. урон') {
            mode = 'crit';
            needsD100 = true;
            setBattleWheel(false);

            setWheelResultForAutoBattle('crit')
        } else if (resultLabel === 'Удар в уязвимую зону') {
            mode = 'vulnerable';
        } else if (resultLabel === 'Парирование') {
            if(isMonsterTurn){
                const blockPhrases = ["Сталь встречает сталь", "Твой напор бесполезен", "Я предвидел этот выпад", "Щит держится, как и моя воля", "Твоя ярость разбивается о пустоту", "Слишком медленно для меня", "Принято на блок", "Ты тратишь силы зря", "Моя позиция непоколебима", "Никакого урона", "Держу оборону", "Твоя мощь — лишь эхо", "Я ожидаю большего", "Мой барьер не пробить", "Энергия погашена", "Ты уперся в стену", "Я вижу каждое твое движение", "Слишком очевидно", "Твой удар скользит мимо", "Я контролирую этот ритм", "Это было ожидаемо", "Магия защищает меня", "Держу строй", "Твои когти не страшны", "Скучно", "Попробуй снова", "Я не сдвинусь", "Твой натиск иссяк", "Защита безупречна", "Очередная неудача", "Я спокоен", "Стена выдержит", "Твой гнев меня не тронет", "Удар отбит", "Продолжаем этот танец", "Я готов к следующему", "Ты не пройдешь", "Мой доспех прочен", "Бесполезная атака", "Следи за собой", "Ты слаб в своем порыве", "Блокирую", "Это было близко, но недостаточно", "Я вижу твое отчаяние", "Щит сияет", "Пустота поглотила твой удар", "Статус-кво", "Твои усилия тщетны", "Я не почувствовал боли", "Мой черед", "Все по плану", "Ты не достоин пробить меня", "Ни шагу назад", "Слишком предсказуемо", "Не сегодня", "УБЕРИ СВОИ ГРЯЗНЫЕ ЛАПЫ!", "ТЫ НЕ ПРОБЬЕШЬ МЕНЯ, ТВАРИНА!", "СДОХНИ, ЗАКРЫВАЯСЬ!", "МОЙ ЩИТ СЛОМАЕТ ТВОИ КОСТИ!", "НЕ СМЕЙ ТРОГАТЬ МЕНЯ!", "ТЫ МЕНЯ НЕ ДОСТАНЕШЬ!", "ОТОЙДИ ОТ МЕНЯ!", "ТВОЙ УДАР — МУСОР!", "ХВАТИТ СТУЧАТЬ ПО МНЕ, УРОД!", "Я ТЕБЯ РАЗОРВУ!", "ТРУСЛИВАЯ АТАКА!", "ЭТО ВСЁ, НА ЧТО ТЫ СПОСОБЕН?!", "Я В ЯРОСТИ!", "ТЫ НЕ ТРОНЕШЬ МЕНЯ!", "Я ВЫБЬЮ ТЕБЕ ЗУБЫ!", "РАЗБИВАЙСЯ ОБ МЕНЯ!", "ТВОИ КОГТИ — НИЧТО!", "НЕ СМЕЙ ПРИБЛИЖАТЬСЯ!", "Я ТЕБЯ СОЖРУ!", "ТЫ БЕСИШЬ МЕНЯ!", "Я СЛОМАЮ ТЕБЯ!", "ОТВАЛИ!", "МОЯ ЗАЩИТА — ЭТО МОЯ ЯРОСТЬ!", "ТЫ НЕ УБЬЕШЬ МЕНЯ!", "ПРОМАХНУЛСЯ, ТВАРЬ!", "СЛИШКОМ МЕДЛЕННО!", "Я ТЕБЯ ИЗРЕЖУ!", "ЭТО БЫЛО ПАТЕТИЧНО!", "УБЕРИ ЭТО ОТ МЕНЯ!", "ТЫ НИКТО!", "БЕЙ ЕЩЕ! БЕЙ ЕЩЕ!", "Я ВЫСТОЮ!", "ТЫ СДОХНЕШЬ!", "Я ТЕБЯ ПОРВУ!", "НЕ СМЕЙ ДАЖЕ ЦАРАПАТЬ МЕНЯ!", "ТЫ ТРУС!", "Я ЗАЩИЩАЮСЬ, ЧТОБЫ УБИТЬ ТЕБЯ!", "ЭТОТ УДАР БЫЛ СМЕШЕН!", "Я ТЕБЯ УНИЧТОЖУ!", "ТЫ НЕ ДОСТОИН ДАЖЕ КОСНУТЬСЯ МОЕЙ БРОНИ!", "Я СЛОМАЮ ТВОЕ ОРУЖИЕ!", "СМЕРТЬ ТЕБЕ!", "ТЫ ПОПЛАТИШЬСЯ ЗА ЭТО!", "ОПЯТЬ?!", "НЕ СМЕЙ!", "ТЫ НИКТО!", "Я НЕ УПАДУ!", "МОЙ ЩИТ ЖАЖДЕТ КРОВИ!", "ПЕРЕЛОМ!", "ТЫ ОТКРЫЛСЯ!", "Я ТЕБЯ СЪЕМ!", "НЕ СМЕЙ БИТЬ!", "ТЫ ТРУП!", "А-А-А!", "СДОХНИ!"];

                dropPopupRef.current?.show({
                    imagePaths: ["assets/monster.png"],
                    messages: blockPhrases,
                })
            }else{
                const blockPhrases = ["Сталь встречает сталь", "Твой напор бесполезен", "Я предвидел этот выпад", "Щит держится, как и моя воля", "Твоя ярость разбивается о пустоту", "Слишком медленно для меня", "Принято на блок", "Ты тратишь силы зря", "Моя позиция непоколебима", "Никакого урона", "Держу оборону", "Твоя мощь — лишь эхо", "Я ожидаю большего", "Мой барьер не пробить", "Энергия погашена", "Ты уперся в стену", "Я вижу каждое твое движение", "Слишком очевидно", "Твой удар скользит мимо", "Я контролирую этот ритм", "Это было ожидаемо", "Магия защищает меня", "Держу строй", "Твои когти не страшны", "Скучно", "Попробуй снова", "Я не сдвинусь", "Твой натиск иссяк", "Защита безупречна", "Очередная неудача", "Я спокоен", "Стена выдержит", "Твой гнев меня не тронет", "Удар отбит", "Продолжаем этот танец", "Я готов к следующему", "Ты не пройдешь", "Мой доспех прочен", "Бесполезная атака", "Следи за собой", "Ты слаб в своем порыве", "Блокирую", "Это было близко, но недостаточно", "Я вижу твое отчаяние", "Щит сияет", "Пустота поглотила твой удар", "Статус-кво", "Твои усилия тщетны", "Я не почувствовал боли", "Мой черед", "Все по плану", "Ты не достоин пробить меня", "Ни шагу назад", "Слишком предсказуемо", "Не сегодня", "УБЕРИ СВОИ ГРЯЗНЫЕ ЛАПЫ!", "ТЫ НЕ ПРОБЬЕШЬ МЕНЯ, ТВАРИНА!", "СДОХНИ, ЗАКРЫВАЯСЬ!", "МОЙ ЩИТ СЛОМАЕТ ТВОИ КОСТИ!", "НЕ СМЕЙ ТРОГАТЬ МЕНЯ!", "ТЫ МЕНЯ НЕ ДОСТАНЕШЬ!", "ОТОЙДИ ОТ МЕНЯ!", "ТВОЙ УДАР — МУСОР!", "ХВАТИТ СТУЧАТЬ ПО МНЕ, УРОД!", "Я ТЕБЯ РАЗОРВУ!", "ТРУСЛИВАЯ АТАКА!", "ЭТО ВСЁ, НА ЧТО ТЫ СПОСОБЕН?!", "Я В ЯРОСТИ!", "ТЫ НЕ ТРОНЕШЬ МЕНЯ!", "Я ВЫБЬЮ ТЕБЕ ЗУБЫ!", "РАЗБИВАЙСЯ ОБ МЕНЯ!", "ТВОИ КОГТИ — НИЧТО!", "НЕ СМЕЙ ПРИБЛИЖАТЬСЯ!", "Я ТЕБЯ СОЖРУ!", "ТЫ БЕСИШЬ МЕНЯ!", "Я СЛОМАЮ ТЕБЯ!", "ОТВАЛИ!", "МОЯ ЗАЩИТА — ЭТО МОЯ ЯРОСТЬ!", "ТЫ НЕ УБЬЕШЬ МЕНЯ!", "ПРОМАХНУЛСЯ, ТВАРЬ!", "СЛИШКОМ МЕДЛЕННО!", "Я ТЕБЯ ИЗРЕЖУ!", "ЭТО БЫЛО ПАТЕТИЧНО!", "УБЕРИ ЭТО ОТ МЕНЯ!", "ТЫ НИКТО!", "БЕЙ ЕЩЕ! БЕЙ ЕЩЕ!", "Я ВЫСТОЮ!", "ТЫ СДОХНЕШЬ!", "Я ТЕБЯ ПОРВУ!", "НЕ СМЕЙ ДАЖЕ ЦАРАПАТЬ МЕНЯ!", "ТЫ ТРУС!", "Я ЗАЩИЩАЮСЬ, ЧТОБЫ УБИТЬ ТЕБЯ!", "ЭТОТ УДАР БЫЛ СМЕШЕН!", "Я ТЕБЯ УНИЧТОЖУ!", "ТЫ НЕ ДОСТОИН ДАЖЕ КОСНУТЬСЯ МОЕЙ БРОНИ!", "Я СЛОМАЮ ТВОЕ ОРУЖИЕ!", "СМЕРТЬ ТЕБЕ!", "ТЫ ПОПЛАТИШЬСЯ ЗА ЭТО!", "ОПЯТЬ?!", "НЕ СМЕЙ!", "ТЫ НИКТО!", "Я НЕ УПАДУ!", "МОЙ ЩИТ ЖАЖДЕТ КРОВИ!", "ПЕРЕЛОМ!", "ТЫ ОТКРЫЛСЯ!", "Я ТЕБЯ СЪЕМ!", "НЕ СМЕЙ БИТЬ!", "ТЫ ТРУП!", "А-А-А!", "СДОХНИ!"];

                dropPopupRef.current?.show({
                    imagePaths: [getUnitById(attackerUnitId).icon],
                    messages: blockPhrases,
                })
            }
            schedulePhase(() => {
                switchTurn();
            }, 500);
            return;
        }else if (resultLabel === 'Блок'){
            mode = 'blocking';
        }else if (resultLabel === 'Контратака') {

            const counterAttackPhrases = ["Опасный выпад", "Ты застал меня врасплох", "Ошибка в расчетах", "Неудачный маневр", "Я открылся...", "Хороший удар", "Ты был быстрее", "Признаю твою ловкость", "Я недооценил тебя", "Острая боль", "Твоя контратака была своевременна", "Слишком близко", "Это было рискованно", "Ты нашел слабость", "Неплохой ответ", "Я должен быть осторожнее", "Это было больно", "Слишком самоуверенно с моей стороны", "Ты используешь мои же приемы", "Я не ожидал такой скорости", "Это было... эффективно", "Твой удар достиг цели", "Я открыт", "Надо собраться", "Это было мастерски", "Твой ответ был точен", "Ты ловишь меня на ошибках", "Осторожнее...", "Я был неосторожен", "Твоя мощь растет", "Хороший контрудар", "Я впечатлен", "Твое мастерство выше", "Болезненный урок", "Я должен адаптироваться", "Ты перехитрил меня", "Снова контратака", "Я теряю контроль", "Неудачная позиция", "Твой ответ смертелен", "Я открылся для боли", "Мастерский ответ", "Я ошибся", "Твоя атака была верной", "Я расплачиваюсь за ошибку", "Сильный удар", "Я должен бить точнее", "Твоя техника идеальна", "Я застигнут врасплох", "Больно", "Надо менять тактику", "Ты опасен", "Это был решающий ответ", "Слишком поздно закрылся", "Неплохо", "ТЫ ПОСМЕЛ?!", "БОЛЬНО?! ДА, БОЛЬНО!", "АХ ТЫ ГАД!", "ЗА ЭТО ТЫ ПОПЛАТИШЬСЯ!", "НЕ СМЕЙ ТРОГАТЬ МЕНЯ!", "ТЫ МЕНЯ РАЗОЗЛИЛ!", "Я ТЕБЯ ПОРВУ!", "ТЫ УДАРИЛ МЕНЯ?!", "СДОХНИ!", "Я РАЗОРВУ ТЕБЯ!", "ТЫ НЕ СМЕЕШЬ ОТВЕЧАТЬ!", "ТЫ ПОЖАЛЕЕШЬ ОБ ЭТОМ!", "Я ТЕБЯ ПОРВУ НА КУСКИ!", "ТЫ ХОЧЕШЬ ВОЙНЫ?!", "ОТВЕЧАЙ МНЕ ТЕМ ЖЕ!", "СДОХНИ, ГАДИНА!", "БОЛЬШЕ! БОЛЬШЕ БОЛИ!", "Я В ЯРОСТИ!", "ТЫ СДЕЛАЛ МНЕ БОЛЬНО!", "Я ТЕБЯ УБЬЮ!", "ТЫ ТРУП!", "ЭТО БЫЛА ТВОЯ ПОСЛЕДНЯЯ ОШИБКА!", "Я ВЫПУЩУ ТВОИ КИШКИ!", "ТЫ ПОПЛАТИШЬСЯ!", "Я ТЕБЯ УНИЧТОЖУ!", "САМ НАПРОСИЛСЯ!", "ТЫ ПОЛУЧИШЬ ВДВОЙНЕ!", "Я РАЗОРВУ ТЕБЯ!", "НИКОГО НЕ СМЕЙ ТРОГАТЬ!", "ТЫ — МЯСО!", "Я ВЫРВУ ТВОЕ СЕРДЦЕ!", "ЭТО ВСЕ, НА ЧТО ТЫ СПОСОБЕН?!", "СДОХНИ, ТРУС!", "Я ВЫПУЩУ ТВОЮ КРОВЬ!", "ТЫ НЕ УЙДЕШЬ!", "Я ПОРВУ ТЕБЯ!", "ТЫ БОЛЬШЕ НЕ СДЕЛАЕШЬ ЭТОГО!", "БОЛЬ! Я ХОЧУ БОЛЬ!", "Я РАЗНЕСУ ТЕБЯ!", "ТЫ ПОПЛАТИШЬСЯ!", "ЭТО ВСЁ, ЧТО У ТЕБЯ ЕСТЬ?!", "Я УБЬЮ ТЕБЯ!", "ТЫ ТРУП!", "НЕ СМЕЙ СМЕЯТЬСЯ!", "Я ВЫБЬЮ ИЗ ТЕБЯ ДУХ!", "ТЫ ПОПЛАТИШЬСЯ!", "СМЕРТЬ ТЕБЕ!", "Я РАЗОРВУ ТЕБЯ В КЛОЧЬЯ!", "ТЫ БОЛЬШЕ НЕ ВСТАНЕШЬ!", "ТВОЯ СМЕРТЬ ПРИШЛА!", "Я ТЕБЯ СЪЕМ!", "НЕ СМЕЙ БИТЬ МЕНЯ!", "Я УНИЧТОЖУ ТЕБЯ!", "ТЫ ПОЖАЛЕЕШЬ!", "А-А-А-А-А!"];

            const icon = isMonsterTurn ? 'assets/monster.png' : getUnitById(attackerUnitId).icon;
            dropPopupRef.current?.show({
                imagePaths: [icon],
                messages: counterAttackPhrases,
            })

            //setTurnOwner(prev => prev === 'player1' ? 'player2' : 'player1');
            setD6Results([]);
            setD100Result(null);
            const temp = attackerUnitId;
            setAttackerUnitId(defenderUnitId);
            setDefenderUnitId(temp);
            setWheelResult(null);
            setShowAttackButton(false);

            autoBattleActionFiredRef.current = false;
            setStartBattleWheel(true);
            setPhase("waiting-wheel")
            setWheelResultForAutoBattle('counter-a')

            // setAttackMode('normal');
            // setShowAttackButton(true);
            return;
        }

        setAttackMode(mode);

        if (needsD100) {
            // Для крита кнопку атаки открываем только после завершения броска d100.
            setShowAttackButton(false);
        } else {
            setShowAttackButton(true);
        }
    };

    // Get current attacker/defender units
    const attackerUnit = useMemo(() => {
        if (!attackerUnitId) return null;
        return game.units.find(u => u.id === attackerUnitId) || null;
    }, [attackerUnitId, game.units]);

    const defenderUnit = useMemo(() => {
        if (!defenderUnitId) return null;
        return game.units.find(u => u.id === defenderUnitId) || null;
    }, [defenderUnitId, game.units]);

    return (
        <section className="board-shell battle-panel">
            <button onClick={props.onToBoard}>Вернуться на карту (сброс боя)</button>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <h3>Битва</h3>
                <button
                    onClick={() => setIsAutoBattle(p => !p)}
                    style={{
                        background: isAutoBattle ? '#2d5a2d' : '#2a2a2a',
                        border: `1px solid ${isAutoBattle ? '#5a9e5a' : '#555'}`,
                        color: isAutoBattle ? '#7ae87a' : '#aaa',
                        borderRadius: '20px',
                        padding: '4px 14px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    {isAutoBattle ? '⚡ Авто' : '⚡ Авто'}
                </button>
            </div>


            {stage === 'choice' && (
                <div className="battle-choice-layout">
                    <div className="battle-choice-col">
                        <div className="battle-choice-label">Атакующая группа</div>
                        <button
                            className={`battle-choice-btn ${group1Owner === 'player1' ? 'active' : ''}`}
                            onClick={() => handleGroup1Select('player1')}
                        >
                            {player1Name}
                        </button>
                        <button
                            className={`battle-choice-btn ${group1Owner === 'player2' ? 'active' : ''}`}
                            onClick={() => handleGroup1Select('player2')}
                        >
                            {player2Name}
                        </button>
                    </div>

                    <div className="battle-vs-col">
                        <div className="battle-vs">VS</div>

                        {isMonsterBattle && (
                            <div className="monster-stage-row">
                                {[1, 2, 3].map(s => (
                                    <button
                                        key={s}
                                        className={`battle-stage-btn ${monsterStage === s ? 'active' : ''}`}
                                        onClick={() => setMonsterStage(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {isMonsterBattle && monsterCalcStep && (
                            <div className="monster-calc-dice-area">
                                <div className="monster-calc-step-label">
                                    {monsterCalcStep === 'hp' ? '♥ HP'
                                        : monsterCalcStep === 'attack' ? '♣ Атака'
                                            : '♠ Защита'}
                                </div>
                                <div className="dice-results">
                                    {monsterCalcRolls.map((item, index) => (
                                        <Dice3D
                                            key={`calc-${monsterCalcStep}-${index}`}
                                            sides={item.sides}
                                            value={item.value}
                                            rolling={monsterCalcRolling}
                                            className={`die ${dieColorClass(item.sides)}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {isMonsterBattle && (
                            <div className="monster-stats-preview">
                                <div className="monster-stat-row">
                                    <span style={{color: 'red'}}>♥</span> {monster.hp}
                                </div>
                                <div className="monster-stat-row">
                                    <span style={{color: 'green'}}>♣</span> {monster.attack}
                                </div>
                                <div className="monster-stat-row">
                                    <span style={{color: 'purple'}}>♠</span> {monster.defense}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="battle-choice-col">
                        <div className="battle-choice-label">Защитная группа</div>
                        <button
                            className={`battle-choice-btn ${group2Owner === 'player1' ? 'active' : ''}`}
                            onClick={() => handleGroup2Select('player1')}
                        >
                            {player1Name}
                        </button>
                        <button
                            className={`battle-choice-btn ${group2Owner === 'player2' ? 'active' : ''}`}
                            onClick={() => handleGroup2Select('player2')}
                        >
                            {player2Name}
                        </button>
                        <button
                            className={`battle-choice-btn ${group2Owner === 'monster' ? 'active' : ''}`}
                            onClick={() => handleGroup2Select('monster')}
                        >
                            Монстр
                        </button>
                    </div>
                </div>
            )}

            {stage === 'choice' && isMonsterBattle && (
                <div className="monster-calc-section">
                    <section className="util-card">
                        <h3>Монстр</h3>
                        <div className="monster-top">
                            <img src="/assets/monster.png" alt="monster" className="monster-icon"/>
                            <strong>{monster.name}</strong>
                        </div>
                        <div className="stats-grid monster-stats">
                            <div className="stat-box">
                                <span className="stat-sym" style={{color: 'red'}}>♥</span>
                                <span className="stat-lbl">HP</span>
                                <div className="stat-row">
                                    <input type="number" style={{fontWeight: 'bold'}} value={monster.hp}
                                           onChange={(e) => props.onMonsterChange?.('hp', Number(e.target.value))}/>
                                </div>
                            </div>
                            <div className="stat-box">
                                <span className="stat-sym" style={{color: 'green'}}>♣</span>
                                <span className="stat-lbl">Атака</span>
                                <div className="stat-row">
                                    <input type="number" value={monster.attack} style={{fontWeight: 'bold'}}
                                           onChange={(e) => props.onMonsterChange?.('attack', Number(e.target.value))}/>
                                </div>
                            </div>
                            <div className="stat-box">
                                <span className="stat-sym" style={{color: 'purple'}}>♠</span>
                                <span className="stat-lbl">Защита</span>
                                <div className="stat-row">
                                    <input type="number" value={monster.defense} style={{fontWeight: 'bold'}}
                                           onChange={(e) => props.onMonsterChange?.('defense', Number(e.target.value))}/>
                                </div>
                            </div>
                        </div>
                        <button
                            className="monster-calc-btn"
                            onClick={handleMonsterCalculate}
                            disabled={monsterCalcLocked || !props.onMonsterChange}
                        >
                            {monsterCalcLocked ? 'Расчёт...' : 'Рассчитать'}
                        </button>
                    </section>
                </div>
            )}

            {stage === 'choice' && (
                <div className="battle-choice-footer">
                    <button
                        className="battle-next-btn"
                        disabled={!group1Owner || !group2Owner}
                        onClick={startBattle}
                    >
                        Далее →
                    </button>
                </div>
            )}

            {stage === 'battle' && (
                <div className="battle-stage-container">
                    {/* Main battle area */}
                    <div className="battle-main-area">
                        {/* Left side - Attacker */}
                        <div className="battle-side battle-side-left">
                            {attackerUnitId === 'monster' ? (
                                <div className="battle-character-display">
                                    <img
                                        src="/assets/monster.png"
                                        alt={monster.name}
                                        className="battle-character-img battle-monster"
                                    />
                                    <div className="battle-character-name">{monster.name}</div>
                                    <div className="battle-character-stats">
                                        ♥ {monster.hp} | ♣ {monster.attack} | ♠ {monster.defense}
                                    </div>
                                </div>
                            ) : attackerUnit ? (
                                <div className="battle-character-display">
                                    <img
                                        src={unitIcon(attackerUnit)}
                                        alt={attackerUnit.name}
                                        className="battle-character-img battle-attacker"
                                    />
                                    <div className="battle-character-name">{attackerUnit.name}</div>
                                    <div className="battle-character-stats">
                                        ♥ {attackerUnit.hp} | ♣ {attackerUnit.attack} | ♠ {attackerUnit.defense}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Center - Dice and Wheel area */}
                        <div className="battle-center-area">
                            {/* Turn indicator */}
                            <div className="battle-turn-indicator">
                                Ход: {turnOwner === 'player1' ? player1Name : player2Name}
                                {isMonsterTurn && ' (Монстр)'}
                            </div>

                            {/* Phase: Selecting attacker with D6 */}
                            {phase === 'selecting-attacker' && !isMonsterTurn && d6AttackerCandidates.length === 0 && (
                                <div className="battle-dice-area">
                                    <div className="battle-phase-label">
                                        Бросьте d6 чтобы выбрать атакующего
                                        {(() => {
                                            const deadCount = getDeadCount(turnOwner);
                                            const diceCount = deadCount >= 4 ? 3 : deadCount >= 2 ? 2 : 1;
                                            return diceCount > 1 ? ` (${diceCount} кубика)` : '';
                                        })()}
                                    </div>
                                    <div className="dice-results">
                                        {d6Results.length > 0 ? (
                                            d6Results.map((result, index) => (
                                                <Dice3D
                                                    key={`d6-${index}`}
                                                    sides={6}
                                                    value={result}
                                                    rolling={isRollingD6}
                                                    className={`die ${dieColorClass(6)}`}
                                                />
                                            ))
                                        ) : (
                                            <Dice3D
                                                sides={6}
                                                value={d6PreviewValue}
                                                rolling={isRollingD6}
                                                className={`die ${dieColorClass(6)}`}
                                            />
                                        )}
                                    </div>
                                    <button
                                        className="battle-roll-btn"
                                        onClick={rollD6}
                                        disabled={isRollingD6 || d6Results.length > 0}
                                    >
                                        {isRollingD6 ? 'Бросок...' : 'Бросить d6'}
                                    </button>
                                    {d6Results.length > 0 && !isRollingD6 && (
                                        <div className="battle-dice-result">
                                            {(() => {
                                                const fullQueue = getFullQueueWithNumbers(turnOwner);
                                                const livingMatches = d6Results
                                                    .filter(r => r >= 1 && r <= 5)
                                                    .map(r => fullQueue.find(q => q.number === r))
                                                    .filter((slot): slot is { unit: Unit; number: number } =>
                                                        slot?.unit !== null && slot?.unit.alive === true
                                                    );

                                                if (livingMatches.length === 0) {
                                                    return 'Нет живых персонажей с такими номерами. Ход переходит оппоненту.';
                                                }

                                                const rollStr = d6Results.join(', ');
                                                const matchesStr = livingMatches.map(m => `#${m.number} ${m.unit.name}`).join(', ');
                                                return `Выпало: ${rollStr}. Совпадения: ${matchesStr}`;
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Phase: Selecting from multiple attacker candidates */}
                            {d6AttackerCandidates.length > 0 && (
                                <div className="battle-attacker-select">
                                    <div className="battle-phase-label">Выберите атакующего</div>
                                    <div className="battle-attacker-grid">
                                        {d6AttackerCandidates.map((unit) => (
                                            <button
                                                key={unit.id}
                                                className="battle-attacker-btn"
                                                onClick={() => selectAttackerFromCandidates(unit.id)}
                                            >
                                                <img src={unitIcon(unit)} alt={unit.name} className="battle-attacker-img"/>
                                                <span className="battle-attacker-name">{unit.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Phase: Selecting defender */}
                            {phase === 'selecting-defender' && (
                                <div className="battle-defender-select">
                                    <div className="battle-phase-label">Выберите цель для атаки</div>
                                    <div className="battle-defender-grid">
                                        {defenderQueue.map((unit, index) => (
                                            <button
                                                key={unit.id}
                                                className="battle-defender-btn"
                                                onClick={() => selectDefender(unit.id)}
                                            >
                                                <img src={unitIcon(unit)} alt={unit.name} className="battle-defender-img"/>
                                                <span className="battle-defender-name">{unit.name}</span>
                                                <span className="battle-defender-number">#{index + 1}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {phase === 'selecting-attacker' && isMonsterTurn && (
                                <div className="battle-dice-area">
                                    <div className="battle-phase-label">Ход монстра</div>
                                    <button
                                        className="battle-roll-btn"
                                        onClick={startMonsterCoinFlip}
                                    >
                                        Подбросить монету
                                    </button>
                                </div>
                            )}

                            {/* Phase: Monster coin flip — орёл = ходит, решка = пропускает */}
                            {phase === 'monster-coin' && isMonsterTurn && (
                                <div className="battle-dice-area">
                                    <div className="battle-phase-label">Монстр — орёл или решка?</div>
                                    <CoinFlip
                                        headsValue={monsterTarget?.number}
                                        tailsValue="Монстр пропускает ход"
                                        onResult={(side) => {
                                            if (side === 'tails' || !monsterTarget) {
                                                schedulePhase(() => switchTurn(), 500);
                                                return;
                                            }
                                            setAttackerUnitId('monster');
                                            setDefenderUnitId(monsterTarget.unit.id);
                                            schedulePhase(() => {
                                                autoBattleActionFiredRef.current = false;
                                                setPhase('waiting-wheel');
                                            }, 2000);
                                        }}
                                        autoFlipToken={isAutoBattle ? monsterCoinAutoToken : 0}
                                    />
                                </div>
                            )}

                            {/* Phase: Waiting for wheel */}
                            {phase === 'waiting-wheel' && (
                                <div className="battle-wheel-area">
                                    <div className="battle-phase-label">Крутите колесо битвы!</div>
                                    {battleWheel && <BattleWheel onSpinResult={handleWheelResult} isAutoBattle = {startBattleWheel}/>}

                                    {/* D100 for crit */}
                                    {wheelResult === 'Крит. урон' && (
                                        <div>
                                            <button onClick={() => {
                                                setBattleWheel(true);
                                                setWheelResult('');
                                                setD100Result(null);
                                            }}>Вернуться к колесу</button>
                                            <div className="battle-d100-area">
                                                <div className="battle-phase-label">🎲 Шаг 1: Бросьте d100 для расчёта крита</div>
                                                <div className="dice-results">
                                                    <Dice3D
                                                        sides={100}
                                                        value={d100Result ?? d100PreviewValue}
                                                        rolling={isRollingD100}
                                                        className={`die ${dieColorClass(100)}`}
                                                    />
                                                </div>
                                                {!d100Result && (
                                                    <button
                                                        className="battle-roll-btn battle-roll-d100"
                                                        onClick={rollD100}
                                                        disabled={isRollingD100}
                                                    >
                                                        {isRollingD100 ? 'Бросок...' : '🔥 Бросить d100'}
                                                    </button>
                                                )}
                                                {d100Result && (
                                                    <div className="battle-dice-result battle-crit-result">
                                                        <div>Крит: <strong>{d100Result}%</strong></div>
                                                        <div>Множитель: <strong>x{(1 + d100Result / 100).toFixed(2)}</strong></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    )}

                                    {/* Attack button */}
                                    {showAttackButton && wheelResult !== 'Крит. урон' || (wheelResult === 'Крит. урон' && d100Result) ? (
                                        <button
                                            className="battle-attack-btn"
                                            onClick={executeAttack}
                                        >
                                            ⚔️ {wheelResult === 'Крит. урон' ? 'Критический удар!' : 'Атаковать!'}
                                        </button>
                                    ) : null}
                                </div>
                            )}

                            {/* Phase: Executing attack with damage calc */}
                            {phase === 'executing-attack' && damageCalc && (
                                <div className="battle-attack-result">
                                    <div className="battle-phase-label">Результат атаки</div>
                                    <div className="battle-damage-calc">
                                        <div className="damage-row">
                                            <span className="damage-label">Урон:</span>
                                            <span className="damage-value">{damageCalc.totalDamage}</span>
                                        </div>
                                        <div className="damage-row">
                                            <span className="damage-label">В защиту:</span>
                                            <span className="damage-value negative">-{damageCalc.defenseLoss}</span>
                                        </div>
                                        <div className="damage-row">
                                            <span className="damage-label">В HP:</span>
                                            <span className="damage-value negative">-{damageCalc.hpLoss}</span>
                                        </div>
                                        <div className="damage-row result">
                                            <span className="damage-label">Итог DEF:</span>
                                            <span className="damage-value">{damageCalc.nextDefense}</span>
                                        </div>
                                        <div className="damage-row result">
                                            <span className="damage-label">Итог HP:</span>
                                            <span className="damage-value">{damageCalc.nextHp}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="battle-side battle-side-right">
                            {defenderUnitId === 'monster' ? (
                                <div className="battle-character-display">
                                    <img
                                        src="/assets/monster.png"
                                        alt={monster.name}
                                        className="battle-character-img battle-monster"
                                    />
                                    <div className="battle-character-name">{monster.name}</div>
                                    <div className="battle-character-stats">
                                        ♥ {monster.hp} | ♣ {monster.attack} | ♠ {monster.defense}
                                    </div>
                                </div>
                            ) : defenderUnit ? (
                                <div className="battle-character-display">
                                    <img
                                        src={unitIcon(defenderUnit)}
                                        alt={defenderUnit.name}
                                        className="battle-character-img battle-defender"
                                    />
                                    <div className="battle-character-name">{defenderUnit.name}</div>
                                    <div className="battle-character-stats">
                                        ♥ {defenderUnit.hp} | ♣ {defenderUnit.attack} | ♠ {defenderUnit.defense}
                                    </div>
                                </div>
                            ) : isMonsterBattle && attackerUnitId !== 'monster' ? (
                                <div className="battle-character-display">
                                    <img
                                        src="/assets/monster.png"
                                        alt={monster.name}
                                        className="battle-character-img battle-monster"
                                    />
                                    <div className="battle-character-name">{monster.name}</div>
                                    <div className="battle-character-stats">
                                        ♥ {monster.hp} | ♣ {monster.attack} | ♠ {monster.defense}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Bottom queues */}
                    <div className="battle-queues-area">
                        <div className="battle-queue-group">
                            <div className="battle-queue-title">
                                {group1Owner === 'player1' ? player1Name : player2Name}
                            </div>
                            <div className="battle-queue-strip">
                                {getFullQueueWithNumbers(group1Owner as PlayerKey).map(({ unit, number }) => (
                                    <div
                                        key={number}
                                        className={`battle-queue-item 
            ${unit && attackerUnitId === unit.id ? 'active' : ''} 
            ${unit && defenderUnitId === unit.id ? 'target' : ''}
            ${!unit?.alive ? 'dead' : ''}`}
                                        title={unit ? `${unit.name} ♥${unit.hp} ♣${unit.attack} ♠${unit.defense}` : 'Мёртв'}
                                    >
                                        {unit ? (
                                            <img src={unitIcon(unit)} alt={unit.name} className="battle-queue-img" style={{ opacity: unit.alive ? 1 : 0.3 }} />
                                        ) : (
                                            <div className="battle-queue-img" style={{ opacity: 0.2, background: 'rgba(255,0,0,0.2)', borderRadius: '50%' }} />
                                        )}
                                        <span className="battle-queue-number">{number}</span>
                                        {unit && (
                                            <div className="battle-queue-stats">
                                                <span className="q-hp">{unit.hp}</span>/
                                                <span className="q-atk">{unit.attack}</span>/
                                                <span className="q-def">{unit.defense}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="battle-queue-group">
                            <div className="battle-queue-title">
                                {group2Owner === 'player1' ? player1Name
                                    : group2Owner === 'player2' ? player2Name
                                        : monster.name}
                            </div>
                            <div className="battle-queue-strip">
                                {isMonsterBattle ? (
                                    <div
                                        className={`battle-queue-item ${isMonsterTurn ? 'active' : ''}`}
                                        title={`${monster.name} ♥${monster.hp} ♣${monster.attack} ♠${monster.defense}`}
                                    >
                                        <img src="/assets/monster.png" alt={monster.name} className="battle-queue-img"/>
                                        <span className="battle-queue-number">M</span>
                                        <div className="battle-queue-stats">
                                            <span className="q-hp">{monster.hp}</span>/
                                            <span className="q-atk">{monster.attack}</span>/
                                            <span className="q-def">{monster.defense}</span>
                                        </div>
                                    </div>
                                ) : (
                                    getFullQueueWithNumbers(group2Owner as PlayerKey).map(({ unit, number }) => (
                                        <div
                                            key={number}
                                            className={`battle-queue-item 
                ${unit && attackerUnitId === unit.id ? 'active' : ''} 
                ${unit && defenderUnitId === unit.id ? 'target' : ''}
                ${!unit?.alive ? 'dead' : ''}`}
                                            title={unit ? `${unit.name} ♥${unit.hp} ♣${unit.attack} ♠${unit.defense}` : 'Мёртв'}
                                        >
                                            {unit ? (
                                                <img src={unitIcon(unit)} alt={unit.name} className="battle-queue-img" style={{ opacity: unit.alive ? 1 : 0.3 }} />
                                            ) : (
                                                <div className="battle-queue-img" style={{ opacity: 0.2, background: 'rgba(255,0,0,0.2)', borderRadius: '50%' }} />
                                            )}
                                            <span className="battle-queue-number">{number}</span>
                                            {unit && (
                                                <div className="battle-queue-stats">
                                                    <span className="q-hp">{unit.hp}</span>/
                                                    <span className="q-atk">{unit.attack}</span>/
                                                    <span className="q-def">{unit.defense}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {stage === 'finished' && battleResultSummary && (
                <div className="battle-stage-container">
                    <section className="util-card" style={{maxWidth: 900, margin: '0 auto'}}>
                        <h3>Бой завершен</h3>
                        <div className="battle-phase-label" style={{marginBottom: 18, fontSize: 30, textAlign: 'center', fontWeight: 900}}>
                            Победил {battleResultSummary.winnerName}
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
                            {[
                                {key: 'left' as const, title: battleResultSummary.leftTeamName},
                                {key: 'right' as const, title: battleResultSummary.rightTeamName},
                            ].map((team) => (
                                <div key={team.key} style={{border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10}}>
                                    <div style={{fontWeight: 700, marginBottom: 8}}>{team.title}</div>
                                    <div style={{display: 'grid', gap: 8}}>
                                        {battleResultSummary.stats
                                            .filter((row) => row.sideKey === team.key)
                                            .map((row) => (
                                                <div key={row.id} style={{display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 8}}>
                                                    <img src={row.icon} alt={row.name} style={{width: 34, height: 34, objectFit: 'cover', borderRadius: '50%'}}/>
                                                    <div>
                                                        <div style={{fontWeight: 600}}>{row.name}</div>
                                                        <div style={{fontSize: 12, opacity: 0.9}}>
                                                            -HP {row.hpLost} | -DEF {row.defenseLost}
                                                        </div>
                                                    </div>
                                                    <div style={{fontSize: 12, fontWeight: 700, color: row.dead ? '#ff8585' : '#8adf8a'}}>
                                                        {row.dead ? 'МЕРТВ' : 'ЖИВ'}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{marginTop: 16}}>
                            <button className="battle-next-btn" onClick={props.onToBoard}>
                                Вернуться на доску
                            </button>
                        </div>
                    </section>
                </div>
            )}
            <RandomDropPopup ref={dropPopupRef} />
        </section>
    );
};
