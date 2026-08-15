"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsForm({
  displayName: initialName,
  email,
  timezone: initialTimezone,
}: {
  displayName: string;
  email: string;
  timezone: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, timezone }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    setSaving(false);
    if (!response.ok) {
      setStatus(result.error?.message ?? "Could not save settings");
      return;
    }
    setStatus("Settings saved");
    router.refresh();
  };

  const logout = async () => {
    setSaving(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="settings-grid">
      <form className="settings-card" onSubmit={save}>
        <h2>Profile</h2>
        <label className="field">
          <span>Name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input disabled value={email} />
        </label>
        <label className="field">
          <span>IANA timezone</span>
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </label>
        {status ? <p className="settings-status" role="status">{status}</p> : null}
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? <LoaderCircle className="spin" size={18} /> : null} Save settings
        </button>
      </form>
      <section className="settings-card danger-zone">
        <h2>Session</h2>
        <p>Sign out on this device. Your habit history stays safe.</p>
        <button className="secondary-button" disabled={saving} onClick={logout} type="button">
          <LogOut aria-hidden="true" size={18} /> Sign out
        </button>
      </section>
    </div>
  );
}
