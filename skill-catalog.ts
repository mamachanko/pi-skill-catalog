import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import {
	DynamicBorder,
	getAgentDir,
	parseFrontmatter,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type SlashCommandInfo,
} from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

const STARTUP_WIDGET_KEY = "skill-catalog";
const STARTUP_WIDGET_MAX_VISIBLE = 12;
const SELECTOR_MAX_VISIBLE = 10;
const CONVENTIONAL_SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

type SkillCommandInfo = SlashCommandInfo & { source: "skill" };

interface SkillPreview {
	name: string;
	description: string;
	filePath: string;
}

function getLoadedSkillCommands(pi: ExtensionAPI): SkillCommandInfo[] {
	return pi
		.getCommands()
		.filter((command): command is SkillCommandInfo => command.source === "skill")
		.sort((a, b) => a.name.localeCompare(b.name));
}

function getLoadedSkillPreviews(pi: ExtensionAPI): SkillPreview[] {
	return getLoadedSkillCommands(pi).map((skill) => ({
		name: getBareSkillName(skill.name),
		description: skill.description ?? "No description",
		filePath: skill.sourceInfo.path,
	}));
}

function shortenPath(filePath: string): string {
	const home = homedir();
	if (filePath === home) {
		return "~";
	}
	if (filePath.startsWith(`${home}${sep}`)) {
		const rel = relative(home, filePath);
		return rel ? `~/${rel}` : "~";
	}
	return filePath;
}

function getBareSkillName(commandName: string): string {
	return commandName.startsWith("skill:") ? commandName.slice(6) : commandName;
}

function normalizeSkillArgument(argument: string): string {
	const trimmed = argument.trim();
	if (!trimmed) {
		return "";
	}
	if (trimmed.startsWith("/skill:")) {
		return trimmed.slice(7);
	}
	if (trimmed.startsWith("skill:")) {
		return trimmed.slice(6);
	}
	return trimmed;
}

function findLoadedSkill(skills: SkillCommandInfo[], requested: string): SkillCommandInfo | undefined {
	const normalized = normalizeSkillArgument(requested);
	if (!normalized) {
		return undefined;
	}
	return skills.find((skill) => getBareSkillName(skill.name) === normalized);
}

function parseSkillInvocation(text: string): { skillName: string } | null {
	if (!text.startsWith("/skill:")) {
		return null;
	}
	const spaceIndex = text.indexOf(" ");
	const command = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
	return { skillName: normalizeSkillArgument(command) };
}

