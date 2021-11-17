export interface StreamStats {
    incoming: number;
    outgoing: number;
}

export const defaultStreamStats: StreamStats = {
    incoming: 0,
    outgoing: 0
};

export interface StreamsSummary {
    totalNet: number;
    incomingAmount: number;
    outgoingAmount: number;
    totalAmount: number;
};

export const initialSummary: StreamsSummary = {
    totalNet: 0,
    incomingAmount: 0,
    outgoingAmount: 0,
    totalAmount: 0
};
