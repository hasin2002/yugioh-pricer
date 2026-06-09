type CaptureSignatureFrame = {
  cardLike: boolean;
  signature: string;
} | null;

export function signatureDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let index = 0; index < length; index += 1) {
    distance += Math.abs(parseInt(left[index]!, 16) - parseInt(right[index]!, 16));
  }

  return distance;
}

export function isCapturedSceneResetFrame(
  frame: CaptureSignatureFrame,
  capturedSignature: string | null,
  movementThreshold: number,
) {
  if (!frame || capturedSignature === null) {
    return false;
  }

  return signatureDistance(capturedSignature, frame.signature) >= movementThreshold;
}
