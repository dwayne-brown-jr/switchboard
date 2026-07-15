import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import * as Notifications from "expo-notifications";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { api, clearToken, getToken, needsAttention, setToken, type Appointment, type CallDetail, type CallRow, type HomeResponse } from "./src/api";
import { CALLBACK_ACTION, registerForPush, registerNotificationActions, type PushData } from "./src/push";
import { COLORS } from "./src/config";

// --- Call back / text back ---------------------------------------------------
function callBack(phone: string) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
function textBack(phone: string) {
  Haptics.selectionAsync().catch(() => {});
  const body = encodeURIComponent("Hi, returning your call — how can we help?");
  // iOS wants `&body=`, Android `?body=`.
  Linking.openURL(Platform.OS === "ios" ? `sms:${phone}&body=${body}` : `sms:${phone}?body=${body}`).catch(() => {});
}

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
  // Deep link from a tapped push: jump to Calls and open that call's detail.
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  useEffect(() => {
    registerNotificationActions().catch(() => {});

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = (response.notification.request.content.data ?? {}) as PushData;
      // "Call back" button on the notification → dial straight away.
      if (response.actionIdentifier === CALLBACK_ACTION && data.callerPhone) {
        callBack(data.callerPhone);
      }
      if (data.callId) {
        setTab("calls");
        setOpenCallId(data.callId);
      }
    };

    // Cold start (app launched from the notification) + warm taps.
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.fill}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.fill} edges={["top"]}>
        {tab === "home" && <HomeTab onSignOut={onSignOut} />}
        {tab === "calls" && <CallsTab openCallId={openCallId} onOpenConsumed={() => setOpenCallId(null)} />}
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
function CallsTab({ openCallId, onOpenConsumed }: { openCallId: string | null; onOpenConsumed: () => void }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");

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

  // Deep link from a push: open that call as soon as we can resolve it.
  useEffect(() => {
    if (!openCallId || loading) return;
    onOpenConsumed();
    const inList = calls.find((c) => c.id === openCallId);
    if (inList) {
      setSelected(inList);
    } else {
      api.callDetail(openCallId).then(({ call }) => setSelected(call)).catch(() => {});
    }
  }, [openCallId, loading, calls, onOpenConsumed]);

  // Keep the list (and the open sheet) in sync when a call is marked handled.
  const patchCall = useCallback((id: string, patch: Partial<CallRow>) => {
    setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  if (loading) return <LoadingScreen />;

  const attentionCount = calls.filter(needsAttention).length;
  const shown = filter === "attention" ? calls.filter(needsAttention) : calls;

  return (
    <>
      <FlatList
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        data={shown}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <>
            <LargeTitle title="Calls" />
            <View style={styles.segmentWrap}>
              <SegmentButton label="All" active={filter === "all"} onPress={() => setFilter("all")} />
              <SegmentButton
                label={`Needs attention${attentionCount ? ` (${attentionCount})` : ""}`}
                active={filter === "attention"}
                onPress={() => setFilter("attention")}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          filter === "attention" ? (
            <EmptyState icon="checkmark-done-outline" text="All caught up — nothing needs a follow-up." />
          ) : (
            <EmptyState icon="call-outline" text="No calls yet. They'll appear here as they come in." />
          )
        }
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
      <CallDetailModal call={selected} onClose={() => setSelected(null)} onPatch={patchCall} />
    </>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {needsAttention(call) && <View style={styles.attentionDot} />}
          <Text style={styles.rowTitle}>{call.callerPhone ?? "Unknown caller"}</Text>
        </View>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {call.summary ?? call.service ?? call.intent ?? "—"}
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

function CallDetailModal({
  call,
  onClose,
  onPatch,
}: {
  call: CallRow | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<CallRow>) => void;
}) {
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [marking, setMarking] = useState(false);

  // The list payload omits the transcript — fetch the full record on open.
  useEffect(() => {
    setDetail(null);
    setShowTranscript(false);
    if (!call) return;
    api.callDetail(call.id).then(({ call: d }) => setDetail(d)).catch(() => {});
  }, [call?.id]);

  async function toggleHandled() {
    if (!call) return;
    const next = !call.handledAt;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMarking(true);
    try {
      const res = await api.markHandled(call.id, next);
      onPatch(call.id, { handledAt: res.handledAt });
    } catch {
      /* leave state as-is */
    } finally {
      setMarking(false);
    }
  }

  const summary = detail?.summary ?? call?.summary ?? null;
  const transcript = detail?.transcript ?? null;

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
            {/* Act first: get the owner back to the caller in one tap. */}
            {!!call.callerPhone && (
              <View style={styles.actionRow}>
                <Pressable style={[styles.primaryBtn, { flex: 1 }]} onPress={() => callBack(call.callerPhone!)}>
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Call back</Text>
                </Pressable>
                <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => textBack(call.callerPhone!)}>
                  <Ionicons name="chatbubble" size={18} color={COLORS.brand} />
                  <Text style={styles.secondaryBtnText}>Text back</Text>
                </Pressable>
              </View>
            )}

            {!!summary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryEyebrow}>WHAT HAPPENED</Text>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            )}

            <View style={styles.detailGroup}>
              <DetailRow label="Caller" value={call.callerPhone ?? "Unknown"} />
              <DetailRow label="When" value={new Date(call.timestamp).toLocaleString()} />
              <DetailRow label="Outcome" value={call.hotJob ? "Emergency" : call.booked ? "Booked" : call.outcome ?? "—"} />
              {!!call.service && <DetailRow label="Service" value={call.service} />}
              {!!call.apptTime && <DetailRow label="Appointment" value={call.apptTime} />}
              {call.booked && <DetailRow label="Est. value" value={`$${call.estJobValue.toLocaleString()}`} />}
              <DetailRow label="Duration" value={`${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s`} last />
            </View>

            {needsAttention(call) ? (
              <Pressable style={[styles.secondaryBtn, marking && styles.btnDisabled]} onPress={toggleHandled} disabled={marking}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.brand} />
                <Text style={styles.secondaryBtnText}>{marking ? "Saving…" : "Mark handled"}</Text>
              </Pressable>
            ) : call.handledAt ? (
              <Pressable onPress={toggleHandled} disabled={marking} hitSlop={8}>
                <Text style={[styles.secondaryText, { textAlign: "center" }]}>
                  Handled ✓{"  "}
                  <Text style={styles.linkText}>{marking ? "Saving…" : "Undo"}</Text>
                </Text>
              </Pressable>
            ) : null}

            {!!transcript && (
              <View style={styles.card}>
                <Pressable style={styles.rowBetween} onPress={() => setShowTranscript((s) => !s)} hitSlop={8}>
                  <Text style={styles.cardTitle}>Transcript</Text>
                  <Ionicons name={showTranscript ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} />
                </Pressable>
                {showTranscript && <Text style={[styles.secondaryText, { marginTop: 10 }]}>{transcript}</Text>}
              </View>
            )}

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
  const [blocking, setBlocking] = useState(false);

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

  function actionsFor(appt: Appointment) {
    const isBlock = appt.source === "owner_block";
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      isBlock ? "Blocked time" : appt.service ?? "Appointment",
      `${new Date(appt.startUtc).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${appt.customerName ? ` · ${appt.customerName}` : ""}`,
      [
        ...(appt.customerPhone ? [{ text: "Call customer", onPress: () => callBack(appt.customerPhone!) }] : []),
        {
          text: isBlock ? "Remove block" : "Cancel appointment",
          style: "destructive" as const,
          onPress: async () => {
            try {
              await api.cancelAppointment(appt.id);
              await load();
            } catch (e: any) {
              Alert.alert("Couldn't cancel", e.message ?? "Please try again.");
            }
          },
        },
        { text: "Close", style: "cancel" as const },
      ],
    );
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <FlatList
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        data={appts}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={
          <LargeTitle
            title="Appointments"
            right={
              <Pressable onPress={() => setBlocking(true)} hitSlop={8} style={styles.blockBtn}>
                <Ionicons name="remove-circle-outline" size={16} color={COLORS.brand} />
                <Text style={styles.linkText}>Block time</Text>
              </Pressable>
            }
          />
        }
        ListEmptyComponent={<EmptyState icon="calendar-outline" text="No upcoming appointments. New bookings land here." />}
        refreshControl={<Refresh refreshing={refreshing} setRefreshing={setRefreshing} load={load} />}
        renderItem={({ item }) => <AppointmentItem appt={item} onPress={() => actionsFor(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
      <BlockTimeSheet
        visible={blocking}
        onClose={() => setBlocking(false)}
        onCreated={() => {
          setBlocking(false);
          load();
        }}
      />
    </>
  );
}

function AppointmentItem({ appt, onPress }: { appt: Appointment; onPress: () => void }) {
  const start = new Date(appt.startUtc);
  const isBlock = appt.source === "owner_block";
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={[styles.apptDate, isBlock && { backgroundColor: COLORS.bg }]}>
        {isBlock ? (
          <Ionicons name="lock-closed" size={20} color={COLORS.muted} />
        ) : (
          <>
            <Text style={styles.apptMonth}>{start.toLocaleDateString([], { month: "short" }).toUpperCase()}</Text>
            <Text style={styles.apptDay}>{start.getDate()}</Text>
          </>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, isBlock && { color: COLORS.secondary }]}>{isBlock ? appt.service ?? "Blocked off" : appt.service ?? "Appointment"}</Text>
        <Text style={styles.secondaryText}>
          {isBlock ? `${start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ` : ""}
          {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {" – "}
          {new Date(appt.endUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {appt.customerName ? `  ·  ${appt.customerName}` : ""}
        </Text>
        {!!appt.customerPhone && <Text style={styles.timeText}>{appt.customerPhone}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.faint} />
    </Pressable>
  );
}

// Block off time without any native picker dependency: day chips + start-time
// chips + duration chips. Times are built in the device's timezone (the owner
// carries the shop's timezone in their pocket).
function BlockTimeSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [startHour, setStartHour] = useState(12);
  const [durationH, setDurationH] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am–7pm
  const durations = [
    { label: "1 hr", h: 1 },
    { label: "2 hrs", h: 2 },
    { label: "Half day", h: 4 },
    { label: "Rest of day", h: -1 },
  ];

  async function save() {
    setError("");
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start);
    if (durationH === -1) {
      end.setHours(23, 59, 0, 0);
    } else {
      end.setHours(start.getHours() + durationH);
    }
    if (end <= new Date()) {
      setError("That time is already past — pick a later start.");
      return;
    }
    setBusy(true);
    try {
      await api.createBlock(start.toISOString(), end.toISOString());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Couldn't block that time.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: COLORS.bg }]}>
        <View style={styles.sheetGrabberWrap}>
          <View style={styles.sheetGrabber} />
        </View>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Block off time</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.secondaryText}>Your receptionist will stop offering these times to callers.</Text>

          <View>
            <Text style={styles.fieldLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {days.map((d, i) => (
                <Chip
                  key={i}
                  label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  active={dayOffset === i}
                  onPress={() => setDayOffset(i)}
                />
              ))}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.fieldLabel}>Starting at</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {hours.map((h) => (
                <Chip
                  key={h}
                  label={new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}
                  active={startHour === h}
                  onPress={() => setStartHour(h)}
                />
              ))}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.fieldLabel}>For</Text>
            <View style={[styles.chipRow, { flexWrap: "wrap" }]}>
              {durations.map((d) => (
                <Chip key={d.label} label={d.label} active={durationH === d.h} onPress={() => setDurationH(d.h)} />
              ))}
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton label={busy ? "Blocking…" : "Block this time"} onPress={save} disabled={busy} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
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
  secondaryBtn: { backgroundColor: COLORS.brandTint, borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryBtnText: { color: COLORS.brand, fontWeight: "700", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  actionRow: { flexDirection: "row", gap: 10 },

  // Needs-attention
  attentionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.amber },
  segmentWrap: { flexDirection: "row", gap: 8, marginBottom: 4 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.card, ...CARD_SHADOW },
  segmentBtnActive: { backgroundColor: COLORS.brand },
  segmentText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  segmentTextActive: { color: "#fff" },

  // Summary card
  summaryCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 6, ...CARD_SHADOW },
  summaryEyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  summaryText: { color: COLORS.text, fontSize: 15, lineHeight: 21 },

  // Block-time sheet
  blockBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 13.5, fontWeight: "600", color: COLORS.secondary },
  chipTextActive: { color: "#fff" },

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
