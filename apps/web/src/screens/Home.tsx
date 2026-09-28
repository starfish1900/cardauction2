import { actionId, digitId, type CardId } from '@cardauction/engine';
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  PRIVATE_CODE_ALPHABET,
  PRIVATE_CODE_LENGTH,
  type AiLevel,
} from '@cardauction/protocol';
import { motion, type Variants } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../cards/Card';
import { api } from '../net/connection';
import { actions, useStore } from '../state/store';
import { Dots, Segmented } from '../ui/controls';

type SeatChoice = 'P1' | 'P2' | 'random';

const HERO: readonly CardId[] = [
  digitId(0, 7),
  digitId(1, 3),
  actionId(0),
  digitId(3, 9),
  digitId(4, 5),
];

const list: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
};

/** What the server accepts as a nickname, checked here first so the Save button can say so. */
export function cleanNickname(raw: string): string | null {
  const text = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = [...text].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} _\-'.]+$/u.test(text) || !/[\p{L}\p{N}]/u.test(text)) return null;
  return text;
}

export function cleanCode(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((ch) => PRIVATE_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, PRIVATE_CODE_LENGTH);
}

export function Home() {
  const { t } = useTranslation();
  const me = useStore((s) => s.me);
  const online = useStore((s) => s.connection === 'online');
  const [draft, setDraft] = useState<string | null>(null);
  const [level, setLevel] = useState<AiLevel>('medium');
  const [seat, setSeat] = useState<SeatChoice>('random');
  const invited = useStore((s) => s.joinCode);
  const [typed, setCode] = useState<string | null>(null);
  const code = typed ?? invited ?? '';
  const [busy, setBusy] = useState<string | null>(null);

  const current = me?.nickname ?? '';
  const name = draft ?? current;
  const clean = cleanNickname(name);
  const nameChanged = draft !== null && clean !== null && clean !== current;

  /** Saves a changed name first, so the opponent sees the name that was typed. */
  const run = async (key: string, task: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    try {
      if (nameChanged && clean) {
        if (!(await api.setNickname(clean))) return;
        setDraft(null);
      }
      await task();
    } finally {
      setBusy(null);
    }
  };

  const saveName = (event: FormEvent): void => {
    event.preventDefault();
    if (nameChanged) void run('name', () => Promise.resolve());
  };

  const join = (event: FormEvent): void => {
    event.preventDefault();
    if (code.length === PRIVATE_CODE_LENGTH) void run('join', () => api.joinPrivate(code));
  };

  const disabled = !online || busy !== null;

  return (
    <div className="screen home" data-testid="home">
      <header className="hero">
        <HeroFan />
        <h1 className="wordmark">{t('app.title')}</h1>
        <p className="tagline">{t('app.tagline')}</p>
      </header>

      {!online && (
        <p className="connecting" role="status">
          <Dots />
          {t('home.connecting')}
        </p>
      )}

      <motion.div className="home-grid" variants={list} initial="hidden" animate="shown">
        <motion.section className="panel home-card home-card--play" variants={item}>
          <form className="name-field" onSubmit={saveName}>
            <label className="field-label" htmlFor="nickname">
              {t('home.nickname')}
            </label>
            <div className="input-row">
              <input
                id="nickname"
                className="input"
                value={name}
                maxLength={24}
                autoComplete="nickname"
                spellCheck={false}
                aria-invalid={draft !== null && clean === null}
                aria-describedby="nickname-hint"
                onChange={(event) => setDraft(event.target.value)}
                data-testid="nickname"
              />
              {nameChanged && (
                <button type="submit" className="btn" disabled={disabled}>
                  {t('home.save')}
                </button>
              )}
            </div>
            <span
              id="nickname-hint"
              className={`hint ${draft !== null && clean === null ? 'hint--error' : ''}`}
            >
              {t('home.nicknameHint')}
            </span>
          </form>
          <div className="quick">
            <h2>{t('home.quick')}</h2>
            <p className="hint">{t('home.quickHint')}</p>
            <button
              type="button"
              className="btn btn--primary btn--big"
              disabled={disabled}
              onClick={() => void run('quick', () => api.quickJoin())}
              data-testid="quick"
            >
              {busy === 'quick' ? <Dots /> : t('home.quickButton')}
            </button>
          </div>
        </motion.section>

        <motion.section className="panel home-card home-card--ai" variants={item}>
          <h2>{t('home.ai')}</h2>
          <p className="hint">{t('home.aiHint')}</p>
          <Segmented
            label={t('home.levelLabel')}
            value={level}
            onChange={setLevel}
            options={[
              { value: 'easy', label: t('home.level.easy') },
              { value: 'medium', label: t('home.level.medium') },
              { value: 'hard', label: t('home.level.hard') },
            ]}
          />
          <Segmented
            label={t('home.seatLabel')}
            value={seat}
            onChange={setSeat}
            options={[
              { value: 'P1', label: t('home.seat.P1') },
              { value: 'P2', label: t('home.seat.P2') },
              { value: 'random', label: t('home.seat.random') },
            ]}
          />
          <p className="hint">{t('home.seatHint')}</p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={disabled}
            onClick={() => void run('ai', () => api.aiStart(level, seat))}
            data-testid="ai-start"
          >
            {busy === 'ai' ? <Dots /> : t('home.start')}
          </button>
          <p className="note">
            {t(`home.aiNote.${level}`)} {t('home.aiFair')}
          </p>
        </motion.section>

        <motion.section className="panel home-card home-card--private" variants={item}>
          <h2>{t('home.private')}</h2>
          <p className="hint">{t('home.privateHint')}</p>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => void run('create', () => api.createPrivate())}
            data-testid="create-code"
          >
            {busy === 'create' ? <Dots /> : t('home.create')}
          </button>
          <div className="or">
            <span>{t('home.or')}</span>
          </div>
          <form className="input-row" onSubmit={join}>
            <input
              className="input input--code"
              value={code}
              placeholder={t('home.codePlaceholder')}
              aria-label={t('home.code')}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              onChange={(event) => setCode(cleanCode(event.target.value))}
              data-testid="code-input"
            />
            <button
              type="submit"
              className="btn"
              disabled={disabled || code.length !== PRIVATE_CODE_LENGTH}
              data-testid="join"
            >
              {t('home.join')}
            </button>
          </form>
        </motion.section>
      </motion.div>

      <button type="button" className="link-btn" onClick={() => actions.show('rules')}>
        {t('home.rules')} →
      </button>
    </div>
  );
}

/** Five cards fanned out above the title, breathing slowly. */
function HeroFan() {
  const n = HERO.length;
  return (
    <div className="hero-fan" aria-hidden="true">
      {HERO.map((id, i) => {
        const offset = i - (n - 1) / 2;
        const angle = offset * 12;
        return (
          <motion.div
            key={id}
            className="hero-card"
            style={{ originY: 1 }}
            initial={{ opacity: 0, x: 0, y: 30, rotate: 0 }}
            animate={{ opacity: 1, x: offset * 34, y: Math.abs(offset) * 7, rotate: angle }}
            transition={{ type: 'spring', stiffness: 140, damping: 15, delay: 0.1 + i * 0.06 }}
          >
            <Card id={id} width={58} compact={false} />
          </motion.div>
        );
      })}
    </div>
  );
}
