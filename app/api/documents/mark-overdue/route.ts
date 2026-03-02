import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("documents")
      .update({ status: "overdue" })
      .eq("user_id", user.id)
      .eq("type", "invoice")
      .eq("status", "pending")
      .lt("due_date", today);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
