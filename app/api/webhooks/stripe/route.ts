import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function markInvoicePaid(invoiceId: string) {
  const supabase = getSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("documents")
    .update({
      payment_status: "paid",
      status: "paid",
      payment_date: today,
    })
    .eq("id", invoiceId)
    .eq("type", "invoice");
}

async function markInvoiceExpired(invoiceId: string) {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from("documents")
    .update({
      payment_status: "expired",
    })
    .eq("id", invoiceId)
    .eq("type", "invoice");
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY manquante", code: "MISSING_STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET manquante", code: "MISSING_STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante", code: "MISSING_STRIPE_SIGNATURE" }, { status: 400 });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const payload = await request.text();
    const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        await markInvoicePaid(invoiceId);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const invoiceId = paymentIntent.metadata?.invoice_id;
      if (invoiceId) {
        await markInvoicePaid(invoiceId);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        await markInvoiceExpired(invoiceId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Webhook Stripe invalide",
        code: "STRIPE_WEBHOOK_INVALID",
      },
      { status: 400 },
    );
  }
}
