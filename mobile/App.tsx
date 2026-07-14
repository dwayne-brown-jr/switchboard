import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { api, clearToken, getToken, setToken, type Appointment, type CallRow, type HomeResponse } from "./src/api";
import { registerForPush } from "./src/push";
import { COLORS } from "./src/config";

type Screen = "loading" | "login" | "app";
type Tab = "home" | "calls" | "appointments";

const TAB_BAR_HEIGHT = 88; // approx; content pads past it so the blur overlays

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    getToken().then((t) => setScreen(t ? "app" : "login"));
  }, []);

  const onSignedIn = useCallback(async (token: string) => {
    await setToken(token);
    registerForPush()
      .then((pt) => pt && api.registerPush(pt, Platform.OS).catch(() => {}))
      .catch(() => {});
    setScreen("app");
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
  return <Main onSignOut={onSignOut} />;
}

// ---------------------------------------------------------------------------
// Login
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSignedIn(token);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Ionicons name="call" size={30} color="#fff" />
          </View>
          <Text style={styles.loginTitle}>Switchboard</Text>
          <Text style={styles.secondaryText}>Your receptionist, in your pocket.</Text>

          <View style={styles.formCard}>
            {step === "email" ? (
              <>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@business.com"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="go"
                  onSubmitEditing={() => email && sendCode()}
                />
                <PrimaryButton label={busy ? "Sending…" : "Send me a code"} onPress={sendCode} disabled={busy || !email} />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Enter the code sent to {email}</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor={COLORS.faint}
                  autoFocus
                />
                <PrimaryButton label={busy ? "Verifying…" : "Sign in"} onPress={verify} disabled={busy || code.length < 6} />
                <Pressable onPress={() => { setStep("email"); setCode(""); setError(""); }} hitSlop={8}>
                  <Text style={styles.linkCenter}>Use a different email</Text>
                </Pressable>
              </>
            )}
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main shell — screens + translucent tab bar
// ---------------------------------------------------------------------------
function Main({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <View style={styles.fill}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.fill} edges={["top"]}>
        {tab === "home" && <HomeTab onSignOut={onSignOut} />}
        {tab === "calls" && <CallsTab />}
        {tab === "appointments" && <AppointmentsTab />}
      </SafeAreaView>
      <TabBar current={tab} onSelect={setTab} />
    </View>
  );
}

