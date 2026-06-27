export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SortParams {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterParams {
  farmId?: string;
  seasonId?: string;
  moduleId?: string;
  cultureId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  search?: string;
}
