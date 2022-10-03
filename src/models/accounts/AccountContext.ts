import { MeanFiAccountType } from "models/enums";

export interface AccountContext {
    address: string;
    name: string;
    type: MeanFiAccountType;
}
