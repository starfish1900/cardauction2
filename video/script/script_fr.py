"""
La narration française du tutoriel CardAuction : les mêmes scènes et les mêmes segments que
script.py, dans le même ordre, avec les mêmes `id`, pauses et tenues.

`text` est ce qu'affichent les sous-titres (chiffres pour les nombres) ; `say` remplace ce que lit
la voix quand la conversion automatique ne suffit pas. `anchors` traduit les fragments anglais
que l'animation cherche dans un segment (useMarks().word) en fragments du texte français.

Espaces : insécable (U+00A0) avant « : », fine insécable (U+202F) avant « ! ? ; », comme en
typographie française. La voix les lit comme des espaces ordinaires.

Lancer `python3 script/script_fr.py` pour écrire script.fr.json.
"""
import json, os, re

S = []  # scènes
NB, FINE = " ", " "


def fr(text: str) -> str:
    """Les espaces insécables de la typographie française devant : ! ? ;"""
    text = re.sub(r" :", NB + ":", text)
    return re.sub(r" ([!?;])", FINE + r"\1", text)


def scene(sid, title, *segs, hold=0.0):
    S.append({"id": sid, "title": title, "segments": list(segs), "hold": hold})


def seg(text, say=None, id=None, gap=0.45, anchors=None, take=None):
    out = {"text": fr(text), "gap": gap}
    if say:
        out["say"] = say
    if take:
        # Another reading of the line, chosen by ear when the first one stumbled.
        out["take"] = take
    if id:
        out["id"] = id
    if anchors:
        out["anchors"] = {en: fr(f) for en, f in anchors.items()}
    return out


scene("intro", "Bienvenue",
      seg("Bienvenue dans CardAuction, les Enchères-aux-Cartes !", id="welcome", gap=0.5),
      seg("C'est un jeu pour deux joueurs, où l'on forme des nombres avec des cartes.", id="idea"),
      seg("Si vous savez compter jusqu'à 100, vous savez jouer. Voyons toutes les règles, puis comment jouer dans l'appli.", id="promise", gap=0.6),
      hold=0.3)

scene("goal", "Le but",
      seg("Chacun son tour, les joueurs forment des nombres, et chaque nouveau nombre doit être un peu plus haut que le précédent : ce sont des enchères.", id="turns"),
      seg("Le premier joueur qui ne peut plus enchérir a perdu.", id="loses", gap=0.6,
          anchors={"can't": "ne peut plus", "loses": "a perdu"}),
      hold=0.8)

scene("cards", "Les cartes",
      seg("CardAuction se joue avec 120 cartes.", id="deck"),
      seg("La plupart sont des cartes chiffres, avec un seul chiffre chacune, de 0 à 9.", id="digits"),
      seg("Chaque carte chiffre a une enseigne, avec sa propre couleur : étoiles dorées, carreaux bleus, trèfles verts, cœurs rouges et piques noirs.", id="suits",
          anchors={"gold stars": "étoiles dorées", "blue diamonds": "carreaux bleus", "green clubs": "trèfles verts",
                   "red hearts": "cœurs rouges", "black spades": "piques noirs"}),
      seg("Ici, couleur et enseigne, c'est pareil. Et chaque carte existe en deux exemplaires.", id="copies",
          anchors={"color and suit": "couleur et enseigne", "two copies": "deux exemplaires"}),
      seg("Les 20 autres cartes sont des cartes action, marquées plus ou moins 10.", id="actions", gap=0.5),
      seg("Pour former un nombre, posez deux cartes chiffres côte à côte : celle de gauche donne les dizaines, celle de droite les unités.", id="build",
          anchors={"the left one": "celle de gauche", "the right one": "celle de droite"}),
      seg("Un 7 et un 3 donnent 73.", id="seventythree", anchors={"make 73": "donnent 73"}),
      seg("Un 0 et un 5 donnent 05 : cinq, tout simplement, écrit avec deux chiffres.", id="zerofive", gap=0.6,
          anchors={"make 05": "donnent 05", "just five": "cinq, tout simplement"}))

