import { ArrowLeft, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";

const plans = {
  focus: { name: "Focus", price: "$4.99" },
  momentum: { name: "Momentum", price: "$9.99" },
} as const;

export default async function CheckoutPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan = "focus" } = await searchParams;
  const selected = plans[plan as keyof typeof plans] ?? plans.focus;

  return (
    <section className="content-page checkout-prototype">
      <Link className="back-link" href="/habits"><ArrowLeft aria-hidden="true" size={17} /> Back to habits</Link>
      <div className="checkout-prototype-card">
        <CreditCard aria-hidden="true" className="checkout-prototype-icon" />
        <p className="eyebrow">STRIPE CHECKOUT</p>
        <h1>{selected.name} plan</h1>
        <p className="checkout-price">{selected.price}<small> / month</small></p>
        <p>This is the prototype handoff point for Stripe Checkout. When Stripe is configured, this route will create a Checkout Session and redirect securely to Stripe.</p>
        <div className="checkout-prototype-status"><ShieldCheck aria-hidden="true" /> Payment gateway setup pending</div>
        <Link className="primary-button" href="/habits">Return to habits</Link>
      </div>
    </section>
  );
}
