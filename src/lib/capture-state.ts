export type CaptureState =
  | "joining"
  | "checking"
  | "detecting"
  | "hold_steady"
  | "uploading"
  | "captured"
  | "already_captured"
  | "needs_review"
  | "claimed"
  | "archived"
  | "error";

type CaptureStateTone = {
  dotClassName: string;
  labelClassName: string;
  messageClassName: string;
  panelClassName: string;
};

export function captureStateLabel(state: CaptureState) {
  switch (state) {
    case "joining":
      return "Joining";
    case "checking":
      return "Checking";
    case "detecting":
      return "Detecting";
    case "hold_steady":
      return "Hold steady";
    case "uploading":
      return "Uploading";
    case "captured":
      return "Captured";
    case "already_captured":
      return "Already captured";
    case "needs_review":
      return "Needs review";
    case "claimed":
      return "Already active";
    case "archived":
      return "Archived session";
    case "error":
      return "Action needed";
  }
}

export function captureStateTone(state: CaptureState): CaptureStateTone {
  switch (state) {
    case "detecting":
      return {
        dotClassName: "bg-sky-500",
        labelClassName: "text-sky-900",
        messageClassName: "text-sky-800",
        panelClassName: "border-sky-200 bg-sky-50/80",
      };
    case "hold_steady":
      return {
        dotClassName: "bg-amber-500",
        labelClassName: "text-amber-900",
        messageClassName: "text-amber-800",
        panelClassName: "border-amber-200 bg-amber-50/80",
      };
    case "uploading":
      return {
        dotClassName: "bg-violet-500",
        labelClassName: "text-violet-900",
        messageClassName: "text-violet-800",
        panelClassName: "border-violet-200 bg-violet-50/80",
      };
    case "captured":
    case "already_captured":
      return {
        dotClassName: "bg-emerald-500",
        labelClassName: "text-emerald-900",
        messageClassName: "text-emerald-800",
        panelClassName: "border-emerald-200 bg-emerald-50/80",
      };
    case "needs_review":
    case "archived":
      return {
        dotClassName: "bg-orange-500",
        labelClassName: "text-orange-900",
        messageClassName: "text-orange-800",
        panelClassName: "border-orange-200 bg-orange-50/80",
      };
    case "error":
    case "claimed":
      return {
        dotClassName: "bg-rose-500",
        labelClassName: "text-rose-900",
        messageClassName: "text-rose-800",
        panelClassName: "border-rose-200 bg-rose-50/80",
      };
    case "joining":
    case "checking":
      return {
        dotClassName: "bg-slate-500",
        labelClassName: "text-slate-900",
        messageClassName: "text-slate-700",
        panelClassName: "border-slate-200 bg-slate-50/80",
      };
  }
}
