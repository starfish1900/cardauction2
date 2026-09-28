import { actionId, digitId, type Suit } from '@cardauction/engine';
import { Card } from './cards/Card';

/** Every face at two sizes, for checking the drawings (open the app with ?gallery). */
export function Gallery() {
  const suits: Suit[] = [0, 1, 2, 3, 4];
  return (
    <div style={{ padding: 24, display: 'grid', gap: 18 }}>
      {suits.map((suit) => (
        <div key={suit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Array.from({ length: 10 }, (_, rank) => (
            <Card key={rank} id={digitId(suit, rank)} width={96} />
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Card id={actionId()} width={96} />
        <Card id={null} width={96} />
        <Card id={digitId(3, 7)} width={96} mark="selected" />
        <Card id={digitId(1, 4)} width={96} mark="playable" />
        <Card id={digitId(2, 2)} width={96} mark="dim" />
        {suits.map((suit) => (
          <Card key={suit} id={digitId(suit, (suit * 2 + 1) % 10)} width={46} />
        ))}
        <Card id={actionId()} width={46} />
        <Card id={digitId(4, 6)} width={46} />
        <Card id={digitId(0, 9)} width={46} />
      </div>
    </div>
  );
}
