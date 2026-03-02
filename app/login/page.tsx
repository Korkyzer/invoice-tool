"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingMagicLink, setLoadingMagicLink] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) router.replace("/dashboard");
    };
    void check();
  }, [router]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoadingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Connexion réussie");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Identifiants invalides");
    } finally {
      setLoadingPassword(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) {
      toast.error("Renseigne ton email");
      return;
    }

    setLoadingMagicLink(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) throw error;
      toast.success("Lien magique envoyé par email");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Erreur inconnue lors de l'envoi du lien magique";

      if (message.toLowerCase().includes("signups not allowed for otp")) {
        toast.error("Compte introuvable pour cet email (création auto désactivée).");
      } else if (message.toLowerCase().includes("email rate limit exceeded")) {
        toast.error("Trop de demandes. Réessaie dans quelques minutes.");
      } else if (
        message.toLowerCase().includes("redirect") ||
        message.toLowerCase().includes("invalid")
      ) {
        toast.error("URL de redirection Supabase invalide. Vérifie Auth > URL Configuration.");
      } else {
        toast.error(`Envoi du lien impossible: ${message}`);
      }
    } finally {
      setLoadingMagicLink(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-4 dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-md p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Connexion</p>
        <h1 className="mt-2 text-2xl font-bold">Invoice Tool</h1>
        <p className="mt-1 text-sm text-slate-500">Gestion simple de factures et devis en français</p>

        <form className="mt-6 space-y-4" onSubmit={signIn}>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              required
            />
          </div>
          <div>
            <Label>Mot de passe</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loadingPassword || loadingMagicLink}>
            {loadingPassword ? "Connexion..." : "Se connecter"}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={sendMagicLink}
          disabled={loadingMagicLink || loadingPassword}
        >
          {loadingMagicLink ? "Envoi..." : "Recevoir un lien magique"}
        </Button>

        <p className="mt-3 text-xs text-slate-500">
          L&apos;inscription n&apos;est pas activée dans l&apos;interface pour le moment.
        </p>
      </Card>
    </main>
  );
}
