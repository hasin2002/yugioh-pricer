type CaptureSignatureFrame = {
  cardLike: boolean;
  signature: string;
} | null;

export type CapturedSceneResetKind = "card_removed" | "different_card";

export function signatureDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let index = 0; index < length; index += 1) {
    distance += Math.abs(parseInt(left[index]!, 16) - parseInt(right[index]!, 16));
  }

  return distance;
}

export function capturedSceneResetKind(
  frame: CaptureSignatureFrame,
  capturedSignature: string | null,
  movementThreshold: number,
): CapturedSceneResetKind | null {
  if (!frame || capturedSignature === null) {
    return null;
  }

  if (signatureDistance(capturedSignature, frame.signature) < movementThreshold) {
    return null;
  }

  return frame.cardLike ? "different_card" : "card_removed";
}

export function isCapturedSceneResetFrame(
  frame: CaptureSignatureFrame,
  capturedSignature: string | null,
  movementThreshold: number,
) {
  return capturedSceneResetKind(frame, capturedSignature, movementThreshold) !== null;
}
