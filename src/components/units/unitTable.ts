import { compactLabelClasses, inputClasses } from '../../lib/form-styles';

// Shared by UnitTableHeader/UnitRow (column widths, so header and rows line
// up structurally — same idea as wizard/grid.ts) and by the unit forms
// (field list and input styling).
//
// Columns: id | unit (brand/model, serial) | marking | made | bought | extra | status | actions.
// Extra is the count of the unit's extra fields (opts); the fields
// themselves are viewed and edited in the details panel.
// Actions holds the new-note button and the details toggle. Below `sm` only
// id | unit | status | actions remain; marking moves under the unit cell, and
// the dates into the details panel.
// Every column is left-aligned with the same gap (gap-4), so the visible
// space between two columns is that gap plus whatever the left one leaves
// empty. The fixed columns are sized to their content so that slack stays
// small and even: dates their "BOUGHT" header (dd/mm/yy is narrower), extra
// its "EXTRA" header, status the widest pill ("Out of service") plus its pencil, actions the
// new-note button (32px) + details toggle (36px) + gap. Everything left over
// goes to the two text columns, unit getting the larger share.
//
// Header and rows are separate grids, so every non-flexible column must be
// a fixed width (not `auto`) for them to line up.
const UNIT_GRID = '3rem minmax(0,1.4fr) minmax(0,1fr) 4rem 4rem 3rem 9rem 4.75rem';
const UNIT_GRID_MOBILE = '3rem minmax(0,1fr) 9rem 4.75rem';

export const UNIT_GRID_STYLE = `--grid-cols: ${UNIT_GRID_MOBILE}; --grid-cols-sm: ${UNIT_GRID}`;
export const UNIT_GRID_CLASS = 'grid grid-cols-(--grid-cols) sm:grid-cols-(--grid-cols-sm) items-center gap-4 px-4';
export const DESKTOP_ONLY_CLASS = 'hidden sm:block';

export const UNIT_FORM_FIELDS = [
	{ name: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. DMM' },
	{ name: 'model', label: 'Model', type: 'text', placeholder: 'e.g. Dragon 2' },
	{ name: 'marking', label: 'Marking', type: 'text', placeholder: 'e.g. red and white tape' },
	{ name: 'serialNumber', label: 'Serial number', type: 'text', placeholder: '' },
	{ name: 'manufacturedAt', label: 'Manufactured', type: 'date', placeholder: '' },
	{ name: 'purchasedAt', label: 'Purchased', type: 'date', placeholder: '' },
] as const;

export const inputClass = `w-full min-w-0 ${inputClasses}`;
export const labelClass = compactLabelClasses;
