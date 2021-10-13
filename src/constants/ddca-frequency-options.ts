import { DdcaFrequencyOption, DdcaFrequencyValue } from "../models/ddca-models";

export const DDCA_FREQUENCY_OPTIONS: DdcaFrequencyOption[] = [
    {
        value: DdcaFrequencyValue.OneTimeExchange,
        translationId: 'ote',
        name: 'One time exchange',
        disabled: false,
    },
    // {
    //     value: DdcaFrequencyValue.RepeatingDaily,
    //     translationId: 'repeating-daily',
    //     name: 'Repeat daily',
    //     disabled: false,
    // },
    {
        value: DdcaFrequencyValue.RepeatingWeekly,
        translationId: 'repeating-weekly',
        name: 'Repeat weekly',
        disabled: false,
    },
    {
        value: DdcaFrequencyValue.RepeatingTwiceMonth,
        translationId: 'repeating-twice-month',
        name: 'Every two weeks',
        disabled: false,
    },
    {
        value: DdcaFrequencyValue.RepeatingOnceMonth,
        translationId: 'repeating-once-month',
        name: 'Repeat monthly',
        disabled: false,
    },
];
