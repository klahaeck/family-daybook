import { useRouter } from "expo-router";
import { View } from "react-native";
import { ActionButton } from "@/components/ui";

export function RecordBackButton() {
  const router = useRouter();
  return (
    <View style={{ alignItems: "flex-start" }}>
      <ActionButton compact secondary icon="arrow-back" label="Back" onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/timeline");
      }} />
    </View>
  );
}
