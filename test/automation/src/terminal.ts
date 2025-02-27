/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInput } from './quickinput';
import { Code } from './code';
import { QuickAccess } from './quickaccess';

export enum Selector {
	TerminalView = `#terminal`,
	Xterm = `#terminal .terminal-wrapper`,
	XtermEditor = `.editor-instance .terminal-wrapper`,
	TabsEntry = '.terminal-tabs-entry',
	XtermFocused = '.terminal.xterm.focus',
	PlusButton = '.codicon-plus',
	EditorGroups = '.editor .split-view-view',
	EditorTab = '.terminal-tab',
	SingleTab = '.single-terminal-tab',
	Tabs = '.tabs-list .monaco-list-row',
	SplitButton = '.editor .codicon-split-horizontal',
	XtermSplitIndex0 = '#terminal .terminal-groups-container .split-view-view:nth-child(1) .terminal-wrapper',
	XtermSplitIndex1 = '#terminal .terminal-groups-container .split-view-view:nth-child(2) .terminal-wrapper'
}

/**
 * Terminal commands that accept a value in a quick input.
 */
export enum TerminalCommandIdWithValue {
	Rename = 'workbench.action.terminal.rename',
	ChangeColor = 'workbench.action.terminal.changeColor',
	ChangeIcon = 'workbench.action.terminal.changeIcon',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell',
	AttachToSession = 'workbench.action.terminal.attachToSession'
}

/**
 * Terminal commands that do not present a quick input.
 */
export enum TerminalCommandId {
	Split = 'workbench.action.terminal.split',
	KillAll = 'workbench.action.terminal.killAll',
	Unsplit = 'workbench.action.terminal.unsplit',
	Join = 'workbench.action.terminal.join',
	Show = 'workbench.action.terminal.toggleTerminal',
	CreateNewEditor = 'workbench.action.createTerminalEditor',
	SplitEditor = 'workbench.action.createTerminalEditorSide',
	MoveToPanel = 'workbench.action.terminal.moveToTerminalPanel',
	MoveToEditor = 'workbench.action.terminal.moveToEditor',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell',
	DetachSession = 'workbench.action.terminal.detachSession',
	CreateNew = 'workbench.action.terminal.new'
}
interface TerminalLabel {
	name?: string,
	icon?: string,
	color?: string
}
type TerminalGroup = TerminalLabel[];

export class Terminal {

	constructor(private code: Code, private quickaccess: QuickAccess, private quickinput: QuickInput) { }

	async runCommand(commandId: TerminalCommandId): Promise<void> {
		await this.quickaccess.runCommand(commandId, commandId === TerminalCommandId.Join);
		if (commandId === TerminalCommandId.Show) {
			return await this._waitForTerminal(undefined);
		}
		await this.code.dispatchKeybinding('enter');
		await this.quickinput.waitForQuickInputClosed();
	}

