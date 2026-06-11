import AsyncStorage from "@react-native-async-storage/async-storage";

export interface SlipSession {
  id: string;
  startTime: string;
  endTime: string;
  count: number;
  date: string;
}

interface CurrentSlipSession {
  startTime: string;
  count: number;
  isActive: boolean;
}

export const startSlipSession = async (): Promise<void> => {
  const session: CurrentSlipSession = {
    startTime: new Date().toISOString(),
    count: 0,
    isActive: true,
  };
  await AsyncStorage.setItem("current_slip_session", JSON.stringify(session));
};

export const getCurrentSession = async (): Promise<CurrentSlipSession | null> => {
  const data = await AsyncStorage.getItem("current_slip_session");
  if (!data) return null;
  return JSON.parse(data) as CurrentSlipSession;
};

export const isSessionActive = async (): Promise<boolean> => {
  const session = await getCurrentSession();
  if (!session || !session.isActive) return false;

  const start = new Date(session.startTime);
  const now = new Date();
  const hours = (now.getTime() - start.getTime()) / (1000 * 60 * 60);

  if (hours >= 24) {
    await endSlipSession();
    return false;
  }
  return true;
};

export const incrementSlipCount = async (): Promise<number> => {
  const session = await getCurrentSession();
  if (!session || !session.isActive) return 0;

  session.count = (session.count || 0) + 1;
  await AsyncStorage.setItem("current_slip_session", JSON.stringify(session));

  const total = parseInt((await AsyncStorage.getItem("total_slip_count")) || "0", 10);
  await AsyncStorage.setItem("total_slip_count", String(total + 1));

  return session.count;
};

export const endSlipSession = async (): Promise<void> => {
  const session = await getCurrentSession();
  if (!session) return;

  const completedSession: SlipSession = {
    id: Date.now().toString(),
    startTime: session.startTime,
    endTime: new Date().toISOString(),
    count: session.count,
    date: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };

  const existing = await AsyncStorage.getItem("slip_sessions");
  const sessions: SlipSession[] = existing ? JSON.parse(existing) : [];

  sessions.unshift(completedSession);

  if (sessions.length > 7) {
    sessions.splice(7);
  }

  await AsyncStorage.setItem("slip_sessions", JSON.stringify(sessions));
  await AsyncStorage.removeItem("current_slip_session");
};

export const getSessionHistory = async (): Promise<SlipSession[]> => {
  const data = await AsyncStorage.getItem("slip_sessions");
  return data ? JSON.parse(data) : [];
};
