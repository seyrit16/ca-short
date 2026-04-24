import { useState, useEffect } from "react";

interface Die3DProps {
    sides: number;
    value?: number;
    rolling: boolean;
    className?: string;
}

const FACES = ["front", "back", "left", "right", "top", "bottom"] as const;

export function Dice3D({ sides, value, rolling, className }: Die3DProps) {
    const [animKey, setAnimKey] = useState(0);

    useEffect(() => {
        if (rolling) setAnimKey((k) => k + 1);
    }, [rolling]);

    return (
        <div className="die-3d-wrap">
            <div key={animKey} className={`die-3d ${rolling ? "rolling" : ""} ${className ?? ""}`}>
                {FACES.map((f) => (
                    <div key={f} className={`face face-${f}`}>
                        {f === "front" ? (value ?? sides) : ""}
                    </div>
                ))}
            </div>
        </div>
    );
}