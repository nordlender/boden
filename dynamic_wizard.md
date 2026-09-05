# Dynamic wizard
We want to rethink the admin wizard. Our idea is that the last one is too rigid, although it does offer some quality of life features that make it faster to assign some data to items, such as attributes and images.

## Semantic info
Just some info before we start:
- Text enclosed in a curly bracket is a placeholder for some icon or variable. For example {img_icon} would be an icon that we can change later in some centralized file that contains these variables. Exactly how is up to you, but look for any features in Astro that offer this. See astro.build/integrations/.
- A "----" signifies whitespace.
- A bar, "|" separates divs or components, etc, and should generally not be an actual bar.

### Icon list
We will use tabler icons: https://github.com/tabler/tabler-icons

For your convenience later:
- {product_icon}
- {attribute_icon}
- {img_icon}
- {select_header_icon} dynamic icon
- {select_icon} dynamic icon
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
| {select_icon} | Image | item id | item name | {product_icon} product | in_stock / total_stock | {attribute_icon} Attributes |

Above the panels in the main section we will have a strip of buttons. There will be one strip for assigned items, and one for unassigned items. We will first explain all buttons, and then show the layout for each panel.

Select: A number n showing how many items are selected and {select_icon}. We want the {select_header_icon} to be aligned with the select icons of all the items.

Select: The select button will be a drop down, and allow to select:
- None
- All
- Invert (inverts the selected and unselected items, aka invert selection)

Assign: Allows to quickly assign selected items to a product. When a product has been assigned, it will refresh the two panels such that it reflects the change.

Add item: Add an item. This will spawn a small panel beneath the buttons, and grey out the other buttons. It will also disable selections until it has been either canceled or saved.
This panel is a component. It will have an automatically generated id, but note that since we want all item ids to be incremental, we need to make sure that this does not increment the counter in the database until the item is confirmed/saved.
The fields of the add item panel will be:
Image (optional) | item id (not editable, automatically generated) | item name (required) | description (optional) | attributes (dropdown, optional)

{dropdown_icon} Set: A dropdown button which has the following options:
- {img_icon} Set image
- {product_icon} Set product

#### Unassigned items
Button strip:
| n | Select | Set | ---- | Add item | Delete n item(s) |

| List |

#### Assigned items
Button strip:
| n | Select | Unassign | Set | ---- | Delete n item(s)

| List |

### Sidebar
The top panel is the properties of the currently selected items.

One panel is for image files, such that they can drag and drop an image onto 
