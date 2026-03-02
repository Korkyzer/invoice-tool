import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  type: z.enum(["invoice", "quote"]),
  year: z.number().int().min(2000).max(2100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.replace("Bearer ", "")
        : null;

      if (token) {
        const admin = getSupabaseAdminClient();
        const { data } = await admin.auth.getUser(token);
        user = data.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("next_document_number", {
      p_user_id: user.id,
      p_type: parsed.data.type,
      p_year: parsed.data.year,
    });

    if (error || !data) {
      return NextResponse.json(
        { error: "Impossible de générer un numéro", details: error?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ number: data });
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur serveur", details: (error as Error).message },
      { status: 500 },
    );
  }
}
