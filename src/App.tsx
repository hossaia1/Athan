import { useEffect, useMemo, useRef, useState } from "react";
import adhanAudio from "./assets/adhan.mp3";

/* =====================
   Types
===================== */

type PrayerKey = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";
type PrayerTimes = Record<PrayerKey, string>;

type WeatherNow = {
  temp: number;
  wind: number;
  direction: number;
  code: number;
};

type DailyWeather = {
  day: string; // YYYY-MM-DD
  min: number;
  max: number;
  code: number;
};

type HourWeather = {
  time: string; // ISO
  hour: string; // HH:MM
  temp: number;
  code: number;
};

/* =====================
   Constants
===================== */

const TIMEZONE = "Europe/Helsinki";
const LAT = 60.2239; // Myllypuro
const LON = 25.0775;

const PRAYERS: PrayerKey[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const QUOTES = [
  { text: "Indeed, with hardship comes ease.", ref: "Qur'an 94:6" },
  { text: "So remember Me; I will remember you.", ref: "Qur'an 2:152" },
  { text: "Allah does not burden a soul beyond that it can bear.", ref: "Qur'an 2:286" },
  { text: "And He is with you wherever you are.", ref: "Qur'an 57:4" },
  { text: "Whoever relies upon Allah – then He is sufficient for him.", ref: "Qur'an 65:3" },
  { text: "So truly where there is hardship there is also ease.", ref: "Qur'an 94:5" },
  { text: "Actions are judged by intentions.", ref: "Hadith (Bukhari/Muslim)" },
  { text: "Make things easy and do not make them difficult.", ref: "Hadith (Bukhari/Muslim)" },
  { text: "The most beloved deeds are those done consistently.", ref: "Hadith (Bukhari/Muslim)" },
  { text: "The best of you are those who learn the Qur’an and teach it.", ref: "Hadith (Bukhari)" },
];

/* =====================
   Helpers
===================== */

const pad = (n: number) => String(n).padStart(2, "0");

const hhmmToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const weatherEmoji = (code: number) => {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "☁️";
};

function degToCardinal(deg: number) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

/* =====================
   API
===================== */

async function fetchPrayerTimes(): Promise<PrayerTimes> {
  const d = new Date();
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  const res = await fetch(
    `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Helsinki&country=Finland&method=3`
  );
  const json = await res.json();
  const t = json.data.timings;

  const clean = (s: string) => s.match(/\d{2}:\d{2}/)?.[0] ?? "00:00";

  return {
    Fajr: clean(t.Fajr),
    Dhuhr: clean(t.Dhuhr),
    Asr: clean(t.Asr),
    Maghrib: clean(t.Maghrib),
    Isha: clean(t.Isha),
  };
}

async function fetchWeather(): Promise<{
  now: WeatherNow;
  todayHours: HourWeather[];
  week: DailyWeather[];
}> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,weathercode` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
      `&timezone=${TIMEZONE}`
  );
  const json = await res.json();

  const now: WeatherNow = {
    temp: json.current_weather.temperature,
    wind: json.current_weather.windspeed,
    direction: json.current_weather.winddirection,
    code: json.current_weather.weathercode,
  };

  const week: DailyWeather[] = json.daily.time.map((day: string, i: number) => ({
    day,
    min: json.daily.temperature_2m_min[i],
    max: json.daily.temperature_2m_max[i],
    code: json.daily.weathercode[i],
  }));

  const hourlyTimes: string[] = json.hourly.time;
  const hourlyTemps: number[] = json.hourly.temperature_2m;
  const hourlyCodes: number[] = json.hourly.weathercode;

  const localToday = new Date();
  const todayDate = `${localToday.getFullYear()}-${pad(localToday.getMonth() + 1)}-${pad(localToday.getDate())}`;

  const todayHours: HourWeather[] = hourlyTimes
    .map((t: string, i: number) => ({
      time: t,
      hour: t.slice(11, 16),
      temp: hourlyTemps[i],
      code: hourlyCodes[i],
    }))
    .filter((h) => h.time.slice(0, 10) === todayDate);

  return { now, todayHours, week };
}

/* =====================
   App
===================== */

export default function App() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [now, setNow] = useState(new Date());

  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );

  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes>({
    Fajr: "00:00",
    Dhuhr: "00:00",
    Asr: "00:00",
    Maghrib: "00:00",
    Isha: "00:00",
  });

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [todayHours, setTodayHours] = useState<HourWeather[]>([]);
  const [week, setWeek] = useState<DailyWeather[]>([]);

  const [quoteIndex, setQuoteIndex] = useState(0);

  const [showMore, setShowMore] = useState(false);
  const [compact, setCompact] = useState(false);

  const [adhanEnabled, setAdhanEnabled] = useState<Record<PrayerKey, boolean>>(
    () =>
      JSON.parse(
        localStorage.getItem("adhanPerPrayer") ||
          JSON.stringify({
            Fajr: true,
            Dhuhr: false,
            Asr: false,
            Maghrib: true,
            Isha: true,
          })
      )
  );

  const lastPlayedRef = useRef<PrayerKey | null>(null);
  const adhan = useMemo(() => new Audio(adhanAudio), []);

  const [isAdhanPlaying, setIsAdhanPlaying] = useState(false);
  const [isAdhanPaused, setIsAdhanPaused] = useState(false);
  const [adhanLocked, setAdhanLocked] = useState(false);

  /* Clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Quote rotation */
  useEffect(() => {
    const t = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
    }, 45000);
    return () => clearInterval(t);
  }, []);

  /* Persist settings */
  useEffect(() => {
    localStorage.setItem("adhanPerPrayer", JSON.stringify(adhanEnabled));
  }, [adhanEnabled]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  /* Fetch APIs */
  useEffect(() => {
    fetchPrayerTimes().then(setPrayerTimes);
    fetchWeather().then((w) => {
      setWeather(w.now);
      setTodayHours(w.todayHours);
      setWeek(w.week);
    });
  }, []);

  /* ResizeObserver → decide compact mode (handles zoom + tablets) */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();

      // Heuristic:
      // If the app area is too small to comfortably show 2×2 with details, go compact.
      // Tune these numbers if you want.
      const tooNarrow = width < 980;
      const tooShort = height < 600;

      setCompact(tooNarrow || tooShort);

      // If we leave compact, also close the overlay
      if (!(tooNarrow || tooShort)) setShowMore(false);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Audio state sync */
  useEffect(() => {
    const onPlay = () => {
      setIsAdhanPlaying(true);
      setIsAdhanPaused(false);
    };
    const onPause = () => setIsAdhanPaused(true);
    const onEnded = () => {
      setIsAdhanPlaying(false);
      setIsAdhanPaused(false);
    };

    adhan.addEventListener("play", onPlay);
    adhan.addEventListener("pause", onPause);
    adhan.addEventListener("ended", onEnded);

    return () => {
      adhan.removeEventListener("play", onPlay);
      adhan.removeEventListener("pause", onPause);
      adhan.removeEventListener("ended", onEnded);
    };
  }, [adhan]);

  /* Prayer logic */
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const currentPrayer =
    PRAYERS.slice()
      .reverse()
      .find((p) => nowMin >= hhmmToMinutes(prayerTimes[p])) || "Fajr";

  const nextPrayer =
    PRAYERS.find((p) => nowMin < hhmmToMinutes(prayerTimes[p])) || "Fajr";

  const nextMin = hhmmToMinutes(prayerTimes[nextPrayer]);
  const diff = nextMin > nowMin ? nextMin - nowMin : 1440 - nowMin + nextMin;
  const countdown = `${pad(Math.floor(diff / 60))}:${pad(diff % 60)}:${pad(59 - now.getSeconds())}`;

  /* Auto-play */
  useEffect(() => {
    if (adhanLocked) return;
    if (!adhanEnabled[currentPrayer]) return;

    const isPrayerMoment =
      nowMin === hhmmToMinutes(prayerTimes[currentPrayer]) && now.getSeconds() === 0;

    if (isPrayerMoment && lastPlayedRef.current !== currentPrayer) {
      adhan.currentTime = 0;
      adhan.play().catch(() => {});
      lastPlayedRef.current = currentPrayer;
    }
  }, [now, currentPrayer, adhanEnabled, prayerTimes, adhanLocked, nowMin, adhan]);

  /* Adhaan controls */
  const pauseAdhan = () => {
    if (adhanLocked) return;
    if (!isAdhanPlaying) return;
    adhan.pause();
    setIsAdhanPlaying(true);
    setIsAdhanPaused(true);
  };

  const resumeAdhan = () => {
    if (adhanLocked) return;
    if (!isAdhanPaused) return;
    adhan.play().catch(() => {});
  };

  const stopAdhanCompletely = () => {
    adhan.pause();
    adhan.currentTime = 0;
    setIsAdhanPlaying(false);
    setIsAdhanPaused(false);
    setAdhanLocked(true);
  };

  /* Weather slices */
  const nextHours = useMemo(() => {
    const curHour = pad(now.getHours()) + ":00";
    const idx = todayHours.findIndex((h) => h.hour === curHour);
    const start = idx === -1 ? 0 : idx;
    return todayHours.slice(start, start + 10);
  }, [todayHours, now]);

  /* UI building blocks */
  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-3xl bg-white/10 p-6 overflow-hidden ${className}`}>{children}</div>
  );

  const appBg =
    theme === "dark" ? "bg-[#070b12] text-white" : "bg-gray-100 text-gray-900";

  return (
    <div ref={rootRef} className={`min-h-screen w-full p-6 ${appBg}`}>
      {/* Compact-mode floating "more" button */}
      {compact && (
        <button
          onClick={() => setShowMore(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-white/10 px-4 py-3 text-sm backdrop-blur"
          title="More"
        >
          ⋯
        </button>
      )}

      {/* More overlay (only in compact) */}
      {compact && showMore && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-4 rounded-3xl bg-[#0b1020] text-white p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm opacity-80">More</div>
              <button
                onClick={() => setShowMore(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Hidden content goes here */}
            <div className="grid gap-4">
              <Card>
                <div className="text-xs opacity-70 mb-2">Today (next hours)</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {nextHours.map((h) => (
                    <div
                      key={h.time}
                      className="min-w-[62px] rounded-2xl bg-black/30 px-3 py-2 text-center"
                    >
                      <div className="text-[11px] opacity-70">{h.hour}</div>
                      <div className="text-lg leading-none">{weatherEmoji(h.code)}</div>
                      <div className="text-[12px] font-mono">{Math.round(h.temp)}°</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="text-xs opacity-70 mb-2">Next 7 days</div>
                <div className="grid grid-cols-7 gap-2 text-sm">
                  {week.slice(0, 7).map((d) => (
                    <div key={d.day} className="text-center opacity-90">
                      <div className="text-[11px] opacity-70">
                        {new Date(d.day).toLocaleDateString("en-GB", { weekday: "short" })}
                      </div>
                      <div className="text-lg leading-none">{weatherEmoji(d.code)}</div>
                      <div className="text-[12px] font-mono">{Math.round(d.max)}°</div>
                      <div className="text-[11px] opacity-50 font-mono">{Math.round(d.min)}°</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="text-lg leading-relaxed">“{QUOTES[quoteIndex].text}”</div>
                <div className="mt-4 opacity-70">{QUOTES[quoteIndex].ref}</div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Layout:
          - In normal mode: true 2×2 dashboard
          - In compact mode: still 2×2 skeleton, but heavy content hidden (no overlap)
      */}
      <div className="grid gap-6 grid-cols-2 grid-rows-2">
        {/* TIME */}
        <Card className="relative">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="rounded-full bg-white/10 px-3 py-1 text-xs"
              title="Toggle theme"
            >
              {theme === "dark" ? "🌞" : "🌙"}
            </button>
          </div>

          <div className="text-7xl font-semibold">
            {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
          </div>

          <div className="opacity-70 mt-2">
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>

          <div className="mt-6">
            🕌 Current: <b>{currentPrayer}</b>
          </div>
          <div className="opacity-70">
            Next: {nextPrayer} in <b>{countdown}</b>
          </div>

          <div className="mt-5">
            {adhanLocked ? (
              <div className="text-xs opacity-70">🔇 Adhaan disabled (reload page to re-enable)</div>
            ) : isAdhanPlaying ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm">🎧 Adhaan is {isAdhanPaused ? "paused" : "playing"}…</div>

                {!isAdhanPaused ? (
                  <button onClick={pauseAdhan} className="rounded-xl bg-white/10 px-3 py-2 text-xs">
                    ⏸ Pause
                  </button>
                ) : (
                  <button onClick={resumeAdhan} className="rounded-xl bg-white/10 px-3 py-2 text-xs">
                    ▶ Resume
                  </button>
                )}

                <button
                  onClick={stopAdhanCompletely}
                  className="rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-300"
                >
                  ⛔ Stop completely
                </button>
              </div>
            ) : (
              <div className="text-xs opacity-70">🔊 Adhaan will play on enabled prayers.</div>
            )}
          </div>
        </Card>

        {/* WEATHER */}
        <Card>
          {weather && (
            <>
              <div className="text-6xl font-semibold">
                {weatherEmoji(weather.code)} {Math.round(weather.temp)}°C
              </div>
              <div className="opacity-70 mt-2">
                💨 {weather.wind} m/s ({degToCardinal(weather.direction)})
              </div>

              {/* Only show detailed sections when NOT compact */}
              {!compact && (
                <>
                  <div className="mt-5">
                    <div className="text-xs opacity-70 mb-2">Today (next hours)</div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {nextHours.map((h) => (
                        <div
                          key={h.time}
                          className="min-w-[62px] rounded-2xl bg-black/20 px-3 py-2 text-center"
                        >
                          <div className="text-[11px] opacity-70">{h.hour}</div>
                          <div className="text-lg leading-none">{weatherEmoji(h.code)}</div>
                          <div className="text-[12px] font-mono">{Math.round(h.temp)}°</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-xs opacity-70 mb-2">Next 7 days</div>
                    <div className="grid grid-cols-7 gap-2 text-sm">
                      {week.slice(0, 7).map((d) => (
                        <div key={d.day} className="text-center opacity-90">
                          <div className="text-[11px] opacity-70">
                            {new Date(d.day).toLocaleDateString("en-GB", { weekday: "short" })}
                          </div>
                          <div className="text-lg leading-none">{weatherEmoji(d.code)}</div>
                          <div className="text-[12px] font-mono">{Math.round(d.max)}°</div>
                          <div className="text-[11px] opacity-50 font-mono">{Math.round(d.min)}°</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* In compact mode, hint that more exists */}
              {compact && (
                <div className="mt-4 text-xs opacity-70">
                  More weather details in ⋯
                </div>
              )}
            </>
          )}
        </Card>

        {/* PRAYERS */}
        <Card>
          <table className="w-full text-sm">
            <tbody>
              {PRAYERS.map((p) => (
                <tr key={p} className={p === currentPrayer ? "bg-white/10" : ""}>
                  <td className="py-2">{p}</td>
                  <td className="py-2 text-right font-mono">{prayerTimes[p]}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() =>
                        setAdhanEnabled((s) => ({
                          ...s,
                          [p]: !s[p],
                        }))
                      }
                      className={`px-3 py-1 rounded-full text-xs ${
                        adhanEnabled[p]
                          ? "bg-green-500/20 text-green-400"
                          : "bg-white/10 opacity-50"
                      }`}
                      title={`Toggle adhaan for ${p}`}
                    >
                      🔊
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 text-xs opacity-70">
            Tip: enable only the prayers you want audible.
          </div>
        </Card>

        {/* QUOTE */}
        <Card>
          {/* Hide quote in compact, show in overlay */}
          {!compact ? (
            <>
              <div className="text-lg leading-relaxed">“{QUOTES[quoteIndex].text}”</div>
              <div className="mt-4 opacity-70">{QUOTES[quoteIndex].ref}</div>
            </>
          ) : (
            <div className="text-xs opacity-70">Quotes available in ⋯</div>
          )}
        </Card>
      </div>
    </div>
  );
}
