import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Modal } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Audio } from "expo-av";
import { api, clearToken, getToken, setToken, type Appointment, type CallRow, type HomeResponse } from "./src/api";
import { registerForPush } from "./src/push";
import { COLORS } from "./src/config";

type Screen = "loading" | "login" | "home" | "calls" | "appointments";
type Tab = "home" | "calls" | "appointments";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");

  // On launch, decide login vs. home based on a stored device token.
  useEffect(() => {
    getToken().then((t) => setScreen(t ? "home" : "login"));
  }, []);

  const onSignedIn = useCallback(async (token: string) => {
    await setToken(token);
    // Best-effort: register this device for push and tell the server.
    registerForPush()
      .then((pt) => pt && api.registerPush(pt, Platform.OS).catch(() => {}))
      .catch(() => {});
    setScreen("home");
  }, []);

  const onSignOut = useCallback(async () => {
    await clearToken();
    setScreen("login");
  }, []);

  if (screen === "loading") {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }
  if (screen === "login") return <LoginScreen onSignedIn={onSignedIn} />;
  return <MainScreen screen={screen} setScreen={setScreen} onSignOut={onSignOut} />;
}

// ---------------------------------------------------------------------------
// Login — email, then the 6-digit code.
// ---------------------------------------------------------------------------
function LoginScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      await api.requestCode(email.trim());
      setStep("code");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError("");
    setBusy(true);
    try {
      const { token } = await api.verifyCode(email.trim(), code.trim(), Platform.OS);
      onSignedIn(token);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>S</Text>
        </View>
        <Text style={styles.h1}>Switchboard</Text>
        <Text style={styles.muted}>Your receptionist, in your pocket.</Text>

        {step === "email" ? (
          <View style={styles.formCard}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@business.com"
              placeholderTextColor={COLORS.muted}
            />
            <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={sendCode} disabled={busy || !email}>
              <Text style={styles.btnText}>{busy ? "Sending…" : "Send me a code"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.label}>Enter the 6-digit code sent to {email}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={COLORS.muted}
            />
            <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={verify} disabled={busy || code.length < 6}>
              <Text style={styles.btnText}>{busy ? "Verifying…" : "Sign in"}</Text>
            </Pressable>
            <Pressable onPress={() => setStep("email")}>
              <Text style={[styles.muted, styles.linkCenter]}>Use a different email</Text>
            </Pressable>
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main — home stats + pause, and the calls feed. Simple two-tab switch.
// ---------------------------------------------------------------------------
function MainScreen({
  screen,
  setScreen,
  onSignOut,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  onSignOut: () => void;
}) {
  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar style="dark" />
      {screen === "home" && <HomeTab onSignOut={onSignOut} />}
      {screen === "calls" && <CallsTab />}
      {screen === "appointments" && <AppointmentsTab />}
      <View style={styles.tabBar}>
        <TabButton label="Home" active={screen === "home"} onPress={() => setScreen("home")} />
        <TabButton label="Calls" active={screen === "calls"} onPress={() => setScreen("calls")} />
        <TabButton label="Appointments" active={screen === "appointments"} onPress={() => setScreen("appointments")} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabBtn} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HomeTab({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pausing, setPausing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.home());
    } catch {
      // leave prior data; a transient failure shouldn't blank the screen
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function togglePause(next: boolean) {
    setPausing(true);
    try {
      await api.setPaused(next);
      await load();
    } finally {
      setPausing(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  const shop = data?.shop;
  const stats = data?.stats;
  const paused = shop?.paused ?? false;

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{shop?.businessName ?? "Your shop"}</Text>
        <Pressable onPress={onSignOut}>
          <Text style={styles.muted}>Sign out</Text>
        </Pressable>
      </View>

      <StatusPill status={paused ? "paused" : shop?.status ?? "—"} number={shop?.agentNumber ?? undefined} />

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardTitle}>{paused ? "Receptionist paused" : "Receptionist is answering"}</Text>
            <Text style={styles.muted}>
              {paused ? "Calls are not being answered right now." : "Answering your calls right now."}
            </Text>
          </View>
          <Switch value={!paused} disabled={pausing} onValueChange={(v) => togglePause(!v)} />
        </View>
      </View>

      <View style={styles.grid}>
        <Stat label="Calls answered" value={stats?.callsAnswered ?? 0} sub={`${stats?.afterHours ?? 0} after hours`} />
        <Stat label="Jobs booked" value={stats?.jobsBooked ?? 0} sub={`${stats?.messages ?? 0} messages`} />
        <Stat label="Revenue booked" value={`$${(stats?.revenueBooked ?? 0).toLocaleString()}`} sub="estimated" />
        <Stat label="Saved from voicemail" value={stats?.recovered ?? 0} sub={`${stats?.hotJobs ?? 0} emergencies`} />
      </View>
      <Text style={[styles.muted, { textAlign: "center", marginTop: 4 }]}>Last 30 days</Text>
    </ScrollView>
  );
}

function CallsTab() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CallRow | null>(null);

  const load = useCallback(async () => {
    try {
      setCalls((await api.calls()).calls);
    } catch {
      /* keep prior */
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        contentContainerStyle={styles.body}
        data={calls}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<Text style={styles.h2}>Recent calls</Text>}
        ListEmptyComponent={<Text style={[styles.muted, { marginTop: 24 }]}>No calls yet.</Text>}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
          />
        }
        renderItem={({ item }) => <CallItem call={item} onPress={() => setSelected(item)} />}
      />
      <CallDetailModal call={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CallItem({ call, onPress }: { call: CallRow; onPress: () => void }) {
  const when = new Date(call.timestamp);
  const outcome = call.hotJob ? "Emergency" : call.booked ? "Booked" : call.outcome === "message" ? "Message" : "Call";
  const tone = call.hotJob ? "red" : call.booked ? "green" : "muted";
  return (
    <Pressable style={styles.callRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.callTitle}>{call.callerPhone ?? "Unknown caller"}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {call.service ?? call.intent ?? "—"}
          {call.recordingUrl ? "  🎧" : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Badge tone={tone as any}>{outcome}</Badge>
        <Text style={[styles.muted, { fontSize: 12, marginTop: 4 }]}>
          {when.toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
          {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
    </Pressable>
  );
}

function CallDetailModal({ call, onClose }: { call: CallRow | null; onClose: () => void }) {
  return (
    <Modal visible={!!call} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.modalHeader}>
          <Text style={styles.h2}>Call details</Text>
          <Pressable onPress={onClose}>
            <Text style={[styles.muted, { fontSize: 16 }]}>Done</Text>
          </Pressable>
        </View>
        {call && (
          <ScrollView contentContainerStyle={styles.body}>
            <DetailRow label="Caller" value={call.callerPhone ?? "Unknown"} />
            <DetailRow label="When" value={new Date(call.timestamp).toLocaleString()} />
            <DetailRow label="Outcome" value={call.hotJob ? "Emergency" : call.booked ? "Booked" : call.outcome ?? "—"} />
            {!!call.service && <DetailRow label="Service" value={call.service} />}
            {!!call.apptTime && <DetailRow label="Appointment" value={call.apptTime} />}
            {call.booked && <DetailRow label="Est. value" value={`$${call.estJobValue.toLocaleString()}`} />}
            <DetailRow label="Duration" value={`${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s`} />
            {call.recordingUrl ? (
              <RecordingPlayer url={call.recordingUrl} />
            ) : (
              <Text style={[styles.muted, { marginTop: 16 }]}>No recording available for this call.</Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function RecordingPlayer({ url }: { url: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  // Unload the sound when the player unmounts (modal closed).
  useEffect(() => {
    return () => {
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

  async function toggle() {
    try {
      if (!sound) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const created = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        created.sound.setOnPlaybackStatusUpdate((s) => {
          if ("didJustFinish" in s && s.didJustFinish) setPlaying(false);
        });
        setSound(created.sound);
        setPlaying(true);
        setLoading(false);
        return;
      }
      if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <Pressable style={[styles.btn, { marginTop: 20 }]} onPress={toggle} disabled={loading}>
      <Text style={styles.btnText}>{loading ? "Loading…" : playing ? "⏸  Pause recording" : "▶  Play recording"}</Text>
    </Pressable>
  );
}

function AppointmentsTab() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setAppts((await api.appointments()).appointments);
    } catch {
      /* keep prior */
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.body}
      data={appts}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={<Text style={styles.h2}>Upcoming appointments</Text>}
      ListEmptyComponent={<Text style={[styles.muted, { marginTop: 24 }]}>No upcoming appointments.</Text>}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
        />
      }
      renderItem={({ item }) => <AppointmentItem appt={item} />}
    />
  );
}

function AppointmentItem({ appt }: { appt: Appointment }) {
  const start = new Date(appt.startUtc);
  return (
    <View style={styles.callRow}>
      <View style={styles.apptDate}>
        <Text style={styles.apptMonth}>{start.toLocaleDateString([], { month: "short" }).toUpperCase()}</Text>
        <Text style={styles.apptDay}>{start.getDate()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.callTitle}>{appt.service ?? "Appointment"}</Text>
        <Text style={styles.muted}>
          {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {appt.customerName ? `  ·  ${appt.customerName}` : ""}
        </Text>
        {!!appt.customerPhone && <Text style={[styles.muted, { fontSize: 12 }]}>{appt.customerPhone}</Text>}
      </View>
    </View>
  );
}

function StatusPill({ status, number }: { status: string; number?: string }) {
  const live = status === "live";
  return (
    <View style={[styles.pill, { backgroundColor: live ? COLORS.greenBg : COLORS.amberBg }]}>
      <Text style={[styles.pillText, { color: live ? COLORS.green : COLORS.amber }]}>
        {live ? "● Live" : `● ${status}`}
        {number ? `  ·  ${number}` : ""}
      </Text>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={[styles.muted, { fontSize: 12 }]}>{sub}</Text>}
    </View>
  );
}

function Badge({ tone, children }: { tone: "red" | "green" | "muted"; children: React.ReactNode }) {
  const map = {
    red: { bg: COLORS.redBg, fg: COLORS.red },
    green: { bg: COLORS.greenBg, fg: COLORS.green },
    muted: { bg: "#eef2f7", fg: COLORS.muted },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: "center", justifyContent: "center" },
  body: { padding: 20, paddingBottom: 40, gap: 14 },

  loginWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  h1: { fontSize: 26, fontWeight: "800", color: COLORS.text, marginTop: 8 },
  h2: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  muted: { color: COLORS.muted, fontSize: 14 },
  linkCenter: { textAlign: "center", marginTop: 12 },

  formCard: { width: "100%", backgroundColor: COLORS.card, borderRadius: 16, padding: 18, marginTop: 20, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  label: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: "#fff" },
  codeInput: { textAlign: "center", letterSpacing: 8, fontSize: 24 },
  btn: { backgroundColor: COLORS.brand, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: COLORS.red, marginTop: 14, textAlign: "center" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 2 },

  pill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontWeight: "700", fontSize: 13 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { flexGrow: 1, flexBasis: "46%", backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 26, fontWeight: "800", color: COLORS.text },
  statLabel: { color: COLORS.text, fontWeight: "600", marginTop: 2 },

  callRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  callTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "700" },

  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabText: { color: COLORS.muted, fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: COLORS.brand },

  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 4 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  detailValue: { color: COLORS.text, fontWeight: "600", fontSize: 15, flexShrink: 1, textAlign: "right", marginLeft: 12 },

  apptDate: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  apptMonth: { color: COLORS.brand, fontWeight: "700", fontSize: 11 },
  apptDay: { color: COLORS.text, fontWeight: "800", fontSize: 20, lineHeight: 22 },
});
