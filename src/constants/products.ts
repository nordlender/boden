// "Hidden" products stay fully visible/manageable in admin/moderator views —
// they just aren't shown in the web shop. See src/db/schema.ts.
export const PRODUCT_STATUSES = ['hidden', 'published'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
