// Shared class fragments for form fields, so inputs line up with the button
// scale (lib/button-styles.ts) instead of every form hand-rolling its own
// padding. Written out in full so Tailwind's class scanner can see every
// class — same convention as button-styles.ts.
//
//   <form class={formClasses}>
//     <label class={fieldClasses}>
//       <span class={labelClasses}>Name</span>
//       <input class={inputClasses} />
//       <span class={hintClasses}>Shown to members.</span>
//     </label>
//   </form>

export type InputSize = 'sm' | 'md';

// Vertical rhythm between fields in a form.
export const formClasses = 'flex flex-col gap-stack';

// One label + control (+ hint) group — tighter than formClasses so each
// label reads as belonging to its own field (Gestalt proximity).
export const fieldClasses = 'flex flex-col gap-snug';

// Two label styles, picked by audience: labelClasses (with fieldClasses) for
// member-facing and moderator forms; compactLabelClasses (below) for the
// dense admin forms. Don't mix the two within one form.
export const labelClasses = 'text-sm font-medium text-text';

// Helper text under a field or a form section.
export const hintClasses = 'text-xs leading-relaxed text-text-muted';

// A form's or action's inline error message (usually `hidden` until a
// script fills it in).
export const inlineErrorClasses = 'text-sm text-error-text';

// Text inputs, selects and number inputs. Heights match Button's sm/md
// (32/40px) so a field and the button next to it sit level. `sm` is for
// dense rows (a quantity cell in a table), `md` everywhere else.
export const inputSizeClasses: Record<InputSize, string> = {
	sm: 'min-h-8 px-2.5 py-1',
	md: 'min-h-10 px-3 py-2',
};

export const inputBaseClasses =
	'rounded-md border border-border-interactive bg-surface text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:bg-disabled-bg disabled:text-disabled-text';

// A display-only field (`readonly`) — same box, but greyed so it doesn't
// read as editable. Written out separately rather than layered over
// inputClasses, since two bg-* classes on one element would fight.
export const readonlyInputClasses =
	'min-h-10 rounded-md border border-border-interactive bg-disabled-bg px-3 py-2 text-sm text-disabled-text';

export const inputClasses = `${inputBaseClasses} ${inputSizeClasses.md}`;

export const inputSmClasses = `${inputBaseClasses} ${inputSizeClasses.sm}`;

export const textareaClasses = `${inputBaseClasses} min-h-24 px-3 py-2.5 leading-relaxed`;

// Small label stacked directly above its own control, for the dense admin
// forms (wizard, units, pickup days) laid out in a grid, where wrapping
// each field in fieldClasses doesn't fit. Carries its own bottom margin —
// the same `snug` gap fieldClasses puts between label and control.
export const compactLabelClasses = 'mb-snug block text-xs font-medium text-text-muted';