scene("setup", "La mise en place",
      seg("Pour commencer, mélangez les cartes. Les deux premières cartes chiffres retournées forment le nombre de départ : ici, 47.", id="start",
          anchors={"The first two": "Les deux premières", "here, 47": "ici, 47"}),
      seg("Chaque joueur reçoit 13 cartes, et 25 sont posées face visible au milieu : c'est la table.", id="deal",
          anchors={"13 cards": "13 cartes", "and 25 go": "et 25 sont", "that's the table": "c'est la table"}),
      seg("Les 67 autres restent face cachée, hors du jeu.", id="stock"),
      seg("Toute carte prise sur la table reste visible pour votre adversaire.", id="visible", gap=0.6))

scene("flow", "Le déroulement",
      seg("Le joueur 2 commence par un petit choix : échanger une carte de sa main contre une carte de la table, ou garder sa main.", id="swap",
          anchors={"swap one card": "échanger une carte", "for one on the table": "contre une carte de la table",
                   "or keep their hand": "ou garder sa main"}),
      seg("Puis le joueur 1 fait la première enchère, avec exactement une carte de la table et des cartes de sa main.", id="first",
          anchors={"exactly one card": "exactement une carte", "with cards from their hand": "et des cartes de sa main"}),
      seg("Ensuite, chacun joue à son tour. À votre tour, vous faites une enchère, puis vous prenez une carte de la table.", id="loop", gap=0.6,
          anchors={"you make a bid": "vous faites une enchère", "then take one card": "puis vous prenez une carte"}))

scene("count", "Règle un : monter",
      seg("Et maintenant, le cœur du jeu. Une enchère n'obéit qu'à deux règles.", id="heart", gap=0.5,
          anchors={"A bid must": "Une enchère"}),
      seg("Règle un : monter. Votre nombre doit dépasser la dernière enchère de 1 à 10 crans.", say="Règle un : monter. Votre nombre doit dépasser la dernière enchère de un à dix crans.", id="rule",
          anchors={"Your number": "Votre nombre"}),
      seg("Disons que la dernière enchère est 58.", id="latest", anchors={"58": "58"}),
      seg("Un cran : 59.", id="c1", gap=0.25),
      seg("Deux crans : 60.", id="c2", gap=0.25),
      seg("Et jusqu'à dix crans : 68.", id="c10", anchors={"68": "68"}),
      seg("Tout nombre de 59 à 68 convient.", id="range"),
      seg("Mais pas 58 lui-même : il faut monter d'au moins un cran. Et 69, c'est trop loin : onze crans.", id="nope", gap=0.6,
          anchors={"58 itself": "58 lui-même", "And 69": "Et 69", "eleven steps": "onze crans"}))

scene("rollover", "Après 99 vient 00",
      seg("Ici, les nombres n'ont que deux chiffres : après 99 vient donc 00.", id="top", take=3,
          anchors={"only two digits": "que deux chiffres", "so after 99": "après 99", "comes 00": "vient donc 00"}),
      seg("Pensez au compteur kilométrique d'une voiture : après 99, il repasse à 00, et continue : 01, 02, et ainsi de suite.", id="roll",
          anchors={"in a car": "d'une voiture", "after 99": "après 99", "rolls over": "il repasse à 00",
                   "01": "01", "02": "02", "and so on": "et ainsi de suite"}),
      seg("CardAuction compte de la même façon. Si la dernière enchère est 95, montez :", id="from95", gap=0.3,
          anchors={"95": "95"}),
      # Said alone, "zéro zéro" came out with a third zéro; hyphenated, it does not.
      *[seg(n + ",", say="zéro-zéro," if n == "00" else None, id="n" + n, gap=0.12, take={"98": 1, "02": 2}.get(n))
        for n in ["96", "97", "98", "99", "00", "01", "02", "03", "04"]],
      seg("05.", id="n05", gap=0.45),
      seg("Soit dix crans : depuis 95, vous pouvez enchérir de 96 à 05, en faisant le tour.", id="window",
          anchors={"you may bid": "vous pouvez enchérir"}),
      seg("Mais 94, c'est reculer, et 06 est à onze crans.", id="nope",
          anchors={"94": "94", "06": "06", "eleven": "onze"}),
      seg("On peut aussi voir les nombres sur un cadran, comme une horloge à 100 graduations. On avance toujours, de 1 à 10 graduations, et après 99, le cadran continue.",
          say="On peut aussi voir les nombres sur un cadran, comme une horloge à cent graduations. On avance toujours, d'une à dix graduations, et après quatre-vingt-dix-neuf, le cadran continue.",
          id="dial",
          anchors={"100 marks": "100 graduations", "You always move forward": "On avance toujours", "and after 99": "et après 99"}),
      seg("Juste après 99, l'enchère suivante peut donc aller de 00 à 09.", id="after99"),
      seg("Un petit nombre peut battre un grand, quand on monte au-delà de 99 pour l'atteindre.", id="small", gap=0.6))

