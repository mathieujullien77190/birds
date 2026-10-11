import { CameraCard } from '@/components/CameraCard';
import { Header } from '@/components/Header';
import { NestCard } from '@/components/NestCard';
import { PeltierCard } from '@/components/PeltierCard';
import { BatteryCard } from '@/components/BatteryCard';
import { ConsumptionCard } from '@/components/ConsumptionCard';
import { useDeviceState } from '@/hooks';

export function App() {
  const { state, unreachable, peltier, led, camera } = useDeviceState();
  return (
    <>
      <Header state={state} unreachable={unreachable} />
      <div className="grid">
        <NestCard state={state} />
        <PeltierCard state={state} onCommand={peltier} />
        <BatteryCard state={state} />
        <ConsumptionCard state={state} />
        <CameraCard title="Caméra 1 (nid)" num={1} cameraOn={!!state?.cam1} ledOn={!!state?.led_nid} errors={state?.erreurs}
          onCamera={(on) => camera(0, on)} onLed={(on) => led('nid', on)} />
        <CameraCard title="Caméra 2 (entrée)" num={2} cameraOn={!!state?.cam2} ledOn={!!state?.led_ext} errors={state?.erreurs}
          onCamera={(on) => camera(1, on)} onLed={(on) => led('ext', on)} />
      </div>
    </>
  );
}
