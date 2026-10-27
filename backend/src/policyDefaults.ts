export type PageSlug = "privacy" | "terms" | "returns" | "shipping" | "refund" | "about";
export const PAGE_SLUGS: PageSlug[] = ["privacy", "terms", "returns", "shipping", "refund", "about"];
export const PAGE_TITLES: Record<PageSlug, string> = {
  privacy: "Privacy Policy", terms: "Terms of Service", returns: "Returns Policy", shipping: "Shipping Policy", refund: "Refund Policy", about: "About Us",
};

/**
 * Starting-point texts that describe what this app actually does. They are NOT legal advice: the store owner must review and
 * edit them (admin panel > Store settings) before launch, especially the Privacy Policy, which Google Play requires.
 * Plain text; blank line = new paragraph; a line starting with "# " is a heading.
 */
export const DEFAULT_PAGES: Record<PageSlug, string> = {
  privacy: `# What we collect
When you create an account we collect your name, email address, optional phone number and a password (stored only as a one-way hash). If you sign in with Google we receive your name and email from Google. When you order we collect your delivery name, phone number, email and address, and keep your order history. If you allow notifications, we store a device token that lets us send you order updates and offers.

# How we use it
We use this information to process and deliver your orders, send order confirmations and status updates by email and notification, answer your questions, and (only if you allow it) tell you about offers. We do not sell your personal information.

# Who we share it with
Delivery details are shared with couriers only to deliver your order. We use service providers to send email and push notifications and to host our systems. They process data only on our behalf. We do not collect payment card details: payment is Cash on Delivery.

# How long we keep it
We keep account data while your account is active. Order records are kept for accounting and legal reasons even after you delete your account; they are then no longer linked to your profile details.

# Your choices
You can edit your saved addresses, switch order and offer notifications on or off in the app, download a copy of your data (Settings > Download my data) and delete your account (Profile > Delete my account). Deleting your account erases your profile, saved addresses and device tokens.

# Contact
Questions about privacy? Contact us using the details at the end of this page.`,
  terms: `# Using the app
By creating an account or placing an order you agree to these terms. You must provide accurate delivery details and be able to receive and pay for the order.

# Orders and prices
Prices are in Pakistani Rupees (PKR). The price shown when you place your order is the price you pay, plus any delivery fee shown at checkout. Orders are subject to stock availability; if an item is unavailable we will tell you and you will not be charged.

# Payment
Payment is Cash on Delivery. Please keep the exact amount ready for the courier.

# Cancellations, returns and refunds
See the Returns Policy and Refund Policy. You can cancel an order in the app until it starts processing.

# Accounts
You are responsible for keeping your password secure. We may suspend accounts that are used fraudulently or abusively.

# Changes
We may update these terms. Continued use of the app means you accept the updated terms.`,
  returns: `# Returns
You can request a return within the return window shown in the app (7 days from delivery by default) if the item is unused, unwashed, with its tags attached, and in its original condition.

# How to return
Open the order in the app and choose "Request a return", then tell us why. We will contact you with the next steps.

# Items we cannot accept back
Stitched or altered items, items without tags, and items damaged after delivery cannot be returned unless they arrived faulty.

# Faulty or wrong items
If you receive a faulty or wrong item, request a return straight away and we will arrange a replacement or refund.`,
  shipping: `# Delivery
We deliver across Pakistan using trusted couriers. The delivery fee is shown at checkout before you place your order and may be free above a minimum order value.

# Delivery time
Estimated delivery times are shown in your order confirmation when available. Delays can happen because of weather, public holidays or courier issues.

# Tracking
When your order ships we may send you a tracking link by email and in the app.

# Cash on Delivery
Please make sure someone is available to receive the parcel and pay the courier the order total.`,
  refund: `# Refunds
Once we receive and check a returned item, we will approve or reject the refund and tell you the result.

# How you are refunded
Because orders are paid by Cash on Delivery, approved refunds are paid back using a method we agree with you (for example bank transfer or store credit).

# Cancelled orders
If you cancel before your order ships you pay nothing, so there is nothing to refund.`,
  about: `# Talha Studio
Talha Studio is a Pakistani fashion house offering ladies and gents wear, unstitched fabric, suits and accessories, made with care and delivered to your door.

# Our promise
Timeless design, honest quality and service you can reach when you need us.`,
};
