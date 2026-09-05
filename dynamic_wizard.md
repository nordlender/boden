# Dynamic wizard
We want to rethink the admin wizard. Our idea is that the last one is too rigid, although it does offer some quality of life features that make it faster to assign some data to items, such as attributes and images.

> Status: the components described below (table, panels, button strip, Add Item panel) are built — see `src/components/wizard/` and `src/pages/wizard-test.astro`. This doc has been updated to match what got built, and to flag what changed along the way from the original plan.

## Semantic info
Just some info before we start:
- Text enclosed in a curly bracket is a placeholder for some icon or variable. For example {img_icon} would be an icon that we can change later in some centralized file that contains these variables. Exactly how is up to you, but look for any features in Astro that offer this. See astro.build/integrations/.
- A "----" signifies whitespace.
- A bar, "|" separates divs or components, etc, and should generally not be an actual bar.

### Icon list
We will use tabler icons: https://github.com/tabler/tabler-icons

For your convenience later:
- {product_icon}
- {subcategory_icon} — new. Marks an item's sub-category, inherited from its product. See "What's inherited from the product" below. (Type, a per-item field independent of product, was tried and then removed — category/sub-category replaced it.)
- {attribute_icon} — a small label icon used inside the expanded details box's Attributes section. Not a standalone button anymore — see "Details button" below.
- {details_icon} — new. Same artwork as {attribute_icon} (`list-details`), but this is the row's expand/collapse toggle, not a menu. Morphs to a chevron-up/circle-chevron-up icon while the details box is open.
- {img_icon}
- {select_icon} — per-row checkbox only now, two states (unchecked/checked). No longer shared with the header.
- {select_menu_icon} — new. The table header's select-all control: a fixed dropdown trigger, not a tri-state icon that mirrors selection state. Replaces the old {select_header_icon} idea.
- {select_none_icon} — new. "None" option in the select menu.
- {select_all_icon} — new. "All" option in the select menu.
- {select_invert_icon} — new. "Invert" option in the select menu.
- {dropdown_icon} dynamic

## Why
The reason we want to change it is that we think that it might be a bit too rigid for a not-too-techsavvy admin. We want to make it very easy to understand. We also believe that if we use the previous more standardized approach, it will be so rigid that it will be difficult to implement new intuitive featuress.

We want to allow bulk adding/editing details for different items, so we need to accomodate this by thinking cleverly about how these features work.

## What is the dynamic wizard?
The dynamic wizard is going to rethink how we add products and items. Instead of starting with adding products, we start with adding items.

First, the admins adds as many items as they want. They later create a product, which they then add items to. This product will have a field in the schema that somehow links to these items. We will get back to this later, but note that items do *not* link to products, it is (at least initially or upon creation) a one-way relationship.

When adding items, the admin will have two sections with several panels. The central main section and a sidebar on the right.

### Main section
In the main section is where the header/title, a search bar, and all the items will be.
The search bar must be able to match on both products and items — e.g. searching
"Rain Jacket" should surface every item belonging to a Rain Jacket product, not just
items whose own name contains the text. (Not implemented yet — noted for later.) Items will be divided into two panels. The top panel is unassigned items. These items do not belong to a product yet. The bottom panel is assigned panels. Whether an item is assigned or not is loaded on page load by iterating over all products, and then listing items. We load some of this info into the sidebar, which we will describe further later. We also want to group all items that are 

Both of the panels will be very similar. The items will be displayed in a table format, with small images. We will make a table component, a header component, and then two components for each panel that each have this list component. We will also make a component for each item in the list.

Items will be selectable, display an item id, a small image, and the item id will be generated incrementally. Thus, we need to go over how items are created. It will show how many are in stock, and how many the total stock is (the amount of items rented out is total_stock-in_stock) The look of each item will be:
| {select_icon} | Image | item id | item name | {subcategory_icon} sub-category | {product_icon} product | in_stock / total_stock | {details_icon} |

(The sub-category and product cells only appear in the Assigned panel — an unassigned item has no product yet, so nothing to inherit. See "What's inherited from the product" below. The last column is untitled — see "Details button".)