function collectSkillMarkdownFiles(dir: string, isRoot: boolean = true): string[] {
	if (!existsSync(dir)) {
		return [];
	}

	const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			const skillFile = join(fullPath, "SKILL.md");
			if (existsSync(skillFile)) {
				files.push(skillFile);
			} else {
				files.push(...collectSkillMarkdownFiles(fullPath, false));
			}
			continue;
		}

		if (isRoot && entry.isFile() && entry.name.endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

function readSkillPreview(filePath: string): SkillPreview | null {
	try {
		const raw = readFileSync(filePath, "utf8");
		const { frontmatter } = parseFrontmatter<Record<string, unknown>>(raw);
		const parsedName = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
		const parsedDescription = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
		const fallbackName = filePath.endsWith(`${sep}SKILL.md`) ? filePath.split(sep).at(-2) ?? filePath : filePath;
		return {
			name: parsedName || fallbackName,
			description: parsedDescription || "No description",
			filePath,
		};
	} catch {
		return null;
	}
}

function getConventionalSkillPreviews(): SkillPreview[] {
	return collectSkillMarkdownFiles(CONVENTIONAL_SKILLS_DIR)
		.map((filePath) => readSkillPreview(filePath))
		.filter((skill): skill is SkillPreview => skill !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function getNotLoadedConventionalSkills(pi: ExtensionAPI): SkillPreview[] {
	const loadedNames = new Set(getLoadedSkillPreviews(pi).map((skill) => skill.name));
	return getConventionalSkillPreviews().filter((skill) => !loadedNames.has(skill.name));
}

function formatSkillSummary(skill: SkillCommandInfo): string {
	const description = skill.description?.trim() || "No description";
	return [
		`Command: /${skill.name}`,
		`Scope: ${skill.sourceInfo.scope}`,
		`Source: ${shortenPath(skill.sourceInfo.path)}`,
		`Description: ${description}`,
	].join("\n");
}

function insertSkillCommand(commandName: string, editorText: string): string {
	const command = `/${commandName} `;
	return editorText.trim() ? `${editorText.trimEnd()}\n${command}` : command;
}

function buildSelectItems(skills: SkillCommandInfo[]): SelectItem[] {
	return skills.map((skill) => ({
		value: skill.name,
		label: `/${skill.name}`,
		description: `[${skill.sourceInfo.scope}] ${skill.description ?? "No description"} · ${shortenPath(skill.sourceInfo.path)}`,
	}));
}

function getNotLoadedSkillMessage(skillName: string): string | undefined {
	const normalized = normalizeSkillArgument(skillName);
	if (!normalized) {
		return undefined;
	}

	const notLoadedSkill = getConventionalSkillPreviews().find((skill) => skill.name === normalized);
	if (!notLoadedSkill) {
		return undefined;
	}

	return `Found /skill:${normalized} at ${shortenPath(notLoadedSkill.filePath)}, but Pi did not load it for this session. Active agent dir: ${shortenPath(getAgentDir())}`;
}

function buildStartupWidgetLines(pi: ExtensionAPI): string[] {
	const loadedSkills = getLoadedSkillPreviews(pi);
	const notLoadedSkills = getNotLoadedConventionalSkills(pi);
	const lines: string[] = [];

	lines.push("Loaded in this session:");
	if (loadedSkills.length === 0) {
		lines.push("  none");
	} else {
		for (const skill of loadedSkills.slice(0, STARTUP_WIDGET_MAX_VISIBLE)) {
			lines.push(`  /skill:${skill.name}`);
		}
		if (loadedSkills.length > STARTUP_WIDGET_MAX_VISIBLE) {
			lines.push(`  ... ${loadedSkills.length - STARTUP_WIDGET_MAX_VISIBLE} more`);
		}
	}

	if (notLoadedSkills.length > 0) {
		lines.push("");
		lines.push(`Present in ${shortenPath(CONVENTIONAL_SKILLS_DIR)} but not loaded:`);
		for (const skill of notLoadedSkills.slice(0, STARTUP_WIDGET_MAX_VISIBLE)) {
			lines.push(`  /skill:${skill.name}`);
		}
		if (notLoadedSkills.length > STARTUP_WIDGET_MAX_VISIBLE) {
			lines.push(`  ... ${notLoadedSkills.length - STARTUP_WIDGET_MAX_VISIBLE} more`);
		}
		lines.push("");
		lines.push(`Pi agent dir: ${shortenPath(getAgentDir())}`);
	}

	return lines;
}

function showStartupWidget(pi: ExtensionAPI, ctx: ExtensionContext): void {
	ctx.ui.setWidget(STARTUP_WIDGET_KEY, (_tui, theme) => {
		const container = new Container();
		container.addChild(new DynamicBorder((str: string) => theme.fg("border", str)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Skills")), 1, 0));
		for (const line of buildStartupWidgetLines(pi)) {
			container.addChild(new Text(theme.fg("dim", line), 1, 0));
		}
		container.addChild(new DynamicBorder((str: string) => theme.fg("border", str)));
		return {
			render(width: number): string[] {
				return container.render(width);
			},
			invalidate(): void {
				container.invalidate();
			},
		};
	});
}

function clearStartupWidget(ctx: ExtensionContext): void {
	ctx.ui.setWidget(STARTUP_WIDGET_KEY, undefined);
}

async function showSkillSelector(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const skills = getLoadedSkillCommands(pi);
	if (skills.length === 0) {
		ctx.ui.notify("No skills are currently loaded in this session.", "warning");
		return;
	}

	const items = buildSelectItems(skills);
	const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Available Skills")), 1, 0));

		const selectList = new SelectList(items, Math.min(items.length, SELECTOR_MAX_VISIBLE), {
			selectedPrefix: (text: string) => theme.fg("accent", text),
			selectedText: (text: string) => theme.fg("accent", text),
			description: (text: string) => theme.fg("muted", text),
			scrollInfo: (text: string) => theme.fg("dim", text),
			noMatch: (text: string) => theme.fg("warning", text),
		});

		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);

		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter insert command • esc cancel"), 1, 0));
		container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));

		return {
			render(width: number): string[] {
				return container.render(width);
			},
			invalidate(): void {
				container.invalidate();
			},
			handleInput(data: string): void {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});

	if (!result) {
		return;
	}

	ctx.ui.setEditorText(insertSkillCommand(result, ctx.ui.getEditorText()));
	const skill = skills.find((entry) => entry.name === result);
	if (skill) {
		ctx.ui.notify(`Inserted /${skill.name} · ${shortenPath(skill.sourceInfo.path)}`, "info");
	}
}

export default function skillCatalogExtension(pi: ExtensionAPI) {
	let startupWidgetVisible = false;

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) {
			return;
		}
		showStartupWidget(pi, ctx);
		startupWidgetVisible = true;
	});

	pi.on("input", (event, ctx) => {
		if (startupWidgetVisible && ctx.hasUI) {
			clearStartupWidget(ctx);
			startupWidgetVisible = false;
		}

		const invocation = parseSkillInvocation(event.text);
		if (!invocation) {
			return { action: "continue" };
		}

		const skills = getLoadedSkillCommands(pi);
		const skill = findLoadedSkill(skills, invocation.skillName);
		if (!skill) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					getNotLoadedSkillMessage(invocation.skillName) ??
						`Unknown skill: /skill:${invocation.skillName}. Use /skills to browse loaded skills.`,
					"warning",
				);
			}
			return { action: "handled" };
		}

		if (ctx.hasUI) {
			ctx.ui.notify(`Loading /${skill.name} from ${shortenPath(skill.sourceInfo.path)}`, "info");
		}
		return { action: "continue" };
	});

	pi.registerCommand("skills", {
		description: "Browse loaded skills and insert /skill:name into the editor",
		getArgumentCompletions: (prefix) => {
			const normalizedPrefix = normalizeSkillArgument(prefix).toLowerCase();
			const items = getLoadedSkillCommands(pi)
				.filter((skill) => {
					const bareName = getBareSkillName(skill.name).toLowerCase();
					const fullName = skill.name.toLowerCase();
					return !normalizedPrefix || bareName.startsWith(normalizedPrefix) || fullName.startsWith(normalizedPrefix);
				})
				.map((skill) => ({
					value: getBareSkillName(skill.name),
					label: `/${skill.name}`,
					description: skill.description,
				}));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const skills = getLoadedSkillCommands(pi);
			if (skills.length === 0) {
				ctx.ui.notify("No skills are currently loaded in this session.", "warning");
				return;
			}

			const requested = normalizeSkillArgument(args);
			if (requested) {
				const skill = findLoadedSkill(skills, requested);
				if (!skill) {
					ctx.ui.notify(
						getNotLoadedSkillMessage(requested) ?? `Unknown skill: ${requested}. Use /skills to browse loaded skills.`,
						"warning",
					);
					return;
				}
				ctx.ui.notify(formatSkillSummary(skill), "info");
				ctx.ui.setEditorText(insertSkillCommand(skill.name, ctx.ui.getEditorText()));
				return;
			}

			if (!ctx.hasUI) {
				return;
			}

			await showSkillSelector(pi, ctx);
		},
	});
}
