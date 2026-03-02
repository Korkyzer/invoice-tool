import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change"];

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = sanitizeNext(requestUrl.searchParams.get("next"));

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const typeParam = requestUrl.searchParams.get("type");

  const supabase = getSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && typeParam && OTP_TYPES.includes(typeParam as EmailOtpType)) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParam as EmailOtpType,
    });
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
