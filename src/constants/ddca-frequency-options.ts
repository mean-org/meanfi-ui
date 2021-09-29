import { DdcaFrequencyOption } from "../models/ddca-models";

export const DDCA_FREQUENCY_OPTIONS: DdcaFrequencyOption[] = [
    {
        value: 1,
        translationId: 'ote',
        name: 'One time exchange',
        disabled: false,
    },
    {
        value: 2,
        translationId: 'repeating-daily',
        name: 'Repeat daily',
        disabled: true,
    },
    {
        value: 3,
        translationId: 'repeating-weekly',
        name: 'Repeat weekly',
        disabled: true,
    },
    {
        value: 4,
        translationId: 'repeating-twice-month',
        name: 'Twice a month',
        disabled: true,
    },
    {
        value: 5,
        translationId: 'repeating-once-month',
        name: 'Once a month',
        disabled: true,
    },
];
