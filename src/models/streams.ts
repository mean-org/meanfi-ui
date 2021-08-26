export interface StreamStats {
    incoming: number;
    outgoing: number;
}

export const defaultStreamStats: StreamStats = {
    incoming: 0,
    outgoing: 0
};
