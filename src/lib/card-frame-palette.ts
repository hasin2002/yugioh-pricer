export type CardFrameKind =
  | "normal"
  | "effect"
  | "fusion"
  | "xyz"
  | "synchro"
  | "ritual"
  | "link"
  | "pendulum"
  | "spell"
  | "trap";

export type CardFramePalette = {
  frameKind: CardFrameKind;
  border: string;
  background: string;
  titleBorder: string;
  titleBackground: string;
  effectBackground: string;
  effectBorder: string;
  text: string;
  titleText: string;
};

function frameText(frameType: string | null, cardType: string | null) {
  return `${frameType ?? ""} ${cardType ?? ""}`.toLowerCase();
}

export function cardFrameKind(
  frameType: string | null,
  cardType: string | null,
): CardFrameKind {
  const frame = frameText(frameType, cardType);

  if (frame.includes("spell")) {
    return "spell";
  }

  if (frame.includes("trap")) {
    return "trap";
  }

  if (frame.includes("link")) {
    return "link";
  }

  if (frame.includes("pendulum")) {
    return "pendulum";
  }

  if (frame.includes("xyz")) {
    return "xyz";
  }

  if (frame.includes("synchro")) {
    return "synchro";
  }

  if (frame.includes("ritual")) {
    return "ritual";
  }

  if (frame.includes("fusion")) {
    return "fusion";
  }

  if (frame.includes("normal")) {
    return "normal";
  }

  return "effect";
}

