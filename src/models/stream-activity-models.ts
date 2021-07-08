export enum StreamActivityType {
    in = 'in',
    out = 'out'
}

export enum StreamActivityAction {
    'deposited',
    'withdrew'
}

export interface StreamActivity {
    type: StreamActivityType;
    action: StreamActivityAction;
    amount: number;
    mint: string;
    blockTime: number;
    utcDate: string;
}
