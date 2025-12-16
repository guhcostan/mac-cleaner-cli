import chalk from "chalk";
import path from "node:path";
import {
	createPrompt,
	useState,
	useMemo,
	useKeypress,
	usePrefix,
	isUpKey,
	isDownKey,
	isEnterKey,
	useRef,
} from "@inquirer/core";
import type { ScanResult, CategoryId } from "../types.js";
import { formatSize } from "../utils/index.js";
import { copyToClipboard } from "../utils/clipboard.js";
import { truncateFileName } from "../utils/paths.js";
import { groupFilesByDirectory } from "../utils/grouping.js";

interface FilePickerConfig {
	message: string;
	results: ScanResult[];
	absolutePaths?: boolean;
	categoriesWithFileSelection?: Set<CategoryId>;
}

interface FilePickerResult {
	selectedCategories: Set<CategoryId>;
	selectedFilesByCategory: Map<CategoryId, Set<string>>;
}

type Pane = "categories" | "files";

// Per category file picker state
// Stored in Inquirer state as JSON
interface FilePickerState {
	visible: boolean; // Is this category's file picker shown?
	active: boolean; // Are we navigating inside this picker?
	fileCaret: number; // Caret position for THIS category's files
	dirExpandLimits: Record<string, number>; // Dir expansion state for THIS category
}

type FilePickerStatesStore = Record<string, FilePickerState>;

// TODO: config file for these constants
const FILES_PAGE_SIZE = 6;
const FILE_NAME_WIDTH = 35;
const INDENT = "    ";
const DIR_VIS_CHILD_LIMIT = 5;
const EXPAND_INCREMENT = 10;

const DEFAULT_PICKER_STATE: FilePickerState = {
	visible: false,
	active: false,
	fileCaret: 0,
	dirExpandLimits: {},
};

function toDirLimitsMap(limits: Record<string, number>): Map<string, number> {
	const map = new Map<string, number>();
	for (const [key, value] of Object.entries(limits)) {
		map.set(key, value);
	}
	return map;
}

/**
 * Creates an interactive prompt for category and file selection.
 *
 * Displays scan results in a list & sublist interface:
 * - Left pane: Main categories with sizes and item counts
 * - Right pane: Files list grouped by directory (when applicable)
 *
 * Features:
 * - Category selection with space/a/i/d
 * - Single file selection for supported categories
 * - Directory grouping with expand/collapse
 * - File picker states (independent visibility, cursors, expansion)
 * - Clipboard copy integration for paths
 * - Pagination for large lists
 */
