import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DaySegment {
  day: number;
  date: string;
  slipCount: number;
}

export interface CurrentSlipSession {
  id: string;
  startedAt: string;
  totalSlips: number;
  days: DaySegment[];
  isActive: boolean;
}

export interface SlipSession {
  id: string;
  startedAt: string;
  endTime: string;
  totalSlips: number;
  days: DaySegment[];
  isActive: boolean;
}

export interface SlipCountResult {
  todayCount: number;
  totalSlips: number;
}

const CURRENT_SESSION_KEY = "current_slip_session";
const SESSION_HISTORY_KEY = "slip_sessions";

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodaySlipCount(session: CurrentSlipSession | null): number {
  if (!session) return 0;
  const today = getTodayDateString();
  const segment = session.days.find((entry) => entry.date === today);
  return segment?.slipCount ?? 0;
}

function migrateCurrentSession(raw: unknown): CurrentSlipSession | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;

  if (typeof session.startedAt === "string" && Array.isArray(session.days)) {
    return {
      id: String(session.id ?? Date.now()),
      startedAt: session.startedAt,
      totalSlips: Number(session.totalSlips ?? 0),
      days: session.days as DaySegment[],
      isActive: session.isActive !== false,
    };
  }

  if (typeof session.startTime === "string" && typeof session.count === "number") {
    const start = new Date(session.startTime);
    const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return {
      id: Date.now().toString(),
      startedAt: session.startTime,
      totalSlips: session.count,
      days: [{ day: 1, date: dateStr, slipCount: session.count }],
      isActive: session.isActive !== false,
    };
  }

  return null;
}

function migrateCompletedSession(raw: unknown): SlipSession | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;

  if (typeof session.startedAt === "string" && Array.isArray(session.days)) {
    return {
      id: String(session.id ?? Date.now()),
      startedAt: session.startedAt,
      endTime: String(session.endTime ?? new Date().toISOString()),
      totalSlips: Number(session.totalSlips ?? 0),
      days: session.days as DaySegment[],
      isActive: false,
    };
  }

  if (typeof session.startTime === "string" && typeof session.count === "number") {
    const start = new Date(session.startTime);
    const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return {
      id: String(session.id ?? Date.now()),
      startedAt: session.startTime,
      endTime: String(session.endTime ?? new Date().toISOString()),
      totalSlips: session.count,
      days: [{ day: 1, date: dateStr, slipCount: session.count }],
      isActive: false,
    };
  }

  return null;
}

export const getCurrentSession = async (): Promise<CurrentSlipSession | null> => {
  const data = await AsyncStorage.getItem(CURRENT_SESSION_KEY);
  if (!data) return null;
  try {
    return migrateCurrentSession(JSON.parse(data));
  } catch {
    return null;
  }
};

export const isSessionActive = async (): Promise<boolean> => {
  const session = await getCurrentSession();
  return !!(session && session.isActive);
};

export const incrementSlipCount = async (): Promise<SlipCountResult> => {
  const today = getTodayDateString();
  let session = await getCurrentSession();

  if (!session || !session.isActive) {
    session = {
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      totalSlips: 1,
      days: [{ day: 1, date: today, slipCount: 1 }],
      isActive: true,
    };
    await AsyncStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));
    return { todayCount: 1, totalSlips: 1 };
  }

  session.totalSlips = (session.totalSlips || 0) + 1;
  const lastDay = session.days[session.days.length - 1];

  if (lastDay && lastDay.date === today) {
    lastDay.slipCount += 1;
  } else {
    session.days.push({
      day: lastDay ? lastDay.day + 1 : 1,
      date: today,
      slipCount: 1,
    });
  }

  await AsyncStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));

  const todaySegment = session.days.find((entry) => entry.date === today);
  return {
    todayCount: todaySegment?.slipCount ?? 0,
    totalSlips: session.totalSlips,
  };
};

export const endSlipSession = async (): Promise<void> => {
  const session = await getCurrentSession();
  if (!session) return;

  const completedSession: SlipSession = {
    id: session.id,
    startedAt: session.startedAt,
    endTime: new Date().toISOString(),
    totalSlips: session.totalSlips,
    days: session.days,
    isActive: false,
  };

  const existing = await AsyncStorage.getItem(SESSION_HISTORY_KEY);
  const parsed: unknown[] = existing ? JSON.parse(existing) : [];
  const sessions = parsed
    .map((entry) => migrateCompletedSession(entry))
    .filter((entry): entry is SlipSession => entry !== null);

  sessions.unshift(completedSession);

  if (sessions.length > 7) {
    sessions.splice(7);
  }

  await AsyncStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(sessions));
  await AsyncStorage.removeItem(CURRENT_SESSION_KEY);
};

export const getSessionHistory = async (): Promise<SlipSession[]> => {
  const data = await AsyncStorage.getItem(SESSION_HISTORY_KEY);
  if (!data) return [];
  try {
    const parsed: unknown[] = JSON.parse(data);
    return parsed
      .map((entry) => migrateCompletedSession(entry))
      .filter((entry): entry is SlipSession => entry !== null);
  } catch {
    return [];
  }
};