#### Table header
Above the list, below the button strip, there's a header row with column labels (Item, Sub-category, Product, Stock) and the select-all control sitting in the same column as every row's {select_icon}, so the two line up exactly. The last column (the details toggle) is deliberately left untitled.

The select-all control uses {select_menu_icon} as its icon — a fixed dropdown trigger, not something that changes to reflect "some/all selected" — and opens a menu:
- {select_none_icon} None
- {select_all_icon} All
- {select_invert_icon} Invert (inverts the selected and unselected items, aka invert selection)

This replaces the original plan of putting an "n selected" count and a Select dropdown in the button strip above the table — that control moved down into the table header instead, so the button strip below is now only item-mutating actions.

Above the panels in the main section we will have a strip of buttons. There will be one strip for assigned items, and one for unassigned items. We will first explain all buttons, and then show the layout for each panel.

Add item: Add an item. This will spawn a small panel beneath the buttons, and grey out the other buttons. It will also disable selections until it has been either canceled or saved.
This panel is a component. It will have an automatically generated id, but note that since we want all item ids to be incremental, we need to make sure that this does not increment the counter in the database until the item is confirmed/saved.
The fields of the add item panel will be:
Image (optional) | item id (not editable, automatically generated) | item name (required)

Description and category/sub-category used to be fields here (description as free text, category as a "type" dropdown with an inline "Add type" action). Both are removed — see "What's inherited from the product" below for why there's nothing product-dependent left to set at item creation.

{dropdown_icon} Set: A dropdown button which has the following options:
- {img_icon} Set image
- {product_icon} Set product — also how you reassign an item that's already assigned to a different product. There is no separate Assign/Unassign button; Set product covers both assigning and reassigning.

#### Unassigned items
Button strip:
| Set | ---- | Add item | Delete n item(s) |

| List |

#### Assigned items
Button strip:
| Set | ---- | Delete n item(s)

| List |

### Sidebar
The top panel is the properties of the currently selected items.

One panel is for image files, such that they can drag and drop an image onto 

## What's inherited from the product
An earlier version of this plan gave items their own per-item **Type** field, independent of product — that's been removed. Everything classification/description-shaped about an item now comes from whichever product it's assigned to, nothing is set on the item itself:

- **Category** and **Sub-category** ({subcategory_icon}) — only Sub-category gets its own table column right now; Category isn't surfaced at the item level yet.
- **Description** — shown in the item's details box (see "Details button" below), not set in the Add Item panel. This matters most on the product page shown to end users, not really the admin wizard.
- **Attributes** ({attribute_icon}) — a labeled key/value list, also shown in the details box.

None of these exist until the item is assigned to a product. An unassigned item's details box says so explicitly rather than showing blank fields.

## Details button
The last, untitled column's button ({details_icon}) expands a box directly beneath its row — within the table, so later rows shift down beneath it, not a floating popover — showing a bigger image, the item's description, and its attributes (all inherited from the product, see above). Hitting the button again collapses it. While open, the icon morphs into a chevron-up/circle-chevron-up to show state.

This replaces the original plan's Attributes button, which just opened a small menu.

## Handoff: DB / schema work
Resolved — see `schema_v3.md` (and its matching `schemav3.ts`), which
replaces `schema_v2.md`/`schemav2.ts` entirely:
- Attributes are now a template/value split: `productAttributeKeys` (the
  field names, scoped to the product) and `itemAttributeValues` (each
  item's own value per field). The old item-scoped `itemAttributes` table
  is gone.
- `products` now carries `categoryId`, `subcategoryId` (new `subcategories`
  table, one level deep, e.g. Protection -> Cams), and `description`.
- `items.productId` is nullable — an item can exist unassigned, matching
  this doc's premise.

Still open, for whoever wires the wizard UI to real data (not schema work):
`schema_v3.md`'s "Work notes" section lists the application-layer pieces
this implies — the "Set product" reassignment transaction, fanning out new
template fields to existing items, the red hint next to the Details button
when a product has no attribute template yet, and the bulk "Set attributes"
pop-up (with its same-template guard) reachable from the Set dropdown.
