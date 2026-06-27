export type UserRole = "admin" | "manager" | "operator" | "viewer";

export interface UserPermissions {
  canManageFarms: boolean;
  canManagePivots: boolean;
  canManageUsers: boolean;
  canControlIrrigation: boolean;
  canViewReports: boolean;
  canManageCosts: boolean;
  canConfigureSystem: boolean;
}

const permissionsByRole: Record<UserRole, UserPermissions> = {
  admin: {
    canManageFarms: true,
    canManagePivots: true,
    canManageUsers: true,
    canControlIrrigation: true,
    canViewReports: true,
    canManageCosts: true,
    canConfigureSystem: true,
  },
  manager: {
    canManageFarms: true,
    canManagePivots: true,
    canManageUsers: false,
    canControlIrrigation: true,
    canViewReports: true,
    canManageCosts: true,
    canConfigureSystem: false,
  },
  operator: {
    canManageFarms: false,
    canManagePivots: false,
    canManageUsers: false,
    canControlIrrigation: true,
    canViewReports: true,
    canManageCosts: false,
    canConfigureSystem: false,
  },
  viewer: {
    canManageFarms: false,
    canManagePivots: false,
    canManageUsers: false,
    canControlIrrigation: false,
    canViewReports: true,
    canManageCosts: false,
    canConfigureSystem: false,
  },
};

export function getPermissions(role: UserRole): UserPermissions {
  return permissionsByRole[role];
}