function TabBar({ current, onSelect }: { current: Tab; onSelect: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; outline: keyof typeof Ionicons.glyphMap }[] = [
    { key: "home", label: "Home", icon: "home", outline: "home-outline" },
    { key: "calls", label: "Calls", icon: "call", outline: "call-outline" },
    { key: "appointments", label: "Appointments", icon: "calendar", outline: "calendar-outline" },
  ];
  return (
    <BlurView intensity={80} tint="light" style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((t) => {
        const active = current === t.key;
        const color = active ? COLORS.brand : COLORS.muted;
        return (
          <Pressable
            key={t.key}
            style={styles.tabBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelect(t.key);
            }}
          >
            <Ionicons name={active ? t.icon : t.outline} size={25} color={color} />
            <Text style={[styles.tabLabel, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </BlurView>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function HomeTab({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pausing, setPausing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.home());
    } catch {
      /* keep prior data */
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function togglePause(next: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPausing(true);
    try {
      await api.setPaused(next);
      await load();
    } finally {
      setPausing(false);
    }
  }

  if (loading) return <LoadingScreen />;

  const shop = data?.shop;
  const stats = data?.stats;
  const paused = shop?.paused ?? false;
  const planPrice = data?.planPrice ?? 149;

  const revenue = stats?.revenueBooked ?? 0;
  const calls = stats?.callsAnswered ?? 0;
  const afterHours = stats?.afterHours ?? 0;
  const emergencies = stats?.hotJobs ?? 0;
  const multiple = revenue > 0 && planPrice > 0 ? Math.round(revenue / planPrice) : 0;

  // Pausing is the destructive action — frame it as a loss. Resuming stays a
  // single frictionless tap.
  function requestPause() {
    Alert.alert(
      "Pause your receptionist?",
      `In the last 30 days it booked $${revenue.toLocaleString()} and caught ${emergencies} emergenc${emergencies === 1 ? "y" : "ies"}. While it's paused, every call goes to voicemail.`,
      [
        { text: "Keep it on", style: "cancel" },
        { text: "Pause anyway", style: "destructive", onPress: () => togglePause(true) },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      refreshControl={<Refresh refreshing={refreshing} setRefreshing={setRefreshing} load={load} />}
    >
      <LargeTitle
        title={shop?.businessName ?? "Your shop"}
        right={
          <Pressable onPress={onSignOut} hitSlop={8}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        }
      />

      <StatusPill status={paused ? "paused" : shop?.status ?? "—"} number={shop?.agentNumber ?? undefined} />

      {/* Value hero — lead with impact (loss aversion + plan anchor). */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>LAST 30 DAYS</Text>
        {calls === 0 ? (
          <>
            <Text style={styles.heroValue}>On the clock</Text>
            <Text style={styles.heroLabel}>Answering every call, 24/7 — your first booking shows up here.</Text>
          </>
        ) : revenue > 0 ? (
          <>
            <Text style={styles.heroValue}>${revenue.toLocaleString()}</Text>
            <Text style={styles.heroLabel}>booked while you worked</Text>
            {afterHours > 0 && (
              <Text style={styles.heroLine}>{`${afterHours} call${afterHours === 1 ? "" : "s"} came in after hours — every one would've gone to voicemail.`}</Text>
            )}
            {multiple >= 2 && (
              <View style={styles.heroChip}>
                <Ionicons name="trending-up" size={14} color="#fff" />
                <Text style={styles.heroChipText}>{`${multiple}× your $${planPrice} plan`}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.heroValue}>{calls}</Text>
            <Text style={styles.heroLabel}>{`call${calls === 1 ? "" : "s"} answered while you worked`}</Text>
            {afterHours > 0 && (
              <Text style={styles.heroLine}>{`${afterHours} came in after hours — every one would've gone to voicemail.`}</Text>
            )}
          </>
        )}
      </View>

      {/* Pause card */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.iconLeft}>
            <View style={[styles.iconBadge, { backgroundColor: paused ? COLORS.amberBg : COLORS.greenBg }]}>
              <Ionicons name={paused ? "pause" : "checkmark"} size={18} color={paused ? COLORS.amber : COLORS.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{paused ? "Receptionist paused" : "Receptionist is answering"}</Text>
              <Text style={styles.secondaryText}>
                {paused ? "Calls are going to voicemail right now." : "Answering your calls right now."}
              </Text>
            </View>
          </View>
          <Switch
            value={!paused}
            disabled={pausing}
            trackColor={{ true: COLORS.brand, false: COLORS.faint }}
            onValueChange={(v) => (v ? togglePause(false) : requestPause())}
          />
        </View>
      </View>

      <View style={styles.grid}>
        <Stat icon="call-outline" label="Calls answered" value={calls} sub={`${afterHours} after hours`} />
        <Stat icon="calendar-outline" label="Jobs booked" value={stats?.jobsBooked ?? 0} sub={`${stats?.messages ?? 0} messages`} />
        <Stat icon="shield-checkmark-outline" label="Saved from voicemail" value={stats?.recovered ?? 0} sub="recovered calls" />
        <Stat icon="warning-outline" label="Emergencies caught" value={emergencies} sub="flagged to you" />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
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

  if (loading) return <LoadingScreen />;

  return (
    <>
      <FlatList
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        data={calls}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<LargeTitle title="Calls" />}
        ListEmptyComponent={<EmptyState icon="call-outline" text="No calls yet. They'll appear here as they come in." />}
        refreshControl={<Refresh refreshing={refreshing} setRefreshing={setRefreshing} load={load} />}
        renderItem={({ item }) => (
          <CallItem
            call={item}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSelected(item);
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
      <CallDetailModal call={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CallItem({ call, onPress }: { call: CallRow; onPress: () => void }) {
  const when = new Date(call.timestamp);
  const outcome = call.hotJob ? "Emergency" : call.booked ? "Booked" : call.outcome === "message" ? "Message" : "Call";
  const tone = call.hotJob ? "red" : call.booked ? "green" : "muted";
  const icon = call.hotJob ? "warning" : call.booked ? "checkmark-circle" : "call";
  const iconColor = call.hotJob ? COLORS.red : call.booked ? COLORS.green : COLORS.muted;
  const iconBg = call.hotJob ? COLORS.redBg : call.booked ? COLORS.greenBg : COLORS.bg;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{call.callerPhone ?? "Unknown caller"}</Text>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {call.service ?? call.intent ?? "—"}
          {call.recordingUrl ? "  ·  recording" : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Badge tone={tone as any}>{outcome}</Badge>
        <Text style={styles.timeText}>
          {when.toLocaleDateString([], { month: "short", day: "numeric" })} {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.faint} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

function CallDetailModal({ call, onClose }: { call: CallRow | null; onClose: () => void }) {
  return (
    <Modal visible={!!call} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: COLORS.bg }]}>
        <View style={styles.sheetGrabberWrap}>
          <View style={styles.sheetGrabber} />
        </View>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Call details</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.linkText}>Done</Text>
          </Pressable>
        </View>
        {call && (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailGroup}>
              <DetailRow label="Caller" value={call.callerPhone ?? "Unknown"} />
              <DetailRow label="When" value={new Date(call.timestamp).toLocaleString()} />
              <DetailRow label="Outcome" value={call.hotJob ? "Emergency" : call.booked ? "Booked" : call.outcome ?? "—"} />
              {!!call.service && <DetailRow label="Service" value={call.service} />}
              {!!call.apptTime && <DetailRow label="Appointment" value={call.apptTime} />}
              {call.booked && <DetailRow label="Est. value" value={`$${call.estJobValue.toLocaleString()}`} />}
              <DetailRow label="Duration" value={`${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s`} last />
            </View>
            {call.recordingUrl ? (
              <RecordingPlayer url={call.recordingUrl} />
            ) : (
              <Text style={[styles.secondaryText, { marginTop: 8, textAlign: "center" }]}>No recording available for this call.</Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.secondaryText}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function RecordingPlayer({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const playing = status.playing;
  const ready = status.isLoaded;

  function toggle() {
    Haptics.selectionAsync().catch(() => {});
    if (playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) player.seekTo(0);
      player.play();
    }
  }

  return (
    <Pressable style={[styles.primaryBtn, { marginTop: 16 }]} onPress={toggle} disabled={!ready}>
      <Ionicons name={!ready ? "hourglass-outline" : playing ? "pause" : "play"} size={18} color="#fff" />
      <Text style={styles.primaryBtnText}>{!ready ? "Loading…" : playing ? "Pause recording" : "Play recording"}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
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

  if (loading) return <LoadingScreen />;

  return (
    <FlatList
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      data={appts}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={<LargeTitle title="Appointments" />}
      ListEmptyComponent={<EmptyState icon="calendar-outline" text="No upcoming appointments. New bookings land here." />}
      refreshControl={<Refresh refreshing={refreshing} setRefreshing={setRefreshing} load={load} />}
      renderItem={({ item }) => <AppointmentItem appt={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  );
}

function AppointmentItem({ appt }: { appt: Appointment }) {
  const start = new Date(appt.startUtc);
  return (
    <View style={styles.row}>
      <View style={styles.apptDate}>
        <Text style={styles.apptMonth}>{start.toLocaleDateString([], { month: "short" }).toUpperCase()}</Text>
        <Text style={styles.apptDay}>{start.getDate()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{appt.service ?? "Appointment"}</Text>
        <Text style={styles.secondaryText}>
          {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {appt.customerName ? `  ·  ${appt.customerName}` : ""}
        </Text>
        {!!appt.customerPhone && <Text style={styles.timeText}>{appt.customerPhone}</Text>}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.largeTitleRow}>
      <Text style={styles.largeTitle} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={[styles.fill, styles.center]}>
      <ActivityIndicator color={COLORS.brand} />
    </View>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={COLORS.faint} />
      <Text style={[styles.secondaryText, { textAlign: "center", marginTop: 12, maxWidth: 260 }]}>{text}</Text>
    </View>
  );
}

function Refresh({ refreshing, setRefreshing, load }: { refreshing: boolean; setRefreshing: (b: boolean) => void; load: () => Promise<void> }) {
  return (
    <RefreshControl
      tintColor={COLORS.muted}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load().finally(() => setRefreshing(false));
      }}
    />
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.primaryBtn, disabled && styles.btnDisabled, pressed && !disabled && { opacity: 0.85 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ status, number }: { status: string; number?: string }) {
  const live = status === "live";
  return (
    <View style={[styles.pill, { backgroundColor: live ? COLORS.greenBg : COLORS.amberBg }]}>
      <View style={[styles.pillDot, { backgroundColor: live ? COLORS.green : COLORS.amber }]} />
      <Text style={[styles.pillText, { color: live ? COLORS.green : COLORS.amber }]}>
        {live ? "Live" : status}
        {number ? `  ·  ${number}` : ""}
      </Text>
    </View>
  );
}

function Stat({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={COLORS.muted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={styles.timeText}>{sub}</Text>}
    </View>
  );
}

function Badge({ tone, children }: { tone: "red" | "green" | "muted"; children: React.ReactNode }) {
  const map = {
    red: { bg: COLORS.redBg, fg: COLORS.red },
    green: { bg: COLORS.greenBg, fg: COLORS.green },
    muted: { bg: COLORS.bg, fg: COLORS.secondary },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.04,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: "center", justifyContent: "center" },
  body: { padding: 20, paddingBottom: TAB_BAR_HEIGHT + 32, gap: 16 },

  // Large title
  largeTitleRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4, marginTop: 4 },
  largeTitle: { fontSize: 34, fontWeight: "800", color: COLORS.text, letterSpacing: 0.3, flex: 1 },

  // Text
  secondaryText: { color: COLORS.secondary, fontSize: 14, lineHeight: 19 },
  timeText: { color: COLORS.muted, fontSize: 12 },
  linkText: { color: COLORS.brand, fontSize: 15, fontWeight: "600" },
  linkCenter: { color: COLORS.brand, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 16 },
  error: { color: COLORS.red, marginTop: 16, textAlign: "center", fontSize: 14 },

  // Login
  loginWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 6 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center", ...CARD_SHADOW },
  loginTitle: { fontSize: 30, fontWeight: "800", color: COLORS.text, marginTop: 14 },
  formCard: { width: "100%", backgroundColor: COLORS.card, borderRadius: 18, padding: 20, marginTop: 24, gap: 12, ...CARD_SHADOW },
  fieldLabel: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: COLORS.text, backgroundColor: "#fff" },
  codeInput: { textAlign: "center", letterSpacing: 10, fontSize: 26, fontWeight: "700" },

  // Buttons
  primaryBtn: { backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },

  // Cards / rows
  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 18, ...CARD_SHADOW },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 12 },
  iconBadge: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  row: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 12, ...CARD_SHADOW },
  rowPressed: { backgroundColor: "#FAFAFB" },
  rowTitle: { fontSize: 15.5, fontWeight: "700", color: COLORS.text },

  // Status pill
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, gap: 7 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontWeight: "700", fontSize: 13 },

  // Hero
  hero: { backgroundColor: COLORS.brand, borderRadius: 22, padding: 22, ...CARD_SHADOW, shadowOpacity: 0.18, shadowColor: COLORS.brand },
  heroEyebrow: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700", letterSpacing: 1.4 },
  heroValue: { color: "#fff", fontSize: 42, fontWeight: "800", marginTop: 8, letterSpacing: -0.5 },
  heroLabel: { color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: "600", marginTop: 2 },
  heroLine: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20, marginTop: 14 },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 16 },
  heroChipText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Stat grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { flexGrow: 1, flexBasis: "46%", backgroundColor: COLORS.card, borderRadius: 18, padding: 16, gap: 4, ...CARD_SHADOW },
  statValue: { fontSize: 26, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  statLabel: { color: COLORS.text, fontWeight: "600", fontSize: 14 },

  // Badge
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "700" },

  // Empty
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 60 },

  // Tab bar
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  tabBtn: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 10.5, fontWeight: "600" },

  // Detail sheet
  sheetGrabberWrap: { alignItems: "center", paddingTop: 8 },
  sheetGrabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: COLORS.faint },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  detailGroup: { backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 16, ...CARD_SHADOW },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  detailValue: { color: COLORS.text, fontWeight: "600", fontSize: 15, flexShrink: 1, textAlign: "right", marginLeft: 12 },

  // Appointment date chip
  apptDate: { width: 52, height: 52, borderRadius: 13, backgroundColor: COLORS.brandTint, alignItems: "center", justifyContent: "center" },
  apptMonth: { color: COLORS.brand, fontWeight: "800", fontSize: 11 },
  apptDay: { color: COLORS.text, fontWeight: "800", fontSize: 20, lineHeight: 22 },
});
