"""
The narration of the CardAuction tutorial: one list of scenes, each a list of segments.

A segment is synthesized as one clip. `text` is what the subtitles show (digits for numbers);
`say` overrides what the voice reads when the automatic conversion is not enough. `id` names a
segment so the animation can start something when it is spoken. `gap` is the pause after it.

Run `python3 script/script.py` to write script.json (read by the voice and the animation).
"""
import json, os, re

S = []  # scenes


def scene(sid, title, *segs, hold=0.0):
    S.append({"id": sid, "title": title, "segments": list(segs), "hold": hold})


def seg(text, say=None, id=None, gap=0.45):
    out = {"text": text, "gap": gap}
    if say:
        out["say"] = say
    if id:
        out["id"] = id
    return out


scene("intro", "Welcome",
      seg("Welcome to CardAuction!", say="Welcome to Card Auction!", id="welcome", gap=0.5),
      seg("It's a game for two players, all about numbers you build with cards.", id="idea"),
      seg("If you can count to 100, you can play. Let's learn every rule, then how to play in the app.", id="promise", gap=0.6),
      hold=0.3)

scene("goal", "The goal",
      seg("Players take turns making numbers, and each new number must be a little higher than the last: it's an auction.", id="turns"),
      seg("The first player who can't make a new bid loses.", id="loses", gap=0.6),
      hold=0.8)

scene("cards", "The cards",
      seg("CardAuction uses 120 cards.", say="Card Auction uses one hundred and twenty cards.", id="deck"),
      seg("Most are number cards, each showing one digit, from 0 to 9.", id="digits"),
      seg("Each number card has a suit with its own color: gold stars, blue diamonds, green clubs, red hearts and black spades.", id="suits"),
      seg("Here, color and suit mean the same thing. And every card comes in two copies.", id="copies"),
      seg("The other 20 cards are action cards, marked plus or minus 10.", id="actions", gap=0.5),
      seg("To make a number, put two number cards side by side: the left one gives the tens, the right one the units.", id="build"),
      seg("A 7 and a 3 make 73.", say="A seven and a three make seventy-three.", id="seventythree"),
      seg("A 0 and a 5 make 05: just five, written with two digits.", say="A zero and a five make zero five: just five, written with two digits.", id="zerofive", gap=0.6))

scene("setup", "Setting up",
      seg("To set up, shuffle the cards. The first two number cards turned over make the starting number: here, 47.", id="start"),
      seg("Each player gets 13 cards, and 25 go face up in the middle: that's the table.", id="deal"),
      seg("The other 67 stay face down, out of the game.", id="stock"),
      seg("Any card you take from the table stays visible to your opponent.", id="visible", gap=0.6))

scene("flow", "How a game goes",
      seg("Player 2 starts with one small choice: swap one card from their hand for one on the table, or keep their hand.", id="swap"),
      seg("Then Player 1 makes the first bid, using exactly one card from the table with cards from their hand.", id="first"),
      seg("After that, you take turns. On your turn, you make a bid, then take one card from the table.", id="loop", gap=0.6))

scene("count", "Rule one: count up",
      seg("Now, the heart of the game. A bid must follow just two rules.", id="heart", gap=0.5),
      seg("Rule one: count up. Your number must be 1 to 10 steps above the latest bid.", id="rule"),
      seg("Say the latest bid is 58.", id="latest"),
      seg("One step: 59.", id="c1", gap=0.25),
      seg("Two steps: 60.", id="c2", gap=0.25),
      seg("All the way to ten steps: 68.", id="c10"),
      seg("Any number from 59 to 68 is fine.", id="range"),
      seg("But 58 itself is not: you must go up at least one step. And 69 is too far: that's eleven steps.", id="nope", gap=0.6))

scene("rollover", "After 99 comes 00",
      seg("Numbers here have only two digits, so after 99 comes 00.", id="top"),
      seg("Picture the mileage counter in a car: after 99, it rolls over to 00, and keeps counting: 01, 02, and so on.", id="roll"),
      seg("CardAuction counts the same way. If the latest bid is 95, count up:", say="Card Auction counts the same way. If the latest bid is ninety-five, count up:", id="from95", gap=0.3),
      *[seg(n + ",", id="n" + n, gap=0.12) for n in ["96", "97", "98", "99", "00", "01", "02", "03", "04"]],
      seg("05.", id="n05", gap=0.45),
      seg("That's ten steps: from 95, you may bid anything from 96 all the way around to 05.", id="window"),
      seg("But 94 goes backward, and 06 is eleven steps away.", id="nope"),
      seg("You can also picture the numbers on a dial, like a clock with 100 marks. You always move forward, 1 to 10 marks, and after 99 the dial keeps going.", id="dial"),
      seg("So right after 99, the next bid can be anything from 00 to 09.", id="after99"),
      seg("A small number can top a big one, when you count up past 99 to reach it.", id="small", gap=0.6))

scene("color", "Rule two: a new color",
      seg("Rule two: your bid needs at least one color that the latest bid doesn't have.", id="rule"),
      seg("Say the latest bid is 5 of hearts, 8 of spades: 58, in red and black. You'd like to bid 63.", id="latest"),
      seg("6 of stars and 3 of spades? Yes! The gold star is new.", id="yes"),
      seg("6 of hearts and 3 of spades? No: red and black are both already in 58.", id="no"),
      seg("Your two cards may share a color: 6 of diamonds and 3 of diamonds works, because blue is new.", id="share"),
      seg("You may even use both copies of a card: two 6s of diamonds make 66.", say="You may even use both copies of a card: two sixes of diamonds make sixty-six.", id="pair", gap=0.6))

