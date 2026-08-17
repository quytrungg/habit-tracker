"use client";

import {
  differenceInCalendarWeeks,
  getISODay,
  parseISO,
  startOfWeek,
} from "date-fns";
import { useEffect, useRef } from "react";

import type { HeatmapCell } from "@/domain/types";

export function HabitHeatmap({
  cells,
  onSelectDate,
}: {
  cells: HeatmapCell[];
  onSelectDate?: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstDate = cells[0]?.date;
  const firstWeek = firstDate
    ? startOfWeek(parseISO(`${firstDate}T12:00:00`), { weekStartsOn: 1 })
    : null;
  const weekCount = firstWeek
    ? Math.max(
        1,
        ...cells.map(
          ({ date }) =>
            differenceInCalendarWeeks(parseISO(`${date}T12:00:00`), firstWeek, {
              weekStartsOn: 1,
            }) + 1,
        ),
      )
    : 1;

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [cells.length]);

  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const movement: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      Home: -10_000,
      End: 10_000,
    };
    const amount = movement[event.key];
    if (amount === undefined) return;
    event.preventDefault();
    const buttons = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        ".heatmap-cell:not(:disabled)",
      ) ?? [],
    );
    const current = buttons.indexOf(event.currentTarget);
    const next = Math.min(buttons.length - 1, Math.max(0, current + amount));
    buttons[next]?.focus();
  };

  return (
    <div className="heatmap" aria-label="Daily check-in history">
      <div className="weekday-labels" aria-hidden="true">
        <span>M</span>
        <span />
        <span>W</span>
        <span />
        <span>F</span>
        <span />
        <span />
      </div>
      <div className="heatmap-scroll" ref={scroller}>
        <div
          className="heatmap-grid"
          style={{ gridTemplateColumns: `repeat(${weekCount}, 0.92rem)` }}
        >
          {cells.map((cell) => {
            const date = parseISO(`${cell.date}T12:00:00`);
            const column = firstWeek
              ? differenceInCalendarWeeks(date, firstWeek, { weekStartsOn: 1 }) + 1
              : 1;
            return (
              <button
                aria-label={cell.label}
                className="heatmap-cell"
                data-has-note={cell.hasNote}
                data-intensity={cell.intensity}
                data-state={cell.state}
                disabled={cell.state === "future" || !onSelectDate}
                key={cell.date}
                onClick={() => onSelectDate?.(cell.date)}
                onKeyDown={moveFocus}
                style={{ gridColumn: column, gridRow: getISODay(date) }}
                title={cell.label}
                type="button"
              >
                <span className="sr-only">{cell.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
