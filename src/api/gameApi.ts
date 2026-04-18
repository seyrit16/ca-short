import type { Game, GameSummary } from '../types';

export const API = {
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? window.location.origin,

    wsUrl(gameName: string): string {
        const base = new URL(this.baseUrl);
        const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsBase = `${protocol}//${base.host}/ws`;
        return `${wsBase}?game=${encodeURIComponent(gameName)}`;
    },

    async getGames(): Promise<GameSummary[]> {
        const response = await fetch(`${this.baseUrl}/api/games`);
        if (!response.ok) throw new Error('Failed to load games');
        return (await response.json()) as GameSummary[];
    },

    async getGame(gameName: string): Promise<Game | null> {
        const response = await fetch(`${this.baseUrl}/api/games/${encodeURIComponent(gameName)}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to load game');
        return (await response.json()) as Game;
    },

    async createGame(game: Game): Promise<{ message: string; id: string }> {
        const response = await fetch(`${this.baseUrl}/api/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(game)
        });
        if (response.status === 409) throw new Error('Game already exists');
        if (!response.ok) throw new Error('Failed to create game');
        return (await response.json()) as { message: string; id: string };
    },

    async saveGame(game: Game): Promise<{ message: string }> {
        const response = await fetch(`${this.baseUrl}/api/games/${encodeURIComponent(game.name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(game)
        });
        if (!response.ok) throw new Error('Failed to save game');
        return (await response.json()) as { message: string };
    },

    async joinGame(gameName: string, color: string): Promise<{ message: string; game: Game }> {
        const response = await fetch(`${this.baseUrl}/api/games/${encodeURIComponent(gameName)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color })
        });
        if (response.status === 409) throw new Error('Game is full');
        if (response.status === 400) throw new Error('Color already taken');
        if (!response.ok) throw new Error('Failed to join game');
        return (await response.json()) as { message: string; game: Game };
    },

    async deleteGame(gameName: string): Promise<{ message: string }> {
        const response = await fetch(`${this.baseUrl}/api/games/${encodeURIComponent(gameName)}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete game');
        return (await response.json()) as { message: string };
    },

    async uploadCharacterIcon(file: File): Promise<string> {
        if (file.type !== 'image/png') throw new Error('Only PNG files are allowed');
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('Failed to read file'));
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

        const response = await fetch(`${this.baseUrl}/api/uploads/character-icon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl })
        });
        if (!response.ok) throw new Error('Failed to upload icon');
        const payload = (await response.json()) as { path: string };
        return payload.path;
    },

    async getCharacterIcons(): Promise<string[]> {
        const response = await fetch(`${this.baseUrl}/api/character-icons`);
        if (!response.ok) throw new Error('Failed to load character icons');
        const payload = (await response.json()) as { icons?: unknown };
        if (!Array.isArray(payload.icons)) return [];
        return payload.icons.filter((value): value is string => typeof value === 'string');
    }
};
