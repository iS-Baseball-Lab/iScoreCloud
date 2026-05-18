import { Tournament, TournamentFormData } from "@/types/tournament";

export const EMPTY_FORM: TournamentFormData = {
    name: "",
    season: String(new Date().getFullYear()),
    organizer: "",
    startDate: "",
    endDate: "",
    timeLimit: "",
    coldGameRule: "",
    tiebreakerRule: "",
    bracketUrl: "",
};

export function getTournamentStatus(t: Tournament): "ongoing" | "upcoming" | "finished" {
    const today = new Date().toISOString().split("T")[0];
    if (t.startDate && t.endDate) {
        if (today < t.startDate) return "upcoming";
        if (today > t.endDate) return "finished";
        return "ongoing";
    }
    if (t.startDate && today >= t.startDate) return "ongoing";
    return "upcoming";
}

export function getPeriodLabel(t: Tournament): string {
    const fmt = (d: string) => {
        const [y, m] = d.split("-");
        return `${y}年${Number(m)}月`;
    };
    if (t.startDate && t.endDate) return `${fmt(t.startDate)} 〜 ${fmt(t.endDate)}`;
    if (t.startDate) return `${fmt(t.startDate)} 〜`;
    return `${t.season}年度`;
}
