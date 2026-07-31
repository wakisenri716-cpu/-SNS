// Shared between the reel viewer's per-location transit line and the
// municipality profile's access planner, so both display the same wording for
// each transit mode (see backend/src/services/maasProvider.ts for the modes).
export const TRANSIT_MODE_LABEL_KEY: Record<string, string> = {
  walk: "accessPlanner.modeWalk",
  drive: "accessPlanner.modeDrive",
  train: "accessPlanner.modeTrain",
  bus: "accessPlanner.modeBus",
};
