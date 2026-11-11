# Accessories section, sale buttons, notification delete

- **Accessories (home screen):** create a main category with the slug `accessories` (Admin > Categories). Put sub-categories and products inside it. The app shows them under the category row as "Style it with" with an Accessories | Recent switch. Nothing else lands there.
- **Sale on one product:** Admin > Products > the "Sale" column: "Put on sale" (asks a % between 1 and 90) or "Remove sale". "Remove sale from all" (top right) takes every product back to its normal price.
- **Customer notifications:** swipe left, tap the bin, or use the sweep icon at the top to delete all.
- **WhatsApp "Waiting for this message":** the server now uses Baileys 7 (LID support). After deploying, unlink the number in Admin > WhatsApp and scan the QR once so fresh encryption sessions are created.

## Product QR code
- Every product page in Admin has a "QR code for the suit" card (made automatically), and every row in Products has a "QR" button. Print the label (browser) or share/save it (Android admin app) and attach it to the suit.
- The QR holds `https://<your API>/p/<product id>`. It opens a small page with a button that launches the product inside the customer app (package `com.talhastudiopk.app`). If the app is not installed, Android offers the Play Store listing.

## New-order alerts (admin app)
- Works with no setup while the admin app/page is open: red count on "Orders", a banner + beep + vibration for every new order, "NEW" tags in the order list, and a phone notification when the app is in the background.
- Alerts when the app is CLOSED need Firebase push: in the same Firebase project as the customer app add two Android apps, `com.talhastudio.admin` and `com.talhastudio.admin.debug`, download the new google-services.json and replace the GOOGLE_SERVICES_JSON_BASE64 secret. Rebuild the admin app and open it once after signing in (it registers this phone). The backend already needs FCM configured, same as customer push.

## Deleting orders
- Orders list: tick orders and press "Delete selected", or "Delete" on a row; also on the order page. Open orders (pending, confirmed, processing) are cancelled first so stock and coupon use go back. The customer gets no message.
