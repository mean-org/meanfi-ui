export enum StreamActivityType {
    in = 'in',
    out = 'out'
}

export interface StreamActivity {
    type: StreamActivityType;
    action: string;
    amount: number;
    mint: string;
    blockTime: number;
    utcDate: string;
}