scene("color", "Règle deux : une nouvelle couleur",
      seg("Règle deux : votre enchère doit avoir au moins une couleur absente de la dernière enchère.", id="rule",
          anchors={"your bid needs": "votre enchère doit"}),
      seg("Disons que la dernière enchère est 5 de cœur, 8 de pique : 58, en rouge et noir. Vous aimeriez enchérir 63.", id="latest",
          anchors={"in red and black": "en rouge et noir", "You'd like": "Vous aimeriez"}),
      seg("6 d'étoiles et 3 de pique ? Oui ! L'étoile dorée est nouvelle.", id="yes",
          anchors={"Yes!": "Oui !", "The gold star": "L'étoile dorée"}),
      seg("6 de cœur et 3 de pique ? Non : le rouge et le noir sont déjà dans 58.", id="no",
          anchors={"No:": "Non :", "red and black": "le rouge et le noir"}),
      seg("Vos deux cartes peuvent être de la même couleur : 6 de carreau et 3 de carreau, ça marche, car le bleu est nouveau.", id="share",
          anchors={"6 of diamonds": "6 de carreau", "works": "ça marche", "because blue": "car le bleu"}),
      seg("Vous pouvez même utiliser les deux exemplaires d'une carte : deux 6 de carreau donnent 66.", id="pair", gap=0.6,
          anchors={"both copies": "les deux exemplaires", "two 6s": "deux 6", "make 66": "donnent 66"}))

scene("action", "Les cartes action",
      seg("Passons aux cartes action. Juste avant votre enchère, une carte action fait monter ou descendre la dernière enchère de 10.", id="intro",
          anchors={"Just before": "Juste avant", "moves the latest bid": "fait monter ou descendre"}),
      seg("Posez-la à côté de la dernière enchère : à gauche, elle ajoute 10 ; à droite, elle retire 10.", id="sides",
          anchors={"on the left": "à gauche", "on the right": "à droite"}),
      seg("Disons que la dernière enchère est 58, et que vos cartes peuvent faire 72, mais rien entre 59 et 68.", id="example",
          anchors={"your cards can make 72": "vos cartes peuvent faire 72", "but nothing": "mais rien"}),
      seg("Posez une carte action à gauche : 58 plus 10, ça fait 68.", id="plus", anchors={"58 plus 10": "58 plus 10"}),
      seg("Montez depuis 68 : de 69 à 78. 72 convient !", id="fits",
          anchors={"69 to 78": "de 69 à 78", "72 fits": "72 convient"}),
      seg("À droite, 58 moins 10 donne 48 : vous pouvez enchérir de 49 à 58. Cette fois, 58 lui-même est permis.", id="minus",
          anchors={"58 minus 10": "58 moins 10", "you may bid": "vous pouvez enchérir", "This time": "Cette fois"}),
      seg("Les cartes action font aussi le tour : 95 plus 10 donne 05, donc vous pouvez enchérir de 06 à 15.", id="wrapplus",
          anchors={"95 plus 10": "95 plus 10", "so you may bid": "donc vous pouvez enchérir"}),
      seg("Et 03 moins 10 revient à 93 : vous pouvez enchérir de 94 à 03, en faisant le tour.", id="wrapminus",
          anchors={"03 minus 10": "03 moins 10", "you may bid": "vous pouvez enchérir"}),
      seg("La règle de la couleur s'applique toujours.", id="stillcolor", gap=0.6))

