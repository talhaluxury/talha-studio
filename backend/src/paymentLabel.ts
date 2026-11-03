export const PAYMENT_METHODS = ["cod", "jazzcash", "easypaisa", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cod: "Cash on Delivery", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank transfer" };
export const payLabel = (m: string) => PAYMENT_LABEL[m as PaymentMethod] ?? m;
