import { AnimatePresence, motion } from 'motion/react';
import { GameScreen } from './game/GameScreen';
import { Home } from './screens/Home';
import { Rules } from './screens/Rules';
import { Host, Queue } from './screens/Waiting';
import { ConnectionBanner, Header, ReplacedOverlay, Toasts, useBaseScreen } from './ui/Chrome';

export function App() {
  const base = useBaseScreen();
  return (
    <div className="app">
      <Header />
      <ConnectionBanner />
      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={base}
            className={`page page--${base}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {base === 'home' && <Home />}
            {base === 'queue' && <Queue />}
            {base === 'host' && <Host />}
            {base === 'game' && <GameScreen />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Rules />
      <Toasts />
      <ReplacedOverlay />
    </div>
  );
}
