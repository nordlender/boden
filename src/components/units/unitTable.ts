// Shared by UnitTableHeader/UnitRow (column widths, so header and rows line
// up structurally — same idea as wizard/grid.ts) and by the unit forms
// (field list and input styling).
//
// Columns: id | unit (brand/model, serial, opts) | marking | made | bought | status | actions.
// Actions holds the new-note button and the details toggle. Below `sm` only
// id | unit | status | actions remain; marking moves under the unit cell and
// the dates into the details panel.
const UNIT_GRID = '3rem minmax(0,1fr) 10rem 6.5rem 6.5rem 9rem 4.5rem';
const UNIT_GRID_MOBILE = '3rem minmax(0,1fr) 9rem 4.5rem';

export const UNIT_GRID_STYLE = `--grid-cols: ${UNIT_GRID_MOBILE}; --grid-cols-sm: ${UNIT_GRID}`;
export const UNIT_GRID_CLASS = 'grid grid-cols-(--grid-cols) sm:grid-cols-(--grid-cols-sm) items-center gap-3 px-3';
export const DESKTOP_ONLY_CLASS = 'hidden sm:block';

export const UNIT_FORM_FIELDS = [
	{ name: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. DMM' },
	{ name: 'model', label: 'Model', type: 'text', placeholder: 'e.g. Dragon 2' },
	{ name: 'marking', label: 'Marking', type: 'text', placeholder: 'e.g. red and white tape' },
	{ name: 'serialNumber', label: 'Serial number', type: 'text', placeholder: '' },
	{ name: 'manufacturedAt', label: 'Manufactured', type: 'date', placeholder: '' },
	{ name: 'purchasedAt', label: 'Purchased', type: 'date', placeholder: '' },
] as const;

export const inputClass = 'w-full min-w-0 rounded border border-border-interactive bg-surface px-2 py-1.5 text-sm text-text';
export const labelClass = 'mb-1 block text-xs text-text-muted';
