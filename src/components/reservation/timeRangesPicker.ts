// Client logic for TimeRangesPicker.astro (#368): the member's pick-up and
// return time ranges for the chosen dates. Each section holds rows of
// from–to time inputs; the windows offered that day are presets that add
// themselves as a range. After every change the root dispatches a bubbling
// `time-ranges-change` event, so the surrounding form (the /reservation
// checkout form, or the reschedule modal) can copy the ranges into its
// request and gate its submit button on `valid`.
//
// Rows are built with createElement rather than cloned from a <template>
// (astro-icon in a <template> blanks icons page-wide; plain text buttons
// keep this simple anyway).
import { formatDateDisplay, nowInOslo } from '../../lib/dates';
import { inputSmClasses } from '../../lib/form-styles';
import { baseClasses, sizeClasses, variantClasses } from '../../lib/button-styles';
import {
	MAX_TIME_RANGES_PER_KIND,
	isValidTimeString,
	orderTimeRangeErrorMessage,
	validateOrderTimeRanges,
	type TimeRange,
	type TimeRangeKind,
} from '../../lib/timeRanges';

export interface PickerWindow {
	startTime: string;
	endTime: string;
	where: string | null;
}

export interface TimeRangesChangeDetail {
	valid: boolean;
	pickup: TimeRange[];
	return: TimeRange[];
	// Why `valid` is false, once the member has entered something; empty otherwise.
	message: string;
}

interface InitialRanges {
	fromDate: string;
	toDate: string;
	pickup: TimeRange[];
	return: TimeRange[];
}

const KINDS: TimeRangeKind[] = ['pickup', 'return'];
const smallButton = `${baseClasses} ${sizeClasses.sm} ${variantClasses.secondary}`;
const presetButton = `${baseClasses} ${sizeClasses.sm} ${variantClasses['primary-outline']}`;

