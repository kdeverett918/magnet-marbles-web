import type { InputState } from "./controls";

export interface HumanFrameIntent {
  moveX: number;
  moveZ: number;
  magnet: boolean;
  dash: boolean;
  activate: boolean;
}

export function humanFrameIntent(input: InputState): HumanFrameIntent {
  return {
    moveX: input.moveX,
    moveZ: input.moveZ,
    magnet: input.magnet,
    dash: input.dash,
    activate: input.activate,
  };
}
