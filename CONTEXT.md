# Yu-Gi-Oh Pricer

Local-first pricing and review language for physical Yu-Gi-Oh card sorting.

## Language

**Session Item**:
A card row inside a Pricing Session, whether it came from capture, manual creation, or later correction.
_Avoid_: Manual card, captured card when referring to the shared editable record

**Session Item Editor**:
The editor used to create new Session Items and correct existing Session Items.
_Avoid_: Manual Entry when referring to correction of existing items

**Session Item Navigator**:
An item-level list for moving between Session Items inside one Pricing Session.
_Avoid_: Collection grouping, duplicate grouping

**Manual Entry**:
The act of creating a new Session Item from the desktop Review Client without using the Capture Client.
_Avoid_: Manual correction, item editor

**Rarity Confirmation**:
The user's explicit acceptance that a Session Item's rarity is correct before it can become Successfully Scanned.
_Avoid_: Rarity checkbox, trusted rarity flag

**Serial Number**:
The numeric identifier printed near the lower-left of a Yu-Gi-Oh card and used to identify the card family in metadata lookups.
_Avoid_: Passcode, Card ID
