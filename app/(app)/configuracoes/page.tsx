"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Input, Button, Modal } from "@/components/ui";
import { useAuth, useTheme } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

interface Company {
  id: string;
  name: string;
  cnpj: string;
  contact_email: string;
  contact_phone: string | null;
  address: string | null;
}

export default function ConfiguracoesPage() {
  const { profile, farms, activeFarmId, setActiveFarm } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [companyModal, setCompanyModal] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    viewer: "Visualizador",
  };

  const openCompanyEdit = async () => {
    if (!profile?.companyId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name, cnpj, contact_email, contact_phone, address")
      .eq("id", profile.companyId)
      .single();
    if (data) {
      setCompany(data);
      setCompanyModal(true);
      setFormError("");
      setSuccessMsg("");
    }
  };

  const handleCompanySave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setFormError("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name") as string,
      cnpj: fd.get("cnpj") as string,
      contact_email: fd.get("contact_email") as string,
      contact_phone: (fd.get("contact_phone") as string) || null,
      address: (fd.get("address") as string) || null,
    };
    const supabase = createClient();
    const { error } = await supabase.from("companies").update(payload).eq("id", company.id);
    if (error) {
      setFormError(error.message);
    } else {
      setSuccessMsg("Empresa atualizada com sucesso.");
      setTimeout(() => {
        setCompanyModal(false);
        setSuccessMsg("");
      }, 1200);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-8">
      <PageHeader titulo="Configurações" descricao="Perfil, empresa, fazenda ativa e preferências" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Perfil</h3>
          <div className="space-y-3.5 text-sm">
            {[
              ["Nome", profile?.name],
              ["E-mail", profile?.email],
              ["Papel", roleLabels[profile?.role ?? "viewer"]],
              ["Empresa", profile?.companyName],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-1 py-0.5">
                <span className="text-graphite-400 dark:text-gray-500">{label}</span>
                <span className="font-medium text-graphite-900 dark:text-gray-200">{value ?? "—"}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Empresa</h3>
            {(profile?.role === "admin" || profile?.role === "manager") && (
              <Button variant="secondary" size="sm" onClick={openCompanyEdit}>Editar</Button>
            )}
          </div>
          <div className="space-y-3.5 text-sm">
            <div className="flex items-center justify-between rounded-lg px-1 py-0.5">
              <span className="text-graphite-400 dark:text-gray-500">Razão social</span>
              <span className="font-medium text-graphite-900 dark:text-gray-200">{profile?.companyName ?? "—"}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Fazenda ativa</h3>
          {farms.length > 0 ? (
            <div className="space-y-2.5">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => setActiveFarm(farm.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm transition-all duration-150 ${
                    farm.id === activeFarmId
                      ? "border-brand-200 bg-brand-50/80 text-brand-700 shadow-soft dark:border-brand-700/40 dark:bg-brand-900/15 dark:text-brand-400"
                      : "border-gray-100 text-graphite-900 hover:border-gray-200 hover:bg-gray-50/50 dark:border-white/[0.06] dark:text-gray-200 dark:hover:border-white/[0.12]"
                  }`}
                >
                  <span className="font-medium">{farm.name}</span>
                  {farm.id === activeFarmId && (
                    <span className="rounded-lg bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Ativa</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma fazenda vinculada ao seu perfil.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Aparência</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-graphite-900 dark:text-gray-200">Tema</p>
              <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
                {theme === "dark" ? "Modo escuro ativo" : "Modo claro ativo"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={companyModal} onClose={() => setCompanyModal(false)} title="Editar empresa">
        <form onSubmit={handleCompanySave} className="space-y-5">
          <Input id="name" name="name" label="Razão social" required defaultValue={company?.name} />
          <Input id="cnpj" name="cnpj" label="CNPJ" required defaultValue={company?.cnpj} placeholder="00.000.000/0000-00" />
          <Input id="contact_email" name="contact_email" label="E-mail de contato" type="email" required defaultValue={company?.contact_email} />
          <Input id="contact_phone" name="contact_phone" label="Telefone" defaultValue={company?.contact_phone ?? ""} placeholder="(00) 00000-0000" />
          <Input id="address" name="address" label="Endereço" defaultValue={company?.address ?? ""} />
          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          {successMsg && <p role="alert" className="rounded-xl bg-green-50 p-3.5 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">{successMsg}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setCompanyModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
