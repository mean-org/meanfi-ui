import { ContractDefinition } from "../models/contract-definition";

export const PAYROLL_CONTRACT: ContractDefinition = {
    id: 3,
    translationId: 'payroll',
    name: 'Payroll',
    categoryId: 'cat2',
    disabled: false,
};

export const STREAMING_PAYMENT_CONTRACTS: ContractDefinition[] = [
    {
        id: 1,
        translationId: 'otp',
        name: 'One Time Payment',
        categoryId: 'cat1',
        disabled: false,
    },
    {
        id: 2,
        translationId: 'repeating',
        name: 'Repeating Payment ',
        categoryId: 'cat1',
        disabled: false,
    },
    {
        id: 4,
        translationId: 'subscription',
        name: 'Subscription',
        categoryId: 'cat2',
        disabled: true,
    },
    {
        id: 5,
        translationId: 'fundraising',
        name: 'Fundraising',
        categoryId: 'cat2',
        disabled: true,
    },
    {
        id: 6,
        translationId: 'real-estate-sale-escrow',
        name: 'Real Estate Sale (Escrow)',
        categoryId: 'cat3',
        disabled: true,
    },
    {
        id: 7,
        translationId: 'rent-collection',
        name: 'Rent Collection',
        categoryId: 'cat3',
        disabled: true,
    },
    {
        id: 8,
        translationId: 'pension-fund',
        name: 'Pension Fund',
        categoryId: 'cat4',
        disabled: true,
    },
    {
        id: 9,
        translationId: 'donation-fund',
        name: 'Donation Fund',
        categoryId: 'cat4',
        disabled: true,
    },
    {
        id: 10,
        translationId: 'setup-everything',
        name: 'Setup everything (Advanced)',
        categoryId: 'cat4',
        disabled: true,
    },
];
