export class TransactionStats {
    total: number;
    incoming: number;
    outgoing: number;
    index: number;
    constructor() {
        this.total = 0;
        this.incoming = 0;
        this.outgoing = 0;
        this.index = 0;
    }
}
