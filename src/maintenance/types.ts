export interface MaintenanceResult {
  success: boolean;
  message: string;
  error?: string;
  requiresSudo?: boolean;
}
