export enum DcaInterval {
    OneTimeExchange = 0,
    RepeatingDaily = 1,         // 86400
    RepeatingWeekly = 2,        // 604800
    RepeatingTwiceMonth = 3,    // 1209600
    RepeatingOnceMonth = 4      // 2629750
}

export class DdcaFrequencyOption {
    dcaInterval: DcaInterval;
    name: string;
    translationId: string;
    disabled: boolean;
    constructor() {
        this.dcaInterval = DcaInterval.RepeatingWeekly;
        this.name = '';
        this.translationId = '';
        this.disabled = true;
    }
}
