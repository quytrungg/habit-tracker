import { addDays, format, parseISO, subDays } from "date-fns";
import Link from "next/link";

import { DailyCalendar } from "@/components/calendar/daily-calendar";
import { db } from "@/db";
import { isValidLocalDate, todayInTimeZone } from "@/domain/habit-engine";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/habit-service";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const today = todayInTimeZone(user.timezone);
  const requested = (await searchParams).date;
  const date = requested && isValidLocalDate(requested) && requested <= today ? requested : today;
  const data = await getDashboard(db, {
    userId: user.id,
    from: date,
    to: date,
    today,
  });
  const parsed = parseISO(`${date}T12:00:00`);
  const previous = format(subDays(parsed, 1), "yyyy-MM-dd");
  const next = format(addDays(parsed, 1), "yyyy-MM-dd");

  return (
    <section className="content-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">DAILY VIEW</p>
          <h1>Calendar</h1>
          <p>Check in, reflect, or revise any day.</p>
        </div>
        <form className="date-jump" method="get">
          <label htmlFor="calendar-date">Jump to date</label>
          <input id="calendar-date" max={today} name="date" type="date" defaultValue={date} />
          <button className="secondary-button" type="submit">Go</button>
        </form>
      </header>
      <div className="day-navigation">
        <Link href={`/calendar?date=${previous}`}>← Previous</Link>
        <strong>{format(parsed, "EEEE, MMMM d, yyyy")}</strong>
        {date < today ? <Link href={`/calendar?date=${next}`}>Next →</Link> : <span />}
      </div>
      <DailyCalendar date={date} items={data.habits} />
    </section>
  );
}
