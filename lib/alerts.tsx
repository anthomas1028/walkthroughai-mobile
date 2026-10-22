import { useEffect, useState } from "react";
import { Alert as NativeAlert, Modal, Platform, Pressable, Text, View } from "react-native";

type Button = { text?: string; style?: string; onPress?: () => void };
type Notice = { title: string; message?: string; buttons: Button[] };
const queue: Notice[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }
export const Alert = {
  alert(title: string, message?: string, buttons?: Button[], options?: any) {
    if (Platform.OS !== "web") return NativeAlert.alert(title, message, buttons as any, options);
    queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }] });
    emit();
  },
};
export function AlertHost() {
  const [, update] = useState(0);
  useEffect(() => { const fn = () => update(x => x + 1); listeners.add(fn); fn(); return () => { listeners.delete(fn); }; }, []);
  const notice = queue[0];
  function choose(button: Button) { queue.shift(); emit(); button.onPress?.(); }
  return <Modal transparent visible={Boolean(notice)} animationType="fade" onRequestClose={() => { const cancel = notice?.buttons.find(b => b.style === "cancel"); if (cancel) choose(cancel); }}>
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.7)", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View accessibilityViewIsModal accessibilityRole="alert" style={{ width: "100%", maxWidth: 460, backgroundColor: "#142238", borderWidth: 1, borderColor: "#395373", borderRadius: 20, padding: 24 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 21 }}>{notice?.title}</Text>
        <Text style={{ color: "#c5d2e3", lineHeight: 23, marginTop: 12 }}>{notice?.message}</Text>
        <View style={{ gap: 10, marginTop: 24 }}>{notice?.buttons.map((button, i) => <Pressable key={i} accessibilityRole="button" onPress={() => choose(button)} style={{ padding: 14, minHeight: 48, borderRadius: 12, backgroundColor: button.style === "destructive" ? "#9f2636" : button.style === "cancel" ? "#26374e" : "#245bc2" }}><Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>{button.text || "OK"}</Text></Pressable>)}</View>
      </View>
    </View>
  </Modal>;
}