scene("take", "Prendre une carte",
      seg("Après chaque enchère, prenez une carte de la table : un chiffre qui vous manque, une nouvelle couleur ou une carte action pourra vous sauver plus tard.", id="take",
          anchors={"a missing number": "un chiffre qui vous manque", "a new color": "une nouvelle couleur",
                   "or an action card": "ou une carte action"}),
      seg("Les cartes de votre enchère restent sur le tableau des enchères. Quand la table est vide, vous ne prenez rien.", id="board", gap=0.6,
          anchors={"When the table is empty": "Quand la table est vide", "you take nothing": "vous ne prenez rien"}))

scene("first", "La première enchère",
      seg("Vous vous souvenez de la première enchère du joueur 1, avec exactement une carte de la table ?", id="remember"),
      seg("Disons que le nombre de départ est 47. La table a un 5 d'étoiles, et vous avez un 2 de cœur.", id="setup",
          anchors={"the starting number": "le nombre de départ", "5 of stars": "5 d'étoiles", "2 of hearts": "2 de cœur"}),
      seg("Ensemble, ils font 52 : cinq crans plus haut, avec une nouvelle couleur. Parfait.", id="bid",
          anchors={"five steps up": "cinq crans plus haut", "with a new color": "avec une nouvelle couleur"}),
      seg("La carte de la table peut aussi être une carte action, jouée avec deux cartes de votre main.", id="action", gap=0.6,
          anchors={"an action card": "une carte action", "two cards from your hand": "deux cartes de votre main"}))

scene("end", "La fin de la partie",
      seg("La partie s'arrête quand un joueur ne peut pas faire d'enchère valable à son tour : ce joueur a perdu.", id="rule",
          anchors={"that player loses": "ce joueur a perdu"}),
      seg("Disons que la dernière enchère est 87. Il vous faut un nombre de 88 à 97 : votre carte des dizaines doit donc être un 8 ou un 9.", id="example",
          anchors={"88 to 97": "de 88 à 97", "your tens card": "votre carte des dizaines"}),
      seg("Pas de 8, pas de 9, pas de carte action pour vous aider : vous êtes bloqué, et vous avez perdu.", id="stuck",
          anchors={"no 8": "Pas de 8", "no 9": "pas de 9", "no action card": "pas de carte action", "you're stuck": "vous êtes bloqué"}),
      seg("Et si le joueur 1 ne peut pas faire la première enchère, c'est le joueur 2 qui gagne.", id="open",
          anchors={"Player 2 wins": "le joueur 2 qui gagne"}),
      seg("Dans l'appli, chaque tour dure au plus 120 secondes. Si le temps s'écoule alors que vous devez enchérir, vous perdez. S'il s'écoule pendant l'échange du joueur 2, il garde simplement sa main.", id="clock", gap=0.7,
          anchors={"If it runs out while": "Si le temps s'écoule", "during Player 2's swap": "pendant l'échange du joueur 2"}))

