import { TallyScreen } from "./components/TallyScreen";
import { HerdProvider } from "./hooks/useHerd";

export function App({
  offlineReady,
  onOfflineReady,
}: {
  offlineReady: boolean;
  onOfflineReady: () => void;
}) {
  return (
    <HerdProvider>
      <TallyScreen offlineReady={offlineReady} onOfflineReady={onOfflineReady} />
    </HerdProvider>
  );
}
