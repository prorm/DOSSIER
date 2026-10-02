"use client";

import { AnswerForm } from "@/components/dossier/answer-form";
import { CrypticStage } from "./crypto";
import { CheckpointStage, GpsStage } from "./field";
import { CaptureStage, ForensicsStage, GitStage } from "./forensics";
import { BoardStage, FinalStage, InterviewStage, TimelineStage } from "./inquest";
import { SqlStage } from "./sql";
import { stageOf, type StageContext } from "./types";
import { WebStage } from "./web";

/** Each mechanic family speaks its own visual language; the engine underneath is the same. */
export function Stage({ ctx }: { ctx: StageContext }) {
  switch (stageOf(ctx.primitive)) {
    case "crypto":
      return <CrypticStage ctx={ctx} />;
    case "web":
      return <WebStage ctx={ctx} variant="web" />;
    case "osint":
      return <WebStage ctx={ctx} variant="osint" />;
    case "forensics":
      return <ForensicsStage ctx={ctx} />;
    case "git":
      return <GitStage ctx={ctx} />;
    case "pcap":
      return <CaptureStage ctx={ctx} />;
    case "sql":
      return <SqlStage ctx={ctx} />;
    case "interview":
      return <InterviewStage ctx={ctx} />;
    case "timeline":
      return <TimelineStage ctx={ctx} />;
    case "board":
      return <BoardStage ctx={ctx} />;
    case "checkpoint":
      return <CheckpointStage ctx={ctx} />;
    case "gps":
      return <GpsStage ctx={ctx} />;
    case "final":
      return <FinalStage ctx={ctx} />;
    default: {
      const t = (ctx.view.answerType as "text" | "flag" | "number" | undefined) ?? "text";
      return (
        <div className="max-w-3xl space-y-4">
          <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} answerType={t} />
        </div>
      );
    }
  }
}
