export interface Company {
  id: string;
  name: string;
  cnpj: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
