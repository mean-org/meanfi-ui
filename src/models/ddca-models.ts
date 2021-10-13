export class DdcaFrequencyOption {
    value: DdcaFrequencyValue;
    name: string;
    translationId: string;
    disabled: boolean;
    constructor() {
        this.value = 0;
        this.name = '';
        this.translationId = '';
        this.disabled = true;
    }
}

export enum DdcaFrequencyValue {
    OneTimeExchange = 1,
    RepeatingDaily = 2,
    RepeatingWeekly = 3,
    RepeatingTwiceMonth = 4,
    RepeatingOnceMonth = 5
}
