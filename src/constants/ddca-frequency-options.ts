import { DdcaFrequencyOption, DcaInterval } from "../models/ddca-models";

export const DDCA_FREQUENCY_OPTIONS: DdcaFrequencyOption[] = [
    {
        dcaInterval: DcaInterval.OneTimeExchange,
        translationId: 'ote',
        name: 'One time exchange',
        disabled: false,
    },
    // {
    //     dcaInterval: DcaInterval.RepeatingDaily,
    //     translationId: 'repeating-daily',
    //     name: 'Repeat daily',
    //     disabled: false,
    // },
    {
        dcaInterval: DcaInterval.RepeatingWeekly,
        translationId: 'repeating-weekly',
        name: 'Repeat weekly',
        disabled: false,
    },
    {
        dcaInterval: DcaInterval.RepeatingTwiceMonth,
        translationId: 'repeating-twice-month',
        name: 'Every two weeks',
        disabled: false,
    },
    {
        dcaInterval: DcaInterval.RepeatingOnceMonth,
        translationId: 'repeating-once-month',
        name: 'Repeat monthly',
        disabled: false,
    },
];