scene("app", "Jouer dans l'appli",
      seg("Jouons dans l'appli. Ouvrez le site de CardAuction : l'adresse est à l'écran.", id="open"),
      seg("Tapez votre nom, puis choisissez comment jouer : Partie rapide, contre la prochaine personne qui cherche une partie ;", id="quick", gap=0.2,
          anchors={"Type your name": "Tapez votre nom", "then pick": "puis choisissez", "Quick match": "Partie rapide"}),
      seg("Jouer contre l'IA, avec un niveau et une place ;", id="ai", gap=0.2),
      seg("ou Partie privée, pour inviter un ami avec un code ou un lien.", id="private", gap=0.5),
      seg("Voici l'écran de jeu : votre main en bas, les cartes de la table au milieu, et le tableau des enchères, avec toutes les enchères jusqu'ici.", id="table",
          anchors={"your hand": "votre main", "the table cards": "les cartes de la table", "and the bid board": "et le tableau des enchères"}),
      seg("En haut, les cartes de votre adversaire : face cachée, sauf celles qu'il a prises sur la table.", id="opponent",
          anchors={"At the top": "En haut"}),
      seg("À votre tour, touchez une carte pour les dizaines, puis une pour les unités. L'appli affiche votre nombre et le vérifie.", id="compose",
          anchors={"a card for the tens": "une carte pour les dizaines", "then one for the units": "puis une pour les unités",
                   "The app shows": "L'appli affiche"}),
      seg("Si une enchère ne marche pas, l'appli vous dit pourquoi.", id="why"),
      seg("Pour une carte action, touchez-la, puis la case plus 10 ou moins 10 à côté de la dernière enchère.", id="action",
          anchors={"tap it": "touchez-la", "the plus 10": "la case plus 10"}),
      seg("Touchez ensuite une carte de la table à prendre, et appuyez sur Valider.", id="confirm",
          anchors={"tap a table card": "Touchez ensuite une carte de la table", "press Confirm": "appuyez sur Valider"}),
      seg("Avec l'Aide activée, les cartes qui permettent un coup valable s'allument.", id="assist",
          anchors={"the cards that fit": "les cartes qui permettent"}),
      seg("En tant que joueur 2, votre premier coup est l'échange : touchez une carte de votre main et une carte de la table, ou gardez votre main.", id="swap",
          anchors={"tap a card in your hand": "touchez une carte de votre main", "and a table card": "et une carte de la table",
                   "or keep your hand": "ou gardez votre main"}),
      seg("Connexion perdue ? Vous avez 25 secondes pour revenir.", id="grace"),
      seg("À la fin, les deux mains sont dévoilées, et vous pouvez demander une revanche.", id="result",
          anchors={"ask for a rematch": "demander une revanche"}),
      seg("Et les règles sont toujours à portée de main, en français ou en anglais.", id="rules", gap=0.7,
          anchors={"in English": "en français"}))

scene("outro", "C'est tout",
      seg("C'est tout ! Montez de 1 à 10 crans, rappelez-vous qu'après 99 vient 00, apportez une nouvelle couleur, et utilisez bien vos cartes action.",
          say="C'est tout ! Montez de un à dix crans, rappelez-vous qu'après quatre-vingt-dix-neuf vient zéro zéro, apportez une nouvelle couleur, et utilisez bien vos cartes action.",
          id="recap",
          anchors={"Count up": "Montez", "remember that after 99": "rappelez-vous qu'après 99",
                   "bring a new color": "apportez une nouvelle couleur", "and use your action cards": "et utilisez bien vos cartes action"}),
      seg("Bon jeu, et bonne chance !", id="luck", gap=1.2),
      hold=1.5)


# --- les nombres en toutes lettres, pour la voix ---------------------------------------------------
UNITS = "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split()
TENS = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def words(n: int) -> str:
    if n <= 16:
        return UNITS[n]
    if n < 20:
        return "dix-" + UNITS[n - 10]
    if n < 70:
        t, u = divmod(n, 10)
        return TENS[t] + ("" if u == 0 else " et un" if u == 1 else "-" + UNITS[u])
    if n < 80:
        return "soixante et onze" if n == 71 else "soixante-" + words(n - 60)
    if n < 100:
        return "quatre-vingts" if n == 80 else "quatre-vingt-" + words(n - 80)
    h, rest = divmod(n, 100)
    return ("cent" if h == 1 else UNITS[h] + " cent") + ("" if rest == 0 else " " + words(rest))


def speak(text: str) -> str:
    text = text.replace(NB, " ").replace(FINE, " ")
    # « 05 » et « 00 » : une enchère avec un zéro devant se lit chiffre par chiffre.
    text = re.sub(r"\b0(\d)\b", lambda m: "zéro " + UNITS[int(m.group(1))], text)
    text = re.sub(r"\b\d{1,3}\b", lambda m: words(int(m.group(0))), text)
    return text


for sc in S:
    for s in sc["segments"]:
        s["speech"] = s.get("say") or speak(s["text"])
        # Chaque ancre doit se trouver dans le texte, dans l'ordre où l'animation la cherche.
        for en, f in s.get("anchors", {}).items():
            assert f in s["text"], f"{sc['id']}/{s.get('id')}: « {f} » absent de « {s['text']} »"

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "script.fr.json")
with open(out, "w") as f:
    json.dump({"lang": "fr", "scenes": S}, f, indent=1, ensure_ascii=False)
total = sum(len(s["speech"].split()) for sc in S for s in sc["segments"])
print(f"{len(S)} scènes, {sum(len(sc['segments']) for sc in S)} segments, {total} mots prononcés")