	async runCommandWithValue(commandId: TerminalCommandIdWithValue, value?: string, altKey?: boolean): Promise<void> {
		const shouldKeepOpen = !!value || commandId === TerminalCommandIdWithValue.NewWithProfile || commandId === TerminalCommandIdWithValue.Rename || (commandId === TerminalCommandIdWithValue.SelectDefaultProfile && value !== 'PowerShell');
		await this.quickaccess.runCommand(commandId, shouldKeepOpen);
		// Running the command should hide the quick input in the following frame, this next wait
		// ensures that the quick input is opened again before proceeding to avoid a race condition
		// where the enter keybinding below would close the quick input if it's triggered before the
		// new quick input shows.
		await this.quickinput.waitForQuickInputOpened();
		if (value) {
			await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, value);
		} else if (commandId === TerminalCommandIdWithValue.Rename) {
			// Reset
			await this.code.dispatchKeybinding('Backspace');
		}
		await this.code.dispatchKeybinding(altKey ? 'Alt+Enter' : 'enter');
		await this.quickinput.waitForQuickInputClosed();
	}

	async runCommandInTerminal(commandText: string, skipEnter?: boolean): Promise<void> {
		await this.code.writeInTerminal(Selector.Xterm, commandText);
		if (!skipEnter) {
			await this.code.dispatchKeybinding('enter');
		}
	}

	/**
	 * Creates a terminal using the new terminal command.
	 * @param location The location to check the terminal for, defaults to panel.
	 */
	async createTerminal(location?: 'editor' | 'panel'): Promise<void> {
		await this.runCommand(TerminalCommandId.CreateNew);
		await this._waitForTerminal(location);
	}

	async assertEditorGroupCount(count: number): Promise<void> {
		await this.code.waitForElements(Selector.EditorGroups, true, editorGroups => editorGroups && editorGroups.length === count);
	}

	async assertSingleTab(label: TerminalLabel, editor?: boolean): Promise<void> {
		await this.assertTabExpected(editor ? Selector.EditorTab : Selector.SingleTab, undefined, label.name ? new RegExp(label.name) : undefined, label.icon, label.color);
	}

	async assertTerminalGroups(expectedGroups: TerminalGroup[]): Promise<void> {
		let expectedCount = 0;
		expectedGroups.forEach(g => expectedCount += g.length);
		let index = 0;
		while (index < expectedCount) {
			for (let groupIndex = 0; groupIndex < expectedGroups.length; groupIndex++) {
				let terminalsInGroup = expectedGroups[groupIndex].length;
				let indexInGroup = 0;
				const isSplit = terminalsInGroup > 1;
				while (indexInGroup < terminalsInGroup) {
					let instance = expectedGroups[groupIndex][indexInGroup];
					const nameRegex = instance.name && isSplit ? new RegExp('\\s*[├┌└]\\s*' + instance.name) : instance.name ? new RegExp(/^\s*/ + instance.name) : undefined;
					await this.assertTabExpected(undefined, index, nameRegex, instance.icon, instance.color);
					indexInGroup++;
					index++;
				}
			}
		}
	}

	async getTerminalGroups(): Promise<TerminalGroup[]> {
		const tabCount = (await this.code.waitForElements(Selector.Tabs, true)).length;
		const groups: TerminalGroup[] = [];
		for (let i = 0; i < tabCount; i++) {
			const instance = await this.code.waitForElement(`${Selector.Tabs}[data-index="${i}"] ${Selector.TabsEntry}`, e => e?.textContent?.length ? e?.textContent?.length > 1 : false);
			const label: TerminalLabel = {
				name: instance.textContent.replace(/^[├┌└]\s*/, '')
			};
			// It's a new group if the the tab does not start with ├ or └
			if (instance.textContent.match(/^[├└]/)) {
				groups[groups.length - 1].push(label);
			} else {
				groups.push([label]);
			}
		}
		return groups;
	}

	async getSingleTabName(): Promise<string> {
		const tab = await this.code.waitForElement(Selector.SingleTab, singleTab => !!singleTab && singleTab?.textContent.length > 1);
		return tab.textContent;
	}

	private async assertTabExpected(selector?: string, listIndex?: number, nameRegex?: RegExp, icon?: string, color?: string): Promise<void> {
		if (listIndex) {
			if (nameRegex) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry}`, entry => !!entry && !!entry?.textContent.match(nameRegex));
			}
			if (color) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry} .monaco-icon-label.terminal-icon-terminal_ansi${color}`);
			}
			if (icon) {
				await this.code.waitForElement(`${Selector.Tabs}[data-index="${listIndex}"] ${Selector.TabsEntry} .codicon-${icon}`);
			}
		} else if (selector) {
			if (nameRegex) {
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab?.textContent.match(nameRegex));
			}
			if (color) {
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab.className.includes(`terminal-icon-terminal_ansi${color}`));
			}
			if (icon) {
				selector = selector === Selector.EditorTab ? selector : `${selector} .codicon`;
				await this.code.waitForElement(`${selector}`, singleTab => !!singleTab && !!singleTab.className.includes(icon));
			}
		}
	}

	async assertTerminalViewHidden(): Promise<void> {
		await this.code.waitForElement(Selector.TerminalView, result => result === undefined);
	}

	async clickPlusButton(): Promise<void> {
		await this.code.waitAndClick(Selector.PlusButton);
	}

	async clickSplitButton(): Promise<void> {
		await this.code.waitAndClick(Selector.SplitButton);
	}

	async clickSingleTab(): Promise<void> {
		await this.code.waitAndClick(Selector.SingleTab);
	}

	async waitForTerminalText(accept: (buffer: string[]) => boolean, message?: string, splitIndex?: 0 | 1): Promise<void> {
		try {
			let selector: string = Selector.Xterm;
			if (splitIndex !== undefined) {
				selector = splitIndex === 0 ? Selector.XtermSplitIndex0 : Selector.XtermSplitIndex1;
			}
			await this.code.waitForTerminalBuffer(selector, accept);
		} catch (err: any) {
			if (message) {
				throw new Error(`${message} \n\nInner exception: \n${err.message} `);
			}
			throw err;
		}
	}

	async getPage(): Promise<any> {
		return (this.code.driver as any).page;
	}

	/**
	 * Waits for the terminal to be focused and to contain content.
	 * @param location The location to check the terminal for, defaults to panel.
	 */
	private async _waitForTerminal(location?: 'editor' | 'panel'): Promise<void> {
		await this.code.waitForElement(Selector.XtermFocused);
		await this.code.waitForTerminalBuffer(location === 'editor' ? Selector.XtermEditor : Selector.Xterm, lines => lines.some(line => line.length > 0));
	}
}
