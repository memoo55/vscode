/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { ITableContextMenuEvent, ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenEvent, WorkbenchTable } from 'vs/platform/list/browser/listService';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { Marker } from 'vs/workbench/contrib/markers/browser/markersModel';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { SeverityIcon } from 'vs/platform/severityIcon/common/severityIcon';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ILabelService } from 'vs/platform/label/common/label';
import { FilterOptions } from 'vs/workbench/contrib/markers/browser/markersFilterOptions';
import { IMatch } from 'vs/base/common/filters';
import { Link } from 'vs/platform/opener/browser/link';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkersViewModel } from 'vs/workbench/contrib/markers/browser/markersTreeViewer';
import { IAction } from 'vs/base/common/actions';
import { QuickFixAction, QuickFixActionViewItem } from 'vs/workbench/contrib/markers/browser/markersViewActions';
import { DomEmitter } from 'vs/base/browser/event';
import Messages from 'vs/workbench/contrib/markers/browser/messages';
import { isUndefinedOrNull } from 'vs/base/common/types';

const $ = DOM.$;

export interface IMarkerTableItem {
	marker: Marker;
	sourceMatches?: IMatch[];
	codeMatches?: IMatch[];
	messageMatches?: IMatch[];
	fileMatches?: IMatch[];
	ownerMatches?: IMatch[];
}

interface IMarkerIconColumnTemplateData {
	readonly icon: HTMLElement;
	readonly actionBar: ActionBar;
}

interface IMarkerMessageColumnTemplateData {
	readonly messageLabel: HighlightedLabel;
	readonly sourceLabel: HighlightedLabel;
	readonly codeLabel: HighlightedLabel;
	readonly codeLink: Link;
	readonly codeLinkLabel: HighlightedLabel;

}

interface IMarkerFileColumnTemplateData {
	readonly fileLabel: HighlightedLabel;
	readonly positionLabel: HighlightedLabel;
}


interface IMarkerHighlightedLabelColumnTemplateData {
	readonly highlightedLabel: HighlightedLabel;
}

class MarkerSeverityColumnRenderer implements ITableRenderer<IMarkerTableItem, IMarkerIconColumnTemplateData>{

	static readonly TEMPLATE_ID = 'severity';

	readonly templateId: string = MarkerSeverityColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly markersViewModel: MarkersViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): IMarkerIconColumnTemplateData {
		const severityColumn = DOM.append(container, $('.severity'));
		const icon = DOM.append(severityColumn, $(''));

		const actionBarColumn = DOM.append(container, $('.actions'));
		const actionBar = new ActionBar(actionBarColumn, {
			actionViewItemProvider: (action: IAction) => action.id === QuickFixAction.ID ? this.instantiationService.createInstance(QuickFixActionViewItem, <QuickFixAction>action) : undefined,
			animated: false
		});

		return { actionBar, icon };
	}

	renderElement(element: IMarkerTableItem, index: number, templateData: IMarkerIconColumnTemplateData, height: number | undefined): void {
		const toggleQuickFix = (enabled?: boolean) => {
			if (!isUndefinedOrNull(enabled)) {
				const container = DOM.findParentWithClass(templateData.icon, 'monaco-table-td')!;
				container.classList.toggle('quickFix', enabled);
			}
		};

		templateData.icon.className = `marker-icon codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.marker.severity))}`;

		templateData.actionBar.clear();
		const viewModel = this.markersViewModel.getViewModel(element.marker);
		if (viewModel) {
			const quickFixAction = viewModel.quickFixAction;
			templateData.actionBar.push([quickFixAction], { icon: true, label: false });
			toggleQuickFix(viewModel.quickFixAction.enabled);

			quickFixAction.onDidChange(({ enabled }) => toggleQuickFix(enabled));
		}
	}

	disposeTemplate(templateData: IMarkerIconColumnTemplateData): void { }
}

class MarkerMessageColumnRenderer implements ITableRenderer<IMarkerTableItem, IMarkerMessageColumnTemplateData>{

	static readonly TEMPLATE_ID = 'message';

	readonly templateId: string = MarkerMessageColumnRenderer.TEMPLATE_ID;

	constructor(
		@IOpenerService private readonly openerService: IOpenerService
	) { }

	renderTemplate(container: HTMLElement): IMarkerMessageColumnTemplateData {
		const messageColumn = DOM.append(container, $('.message'));

		const messageLabel = new HighlightedLabel(messageColumn, false);

		const sourceLabel = new HighlightedLabel(messageColumn, false);
		sourceLabel.element.classList.add('source-label');

		const codeLabel = new HighlightedLabel(messageColumn, false);
		codeLabel.element.classList.add('code-label');

		const codeLink = new Link({ href: '', label: '', title: '' }, undefined, this.openerService);
		DOM.append(messageColumn, codeLink.el);
		const codeLinkLabel = new HighlightedLabel(codeLink.el, false);

		const sourceLinkLabel = new HighlightedLabel(messageColumn, false);
		sourceLinkLabel.element.classList.add('source-label');

		return { messageLabel, sourceLabel, codeLabel, codeLink, codeLinkLabel };
	}