const palettes: Record<CardFrameKind, CardFramePalette> = {
  normal: {
    frameKind: "normal",
    border: "#8a6932",
    background:
      "radial-gradient(circle at 23% 16%, rgba(255,245,197,0.88) 0, rgba(255,245,197,0) 24%), radial-gradient(circle at 74% 34%, rgba(154,111,44,0.28) 0, rgba(154,111,44,0) 30%), linear-gradient(135deg, #d3aa53 0%, #f0cf7b 34%, #b88639 68%, #e0ba61 100%)",
    titleBorder: "#94743b",
    titleBackground:
      "linear-gradient(90deg, rgba(255,243,185,0.82), rgba(170,124,52,0.2), rgba(255,237,164,0.56))",
    effectBackground: "#f6edd4",
    effectBorder: "#9b6b32",
    text: "#1d1208",
    titleText: "#120b05",
  },
  effect: {
    frameKind: "effect",
    border: "#7c4328",
    background:
      "radial-gradient(circle at 23% 16%, rgba(255,218,151,0.72) 0, rgba(255,218,151,0) 24%), radial-gradient(circle at 74% 34%, rgba(104,52,31,0.24) 0, rgba(104,52,31,0) 30%), linear-gradient(135deg, #b4663f 0%, #dd985d 34%, #9d5433 68%, #c97849 100%)",
    titleBorder: "#8a5737",
    titleBackground:
      "linear-gradient(90deg, rgba(255,220,155,0.62), rgba(118,62,39,0.2), rgba(255,232,182,0.44))",
    effectBackground: "#f5ead2",
    effectBorder: "#8d4b35",
    text: "#1e120c",
    titleText: "#120905",
  },
  fusion: {
    frameKind: "fusion",
    border: "#572f7c",
    background:
      "radial-gradient(circle at 22% 17%, rgba(237,179,255,0.78) 0, rgba(237,179,255,0) 25%), radial-gradient(circle at 73% 35%, rgba(70,35,124,0.36) 0, rgba(70,35,124,0) 30%), linear-gradient(135deg, #6b2f9a 0%, #a950c5 36%, #55217f 68%, #8c39b0 100%)",
    titleBorder: "#6c3a91",
    titleBackground:
      "linear-gradient(90deg, rgba(236,198,255,0.65), rgba(98,49,138,0.24), rgba(245,220,255,0.44))",
    effectBackground: "#eee2f4",
    effectBorder: "#8a4aa2",
    text: "#190d24",
    titleText: "#120819",
  },
  xyz: {
    frameKind: "xyz",
    border: "#15171b",
    background:
      "radial-gradient(circle at 24% 16%, rgba(204,205,191,0.3) 0, rgba(204,205,191,0) 23%), radial-gradient(circle at 78% 34%, rgba(112,116,122,0.24) 0, rgba(112,116,122,0) 30%), linear-gradient(135deg, #090a0c 0%, #3b3e42 36%, #030304 70%, #26282c 100%)",
    titleBorder: "#4a4d50",
    titleBackground:
      "linear-gradient(90deg, rgba(218,214,196,0.26), rgba(7,7,8,0.46), rgba(238,235,214,0.18))",
    effectBackground: "#e8dfcf",
    effectBorder: "#6d472a",
    text: "#f6f1df",
    titleText: "#fff7df",
  },
  synchro: {
    frameKind: "synchro",
    border: "#858b94",
    background:
      "radial-gradient(circle at 23% 16%, rgba(255,255,255,0.92) 0, rgba(255,255,255,0) 25%), radial-gradient(circle at 72% 34%, rgba(122,134,148,0.22) 0, rgba(122,134,148,0) 31%), linear-gradient(135deg, #c6ccd4 0%, #f5f5f1 35%, #aeb6c1 68%, #e6e7e5 100%)",
    titleBorder: "#a4abb4",
    titleBackground:
      "linear-gradient(90deg, rgba(255,255,255,0.78), rgba(154,164,176,0.22), rgba(255,255,255,0.5))",
    effectBackground: "#f5f1e2",
    effectBorder: "#9a5a42",
    text: "#121416",
    titleText: "#111315",
  },
  ritual: {
    frameKind: "ritual",
    border: "#315b91",
    background:
      "radial-gradient(circle at 24% 16%, rgba(205,230,255,0.76) 0, rgba(205,230,255,0) 24%), radial-gradient(circle at 75% 34%, rgba(37,74,136,0.3) 0, rgba(37,74,136,0) 31%), linear-gradient(135deg, #376aa5 0%, #7ba7d4 36%, #244d86 69%, #5d8cc2 100%)",
    titleBorder: "#315f9a",
    titleBackground:
      "linear-gradient(90deg, rgba(213,233,255,0.66), rgba(48,92,152,0.22), rgba(232,244,255,0.46))",
    effectBackground: "#e4ecf5",
    effectBorder: "#4f79aa",
    text: "#0b1c33",
    titleText: "#071728",
  },
  link: {
    frameKind: "link",
    border: "#0b4a7d",
    background:
      "radial-gradient(circle at 24% 16%, rgba(111,215,255,0.58) 0, rgba(111,215,255,0) 24%), radial-gradient(circle at 72% 34%, rgba(20,82,154,0.36) 0, rgba(20,82,154,0) 31%), linear-gradient(135deg, #0475a9 0%, #16a5de 34%, #064f87 68%, #0b86c2 100%)",
    titleBorder: "#11679d",
    titleBackground:
      "linear-gradient(90deg, rgba(169,232,255,0.55), rgba(14,96,150,0.26), rgba(205,244,255,0.4))",
    effectBackground: "#dcebf4",
    effectBorder: "#1d6f9d",
    text: "#07182a",
    titleText: "#f7fbff",
  },
  pendulum: {
    frameKind: "pendulum",
    border: "#78452d",
    background:
      "radial-gradient(circle at 24% 16%, rgba(255,222,154,0.7) 0, rgba(255,222,154,0) 24%), linear-gradient(180deg, #c66f43 0%, #e1a067 46%, #1f8e8a 72%, #3cb7a2 100%)",
    titleBorder: "#8a5737",
    titleBackground:
      "linear-gradient(90deg, rgba(255,220,155,0.62), rgba(118,62,39,0.2), rgba(255,232,182,0.44))",
    effectBackground: "#e7f2ed",
    effectBorder: "#3b8c82",
    text: "#1f120b",
    titleText: "#120905",
  },
  spell: {
    frameKind: "spell",
    border: "#106b66",
    background:
      "radial-gradient(circle at 24% 16%, rgba(174,246,227,0.72) 0, rgba(174,246,227,0) 24%), radial-gradient(circle at 72% 34%, rgba(7,104,104,0.33) 0, rgba(7,104,104,0) 30%), linear-gradient(135deg, #068177 0%, #31bfae 36%, #056b70 68%, #14a796 100%)",
    titleBorder: "#1a706d",
    titleBackground:
      "linear-gradient(90deg, rgba(180,247,235,0.42), rgba(0,100,98,0.3), rgba(213,255,248,0.26))",
    effectBackground: "#dcefed",
    effectBorder: "#2b827b",
    text: "#071b1b",
    titleText: "#f5fffb",
  },
  trap: {
    frameKind: "trap",
    border: "#8e2f76",
    background:
      "radial-gradient(circle at 24% 16%, rgba(255,185,230,0.74) 0, rgba(255,185,230,0) 24%), radial-gradient(circle at 72% 34%, rgba(146,28,106,0.34) 0, rgba(146,28,106,0) 30%), linear-gradient(135deg, #b7268e 0%, #e265b6 36%, #9a1d78 68%, #ce3ca0 100%)",
    titleBorder: "#933378",
    titleBackground:
      "linear-gradient(90deg, rgba(255,184,230,0.38), rgba(128,34,101,0.3), rgba(255,221,244,0.26))",
    effectBackground: "#f2dce9",
    effectBorder: "#a33483",
    text: "#24111f",
    titleText: "#fff5fb",
  },
};

export function cardFramePalette(
  frameType: string | null,
  cardType: string | null,
) {
  return palettes[cardFrameKind(frameType, cardType)];
}
