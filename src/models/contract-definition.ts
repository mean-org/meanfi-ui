export class ContractDefinition {
    id: number;
    name: string;
    category: string;
    categoryId: string;
    description: string;
    disabled: boolean;
    constructor() {
        this.id = 0;
        this.name = '';
        this.category = '';
        this.description = '';
        this.categoryId = '';
        this.disabled = true;
    }
}