scene("action", "Action cards",
      seg("Now, the action cards. Just before you bid, an action card moves the latest bid up or down by 10.", id="intro"),
      seg("Place it beside the latest bid: on the left, it adds 10; on the right, it takes 10 away.", id="sides"),
      seg("Say the latest bid is 58, and your cards can make 72, but nothing from 59 to 68.", id="example"),
      seg("Put an action card on the left: 58 plus 10 is 68.", id="plus"),
      seg("Count up from 68: 69 to 78. 72 fits!", id="fits"),
      seg("On the right, 58 minus 10 is 48: you may bid from 49 up to 58. This time, 58 itself is allowed.", id="minus"),
      seg("Action cards roll over too: 95 plus 10 is 05, so you may bid from 06 to 15.", id="wrapplus"),
      seg("And 03 minus 10 rolls back to 93: you may bid from 94 around to 03.", id="wrapminus"),
      seg("The color rule still applies.", id="stillcolor", gap=0.6))

scene("take", "Taking a card",
      seg("After every bid, take one card from the table: a missing number, a new color, or an action card can save you later.", id="take"),
      seg("The cards you bid stay on the bid board. When the table is empty, you take nothing.", id="board", gap=0.6))

scene("first", "The first bid",
      seg("Remember Player 1's first bid, with exactly one table card?", id="remember"),
      seg("Say the starting number is 47. The table has a 5 of stars, and you hold a 2 of hearts.", id="setup"),
      seg("Together they make 52: five steps up, with a new color. Perfect.", id="bid"),
      seg("The table card can also be an action card, used with two cards from your hand.", id="action", gap=0.6))

scene("end", "How the game ends",
      seg("The game ends when a player can't make a legal bid on their turn: that player loses.", id="rule"),
      seg("Say the latest bid is 87. You need a number from 88 to 97, so your tens card must be an 8 or a 9.", say="Say the latest bid is eighty-seven. You need a number from eighty-eight to ninety-seven, so your tens card must be an eight or a nine.", id="example"),
      seg("With no 8, no 9, and no action card to help, you're stuck, and you lose.", say="With no eight, no nine, and no action card to help, you're stuck, and you lose.", id="stuck"),
      seg("And if Player 1 can't make the first bid, Player 2 wins.", id="open"),
      seg("In the app, each turn has a 60-second clock. If it runs out while you must bid, you lose. If it runs out during Player 2's swap, they just keep their hand.", say="In the app, each turn has a sixty second clock. If it runs out while you must bid, you lose. If it runs out during player two's swap, they just keep their hand.", id="clock", gap=0.7))

scene("app", "Playing in the app",
      seg("Let's play in the app. Open the CardAuction website: the address is on your screen.", say="Let's play in the app. Open the Card Auction website: the address is on your screen.", id="open"),
      seg("Type your name, then pick a way to play: Quick match, against the next person looking for a game;", id="quick", gap=0.2),
      seg("Play the AI, with a level and a seat;", say="Play the A I, with a level and a seat;", id="ai", gap=0.2),
      seg("or Private game, to invite a friend with a code or a link.", id="private", gap=0.5),
      seg("Here's the table: your hand at the bottom, the table cards in the middle, and the bid board with every bid so far.", id="table"),
      seg("At the top, your opponent's cards: face down, except the ones they took from the table.", id="opponent"),
      seg("On your turn, tap a card for the tens, then one for the units. The app shows your number and checks it.", id="compose"),
      seg("If a bid can't work, it tells you why.", id="why"),
      seg("For an action card, tap it, then the plus 10 or minus 10 slot beside the latest bid.", id="action"),
      seg("Then tap a table card to take, and press Confirm.", id="confirm"),
      seg("With Assist on, the cards that fit a legal move light up.", id="assist"),
      seg("As Player 2, your first move is the swap: tap a card in your hand and a table card, or keep your hand.", id="swap"),
      seg("Lost your connection? You have 25 seconds to come back.", id="grace"),
      seg("At the end, both hands are revealed, and you can ask for a rematch.", id="result"),
      seg("And the rules are always one tap away, in English or French.", id="rules", gap=0.7))

scene("outro", "That's it",
      seg("That's everything! Count up 1 to 10 steps, remember that after 99 comes 00, bring a new color, and use your action cards wisely.", id="recap"),
      seg("Have fun, and good luck!", id="luck", gap=1.2),
      hold=1.5)


# --- numbers to words, for the voice -----------------------------------------------------------
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        t, u = divmod(n, 10)
        return TENS[t] + ("" if u == 0 else "-" + ONES[u])
    h, rest = divmod(n, 100)
    return ONES[h] + " hundred" + ("" if rest == 0 else " and " + words(rest))


def speak(text: str) -> str:
    # "05" and "00": a bid with a leading zero is read digit by digit.
    text = re.sub(r"\b0(\d)\b", lambda m: "zero " + ONES[int(m.group(1))], text)
    text = re.sub(r"\b(\d{1,3})s\b", lambda m: words(int(m.group(1))) + "s", text)
    text = re.sub(r"\b\d{1,3}\b", lambda m: words(int(m.group(0))), text)
    text = text.replace("Player one", "player one").replace("Player two", "player two")
    return text


for sc in S:
    for s in sc["segments"]:
        s["speech"] = s.get("say") or speak(s["text"])

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "script.json")
with open(out, "w") as f:
    json.dump({"scenes": S}, f, indent=1, ensure_ascii=False)
total = sum(len(s["speech"].split()) for sc in S for s in sc["segments"])
print(f"{len(S)} scenes, {sum(len(sc['segments']) for sc in S)} segments, {total} spoken words")
