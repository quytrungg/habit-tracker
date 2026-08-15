"use client";

import { LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import type {
  AccentToken,
  CheckpointMetric,
  HabitCadence,
  HabitMetric,
} from "@/domain/types";

type HabitFormValues = {
  name: string;
  description: string;
  icon: string;
  accentToken: AccentToken;
  startDate: string;
  metric: HabitMetric;
  targetValue: number;
  unit: string;
  cadence: HabitCadence;
  scheduledWeekdays: number[];
  checkpoints: Array<{
    title: string;
    metric: CheckpointMetric;
    thresholdValue: number;
    rewardDescription: string;
  }>;
};

const icons = ["🔥", "📚", "💧", "🏃", "🧘", "✍️", "🌱", "💤"];
const accents: AccentToken[] = ["emerald", "azure", "amber", "violet", "rose"];
const weekdays = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "T"],
  [5, "F"],
  [6, "S"],
  [7, "S"],
] as const;

export function HabitForm({
  today,
  onClose,
  onCreated,
}: {
  today: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HabitFormValues>({
    defaultValues: {
      name: "",
      description: "",
      icon: "🔥",
      accentToken: "emerald",
      startDate: today,
      metric: "binary",
      targetValue: 1,
      unit: "",
      cadence: "daily",
      scheduledWeekdays: [],
      checkpoints: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "checkpoints" });
  const metric = useWatch({ control, name: "metric" });
  const cadence = useWatch({ control, name: "cadence" });
  const icon = useWatch({ control, name: "icon" });
  const accent = useWatch({ control, name: "accentToken" });
  const selectedWeekdays = useWatch({ control, name: "scheduledWeekdays" });
  const name = useWatch({ control, name: "name" });
  const startDate = useWatch({ control, name: "startDate" });

  const submit = handleSubmit(
    async (values) => {
      setServerError(null);
      try {
        const response = await fetch("/api/habits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            description: values.description || null,
            icon: values.icon,
            accentToken: values.accentToken,
            startDate: values.startDate,
            target: {
              metric: values.metric,
              targetValue:
                values.metric === "binary" ? 1 : Number(values.targetValue),
              unit: values.metric === "binary" ? null : values.unit,
              cadence: values.cadence,
              scheduledWeekdays:
                values.cadence === "daily" && values.scheduledWeekdays.length
                  ? values.scheduledWeekdays
                  : null,
            },
            checkpoints: values.checkpoints.map((checkpoint) => ({
              ...checkpoint,
              thresholdValue: Number(checkpoint.thresholdValue),
            })),
          }),
        });
        const result = (await response.json()) as { error?: { message?: string } };
        if (!response.ok) {
          setServerError(result.error?.message ?? "Could not create this habit");
          return;
        }
        await onCreated();
        onClose();
      } catch {
        setServerError("The server could not be reached. Your habit is still here.");
      }
    },
    (invalidFields) => {
      const names = Object.keys(invalidFields).join(", ");
      setServerError(`Complete the required fields${names ? `: ${names}` : ""}.`);
    },
  );

  const toggleWeekday = (day: number) => {
    setValue(
      "scheduledWeekdays",
      selectedWeekdays.includes(day)
        ? selectedWeekdays.filter((candidate) => candidate !== day)
        : [...selectedWeekdays, day].sort(),
      { shouldDirty: true },
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="habit-form-title"
        aria-modal="true"
        className="habit-form-modal"
        data-accent={accent}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">NEW RHYTHM</p>
            <h2 id="habit-form-title">Create a habit</h2>
          </div>
          <button
            aria-label="Close habit form"
            className="icon-button close-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form className="habit-form" onSubmit={submit}>
          <div className="form-sections">
            <fieldset className="form-section">
              <legend>1 · Habit</legend>
              <label className="field">
                <span>Habit name</span>
                <input
                  autoFocus
                  placeholder="Study, drink water, stretch…"
                  {...register("name", { required: "Name your habit", maxLength: 80 })}
                />
                {errors.name ? <small role="alert">{errors.name.message}</small> : null}
              </label>
              <label className="field">
                <span>Description <em>optional</em></span>
                <textarea
                  placeholder="Why does this matter?"
                  {...register("description", { maxLength: 500 })}
                />
              </label>
              <div className="choice-group">
                <span>Icon</span>
                <div className="icon-choices">
                  {icons.map((candidate) => (
                    <button
                      aria-label={`Use ${candidate} icon`}
                      aria-pressed={icon === candidate}
                      key={candidate}
                      onClick={() => setValue("icon", candidate)}
                      type="button"
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
              </div>
              <div className="choice-group">
                <span>Color</span>
                <div className="color-choices">
                  {accents.map((candidate) => (
                    <button
                      aria-label={`Use ${candidate} color`}
                      aria-pressed={accent === candidate}
                      data-accent={candidate}
                      key={candidate}
                      onClick={() => setValue("accentToken", candidate)}
                      type="button"
                    />
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Start date</span>
                <input max={today} type="date" {...register("startDate", { required: true })} />
              </label>
            </fieldset>

            <fieldset className="form-section">
              <legend>2 · Target</legend>
              <label className="field">
                <span>How do you measure it?</span>
                <select {...register("metric")}>
                  <option value="binary">Done or not done</option>
                  <option value="count">A quantity</option>
                  <option value="duration">Time spent</option>
                </select>
              </label>
              <label className="field">
                <span>Cadence</span>
                <select {...register("cadence")}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly total</option>
                </select>
              </label>
              {metric !== "binary" ? (
                <div className="split-fields">
                  <label className="field">
                    <span>{cadence === "daily" ? "Daily target" : "Weekly target"}</span>
                    <input
                      min="0.01"
                      step={metric === "duration" ? 5 : 1}
                      type="number"
                      {...register("targetValue", {
                        required: true,
                        min: 0.01,
                        valueAsNumber: true,
                      })}
                    />
                  </label>
                  <label className="field">
                    <span>Unit</span>
                    <input
                      placeholder={metric === "duration" ? "minutes" : "glasses"}
                      {...register("unit", { required: true, maxLength: 32 })}
                    />
                  </label>
                </div>
              ) : null}
              {cadence === "daily" ? (
                <div className="choice-group">
                  <span>Scheduled days <em>empty means every day</em></span>
                  <div className="weekday-choices">
                    {weekdays.map(([day, label], index) => (
                      <button
                        aria-label={`Toggle ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]}`}
                        aria-pressed={selectedWeekdays.includes(day)}
                        key={day}
                        onClick={() => toggleWeekday(day)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </fieldset>

            <fieldset className="form-section checkpoint-section">
              <legend>3 · Rewards</legend>
              <p className="section-help">
                Add moments worth celebrating. Rewards unlock once and remain in history.
              </p>
              {fields.map((field, index) => (
                <div className="checkpoint-row" key={field.id}>
                  <button
                    aria-label={`Remove checkpoint ${index + 1}`}
                    className="remove-checkpoint"
                    onClick={() => remove(index)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                  <label className="field">
                    <span>Checkpoint title</span>
                    <input
                      aria-label={`Checkpoint title ${index + 1}`}
                      {...register(`checkpoints.${index}.title`, { required: true })}
                    />
                  </label>
                  <div className="split-fields checkpoint-metric-fields">
                    <label className="field">
                      <span>Measure</span>
                      <select {...register(`checkpoints.${index}.metric`)}>
                        <option value="completed_periods">Completed days/weeks</option>
                        <option value="current_streak">Current streak</option>
                        <option value="total_value">Total value</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Threshold</span>
                      <input
                        aria-label={`Checkpoint threshold ${index + 1}`}
                        min="1"
                        type="number"
                        {...register(`checkpoints.${index}.thresholdValue`, {
                          required: true,
                          min: 1,
                          valueAsNumber: true,
                        })}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Reward</span>
                    <input
                      aria-label={`Reward ${index + 1}`}
                      placeholder="Buy a new book, take a slow morning…"
                      {...register(`checkpoints.${index}.rewardDescription`, {
                        required: true,
                      })}
                    />
                  </label>
                </div>
              ))}
              <button
                className="secondary-button add-checkpoint"
                onClick={() =>
                  append({
                    title: "",
                    metric: "completed_periods",
                    thresholdValue: 7,
                    rewardDescription: "",
                  })
                }
                type="button"
              >
                <Plus aria-hidden="true" size={18} /> Add checkpoint
              </button>
            </fieldset>
          </div>

          <aside className="habit-preview" aria-label="Habit card preview">
            <p className="eyebrow">LIVE PREVIEW</p>
            <div className="mini-habit-card" data-accent={accent}>
              <span className="habit-icon">{icon}</span>
              <div>
                <strong>{name || "Your new habit"}</strong>
                <small>Begins {startDate}</small>
              </div>
            </div>
          </aside>

          {serverError ? (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          ) : null}
          <footer className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button accent-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? <LoaderCircle className="spin" size={18} /> : null}
              Create habit
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