	renderElement(element: IMarkerTableItem, index: number, templateData: IMarkerMessageColumnTemplateData, height: number | undefined): void {
		templateData.messageLabel.set(element.marker.marker.message, element.messageMatches);

		if (element.marker.marker.source && element.marker.marker.code) {
			if (typeof element.marker.marker.code === 'string') {
				DOM.hide(templateData.codeLink.el);
				DOM.show(templateData.codeLabel.element);

				templateData.sourceLabel.set(element.marker.marker.source, element.sourceMatches);
				templateData.codeLabel.set(element.marker.marker.code, element.codeMatches);
			} else {
				DOM.hide(templateData.codeLabel.element);
				DOM.show(templateData.codeLink.el);

				templateData.sourceLabel.set(element.marker.marker.source, element.sourceMatches);
				templateData.codeLink!.el.href = element.marker.marker.code.target.toString();
				templateData.codeLink!.el.title = element.marker.marker.code.target.toString();
				templateData.codeLinkLabel.set(element.marker.marker.code.value, element.codeMatches);
			}
		}
	}

	disposeTemplate(templateData: IMarkerMessageColumnTemplateData): void { }
}

class MarkerFileColumnRenderer implements ITableRenderer<IMarkerTableItem, IMarkerFileColumnTemplateData>{

	static readonly TEMPLATE_ID = 'file';

	readonly templateId: string = MarkerFileColumnRenderer.TEMPLATE_ID;

	constructor(
		@ILabelService private readonly labelService: ILabelService
	) { }

	renderTemplate(container: HTMLElement): IMarkerFileColumnTemplateData {
		const fileColumn = DOM.append(container, $('.file'));
		const fileLabel = new HighlightedLabel(fileColumn, false);
		fileLabel.element.classList.add('file-label');
		const positionLabel = new HighlightedLabel(fileColumn, false);
		positionLabel.element.classList.add('file-position');

		return { fileLabel, positionLabel };
	}

	renderElement(element: IMarkerTableItem, index: number, templateData: IMarkerFileColumnTemplateData, height: number | undefined): void {
		templateData.fileLabel.set(this.labelService.getUriLabel(element.marker.resource, { relative: true }), element.fileMatches);
		templateData.positionLabel.set(Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.marker.marker.startLineNumber, element.marker.marker.startColumn), undefined);
	}

	disposeTemplate(templateData: IMarkerFileColumnTemplateData): void { }
}

class MarkerOwnerColumnRenderer implements ITableRenderer<IMarkerTableItem, IMarkerHighlightedLabelColumnTemplateData>{

	static readonly TEMPLATE_ID = 'owner';

	readonly templateId: string = MarkerOwnerColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IMarkerHighlightedLabelColumnTemplateData {
		const fileColumn = DOM.append(container, $('.owner'));
		const highlightedLabel = new HighlightedLabel(fileColumn, false);
		return { highlightedLabel };
	}

	renderElement(element: IMarkerTableItem, index: number, templateData: IMarkerHighlightedLabelColumnTemplateData, height: number | undefined): void {
		templateData.highlightedLabel.set(element.marker.marker.owner, element.ownerMatches);
	}

	disposeTemplate(templateData: IMarkerHighlightedLabelColumnTemplateData): void { }
}

export class MarkersTable extends Disposable {

	private _itemCount: number = 0;
	private readonly table: WorkbenchTable<IMarkerTableItem>;

