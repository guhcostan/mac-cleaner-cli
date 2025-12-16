import type { CleanableItem } from "../types.js";

export interface GroupedFileDisplay {
  type: "directory-header" | "file" | "expand-hint";
  path?: string;
  size?: number;
  name?: string;
  isChecked?: boolean;
  directoryKey?: string;
  hiddenCount?: number;
  totalFilesInDir?: number;
  directoryPath?: string;
  displayName?: string;
  selectable?: boolean;
  item?: CleanableItem;
}

export interface CheckboxOptions {
  message: string;
  items: GroupedFileDisplay[];
  pageSize?: number;
  absolutePaths?: boolean;
}
