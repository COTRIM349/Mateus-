export type UserRole = "admin" | "manager" | "operator" | "viewer";

export interface User {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPermissions {
  canManageFarms: boolean;
  canManagePivots: boolean;
  canManageUsers: boolean;
  canControlIrrigation: boolean;
  canViewReports: boolean;
  canManageCosts: boolean;
  canConfigureSystem: boolean;
}
