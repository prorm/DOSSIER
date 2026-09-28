"use client";

import { Download, FileDown, KeyRound, RefreshCw, Upload, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionFeedback, useAction } from "./admin-client";

export function CheckpointAdminActions({ id }: { id: string }) {
  const { run, busy, error, message } = useAction();
  const [pin, setPin] = useState("");
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(`/api/admin/checkpoints/${id}`, { action: "set-pin", pin }, { success: "PIN updated. Station sessions for this checkpoint were signed out." })) setPin("");
        }}
      >
        <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="new PIN" aria-label="New station PIN" className="h-8 w-28" />
        <Button size="sm" variant="outline" type="submit" disabled={busy || pin.length < 4}>
          <KeyRound /> Set PIN
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={`/api/admin/checkpoints/qr?id=${encodeURIComponent(id)}`}>
            <FileDown /> QR sheet
          </a>
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => run(`/api/admin/checkpoints/${id}`, { action: "rotate-qr" }, { success: "QR rotated — reprint this sheet; old codes are now void." })}
        >
          <RefreshCw /> Rotate QR
        </Button>
      </div>
      <ActionFeedback error={error} message={message} />
    </div>
  );
}

export function PackImportButton({ slug, canImport }: { slug: string; canImport: boolean }) {
  const { run, busy, error, message } = useAction<{ summary: { challenges: number; hidden: number; pruned: number } }>();
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={busy || !canImport}
        title={canImport ? undefined : "Owner role required"}
        onClick={() =>
          run("/api/admin/packs", { slug, activate: true }, { success: (r) => `Imported ${r.summary.challenges} challenges (hidden ${r.summary.hidden}, pruned ${r.summary.pruned}). Pack is active.` })
        }
      >
        <Upload /> Import & activate
      </Button>
      <ActionFeedback error={error} message={message} />
    </div>
  );
}

export function PackExportButton() {
  return (
    <Button variant="outline" asChild>
      <a href="/api/admin/packs/export">
        <Download /> Export active event (.zip)
      </a>
    </Button>
  );
}

export function StaffCreateForm() {
  const { run, busy, error, message } = useAction();
  const [f, setF] = useState({ email: "", name: "", role: "volunteer", password: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run("/api/admin/staff", { action: "create", ...f }, { success: `Created ${f.role} ${f.email}.` })) setF({ email: "", name: "", role: "volunteer", password: "" });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-e">Email</Label>
        <Input id="sf-e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-n">Name</Label>
        <Input id="sf-n" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-r">Role</Label>
        <select id="sf-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="h-10 rounded-sm border border-line-strong bg-bg px-2 font-mono text-sm">
          <option value="volunteer">Volunteer — station console only</option>
          <option value="admin">Admin — operations</option>
          <option value="owner">Owner — everything incl. staff & packs</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-p">Initial password (≥10 chars)</Label>
        <Input id="sf-p" type="password" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          <UserPlus /> Create staff account
        </Button>
        <ActionFeedback error={error} message={message} />
      </div>
    </form>
  );
}

export function StaffToggle({ id, disabled }: { id: string; disabled: boolean }) {
  const { run, busy, error } = useAction();
  return (
    <>
      <Button size="xs" variant={disabled ? "outline" : "destructive"} disabled={busy} onClick={() => run("/api/admin/staff", { action: "disable", id, disabled: !disabled }, { success: "Updated." })}>
        {disabled ? "Enable" : "Disable"}
      </Button>
      {error ? <span className="ml-2 font-mono text-xs text-signal-magenta">{error}</span> : null}
    </>
  );
}
