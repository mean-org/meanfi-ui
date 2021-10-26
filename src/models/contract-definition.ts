export class ContractDefinition {
    id: number;
    name: string;
    categoryId: string;
    translationId: string;
    disabled: boolean;
    constructor() {
        this.id = 0;
        this.name = '';
        this.translationId = '';
        this.categoryId = '';
        this.disabled = true;
    }
}
