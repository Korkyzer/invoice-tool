import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY manquante", code: "MISSING_STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("documents")
      .select("id, number, total_ttc, stripe_payment_link_id, stripe_payment_link_url, payment_status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .eq("type", "invoice")
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Facture introuvable", code: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    if (invoice.stripe_payment_link_id && invoice.stripe_payment_link_url) {
      return NextResponse.json({
        id: invoice.stripe_payment_link_id,
        url: invoice.stripe_payment_link_url,
        already_exists: true,
      });
    }

    const amountCents = Math.round(Number(invoice.total_ttc || 0) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Montant facture invalide", code: "INVALID_INVOICE_AMOUNT" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = getAppUrl();

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: `Paiement facture ${invoice.number}`,
            },
          },
        },
      ],
      payment_method_types: ["card", "sepa_debit", "link"],
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${appUrl}/invoices/${params.id}?payment=success`,
        },
      },
      metadata: {
        invoice_id: String(params.id),
      },
      payment_intent_data: {
        metadata: {
          invoice_id: String(params.id),
        },
      },
    });

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        stripe_payment_link_id: paymentLink.id,
        stripe_payment_link_url: paymentLink.url,
        payment_status: "unpaid",
      })
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message, code: "PAYMENT_LINK_SAVE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      id: paymentLink.id,
      url: paymentLink.url,
      already_exists: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur Stripe",
        code: "STRIPE_PAYMENT_LINK_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
