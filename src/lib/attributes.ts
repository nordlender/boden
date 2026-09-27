export interface Attribute {
	key: string;
	value: string;
}

// Shared "Green / M" style variant label used wherever an item's option
// values are shown as a single line (cart, reservation, shop).
export function formatAttributes(attributes: Attribute[]): string {
	return attributes.map((a) => a.value).join(' / ');
}
