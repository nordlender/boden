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
- {type_icon} — new. An item's type (e.g. "Jacket", "Tent"), independent of product. See "Type vs Attributes" below.
- {attribute_icon} — opens the attributes button/menu only, no inline list of attributes on the row. Icon is now `list-details` (was `tag`, which {type_icon} took over).
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
| {select_icon} | Image | item id | item name | {type_icon} type | {product_icon} product | in_stock / total_stock | {attribute_icon} Attributes |

(The product cell only appears in the Assigned panel — an unassigned item has no product yet. Type appears in both panels: unlike attributes, type doesn't depend on product assignment. See "Type vs Attributes" below.)

#### Table header
Above the list, below the button strip, there's a header row with column labels (Item, Type, Product, Stock, Attrs) and the select-all control sitting in the same column as every row's {select_icon}, so the two line up exactly.

The select-all control uses {select_menu_icon} as its icon — a fixed dropdown trigger, not something that changes to reflect "some/all selected" — and opens a menu:
- {select_none_icon} None
- {select_all_icon} All
- {select_invert_icon} Invert (inverts the selected and unselected items, aka invert selection)

This replaces the original plan of putting an "n selected" count and a Select dropdown in the button strip above the table — that control moved down into the table header instead, so the button strip below is now only item-mutating actions.

Above the panels in the main section we will have a strip of buttons. There will be one strip for assigned items, and one for unassigned items. We will first explain all buttons, and then show the layout for each panel.

Add item: Add an item. This will spawn a small panel beneath the buttons, and grey out the other buttons. It will also disable selections until it has been either canceled or saved.
This panel is a component. It will have an automatically generated id, but note that since we want all item ids to be incremental, we need to make sure that this does not increment the counter in the database until the item is confirmed/saved.
The fields of the add item panel will be:
Image (optional) | item id (not editable, automatically generated) | item name (required) | description (optional) | type (dropdown, optional — "Add type" is pinned at the top of the menu so an admin can create a new type inline)

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

## Type vs Attributes
Two different things live on an item, and they behave differently — worth being explicit about this since it wasn't clear in the original plan:

- **Type** ({type_icon}) is per-item. It's set when the item is created (or edited later) and doesn't depend on whether the item is assigned to a product. This is what the Add Item panel's Type dropdown sets, and what shows as a tag in the Type column for every item, assigned or not.
- **Attributes** ({attribute_icon}) are always inherited from the item's product — an item does not have its own independent attributes. The Attributes button on a row shows whatever attributes the item's product defines. An unassigned item has no product yet, so it has nothing to show there until it's assigned.

This is why the Add Item panel's original Attributes dropdown was replaced with a Type dropdown: attributes were never really a per-item thing to set at creation — type is.

## Handoff: DB / schema work
Not implemented yet — for a different agent to pick up:
- A real `attributes` table, scoped to **products**, not items. The current schema's `itemAttributes` table (flat key/value rows hung off `items`, see `schemav2.ts`) is the wrong shape now that attributes are inherited from the product rather than stored per item — it needs to move to (or be replaced by) a product-scoped table.
- A `types` table backing the Type dropdown's real options. Right now "Jacket" / "Tent" / "Stove" are hardcoded mock strings in the Add Item panel and the test-page data, not real records.
- This is on top of the still-unresolved conflict where `items.productId` is `NOT NULL` in the schema — items are meant to exist unassigned, but the schema as written doesn't allow that today.