export function initTimeRangesPicker(root: HTMLElement): void {
	const windowsByDate: Record<string, PickerWindow[]> = JSON.parse(root.dataset.windows ?? '{}');
	const initial: InitialRanges | null = root.dataset.initial ? JSON.parse(root.dataset.initial) : null;
	// The calendar's `reservation-range-change` bubbles up to this scope.
	const scope: HTMLElement | Document = root.closest<HTMLElement>('[data-time-ranges-scope]') ?? document;
	const messageEl = root.querySelector<HTMLElement>('[data-time-ranges-message]');

	const dates: Record<TimeRangeKind, string | undefined> = { pickup: undefined, return: undefined };
	const section = (kind: TimeRangeKind) => root.querySelector<HTMLElement>(`[data-time-ranges-section="${kind}"]`)!;
	const list = (kind: TimeRangeKind) => section(kind).querySelector<HTMLElement>('[data-time-ranges-list]')!;
	const addButton = (kind: TimeRangeKind) => section(kind).querySelector<HTMLButtonElement>('[data-time-ranges-add]')!;

	function readRows(kind: TimeRangeKind): { ranges: TimeRange[]; touched: boolean } {
		const ranges: TimeRange[] = [];
		let touched = false;
		list(kind)
			.querySelectorAll<HTMLElement>('[data-time-range-row]')
			.forEach((row) => {
				const from = row.querySelector<HTMLInputElement>('[data-time-range-from]')!.value;
				const to = row.querySelector<HTMLInputElement>('[data-time-range-to]')!.value;
				// A row left completely empty is ignored, not an error.
				if (!from && !to) return;
				touched = true;
				ranges.push({ from, to });
			});
		return { ranges, touched };
	}

	function emit() {
		const pickup = readRows('pickup');
		const ret = readRows('return');
		let detail: TimeRangesChangeDetail = { valid: false, pickup: [], return: [], message: '' };
		if (dates.pickup && dates.return) {
			const result = validateOrderTimeRanges({ pickup: pickup.ranges, return: ret.ranges }, { fromDate: dates.pickup, toDate: dates.return }, nowInOslo());
			if (result.ok) {
				detail = { valid: true, pickup: result.ranges.pickup, return: result.ranges.return, message: '' };
			} else {
				// Don't nag about an empty section the member hasn't reached yet.
				const touched = result.detail.kind === 'pickup' ? pickup.touched : ret.touched;
				const quiet = result.detail.error === 'no_ranges' || (!touched && result.detail.error !== 'return_before_pickup');
				detail.message = quiet ? '' : orderTimeRangeErrorMessage(result.detail);
			}
		}
		if (messageEl) {
			messageEl.textContent = detail.message;
			messageEl.hidden = detail.message === '';
		}
		for (const kind of KINDS) {
			addButton(kind).disabled = list(kind).children.length >= MAX_TIME_RANGES_PER_KIND;
		}
		root.dispatchEvent(new CustomEvent<TimeRangesChangeDetail>('time-ranges-change', { bubbles: true, detail }));
	}

	function timeInput(label: string, value: string, field: 'from' | 'to'): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'time';
		// en-GB forces the native picker to 24h, whatever the browser locale.
		input.lang = 'en-GB';
		input.value = value;
		input.className = `${inputSmClasses} w-28`;
		input.setAttribute('aria-label', label);
		input.dataset[field === 'from' ? 'timeRangeFrom' : 'timeRangeTo'] = '';
		return input;
	}

	function addRow(kind: TimeRangeKind, range: TimeRange = { from: '', to: '' }) {
		if (list(kind).children.length >= MAX_TIME_RANGES_PER_KIND) return;
		const which = kind === 'pickup' ? 'Pick-up' : 'Return';
		const row = document.createElement('li');
		row.className = 'flex flex-wrap items-center gap-snug';
		row.dataset.timeRangeRow = '';
		const dash = document.createElement('span');
		dash.className = 'text-sm text-text-muted';
		dash.textContent = 'to';
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = smallButton;
		remove.textContent = 'Remove';
		remove.addEventListener('click', () => {
			row.remove();
			emit();
		});
		row.append(timeInput(`${which} from`, range.from, 'from'), dash, timeInput(`${which} until`, range.to, 'to'), remove);
		list(kind).append(row);
	}

	function renderSection(kind: TimeRangeKind, date: string, ranges: TimeRange[]) {
		const el = section(kind);
		el.querySelector<HTMLElement>('[data-time-ranges-date]')!.textContent = formatDateDisplay(date, { weekday: true });
		const presets = el.querySelector<HTMLElement>('[data-time-ranges-presets]')!;
		const offered = windowsByDate[date] ?? [];
		presets.replaceChildren(
			...offered.map((window) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = presetButton;
				button.textContent = `${window.startTime}–${window.endTime}${window.where ? ` · ${window.where}` : ''}`;
				button.setAttribute('aria-label', `Add ${window.startTime} to ${window.endTime} as a ${kind === 'pickup' ? 'pick-up' : 'return'} time range`);
				button.addEventListener('click', () => {
					const already = readRows(kind).ranges.some((r) => r.from === window.startTime && r.to === window.endTime);
					if (!already) {
						// Fill an empty row first rather than adding below it.
						const empty = [...list(kind).querySelectorAll<HTMLElement>('[data-time-range-row]')].find(
							(row) => !row.querySelector<HTMLInputElement>('[data-time-range-from]')!.value && !row.querySelector<HTMLInputElement>('[data-time-range-to]')!.value,
						);
						if (empty) {
							empty.querySelector<HTMLInputElement>('[data-time-range-from]')!.value = window.startTime;
							empty.querySelector<HTMLInputElement>('[data-time-range-to]')!.value = window.endTime;
						} else {
							addRow(kind, { from: window.startTime, to: window.endTime });
						}
					}
					emit();
				});
				return button;
			}),
		);
		el.querySelector<HTMLElement>('[data-time-ranges-presets-label]')!.hidden = offered.length === 0;
		list(kind).replaceChildren();
		for (const range of ranges) addRow(kind, range);
		if (ranges.length === 0) addRow(kind);
	}

	function setDates(from: string | undefined, to: string | undefined) {
		if (!from || !to) {
			dates.pickup = undefined;
			dates.return = undefined;
			root.hidden = true;
			emit();
			return;
		}
		// Ranges belong to their date: keep a section's rows while its date is
		// unchanged, start it over when the date changes.
		for (const [kind, date] of [['pickup', from], ['return', to]] as const) {
			if (dates[kind] === date) continue;
			dates[kind] = date;
			const keep = initial && (kind === 'pickup' ? initial.fromDate : initial.toDate) === date ? initial[kind] : [];
			renderSection(kind, date, keep.filter((r) => isValidTimeString(r.from) && isValidTimeString(r.to)));
		}
		root.hidden = false;
		emit();
	}

	for (const kind of KINDS) {
		addButton(kind).addEventListener('click', () => {
			addRow(kind);
			emit();
		});
	}
	root.addEventListener('input', emit);
	root.addEventListener('change', emit);
	scope.addEventListener('reservation-range-change', (event) => {
		const { from, to } = (event as CustomEvent<{ from?: string; to?: string }>).detail;
		setDates(from, to);
	});

	// Deferred so listeners registered by later scripts (the reschedule
	// modal's) see the initial state.
	if (initial) setTimeout(() => setDates(initial.fromDate, initial.toDate), 0);
}
