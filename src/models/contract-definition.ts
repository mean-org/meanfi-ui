export class ContractDefinition {
    id: string;
    name: string;
    category: string;
    categoryId: string;
    description: string;
    disabled: boolean;
    constructor() {
        this.id = '';
        this.name = '';
        this.category = '';
        this.description = '';
        this.categoryId = '';
        this.disabled = true;
    }
}
