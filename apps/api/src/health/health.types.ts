export type DbState = "up" | "down" | "disabled";

export interface HealthBody {
  status: "ok";
  db: DbState;
}