	constructor(
		private readonly container: HTMLElement,
		private readonly markersViewModel: MarkersViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this.table = this.instantiationService.createInstance(WorkbenchTable,
			'Markers',
			this.container,
			new MarkersTableVirtualDelegate(),
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 36,
					maximumWidth: 36,
					templateId: MarkerSeverityColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('messageColumnLabel', "Message"),
					tooltip: '',
					weight: 2,
					templateId: MarkerMessageColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('fileColumnLabel', "File"),
					tooltip: '',
					weight: 1,
					templateId: MarkerFileColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('ownerColumnLabel', "Owner"),
					tooltip: '',
					weight: 1,
					templateId: MarkerOwnerColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				}
			],
			[
				this.instantiationService.createInstance(MarkerSeverityColumnRenderer, this.markersViewModel),
				this.instantiationService.createInstance(MarkerMessageColumnRenderer),
				this.instantiationService.createInstance(MarkerFileColumnRenderer),
				this.instantiationService.createInstance(MarkerOwnerColumnRenderer),
			],
			{
				horizontalScrolling: false,
				multipleSelectionSupport: false
			}
		) as WorkbenchTable<IMarkerTableItem>;

		const list = this.table.domNode.querySelector('.monaco-list-rows')! as HTMLElement;

		const onMouseOver = new DomEmitter(list, 'mouseover');
		const onRowHover = Event.chain(onMouseOver.event)
			.map(e => DOM.findParentWithClass(e.target as HTMLElement, 'monaco-list-row', 'monaco-list-rows'))
			.filter<HTMLElement>(((e: HTMLElement | null) => !!e) as any)
			.map(e => parseInt(e.getAttribute('data-index')!))
			.event;

		const onMouseLeave = new DomEmitter(list, 'mouseleave');
		const onListLeave = Event.map(onMouseLeave.event, () => -1);

		const onRowHoverOrLeave = Event.latch(Event.any(onRowHover, onListLeave));
		const onRowPermanentHover = Event.debounce(onRowHoverOrLeave, (_, e) => e, 500);

		onRowPermanentHover(e => {
			if (e !== -1) {
				this.markersViewModel.onMarkerMouseHover(this.table.row(e).marker);
			}
		});
	}

	get itemCount(): number {
		return this._itemCount;
	}

	get on(): Event<ITableContextMenuEvent<IMarkerTableItem>> {
		return this.table.onContextMenu;
	}

	get onContextMenu(): Event<ITableContextMenuEvent<IMarkerTableItem>> {
		return this.table.onContextMenu;
	}

	get onDidOpen(): Event<IOpenEvent<IMarkerTableItem | undefined>> {
		return this.table.onDidOpen;
	}

	isVisible(): boolean {
		return !this.container.classList.contains('hidden');
	}

	layout(height: number, width: number): void {
		this.table.layout(height, width);
	}

	toggleVisibility(hide: boolean): void {
		this.container.classList.toggle('hidden', hide);
	}

	updateTable(markers: Marker[], filterOptions: FilterOptions): void {
		const items: IMarkerTableItem[] = [];

		for (const marker of markers) {
			// Severity filter
			const matchesSeverity = filterOptions.showErrors && MarkerSeverity.Error === marker.marker.severity ||
				filterOptions.showWarnings && MarkerSeverity.Warning === marker.marker.severity ||
				filterOptions.showInfos && MarkerSeverity.Info === marker.marker.severity;

			if (!matchesSeverity) {
				continue;
			}

			// // Include pattern
			// if (filterOptions.filter && !filterOptions.includesMatcher.matches(marker.resource)) {
			// 	continue;
			// }

			// // Exclude pattern
			// if (filterOptions.filter && filterOptions.excludesMatcher.matches(marker.resource)) {
			// 	continue;
			// }

			// Text filter
			if (filterOptions.textFilter.text) {
				const sourceMatches = marker.marker.source ? FilterOptions._filter(filterOptions.textFilter.text, marker.marker.source) ?? undefined : undefined;
				const codeMatches = marker.marker.code ? FilterOptions._filter(filterOptions.textFilter.text, typeof marker.marker.code === 'string' ? marker.marker.code : marker.marker.code.value) ?? undefined : undefined;
				const messageMatches = FilterOptions._messageFilter(filterOptions.textFilter.text, marker.marker.message) ?? undefined;
				const fileMatches = FilterOptions._messageFilter(filterOptions.textFilter.text, this.labelService.getUriLabel(marker.resource, { relative: true })) ?? undefined;
				const ownerMatches = FilterOptions._messageFilter(filterOptions.textFilter.text, marker.marker.owner) ?? undefined;

				const matched = sourceMatches || codeMatches || messageMatches || fileMatches || ownerMatches;
				if ((matched && !filterOptions.textFilter.negate) || (!matched && filterOptions.textFilter.negate)) {
					items.push({ marker, sourceMatches, codeMatches, messageMatches, fileMatches, ownerMatches });
				}

				continue;
			}

			items.push({ marker });
		}

		this._itemCount = items.length;
		this.table.splice(0, Number.POSITIVE_INFINITY, items.sort((a, b) => MarkerSeverity.compare(a.marker.marker.severity, b.marker.marker.severity)));
	}
}

class MarkersTableVirtualDelegate implements ITableVirtualDelegate<any> {
	static readonly HEADER_ROW_HEIGHT = 30;
	static readonly ROW_HEIGHT = 24;
	readonly headerRowHeight = MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT;

	getHeight(item: any) {
		return MarkersTableVirtualDelegate.ROW_HEIGHT;
	}
}
