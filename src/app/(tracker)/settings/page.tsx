import { SettingsForm } from "@/components/settings/settings-form";
import { requireUser } from "@/server/auth/session";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <section className="content-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR SPACE</p>
          <h1>Settings</h1>
          <p>Dates and streaks follow your local timezone.</p>
        </div>
      </header>
      <SettingsForm
        displayName={user.displayName}
        email={user.email}
        timezone={user.timezone}
      />
    </section>
  );
}
