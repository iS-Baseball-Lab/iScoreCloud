export interface Tournament {
    id: string;
    name: string;
    category: string;
    season: string;
    organizer: string | null;
    bracketUrl: string | null;
    timeLimit: string | null;
    coldGameRule: string | null;
    tiebreakerRule: string | null;
    startDate: string | null;
    endDate: string | null;
    createdAt: number;
}

export interface TournamentFormData {
    name: string;
    category: string;
    season: string;
    organizer: string;
    startDate: string;
    endDate: string;
    timeLimit: string;
    coldGameRule: string;
    tiebreakerRule: string;
    bracketUrl: string;
}
