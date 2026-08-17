"use client";

import { Check, Circle, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { progressForTargetPeriod, targetForDate } from "@/domain/habit-engine";
import type { DashboardHabit } from "@/server/services/habit-service";
import { CheckInDrawer } from "@/components/check-in/check-in-drawer";
import { habitAccentStyle } from "@/components/habits/accent-style";

export function DailyCalendar({
  items,
  date,
}: {
  items: DashboardHabit[];
  date: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.habit.id === selectedId);

  const saved = () => {
    setSelectedId(null);
    router.refresh();
  };

  return (
    <div className="daily-habit-list">
      {items.length ? (
        items.map((item) => {
          const target = targetForDate(item.targets, date);
          const entry = item.checkins.find((candidate) => candidate.localDate === date);
          const progress = target
            ? progressForTargetPeriod(target, date, item.checkins)
            : 0;
          const complete = target ? progress >= target.targetValue : false;
          return (
            <button
              className="daily-habit-row"
              data-accent={item.habit.accentToken}
              key={item.habit.id}
              onClick={() => setSelectedId(item.habit.id)}
              type="button"
              style={habitAccentStyle(item.habit.customColor)}
            >
              <span className="daily-status" data-complete={complete}>
                {complete ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="daily-icon" aria-hidden="true">
                {item.habit.icon}
              </span>
              <span className="daily-copy">
                <strong>{item.habit.name}</strong>
                <small>
                  {target
                    ? `${progress} / ${target.targetValue}${target.unit ? ` ${target.unit}` : ""}`
                    : "No target for this date"}
                </small>
              </span>
              {entry?.note ? (
                <StickyNote aria-label="Note added" className="daily-note-icon" size={18} />
              ) : null}
            </button>
          );
        })
      ) : (
        <p className="page-empty">No active habits yet.</p>
      )}
      {selected ? (
        <CheckInDrawer
          date={date}
          habit={selected}
          onClose={() => setSelectedId(null)}
          onSaved={saved}
        />
      ) : null}
    </div>
  );
}
