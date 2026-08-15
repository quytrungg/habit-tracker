"use client";

import { addDays, format, getISODay, parseISO } from "date-fns";
import {
  Archive,
  ArrowLeft,
  CalendarRange,
  Flame,
  Gift,
  LoaderCircle,
  Plus,
  Target,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { targetForDate } from "@/domain/habit-engine";
import type { DashboardHabit } from "@/server/services/habit-service";
import { CheckInDrawer } from "@/components/check-in/check-in-drawer";
import { HabitHeatmap } from "@/components/heatmap/habit-heatmap";

export function HabitDetail({ item, today }: { item: DashboardHabit; today: string }) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const currentTarget = targetForDate(item.targets, today) ?? item.targets.at(-1);

  const archive = async () => {
    setArchiving(true);
    const response = await fetch(`/api/habits/${item.habit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setArchiving(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: { message?: string } };
      setError(result.error?.message ?? "Could not archive this habit");
      return;
    }
    router.push("/habits");
    router.refresh();
  };

  return (
    <section className="content-page habit-detail-page" data-accent={item.habit.accentToken}>
      <Link className="back-link" href="/habits">
        <ArrowLeft aria-hidden="true" size={17} /> All habits
      </Link>
      <header className="detail-hero">
        <span className="detail-icon" aria-hidden="true">{item.habit.icon}</span>
        <div>
          <p className="eyebrow">SINCE {format(parseISO(`${item.habit.startDate}T12:00:00`), "MMM d, yyyy").toUpperCase()}</p>
          <h1>{item.habit.name}</h1>
          {item.habit.description ? <p>{item.habit.description}</p> : null}
        </div>
        <button className="secondary-button archive-button" disabled={archiving} onClick={archive} type="button">
          {archiving ? <LoaderCircle className="spin" size={17} /> : <Archive aria-hidden="true" size={17} />}
          Archive
        </button>
      </header>

      {error ? <p className="inline-alert" role="alert">{error}</p> : null}

      <div className="stat-grid">
        <article><Flame /><span>Current streak</span><strong>{item.stats.currentStreak} {item.stats.streakUnit}</strong></article>
        <article><Trophy /><span>Longest streak</span><strong>{item.stats.longestStreak} {item.stats.streakUnit}</strong></article>
        <article><CalendarRange /><span>Completed</span><strong>{item.stats.completedPeriods} periods</strong></article>
        <article><Target /><span>Total progress</span><strong>{item.stats.totalValue}</strong></article>
      </div>

      <section className="detail-panel full-heatmap-panel">
        <header><div><p className="eyebrow">HISTORY</p><h2>Daily rhythm</h2></div><span>Click any day to add progress or a note</span></header>
        <HabitHeatmap cells={item.heatmap} onSelectDate={setSelectedDate} />
        <div className="heatmap-legend" aria-label="Heatmap legend"><span data-state="missing" /> No entry <span data-state="partial" /> Partial <span data-state="complete" /> Complete <span data-state="skipped" /> Skipped</div>
      </section>

      <div className="detail-columns">
        <section className="detail-panel">
          <header>
            <div><p className="eyebrow">CURRENT RULE</p><h2>Target</h2></div>
            <button className="secondary-button" onClick={() => setTargetOpen(true)} type="button">Edit target</button>
          </header>
          {currentTarget ? (
            <div className="target-summary">
              <strong>{currentTarget.targetValue} {currentTarget.unit ?? "completion"}</strong>
              <span>{currentTarget.cadence === "daily" ? "each scheduled day" : "each week"}</span>
              <small>{currentTarget.metric} · effective {currentTarget.effectiveFrom}</small>
            </div>
          ) : <p className="page-empty">No current target.</p>}
          {item.targets.length > 1 ? (
            <details className="target-history"><summary>Target history ({item.targets.length})</summary>{item.targets.map((target) => <p key={target.id}>{target.effectiveFrom}–{target.effectiveTo ?? "now"}: {target.targetValue} {target.unit ?? target.metric} / {target.cadence}</p>)}</details>
          ) : null}
        </section>

        <section className="detail-panel">
          <header>
            <div><p className="eyebrow">MILESTONES</p><h2>Checkpoints</h2></div>
            <button className="secondary-button" onClick={() => setCheckpointOpen(true)} type="button"><Plus aria-hidden="true" size={16} /> Add</button>
          </header>
          <div className="detail-checkpoints">
            {item.checkpoints.length ? item.checkpoints.map((checkpoint) => (
              <article data-earned={checkpoint.isEarned} key={checkpoint.id}>
                <Gift aria-hidden="true" />
                <div><strong>{checkpoint.title}</strong><span>{checkpoint.rewardDescription}</span><small>{checkpoint.progress} / {checkpoint.thresholdValue}{checkpoint.isEarned ? " · earned" : ""}</small></div>
              </article>
            )) : <p className="page-empty">No checkpoints yet.</p>}
          </div>
        </section>
      </div>

      {selectedDate ? (
        <CheckInDrawer
          date={selectedDate}
          habit={item}
          onClose={() => setSelectedDate(null)}
          onSaved={() => { setSelectedDate(null); router.refresh(); }}
        />
      ) : null}
      {targetOpen && currentTarget ? (
        <TargetDialog habitId={item.habit.id} onClose={() => setTargetOpen(false)} target={currentTarget} today={today} />
      ) : null}
      {checkpointOpen ? (
        <CheckpointDialog habitId={item.habit.id} onClose={() => setCheckpointOpen(false)} />
      ) : null}
    </section>
  );
}

function TargetDialog({
  habitId,
  target,
  today,
  onClose,
}: {
  habitId: string;
  target: DashboardHabit["targets"][number];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [metric, setMetric] = useState(target.metric);
  const [cadence, setCadence] = useState(target.cadence);
  const [value, setValue] = useState(target.targetValue);
  const [unit, setUnit] = useState(target.unit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const todayDate = parseISO(`${today}T12:00:00`);
  const mondayOffset = (8 - getISODay(todayDate)) % 7;
  const weeklyDate = format(addDays(todayDate, mondayOffset), "yyyy-MM-dd");
  const effectiveFrom =
    target.effectiveFrom === today
      ? today
      : cadence === "weekly" || target.cadence === "weekly"
        ? weeklyDate
        : today;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/habits/${habitId}/targets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        effectiveFrom,
        target: {
          metric,
          cadence,
          targetValue: metric === "binary" ? 1 : value,
          unit: metric === "binary" ? null : unit,
          scheduledWeekdays: target.scheduledWeekdays,
        },
      }),
    });
    setSaving(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: { message?: string } };
      setError(result.error?.message ?? "Could not change target");
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section aria-labelledby="target-dialog-title" aria-modal="true" className="drawer compact-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="drawer-header"><div><p className="eyebrow">NEW VERSION</p><h2 id="target-dialog-title">Edit target</h2></div><button aria-label="Close target editor" className="icon-button" onClick={onClose} type="button"><X /></button></header>
        <form className="drawer-body" onSubmit={submit}>
          <label className="field"><span>Measure</span><select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)}><option value="binary">Done or not done</option><option value="count">Quantity</option><option value="duration">Duration</option></select></label>
          <label className="field"><span>Cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          {metric !== "binary" ? <div className="split-fields"><label className="field"><span>Target value</span><input min="0.01" type="number" value={value} onChange={(event) => setValue(Number(event.target.value))} /></label><label className="field"><span>Unit</span><input value={unit} onChange={(event) => setUnit(event.target.value)} /></label></div> : null}
          <p className="effective-note">Takes effect {effectiveFrom}. Historical entries keep their original rule.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={17} /> : null} Save target</button></div>
        </form>
      </section>
    </div>
  );
}

function CheckpointDialog({ habitId, onClose }: { habitId: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("completed_periods");
  const [threshold, setThreshold] = useState(7);
  const [reward, setReward] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/habits/${habitId}/checkpoints`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, metric, thresholdValue: threshold, rewardDescription: reward }),
    });
    setSaving(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: { message?: string } };
      setError(result.error?.message ?? "Could not add checkpoint");
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section aria-labelledby="checkpoint-dialog-title" aria-modal="true" className="drawer compact-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="drawer-header"><div><p className="eyebrow">NEW MILESTONE</p><h2 id="checkpoint-dialog-title">Add checkpoint</h2></div><button aria-label="Close checkpoint form" className="icon-button" onClick={onClose} type="button"><X /></button></header>
        <form className="drawer-body" onSubmit={submit}>
          <label className="field"><span>Title</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="split-fields"><label className="field"><span>Measure</span><select value={metric} onChange={(event) => setMetric(event.target.value)}><option value="completed_periods">Completed days/weeks</option><option value="current_streak">Current streak</option><option value="total_value">Total value</option></select></label><label className="field"><span>Threshold</span><input min="1" required type="number" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label></div>
          <label className="field"><span>Reward</span><input required value={reward} onChange={(event) => setReward(event.target.value)} /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="spin" size={17} /> : null} Add checkpoint</button></div>
        </form>
      </section>
    </div>
  );
}