export default createPrompt<FilePickerResult, FilePickerConfig>(
	(config, done) => {
		const { results, absolutePaths = false } = config;
		const prefix = usePrefix({ status: "idle" });

		const [activePane, setActivePane] = useState<Pane>("categories");
		const [categoryCursor, setCategoryCursor] = useState(0);
		const [selectedCategories, setSelectedCategories] = useState(
			new Set<CategoryId>(),
		);
		const [selectedFilesByCategory, setSelectedFilesByCategory] = useState(
			new Map<CategoryId, Set<string>>(),
		);
		const [copyStatus, setCopyStatus] = useState<string | null>(null);

		// Per category UI state for file pickers, kept
		// separate from selection so caret/expansion survive
		// toggling categories on and off.
		const [categoryFilePickerStates, setCategoryFilePickerStates] =
			useState<FilePickerStatesStore>({});

		const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

		const categoriesWithFileSelection =
			config.categoriesWithFileSelection || new Set<CategoryId>();

		// Helper: Get picker state for a category (returns default if not exists)
		const getPickerState = (categoryId: CategoryId): FilePickerState => {
			const key = String(categoryId);
			const existing = categoryFilePickerStates[key];
			if (!existing) {
				return {
					...DEFAULT_PICKER_STATE,
					dirExpandLimits: {},
				};
			}
			return {
				...DEFAULT_PICKER_STATE,
				...existing,
				dirExpandLimits: { ...existing.dirExpandLimits },
			};
		};

		// Helper: Update picker state for a category
		const updatePickerState = (
			categoryId: CategoryId,
			updates: Partial<FilePickerState>,
		) => {
			const key = String(categoryId);
			const current = getPickerState(categoryId);
			const nextState: FilePickerState = {
				...current,
				...updates,
				dirExpandLimits: updates.dirExpandLimits
					? { ...updates.dirExpandLimits }
					: current.dirExpandLimits,
			};
			setCategoryFilePickerStates({
				...categoryFilePickerStates,
				[key]: nextState,
			});
		};

		// Helper: Set active category (only one can be active at a time)
		const setActiveCategory = (categoryId: CategoryId | null) => {
			const next: FilePickerStatesStore = {};

			// Reset active flag for all existing entries
			for (const [key, state] of Object.entries(categoryFilePickerStates)) {
				next[key] = {
					...state,
					active: false,
				};
			}
			// Activate the specified one
			if (categoryId !== null) {
				const key = String(categoryId);
				const base = getPickerState(categoryId);
				next[key] = {
					...base,
					active: true,
					visible: true,
				};
			}
			setCategoryFilePickerStates(next);
		};
		// Helper: Get active category ID
		const getActiveCategory = (): CategoryId | null => {
			for (const [key, state] of Object.entries(categoryFilePickerStates)) {
				if (state.active) {
					return key as CategoryId;
				}
			}
			return null;
		};
		// Pre compute grouped files for all categories with file selection enabled.
		const allGroupedFilesByCategory = useMemo(() => {
			const grouped = new Map<
				CategoryId,
				ReturnType<typeof groupFilesByDirectory>
			>();

			for (const result of results) {
				if (!categoriesWithFileSelection.has(result.category.id)) continue;

				const pickerState = getPickerState(result.category.id);
				const limitsMap = toDirLimitsMap(pickerState.dirExpandLimits);

				grouped.set(
					result.category.id,
					groupFilesByDirectory(result.items, absolutePaths, limitsMap),
				);
			}
			return grouped;
		}, [
			results,
			categoriesWithFileSelection,
			absolutePaths,
			categoryFilePickerStates,
		]);

		const activeCategory = getActiveCategory();
		const currentResult = results[categoryCursor];
		const canShowFiles = categoriesWithFileSelection.has(
			currentResult.category.id,
		);

		// Get grouped files for active category (for navigation in files pane)
		const activeGroupedFiles = activeCategory
			? allGroupedFilesByCategory.get(activeCategory) || []
			: [];

		useKeypress((key) => {
			if (isEnterKey(key)) {
				// Show cursor before completing
				process.stdout.write("\x1B[?25h");
				done({
					selectedCategories,
					selectedFilesByCategory,
				});
				return;
			}

			if (activePane === "categories") {
				if (isUpKey(key)) {
					setCategoryCursor(Math.max(0, categoryCursor - 1));
				} else if (isDownKey(key)) {
					setCategoryCursor(Math.min(results.length - 1, categoryCursor + 1));
				} else if (key.name === "space") {
					const currentCategory = currentResult.category.id;
					const newSelected = new Set(selectedCategories);
					const newFileSelections = new Map(selectedFilesByCategory);

					if (newSelected.has(currentCategory)) {
						// Deselecting category - remove it and clear its file selections
						newSelected.delete(currentCategory);
						if (categoriesWithFileSelection.has(currentCategory)) {
							newFileSelections.set(currentCategory, new Set());
							// Hide file picker for this category
							updatePickerState(currentCategory, { visible: false });
						}
					} else {
						// Selecting category - add it and show files pane
						newSelected.add(currentCategory);

						// Show files pane when selecting a category with file selection
						if (categoriesWithFileSelection.has(currentCategory)) {
							updatePickerState(currentCategory, { visible: true });
							const categoryResult = results.find(
								(r) => r.category.id === currentCategory,
							);
							if (categoryResult) {
								const allFilePaths = new Set(
									categoryResult.items.map((item) => item.path),
								);
								newFileSelections.set(currentCategory, allFilePaths);
							}
						}
					}

					setSelectedCategories(newSelected);
					setSelectedFilesByCategory(newFileSelections);
				} else if (key.name === "a") {
					const allCategories = results.map((r) => r.category.id);
					const allSelected = allCategories.every((id) =>
						selectedCategories.has(id),
					);

					if (allSelected) {
						// Deselecting all
						setSelectedCategories(new Set());
						setSelectedFilesByCategory(new Map());
						// Hide all file pickers
						setCategoryFilePickerStates({});
					} else {
						// Selecting all - auto-select files for categories with file selection
						const newFileSelections = new Map<CategoryId, Set<string>>();

						for (const result of results) {
							if (categoriesWithFileSelection.has(result.category.id)) {
								const allFilePaths = new Set(
									result.items.map((item) => item.path),
								);
								newFileSelections.set(result.category.id, allFilePaths);
								// Show file picker for this category
								updatePickerState(result.category.id, { visible: true });
							}
						}
						setSelectedCategories(new Set(allCategories));
						setSelectedFilesByCategory(newFileSelections);
					}
				} else if (key.name === "i") {
					const newSelected = new Set(selectedCategories);
					const newFileSelections = new Map(selectedFilesByCategory);

					for (const result of results) {
						if (newSelected.has(result.category.id)) {
							// Deselecting this category
							newSelected.delete(result.category.id);
							if (categoriesWithFileSelection.has(result.category.id)) {
								newFileSelections.delete(result.category.id);
								updatePickerState(result.category.id, { visible: false });
							}
						} else {
							// Selecting this category
							newSelected.add(result.category.id);

							// If this category supports file selection, auto-select all files
							if (categoriesWithFileSelection.has(result.category.id)) {
								const allFilePaths = new Set(
									result.items.map((item) => item.path),
								);
								newFileSelections.set(result.category.id, allFilePaths);
								updatePickerState(result.category.id, { visible: true });
							}
						}
					}

					setSelectedCategories(newSelected);
					setSelectedFilesByCategory(newFileSelections);
				} else if (
					key.name === "right" &&
					canShowFiles &&
					allGroupedFilesByCategory.has(currentResult.category.id)
				) {
					// Right arrow enters files pane for current category
					const groupedFiles =
						allGroupedFilesByCategory.get(currentResult.category.id) || [];
					if (groupedFiles.length > 0) {
						const key = String(currentResult.category.id);
						const base = getPickerState(currentResult.category.id);

						// Cursor starts on a selectable item (skip dir headers and expand hints).
						let initialCursor = base.fileCaret;
						if (
							initialCursor >= groupedFiles.length ||
							!groupedFiles[initialCursor]?.selectable
						) {
							initialCursor = 0;
							while (
								initialCursor < groupedFiles.length &&
								!groupedFiles[initialCursor]?.selectable
							) {
								initialCursor++;
							}
						}
						const next: FilePickerStatesStore = {};

						// Clear active flag on all categories
						for (const [k, state] of Object.entries(categoryFilePickerStates)) {
							next[k] = {
								...state,
								active: false,
							};
						}

						next[key] = {
							...base,
							active: true,
							visible: true,
							fileCaret:
								initialCursor < groupedFiles.length ? initialCursor : 0,
						};

						setCategoryFilePickerStates(next);
						setActivePane("files");
					}
				}
			} else if (activePane === "files" && activeCategory) {
				const pickerState = getPickerState(activeCategory);
				const fileCursor = pickerState.fileCaret;

				// Navigation in files pane skips over non-selectable items (headers, expand hints)
				if (isUpKey(key)) {
					let newCursor = fileCursor - 1;
					while (
						newCursor >= 0 &&
						newCursor < activeGroupedFiles.length &&
						!activeGroupedFiles[newCursor]?.selectable
					) {
						newCursor--;
					}
					if (newCursor >= 0 && newCursor < activeGroupedFiles.length) {
						updatePickerState(activeCategory, { fileCaret: newCursor });
					}
				} else if (isDownKey(key)) {
					let newCursor = fileCursor + 1;
					while (
						newCursor < activeGroupedFiles.length &&
						!activeGroupedFiles[newCursor]?.selectable
					) {
						newCursor++;
					}
					if (newCursor < activeGroupedFiles.length) {
						updatePickerState(activeCategory, { fileCaret: newCursor });
					}
				} else if (key.name === "space") {
					const currentFile = activeGroupedFiles[fileCursor];
					if (currentFile?.selectable && currentFile.item) {
						const currentFiles =
							selectedFilesByCategory.get(activeCategory) || new Set<string>();
						const newSelected = new Set(currentFiles);
						const newCategories = new Set(selectedCategories);
						if (newSelected.has(currentFile.item.path)) {
							newSelected.delete(currentFile.item.path);
							// If no files remain selected, deactivate the category
							if (newSelected.size === 0) {
								newCategories.delete(activeCategory);
							}
						} else {
							newSelected.add(currentFile.item.path);
							// Auto select parent category when selecting a file
							newCategories.add(activeCategory);
						}
						const newFileSelections = new Map(selectedFilesByCategory);
						newFileSelections.set(activeCategory, newSelected);
						setSelectedCategories(newCategories);
						setSelectedFilesByCategory(newFileSelections);
					}
				} else if (key.name === "a") {
					const currentFiles =
						selectedFilesByCategory.get(activeCategory) || new Set<string>();
					const categoryResult = results.find(
						(r) => r.category.id === activeCategory,
					);
					if (!categoryResult) return;

					// Use ALL files from categoryResult.items, not just visible groupedFiles
					const allFiles = categoryResult.items.map((item) => item.path);
					const allSelected = allFiles.every((p) => currentFiles.has(p));
					const newSelected = new Set(currentFiles);
					const newCategories = new Set(selectedCategories);

					if (allSelected) {
						for (const p of allFiles) {
							newSelected.delete(p);
						}
						// If no files remain selected, deactivate the category
						if (newSelected.size === 0) {
							newCategories.delete(activeCategory);
						}
					} else {
						for (const p of allFiles) {
							newSelected.add(p);
						}
						// Auto select parent category when selecting files
						newCategories.add(activeCategory);
					}

					const newFileSelections = new Map(selectedFilesByCategory);
					newFileSelections.set(activeCategory, newSelected);
					setSelectedCategories(newCategories);
					setSelectedFilesByCategory(newFileSelections);
				} else if (key.name === "d") {
					// Toggle all files in the current directory (based on directoryKey).
					// If all files in dir are selected, deselect them; otherwise select all.
					const currentFile = activeGroupedFiles[fileCursor];
					if (currentFile?.selectable) {
						const currentFiles =
							selectedFilesByCategory.get(activeCategory) || new Set<string>();
						const dirFiles = activeGroupedFiles
							.filter(
								(f) =>
									f.selectable &&
									f.directoryKey === currentFile.directoryKey &&
									f.item,
							)
							.map((f) => f.item?.path);
						const allDirSelected = dirFiles.every(
							(p) => p && currentFiles.has(p),
						);
						const newSelected = new Set(currentFiles);

						if (allDirSelected) {
							for (const p of dirFiles) {
								if (typeof p === "string") {
									newSelected.delete(p);
								}
							}
						} else {
							for (const p of dirFiles) {
								if (typeof p === "string") {
									newSelected.add(p);
								}
							}
						}

						const newFileSelections = new Map(selectedFilesByCategory);
						newFileSelections.set(activeCategory, newSelected);
						setSelectedFilesByCategory(newFileSelections);
					}
				} else if (key.name === "i") {
					const currentFiles =
						selectedFilesByCategory.get(activeCategory) || new Set<string>();
					const categoryResult = results.find(
						(r) => r.category.id === activeCategory,
					);
					if (!categoryResult) return;

					// Use ALL files from categoryResult.items, not just visible groupedFiles
					const allFiles = categoryResult.items.map((item) => item.path);
					const newSelected = new Set(currentFiles);
					const newCategories = new Set(selectedCategories);
					let hasAnySelected = false;

					for (const p of allFiles) {
						if (newSelected.has(p)) {
							newSelected.delete(p);
						} else {
							newSelected.add(p);
							hasAnySelected = true;
						}
					}

					// Auto select parent category if any file becomes selected
					if (hasAnySelected) {
						newCategories.add(activeCategory);
					} else if (newSelected.size === 0) {
						// If no files remain selected, deactivate the category
						newCategories.delete(activeCategory);
					}

					const newFileSelections = new Map(selectedFilesByCategory);
					newFileSelections.set(activeCategory, newSelected);
					setSelectedCategories(newCategories);
					setSelectedFilesByCategory(newFileSelections);
				} else if (key.name === "c" && !key.ctrl) {
					// Copy directory path to clipboard
					const currentFile = activeGroupedFiles[fileCursor];
					if (currentFile?.item) {
						const dirPath = path.dirname(currentFile.item.path);
						// Clear previous timeout before creating new one
						if (copyTimeoutRef.current) {
							clearTimeout(copyTimeoutRef.current);
							copyTimeoutRef.current = null;
						}
						copyToClipboard(dirPath)
							.then(() => {
								setCopyStatus(`Copied: ${dirPath}`);
								copyTimeoutRef.current = setTimeout(
									() => setCopyStatus(null),
									2000,
								);
							})
							.catch((error: Error) => {
								setCopyStatus(`Failed to copy: ${error.message}`);
								copyTimeoutRef.current = setTimeout(
									() => setCopyStatus(null),
									3000,
								);
							});
					}
				} else if (key.name === "m") {
					// Expand current directory by 10 more items
					const currentFile = activeGroupedFiles[fileCursor];
					if (currentFile?.directoryKey) {
						const currentLimit =
							pickerState.dirExpandLimits[currentFile.directoryKey] ??
							DIR_VIS_CHILD_LIMIT;
						const newLimits: Record<string, number> = {
							...pickerState.dirExpandLimits,
							[currentFile.directoryKey]: currentLimit + EXPAND_INCREMENT,
						};
						updatePickerState(activeCategory, { dirExpandLimits: newLimits });
					}
				} else if (key.name === "h") {
					// Collapse current directory to default (5 items)
					const currentFile = activeGroupedFiles[fileCursor];
					if (currentFile?.directoryKey) {
						const newLimits: Record<string, number> = {
							...pickerState.dirExpandLimits,
							[currentFile.directoryKey]: DIR_VIS_CHILD_LIMIT,
						};
						updatePickerState(activeCategory, { dirExpandLimits: newLimits });
					}
				} else if (key.name === "right") {
					// If on expand-hint line, expand that directory
					const currentFile = activeGroupedFiles[fileCursor];
					if (
						currentFile &&
						currentFile.type === "expand-hint" &&
						currentFile.directoryKey
					) {
						const currentLimit =
							pickerState.dirExpandLimits[currentFile.directoryKey] ??
							DIR_VIS_CHILD_LIMIT;
						const newLimits: Record<string, number> = {
							...pickerState.dirExpandLimits,
							[currentFile.directoryKey]: currentLimit + EXPAND_INCREMENT,
						};
						updatePickerState(activeCategory, { dirExpandLimits: newLimits });
					}
				} else if (key.name === "left" || key.name === "backspace") {
					setActiveCategory(null);
					setActivePane("categories");
				}
			}
		});

		const lines: string[] = [];
		lines.push(`${prefix} ${chalk.bold(config.message)}`);
		lines.push("");

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const isSelected = selectedCategories.has(result.category.id);
			const isCursor = i === categoryCursor && activePane === "categories";
			const checkbox = isSelected ? chalk.green("◉") : chalk.dim("◯");
			const name = result.category.name.padEnd(25);
			const itemCount = `${result.items.length} items`.padEnd(12);
			const size = formatSize(result.totalSize).padStart(10);

			const cursorIndicator = isCursor ? chalk.cyan("> ") : "  ";
			const line = `${cursorIndicator}${checkbox} ${name} ${chalk.dim(itemCount)} ${chalk.yellow(size)}`;
			lines.push(line);

			// Show files inline when:
			// 1. Category is selected AND picker is visible (active categories always show files)
			// 2. OR this category's picker is active (entered via right arrow)
			const pickerState = getPickerState(result.category.id);
			const shouldShowFilesInline =
				(isSelected && pickerState.visible) || pickerState.active;

			if (shouldShowFilesInline) {
				// Get the correct grouped files for THIS category
				const filesToDisplay =
					allGroupedFilesByCategory.get(result.category.id) || [];

				// Show paginated view with cursor when this category's picker is active
				const isThisPickerActive = pickerState.active;
				const fileCursor = pickerState.fileCaret;

				// Implement centered pagination: window the visible file list around the cursor position
				// to keep it in view. When inactive, show from top. Clamp to valid range.
				const fileStart = isThisPickerActive
					? Math.max(
							0,
							Math.min(
								fileCursor - Math.floor(FILES_PAGE_SIZE / 2),
								filesToDisplay.length - FILES_PAGE_SIZE,
							),
						)
					: 0;
				const fileEnd = Math.min(
					filesToDisplay.length,
					fileStart + FILES_PAGE_SIZE,
				);

				const categoryId = result.category.id;
				const currentFiles =
					selectedFilesByCategory.get(categoryId) || new Set<string>();

				for (let j = fileStart; j < fileEnd; j++) {
					const file = filesToDisplay[j];
					const isFileCursor = isThisPickerActive && j === fileCursor;
					let fileLine = "";

					// Dim file list when not actively navigating THIS picker
					const dimFiles = !isThisPickerActive;

					if (file.type === "directory-header") {
						const itemCount = file.totalFilesInDir ?? 0;
						const countText = chalk.dim(` (${itemCount})`);
						const cursorIndicator = isFileCursor ? chalk.cyan("> ") : "  ";
						const headerText = `${INDENT}${cursorIndicator}${chalk.dim(file.displayName ?? "")}${countText}`;
						fileLine = dimFiles ? chalk.dim(headerText) : headerText;
					} else if (file.type === "expand-hint") {
						const hiddenCount = file.hiddenCount ?? 0;
						const cursorIndicator = isFileCursor ? chalk.cyan("> ") : "  ";
						const hintText = `${INDENT}${cursorIndicator}${chalk.black.bgCyan(`+${hiddenCount} files`)}`;
						fileLine = dimFiles ? chalk.dim(hintText) : hintText;
					} else if (file.item) {
						const fileItem = file.item;
						const fileSelected = currentFiles.has(fileItem.path);
						const fileCheckbox = fileSelected
							? chalk.green("●")
							: chalk.dim("○");
						const truncatedFileName = truncateFileName(
							file.displayName ?? "",
							FILE_NAME_WIDTH,
						);
						const fileName = truncatedFileName.padEnd(FILE_NAME_WIDTH);
						const fileSize = formatSize(file.size ?? 0).padStart(10);
						const cursorIndicator = isFileCursor ? chalk.cyan("> ") : "  ";
						const itemText = `${INDENT}${cursorIndicator}${fileCheckbox} ${fileName} ${chalk.magenta(fileSize)}`;
						fileLine = dimFiles ? chalk.dim(itemText) : itemText;
					}

					lines.push(fileLine);
				}
			}
		}

		lines.push("");
		if (activePane === "categories") {
			const currentGroupedFiles =
				allGroupedFilesByCategory.get(currentResult.category.id) || [];
			const canViewFiles = canShowFiles && currentGroupedFiles.length > 0;
			const filesHint = canViewFiles ? " | →: see files" : "";
			lines.push(
				chalk.dim(
					`space: toggle | a: all | i: invert${filesHint} | enter: confirm`,
				),
			);
		} else {
			const baseHelp =
				"space: toggle | a: all | d: select dir | i: invert | m: expand | h: collapse | c: copy path | ←/backspace: back | enter: confirm";
			if (copyStatus) {
				lines.push(chalk.yellow(copyStatus));
			} else {
				lines.push(chalk.dim(baseHelp));
			}
		}
		// Hide cursor and return the rendered output
		return `\x1B[?25l${lines.join("\n")}`;
	},
);
