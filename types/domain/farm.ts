export interface Farm {
  id: string;
  companyId: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  totalArea: number;
  irrigatedArea: number;
  timezone: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionModule {
  id: string;
  farmId: string;
  name: string;
  description: string;
  totalArea: number;
  active: boolean;
}
