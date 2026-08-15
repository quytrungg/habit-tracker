"use client";

import { format, parseISO } from "date-fns";
import { Check, LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";

import { isScheduled, targetForDate } from "@/domain/habit-engine";
import type { CheckpointAward } from "@/domain/types";
import type { DashboardHabit } from "@/server/services/habit-service";

type AwardResult = Pick<
  CheckpointAward,
  "id" | "checkpointId" | "progressSnapshot"
>[];

export function CheckInDrawer({
  habit,
  date,
  onClose,
  onSaved,
}: {
  habit: DashboardHabit;
  date: string;
  onClose: () => void;
  onSaved: (awards: AwardResult) => void;
}) {
  const target = targetForDate(habit.targets, date);
  const entry = habit.checkins.find((candidate) => candidate.localDate === date);
  const [value, setValue] = useState(entry?.value ?? 0);
  const [note, setNote] = useState(entry?.note ?? "");
  const [isSkipped, setIsSkipped] = useState(entry?.isSkipped ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduled = target ? isScheduled(target, date) : false;

  const save = async (
    next: { value: number; note: string; isSkipped: boolean },
    closeAfter = true,
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/habits/${habit.habit.id}/checkins/${date}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            value: next.value,
            isSkipped: next.isSkipped,
            note: next.note || null,
          }),
        },
      );
      const result = (await response.json()) as {
        newAwards?: AwardResult;
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(result.error?.message ?? "Could not save this check-in");
        return;
      }
      onSaved(result.newAwards ?? []);
      if (closeAfter) onClose();
    } catch {
      setError("The server could not be reached. Your note is still here.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async () => {
    if (!entry) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/habits/${habit.habit.id}/checkins/${date}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        setError(result.error?.message ?? "Could not delete this entry");
        return;
      }
      onSaved([]);
      onClose();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) {
    return (
      <div className="modal-backdrop" onMouseDown={onClose}>
        <section
          aria-labelledby="checkin-title"
          aria-modal="true"
          className="drawer"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <h2 id="checkin-title">No target for this date</h2>
          <button className="secondary-button" onClick={onClose} type="button">
            Close
          </button>
        </section>
      </div>
    );
  }

  const formattedDate = format(parseISO(`${date}T12:00:00`), "EEEE, MMMM d");
  const progressLabel = `Progress${target.unit ? ` in ${target.unit}` : ""}`;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="checkin-title"
        aria-modal="true"
        className="drawer"
        data-accent={habit.habit.accentToken}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">{formattedDate}</p>
            <h2 id="checkin-title">
              {habit.habit.icon} {habit.habit.name}
            </h2>
            <p className="drawer-context">
              {scheduled ? "Scheduled day" : "Optional day"} · Target {target.targetValue}
              {target.unit ? ` ${target.unit}` : " completion"}
            </p>
          </div>
          <button
            aria-label="Close check-in"
            className="icon-button close-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body">
          {target.metric === "binary" ? (
            <button
              aria-pressed={value >= 1 && !isSkipped}
              className="completion-toggle"
              onClick={() => {
                setIsSkipped(false);
                setValue(value >= 1 ? 0 : 1);
              }}
              type="button"
            >
              <span className="completion-check">
                {value >= 1 && !isSkipped ? <Check aria-hidden="true" /> : null}
              </span>
              Completed
            </button>
          ) : (
            <div className="field">
              <label htmlFor="checkin-progress">{progressLabel}</label>
              <div className="number-field">
                <button
                  aria-label="Decrease progress"
                  onClick={() => setValue(Math.max(0, value - 1))}
                  type="button"
                >
                  −
                </button>
                <input
                  aria-label={progressLabel}
                  disabled={isSkipped}
                  id="checkin-progress"
                  min="0"
                  onChange={(event) => setValue(Number(event.target.value))}
                  step={target.metric === "duration" ? 5 : 1}
                  type="number"
                  value={value}
                />
                <button
                  aria-label="Increase progress"
                  onClick={() => setValue(value + (target.metric === "duration" ? 5 : 1))}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <label className="skip-row">
            <input
              checked={isSkipped}
              onChange={(event) => {
                setIsSkipped(event.target.checked);
                if (event.target.checked) setValue(0);
              }}
              type="checkbox"
            />
            <span>Mark this day as skipped</span>
          </label>

          <label className="field" htmlFor="checkin-note">
            <span>Daily note</span>
            <textarea
              aria-label="Daily note"
              id="checkin-note"
              maxLength={2_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What helped, what got in the way, or what should tomorrow know?"
              value={note}
            />
            <small className="character-count">{note.length} / 2,000</small>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="drawer-actions">
          <div className="destructive-actions">
            <button
              className="text-button"
              disabled={submitting}
              onClick={() => save({ value: 0, note, isSkipped: false })}
              type="button"
            >
              Clear progress
            </button>
            {entry ? (
              <button
                aria-label="Delete entry"
                className="text-button danger-text"
                disabled={submitting}
                onClick={deleteEntry}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} /> Delete entry
              </button>
            ) : null}
          </div>
          <button
            className="primary-button accent-button"
            disabled={submitting}
            onClick={() => save({ value, note, isSkipped })}
            type="button"
          >
            {submitting ? <LoaderCircle className="spin" size={18} /> : null}
            Save check-in
          </button>
        </footer>
      </section>
    </div>
  );
}
