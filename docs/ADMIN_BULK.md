# Admin: bulk tools, sections, category pictures

- **Products > Add many products:** pick up to 15 photos (each becomes a product), write name and price (sale price optional), choose category, sizes (comma separated, empty = one size), stock per size, and whether they go to New Arrivals / Featured. One button creates the products, uploads all photos (up to 10 per product, add more photos to any row) and publishes them.
- **Sections in the app:** New Arrivals = products marked "Show in New Arrivals" (if none is marked, the newest products as before), Featured = marked "Feature on the home screen", On Sale = products that have a sale price. The Products list has a Section filter and shows New / Featured / Sale badges.
- **Change many at once:** tick products in the list (the ticks stay while you page), choose an action (add or remove New Arrivals / Featured, put on sale with a discount %, remove sale, publish, unpublish, move to category, delete) and press Apply. Products that cannot be published (no photo) are skipped and listed.
- **Categories:** each category now has a picture upload (shown by the app once the customer app version that reads `imageUrl` is installed).
- API: `POST /admin/products/bulk`, `POST /admin/products/bulk-update`, `POST /admin/products/bulk-delete`, `POST|DELETE /admin/categories/:id/image`. New column `products.is_new` (migration 011); `/home` and `/categories` now also return `isNew` and `imageUrl`.

## Video cards, wheel and information changes (v3)

- **Video cards ("Watch & Shop"):** admin menu > Video cards. Each card has a title, one short MP4 and a target (a category, On Sale / New Arrivals / Featured, or one of your home sections). The app shows them in a row under On Sale; the videos play by themselves and a tap opens the target. A card appears only once it has a video. API: `/admin/reels` (+ `/video`), `reels` in `GET /home`.
- **Change information of many products:** tick products > action "Change information": description, fabric, price and stock (for every size) are applied to all ticked products. Empty boxes change nothing. A product whose sale price would no longer be below the new price is skipped and listed.
- **Add many products:** the "Same for all" card now also has price, sale price, fabric and description; a product can override any of them, and "Copy first product's details to all" fills the other rows.
- **Lucky wheel and sale timer:** admin menu > Store settings.
